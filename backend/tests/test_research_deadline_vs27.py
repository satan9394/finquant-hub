"""VS27：深度研究"整轮"等待有上界，且截断"看得见"、与落库同源。

本文件覆盖（全部用**假时钟**，不做真实等待）：

① 上界可判定：整轮墙钟 ≤ `deadline_seconds + client.timeout`，且**无任何 LLM 调用在
   截止之后才发起**（这是"只在两次调用之间检查"这一前提的直接断言）；
② 部分结果保留 + 状态如实：被截断的 Agent 是 `degraded`（跑过调用）或 `failed`
   （一次都没发起），带**结构化**原因，绝不静默变 `completed`；
③ 同源：`done.truncated_by_deadline` / `done.report.truncated_by_deadline` /
   落库用的那份 `report_data` 是同一个值（用户所见 == 已保存内容）；
④ 零回归：`deadline_seconds=None` ⇒ 逐项与改动前一致（不传 `budget_seconds`、不做任何
   时间判断、报告仍 audited）；
⑤ 错误场景：截止在首轮之前已过 ⇒ 一次调用都不发；非法截止值 ⇒ `ValueError` 且零调用。
"""
import asyncio
import json
from types import SimpleNamespace

import httpx
import pytest

from app.agent.tools import BaseTool, ToolRegistry, ToolResult
from app.prompts.research_roles import REPORT_LEAD_ROLE, RESEARCH_ROLES
from app.services import model_router, research_orch
from app.services.llm_client import LLMClient

_FAKE_CLOCK_START = 1000.0


@pytest.fixture(autouse=True)
def empty_research_memory(monkeypatch):
    """研究记忆检索不打 DB/网络（与 test_research_orch.py 同一接缝）。"""

    async def empty_search(query, *, user_id, limit):
        return []

    monkeypatch.setattr(research_orch.native_memory_provider, "search", empty_search)


@pytest.fixture
def fake_clock(monkeypatch):
    """只替换 `research_orch` 模块内的 `time`（不动全局模块，pytest-asyncio 不受影响）。"""
    state = {"now": _FAKE_CLOCK_START}

    def fake_monotonic() -> float:
        return float(state["now"])

    monkeypatch.setattr(research_orch, "time", SimpleNamespace(monotonic=fake_monotonic))
    return state


class ProbeTool(BaseTool):
    """研究轨迹里的工具替身：总是成功，使"工具失败"不会混进降级原因。"""

    name = "deadline_probe"
    description = "Always succeeds"
    parameters = {"type": "object"}
    auto_register = False

    async def run(self, **kwargs) -> ToolResult:
        return ToolResult(True, data={"ok": True})


class RecordingClient:
    """记录每次调用的**发起时刻**与**单次预算覆盖值**的 LLM 客户端替身。

    - 每次调用消耗 `cost` 假秒；推进用 `max(now, start + cost)` 而非累加，使**并行**
      的兄弟调用可以"在同一假时刻发起"（真实并行语义），不会把假墙钟算重；
    - `mode="tools"`：每轮都请求工具（模拟"数据没抓全"的长循环）；
      `mode="final"`：首轮即给最终答案（模拟正常收尾）；
    - `timeout` / `total_budget_seconds` 与真实 `LLMClient` 同名字段，供上界公式断言。
    """

    def __init__(self, clock, *, cost=200.0, mode="tools", total_budget_seconds=180.0, timeout=120.0):
        self.clock = clock
        self.cost = cost
        self.mode = mode
        self.total_budget_seconds = total_budget_seconds
        self.timeout = timeout
        # (发起时刻, role_key, budget_seconds 覆盖值, 方法名)
        self.calls: list[tuple[float, str, float | None, str]] = []
        self.role_by_prompt = {role["system_prompt"]: role["role_key"] for role in RESEARCH_ROLES}
        self.role_by_prompt[REPORT_LEAD_ROLE["system_prompt"]] = "report_lead"

    async def _call(self, messages, kwargs, method):
        role_key = self.role_by_prompt.get(messages[0]["content"], "unknown")
        start = self.clock["now"]
        self.calls.append((start, role_key, kwargs.get("budget_seconds"), method))
        await asyncio.sleep(0)  # 让同一时刻发起的并行兄弟调用先记录，再推进假时钟
        self.clock["now"] = max(self.clock["now"], start + self.cost)
        if role_key == "report_lead":
            return json.dumps({"executive_summary": "主编摘要", "verdict": "中性"}), [], 3, "stop"
        if self.mode == "final":
            return f"{role_key} 的分析", [], 3, "stop"
        return f"{role_key} 的中间结论", [{
            "id": f"call-{len(self.calls)}",
            "type": "function",
            "function": {"name": "deadline_probe", "arguments": "{}"},
        }], 3, "tool_calls"

    async def chat_with_tools_safe(self, messages, tools, **kwargs):
        return await self._call(messages, kwargs, "chat_with_tools_safe")

    async def chat_with_tools(self, messages, tools, **kwargs):
        return await self._call(messages, kwargs, "chat_with_tools")


