from app.services.analysis import signals


def test_rsi_signals_fire_on_threshold_entry_only():
    assert [item["index"] for item in signals.rsi_oversold([45, 29, 20, 25, 31, 29])] == [1, 5]
    assert [item["index"] for item in signals.rsi_overbought([55, 71, 80, 68, 72])] == [1, 4]


def test_recent_unique_keeps_latest_signal_of_each_type_in_recent_window():
    result = signals._recent_unique([
        {"type": "old", "index": 1},
        {"type": "rsi_oversold", "index": 82},
        {"type": "rsi_oversold", "index": 99},
        {"type": "breakout_up", "index": 95},
    ], latest_index=100, lookback=20)

    assert result == [
        {"type": "breakout_up", "index": 95},
        {"type": "rsi_oversold", "index": 99},
    ]
