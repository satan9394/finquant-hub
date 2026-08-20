"""Shared, null-safe performance metrics for every backtest path."""
from __future__ import annotations

import math
from collections.abc import Sequence

import numpy as np


def calculate_performance(
    equity_values: Sequence[float],
    benchmark_values: Sequence[float],
    periods_per_year: int | None,
) -> dict[str, float | int | bool | None]:
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
    (
        max_drawdown_duration_periods,
        max_drawdown_recovery_periods,
        max_drawdown_recovered,
    ) = _drawdown_timing(equity, running_peak, max_drawdown)

    annualized_return: float | None = None
    annualized_volatility: float | None = None
    annualized_downside_volatility: float | None = None
    sharpe_ratio: float | None = None
    sortino_ratio: float | None = None
    calmar_ratio: float | None = None
    information_ratio: float | None = None
    tracking_error: float | None = None
    beta: float | None = None
    alpha: float | None = None
    r_squared: float | None = None
    if periods_per_year is not None and periods_per_year > 0 and len(returns) > 0:
        annualized_return = float((equity[-1] / equity[0]) ** (periods_per_year / len(returns)) - 1.0)
        if len(returns) > 1:
            volatility = float(np.std(returns, ddof=1))
            annualized_volatility = volatility * math.sqrt(periods_per_year)
            if volatility > 1e-12:
                sharpe_ratio = float(np.mean(returns) / volatility * math.sqrt(periods_per_year))
            downside_deviation = float(np.sqrt(np.mean(np.minimum(returns, 0.0) ** 2)))
            annualized_downside_volatility = downside_deviation * math.sqrt(periods_per_year)
            if downside_deviation > 1e-12:
                sortino_ratio = float(
                    np.mean(returns) / downside_deviation * math.sqrt(periods_per_year)
                )
            active_returns = returns - benchmark_returns
            tracking_error = float(np.std(active_returns, ddof=1) * math.sqrt(periods_per_year))
            if tracking_error > 1e-12:
                information_ratio = float(
                    np.mean(active_returns) / np.std(active_returns, ddof=1)
                    * math.sqrt(periods_per_year)
                )
            benchmark_variance = float(np.var(benchmark_returns, ddof=1))
            if benchmark_variance > 1e-12:
                beta = float(np.cov(returns, benchmark_returns, ddof=1)[0, 1] / benchmark_variance)
                alpha = float(
                    (np.mean(returns) - beta * np.mean(benchmark_returns)) * periods_per_year
                )
                strategy_variance = float(np.var(returns, ddof=1))
                if strategy_variance > 1e-12:
                    correlation = float(np.corrcoef(returns, benchmark_returns)[0, 1])
                    r_squared = correlation ** 2
        if abs(max_drawdown) > 1e-12:
            calmar_ratio = annualized_return / abs(max_drawdown)

    return {
        "total_return": total_return,
        "annualized_return": annualized_return,
        "annualized_volatility": annualized_volatility,
        "annualized_downside_volatility": annualized_downside_volatility,
        "benchmark_return": benchmark_return,
        "excess_return": total_return - benchmark_return,
        "max_drawdown": max_drawdown,
        "max_drawdown_duration_periods": max_drawdown_duration_periods,
        "max_drawdown_recovery_periods": max_drawdown_recovery_periods,
        "max_drawdown_recovered": max_drawdown_recovered,
        "sharpe_ratio": sharpe_ratio,
        "sortino_ratio": sortino_ratio,
        "calmar_ratio": calmar_ratio,
        "information_ratio": information_ratio,
        "tracking_error": tracking_error,
        "beta": beta,
        "alpha": alpha,
        "r_squared": r_squared,
    }


def _drawdown_timing(
    equity: np.ndarray,
    running_peak: np.ndarray,
    max_drawdown: float,
) -> tuple[int, int | None, bool]:
    if max_drawdown >= -1e-12:
        return 0, 0, True

    drawdown = equity / running_peak - 1.0
    trough_index = int(np.argmin(drawdown))
    peak_value = float(running_peak[trough_index])
    peak_indices = np.flatnonzero(np.isclose(equity[:trough_index + 1], peak_value))
    peak_index = int(peak_indices[-1])
    recovery_indices = np.flatnonzero(equity[trough_index + 1:] >= peak_value)
    if len(recovery_indices) == 0:
        return len(equity) - 1 - peak_index, None, False

    recovery_index = trough_index + 1 + int(recovery_indices[0])
    return recovery_index - peak_index, recovery_index - trough_index, True


def calculate_trade_metrics(pnls: Sequence[float]) -> dict[str, float | int | None]:
    finite = [float(pnl) for pnl in pnls if math.isfinite(float(pnl))]
    wins = [pnl for pnl in finite if pnl > 0]
    losses = [pnl for pnl in finite if pnl < 0]
    return {
        "trade_count": len(finite),
        "win_rate": len(wins) / len(finite) if finite else None,
        "profit_factor": sum(wins) / abs(sum(losses)) if losses else None,
    }


def calculate_trade_quality(
    returns: Sequence[float],
    holding_periods: Sequence[int],
) -> dict[str, float | None]:
    if len(returns) != len(holding_periods):
        raise ValueError("交易收益与持有期必须等长")
    pairs = [
        (float(value), int(periods))
        for value, periods in zip(returns, holding_periods, strict=True)
        if math.isfinite(float(value)) and int(periods) >= 0
    ]
    wins = [value for value, _ in pairs if value > 0]
    losses = [value for value, _ in pairs if value < 0]
    return {
        "trade_expectancy": sum(value for value, _ in pairs) / len(pairs) if pairs else None,
        "average_win": sum(wins) / len(wins) if wins else None,
        "average_loss": sum(losses) / len(losses) if losses else None,
        "average_holding_periods": (
            sum(periods for _, periods in pairs) / len(pairs) if pairs else None
        ),
    }