@pytest.fixture
def isolated_registry(monkeypatch):
    monkeypatch.setattr(ToolRegistry, "_instance", None)
    registry = ToolRegistry()
    registry.register(ProbeTool())
    return registry


@pytest.fixture
def client_and_router(monkeypatch):
    """把 `model_router.get_client` 换成"返回注入的客户端"。"""

    def install(client):
        async def fake_get_client(model_id=None, **_kwargs):
            return client, {"id": model_id}

        monkeypatch.setattr(model_router, "get_client", fake_get_client)
        return client

    return install


async def _run(clock, client_install, **kwargs):
    client = client_install(RecordingClient(clock, **kwargs.pop("client_kwargs", {})))
    events = [
        event
        async for event in research_orch.run_research("usAAPL", "Apple", user_id=1, **kwargs)
    ]
    return client, events


# ------------------------------------------------------------------
# ① 上界可判定（假时钟）
# ------------------------------------------------------------------


@pytest.mark.asyncio
async def test_vs27_run_wall_clock_bounded_and_no_call_starts_after_deadline(
    fake_clock, client_and_router, isolated_registry,
):
    """整轮墙钟 ≤ 截止 + 单次尝试超时；且**没有任何调用在截止之后才发起**。

    假时钟：每次调用耗 200s，整轮截止 500s（= `_FAKE_CLOCK_START + 500`）。
    期望：每个 Agent 只发起 3 次调用（1000/1200/1400 时刻，全部 < 1500），第 4 轮开始前
    检查到 1600 ≥ 1500 ⇒ 不再发起；主编在 1600 检查 ⇒ 一次都不发起。
    """
    deadline = 500.0
    client, events = await _run(
        fake_clock, client_and_router, deadline_seconds=deadline, client_kwargs={"cost": 200.0},
    )
    deadline_at = _FAKE_CLOCK_START + deadline
    elapsed = fake_clock["now"] - _FAKE_CLOCK_START
    done = events[-1][1]

    assert done["truncated_by_deadline"] is True
    assert client.calls, "本用例必须有实际调用，否则上界断言无意义"
    assert all(start < deadline_at for start, _role, _budget, _method in client.calls), (
        f"存在截止之后才发起的调用：{[c for c in client.calls if c[0] >= deadline_at]}"
    )
    assert elapsed <= deadline + client.timeout, (
        f"整轮假墙钟 {elapsed} 超过声明上界 截止{deadline}+单次尝试超时{client.timeout}"
    )
    # 上界公式里的"单次尝试超时"是唯一允许的溢出量：这里实测溢出 100s ≤ 一次调用耗时。
    assert 0 < elapsed - deadline <= client.cost
    # 单次预算被整轮剩余压低（1500-1400=100 < 客户端 180），否则最后一次调用能跑满 300s。
    budgets = [budget for _start, _role, budget, _method in client.calls]
    assert all(budget is not None for budget in budgets), "启用截止后每次调用都必须被注入单次预算"
    assert min(budgets) == 100.0, f"最后一次调用的预算未按整轮剩余压低：{sorted(set(budgets))}"
    assert max(budgets) == 180.0, "整轮剩余充足时不得篡改客户端单次预算"


@pytest.fixture
def business_role():
    """真实角色定义（替身按 system_prompt 反查 role_key，用真角色才拿得到正确 key）。"""
    return next(role for role in RESEARCH_ROLES if role["role_key"] == "business_analyst")


