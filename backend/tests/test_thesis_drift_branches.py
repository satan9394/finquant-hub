from __future__ import annotations

import pytest

from app.services.thesis_drift import _relative_change, evaluate_drift


@pytest.mark.parametrize(
    ("baseline", "current"),
    [({}, 1), ("bad", 1), (0, 1)],
)
def test_relative_change_rejects_non_comparable_inputs(baseline, current):
    assert _relative_change(baseline, current) is None


def test_current_evidence_and_numeric_inputs_are_required():
    result = evaluate_drift(
        baseline={"price": 0, "fundamentals": []},
        current={"price": 100, "fundamentals": {}},
        baseline_evidence_ids={"price": ["price-base"], "fundamental": ["fund-base"]},
        current_evidence_ids={"price": [], "fundamental": []},
    )
    assert "current canonical evidence" in result["rules"]["price"]["reason"]
    assert "current canonical evidence" in result["rules"]["fundamental"]["reason"]

    comparable = evaluate_drift(
        baseline={"price": 0, "fundamentals": []},
        current={"price": 100, "fundamentals": {}},
        baseline_evidence_ids={"price": ["price-base"], "fundamental": ["fund-base"]},
        current_evidence_ids={"price": ["price-current"], "fundamental": ["fund-current"]},
    )
    assert "baseline 为零" in comparable["rules"]["price"]["reason"]
    assert "缺少可比基本面数据" in comparable["rules"]["fundamental"]["reason"]


def test_stable_price_and_fundamentals_report_zero_drift():
    result = evaluate_drift(
        baseline={"price": 100, "fundamentals": {"revenue": 100, "invalid": "bad"}},
        current={"price": 110, "fundamentals": {"revenue": 110, "invalid": "still-bad"}},
        baseline_evidence_ids={"price": ["price-base"], "fundamental": ["fund-base"]},
        current_evidence_ids={"price": ["price-current"], "fundamental": ["fund-current"]},
    )

    assert result["drift_status"] == "stable"
    assert result["drift_score"] == 0.0
    assert result["rules"]["price"]["status"] == "holding"
    assert result["rules"]["fundamental"]["status"] == "holding"
    assert "均未超过" in result["rules"]["fundamental"]["reason"]


def test_fundamentals_without_common_computable_metrics_remain_unknown():
    result = evaluate_drift(
        baseline={"fundamentals": {"revenue": "bad"}},
        current={"fundamentals": {"revenue": "also-bad"}},
        baseline_evidence_ids={"fundamental": ["base"]},
        current_evidence_ids={"fundamental": ["current"]},
    )
    assert result["rules"]["fundamental"]["status"] == "unknown"
    assert "没有共同且可计算" in result["rules"]["fundamental"]["reason"]

