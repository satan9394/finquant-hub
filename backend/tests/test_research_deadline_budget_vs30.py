"""VS30：被"整轮截止压低后的单次预算"打死 ⇒ 同样要让用户看见"这次是被总时长上限砍断的"。

背景（VS27 评估者 F1，已独立复现）：`research_orch.run_research` 的 `except LLMError` 分支
此前不置 `truncated`，于是当某个环节是被"**截止压低后的单次预算**"打死（`llm_client`
抛预算耗尽类 `LLMError`）时，`report_data.truncated_by_deadline` 停在 `False`、前端横幅不出现。
该路径真实存在：VS27 令单次预算 = `min(客户端预算, 截止剩余)`（`_remaining_call_budget`），
故"截止剩余 < 客户端预算"时，**预算耗尽路径会先于** `_deadline_reached` 的轮间检查触发。

本文件覆盖：
  ① 该路径真置信号且**结构化**：信号来自 `LLMError.budget_exhausted` +
     `effective_budget_seconds < client.total_budget_seconds`（不是文案匹配）；
  ② 不误报：普通 `LLMError`（上游 4xx / 网络重试耗尽 / 无结构化字段）⇒ 不标截断；
     预算耗尽但**与截止无关**（未启用截止 / 截止剩余充足 ⇒ 生效预算 == 客户端预算）⇒ 不标截断；
  ③ 未截断的运行 ⇒ 前端仍不出现提示；
  ④ 信号有真实消费方：断言 `frontend/src/pages/Research.tsx:145` 的
     `resolveTruncatedByDeadline` **逐字镜像**在实时 `done` 形状与回放 `report_data` 形状上都为真
     （该函数为真 ⇒ `:763` 的 `research-truncated-by-deadline` 提示条渲染）；
  ⑤ 判据与文案无关：把文案换成完全不含"预算/截止"字样而结构化字段为真 ⇒ 仍判截断；
     文案里塞满"总时长上限/预算已用尽"而结构化字段为假 ⇒ 不得判截断。

全部假时钟、零真实等待。
"""
import json
from types import SimpleNamespace

import httpx
import pytest

from app.agent.tools import ToolRegistry
from app.prompts.research_roles import REPORT_LEAD_ROLE, RESEARCH_ROLES
from app.services import llm_client, model_router, research_orch
from app.services.llm_client import LLMClient, LLMError

# 假时钟起点：与截止点 1500.0 只差 1 秒 ⇒ 每次调用的单次预算被压到 1s
# （远小于客户端预算 180s），正是"截止剩余 < 客户端预算"那条路径。
_FAKE_NOW = 1499.0
_DEADLINE_AT = 1500.0
_DEADLINE_SECONDS = _DEADLINE_AT - _FAKE_NOW
_CLIENT_BUDGET = 180.0

_ROLE_BY_PROMPT = {role["system_prompt"]: role["role_key"] for role in RESEARCH_ROLES}
_ROLE_BY_PROMPT[REPORT_LEAD_ROLE["system_prompt"]] = "report_lead"


def frontend_shows_truncation_banner(data) -> bool:
    """`frontend/src/pages/Research.tsx:145-149` 的 `resolveTruncatedByDeadline` **逐字镜像**。

    ```ts
    return (data?.truncated_by_deadline ?? data?.report?.truncated_by_deadline) === true;
    ```
    前端在**实时 `done`**（:616）与**回放 `report_data`**（:470）两条路径上调用它，`:763`
    只在它为 `true` 时渲染 `data-testid="research-truncated-by-deadline"` 的提示条
    （文案 `deep.report.truncatedByDeadline`）。镜像同一判据，避免"只断言字段存在"。
    """
    if not isinstance(data, dict):
        return False
    value = data.get("truncated_by_deadline")
    if value is None:
        report = data.get("report")
        value = report.get("truncated_by_deadline") if isinstance(report, dict) else None
    return value is True


@pytest.fixture(autouse=True)
def empty_research_memory(monkeypatch):
    """研究记忆检索不打 DB/网络（与 test_research_deadline_vs27.py 同一接缝）。"""

    async def empty_search(query, *, user_id, limit):
        return []

    monkeypatch.setattr(research_orch.native_memory_provider, "search", empty_search)


@pytest.fixture(autouse=True)
def no_retry_backoff(monkeypatch):
    """退避基数置 0，避免任何真实等待（与 test_llm_client.py 同款）。"""
    monkeypatch.setattr(llm_client, "_BACKOFF_BASE_SECONDS", 0.0)


