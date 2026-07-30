"""单 Agent 对话：会话管理 + SSE 流式聊天。"""
import json

from fastapi import APIRouter, HTTPException
from sse_starlette.sse import EventSourceResponse

from .. import database
from ..models import MessageIn, SessionCreate, SessionUpdate
from ..services import model_router
from ..services.llm_client import LLMError

router = APIRouter(prefix="/api/chat", tags=["chat"])

HISTORY_LIMIT = 20
DEFAULT_SYSTEM = (
    "你是 FinQuant Hub 的金融研究助手，专注 A 股/港股/美股的量化与投资讨论。"
    "回答直接、有数据支撑、有明确观点。此内容由 AI 生成，不构成投资建议。"
)


def _estimate_tokens(text: str) -> int:
    return max(1, len(text) // 2)


async def _get_session(session_id: int) -> dict:
    session = await database.query_one("SELECT * FROM conversations WHERE id=?", (session_id,))
    if session is None:
        raise HTTPException(404, f"会话不存在：id={session_id}")
    return session


@router.post("/sessions", status_code=201)
async def create_session(body: SessionCreate):
    new_id = await database.execute(
        "INSERT INTO conversations (title, mode, role_preset, model_id) VALUES (?, 'single', ?, ?)",
        (body.title, body.role_preset, body.model_id),
    )
    return await database.query_one("SELECT * FROM conversations WHERE id=?", (new_id,))


@router.get("/sessions")
async def list_sessions():
    return {
        "items": await database.query_all(
            """
            SELECT c.*,
                   (SELECT COUNT(*) FROM messages m WHERE m.conversation_id=c.id) AS message_count,
                   (SELECT substr(m.content, 1, 50) FROM messages m
                     WHERE m.conversation_id=c.id ORDER BY m.id DESC LIMIT 1) AS last_message
            FROM conversations c WHERE c.mode='single' AND c.status='active'
            ORDER BY c.updated_at DESC
            """
        )
    }


@router.put("/sessions/{session_id}")
async def update_session(session_id: int, body: SessionUpdate):
    await _get_session(session_id)
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if updates:
        sets = ", ".join(f"{k}=?" for k in updates)
        await database.execute(
            f"UPDATE conversations SET {sets}, updated_at=datetime('now') WHERE id=?",
            (*updates.values(), session_id),
        )
    return await database.query_one("SELECT * FROM conversations WHERE id=?", (session_id,))


@router.delete("/sessions/{session_id}")
async def delete_session(session_id: int):
    await _get_session(session_id)
    await database.execute("DELETE FROM messages WHERE conversation_id=?", (session_id,))
    await database.execute("DELETE FROM conversations WHERE id=?", (session_id,))
    return {"ok": True}


@router.get("/sessions/{session_id}/messages")
async def list_messages(session_id: int):
    await _get_session(session_id)
    return {
        "items": await database.query_all(
            "SELECT * FROM messages WHERE conversation_id=? ORDER BY id", (session_id,)
        )
    }


@router.post("/sessions/{session_id}/messages")
async def send_message(session_id: int, body: MessageIn):
    session = await _get_session(session_id)
    content = body.content.strip()

    # 落库用户消息；首条消息自动生成标题
    user_msg_id = await database.execute(
        "INSERT INTO messages (conversation_id, role, content, token_count) VALUES (?, 'user', ?, ?)",
        (session_id, content, _estimate_tokens(content)),
    )
    if not session.get("title"):
        await database.execute(
            "UPDATE conversations SET title=? WHERE id=?", (content[:30], session_id)
        )

    async def stream():
        full = ""
        token_stream = None
        try:
            client, _ = await model_router.get_client(session.get("model_id"))

            system = DEFAULT_SYSTEM
            if session.get("role_preset"):
                preset = await database.query_one(
                    "SELECT * FROM agent_presets WHERE role_key=?", (session["role_preset"],)
                )
                if preset:
                    system = preset["system_prompt"]

            rows = await database.query_all(
                "SELECT role, content FROM messages WHERE conversation_id=? AND role IN ('user','assistant') "
                "ORDER BY id DESC LIMIT ?",
                (session_id, HISTORY_LIMIT),
            )
            llm_messages = [{"role": "system", "content": system}]
            llm_messages += [{"role": r["role"], "content": r["content"]} for r in reversed(rows)]

            token_stream = client.chat_stream(llm_messages)
            async for delta in token_stream:
                full += delta
                yield {"event": "token", "data": json.dumps({"delta": delta}, ensure_ascii=False)}

            msg_id = await database.execute(
                "INSERT INTO messages (conversation_id, role, content, token_count) "
                "VALUES (?, 'assistant', ?, ?)",
                (session_id, full, _estimate_tokens(full)),
            )
            await database.execute(
                "UPDATE conversations SET updated_at=datetime('now') WHERE id=?", (session_id,)
            )
            yield {
                "event": "done",
                "data": json.dumps(
                    {"message_id": msg_id, "token_count": _estimate_tokens(full),
                     "user_message_id": user_msg_id},
                    ensure_ascii=False,
                ),
            }
        except LLMError as e:
            message = str(e)
            yield {
                "event": "error",
                "data": json.dumps({"error": message, "message": message}, ensure_ascii=False),
            }
            return
        except Exception as e:  # 兜底：任何异常都要以 error 事件收尾，不能静默断流
            message = f"服务内部错误：{e}"
            yield {
                "event": "error",
                "data": json.dumps({"error": message, "message": message}, ensure_ascii=False),
            }
            return
        finally:
            close = getattr(token_stream, "aclose", None)
            if close is not None:
                await close()

    return EventSourceResponse(stream())
