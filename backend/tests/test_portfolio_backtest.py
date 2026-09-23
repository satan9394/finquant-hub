from __future__ import annotations

import pytest

from app.backtest.loaders import (
    BaseLoader,
    LoaderRegistry,
    default_loader_registry,
    registered_loader_types,
)
from app.services.market_data import MarketDataService
from app.backtest.optimizers import optimize_weights
from app.backtest.portfolio import run_portfolio_backtest


class FakeLoader(BaseLoader):
    name = "fake"
    markets = frozenset({"US", "HK"})

    async def load(self, symbol: str, period: str, count: int) -> dict:
        return {"symbol": symbol, "period": period, "count": count}


def make_bars(count: int, volatility: float = 1.0) -> list[dict]:
    closes = [100 + (index % 12) * volatility for index in range(count)]
    return [
        {
            "day": f"2026-01-{index + 1:03d}",
            "open": close,
            "high": close + 1,
            "low": close - 1,
            "close": close,
            "volume": 1000,
        }
        for index, close in enumerate(closes)
    ]


@pytest.mark.asyncio
async def test_loader_registry_routes_markets_and_periods():
    registry = LoaderRegistry()
    loader = FakeLoader()
    registry.register(loader)

    assert registry.resolve("AAPL") is loader
    assert registry.resolve("0700.HK") is loader
    assert await registry.load("AAPL", "60m", 120) == {
        "symbol": "AAPL", "period": "60m", "count": 120,
    }
    with pytest.raises(ValueError, match="不支持的周期"):
        await registry.load("AAPL", "1w", 120)
    with pytest.raises(ValueError, match="没有可用"):
        registry.resolve("600519")
    with pytest.raises(ValueError, match="已注册"):
        registry.register(loader)


def test_builtin_loader_decorator_registers_optional_sources():
    names = {loader_type.name for loader_type in registered_loader_types()}
    assert {"akshare", "tushare", "yahoo", "market_data"} <= names


def test_default_loader_registry_prefers_yahoo_and_keeps_cn_fallback():
    market = MarketDataService()
    registry = default_loader_registry(market)
    try:
        assert registry.resolve("AAPL", "1d").name == "yahoo"
        assert registry.resolve("600519", "60m").name == "market_data"
    finally:
        import asyncio

        asyncio.run(market.aclose())


def test_inverse_volatility_prefers_lower_risk_and_is_normalized():
    low_risk = [100, 101, 100.5, 101.2, 101.0, 101.5]
    high_risk = [100, 110, 95, 115, 90, 120]

    weights = optimize_weights({"low": low_risk, "high": high_risk}, "inverse_volatility")

    assert weights["low"] > weights["high"]
    assert sum(weights.values()) == pytest.approx(1.0)
    assert optimize_weights({"low": [100, 100, 100], "high": high_risk}) == {
        "low": 0.5, "high": 0.5,
    }
    with pytest.raises(ValueError, match="未知优化器"):
        optimize_weights({"low": low_risk}, "future_optimizer")


def test_risk_parity_equalizes_risk_contributions():
    low_risk = [100, 101, 100, 101, 100, 101, 100, 101]
    high_risk = [100, 104, 100, 104, 100, 104, 100, 104]

    weights = optimize_weights({"low": low_risk, "high": high_risk}, "risk_parity")

    assert weights["low"] > weights["high"]
    assert sum(weights.values()) == pytest.approx(1.0)


def test_mean_variance_is_long_only_and_normalized():
    steady_growth = [100, 101, 102, 103, 104, 105, 106, 107]
    noisy_flat = [100, 104, 97, 103, 98, 102, 99, 100]

    weights = optimize_weights(
        {"steady_growth": steady_growth, "noisy_flat": noisy_flat},
        "mean_variance",
    )

    assert weights["steady_growth"] > weights["noisy_flat"]
    assert all(weight >= 0 for weight in weights.values())
    assert sum(weights.values()) == pytest.approx(1.0)


def test_portfolio_backtest_supports_multiple_assets_and_periods():
    assets = [
        {
            "asset_id": "AAPL@60m", "symbol": "AAPL", "period": "60m",
            "short_window": 3, "long_window": 8, "bars": make_bars(90, 0.4),
            "provenance": {"currency": "USD", "provider": "fake"},
        },
        {
            "asset_id": "0700.HK@1d", "symbol": "0700.HK", "period": "1d",
            "short_window": 3, "long_window": 8, "bars": make_bars(90, 1.5),
            "provenance": {"currency": "HKD", "provider": "fake"},
        },
    ]

    result = run_portfolio_backtest(
        assets,
        optimizer="inverse_volatility",
        optimization_lookback=20,
        initial_capital=100_000,
        commission_bps=3,
        slippage_bps=2,
    )

    assert len(result["assets"]) == 2
    assert sum(result["weights"].values()) == pytest.approx(1.0)
    assert result["weights"]["AAPL@60m"] > result["weights"]["0700.HK@1d"]
    assert result["equity_curve"]
    assert result["metrics"]["annualized_return"] is None
    assert "cross_currency_returns_normalized_without_fx" in result["warnings"]
    assert "mixed_period_annualized_metrics_unavailable" in result["warnings"]
    assert result["risk_xray"]["concentration"]["effective_asset_count"] > 1
    assert result["risk_xray"]["diversification"]["status"] == "unsupported_mixed_frequency"
    assert result["metrics"]["turnover"] == pytest.approx(sum(
        asset["weight"] * asset["metrics"]["turnover"] for asset in result["assets"]
    ))
    assert isinstance(result["metrics"]["trade_count"], int)


def test_portfolio_backtest_rejects_missing_out_of_sample_history():
    asset = {
        "asset_id": "AAPL@1d", "symbol": "AAPL", "period": "1d",
        "short_window": 3, "long_window": 8, "bars": make_bars(29),
        "provenance": {"currency": "USD"},
    }
    with pytest.raises(ValueError, match="K线不足"):
        run_portfolio_backtest(
            [asset], optimizer="equal_weight", optimization_lookback=20,
            initial_capital=100_000, commission_bps=0, slippage_bps=0,
        )


def test_portfolio_backtest_supports_zero_weight_assets_from_mean_variance():
    assets = [
        {
            "asset_id": "steady@1d", "symbol": "STEADY", "period": "1d",
            "short_window": 3, "long_window": 8, "bars": make_bars(90, 0.4),
            "provenance": {"currency": "USD", "provider": "fake"},
        },
        {
            "asset_id": "volatile@1d", "symbol": "VOLATILE", "period": "1d",
            "short_window": 3, "long_window": 8, "bars": make_bars(90, 1.5),
            "provenance": {"currency": "USD", "provider": "fake"},
        },
    ]

    result = run_portfolio_backtest(
        assets, optimizer="mean_variance", optimization_lookback=20,
        initial_capital=100_000, commission_bps=3, slippage_bps=2,
    )

    assert 0.0 in result["weights"].values()
    assert result["equity_curve"]
    assert result["metrics"]["turnover"] >= 0
    assert "zero_weight_assets_excluded_from_portfolio_metrics" in result["warnings"]
