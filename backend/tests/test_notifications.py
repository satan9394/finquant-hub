import asyncio

import pytest
import pytest_asyncio
from fastapi import HTTPException

from app import config, database
from app.routers import notifications as notifications_router
from app.services.notifications import (
    list_notifications,
    mark_all_notifications_read,
    mark_notification_read,
    notification_revision,
    publish_notification,
    recent_notifications,
    unread_count,
    wait_for_notifications,
)


@pytest_asyncio.fixture
async def notification_db(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "DB_PATH", tmp_path / "notifications.db")
    await database.init_db()
    await database.execute("INSERT INTO users (id, email, is_admin) VALUES (1, 'notify@test.local', 1)")
    try:
        yield
    finally:
        await database.close_db()


@pytest.mark.asyncio
async def test_publish_persists_payload_and_deduplicates(notification_db):
    first = await publish_notification(
        "research.completed",
        "研究完成",
        "AAPL 报告已生成",
        user_id=1,
        severity="success",
        source_type="research_report",
        source_id=7,
        payload={"url": "/research/reports"},
        dedupe_key="research:7:completed",
    )
    duplicate = await publish_notification(
        "research.completed",
        "重复",
        "不应写入",
        user_id=1,
        dedupe_key="research:7:completed",
    )

    assert duplicate is None
    assert first["source_id"] == "7"
    assert first["payload"] == {"url": "/research/reports"}
    assert first["is_read"] is False
    assert await unread_count(1) == 1
    assert (await recent_notifications(user_id=1))[0]["id"] == first["id"]


@pytest.mark.asyncio
async def test_read_state_and_replay_cursor(notification_db):
    first = await publish_notification("one", "第一条", "正文一", user_id=1)
    second = await publish_notification("two", "第二条", "正文二", user_id=1)

    assert [item["id"] for item in await list_notifications(user_id=1, after_id=first["id"])] == [second["id"]]
    assert await mark_notification_read(first["id"], 1) is True
    assert await mark_notification_read(first["id"], 1) is False
    assert await unread_count(1) == 1
    assert await mark_all_notifications_read(1) == 1
    assert await unread_count(1) == 0

    assert notifications_router.replay_cursor(2, "5") == 5
    with pytest.raises(HTTPException, match="Last-Event-ID"):
        notifications_router.replay_cursor(0, "invalid")


@pytest.mark.asyncio
async def test_waiter_wakes_and_sse_replays_after_last_event_id(notification_db, monkeypatch):
    closed = []

    def capture_close(message, **kwargs):
        closed.append((message, kwargs["extra"]))

    monkeypatch.setattr(notifications_router.LOGGER, "debug", capture_close)
    first = await publish_notification("one", "第一条", "正文一", user_id=1)
    revision = notification_revision()
    waiter = asyncio.create_task(wait_for_notifications(revision, timeout=1))
    await asyncio.sleep(0)
    second = await publish_notification("two", "第二条", "正文二", user_id=1)
    assert await waiter > revision

    response = await notifications_router.stream_notifications(
        user={"id": 1},
        after_id=0,
        last_event_id=str(first["id"]),
    )
    event = await anext(response.body_iterator)
    await response.body_iterator.aclose()

    assert event["event"] == "notification"
    assert event["id"] == str(second["id"])
    assert '"title": "第二条"' in event["data"]
    assert closed == [(
        "Notification SSE stream closed",
        {"event": "notifications.stream.closed", "last_event_id": second["id"]},
    )]


@pytest.mark.asyncio
async def test_publish_validation_is_bounded(notification_db):
    with pytest.raises(ValueError, match="级别"):
        await publish_notification("event", "title", "body", user_id=1, severity="critical")
    with pytest.raises(ValueError, match="不能为空"):
        await publish_notification("", "title", "body", user_id=1)
    with pytest.raises(ValueError, match="limit"):
        await list_notifications(user_id=1, limit=101)
