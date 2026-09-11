import asyncio
import json
import threading

import pytest

from app.agent.tools import BaseTool, ToolRegistry, ToolResult
from app.prompts.research_roles import REPORT_LEAD_ROLE, RESEARCH_ROLES
from app.services import model_router, research_orch


@pytest.fixture(autouse=True)
def empty_research_memory(monkeypatch):
    async def empty_search(query, *, user_id, limit):
        return []

    monkeypatch.setattr(research_orch.native_memory_provider, "search", empty_search)


class BarrierTool(BaseTool):
    name = "barrier"
    description = "Wait for another tool worker"
    parameters = {"type": "object"}
    auto_register = False

    def __init__(self, name, barrier, thread_ids):
        self.name = name
        self.barrier = barrier
        self.thread_ids = thread_ids

    async def run(self, **kwargs) -> ToolResult:
        self.thread_ids.append(threading.get_ident())
        self.barrier.wait(timeout=2)
        return ToolResult(True, data={"name": self.name})


class RaisingTool(BaseTool):
    name = "raising"
    description = "Raise an error"
    parameters = {"type": "object"}
    auto_register = False

    async def run(self, **kwargs) -> ToolResult:
        raise RuntimeError("boom")


class FakeToolCallingClient:
    def __init__(self, tool_calls):
        self.tool_calls = tool_calls
        self.messages = []

    async def chat_with_tools_safe(self, messages, tools):
        self.messages.append(list(messages))
        if len(self.messages) == 1:
            return "", self.tool_calls, None
        return "final answer", [], None


class IntegrationProbeTool(BaseTool):
    name = "integration_probe"
    description = "Return the calling research role"
    parameters = {
        "type": "object",
        "properties": {"role_key": {"type": "string"}},
        "required": ["role_key"],
    }
    auto_register = False

    def __init__(self, executions):
        self.executions = executions

    async def run(self, **kwargs) -> ToolResult:
        role_key = kwargs["role_key"]
        self.executions.append((role_key, threading.get_ident()))
        return ToolResult(True, data={"role_key": role_key, "source": "fixture"})


class MockLLMClient:
    """Two-turn model double that blocks until all four agents have started."""

    def __init__(self):
        self.role_by_prompt = {role["system_prompt"]: role["role_key"] for role in RESEARCH_ROLES}
        self.role_by_prompt[REPORT_LEAD_ROLE["system_prompt"]] = "report_lead"
        self.started: set[str] = set()
        self.all_started = asyncio.Event()
        self.requests: dict[str, list[list[dict]]] = {}
        self.tool_results: dict[str, dict] = {}

    async def chat_with_tools_safe(self, messages, tools):
        role_key = self.role_by_prompt[messages[0]["content"]]
        self.requests.setdefault(role_key, []).append([dict(message) for message in messages])
        if role_key == "report_lead":
            return json.dumps({
                "executive_summary": "主编摘要",
                "verdict": "中性",
                "chapters": {"company_overview": "Apple 概况"},
                "dimension_scores": {"business": 8, "financial": 7, "industry": 8, "risk": 6},
                "long_term_scores": {"business_quality": 8, "moat": 8, "financial_quality": 7, "valuation_safety": 6},
                "short_term_scores": {"trend": 6, "catalyst": 5, "sentiment": 6, "risk_reward": 5},
                "scarcity_scores": {"technology_barrier": 8, "supply_chain_control": 7, "substitution_difficulty": 8, "qualification_barrier": 7, "capacity_constraint": 5, "policy_importance": 6},
            }), [], 20
        tool_message = next((message for message in messages if message["role"] == "tool"), None)
        if tool_message is None:
            assert [tool["function"]["name"] for tool in tools] == ["integration_probe"]
            self.started.add(role_key)
            if len(self.started) == len(RESEARCH_ROLES):
                self.all_started.set()
            await asyncio.wait_for(self.all_started.wait(), timeout=5)
            return "", [{
                "id": f"call-{role_key}",
                "function": {
                    "name": "integration_probe",
                    "arguments": json.dumps({"role_key": role_key}),
                },
            }], 10

        self.tool_results[role_key] = json.loads(tool_message["content"])
        return f"{role_key} 的最终分析", [], 20


