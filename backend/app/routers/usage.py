"""Read-only aggregate API for persisted LLM token usage."""

from fastapi import APIRouter, Query

from .. import database

router = APIRouter(prefix="/api/usage", tags=["usage"])


@router.get("")
async def get_usage(
    days: int = Query(default=30, ge=1, le=365),
    session_type: str | None = Query(default=None, min_length=1, max_length=40),
):
    """Return daily token and request counts over a bounded UTC date window."""
    where = "date(created_at) >= date('now', ?)"
    params: list[object] = [f"-{days - 1} days"]
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
