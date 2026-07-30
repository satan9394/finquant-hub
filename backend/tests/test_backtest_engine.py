from app.backtest.engine import run_backtest


def make_bars(closes: list[float]) -> list[dict]:
    return [
        {
            "day": f"2026-01-{index + 1:03d}",
            "open": close,
            "high": close * 1.01,
            "low": close * 0.99,
            "close": close,
            "volume": 1000,
        }
        for index, close in enumerate(closes)
    ]


def test_empty_kline_is_rejected():
    result = run_backtest([])

    assert result["error"].startswith("K线数据不足")


def test_insufficient_kline_is_rejected():
    result = run_backtest(make_bars([10.0] * 49))

    assert result["error"].startswith("K线数据不足")


def test_unknown_strategy_is_rejected():
    result = run_backtest(make_bars([10.0] * 50), strategy_type="unknown")

    assert result["error"].startswith("未知策略")


def test_ma_cross_generates_profitable_trades_and_equity_curve():
    closes = (
        [20 - index * 10 / 29 for index in range(30)]
        + [10 + index * 10 / 20 for index in range(21)]
        + [20 - index * 5 / 14 for index in range(15)]
    )

    result = run_backtest(make_bars(closes), strategy_type="ma_cross")

    assert len(result["equity_curve"]) == len(closes)
    assert result["metrics"]["trade_count"] >= 1
    assert result["metrics"]["total_return_pct"] > 0


def test_rsi_reversal_generates_trades():
    closes = (
        [20 - index * 10 / 29 for index in range(30)]
        + [10 + index * 10 / 20 for index in range(21)]
        + [20 - index * 5 / 14 for index in range(15)]
    )

    result = run_backtest(make_bars(closes), strategy_type="rsi_reversal")

    assert result["trades"]


def test_bollinger_breakout_generates_signal():
    result = run_backtest(make_bars([10.0] * 55 + [15.0] * 5), strategy_type="bollinger_breakout")

    assert any(point["signal"] != 0 for point in result["equity_curve"])


def test_periods_limits_equity_curve():
    result = run_backtest(make_bars([10 + index * 0.1 for index in range(100)]), periods=30)

    assert len(result["equity_curve"]) == 30


def test_ma_cross_accepts_custom_parameters():
    closes = (
        [20 - index * 10 / 29 for index in range(30)]
        + [10 + index * 10 / 20 for index in range(21)]
        + [20 - index * 5 / 14 for index in range(15)]
    )

    result = run_backtest(make_bars(closes), strategy_type="ma_cross", params={"fast": 5, "slow": 15})

    assert result["params"] == {"fast": 5, "slow": 15}
    assert len(result["equity_curve"]) == len(closes)
