from __future__ import annotations

import pytest

from app import config, database
from app.services.thesis import ThesisNotFoundError, create_thesis, update_claim
from app.services.thesis_challenge import challenge_thesis


class FixtureMarket:
    async def quote(self, ticker: str) -> dict[str, object]:
        return {"price": 100.0}

    async def fundamentals(self, ticker: str) -> list[dict[str, object]]:
        return []


@pytest.fixture
async def challenge_db(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "DB_PATH", tmp_path / "thesis-challenge.db")
    await database.init_db()
    owner_id = await database.execute("INSERT INTO users (email) VALUES ('owner@test.local')")
    other_id = await database.execute("INSERT INTO users (email) VALUES ('other@test.local')")
    await database.claim_unowned_data(owner_id)
    try:
        yield owner_id, other_id
    finally:
        await database.close_db()


async def _evidence(user_id: int, evidence_id: str) -> None:
    await database.execute(
        "INSERT INTO evidence_objects "
        "(user_id, evidence_id, kind, data_status, subject_type, subject_id, metric, value_json, "
        "source, as_of, retrieved_at, quality_flags_json, license_scope) "
        "VALUES (?, ?, 'observed_fact', 'OK', 'instrument', 'usAAPL', 'revenue', '70', "
        "'fixture.primary', '2026-06-30', '2026-08-12T00:00:00Z', '[]', 'fixture-only')",
        (user_id, evidence_id),
    )


@pytest.mark.asyncio
async def test_challenge_uses_only_owner_canonical_evidence_without_mutation(challenge_db) -> None:
    owner_id, other_id = challenge_db
    await _evidence(owner_id, "ev_owner_counter01")
    await _evidence(other_id, "ev_other_private01")
    created = await create_thesis(
        ticker="AAPL",
        title="Demand thesis",
        thesis="Demand remains resilient",
        assumptions=["Revenue growth remains positive"],
        claims=["Revenue will recover"],
        market=FixtureMarket(),
        user_id=owner_id,
        opposing_evidence_ids=["ev_owner_counter01"],
    )
    manual = next(claim for claim in created["claims"] if claim["kind"] == "manual")
    await update_claim(
        created["id"], manual["id"], "violated", "Counter evidence", owner_id,
        evidence_edges=[{
            "evidence_id": "ev_owner_counter01",
            "stance": "opposing",
            "valid_from": "2026-06-30",
            "valid_to": None,
            "observed_at": "2026-08-12T00:00:00Z",
        }],
    )
    before = {
        "edges": (await database.query_one(
            "SELECT COUNT(*) AS count FROM thesis_claim_evidence_edges WHERE user_id=?", (owner_id,),
        ))["count"],
        "events": (await database.query_one(
            "SELECT COUNT(*) AS count FROM thesis_claim_status_events WHERE user_id=?", (owner_id,),
        ))["count"],
        "versions": (await database.query_one(
            "SELECT COUNT(*) AS count FROM thesis_versions WHERE user_id=?", (owner_id,),
        ))["count"],
    }

    result = await challenge_thesis(created["id"], owner_id)

    assert result["thesis_id"] == created["id"]
    assert result["result_kind"] == "AI_INFERENCE"
    counter = result["strongest_counter_evidence"][0]
    assert counter["quality_status"] == "OK"
    assert counter["claim_id"] == manual["id"]
    assert [ref["evidence_id"] for ref in counter["evidence_refs"]] == ["ev_owner_counter01"]
    assert counter["evidence_refs"][0]["source"] == "fixture.primary"
    assert counter["evidence_refs"][0]["as_of"] == "2026-06-30"
    assert all(
        ref["evidence_id"] != "ev_other_private01"
        for section in ("strongest_counter_evidence", "omitted_variables", "fragile_assumptions")
        for item in result[section]
        for ref in item["evidence_refs"]
    )
    assert result["fragile_assumptions"][0]["result_kind"] == "AI_INFERENCE"
    assert result["fragile_assumptions"][0]["quality_status"] == "PARTIAL"

    after = {
        "edges": (await database.query_one(
            "SELECT COUNT(*) AS count FROM thesis_claim_evidence_edges WHERE user_id=?", (owner_id,),
        ))["count"],
        "events": (await database.query_one(
            "SELECT COUNT(*) AS count FROM thesis_claim_status_events WHERE user_id=?", (owner_id,),
        ))["count"],
        "versions": (await database.query_one(
            "SELECT COUNT(*) AS count FROM thesis_versions WHERE user_id=?", (owner_id,),
        ))["count"],
    }
    assert after == before
    with pytest.raises(ThesisNotFoundError):
        await challenge_thesis(created["id"], other_id)


@pytest.mark.asyncio
async def test_challenge_keeps_missing_evidence_unknown(challenge_db) -> None:
    owner_id, _ = challenge_db
    created = await create_thesis(
        ticker="AAPL",
        title="Unsupported thesis",
        thesis="A claim without evidence",
        assumptions=["Demand improves"],
        claims=["Margins expand"],
        market=FixtureMarket(),
        user_id=owner_id,
    )

    result = await challenge_thesis(created["id"], owner_id)

    assert result["overall_status"] == "UNKNOWN"
    assert result["strongest_counter_evidence"][0]["quality_status"] == "UNKNOWN"
    assert result["strongest_counter_evidence"][0]["evidence_refs"] == []
    assert result["omitted_variables"]
    assert all(item["quality_status"] == "UNKNOWN" for item in result["omitted_variables"])
    assert all(item["evidence_refs"] == [] for item in result["omitted_variables"])
    assert result["fragile_assumptions"][0]["quality_status"] == "UNKNOWN"
