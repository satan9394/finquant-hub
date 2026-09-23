from __future__ import annotations

import json

import pytest
from httpx import ASGITransport, AsyncClient

from app import config, database
from app.main import app
from app.routers.auth import get_current_user
from app.services.share_preview import (
    SharePreviewNotFoundError,
    build_strategy_share_preview,
    build_thesis_share_preview,
)
from app.services.thesis import create_thesis


class FixtureMarket:
    async def quote(self, _ticker: str) -> dict[str, object]:
        return {
            "price": 100.0,
            "source": "deterministic-fixture",
            "currency": "USD",
            "quality_flags": [],
        }

    async def fundamentals(self, _ticker: str) -> list[dict[str, object]]:
        return []


@pytest.fixture
async def preview_db(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "DB_PATH", tmp_path / "share-preview.db")
    await database.init_db()
    owner_id = await database.execute("INSERT INTO users (email) VALUES ('owner@test.local')")
    other_id = await database.execute("INSERT INTO users (email) VALUES ('other@test.local')")
    try:
        yield owner_id, other_id
    finally:
        await database.close_db()


async def _insert_evidence(user_id: int, evidence_id: str, license_scope: str) -> None:
    await database.execute(
        "INSERT INTO evidence_objects "
        "(user_id, evidence_id, kind, data_status, subject_type, subject_id, metric, "
        "value_json, source, vendor, as_of, retrieved_at, quality_flags_json, license_scope) "
        "VALUES (?, ?, 'observed_fact', 'PARTIAL', 'instrument', 'usAAPL', 'price', "
        "'123.45', 'fixture-provider', 'fixture-vendor', '2026-08-12T16:00:00Z', "
        "'2026-08-13T16:00:00Z', '[\"DELAYED\"]', ?)",
        (user_id, evidence_id, license_scope),
    )


@pytest.mark.asyncio
async def test_thesis_preview_is_private_owner_scoped_redacted_and_read_only(preview_db) -> None:
    owner_id, other_id = preview_db
    evidence_id = "ev_share_thesis_001"
    await _insert_evidence(owner_id, evidence_id, "display-and-research")
    thesis = await create_thesis(
        ticker="AAPL",
        title="Contact analyst@example.com",
        thesis="Hypothesis api_key=super-secret-value and sk-fixturetoken12345",
        assumptions=["Bearer abc.def.ghi should never render"],
        claims=["Demand may recover"],
        market=FixtureMarket(),
        user_id=owner_id,
        supporting_evidence_ids=[evidence_id],
        invalidation_conditions=["Demand remains weak"],
        confidence=0.6,
    )
    before = await database.query_all(
        "SELECT name, (SELECT COUNT(*) FROM thesis) AS thesis_count, "
        "(SELECT COUNT(*) FROM evidence_objects) AS evidence_count, "
        "(SELECT COUNT(*) FROM memory_records) AS memory_count "
        "FROM sqlite_master WHERE type='table' ORDER BY name LIMIT 1"
    )

    preview = await build_thesis_share_preview(int(thesis["id"]), owner_id)

    after = await database.query_all(
        "SELECT name, (SELECT COUNT(*) FROM thesis) AS thesis_count, "
        "(SELECT COUNT(*) FROM evidence_objects) AS evidence_count, "
        "(SELECT COUNT(*) FROM memory_records) AS memory_count "
        "FROM sqlite_master WHERE type='table' ORDER BY name LIMIT 1"
    )
    serialized = json.dumps(preview, ensure_ascii=False)
    assert before == after
    assert preview["schema_version"] == "share-preview/v1"
    assert preview["visibility"] == "private"
    assert preview["published"] is False
    assert preview["publish_action_available"] is False
    assert preview["content"]["result_kind"] == "USER_HYPOTHESIS"
    assert preview["content"]["causal_proof"] is False
    assert preview["publication_gate"]["status"] == "BLOCKED"
    assert "PRIVATE_PREVIEW_ONLY" in preview["publication_gate"]["reasons"]
    assert preview["audit"]["redaction"]["status"] == "PASS"
    assert preview["audit"]["redaction"]["redacted_count"] == 3
    assert preview["evidence"][0] == {
        "evidence_id": evidence_id,
        "relation": "supporting",
        "kind": "observed_fact",
        "data_status": "PARTIAL",
        "source": "fixture-provider",
        "vendor": "fixture-vendor",
        "as_of": "2026-08-12T16:00:00Z",
        "retrieved_at": "2026-08-13T16:00:00Z",
        "quality_flags": ["DELAYED"],
        "license_scope": "display-and-research",
        "public_reuse_permitted": False,
    }
    assert "123.45" not in serialized
    assert "analyst@example.com" not in serialized
    assert "super-secret-value" not in serialized
    assert "fixturetoken" not in serialized
    assert "url" not in serialized.lower()
    assert "token" not in set(preview)

    with pytest.raises(SharePreviewNotFoundError):
        await build_thesis_share_preview(int(thesis["id"]), other_id)


