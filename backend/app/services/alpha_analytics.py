"""Vectorized cross-sectional factor analytics for explicitly supplied observations."""
from __future__ import annotations

import math
from collections import defaultdict
from collections.abc import Iterable, Mapping
from datetime import date
from typing import Any

import numpy as np


_MIN_PERIODS = 20
_MIN_ASSETS_PER_PERIOD = 5
_QUANTILES = 5
_EPSILON = 1e-15


def _average_ranks(values: np.ndarray) -> np.ndarray:
    """Return stable, one-based average ranks so ties receive equal ranks."""
    order = np.argsort(values, kind="stable")
    ordered = values[order]
    boundaries = np.r_[0, np.flatnonzero(ordered[1:] != ordered[:-1]) + 1, len(values)]
    ranks = np.empty(len(values), dtype=np.float64)
    for start, end in zip(boundaries[:-1], boundaries[1:], strict=True):
        ranks[order[start:end]] = (start + 1 + end) / 2
    return ranks


def _correlation(left: np.ndarray, right: np.ndarray) -> float | None:
    left_scale = float(np.max(np.abs(left)))
    right_scale = float(np.max(np.abs(right)))
    if left_scale == 0.0 or right_scale == 0.0:
        return None
    left_centered = left / left_scale
    right_centered = right / right_scale
    left_centered = left_centered - np.mean(left_centered)
    right_centered = right_centered - np.mean(right_centered)
    left_norm = float(np.linalg.norm(left_centered))
    right_norm = float(np.linalg.norm(right_centered))
    if left_norm == 0.0 or right_norm == 0.0:
        return None
    correlation = float(np.dot(left_centered / left_norm, right_centered / right_norm))
    return float(np.clip(correlation, -1.0, 1.0))


def _parse_observations(
    observations: Iterable[Mapping[str, Any]],
) -> dict[str, list[tuple[str, float, float]]]:
    grouped: dict[str, list[tuple[str, float, float]]] = defaultdict(list)
    seen: set[tuple[str, str]] = set()
    for row in observations:
        raw_date = str(row.get("date", "")).strip()
        symbol = str(row.get("symbol", "")).strip().upper()
        try:
            parsed_date = date.fromisoformat(raw_date)
            factor = float(row["factor"])
            forward_return = float(row["forward_return"])
        except (KeyError, TypeError, ValueError) as exc:
            raise ValueError("每条记录需要有效的 YYYY-MM-DD、symbol、factor 与 forward_return") from exc
        if parsed_date.isoformat() != raw_date or not symbol or not math.isfinite(factor) or not math.isfinite(forward_return):
            raise ValueError("日期必须为 YYYY-MM-DD；symbol 与数值字段必须有效且有限")
        if forward_return < -1:
            raise ValueError("forward_return 不得低于 -100%")
        key = (raw_date, symbol)
        if key in seen:
            raise ValueError(f"重复记录: {raw_date}/{symbol}")
        seen.add(key)
        grouped[raw_date].append((symbol, factor, forward_return))
    return grouped


