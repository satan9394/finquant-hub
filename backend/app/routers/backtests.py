"""Persisted MA-crossover jobs exposed under the v2 /api/backtests contract."""
from __future__ import annotations

import json
from datetime import date

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request, status
from pydantic import BaseModel, Field, model_validator

from .. import database
from ..backtest.ma_crossover import run_ma_crossover
from ..services.instruments import InstrumentService, external_symbol
from ..services.market_data import MarketDataService, MarketError


router = APIRouter(prefix="/api/backtests", tags=["backtests"])

TERMINAL_STATES = {"completed", "failed", "cancelled"}
VALID_STATES = {
    "queued", "loading_data", "running", "calculating_metrics",
    "completed", "failed", "cancelled",
}


class BacktestCreate(BaseModel):
    symbol: str = Field(min_length=1, max_length=30)
    start_date: date
    end_date: date
    short_window: int = Field(default=20, ge=2, le=200)
    long_window: int = Field(default=50, ge=3, le=250)
    initial_capital: float = Field(default=100_000, gt=0, le=1_000_000_000)
    commission_bps: float = Field(default=3, ge=0, le=1000)
    slippage_bps: float = Field(default=2, ge=0, le=1000)
    benchmark: str = Field(default="buy_and_hold", pattern="^buy_and_hold$")

    @model_validator(mode="after")
    def validate_relationships(self):
        if self.long_window <= self.short_window:
            raise ValueError("long_window 必须大于 short_window")
        if self.start_date >= self.end_date:
            raise ValueError("start_date 必须早于 end_date")
        return self


async def _set_status(run_id: int, state: str, *, error: str | None = None) -> None:
    assert state in VALID_STATES
    started = ", started_at=COALESCE(started_at, datetime('now'))" if state == "loading_data" else ""
    completed = ", completed_at=datetime('now')" if state in TERMINAL_STATES else ""
    await database.execute(
        f"UPDATE quant_backtests SET status=?, error_message=?, updated_at=datetime('now'){started}{completed} WHERE id=?",
        (state, error, run_id),
    )


async def _run_job(run_id: int, market: MarketDataService) -> None:
    row = await database.query_one("SELECT * FROM quant_backtests WHERE id=?", (run_id,))
    if not row or row["status"] == "cancelled":
        return
    params = json.loads(row["params_json"])
    try:
        await _set_status(run_id, "loading_data")
        payload = await InstrumentService(market).bars(params["symbol"], "1d", 800)
        bars = [
            bar for bar in payload["items"]
            if params["start_date"] <= str(bar["day"])[:10] <= params["end_date"]
        ]
        current = await database.query_one("SELECT status FROM quant_backtests WHERE id=?", (run_id,))
        if current and current["status"] == "cancelled":
            return

        await _set_status(run_id, "running")
        result = run_ma_crossover(
            bars,
            short_window=params["short_window"],
            long_window=params["long_window"],
            initial_capital=params["initial_capital"],
            commission_bps=params["commission_bps"],
            slippage_bps=params["slippage_bps"],
        )
        await _set_status(run_id, "calculating_metrics")
        result["warnings"] = list(dict.fromkeys(payload["quality_flags"] + result["warnings"]))
        await database.execute(
            """
            UPDATE quant_backtests SET
                status='completed', result_json=?, provider=?, data_as_of=?, timezone=?,
                currency=?, adjustment=?, frequency=?, quality_flags=?,
                completed_at=datetime('now'), updated_at=datetime('now')
            WHERE id=?
            """,
            (
                json.dumps(result, ensure_ascii=False),
                payload["provider"], payload["as_of"], payload["timezone"],
                payload["currency"], payload["adjustment"], payload["frequency"],
                json.dumps(payload["quality_flags"], ensure_ascii=False), run_id,
            ),
        )
    except (MarketError, ValueError) as exc:
        await _set_status(run_id, "failed", error=str(exc))
    except Exception as exc:  # persist the failure instead of losing the job
        await _set_status(run_id, "failed", error=f"回测执行失败：{type(exc).__name__}")