@pytest.fixture
def isolated_registry(monkeypatch):
    monkeypatch.setattr(ToolRegistry, "_instance", None)
    return ToolRegistry()


@pytest.mark.asyncio
async def test_mock_llm_runs_complete_four_agent_research_flow(monkeypatch, isolated_registry):
    executions = []
    isolated_registry.clear()
    isolated_registry.register(IntegrationProbeTool(executions))
    client = MockLLMClient()
    requested_model_ids = []

    async def fake_get_client(model_id=None, **_kwargs):
        requested_model_ids.append(model_id)
        return client, {"id": model_id, "name": "Mock LLM"}

    monkeypatch.setattr(model_router, "get_client", fake_get_client)

    events = [
        event
        async for event in research_orch.run_research(
            "usAAPL", "Apple Inc.", model_id=17, user_id=1
        )
    ]

    role_keys = {role["role_key"] for role in RESEARCH_ROLES}
    assert requested_model_ids == [17]
    assert client.started == role_keys
    assert set(client.requests) == role_keys | {"report_lead"}
    assert all(len(client.requests[key]) == 2 for key in role_keys)
    assert len(client.requests["report_lead"]) == 1
    assert {role_key for role_key, _thread_id in executions} == role_keys
    assert all(result == {
        "success": True,
        "data": {"role_key": role_key, "source": "fixture"},
        "error": None,
    } for role_key, result in client.tool_results.items())

    event_names = [name for name, _data in events]
    assert event_names.count("agent_started") == 5
    assert event_names.count("tool_call") == 4
    assert event_names.count("agent_completed") == 5
    assert event_names.count("report_progress") == 14
    assert "error" not in event_names
    assert event_names[-1] == "done"

    done = events[-1][1]
    assert done["ticker"] == "usAAPL"
    assert set(done["agent_results"]) == role_keys | {"report_lead"}
    assert done["report"]["company_name"] == "Apple Inc."
    assert done["report"]["business_model_analysis"] == "business_analyst 的最终分析"
    assert done["report"]["financial_analysis"] == "financial_analyst 的最终分析"
    assert done["report"]["industry_analysis"] == "industry_researcher 的最终分析"
    assert done["report"]["risk_analysis"].startswith("risk_assessor 的最终分析")
    assert "【挑刺分析】" in done["report"]["risk_analysis"]
    assert all(len(done["agent_results"][key]["tool_log"]) == 1 for key in role_keys)
    assert done["report"]["team_lead_review"]["model_output_status"] == "parsed"
    assert len(done["report"]["chapters"]) == 13


@pytest.mark.asyncio
async def test_unexpected_agent_failure_emits_error_and_completes(monkeypatch):
    async def fake_get_client(model_id=None, **_kwargs):
        return object(), {"id": model_id}

    async def fake_call_agent(client, role, ticker, company_name, registry, **kwargs):
        if role["role_key"] == "business_analyst":
            raise RuntimeError("agent crashed")
        return "ok", []

    monkeypatch.setattr(model_router, "get_client", fake_get_client)
    monkeypatch.setattr(research_orch, "_call_agent", fake_call_agent)

    events = [event async for event in research_orch.run_research("usAAPL", "Apple", user_id=1)]

    errors = [data for event, data in events if event == "error"]
    assert errors == [{"role_key": "business_analyst", "error": "研究 Agent 异常：agent crashed"}]
    assert events[-1][0] == "done"
    # G-03: 任一 agent 失败 → done 事件必须携带诚实 quality=degraded
    assert events[-1][1]["quality"] == "degraded"


@pytest.mark.asyncio
async def test_same_round_tool_calls_run_in_parallel_and_keep_message_order(isolated_registry):
    barrier = threading.Barrier(2)
    thread_ids = []
    isolated_registry.register(BarrierTool("first", barrier, thread_ids))
    isolated_registry.register(BarrierTool("second", barrier, thread_ids))
    calls = [
        {"id": "call-1", "function": {"name": "first", "arguments": "{}"}},
        {"id": "call-2", "function": {"name": "second", "arguments": "{}"}},
    ]
    client = FakeToolCallingClient(calls)

    content, logs = await research_orch._call_agent(
        client,
        {"system_prompt": "test"},
        "usAAPL",
        "Apple",
        isolated_registry,
    )

    assert content == "final answer"
    assert [entry["name"] for entry in logs] == ["first", "second"]
    assert all(json.loads(entry["result"])["success"] for entry in logs)
    assert len(set(thread_ids)) == 2
    second_request = client.messages[1]
    assert [message["tool_call_id"] for message in second_request if message["role"] == "tool"] == [
        "call-1",
        "call-2",
    ]


