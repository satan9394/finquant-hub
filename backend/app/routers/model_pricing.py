"""Owner-scoped CRUD for model unit prices (BACKLOG-044).

Prices are user-maintained only: the table is never seeded with built-in
numbers, because no official pricing page has been verified inside this repo.
Cost is always derived from ``llm_usage`` tokens at read time; the usage table
itself stays token-only.
"""

from __future__ import annotations

import math
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field, field_validator

from .. import database
from .auth import CurrentUser, authenticated_context

router = APIRouter(
    prefix="/api/model-pricing",
    tags=["model-pricing"],
    dependencies=[Depends(authenticated_context)],
)

MAX_MODEL_NAME_LENGTH = 120
MAX_CURRENCY_LENGTH = 8


class ModelPricingInput(BaseModel):
    """Validated unit price payload; prices are per 1M tokens in ``currency``."""

    model_config = ConfigDict(extra="forbid")

    model_name: str = Field(min_length=1, max_length=MAX_MODEL_NAME_LENGTH)
    input_per_1m: float = Field(ge=0)
    output_per_1m: float = Field(ge=0)
    currency: str = Field(default="CNY", min_length=1, max_length=MAX_CURRENCY_LENGTH)

    @field_validator("model_name", "currency")
    @classmethod
    def _strip_required(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("不能为空")
        return stripped

    @field_validator("input_per_1m", "output_per_1m")
    @classmethod
    def _finite_price(cls, value: float) -> float:
        if not math.isfinite(value):
            raise ValueError("单价必须是有限数值")
        return value


async def _owned_row(pricing_id: int, user_id: int) -> dict[str, Any]:
    row = await database.query_one(
        "SELECT id, model_name, input_per_1m, output_per_1m, currency, source, updated_at "
        "FROM model_pricing WHERE id=? AND user_id=?",
        (pricing_id, user_id),
    )
    if row is None:
        raise HTTPException(404, f"单价配置不存在：id={pricing_id}")
    return row


async def _ensure_unique(user_id: int, model_name: str, exclude_id: int | None = None) -> None:
    sql = "SELECT id FROM model_pricing WHERE user_id=? AND model_name=?"
    params: list[object] = [user_id, model_name]
    if exclude_id is not None:
        sql += " AND id<>?"
        params.append(exclude_id)
    if await database.query_one(sql + " LIMIT 1", tuple(params)):
        raise HTTPException(409, f"该模型已配置单价：{model_name}")


@router.get("")
async def list_model_pricing(user: CurrentUser) -> dict[str, Any]:
    """List the current user's configured unit prices (never other owners')."""
    items = await database.query_all(
        "SELECT id, model_name, input_per_1m, output_per_1m, currency, source, updated_at "
        "FROM model_pricing WHERE user_id=? ORDER BY model_name, id",
        (int(user["id"]),),
    )
    return {"items": items, "total": len(items)}


@router.post("", status_code=status.HTTP_201_CREATED)
async def create_model_pricing(body: ModelPricingInput, user: CurrentUser) -> dict[str, Any]:
    """Create one owner-scoped price row; duplicate model_name → 409."""
    user_id = int(user["id"])
    await _ensure_unique(user_id, body.model_name)
    pricing_id = await database.execute(
        "INSERT INTO model_pricing "
        "(user_id, model_name, input_per_1m, output_per_1m, currency, source, updated_at) "
        "VALUES (?, ?, ?, ?, ?, 'manual', datetime('now'))",
        (user_id, body.model_name, body.input_per_1m, body.output_per_1m, body.currency),
    )
    return await _owned_row(pricing_id, user_id)


@router.put("/{pricing_id:int}")
async def update_model_pricing(
    pricing_id: int, body: ModelPricingInput, user: CurrentUser
) -> dict[str, Any]:
    """Update one owner-scoped price row; unknown/foreign id → 404."""
    user_id = int(user["id"])
    await _owned_row(pricing_id, user_id)
    await _ensure_unique(user_id, body.model_name, exclude_id=pricing_id)
    await database.execute(
        "UPDATE model_pricing SET model_name=?, input_per_1m=?, output_per_1m=?, "
        "currency=?, source='manual', updated_at=datetime('now') "
        "WHERE id=? AND user_id=?",
        (body.model_name, body.input_per_1m, body.output_per_1m, body.currency, pricing_id, user_id),
    )
    return await _owned_row(pricing_id, user_id)


@router.delete("/{pricing_id:int}")
async def delete_model_pricing(pricing_id: int, user: CurrentUser) -> dict[str, bool]:
    """Delete one owner-scoped price row; unknown/foreign id → 404."""
    user_id = int(user["id"])
    await _owned_row(pricing_id, user_id)
    await database.execute(
        "DELETE FROM model_pricing WHERE id=? AND user_id=?", (pricing_id, user_id)
    )
    return {"ok": True}
