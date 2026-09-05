from __future__ import annotations

import json
from types import SimpleNamespace

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app import config, database
from app.main import app
from app.models import MessageIn
from app.routers import analysis, chat, discussion, notifications, research, swarm
from app.routers.analysis import StockAnalysisRequest
from app.routers.auth import get_current_user
from app.routers.research import ResearchRequest
from app.routers.swarm import SwarmRunRequest
from app.services.llm_client import LLMError


class FixtureMarket:
    async def quote(self, ticker):
        return {"code": ticker, "name": "Fixture", "price": 100, "source": "fixture"}

    async def search(self, _raw):
        return []


def _request():
    return SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(market=FixtureMarket())))


async def _events(response):
    return [event async for event in response.body_iterator]


@pytest_asyncio.fixture(autouse=True)
async def sse_db(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "DB_PATH", tmp_path / "sse-error-paths.db")
    await database.init_db()
    await database.execute("INSERT INTO users (id, email) VALUES (1, 'sse@fixture.local')")
    app.dependency_overrides[get_current_user] = lambda: {"id": 1, "email": "sse@fixture.local"}
    try:
        yield
    finally:
        app.dependency_overrides.pop(get_current_user, None)
        await database.close_db()


@pytest_asyncio.fixture
async def api_client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        yield client


@pytest.mark.asyncio
async def test_chat_llm_failure_emits_one_error_and_ends(monkeypatch):
    session_id = await database.execute(
        "INSERT INTO conversations (title, mode, user_id) VALUES ('Fixture', 'single', 1)"
    )

    async def failed_client(*_args, **_kwargs):
        raise LLMError("fixture LLM unavailable")

    monkeypatch.setattr(chat.model_router, "get_client", failed_client)
    response = await chat.send_message(session_id, MessageIn(content="hello"), {"id": 1})
    events = await _events(response)

    assert [event["event"] for event in events] == ["error"]
    assert json.loads(events[0]["data"]) == {
        "error": "fixture LLM unavailable", "message": "fixture LLM unavailable",
    }


@pytest.mark.asyncio
async def test_chat_rejects_empty_message_before_opening_sse(api_client):
    response = await api_client.post("/api/chat/sessions/1/messages", json={"content": ""})
    assert response.status_code == 422
    assert "text/event-stream" not in response.headers.get("content-type", "")


@pytest.mark.asyncio
async def test_discussion_generator_exception_emits_error_and_closes(monkeypatch):
    conversation_id = await database.execute(
        "INSERT INTO conversations (title, mode, user_id) VALUES ('Fixture', 'multi', 1)"
    )
    room_id = await database.execute(
        "INSERT INTO discussion_rooms "
        "(conversation_id, topic, participants, total_rounds, user_id) "
        "VALUES (?, 'Fixture', '[]', 1, 1)",
        (conversation_id,),
    )
    closed = []

    async def failed_stream(_room, _model_id):
        try:
            yield {"event": "round_started", "data": "{}"}
            raise RuntimeError("fixture discussion interrupted")
        finally:
            closed.append(True)

    monkeypatch.setattr(discussion, "stream_discussion", failed_stream)
    response = await discussion.start_room(room_id, {"id": 1})
    events = await _events(response)

    assert [event["event"] for event in events] == ["round_started", "error"]
    assert "fixture discussion interrupted" in json.loads(events[-1]["data"])["error"]
    assert closed == [True]


@pytest.mark.asyncio
async def test_discussion_rejects_invalid_room_payload_before_sse(api_client):
    response = await api_client.post(
        "/api/discussion/rooms",
        json={"topic": "x", "role_keys": ["one"], "total_rounds": 0},
    )
    assert response.status_code == 422
    assert "text/event-stream" not in response.headers.get("content-type", "")


@pytest.mark.asyncio
async def test_analysis_pipeline_exception_emits_error_and_closes(monkeypatch):
    closed = []

    async def resolve(_raw, _market):
        return "usAAPL"

    async def failed_research(*_args, **_kwargs):
        try:
            yield "agent_started", {"role_key": "fixture"}
            raise RuntimeError("fixture analysis interrupted")
        finally:
            closed.append(True)

    monkeypatch.setattr(analysis, "resolve_ticker", resolve)
    monkeypatch.setattr(analysis, "run_research", failed_research)
    response = await analysis.analyze_stock(
        StockAnalysisRequest(ticker="AAPL"), _request(), {"id": 1},
    )
    events = await _events(response)

    assert [event["event"] for event in events] == ["agent_started", "error"]
    assert "fixture analysis interrupted" in json.loads(events[-1]["data"])["error"]
    assert closed == [True]


