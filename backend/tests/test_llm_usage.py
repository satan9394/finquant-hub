import pytest

from app import config, database
from app.routers.usage import get_usage
from app.services.llm_usage import (
    flush_llm_usage,
    record_llm_usage,
    reset_usage_context,
    set_usage_context,
)


@pytest.mark.asyncio
async def test_usage_write_is_attributed_and_daily_api_aggregates(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "DB_PATH", tmp_path / "usage.db")
    await database.init_db()
    await database.execute("INSERT INTO users (id, email, is_admin) VALUES (1, 'usage@test.local', 1)")
    try:
        token = set_usage_context("research", 42, 1)
        try:
            record_llm_usage("deepseek-test", {
                "prompt_tokens": 100,
                "completion_tokens": 25,
                "total_tokens": 125,
            })
            record_llm_usage("deepseek-test", {"total_tokens": 10})
        finally:
            reset_usage_context(token)
        await flush_llm_usage()

        rows = await database.query_all("SELECT * FROM llm_usage ORDER BY id")
        assert [(row["session_type"], row["conversation_id"]) for row in rows] == [
            ("research", 42), ("research", 42),
        ]
        assert rows[0]["prompt_tokens"] == 100
        assert rows[0]["completion_tokens"] == 25

        result = await get_usage({"id": 1}, days=30, session_type=None)
        assert result["total"] == {
            "prompt_tokens": 100,
            "completion_tokens": 25,
            "total_tokens": 135,
            "request_count": 2,
        }
        assert result["items"][0]["total_tokens"] == 135
        assert result["by_session_type"] == [{
            "session_type": "research", "total_tokens": 135, "request_count": 2,
        }]
    finally:
        await database.close_db()


@pytest.mark.asyncio
async def test_usage_write_failure_never_escapes(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "DB_PATH", tmp_path / "usage-failure.db")
    await database.init_db()
    try:
        async def fail(*args, **kwargs):
            raise RuntimeError("disk unavailable")

        monkeypatch.setattr(database, "execute", fail)
        record_llm_usage("model", {"total_tokens": 9})
        await flush_llm_usage()
    finally:
        await database.close_db()
