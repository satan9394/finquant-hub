import pytest

from app.services.market_data import MarketError
from app.tools import stock_screener
from app.agent.tools_definitions import ScreenStocks


class FakeMarket:
    async def kline(self, ticker, period="1d", count=60):
        if ticker == "BAD-KLINE":
            raise MarketError("kline unavailable")
        end = {"UP": 130, "DOWN": 80}.get(ticker, 110)
        return [
            {"close": 100, "volume": 100},
            {"close": end, "volume": 150},
        ]

    async def quote(self, ticker):
        if ticker == "BAD-QUOTE":
            raise MarketError("quote unavailable")
        pe, pb = {"UP": (10, 2), "DOWN": (50, 9)}.get(ticker, (20, 3))
        return {
            "code": ticker,
            "name": f"Name {ticker}",
            "price": 123,
            "change_percent": 1.5,
            "pe": pe,
            "pb": pb,
        }


@pytest.mark.asyncio
async def test_momentum_discovery_ranks_and_preserves_provider_errors():
    results, errors = await stock_screener.momentum_discovery(
        [{"ticker": "UP"}, {"ticker": "DOWN"}, {"ticker": "BAD-KLINE"}, {"ticker": " "}],
        FakeMarket(),
        min_return_20d=-100,
        min_return_60d=-100,
    )

    assert [item["ticker"] for item in results] == ["UP", "DOWN"]
    assert results[0]["return_60d_pct"] == 30
    assert errors == [{"ticker": "BAD-KLINE", "error": "kline unavailable"}]
    assert await stock_screener.momentum_discovery([], FakeMarket()) == ([], [])


@pytest.mark.asyncio
async def test_value_scoring_normalizes_weights_and_skips_quote_errors():
    candidates = [
        {"ticker": ticker, "return_20d_pct": value, "return_60d_pct": value, "close": 100}
        for ticker, value in (("UP", 30), ("DOWN", -20), ("BAD-QUOTE", 0))
    ]
    results, errors = await stock_screener.value_scoring(
        candidates,
        FakeMarket(),
        weights={key: 1 for key in stock_screener.VALUE_WEIGHTS},
    )

    assert [item["ticker"] for item in results] == ["UP", "DOWN"]
    assert results[0]["score"] > results[1]["score"]
    assert results[0]["signal"] == "动量偏强"
    assert results[1]["signal"] == "动量偏弱"
    assert errors == [{"ticker": "BAD-QUOTE", "error": "quote unavailable"}]

    with pytest.raises(ValueError, match="权重"):
        await stock_screener.value_scoring(candidates[:1], FakeMarket(), weights={key: 0 for key in stock_screener.VALUE_WEIGHTS})


@pytest.mark.asyncio
async def test_screen_runs_both_stages_and_builds_summary():
    result = await stock_screener.screen(
        [{"ticker": "UP"}, {"ticker": "BAD-KLINE"}],
        FakeMarket(),
    )

    assert result["summary"][0]["ticker"] == "UP"
    assert result["stage1"][0]["ticker"] == "UP"
    assert result["errors"] == [{"ticker": "BAD-KLINE", "error": "kline unavailable"}]


@pytest.mark.asyncio
async def test_agent_tool_reuses_one_service_and_closes_it(monkeypatch):
    market = FakeMarket()
    closed = False

    async def close():
        nonlocal closed
        closed = True

    market.aclose = close
    monkeypatch.setattr("app.agent.tools_definitions.MarketDataService", lambda: market)

    invalid = await ScreenStocks().run(tickers=[])
    result = await ScreenStocks().run(tickers=["UP"])

    assert invalid.success is False
    assert result.success is True
    assert result.data["summary"][0]["ticker"] == "UP"
    assert closed is True
