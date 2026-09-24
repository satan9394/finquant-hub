"""投资组合 API：组合 CRUD + 持仓管理 + 实时盈亏。"""
import asyncio
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field

from ..services import portfolio as svc
from ..services.portfolio_risk import analyze_portfolio_prices, unavailable_portfolio_risk
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


class PaperPortfolioCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=100)
    base_currency: Literal["CNY", "HKD", "USD"]
    initial_cash: float = Field(gt=0)


class PaperLedgerAppend(BaseModel):
    model_config = ConfigDict(extra="forbid")

    idempotency_key: str = Field(min_length=1, max_length=100)
    side: Literal["BUY", "SELL"]
    symbol: str = Field(min_length=1, max_length=20)
    quantity: float = Field(gt=0)
    simulation_price: float = Field(gt=0)
    simulation_as_of: str = Field(min_length=1, max_length=64)
    simulation_source: str = Field(min_length=1, max_length=200)
    fee: float = Field(ge=0)
    currency: Literal["CNY", "HKD", "USD"]
    fx_rate_to_base: float | None = Field(default=None, gt=0)
    fx_source: str | None = Field(default=None, min_length=1, max_length=200)
    fx_as_of: str | None = Field(default=None, min_length=1, max_length=64)


class PaperReviewSave(BaseModel):
    model_config = ConfigDict(extra="forbid")

    hypothesis_memory_id: int = Field(gt=0)
    outcome: Literal["supported", "refuted", "inconclusive"]
    reason: str = Field(min_length=1, max_length=1000)
    observed_from: str = Field(min_length=1, max_length=64)
    observed_to: str = Field(min_length=1, max_length=64)
    idempotency_key: str = Field(min_length=1, max_length=100)


def _paper_error(exc: svc.PaperPortfolioError) -> HTTPException:
    if exc.code in {"NOT_FOUND", "HYPOTHESIS_NOT_FOUND"}:
        status = 404
    elif exc.code in {
        "IDEMPOTENCY_CONFLICT", "ARCHIVED", "NEGATIVE_CASH", "NAKED_SHORT",
        "INCONCLUSIVE_REQUIRED",
    }:
        status = 409
    else:
        status = 422
    return HTTPException(status, f"{exc.code}: {exc}")


# ------------------------------------------------------------------
# 模拟组合（必须位于 /{portfolio_id} 动态路由之前）
# ------------------------------------------------------------------

@router.post("/paper", status_code=201)
async def create_paper_portfolio(body: PaperPortfolioCreate, user: CurrentUser) -> dict[str, Any]:
    try:
        return await svc.create_paper_portfolio(user_id=int(user["id"]), **body.model_dump())
    except svc.PaperPortfolioError as exc:
        raise _paper_error(exc) from exc


@router.get("/paper")
async def list_paper_portfolios(user: CurrentUser) -> dict[str, Any]:
    return {"items": await svc.list_paper_portfolios(int(user["id"]))}


@router.get("/paper/{portfolio_id}")
async def get_paper_portfolio(portfolio_id: int, user: CurrentUser) -> dict[str, Any]:
    result = await svc.paper_portfolio_snapshot(portfolio_id, int(user["id"]))
    if result is None:
        raise HTTPException(404, f"模拟组合不存在：id={portfolio_id}")
    return result


@router.post("/paper/{portfolio_id}/ledger", status_code=201)
async def append_paper_ledger(
    portfolio_id: int, body: PaperLedgerAppend, user: CurrentUser,
) -> dict[str, Any]:
    try:
        return await svc.record_paper_trade(
            user_id=int(user["id"]), portfolio_id=portfolio_id, **body.model_dump(),
        )
    except svc.PaperPortfolioError as exc:
        raise _paper_error(exc) from exc


@router.get("/paper/{portfolio_id}/valuation")
async def value_paper_portfolio(
    portfolio_id: int, request: Request, user: CurrentUser,
) -> dict[str, Any]:
    result = await svc.value_paper_portfolio(
        portfolio_id, int(user["id"]), market_service=request.app.state.market,
    )
    if result is None:
        raise HTTPException(404, f"模拟组合不存在：id={portfolio_id}")
    return result


