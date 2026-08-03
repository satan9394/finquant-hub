"""Investment thesis CRUD and drift-check endpoints."""
from __future__ import annotations

from typing import Any, Literal, cast

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field

from ..services.market_data import MarketDataService
from ..services.thesis import (
    ThesisConflictError,
    ThesisNotFoundError,
    check_thesis,
    create_from_report,
    create_thesis,
    get_thesis,
    list_theses,
    update_claim,
    update_thesis,
)
from .auth import CurrentUser, authenticated_context


router = APIRouter(prefix="/api/thesis", tags=["thesis"], dependencies=[Depends(authenticated_context)])


class ThesisCreate(BaseModel):
    ticker: str = Field(min_length=1, max_length=30)
    title: str = Field(min_length=1, max_length=200)
    thesis: str = Field(min_length=1, max_length=50_000)
    assumptions: list[str] = Field(default_factory=list, max_length=100)
    claims: list[str] = Field(default_factory=list, max_length=100)


class ThesisUpdate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    thesis: str = Field(min_length=1, max_length=50_000)
    assumptions: list[str] = Field(default_factory=list, max_length=100)
    status: Literal["open", "closed", "invalidated"] = "open"
    claims: list[str] | None = Field(default=None, max_length=100)


class ClaimUpdate(BaseModel):
    status: Literal["holding", "confirmed", "violated", "unknown"]
    note: str = Field(default="", max_length=10_000)


def _market(request: Request) -> MarketDataService:
    return cast(MarketDataService, request.app.state.market)


@router.get("")
async def get_theses(
    user: CurrentUser,
    thesis_status: Literal["open", "closed", "invalidated"] | None = Query(default=None, alias="status"),
) -> dict[str, Any]:
    return await list_theses(int(user["id"]), thesis_status)


@router.post("", status_code=status.HTTP_201_CREATED)
async def add_thesis(body: ThesisCreate, request: Request, user: CurrentUser) -> dict[str, Any]:
    try:
        return await create_thesis(
            ticker=body.ticker,
            title=body.title,
            thesis=body.thesis,
            assumptions=body.assumptions,
            claims=body.claims,
            market=_market(request),
            user_id=int(user["id"]),
        )
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@router.post("/from-report/{report_id}", status_code=status.HTTP_201_CREATED)
async def add_from_report(report_id: int, request: Request, user: CurrentUser) -> dict[str, Any]:
    try:
        return await create_from_report(report_id, _market(request), int(user["id"]))
    except ThesisNotFoundError as exc:
        raise HTTPException(404, str(exc)) from exc
    except ThesisConflictError as exc:
        raise HTTPException(409, str(exc)) from exc


@router.get("/{thesis_id}")
async def get_thesis_detail(thesis_id: int, user: CurrentUser) -> dict[str, Any]:
    try:
        return await get_thesis(thesis_id, int(user["id"]))
    except ThesisNotFoundError as exc:
        raise HTTPException(404, str(exc)) from exc


@router.put("/{thesis_id}")
async def edit_thesis(thesis_id: int, body: ThesisUpdate, user: CurrentUser) -> dict[str, Any]:
    try:
        return await update_thesis(
            thesis_id,
            int(user["id"]),
            title=body.title,
            thesis=body.thesis,
            assumptions=body.assumptions,
            status=body.status,
            claims=body.claims,
        )
    except ThesisNotFoundError as exc:
        raise HTTPException(404, str(exc)) from exc


@router.put("/{thesis_id}/claims/{claim_id}")
async def edit_claim(thesis_id: int, claim_id: int, body: ClaimUpdate, user: CurrentUser) -> dict[str, Any]:
    try:
        return await update_claim(thesis_id, claim_id, body.status, body.note, int(user["id"]))
    except ThesisNotFoundError as exc:
        raise HTTPException(404, str(exc)) from exc


@router.post("/{thesis_id}/check")
async def run_drift_check(thesis_id: int, request: Request, user: CurrentUser) -> dict[str, Any]:
    try:
        return await check_thesis(thesis_id, _market(request), int(user["id"]))
    except ThesisNotFoundError as exc:
        raise HTTPException(404, str(exc)) from exc
