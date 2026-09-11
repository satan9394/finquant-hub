import json

import httpx
import pytest

from app.services import llm_client
from app.services.llm_client import LLMClient, LLMError


def _install_transport(monkeypatch, handler):
    original = httpx.AsyncClient
    transport = httpx.MockTransport(handler)
    monkeypatch.setattr(llm_client.httpx, "AsyncClient", lambda *args, **kwargs: original(transport=transport))


@pytest.fixture(autouse=True)
def _no_retry_backoff(monkeypatch):
    """G-11 重试：测试里把退避基数置 0，避免真实等待拖慢用例。"""
    monkeypatch.setattr(llm_client, "_BACKOFF_BASE_SECONDS", 0.0)


def test_client_payload_headers_and_context_validation():
    with pytest.raises(ValueError, match="context_budget"):
        LLMClient("https://llm.test/", "secret", "model", context_budget=255)
    client = LLMClient("https://llm.test/", "secret", "model", context_budget=256)
    payload = client._payload([{"role": "user", "content": "hello"}], True)
    assert client.base_url == "https://llm.test"
    assert payload["stream_options"] == {"include_usage": True}
    assert client._headers()["Authorization"] == "Bearer secret"


@pytest.mark.asyncio
async def test_client_uses_explicit_proxy_without_inheriting_environment(monkeypatch):
    captured = {}
    original = httpx.AsyncClient

    def handler(_request):
        return httpx.Response(200, json={"choices": [{"message": {"content": "ok"}}]})

    def factory(*args, **kwargs):
        captured.update(kwargs)
        return original(transport=httpx.MockTransport(handler))

    monkeypatch.setattr(llm_client.httpx, "AsyncClient", factory)
    client = LLMClient("https://llm.test", "key", "model", proxy_url="http://127.0.0.1:7890")
    assert (await client.chat([]))[0] == "ok"
    assert captured["proxy"] == "http://127.0.0.1:7890"
    assert captured["trust_env"] is False


@pytest.mark.asyncio
async def test_chat_success_and_api_error(monkeypatch):
    recorded = []
    # G-11: 503 属可重试故障，重试耗尽后仍以最后一次响应报错 → 需备足 _MAX_ATTEMPTS 份。
    responses = [
        httpx.Response(200, json={"choices": [{"message": {"content": "answer"}}], "usage": {"total_tokens": 9}}),
    ] + [httpx.Response(503, text="unavailable") for _ in range(llm_client._MAX_ATTEMPTS)]

    def handler(request):
        return responses.pop(0)

    _install_transport(monkeypatch, handler)
    monkeypatch.setattr(llm_client, "record_llm_usage", lambda model, usage: recorded.append((model, usage)))
    client = LLMClient("https://llm.test", "key", "model")
    assert await client.chat([{"role": "user", "content": "hi"}]) == ("answer", 9)
    assert recorded == [("model", {"total_tokens": 9})]
    with pytest.raises(LLMError, match="503"):
        await client.chat([])
    assert responses == []  # 重试确实用满了 _MAX_ATTEMPTS


@pytest.mark.asyncio
async def test_chat_wraps_network_error(monkeypatch):
    def handler(request):
        raise httpx.ConnectError("offline", request=request)

    _install_transport(monkeypatch, handler)
    with pytest.raises(LLMError, match="网络错误"):
        await LLMClient("https://llm.test", "key", "model").chat([])