@router.post("/paper/{portfolio_id}/archive")
async def archive_paper_portfolio(portfolio_id: int, user: CurrentUser) -> dict[str, Any]:
    result = await svc.archive_paper_portfolio(portfolio_id, int(user["id"]))
    if result is None:
        raise HTTPException(404, f"模拟组合不存在：id={portfolio_id}")
    return result


@router.get("/paper/{portfolio_id}/reviews/draft")
async def get_paper_review_draft(
    portfolio_id: int,
    hypothesis_memory_id: int,
    request: Request,
    user: CurrentUser,
) -> dict[str, Any]:
    try:
        return await svc.create_paper_review_draft(
            portfolio_id,
            hypothesis_memory_id,
            int(user["id"]),
            market_service=request.app.state.market,
        )
    except svc.PaperPortfolioError as exc:
        raise _paper_error(exc) from exc


@router.get("/paper/{portfolio_id}/reviews")
async def list_paper_reviews(portfolio_id: int, user: CurrentUser) -> dict[str, Any]:
    result = await svc.list_paper_review_context(portfolio_id, int(user["id"]))
    if result is None:
        raise HTTPException(404, f"模拟组合不存在：id={portfolio_id}")
    return result


@router.post("/paper/{portfolio_id}/reviews", status_code=201)
async def save_paper_review(
    portfolio_id: int,
    body: PaperReviewSave,
    request: Request,
    user: CurrentUser,
) -> dict[str, Any]:
    try:
        return await svc.save_paper_review(
            portfolio_id=portfolio_id,
            user_id=int(user["id"]),
            market_service=request.app.state.market,
            **body.model_dump(),
        )
    except svc.PaperPortfolioError as exc:
        raise _paper_error(exc) from exc


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


@router.get("/{portfolio_id}/risk-tearsheet")
async def portfolio_risk_tearsheet(portfolio_id: int, request: Request, user: CurrentUser) -> dict[str, Any]:
    """Analyze historical market risk for the authenticated user's current holdings."""
    user_id = int(user["id"])
    portfolio = await svc.get_portfolio(portfolio_id, user_id)
    if portfolio is None:
        raise HTTPException(404, f"组合不存在：id={portfolio_id}")

    positions = await svc.list_positions(portfolio_id, user_id)
    currency = str(portfolio.get("currency") or "").strip().upper()
    symbols = [str(position.get("ticker") or "").strip().upper() for position in positions]
    currencies = {str(position.get("currency") or "").strip().upper() for position in positions}

    if positions and (not currency or currencies != {currency}):
        result = unavailable_portfolio_risk(symbols, "unsupported_currency_conversion")
        result["warnings"] = ["currency_conversion_unavailable"]
        return {
            **result,
            "portfolio_id": portfolio_id,
            "currency": currency or None,
            "method": "current_share_quantities_fixed_over_history",
        }

    shares_by_symbol: dict[str, float] = {}
    for position in positions:
        symbol = str(position.get("ticker") or "").strip().upper()
        if symbol:
            shares_by_symbol[symbol] = shares_by_symbol.get(symbol, 0.0) + float(position["shares"])

    market = request.app.state.market
    semaphore = asyncio.Semaphore(8)

    async def fetch_history(symbol: str) -> tuple[str, list[dict[str, Any]]]:
        async with semaphore:
            try:
                rows = await market.kline(symbol, "1d", 800)
            except Exception:
                return symbol, []
        return symbol, rows

    fetched = await asyncio.gather(*(fetch_history(symbol) for symbol in shares_by_symbol))
    price_history = dict(fetched)
    result = analyze_portfolio_prices(price_history, shares_by_symbol)
    return {
        **result,
        "portfolio_id": portfolio_id,
        "currency": currency or None,
        "method": "current_share_quantities_fixed_over_history",
    }