@pytest.mark.asyncio
async def test_parallel_tool_failures_are_isolated(isolated_registry):
    isolated_registry.register(RaisingTool())
    client = FakeToolCallingClient([
        {"id": "call-1", "function": {"name": "raising", "arguments": "{}"}},
        {"id": "call-2", "function": {"name": "missing", "arguments": "{}"}},
    ])

    content, logs = await research_orch._call_agent(
        client,
        {"system_prompt": "test"},
        "usAAPL",
        "Apple",
        isolated_registry,
    )

    assert content == "final answer"
    assert logs[0]["result"] == "工具执行异常：boom"
    assert logs[1]["result"] == "错误：工具 missing 不存在"


class ContextProbeTool(BaseTool):
    """在工具线程内读取 current_user_id 并回传。"""

    name = "context_probe"
    description = "Probe authenticated user context inside the tool thread"
    parameters = {
        "type": "object",
        "properties": {"limit": {"type": "integer", "description": "必填整数参数"}},
        "required": ["limit"],
    }
    auto_register = False

    async def run(self, **kwargs) -> ToolResult:
        from app.services.auth import current_user_id

        user_id = current_user_id()
        return ToolResult(True, data={"user_id": user_id, "limit": kwargs.get("limit")})


@pytest.mark.asyncio
async def test_tool_thread_recovers_user_context_and_validates_argument_types(isolated_registry):
    """A5 回归：工具线程能读到本人 user_id；声明 integer 的参数传字符串被前置校验拒绝。"""
    isolated_registry.register(ContextProbeTool())
    client = FakeToolCallingClient([
        {"id": "call-1", "function": {"name": "context_probe", "arguments": json.dumps({"limit": 5})}},
        {"id": "call-2", "function": {"name": "context_probe", "arguments": json.dumps({"limit": "not-an-int"})}},
    ])

    content, logs = await research_orch._call_agent(
        client,
        {"system_prompt": "test"},
        "usAAPL",
        "Apple",
        isolated_registry,
        user_id=42,
    )

    assert content == "final answer"
    assert json.loads(logs[0]["result"]) == {
        "success": True,
        "data": {"user_id": 42, "limit": 5},
        "error": None,
    }
    # 类型驱动前置校验（dispatch 语义）：字符串传给 integer 参数 → 失败结果，
    # 工具 run 不执行（修复前直接 tool.run 会绕过校验并执行成功）。
    failed = json.loads(logs[1]["result"])
    assert failed["success"] is False
    assert "integer" in failed["error"]


@pytest.mark.asyncio
async def test_tool_thread_without_user_id_keeps_isolation(isolated_registry):
    """A5 隔离回归：不传 user_id 时工具线程读不到用户上下文（不落他人凭据）。"""
    isolated_registry.register(ContextProbeTool())
    client = FakeToolCallingClient([
        {"id": "call-1", "function": {"name": "context_probe", "arguments": json.dumps({"limit": 3})}},
    ])

    content, logs = await research_orch._call_agent(
        client,
        {"system_prompt": "test"},
        "usAAPL",
        "Apple",
        isolated_registry,
    )

    assert content == "final answer"
    # ContextProbeTool.run 内 current_user_id() 无上下文时抛 RuntimeError，
    # 线程内 asyncio.run 使其传播 → _execute_tool_call 捕获返回"工具执行异常"
    assert logs[0]["result"].startswith("工具执行异常")


