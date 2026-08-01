"""Pure portfolio risk X-ray for normalized backtest curves."""

from collections.abc import Mapping

import numpy as np


def _returns(points: list[dict]) -> np.ndarray:
    values = np.asarray([point["value"] for point in points], dtype=float)
    if len(values) < 2 or not np.isfinite(values).all() or np.any(values <= 0):
        return np.asarray([], dtype=float)
    return np.diff(values) / values[:-1]


def _tail_risk(returns: np.ndarray, current_value: float, confidence: float) -> dict:
    if len(returns) < 20:
        return {
            "status": "insufficient_data",
            "observations": len(returns),
            "minimum_required": 20,
            "confidence": confidence,
            "var": None,
            "expected_shortfall": None,
            "var_amount": None,
            "expected_shortfall_amount": None,
        }
    threshold = float(np.quantile(returns, 1.0 - confidence))
    tail = returns[returns <= threshold]
    value_at_risk = max(0.0, -threshold)
    expected_shortfall = max(0.0, -float(np.mean(tail))) if len(tail) else value_at_risk
    return {
        "status": "ok",
        "observations": len(returns),
        "confidence": confidence,
        "method": "historical",
        "var": value_at_risk,
        "expected_shortfall": expected_shortfall,
        "var_amount": value_at_risk * current_value,
        "expected_shortfall_amount": expected_shortfall * current_value,
    }


def _diversification(asset_results: list[dict], weights: Mapping[str, float]) -> dict:
    if len(asset_results) < 2:
        return {"status": "insufficient_assets", "average_correlation": None, "benefit": None}
    periods = {asset.get("period") for asset in asset_results}
    if len(periods) != 1:
        return {"status": "unsupported_mixed_frequency", "average_correlation": None, "benefit": None}

    point_maps = {
        asset["asset_id"]: {point["time"]: float(point["value"]) for point in asset["equity_curve"]}
        for asset in asset_results
    }
    common_times = sorted(set.intersection(*(set(points) for points in point_maps.values())))
    if len(common_times) < 3:
        return {"status": "insufficient_overlap", "average_correlation": None, "benefit": None}
    matrices = []
    ordered_ids = []
    for asset_id, points in point_maps.items():
        values = np.asarray([points[time] for time in common_times], dtype=float)
        matrices.append(np.diff(values) / values[:-1])
        ordered_ids.append(asset_id)
    matrix = np.asarray(matrices, dtype=float)
    correlation = np.corrcoef(matrix)
    upper = correlation[np.triu_indices(len(matrix), k=1)]
    finite_upper = upper[np.isfinite(upper)]
    average_correlation = float(np.mean(finite_upper)) if len(finite_upper) else None
    asset_volatility = np.std(matrix, axis=1)
    weight_vector = np.asarray([weights[asset_id] for asset_id in ordered_ids], dtype=float)
    standalone = float(np.sum(weight_vector * asset_volatility))
    portfolio = float(np.std(weight_vector @ matrix))
    benefit = max(0.0, 1.0 - portfolio / standalone) if standalone > 0 else None
    return {
        "status": "ok" if average_correlation is not None else "constant_series",
        "observations": matrix.shape[1],
        "average_correlation": average_correlation,
        "benefit": benefit,
    }


def portfolio_risk_xray(
    asset_results: list[dict],
    weights: Mapping[str, float],
    equity_curve: list[dict],
    *,
    confidence: float = 0.95,
) -> dict:
    if not 0.8 <= confidence < 1:
        raise ValueError("confidence 必须在 0.8 到 1 之间")
    values = np.asarray([point["value"] for point in equity_curve], dtype=float)
    if len(values) < 2 or not np.isfinite(values).all() or np.any(values <= 0):
        raise ValueError("组合权益曲线必须包含至少 2 个有效正值")
    weight_values = np.asarray(list(weights.values()), dtype=float)
    if len(weight_values) == 0 or np.any(weight_values < 0) or not np.isclose(np.sum(weight_values), 1):
        raise ValueError("组合权重必须非负且合计为 1")

    hhi = float(np.sum(weight_values ** 2))
    top_weights = sorted((float(value) for value in weight_values), reverse=True)
    level = "high" if top_weights[0] > 0.5 or hhi > 0.35 else (
        "medium" if top_weights[0] > 0.3 or hhi > 0.2 else "low"
    )
    peaks = np.maximum.accumulate(values)
    drawdowns = values / peaks - 1.0
    returns = _returns(equity_curve)
    return {
        "concentration": {
            "hhi": hhi,
            "effective_asset_count": 1.0 / hhi,
            "largest_weight": top_weights[0],
            "top3_weight": sum(top_weights[:3]),
            "level": level,
        },
        "drawdown": {
            "max": float(np.min(drawdowns)),
            "current": float(drawdowns[-1]),
        },
        "tail_risk": _tail_risk(returns, float(values[-1]), confidence),
        "diversification": _diversification(asset_results, weights),
    }