@pytest.mark.asyncio
async def test_vs27_agent_truncation_keeps_partial_output_and_structured_reason(
    isolated_registry, fake_clock, business_role,
):
    """② 单 Agent 中途被截断：返回**最后一段可用文本 + 已完成工具记录**，原因是结构化的。"""
    client = RecordingClient(fake_clock, cost=200.0, mode="tools")
    reasons: list[str] = []
    deadline_at = _FAKE_CLOCK_START + 500.0

    content, tool_log = await research_orch._call_agent(
        client,
        business_role,
        "usAAPL",
        "Apple",
        isolated_registry,
        degraded_reasons=reasons,
        deadline_at=deadline_at,
    )

    assert [start for start, *_rest in client.calls] == [1000.0, 1200.0, 1400.0]
    assert all(start < deadline_at for start, *_rest in client.calls)
    assert reasons == ["deadline_exceeded"], "截断原因必须是结构化的原因码，不是正文哨兵"
    assert content == "business_analyst 的中间结论", "已完成部分必须保留，不得抛掉"
    assert len(tool_log) == 3, "已完成的工具调用记录必须保留"


@pytest.mark.asyncio
async def test_vs27_agent_deadline_spent_before_first_call_issues_no_call(
    isolated_registry, fake_clock, business_role,
):
    """⑤ 截止在首轮之前就已过 ⇒ **一次 LLM 调用都不发**，如实标"未开始"。"""
    client = RecordingClient(fake_clock, cost=200.0, mode="tools")
    reasons: list[str] = []

    content, tool_log = await research_orch._call_agent(
        client,
        business_role,
        "usAAPL",
        "Apple",
        isolated_registry,
        degraded_reasons=reasons,
        deadline_at=fake_clock["now"] + 1e-9,  # 含浮点容差 ⇒ 视为已到
    )

    assert client.calls == [], "截止已到就不得发起任何调用"
    assert reasons == ["deadline_exceeded_before_start"]
    assert (content, tool_log) == ("", [])


# ------------------------------------------------------------------
# ② + ③ 整轮：部分结果、状态如实、信号同源
# ------------------------------------------------------------------


@pytest.mark.asyncio
async def test_vs27_run_research_truncation_keeps_partial_results_and_persists_signal(
    fake_clock, client_and_router, isolated_registry,
):
    """整轮截断：已完成成果保留、状态如实（非 completed）、信号与落库同源。"""
    client, events = await _run(
        fake_clock, client_and_router, deadline_seconds=500.0, client_kwargs={"cost": 200.0},
    )
    done = events[-1][1]
    agent_results = done["agent_results"]

    # ② 状态如实：没有任何 Agent 被静默标成 completed；每个非完成态都带结构化原因。
    assert set(agent_results) == {role["role_key"] for role in RESEARCH_ROLES} | {"report_lead"}
    degraded_keys = []
    for key, result in agent_results.items():
        assert result["status"] in {"degraded", "failed"}, f"{key} 被静默标成 {result['status']}"
        if result["status"] == "degraded":
            degraded_keys.append(key)
            assert "deadline_exceeded" in result["degraded_reasons"], key
            assert result["content"].strip(), f"{key} 的已完成内容被丢弃"
        else:
            assert "总时长上限" in result["error"], key
    assert degraded_keys, "至少要有一个 Agent 跑过调用（部分结果保留）"

    # 主编在所有 Agent 之后串行开始，此时截止早已越过 ⇒ 未开始即失败（而不是"降级但无原因"）。
    lead = agent_results["report_lead"]
    assert lead["status"] == "failed"
    assert "总时长上限" in lead["error"]
    assert [name for name, data in events if data.get("role_key") == "report_lead" and name in
            {"agent_completed", "agent_failed"}] == ["agent_failed"], "未开始不得再发完成信号"

    # ③ 同源：顶层 done 字段、report_data 内部字段、**落库用的那一份**三者一致。
    #    落库路径（routers/research.py:286 / services/scheduler.py:172）写入的正是
    #    `done["report"]` 这一份 dict，故断言"落库形态（JSON 往返）仍为 True"。
    assert done["truncated_by_deadline"] is True
    assert done["report"]["truncated_by_deadline"] is True
    persisted = json.loads(json.dumps(done["report"], ensure_ascii=False))
    assert persisted["truncated_by_deadline"] is True
    assert persisted["quality"] == done["quality"] == "degraded"

    # 截断 ⇒ 报告质量必须降级（不得出现"截断了却 audited"）。
    assert done["quality"] == "degraded"
    assert done["report"]["quality"] == "degraded"

    # 实时事件与落库同源：被截断 Agent 的 agent_completed 带同一个原因码。
    truncated_events = [
        data for name, data in events
        if name == "agent_completed" and data.get("degraded_reasons") == ["deadline_exceeded"]
    ]
    assert truncated_events, "实时通道必须同样带出截断原因（否则用户只能从落库才知道）"