@pytest.mark.asyncio
@pytest.mark.parametrize("safe", [False, True])
async def test_tool_chat_preserves_tool_calls_and_reasoning(monkeypatch, safe):
    captured = {}

    def handler(request):
        captured.update(json.loads(request.content))
        return httpx.Response(200, json={
            "choices": [{"message": {
                "content": None,
                "reasoning_content": "reason",
                "tool_calls": [{"id": "call-1", "type": "function", "function": {"name": "quote", "arguments": "{}"}}],
            }}],
            "usage": {"total_tokens": 12},
        })

    _install_transport(monkeypatch, handler)
    client = LLMClient("https://llm.test", "key", "model")
    method = client.chat_with_tools_safe if safe else client.chat_with_tools
    content, calls, tokens = await method(
        [{"role": "assistant", "content": "discard", "tool_calls": [{"id": "old"}]}],
        [{"type": "function", "function": {"name": "quote"}}],
    )
    assert content == "" and tokens == 12
    assert calls[0]["reasoning_content"] == "reason"
    assert captured["tools"]
    if safe:
        assert captured["messages"][0]["content"] is None


@pytest.mark.asyncio
async def test_tool_chat_errors(monkeypatch):
    responses = [httpx.Response(400, text="bad"), httpx.Response(401, text="no")]
    _install_transport(monkeypatch, lambda request: responses.pop(0))
    client = LLMClient("https://llm.test", "key", "model")
    with pytest.raises(LLMError, match="400"):
        await client.chat_with_tools([], [])
    with pytest.raises(LLMError, match="401"):
        await client.chat_with_tools_safe([], [])


@pytest.mark.asyncio
async def test_tool_loop_executes_tools_handles_failure_and_finishes(monkeypatch):
    client = LLMClient("https://llm.test", "key", "model")
    replies = [
        ("", [{"id": "1", "type": "function", "reasoning_content": "need data", "function": {"name": "ok", "arguments": "{}"}}], 3),
        ("", [{"id": "2", "type": "function", "function": {"name": "bad", "arguments": "{}"}}], 4),
        ("done", [], 5),
    ]

    async def fake_chat(messages, tools):
        return replies.pop(0)

    async def execute(name, arguments):
        if name == "bad":
            raise RuntimeError("boom")
        return "ok-result"

    monkeypatch.setattr(client, "chat_with_tools_safe", fake_chat)
    messages = [{"role": "user", "content": "research"}]
    content, calls, tokens = await client.chat_with_tools_loop(messages, [], execute)
    assert (content, tokens) == ("done", 12)
    assert [call["result"] for call in calls] == ["ok-result", "工具执行异常：boom"]
    assert any(message["role"] == "tool" for message in messages)
    assistant = next(message for message in messages if message["role"] == "assistant")
    assert assistant["reasoning_content"] == "need data"


@pytest.mark.asyncio
async def test_tool_loop_forces_final_answer_after_limit(monkeypatch):
    client = LLMClient("https://llm.test", "key", "model")
    call_count = 0

    async def fake_chat(messages, tools):
        nonlocal call_count
        call_count += 1
        if call_count <= 2:
            return "", [{"id": str(call_count), "type": "function", "function": {"name": "x", "arguments": "{}"}}], call_count
        return "forced", [], 9

    async def execute(name, arguments):
        return "result"

    monkeypatch.setattr(client, "chat_with_tools_safe", fake_chat)
    messages = []
    content, calls, tokens = await client.chat_with_tools_loop(messages, [], execute, max_rounds=2)
    assert (content, len(calls), tokens) == ("forced", 2, 12)
    assert messages[-1]["role"] == "user"


@pytest.mark.asyncio
async def test_chat_stream_filters_frames_and_reports_errors(monkeypatch):
    recorded = []
    stream = "\n\ndata: not-json\n\ndata: {\"choices\": [], \"usage\": {\"prompt_tokens\": 3, \"completion_tokens\": 2, \"total_tokens\": 5}}\n\ndata: {\"choices\": [{\"delta\": {}}]}\n\ndata: {\"choices\": [{\"delta\": {\"content\": \"hello\"}}]}\n\ndata: [DONE]\n\n"
    responses = [httpx.Response(200, text=stream), httpx.Response(500, text="broken")]
    _install_transport(monkeypatch, lambda request: responses.pop(0))
    monkeypatch.setattr(llm_client, "record_llm_usage", lambda model, usage: recorded.append((model, usage)))
    client = LLMClient("https://llm.test", "key", "model")
    assert [part async for part in client.chat_stream([])] == ["hello"]
    assert recorded == [("model", {"prompt_tokens": 3, "completion_tokens": 2, "total_tokens": 5})]
    with pytest.raises(LLMError, match="500"):
        _ = [part async for part in client.chat_stream([])]


