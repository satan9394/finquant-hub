"""Read-only aggregate API for persisted LLM token usage."""

from typing import Any

from fastapi import APIRouter, Depends, Query

from .. import database
from .auth import CurrentUser, authenticated_context

router = APIRouter(prefix="/api/usage", tags=["usage"], dependencies=[Depends(authenticated_context)])


@router.get("")
async def get_usage(
    user: CurrentUser,
    days: int = Query(default=30, ge=1, le=365),
    session_type: str | None = Query(default=None, min_length=1, max_length=40),
) -> dict[str, Any]:
    """Return daily token and request counts over a bounded UTC date window."""
    where = "date(created_at) >= date('now', ?) AND user_id=?"
    params: list[object] = [f"-{days - 1} days", user["id"]]
    if session_type:
        where += " AND session_type = ?"
        params.append(session_type)

    items = await database.query_all(
        "SELECT date(created_at) AS day, "
        "SUM(prompt_tokens) AS prompt_tokens, "
        "SUM(completion_tokens) AS completion_tokens, "
        "SUM(total_tokens) AS total_tokens, "
        "COUNT(*) AS request_count "
        f"FROM llm_usage WHERE {where} GROUP BY date(created_at) ORDER BY day",
        tuple(params),
    )
    total = await database.query_one(
        "SELECT COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens, "
        "COALESCE(SUM(completion_tokens), 0) AS completion_tokens, "
        "COALESCE(SUM(total_tokens), 0) AS total_tokens, "
        "COUNT(*) AS request_count "
        f"FROM llm_usage WHERE {where}",
        tuple(params),
    )
    by_session_type = await database.query_all(
        "SELECT session_type, SUM(total_tokens) AS total_tokens, COUNT(*) AS request_count "
        f"FROM llm_usage WHERE {where} GROUP BY session_type "
        "ORDER BY total_tokens DESC, session_type",
        tuple(params),
    )
    return {
        "days": days,
        "session_type": session_type,
        "items": items,
        "total": total,
        "by_session_type": by_session_type,
    }


@router.get("/records")
async def get_usage_records(
    user: CurrentUser,
    limit: int = Query(default=50, ge=1, le=200),
    session_type: str | None = Query(default=None, min_length=1, max_length=40),
) -> dict[str, Any]:
    """Return recent session-level LLM usage records for the current user.

    Scoped to the authenticated user, newest first, bounded by ``limit``.
    Optional ``session_type`` filters to a single scenario.
    """
    where = "user_id=?"
    params: list[object] = [user["id"]]
    if session_type:
        where += " AND session_type = ?"
        params.append(session_type)

    items = await database.query_all(
        "SELECT id, session_type, model_name, conversation_id, total_tokens, "
        "prompt_tokens, completion_tokens, created_at "
        f"FROM llm_usage WHERE {where} ORDER BY created_at DESC, id DESC LIMIT ?",
        tuple(params + [limit]),
    )
    total = await database.query_one(
        f"SELECT COUNT(*) AS count FROM llm_usage WHERE {where}",
        tuple(params),
    )
    return {"items": items, "total": total["count"] if total else 0}
