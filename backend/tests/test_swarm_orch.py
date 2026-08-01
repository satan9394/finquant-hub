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
        allowed_tools=None,
        prior_context="",
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
        allowed_tools=None,
        prior_context="",
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
        client, role, ticker, company_name, registry, *, allowed_tools=None, prior_context="",
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
