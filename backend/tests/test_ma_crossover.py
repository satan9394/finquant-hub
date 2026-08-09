import pytest

from app.backtest.ma_crossover import run_ma_crossover


def make_bars(closes: list[float]) -> list[dict]:
    return [
        {
            "day": f"2026-01-{index + 1:02d}",
            "open": close,
            "high": close * 1.01,
            "low": close * 0.99,
            "close": close,
            "volume": 1000,
        }
        for index, close in enumerate(closes)
    ]


def test_empty_bars_rejected():
    with pytest.raises(ValueError, match="没有可用行情"):
        run_ma_crossover(
            [], short_window=2, long_window=3, initial_capital=10_000,
            commission_bps=0, slippage_bps=0,
        )

def test_ma_crossover_metrics_and_curves():
    bars = make_bars([10, 9, 8, 9, 10, 11, 12, 11, 10, 9, 8, 9])
    result = run_ma_crossover(
        bars, short_window=2, long_window=3, initial_capital=10_000,
        commission_bps=0, slippage_bps=0,
    )
    assert len(result["equity_curve"]) == len(bars)
    assert len(result["benchmark_curve"]) == len(bars)
    assert len(result["drawdown_curve"]) == len(bars)
    assert result["metrics"]["trade_count"] >= 1
    assert result["metrics"]["max_drawdown"] <= 0
    for name in ("calmar_ratio", "sortino_ratio", "information_ratio", "profit_factor"):
        assert name in result["metrics"]


def test_commission_and_slippage_reduce_returns():
    bars = make_bars([10, 9, 8, 9, 10, 11, 12, 13, 12, 11, 10, 9])
    free = run_ma_crossover(
        bars, short_window=2, long_window=3, initial_capital=10_000,
        commission_bps=0, slippage_bps=0,
    )
    costly = run_ma_crossover(
        bars, short_window=2, long_window=3, initial_capital=10_000,
        commission_bps=25, slippage_bps=25,
    )
    assert costly["metrics"]["total_return"] < free["metrics"]["total_return"]
    assert sum(t["entry_fee"] + t["exit_fee"] for t in costly["trades"]) > 0
    assert sum(t["entry_slippage_cost"] + t["exit_slippage_cost"] for t in costly["trades"]) > 0


def test_cn_cost_profile_charges_sell_stamp_duty_and_minimum_commission():
    result = run_ma_crossover(
        make_bars([10, 9, 8, 9, 10, 11, 12, 13, 12, 11, 10, 9]),
        short_window=2, long_window=3, initial_capital=10_000,
        commission_bps=2.5, slippage_bps=0, symbol="600519",
        sell_stamp_duty_bps=10, minimum_commission_cny=5,
    )
    trade = result["trades"][0]
    assert trade["entry_commission"] >= 5
    assert trade["entry_stamp_duty"] == 0
    assert trade["exit_stamp_duty"] == pytest.approx(trade["exit_notional"] * 0.001)
    assert trade["exit_fee"] == pytest.approx(trade["exit_commission"] + trade["exit_stamp_duty"])


def test_max_drawdown_stop_exits_next_open_and_locks_reentry_until_bearish_signal():
    result = run_ma_crossover(
        make_bars([10, 9, 8, 9, 10, 11, 12, 10, 9, 8, 9, 10, 11]),
        short_window=2, long_window=3, initial_capital=10_000,
        commission_bps=0, slippage_bps=0, max_drawdown_stop_pct=0.05,
    )
    assert result["risk_controls"]["trigger_count"] >= 1
    assert result["trades"][0]["risk_stop_triggered"] is True
    assert "max_drawdown_stop_triggered" in result["warnings"]


def test_window_and_price_validation():
    bars = make_bars([10, 11, 12, 13, 14, 15])
    with pytest.raises(ValueError, match="long_window"):
        run_ma_crossover(
            bars, short_window=3, long_window=3, initial_capital=10_000,
            commission_bps=0, slippage_bps=0,
        )
    bars[2]["close"] = 0
    with pytest.raises(ValueError, match="close 无效"):
        run_ma_crossover(
            bars, short_window=2, long_window=3, initial_capital=10_000,
            commission_bps=0, slippage_bps=0,
        )
