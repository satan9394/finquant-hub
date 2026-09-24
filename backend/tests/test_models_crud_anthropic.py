import httpx
import pytest

from app.routers.models_crud import ModelDiscoveryIn, discover_models, test_model as probe_model
from app.services import model_router
from app.services.llm_client import LLMClient


@pytest.mark.asyncio
async def test_anthropic_discovery_uses_models_endpoint_and_standardizes_ids(monkeypatch):
    requests = []

    def respond(request):
        requests.append(request)
        return httpx.Response(200, json={
            "data": [{"id": "claude-sonnet"}, {"id": "claude-haiku"}, {"id": "claude-sonnet"}]
        })

    monkeypatch.setattr(
        LLMClient,
        "_http_client",
        lambda self: httpx.AsyncClient(transport=httpx.MockTransport(respond)),
    )

    result = await discover_models(
        ModelDiscoveryIn(
            base_url="https://api.anthropic.test",
            provider="anthropic",
            api_key="sk-ant-test-secret",
        ),
        {"id": 7},
    )

    assert result == {"ok": True, "items": ["claude-haiku", "claude-sonnet"], "message": "已拉取模型列表"}
    assert len(requests) == 1
    request = requests[0]
    assert request.method == "GET"
    assert request.url.path == "/v1/models"
    assert request.headers["x-api-key"] == "sk-ant-test-secret"
    assert request.headers["anthropic-version"] == "2023-06-01"
    assert "authorization" not in request.headers
    assert "sk-ant-test-secret" not in str(result)


@pytest.mark.asyncio
async def test_anthropic_connection_test_calls_messages_and_redacts_failures(monkeypatch):
    requests = []

    def respond(request):
        requests.append(request)
        assert request.headers["x-api-key"] == "sk-ant-test-secret"
        assert request.headers["anthropic-version"] == "2023-06-01"
        if request.url.path == "/v1/messages":
            return httpx.Response(200, json={
                "id": "msg_1",
                "model": "claude-sonnet",
                "role": "assistant",
                "content": [{"type": "text", "text": "OK"}],
                "stop_reason": "end_turn",
                "usage": {"input_tokens": 4, "output_tokens": 1},
            })
        return httpx.Response(401, text="invalid key sk-ant-test-secret")

    monkeypatch.setattr(
        LLMClient,
        "_http_client",
        lambda self: httpx.AsyncClient(transport=httpx.MockTransport(respond)),
    )

    async def anthropic_client(*_args, **_kwargs):
        return LLMClient(
            "https://api.anthropic.test", "sk-ant-test-secret", "claude-sonnet", provider="anthropic"
        ), {"provider": "anthropic"}

    monkeypatch.setattr(model_router, "get_client", anthropic_client)
    result = await probe_model(3, {"id": 7})

    assert result["ok"] is True
    assert result["reply"] == "OK"
    assert [request.url.path for request in requests] == ["/v1/messages"]
    payload = requests[0].read()
    assert b'"model":"claude-sonnet"' in payload
    assert b'"max_tokens":4096' in payload
    assert b"sk-ant-test-secret" not in payload

    def discovery_error(request):
        return httpx.Response(401, text="invalid key sk-ant-test-secret")

    monkeypatch.setattr(
        LLMClient,
        "_http_client",
        lambda self: httpx.AsyncClient(transport=httpx.MockTransport(discovery_error)),
    )
    failure = await discover_models(
        ModelDiscoveryIn(
            base_url="https://api.anthropic.test/v1",
            provider="anthropic",
            api_key="sk-ant-test-secret",
        ),
        {"id": 7},
    )
    assert failure["ok"] is False
    assert failure["items"] == []
    assert "sk-ant-test-secret" not in failure["message"]