@pytest.fixture
def fake_clock(monkeypatch):
    """`research_orch` 与 `llm_client` **共用**同一个假时钟（生产里两者都是 `time.monotonic`）。

    共用是承重的：它让"某次调用耗掉了多少预算"与"整轮剩余多少"在物理上一致。
    """
    state = {"now": _FAKE_NOW}

    def fake_monotonic() -> float:
        return float(state["now"])

    monkeypatch.setattr(research_orch, "time", SimpleNamespace(monotonic=fake_monotonic))
    monkeypatch.setattr(llm_client, "time", SimpleNamespace(monotonic=fake_monotonic))
    return state


@pytest.fixture
def isolated_registry(monkeypatch):
    monkeypatch.setattr(ToolRegistry, "_instance", None)
    return ToolRegistry()


@pytest.fixture
def install_client(monkeypatch):
    """把 `model_router.get_client` 换成"返回注入的客户端"。"""

    def install(client):
        async def fake_get_client(model_id=None, **_kwargs):
            return client, {"id": model_id}

        monkeypatch.setattr(model_router, "get_client", fake_get_client)
        return client

    return install


_ORIGINAL_ASYNC_CLIENT = httpx.AsyncClient


def _install_transport(monkeypatch, handler):
    """把真实 `LLMClient` 的 HTTP 层换成 MockTransport（与 test_llm_client.py 同款接缝）。

    注意：`llm_client.httpx` **就是** httpx 模块本身，所以这里必须调用模块级捕获的**真实**
    `AsyncClient`——否则同一用例里第二次安装会捕获到上一次的 lambda，两次 handler 会串味
    （实测：第二次的 handler 被第一次吞掉，错误类型随之改变）。
    """
    transport = httpx.MockTransport(handler)
    monkeypatch.setattr(
        llm_client.httpx,
        "AsyncClient",
        lambda *args, **kwargs: _ORIGINAL_ASYNC_CLIENT(transport=transport),
    )


def _ok_response(content: str) -> httpx.Response:
    return httpx.Response(
        200,
        json={"choices": [{"message": {"content": content}}], "usage": {"total_tokens": 3}},
    )


class BudgetStarvedClient:
    """客户端替身：只对 `victim` 这个环节抛"预算耗尽"类 `LLMError`，其余环节正常完成。

    默认用**生产代码的工厂** `LLMClient._budget_exhausted_error` 产出错误 ⇒
    `budget_exhausted` / `effective_budget_seconds` 的取值与线上同源，不是测试自造的约定；
    `error_factory` 可换，用于构造"文案与结构化字段相矛盾"的对照。
    """

    def __init__(self, *, victim: str, error_factory=None,
                 total_budget_seconds: float = _CLIENT_BUDGET, timeout: float = 120.0):
        self.victim = victim
        self.total_budget_seconds = total_budget_seconds
        self.timeout = timeout
        self.budgets: list[float | None] = []
        self._factory = LLMClient(
            "https://llm.test", "key", "model",
            total_budget_seconds=total_budget_seconds, timeout=timeout,
        )
        self._error_factory = error_factory or self._production_error

    def _production_error(self, budget: float | None) -> LLMError:
        return self._factory._budget_exhausted_error(1, None, budget)

    async def _call(self, messages, kwargs, _method):
        role_key = _ROLE_BY_PROMPT.get(messages[0]["content"], "unknown")
        budget = kwargs.get("budget_seconds")
        self.budgets.append(budget)
        if role_key == self.victim:
            raise self._error_factory(budget)
        if role_key == "report_lead":
            return json.dumps({"executive_summary": "主编摘要", "verdict": "中性"}), [], 3, "stop"
        return f"{role_key} 的分析", [], 3, "stop"

    async def chat_with_tools_safe(self, messages, tools, **kwargs):
        return await self._call(messages, kwargs, "chat_with_tools_safe")

    async def chat_with_tools(self, messages, tools, **kwargs):
        return await self._call(messages, kwargs, "chat_with_tools")


async def _events(**kwargs):
    """跑一整轮研究（客户端已由 `install_client` 注入），返回 (事件名, 数据) 列表。"""
    return [event async for event in research_orch.run_research("usAAPL", "Apple", user_id=1, **kwargs)]


def _plain_statuses(done, exclude: str) -> list[str]:
    return [result["status"] for key, result in done["agent_results"].items() if key != exclude]


# ------------------------------------------------------------------
# ① 该路径真置信号 + 用户看得见（Agent 环节）
# ------------------------------------------------------------------


