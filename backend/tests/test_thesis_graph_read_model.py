from __future__ import annotations

import pytest

from app import config, database
from scripts.thesis_graph_read_model import InMemoryShadowGraph, export_thesis_graph, graphiti_probe


@pytest.mark.asyncio
async def test_owner_export_clear_and_idempotent_rebuild(tmp_path, monkeypatch) -> None:
    monkeypatch.setattr(config, "DB_PATH", tmp_path / "graph-export.db")
    await database.init_db()
    try:
        owner_id = await database.execute("INSERT INTO users (email) VALUES ('owner@test.local')")
        other_id = await database.execute("INSERT INTO users (email) VALUES ('other@test.local')")
        thesis_id = await database.execute(
            "INSERT INTO thesis (ticker, title, thesis, user_id) VALUES ('usAAPL', 't', 'j', ?)",
            (owner_id,),
        )
        claim_id = await database.execute(
            "INSERT INTO thesis_claims (thesis_id, claim, kind, status, user_id) "
            "VALUES (?, 'claim', 'manual', 'violated', ?)",
            (thesis_id, owner_id),
        )
        await database.execute(
            "INSERT INTO evidence_objects "
            "(user_id, evidence_id, kind, data_status, subject_type, subject_id, metric, value_json, source, "
            "retrieved_at, license_scope) VALUES (?, 'ev_owner_0001', 'observed_fact', 'OK', "
            "'instrument', 'usAAPL', 'revenue', '70', 'fixture', '2026-08-12T00:00:00Z', 'fixture-only')",
            (owner_id,),
        )
        await database.execute(
            "INSERT INTO thesis_claim_evidence_edges "
            "(user_id, thesis_id, claim_id, evidence_id, stance, valid_from, valid_to, "
            "observed_at, created_source, status) VALUES (?, ?, ?, 'ev_owner_0001', 'opposing', "
            "'2026-06-30', '2026-08-01', '2026-08-12T00:00:00Z', 'user', 'superseded')",
            (owner_id, thesis_id, claim_id),
        )
        await database.execute(
            "INSERT INTO thesis_claim_status_events "
            "(user_id, thesis_id, claim_id, from_status, to_status, actor, trigger_kind, "
            "reason, evidence_id) VALUES (?, ?, ?, 'unknown', 'violated', 'system', "
            "'deterministic_check', 'fixture event', 'ev_owner_0001')",
            (owner_id, thesis_id, claim_id),
        )
        await database.execute(
            "INSERT INTO evidence_objects "
            "(user_id, evidence_id, kind, data_status, subject_type, subject_id, metric, value_json, source, "
            "retrieved_at, license_scope) VALUES (?, 'ev_other_0001', 'observed_fact', 'OK', "
            "'instrument', 'usMSFT', 'revenue', '1', 'fixture', '2026-08-12T00:00:00Z', 'fixture-only')",
            (other_id,),
        )

        exported = await export_thesis_graph(owner_id)
        assert exported["schema_version"] == "thesis-graph-export/v1"
        assert exported["counts"] == {
            "thesis": 1, "claim": 1, "evidence": 1,
            "claim_evidence": 1, "claim_status_event": 1,
        }
        relation = exported["relations"][0]
        assert relation["status"] == "superseded"
        assert relation["valid_from"] == "2026-06-30"
        assert relation["valid_to"] == "2026-08-01"
        assert "ev_other_0001" not in str(exported)

        sink = InMemoryShadowGraph()
        assert sink.rebuild(exported) == exported["counts"]
        sink.clear()
        assert sink.counts() == {key: 0 for key in exported["counts"]}
        assert sink.rebuild(exported) == exported["counts"]
        assert sink.rebuild(exported) == exported["counts"]
    finally:
        await database.close_db()


def test_graphiti_probe_never_simulates_candidate_results() -> None:
    result = graphiti_probe()
    assert result["status"] in {"NOT_RUN", "AVAILABLE_NOT_RUN"}
    assert result["fixture_cases_executed"] == 0
    assert result["production_writes"] == 0
    assert result["answer_path"] is False
    assert all(value is None for value in result["metrics"].values())
