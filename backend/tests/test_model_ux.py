import httpx
import pytest

from app import config
from app.models import ModelConfigIn
from app.routers.models_crud import ModelDiscoveryIn, discover_models, test_model as probe_model
from app.services import credential_store, llm_client, model_router
from app.services.llm_client import LLMClient


@pytest.mark.parametrize("suffix", ["", "/", "/chat/completions", "/chat/completions/"])
@pytest.mark.asyncio
async def test_all_chat_paths_normalize_endpoint(monkeypatch, suffix):
    paths = []

    def respond(request):
        paths.append(request.url.path)
        return httpx.Response(200, json={"choices": [{"message": {"content": "ok"}}]})

    monkeypatch.setattr(LLMClient, "_http_client", lambda self: httpx.AsyncClient(transport=httpx.MockTransport(respond)))
    monkeypatch.setattr(llm_client, "record_llm_usage", lambda *args: None)
    client = LLMClient("https://model.test/v1" + suffix, "secret", "model")
    await client.chat([])
    await client.chat_with_tools([])
    await client.chat_with_tools_safe([])
    assert paths == ["/v1/chat/completions"] * 3


@pytest.mark.parametrize("url", ["file:///tmp/x", "https://a.test?key=secret", "https://user:pass@a.test", "bad", "https://a.test:wrong"])
def test_api_rejects_ambiguous_addresses(url):
    with pytest.raises(ValueError):
        ModelConfigIn(name="test", base_url=url, model_name="test")


def test_local_credential_key_survives_cache_reset(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "MASTER_KEY", "")
    monkeypatch.setattr(config, "APP_ENV", "development")
    monkeypatch.setattr(config, "DB_PATH", tmp_path / "data" / "test.db")
    encrypted = credential_store.encrypt_value("test-secret")
    credential_store._fernet.cache_clear()
    assert credential_store.decrypt_value(encrypted) == "test-secret"
    assert (config.DB_PATH.parent / ".credential-key").exists()


@pytest.mark.asyncio
async def test_model_discovery_and_actionable_redacted_failure(monkeypatch):
    responses = [httpx.Response(200, json={"data": [{"id": "beta"}, {"id": "alpha"}, {"id": "alpha"}, {}]}),
                 httpx.Response(404, text="<!DOCTYPE html> test-secret missing")]
    paths = []

    def respond(request):
        paths.append(request.url.path)
        assert request.headers["authorization"] == "Bearer test-secret"
        return responses.pop(0)

    monkeypatch.setattr(LLMClient, "_http_client", lambda self: httpx.AsyncClient(transport=httpx.MockTransport(respond)))
    body = ModelDiscoveryIn(base_url="https://model.test/v1/chat/completions", api_key="test-secret")
    result = await discover_models(body, {"id": 1})
    assert result["items"] == ["alpha", "beta"]
    result = await discover_models(body, {"id": 1})
    assert not result["ok"]
    assert "404" in result["message"] and "手动" in result["message"] and "Base URL" in result["message"]
    assert "test-secret" not in result["message"]
    assert paths == ["/v1/models"] * 2


@pytest.mark.asyncio
async def test_discovery_does_not_read_other_users_credentials(monkeypatch):
    async def missing(model_id, *, user_id):
        assert user_id == 2
        raise llm_client.LLMError("模型配置不存在")

    monkeypatch.setattr(model_router, "get_model_config", missing)
    result = await discover_models(ModelDiscoveryIn(base_url="https://model.test", model_id=1), {"id": 2})
    assert not result["ok"] and "不存在" in result["message"]


@pytest.mark.asyncio
async def test_probe_returns_actionable_error(monkeypatch):
    client = LLMClient("https://model.test/v1", "secret", "model")

    async def get_client(*args, **kwargs):
        return client, {}

    monkeypatch.setattr(model_router, "get_client", get_client)
    monkeypatch.setattr(LLMClient, "_http_client", lambda self: httpx.AsyncClient(
        transport=httpx.MockTransport(lambda request: httpx.Response(401, text="invalid secret"))))
    result = await probe_model(1, {"id": 1})
    assert not result["ok"] and "API Key" in result["message"]
    assert "secret" not in result["message"]


@pytest.mark.asyncio
async def test_probe_timeout_gives_next_step(monkeypatch):
    async def get_client(*args, **kwargs):
        return LLMClient("https://model.test", "secret", "model"), {}

    def timeout(request):
        raise httpx.ReadTimeout("", request=request)

    monkeypatch.setattr(model_router, "get_client", get_client)
    monkeypatch.setattr(LLMClient, "_http_client", lambda self: httpx.AsyncClient(transport=httpx.MockTransport(timeout)))
    result = await probe_model(1, {"id": 1})
    assert not result["ok"]
    assert "超时" in result["message"] and "重试" in result["message"]
