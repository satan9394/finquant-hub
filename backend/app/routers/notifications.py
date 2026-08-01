"""持久化通知列表、已读状态与可重放 SSE。"""

import json
import logging
from typing import Annotated

from fastapi import APIRouter, Header, HTTPException, Query
from sse_starlette.sse import EventSourceResponse

from ..services.notifications import (
    list_notifications as list_notification_events,
    mark_all_notifications_read,
    mark_notification_read,
    notification_revision,
    recent_notifications,
    unread_count,
    wait_for_notifications,
)

router = APIRouter(prefix="/api/notifications", tags=["notifications"])
LOGGER = logging.getLogger(__name__)


def replay_cursor(after_id: int, last_event_id: str | None) -> int:
    if not last_event_id:
        return after_id
    try:
        header_cursor = int(last_event_id)
    except ValueError as exc:
        raise HTTPException(400, "Last-Event-ID 必须是非负整数") from exc
    if header_cursor < 0:
        raise HTTPException(400, "Last-Event-ID 必须是非负整数")
    return max(after_id, header_cursor)


@router.get("")
async def get_notifications(
    limit: int = Query(default=50, ge=1, le=100),
    unread_only: bool = False,
):
    return {
        "items": await recent_notifications(limit=limit, unread_only=unread_only),
        "unread_count": await unread_count(),
    }


@router.get("/stream")
async def stream_notifications(
    after_id: int = Query(default=0, ge=0),
    last_event_id: Annotated[str | None, Header(alias="Last-Event-ID")] = None,
):
    cursor = replay_cursor(after_id, last_event_id)

    async def event_stream():
        nonlocal cursor
        revision = notification_revision()
        try:
            while True:
                items = await list_notification_events(after_id=cursor, limit=100)
                if items:
                    for item in items:
                        cursor = item["id"]
                        yield {
                            "event": "notification",
                            "id": str(item["id"]),
                            "data": json.dumps(item, ensure_ascii=False),
                        }
                    continue
                revision = await wait_for_notifications(revision)
        finally:
            LOGGER.debug(
                "Notification SSE stream closed",
                extra={"event": "notifications.stream.closed", "last_event_id": cursor},
            )

    return EventSourceResponse(event_stream(), ping=15)


@router.post("/read-all")
async def read_all_notifications():
    return {"updated": await mark_all_notifications_read()}


@router.post("/{notification_id:int}/read")
async def read_notification(notification_id: int):
    updated = await mark_notification_read(notification_id)
    if not updated:
        existing = await list_notification_events(after_id=max(0, notification_id - 1), limit=1)
        if not existing or existing[0]["id"] != notification_id:
            raise HTTPException(404, f"通知不存在：id={notification_id}")
    return {"id": notification_id, "is_read": True}
