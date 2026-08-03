"""Unified instrument research APIs with explicit data provenance."""
from __future__ import annotations

import json
from typing import Any, cast

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field

from .. import database
from ..services.chip_distribution import ChipDistributionUnavailable, fetch_chip_distribution
from ..services.instruments import InstrumentService, external_symbol
from ..services.market_data import MarketDataService, MarketError
from .auth import CurrentUser, authenticated_context


router = APIRouter(prefix="/api/instruments", tags=["instruments"], dependencies=[Depends(authenticated_context)])


def _service(request: Request) -> InstrumentService:
    market = cast(MarketDataService, request.app.state.market)
    return InstrumentService(market)


class WorkspaceSave(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    instrument: dict[str, Any]
    notes: str = Field(default="", max_length=50_000)
    evidence: list[dict[str, Any]] = Field(default_factory=list, max_length=100)
    snapshot: dict[str, Any] | None = None


@router.get("/search")
async def search_instruments(
    request: Request,
    _user: CurrentUser,
    q: str = Query(min_length=1, max_length=100),
) -> dict[str, Any]:
    try:
        return await _service(request).search(q)
    except MarketError as exc:
        raise HTTPException(502, str(exc)) from exc


@router.get("/workspaces")
async def list_workspaces(user: CurrentUser) -> dict[str, Any]:
    items = await database.query_all(
        "SELECT id, symbol, name, notes, instrument_json, evidence_json, created_at, updated_at "
        "FROM research_workspaces WHERE user_id=? ORDER BY updated_at DESC", (user["id"],)
    )
    for item in items:
        item["instrument"] = json.loads(item.pop("instrument_json"))
        item["evidence"] = json.loads(item.pop("evidence_json"))
    return {"items": items, "total": len(items)}


@router.get("/{symbol}/snapshot")
async def get_snapshot(symbol: str, request: Request, _user: CurrentUser) -> dict[str, Any]:
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
    _user: CurrentUser,
    period: str = Query(default="1d", pattern="^(1d|60m|30m|15m|5m)$"),
    count: int = Query(default=260, ge=30, le=800),
) -> dict[str, Any]:
    try:
        return await _service(request).bars(symbol, period, count)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except MarketError as exc:
        raise HTTPException(502, str(exc)) from exc


@router.get("/{symbol}/fundamentals")
async def get_fundamentals(symbol: str, request: Request, _user: CurrentUser) -> dict[str, Any]:
    try:
        return await _service(request).fundamentals(symbol)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except MarketError as exc:
        raise HTTPException(502, str(exc)) from exc


@router.get("/{symbol}/chip-distribution")
async def get_chip_distribution(
    symbol: str,
    _user: CurrentUser,
    adjustment: str = Query(default="qfq", pattern="^(|qfq|hfq)$"),
) -> dict[str, Any]:
    try:
        return await fetch_chip_distribution(symbol, adjustment)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except ChipDistributionUnavailable as exc:
        raise HTTPException(502, str(exc)) from exc


@router.get("/{symbol}/workspace")
async def get_workspace(symbol: str, user: CurrentUser) -> dict[str, Any]:
    try:
        normalized = external_symbol(symbol)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    row = await database.query_one(
        "SELECT * FROM research_workspaces WHERE symbol=? AND user_id=?", (normalized, user["id"])
    )
    if not row:
        return {"symbol": normalized, "notes": "", "evidence": [], "saved": False}
    row["instrument"] = json.loads(row.pop("instrument_json"))
    row["evidence"] = json.loads(row.pop("evidence_json"))
    row["snapshot"] = json.loads(row.pop("snapshot_json")) if row.get("snapshot_json") else None
    return {**row, "saved": True}


@router.put("/{symbol}/workspace")
async def save_workspace(symbol: str, body: WorkspaceSave, user: CurrentUser) -> dict[str, Any]:
    try:
        normalized = external_symbol(symbol)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    values = (
        body.name,
        json.dumps(body.instrument, ensure_ascii=False),
        body.notes,
        json.dumps(body.evidence, ensure_ascii=False),
        json.dumps(body.snapshot, ensure_ascii=False) if body.snapshot is not None else None,
    )
    existing = await database.query_one(
        "SELECT id FROM research_workspaces WHERE symbol=? AND user_id=?", (normalized, user["id"])
    )
    if existing:
        await database.execute(
            "UPDATE research_workspaces SET name=?, instrument_json=?, notes=?, evidence_json=?, "
            "snapshot_json=?, updated_at=datetime('now') WHERE id=? AND user_id=?",
            (*values, existing["id"], user["id"]),
        )
    else:
        await database.execute(
            "INSERT INTO research_workspaces "
            "(symbol, name, instrument_json, notes, evidence_json, snapshot_json, user_id) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (normalized, *values, user["id"]),
        )
    row = await database.query_one(
        "SELECT id, symbol, name, created_at, updated_at FROM research_workspaces WHERE symbol=? AND user_id=?",
        (normalized, user["id"]),
    )
    return {**(row or {}), "saved": True}
