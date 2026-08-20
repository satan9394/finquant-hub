from __future__ import annotations

import pytest

from app import config, database
from app.services.thesis import (
    ThesisNotFoundError,
    confirm_thesis_version,
    create_thesis,
    list_thesis_versions,
    update_thesis,
)


class FixtureMarket:
    async def quote(self, ticker: str) -> dict[str, object]:
        return {"price": 100.0}

    async def fundamentals(self, ticker: str) -> list[dict[str, object]]:
        return []


@pytest.fixture
async def history_db(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "DB_PATH", tmp_path / "thesis-history.db")
    await database.init_db()
    owner_id = await database.execute("INSERT INTO users (email) VALUES ('owner@test.local')")
    other_id = await database.execute("INSERT INTO users (email) VALUES ('other@test.local')")
    await database.claim_unowned_data(owner_id)
    try:
        yield owner_id, other_id
    finally:
        await database.close_db()


@pytest.mark.asyncio
async def test_version_diff_confidence_reason_and_append_only_confirmation(history_db) -> None:
    owner_id, other_id = history_db
    created = await create_thesis(
        ticker="AAPL", title="History", thesis="Initial judgment",
        assumptions=["Initial assumption"], claims=["Initial claim"],
        market=FixtureMarket(), user_id=owner_id, confidence=0.4,
    )
    await update_thesis(
        created["id"], owner_id, title="History", thesis="Revised judgment",
        assumptions=["Revised assumption"], status="open", claims=["Revised claim"],
        confidence=0.7, confidence_provided=True,
        change_reason="New canonical evidence changed confidence",
    )

    versions = await list_thesis_versions(created["id"], owner_id)
    latest = versions[0]
    assert latest["version"] == 2
    assert latest["diff_from_previous"]["judgment"] == {
        "from": "Initial judgment", "to": "Revised judgment",
    }
    assert latest["diff_from_previous"]["confidence"] == {
        "from": 0.4, "to": 0.7,
        "reason": "New canonical evidence changed confidence",
    }
    assert latest["confirmations"] == []

    before = await database.query_one(
        "SELECT thesis, drift_status FROM thesis WHERE id=? AND user_id=?",
        (created["id"], owner_id),
    )
    first = await confirm_thesis_version(
        created["id"], 2, owner_id, decision="acknowledged", reason="Reviewed source evidence",
    )
    second = await confirm_thesis_version(
        created["id"], 2, owner_id, decision="disputed", reason="Assumption remains uncertain",
    )
    assert first["decision"] == "acknowledged"
    assert second["decision"] == "disputed"
    versions = await list_thesis_versions(created["id"], owner_id)
    assert [item["decision"] for item in versions[0]["confirmations"]] == [
        "acknowledged", "disputed",
    ]
    assert await database.query_one(
        "SELECT thesis, drift_status FROM thesis WHERE id=? AND user_id=?",
        (created["id"], owner_id),
    ) == before
    assert versions[0]["confidence"] == 0.7

    with pytest.raises(ThesisNotFoundError):
        await confirm_thesis_version(
            created["id"], 2, other_id, decision="acknowledged", reason="Cross-owner",
        )
    assert await list_thesis_versions(created["id"], other_id) == []
