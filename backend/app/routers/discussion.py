"""多 Agent 讨论：房间管理 + SSE 讨论流。"""
import json

from fastapi import APIRouter, HTTPException
from sse_starlette.sse import EventSourceResponse

from .. import database
from ..models import RoomCreate
from ..services.discussion_orch import stream_discussion

router = APIRouter(prefix="/api/discussion", tags=["discussion"])


def _parse_room(room: dict) -> dict:
    room["participants"] = json.loads(room["participants"])
    return room


@router.post("/rooms", status_code=201)
async def create_room(body: RoomCreate):
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
        "INSERT INTO conversations (title, mode, model_id) VALUES (?, 'multi', ?)",
        (body.topic[:30], body.model_id),
    )
    room_id = await database.execute(
        "INSERT INTO discussion_rooms (conversation_id, topic, participants, total_rounds) "
        "VALUES (?, ?, ?, ?)",
        (conv_id, body.topic, json.dumps(participants, ensure_ascii=False), body.total_rounds),
    )
    room = await database.query_one("SELECT * FROM discussion_rooms WHERE id=?", (room_id,))
    return _parse_room(room)


@router.get("/rooms")
async def list_rooms():
    rows = await database.query_all(
        "SELECT * FROM discussion_rooms ORDER BY created_at DESC"
    )
    return {"items": [_parse_room(r) for r in rows]}


@router.get("/rooms/{room_id}")
async def get_room(room_id: int):
    room = await database.query_one("SELECT * FROM discussion_rooms WHERE id=?", (room_id,))
    if room is None:
        raise HTTPException(404, f"讨论房间不存在：id={room_id}")
    messages = await database.query_all(
        "SELECT * FROM messages WHERE conversation_id=? ORDER BY id", (room["conversation_id"],)
    )
    return {"room": _parse_room(room), "messages": messages}


@router.post("/rooms/{room_id}/start")
async def start_room(room_id: int):
    room = await database.query_one("SELECT * FROM discussion_rooms WHERE id=?", (room_id,))
    if room is None:
        raise HTTPException(404, f"讨论房间不存在：id={room_id}")
    if room["current_phase"] == "done":
        raise HTTPException(409, "讨论已完成，不可重复启动")
    conv = await database.query_one(
        "SELECT model_id FROM conversations WHERE id=?", (room["conversation_id"],)
    )
    return EventSourceResponse(stream_discussion(_parse_room(room), (conv or {}).get("model_id")))
