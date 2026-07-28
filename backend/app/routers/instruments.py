"""Unified instrument research APIs with explicit data provenance."""
from __future__ import annotations

import json

from fastapi import APIRouter, HTTPException, Query, Request
from pydantic import BaseModel, Field

from .. import database
from ..services.instruments import InstrumentService, external_symbol
from ..services.market_data import MarketDataService, MarketError


router = APIRouter(prefix="/api/instruments", tags=["instruments"])


def _service(request: Request) -> InstrumentService:
    market: MarketDataService = request.app.state.market
    return InstrumentService(market)


class WorkspaceSave(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    instrument: dict
    notes: str = Field(default="", max_length=50_000)
    evidence: list[dict] = Field(default_factory=list, max_length=100)
    snapshot: dict | None = None


@router.get("/search")
async def search_instruments(request: Request, q: str = Query(min_length=1, max_length=100)):
    try:
        return await _service(request).search(q)
    except MarketError as exc:
        raise HTTPException(502, str(exc)) from exc


@router.get("/workspaces")
async def list_workspaces():
    items = await database.query_all(
        "SELECT id, symbol, name, notes, instrument_json, evidence_json, created_at, updated_at "
        "FROM research_workspaces ORDER BY updated_at DESC"
    )
    for item in items:
        item["instrument"] = json.loads(item.pop("instrument_json"))
        item["evidence"] = json.loads(item.pop("evidence_json"))
    return {"items": items, "total": len(items)}


@router.get("/{symbol}/snapshot")
async def get_snapshot(symbol: str, request: Request):
    try:
        return await _service(request).snapshot(symbol)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except MarketError as exc:
        raise HTTPException(502, str(exc)) from exc


@router.get("/{symbol}/bars")
async def get_bars(
    symbol: str,
    request: Request,
    period: str = Query(default="1d", pattern="^(1d|60m|30m|15m|5m)$"),
    count: int = Query(default=260, ge=30, le=800),
):
    try:
        return await _service(request).bars(symbol, period, count)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except MarketError as exc:
        raise HTTPException(502, str(exc)) from exc


@router.get("/{symbol}/fundamentals")
async def get_fundamentals(symbol: str, request: Request):
    try:
        return await _service(request).fundamentals(symbol)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except MarketError as exc:
        raise HTTPException(502, str(exc)) from exc


@router.get("/{symbol}/workspace")
async def get_workspace(symbol: str):
    try:
        normalized = external_symbol(symbol)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    row = await database.query_one("SELECT * FROM research_workspaces WHERE symbol=?", (normalized,))
    if not row:
        return {"symbol": normalized, "notes": "", "evidence": [], "saved": False}
    row["instrument"] = json.loads(row.pop("instrument_json"))
    row["evidence"] = json.loads(row.pop("evidence_json"))
    row["snapshot"] = json.loads(row.pop("snapshot_json")) if row.get("snapshot_json") else None
    return {**row, "saved": True}


@router.put("/{symbol}/workspace")
async def save_workspace(symbol: str, body: WorkspaceSave):
    try:
        normalized = external_symbol(symbol)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    await database.execute(
        """
        INSERT INTO research_workspaces
            (symbol, name, instrument_json, notes, evidence_json, snapshot_json)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(symbol) DO UPDATE SET
            name=excluded.name,
            instrument_json=excluded.instrument_json,
            notes=excluded.notes,
            evidence_json=excluded.evidence_json,
            snapshot_json=excluded.snapshot_json,
            updated_at=datetime('now')
        """,
        (
            normalized,
            body.name,
            json.dumps(body.instrument, ensure_ascii=False),
            body.notes,
            json.dumps(body.evidence, ensure_ascii=False),
            json.dumps(body.snapshot, ensure_ascii=False) if body.snapshot is not None else None,
        ),
    )
    row = await database.query_one(
        "SELECT id, symbol, name, created_at, updated_at FROM research_workspaces WHERE symbol=?",
        (normalized,),
    )
    return {**(row or {}), "saved": True}
