"""Deterministic route branch coverage for BACKLOG-007 secondary targets."""

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

from app.routers import alerts, dashboard, instruments
from app.services import alerts as alerts_service
from app.services.chip_distribution import ChipDistributionUnavailable
from app.services.import_service import ImportFormatError
from app.services.market_data import MarketError


def _request(market=None):
    return SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(market=market)))


def _alert_body():
    return alerts.AlertRuleCreate(name="Rule", ticker="600519", signal_type="rsi")


@pytest.mark.asyncio
async def test_alert_ticker_and_monitor_target_error_mapping(monkeypatch):
    monkeypatch.setattr(alerts, "resolve_ticker", AsyncMock(side_effect=ValueError("bad ticker")))
    with pytest.raises(HTTPException) as exc:
        await alerts._ticker("bad", _request())
    assert exc.value.status_code == 400

    body = alerts.MonitorTargetInput(target_type="thesis", target_id=1, name="Target")
    monkeypatch.setattr(alerts, "draft_monitor_target", AsyncMock(side_effect=ValueError("bad target")))
    with pytest.raises(HTTPException) as exc:
        await alerts.draft_target(body, {"id": 1})
    assert exc.value.status_code == 400

    monkeypatch.setattr(alerts, "confirm_monitor_target", AsyncMock(side_effect=alerts_service.DuplicateRuleError("duplicate")))
    with pytest.raises(HTTPException) as exc:
        await alerts.confirm_target(body, {"id": 1})
    assert exc.value.status_code == 409
    monkeypatch.setattr(alerts, "confirm_monitor_target", AsyncMock(side_effect=ValueError("bad target")))
    with pytest.raises(HTTPException) as exc:
        await alerts.confirm_target(body, {"id": 1})
    assert exc.value.status_code == 400


@pytest.mark.asyncio
@pytest.mark.parametrize("error,status", [
    (alerts_service.DuplicateRuleError("duplicate"), 409),
    (ValueError("bad rule"), 400),
])
async def test_alert_create_error_mapping(monkeypatch, error, status):
    monkeypatch.setattr(alerts, "_ticker", AsyncMock(return_value="sh600519"))
    monkeypatch.setattr(alerts_service, "create_rule", AsyncMock(side_effect=error))
    with pytest.raises(HTTPException) as exc:
        await alerts.create_rule(_alert_body(), _request(), {"id": 1})
    assert exc.value.status_code == status


@pytest.mark.asyncio
async def test_alert_update_and_delete_error_states(monkeypatch):
    with pytest.raises(HTTPException) as exc:
        await alerts.update_rule(1, alerts.AlertRuleUpdate(), _request(), {"id": 1})
    assert exc.value.status_code == 400

    with pytest.raises(HTTPException) as exc:
        await alerts.update_rule(1, alerts.AlertRuleUpdate(name=None), _request(), {"id": 1})
    assert exc.value.status_code == 400

    monkeypatch.setattr(alerts_service, "update_rule", AsyncMock(side_effect=alerts_service.DuplicateRuleError("duplicate")))
    with pytest.raises(HTTPException) as exc:
        await alerts.update_rule(1, alerts.AlertRuleUpdate(name="New"), _request(), {"id": 1})
    assert exc.value.status_code == 409
    monkeypatch.setattr(alerts_service, "update_rule", AsyncMock(side_effect=ValueError("bad")))
    with pytest.raises(HTTPException) as exc:
        await alerts.update_rule(1, alerts.AlertRuleUpdate(name="New"), _request(), {"id": 1})
    assert exc.value.status_code == 400
    monkeypatch.setattr(alerts_service, "update_rule", AsyncMock(return_value=None))
    with pytest.raises(HTTPException) as exc:
        await alerts.update_rule(1, alerts.AlertRuleUpdate(name="New"), _request(), {"id": 1})
    assert exc.value.status_code == 404

    monkeypatch.setattr(alerts_service, "delete_rule", AsyncMock(return_value=False))
    with pytest.raises(HTTPException) as exc:
        await alerts.delete_rule(1, {"id": 1})
    assert exc.value.status_code == 404


@pytest.mark.asyncio
@pytest.mark.parametrize("error,status", [(ValueError("bad"), "UNKNOWN"), (RuntimeError("down"), "UPSTREAM_ERROR")])
async def test_dashboard_news_isolates_service_errors(monkeypatch, error, status):
    service = SimpleNamespace(search=AsyncMock(side_effect=error), aclose=AsyncMock())
    monkeypatch.setattr(dashboard, "get_credentials", AsyncMock(return_value={}))
    monkeypatch.setattr(dashboard, "NewsSearchService", lambda **_kwargs: service)
    result = await dashboard.dashboard_news({"id": 1})
    assert result["data_status"] == status
    assert result["errors"] == {"service": type(error).__name__}
    service.aclose.assert_awaited_once()


@pytest.mark.asyncio
async def test_dashboard_import_validation_paths(monkeypatch):
    with pytest.raises(HTTPException) as exc:
        await dashboard.import_watchlist(_request(), {"id": 1}, text="", existing="{}", file=None)
    assert exc.value.status_code == 422

    monkeypatch.setattr(dashboard, "parse_text", lambda _text: (_ for _ in ()).throw(ImportFormatError("bad format")))
    with pytest.raises(HTTPException) as exc:
        await dashboard.import_watchlist(_request(), {"id": 1}, text="bad", existing="[]", file=None)
    assert exc.value.status_code == 422

    monkeypatch.setattr(dashboard, "parse_text", lambda _text: [])
    with pytest.raises(HTTPException) as exc:
        await dashboard.import_watchlist(_request(), {"id": 1}, text="", existing="[]", file=None)
    assert exc.value.status_code == 422


