import hashlib
import sqlite3

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app import config, database
from app.main import app
from app.services.notifications import publish_notification


@pytest_asyncio.fixture
async def isolated_users(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "DB_PATH", tmp_path / "isolation.db")
    # 用 session cookie 区分两个用户，必须显式关闭 local-only；
    # 否则继承 backend/.env 的 LOCAL_ONLY_MODE=true 会让所有请求落为同一本地所有者，
    # 跨用户隔离断言（second 看不到 first 的数据）必然失败。
    monkeypatch.setattr(config, "LOCAL_ONLY_MODE", False)
    monkeypatch.setattr(config, "SCHEDULER_ENABLED", False)
    async with app.router.lifespan_context(app):
        first_id = await database.execute(
            "INSERT INTO users (email, is_admin) VALUES ('owner-one@test.local', 1)"
        )
        second_id = await database.execute(
            "INSERT INTO users (email) VALUES ('owner-two@test.local')"
        )
        await database.claim_unowned_data(first_id)
        await database.seed_models_for_user(second_id)

        tokens = {first_id: "owner-one-token", second_id: "owner-two-token"}
        for user_id, token in tokens.items():
            await database.execute(
                "INSERT INTO sessions (user_id, token_hash, expires_at) "
                "VALUES (?, ?, datetime('now', '+1 day'))",
                (user_id, hashlib.sha256(token.encode()).hexdigest()),
            )

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            def auth(user_id: int) -> dict[str, str]:
                return {"Cookie": f"{config.AUTH_COOKIE_NAME}={tokens[user_id]}"}

            yield client, auth, first_id, second_id


@pytest.mark.asyncio
async def test_every_user_data_table_has_owner_index_and_required_owner_triggers(isolated_users):
    _client, _auth, first_id, _second_id = isolated_users
    schema_rows = await database.query_all(
        "SELECT name, type FROM sqlite_master WHERE type IN ('index', 'trigger')"
    )
    schema_objects = {(row["type"], row["name"]) for row in schema_rows}

    for table in database._OWNER_TABLES:
        columns = await database.query_all(f"PRAGMA table_info({table})")
        assert "user_id" in {column["name"] for column in columns}, table
        assert ("index", f"idx_{table}_user_id") in schema_objects, table
        assert ("trigger", f"require_{table}_owner_insert") in schema_objects, table
        assert ("trigger", f"require_{table}_owner_update") in schema_objects, table

    with pytest.raises(sqlite3.IntegrityError, match="model_configs.user_id is required"):
        await database.execute(
            "INSERT INTO model_configs (name, base_url, model_name) VALUES ('ownerless', 'x', 'x')"
        )

    await publish_notification("same-key", "one", "one", user_id=first_id, dedupe_key="shared")
    await publish_notification("same-key", "two", "two", user_id=_second_id, dedupe_key="shared")
    rows = await database.query_all(
        "SELECT user_id FROM notifications WHERE dedupe_key='shared' ORDER BY user_id"
    )
    assert [row["user_id"] for row in rows] == [first_id, _second_id]


@pytest.mark.asyncio
async def test_cross_user_reads_and_writes_are_rejected(isolated_users):
    client, auth, first_id, second_id = isolated_users
    first = auth(first_id)
    second = auth(second_id)

    portfolio = (await client.post(
        "/api/portfolio", headers=first, json={"name": "Private portfolio"}
    )).json()
    conversation = (await client.post(
        "/api/chat/sessions", headers=first, json={"title": "Private conversation"}
    )).json()
    rule = (await client.post(
        "/api/alerts/rules",
        headers=first,
        json={"name": "Private alert", "ticker": "AAPL", "signal_type": "golden_cross"},
    )).json()
    workspace_body = {
        "name": "Apple",
        "instrument": {"symbol": "usAAPL"},
        "notes": "owner one notes",
        "evidence": [],
    }
    assert (await client.put(
        "/api/instruments/AAPL/workspace", headers=first, json=workspace_body
    )).status_code == 200
    job = (await client.post(
        "/api/settings/research-jobs",
        headers=first,
        json={
            "name": "Private job",
            "ticker": "AAPL",
            "company_name": "Apple",
            "cron_expr": "0 8 * * *",
            "is_enabled": False,
        },
    )).json()
    report_id = await database.execute(
        "INSERT INTO research_reports (ticker, company_name, report_data, status, user_id) "
        "VALUES ('usAAPL', 'Apple', '{}', 'completed', ?)",
        (first_id,),
    )
    thesis_id = await database.execute(
        "INSERT INTO thesis (ticker, title, thesis, user_id) VALUES ('usAAPL', 'Private thesis', 'text', ?)",
        (first_id,),
    )
    notification = await publish_notification(
        "private", "Private notification", "body", user_id=first_id
    )
    await database.execute(
        "INSERT INTO llm_usage (session_type, total_tokens, user_id) VALUES ('chat', 99, ?)",
        (first_id,),
    )
    first_model = (await client.get("/api/models", headers=first)).json()["items"][0]

    assert (await client.get("/api/portfolio", headers=second)).json()["items"] == []
    assert (await client.get(f"/api/portfolio/{portfolio['id']}", headers=second)).status_code == 404
    assert (await client.put(
        f"/api/portfolio/{portfolio['id']}", headers=second, json={"name": "stolen"}
    )).status_code == 404
    assert (await client.get("/api/chat/sessions", headers=second)).json()["items"] == []
    assert (await client.get(
        f"/api/chat/sessions/{conversation['id']}/messages", headers=second
    )).status_code == 404
    assert (await client.get("/api/alerts/rules", headers=second)).json()["items"] == []
    assert (await client.delete(f"/api/alerts/rules/{rule['id']}", headers=second)).status_code == 404
    assert (await client.get("/api/research", headers=second)).json()["items"] == []
    assert (await client.get(f"/api/research/{report_id}", headers=second)).status_code == 404
    assert (await client.get("/api/thesis", headers=second)).json()["items"] == []
    assert (await client.get(f"/api/thesis/{thesis_id}", headers=second)).status_code == 404
    assert (await client.put(
        f"/api/models/{first_model['id']}", headers=second, json={"name": "stolen"}
    )).status_code == 404
    assert (await client.get("/api/settings/research-jobs", headers=second)).json()["items"] == []
    assert (await client.patch(
        f"/api/settings/research-jobs/{job['id']}", headers=second, json={"name": "stolen"}
    )).status_code == 404
    assert (await client.post(
        f"/api/notifications/{notification['id']}/read", headers=second
    )).status_code == 404
    assert (await client.get("/api/usage", headers=second)).json()["total"]["total_tokens"] == 0

    second_workspace = (await client.get(
        "/api/instruments/AAPL/workspace", headers=second
    )).json()
    assert second_workspace["saved"] is False
    assert (await client.put(
        "/api/instruments/AAPL/workspace",
        headers=second,
        json={**workspace_body, "notes": "owner two notes"},
    )).status_code == 200
    assert (await client.get(
        "/api/instruments/AAPL/workspace", headers=first
    )).json()["notes"] == "owner one notes"
    assert (await client.get(
        "/api/instruments/AAPL/workspace", headers=second
    )).json()["notes"] == "owner two notes"
