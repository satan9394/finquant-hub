"""Reproducible bootstrap, Monte Carlo, and walk-forward validation."""

import numpy as np


def _equity_returns(equity_values: list[float]) -> np.ndarray:
    equity = np.asarray(equity_values, dtype=float)
    if len(equity) < 3 or not np.isfinite(equity).all() or np.any(equity <= 0):
        raise ValueError("显著性验证需要至少 3 个有效正权益点")
    return np.diff(equity) / equity[:-1]


def _validate_sampling(samples: int, confidence: float) -> None:
    if not 100 <= samples <= 10_000:
        raise ValueError("samples 必须在 100 到 10000 之间")
    if not 0.8 <= confidence < 1:
        raise ValueError("confidence 必须在 0.8 到 1 之间")


def bootstrap_validation(
    equity_values: list[float],
    *,
    samples: int = 500,
    confidence: float = 0.95,
    block_size: int = 5,
    seed: int = 42,
) -> dict:
    """Moving-block bootstrap of compounded return to retain short autocorrelation."""
    _validate_sampling(samples, confidence)
    returns = _equity_returns(equity_values)
    block = min(len(returns), max(1, block_size))
    rng = np.random.default_rng(seed)
    simulated = np.empty(samples, dtype=float)
    max_start = len(returns) - block + 1
    blocks_needed = int(np.ceil(len(returns) / block))
    for sample in range(samples):
        starts = rng.integers(0, max_start, size=blocks_needed)
        path = np.concatenate([returns[start:start + block] for start in starts])[:len(returns)]
        simulated[sample] = np.prod(1.0 + path) - 1.0
    alpha = (1.0 - confidence) / 2.0
    observed = float(np.prod(1.0 + returns) - 1.0)
    return {
        "method": "moving_block_bootstrap",
        "samples": samples,
        "confidence": confidence,
        "block_size": block,
        "seed": seed,
        "observed_total_return": observed,
        "confidence_interval": [
            float(np.quantile(simulated, alpha)),
            float(np.quantile(simulated, 1.0 - alpha)),
        ],
        "probability_positive": float(np.mean(simulated > 0)),
    }


def monte_carlo_validation(
    equity_values: list[float],
    *,
    samples: int = 500,
    confidence: float = 0.95,
    bust_threshold: float = -0.20,
    seed: int = 43,
) -> dict:
    """Empirical-return Monte Carlo paths with terminal and drawdown distributions."""
    _validate_sampling(samples, confidence)
    returns = _equity_returns(equity_values)
    rng = np.random.default_rng(seed)
    paths = rng.choice(returns, size=(samples, len(returns)), replace=True)
    curves = np.cumprod(1.0 + paths, axis=1)
    curves = np.concatenate([np.ones((samples, 1)), curves], axis=1)
    terminal = curves[:, -1] - 1.0
    peaks = np.maximum.accumulate(curves, axis=1)
    max_drawdowns = np.min(curves / peaks - 1.0, axis=1)
    alpha = 1.0 - confidence
    return {
        "method": "empirical_return_monte_carlo",
        "samples": samples,
        "seed": seed,
        "terminal_return": {
            "p05": float(np.quantile(terminal, 0.05)),
            "median": float(np.median(terminal)),
            "p95": float(np.quantile(terminal, 0.95)),
        },
        "max_drawdown": {
            "worst_confidence_tail": float(np.quantile(max_drawdowns, alpha)),
            "median": float(np.median(max_drawdowns)),
        },
        "probability_loss": float(np.mean(terminal < 0)),
        "probability_bust": float(np.mean(terminal <= bust_threshold)),
        "bust_threshold": bust_threshold,
    }


def walk_forward_ma_validation(
    bars: list[dict],
    *,
    short_window: int,
    long_window: int,
    initial_capital: float,
    commission_bps: float,
    slippage_bps: float,
    symbol: str | None,
    period: str,
    market_rules: str,
    price_limit_ratio: float | None,
) -> dict:
    """Expanding-window stability check for the fixed, predeclared MA parameters."""
    from .ma_crossover import run_ma_crossover

    minimum_train = long_window + 2
    train_size = max(minimum_train, len(bars) // 2)
    remaining = len(bars) - train_size
    if remaining < 10:
        return {
            "status": "insufficient_data",
            "mode": "expanding_fixed_parameter",
            "minimum_required": train_size + 10,
            "actual": len(bars),
            "folds": [],
        }
    test_size = max(10, remaining // 3)
    folds = []
    train_end = train_size
    while train_end < len(bars):
        test_end = min(len(bars), train_end + test_size)
        result = run_ma_crossover(
            bars[:test_end],
            short_window=short_window,
            long_window=long_window,
            initial_capital=initial_capital,
            commission_bps=commission_bps,
            slippage_bps=slippage_bps,
            symbol=symbol,
            period=period,
            market_rules=market_rules,
            price_limit_ratio=price_limit_ratio,
        )
        curve = result["equity_curve"]
        start_value = float(curve[train_end - 1]["value"])
        end_value = float(curve[-1]["value"])
        folds.append({
            "train_end": str(bars[train_end - 1]["day"]),
            "test_from": str(bars[train_end]["day"]),
            "test_to": str(bars[test_end - 1]["day"]),
            "return": end_value / start_value - 1.0,
        })
        train_end = test_end
    returns = np.asarray([fold["return"] for fold in folds], dtype=float)
    return {
        "status": "ok",
        "mode": "expanding_fixed_parameter",
        "fold_count": len(folds),
        "positive_fold_ratio": float(np.mean(returns > 0)),
        "median_fold_return": float(np.median(returns)),
        "folds": folds,
    }


def validate_ma_strategy(
    bars: list[dict],
    result: dict,
    *,
    short_window: int,
    long_window: int,
    initial_capital: float,
    commission_bps: float,
    slippage_bps: float,
    symbol: str | None,
    period: str,
    market_rules: str,
    price_limit_ratio: float | None,
    samples: int = 500,
) -> dict:
    equity = [float(point["value"]) for point in result["equity_curve"]]
    return {
        "bootstrap": bootstrap_validation(equity, samples=samples),
        "monte_carlo": monte_carlo_validation(equity, samples=samples),
        "walk_forward": walk_forward_ma_validation(
            bars,
            short_window=short_window,
            long_window=long_window,
            initial_capital=initial_capital,
            commission_bps=commission_bps,
            slippage_bps=slippage_bps,
            symbol=symbol,
            period=period,
            market_rules=market_rules,
            price_limit_ratio=price_limit_ratio,
        ),
    }
