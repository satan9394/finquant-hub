"""Deterministic tests for GET /api/usage/records (session-level detail)."""

import hashlib

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app import config, database
from app.main import app


@pytest_asyncio.fixture
async def records_client(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "DB_PATH", tmp_path / "usage-records.db")
    monkeypatch.setattr(config, "LOCAL_ONLY_MODE", False)
    monkeypatch.setattr(config, "SCHEDULER_ENABLED", False)
    async with app.router.lifespan_context(app):
        owner_id = await database.execute(
            "INSERT INTO users (email, is_admin) VALUES ('usage-owner@test.local', 1)"
        )
        other_id = await database.execute(
            "INSERT INTO users (email) VALUES ('usage-other@test.local')"
        )
        await database.claim_unowned_data(owner_id)
        await database.seed_models_for_user(owner_id)
        await database.seed_models_for_user(other_id)

        token = "usage-owner-token"
        await database.execute(
            "INSERT INTO sessions (user_id, token_hash, expires_at) "
            "VALUES (?, ?, datetime('now', '+1 day'))",
            (owner_id, hashlib.sha256(token.encode()).hexdigest()),
        )

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            auth = {"Cookie": f"{config.AUTH_COOKIE_NAME}={token}"}
            yield client, auth, owner_id, other_id


@pytest.mark.asyncio
async def test_records_scoped_to_user_newest_first_and_bounded(records_client):
    client, auth, owner_id, other_id = records_client

    # owner has three records; other user has one that must never leak.
    for i in range(3):
        await database.execute(
            "INSERT INTO llm_usage "
            "(session_type, conversation_id, model_name, prompt_tokens, completion_tokens, total_tokens, user_id, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (
                "research" if i % 2 == 0 else "chat",
                None if i % 2 == 0 else 200 + i,
                f"model-{i}",
                10 * (i + 1),
                5 * (i + 1),
                15 * (i + 1),
                owner_id,
                f"2026-09-{(i + 1):02d} 00:00:00",
            ),
        )
    await database.execute(
        "INSERT INTO llm_usage (session_type, model_name, total_tokens, user_id, created_at) "
        "VALUES ('chat', 'leak-model', 999, ?, '2026-09-09 00:00:00')",
        (other_id,),
    )

    response = await client.get("/api/usage/records", params={"limit": 2}, headers=auth)
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 3
    assert len(body["items"]) == 2
    # newest first (limit 2) — no record from the other user.
    assert [item["id"] for item in body["items"]] == [3, 2]
    assert all(item["total_tokens"] > 0 for item in body["items"])
    for item in body["items"]:
        assert "session_type" in item and "model_name" in item
        assert "created_at" in item


@pytest.mark.asyncio
async def test_records_session_type_filter(records_client):
    client, auth, owner_id, _other_id = records_client
    await database.execute(
        "INSERT INTO llm_usage (session_type, model_name, prompt_tokens, completion_tokens, total_tokens, user_id, created_at) "
        "VALUES ('research', 'a', 1, 1, 2, ?, '2026-09-01 00:00:00')",
        (owner_id,),
    )
    await database.execute(
        "INSERT INTO llm_usage (session_type, model_name, prompt_tokens, completion_tokens, total_tokens, user_id, created_at) "
        "VALUES ('chat', 'b', 1, 1, 2, ?, '2026-09-02 00:00:00')",
        (owner_id,),
    )

    response = await client.get(
        "/api/usage/records", params={"limit": 50, "session_type": "chat"}, headers=auth
    )
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert [item["session_type"] for item in body["items"]] == ["chat"]