@pytest.mark.asyncio
async def test_analysis_rejects_empty_ticker_before_sse(api_client):
    response = await api_client.post("/api/analysis/stock", json={"ticker": ""})
    assert response.status_code == 422
    assert "text/event-stream" not in response.headers.get("content-type", "")


@pytest.mark.asyncio
async def test_research_pipeline_exception_fails_report_and_closes(monkeypatch):
    closed = []

    async def resolve(_raw, _market):
        return "usAAPL", "Apple"

    async def failed_research(*_args, **_kwargs):
        try:
            yield "agent_started", {"role_key": "fixture"}
            raise RuntimeError("fixture research interrupted")
        finally:
            closed.append(True)

    monkeypatch.setattr(research, "resolve_research_target", resolve)
    monkeypatch.setattr(research, "run_research", failed_research)
    response = await research.start_research(
        ResearchRequest(ticker="AAPL"), _request(), {"id": 1},
    )
    events = await _events(response)
    report_id = json.loads(events[0]["data"])["report_id"]

    assert [event["event"] for event in events] == ["report_started", "agent_started", "error"]
    assert "fixture research interrupted" in json.loads(events[-1]["data"])["error"]
    assert await database.query_one("SELECT status FROM research_reports WHERE id=?", (report_id,)) == {
        "status": "failed",
    }
    assert closed == [True]


@pytest.mark.asyncio
async def test_research_rejects_empty_ticker_before_sse(api_client):
    response = await api_client.post("/api/research", json={"ticker": ""})
    assert response.status_code == 422
    assert "text/event-stream" not in response.headers.get("content-type", "")


@pytest.mark.asyncio
async def test_swarm_pipeline_exception_fails_report_and_closes(monkeypatch):
    closed = []

    async def resolve(_raw, _market):
        return "usAAPL", "Apple"

    async def runner(*_args, **_kwargs):
        try:
            yield "agent_started", {"role_key": "fixture"}
            raise RuntimeError("fixture swarm interrupted")
        finally:
            closed.append(True)

    monkeypatch.setattr(swarm, "resolve_research_target", resolve)
    response = await swarm._analyze_with_team(
        SwarmRunRequest(ticker="AAPL"), _request(), 1, runner, lambda *_args: {},
    )
    events = await _events(response)
    report_id = json.loads(events[0]["data"])["report_id"]

    assert [event["event"] for event in events] == ["report_started", "agent_started", "error"]
    assert "fixture swarm interrupted" in json.loads(events[-1]["data"])["error"]
    assert await database.query_one("SELECT status FROM research_reports WHERE id=?", (report_id,)) == {
        "status": "failed",
    }
    assert closed == [True]


@pytest.mark.asyncio
async def test_swarm_rejects_empty_ticker_before_sse(api_client):
    response = await api_client.post("/api/swarm/analyze", json={"ticker": ""})
    assert response.status_code == 422
    assert "text/event-stream" not in response.headers.get("content-type", "")


@pytest.mark.asyncio
async def test_notifications_replay_ping_and_disconnect_cleanup(monkeypatch):
    closed = []
    calls = []

    async def list_events(*, user_id, after_id, limit):
        calls.append((user_id, after_id, limit))
        return [{"id": 8, "title": "Fixture"}]

    def debug(message, **kwargs):
        closed.append((message, kwargs["extra"]))

    monkeypatch.setattr(notifications, "list_notification_events", list_events)
    monkeypatch.setattr(notifications.LOGGER, "debug", debug)
    response = await notifications.stream_notifications(
        user={"id": 1}, after_id=3, last_event_id="7",
    )
    event = await anext(response.body_iterator)
    await response.body_iterator.aclose()

    assert response.ping_interval == 15
    assert calls == [(1, 7, 100)]
    assert event["event"] == "notification"
    assert event["id"] == "8"
    assert closed == [(
        "Notification SSE stream closed",
        {"event": "notifications.stream.closed", "last_event_id": 8},
    )]


@pytest.mark.asyncio
async def test_notifications_rejects_invalid_cursors_before_sse(api_client):
    negative = await api_client.get("/api/notifications/stream?after_id=-1")
    invalid_header = await api_client.get(
        "/api/notifications/stream", headers={"Last-Event-ID": "invalid"},
    )
    assert negative.status_code == 422
    assert invalid_header.status_code == 400
    assert "text/event-stream" not in invalid_header.headers.get("content-type", "")
