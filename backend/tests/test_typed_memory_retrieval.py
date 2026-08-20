from __future__ import annotations

import sys
from pathlib import Path

import pytest

from app import config, database
from app.services.investment_memory import create_memory, search_memories

BACKEND_ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = BACKEND_ROOT / "scripts"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

from memory_typed_benchmark import DEFAULT_FIXTURE, run_benchmark


@pytest.mark.asyncio
async def test_retrieval_explains_candidate_time_and_missing_provenance(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(config, "DB_PATH", tmp_path / "typed-retrieval.db")
    await database.init_db()
    try:
        user_id = await database.execute("INSERT INTO users (email) VALUES ('typed@test.local')")
        candidate = await create_memory(
            user_id=user_id,
            subject_type="instrument",
            subject_id="usAAPL",
            memory_type="hypothesis",
            information_kind="AI_INFERENCE",
            content={"text": "SERVICES_MARGIN needs verification"},
            source_kind="ai",
            source_id="research_report:1",
            valid_from="2026-01-01",
            observed_at="2026-01-02T00:00:00Z",
            status="candidate",
            quality_flags=["UNVERIFIED"],
            created_by="ai",
        )

        hits = await search_memories(
            "SERVICES_MARGIN",
            user_id=user_id,
            subject_type="instrument",
            subject_id="usAAPL",
            valid_at="2026-02-01",
        )
        assert [hit["id"] for hit in hits] == [candidate["id"]]
        assert hits[0]["retrieval"] == {
            "matched_terms": ["services_margin"],
            "status": "candidate",
            "information_kind": "AI_INFERENCE",
            "temporal": {
                "valid_from": "2026-01-01",
                "valid_to": None,
                "observed_at": "2026-01-02T00:00:00Z",
            },
            "provenance": {
                "evidence_id": None,
                "kind": None,
                "data_status": None,
                "source": None,
                "vendor": None,
                "as_of": None,
                "quality_flags": [],
            },
            "trust": "unverified_candidate",
        }
        assert await search_memories(
            "SERVICES_MARGIN", user_id=user_id, require_provenance=True
        ) == []
        assert await search_memories(
            "SERVICES_MARGIN", user_id=user_id + 1
        ) == []
    finally:
        await database.close_db()


@pytest.mark.asyncio
async def test_typed_benchmark_meets_fts_temporal_security_and_latency_gates() -> None:
    report = await run_benchmark(DEFAULT_FIXTURE, repetitions=2)

    assert report["status"] == "PASS"
    assert report["evidence_scope"] == "synthetic_fixture_only"
    assert report["typed_memory"]["retrieval"]["recall_at_5"] >= report["fts_baseline"]["recall_at_5"]
    assert report["typed_memory"]["retrieval"]["precision_at_5"] >= report["fts_baseline"]["precision_at_5"]
    assert report["typed_memory"]["semantic_accuracy"] >= 0.95
    assert report["typed_memory"]["owner_isolation_leakage"] == 0
    assert report["typed_memory"]["latency_ms"]["p95"] <= 250
    assert all(report["gates"].values())


@pytest.mark.asyncio
async def test_retrieval_rejects_invalid_status_and_limit() -> None:
    with pytest.raises(ValueError, match="statuses"):
        await search_memories("AAPL", user_id=1, statuses=("invented",))
    with pytest.raises(ValueError, match="limit"):
        await search_memories("AAPL", user_id=1, limit=21)
