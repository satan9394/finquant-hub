import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


# Phase 8 started from a 14-router plan; auth is public, while 22 business routers require a session.
ROUTER_SENTINELS = {
    "agents": ("/api/agents", "get"),
    "alerts": ("/api/alerts/signal-types", "get"),
    "analysis": ("/api/analysis/stock", "post"),
    "backtest": ("/api/backtest/runs", "get"),
    "backtests": ("/api/backtests", "get"),
    "chat": ("/api/chat/sessions", "get"),
    "credentials": ("/api/me/credentials", "get"),
    "dashboard": ("/api/dashboard/stats", "get"),
    "discussion": ("/api/discussion/rooms", "get"),
    "instruments": ("/api/instruments/workspaces", "get"),
    "market": ("/api/market/calendar", "get"),
    "mcp": ("/api/mcp/servers", "get"),
    "models_crud": ("/api/models", "get"),
    "notifications": ("/api/notifications", "get"),
    "portfolio": ("/api/portfolio", "get"),
    "research": ("/api/research", "get"),
    "screening": ("/api/screening", "post"),
    "settings": ("/api/settings/system", "get"),
    "swarm": ("/api/swarm/teams/four-masters", "get"),
    "thesis": ("/api/thesis", "get"),
    "usage": ("/api/usage", "get"),
    "wq": ("/api/wq/templates", "get"),
}


def test_every_current_router_has_a_public_operation_in_openapi():
    paths = app.openapi()["paths"]

    assert len(ROUTER_SENTINELS) == 22
    for module, (path, method) in ROUTER_SENTINELS.items():
        assert path in paths, f"{module} router is not mounted"
        assert method in paths[path], f"{module} router is missing {method.upper()} {path}"


def test_paper_portfolio_openapi_is_separate_and_has_no_real_execution_paths():
    paths = app.openapi()["paths"]
    expected = {
        "/api/portfolio/paper",
        "/api/portfolio/paper/{portfolio_id}",
        "/api/portfolio/paper/{portfolio_id}/ledger",
        "/api/portfolio/paper/{portfolio_id}/valuation",
        "/api/portfolio/paper/{portfolio_id}/archive",
        "/api/portfolio/paper/{portfolio_id}/reviews",
        "/api/portfolio/paper/{portfolio_id}/reviews/draft",
    }
    assert expected <= set(paths)
    paper_paths = {path.lower() for path in paths if path.startswith("/api/portfolio/paper")}
    assert all("order" not in path and "broker" not in path and "account" not in path for path in paper_paths)


@pytest.mark.asyncio
async def test_every_business_router_rejects_missing_session():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        for module, (path, method) in ROUTER_SENTINELS.items():
            response = await client.request(method, path)
            assert response.status_code == 401, f"{module} router is public"