@pytest.mark.asyncio
async def test_chat_stream_wraps_network_error(monkeypatch):
    def handler(request):
        raise httpx.ConnectError("offline", request=request)

    _install_transport(monkeypatch, handler)
    with pytest.raises(LLMError, match="网络错误"):
        _ = [part async for part in LLMClient("https://llm.test", "key", "model").chat_stream([])]


# ==================== G-11: 瞬时故障重试 ====================

@pytest.mark.asyncio
async def test_chat_retries_transient_429_then_succeeds(monkeypatch):
    """429 是瞬时故障：应重试并在成功后正常返回，调用方无感。"""
    calls = []
    responses = [
        httpx.Response(429, text="rate limited"),
        httpx.Response(200, json={"choices": [{"message": {"content": "ok"}}], "usage": {"total_tokens": 3}}),
    ]

    def handler(request):
        calls.append(request)
        return responses.pop(0)

    _install_transport(monkeypatch, handler)
    monkeypatch.setattr(llm_client, "record_llm_usage", lambda model, usage: None)
    content, tokens = await LLMClient("https://llm.test", "key", "model").chat([])
    assert content == "ok" and tokens == 3
    assert len(calls) == 2  # 第一次 429 + 重试成功


@pytest.mark.asyncio
async def test_chat_retries_network_error_then_succeeds(monkeypatch):
    """网络错误（httpx.HTTPError）同样属于可重试故障。"""
    calls = []

    def handler(request):
        calls.append(request)
        if len(calls) == 1:
            raise httpx.ConnectError("offline", request=request)
        return httpx.Response(200, json={"choices": [{"message": {"content": "second"}}], "usage": {}})

    _install_transport(monkeypatch, handler)
    monkeypatch.setattr(llm_client, "record_llm_usage", lambda model, usage: None)
    content, _tokens = await LLMClient("https://llm.test", "key", "model").chat([])
    assert content == "second"
    assert len(calls) == 2


@pytest.mark.asyncio
@pytest.mark.parametrize("status", [400, 401, 404])
async def test_chat_does_not_retry_non_transient_status(monkeypatch, status):
    """地址/鉴权类 4xx 重试无意义：只调用一次即报错（避免放大无谓请求）。"""
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(status, text="client error")

    _install_transport(monkeypatch, handler)
    with pytest.raises(LLMError):
        await LLMClient("https://llm.test", "key", "model").chat([])
    assert len(calls) == 1


@pytest.mark.asyncio
async def test_chat_retry_exhausted_network_error_raises_llm_error(monkeypatch):
    """网络错误重试耗尽 → 抛 LLMError（可行动文案），调用次数为 _MAX_ATTEMPTS。"""
    calls = []

    def handler(request):
        calls.append(request)
        raise httpx.ConnectError("offline", request=request)

    _install_transport(monkeypatch, handler)
    with pytest.raises(LLMError, match="网络错误"):
        await LLMClient("https://llm.test", "key", "model").chat([])
    assert len(calls) == llm_client._MAX_ATTEMPTS


@pytest.mark.asyncio
async def test_chat_retry_exhausted_5xx_reports_last_status(monkeypatch):
    """5xx 重试耗尽 → 仍以最后一次响应报错（含状态码），不吞掉真实原因。"""
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(503, text="unavailable")

    _install_transport(monkeypatch, handler)
    with pytest.raises(LLMError, match="503"):
        await LLMClient("https://llm.test", "key", "model").chat([])
    assert len(calls) == llm_client._MAX_ATTEMPTS
