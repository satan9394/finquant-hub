"""High-value deterministic service coverage for BACKLOG-007."""

from unittest.mock import AsyncMock

import httpx
import numpy as np
import pytest

from app.backtest.loaders import providers
from app.backtest.loaders.base import LoaderUnavailableError
from app.services.alpha_brain import AlphaBrainClient, AlphaBrainError
from app.services.analysis import signals
from app.services.market_data import MarketError


@pytest.mark.asyncio
async def test_alpha_brain_auth_validation_and_resource_ids():
    async with httpx.AsyncClient(base_url="https://brain.test") as http:
        client = AlphaBrainClient(http=http)
        with pytest.raises(AlphaBrainError, match="缺少"):
            await client.authenticate()
        for expression in ("", "x" * 10_001):
            with pytest.raises(ValueError, match="表达式"):
                await client.create_simulation(expression)
        with pytest.raises(ValueError, match="资源 ID"):
            await client.get_alpha("bad/id")


@pytest.mark.asyncio
async def test_alpha_brain_successful_round_trip_uses_mock_transport():
    def handler(request):
        if request.url.path == "/authentication":
            return httpx.Response(201, request=request)
        if request.url.path == "/simulations" and request.method == "POST":
            return httpx.Response(201, headers={"Location": "/simulations/sim-1"}, request=request)
        if request.url.path == "/simulations/sim-1":
            return httpx.Response(200, json={"status": "COMPLETE"}, request=request)
        return httpx.Response(200, json={"id": "alpha-1"}, request=request)

    async with httpx.AsyncClient(base_url="https://brain.test", transport=httpx.MockTransport(handler)) as http:
        client = AlphaBrainClient(username="user", password="pass", http=http)
        await client.authenticate()
        assert await client.create_simulation("rank(close)") == {"simulation_id": "sim-1", "status": "accepted"}
        assert (await client.get_simulation("sim-1"))["status"] == "COMPLETE"
        assert (await client.get_alpha("alpha-1"))["id"] == "alpha-1"
        assert await client.__aenter__() is client
        await client.__aexit__()


@pytest.mark.asyncio
@pytest.mark.parametrize("response,error", [
    (httpx.Response(500), "HTTP 500"),
    (httpx.Response(200, text="not-json"), "无效 JSON"),
    (httpx.Response(200, json=[]), "结构无效"),
])
async def test_alpha_brain_sanitizes_http_and_payload_failures(response, error):
    def handler(request):
        response.request = request
        return response

    async with httpx.AsyncClient(base_url="https://brain.test", transport=httpx.MockTransport(handler)) as http:
        client = AlphaBrainClient(username="user", password="pass", http=http)
        with pytest.raises(AlphaBrainError, match=error):
            await client.get_alpha("alpha-1")


@pytest.mark.asyncio
async def test_alpha_brain_sanitizes_transport_error_and_closes_owned_client():
    async def fail(_request):
        raise httpx.ConnectError("secret endpoint")

    async with httpx.AsyncClient(base_url="https://brain.test", transport=httpx.MockTransport(fail)) as http:
        client = AlphaBrainClient(username="user", password="pass", http=http)
        with pytest.raises(AlphaBrainError, match="暂时不可用") as exc:
            await client.authenticate()
        assert "secret endpoint" not in str(exc.value)

    owned = AlphaBrainClient(username="user", password="pass")
    close = AsyncMock()
    owned.http = type("Owned", (), {"aclose": close})()
    await owned.aclose()
    close.assert_awaited_once()


def test_signal_crosses_divergence_and_breakouts_cover_nan_and_both_directions():
    macd = {"dif": [np.nan, 0, 2, 0], "dea": [0, 1, 1, 1]}
    assert [item["type"] for item in signals.golden_cross(macd)] == ["golden_cross"]
    assert [item["type"] for item in signals.death_cross(macd)] == ["death_cross"]

    top_close = list(range(10, 30)) + [31]
    top_dif = list(range(20)) + [0]
    bottom_close = list(range(30, 10, -1)) + [5]
    bottom_dif = list(range(20)) + [10]
    assert signals.divergence({"dif": top_dif}, top_close)[0]["type"] == "top_divergence"
    assert signals.divergence({"dif": bottom_dif}, bottom_close)[0]["type"] == "bottom_divergence"

    assert signals.breakout([1, 2, 4], [2, 3, 3], [1, 1, 2], period=2)[0]["type"] == "breakout_up"
    assert signals.breakout([4, 3, 1], [4, 4, 3], [3, 2, 2], period=2)[0]["type"] == "breakout_down"
    assert signals.breakout([1, 2, np.nan], [2, 3, 3], [1, 1, 2], period=2) == []


