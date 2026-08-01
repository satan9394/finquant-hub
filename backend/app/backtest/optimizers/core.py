"""Dependency-light long-only portfolio optimizers."""
from __future__ import annotations

from collections.abc import Mapping, Sequence

import numpy as np


SUPPORTED_OPTIMIZERS = (
    "equal_weight",
    "risk_parity",
    "mean_variance",
    "inverse_volatility",
)


def _equal_weights(size: int) -> np.ndarray:
    return np.full(size, 1.0 / size, dtype=float)


def _return_matrix(
    closes_by_asset: Mapping[str, Sequence[float]],
    asset_ids: list[str],
) -> np.ndarray | None:
    series: list[np.ndarray] = []
    for asset_id in asset_ids:
        closes = np.asarray(closes_by_asset[asset_id], dtype=float)
        if len(closes) < 3 or not np.isfinite(closes).all() or np.any(closes <= 0):
            return None
        series.append(np.diff(closes) / closes[:-1])
    length = min(map(len, series))
    if length < 2:
        return None
    return np.column_stack([returns[-length:] for returns in series])


def _regularized_covariance(returns: np.ndarray) -> np.ndarray | None:
    covariance = np.atleast_2d(np.cov(returns, rowvar=False, ddof=1)).astype(float)
    if not np.isfinite(covariance).all():
        return None
    variances = np.diag(covariance)
    if np.any(variances <= 1e-16):
        return None
    ridge = max(float(np.trace(covariance)) / len(variances) * 1e-8, 1e-12)
    return covariance + np.eye(len(variances)) * ridge


def _inverse_volatility(covariance: np.ndarray) -> np.ndarray:
    inverse = 1.0 / np.sqrt(np.diag(covariance))
    return inverse / inverse.sum()


def _risk_parity(covariance: np.ndarray) -> np.ndarray:
    """Equalize covariance risk contributions with coordinate descent."""
    size = covariance.shape[0]
    budgets = np.full(size, 1.0 / size)
    weights = _inverse_volatility(covariance)
    for _ in range(500):
        previous = weights.copy()
        for index in range(size):
            variance = covariance[index, index]
            cross = float(covariance[index] @ weights - variance * weights[index])
            discriminant = cross * cross + 4.0 * variance * budgets[index]
            weights[index] = (-cross + np.sqrt(max(discriminant, 0.0))) / (2.0 * variance)
        if np.max(np.abs(weights - previous)) < 1e-10:
            break
    total = float(weights.sum())
    return weights / total if np.isfinite(total) and total > 1e-12 else _equal_weights(size)


def _mean_variance(returns: np.ndarray, covariance: np.ndarray) -> np.ndarray:
    """Approximate a long-only max-Sharpe portfolio on the unit simplex."""
    expected = np.mean(returns, axis=0)
    raw = np.linalg.pinv(covariance) @ expected
    raw = np.clip(raw, 0.0, None)
    total = float(raw.sum())
    if not np.isfinite(total) or total <= 1e-12:
        # All estimated excess returns can be non-positive. In that regime a
        # stable minimum-variance allocation is safer than fabricated alpha.
        raw = np.clip(np.linalg.pinv(covariance) @ np.ones(len(expected)), 0.0, None)
        total = float(raw.sum())
    return raw / total if np.isfinite(total) and total > 1e-12 else _equal_weights(len(expected))


def optimize_weights(
    closes_by_asset: Mapping[str, Sequence[float]],
    method: str = "equal_weight",
) -> dict[str, float]:
    """Return deterministic long-only weights on the unit simplex."""
    asset_ids = list(closes_by_asset)
    if not asset_ids:
        raise ValueError("至少需要一个资产才能计算权重")
    if method not in SUPPORTED_OPTIMIZERS:
        raise ValueError(f"未知优化器：{method}，支持 {SUPPORTED_OPTIMIZERS}")

    weights = _equal_weights(len(asset_ids))
    if method != "equal_weight":
        returns = _return_matrix(closes_by_asset, asset_ids)
        covariance = _regularized_covariance(returns) if returns is not None else None
        if covariance is not None:
            if method == "risk_parity":
                weights = _risk_parity(covariance)
            elif method == "mean_variance":
                weights = _mean_variance(returns, covariance)
            else:  # Backward-compatible alias retained for saved API payloads.
                weights = _inverse_volatility(covariance)

    rounded = [round(float(weight), 8) for weight in weights]
    rounded[-1] = round(1.0 - sum(rounded[:-1]), 8)
    return dict(zip(asset_ids, rounded, strict=True))
