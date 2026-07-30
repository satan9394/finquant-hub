"""回测 API：执行回测 + 列表 + 详情。

端點：
- POST /api/backtest/runs  {ticker, strategy_type, periods, params} → 回测结果
- GET  /api/backtest/runs                                          → 历史回测列表
- GET  /api/backtest/runs/{id}                                     → 单次回测详情
"""
import json

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from .. import database
from ..backtest.engine import SUPPORTED_STRATEGIES, run_backtest

router = APIRouter(prefix="/api/backtest", tags=["backtest"])


class BacktestRequest(BaseModel):
    ticker: str = Field(min_length=1, description="股票代码")
    strategy_type: str = Field(description=f"策略类型：{'/'.join(SUPPORTED_STRATEGIES)}")
    periods: int = Field(default=252, ge=50, le=1000, description="回测周期数（交易日）")
    params: dict | None = Field(default=None, description="策略参数，如 {\"fast\": 10, \"slow\": 30}")


# ------------------------------------------------------------------
# POST — 执行回测
# ------------------------------------------------------------------

@router.post("/runs", status_code=201)
async def create_backtest(body: BacktestRequest, request: Request):
    """执行向量化回测，返回绩效指标与权益曲线。"""
    from ..services.analysis.ticker import resolve_ticker
    from ..services.market_data import MarketDataService, MarketError

    if body.strategy_type not in SUPPORTED_STRATEGIES:
        raise HTTPException(400, f"不支持的回测策略：{body.strategy_type}，支持：{SUPPORTED_STRATEGIES}")

    try:
        ticker = resolve_ticker(body.ticker)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e

    svc: MarketDataService = request.app.state.market
    try:
        # 获取足够多的 K 线
        count = max(body.periods, 120)
        kline = await svc.kline(ticker, "1d", count)
    except MarketError as e:
        raise HTTPException(502, f"行情数据获取失败：{e}") from e

    if not kline or len(kline) < 50:
        raise HTTPException(400, f"K线数据不足（{len(kline) if kline else 0} 条），至少需要 50 条")

    result = run_backtest(kline, body.strategy_type, body.params or {}, body.periods)

    if "error" in result:
        raise HTTPException(400, result["error"])

    # 保存回测结果到数据库
    run_id = await _save_run(body.ticker, body.strategy_type, body.periods,
                             body.params or {}, result)

    return {"id": run_id, **result}


async def _save_run(ticker: str, strategy_type: str, periods: int,
                    params: dict, result: dict) -> int:
    """持久化回测结果，返回新记录 ID。"""
    new_id = await database.execute(
        "INSERT INTO backtest_runs (ticker, strategy_type, periods, params, result) VALUES (?, ?, ?, ?, ?)",
        (ticker, strategy_type, periods,
         json.dumps(params, ensure_ascii=False),
         json.dumps(result, ensure_ascii=False)),
    )
    return new_id


# ------------------------------------------------------------------
# GET — 列表
# ------------------------------------------------------------------

@router.get("/runs")
async def list_backtest_runs(page: int = 1, page_size: int = 20):
    """列出历史回测运行记录。"""
    offset = (page - 1) * page_size
    items = await database.query_all(
        "SELECT id, ticker, strategy_type, periods, status, created_at "
        "FROM backtest_runs ORDER BY created_at DESC LIMIT ? OFFSET ?",
        (page_size, offset),
    )
    total = await database.query_one("SELECT COUNT(*) AS n FROM backtest_runs")
    return {"items": items, "total": (total or {}).get("n", 0), "page": page, "page_size": page_size}


# ------------------------------------------------------------------
# GET /{id} — 详情
# ------------------------------------------------------------------

@router.get("/runs/{run_id:int}")
async def get_backtest_run(run_id: int):
    """获取单次回测的完整结果。"""
    row = await database.query_one("SELECT * FROM backtest_runs WHERE id=?", (run_id,))
    if not row:
        raise HTTPException(404, f"回测记录不存在：id={run_id}")

    run = dict(row)
    if isinstance(run.get("params"), str):
        run["params"] = json.loads(run["params"])
    if isinstance(run.get("result"), str):
        run["result"] = json.loads(run["result"])

    return run
