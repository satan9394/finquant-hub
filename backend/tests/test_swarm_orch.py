import asyncio

import pytest

from app.services import model_router, swarm_orch


@pytest.fixture(autouse=True)
def stub_fundamentals(monkeypatch):
    payload = {
        "provider": "mock_fundamentals",
        "as_of": "2026-03-31",
        "quality_flags": [],
        "items": [{
            "metric": "trailingTotalRevenue",
            "value": 100.0,
            "currency": "CNY",
            "as_of": "2026-03-31",
            "period_type": "TTM",
            "provider": "mock_fundamentals",
        }],
    }

    async def load(ticker):
        assert ticker
        return payload

    monkeypatch.setattr(swarm_orch, "_load_fundamentals", load)
    return payload


def test_four_masters_team_has_expected_topology_and_tool_permissions():
    team = swarm_orch.get_four_masters_team()

    assert [agent.key for agent in team.agents] == [
        "value_investor",
        "tech_analyst",
        "macro_strategist",
        "risk_manager",
        "report_lead",
    ]
    risk = team.agents[-2]
    assert risk.dependencies == ("value_investor", "tech_analyst", "macro_strategist")
    assert "verify_valuation" in risk.tools
    assert "adversarial_review" in risk.tools
    assert team.agents[-1].dependencies == (
        "value_investor", "tech_analyst", "macro_strategist", "risk_manager",
    )


def test_earnings_review_team_has_four_researchers_editor_and_reader():
    team = swarm_orch.get_earnings_review_team()

    assert [agent.key for agent in team.agents] == [
        "business_analyst",
        "financial_analyst",
        "competition_analyst",
        "risk_analyst",
        "earnings_editor",
        "reader_reviewer",
    ]
    assert team.agents[4].dependencies == (
        "business_analyst", "financial_analyst", "competition_analyst", "risk_analyst",
    )
    assert team.agents[5].dependencies == ("earnings_editor",)
    assert "check_buffett_rules" in team.agents[1].tools


@pytest.mark.asyncio
async def test_four_masters_runs_roots_in_parallel_then_feeds_risk(monkeypatch, stub_fundamentals):
    root_started = set()
    all_roots_started = asyncio.Event()
    calls = {}

    async def fake_get_client(model_id=None):
        return object(), {"id": model_id, "name": "Fake"}

    async def fake_call_agent(
        client,
        role,
        ticker,
        company_name,
        registry,
        *,
        user_id=None,
        allowed_tools=None,
        prior_context="",
        degraded_reasons=None,
    ):
        role_key = role["role_key"]
        calls[role_key] = {"allowed_tools": allowed_tools, "prior_context": prior_context}
        if role_key not in {"risk_manager", "report_lead"}:
            root_started.add(role_key)
            if len(root_started) == 3:
                all_roots_started.set()
            await asyncio.wait_for(all_roots_started.wait(), timeout=1)
        return f"{role['name']}完成", []

    monkeypatch.setattr(model_router, "get_client", fake_get_client)
    monkeypatch.setattr(swarm_orch, "_call_agent", fake_call_agent)

    events = [event async for event in swarm_orch.run_four_masters("usAAPL", "Apple", 7)]

    assert events[0][0] == "team_started"
    assert events[-1][0] == "done"
    assert len([event for event, _ in events if event == "agent_started"]) == 5
    assert len([event for event, _ in events if event == "agent_completed"]) == 5
    assert calls["tech_analyst"]["allowed_tools"] == {
        "get_stock_data",
        "calculate_indicators",
        "search_news",
    }
    risk_context = calls["risk_manager"]["prior_context"]
    assert all(name in risk_context for name in ("价值投资官", "技术分析师", "宏观策略师"))
    assert all("mock_fundamentals" in call["prior_context"] for call in calls.values())
    done = events[-1][1]
    assert done["status"] == "completed"
    assert list(done["agent_results"]) == [
        "value_investor",
        "tech_analyst",
        "macro_strategist",
        "risk_manager",
        "report_lead",
    ]
    assert done["token_count"] > 0
    assert done["fundamentals"] == stub_fundamentals


@pytest.mark.asyncio
async def test_root_failure_skips_dependent_risk_agent(monkeypatch):
    async def fake_get_client(model_id=None):
        return object(), {"id": 1, "name": "Fake"}

    async def fake_call_agent(
        client,
        role,
        ticker,
        company_name,
        registry,
        *,
        user_id=None,
        allowed_tools=None,
        prior_context="",
        degraded_reasons=None,
    ):
        if role["role_key"] == "value_investor":
            raise RuntimeError("value failed")
        return "完成", []

    monkeypatch.setattr(model_router, "get_client", fake_get_client)
    monkeypatch.setattr(swarm_orch, "_call_agent", fake_call_agent)

    events = [event async for event in swarm_orch.run_four_masters("usAAPL", "Apple")]

    assert ("agent_failed", {"role_key": "value_investor", "error": "value failed"}) in events
    skipped = next(data for event, data in events if event == "agent_skipped")
    assert skipped == {"role_key": "risk_manager", "failed_dependencies": ["value_investor"]}
    assert events[-1][1]["status"] == "partial"
    assert events[-1][1]["failed_agents"] == ["value_investor"]
    assert events[-1][1]["skipped_agents"] == ["risk_manager", "report_lead"]


