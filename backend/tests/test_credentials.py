import hashlib
import json
import logging

import pytest
import pytest_asyncio
from cryptography.fernet import Fernet
from httpx import ASGITransport, AsyncClient

from app import config, database
from app.agent import tools_definitions
from app.main import app
from app.services import credential_store, market_data
from app.services.auth import reset_current_user, set_current_user


@pytest_asyncio.fixture
async def credential_users(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "DB_PATH", tmp_path / "credentials.db")
    monkeypatch.setattr(config, "MASTER_KEY", Fernet.generate_key().decode())
    # 本测试用 session cookie 认证两个不同用户，必须显式关闭 local-only；
    # 否则继承 backend/.env 的 LOCAL_ONLY_MODE=true 会让所有请求落为同一本地所有者。
    monkeypatch.setattr(config, "LOCAL_ONLY_MODE", False)
    monkeypatch.setattr(config, "SCHEDULER_ENABLED", False)
    async with app.router.lifespan_context(app):
        first_id = await database.execute(
            "INSERT INTO users (email, is_admin) VALUES ('key-one@test.local', 1)"
        )
        second_id = await database.execute(
            "INSERT INTO users (email) VALUES ('key-two@test.local')"
        )
        tokens = {first_id: "key-one-session", second_id: "key-two-session"}
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
async def test_credential_api_encrypts_and_never_returns_plaintext(credential_users, caplog):
    client, auth, first_id, second_id = credential_users
    secret = "tushare-private-token-123"
    caplog.set_level(logging.DEBUG)

    saved = await client.put(
        "/api/me/credentials/tushare",
        headers=auth(first_id),
        json={"value": secret, "provider": "tushare.pro"},
    )
    assert saved.status_code == 200
    assert saved.json()["has_key"] is True
    assert secret not in saved.text

    row = await database.query_one(
        "SELECT encrypted_value FROM user_credentials WHERE user_id=? AND service='tushare'",
        (first_id,),
    )
    assert row is not None
    assert secret.encode() not in bytes(row["encrypted_value"])
    assert await credential_store.get_credential(first_id, "tushare") == secret

    listed = await client.get("/api/me/credentials", headers=auth(first_id))
    status = await client.get("/api/me/credentials/tushare/status", headers=auth(first_id))
    assert listed.json()["items"][0]["service"] == "tushare"
    assert status.json()["provider"] == "tushare.pro"
    assert secret not in listed.text + status.text
    assert (await client.get(
        "/api/me/credentials", headers=auth(second_id)
    )).json()["items"] == []
    assert (await client.get(
        "/api/me/credentials/tushare/status", headers=auth(second_id)
    )).json()["has_key"] is False
    assert (await client.delete(
        "/api/me/credentials/tushare", headers=auth(second_id)
    )).status_code == 404

    model_secret = "custom-model-secret"
    model = await client.post(
        "/api/models",
        headers=auth(first_id),
        json={
            "name": "Encrypted custom model",
            "base_url": "https://model.test",
            "model_name": "custom",
            "api_key": model_secret,
        },
    )
    assert model.status_code == 201
    assert model.json()["has_api_key"] is True
    assert model_secret not in model.text
    model_id = model.json()["id"]
    model_row = await database.query_one(
        "SELECT api_key FROM model_configs WHERE id=? AND user_id=?",
        (model_id, first_id),
    )
    assert model_row == {"api_key": None}
    assert await credential_store.get_credential(first_id, f"model:{model_id}") == model_secret
    assert model_secret not in (await client.get("/api/models", headers=auth(first_id))).text
    assert secret not in caplog.text
    assert model_secret not in caplog.text


def test_production_requires_valid_master_key(monkeypatch):
    monkeypatch.setattr(config, "APP_ENV", "production")
    monkeypatch.setattr(config, "MASTER_KEY", "")
    with pytest.raises(RuntimeError, match="必须配置 MASTER_KEY"):
        credential_store.encrypt_value("never-logged")

    monkeypatch.setattr(config, "MASTER_KEY", "invalid")
    with pytest.raises(RuntimeError, match="有效的 Fernet key"):
        credential_store.encrypt_value("never-logged")


@pytest.mark.asyncio
async def test_tushare_credential_is_decrypted_only_for_provider_call(credential_users, monkeypatch):
    _client, _auth, first_id, _second_id = credential_users
    secret = "user-tushare-token"
    await credential_store.put_credential(first_id, "tushare", secret)
    expected = [{"metric": "eps", "value": 2.5, "provider": "tushare"}]

    async def domestic(_symbol, adapters):
        adapter = adapters[0]
        assert adapter.token == secret
        return expected

    monkeypatch.setattr("app.services.fundamentals.fetch_cn_fundamentals", domestic)
    service = market_data.MarketDataService(fundamentals_priority=("tushare", "akshare", "yahoo"))
    token = set_current_user({"id": first_id})
    try:
        result = await service.fundamentals("600519")
    finally:
        reset_current_user(token)
        await service.aclose()
    assert result == expected
    assert secret not in json.dumps(result)


@pytest.mark.asyncio
async def test_news_tool_receives_user_key_without_returning_it(credential_users, monkeypatch):
    _client, _auth, first_id, _second_id = credential_users
    secret = "user-tavily-key"
    await credential_store.put_credential(first_id, "tavily", secret)
    captured = {}

    class FakeNews:
        def __init__(self, *, credentials):
            captured.update(credentials)

        async def search(self, keyword, *, max_results):
            return {"keyword": keyword, "news": [], "providers_used": ["tavily"]}

        async def aclose(self):
            return None

    monkeypatch.setattr(tools_definitions, "NewsSearchService", FakeNews)
    token = set_current_user({"id": first_id})
    try:
        result = await tools_definitions.SearchNews().run(keyword="Apple")
    finally:
        reset_current_user(token)

    assert captured == {"tavily": secret}
    assert result.success is True
    assert secret not in json.dumps(result.data)
