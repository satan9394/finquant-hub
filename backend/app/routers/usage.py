"""Read-only aggregate API for persisted LLM token usage and estimated cost.

Cost is always derived: ``llm_usage`` stores tokens only, and unit prices come
from the owner-scoped ``model_pricing`` table. Models without a configured price
are reported as ``priced: false`` with ``estimated_cost: null`` — never as 0.

Windows are inclusive UTC dates. Callers may either ask for the last ``days``
days (unchanged legacy behaviour) or pin an explicit ``start``/``end`` range;
malformed or inverted ranges are rejected with an honest 400.
"""

from datetime import date, datetime, timedelta, timezone
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Query

from .. import database
from .auth import CurrentUser, authenticated_context

router = APIRouter(prefix="/api/usage", tags=["usage"], dependencies=[Depends(authenticated_context)])

TOKENS_PER_MILLION = 1_000_000
MAX_RANGE_DAYS = 366


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


def parse_iso_date(value: str, field: str) -> date:
    """Parse ``YYYY-MM-DD`` or reject the whole request with a 400."""
    try:
        return date.fromisoformat(value)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"invalid {field}: expected YYYY-MM-DD") from exc


def resolve_range(
    days: int,
    start: str | None,
    end: str | None,
    *,
    today: date | None = None,
) -> tuple[date, date]:
    """Resolve the inclusive UTC date window from ``days`` or ``start``/``end``.

    ``days`` keeps working exactly as before when no explicit range is given.
    A half-specified, unparseable, inverted or oversized range is a client error.
    """
    if (start is None) != (end is None):
        raise HTTPException(status_code=400, detail="start and end must be provided together")
    if start is None:
        end_date = today or datetime.now(timezone.utc).date()
        return end_date - timedelta(days=days - 1), end_date
    start_date = parse_iso_date(start, "start")
    end_date = parse_iso_date(end, "end")
    if start_date > end_date:
        raise HTTPException(status_code=400, detail="start must not be after end")
    if (end_date - start_date).days + 1 > MAX_RANGE_DAYS:
        raise HTTPException(status_code=400, detail=f"range must not exceed {MAX_RANGE_DAYS} days")
    return start_date, end_date


def _window(
    days: int,
    session_type: str | None,
    alias: str,
    user_id: int,
    start: str | None = None,
    end: str | None = None,
) -> tuple[str, list[object]]:
    start_date, end_date = resolve_range(days, start, end)
    where = (
        f"date({alias}created_at) >= date(?) AND date({alias}created_at) <= date(?) "
        f"AND {alias}user_id=?"
    )
    params: list[object] = [start_date.isoformat(), end_date.isoformat(), user_id]
    if session_type:
        where += f" AND {alias}session_type = ?"
        params.append(session_type)
    return where, params


def _cost_rollup(rows: list[dict[str, Any]]) -> dict[str, Any]:
    """Roll priced/unpriced cost rows up without ever inventing a price.

    ``cost_status`` is the honest single-word summary: ``none`` (no rows in the
    window), ``unpriced`` (nothing has a unit price), ``mixed_currency`` (priced
    rows span several currencies, so no single total exists), ``partial`` (some
    models are unpriced) or ``priced``.
    """
    cost_by_currency: dict[str, float] = {}
    unpriced_total_tokens = 0
    unpriced_models = 0
    priced_models = 0
    for row in rows:
        cost = row["estimated_cost"]
        if cost is None:
            unpriced_models += 1
            unpriced_total_tokens += row["total_tokens"] or 0
        else:
            priced_models += 1
            currency = row["currency"] or ""
            cost_by_currency[currency] = cost_by_currency.get(currency, 0.0) + cost
    single_currency = next(iter(cost_by_currency)) if len(cost_by_currency) == 1 else None
    if not rows:
        cost_status = "none"
    elif priced_models == 0:
        cost_status = "unpriced"
    elif len(cost_by_currency) > 1:
        cost_status = "mixed_currency"
    elif unpriced_models:
        cost_status = "partial"
    else:
        cost_status = "priced"
    return {
        "priced_models": priced_models,
        "unpriced_models": unpriced_models,
        "unpriced_total_tokens": unpriced_total_tokens,
        "cost_by_currency": cost_by_currency,
        "currency": single_currency,
        "mixed_currency": len(cost_by_currency) > 1,
        "estimated_cost": cost_by_currency[single_currency] if single_currency else None,
        "cost_status": cost_status,
    }


