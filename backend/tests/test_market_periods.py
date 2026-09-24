from datetime import datetime
from types import SimpleNamespace
from zoneinfo import ZoneInfo

import httpx
import pytest
from fastapi import HTTPException
from starlette.requests import Request

from app.routers.market import kline
from app.services.market_data import (
    MarketDataService,
    _aggregate_period_bars,
    _minute_timestamp,
    normalize_kline_period,
)


def _daily_rows():
    return [
        {"day": "2026-01-02", "open": 100, "high": 105, "low": 99, "close": 104, "volume": 10, "source": "sina"},
        {"day": "2026-01-05", "open": 104, "high": 108, "low": 102, "close": 107, "volume": 20, "source": "sina"},
        {"day": "2026-01-30", "open": 107, "high": 110, "low": 106, "close": 109, "volume": 30, "source": "sina"},
        {"day": "2026-02-02", "open": 109, "high": 112, "low": 108, "close": 111, "volume": 40, "source": "sina"},
    ]


def test_period_aliases_and_calendar_aggregation_keep_real_ohlcv():
    assert [normalize_kline_period(value) for value in ("day", "week", "month", "60m", "15m", "1wk")] == [
        "1d", "1wk", "1mo", "60m", "15m", "1wk",
    ]
    rows = _daily_rows()

    weeks = _aggregate_period_bars(rows, "1wk", 2)
    assert weeks == [
        {"day": "2026-01-26", "open": 107.0, "high": 110.0, "low": 106.0, "close": 109.0, "volume": 30, "source": "sina"},
        {"day": "2026-02-02", "open": 109.0, "high": 112.0, "low": 108.0, "close": 111.0, "volume": 40, "source": "sina"},
    ]
    months = _aggregate_period_bars(rows, "1mo", 2)
    assert months[0] == {
        "day": "2026-01-01", "open": 100.0, "high": 110.0, "low": 99.0, "close": 109.0, "volume": 60, "source": "sina",
    }
    assert months[1]["day"] == "2026-02-01"
    assert months[1]["close"] == 111.0


def test_minute_timestamps_use_market_local_timezone():
    timestamp = _minute_timestamp("2026-09-23 09:30", "sh600519")
    expected = int(datetime(2026, 9, 23, 9, 30, tzinfo=ZoneInfo("Asia/Shanghai")).timestamp())
    assert timestamp == expected


@pytest.mark.asyncio
async def test_weekly_market_data_aggregates_daily_source_and_returns_cache_copies(monkeypatch):
    service = MarketDataService(http=httpx.AsyncClient(transport=httpx.MockTransport(lambda request: httpx.Response(500))))
    service.kline_priority = ("sina",)
    calls = []

    async def read_daily(code, scale, count):
        calls.append((code, scale, count))
        return _daily_rows()

    monkeypatch.setattr(service, "_kline_sina", read_daily)
    try:
        first = await service.kline("600519", "week", 2)
        first[0]["close"] = -1
        second = await service.kline("600519", "week", 2)
        assert second[0]["close"] == 109.0
        assert calls == [("sh600519", 240, 10)]
    finally:
        await service.aclose()


@pytest.mark.asyncio
async def test_kline_api_accepts_symbol_and_legacy_ticker():
    calls = []

    class FakeMarket:
        async def kline(self, ticker, period, count):
            calls.append((ticker, period, count))
            return [{"day": "2026-09-23", "open": 1, "high": 2, "low": 1, "close": 2, "volume": 3}]

    app = SimpleNamespace(state=SimpleNamespace(market=FakeMarket()))
    request = Request({"type": "http", "app": app, "headers": []})

    by_symbol = await kline(request, symbol="600519", ticker=None, period="week", count=100)
    by_ticker = await kline(request, symbol=None, ticker="600519", period="1wk", count=25)
    assert by_symbol["items"][0]["close"] == 2
    assert by_ticker["items"][0]["close"] == 2
    assert calls == [("600519", "week", 100), ("600519", "1wk", 25)]
    with pytest.raises(HTTPException) as error:
        await kline(request, symbol="600519", ticker="000001", period="day", count=100)
    assert error.value.status_code == 400
