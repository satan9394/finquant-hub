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


def test_golden_cross_fires():
    result = signals.golden_cross({"dif": [-1.0, 0.5], "dea": [0.0, 0.0]})

    assert [signal["type"] for signal in result] == ["golden_cross"]


def test_breakout_up_fires():
    result = signals.breakout([10.0] * 20 + [11.0], [10.0] * 20 + [11.0], [9.0] * 21)

    assert [signal["type"] for signal in result] == ["breakout_up"]


def test_divergence_rejects_short_series():
    result = signals.divergence({"dif": [0.0] * 29}, [10.0] * 29)

    assert result == []


def test_volume_surge_fires():
    result = signals.volume_surge([100.0] * 20 + [201.0])

    assert [signal["type"] for signal in result] == ["volume_surge"]