def _stats_row(row: dict[str, Any]) -> dict[str, Any]:
    """Turn one aggregated model row into a stats item with derived cost."""
    cost = estimate_cost(
        row["prompt_tokens"],
        row["completion_tokens"],
        row["input_per_1m"],
        row["output_per_1m"],
    )
    return {
        "key": row["key"],
        "request_count": row["request_count"],
        "prompt_tokens": row["prompt_tokens"],
        "completion_tokens": row["completion_tokens"],
        "total_tokens": row["total_tokens"],
        **_cost_rollup([{
            "estimated_cost": cost,
            "currency": row["currency"],
            "total_tokens": row["total_tokens"],
        }]),
    }


def _fold_by_key(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Fold per-(key, model) rows into one item per key, keeping cost honest."""
    buckets: dict[str, dict[str, Any]] = {}
    cost_rows: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        key = row["key"]
        bucket = buckets.get(key)
        if bucket is None:
            bucket = buckets[key] = {
                "key": key,
                "request_count": 0,
                "prompt_tokens": 0,
                "completion_tokens": 0,
                "total_tokens": 0,
            }
            cost_rows[key] = []
        bucket["request_count"] += row["request_count"]
        bucket["prompt_tokens"] += row["prompt_tokens"]
        bucket["completion_tokens"] += row["completion_tokens"]
        bucket["total_tokens"] += row["total_tokens"]
        cost_rows[key].append({
            "estimated_cost": estimate_cost(
                row["prompt_tokens"],
                row["completion_tokens"],
                row["input_per_1m"],
                row["output_per_1m"],
            ),
            "currency": row["currency"],
            "total_tokens": row["total_tokens"],
        })
    items = [
        {**bucket, **_cost_rollup(cost_rows[key])}
        for key, bucket in buckets.items()
    ]
    items.sort(key=lambda item: (-item["total_tokens"], item["key"] or ""))
    return items


@router.get("")
async def get_usage(
    user: CurrentUser,
    days: int = Query(default=30, ge=1, le=365),
    session_type: str | None = Query(default=None, min_length=1, max_length=40),
    start: str | None = None,
    end: str | None = None,
) -> dict[str, Any]:
    """Return daily token and request counts over a bounded UTC date window.

    ``days`` stays backward compatible; ``start``/``end`` (both or neither) pin an
    explicit inclusive range instead. The resolved window is echoed back so the UI
    can show exactly which dates were counted.
    """
    start_date, end_date = resolve_range(days, start, end)
    where, params = _window(days, session_type, "", user["id"], start=start, end=end)

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
        "days": (end_date - start_date).days + 1,
        "start": start_date.isoformat(),
        "end": end_date.isoformat(),
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
    start: str | None = None,
    end: str | None = None,
) -> dict[str, Any]:
    """Estimate cost per model from tokens × owner-configured unit prices.

    Models without a configured price are reported with ``priced: false`` and
    ``estimated_cost: null``; they are counted in ``unpriced_*`` instead of
    being folded into the total as 0. Currencies are never converted: totals are
    grouped per currency and ``estimated_cost`` is only filled when the priced
    rows share a single currency.
    """
    start_date, end_date = resolve_range(days, start, end)
    where, params = _window(days, session_type, "u.", user["id"], start=start, end=end)
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
    unpriced_model_names: list[str | None] = []
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
            unpriced_model_names.append(row["model_name"])

    totals = await database.query_one(
        "SELECT COALESCE(SUM(u.prompt_tokens), 0) AS prompt_tokens, "
        "COALESCE(SUM(u.completion_tokens), 0) AS completion_tokens, "
        "COALESCE(SUM(u.total_tokens), 0) AS total_tokens, "
        "COUNT(*) AS request_count "
        f"FROM llm_usage u WHERE {where}",
        tuple(params),
    ) or {}
    return {
        "days": (end_date - start_date).days + 1,
        "start": start_date.isoformat(),
        "end": end_date.isoformat(),
        "session_type": session_type,
        "items": items,
        "total": {
            **(totals),
            **_cost_rollup(items),
            "unpriced_model_names": unpriced_model_names,
        },
    }


@router.get("/stats")
async def get_usage_stats(
    user: CurrentUser,
    dimension: Literal["model", "session_type"] = Query(default="model"),
    days: int = Query(default=30, ge=1, le=365),
    session_type: str | None = Query(default=None, min_length=1, max_length=40),
    start: str | None = None,
    end: str | None = None,
) -> dict[str, Any]:
    """Aggregate the window by model or by session type for the stats table.

    Rows carry request/token totals plus the same owner-scoped cost semantics as
    ``/api/usage/cost``: a row is ``priced`` only when every model behind it has a
    unit price, ``partial`` when some do not, ``mixed_currency`` when the priced
    models span currencies, and ``unpriced`` when none has a price. Nothing is
    converted to a single number when it would be a lie.
    """
    start_date, end_date = resolve_range(days, start, end)
    where, params = _window(days, session_type, "u.", user["id"], start=start, end=end)

    if dimension == "model":
        rows = await database.query_all(
            "SELECT u.model_name AS key, "
            "COALESCE(SUM(u.prompt_tokens), 0) AS prompt_tokens, "
            "COALESCE(SUM(u.completion_tokens), 0) AS completion_tokens, "
            "COALESCE(SUM(u.total_tokens), 0) AS total_tokens, "
            "COUNT(*) AS request_count, "
            "p.input_per_1m AS input_per_1m, p.output_per_1m AS output_per_1m, "
            "p.currency AS currency "
            "FROM llm_usage u LEFT JOIN model_pricing p "
            "ON p.user_id = u.user_id AND p.model_name = u.model_name "
            f"WHERE {where} "
            "GROUP BY u.model_name, p.input_per_1m, p.output_per_1m, p.currency "
            "ORDER BY total_tokens DESC, u.model_name",
            tuple(params),
        )
        items = [_stats_row(row) for row in rows]
    else:
        rows = await database.query_all(
            "SELECT u.session_type AS key, u.model_name AS model_name, "
            "COALESCE(SUM(u.prompt_tokens), 0) AS prompt_tokens, "
            "COALESCE(SUM(u.completion_tokens), 0) AS completion_tokens, "
            "COALESCE(SUM(u.total_tokens), 0) AS total_tokens, "
            "COUNT(*) AS request_count, "
            "p.input_per_1m AS input_per_1m, p.output_per_1m AS output_per_1m, "
            "p.currency AS currency "
            "FROM llm_usage u LEFT JOIN model_pricing p "
            "ON p.user_id = u.user_id AND p.model_name = u.model_name "
            f"WHERE {where} "
            "GROUP BY u.session_type, u.model_name, p.input_per_1m, p.output_per_1m, p.currency "
            "ORDER BY u.session_type",
            tuple(params),
        )
        items = _fold_by_key(rows)

    total: dict[str, Any] = {
        "request_count": sum(item["request_count"] for item in items),
        "prompt_tokens": sum(item["prompt_tokens"] for item in items),
        "completion_tokens": sum(item["completion_tokens"] for item in items),
        "total_tokens": sum(item["total_tokens"] for item in items),
        **_cost_rollup(items),
    }
    return {
        "dimension": dimension,
        "days": (end_date - start_date).days + 1,
        "start": start_date.isoformat(),
        "end": end_date.isoformat(),
        "session_type": session_type,
        "items": items,
        "total": total,
    }