@pytest.mark.asyncio
async def test_vs30_agent_killed_by_squeezed_budget_sets_visible_signal(
    fake_clock, install_client, isolated_registry,
):
    """截止剩余 1s < 客户端预算 180s ⇒ 单次预算被压到 1s；该环节恰好耗尽它 ⇒ 必须有截断信号。

    本用例刻意让**其余 4 个环节全部正常完成**（含主编）⇒ 旧的"轮间检查"路径一次都没触发，
    信号只可能来自 VS30 新增的判据（改前为红，见结果文件 §6 的基线/变异证据）。
    """
    client = install_client(BudgetStarvedClient(victim="business_analyst"))
    events = await _events(deadline_seconds=_DEADLINE_SECONDS)
    done = events[-1][1]

    # 前置条件：每次调用都拿到被压低的 1s 预算（不是客户端自己的 180s）
    assert client.budgets and set(client.budgets) == {_DEADLINE_SECONDS}, client.budgets

    # 被压死的环节：状态如实（VS20 契约不变）——failed + 可读原因，绝不静默 completed
    victim = done["agent_results"]["business_analyst"]
    assert victim["status"] == "failed"
    assert "总时长预算已用尽" in victim["error"]

    # 其余环节全部 completed ⇒ 旧路径未触发，信号只能来自 VS30 的新判据
    assert done["agent_results"]["report_lead"]["status"] == "completed"
    assert _plain_statuses(done, "business_analyst") == ["completed"] * 4
    assert "deadline_exceeded" not in json.dumps(done["agent_results"], ensure_ascii=False)

    # 信号：顶层 + report_data（落库那份，JSON 往返后仍为真）
    assert done["truncated_by_deadline"] is True
    assert done["report"]["truncated_by_deadline"] is True
    assert json.loads(json.dumps(done["report"], ensure_ascii=False))["truncated_by_deadline"] is True
    assert done["quality"] == "degraded"

    # 用户可见：前端读取函数在**实时形状**与**回放形状**上都为真 ⇒ 横幅出现
    assert frontend_shows_truncation_banner(done) is True
    assert frontend_shows_truncation_banner({"report": done["report"]}) is True


# ------------------------------------------------------------------
# ① 该路径真置信号 + 用户看得见（主编环节，生产时钟下必然可达的那一支）
# ------------------------------------------------------------------


@pytest.mark.asyncio
async def test_vs30_lead_killed_by_squeezed_budget_sets_visible_signal(
    fake_clock, install_client, isolated_registry, monkeypatch,
):
    """主编被"截止压低后的预算"打死：真实 `LLMClient`、**共用同一个假时钟**。

    物理上必然如此：把被压低的预算耗光，那一刻整轮已经越过截止（两者是同一个时钟）。
    而主编是**最后一个**环节，之后没有任何截止检查 ⇒ 此前整轮信号停在 `False`
    （本用例改前为红）。这一支不需要任何"解耦时钟"的假设，是生产可达的漏报。
    """
    clock = fake_clock

    def handler(request):
        body = json.loads(request.content)
        role_key = _ROLE_BY_PROMPT.get(body["messages"][0]["content"], "unknown")
        if role_key == "report_lead":
            clock["now"] += 5.0  # 这一次尝试比被压低的预算（1s）更久
            return httpx.Response(503, text="upstream busy")
        return _ok_response(f"{role_key} 的分析")

    _install_transport(monkeypatch, handler)
    monkeypatch.setattr(llm_client, "record_llm_usage", lambda model, usage: None)
    install_client(LLMClient(
        "https://llm.test", "key", "model",
        total_budget_seconds=_CLIENT_BUDGET, timeout=120.0,
    ))
    events = await _events(deadline_seconds=_DEADLINE_SECONDS)
    done = events[-1][1]

    # 前置条件：4 个 Agent 都在 1499 发起并成功（未被轮间检查截断），主编拿到被压低的 1s 预算
    assert _plain_statuses(done, "report_lead") == ["completed"] * 4
    assert clock["now"] == _DEADLINE_AT + 4.0, "该次尝试耗掉 5s > 被压低的预算 1s"

    lead = done["agent_results"]["report_lead"]
    assert lead["status"] == "failed"
    assert "总时长预算已用尽" in lead["error"], lead["error"]

    assert done["truncated_by_deadline"] is True
    assert done["report"]["truncated_by_deadline"] is True
    assert done["quality"] == "degraded"
    assert frontend_shows_truncation_banner(done) is True
    assert frontend_shows_truncation_banner({"report": done["report"]}) is True


