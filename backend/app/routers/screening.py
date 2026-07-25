"""User-supplied multi-market stock screener.

The old menu pointed to the knowledge page and the tool returned only a
placeholder.  This endpoint screens real symbols supplied by the user, which
is reliable without pretending to own an entire exchange-wide universe.
"""
import asyncio

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from ..services.market_data import MarketDataService, MarketError

router = APIRouter(prefix="/api/screening", tags=["screening"])


class ScreeningRequest(BaseModel):
    tickers: list[str] = Field(min_length=1, max_length=30)


@router.post("")
async def screen(body: ScreeningRequest, request: Request):
    service: MarketDataService = request.app.state.market

    async def evaluate(raw_ticker: str) -> dict:
        try:
            quote, bars = await asyncio.gather(
                service.quote(raw_ticker), service.kline(raw_ticker, count=60),
            )
            first = bars[0]["close"]
            latest = bars[-1]["close"]
            return_60d = round((latest - first) / first * 100, 2) if first else 0.0
            return {
                "ok": True,
                "ticker": quote["code"],
                "name": quote["name"],
                "price": quote["price"],
                "change_percent": quote["change_percent"],
                "return_60d_pct": return_60d,
                "signal": "动量偏强" if return_60d > 5 else "动量偏弱" if return_60d < -5 else "区间震荡",
            }
        except (MarketError, ValueError) as exc:
            return {"ok": False, "ticker": raw_ticker, "error": str(exc)}

    items = await asyncio.gather(*(evaluate(ticker.strip()) for ticker in body.tickers if ticker.strip()))
    valid = sorted((item for item in items if item["ok"]), key=lambda item: item["return_60d_pct"], reverse=True)
    invalid = [item for item in items if not item["ok"]]
    return {"items": valid, "errors": invalid}
