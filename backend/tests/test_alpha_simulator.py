import pytest

from app.services.alpha_simulator import simulate_factor


def _rows():
    return [
        {"date": date, "symbol": symbol, "factor": factor, "forward_return": forward_return}
        for date, returns in (("2026-01-02", (-0.02, -0.01, 0.01, 0.02)), ("2026-01-05", (-0.01, 0, 0.01, 0.03)))
        for symbol, factor, forward_return in zip(("A", "B", "C", "D"), (1, 2, 3, 4), returns, strict=True)
    ]


def test_simulator_builds_market_neutral_long_short_curve():
    result = simulate_factor(_rows(), quantile=0.25)

    assert result["period_returns"] == pytest.approx([0.02, 0.02])
    assert result["equity_curve"][-1]["value"] == pytest.approx(1.0404)
    assert result["metrics"]["positive_period_rate"] == 1.0
    assert result["metrics"]["average_turnover"] == pytest.approx(0.25)


def test_simulator_rejects_duplicate_or_ambiguous_rows():
    duplicate = _rows()[:1] * 2
    with pytest.raises(ValueError, match="重复记录"):
        simulate_factor(duplicate)

    with pytest.raises(ValueError, match="至少需要两个标的"):
        simulate_factor(_rows()[:1])
