import pytest

from app.services import model_router
from app.services.llm_client import LLMError


@pytest.mark.asyncio
async def test_get_model_config_explicit_and_default_fallbacks(monkeypatch):
    queries = []

    async def query_one(sql, params=()):
        queries.append((sql, params))
        if "WHERE id" in sql:
            return {"id": params[0], "name": "explicit"} if params[0] == 1 else None
        if "is_default" in sql:
            return None
        return {"id": 2, "name": "fallback"}

    monkeypatch.setattr(model_router.database, "query_one", query_one)
    assert (await model_router.get_model_config(1, user_id=7))["name"] == "explicit"
    with pytest.raises(LLMError, match="id=99"):
        await model_router.get_model_config(99, user_id=7)
    assert (await model_router.get_model_config(None, user_id=7))["name"] == "fallback"
    assert any("ORDER BY id" in sql for sql, _ in queries)


@pytest.mark.asyncio
async def test_get_model_config_requires_at_least_one_model(monkeypatch):
    async def query_one(sql, params=()):
        return None

    monkeypatch.setattr(model_router.database, "query_one", query_one)
    with pytest.raises(LLMError, match="尚未配置"):
        await model_router.get_model_config(None, user_id=7)


@pytest.mark.asyncio
async def test_get_client_uses_database_key_and_defaults(monkeypatch):
    async def config(model_id, **_kwargs):
        return {
            "id": 1, "name": "DB key", "base_url": "https://llm.test", "model_name": "model",
            "api_key": "database-secret", "api_key_env": "IGNORED_KEY", "temperature": 0, "max_tokens": 0,
        }

    async def no_stored_key(*_args, **_kwargs):
        return None

    monkeypatch.setattr(model_router, "get_model_config", config)
    monkeypatch.setattr(model_router, "get_credential", no_stored_key)
    client, cfg = await model_router.get_client(1, user_id=7)
    assert cfg["id"] == 1
    assert client.api_key == "database-secret"
    assert client.temperature == 0.7
    assert client.max_tokens == 4096


@pytest.mark.asyncio
async def test_get_client_uses_environment_key_and_rejects_missing(monkeypatch):
    record = {
        "id": 2, "name": "Env key", "base_url": "https://llm.test", "model_name": "model", "api_key": "",
        "api_key_env": "FINQUANT_TEST_LLM_KEY", "temperature": 0.2, "max_tokens": 100,
    }

    async def config(model_id, **_kwargs):
        return record

    async def no_stored_key(*_args, **_kwargs):
        return None

    monkeypatch.setattr(model_router, "get_model_config", config)
    monkeypatch.setattr(model_router, "get_credential", no_stored_key)
    monkeypatch.setenv("FINQUANT_TEST_LLM_KEY", "environment-secret")
    client, _ = await model_router.get_client(user_id=7)
    assert client.api_key == "environment-secret"
    assert client.temperature == 0.2
    assert client.max_tokens == 100
    monkeypatch.delenv("FINQUANT_TEST_LLM_KEY")
    with pytest.raises(LLMError, match="未配置 API Key"):
        await model_router.get_client(user_id=7)
