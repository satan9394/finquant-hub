import pytest

from app.services import model_router, research_orch


@pytest.mark.asyncio
async def test_unexpected_agent_failure_emits_error_and_completes(monkeypatch):
    async def fake_get_client(model_id=None):
        return object(), {"id": model_id}

    async def fake_call_agent(client, role, ticker, company_name, registry):
        if role["role_key"] == "business_analyst":
            raise RuntimeError("agent crashed")
        return "ok", []

    monkeypatch.setattr(model_router, "get_client", fake_get_client)
    monkeypatch.setattr(research_orch, "_call_agent", fake_call_agent)

    events = [event async for event in research_orch.run_research("usAAPL", "Apple")]

    errors = [data for event, data in events if event == "error"]
    assert errors == [{"role_key": "business_analyst", "error": "研究 Agent 异常：agent crashed"}]
    assert events[-1][0] == "done"
