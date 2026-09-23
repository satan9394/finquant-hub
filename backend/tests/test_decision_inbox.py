from __future__ import annotations

import pytest

from app import config, database
from app.services.decision_inbox import build_decision_inbox


@pytest.fixture
async def inbox_db(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "DB_PATH", tmp_path / "decision-inbox.db")
    await database.init_db()
    owner_id = await database.execute("INSERT INTO users (email) VALUES ('owner@test.local')")
    other_id = await database.execute("INSERT INTO users (email) VALUES ('other@test.local')")
    await database.claim_unowned_data(owner_id)
    try:
        yield owner_id, other_id
    finally:
        await database.close_db()


async def _seed_thesis_event(user_id: int) -> None:
    thesis_id = await database.execute(
        "INSERT INTO thesis (ticker, title, thesis, user_id) VALUES ('usAAPL', 'Apple thesis', 'Judgment', ?)",
        (user_id,),
    )
    claim_id = await database.execute(
        "INSERT INTO thesis_claims (thesis_id, claim, kind, status, user_id) "
        "VALUES (?, 'Price condition', 'price', 'violated', ?)",
        (thesis_id, user_id),
    )
    await database.execute(
        "INSERT INTO evidence_objects "
        "(user_id, evidence_id, kind, data_status, subject_type, subject_id, metric, value_json, "
        "source, as_of, retrieved_at, license_scope) VALUES "
        "(?, 'ev_price_current', 'observed_fact', 'OK', 'instrument', 'usAAPL', 'price', "
        "'80', 'fixture.market', '2026-08-12', '2026-08-12T00:00:00Z', 'test-only')",
        (user_id,),
    )
    await database.execute(
        "INSERT INTO thesis_claim_status_events "
        "(user_id, thesis_id, claim_id, from_status, to_status, actor, trigger_kind, reason, evidence_id) "
        "VALUES (?, ?, ?, 'holding', 'violated', 'system', 'deterministic_check', "
        "'Price crossed the saved threshold', 'ev_price_current')",
        (user_id, thesis_id, claim_id),
    )


@pytest.mark.asyncio
async def test_inbox_is_owner_scoped_evidence_linked_and_deterministically_sorted(inbox_db) -> None:
    owner_id, other_id = inbox_db
    await _seed_thesis_event(owner_id)
    await database.execute(
        "INSERT INTO scheduled_research_jobs "
        "(name, ticker, company_name, cron_expr, last_status, last_run_at, user_id) "
        "VALUES ('Nightly Apple', 'usAAPL', 'Apple', '0 0 * * *', 'failed', '2026-08-12 01:00:00', ?)",
        (owner_id,),
    )

    inbox = await build_decision_inbox(owner_id)
    assert inbox["engine_version"] == "decision-inbox/v1"
    assert [item["kind"] for item in inbox["items"]] == [
        "thesis_claim_change", "scheduled_research_failure",
    ]
    claim, failure = inbox["items"]
    assert failure["quality_status"] == "UPSTREAM_ERROR"
    assert failure["evidence_refs"] == []
    assert claim["quality_status"] == "OK"
    assert claim["evidence_refs"][0] == {
        "evidence_id": "ev_price_current", "kind": "observed_fact", "data_status": "OK",
        "subject_type": "instrument", "subject_id": "usAAPL", "metric": "price",
        "source": "fixture.market", "as_of": "2026-08-12",
        "retrieved_at": "2026-08-12T00:00:00Z", "quality_flags": [],
    }
    assert claim["object_ref"]["path"].startswith("/thesis?id=")
    assert claim["next_action"]["kind"] == "navigate"
    other_inbox = await build_decision_inbox(other_id)
    assert other_inbox["engine_version"] == "decision-inbox/v1"
    assert other_inbox["items"] == []
    assert other_inbox["total"] == 0


@pytest.mark.asyncio
async def test_unconfirmed_version_preserves_unknown_without_evidence(inbox_db) -> None:
    owner_id, _ = inbox_db
    thesis_id = await database.execute(
        "INSERT INTO thesis (ticker, title, thesis, user_id) VALUES ('usMSFT', 'Microsoft', 'Current', ?)",
        (owner_id,),
    )
    for version in (1, 2):
        await database.execute(
            "INSERT INTO thesis_versions "
            "(user_id, thesis_id, version, judgment, judgment_kind, change_reason, created_by) "
            "VALUES (?, ?, ?, ?, 'USER_HYPOTHESIS', ?, 'user')",
            (owner_id, thesis_id, version, f"Judgment {version}", f"reason {version}"),
        )

    inbox = await build_decision_inbox(owner_id)
    item = inbox["items"][0]
    assert item["id"].startswith("thesis-version-review:")
    assert item["quality_status"] == "UNKNOWN"
    assert item["evidence_refs"] == []
    assert "reason 2" in item["why_now"]