@pytest.mark.asyncio
async def test_vs27_deadline_crossed_after_successful_call_is_not_a_truncation(
    fake_clock, isolated_registry, business_role,
):
    """边界（与 VS23 同口径）：截止**恰在一次成功调用之后**才越过 ⇒ 完成就是完成，不得误报截断。

    该边界只在"这一次调用就是收尾"时有意义——故在 `_call_agent` 层面断言；整轮层面下一处
    主编调用属于**新的一次调用**，截止已到就该跳过并如实报截断，不应混为一谈。
    """
    client = RecordingClient(fake_clock, cost=200.0, mode="final", timeout=120.0)
    reasons: list[str] = []

    content, tool_log = await research_orch._call_agent(
        client,
        business_role,
        "usAAPL",
        "Apple",
        isolated_registry,
        degraded_reasons=reasons,
        deadline_at=_FAKE_CLOCK_START + 200.0,  # 调用返回时恰好到点
    )

    assert fake_clock["now"] - _FAKE_CLOCK_START == 200.0
    assert content == "business_analyst 的分析"
    assert tool_log == []
    assert reasons == [], "完成后才越过截止 ⇒ 不得误报截断"


@pytest.mark.asyncio
async def test_vs27_default_deadline_bounds_the_run_without_being_passed(
    fake_clock, client_and_router, isolated_registry,
):
    """核心路径的**默认**（不传 deadline_seconds）同样截断——三条生产调用路径都不传。"""
    client, events = await _run(
        fake_clock, client_and_router, client_kwargs={"cost": 200.0},
    )
    default_deadline = research_orch.DEFAULT_RESEARCH_DEADLINE_SECONDS
    deadline_at = _FAKE_CLOCK_START + default_deadline
    elapsed = fake_clock["now"] - _FAKE_CLOCK_START
    done = events[-1][1]

    assert done["truncated_by_deadline"] is True, "默认截止必须真的生效，而不是只写在常量里"
    assert all(start < deadline_at for start, *_rest in client.calls)
    assert elapsed <= default_deadline + client.timeout
    assert done["quality"] == "degraded"


# ------------------------------------------------------------------
# ④ 零回归
# ------------------------------------------------------------------


@pytest.mark.asyncio
async def test_vs27_generous_deadline_still_produces_audited_report(fake_clock, client_and_router):
    """截止远未到达 ⇒ 与改动前逐项一致：全 completed、audited、无截断信号。"""
    client, events = await _run(
        fake_clock, client_and_router,
        deadline_seconds=10_000.0, client_kwargs={"cost": 10.0, "mode": "final"},
    )
    done = events[-1][1]

    assert [name for name, _data in events].count("agent_completed") == 5
    assert "error" not in [name for name, _data in events]
    assert done["quality"] == "audited"
    assert done["truncated_by_deadline"] is False
    assert done["report"]["truncated_by_deadline"] is False
    for key, result in done["agent_results"].items():
        assert result["status"] == "completed", key
        assert "degraded_reasons" not in result, key
        assert "error" not in result, key
    # 整轮剩余远大于客户端单次预算 ⇒ 单次预算仍等于客户端预算（未被改写语义）。
    assert {budget for _s, _r, budget, _m in client.calls} == {180.0}


