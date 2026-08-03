"""Out-of-sample multi-asset, multi-period MA-crossover backtests."""
from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from .ma_crossover import run_ma_crossover
from .metrics import calculate_performance, calculate_trade_metrics
from .optimizers import optimize_weights
from .risk import portfolio_risk_xray


PERIODS_PER_YEAR = {
    "1d": 252,
    "60m": 252 * 6,
    "30m": 252 * 13,
    "15m": 252 * 26,
    "5m": 252 * 78,
}
JSONDict = dict[str, Any]


def _combine_curves(
    results: Mapping[str, JSONDict],
    weights: Mapping[str, float],
    initial_capital: float,
    curve_name: str,
) -> list[JSONDict]:
    series = {
        asset_id: {point["time"]: float(point["value"]) / (initial_capital * weights[asset_id])
                   for point in result[curve_name]}
        for asset_id, result in results.items()
    }
    times = sorted({time for points in series.values() for time in points})
    latest = {asset_id: 1.0 for asset_id in series}
    combined: list[JSONDict] = []
    for time in times:
        for asset_id, points in series.items():
            if time in points:
                latest[asset_id] = points[time]
        value = initial_capital * sum(weights[asset_id] * latest[asset_id] for asset_id in series)
        combined.append({"time": time, "value": round(float(value), 6)})
    return combined


def _portfolio_metrics(
    equity_curve: list[JSONDict],
    benchmark_curve: list[JSONDict],
    initial_capital: float,
    periods: set[str],
    results: Mapping[str, JSONDict],
) -> JSONDict:
    del initial_capital
    periods_per_year = PERIODS_PER_YEAR[next(iter(periods))] if len(periods) == 1 else None
    performance = calculate_performance(
        [point["value"] for point in equity_curve],
        [point["value"] for point in benchmark_curve],
        periods_per_year,
    )
    trade_metrics = calculate_trade_metrics([
        trade["pnl"]
        for result in results.values()
        for trade in result["trades"]
    ])
    return {
        **{
            key: round(value, 8) if value is not None else None
            for key, value in performance.items()
        },
        "win_rate": round(float(trade_metrics["win_rate"]), 8)
        if trade_metrics["win_rate"] is not None else None,
        "profit_factor": round(float(trade_metrics["profit_factor"]), 8)
        if trade_metrics["profit_factor"] is not None else None,
        "trade_count": trade_metrics["trade_count"],
    }


def run_portfolio_backtest(
    assets: list[JSONDict],
    *,
    optimizer: str,
    optimization_lookback: int,
    initial_capital: float,
    commission_bps: float,
    slippage_bps: float,
) -> JSONDict:
    """Calibrate weights first, then run each strategy out of sample."""
    closes_by_asset: dict[str, list[float]] = {}
    for asset in assets:
        bars = asset["bars"]
        required = optimization_lookback + asset["long_window"] + 2
        if len(bars) < required:
            raise ValueError(
                f"{asset['asset_id']} K线不足：权重校准和回测至少需要 {required} 条，实际 {len(bars)} 条"
            )
        closes_by_asset[asset["asset_id"]] = [
            float(bar["close"]) for bar in bars[:optimization_lookback]
        ]

    weights = optimize_weights(closes_by_asset, optimizer)
    results: dict[str, JSONDict] = {}
    asset_results: list[JSONDict] = []
    for asset in assets:
        asset_id = asset["asset_id"]
        result = run_ma_crossover(
            asset["bars"][optimization_lookback:],
            short_window=asset["short_window"],
            long_window=asset["long_window"],
            initial_capital=initial_capital * weights[asset_id],
            commission_bps=commission_bps,
            slippage_bps=slippage_bps,
            symbol=asset["symbol"],
            period=asset["period"],
            market_rules=asset.get("market_rules", "auto"),
            price_limit_ratio=asset.get("price_limit_ratio"),
        )
        results[asset_id] = result
        asset_results.append({
            "asset_id": asset_id,
            "symbol": asset["symbol"],
            "period": asset["period"],
            "weight": weights[asset_id],
            "provenance": asset["provenance"],
            **result,
        })

    equity_curve = _combine_curves(results, weights, initial_capital, "equity_curve")
    benchmark_curve = _combine_curves(results, weights, initial_capital, "benchmark_curve")
    metrics = _portfolio_metrics(
        equity_curve,
        benchmark_curve,
        initial_capital,
        {asset["period"] for asset in assets},
        results,
    )
    warnings = ["weights_calibrated_before_backtest_window"]
    currencies = {asset["provenance"].get("currency") for asset in assets}
    periods = {asset["period"] for asset in assets}
    if len(currencies) > 1:
        warnings.append("cross_currency_returns_normalized_without_fx")
    if len(periods) > 1:
        warnings.append("mixed_period_annualized_metrics_unavailable")

    risk_xray = portfolio_risk_xray(asset_results, weights, equity_curve)

    return {
        "strategy": "ma_crossover",
        "optimizer": optimizer,
        "optimization_lookback": optimization_lookback,
        "weights": weights,
        "metrics": metrics,
        "equity_curve": equity_curve,
        "benchmark_curve": benchmark_curve,
        "assets": asset_results,
        "risk_xray": risk_xray,
        "warnings": warnings,
    }
