"""Investment thesis CRUD and drift-check endpoints."""
from __future__ import annotations

from typing import Any, Literal, cast

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel, Field

from ..services.market_data import MarketDataService
from ..services.share_preview import SharePreviewNotFoundError, build_thesis_share_preview
from ..services.thesis import (
    ThesisConflictError,
    ThesisNotFoundError,
    check_thesis,
    confirm_thesis_version,
    create_from_report,
    create_thesis,
    create_validation_experiment_intent,
    decide_thesis_review,
    get_thesis,
    list_thesis_reviews,
    list_thesis_versions,
    list_theses,
    update_claim,
    update_thesis,
)
from ..services.thesis_challenge import challenge_thesis
from .auth import CurrentUser, authenticated_context


router = APIRouter(prefix="/api/thesis", tags=["thesis"], dependencies=[Depends(authenticated_context)])


class ThesisCreate(BaseModel):
    ticker: str = Field(min_length=1, max_length=30)
    title: str = Field(min_length=1, max_length=200)
    thesis: str = Field(min_length=1, max_length=50_000)
    assumptions: list[str] = Field(default_factory=list, max_length=100)
    claims: list[str] = Field(default_factory=list, max_length=100)
    supporting_evidence_ids: list[str] = Field(default_factory=list, max_length=100)
    opposing_evidence_ids: list[str] = Field(default_factory=list, max_length=100)
    invalidation_conditions: list[str] = Field(default_factory=list, max_length=100)
    confidence: float | None = Field(default=None, ge=0, le=1)
    change_reason: str = Field(default="initial_create", min_length=1, max_length=2_000)


class ThesisUpdate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    thesis: str = Field(min_length=1, max_length=50_000)
    assumptions: list[str] = Field(default_factory=list, max_length=100)
    status: Literal["open", "closed", "invalidated"] = "open"
    claims: list[str] | None = Field(default=None, max_length=100)
    supporting_evidence_ids: list[str] | None = Field(default=None, max_length=100)
    opposing_evidence_ids: list[str] | None = Field(default=None, max_length=100)
    invalidation_conditions: list[str] | None = Field(default=None, max_length=100)
    confidence: float | None = Field(default=None, ge=0, le=1)
    change_reason: str = Field(default="user_edit", min_length=1, max_length=2_000)


class ClaimEvidenceInput(BaseModel):
    evidence_id: str = Field(min_length=1, max_length=123)
    stance: Literal["supporting", "opposing"]
    valid_from: str | None = Field(default=None, max_length=64)
    valid_to: str | None = Field(default=None, max_length=64)
    observed_at: str | None = Field(default=None, max_length=64)


class ClaimUpdate(BaseModel):
    status: Literal["holding", "confirmed", "violated", "unknown"]
    note: str = Field(default="", max_length=10_000)
    evidence_edges: list[ClaimEvidenceInput] | None = Field(default=None, max_length=100)


class ThesisVersionConfirmation(BaseModel):
    decision: Literal["acknowledged", "disputed"]
    reason: str = Field(min_length=1, max_length=2_000)


class ThesisReviewDecision(BaseModel):
    decision: Literal["acknowledged", "disputed"]
    reason: str = Field(min_length=1, max_length=2_000)


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
            supporting_evidence_ids=body.supporting_evidence_ids,
            opposing_evidence_ids=body.opposing_evidence_ids,
            invalidation_conditions=body.invalidation_conditions,
            confidence=body.confidence,
            change_reason=body.change_reason,
        )
    except ThesisConflictError as exc:
        raise HTTPException(409, str(exc)) from exc
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


@router.get("/{thesis_id}/validation-experiment")
async def get_validation_experiment(thesis_id: int, user: CurrentUser) -> dict[str, Any]:
    try:
        return await create_validation_experiment_intent(thesis_id, int(user["id"]))
    except ThesisNotFoundError as exc:
        raise HTTPException(404, str(exc)) from exc


@router.get("/{thesis_id}/share-preview")
async def get_thesis_share_preview(thesis_id: int, user: CurrentUser) -> dict[str, Any]:
    try:
        return await build_thesis_share_preview(thesis_id, int(user["id"]))
    except SharePreviewNotFoundError as exc:
        raise HTTPException(404, str(exc)) from exc


