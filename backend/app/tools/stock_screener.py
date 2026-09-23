"""Two-stage stock screening backed by the shared market data service."""

from __future__ import annotations

from typing import Any

from ..services.market_data import MarketDataService, MarketError


VALUE_WEIGHTS = {
    "pe_score": 0.25,
    "pb_score": 0.20,
    "roe_score": 0.25,
    "growth_score": 0.20,
    "dividend_score": 0.10,
}


def _period_return(closes: list[float], periods: int) -> float:
    start = closes[-periods] if len(closes) >= periods else closes[0]
    return (closes[-1] - start) / start * 100 if start else 0.0


async def momentum_discovery(
    candidates: list[dict[str, Any]] | None,
    market: MarketDataService,
    min_return_20d: float = -5.0,
    min_return_60d: float = -10.0,
    max_results: int = 50,
) -> tuple[list[dict[str, Any]], list[dict[str, str]]]:
    """Rank user-supplied symbols by 20/60-day momentum and volume trend."""
    if not candidates:
        return [], []

    scored: list[dict[str, Any]] = []
    errors: list[dict[str, str]] = []
    for item in candidates:
        ticker = str(item.get("ticker", "")).strip()
        if not ticker:
            continue
        try:
            bars = await market.kline(ticker, count=60)
            closes = [float(bar["close"]) for bar in bars]
            if not closes:
                raise ValueError("无可用 K 线")
            volumes = [float(bar.get("volume", 0)) for bar in bars]
        except (MarketError, ValueError, KeyError, TypeError) as exc:
            errors.append({"ticker": ticker, "error": str(exc)})
            continue

        return_20d = _period_return(closes, 20)
        return_60d = _period_return(closes, 60)
        if return_20d < min_return_20d or return_60d < min_return_60d:
            continue
        volume_ma5 = sum(volumes[-5:]) / max(len(volumes[-5:]), 1)
        volume_ma20 = sum(volumes[-20:]) / max(len(volumes[-20:]), 1)
        volume_ratio = volume_ma5 / max(volume_ma20, 1)
        momentum_score = (return_20d * 0.5 + return_60d * 0.3) * (1.2 if volume_ratio > 1.2 else 1)
        scored.append(
            {
                "ticker": ticker,
                "name": item.get("name", ""),
                "return_20d_pct": round(return_20d, 2),
                "return_60d_pct": round(return_60d, 2),
                "volume_ratio": round(volume_ratio, 2),
                "momentum_score": round(momentum_score, 2),
                "close": closes[-1],
            }
        )

    scored.sort(key=lambda row: -row["momentum_score"])
    return scored[:max_results], errors


def _valuation_scores(pe: float, pb: float) -> tuple[float, float, float, float, list[str]]:
    reasons: list[str] = []
    if 0 < pe <= 5:
        pe_score, pe_reason = 80.0, "PE 极低"
    elif pe <= 15 and pe > 0:
        pe_score, pe_reason = 90.0, "PE 偏低"
    elif pe <= 25 and pe > 0:
        pe_score, pe_reason = 85.0, "PE 合理"
    elif pe <= 40 and pe > 0:
        pe_score, pe_reason = 60.0, "PE 偏高"
    elif pe > 40:
        pe_score, pe_reason = 30.0, "PE 过高"
    else:
        pe_score, pe_reason = 20.0, "PE 不可用"
    reasons.append(pe_reason)

    if 0 < pb <= 1:
        pb_score, pb_reason = 80.0, "PB 破净"
    elif pb <= 3 and pb > 0:
        pb_score, pb_reason = 85.0, "PB 合理"
    elif pb <= 8 and pb > 0:
        pb_score, pb_reason = 60.0, "PB 偏高"
    elif pb > 8:
        pb_score, pb_reason = 30.0, "PB 过高"
    else:
        pb_score, pb_reason = 20.0, "PB 不可用"
    reasons.append(pb_reason)

    roe = pb / pe * 100 if pe > 0 and pb > 0 else 0.0
    roe_score = 95.0 if roe > 30 else 85.0 if roe > 20 else 65.0 if roe > 10 else 45.0 if roe > 5 else 30.0
    return pe_score, pb_score, roe, roe_score, reasons


async def value_scoring(
    candidates: list[dict[str, Any]],
    market: MarketDataService,
    weights: dict[str, float] | None = None,
) -> tuple[list[dict[str, Any]], list[dict[str, str]]]:
    """Score momentum candidates using quote valuation and quality fields."""
    selected = weights or VALUE_WEIGHTS
    total = sum(selected.values())
    if total <= 0:
        raise ValueError("评分权重之和必须大于 0")
    selected = {key: value / total for key, value in selected.items()}
    results: list[dict[str, Any]] = []
    errors: list[dict[str, str]] = []
    for item in candidates:
        ticker = str(item["ticker"])
        try:
            quote = await market.quote(ticker)
        except (MarketError, ValueError) as exc:
            errors.append({"ticker": ticker, "error": str(exc)})
            continue
        pe = float(quote.get("pe") or 0)
        pb = float(quote.get("pb") or 0)
        pe_score, pb_score, roe, roe_score, reasons = _valuation_scores(pe, pb)
        growth_score = max(0.0, min(100.0, item["return_20d_pct"] * 2 + item["return_60d_pct"]))
        dividend_score = 50.0
        score = (
            pe_score * selected["pe_score"]
            + pb_score * selected["pb_score"]
            + roe_score * selected["roe_score"]
            + growth_score * selected["growth_score"]
            + dividend_score * selected["dividend_score"]
        )
        return_60d = float(item["return_60d_pct"])
        results.append(
            {
                **item,
                "ticker": quote.get("code") or ticker,
                "name": quote.get("name") or item.get("name", ""),
                "price": float(quote.get("price") or item["close"]),
                "change_percent": float(quote.get("change_percent") or 0),
                "pe": pe,
                "pb": pb,
                "roe": round(roe, 2),
                "score": round(score, 1),
                "signal": "动量偏强" if return_60d > 5 else "动量偏弱" if return_60d < -5 else "区间震荡",
                "reasons": reasons,
            }
        )
    results.sort(key=lambda row: -row["score"])
    return results, errors


async def screen(
    candidates: list[dict[str, Any]] | None,
    market: MarketDataService,
    *,
    momentum_min_return_20d: float = -5.0,
    momentum_min_return_60d: float = -10.0,
    value_weights: dict[str, float] | None = None,
    max_results: int = 20,
) -> dict[str, Any]:
    """Run momentum discovery followed by valuation scoring."""
    stage1, stage1_errors = await momentum_discovery(
        candidates,
        market,
        min_return_20d=momentum_min_return_20d,
        min_return_60d=momentum_min_return_60d,
        max_results=max_results,
    )
    stage2, stage2_errors = await value_scoring(stage1, market, weights=value_weights)
    return {
        "stage1": stage1,
        "stage2": stage2,
        "summary": stage2[:10],
        "errors": stage1_errors + stage2_errors,
    }
