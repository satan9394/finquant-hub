from __future__ import annotations

import pytest

from app import config, database
from scripts.memory_shadow_poc import CANDIDATES, probe_candidate, run_shadow_poc


def test_candidate_probe_never_claims_framework_execution() -> None:
    for spec in CANDIDATES:
        result = probe_candidate(spec, fixture_case_count=6)
        assert result["status"] == "NOT_RUN"
        assert result["fixture_cases_executed"] == 0
        assert result["production_answer_injection"] is False
        assert result["production_data_writes"] == 0
        assert all(value is None for value in result["metrics"].values())


@pytest.mark.asyncio
async def test_shadow_poc_measures_only_native_fixture() -> None:
    original_db_path = config.DB_PATH
    report = await run_shadow_poc(repetitions=1)

    assert report["evidence_scope"] == "synthetic_fixture_only"
    assert report["native"]["status"] == "MEASURED"
    assert report["native"]["answer_path"] is True
    assert report["native"]["fixture_case_count"] == 6
    assert report["native"]["security"]["user_isolation_leakage"] == 0
    assert report["decision_gate"]["status"] == "INSUFFICIENT_EVIDENCE"
    assert {item["name"] for item in report["candidates"]} == {"graphiti", "mem0"}
    assert all(item["status"] == "NOT_RUN" for item in report["candidates"])
    assert config.DB_PATH == original_db_path
    assert database._db is None
