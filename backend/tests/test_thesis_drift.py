from __future__ import annotations

from app.services.thesis_drift import evaluate_drift


def test_versioned_drift_rules_require_both_canonical_inputs() -> None:
    result = evaluate_drift(
        baseline={"price": 100.0, "fundamentals": {"revenue": 100.0}},
        current={"price": 130.0, "fundamentals": {"revenue": 70.0}},
        baseline_evidence_ids={"price": [], "fundamental": []},
        current_evidence_ids={"price": ["ev_price_current"], "fundamental": ["ev_fund_current"]},
    )

    assert result["engine_version"] == "thesis-drift/v1"
    assert result["drift_status"] == "unknown"
    for kind in ("price", "fundamental"):
        rule = result["rules"][kind]
        assert rule["status"] == "unknown"
        assert rule["rule_version"] == "1.0.0"
        assert rule["baseline_evidence_ids"] == []
        assert "baseline canonical evidence" in rule["reason"]
    assert result["rules"]["report"]["status"] == "unknown"
    assert result["rules"]["report"]["formula"] is None
    assert "manual review" in result["rules"]["report"]["reason"]


def test_drift_rules_expose_formula_threshold_inputs_and_evidence() -> None:
    result = evaluate_drift(
        baseline={"price": 100.0, "fundamentals": {"revenue": 100.0}},
        current={"price": 130.0, "fundamentals": {"revenue": 70.0}},
        baseline_evidence_ids={"price": ["ev_price_base"], "fundamental": ["ev_fund_base"]},
        current_evidence_ids={"price": ["ev_price_current"], "fundamental": ["ev_fund_current"]},
    )

    assert result["drift_status"] == "drifted"
    assert result["drift_score"] == 100.0
    price = result["rules"]["price"]
    assert price["status"] == "violated"
    assert price["formula"] == "(current - baseline) / abs(baseline)"
    assert price["parameters"] == {"absolute_change_threshold": 0.2}
    assert price["baseline_value"] == 100.0
    assert price["current_value"] == 130.0
    assert price["baseline_evidence_ids"] == ["ev_price_base"]
    assert price["current_evidence_ids"] == ["ev_price_current"]


def test_position_and_report_never_gain_fact_status_without_adapters() -> None:
    result = evaluate_drift(
        baseline={"position_shares": 10.0, "report_core": "bull case"},
        current={"position_shares": 30.0, "report_core": "bear case"},
        baseline_evidence_ids={},
        current_evidence_ids={},
    )

    assert result["rules"]["position"]["status"] == "unknown"
    assert result["rules"]["report"]["status"] == "unknown"
    assert result["drift_score"] is None
