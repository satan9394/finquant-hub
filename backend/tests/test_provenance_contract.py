import copy
import sys
from pathlib import Path

from jsonschema import Draft202012Validator

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPTS))

from provenance_contract import load_contract, map_case, validate_all


def test_schema_and_all_fixture_expectations():
    assert validate_all() == {
        "schema": "CanonicalProvenanceEnvelope v1",
        "valid_cases": 3,
        "invalid_cases_rejected": 7,
        "scope": "deterministic_fixture_only",
    }


def test_adapters_are_lossless_for_required_existing_fields_and_do_not_mutate_inputs():
    schema, fixture = load_contract()
    validator = Draft202012Validator(schema)
    for case in fixture["valid_cases"]:
        before = copy.deepcopy(case["input"])
        envelope = map_case(case, fixture)
        validator.validate(envelope)
        assert case["input"] == before
        for key, expected in case["expected"].items():
            assert envelope[key] == expected


def test_unknown_and_computed_semantics_are_explicit():
    _schema, fixture = load_contract()
    mapped = {case["id"]: map_case(case, fixture) for case in fixture["valid_cases"]}
    unknown = mapped["fundamental_unknown"]
    computed = mapped["backtest_computed_result"]
    assert unknown["value"] is None and unknown["data_status"] == "UNKNOWN"
    assert "UNKNOWN" in unknown["quality_flags"]
    assert computed["inputs"] == ["ev_bars_usAAPL_20250101_20260808"]
    assert computed["formula"] and computed["method_version"]
    assert "AI_INFERENCE" not in load_contract()[0]["properties"]["kind"]["enum"]
    assert "USER_HYPOTHESIS" not in load_contract()[0]["properties"]["kind"]["enum"]
