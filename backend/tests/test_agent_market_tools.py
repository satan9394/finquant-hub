import pytest

from app.agent.tools_definitions import CalculateIndicators, GetStockData
from app.services.market_data import MarketDataService


@pytest.mark.asyncio
async def test_agent_stock_tool_supports_us_symbol(monkeypatch):
    async def quote(_service, ticker):
        assert ticker == "AAPL"
        return {"code": "usAAPL", "name": "Apple Inc.", "price": 200.0, "source": "yahoo"}

    monkeypatch.setattr(MarketDataService, "quote", quote)
    result = await GetStockData().run(ticker="AAPL")
    assert result.success
    assert result.data["code"] == "usAAPL"


@pytest.mark.asyncio
async def test_agent_indicator_tool_supports_hk_symbol(monkeypatch):
    async def kline(_service, ticker, period="1d", count=100):
        assert ticker == "00700"
        return [
            {
                "day": f"2026-01-{index + 1:02d}",
                "open": 400.0 + index,
                "high": 402.0 + index,
                "low": 399.0 + index,
                "close": 401.0 + index,
                "volume": 1_000_000 + index,
            }
            for index in range(30)
        ]

    monkeypatch.setattr(MarketDataService, "kline", kline)
    result = await CalculateIndicators().run(ticker="00700", indicators="rsi")
    assert result.success
    assert "rsi" in result.data["latest"]