@pytest.mark.asyncio
async def test_strategy_preview_requires_saved_completed_run_and_preserves_unknown_license(
    preview_db,
) -> None:
    owner_id, other_id = preview_db
    params = {
        "symbol": "usAAPL",
        "start_date": "2024-01-01",
        "end_date": "2025-01-01",
        "short_window": 20,
        "long_window": 50,
        "initial_capital": 100000,
        "commission_bps": 2.5,
        "slippage_bps": 2,
        "sell_stamp_duty_bps": 0,
        "minimum_commission_cny": 0,
        "max_drawdown_stop_pct": 0,
        "benchmark": "buy_and_hold",
        "market_rules": "auto",
    }
    result = {
        "metrics": {
            "total_return": 0.1,
            "benchmark_return": 0.12,
            "excess_return": -0.02,
            "max_drawdown": -0.08,
            "sharpe_ratio": 0.5,
            "trade_count": 6,
        },
        "trades": [{"private": "must-not-render"}],
        "equity_curve": [{"time": "2024-01-01", "value": 100000}],
    }
    run_id = await database.execute(
        "INSERT INTO quant_backtests "
        "(symbol, status, params_json, result_json, provider, data_as_of, timezone, currency, "
        "adjustment, frequency, quality_flags, is_saved, user_id) "
        "VALUES ('usAAPL', 'completed', ?, ?, 'fixture-provider', '2025-01-01', 'UTC', "
        "'USD', 'adjusted', '1d', '[\"PARTIAL_HISTORY\"]', 1, ?)",
        (json.dumps(params), json.dumps(result), owner_id),
    )
    unsaved_id = await database.execute(
        "INSERT INTO quant_backtests "
        "(symbol, status, params_json, result_json, is_saved, user_id) "
        "VALUES ('usMSFT', 'completed', ?, ?, 0, ?)",
        (json.dumps(params), json.dumps(result), owner_id),
    )

    preview = await build_strategy_share_preview(run_id, owner_id)
    serialized = json.dumps(preview, ensure_ascii=False)

    assert preview["content"]["result_kind"] == "COMPUTED_RESULT"
    assert preview["content"]["causal_proof"] is False
    assert preview["content"]["metrics"]["total_return"] == 0.1
    assert preview["provenance"]["license_scope"] is None
    assert preview["provenance"]["license_status"] == "UNKNOWN"
    assert "LICENSE_UNKNOWN" in preview["publication_gate"]["reasons"]
    assert preview["audit"]["provenance"]["status"] == "PARTIAL"
    assert "must-not-render" not in serialized
    assert "trades" not in serialized
    assert "equity_curve" not in serialized

    for inaccessible_id, user_id in ((unsaved_id, owner_id), (run_id, other_id)):
        with pytest.raises(SharePreviewNotFoundError):
            await build_strategy_share_preview(inaccessible_id, user_id)


def test_openapi_has_only_authenticated_read_only_preview_routes() -> None:
    paths = app.openapi()["paths"]
    thesis_path = "/api/thesis/{thesis_id}/share-preview"
    strategy_path = "/api/backtests/{run_id}/share-preview"
    assert set(paths[thesis_path]) == {"get"}
    assert set(paths[strategy_path]) == {"get"}
    assert all("public" not in path and "publish" not in path for path in (thesis_path, strategy_path))


@pytest.mark.asyncio
async def test_preview_endpoints_return_owner_data_and_generic_cross_owner_404(preview_db) -> None:
    owner_id, other_id = preview_db
    thesis = await create_thesis(
        ticker="AAPL",
        title="Owner thesis",
        thesis="Demand may recover",
        assumptions=[],
        claims=[],
        market=FixtureMarket(),
        user_id=owner_id,
    )
    params = {"symbol": "usAAPL", "short_window": 20, "long_window": 50}
    result = {"metrics": {"total_return": 0.1}}
    run_id = await database.execute(
        "INSERT INTO quant_backtests "
        "(symbol, status, params_json, result_json, is_saved, user_id) "
        "VALUES ('usAAPL', 'completed', ?, ?, 1, ?)",
        (json.dumps(params), json.dumps(result), owner_id),
    )

    async def owner() -> dict[str, object]:
        return {"id": owner_id, "email": "owner@test.local"}

    async def other() -> dict[str, object]:
        return {"id": other_id, "email": "other@test.local"}

    try:
        app.dependency_overrides[get_current_user] = owner
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            thesis_response = await client.get(f"/api/thesis/{thesis['id']}/share-preview")
            strategy_response = await client.get(f"/api/backtests/{run_id}/share-preview")
            assert thesis_response.status_code == 200
            assert strategy_response.status_code == 200
            assert thesis_response.json()["published"] is False
            assert strategy_response.json()["published"] is False

            app.dependency_overrides[get_current_user] = other
            thesis_hidden = await client.get(f"/api/thesis/{thesis['id']}/share-preview")
            strategy_hidden = await client.get(f"/api/backtests/{run_id}/share-preview")
            assert thesis_hidden.status_code == 404
            assert strategy_hidden.status_code == 404
            assert thesis_hidden.json() == strategy_hidden.json()
    finally:
        app.dependency_overrides.pop(get_current_user, None)