@pytest.mark.asyncio
async def test_earnings_review_runs_yaml_discussion_dag(monkeypatch):
    calls = {}

    async def fake_get_client(model_id=None):
        return object(), {"id": model_id, "name": "Fake"}

    async def fake_call_agent(
        client, role, ticker, company_name, registry, *, user_id=None, allowed_tools=None, prior_context="",
        degraded_reasons=None,
    ):
        calls[role["role_key"]] = prior_context
        return f"{role['name']}完成", []

    monkeypatch.setattr(model_router, "get_client", fake_get_client)
    monkeypatch.setattr(swarm_orch, "_call_agent", fake_call_agent)

    events = [event async for event in swarm_orch.run_earnings_review("usAAPL", "Apple", 7)]

    assert len([event for event, _ in events if event == "agent_completed"]) == 6
    assert all(name in calls["earnings_editor"] for name in (
        "生意本质分析师", "财务质量分析师", "竞争格局分析师", "风险与做空审查员",
    ))
    assert "财报研究编辑" in calls["reader_reviewer"]
    report = swarm_orch.build_earnings_review_report("usAAPL", "Apple", events[-1][1])
    assert report["report_type"] == "earnings_review_team"
    assert report["reader_review"] == "投资者读者审阅员完成"


# ==================== VS35: 逐 Agent 条目的结构化状态（VS-20 契约） ====================

# VS-20 条目里**每个** Agent 都必然存在的字段（`research_orch._agent_result` 的输出）。
VS20_CORE_FIELDS = ("name", "content", "tool_log", "status")
# VS-20 的状态词表 + swarm 的**扩展**取值（DAG 独有：依赖失败 ⇒ 本环节未执行）。
VS20_STATUSES = {"completed", "degraded", "failed", "skipped"}


def read_agent_status(agent_results, key):
    """**唯一读取方式**：结构化 `status` 是主判据，缺条目/缺字段如实为 'unknown'。

    本函数是 VS-20 契约的读取端；`research_orch` 与 `swarm_orch` 的产物必须都能被它读，
    且读到相同语义——这正是本卡要证明的"同一套读取方式对两种编排都适用"。
    （前端 `Research.tsx#deriveAgentOutcome` 是同一读法：`result.status` 优先，
    只有缺字段的历史条目才退化到事件/文案兜底。）
    """
    entry = agent_results.get(key)
    if not isinstance(entry, dict):
        return "unknown"
    status = entry.get("status")
    return status if isinstance(status, str) else "unknown"


async def _run_research_with_reasons(monkeypatch, degraded_role="financial_analyst"):
    """跑**真实**的 `research_orch.run_research`，只把 `_call_agent` 换成可控替身。"""
    from app.services import research_orch

    async def empty_search(query, *, user_id, limit):
        return []

    async def fake_get_client(model_id=None, **_kwargs):
        return object(), {"id": model_id, "name": "Fake"}

    async def fake_call_agent(
        client, role, ticker, company_name, registry, *, user_id=None, allowed_tools=None,
        prior_context="", memory_context="", degraded_reasons=None, deadline_at=None,
    ):
        if role["role_key"] == degraded_role and degraded_reasons is not None:
            degraded_reasons.append("tool_failed")
        return f"{role['name']}的分析", []

    monkeypatch.setattr(research_orch.native_memory_provider, "search", empty_search)
    monkeypatch.setattr(model_router, "get_client", fake_get_client)
    monkeypatch.setattr(research_orch, "_call_agent", fake_call_agent)
    events = [event async for event in research_orch.run_research("usAAPL", "Apple", user_id=1)]
    return events[-1][1]


