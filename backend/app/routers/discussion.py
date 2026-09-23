"""多 Agent 讨论：房间管理 + SSE 讨论流。"""
import json
import logging
from collections.abc import AsyncIterator, Callable
from typing import Any, cast

from fastapi import APIRouter, Depends, HTTPException
from sse_starlette.sse import EventSourceResponse

from .. import database
from ..models import RoomCreate
from ..services.discussion_orch import stream_discussion
from ..services.llm_usage import reset_usage_context, set_usage_context
from .auth import CurrentUser, authenticated_context

router = APIRouter(prefix="/api/discussion", tags=["discussion"], dependencies=[Depends(authenticated_context)])
LOGGER = logging.getLogger(__name__)


def _parse_room(room: dict[str, Any]) -> dict[str, Any]:
    room["participants"] = json.loads(room["participants"])
    return room


@router.post("/rooms", status_code=201)
async def create_room(body: RoomCreate, user: CurrentUser) -> dict[str, Any]:
    user_id = int(user["id"])
    rows = await database.query_all(
        f"SELECT role_key, name, avatar FROM agent_presets WHERE role_key IN ({','.join('?' * len(body.role_keys))})",
        tuple(body.role_keys),
    )
    found = {r["role_key"] for r in rows}
    missing = set(body.role_keys) - found
    if missing:
        raise HTTPException(400, f"角色不存在：{','.join(sorted(missing))}")
    participants = [{"role_key": r["role_key"], "name": r["name"], "avatar": r["avatar"]} for r in rows]

    conv_id = await database.execute(
        "INSERT INTO conversations (title, mode, model_id, user_id) VALUES (?, 'multi', ?, ?)",
        (body.topic[:30], body.model_id, user_id),
    )
    room_id = await database.execute(
        "INSERT INTO discussion_rooms (conversation_id, topic, participants, total_rounds, user_id) "
        "VALUES (?, ?, ?, ?, ?)",
        (conv_id, body.topic, json.dumps(participants, ensure_ascii=False), body.total_rounds, user_id),
    )
    room = await database.query_one("SELECT * FROM discussion_rooms WHERE id=? AND user_id=?", (room_id, user_id))
    return _parse_room(cast(dict[str, Any], room))


@router.get("/rooms")
async def list_rooms(user: CurrentUser) -> dict[str, Any]:
    rows = await database.query_all(
        "SELECT * FROM discussion_rooms WHERE user_id=? ORDER BY created_at DESC", (user["id"],)
    )
    return {"items": [_parse_room(r) for r in rows]}


@router.get("/rooms/{room_id}")
async def get_room(room_id: int, user: CurrentUser) -> dict[str, Any]:
    user_id = int(user["id"])
    room = await database.query_one("SELECT * FROM discussion_rooms WHERE id=? AND user_id=?", (room_id, user_id))
    if room is None:
        raise HTTPException(404, f"讨论房间不存在：id={room_id}")
    messages = await database.query_all(
        "SELECT * FROM messages WHERE conversation_id=? AND user_id=? ORDER BY id",
        (room["conversation_id"], user_id),
    )
    return {"room": _parse_room(room), "messages": messages}


@router.post("/rooms/{room_id}/start")
async def start_room(room_id: int, user: CurrentUser) -> EventSourceResponse:
    user_id = int(user["id"])
    room = await database.query_one("SELECT * FROM discussion_rooms WHERE id=? AND user_id=?", (room_id, user_id))
    if room is None:
        raise HTTPException(404, f"讨论房间不存在：id={room_id}")
    if room["current_phase"] == "done":
        raise HTTPException(409, "讨论已完成，不可重复启动")
    conv = await database.query_one(
        "SELECT model_id FROM conversations WHERE id=? AND user_id=?", (room["conversation_id"], user_id)
    )

    async def event_stream() -> AsyncIterator[dict[str, str]]:
        discussion_stream: AsyncIterator[dict[str, str]] | None = None
        usage_token = set_usage_context("discussion", room["conversation_id"], user_id)
        try:
            typed_stream = cast(
                Callable[[dict[str, Any], int | None], AsyncIterator[dict[str, str]]],
                stream_discussion,
            )
            discussion_stream = typed_stream(_parse_room(room), (conv or {}).get("model_id"))
            async for event in discussion_stream:
                if event.get("event") == "error":
                    data = json.loads(event["data"])
                    message = data.get("error") or data.get("message") or "讨论编排错误"
                    await database.execute(
                        "UPDATE discussion_rooms SET current_phase='failed' WHERE id=? AND user_id=?",
                        (room_id, user_id),
                    )
                    yield {
                        "event": "error",
                        "data": json.dumps({"error": message, "message": message}, ensure_ascii=False),
                    }
                    break
                yield event
        except Exception as e:
            LOGGER.exception(
                "Discussion SSE pipeline failed",
                extra={"event": "discussion.stream.error", "room_id": room_id},
            )
            message = f"讨论编排错误：{e}"
            yield {
                "event": "error",
                "data": json.dumps({"error": message, "message": message}, ensure_ascii=False),
            }
            return
        finally:
            reset_usage_context(usage_token)
            close = getattr(discussion_stream, "aclose", None)
            if close is not None:
                await close()

    return EventSourceResponse(event_stream())
