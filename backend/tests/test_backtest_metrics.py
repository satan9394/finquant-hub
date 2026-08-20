import numpy as np
import pytest

from app.backtest.metrics import (
    calculate_performance,
    calculate_trade_metrics,
    calculate_trade_quality,
)


def test_extended_performance_metrics_are_financially_consistent():
    equity = [100, 105, 102, 110, 108, 116]
    benchmark = [100, 102, 103, 105, 107, 109]

    metrics = calculate_performance(equity, benchmark, 252)

    assert metrics["total_return"] == pytest.approx(0.16)
    assert metrics["benchmark_return"] == pytest.approx(0.09)
    assert metrics["excess_return"] == pytest.approx(0.07)
    assert metrics["max_drawdown"] == pytest.approx(102 / 105 - 1)
    assert metrics["calmar_ratio"] is not None
    assert metrics["sortino_ratio"] is not None
    assert metrics["information_ratio"] is not None
    assert metrics["annualized_volatility"] is not None
    assert metrics["annualized_downside_volatility"] is not None
    assert metrics["tracking_error"] is not None
    assert metrics["beta"] is not None
    assert metrics["alpha"] is not None
    assert metrics["r_squared"] is not None


def test_drawdown_duration_and_recovery_use_observed_periods():
    metrics = calculate_performance(
        [100, 90, 95, 100, 105],
        [100, 102, 101, 103, 104],
        252,
    )

    assert metrics["max_drawdown"] == pytest.approx(-0.1)
    assert metrics["max_drawdown_duration_periods"] == 3
    assert metrics["max_drawdown_recovery_periods"] == 2
    assert metrics["max_drawdown_recovered"] is True

    unrecovered = calculate_performance([100, 90, 95], [100, 101, 102], 252)
    assert unrecovered["max_drawdown_duration_periods"] == 2
    assert unrecovered["max_drawdown_recovery_periods"] is None
    assert unrecovered["max_drawdown_recovered"] is False


def test_undefined_ratios_remain_null_and_trade_profit_factor_is_exact():
    flat = calculate_performance(np.ones(4), np.ones(4), 252)
    trades = calculate_trade_metrics([10, -4, 6, -2])

    assert flat["calmar_ratio"] is None
    assert flat["sortino_ratio"] is None
    assert flat["information_ratio"] is None
    assert flat["beta"] is None
    assert flat["alpha"] is None
    assert flat["r_squared"] is None
    assert flat["tracking_error"] == 0
    assert flat["max_drawdown_duration_periods"] == 0
    assert flat["max_drawdown_recovery_periods"] == 0
    assert flat["max_drawdown_recovered"] is True
    assert trades == {"trade_count": 4, "win_rate": 0.5, "profit_factor": pytest.approx(8 / 3)}


def test_trade_quality_uses_complete_trade_returns_and_observed_holding_periods():
    quality = calculate_trade_quality([0.1, -0.04, 0.02], [3, 1, 2])

    assert quality == {
        "trade_expectancy": pytest.approx(0.08 / 3),
        "average_win": pytest.approx(0.06),
        "average_loss": pytest.approx(-0.04),
        "average_holding_periods": pytest.approx(2.0),
    }

    assert calculate_trade_quality([], []) == {
        "trade_expectancy": None,
        "average_win": None,
        "average_loss": None,
        "average_holding_periods": None,
    }
