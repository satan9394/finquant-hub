"""仪表盘统计。"""
import json

from fastapi import APIRouter

from .. import database

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/stats")
async def stats():
    model_count = (await database.query_one("SELECT COUNT(*) AS n FROM model_configs"))["n"]
    conv_count = (await database.query_one(
        "SELECT COUNT(*) AS n FROM conversations WHERE mode='single' AND status='active'"))["n"]
    disc_count = (await database.query_one("SELECT COUNT(*) AS n FROM discussion_rooms"))["n"]
    msg_count = (await database.query_one("SELECT COUNT(*) AS n FROM messages"))["n"]
    default_model = await database.query_one(
        "SELECT id, name, model_name FROM model_configs WHERE is_default=1 LIMIT 1")
    recent_conversations = await database.query_all(
        "SELECT c.*, (SELECT COUNT(*) FROM messages m WHERE m.conversation_id=c.id) AS message_count "
        "FROM conversations c WHERE c.mode='single' AND c.status='active' "
        "ORDER BY c.updated_at DESC LIMIT 5")
    recent_rooms = await database.query_all(
        "SELECT * FROM discussion_rooms ORDER BY created_at DESC LIMIT 5")
    for r in recent_rooms:
        r["participants"] = json.loads(r["participants"])
    return {
        "model_count": model_count,
        "conversation_count": conv_count,
        "discussion_count": disc_count,
        "message_count": msg_count,
        "default_model": default_model,
        "recent_conversations": recent_conversations,
        "recent_rooms": recent_rooms,
    }
