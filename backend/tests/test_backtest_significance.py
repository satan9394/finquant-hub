import pytest

from app.backtest.ma_crossover import run_ma_crossover
from app.backtest.significance import (
    bootstrap_validation,
    monte_carlo_validation,
    validate_ma_strategy,
    walk_forward_ma_validation,
)


def _bars(count: int) -> list[dict]:
    closes = [100 + (index % 16) * 0.8 for index in range(count)]
    return [
        {
            "day": f"2026-{index // 28 + 1:02d}-{index % 28 + 1:02d}",
            "open": close,
            "high": close + 1,
            "low": close - 1,
            "close": close,
            "volume": 1000,
        }
        for index, close in enumerate(closes)
    ]


def test_bootstrap_and_monte_carlo_are_reproducible():
    equity = [100, 102, 101, 104, 107, 106, 110, 112]
    first = bootstrap_validation(equity, samples=200, block_size=3, seed=7)
    second = bootstrap_validation(equity, samples=200, block_size=3, seed=7)
    monte_carlo = monte_carlo_validation(equity, samples=200, seed=8)

    assert first == second
    assert first["observed_total_return"] == pytest.approx(0.12)
    assert first["confidence_interval"][0] <= first["confidence_interval"][1]
    assert 0 <= monte_carlo["probability_loss"] <= 1
    assert monte_carlo["max_drawdown"]["worst_confidence_tail"] <= 0


def test_walk_forward_uses_chronological_expanding_folds():
    result = walk_forward_ma_validation(
        _bars(90),
        short_window=3,
        long_window=8,
        initial_capital=10_000,
        commission_bps=0,
        slippage_bps=0,
        symbol="AAPL",
        period="1d",
        market_rules="auto",
        price_limit_ratio=None,
    )

    assert result["status"] == "ok"
    assert result["fold_count"] >= 2
    assert result["folds"][0]["train_end"] < result["folds"][0]["test_from"]
    assert 0 <= result["positive_fold_ratio"] <= 1


def test_validation_bundle_and_insufficient_walk_forward():
    bars = _bars(60)
    result = run_ma_crossover(
        bars,
        short_window=3,
        long_window=8,
        initial_capital=10_000,
        commission_bps=0,
        slippage_bps=0,
        symbol="AAPL",
    )
    validation = validate_ma_strategy(
        bars,
        result,
        short_window=3,
        long_window=8,
        initial_capital=10_000,
        commission_bps=0,
        slippage_bps=0,
        symbol="AAPL",
        period="1d",
        market_rules="auto",
        price_limit_ratio=None,
        samples=100,
    )
    insufficient = walk_forward_ma_validation(
        _bars(12),
        short_window=3,
        long_window=8,
        initial_capital=10_000,
        commission_bps=0,
        slippage_bps=0,
        symbol="AAPL",
        period="1d",
        market_rules="auto",
        price_limit_ratio=None,
    )

    assert set(validation) == {"bootstrap", "monte_carlo", "walk_forward"}
    assert insufficient["status"] == "insufficient_data"


def test_sampling_validation_rejects_invalid_inputs():
    with pytest.raises(ValueError, match="至少 3"):
        bootstrap_validation([1, 2], samples=100)
    with pytest.raises(ValueError, match="samples"):
        bootstrap_validation([1, 2, 3], samples=99)
    with pytest.raises(ValueError, match="confidence"):
        monte_carlo_validation([1, 2, 3], samples=100, confidence=0.5)