# ------------------------------------------------------------------
# 结构化字段由**生产代码**产出（llm_client）
# ------------------------------------------------------------------


@pytest.mark.asyncio
async def test_vs30_llm_client_budget_exhaustion_carries_structured_fields(
    fake_clock, monkeypatch,
):
    """`llm_client` 的预算耗尽错误必须带结构化字段；普通失败必须不带（判据的唯一来源）。"""
    def handler_squeezed(request):
        fake_clock["now"] += 5.0  # 5s > 被压低的 1s 预算
        return httpx.Response(503, text="unavailable")

    def handler_own_budget(request):
        fake_clock["now"] += 300.0  # 300s > 客户端自身预算 180s
        return httpx.Response(503, text="unavailable")

    client = LLMClient(
        "https://llm.test", "key", "model",
        total_budget_seconds=_CLIENT_BUDGET, timeout=120.0,
    )

    # (a) 生效预算被整轮截止压低到 1s ⇒ 结构化：预算耗尽 + 生效预算 1s
    _install_transport(monkeypatch, handler_squeezed)
    with pytest.raises(LLMError) as squeezed_info:
        await client.chat_with_tools_safe(
            [{"role": "user", "content": "hi"}], [], budget_seconds=_DEADLINE_SECONDS,
        )
    squeezed = squeezed_info.value
    assert squeezed.budget_exhausted is True
    assert squeezed.effective_budget_seconds == _DEADLINE_SECONDS
    assert research_orch._is_deadline_budget_exhaustion(squeezed, client, _DEADLINE_AT) is True
    # 未启用截止 ⇒ 不可能"被截止砍断"
    assert research_orch._is_deadline_budget_exhaustion(squeezed, client, None) is False

    # (b) 客户端**自身**预算耗尽（未传覆盖值）⇒ 生效预算 == 客户端预算 ⇒ 不是截止截断
    fake_clock["now"] = _FAKE_NOW
    _install_transport(monkeypatch, handler_own_budget)
    with pytest.raises(LLMError) as own_info:
        await client.chat_with_tools_safe([{"role": "user", "content": "hi"}], [])
    own = own_info.value
    assert own.budget_exhausted is True
    assert own.effective_budget_seconds == _CLIENT_BUDGET
    assert research_orch._is_deadline_budget_exhaustion(own, client, _DEADLINE_AT) is False

    # (c) 普通失败（上游 401，不可重试）⇒ 两条结构化字段都是"普通失败"的缺省值
    _install_transport(monkeypatch, lambda request: httpx.Response(401, text="no key"))
    with pytest.raises(LLMError) as plain_info:
        await client.chat_with_tools_safe([{"role": "user", "content": "hi"}], [])
    plain = plain_info.value
    assert plain.budget_exhausted is False
    assert plain.effective_budget_seconds is None
    assert research_orch._is_deadline_budget_exhaustion(plain, client, _DEADLINE_AT) is False


# ------------------------------------------------------------------
# ② / ③ 不误报：预算耗尽但**不是**被截止砍断的
# ------------------------------------------------------------------


@pytest.mark.asyncio
async def test_vs30_client_own_budget_exhaustion_is_not_a_deadline_truncation(
    fake_clock, install_client, isolated_registry, monkeypatch,
):
    """反例（**不得误报**）：截止启用着，但它**不是**约束。

    截止 10000s 远大于客户端预算 180s ⇒ 每次调用拿到的生效预算 == 客户端预算 180s，
    所有环节都是被**客户端自己的**预算打死的（同样的"预算已用尽"文案）。这不是截止截断。
    """
    def handler(request):
        fake_clock["now"] += 300.0  # 一次尝试就超过客户端 180s 预算
        return httpx.Response(503, text="unavailable")

    _install_transport(monkeypatch, handler)
    monkeypatch.setattr(llm_client, "record_llm_usage", lambda model, usage: None)
    install_client(LLMClient(
        "https://llm.test", "key", "model",
        total_budget_seconds=_CLIENT_BUDGET, timeout=120.0,
    ))
    events = await _events(deadline_seconds=10_000.0)
    done = events[-1][1]

    assert done["truncated_by_deadline"] is False, "客户端自身预算耗尽不得被误报成截止截断"
    assert done["report"]["truncated_by_deadline"] is False
    # 确实发生了"预算已用尽"的失败（否则本用例是空转）
    errors = [result.get("error", "") for result in done["agent_results"].values()]
    assert errors and all("总时长预算已用尽" in error for error in errors), errors
    # 截止远未到达（全程假墙钟 ≈ 1499 + 5×300）
    assert fake_clock["now"] - _FAKE_NOW < 10_000.0
    assert frontend_shows_truncation_banner(done) is False
    assert frontend_shows_truncation_banner({"report": done["report"]}) is False


