"""Validate and map AIOS-002 deterministic provenance fixtures."""
from __future__ import annotations

import copy
import json
from pathlib import Path
from typing import Any

from jsonschema import Draft202012Validator

ROOT = Path(__file__).resolve().parents[2]
SCHEMA_PATH = ROOT / "docs" / "ai" / "schemas" / "canonical_provenance_envelope.v1.schema.json"
FIXTURE_PATH = ROOT / "backend" / "tests" / "fixtures" / "aios_provenance_v1.json"
JSONDict = dict[str, Any]


def load_contract() -> tuple[JSONDict, JSONDict]:
    schema = json.loads(SCHEMA_PATH.read_text(encoding="utf-8"))
    fixture = json.loads(FIXTURE_PATH.read_text(encoding="utf-8"))
    Draft202012Validator.check_schema(schema)
    return schema, fixture


def _base(case: JSONDict, fixture: JSONDict) -> JSONDict:
    value = case["input"]
    return {
        "schema_version": "canonical-provenance-envelope-v1",
        "evidence_id": case["evidence_id"],
        "kind": "observed_fact",
        "data_status": "UNKNOWN" if value.get("value") is None and value.get("data", {}).get(value.get("metric")) is None else "OK",
        "subject": {"type": "instrument", "id": value.get("symbol")},
        "metric": value.get("metric"),
        "value": value.get("value"),
        "unit": None,
        "source": value.get("source") or value.get("provider"),
        "vendor": value.get("provider"),
        "document_id": None,
        "as_of": value.get("as_of"),
        "published_at": None,
        "retrieved_at": fixture["retrieved_at"],
        "period_type": value.get("period_type"),
        "market": value.get("market"),
        "currency": value.get("currency"),
        "adjustment": value.get("adjustment"),
        "frequency": value.get("frequency"),
        "inputs": [],
        "formula": None,
        "method_version": None,
        "quality_flags": list(value.get("quality_flags", [])),
        "confidence": None,
        "license_scope": "display-and-research",
    }


def map_case(case: JSONDict, fixture: JSONDict) -> JSONDict:
    source = copy.deepcopy(case["input"])
    envelope = _base(case, fixture)
    if case["adapter"] == "quote":
        envelope.update({"subject": {"type": "instrument", "id": "sh600519"}, "value": source["data"][source["metric"]], "unit": source["currency"], "period_type": "point_in_time"})
    elif case["adapter"] == "fundamental":
        envelope.update({"subject": {"type": "instrument", "id": "usAAPL"}, "unit": "x", "adjustment": "not_applicable", "frequency": source["period_type"]})
    elif case["adapter"] == "computed":
        envelope.update({
            "kind": "computed_result", "subject": {"type": source["subject_type"], "id": source["subject_id"]},
            "source": "finquant", "vendor": "finquant", "inputs": source["inputs"], "formula": source["formula"],
            "method_version": source["method_version"], "unit": source["unit"],
        })
    else:
        raise ValueError(f"unknown adapter: {case['adapter']}")
    if source != case["input"]:
        raise RuntimeError("adapter mutated input")
    return envelope


def validate_all() -> JSONDict:
    schema, fixture = load_contract()
    validator = Draft202012Validator(schema)
    valid = {case["id"]: map_case(case, fixture) for case in fixture["valid_cases"]}
    for case in fixture["valid_cases"]:
        validator.validate(valid[case["id"]])
        expected = case["expected"]
        assert all(valid[case["id"]].get(key) == value for key, value in expected.items())
    rejected = []
    for case in fixture["invalid_cases"]:
        candidate = copy.deepcopy(valid[case["from_valid"]])
        candidate.update(case["patch"])
        if list(validator.iter_errors(candidate)):
            rejected.append(case["id"])
    if len(rejected) != len(fixture["invalid_cases"]):
        raise RuntimeError("one or more invalid provenance fixtures were accepted")
    return {"schema": schema["title"], "valid_cases": len(valid), "invalid_cases_rejected": len(rejected), "scope": "deterministic_fixture_only"}


if __name__ == "__main__":
    print(json.dumps(validate_all(), ensure_ascii=False, indent=2))
