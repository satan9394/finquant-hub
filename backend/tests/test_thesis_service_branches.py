from __future__ import annotations

import json

import pytest
import pytest_asyncio

from app import config, database
from app.services import thesis as thesis_service
from app.services.thesis import (
    ThesisConflictError,
    ThesisNotFoundError,
    _fundamental_values,
    _loads,
    _persist_review_item,
    _position_shares,
    _replace_claim_edges,
    _report_fundamentals,
    _validate_evidence_ids,
    _version_diff,
    check_thesis,
    confirm_thesis_version,
    create_from_report,
    create_thesis,
    decide_thesis_review,
    get_thesis,
)


class FixtureMarket:
    async def quote(self, ticker):
        return {"code": ticker, "name": "Fixture", "price": 100, "source": "fixture"}

    async def fundamentals(self, _ticker):
        return [{
            "metric": "total_revenue", "value": 100, "as_of": "2026-03-31",
            "currency": "USD", "period_type": "TTM", "provider": "fixture",
            "source": "fixture", "is_ttm": True,
        }]


@pytest_asyncio.fixture(autouse=True)
async def thesis_db(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "DB_PATH", tmp_path / "thesis-branches.db")
    await database.init_db()
    await database.execute("INSERT INTO users (id, email) VALUES (1, 'thesis@fixture.local')")
    try:
        yield
    finally:
        await database.close_db()


def test_json_fundamental_and_version_diff_helpers_are_conservative():
    assert _loads(None, []) == []
    assert _loads("not-json", {}) == {}
    assert _fundamental_values(None) == {}
    assert _fundamental_values([
        "skip", {"metric": "", "value": 1}, {"metric": "revenue", "value": "bad"},
        {"metric": "revenue", "value": 100}, {"metric": "revenue", "value": 200},
    ]) == {"revenue": 100.0}
    assert _report_fundamentals({"fundamental_evidence": []}) == {}
    assert _version_diff(None, {"judgment": "new"}) == {}
    diff = _version_diff(
        {"judgment": "old", "confidence": 0.4},
        {"judgment": "new", "confidence": 0.7, "change_reason": "evidence"},
    )
    assert diff["judgment"] == {"from": "old", "to": "new"}
    assert diff["confidence"]["reason"] == "evidence"


@pytest.mark.asyncio
async def test_position_snapshot_helper_returns_none_or_owned_sum():
    assert await _position_shares("usAAPL", 1) is None
    portfolio_id = await database.execute("INSERT INTO portfolios (name, user_id) VALUES ('Core', 1)")
    await database.execute(
        "INSERT INTO positions (portfolio_id, ticker, shares, avg_cost, user_id) "
        "VALUES (?, 'usAAPL', 2.5, 100, 1)",
        (portfolio_id,),
    )
    assert await _position_shares("usAAPL", 1) == 2.5


@pytest.mark.asyncio
async def test_version_and_review_decisions_validate_input_before_writes():
    with pytest.raises(ThesisConflictError, match="acknowledged"):
        await confirm_thesis_version(1, 1, 1, decision="invalid", reason="fixture")
    with pytest.raises(ThesisConflictError, match="原因不能为空"):
        await confirm_thesis_version(1, 1, 1, decision="acknowledged", reason=" ")
    with pytest.raises(ThesisNotFoundError, match="版本不存在"):
        await confirm_thesis_version(1, 1, 1, decision="acknowledged", reason="fixture")

    with pytest.raises(ThesisConflictError, match="acknowledged"):
        await decide_thesis_review(1, 1, 1, decision="invalid", reason="fixture")
    with pytest.raises(ThesisConflictError, match="原因不能为空"):
        await decide_thesis_review(1, 1, 1, decision="disputed", reason=" ")
    with pytest.raises(ThesisNotFoundError, match="复盘项不存在"):
        await decide_thesis_review(1, 1, 1, decision="disputed", reason="fixture")


