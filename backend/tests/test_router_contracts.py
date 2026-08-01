from app.main import app


# Phase 8 started from a 14-router plan; the current application has grown to 19.
ROUTER_SENTINELS = {
    "agents": ("/api/agents", "get"),
    "alerts": ("/api/alerts/signal-types", "get"),
    "analysis": ("/api/analysis/stock", "post"),
    "backtest": ("/api/backtest/runs", "get"),
    "backtests": ("/api/backtests", "get"),
    "chat": ("/api/chat/sessions", "get"),
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
    "usage": ("/api/usage", "get"),
    "wq": ("/api/wq/templates", "get"),
}


def test_every_current_router_has_a_public_operation_in_openapi():
    paths = app.openapi()["paths"]

    assert len(ROUTER_SENTINELS) == 20
    for module, (path, method) in ROUTER_SENTINELS.items():
        assert path in paths, f"{module} router is not mounted"
        assert method in paths[path], f"{module} router is missing {method.upper()} {path}"
