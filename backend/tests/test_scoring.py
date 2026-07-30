from app.services.analysis.scoring import composite_score, momentum_score, trend_strength, volume_score


def test_trend_strength_scores_rising_and_falling_prices():
    rising = [10.0 + index for index in range(21)]
    falling = [30.0 - index for index in range(21)]

    bullish = trend_strength(rising, [price * 0.99 for price in rising], [price * 0.9 for price in rising])
    bearish = trend_strength(falling, [price * 1.01 for price in falling], [price * 1.1 for price in falling])

    assert bullish["score"] > 0
    assert bearish["score"] < 0


def test_momentum_score_handles_rsi_extremes_and_neutral():
    declining = [30.0 - index for index in range(21)]
    rising = [10.0 + index for index in range(21)]
    flat = [10.0] * 21

    overbought = momentum_score(declining, [75.0] * 21)
    oversold = momentum_score(rising, [25.0] * 21)
    neutral = momentum_score(flat, [50.0] * 21)

    assert overbought["score"] < 0
    assert oversold["score"] > 0
    assert neutral["score"] == 0


def test_volume_score_rewards_expansion_and_penalizes_contraction():
    expanded = volume_score([2000.0] * 10, [1000.0] * 10)
    contracted = volume_score([500.0] * 10, [1000.0] * 10)

    assert expanded["score"] > 0
    assert contracted["score"] < 0


def test_composite_score_returns_bounded_component_scores():
    close = [10.0 + index for index in range(21)]

    result = composite_score(
        close,
        [price * 0.99 for price in close],
        [price * 0.9 for price in close],
        [1500.0] * 21,
        [1000.0] * 21,
        [25.0] * 21,
    )

    assert set(result) == {"composite_score", "components"}
    assert set(result["components"]) == {"trend", "momentum", "volume"}
    assert -100 <= result["composite_score"] <= 100
    assert all(-100 <= component["score"] <= 100 for component in result["components"].values())
