from __future__ import annotations

import sqlite3

import pytest

from app import config, database
from app.services.thesis import (
    ThesisConflictError,
    check_thesis,
    create_thesis,
    get_thesis,
    update_claim,
)


class StatefulMarket:
    def __init__(self, price: float = 100.0, *, sourced: bool = True):
        self.price = price
        self.sourced = sourced

    async def quote(self, ticker: str) -> dict[str, object]:
        result: dict[str, object] = {"price": self.price}
        if self.sourced:
            result.update({
                "code": ticker,
                "source": "fixture-provider",
                "currency": "USD",
                "market": "US",
                "license_scope": "fixture-only",
            })
        return result

    async def fundamentals(self, ticker: str) -> list[dict[str, object]]:
        return []


@pytest.fixture
async def evidence_db(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "DB_PATH", tmp_path / "thesis-evidence.db")
    await database.init_db()
    owner_id = await database.execute("INSERT INTO users (email) VALUES ('owner@test.local')")
    other_id = await database.execute("INSERT INTO users (email) VALUES ('other@test.local')")
    await database.claim_unowned_data(owner_id)
    try:
        yield owner_id, other_id
    finally:
        await database.close_db()


async def _evidence(user_id: int, evidence_id: str, value: str = "1") -> None:
    await database.execute(
        "INSERT INTO evidence_objects "
        "(user_id, evidence_id, kind, data_status, subject_type, subject_id, metric, value_json, "
        "source, retrieved_at, license_scope) "
        "VALUES (?, ?, 'observed_fact', 'OK', 'instrument', 'usAAPL', 'fixture_metric', ?, "
        "'fixture', '2026-08-12T00:00:00Z', 'test-only')",
        (user_id, evidence_id, value),
    )


def _manual_claim(thesis: dict[str, object]) -> dict[str, object]:
    claims = thesis["claims"]
    assert isinstance(claims, list)
    return next(claim for claim in claims if claim["kind"] == "manual")


@pytest.mark.asyncio
async def test_manual_event_and_temporal_edges_are_owner_scoped_and_retained(evidence_db) -> None:
    owner_id, other_id = evidence_db
    await _evidence(owner_id, "ev_owner_edge01")
    await _evidence(owner_id, "ev_owner_edge02")
    await _evidence(other_id, "ev_other_edge01")
    created = await create_thesis(
        ticker="AAPL", title="Edge thesis", thesis="Fixture judgment", assumptions=[],
        claims=["Fixture claim"], market=StatefulMarket(), user_id=owner_id,
    )
    claim_id = int(_manual_claim(created)["id"])
    initial_event = _manual_claim(created)["status_events"][0]
    assert initial_event["from_status"] is None
    assert initial_event["to_status"] == "unknown"
    assert initial_event["trigger_kind"] == "initial_create"

    updated = await update_claim(
        created["id"], claim_id, "confirmed", "Supported by fixture evidence", owner_id,
        evidence_edges=[{
            "evidence_id": "ev_owner_edge01",
            "stance": "supporting",
            "valid_from": "2026-08-01T00:00:00Z",
            "valid_to": None,
            "observed_at": "2026-08-12T00:00:00Z",
        }],
    )
    claim = _manual_claim(updated)
    assert claim["status"] == "confirmed"
    assert claim["evidence_edges"][0]["evidence_id"] == "ev_owner_edge01"
    assert claim["evidence_edges"][0]["valid_from"] == "2026-08-01T00:00:00Z"
    assert claim["status_events"][-1]["trigger_kind"] == "manual"
    assert claim["status_events"][-1]["evidence_id"] == "ev_owner_edge01"

    replaced = await update_claim(
        created["id"], claim_id, "confirmed", "Newer fixture evidence", owner_id,
        evidence_edges=[{
            "evidence_id": "ev_owner_edge02", "stance": "supporting",
            "valid_from": "2026-08-12T00:00:00Z", "valid_to": None,
            "observed_at": "2026-08-12T00:00:00Z",
        }],
    )
    edges = _manual_claim(replaced)["evidence_edges"]
    assert [edge["status"] for edge in edges] == ["active", "superseded"]
    assert edges[1]["valid_to"] is not None

    with pytest.raises(ThesisConflictError, match="evidence"):
        await update_claim(
            created["id"], claim_id, "violated", "Cross-owner attempt", owner_id,
            evidence_edges=[{
                "evidence_id": "ev_other_edge01", "stance": "opposing",
                "valid_from": None, "valid_to": None, "observed_at": None,
            }],
        )
    unchanged = _manual_claim(await get_thesis(created["id"], owner_id))
    assert unchanged["status"] == "confirmed"

    with pytest.raises(sqlite3.IntegrityError, match="CHECK constraint failed"):
        await database.get_db().execute(
            "INSERT INTO thesis_claim_status_events "
            "(user_id, thesis_id, claim_id, from_status, to_status, actor, trigger_kind, reason) "
            "VALUES (?, ?, ?, 'unknown', 'holding', 'system', 'deterministic_check', 'no evidence')",
            (owner_id, created["id"], claim_id),
        )


@pytest.mark.asyncio
async def test_automatic_status_requires_current_canonical_evidence(evidence_db) -> None:
    owner_id, _ = evidence_db
    market = StatefulMarket(price=100.0, sourced=True)
    created = await create_thesis(
        ticker="AAPL", title="Drift thesis", thesis="Price should remain stable", assumptions=[],
        claims=[], market=market, user_id=owner_id,
    )
    market.price = 130.0
    checked = await check_thesis(created["id"], market, owner_id)
    price_claim = next(claim for claim in checked["claims"] if claim["kind"] == "price")
    assert price_claim["status"] == "violated"
    assert price_claim["evidence_edges"][0]["stance"] == "opposing"
    event = price_claim["status_events"][-1]
    assert event["trigger_kind"] == "deterministic_check"
    assert event["evidence_id"].startswith("ev_")

    market.price = 150.0
    market.sourced = False
    unknown = await check_thesis(created["id"], market, owner_id)
    price_claim = next(claim for claim in unknown["claims"] if claim["kind"] == "price")
    assert price_claim["status"] == "unknown"
    event = price_claim["status_events"][-1]
    assert event["to_status"] == "unknown"
    assert event["evidence_id"] is None
    assert "canonical evidence" in event["reason"]
