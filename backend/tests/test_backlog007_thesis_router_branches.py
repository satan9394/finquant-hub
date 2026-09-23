"""Route-level exception contracts for the thesis API."""

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

from app.routers import thesis
from app.services.share_preview import SharePreviewNotFoundError
from app.services.thesis import ThesisConflictError, ThesisNotFoundError


REQUEST = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(market=object())))
USER = {"id": 7}


async def _status(call, expected):
    with pytest.raises(HTTPException) as exc:
        await call()
    assert exc.value.status_code == expected


def _create_body():
    return thesis.ThesisCreate(ticker="600519", title="Title", thesis="Claim")


def _update_body():
    return thesis.ThesisUpdate(title="Title", thesis="Claim")


@pytest.mark.asyncio
async def test_add_thesis_maps_conflict_and_validation(monkeypatch):
    monkeypatch.setattr(thesis, "create_thesis", AsyncMock(side_effect=ThesisConflictError("duplicate")))
    await _status(lambda: thesis.add_thesis(_create_body(), REQUEST, USER), 409)
    monkeypatch.setattr(thesis, "create_thesis", AsyncMock(side_effect=ValueError("invalid")))
    await _status(lambda: thesis.add_thesis(_create_body(), REQUEST, USER), 422)


@pytest.mark.asyncio
async def test_add_from_report_maps_not_found_and_conflict(monkeypatch):
    monkeypatch.setattr(thesis, "create_from_report", AsyncMock(side_effect=ThesisNotFoundError("missing")))
    await _status(lambda: thesis.add_from_report(1, REQUEST, USER), 404)
    monkeypatch.setattr(thesis, "create_from_report", AsyncMock(side_effect=ThesisConflictError("duplicate")))
    await _status(lambda: thesis.add_from_report(1, REQUEST, USER), 409)


@pytest.mark.asyncio
async def test_thesis_detail_validation_and_preview_not_found(monkeypatch):
    monkeypatch.setattr(thesis, "get_thesis", AsyncMock(side_effect=ThesisNotFoundError("missing")))
    await _status(lambda: thesis.get_thesis_detail(1, USER), 404)
    monkeypatch.setattr(thesis, "create_validation_experiment_intent", AsyncMock(side_effect=ThesisNotFoundError("missing")))
    await _status(lambda: thesis.get_validation_experiment(1, USER), 404)
    monkeypatch.setattr(thesis, "build_thesis_share_preview", AsyncMock(side_effect=SharePreviewNotFoundError("missing")))
    await _status(lambda: thesis.get_thesis_share_preview(1, USER), 404)


@pytest.mark.asyncio
async def test_thesis_history_and_reviews_require_owner_visible_thesis(monkeypatch):
    monkeypatch.setattr(thesis, "get_thesis", AsyncMock(side_effect=ThesisNotFoundError("missing")))
    await _status(lambda: thesis.get_thesis_history(1, USER), 404)
    await _status(lambda: thesis.get_thesis_reviews(1, USER), 404)

    monkeypatch.setattr(thesis, "get_thesis", AsyncMock(return_value={"id": 1}))
    monkeypatch.setattr(thesis, "list_thesis_versions", AsyncMock(return_value=[{"version": 1}]))
    monkeypatch.setattr(thesis, "list_thesis_reviews", AsyncMock(return_value=[{"id": 2}]))
    assert (await thesis.get_thesis_history(1, USER))["total"] == 1
    assert (await thesis.get_thesis_reviews(1, USER))["total"] == 1


@pytest.mark.asyncio
@pytest.mark.parametrize("error,status", [
    (ThesisNotFoundError("missing"), 404),
    (ThesisConflictError("conflict"), 409),
])
async def test_confirm_version_error_mapping(monkeypatch, error, status):
    monkeypatch.setattr(thesis, "confirm_thesis_version", AsyncMock(side_effect=error))
    body = thesis.ThesisVersionConfirmation(decision="acknowledged", reason="reviewed")
    await _status(lambda: thesis.confirm_version(1, 1, body, USER), status)


@pytest.mark.asyncio
@pytest.mark.parametrize("error,status", [
    (ThesisNotFoundError("missing"), 404),
    (ThesisConflictError("conflict"), 409),
])
async def test_decide_review_error_mapping(monkeypatch, error, status):
    monkeypatch.setattr(thesis, "decide_thesis_review", AsyncMock(side_effect=error))
    body = thesis.ThesisReviewDecision(decision="disputed", reason="evidence")
    await _status(lambda: thesis.decide_review(1, 2, body, USER), status)


@pytest.mark.asyncio
@pytest.mark.parametrize("error,status", [
    (ThesisNotFoundError("missing"), 404),
    (ThesisConflictError("conflict"), 409),
])
async def test_edit_thesis_error_mapping(monkeypatch, error, status):
    monkeypatch.setattr(thesis, "update_thesis", AsyncMock(side_effect=error))
    await _status(lambda: thesis.edit_thesis(1, _update_body(), USER), status)


@pytest.mark.asyncio
@pytest.mark.parametrize("error,status", [
    (ThesisNotFoundError("missing"), 404),
    (ThesisConflictError("conflict"), 409),
])
async def test_edit_claim_error_mapping(monkeypatch, error, status):
    monkeypatch.setattr(thesis, "update_claim", AsyncMock(side_effect=error))
    body = thesis.ClaimUpdate(status="unknown", evidence_edges=[
        thesis.ClaimEvidenceInput(evidence_id="ev-1", stance="supporting"),
    ])
    await _status(lambda: thesis.edit_claim(1, 2, body, USER), status)


@pytest.mark.asyncio
async def test_drift_check_and_challenge_error_mapping(monkeypatch):
    monkeypatch.setattr(thesis, "check_thesis", AsyncMock(side_effect=ThesisNotFoundError("missing")))
    await _status(lambda: thesis.run_drift_check(1, REQUEST, USER), 404)
    monkeypatch.setattr(thesis, "check_thesis", AsyncMock(side_effect=RuntimeError("upstream")))
    await _status(lambda: thesis.run_drift_check(1, REQUEST, USER), 502)
    monkeypatch.setattr(thesis, "challenge_thesis", AsyncMock(side_effect=ThesisNotFoundError("missing")))
    await _status(lambda: thesis.run_thesis_challenge(1, USER), 404)
