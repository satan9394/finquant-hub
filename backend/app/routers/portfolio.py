"""投资组合 API：组合 CRUD + 持仓管理 + 实时盈亏。"""
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from ..services import portfolio as svc
from .auth import CurrentUser, authenticated_context

router = APIRouter(prefix="/api/portfolio", tags=["portfolio"], dependencies=[Depends(authenticated_context)])


# ------------------------------------------------------------------
# Pydantic 模型
# ------------------------------------------------------------------

class PortfolioCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    description: str = ""
    currency: str = "CNY"


class PortfolioUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    currency: str | None = None


class PositionAdd(BaseModel):
    ticker: str = Field(min_length=1, max_length=20)
    shares: float = Field(gt=0)
    avg_cost: float = Field(gt=0)
    name: str = ""
    currency: str = ""


class PositionUpdate(BaseModel):
    shares: float | None = Field(default=None, gt=0)
    avg_cost: float | None = Field(default=None, gt=0)


# ------------------------------------------------------------------
# 组合
# ------------------------------------------------------------------

@router.post("", status_code=201)
async def create_portfolio(body: PortfolioCreate, user: CurrentUser) -> dict[str, Any]:
    return await svc.create_portfolio(body.name, body.description, body.currency, user_id=int(user["id"]))


@router.get("")
async def list_portfolios(user: CurrentUser) -> dict[str, Any]:
    return {"items": await svc.list_portfolios(int(user["id"]))}


@router.get("/{portfolio_id}")
async def get_portfolio(portfolio_id: int, user: CurrentUser) -> dict[str, Any]:
    p = await svc.get_portfolio(portfolio_id, int(user["id"]))
    if not p:
        raise HTTPException(404, f"组合不存在：id={portfolio_id}")
    return p


@router.put("/{portfolio_id}")
async def update_portfolio(portfolio_id: int, body: PortfolioUpdate, user: CurrentUser) -> dict[str, Any]:
    p = await svc.update_portfolio(portfolio_id, int(user["id"]), body.name, body.description, body.currency)
    if not p:
        raise HTTPException(404, f"组合不存在：id={portfolio_id}")
    return p


@router.delete("/{portfolio_id}")
async def delete_portfolio(portfolio_id: int, user: CurrentUser) -> dict[str, bool]:
    ok = await svc.delete_portfolio(portfolio_id, int(user["id"]))
    if not ok:
        raise HTTPException(404, f"组合不存在：id={portfolio_id}")
    return {"ok": True}


# ------------------------------------------------------------------
# 持仓
# ------------------------------------------------------------------

@router.post("/{portfolio_id}/positions", status_code=201)
async def add_position(portfolio_id: int, body: PositionAdd, user: CurrentUser) -> dict[str, Any]:
    user_id = int(user["id"])
    p = await svc.get_portfolio(portfolio_id, user_id)
    if not p:
        raise HTTPException(404, f"组合不存在：id={portfolio_id}")
    return await svc.add_position(portfolio_id, body.ticker, body.shares, body.avg_cost, body.name, body.currency, user_id=user_id)


@router.get("/{portfolio_id}/positions")
async def list_positions(portfolio_id: int, user: CurrentUser) -> dict[str, Any]:
    user_id = int(user["id"])
    p = await svc.get_portfolio(portfolio_id, user_id)
    if not p:
        raise HTTPException(404, f"组合不存在：id={portfolio_id}")
    return {"items": await svc.list_positions(portfolio_id, user_id)}


@router.put("/positions/{position_id}")
async def update_position(position_id: int, body: PositionUpdate, user: CurrentUser) -> dict[str, Any]:
    pos = await svc.update_position(position_id, int(user["id"]), body.shares, body.avg_cost)
    if not pos:
        raise HTTPException(404, f"持仓不存在：id={position_id}")
    return pos


@router.delete("/positions/{position_id}")
async def delete_position(position_id: int, user: CurrentUser) -> dict[str, bool]:
    ok = await svc.delete_position(position_id, int(user["id"]))
    if not ok:
        raise HTTPException(404, f"持仓不存在：id={position_id}")
    return {"ok": True}


# ------------------------------------------------------------------
# 盈亏
# ------------------------------------------------------------------

@router.get("/{portfolio_id}/pnl")
async def calc_pnl(portfolio_id: int, user: CurrentUser) -> dict[str, Any]:
    user_id = int(user["id"])
    p = await svc.get_portfolio(portfolio_id, user_id)
    if not p:
        raise HTTPException(404, f"组合不存在：id={portfolio_id}")
    return await svc.calc_pnl(portfolio_id, user_id)
