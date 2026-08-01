"""单 Agent 对话：会话管理 + SSE 流式聊天。"""
import json
import logging

from fastapi import APIRouter, HTTPException
from sse_starlette.sse import EventSourceResponse

from .. import database
from ..agent import tools_definitions as _tools_definitions  # noqa: F401
from ..agent.tools import ToolRegistry
from ..models import MessageIn, SessionCreate, SessionUpdate
from ..services.context import estimate_tokens
from ..services import model_router
from ..services.llm_client import LLMError
from ..services.llm_usage import reset_usage_context, set_usage_context
from ..services.memory import render_memory_context, search_cross_session_memory

router = APIRouter(prefix="/api/chat", tags=["chat"])
LOGGER = logging.getLogger(__name__)

HISTORY_LIMIT = 20
DEFAULT_SYSTEM = (
    "你是 FinQuant Hub 的金融研究助手，专注 A 股/港股/美股的量化与投资讨论。"
    "回答直接、有数据支撑、有明确观点。此内容由 AI 生成，不构成投资建议。"
)


async def _execute_tool(name: str, arguments: str) -> str:
    tool = ToolRegistry().get(name)
    if tool is None:
        return json.dumps({"success": False, "error": f"未知工具：{name}"}, ensure_ascii=False)
    try:
        payload = json.loads(arguments or "{}")
    except json.JSONDecodeError:
        return json.dumps({"success": False, "error": "工具参数不是有效 JSON"}, ensure_ascii=False)
    if not isinstance(payload, dict):
        return json.dumps({"success": False, "error": "工具参数必须是对象"}, ensure_ascii=False)
    result = await tool.run(**payload)
    return json.dumps(
        {"success": result.success, "data": result.data, "error": result.error},
        ensure_ascii=False,
        default=str,
    )


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
        (session_id, content, estimate_tokens(content)),
    )
    if not session.get("title"):
        await database.execute(
            "UPDATE conversations SET title=? WHERE id=?", (content[:30], session_id)
        )

    async def stream():
        full = ""
        usage_token = set_usage_context("chat", session_id)
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
            memory_hits = await search_cross_session_memory(
                content,
                exclude_conversation_id=session_id,
            )
            memory_context = render_memory_context(memory_hits)
            if memory_context:
                llm_messages.append({"role": "system", "content": memory_context})
            llm_messages += [{"role": r["role"], "content": r["content"]} for r in reversed(rows)]

            registry = ToolRegistry()
            full, tool_calls, llm_tokens = await client.chat_with_tools_loop(
                llm_messages,
                registry.to_openai_tools(),
                _execute_tool,
            )
            for call in tool_calls:
                yield {
                    "event": "tool_call",
                    "data": json.dumps({
                        "tool_name": call["name"],
                        "arguments": call["arguments"],
                    }, ensure_ascii=False),
                }
            if full:
                yield {"event": "token", "data": json.dumps({"delta": full}, ensure_ascii=False)}

            msg_id = await database.execute(
                "INSERT INTO messages (conversation_id, role, content, token_count) "
                "VALUES (?, 'assistant', ?, ?)",
                (session_id, full, estimate_tokens(full)),
            )
            await database.execute(
                "UPDATE conversations SET updated_at=datetime('now') WHERE id=?", (session_id,)
            )
            yield {
                "event": "done",
                "data": json.dumps(
                    {"message_id": msg_id, "token_count": estimate_tokens(full),
                     "llm_token_count": llm_tokens, "tool_call_count": len(tool_calls),
                     "user_message_id": user_msg_id},
                    ensure_ascii=False,
                ),
            }
        except LLMError as e:
            LOGGER.exception(
                "Chat SSE LLM request failed",
                extra={"event": "chat.stream.llm_error", "session_id": session_id},
            )
            message = str(e)
            yield {
                "event": "error",
                "data": json.dumps({"error": message, "message": message}, ensure_ascii=False),
            }
            return
        except Exception as e:  # 兜底：任何异常都要以 error 事件收尾，不能静默断流
            LOGGER.exception(
                "Chat SSE pipeline failed",
                extra={"event": "chat.stream.error", "session_id": session_id},
            )
            message = f"服务内部错误：{e}"
            yield {
                "event": "error",
                "data": json.dumps({"error": message, "message": message}, ensure_ascii=False),
            }
            return
        finally:
            # SSE lifecycle boundary stays explicit even though tool calling is non-streaming upstream.
            reset_usage_context(usage_token)

    return EventSourceResponse(stream())
