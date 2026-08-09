"""行情数据代理：搜索 / 实时报价 / K 线 / 技术指标 / 交易日历。"""
from datetime import date

from typing import Any, Literal, cast

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field

from ..services import indicators
from ..services.llm_client import LLMError
from ..services.market_data import MarketDataService, MarketError
from ..services.market_overview import MarketOverviewService
from ..services.market_review import create_market_review, get_market_review, list_market_reviews
from ..services.source_settings import save_source_priority
from ..services.trading_calendar import query_trading_day
from ..services.auth import current_user_id
from .auth import authenticated_context

router = APIRouter(prefix="/api/market", tags=["market"], dependencies=[Depends(authenticated_context)])


def _svc(request: Request) -> MarketDataService:
    return cast(MarketDataService, request.app.state.market)


def _overview(request: Request) -> MarketOverviewService:
    return MarketOverviewService(_svc(request))


class SourcePriorityUpdate(BaseModel):
    quote: list[str] | None = None
    kline: list[str] | None = None
    fundamentals: list[str] | None = None


class PrefetchRequest(BaseModel):
    tickers: list[str] = Field(min_length=1, max_length=100)
    enriched: bool = True
    concurrency: int = Field(default=8, ge=1, le=32)


def _default_review_markets() -> list[Literal["cn", "hk", "us"]]:
    return ["cn", "hk", "us"]


class MarketReviewRequest(BaseModel):
    markets: list[Literal["cn", "hk", "us"]] = Field(
        default_factory=_default_review_markets, min_length=1,
    )
    trading_date: date | None = None
    model_id: int | None = None


@router.get("/calendar")
async def trading_calendar(trading_date: date = Query(alias="date")) -> dict[str, Any]:
    """Query the official, evidence-bounded A-share calendar snapshot."""
    return query_trading_day(trading_date)


@router.get("/overview")
async def market_overview(
    request: Request, market: Literal["cn", "hk", "us"] = "cn",
) -> dict[str, Any]:
    try:
        return await _overview(request).overview(market)
    except MarketError as e:
        raise HTTPException(502, str(e)) from e


@router.get("/sectors")
async def sector_ranking(
    request: Request,
    kind: Literal["industry", "concept"] = "industry",
    limit: int = Query(default=20, ge=1, le=100),
) -> dict[str, Any]:
    try:
        return await _overview(request).sectors(kind, limit)
    except MarketError as e:
        raise HTTPException(502, str(e)) from e


@router.get("/popular")
async def popular_stocks(request: Request, limit: int = Query(default=20, ge=1, le=100)) -> dict[str, Any]:
    try:
        return await _overview(request).popular(limit)
    except MarketError as e:
        raise HTTPException(502, str(e)) from e


@router.get("/movers")
async def daily_movers(request: Request, limit: int = Query(default=12, ge=1, le=30)) -> dict[str, Any]:
    try:
        return await _overview(request).movers(limit)
    except MarketError as e:
        raise HTTPException(502, str(e)) from e


@router.get("/pulse")
async def market_pulse(
    request: Request,
    limit: int = Query(default=20, ge=5, le=50),
    threshold_percent: float = Query(default=8, ge=1, le=30),
    ths_limit: int = Query(default=20, ge=0, le=50),
) -> dict[str, Any]:
    """Batch public market dimensions with per-source coverage metadata."""
    return await _overview(request).pulse(limit, threshold_percent, ths_limit)


@router.get("/themes")
async def market_themes(
    request: Request,
    keyword: str = Query(min_length=1, max_length=30),
    limit: int = Query(default=8, ge=1, le=20),
    stocks_per_theme: int = Query(default=10, ge=3, le=30),
    ths_limit: int = Query(default=10, ge=0, le=30),
    sort_by: Literal["change", "weekly", "capital", "turnover"] = "change",
) -> dict[str, Any]:
    """Classify a keyword through full board catalogs and constituent rankings."""
    try:
        return await _overview(request).themes(
            keyword, limit, stocks_per_theme, ths_limit, sort_by,
        )
    except ValueError as e:
        raise HTTPException(400, str(e)) from e