@pytest.mark.asyncio
async def test_evidence_validation_deduplicates_and_enforces_owner_and_stance():
    await database.execute(
        "INSERT INTO evidence_objects "
        "(user_id, evidence_id, kind, data_status, subject_type, subject_id, metric, value_json, "
        "source, retrieved_at, license_scope) VALUES "
        "(1, 'ev_fixture_1', 'observed_fact', 'OK', 'instrument', 'usAAPL', 'price', '100', "
        "'fixture', '2026-08-30T00:00:00Z', 'test-only')"
    )
    with pytest.raises(ThesisConflictError, match="同时标记"):
        await _validate_evidence_ids(1, ["ev_fixture_1"], ["ev_fixture_1"])
    with pytest.raises(ThesisConflictError, match="不存在"):
        await _validate_evidence_ids(1, ["ev_missing"], [])
    assert await _validate_evidence_ids(1, ["ev_fixture_1", "ev_fixture_1", ""], []) == (
        ["ev_fixture_1"], [],
    )

    with pytest.raises(ThesisConflictError, match="唯一且非空"):
        await _replace_claim_edges(
            thesis_id=1, claim_id=1, user_id=1,
            evidence_edges=[{"evidence_id": "ev_fixture_1"}, {"evidence_id": "ev_fixture_1"}],
            created_source="user",
        )
    with pytest.raises(ThesisConflictError, match="stance"):
        await _replace_claim_edges(
            thesis_id=1, claim_id=1, user_id=1,
            evidence_edges=[{"evidence_id": "ev_fixture_1", "stance": "neutral"}],
            created_source="user",
        )
    with pytest.raises(ThesisConflictError, match="valid_to"):
        await _replace_claim_edges(
            thesis_id=1, claim_id=1, user_id=1,
            evidence_edges=[{
                "evidence_id": "ev_fixture_1", "stance": "supporting",
                "valid_from": "2026-08-30", "valid_to": "2026-08-29",
            }],
            created_source="user",
        )


@pytest.mark.asyncio
async def test_create_from_report_rejects_missing_and_running_then_handles_non_object_json():
    market = FixtureMarket()
    with pytest.raises(ThesisNotFoundError, match="研究报告不存在"):
        await create_from_report(999, market, 1)

    running_id = await database.execute(
        "INSERT INTO research_reports (ticker, company_name, report_data, agent_results, status, user_id) "
        "VALUES ('usAAPL', 'Apple', '{}', '{}', 'running', 1)"
    )
    with pytest.raises(ThesisConflictError, match="只有已完成"):
        await create_from_report(running_id, market, 1)

    completed_id = await database.execute(
        "INSERT INTO research_reports (ticker, company_name, report_data, agent_results, status, user_id) "
        "VALUES ('usAAPL', 'Apple', '[]', '{}', 'completed', 1)"
    )
    created = await create_from_report(completed_id, market, 1)
    assert created["thesis"] == "原报告未提供可提取的核心论点"
    assert created["current_version"]["judgment_kind"] == "AI_INFERENCE"


@pytest.mark.asyncio
async def test_failed_check_persists_upstream_error_review(monkeypatch):
    created = await create_thesis(
        ticker="AAPL", title="Fixture", thesis="Claim", assumptions=[], claims=[],
        market=FixtureMarket(), user_id=1,
    )

    def fail_evaluation(**_kwargs):
        raise RuntimeError("fixture drift failure")

    monkeypatch.setattr(thesis_service, "evaluate_drift", fail_evaluation)
    with pytest.raises(RuntimeError, match="fixture drift failure"):
        await check_thesis(created["id"], FixtureMarket(), 1)

    review = await database.query_one(
        "SELECT status, quality_status, error FROM thesis_review_items WHERE thesis_id=?",
        (created["id"],),
    )
    assert review["status"] == "failed"
    assert review["quality_status"] == "UPSTREAM_ERROR"
    assert "fixture drift failure" in review["error"]


@pytest.mark.asyncio
async def test_review_item_quality_covers_unknown_partial_and_no_change():
    created = await create_thesis(
        ticker="AAPL", title="Fixture", thesis="Claim", assumptions=[], claims=[],
        market=FixtureMarket(), user_id=1,
    )
    thesis = await get_thesis(created["id"], 1)
    evaluation = {"engine_version": "fixture/v1"}
    await _persist_review_item(thesis=thesis, user_id=1, evaluation=evaluation, changes=[])
    await _persist_review_item(
        thesis=thesis, user_id=1, evaluation=evaluation,
        changes=[{
            "kind": "price", "to_status": "unknown", "baseline_evidence_ids": [],
            "current_evidence_ids": [],
        }],
    )
    await _persist_review_item(
        thesis=thesis, user_id=1, evaluation=evaluation,
        changes=[{
            "kind": "price", "to_status": "holding", "baseline_evidence_ids": ["base"],
            "current_evidence_ids": [],
        }, {
            "kind": "fundamental", "to_status": "unknown", "baseline_evidence_ids": [],
            "current_evidence_ids": [],
        }],
    )
    rows = await database.query_all(
        "SELECT quality_status, changes_json FROM thesis_review_items WHERE thesis_id=? ORDER BY id",
        (created["id"],),
    )
    assert [row["quality_status"] for row in rows] == ["UNKNOWN", "PARTIAL"]
    assert all(json.loads(row["changes_json"]) for row in rows)
