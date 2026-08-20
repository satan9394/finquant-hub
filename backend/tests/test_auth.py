import re
from datetime import UTC, datetime, timedelta

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app import config, database
from app.main import app


@pytest_asyncio.fixture
async def client(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "DB_PATH", tmp_path / "auth.db")
    monkeypatch.setattr(config, "APP_ENV", "development")
    monkeypatch.setattr(config, "SMTP_HOST", "")
    monkeypatch.setattr(config, "SMTP_FROM", "")
    await database.init_db()
    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as test_client:
            yield test_client
    finally:
        await database.close_db()


def _logged_code(caplog) -> str:
    record = next(record for record in reversed(caplog.records) if getattr(record, "event", "") == "auth.code.local")
    return record.code


@pytest.mark.asyncio
async def test_passwordless_code_session_and_replay(client, caplog, monkeypatch):
    monkeypatch.setattr(config, "AUTH_CODE_COOLDOWN_SECONDS", 1)
    caplog.set_level("INFO")
    requested = await client.post("/api/auth/request-code", json={"email": " User@Example.COM "})
    assert requested.status_code == 200
    assert requested.json() == {"message": "验证码已发送", "cooldown_seconds": 1}
    code = _logged_code(caplog)
    assert re.fullmatch(r"\d{6}", code)

    wrong = await client.post("/api/auth/verify-code", json={"email": "user@example.com", "code": "000000" if code != "000000" else "999999"})
    assert wrong.status_code == 401

    verified = await client.post("/api/auth/verify-code", json={"email": "user@example.com", "code": code})
    assert verified.status_code == 200
    assert verified.json()["user"] == {"id": 1, "email": "user@example.com", "is_admin": True}
    cookie = verified.headers["set-cookie"]
    assert "HttpOnly" in cookie and "SameSite=strict" in cookie
    assert (await client.get("/api/auth/me")).json()["user"]["email"] == "user@example.com"

    replay = await client.post("/api/auth/verify-code", json={"email": "user@example.com", "code": code})
    assert replay.status_code == 401
    assert (await client.post("/api/auth/logout")).json() == {"ok": True}
    assert (await client.get("/api/auth/me")).status_code == 401
    audit_events = {
        getattr(record, "event", "")
        for record in caplog.records
        if record.message == "Authentication audit"
    }
    assert {
        "auth.request_code.success",
        "auth.verify_code.failed",
        "auth.verify_code.success",
        "auth.logout.success",
    } <= audit_events


@pytest.mark.asyncio
async def test_code_expiry_attempt_limit_and_email_cooldown(client, caplog, monkeypatch):
    caplog.set_level("WARNING")
    monkeypatch.setattr(config, "AUTH_CODE_COOLDOWN_SECONDS", 60)
    assert (await client.post("/api/auth/request-code", json={"email": "cooldown@example.com"})).status_code == 200
    limited = await client.post("/api/auth/request-code", json={"email": "cooldown@example.com"})
    assert limited.status_code == 429
    assert int(limited.headers["retry-after"]) >= 1

    code = _logged_code(caplog)
    row = await database.query_one("SELECT id FROM login_codes WHERE email=? ORDER BY id DESC", ("cooldown@example.com",))
    await database.execute(
        "UPDATE login_codes SET expires_at=? WHERE id=?",
        ((datetime.now(UTC) - timedelta(seconds=1)).strftime("%Y-%m-%d %H:%M:%S"), row["id"]),
    )
    assert (await client.post("/api/auth/verify-code", json={"email": "cooldown@example.com", "code": code})).status_code == 401

    monkeypatch.setattr(config, "AUTH_CODE_COOLDOWN_SECONDS", 1)
    assert (await client.post("/api/auth/request-code", json={"email": "attempts@example.com"})).status_code == 200
    valid = _logged_code(caplog)
    invalid = "000000" if valid != "000000" else "999999"
    for _ in range(config.AUTH_CODE_MAX_ATTEMPTS):
        assert (await client.post("/api/auth/verify-code", json={"email": "attempts@example.com", "code": invalid})).status_code == 401
    assert (await client.post("/api/auth/verify-code", json={"email": "attempts@example.com", "code": valid})).status_code == 401


@pytest.mark.asyncio
async def test_request_code_ip_limit_and_production_requires_smtp(client, caplog, monkeypatch):
    caplog.set_level("WARNING")
    monkeypatch.setattr(config, "AUTH_IP_HOURLY_LIMIT", 2)
    monkeypatch.setattr(config, "AUTH_CODE_COOLDOWN_SECONDS", 1)
    assert (await client.post("/api/auth/request-code", json={"email": "one@example.com"})).status_code == 200
    assert (await client.post("/api/auth/request-code", json={"email": "two@example.com"})).status_code == 200
    assert (await client.post("/api/auth/request-code", json={"email": "three@example.com"})).status_code == 429

    await database.execute("DELETE FROM login_codes")
    monkeypatch.setattr(config, "APP_ENV", "production")
    unavailable = await client.post("/api/auth/request-code", json={"email": "prod@example.com"})
    assert unavailable.status_code == 503
    assert await database.query_one("SELECT id FROM login_codes WHERE email=?", ("prod@example.com",)) is None


@pytest.mark.asyncio
async def test_session_expiry_and_first_user_is_only_admin(client, caplog, monkeypatch):
    caplog.set_level("WARNING")
    monkeypatch.setattr(config, "AUTH_CODE_COOLDOWN_SECONDS", 1)
    for email in ("admin@example.com", "member@example.com"):
        assert (await client.post("/api/auth/request-code", json={"email": email})).status_code == 200
        code = _logged_code(caplog)
        result = await client.post("/api/auth/verify-code", json={"email": email, "code": code})
        assert result.status_code == 200
    users = await database.query_all("SELECT email, is_admin FROM users ORDER BY id")
    assert users == [{"email": "admin@example.com", "is_admin": 1}, {"email": "member@example.com", "is_admin": 0}]

    await database.execute("UPDATE sessions SET expires_at=datetime('now', '-1 second')")
    assert (await client.get("/api/auth/me")).status_code == 401


@pytest.mark.asyncio
async def test_local_only_mode_uses_one_automatic_owner_without_login(client, monkeypatch):
    monkeypatch.setattr(config, "LOCAL_ONLY_MODE", True)

    me = await client.get("/api/auth/me")
    assert me.status_code == 200
    user = me.json()["user"]
    assert user["is_admin"] is True
    assert user["local_mode"] is True
    assert "finquant_session" not in me.cookies

    assert (await client.get("/api/models")).status_code == 200
    assert (
        await client.post("/api/auth/request-code", json={"email": "unused@example.com"})
    ).status_code == 404
    assert (
        await client.post(
            "/api/auth/verify-code",
            json={"email": "unused@example.com", "code": "123456"},
        )
    ).status_code == 404

    assert (await client.post("/api/auth/logout")).json() == {"ok": True}
    assert (await client.get("/api/auth/me")).json()["user"]["id"] == user["id"]
    assert await database.query_one("SELECT COUNT(*) AS n FROM users") == {"n": 1}
