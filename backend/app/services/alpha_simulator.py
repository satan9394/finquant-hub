"""Small offline cross-sectional factor simulator with an explicit no-lookahead contract."""
from __future__ import annotations

import math
from collections import defaultdict
from collections.abc import Iterable, Mapping
from typing import Any

from ..backtest.metrics import calculate_performance


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

    values = [point["value"] for point in equity_curve]
    metrics = calculate_performance(values, [1.0] * len(values), periods_per_year)
    metrics.update(
        {
            "average_turnover": sum(turnovers) / len(turnovers),
            "positive_period_rate": sum(value > 0 for value in daily_returns) / len(daily_returns),
        }
    )
    return {"equity_curve": equity_curve, "period_returns": daily_returns, "metrics": metrics}