@router.get("/{thesis_id}/versions")
async def get_thesis_history(thesis_id: int, user: CurrentUser) -> dict[str, Any]:
    user_id = int(user["id"])
    try:
        await get_thesis(thesis_id, user_id)
    except ThesisNotFoundError as exc:
        raise HTTPException(404, str(exc)) from exc
    items = await list_thesis_versions(thesis_id, user_id)
    return {"items": items, "total": len(items)}


@router.post("/{thesis_id}/versions/{version}/confirm", status_code=status.HTTP_201_CREATED)
async def confirm_version(
    thesis_id: int,
    version: int,
    body: ThesisVersionConfirmation,
    user: CurrentUser,
) -> dict[str, Any]:
    try:
        return await confirm_thesis_version(
            thesis_id,
            version,
            int(user["id"]),
            decision=body.decision,
            reason=body.reason,
        )
    except ThesisNotFoundError as exc:
        raise HTTPException(404, str(exc)) from exc
    except ThesisConflictError as exc:
        raise HTTPException(409, str(exc)) from exc


@router.get("/{thesis_id}/reviews")
async def get_thesis_reviews(thesis_id: int, user: CurrentUser) -> dict[str, Any]:
    user_id = int(user["id"])
    try:
        await get_thesis(thesis_id, user_id)
    except ThesisNotFoundError as exc:
        raise HTTPException(404, str(exc)) from exc
    items = await list_thesis_reviews(thesis_id, user_id)
    return {"items": items, "total": len(items)}


@router.post("/{thesis_id}/reviews/{review_id}/decide")
async def decide_review(
    thesis_id: int,
    review_id: int,
    body: ThesisReviewDecision,
    user: CurrentUser,
) -> dict[str, Any]:
    try:
        return await decide_thesis_review(
            thesis_id,
            review_id,
            int(user["id"]),
            decision=body.decision,
            reason=body.reason,
        )
    except ThesisNotFoundError as exc:
        raise HTTPException(404, str(exc)) from exc
    except ThesisConflictError as exc:
        raise HTTPException(409, str(exc)) from exc


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
            supporting_evidence_ids=body.supporting_evidence_ids,
            opposing_evidence_ids=body.opposing_evidence_ids,
            invalidation_conditions=body.invalidation_conditions,
            confidence=body.confidence,
            confidence_provided="confidence" in body.model_fields_set,
            change_reason=body.change_reason,
        )
    except ThesisNotFoundError as exc:
        raise HTTPException(404, str(exc)) from exc
    except ThesisConflictError as exc:
        raise HTTPException(409, str(exc)) from exc


@router.put("/{thesis_id}/claims/{claim_id}")
async def edit_claim(thesis_id: int, claim_id: int, body: ClaimUpdate, user: CurrentUser) -> dict[str, Any]:
    try:
        return await update_claim(
            thesis_id,
            claim_id,
            body.status,
            body.note,
            int(user["id"]),
            evidence_edges=(
                [edge.model_dump() for edge in body.evidence_edges]
                if body.evidence_edges is not None else None
            ),
        )
    except ThesisNotFoundError as exc:
        raise HTTPException(404, str(exc)) from exc
    except ThesisConflictError as exc:
        raise HTTPException(409, str(exc)) from exc


@router.post("/{thesis_id}/check")
async def run_drift_check(thesis_id: int, request: Request, user: CurrentUser) -> dict[str, Any]:
    try:
        return await check_thesis(thesis_id, _market(request), int(user["id"]))
    except ThesisNotFoundError as exc:
        raise HTTPException(404, str(exc)) from exc
    except Exception as exc:
        raise HTTPException(502, "Thesis 核验失败，已保存 UPSTREAM_ERROR 复盘记录") from exc


@router.post("/{thesis_id}/challenge")
async def run_thesis_challenge(thesis_id: int, user: CurrentUser) -> dict[str, Any]:
    try:
        return await challenge_thesis(thesis_id, int(user["id"]))
    except ThesisNotFoundError as exc:
        raise HTTPException(404, str(exc)) from exc
