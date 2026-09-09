"""Read-only aggregate API for persisted LLM token usage and estimated cost.

Cost is always derived: ``llm_usage`` stores tokens only, and unit prices come
from the owner-scoped ``model_pricing`` table. Models without a configured price
are reported as ``priced: false`` with ``estimated_cost: null`` — never as 0.
"""

from typing import Any

from fastapi import APIRouter, Depends, Query

from .. import database
from .auth import CurrentUser, authenticated_context

router = APIRouter(prefix="/api/usage", tags=["usage"], dependencies=[Depends(authenticated_context)])

TOKENS_PER_MILLION = 1_000_000


def estimate_cost(
    prompt_tokens: int | None,
    completion_tokens: int | None,
    input_per_1m: float | None,
    output_per_1m: float | None,
) -> float | None:
    """Return the estimated cost, or ``None`` when the model is unpriced.

    ``None`` is deliberate: an unconfigured model must never be rendered as a
    free (0) request.
    """
    if input_per_1m is None or output_per_1m is None:
        return None
    return (
        (prompt_tokens or 0) / TOKENS_PER_MILLION * input_per_1m
        + (completion_tokens or 0) / TOKENS_PER_MILLION * output_per_1m
    )


def _window(days: int, session_type: str | None, alias: str, user_id: int) -> tuple[str, list[object]]:
    where = f"date({alias}created_at) >= date('now', ?) AND {alias}user_id=?"
    params: list[object] = [f"-{days - 1} days", user_id]
    if session_type:
        where += f" AND {alias}session_type = ?"
        params.append(session_type)
    return where, params


@router.get("")
async def get_usage(
    user: CurrentUser,
    days: int = Query(default=30, ge=1, le=365),
    session_type: str | None = Query(default=None, min_length=1, max_length=40),
) -> dict[str, Any]:
    """Return daily token and request counts over a bounded UTC date window."""
    where, params = _window(days, session_type, "", user["id"])

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
    Optional ``session_type`` filters to a single scenario. Each record carries
    the owner-scoped estimate: ``priced: false`` and ``estimated_cost: null``
    when no unit price is configured for that model.
    """
    where = "u.user_id=?"
    params: list[object] = [user["id"]]
    if session_type:
        where += " AND u.session_type = ?"
        params.append(session_type)

    items = await database.query_all(
        "SELECT u.id, u.session_type, u.model_name, u.conversation_id, u.total_tokens, "
        "u.prompt_tokens, u.completion_tokens, u.created_at, "
        "p.input_per_1m, p.output_per_1m, p.currency "
        "FROM llm_usage u LEFT JOIN model_pricing p "
        "ON p.user_id = u.user_id AND p.model_name = u.model_name "
        f"WHERE {where} ORDER BY u.created_at DESC, u.id DESC LIMIT ?",
        tuple(params + [limit]),
    )
    total = await database.query_one(
        f"SELECT COUNT(*) AS count FROM llm_usage u WHERE {where}",
        tuple(params),
    )
    for item in items:
        cost = estimate_cost(
            item.get("prompt_tokens"),
            item.get("completion_tokens"),
            item.pop("input_per_1m", None),
            item.pop("output_per_1m", None),
        )
        currency = item.pop("currency", None)
        item["currency"] = currency if cost is not None else None
        item["priced"] = cost is not None
        item["estimated_cost"] = cost
    return {"items": items, "total": total["count"] if total else 0}


@router.get("/cost")
async def get_usage_cost(
    user: CurrentUser,
    days: int = Query(default=30, ge=1, le=365),
    session_type: str | None = Query(default=None, min_length=1, max_length=40),
) -> dict[str, Any]:
    """Estimate cost per model from tokens × owner-configured unit prices.

    Models without a configured price are reported with ``priced: false`` and
    ``estimated_cost: null``; they are counted in ``unpriced_*`` instead of
    being folded into the total as 0. Currencies are never converted: totals are
    grouped per currency and ``estimated_cost`` is only filled when the priced
    rows share a single currency.
    """
    where, params = _window(days, session_type, "u.", user["id"])
    rows = await database.query_all(
        "SELECT u.model_name AS model_name, "
        "COALESCE(SUM(u.prompt_tokens), 0) AS prompt_tokens, "
        "COALESCE(SUM(u.completion_tokens), 0) AS completion_tokens, "
        "COALESCE(SUM(u.total_tokens), 0) AS total_tokens, "
        "COUNT(*) AS request_count, "
        "p.input_per_1m AS input_per_1m, p.output_per_1m AS output_per_1m, "
        "p.currency AS currency, p.source AS price_source "
        "FROM llm_usage u LEFT JOIN model_pricing p "
        "ON p.user_id = u.user_id AND p.model_name = u.model_name "
        f"WHERE {where} "
        "GROUP BY u.model_name, p.input_per_1m, p.output_per_1m, p.currency, p.source "
        "ORDER BY total_tokens DESC, model_name",
        tuple(params),
    )

    items: list[dict[str, Any]] = []
    cost_by_currency: dict[str, float] = {}
    unpriced_models: list[str | None] = []
    unpriced_tokens = 0
    for row in rows:
        cost = estimate_cost(
            row["prompt_tokens"],
            row["completion_tokens"],
            row["input_per_1m"],
            row["output_per_1m"],
        )
        item = {
            "model_name": row["model_name"],
            "prompt_tokens": row["prompt_tokens"],
            "completion_tokens": row["completion_tokens"],
            "total_tokens": row["total_tokens"],
            "request_count": row["request_count"],
            "priced": cost is not None,
            "currency": row["currency"] if cost is not None else None,
            "input_per_1m": row["input_per_1m"] if cost is not None else None,
            "output_per_1m": row["output_per_1m"] if cost is not None else None,
            "price_source": row["price_source"] if cost is not None else None,
            "estimated_cost": cost,
        }
        items.append(item)
        if cost is None:
            unpriced_models.append(row["model_name"])
            unpriced_tokens += row["total_tokens"] or 0
        else:
            currency = row["currency"] or ""
            cost_by_currency[currency] = cost_by_currency.get(currency, 0.0) + cost

    single_currency = next(iter(cost_by_currency)) if len(cost_by_currency) == 1 else None
    totals = await database.query_one(
        "SELECT COALESCE(SUM(u.prompt_tokens), 0) AS prompt_tokens, "
        "COALESCE(SUM(u.completion_tokens), 0) AS completion_tokens, "
        "COALESCE(SUM(u.total_tokens), 0) AS total_tokens, "
        "COUNT(*) AS request_count "
        f"FROM llm_usage u WHERE {where}",
        tuple(params),
    ) or {}
    return {
        "days": days,
        "session_type": session_type,
        "items": items,
        "total": {
            **(totals),
            "priced_models": len([item for item in items if item["priced"]]),
            "unpriced_models": len(unpriced_models),
            "unpriced_model_names": unpriced_models,
            "unpriced_total_tokens": unpriced_tokens,
            "cost_by_currency": cost_by_currency,
            "currency": single_currency,
            "mixed_currency": len(cost_by_currency) > 1,
            "estimated_cost": cost_by_currency[single_currency] if single_currency else None,
        },
    }