@router.get("/limit-up")
async def limit_up_pool(request: Request, trading_date: date = Query(alias="date")) -> dict[str, Any]:
    try:
        return await _overview(request).limit_up(trading_date)
    except MarketError as e:
        raise HTTPException(502, str(e)) from e


@router.get("/sources")
async def source_status(request: Request) -> dict[str, Any]:
    return _svc(request).source_status()


@router.patch("/sources")
async def update_source_priority(request: Request, body: SourcePriorityUpdate) -> dict[str, Any]:
    if body.quote is None and body.kline is None and body.fundamentals is None:
        raise HTTPException(422, "至少提供 quote、kline 或 fundamentals")
    try:
        if body.quote is not None:
            await save_source_priority(_svc(request), "quote", body.quote)
        if body.kline is not None:
            await save_source_priority(_svc(request), "kline", body.kline)
        if body.fundamentals is not None:
            await save_source_priority(_svc(request), "fundamentals", body.fundamentals)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    return _svc(request).source_status()


@router.post("/prefetch")
async def prefetch_quotes(request: Request, body: PrefetchRequest) -> dict[str, Any]:
    return await _svc(request).prefetch_quotes(
        body.tickers,
        enriched=body.enriched,
        concurrency=body.concurrency,
    )


@router.post("/reviews")
async def generate_market_review(request: Request, body: MarketReviewRequest) -> dict[str, Any]:
    try:
        return await create_market_review(
            _svc(request),
            cast(list[str], body.markets),
            body.trading_date or date.today(),
            body.model_id,
            user_id=current_user_id(),
        )
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    except (MarketError, LLMError) as e:
        raise HTTPException(502, str(e)) from e


@router.get("/reviews")
async def market_review_history(limit: int = Query(default=50, ge=1, le=100)) -> dict[str, Any]:
    return {"items": await list_market_reviews(current_user_id(), limit)}


@router.get("/reviews/{review_id}")
async def market_review_detail(review_id: int) -> dict[str, Any]:
    item = await get_market_review(review_id, current_user_id())
    if item is None:
        raise HTTPException(404, "大盘复盘不存在")
    return item


@router.get("/search")
async def search(request: Request, q: str = Query(min_length=1)) -> dict[str, Any]:
    try:
        return {"items": await _svc(request).search(q)}
    except MarketError as e:
        raise HTTPException(502, str(e)) from e


@router.get("/quote")
async def quote(request: Request, ticker: str = Query(min_length=1)) -> dict[str, Any]:
    try:
        return await _svc(request).quote(ticker)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    except MarketError as e:
        raise HTTPException(502, str(e)) from e


@router.get("/kline")
async def kline(request: Request, ticker: str = Query(min_length=1),
                period: str = "1d", count: int = Query(default=100, ge=1, le=800)) -> dict[str, Any]:
    try:
        return {"items": await _svc(request).kline(ticker, period, count)}
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    except MarketError as e:
        raise HTTPException(502, str(e)) from e


@router.get("/indicators")
async def get_indicators(request: Request, ticker: str = Query(min_length=1),
                         indicators_param: str | None = Query(default=None, alias="indicators"),
                         count: int = Query(default=120, ge=30, le=800)) -> dict[str, Any]:
    svc = _svc(request)
    try:
        kline_data = await svc.kline(ticker, "1d", count)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    except MarketError as e:
        raise HTTPException(502, str(e)) from e
    names = [s.strip() for s in indicators_param.split(",")] if indicators_param else None
    try:
        result = indicators.compute(kline_data, names)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    return {
        "ticker": ticker,
        "days": [k["day"] for k in kline_data],
        "indicators": result,
    }
