import sys
from pathlib import Path

import pytest

BACKEND_ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = BACKEND_ROOT / "scripts"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

from memory_fts_baseline import DEFAULT_FIXTURE, load_fixture, run_benchmark


def test_memory_fixture_is_versioned_and_covers_required_scenarios():
    fixture = load_fixture(DEFAULT_FIXTURE)
    record_keys = {record["key"] for record in fixture["records"]}
    case_ids = {case["id"] for case in fixture["retrieval_cases"]}

    assert fixture["schema_version"] == "aios-memory-fixture-v1"
    assert {"cn_code_name", "hk_alias", "mixed_language", "temporal_candidates",
            "contradiction_candidates", "prompt_injection_retrieval"} <= case_ids
    assert {"workspace_alpha_note", "workspace_beta_note", "other_user_private",
            "missing_provenance", "upstream_error", "stale_success"} <= record_keys
    assert set(fixture["unsupported_capabilities"]) == {
        "temporal_selection",
        "contradiction_classification",
        "workspace_hard_filter",
        "provenance_coverage",
        "stale_as_current_detection",
        "information_type_classification",
        "upstream_failure_precedence",
    }


@pytest.mark.asyncio
async def test_baseline_reports_metrics_security_sync_budget_and_missing_capabilities():
    report = await run_benchmark(DEFAULT_FIXTURE, repetitions=2)

    assert report["fixture_version"] == "aios-memory-fixture-v1"
    assert report["fixture_case_count"] == 6
    assert report["fixture_record_count"] == 13
    assert 0 <= report["retrieval"]["recall_at_5"] <= 1
    assert 0 <= report["retrieval"]["precision_at_5"] <= 1
    assert report["latency_ms"]["samples"] == 12
    assert report["latency_ms"]["p50"] >= 0
    assert report["latency_ms"]["p95"] >= report["latency_ms"]["p50"]
    assert report["security"] == {
        "user_isolation_leakage": 0,
        "leaked_record_keys": [],
        "owner_private_record_visible": True,
        "prompt_injection_execution": 0,
        "untrusted_context_warning": True,
    }
    assert report["context_budget"]["within_budget"] is True
    assert report["context_budget"]["rendered_chars"] <= 2400
    assert report["fts_trigger_sync"]["status"] == "PASS"
    assert {item["status"] for item in report["capabilities"].values()} == {"MISSING"}
    assert report["evidence_scope"] == "synthetic_fixture_only"
