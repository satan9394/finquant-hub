from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator
import pytest

from app.backtest.metrics import calculate_performance
from app.backtest.risk import portfolio_risk_xray
from app.services.alpha_simulator import simulate_factor
from app.services.provenance import computed_envelope

ROOT = Path(__file__).resolve().parents[2]
FIXTURE_PATH = ROOT / "backend" / "tests" / "fixtures" / "aios_computed_v1.json"
SCHEMA_PATH = ROOT / "docs" / "ai" / "schemas" / "canonical_provenance_envelope.v1.schema.json"


def curve(values: list[float]) -> list[dict[str, Any]]:
    return [
        {"time": f"2026-01-{index + 1:02d}", "value": value}
        for index, value in enumerate(values)
    ]


def recompute(case: dict[str, Any]) -> float:
    inputs = case["inputs"]
    if case["engine"] == "calculate_performance":
        result = calculate_performance(
            inputs["equity"],
            inputs["benchmark"],
            inputs["periods_per_year"],
        )
        return float(result["total_return"])
    if case["engine"] == "portfolio_risk_xray":
        first = [float(value) for value in inputs["asset_a"]]
        second = [float(value) for value in inputs["asset_b"]]
        weights = inputs["weights"]
        portfolio = [
            weights["A"] * left + weights["B"] * right
            for left, right in zip(first, second, strict=True)
        ]
        result = portfolio_risk_xray(
            [
                {"asset_id": "A", "period": "1d", "equity_curve": curve(first)},
                {"asset_id": "B", "period": "1d", "equity_curve": curve(second)},
            ],
            weights,
            curve(portfolio),
        )
        return float(result["concentration"]["hhi"])
    if case["engine"] == "simulate_factor":
        result = simulate_factor(inputs["observations"], quantile=inputs["quantile"])
        return float(result["equity_curve"][-1]["value"])
    raise ValueError(f"unknown engine: {case['engine']}")


def test_computed_fixtures_reuse_existing_engines_and_build_valid_envelopes() -> None:
    fixture = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    original = copy.deepcopy(fixture)
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    validator = Draft202012Validator(schema)

    assert fixture["schema_version"] == "aios-computed-fixture-v1"
    for case in fixture["cases"]:
        value = recompute(case)
        assert value == pytest.approx(case["expected"])
        envelope = computed_envelope(
            subject_type=case["subject_type"],
            subject_id=case["subject_id"],
            metric=case["metric"],
            value=value,
            unit=case["unit"],
            inputs=case["input_evidence_ids"],
            formula=case["formula"],
            method_version=case["method_version"],
            retrieved_at=fixture["retrieved_at"],
        )
        validator.validate(envelope)
        assert envelope["inputs"] == case["input_evidence_ids"]
        assert envelope["formula"] == case["formula"]
        assert envelope["method_version"] == case["method_version"]

    assert fixture == original


@pytest.mark.parametrize(
    ("inputs", "formula", "method_version"),
    [([], "x", "v1"), (["ev_duplicate_input_001", "ev_duplicate_input_001"], "x", "v1"), (["ev_input_valid_0001"], "", "v1"), (["ev_input_valid_0001"], "x", "")],
)
def test_computed_envelope_rejects_incomplete_lineage(
    inputs: list[str], formula: str, method_version: str
) -> None:
    with pytest.raises(ValueError):
        computed_envelope(
            subject_type="strategy",
            subject_id="fixture:strategy",
            metric="total_return",
            value=0.1,
            unit="ratio",
            inputs=inputs,
            formula=formula,
            method_version=method_version,
            retrieved_at="2026-08-11T00:00:00Z",
        )
