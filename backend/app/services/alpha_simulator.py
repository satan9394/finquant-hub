"""Small offline cross-sectional factor simulator with an explicit no-lookahead contract."""
from __future__ import annotations

import math
from collections import defaultdict
from collections.abc import Iterable, Mapping
from typing import Any, cast

from ..backtest.metrics import calculate_performance


_MIN_IC_ASSETS = 5
_MIN_IC_PERIODS = 5
_MIN_PERFORMANCE_DAYS = 20


def _correlation(left: list[float], right: list[float]) -> float | None:
    left_mean = sum(left) / len(left)
    right_mean = sum(right) / len(right)
    left_centered = [value - left_mean for value in left]
    right_centered = [value - right_mean for value in right]
    denominator = math.sqrt(
        sum(value * value for value in left_centered)
        * sum(value * value for value in right_centered)
    )
    if denominator <= 1e-15:
        return None
    return sum(a * b for a, b in zip(left_centered, right_centered, strict=True)) / denominator


def _ranks(values: list[float]) -> list[float]:
    ranks = [0.0] * len(values)
    ordered = sorted(enumerate(values), key=lambda item: (item[1], item[0]))
    start = 0
    while start < len(ordered):
        end = start + 1
        while end < len(ordered) and ordered[end][1] == ordered[start][1]:
            end += 1
        average_rank = (start + 1 + end) / 2
        for index in range(start, end):
            ranks[ordered[index][0]] = average_rank
        start = end
    return ranks


def _factor_analysis(grouped: Mapping[str, list[tuple[str, float, float]]]) -> dict[str, Any]:
    periods: list[dict[str, Any]] = []
    excluded: list[dict[str, Any]] = []
    for date in sorted(grouped):
        rows = grouped[date]
        if len(rows) < _MIN_IC_ASSETS:
            excluded.append({"date": date, "assets": len(rows), "reason": "insufficient_cross_section"})
            continue
        factors = [factor for _, factor, _ in rows]
        forward_returns = [forward_return for _, _, forward_return in rows]
        ic = _correlation(factors, forward_returns)
        rank_ic = _correlation(_ranks(factors), _ranks(forward_returns))
        if ic is None or rank_ic is None:
            excluded.append({"date": date, "assets": len(rows), "reason": "zero_variance"})
            continue
        periods.append({"date": date, "assets": len(rows), "ic": ic, "rank_ic": rank_ic})

    rank_ics = [float(period["rank_ic"]) for period in periods]
    ics = [float(period["ic"]) for period in periods]
    mean_rank_ic = sum(rank_ics) / len(rank_ics) if rank_ics else None
    mean_ic = sum(ics) / len(ics) if ics else None
    rank_ic_std = None
    icir = None
    if len(rank_ics) > 1 and mean_rank_ic is not None:
        rank_ic_std = math.sqrt(
            sum((value - mean_rank_ic) ** 2 for value in rank_ics) / (len(rank_ics) - 1)
        )
        if rank_ic_std > 1e-15:
            icir = mean_rank_ic / rank_ic_std

    if not periods and all(len(rows) < _MIN_IC_ASSETS for rows in grouped.values()):
        status = "insufficient_cross_section"
    elif len(periods) < _MIN_IC_PERIODS:
        status = "insufficient_periods"
    else:
        status = "ok"
    return {
        "status": status,
        "method": "cross_sectional_pearson_and_spearman",
        "total_periods": len(grouped),
        "valid_periods": len(periods),
        "minimum_assets_per_period": _MIN_IC_ASSETS,
        "minimum_valid_periods": _MIN_IC_PERIODS,
        "mean_ic": mean_ic,
        "mean_rank_ic": mean_rank_ic,
        "rank_ic_std": rank_ic_std,
        "icir": icir,
        "excluded_periods": excluded,
        "periods": periods,
    }