def _serialize(row: dict) -> dict:
    params = json.loads(row.pop("params_json"))
    result = json.loads(row.pop("result_json")) if row.get("result_json") else None
    quality_flags = json.loads(row.get("quality_flags") or "[]")
    payload = {
        **row,
        "params": params,
        "quality_flags": quality_flags,
        "is_saved": bool(row.get("is_saved")),
        "provenance": {
            "provider": row.get("provider"),
            "as_of": row.get("data_as_of"),
            "timezone": row.get("timezone"),
            "currency": row.get("currency"),
            "adjustment": row.get("adjustment"),
            "frequency": row.get("frequency"),
            "quality_flags": quality_flags,
        },
    }
    if result:
        payload.update(result)
    return payload


@router.post("", status_code=status.HTTP_202_ACCEPTED)
async def create_backtest(body: BacktestCreate, request: Request, background_tasks: BackgroundTasks):
    try:
        symbol = external_symbol(body.symbol)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    params = body.model_dump(mode="json")
    params["symbol"] = symbol
    run_id = await database.execute(
        "INSERT INTO quant_backtests (symbol, params_json, status) VALUES (?, ?, 'queued')",
        (symbol, json.dumps(params, ensure_ascii=False)),
    )
    background_tasks.add_task(_run_job, run_id, request.app.state.market)
    return {"id": run_id, "symbol": symbol, "status": "queued", "params": params}


@router.get("")
async def list_backtests(symbol: str | None = None, saved_only: bool = False):
    clauses: list[str] = []
    values: list[object] = []
    if symbol:
        try:
            normalized = external_symbol(symbol)
        except ValueError as exc:
            raise HTTPException(400, str(exc)) from exc
        clauses.append("symbol=?")
        values.append(normalized)
    if saved_only:
        clauses.append("is_saved=1")
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    items = await database.query_all(
        f"SELECT * FROM quant_backtests {where} ORDER BY created_at DESC LIMIT 100",
        tuple(values),
    )
    return {"items": [_serialize(item) for item in items], "total": len(items)}


@router.get("/{run_id:int}")
async def get_backtest(run_id: int):
    row = await database.query_one("SELECT * FROM quant_backtests WHERE id=?", (run_id,))
    if not row:
        raise HTTPException(404, f"回测记录不存在：id={run_id}")
    return _serialize(row)


@router.get("/{run_id:int}/trades")
async def get_backtest_trades(run_id: int):
    row = await database.query_one(
        "SELECT status, result_json FROM quant_backtests WHERE id=?", (run_id,)
    )
    if not row:
        raise HTTPException(404, f"回测记录不存在：id={run_id}")
    result = json.loads(row["result_json"]) if row.get("result_json") else {}
    return {"id": run_id, "status": row["status"], "items": result.get("trades", [])}


@router.post("/{run_id:int}/save")
async def save_backtest(run_id: int):
    row = await database.query_one("SELECT status FROM quant_backtests WHERE id=?", (run_id,))
    if not row:
        raise HTTPException(404, f"回测记录不存在：id={run_id}")
    if row["status"] != "completed":
        raise HTTPException(409, "只有已完成的回测可以保存")
    await database.execute(
        "UPDATE quant_backtests SET is_saved=1, updated_at=datetime('now') WHERE id=?", (run_id,)
    )
    return {"id": run_id, "is_saved": True}


@router.post("/{run_id:int}/cancel")
async def cancel_backtest(run_id: int):
    row = await database.query_one("SELECT status FROM quant_backtests WHERE id=?", (run_id,))
    if not row:
        raise HTTPException(404, f"回测记录不存在：id={run_id}")
    if row["status"] in TERMINAL_STATES:
        raise HTTPException(409, f"当前状态不可取消：{row['status']}")
    await _set_status(run_id, "cancelled")
    return {"id": run_id, "status": "cancelled"}
