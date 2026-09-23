from __future__ import annotations

import sqlite3

import pytest

from app import config, database
from app.services.investment_memory import (
    create_memory,
    delete_memory,
    get_memory,
    list_memories,
    supersede_memory,
    update_memory,
)


@pytest.fixture
async def memory_db(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "DB_PATH", tmp_path / "investment-memory.db")
    await database.init_db()
    owner_id = await database.execute("INSERT INTO users (email) VALUES ('owner@test.local')")
    other_id = await database.execute("INSERT INTO users (email) VALUES ('other@test.local')")
    await database.claim_unowned_data(owner_id)
    try:
        yield owner_id, other_id
    finally:
        await database.close_db()


async def _insert_evidence(user_id: int, evidence_id: str) -> None:
    await database.execute(
        "INSERT INTO evidence_objects "
        "(user_id, evidence_id, kind, data_status, subject_type, subject_id, metric, "
        "value_json, source, retrieved_at, license_scope) "
        "VALUES (?, ?, 'observed_fact', 'OK', 'instrument', 'AAPL', 'price', "
        "'189.50', 'fixture', '2026-08-11T00:00:00Z', 'test-only')",
        (user_id, evidence_id),
    )


@pytest.mark.asyncio
async def test_memory_crud_is_typed_owner_scoped_and_soft_deleted(memory_db) -> None:
    owner_id, other_id = memory_db
    created = await create_memory(
        user_id=owner_id,
        subject_type="instrument",
        subject_id="AAPL",
        memory_type="hypothesis",
        information_kind="USER_HYPOTHESIS",
        content={"claim": "margin expansion needs confirmation"},
        source_kind="user",
        created_by="user",
        confidence=0.4,
        quality_flags=["UNVERIFIED"],
    )

    assert created["status"] == "candidate"
    assert created["content"] == {"claim": "margin expansion needs confirmation"}
    assert created["quality_flags"] == ["UNVERIFIED"]
    assert await get_memory(created["id"], user_id=other_id) is None
    assert await list_memories(user_id=other_id) == []

    updated = await update_memory(
        created["id"],
        user_id=owner_id,
        content={"claim": "watch gross margin after earnings"},
        confidence=0.6,
    )
    assert updated is not None
    assert updated["content"] == {"claim": "watch gross margin after earnings"}
    assert updated["confidence"] == 0.6
    assert await delete_memory(created["id"], user_id=other_id) is False
    assert await delete_memory(created["id"], user_id=owner_id) is True
    assert await list_memories(user_id=owner_id) == []
    assert len(await list_memories(user_id=owner_id, include_deleted=True)) == 1


@pytest.mark.asyncio
async def test_confirmed_fact_requires_same_owner_evidence(memory_db) -> None:
    owner_id, other_id = memory_db
    with pytest.raises(sqlite3.IntegrityError):
        await create_memory(
            user_id=owner_id,
            subject_type="instrument",
            subject_id="AAPL",
            memory_type="evidence_reference",
            information_kind="FACT",
            content={"price": 189.5},
            source_kind="evidence",
            created_by="system",
            status="confirmed",
        )

    await _insert_evidence(other_id, "ev_other001")
    with pytest.raises(sqlite3.IntegrityError):
        await create_memory(
            user_id=owner_id,
            subject_type="instrument",
            subject_id="AAPL",
            memory_type="evidence_reference",
            information_kind="FACT",
            content={"price": 189.5},
            source_kind="evidence",
            evidence_id="ev_other001",
            created_by="system",
            status="confirmed",
        )

    await _insert_evidence(owner_id, "ev_owner001")
    confirmed = await create_memory(
        user_id=owner_id,
        subject_type="instrument",
        subject_id="AAPL",
        memory_type="evidence_reference",
        information_kind="FACT",
        content={"price": 189.5},
        source_kind="evidence",
        evidence_id="ev_owner001",
        created_by="system",
        status="confirmed",
    )
    assert confirmed["evidence_id"] == "ev_owner001"


@pytest.mark.asyncio
async def test_supersession_retains_history_and_owner_boundary(memory_db) -> None:
    owner_id, other_id = memory_db
    old = await create_memory(
        user_id=owner_id,
        subject_type="strategy",
        subject_id="quality-growth",
        memory_type="decision",
        information_kind="USER_HYPOTHESIS",
        content={"state": "consider"},
        source_kind="user",
        created_by="user",
    )

    assert await supersede_memory(
        old["id"], user_id=other_id, content={"state": "reject"}
    ) is None
    replacement = await supersede_memory(
        old["id"], user_id=owner_id, content={"state": "approved"}
    )
    assert replacement is not None
    assert replacement["supersedes_id"] == old["id"]
    assert replacement["content"] == {"state": "approved"}
    retained = await get_memory(old["id"], user_id=owner_id)
    assert retained is not None
    assert retained["status"] == "superseded"
    assert await supersede_memory(
        old["id"], user_id=owner_id, content={"state": "duplicate"}
    ) is None