@pytest.mark.asyncio
async def test_vs30_no_deadline_budget_exhaustion_is_not_a_deadline_truncation(
    fake_clock, install_client, isolated_registry, monkeypatch,
):
    """反例：`deadline_seconds=None`（不做任何时间判断）⇒ 预算耗尽与截止无关，不得标截断。"""
    def handler(request):
        fake_clock["now"] += 300.0
        return httpx.Response(503, text="unavailable")

    _install_transport(monkeypatch, handler)
    monkeypatch.setattr(llm_client, "record_llm_usage", lambda model, usage: None)
    install_client(LLMClient(
        "https://llm.test", "key", "model",
        total_budget_seconds=_CLIENT_BUDGET, timeout=120.0,
    ))
    events = await _events(deadline_seconds=None)
    done = events[-1][1]

    assert done["truncated_by_deadline"] is False
    assert done["report"]["truncated_by_deadline"] is False
    assert frontend_shows_truncation_banner(done) is False
    errors = [result.get("error", "") for result in done["agent_results"].values()]
    assert errors and all("总时长预算已用尽" in error for error in errors), errors


@pytest.mark.asyncio
async def test_vs30_generous_deadline_run_shows_no_banner(fake_clock, install_client, isolated_registry):
    """③ 未截断的运行 ⇒ 前端仍**不出现**提示（不得因本改动把正常运行算成截断）。"""
    install_client(BudgetStarvedClient(victim="__nobody__"))
    events = await _events(deadline_seconds=10_000.0)
    done = events[-1][1]

    assert [name for name, _data in events].count("agent_completed") == 5
    assert done["quality"] == "audited"
    assert done["truncated_by_deadline"] is False
    assert done["report"]["truncated_by_deadline"] is False
    assert frontend_shows_truncation_banner(done) is False
    assert frontend_shows_truncation_banner({"report": done["report"]}) is False


# ------------------------------------------------------------------
# ⑤ 判据是**结构化**的，与错误文案无关
# ------------------------------------------------------------------


@pytest.mark.asyncio
async def test_vs30_criterion_ignores_error_message_wording(
    fake_clock, install_client, isolated_registry,
):
    """文案与结构化字段**相矛盾**的两个对照 —— 判据必须跟着结构化字段走。

    (a) 文案里塞满"总时长上限/预算已用尽/被截止砍断"，但结构化字段说"不是预算耗尽"
        （普通 `LLMError`）⇒ **不得**标截断；
    (b) 文案里**完全没有**"预算/截止"字样，但结构化字段说"预算耗尽且生效预算 < 客户端预算"
        ⇒ **必须**标截断。
    """
    # (a) 文案像截断，结构上不是
    loud = install_client(BudgetStarvedClient(
        victim="business_analyst",
        error_factory=lambda _budget: LLMError(
            "因超过研究总时长上限，预算已用尽，本轮被截止砍断（这是文案，不是判据）"
        ),
    ))
    events_a = await _events(deadline_seconds=_DEADLINE_SECONDS)
    done_a = events_a[-1][1]
    assert done_a["agent_results"]["business_analyst"]["status"] == "failed"
    assert set(loud.budgets) == {_DEADLINE_SECONDS}
    assert done_a["truncated_by_deadline"] is False, "文案不得成为判据"
    assert frontend_shows_truncation_banner(done_a) is False

    # (b) 文案与截断无关，结构上就是被截止压低后的预算耗尽
    quiet = install_client(BudgetStarvedClient(
        victim="financial_analyst",
        error_factory=lambda budget: LLMError(
            "上游连接被重置",
            budget_exhausted=True,
            effective_budget_seconds=budget,
        ),
    ))
    events_b = await _events(deadline_seconds=_DEADLINE_SECONDS)
    done_b = events_b[-1][1]
    assert done_b["agent_results"]["financial_analyst"]["error"] == "上游连接被重置"
    assert set(quiet.budgets) == {_DEADLINE_SECONDS}
    assert done_b["truncated_by_deadline"] is True, "判据必须读结构化字段"
    assert frontend_shows_truncation_banner(done_b) is True
