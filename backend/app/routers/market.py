"""行情数据代理：搜索 / 实时报价 / K 线 / 技术指标。"""
from fastapi import APIRouter, HTTPException, Query, Request

from ..services import indicators
from ..services.market_data import MarketDataService, MarketError

router = APIRouter(prefix="/api/market", tags=["market"])


def _svc(request: Request) -> MarketDataService:
    return request.app.state.market


@router.get("/search")
async def search(request: Request, q: str = Query(min_length=1)):
    try:
        return {"items": await _svc(request).search(q)}
    except MarketError as e:
        raise HTTPException(502, str(e)) from e


@router.get("/quote")
async def quote(request: Request, ticker: str = Query(min_length=1)):
    try:
        return await _svc(request).quote(ticker)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    except MarketError as e:
        raise HTTPException(502, str(e)) from e


@router.get("/kline")
async def kline(request: Request, ticker: str = Query(min_length=1),
                period: str = "1d", count: int = Query(default=100, ge=1, le=800)):
    try:
        return {"items": await _svc(request).kline(ticker, period, count)}
    except ValueError as e:
        raise HTTPException(400, str(e)) from e
    except MarketError as e:
        raise HTTPException(502, str(e)) from e


@router.get("/indicators")
async def get_indicators(request: Request, ticker: str = Query(min_length=1),
                         indicators_param: str | None = Query(default=None, alias="indicators"),
                         count: int = Query(default=120, ge=30, le=800)):
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