def analyze_factor_observations(
    observations: Iterable[Mapping[str, Any]],
    *,
    min_periods: int = _MIN_PERIODS,
    min_assets_per_period: int = _MIN_ASSETS_PER_PERIOD,
) -> dict[str, Any]:
    """Calculate IC, Rank IC, five quantile curves and long-short turnover.

    Each observation must carry a caller-supplied factor value and its aligned
    next-period simple return. No market observations or factor values are
    generated here. Only dates with a usable cross-section and all five
    non-empty quantiles enter the returned series. Descriptive summary metrics
    remain null until the configured minimum number of valid dates is met.
    Factor autocorrelation is the mean Spearman correlation of factor ranks
    across consecutive usable dates, aligned on symbols present in both dates;
    excluded dates break that sequence.
    """
    if min_periods < 1 or min_assets_per_period < _QUANTILES:
        raise ValueError("min_periods 必须为正数，min_assets_per_period 至少为 5")
    grouped = _parse_observations(observations)
    total_periods = len(grouped)

    dates: list[str] = []
    ic_values: list[float] = []
    rank_ic_values: list[float] = []
    factor_autocorrelations: list[float] = []
    quantile_period_returns: list[list[float]] = [[] for _ in range(_QUANTILES)]
    turnovers: list[float] = []
    excluded_periods: list[dict[str, Any]] = []
    previous_weights: dict[str, float] = {}
    previous_factors: dict[str, float] | None = None

    for period_date in sorted(grouped):
        rows = grouped[period_date]
        if len(rows) < min_assets_per_period:
            excluded_periods.append({"date": period_date, "assets": len(rows), "reason": "insufficient_cross_section"})
            previous_factors = None
            continue

        symbols = np.asarray([row[0] for row in rows], dtype=object)
        factor_values = np.asarray([row[1] for row in rows], dtype=np.float64)
        forward_returns = np.asarray([row[2] for row in rows], dtype=np.float64)
        if np.all(factor_values == factor_values[0]) or np.all(forward_returns == forward_returns[0]):
            excluded_periods.append({"date": period_date, "assets": len(rows), "reason": "zero_variance"})
            previous_factors = None
            continue

        ic = _correlation(factor_values, forward_returns)
        factor_ranks = _average_ranks(factor_values)
        return_ranks = _average_ranks(forward_returns)
        rank_ic = _correlation(factor_ranks, return_ranks)
        if ic is None or rank_ic is None:
            excluded_periods.append({"date": period_date, "assets": len(rows), "reason": "zero_variance"})
            previous_factors = None
            continue

        quantile_indices = np.floor((factor_ranks - 1) * _QUANTILES / len(rows)).astype(np.int64)
        quantile_indices = np.clip(quantile_indices, 0, _QUANTILES - 1)
        counts = np.bincount(quantile_indices, minlength=_QUANTILES)
        if np.any(counts == 0):
            excluded_periods.append({"date": period_date, "assets": len(rows), "reason": "empty_quantile"})
            previous_factors = None
            continue

        current_factors = {str(symbol): float(value) for symbol, value in zip(symbols, factor_values, strict=True)}
        if previous_factors is not None:
            shared_symbols = sorted(previous_factors.keys() & current_factors.keys())
            if len(shared_symbols) >= min_assets_per_period:
                prior_ranks = _average_ranks(np.asarray([previous_factors[symbol] for symbol in shared_symbols]))
                current_ranks = _average_ranks(np.asarray([current_factors[symbol] for symbol in shared_symbols]))
                factor_autocorrelation = _correlation(prior_ranks, current_ranks)
                if factor_autocorrelation is not None:
                    factor_autocorrelations.append(factor_autocorrelation)
        previous_factors = current_factors

        current_weights: dict[str, float] = {}
        for quantile_index in range(_QUANTILES):
            members = quantile_indices == quantile_index
            quantile_period_returns[quantile_index].append(float(np.mean(forward_returns[members])))
        short_symbols = symbols[quantile_indices == 0]
        long_symbols = symbols[quantile_indices == _QUANTILES - 1]
        current_weights.update({str(symbol): -0.5 / len(short_symbols) for symbol in short_symbols})
        current_weights.update({str(symbol): 0.5 / len(long_symbols) for symbol in long_symbols})
        turnover = 0.5 * sum(
            abs(current_weights.get(symbol, 0.0) - previous_weights.get(symbol, 0.0))
            for symbol in current_weights.keys() | previous_weights.keys()
        )
        previous_weights = current_weights
        dates.append(period_date)
        ic_values.append(ic)
        rank_ic_values.append(rank_ic)
        turnovers.append(turnover)

    valid_periods = len(dates)
    sufficient = valid_periods >= min_periods
    ic_array = np.asarray(ic_values, dtype=np.float64)
    rank_ic_array = np.asarray(rank_ic_values, dtype=np.float64)
    summary: dict[str, float | None] = {
        "ic_mean": None,
        "ic_std": None,
        "ic_ir": None,
        "t_stat": None,
        "monotonicity_score": None,
        "mean_long_short_turnover": None,
        "factor_autocorrelation": None,
    }

    daily_cumulative: list[np.ndarray] = [
        np.cumprod(1.0 + np.asarray(period_returns, dtype=np.float64))
        for period_returns in quantile_period_returns
    ]
    if sufficient:
        ic_mean = float(np.mean(ic_array))
        rank_ic_mean = float(np.mean(rank_ic_array))
        ic_std = float(np.std(ic_array, ddof=1)) if valid_periods > 1 else 0.0
        rank_ic_std = float(np.std(rank_ic_array, ddof=1)) if valid_periods > 1 else 0.0
        mean_quantile_returns = np.asarray([np.mean(values) for values in quantile_period_returns], dtype=np.float64)
        monotonicity = _correlation(_average_ranks(mean_quantile_returns), np.arange(1, _QUANTILES + 1, dtype=np.float64))
        summary = {
            "ic_mean": ic_mean,
            "ic_std": ic_std,
            "ic_ir": rank_ic_mean / rank_ic_std if rank_ic_std > _EPSILON else None,
            "t_stat": ic_mean / (ic_std / math.sqrt(valid_periods)) if ic_std > _EPSILON else None,
            "monotonicity_score": monotonicity,
            "mean_long_short_turnover": float(np.mean(turnovers)) if turnovers else None,
            "factor_autocorrelation": float(np.mean(factor_autocorrelations)) if factor_autocorrelations else None,
        }

    quantile_curves = {
        f"q{index + 1}": cumulative.astype(float).tolist()
        for index, cumulative in enumerate(daily_cumulative)
    }
    quantile_curves["long_short"] = (daily_cumulative[-1] - daily_cumulative[0]).astype(float).tolist()
    return {
        "status": "ok" if sufficient else "insufficient",
        "method": "cross_sectional_pearson_spearman_equal_weight_five_quantiles",
        "minimum_valid_periods": min_periods,
        "minimum_assets_per_period": min_assets_per_period,
        "total_periods": total_periods,
        "valid_periods": valid_periods,
        "summary": summary,
        "ic_series": [
            {"date": period_date, "ic": ic, "rank_ic": rank_ic}
            for period_date, ic, rank_ic in zip(dates, ic_values, rank_ic_values, strict=True)
        ],
        "quantile_returns": {"dates": dates, **quantile_curves},
        "excluded_periods": excluded_periods,
    }
