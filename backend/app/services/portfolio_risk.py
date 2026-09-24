"""Pure portfolio tear-sheet statistics over real, aligned daily prices."""

from __future__ import annotations

from datetime import date, datetime, timezone
from math import isfinite
from typing import Any, Mapping, Sequence

import numpy as np

_TRADING_DAYS_PER_YEAR = 252
_ROLLING_WINDOW = 60


def _day(value: Any) -> date | None:
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, (int, float)) and isfinite(float(value)):
        try:
            return datetime.fromtimestamp(float(value), tz=timezone.utc).date()
        except (OverflowError, OSError, ValueError):
            return None
    if isinstance(value, str):
        try:
            return date.fromisoformat(value[:10])
        except ValueError:
            return None
    return None


def _clean_prices(rows: Sequence[Mapping[str, Any]]) -> dict[date, float]:
    cleaned: dict[date, float] = {}
    for row in rows:
        raw_day = row.get("time")
        if raw_day is None:
            raw_day = row.get("date")
        if raw_day is None:
            raw_day = row.get("day")
        day = _day(raw_day)
        try:
            close = float(row.get("close"))
        except (TypeError, ValueError):
            continue
        if day is not None and isfinite(close) and close > 0:
            cleaned[day] = close
    return cleaned


def _empty_result(
    *,
    requested_symbols: list[str],
    available_symbols: list[str],
    missing_symbols: list[str],
    common_dates: list[date],
    reason: str,
) -> dict[str, Any]:
    return {
        "status": "insufficient",
        "reason": reason,
        "coverage": {
            "requested_assets": len(requested_symbols),
            "priced_assets": len(available_symbols),
            "available_symbols": available_symbols,
            "missing_symbols": missing_symbols,
            "source_metadata": {},
            "observation_count": max(0, len(common_dates) - 1),
            "history_start": common_dates[0].isoformat() if common_dates else None,
            "history_end": common_dates[-1].isoformat() if common_dates else None,
        },
        "metrics": {
            "max_drawdown": None,
            "max_drawdown_duration_days": None,
            "annualized_volatility": None,
            "calmar_ratio": None,
            "sortino_ratio": None,
            "concentration_hhi": None,
            "effective_asset_count": None,
            "largest_weight": None,
        },
        "underwater_series": [],
        "rolling_metrics": [],
        "monthly_matrix": [],
        "risk_contributions": [],
        "warnings": [reason],
    }


def unavailable_portfolio_risk(symbols: Sequence[str], reason: str) -> dict[str, Any]:
    """Return an explicit unknown-state response when no valid valuation basis exists."""
    normalized = sorted({str(symbol).strip().upper() for symbol in symbols if str(symbol).strip()})
    return _empty_result(
        requested_symbols=normalized,
        available_symbols=[],
        missing_symbols=normalized,
        common_dates=[],
        reason=reason,
    )