@pytest.mark.asyncio
async def test_complete_flow_marks_quality_audited(monkeypatch, isolated_registry):
    """G-03: 无任何失败的完整研究 → done 事件 quality=audited。"""
    executions = []
    isolated_registry.clear()
    isolated_registry.register(IntegrationProbeTool(executions))
    client = MockLLMClient()

    async def fake_get_client(model_id=None, **_kwargs):
        return client, {"id": model_id, "name": "Mock LLM"}

    monkeypatch.setattr(model_router, "get_client", fake_get_client)

    events = [
        event
        async for event in research_orch.run_research(
            "usAAPL", "Apple Inc.", model_id=17, user_id=1
        )
    ]
    assert events[-1][0] == "done"
    assert events[-1][1]["quality"] == "audited"
    # VS7 P0: quality 必须并入 report_data 内部（定时路径只落库 report）。
    assert events[-1][1]["report"]["quality"] == "audited"
    # VS7 P1a: 正常路径下两种口径一致（屏上 Alert 看 quality，Markdown 导出看
    # lead_review_status）。
    assert events[-1][1]["report"]["lead_review_status"] == "audited"


@pytest.mark.asyncio
async def test_lead_empty_content_is_degraded_and_matches_lead_review_status(monkeypatch):
    """VS7 P1a: lead 返回空内容（无异常）→ quality=degraded，与 report_builder 的
    lead_review_status='degraded' 口径一致（否则屏上提示与导出提示互相矛盾）。"""

    async def fake_get_client(model_id=None, **_kwargs):
        return object(), {"id": model_id}

    async def fake_call_agent(client, role, ticker, company_name, registry, **kwargs):
        if role["role_key"] == "report_lead":
            return "", []
        return "ok", []

    monkeypatch.setattr(model_router, "get_client", fake_get_client)
    monkeypatch.setattr(research_orch, "_call_agent", fake_call_agent)

    events = [event async for event in research_orch.run_research("usAAPL", "Apple", user_id=1)]

    done = events[-1][1]
    assert events[-1][0] == "done"
    assert done["report"]["lead_review_status"] == "degraded"
    assert done["quality"] == "degraded"
    assert done["report"]["quality"] == "degraded"


@pytest.mark.asyncio
async def test_lead_unparseable_prose_is_degraded_and_matches_lead_review_status(monkeypatch):
    """VS7 P1a（Evaluator 阻断项修正）: lead 返回**非空但无法解析成 JSON 的散文**时，
    `report_builder.parse_lead_review` 得到 `{}` → `lead_review_status='degraded'`；
    `quality` 必须同为 degraded，否则屏上 Alert 与 Markdown 导出互相矛盾。
    旧实现只判 `not lead_content`（原始字符串真值），本场景会误判 audited。"""

    async def fake_get_client(model_id=None, **_kwargs):
        return object(), {"id": model_id}

    async def fake_call_agent(client, role, ticker, company_name, registry, **kwargs):
        if role["role_key"] == "report_lead":
            return "抱歉，我无法完成本次审核。", []  # 非空、无 JSON 括号 → parse 得 {}
        return "ok", []

    monkeypatch.setattr(model_router, "get_client", fake_get_client)
    monkeypatch.setattr(research_orch, "_call_agent", fake_call_agent)

    events = [event async for event in research_orch.run_research("usAAPL", "Apple", user_id=1)]

    done = events[-1][1]
    assert events[-1][0] == "done"
    assert done["report"]["lead_review_status"] == "degraded"
    assert done["quality"] == "degraded", "非空散文 lead 必须与 lead_review_status 同口径降级"
    assert done["report"]["quality"] == "degraded"


class ExhaustingToolClient:
    """每轮都请求工具（永不给出最终回答）→ 触发工具循环耗尽。"""

    def __init__(self):
        self.rounds = 0

    async def chat_with_tools_safe(self, messages, tools):
        self.rounds += 1
        return "", [{
            "id": f"call-{self.rounds}",
            "function": {"name": "integration_probe", "arguments": json.dumps({"role_key": "x"})},
        }], None

    async def chat_with_tools(self, messages, tools):
        return "final answer", [], None


@pytest.mark.asyncio
async def test_call_agent_flags_tool_execution_failure(isolated_registry):
    """VS7 P1b: 工具执行异常 → degraded_reasons 记录 tool_failed（内容不完整）。"""
    isolated_registry.register(RaisingTool())
    client = FakeToolCallingClient([
        {"id": "call-1", "function": {"name": "raising", "arguments": "{}"}},
    ])
    reasons: list[str] = []

    content, logs = await research_orch._call_agent(
        client,
        {"system_prompt": "test"},
        "usAAPL",
        "Apple",
        isolated_registry,
        degraded_reasons=reasons,
    )

    assert content == "final answer"
    assert logs[0]["result"].startswith("工具执行异常")
    assert reasons == ["tool_failed"]


