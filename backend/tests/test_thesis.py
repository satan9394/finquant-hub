from __future__ import annotations

import json
import sqlite3

import pytest
from fastapi import HTTPException

from app import config, database
from app.main import app
from app.routers.thesis import get_validation_experiment
from app.services.thesis import (
    ThesisConflictError,
    ThesisNotFoundError,
    create_from_report,
    create_thesis,
    create_validation_experiment_intent,
    get_thesis,
    list_thesis_versions,
    update_thesis,
)


class FixtureMarket:
    async def quote(self, ticker: str) -> dict[str, object]:
        return {"price": 100.0, "source": "fixture"}

    async def fundamentals(self, ticker: str) -> list[dict[str, object]]:
        return []


@pytest.fixture
async def thesis_db(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "DB_PATH", tmp_path / "thesis-v2.db")
    await database.init_db()
    owner_id = await database.execute("INSERT INTO users (email) VALUES ('owner@test.local')")
    other_id = await database.execute("INSERT INTO users (email) VALUES ('other@test.local')")
    await database.claim_unowned_data(owner_id)
    try:
        yield owner_id, other_id
    finally:
        await database.close_db()


async def _insert_evidence(user_id: int, evidence_id: str, metric: str) -> None:
    await database.execute(
        "INSERT INTO evidence_objects "
        "(user_id, evidence_id, kind, data_status, subject_type, subject_id, metric, "
        "value_json, source, retrieved_at, license_scope) "
        "VALUES (?, ?, 'observed_fact', 'OK', 'instrument', 'usAAPL', ?, "
        "'1', 'fixture', '2026-08-11T00:00:00Z', 'test-only')",
        (user_id, evidence_id, metric),
    )


@pytest.mark.asyncio
async def test_legacy_create_and_update_keep_immutable_versions_and_claim_history(thesis_db) -> None:
    owner_id, _ = thesis_db
    created = await create_thesis(
        ticker="AAPL",
        title="Apple thesis",
        thesis="Initial judgment",
        assumptions=["Initial assumption"],
        claims=["Initial manual claim"],
        market=FixtureMarket(),
        user_id=owner_id,
    )
    assert created["thesis"] == "Initial judgment"
    assert created["current_version"]["version"] == 1
    assert created["current_version"]["judgment"] == "Initial judgment"
    assert created["current_version"]["judgment_kind"] == "USER_HYPOTHESIS"

    updated = await update_thesis(
        created["id"],
        owner_id,
        title="Apple thesis v2",
        thesis="Revised judgment",
        assumptions=["Revised assumption"],
        status="open",
        claims=["Revised manual claim"],
        invalidation_conditions=["Services margin falls below threshold"],
        confidence=0.65,
        change_reason="New deterministic fixture evidence",
    )
    assert updated["thesis"] == "Revised judgment"
    assert updated["current_version"]["version"] == 2
    assert updated["current_version"]["change_reason"] == "New deterministic fixture evidence"
    assert [claim["claim"] for claim in updated["claims"] if claim["kind"] == "manual"] == [
        "Revised manual claim"
    ]

    versions = await list_thesis_versions(created["id"], owner_id)
    assert [version["version"] for version in versions] == [2, 1]
    assert versions[1]["judgment"] == "Initial judgment"
    assert versions[1]["assumptions"] == ["Initial assumption"]
    assert versions[0]["invalidation_conditions"] == ["Services margin falls below threshold"]
    assert versions[0]["confidence"] == 0.65
    retained = await database.query_all(
        "SELECT claim, retired_at FROM thesis_claims "
        "WHERE thesis_id=? AND kind='manual' ORDER BY id",
        (created["id"],),
    )
    assert retained[0]["claim"] == "Initial manual claim"
    assert retained[0]["retired_at"] is not None
    assert retained[1] == {"claim": "Revised manual claim", "retired_at": None}


@pytest.mark.asyncio
async def test_version_evidence_is_same_owner_and_failed_update_is_atomic(thesis_db) -> None:
    owner_id, other_id = thesis_db
    await _insert_evidence(owner_id, "ev_owner0001", "revenue")
    await _insert_evidence(other_id, "ev_other0001", "margin")
    created = await create_thesis(
        ticker="AAPL",
        title="Evidence thesis",
        thesis="Owner judgment",
        assumptions=[],
        claims=[],
        market=FixtureMarket(),
        user_id=owner_id,
        supporting_evidence_ids=["ev_owner0001"],
        opposing_evidence_ids=[],
    )
    assert created["current_version"]["supporting_evidence_ids"] == ["ev_owner0001"]

    with pytest.raises(ThesisConflictError, match="evidence"):
        await update_thesis(
            created["id"],
            owner_id,
            title="Must not persist",
            thesis="Must not persist",
            assumptions=[],
            status="open",
            claims=None,
            opposing_evidence_ids=["ev_other0001"],
            change_reason="Cross owner attempt",
        )

    unchanged = await get_thesis(created["id"], owner_id)
    assert unchanged["title"] == "Evidence thesis"
    assert unchanged["current_version"]["version"] == 1
    assert await list_thesis_versions(created["id"], other_id) == []