@pytest.mark.asyncio
async def test_dashboard_stats_handles_invalid_environment_name(monkeypatch):
    query_one = AsyncMock(side_effect=[
        {"n": 1}, {"n": 2}, {"n": 3}, {"n": 4},
        {"id": 9, "name": "Model", "model_name": "fixture", "api_key_env": "BAD\x00NAME", "has_stored_credential": 0},
    ])
    monkeypatch.setattr(dashboard.database, "query_one", query_one)
    monkeypatch.setattr(dashboard.database, "query_all", AsyncMock(side_effect=[[], [{"participants": "[]"}]]))
    result = await dashboard.stats({"id": 1})
    assert result["recent_rooms"][0]["participants"] == []
    assert result["capabilities"]["model_ai"]["credential_source"] == "none"


class _InstrumentService:
    def __init__(self, error):
        self.error = error

    async def search(self, *_args):
        raise self.error

    async def snapshot(self, *_args):
        raise self.error

    async def bars(self, *_args):
        raise self.error

    async def fundamentals(self, *_args):
        raise self.error


@pytest.mark.asyncio
async def test_instrument_read_routes_map_validation_and_upstream_errors(monkeypatch):
    monkeypatch.setattr(instruments, "_service", lambda _request: _InstrumentService(MarketError("down")))
    for call in (
        lambda: instruments.search_instruments(_request(), {"id": 1}, "q"),
        lambda: instruments.get_snapshot("bad", _request(), {"id": 1}),
        lambda: instruments.get_bars("bad", _request(), {"id": 1}),
        lambda: instruments.get_fundamentals("bad", _request(), {"id": 1}),
    ):
        with pytest.raises(HTTPException) as exc:
            await call()
        assert exc.value.status_code == 502

    monkeypatch.setattr(instruments, "_service", lambda _request: _InstrumentService(ValueError("bad")))
    for call in (
        lambda: instruments.get_snapshot("bad", _request(), {"id": 1}),
        lambda: instruments.get_bars("bad", _request(), {"id": 1}),
        lambda: instruments.get_fundamentals("bad", _request(), {"id": 1}),
    ):
        with pytest.raises(HTTPException) as exc:
            await call()
        assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_chip_distribution_error_mapping(monkeypatch):
    monkeypatch.setattr(instruments, "fetch_chip_distribution", AsyncMock(side_effect=ValueError("bad")))
    with pytest.raises(HTTPException) as exc:
        await instruments.get_chip_distribution("bad", {"id": 1})
    assert exc.value.status_code == 400
    monkeypatch.setattr(instruments, "fetch_chip_distribution", AsyncMock(side_effect=ChipDistributionUnavailable("down")))
    with pytest.raises(HTTPException) as exc:
        await instruments.get_chip_distribution("bad", {"id": 1})
    assert exc.value.status_code == 502


@pytest.mark.asyncio
async def test_instrument_workspace_invalid_empty_and_saved_paths(monkeypatch):
    monkeypatch.setattr(instruments, "external_symbol", lambda _symbol: (_ for _ in ()).throw(ValueError("bad")))
    with pytest.raises(HTTPException) as exc:
        await instruments.get_workspace("bad", {"id": 1})
    assert exc.value.status_code == 400
    body = instruments.WorkspaceSave(name="Workspace", instrument={})
    with pytest.raises(HTTPException) as exc:
        await instruments.save_workspace("bad", body, {"id": 1})
    assert exc.value.status_code == 400

    monkeypatch.setattr(instruments, "external_symbol", lambda _symbol: "sh600519")
    monkeypatch.setattr(instruments.database, "query_one", AsyncMock(return_value=None))
    assert await instruments.get_workspace("600519", {"id": 1}) == {
        "symbol": "sh600519", "notes": "", "evidence": [], "saved": False,
    }

    row = {
        "instrument_json": '{"code":"sh600519"}', "evidence_json": "[]",
        "snapshot_json": '{"price":10}',
    }
    monkeypatch.setattr(instruments.database, "query_one", AsyncMock(return_value=row))
    saved = await instruments.get_workspace("600519", {"id": 1})
    assert saved["instrument"]["code"] == "sh600519" and saved["snapshot"] == {"price": 10}


@pytest.mark.asyncio
@pytest.mark.parametrize("existing", [None, {"id": 9}])
async def test_instrument_workspace_insert_and_update(monkeypatch, existing):
    monkeypatch.setattr(instruments, "external_symbol", lambda _symbol: "sh600519")
    monkeypatch.setattr(instruments.database, "query_one", AsyncMock(side_effect=[existing, {"id": 9, "symbol": "sh600519"}]))
    execute = AsyncMock(return_value=9)
    monkeypatch.setattr(instruments.database, "execute", execute)
    result = await instruments.save_workspace(
        "600519",
        instruments.WorkspaceSave(name="Workspace", instrument={"code": "sh600519"}, snapshot={"price": 10}),
        {"id": 1},
    )
    assert result == {"id": 9, "symbol": "sh600519", "saved": True}
    assert "UPDATE" in execute.await_args.args[0] if existing else "INSERT" in execute.await_args.args[0]