def test_signal_volume_rsi_recent_deduplication_and_detect_all():
    assert signals.volume_surge([0, 0, 5], window=2) == []
    assert signals.volume_surge([1, 1, np.nan], window=2) == []
    assert signals.volume_surge([1, 1, 3], window=2)[0]["type"] == "volume_surge"
    assert [item["index"] for item in signals.rsi_oversold([np.nan, 25, 20, 35, 20])] == [1, 4]
    assert [item["index"] for item in signals.rsi_overbought([np.nan, 75, 80, 60, 75])] == [1, 4]

    recent = signals._recent_unique([
        {"type": "a", "index": 1}, {"type": "a", "index": 9},
        {"type": "b", "index": 8}, {"type": "old", "index": 0},
    ], latest_index=10, lookback=3)
    assert recent == [{"type": "b", "index": 8}, {"type": "a", "index": 9}]

    count = 25
    detected = signals.detect_all(
        {"macd": {"dif": [0] * count, "dea": [1] * count}, "rsi": {"rsi14": [35] * 20 + [25] + [35] * 4, "empty": []}},
        [10] * count, [11] * count, [9] * count, [1] * count,
    )
    assert any(item["type"] == "rsi_oversold" for item in detected)


def test_loader_row_cleaning_and_payload_quality_flags():
    rows = providers._clean_rows([
        {"d": "2026-02-01", "o": 10, "h": 12, "l": 9, "c": 11, "v": 100},
        {"d": "2026-01-01", "o": 9, "h": 10, "l": 8, "c": 9.5, "v": None},
        {"d": "bad", "o": "x", "h": 1, "l": 1, "c": 1},
        {"d": "bad-high", "o": 10, "h": 9, "l": 8, "c": 11},
        {"d": "bad-low", "o": 10, "h": 12, "l": 11, "c": 10},
    ], {"day": "d", "open": "o", "high": "h", "low": "l", "close": "c", "volume": "v"})
    assert [row["day"] for row in rows] == ["2026-01-01", "2026-02-01"]
    payload = providers._payload("600519", "1d", 3, rows, provider="fixture", adjustment="none")
    assert payload["quality_flags"] == ["partial_history", "unadjusted_prices"]
    assert payload["as_of"] == "2026-02-01"


@pytest.mark.asyncio
async def test_yahoo_and_market_data_loader_error_contracts(monkeypatch):
    service = object()
    bars = AsyncMock(return_value={"provider": "tencent,yahoo"})
    monkeypatch.setattr(providers, "InstrumentService", lambda _market: type("Instrument", (), {"bars": bars})())
    with pytest.raises(LoaderUnavailableError, match="Yahoo"):
        await providers.YahooLoader(service).load("usAAPL", "1d", 50)

    bars.side_effect = MarketError("market down")
    with pytest.raises(LoaderUnavailableError, match="market down"):
        await providers.MarketDataLoader(service).load("usAAPL", "1d", 50)


@pytest.mark.asyncio
@pytest.mark.parametrize("loader_class,name", [
    (providers.AkshareLoader, "AKShare"),
    (providers.TushareLoader, "Tushare"),
])
async def test_optional_loaders_map_import_failure_and_empty_rows(monkeypatch, loader_class, name):
    monkeypatch.setattr(providers.asyncio, "to_thread", AsyncMock(side_effect=RuntimeError("missing package")))
    with pytest.raises(LoaderUnavailableError, match=f"{name} 请求失败"):
        await loader_class().load("600519", "1d", 20)

    monkeypatch.setattr(providers.asyncio, "to_thread", AsyncMock(return_value=[]))
    with pytest.raises(LoaderUnavailableError, match="无K线数据"):
        await loader_class().load("600519", "1d", 20)


@pytest.mark.asyncio
async def test_optional_loaders_return_normalized_payloads(monkeypatch):
    ak_rows = [{"日期": "2026-08-29", "开盘": 10, "最高": 12, "最低": 9, "收盘": 11, "成交量": 100}]
    monkeypatch.setattr(providers.asyncio, "to_thread", AsyncMock(return_value=ak_rows))
    ak = await providers.AkshareLoader().load("600519", "1d", 2)
    assert ak["provider"] == "akshare" and ak["adjustment"] == "qfq"

    ts_rows = [{"trade_date": "20260829", "open": 10, "high": 12, "low": 9, "close": 11, "vol": 100}]
    monkeypatch.setattr(providers.asyncio, "to_thread", AsyncMock(return_value=ts_rows))
    ts = await providers.TushareLoader().load("600519", "1d", 2)
    assert ts["provider"] == "tushare" and ts["adjustment"] == "none"


def test_optional_loader_availability(monkeypatch):
    monkeypatch.setattr(providers.importlib.util, "find_spec", lambda name: object() if name in {"akshare", "tushare"} else None)
    monkeypatch.setenv("TUSHARE_TOKEN", "token")
    assert providers.AkshareLoader().is_available() is True
    assert providers.TushareLoader().is_available() is True
    monkeypatch.delenv("TUSHARE_TOKEN")
    assert providers.TushareLoader().is_available() is False
