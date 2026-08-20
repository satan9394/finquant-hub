import pytest

from app.backtest.risk import portfolio_risk_xray


def _curve(values):
    return [{"time": f"2026-01-{index + 1:02d}", "value": value} for index, value in enumerate(values)]


def test_risk_xray_reports_concentration_drawdown_var_es_and_diversification():
    first = [100 + (index % 7) - (3 if index % 11 == 0 else 0) for index in range(35)]
    second = [100 + ((index * 2) % 9) - (4 if index % 13 == 0 else 0) for index in range(35)]
    portfolio = [0.7 * left + 0.3 * right for left, right in zip(first, second)]
    assets = [
        {"asset_id": "A", "period": "1d", "equity_curve": _curve(first)},
        {"asset_id": "B", "period": "1d", "equity_curve": _curve(second)},
    ]

    result = portfolio_risk_xray(assets, {"A": 0.7, "B": 0.3}, _curve(portfolio))

    assert result["concentration"]["hhi"] == pytest.approx(0.58)
    assert result["concentration"]["level"] == "high"
    assert result["drawdown"]["max"] <= result["drawdown"]["current"] <= 0
    assert result["tail_risk"]["status"] == "ok"
    assert result["tail_risk"]["expected_shortfall"] >= result["tail_risk"]["var"]
    assert result["diversification"]["status"] == "ok"
    assert 0 <= result["diversification"]["benefit"] <= 1
    matrix = result["diversification"]["correlation_matrix"]
    assert matrix["status"] == "ok"
    assert matrix["asset_ids"] == ["A", "B"]
    assert matrix["values"][0][0] == pytest.approx(1)
    contribution = result["diversification"]["risk_contribution"]
    assert contribution["status"] == "ok"
    assert contribution["method"] == "sample_covariance_component_share"
    assert sum(item["contribution"] for item in contribution["items"]) == pytest.approx(1)


def test_risk_xray_marks_short_and_mixed_frequency_samples_unknown():
    curve = _curve([100, 101, 99, 102])
    assets = [
        {"asset_id": "A", "period": "1d", "equity_curve": curve},
        {"asset_id": "B", "period": "60m", "equity_curve": curve},
    ]
    result = portfolio_risk_xray(assets, {"A": 0.5, "B": 0.5}, curve)

    assert result["tail_risk"]["status"] == "insufficient_data"
    assert result["tail_risk"]["var"] is None
    assert result["diversification"]["status"] == "unsupported_mixed_frequency"
    assert result["diversification"]["correlation_matrix"]["values"] is None
    assert result["diversification"]["risk_contribution"]["items"] == []


def test_risk_xray_validates_confidence_curve_and_weights():
    curve = _curve([100, 101, 102])
    asset = [{"asset_id": "A", "period": "1d", "equity_curve": curve}]
    with pytest.raises(ValueError, match="confidence"):
        portfolio_risk_xray(asset, {"A": 1.0}, curve, confidence=0.5)
    with pytest.raises(ValueError, match="权益曲线"):
        portfolio_risk_xray(asset, {"A": 1.0}, _curve([100]))
    with pytest.raises(ValueError, match="权重"):
        portfolio_risk_xray(asset, {"A": 0.8}, curve)
