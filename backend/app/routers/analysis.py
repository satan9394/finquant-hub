"""个股分析 API。

提供全量分析、指标评分、K线图表数据三类接口。
依赖 analysis/ticker/signals/scoring 模块。
"""
import json
import logging

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse

from ..services import alerts, indicators
from ..services.analysis import scoring as score_mod
from ..services.analysis import signals as sig_mod
from ..services.analysis.ticker import resolve_ticker
from ..services.market_data import MarketDataService, MarketError
from ..services.research_orch import run_research

router = APIRouter(prefix="/api/analysis", tags=["analysis"])
LOGGER = logging.getLogger(__name__)


class StockAnalysisRequest(BaseModel):
    ticker: str = Field(min_length=1, description="股票代码或名称")
    model_id: int | None = Field(default=None, description="LLM 模型 ID")


def _svc(request: Request) -> MarketDataService:
    return request.app.state.market


# ===================================================================
# 全量分析 SSE（多 Agent 并行研究）
# ===================================================================

@router.post("/stock")
async def analyze_stock(body: StockAnalysisRequest, request: Request):
    """多 Agent 并行研究 + SSE 流式推送。

    事件类型：agent_started, tool_call, agent_completed, report_progress, done, error
    """
    try:
        ticker = await resolve_ticker(body.ticker, _svc(request))
    except ValueError as e:
        raise HTTPException(400, str(e)) from e

    # 先获取股票名称
    company_name = body.ticker
    try:
        q = await _svc(request).quote(ticker)
        company_name = q.get("name", body.ticker)
    except MarketError:
        pass

    async def event_stream():
        research_stream = None
        try:
            research_stream = run_research(ticker, company_name, body.model_id)
            async for event, data in research_stream:
                if event == "error":
                    message = data.get("error") or data.get("message") or "研究管线异常"
                    error_data = {"error": message, "message": message}
                    if data.get("role_key"):
                        error_data["role_key"] = data["role_key"]
                    yield {"event": "error", "data": json.dumps(error_data, ensure_ascii=False)}
                    break
                yield {"event": event, "data": json.dumps(data, ensure_ascii=False)}
        except Exception as e:
            LOGGER.exception(
                "Analysis SSE pipeline failed",
                extra={"event": "analysis.stream.error", "ticker": ticker},
            )
            message = f"研究管线异常：{e}"
            yield {
                "event": "error",
                "data": json.dumps({"error": message, "message": message}, ensure_ascii=False),
            }
            return
        finally:
            close = getattr(research_stream, "aclose", None)
            if close is not None:
                await close()

    return EventSourceResponse(event_stream())


# ===================================================================
# 技术指标 + 评分
# ===================================================================

@router.get("/{ticker}/indicators")
async def get_indicators(
    request: Request,
    ticker: str,
    count: int = Query(default=120, ge=30, le=800),
):
    """获取技术指标数据 + 综合评分。"""
    try:
        code = await resolve_ticker(ticker, _svc(request))
    except ValueError as e:
        raise HTTPException(400, str(e)) from e

    try:
        kline = await _svc(request).kline(code, "1d", count)
    except MarketError as e:
        raise HTTPException(502, str(e)) from e

    # 计算指标
    try:
        ind = indicators.compute(kline)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e

    # 提取基础数据
    close = [k["close"] for k in kline]
    high = [k["high"] for k in kline]
    low = [k["low"] for k in kline]
    volume = [k["volume"] for k in kline]

    # 信号检测
    signals = sig_mod.detect_all(ind, close, high, low, volume)
    days = [k["day"] for k in kline]
    alert_triggers = await alerts.evaluate_signals(code, signals, days)

    # 评分
    ma5 = ind.get("ma", {}).get("ma5", [])
    ma20 = ind.get("ma", {}).get("ma20", [])
    volma5 = ind.get("volma", {}).get("volma5", [])
    rsi6 = ind.get("rsi", {}).get("rsi6", [])

    score_result = score_mod.composite_score(close, ma5, ma20, volume, volma5, rsi6)

    return {
        "ticker": code,
        "days": days,
        "indicators": ind,
        "signals": signals,
        "alert_triggers": alert_triggers,
        "scoring": score_result,
    }


# ===================================================================
# 图表数据（lightweight-charts 格式）
# ===================================================================

@router.get("/{ticker}/chart-data")
async def get_chart_data(
    request: Request,
    ticker: str,
    count: int = Query(default=200, ge=30, le=800),
    period: str = Query(default="1d", pattern=r"^(1d|60m|30m|15m|5m)$"),
):
    """获取轻量级图表数据（lightweight-charts 兼容格式）。"""
    try:
        code = await resolve_ticker(ticker, _svc(request))
    except ValueError as e:
        raise HTTPException(400, str(e)) from e

    try:
        kline = await _svc(request).kline(code, period, count)
    except MarketError as e:
        raise HTTPException(502, str(e)) from e

    if not kline:
        raise HTTPException(404, f"无K线数据：{ticker}")

    # lightweight-charts 格式
    chart_data = []
    for k in kline:
        from datetime import datetime
        try:
            time = int(datetime.strptime(k["day"], "%Y-%m-%d").timestamp())
        except (ValueError, TypeError):
            time = k["day"]
        chart_data.append({
            "time": time,
            "open": k["open"],
            "high": k["high"],
            "low": k["low"],
            "close": k["close"],
            "volume": k["volume"],
        })

    return {"ticker": code, "period": period, "data": chart_data}
