import json

import httpx
import pytest

from app import config, database
from app.services import llm_client
from app.services.llm_client import LLMClient
from app.services.llm_usage import flush_llm_usage, get_last_llm_metrics
from app.services import model_router


def _install_transport(monkeypatch, handler):
    original = httpx.AsyncClient
    transport = httpx.MockTransport(handler)
    monkeypatch.setattr(llm_client.httpx, "AsyncClient", lambda *args, **kwargs: original(transport=transport))


@pytest.mark.asyncio
async def test_anthropic_client_dispatches_messages_and_normalizes_response(monkeypatch):
    captured = {}

    def handler(request):
        captured["url"] = str(request.url)
        captured["headers"] = request.headers
        captured["payload"] = json.loads(request.content)
        return httpx.Response(200, json={
            "id": "msg-1",
            "model": "claude-test",
            "stop_reason": "end_turn",
            "content": [{"type": "text", "text": "ready"}],
            "usage": {
                "input_tokens": 8,
                "cache_read_input_tokens": 2,
                "cache_creation_input_tokens": 1,
                "output_tokens": 4,
            },
        })

    _install_transport(monkeypatch, handler)
    client = LLMClient(
        "https://api.anthropic.test/v1",
        "secret-key",
        "claude-test",
        provider="anthropic",
    )

    content, total_tokens = await client.chat([
        {"role": "system", "content": "follow the rules"},
        {"role": "user", "content": "hello"},
    ])

    assert (content, total_tokens) == ("ready", 15)
    assert captured["url"] == "https://api.anthropic.test/v1/messages"
    assert captured["headers"]["x-api-key"] == "secret-key"
    assert captured["headers"]["anthropic-version"] == "2023-06-01"
    assert "authorization" not in captured["headers"]
    assert captured["payload"]["system"] == "follow the rules"
    assert captured["payload"]["max_tokens"] == client.max_tokens
    assert captured["payload"]["messages"] == [{"role": "user", "content": "hello"}]
    metrics = get_last_llm_metrics()
    assert metrics is not None
    assert metrics["ttft_ms"] is None
    assert metrics["tokens_per_second"] is None
    assert isinstance(metrics["duration_ms"], int)


@pytest.mark.asyncio
async def test_model_router_passes_configured_provider_to_client(monkeypatch):
    async def configured_model(_model_id, *, user_id):
        assert user_id == 3
        return {
            "id": 8,
            "name": "Claude",
            "provider": "anthropic",
            "base_url": "https://api.anthropic.test",
            "model_name": "claude-test",
            "api_key": "test-key",
            "temperature": 0.2,
            "max_tokens": 128,
        }

    async def no_saved_key(_owner_id, _service):
        return None

    monkeypatch.setattr(model_router, "get_model_config", configured_model)
    monkeypatch.setattr(model_router, "get_credential", no_saved_key)
    client, _ = await model_router.get_client(8, user_id=3)
    assert client.provider == "anthropic"


@pytest.mark.asyncio
async def test_anthropic_stream_persists_cache_and_timing_metrics(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "DB_PATH", tmp_path / "telemetry.db")
    await database.init_db()
    stream = """event: message_start
data: {"type":"message_start","message":{"usage":{"input_tokens":100,"cache_read_input_tokens":20,"cache_creation_input_tokens":5}}}

event: content_block_start
data: {"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}

event: content_block_delta
data: {"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"hello"}}

event: message_delta
data: {"type":"message_delta","usage":{"output_tokens":5}}

event: message_stop
data: {"type":"message_stop"}

"""
    _install_transport(monkeypatch, lambda _request: httpx.Response(200, text=stream))
    clock_values = iter((1_000_000_000, 1_250_000_000, 2_000_000_000))
    monkeypatch.setattr(llm_client, "_perf_counter_ns", lambda: next(clock_values))

    try:
        client = LLMClient("https://api.anthropic.test", "secret", "claude-test", provider="anthropic")
        assert [part async for part in client.chat_stream([{"role": "user", "content": "hello"}])] == ["hello"]
        await flush_llm_usage()

        row = await database.query_one("SELECT * FROM llm_usage ORDER BY id DESC LIMIT 1")
        assert row["prompt_tokens"] == 125
        assert row["completion_tokens"] == 5
        assert row["total_tokens"] == 130
        assert row["cached_tokens"] == 20
        assert row["cache_creation_tokens"] == 5
        assert row["reasoning_tokens"] == 0
        assert row["ttft_ms"] == 250
        assert row["duration_ms"] == 1000
        assert row["tokens_per_second"] == pytest.approx(5 / 0.75)
    finally:
        await database.close_db()


@pytest.mark.asyncio
async def test_schema_v27_adds_telemetry_columns_idempotently_and_preserves_usage(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "DB_PATH", tmp_path / "migration.db")
    await database.init_db()
    try:
        await database.execute(
            "INSERT INTO llm_usage (session_type, model_name, prompt_tokens, completion_tokens, total_tokens) "
            "VALUES ('chat', 'model', 9, 3, 12)"
        )
        db = database.get_db()
        await db.execute("PRAGMA user_version=26")
        await db.execute("DELETE FROM schema_version WHERE version=27")
        for column in (
            "cached_tokens", "cache_creation_tokens", "reasoning_tokens", "ttft_ms", "duration_ms",
            "tokens_per_second",
        ):
            await db.execute(f"ALTER TABLE llm_usage DROP COLUMN {column}")
        await db.commit()
    finally:
        await database.close_db()

    await database.init_db()
    try:
        await database._install_llm_telemetry()
        columns = {column["name"] for column in await database.query_all("PRAGMA table_info(llm_usage)")}
        assert {
            "cached_tokens", "cache_creation_tokens", "reasoning_tokens", "ttft_ms", "duration_ms",
            "tokens_per_second",
        } <= columns
        version = await (await database.get_db().execute("PRAGMA user_version")).fetchone()
        assert version[0] == 27 == database._SCHEMA_VERSION == database._LLM_TELEMETRY_VERSION
        row = await database.query_one("SELECT * FROM llm_usage ORDER BY id DESC LIMIT 1")
        assert (row["prompt_tokens"], row["completion_tokens"], row["total_tokens"]) == (9, 3, 12)
        assert (row["cached_tokens"], row["cache_creation_tokens"], row["reasoning_tokens"]) == (0, 0, 0)
        assert row["ttft_ms"] is None and row["duration_ms"] is None and row["tokens_per_second"] is None
        assert await database.query_one("SELECT name FROM schema_version WHERE version=27") == {
            "name": "install_llm_telemetry",
        }
    finally:
        await database.close_db()
