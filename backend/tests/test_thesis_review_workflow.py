from __future__ import annotations

import sqlite3

import pytest

from app import config, database
from app.main import app
from app.services import thesis as thesis_service
from app.services.thesis import (
    ThesisNotFoundError,
    check_thesis,
    create_thesis,
    decide_thesis_review,
    list_thesis_reviews,
)


class ReviewMarket:
    def __init__(self, price: float = 100.0) -> None:
        self.price = price
        self.error: Exception | None = None

    async def quote(self, ticker: str) -> dict[str, object]:
        if self.error is not None:
            raise self.error
        return {
            "code": ticker,
            "price": self.price,
            "source": "fixture-provider",
            "currency": "USD",
            "market": "US",
            "license_scope": "fixture-only",
        }

    async def fundamentals(self, ticker: str) -> list[dict[str, object]]:
        return []


@pytest.fixture
async def review_db(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "DB_PATH", tmp_path / "thesis-review.db")
    await database.init_db()
    owner_id = await database.execute("INSERT INTO users (email) VALUES ('owner@test.local')")
    other_id = await database.execute("INSERT INTO users (email) VALUES ('other@test.local')")
    await database.claim_unowned_data(owner_id)
    try:
        yield owner_id, other_id
    finally:
        await database.close_db()


@pytest.mark.asyncio
async def test_review_persists_deterministic_change_and_idempotent_user_decision(review_db) -> None:
    owner_id, other_id = review_db
    market = ReviewMarket()
    created = await create_thesis(
        ticker="AAPL", title="Review", thesis="Price should remain stable",
        assumptions=[], claims=[], market=market, user_id=owner_id,
    )
    original_version = created["current_version"]
    market.price = 130.0

    await check_thesis(created["id"], market, owner_id)
    reviews = await list_thesis_reviews(created["id"], owner_id)
    assert len(reviews) == 1
    review = reviews[0]
    assert review["status"] == "pending"
    assert review["quality_status"] == "OK"
    assert review["engine_version"] == "thesis-drift/v1"
    price_change = next(item for item in review["changes"] if item["kind"] == "price")
    assert price_change["result_kind"] == "COMPUTED_RESULT"
    assert price_change["from_status"] == "unknown"
    assert price_change["to_status"] == "violated"
    assert price_change["current_evidence_ids"]
    assert set(price_change["current_evidence_ids"]) <= set(review["evidence_ids"])
    assert [event["event_type"] for event in review["events"]] == ["created"]

    first = await decide_thesis_review(
        created["id"], review["id"], owner_id,
        decision="acknowledged", reason="Reviewed fixture evidence",
    )
    repeated = await decide_thesis_review(
        created["id"], review["id"], owner_id,
        decision="acknowledged", reason="Reviewed fixture evidence",
    )
    assert first["status"] == "acknowledged"
    assert repeated["events"][-1]["id"] == first["events"][-1]["id"]
    assert [event["event_type"] for event in repeated["events"]] == [
        "created", "acknowledged",
    ]
    assert repeated["thesis_version_id"] == original_version["id"]

    with pytest.raises(ThesisNotFoundError):
        await decide_thesis_review(
            created["id"], review["id"], other_id,
            decision="disputed", reason="Cross-owner attempt",
        )
    assert await list_thesis_reviews(created["id"], other_id) == []


@pytest.mark.asyncio
async def test_failed_check_is_append_only_and_does_not_erase_pending_review(
    review_db, monkeypatch,
) -> None:
    owner_id, _ = review_db
    market = ReviewMarket()
    created = await create_thesis(
        ticker="AAPL", title="Failure", thesis="Keep persisted state",
        assumptions=[], claims=[], market=market, user_id=owner_id,
    )
    market.price = 130.0
    await check_thesis(created["id"], market, owner_id)
    pending = (await list_thesis_reviews(created["id"], owner_id))[0]

    async def fail_snapshot(*args, **kwargs):
        raise RuntimeError("fixture upstream unavailable")

    monkeypatch.setattr(thesis_service, "_snapshot", fail_snapshot)
    with pytest.raises(RuntimeError, match="fixture upstream unavailable"):
        await check_thesis(created["id"], market, owner_id)

    reviews = await list_thesis_reviews(created["id"], owner_id)
    assert [item["status"] for item in reviews] == ["failed", "pending"]
    assert reviews[0]["quality_status"] == "UPSTREAM_ERROR"
    assert reviews[0]["error"] == "RuntimeError: fixture upstream unavailable"
    assert reviews[0]["changes"] == []
    assert reviews[1]["id"] == pending["id"]
    assert reviews[1]["status"] == "pending"

    failed_event_id = reviews[0]["events"][0]["id"]
    with pytest.raises(sqlite3.IntegrityError, match="immutable"):
        await database.execute(
            "UPDATE thesis_review_events SET reason='changed' WHERE id=?",
            (failed_event_id,),
        )


def test_openapi_exposes_review_history_and_decision() -> None:
    paths = app.openapi()["paths"]
    assert paths["/api/thesis/{thesis_id}/reviews"]["get"]["tags"] == ["thesis"]
    assert paths["/api/thesis/{thesis_id}/reviews/{review_id}/decide"]["post"]["tags"] == ["thesis"]
