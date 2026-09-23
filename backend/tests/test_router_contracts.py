import pytest
from httpx import ASGITransport, AsyncClient

from app import config, database
from app.main import app


# Phase 8 started from a 14-router plan; auth is public, while 21 business routers require a session.
ROUTER_SENTINELS = {
    "agents": ("/api/agents", "get"),
    "alerts": ("/api/alerts/signal-types", "get"),
    "analysis": ("/api/analysis/stock", "post"),
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

    assert len(ROUTER_SENTINELS) == 21
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
async def test_every_business_router_rejects_missing_session(tmp_path, monkeypatch):
    # 需要 lifespan 初始化数据库；并关闭 local-only 以走真实 session 认证（期望 401）。
    monkeypatch.setattr(config, "DB_PATH", tmp_path / "router-contracts.db")
    monkeypatch.setattr(config, "LOCAL_ONLY_MODE", False)
    async with app.router.lifespan_context(app):
        try:
            async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
                for module, (path, method) in ROUTER_SENTINELS.items():
                    response = await client.request(method, path)
                    assert response.status_code == 401, f"{module} router is public"
        finally:
            await database.close_db()


@pytest.mark.asyncio
async def test_retired_backtest_keeps_legacy_data_and_shared_alpha_simulation(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "DB_PATH", tmp_path / "retired-backtest.db")
    monkeypatch.setattr(config, "LOCAL_ONLY_MODE", True)
    monkeypatch.setattr(config, "SCHEDULER_ENABLED", False)
    async with app.router.lifespan_context(app):
        user = await database.query_one("SELECT id FROM users ORDER BY id LIMIT 1")
        run_id = await database.execute(
            "INSERT INTO backtest_runs (ticker, strategy_type, result, user_id) VALUES (?, ?, ?, ?)",
            ("sh600519", "ma_cross", "{}", user["id"]),
        )
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            for method, path in (
                ("POST", "/api/backtest/runs"),
                ("GET", "/api/backtest/runs"),
                ("GET", f"/api/backtest/runs/{run_id}"),
            ):
                assert (await client.request(method, path)).status_code == 404
            v2 = await client.get("/api/backtests")
            assert v2.status_code == 200
            assert v2.json()["items"] == []

            # The live Alpha route still needs shared metrics after the v1 engine is retired.
            # Equal factors/returns give zero long-short return, not a fabricated IC or Sharpe.
            response = await client.post("/api/wq/simulate/local", json={
                "observations": [
                    {"date": day, "symbol": symbol, "factor": 1, "forward_return": 0.2}
                    for day in ("2026-01-05", "2026-01-06")
                    for symbol in ("A", "B", "C", "D", "E")
                ],
            })
            assert response.status_code == 200
            result = response.json()
            assert result["period_returns"] == [0, 0]
            assert [point["value"] for point in result["equity_curve"]] == [1, 1, 1]
            assert result["metrics"]["total_return"] == 0
            assert result["metrics"]["sharpe_ratio"] is None
            assert result["metrics"]["beta"] is None
            assert result["factor_analysis"]["mean_ic"] is None
            assert result["factor_analysis"]["mean_rank_ic"] is None
            assert result["factor_analysis"]["excluded_periods"] == [
                {"date": day, "assets": 5, "reason": "zero_variance"}
                for day in ("2026-01-05", "2026-01-06")
            ]
            assert await database.query_one(
                "SELECT ticker, strategy_type, result FROM backtest_runs WHERE id = ?", (run_id,),
            ) == {"ticker": "sh600519", "strategy_type": "ma_cross", "result": "{}"}
