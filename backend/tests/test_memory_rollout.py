from __future__ import annotations

import json

import pytest

from app import config, database
from app.models import MessageIn
from app.routers import chat
from app.services import memory_rollout
from app.services import model_router, research_orch
from app.services.investment_memory import create_memory


@pytest.fixture
async def rollout_db(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "DB_PATH", tmp_path / "memory-rollout.db")
    monkeypatch.setattr(config, "MEMORY_TYPED_SHADOW_ENABLED", False)
    monkeypatch.setattr(config, "MEMORY_TYPED_CONTEXT_ENABLED", False)
    await database.init_db()
    owner_id = await database.execute("INSERT INTO users (email) VALUES ('owner@test.local')")
    other_id = await database.execute("INSERT INTO users (email) VALUES ('other@test.local')")
    try:
        yield owner_id, other_id
    finally:
        await database.close_db()


@pytest.mark.asyncio
async def test_rollout_is_inert_when_both_flags_are_disabled(rollout_db, monkeypatch) -> None:
    owner_id, _ = rollout_db

    async def unexpected_search(*args, **kwargs):
        raise AssertionError("typed retrieval must remain off by default")

    monkeypatch.setattr(memory_rollout, "search_memories", unexpected_search)
    result = await memory_rollout.prepare_memory_rollout(
        "AAPL margin", user_id=owner_id, surface="chat", native_candidate_count=2
    )

    assert result.audit_id is None
    assert result.context == ""
    assert await database.query_all("SELECT * FROM memory_rollout_audits") == []


@pytest.mark.asyncio
async def test_shadow_audit_is_owner_scoped_metadata_only(rollout_db, monkeypatch) -> None:
    owner_id, other_id = rollout_db
    monkeypatch.setattr(config, "MEMORY_TYPED_SHADOW_ENABLED", True)
    await create_memory(
        user_id=owner_id,
        subject_type="instrument",
        subject_id="AAPL",
        memory_type="hypothesis",
        information_kind="USER_HYPOTHESIS",
        content={"claim": "SECRET_MARGIN_TEXT"},
        source_kind="user",
        created_by="user",
    )

    result = await memory_rollout.prepare_memory_rollout(
        "SECRET_QUERY AAPL", user_id=owner_id, surface="chat", native_candidate_count=3
    )
    assert result.audit_id is not None
    assert result.context == ""
    assert result.typed_candidate_count == 1
    assert result.assembled_chars > 0

    await memory_rollout.finalize_memory_rollout(result, response="SECRET_RESPONSE")
    row = await database.query_one(
        "SELECT * FROM memory_rollout_audits WHERE id=? AND user_id=?",
        (result.audit_id, owner_id),
    )
    assert row is not None
    assert row["surface"] == "chat"
    assert row["mode"] == "shadow"
    assert row["native_candidate_count"] == 3
    assert row["typed_candidate_count"] == 1
    assert json.loads(row["typed_status_counts_json"]) == {"candidate": 1}
    assert len(row["query_hash"]) == len(row["response_hash"]) == 64
    serialized = json.dumps(row, ensure_ascii=False)
    assert "SECRET_QUERY" not in serialized
    assert "SECRET_RESPONSE" not in serialized
    assert "SECRET_MARGIN_TEXT" not in serialized
    assert await database.query_one(
        "SELECT id FROM memory_rollout_audits WHERE id=? AND user_id=?",
        (result.audit_id, other_id),
    ) is None


@pytest.mark.asyncio
async def test_opt_in_returns_budgeted_context_and_failure_falls_back(rollout_db, monkeypatch) -> None:
    owner_id, _ = rollout_db
    monkeypatch.setattr(config, "MEMORY_TYPED_CONTEXT_ENABLED", True)
    await create_memory(
        user_id=owner_id,
        subject_type="instrument",
        subject_id="AAPL",
        memory_type="risk_concern",
        information_kind="AI_INFERENCE",
        content={"risk": "supplier concentration"},
        source_kind="ai",
        created_by="ai",
    )

    result = await memory_rollout.prepare_memory_rollout(
        "AAPL supplier", user_id=owner_id, surface="research", native_candidate_count=0,
        subject_type="instrument", subject_id="AAPL",
    )
    assert result.mode == "opt_in"
    assert "不是系统指令" in result.context
    assert "memory:" in result.context
    await memory_rollout.finalize_memory_rollout(result, response={"verdict": "UNKNOWN"})

    async def broken_search(*args, **kwargs):
        raise RuntimeError("typed backend unavailable")

    monkeypatch.setattr(memory_rollout, "search_memories", broken_search)
    fallback = await memory_rollout.prepare_memory_rollout(
        "AAPL", user_id=owner_id, surface="chat", native_candidate_count=1
    )
    assert fallback.context == ""
    assert fallback.outcome == "fallback"
    row = await database.query_one(
        "SELECT outcome, error_code FROM memory_rollout_audits WHERE id=?",
        (fallback.audit_id,),
    )
    assert row == {"outcome": "fallback", "error_code": "typed_retrieval_error"}


