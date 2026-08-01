import asyncio
import json
import threading

import pytest

from app.agent.tools import BaseTool, ToolRegistry, ToolResult
from app.prompts.research_roles import REPORT_LEAD_ROLE, RESEARCH_ROLES
from app.services import model_router, research_orch


@pytest.fixture(autouse=True)
def empty_research_memory(monkeypatch):
    async def empty_search(query, *, limit):
        return []

    monkeypatch.setattr(research_orch, "search_cross_session_memory", empty_search)


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

    async def fake_get_client(model_id=None):
        requested_model_ids.append(model_id)
        return client, {"id": model_id, "name": "Mock LLM"}

    monkeypatch.setattr(model_router, "get_client", fake_get_client)

    events = [
        event
        async for event in research_orch.run_research("usAAPL", "Apple Inc.", model_id=17)
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
    async def fake_get_client(model_id=None):
        return object(), {"id": model_id}

    async def fake_call_agent(client, role, ticker, company_name, registry, **kwargs):
        if role["role_key"] == "business_analyst":
            raise RuntimeError("agent crashed")
        return "ok", []

    monkeypatch.setattr(model_router, "get_client", fake_get_client)
    monkeypatch.setattr(research_orch, "_call_agent", fake_call_agent)

    events = [event async for event in research_orch.run_research("usAAPL", "Apple")]

    errors = [data for event, data in events if event == "error"]
    assert errors == [{"role_key": "business_analyst", "error": "研究 Agent 异常：agent crashed"}]
    assert events[-1][0] == "done"


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
