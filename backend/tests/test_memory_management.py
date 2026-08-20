from __future__ import annotations

import hashlib

from httpx import ASGITransport, AsyncClient
import pytest
import pytest_asyncio

from app import config, database
from app.main import app
from app.services.investment_memory import create_memory, get_memory


@pytest_asyncio.fixture
async def management_client(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "DB_PATH", tmp_path / "memory-management.db")
    monkeypatch.setattr(config, "LOCAL_ONLY_MODE", False)
    monkeypatch.setattr(config, "MEMORY_CANDIDATE_EXTRACTION_ENABLED", False)
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            owner_id = await database.execute("INSERT INTO users (email) VALUES ('owner@test.local')")
            other_id = await database.execute("INSERT INTO users (email) VALUES ('other@test.local')")
            await database.claim_unowned_data(owner_id)
            token = "memory-management-session"
            await database.execute(
                "INSERT INTO sessions (user_id, token_hash, expires_at) "
                "VALUES (?, ?, datetime('now', '+1 day'))",
                (owner_id, hashlib.sha256(token.encode()).hexdigest()),
            )
            client.cookies.set(config.AUTH_COOKIE_NAME, token)
            yield client, owner_id, other_id
    database._db = None


async def _candidate(user_id: int, subject_id: str = "usAAPL") -> dict:
    return await create_memory(
        user_id=user_id,
        subject_type="instrument",
        subject_id=subject_id,
        memory_type="hypothesis",
        information_kind="AI_INFERENCE",
        content={"text": "candidate"},
        source_kind="ai",
        source_id="research_report:1",
        status="candidate",
        quality_flags=["UNVERIFIED"],
        created_by="ai",
    )


@pytest.mark.asyncio
async def test_list_confirm_invalidate_and_owner_boundary(management_client) -> None:
    client, owner_id, other_id = management_client
    own = await _candidate(owner_id)
    foreign = await _candidate(other_id, "hk00700")

    listed = await client.get("/api/research/memory")
    assert listed.status_code == 200
    assert [item["id"] for item in listed.json()["items"]] == [own["id"]]

    confirmed = await client.patch(
        f"/api/research/memory/{own['id']}",
        json={"action": "confirm", "confidence": 0.7, "quality_flags": ["USER_CONFIRMED"]},
    )
    assert confirmed.status_code == 200
    assert confirmed.json()["status"] == "confirmed"
    assert confirmed.json()["confidence"] == 0.7

    invalidated = await client.patch(
        f"/api/research/memory/{own['id']}", json={"action": "invalidate"}
    )
    assert invalidated.status_code == 200
    assert invalidated.json()["status"] == "invalidated"
    assert (await client.patch(
        f"/api/research/memory/{foreign['id']}", json={"action": "confirm"}
    )).status_code == 404


@pytest.mark.asyncio
async def test_edit_supersedes_and_delete_is_single_record_soft_delete(management_client) -> None:
    client, owner_id, _other_id = management_client
    old = await _candidate(owner_id)

    edited = await client.patch(
        f"/api/research/memory/{old['id']}",
        json={"action": "edit", "content": {"text": "user corrected candidate"}},
    )
    assert edited.status_code == 200
    replacement = edited.json()
    assert replacement["id"] != old["id"]
    assert replacement["supersedes_id"] == old["id"]
    assert replacement["information_kind"] == "USER_HYPOTHESIS"
    assert replacement["source_kind"] == "user"
    assert replacement["source_id"] is None
    retained = await get_memory(old["id"], user_id=owner_id)
    assert retained is not None and retained["status"] == "superseded"

    deleted = await client.delete(f"/api/research/memory/{replacement['id']}")
    assert deleted.json() == {
        "id": replacement["id"],
        "deleted": True,
        "scope": "memory_record_only",
        "mode": "soft_delete",
    }
    stored = await get_memory(replacement["id"], user_id=owner_id)
    assert stored is not None and stored["status"] == "deleted"
    assert (await client.delete(f"/api/research/memory/{old['id'] + 9999}")).status_code == 404


@pytest.mark.asyncio
async def test_export_is_owner_scoped_allowlist_with_status_history(management_client) -> None:
    client, owner_id, other_id = management_client
    own = await _candidate(owner_id)
    await _candidate(other_id, "hk00700")
    await client.delete(f"/api/research/memory/{own['id']}")

    response = await client.get("/api/research/memory/export")
    assert response.status_code == 200
    payload = response.json()
    assert payload["schema_version"] == "typed-investment-memory-export-v1"
    assert payload["record_count"] == 1
    assert payload["records"][0]["id"] == own["id"]
    assert payload["records"][0]["status"] == "deleted"
    assert "user_id" not in payload["records"][0]
    forbidden = {"email", "token", "credential", "reasoning", "agent_results"}
    assert forbidden.isdisjoint(payload["records"][0])