def _drawdown_summary(points: list[Mapping[str, Any]]) -> dict[str, Any]:
    """Compute the maximum drawdown and its peak/trough/recovery dates.

    The running peak may be the initial capital anchor (``date == "start"``);
    such an anchor has no trading date, so the peak date is reported as
    ``None``. A curve that never declines reports a ``0.0`` drawdown with no
    dates. Out-of-contract inputs (empty, non-positive or non-finite values)
    return ``None`` drawdown rather than fabricating a number.
    """
    summary = {
        "max_drawdown": None,
        "max_drawdown_peak_date": None,
        "max_drawdown_trough_date": None,
        "max_drawdown_recovery_date": None,
    }
    if not points:
        return summary
    values = [float(cast(Any, point["value"])) for point in points]
    if not all(math.isfinite(value) and value > 0 for value in values):
        return summary
    running_peak = 0.0
    drawdowns: list[float] = []
    for value in values:
        running_peak = max(running_peak, value)
        drawdowns.append(value / running_peak - 1.0)
    max_drawdown = min(drawdowns)
    if max_drawdown >= -1e-15:
        summary["max_drawdown"] = 0.0
        return summary
    trough_index = drawdowns.index(max_drawdown)
    peak_value = max(values[: trough_index + 1])
    peak_index = max(
        index
        for index, value in enumerate(values[: trough_index + 1])
        if value == peak_value
    )
    recovery_index = next(
        (
            index
            for index, value in enumerate(values[trough_index + 1 :], start=trough_index + 1)
            if value >= peak_value
        ),
        None,
    )
    summary["max_drawdown"] = max_drawdown
    summary["max_drawdown_peak_date"] = points[peak_index]["date"] if peak_index > 0 else None
    summary["max_drawdown_trough_date"] = points[trough_index]["date"]
    if recovery_index is not None:
        summary["max_drawdown_recovery_date"] = points[recovery_index]["date"]
    return summary


def summarize_performance(
    equity_curve: Iterable[Mapping[str, Any]],
    daily_returns: Iterable[float],
    turnovers: Iterable[float],
    periods_per_year: int,
) -> dict[str, Any]:
    """Summarize a long/short simulation into a compact performance overview.

    Pure function with zero I/O: inputs are consumed read-only and no global
    state is touched. ``equity_curve`` is a list of ``{"date", "value"}``
    points (the initial point may use the sentinel date ``"start"``).

    Statistics:
    - ``annualized_return``: geometric return compounded at
      ``periods_per_year`` over the observed sample days.
    - ``annualized_volatility``: sample standard deviation of daily returns
      (``ddof=1``) scaled by ``sqrt(periods_per_year)``.
    - ``sharpe_ratio``: zero risk-free rate, annualized exactly like the
      volatility; ``None`` when the volatility denominator is zero.
    - ``max_drawdown``: deepest peak-to-trough decline of the equity curve with
      its peak/trough/recovery dates (recovery is ``None`` when not yet
      recovered within the sample; the peak date is ``None`` when the peak is
      the initial capital anchor).
    - ``average_turnover``: mean of the observed turnover rates.
    - ``sample_days`` / ``start_date`` / ``end_date``: observed sample size and
      traded date range.

    Honest degradation: with fewer than ``_MIN_PERFORMANCE_DAYS`` sample days
    the summary returns ``status == "insufficient"`` and every annualized or
    risk-adjusted statistic is ``None``; only observed level statistics
    (sample days, dates, average turnover, maximum drawdown) are reported.
    Empty inputs likewise yield ``status == "insufficient"`` with ``None``
    metrics — nothing is fabricated.
    """
    points = list(equity_curve)
    returns = [float(value) for value in daily_returns]
    turnover_values = [float(value) for value in turnovers]
    sample_days = len(returns)
    status = "ok" if sample_days >= _MIN_PERFORMANCE_DAYS else "insufficient"

    traded_points = [
        point for point in points if str(point.get("date", "")).strip() != "start"
    ]
    summary: dict[str, Any] = {
        "status": status,
        "sample_days": sample_days,
        "start_date": traded_points[0]["date"] if traded_points else None,
        "end_date": traded_points[-1]["date"] if traded_points else None,
        "annualized_return": None,
        "annualized_volatility": None,
        "sharpe_ratio": None,
        "max_drawdown": None,
        "max_drawdown_peak_date": None,
        "max_drawdown_trough_date": None,
        "max_drawdown_recovery_date": None,
        "average_turnover": None,
    }
    if turnover_values:
        summary["average_turnover"] = sum(turnover_values) / len(turnover_values)
    summary.update(_drawdown_summary(points))
    if status == "insufficient" or periods_per_year <= 0:
        return summary

    values = [float(cast(Any, point["value"])) for point in points]
    if values and values[0] > 0 and values[-1] > 0:
        summary["annualized_return"] = (
            (values[-1] / values[0]) ** (periods_per_year / sample_days) - 1.0
        )
    if sample_days >= 2:
        mean_return = sum(returns) / len(returns)
        variance = sum((value - mean_return) ** 2 for value in returns) / (len(returns) - 1)
        volatility = math.sqrt(variance) if variance >= 0 else None
        if volatility is not None:
            summary["annualized_volatility"] = volatility * math.sqrt(periods_per_year)
        if volatility is not None and volatility > 1e-12:
            summary["sharpe_ratio"] = mean_return / volatility * math.sqrt(periods_per_year)
    return summary


