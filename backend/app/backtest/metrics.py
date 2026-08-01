"""Shared, null-safe performance metrics for every backtest path."""
from __future__ import annotations

import math
from collections.abc import Sequence

import numpy as np


def calculate_performance(
    equity_values: Sequence[float],
    benchmark_values: Sequence[float],
    periods_per_year: int | None,
) -> dict[str, float | None]:
    equity = np.asarray(equity_values, dtype=float)
    benchmark = np.asarray(benchmark_values, dtype=float)
    if len(equity) == 0 or len(equity) != len(benchmark):
        raise ValueError("权益曲线与基准曲线必须非空且等长")
    if not np.isfinite(equity).all() or not np.isfinite(benchmark).all():
        raise ValueError("权益曲线与基准曲线必须是有限数值")
    if np.any(equity <= 0) or np.any(benchmark <= 0):
        raise ValueError("权益曲线与基准曲线必须大于 0")

    total_return = float(equity[-1] / equity[0] - 1.0)
    benchmark_return = float(benchmark[-1] / benchmark[0] - 1.0)
    running_peak = np.maximum.accumulate(equity)
    max_drawdown = float(np.min(equity / running_peak - 1.0))
    returns = np.diff(equity) / equity[:-1]
    benchmark_returns = np.diff(benchmark) / benchmark[:-1]

    annualized_return: float | None = None
    sharpe_ratio: float | None = None
    sortino_ratio: float | None = None
    calmar_ratio: float | None = None
    information_ratio: float | None = None
    if periods_per_year is not None and periods_per_year > 0 and len(returns) > 0:
        annualized_return = float((equity[-1] / equity[0]) ** (periods_per_year / len(returns)) - 1.0)
        if len(returns) > 1:
            volatility = float(np.std(returns, ddof=1))
            if volatility > 1e-12:
                sharpe_ratio = float(np.mean(returns) / volatility * math.sqrt(periods_per_year))
            downside_deviation = float(np.sqrt(np.mean(np.minimum(returns, 0.0) ** 2)))
            if downside_deviation > 1e-12:
                sortino_ratio = float(
                    np.mean(returns) / downside_deviation * math.sqrt(periods_per_year)
                )
            active_returns = returns - benchmark_returns
            tracking_error = float(np.std(active_returns, ddof=1))
            if tracking_error > 1e-12:
                information_ratio = float(
                    np.mean(active_returns) / tracking_error * math.sqrt(periods_per_year)
                )
        if abs(max_drawdown) > 1e-12:
            calmar_ratio = annualized_return / abs(max_drawdown)

    return {
        "total_return": total_return,
        "annualized_return": annualized_return,
        "benchmark_return": benchmark_return,
        "excess_return": total_return - benchmark_return,
        "max_drawdown": max_drawdown,
        "sharpe_ratio": sharpe_ratio,
        "sortino_ratio": sortino_ratio,
        "calmar_ratio": calmar_ratio,
        "information_ratio": information_ratio,
    }


def calculate_trade_metrics(pnls: Sequence[float]) -> dict[str, float | int | None]:
    finite = [float(pnl) for pnl in pnls if math.isfinite(float(pnl))]
    wins = [pnl for pnl in finite if pnl > 0]
    losses = [pnl for pnl in finite if pnl < 0]
    return {
        "trade_count": len(finite),
        "win_rate": len(wins) / len(finite) if finite else None,
        "profit_factor": sum(wins) / abs(sum(losses)) if losses else None,
    }