@pytest.mark.asyncio
async def test_vs27_none_deadline_is_exactly_legacy_behaviour(fake_clock, client_and_router):
    """`deadline_seconds=None` ⇒ **不做任何时间判断**、不注入单次预算（逐项零回归）。

    假时钟每次调用推进 100000s：若默认路径里混进任何截止判断，本用例立刻变红。
    """
    client, events = await _run(
        fake_clock, client_and_router,
        deadline_seconds=None, client_kwargs={"cost": 100_000.0, "mode": "final"},
    )
    done = events[-1][1]

    assert {budget for _s, _r, budget, _m in client.calls} == {None}, (
        "未启用截止时不得改写单次预算（chat_with_tools_safe 的既有契约：None ⇒ 零回归）"
    )
    assert done["quality"] == "audited"
    assert done["truncated_by_deadline"] is False
    assert done["report"]["truncated_by_deadline"] is False
    assert [name for name, _data in events].count("agent_completed") == 5
    for key, result in done["agent_results"].items():
        assert result["status"] == "completed", key


@pytest.mark.asyncio
async def test_vs27_default_deadline_is_bounded_and_documented():
    """核心路径的**默认**（不传）必须自带运行级上界——这正是本卡要修的东西。"""
    import inspect

    signature = inspect.signature(research_orch.run_research)
    assert signature.parameters["deadline_seconds"].default == research_orch.DEFAULT_RESEARCH_DEADLINE_SECONDS
    assert research_orch.DEFAULT_RESEARCH_DEADLINE_SECONDS > 0
    # 三条生产调用路径（research/analysis/scheduler）都不传该参数 ⇒ 同源吃默认值。
    assert research_orch.DEFAULT_RESEARCH_DEADLINE_SECONDS < 6 * 300.0, (
        "默认上界必须显著小于改动前的最坏值（单 Agent 6 次调用 × 单次 300s，再加主编）"
    )
    doc = research_orch.run_research.__doc__ or ""
    assert "整轮墙钟 ≤ deadline_seconds + client.timeout" in doc, "上界公式必须写进 docstring"
    assert "只在两次调用之间检查" in doc, "前提（只在轮间检查）必须写进 docstring"


# ------------------------------------------------------------------
# ⑤ 错误场景
# ------------------------------------------------------------------


@pytest.mark.asyncio
@pytest.mark.parametrize("deadline", [0.0, -1.0, 0, -0.5, float("nan"), float("inf")])
async def test_vs27_invalid_deadline_is_rejected_before_any_call(fake_clock, client_and_router, deadline):
    """非法截止（0/负/NaN/Inf）⇒ `ValueError`，且**零副作用**（一次调用都不发）。"""
    client = client_and_router(RecordingClient(fake_clock, cost=10.0, mode="final"))

    with pytest.raises(ValueError, match="deadline_seconds"):
        async for _event in research_orch.run_research("usAAPL", "Apple", user_id=1, deadline_seconds=deadline):
            pass

    assert client.calls == [], "截止值非法必须在任何 LLM 调用之前拒绝"


# ------------------------------------------------------------------
# llm_client：chat_with_tools 的 budget_seconds 是 VS27 新增的可选透传
# ------------------------------------------------------------------


@pytest.mark.asyncio
async def test_vs27_chat_with_tools_budget_override_defaults_to_none(monkeypatch):
    """`chat_with_tools` 新增 `budget_seconds`（keyword-only，默认 None）⇒ 既有调用零回归。

    研究编排的**强制收尾调用**走的就是本方法；若它不接受该参数，整轮上界
    （截止 + 单次尝试超时）不成立。默认 None ⇒ 透传 None ⇒ 用客户端预算（逐项不变）。
    """
    client = LLMClient("https://llm.test", "key", "model")
    seen: list[float | None] = []

    async def fake_post(payload, budget_seconds=None):
        seen.append(budget_seconds)
        return httpx.Response(200, json={"choices": [{"message": {"content": "ok"}}]})

    monkeypatch.setattr(client, "_post_chat_with_retry", fake_post)

    assert (await client.chat_with_tools([], []))[0] == "ok"
    assert (await client.chat_with_tools([], [], budget_seconds=12.5))[0] == "ok"
    assert seen == [None, 12.5], "默认必须仍是不改写单次预算（None）"
