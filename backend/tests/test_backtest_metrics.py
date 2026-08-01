import numpy as np
import pytest

from app.backtest.metrics import calculate_performance, calculate_trade_metrics


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


def test_undefined_ratios_remain_null_and_trade_profit_factor_is_exact():
    flat = calculate_performance(np.ones(4), np.ones(4), 252)
    trades = calculate_trade_metrics([10, -4, 6, -2])

    assert flat["calmar_ratio"] is None
    assert flat["sortino_ratio"] is None
    assert flat["information_ratio"] is None
    assert trades == {"trade_count": 4, "win_rate": 0.5, "profit_factor": pytest.approx(8 / 3)}