@pytest.mark.asyncio
async def test_version_rows_reject_update_and_delete(thesis_db) -> None:
    owner_id, _ = thesis_db
    created = await create_thesis(
        ticker="AAPL", title="Immutable", thesis="Keep me", assumptions=[], claims=[],
        market=FixtureMarket(), user_id=owner_id,
    )
    version_id = created["current_version"]["id"]
    with pytest.raises(sqlite3.IntegrityError, match="immutable"):
        await database.execute(
            "UPDATE thesis_versions SET judgment='changed' WHERE id=?", (version_id,)
        )
    with pytest.raises(sqlite3.IntegrityError, match="immutable"):
        await database.execute("DELETE FROM thesis_versions WHERE id=?", (version_id,))


@pytest.mark.asyncio
async def test_report_judgment_stays_ai_inference_and_confidence_can_return_unknown(thesis_db) -> None:
    owner_id, _ = thesis_db
    report_id = await database.execute(
        "INSERT INTO research_reports "
        "(ticker, company_name, report_data, status, user_id) VALUES (?, ?, ?, 'completed', ?)",
        (
            "usAAPL", "Apple",
            json.dumps({"executive_summary": "Fixture synthesis", "team_lead_review": {"bull_case": "Fixture bull"}}),
            owner_id,
        ),
    )
    created = await create_from_report(report_id, FixtureMarket(), owner_id)
    assert created["current_version"]["judgment_kind"] == "AI_INFERENCE"
    updated = await update_thesis(
        created["id"], owner_id, title=created["title"], thesis="User revision",
        assumptions=[], status="open", claims=None, confidence=None,
        confidence_provided=True, change_reason="Confidence is currently UNKNOWN",
    )
    assert updated["current_version"]["judgment_kind"] == "USER_HYPOTHESIS"
    assert updated["current_version"]["confidence"] is None


def test_openapi_exposes_owner_scoped_version_history() -> None:
    operation = app.openapi()["paths"]["/api/thesis/{thesis_id}/versions"]["get"]
    assert operation["tags"] == ["thesis"]


@pytest.mark.asyncio
async def test_validation_experiment_intent_is_owner_scoped_and_does_not_guess_parameters(
    thesis_db,
) -> None:
    owner_id, other_id = thesis_db
    created = await create_thesis(
        ticker="AAPL", title="Validate demand", thesis="Demand may recover",
        assumptions=[], claims=[], market=FixtureMarket(), user_id=owner_id,
    )

    intent = await create_validation_experiment_intent(created["id"], owner_id)

    assert intent == {
        "schema_version": "thesis-validation-experiment/v1",
        "source": {
            "type": "thesis", "id": created["id"], "title": "Validate demand", "ticker": "usAAPL",
        },
        "capability": "backtests.ma_crossover",
        "fixed_semantics": {
            "frequency": "1d", "price_field": "close", "signal_at": "close",
            "execute_at": "next_open", "position_mode": "long_only",
        },
        "parameters": {"symbol": "usAAPL"},
        "requires_confirmation": [
            "short_window", "long_window", "start_date", "end_date", "initial_capital",
            "commission_bps", "slippage_bps", "sell_stamp_duty_bps",
            "minimum_commission_cny", "max_drawdown_stop_pct", "benchmark",
        ],
        "result_interpretation": "VALIDATION_ONLY_NOT_CAUSAL_PROOF",
    }
    assert "thesis" not in intent["parameters"]
    with pytest.raises(ThesisNotFoundError, match="论文不存在"):
        await create_validation_experiment_intent(created["id"], other_id)


def test_openapi_exposes_owner_scoped_validation_experiment_intent() -> None:
    operation = app.openapi()["paths"]["/api/thesis/{thesis_id}/validation-experiment"]["get"]
    assert operation["tags"] == ["thesis"]


@pytest.mark.asyncio
async def test_validation_experiment_endpoint_maps_cross_owner_lookup_to_404(thesis_db) -> None:
    owner_id, other_id = thesis_db
    created = await create_thesis(
        ticker="600519", title="Owner only", thesis="Fixture judgment",
        assumptions=[], claims=[], market=FixtureMarket(), user_id=owner_id,
    )

    response = await get_validation_experiment(created["id"], {"id": owner_id})
    assert response["parameters"] == {"symbol": "sh600519"}
    with pytest.raises(HTTPException) as exc_info:
        await get_validation_experiment(created["id"], {"id": other_id})
    assert exc_info.value.status_code == 404