def analyze_portfolio_prices(
    price_history: Mapping[str, Sequence[Mapping[str, Any]]],
    shares_by_symbol: Mapping[str, float],
    *,
    rolling_window: int = _ROLLING_WINDOW,
) -> dict[str, Any]:
    """Reconstruct the current share quantities over common historical closes.

    The resulting curve is a fixed-share historical replay, not account NAV:
    legacy positions contain current shares and average cost but no trade ledger.
    """
    if rolling_window < 2:
        raise ValueError("rolling_window must be at least 2")

    shares: dict[str, float] = {}
    for raw_symbol, raw_shares in shares_by_symbol.items():
        symbol = str(raw_symbol).strip().upper()
        try:
            quantity = float(raw_shares)
        except (TypeError, ValueError):
            continue
        if symbol and isfinite(quantity) and quantity > 0:
            shares[symbol] = shares.get(symbol, 0.0) + quantity

    requested_symbols = sorted(shares)
    if not requested_symbols:
        return _empty_result(
            requested_symbols=[], available_symbols=[], missing_symbols=[], common_dates=[], reason="empty_portfolio",
        )

    source_metadata: dict[str, dict[str, list[str]]] = {}
    clean_by_symbol: dict[str, dict[date, float]] = {}
    for symbol in requested_symbols:
        rows = price_history.get(symbol, ())
        clean_by_symbol[symbol] = _clean_prices(rows)
        source_metadata[symbol] = {
            "sources": sorted({str(row["source"]) for row in rows if row.get("source")}),
            "adjustments": sorted({str(row["adjustment"]) for row in rows if row.get("adjustment")}),
        }
    available_symbols = [symbol for symbol in requested_symbols if clean_by_symbol[symbol]]
    missing_symbols = [symbol for symbol in requested_symbols if not clean_by_symbol[symbol]]
    if not available_symbols:
        return _empty_result(
            requested_symbols=requested_symbols,
            available_symbols=[],
            missing_symbols=missing_symbols,
            common_dates=[],
            reason="no_price_history",
        )

    common = set(clean_by_symbol[available_symbols[0]])
    for symbol in available_symbols[1:]:
        common.intersection_update(clean_by_symbol[symbol])
    common_dates = sorted(common)
    if len(common_dates) < 2:
        return _empty_result(
            requested_symbols=requested_symbols,
            available_symbols=available_symbols,
            missing_symbols=missing_symbols,
            common_dates=common_dates,
            reason="insufficient_common_price_dates",
        )

    symbols = available_symbols
    quantities = np.asarray([shares[symbol] for symbol in symbols], dtype=np.float64)
    prices = np.asarray(
        [[clean_by_symbol[symbol][day] for symbol in symbols] for day in common_dates],
        dtype=np.float64,
    )
    equity = prices @ quantities
    if not np.all(np.isfinite(equity)) or np.any(equity <= 0):
        return _empty_result(
            requested_symbols=requested_symbols,
            available_symbols=available_symbols,
            missing_symbols=missing_symbols,
            common_dates=common_dates,
            reason="invalid_portfolio_equity",
        )

    returns = np.diff(equity) / equity[:-1]
    asset_returns = np.diff(prices, axis=0) / prices[:-1]
    rolling: list[dict[str, Any]] = []
    for end in range(rolling_window, len(returns) + 1):
        window = returns[end - rolling_window:end]
        std = float(np.std(window, ddof=1))
        mean = float(np.mean(window))
        rolling.append({
            "time": common_dates[end].isoformat(),
            "sharpe": mean / std * np.sqrt(_TRADING_DAYS_PER_YEAR) if std > 0 else None,
            "volatility": std * np.sqrt(_TRADING_DAYS_PER_YEAR),
        })

    running_peak = np.maximum.accumulate(equity)
    drawdown = equity / running_peak - 1.0
    max_drawdown = float(np.min(drawdown))
    underwater = [
        {"time": day.isoformat(), "value": float(value)}
        for day, value in zip(common_dates, drawdown, strict=True)
    ]

    max_duration_days = 0
    peak_index = 0
    episode_peak_index: int | None = None
    for index in range(1, len(equity)):
        if equity[index] >= equity[peak_index]:
            if episode_peak_index is not None:
                max_duration_days = max(
                    max_duration_days,
                    (common_dates[index] - common_dates[episode_peak_index]).days,
                )
                episode_peak_index = None
            peak_index = index
        elif episode_peak_index is None:
            episode_peak_index = peak_index
    if episode_peak_index is not None:
        max_duration_days = max(
            max_duration_days,
            (common_dates[-1] - common_dates[episode_peak_index]).days,
        )

    annualized_volatility: float | None = None
    calmar_ratio: float | None = None
    sortino_ratio: float | None = None
    if len(returns) >= 2:
        daily_std = float(np.std(returns, ddof=1))
        annualized_volatility = daily_std * float(np.sqrt(_TRADING_DAYS_PER_YEAR))
        downside = np.minimum(returns, 0.0)
        downside_deviation = float(np.sqrt(np.mean(np.square(downside))))
        if downside_deviation > 0:
            sortino_ratio = float(np.mean(returns) / downside_deviation * np.sqrt(_TRADING_DAYS_PER_YEAR))
        total_growth = float(equity[-1] / equity[0])
        if max_drawdown < 0 and total_growth > 0:
            annualized_return = total_growth ** (_TRADING_DAYS_PER_YEAR / len(returns)) - 1.0
            calmar_ratio = annualized_return / abs(max_drawdown)

    month_returns: dict[tuple[int, int], list[float]] = {}
    for index, value in enumerate(returns, start=1):
        key = (common_dates[index].year, common_dates[index].month)
        month_returns.setdefault(key, []).append(float(value))
    years = sorted({year for year, _ in month_returns})
    monthly_matrix: list[dict[str, Any]] = []
    for year in years:
        month_values: list[float | None] = []
        for month in range(1, 13):
            daily_values = month_returns.get((year, month))
            month_values.append(
                float(np.prod(1.0 + np.asarray(daily_values)) - 1.0) if daily_values else None
            )
        observed_months = [value for value in month_values if value is not None]
        annual_total = float(np.prod(1.0 + np.asarray(observed_months)) - 1.0) if observed_months else None
        monthly_matrix.append({
            "year": year,
            "months": month_values,
            "annual_total": annual_total,
            "complete_year": len(observed_months) == 12,
        })

    latest_market_values = prices[-1] * quantities
    total_market_value = float(np.sum(latest_market_values))
    weights = latest_market_values / total_market_value
    concentration_hhi = float(weights @ weights)
    effective_asset_count = 1.0 / concentration_hhi if concentration_hhi > 0 else None

    covariance = np.atleast_2d(np.cov(asset_returns, rowvar=False, ddof=1)) if len(returns) >= 2 else None
    total_variance = float(weights @ covariance @ weights) if covariance is not None else 0.0
    if covariance is not None and total_variance > 0:
        contributions = weights * (covariance @ weights) / total_variance
    else:
        contributions = np.full(len(symbols), np.nan)
    risk_contributions = []
    for index, symbol in enumerate(symbols):
        asset_volatility = (
            float(np.sqrt(max(float(covariance[index, index]), 0.0)) * np.sqrt(_TRADING_DAYS_PER_YEAR))
            if covariance is not None else None
        )
        contribution = float(contributions[index]) if isfinite(float(contributions[index])) else None
        risk_contributions.append({
            "symbol": symbol,
            "weight": float(weights[index]),
            "annualized_volatility": asset_volatility,
            "risk_contribution": contribution,
        })

    warnings: list[str] = []
    if missing_symbols:
        warnings.append("missing_price_history")
    if len(returns) < rolling_window:
        warnings.append("rolling_window_unavailable")
    if len(returns) < 2:
        warnings.append("insufficient_return_observations")
    adjustment_bases = {
        tuple(source_metadata[symbol]["adjustments"])
        for symbol in symbols
        if source_metadata[symbol]["adjustments"]
    }
    if len(adjustment_bases) > 1:
        warnings.append("mixed_adjustment_basis")
    status = "ok" if not warnings else "partial"

    return {
        "status": status,
        "reason": None,
        "as_of": common_dates[-1].isoformat(),
        "coverage": {
            "requested_assets": len(requested_symbols),
            "priced_assets": len(available_symbols),
            "available_symbols": available_symbols,
            "missing_symbols": missing_symbols,
            "source_metadata": {symbol: source_metadata[symbol] for symbol in available_symbols},
            "observation_count": len(returns),
            "history_start": common_dates[0].isoformat(),
            "history_end": common_dates[-1].isoformat(),
        },
        "metrics": {
            "max_drawdown": max_drawdown,
            "max_drawdown_duration_days": max_duration_days,
            "annualized_volatility": annualized_volatility,
            "calmar_ratio": calmar_ratio,
            "sortino_ratio": sortino_ratio,
            "concentration_hhi": concentration_hhi,
            "effective_asset_count": effective_asset_count,
            "largest_weight": float(np.max(weights)) if len(weights) else None,
        },
        "underwater_series": underwater,
        "rolling_metrics": rolling,
        "monthly_matrix": monthly_matrix,
        "risk_contributions": risk_contributions,
        "warnings": warnings,
    }
