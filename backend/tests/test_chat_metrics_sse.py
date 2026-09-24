import json

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app import config, database
from app.routers import chat
from app.routers.auth import get_current_user
from app.services import model_router
from app.services.llm_usage import flush_llm_usage, set_last_llm_metrics


@pytest.mark.asyncio
async def test_chat_sse_emits_llm_metrics_without_changing_legacy_events(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "DB_PATH", tmp_path / "chat-metrics.db")
    monkeypatch.setattr(config, "MEMORY_TYPED_SHADOW_ENABLED", False)
    monkeypatch.setattr(config, "MEMORY_TYPED_CONTEXT_ENABLED", False)
    await database.init_db()
    user_id = await database.execute("INSERT INTO users (email) VALUES ('metrics@test.local')")
    conversation_id = await database.execute(
        "INSERT INTO conversations (title, mode, user_id) VALUES ('', 'single', ?)", (user_id,)
    )

    class MetricsClient:
        async def chat_with_tools_loop(self, *_args, **_kwargs):
            set_last_llm_metrics({
                "ttft_ms": 48,
                "tokens_per_second": 22.5,
                "duration_ms": 1200,
                "cached_tokens": 40,
                "prompt_tokens": 100,
                "completion_tokens": 27,
                "reasoning_tokens": 5,
            })
            from app.services.llm_usage import record_llm_usage

            record_llm_usage("claude-test", {
                "input_tokens": 100,
                "output_tokens": 27,
                "cache_read_input_tokens": 40,
                "reasoning_tokens": 5,
            })
            return "正常回答", [], 127, {
                "truncated_by_deadline": False,
                "reason": None,
                "deadline_seconds": 600,
                "llm_calls": 1,
                "elapsed_seconds": 1.2,
            }

    async def fake_get_client(*_args, **_kwargs):
        return MetricsClient(), {"id": 1, "name": "Metrics model"}

    async def empty_memory(*_args, **_kwargs):
        return []

    monkeypatch.setattr(model_router, "get_client", fake_get_client)
    monkeypatch.setattr(chat.native_memory_provider, "search", empty_memory)

    app = FastAPI()
    app.include_router(chat.router)
    app.dependency_overrides[get_current_user] = lambda: {"id": user_id}

    try:
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            response = await client.post(
                f"/api/chat/sessions/{conversation_id}/messages",
                json={"content": "hello"},
            )
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("text/event-stream")

        events = []
        current_event = None
        for line in response.text.splitlines():
            if line.startswith("event:"):
                current_event = line[6:].strip()
            elif line.startswith("data:") and current_event:
                events.append((current_event, json.loads(line[5:].strip())))
                current_event = None

        metrics = next(data for name, data in events if name == "llm_metrics")
        assert metrics == {
            "model": "claude-test",
            "ttft_ms": 48,
            "speed_tps": 22.5,
            "prompt_tokens": 100,
            "cached_tokens": 40,
            "cache_hit_rate": 40.0,
            "completion_tokens": 27,
            "reasoning_tokens": 5,
            "context_used": 100,
        }
        assert next(data for name, data in events if name == "token") == {"delta": "正常回答"}
        done = next(data for name, data in events if name == "done")
        assert done["truncated_by_deadline"] is False
        assert [name for name, _ in events][-2:] == ["token", "done"]
        await flush_llm_usage()
    finally:
        app.dependency_overrides.clear()
        await database.close_db()
        database._db = None
