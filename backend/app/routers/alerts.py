"""技术信号预警规则与触发历史 API。"""

from typing import Literal

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field

from ..services import alerts as svc
from ..services.analysis.ticker import resolve_ticker

router = APIRouter(prefix="/api/alerts", tags=["alerts"])


class AlertRuleCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    ticker: str = Field(min_length=1, max_length=20)
    signal_type: str = Field(min_length=1, max_length=50)
    direction: Literal["bullish", "bearish", "neutral"] | None = None
    is_enabled: bool = True


class AlertRuleUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    ticker: str | None = Field(default=None, min_length=1, max_length=20)
    signal_type: str | None = Field(default=None, min_length=1, max_length=50)
    direction: Literal["bullish", "bearish", "neutral"] | None = None
    is_enabled: bool | None = None


async def _ticker(raw: str, request: Request) -> str:
    try:
        return await resolve_ticker(raw, request.app.state.market)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.get("/signal-types")
async def list_signal_types():
    return {"items": sorted(svc.SIGNAL_TYPES)}


@router.post("/rules", status_code=201)
async def create_rule(body: AlertRuleCreate, request: Request):
    try:
        return await svc.create_rule(
            body.name,
            await _ticker(body.ticker, request),
            body.signal_type,
            body.direction,
            is_enabled=body.is_enabled,
        )
    except svc.DuplicateRuleError as exc:
        raise HTTPException(409, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc


@router.get("/rules")
async def list_rules(enabled_only: bool = False):
    return {"items": await svc.list_rules(enabled_only=enabled_only)}


@router.put("/rules/{rule_id:int}")
async def update_rule(rule_id: int, body: AlertRuleUpdate, request: Request):
    changes = body.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(400, "至少提供一个待更新字段")
    for required in ("name", "ticker", "signal_type", "is_enabled"):
        if required in changes and changes[required] is None:
            raise HTTPException(400, f"{required} 不能为 null")
    if changes.get("ticker") is not None:
        changes["ticker"] = await _ticker(changes["ticker"], request)
    try:
        rule = await svc.update_rule(rule_id, changes)
    except svc.DuplicateRuleError as exc:
        raise HTTPException(409, str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    if rule is None:
        raise HTTPException(404, f"预警规则不存在：id={rule_id}")
    return rule


@router.delete("/rules/{rule_id:int}")
async def delete_rule(rule_id: int):
    if not await svc.delete_rule(rule_id):
        raise HTTPException(404, f"预警规则不存在：id={rule_id}")
    return {"ok": True}


@router.get("/triggers")
async def list_triggers(
    request: Request,
    rule_id: int | None = Query(default=None, ge=1),
    ticker: str | None = Query(default=None, min_length=1, max_length=20),
    limit: int = Query(default=50, ge=1, le=100),
):
    normalized = await _ticker(ticker, request) if ticker is not None else None
    return {
        "items": await svc.list_triggers(rule_id=rule_id, ticker=normalized, limit=limit),
    }
