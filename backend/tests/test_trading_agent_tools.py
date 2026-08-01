import pytest

from app.agent import tools_definitions
from app.agent.tools_definitions import (
    AnalyzePortfolioRisk,
    AnalyzeShadowTrades,
    AssessTradingConnector,
    RunBacktest,
)


def _curve(values):
    return [{"time": f"2026-01-{index + 1:02d}", "value": value} for index, value in enumerate(values)]


@pytest.mark.asyncio
async def test_shadow_tool_attributes_buy_and_sell_slippage_without_execution():
    result = await AnalyzeShadowTrades().run(trades=[
        {"symbol": "600519", "side": "buy", "planned_price": 100, "executed_price": 101, "quantity": 10},
        {"symbol": "600519", "side": "sell", "planned_price": 110, "executed_price": 109, "quantity": 10, "realized_pnl": 80},
    ])
    assert result.success
    assert result.data["total_adverse_slippage_amount"] == 20
    assert result.data["scope"] == "analysis_only_no_order_submission"


@pytest.mark.asyncio
async def test_connector_tool_is_design_only_and_never_accesses_credentials():
    result = await AssessTradingConnector().run(
        broker="example", requested_capabilities=["positions", "orders", "orders"]
    )
    assert result.success
    assert result.data["implementation_status"] == "design_only"
    assert result.data["network_calls"] is False
    assert result.data["order_submission"] == "not_implemented"


@pytest.mark.asyncio
async def test_risk_tool_reuses_portfolio_risk_xray():
    curve = _curve([100 + index % 4 for index in range(25)])
    result = await AnalyzePortfolioRisk().run(
        assets=[{"asset_id": "A", "period": "1d", "equity_curve": curve}],
        weights={"A": 1.0},
        equity_curve=curve,
    )
    assert result.success
    assert result.data["concentration"]["largest_weight"] == 1.0


@pytest.mark.asyncio
async def test_backtest_tool_returns_compact_result(monkeypatch):
    bars = [{
        "day": f"2026-{index // 28 + 1:02d}-{index % 28 + 1:02d}",
        "open": 100 + index % 12,
        "high": 101 + index % 12,
        "low": 99 + index % 12,
        "close": 100 + index % 12,
        "volume": 1000,
        "source": "fixture",
    } for index in range(80)]

    async def kline(self, ticker, period, count):
        return bars

    monkeypatch.setattr(tools_definitions.MarketDataService, "kline", kline)
    result = await RunBacktest().run(ticker="AAPL", short_window=3, long_window=8, count=80)
    assert result.success
    assert set(result.data) == {
        "ticker", "metrics", "execution_rules", "rejected_orders", "validation", "warnings", "provenance"
    }
    assert result.data["provenance"]["providers"] == ["fixture"]
