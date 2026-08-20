"""Small offline cross-sectional factor simulator with an explicit no-lookahead contract."""
from __future__ import annotations

import math
from collections import defaultdict
from collections.abc import Iterable, Mapping
from typing import Any, cast

from ..backtest.metrics import calculate_performance


_MIN_IC_ASSETS = 5
_MIN_IC_PERIODS = 5


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
    }
