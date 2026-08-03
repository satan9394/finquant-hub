"""User-supplied, two-stage multi-market stock screener."""

from typing import Any

from fastapi import APIRouter, Request
from pydantic import BaseModel, Field

from ..services.market_data import MarketDataService
from ..tools.stock_screener import screen as run_screen

router = APIRouter(prefix="/api/screening", tags=["screening"])


class ScreeningRequest(BaseModel):
    tickers: list[str] = Field(min_length=1, max_length=30)


@router.post("")
async def screen(body: ScreeningRequest, request: Request) -> dict[str, Any]:
    service: MarketDataService = request.app.state.market
    result = await run_screen(
        [{"ticker": ticker.strip()} for ticker in body.tickers if ticker.strip()],
        service,
        # The interactive endpoint ranks every valid user-supplied symbol;
        # stricter discovery thresholds remain available to Agent callers.
        momentum_min_return_20d=-100,
        momentum_min_return_60d=-100,
    )
    return {
        **result,
        "items": result["stage2"],
        "errors": [{"ok": False, **error} for error in result["errors"]],
    }
