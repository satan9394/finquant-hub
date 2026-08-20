from __future__ import annotations

import hashlib

from httpx import ASGITransport, AsyncClient
import pytest
import pytest_asyncio

from app import config, database
from app.main import app
from app.services.memory_capture import (
    extract_research_candidates,
    flush_memory_candidates,
    schedule_research_candidates,
)


@pytest_asyncio.fixture
async def memory_client(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "DB_PATH", tmp_path / "memory-capture.db")
    monkeypatch.setattr(config, "LOCAL_ONLY_MODE", False)
    monkeypatch.setattr(config, "MEMORY_CANDIDATE_EXTRACTION_ENABLED", False)
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            user_id = await database.execute(
                "INSERT INTO users (email, is_admin) VALUES ('memory-capture@test.local', 1)"
            )
            await database.claim_unowned_data(user_id)
            token = "memory-capture-session"
            await database.execute(
                "INSERT INTO sessions (user_id, token_hash, expires_at) "
                "VALUES (?, ?, datetime('now', '+1 day'))",
                (user_id, hashlib.sha256(token.encode()).hexdigest()),
            )
            client.cookies.set(config.AUTH_COOKIE_NAME, token)
            yield client, user_id
    database._db = None


def test_extractor_is_bounded_and_skips_unknown() -> None:
    result = extract_research_candidates({
        "executive_summary": "unknown（当前证据不足）",
        "risk_analysis": "R" * 2500,
    })

    assert result == [{
        "memory_type": "risk_concern",
        "content": {"field": "risk_analysis", "text": "R" * 2000},
    }]


@pytest.mark.asyncio
async def test_disabled_switch_does_not_schedule_or_write(memory_client) -> None:
    _client, user_id = memory_client
    scheduled = schedule_research_candidates(
        7,
        "usAAPL",
        {"executive_summary": "AI thesis"},
        user_id,
    )
    await flush_memory_candidates()

    assert scheduled is False
    assert await database.query_one("SELECT COUNT(*) AS n FROM memory_records") == {"n": 0}


@pytest.mark.asyncio
async def test_enabled_background_capture_is_candidate_only_and_idempotent(
    memory_client,
    monkeypatch,
) -> None:
    _client, user_id = memory_client
    monkeypatch.setattr(config, "MEMORY_CANDIDATE_EXTRACTION_ENABLED", True)
    report = {
        "timestamp": "2026-08-11T12:00:00-07:00",
        "executive_summary": "AI-generated thesis",
        "risk_analysis": "AI-generated risk",
    }

    assert schedule_research_candidates(8, "usAAPL", report, user_id) is True
    await flush_memory_candidates()
    assert schedule_research_candidates(8, "usAAPL", report, user_id) is True
    await flush_memory_candidates()

    rows = await database.query_all(
        "SELECT user_id, subject_id, memory_type, information_kind, source_kind, source_id, "
        "status, quality_flags_json FROM memory_records ORDER BY memory_type"
    )
    assert len(rows) == 2
    assert {row["memory_type"] for row in rows} == {"hypothesis", "risk_concern"}
    assert all(row["user_id"] == user_id for row in rows)
    assert all(row["subject_id"] == "usAAPL" for row in rows)
    assert all(row["information_kind"] == "AI_INFERENCE" for row in rows)
    assert all(row["source_kind"] == "ai" for row in rows)
    assert all(row["source_id"] == "research_report:8" for row in rows)
    assert all(row["status"] == "candidate" for row in rows)
    assert all(row["quality_flags_json"] == '["AI_GENERATED", "UNVERIFIED"]' for row in rows)


@pytest.mark.asyncio
async def test_explicit_save_api_confirms_user_hypothesis_but_rejects_fact_without_evidence(
    memory_client,
) -> None:
    client, user_id = memory_client
    payload = {
        "subject_type": "instrument",
        "subject_id": "usAAPL",
        "memory_type": "hypothesis",
        "information_kind": "USER_HYPOTHESIS",
        "content": {"claim": "services mix may expand margins"},
        "confidence": 0.55,
        "quality_flags": ["USER_STATED"],
    }
    response = await client.post("/api/research/memory", json=payload)

    assert response.status_code == 201
    saved = response.json()
    assert saved["user_id"] == user_id
    assert saved["status"] == "confirmed"
    assert saved["source_kind"] == "user"
    assert saved["information_kind"] == "USER_HYPOTHESIS"

    fact = {**payload, "memory_type": "evidence_reference", "information_kind": "FACT"}
    rejected = await client.post("/api/research/memory", json=fact)
    assert rejected.status_code == 422
    assert rejected.json()["detail"] == "confirmed FACT 必须引用 evidence"