@pytest.mark.asyncio
async def test_same_vs20_reader_reads_both_orchestrators(monkeypatch):
    """同一段读取代码对 `research_orch` 与 `swarm_orch` 都成立，且读到相同语义。"""

    async def fake_get_client(model_id=None, **_kwargs):
        return object(), {"id": model_id, "name": "Fake"}

    async def fake_call_agent(
        client, role, ticker, company_name, registry, *, user_id=None, allowed_tools=None,
        prior_context="", degraded_reasons=None,
    ):
        # 让 swarm 侧也出现一个"跑完了但内容残缺"的 Agent（与 research 侧同因同码）。
        if role["role_key"] == "tech_analyst" and degraded_reasons is not None:
            degraded_reasons.append("tool_failed")
        return f"{role['name']}完成", []

    monkeypatch.setattr(model_router, "get_client", fake_get_client)
    monkeypatch.setattr(swarm_orch, "_call_agent", fake_call_agent)
    swarm_done = [
        event async for event in swarm_orch.run_four_masters("usAAPL", "Apple")
    ][-1][1]
    research_done = await _run_research_with_reasons(monkeypatch, degraded_role="financial_analyst")

    for done in (swarm_done, research_done):
        results = done["agent_results"]
        # ① 同一段读取代码：每个 Agent 都读得到结构化状态，且取值在 VS-20 词表内。
        assert results, "agent_results 不能为空"
        assert all(read_agent_status(results, key) in VS20_STATUSES for key in results)
        # ② 同一套字段：每个条目都具备 VS-20 的核心字段。
        assert all(
            all(field in entry for field in VS20_CORE_FIELDS)
            for entry in results.values()
        )

    # ③ 同一语义：同因（tool_failed）在两侧读到同一个状态与同一套原因码。
    assert read_agent_status(swarm_done["agent_results"], "tech_analyst") == "degraded"
    assert swarm_done["agent_results"]["tech_analyst"]["degraded_reasons"] == ["tool_failed"]
    assert read_agent_status(research_done["agent_results"], "financial_analyst") == "degraded"
    assert research_done["agent_results"]["financial_analyst"]["degraded_reasons"] == ["tool_failed"]
    # ④ 干净 Agent 在两侧都读成 completed（不是靠"缺字段/缺条目"猜出来的）。
    assert read_agent_status(swarm_done["agent_results"], "value_investor") == "completed"
    assert read_agent_status(research_done["agent_results"], "business_analyst") == "completed"


@pytest.mark.asyncio
async def test_swarm_agent_completed_event_carries_structured_status(monkeypatch):
    """实时事件与落库条目**同源**：agent_completed 也带 status/degraded_reasons。"""

    async def fake_get_client(model_id=None, **_kwargs):
        return object(), {"id": model_id, "name": "Fake"}

    async def fake_call_agent(
        client, role, ticker, company_name, registry, *, user_id=None, allowed_tools=None,
        prior_context="", degraded_reasons=None,
    ):
        if role["role_key"] == "tech_analyst" and degraded_reasons is not None:
            degraded_reasons.append("tool_failed")
        return "完成", []

    monkeypatch.setattr(model_router, "get_client", fake_get_client)
    monkeypatch.setattr(swarm_orch, "_call_agent", fake_call_agent)
    events = [event async for event in swarm_orch.run_four_masters("usAAPL", "Apple")]

    completed = {data["role_key"]: data for event, data in events if event == "agent_completed"}
    assert completed["tech_analyst"]["status"] == "degraded"
    assert completed["tech_analyst"]["degraded_reasons"] == ["tool_failed"]
    assert completed["value_investor"]["status"] == "completed"
    assert "degraded_reasons" not in completed["value_investor"]


@pytest.mark.asyncio
async def test_swarm_failed_and_skipped_agents_are_structurally_readable(monkeypatch):
    """失败/被跳过的 Agent 也在 `agent_results` 里有条目，状态可结构化读取。

    改动前它们**根本没有条目**，失败事实只存在于顶层 `failed_agents`/`skipped_agents`
    两个 key 列表里（同一件事的第二处载体）。本用例是"形状对齐"的鉴别用例。
    """

    async def fake_get_client(model_id=None, **_kwargs):
        return object(), {"id": 1, "name": "Fake"}

    async def fake_call_agent(
        client, role, ticker, company_name, registry, *, user_id=None, allowed_tools=None,
        prior_context="", degraded_reasons=None,
    ):
        if role["role_key"] == "value_investor":
            raise RuntimeError("value failed")
        return "完成", []

    monkeypatch.setattr(model_router, "get_client", fake_get_client)
    monkeypatch.setattr(swarm_orch, "_call_agent", fake_call_agent)
    done = [event async for event in swarm_orch.run_four_masters("usAAPL", "Apple")][-1][1]
    results = done["agent_results"]

    assert read_agent_status(results, "value_investor") == "failed"
    assert "value failed" in results["value_investor"]["error"]
    assert read_agent_status(results, "risk_manager") == "skipped"
    assert results["risk_manager"]["error"]
    # 失败/被跳过的 Agent 不新造 `【分析失败】` 文本哨兵（VS-20 已把文案哨兵降级为历史兜底）。
    assert results["value_investor"]["content"] == ""
    # 向后兼容：顶层两个 key 列表与 run 级状态语义一字未改。
    assert done["failed_agents"] == ["value_investor"]
    assert done["skipped_agents"] == ["risk_manager", "report_lead"]
    assert done["status"] == "partial"
    # 整洁性：报告正文不因新增条目而变化（失败条目 content 为空）。
    report = swarm_orch.build_four_masters_report("usAAPL", "Apple", done)
    assert report["value_analysis"] == ""
    assert report["failed_agents"] == ["value_investor"]