@pytest.mark.asyncio
async def test_call_agent_flags_tool_loop_exhaustion(isolated_registry):
    """VS7 P1b: 工具循环耗尽 → degraded_reasons 记录 tool_loop_exhausted。"""
    executions = []
    isolated_registry.register(IntegrationProbeTool(executions))
    client = ExhaustingToolClient()
    reasons: list[str] = []

    content, logs = await research_orch._call_agent(
        client,
        {"system_prompt": "test"},
        "usAAPL",
        "Apple",
        isolated_registry,
        degraded_reasons=reasons,
    )

    assert content == "final answer"
    assert len(logs) == 5, "5 轮 tool_use 循环耗尽后才强制收敛"
    assert reasons == ["tool_loop_exhausted"]


@pytest.mark.asyncio
async def test_call_agent_reports_no_degraded_reason_on_happy_path(isolated_registry):
    """VS7 零回归：工具全部成功时不产生任何降级原因。"""
    executions = []
    isolated_registry.register(IntegrationProbeTool(executions))
    client = FakeToolCallingClient([
        {"id": "call-1", "function": {"name": "integration_probe", "arguments": json.dumps({"role_key": "x"})}},
    ])
    reasons: list[str] = []

    content, _logs = await research_orch._call_agent(
        client,
        {"system_prompt": "test"},
        "usAAPL",
        "Apple",
        isolated_registry,
        degraded_reasons=reasons,
    )

    assert content == "final answer"
    assert reasons == []


@pytest.mark.asyncio
@pytest.mark.parametrize("reason", ["tool_failed", "tool_loop_exhausted"])
async def test_agent_degraded_reasons_propagate_to_report_data(monkeypatch, reason):
    """VS7 P1b: _call_agent 收集到的降级原因必须传导到 report_data.quality（P0 落库源头）。"""

    async def fake_get_client(model_id=None, **_kwargs):
        return object(), {"id": model_id}

    async def fake_call_agent(
        client, role, ticker, company_name, registry, *, degraded_reasons=None, **kwargs
    ):
        if role["role_key"] == "report_lead":
            return "主编结论", []
        if degraded_reasons is not None:
            degraded_reasons.append(reason)
        return "ok", []

    monkeypatch.setattr(model_router, "get_client", fake_get_client)
    monkeypatch.setattr(research_orch, "_call_agent", fake_call_agent)

    events = [event async for event in research_orch.run_research("usAAPL", "Apple", user_id=1)]

    done = events[-1][1]
    assert done["quality"] == "degraded"
    assert done["report"]["quality"] == "degraded"


@pytest.mark.asyncio
async def test_agent_llm_error_is_non_fatal_degraded(monkeypatch):
    """G-03: agent 的 LLMError 应是非致命降级——
    报告仍能 done 完成，但 done 事件携带 quality=degraded，
    且事件流里是 agent_failed（非 error，避免 router 把整份报告判 failed）。"""
    from app.services.llm_client import LLMError

    async def fake_get_client(model_id=None, **_kwargs):
        return object(), {"id": model_id}

    async def fake_call_agent(client, role, ticker, company_name, registry, **kwargs):
        if role["role_key"] == "financial_analyst":
            raise LLMError("上游模型暂不可用")
        return "ok", []

    monkeypatch.setattr(model_router, "get_client", fake_get_client)
    monkeypatch.setattr(research_orch, "_call_agent", fake_call_agent)

    events = [event async for event in research_orch.run_research("usAAPL", "Apple", user_id=1)]

    event_names = [name for name, _data in events]
    assert "error" not in event_names, "LLMError 不应触发致命 error 事件"
    failed = [data for name, data in events if name == "agent_failed"]
    assert any(item["role_key"] == "financial_analyst" for item in failed)
    assert events[-1][0] == "done"
    assert events[-1][1]["quality"] == "degraded"