def simulate_factor(
    observations: Iterable[Mapping[str, Any]],
    *,
    quantile: float = 0.2,
    periods_per_year: int = 252,
) -> dict[str, Any]:
    """Simulate equal-weight long/short portfolios using supplied next-period returns.

    Each row must contain ``date``, ``symbol``, ``factor`` and ``forward_return``.
    Requiring a forward-return field makes the temporal contract visible to callers.
    """
    if not 0 < quantile <= 0.5:
        raise ValueError("quantile 必须在 (0, 0.5] 范围内")

    grouped: dict[str, list[tuple[str, float, float]]] = defaultdict(list)
    seen: set[tuple[str, str]] = set()
    for row in observations:
        date = str(row.get("date", "")).strip()
        symbol = str(row.get("symbol", "")).strip()
        try:
            factor = float(row["factor"])
            forward_return = float(row["forward_return"])
        except (KeyError, TypeError, ValueError) as exc:
            raise ValueError("每条记录都需要有效的 factor 与 forward_return") from exc
        if not date or not symbol or not math.isfinite(factor) or not math.isfinite(forward_return):
            raise ValueError("date、symbol 与数值字段必须有效")
        key = (date, symbol)
        if key in seen:
            raise ValueError(f"重复记录: {date}/{symbol}")
        seen.add(key)
        grouped[date].append((symbol, factor, forward_return))

    if not grouped:
        raise ValueError("至少需要一个交易日的记录")

    equity = 1.0
    equity_curve = [{"date": "start", "value": equity}]
    daily_returns: list[float] = []
    turnovers: list[float] = []
    previous_weights: dict[str, float] = {}
    for date in sorted(grouped):
        rows = sorted(grouped[date], key=lambda item: (item[1], item[0]))
        if len(rows) < 2:
            raise ValueError(f"{date} 至少需要两个标的")
        basket_size = min(max(1, math.ceil(len(rows) * quantile)), len(rows) // 2)
        shorts = rows[:basket_size]
        longs = rows[-basket_size:]
        side_weight = 0.5 / basket_size
        weights = {symbol: -side_weight for symbol, _, _ in shorts}
        weights.update({symbol: side_weight for symbol, _, _ in longs})
        returns = {symbol: value for symbol, _, value in rows}
        period_return = sum(weight * returns[symbol] for symbol, weight in weights.items())
        turnover = 0.5 * sum(
            abs(weights.get(symbol, 0.0) - previous_weights.get(symbol, 0.0))
            for symbol in weights.keys() | previous_weights.keys()
        )
        equity *= 1 + period_return
        if equity <= 0:
            raise ValueError("组合净值降至零或以下，无法继续模拟")
        daily_returns.append(period_return)
        turnovers.append(turnover)
        equity_curve.append({"date": date, "value": equity})
        previous_weights = weights

    values = [float(cast(Any, point["value"])) for point in equity_curve]
    metrics = calculate_performance(values, [1.0] * len(values), periods_per_year)
    metrics.update(
        {
            "average_turnover": sum(turnovers) / len(turnovers),
            "positive_period_rate": sum(value > 0 for value in daily_returns) / len(daily_returns),
        }
    )
    return {
        "equity_curve": equity_curve,
        "period_returns": daily_returns,
        "metrics": metrics,
        "factor_analysis": _factor_analysis(grouped),
        "performance": summarize_performance(equity_curve, daily_returns, turnovers, periods_per_year),
    }