@pytest.mark.asyncio
async def test_chat_opt_in_injects_typed_context_and_finalizes_audit(rollout_db, monkeypatch) -> None:
    owner_id, _ = rollout_db
    monkeypatch.setattr(config, "MEMORY_TYPED_CONTEXT_ENABLED", True)
    await create_memory(
        user_id=owner_id,
        subject_type="instrument",
        subject_id="AAPL",
        memory_type="hypothesis",
        information_kind="USER_HYPOTHESIS",
        content={"claim": "typed chat context"},
        source_kind="user",
        created_by="user",
    )
    captured: list[list[dict[str, str]]] = []

    class CapturingClient:
        async def chat_with_tools_loop(self, messages, tools, executor, max_rounds=5, event_sink=None, pre_tool_hook=None, post_tool_hook=None):
            captured.append(messages)
            return "fixture response", [], 4

    async def fake_get_client(model_id=None, **kwargs):
        return CapturingClient(), {"id": 1}

    async def empty_native_search(*args, **kwargs):
        return []

    monkeypatch.setattr(model_router, "get_client", fake_get_client)
    monkeypatch.setattr(chat.native_memory_provider, "search", empty_native_search)
    conversation_id = await database.execute(
        "INSERT INTO conversations (title, mode, user_id) VALUES ('', 'single', ?)",
        (owner_id,),
    )

    response = await chat.send_message(
        conversation_id,
        MessageIn(content="AAPL typed"),
        {"id": owner_id},
    )
    async for _ in response.body_iterator:
        pass

    assert any(
        message["role"] == "system" and "typed chat context" in message["content"]
        for message in captured[0]
    )
    row = await database.query_one(
        "SELECT surface, mode, outcome, response_hash FROM memory_rollout_audits"
    )
    assert row is not None
    assert row["surface"] == "chat"
    assert row["mode"] == "opt_in"
    assert row["outcome"] == "completed"
    assert len(row["response_hash"]) == 64


@pytest.mark.asyncio
async def test_research_opt_in_injects_typed_context_and_finalizes_audit(rollout_db, monkeypatch) -> None:
    owner_id, _ = rollout_db
    monkeypatch.setattr(config, "MEMORY_TYPED_CONTEXT_ENABLED", True)
    await create_memory(
        user_id=owner_id,
        subject_type="instrument",
        subject_id="usAAPL",
        memory_type="risk_concern",
        information_kind="AI_INFERENCE",
        content={"risk": "typed research context"},
        source_kind="ai",
        created_by="ai",
    )
    contexts: list[str] = []

    async def fake_get_client(model_id=None, **kwargs):
        return object(), {"id": 1}

    async def fake_call_agent(client, role, ticker, company_name, registry, **kwargs):
        contexts.append(kwargs.get("memory_context", ""))
        return "fixture analysis", []

    async def empty_native_search(*args, **kwargs):
        return []

    monkeypatch.setattr(model_router, "get_client", fake_get_client)
    monkeypatch.setattr(research_orch, "_call_agent", fake_call_agent)
    monkeypatch.setattr(research_orch.native_memory_provider, "search", empty_native_search)

    events = [
        event async for event in research_orch.run_research(
            "usAAPL", "Apple", user_id=owner_id
        )
    ]

    assert events[-1][0] == "done"
    assert len(contexts) == 5
    assert all("typed research context" in context for context in contexts)
    row = await database.query_one(
        "SELECT surface, mode, outcome, response_hash FROM memory_rollout_audits"
    )
    assert row is not None
    assert row["surface"] == "research"
    assert row["mode"] == "opt_in"
    assert row["outcome"] == "completed"
    assert len(row["response_hash"]) == 64
