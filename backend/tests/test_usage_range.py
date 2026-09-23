"""Deterministic tests for the /api/usage range window and dimension stats.

Covers BACKLOG-045: explicit ``start``/``end`` ranges that stay backward
compatible with ``days``, honest 400s for invalid ranges, and the model /
session-type aggregation behind the usage detail table (cost reused from
BACKLOG-044, never invented).
"""

import hashlib
from datetime import datetime, timedelta, timezone

import pytest
import pytest_asyncio
from fastapi import HTTPException
from httpx import ASGITransport, AsyncClient

from app import config, database
from app.main import app
from app.routers.usage import MAX_RANGE_DAYS, _cost_rollup, resolve_range

TODAY = datetime.now(timezone.utc).date()


def _iso(days_ago: int) -> str:
    return (TODAY - timedelta(days=days_ago)).isoformat()


def _stamp(days_ago: int) -> str:
    return f"{_iso(days_ago)} 12:00:00"


# --------------------------------------------------------------------------- #
# pure window resolution
# --------------------------------------------------------------------------- #


def test_resolve_range_days_window_is_inclusive_and_unchanged():
    assert resolve_range(7, None, None, today=TODAY) == (
        TODAY - timedelta(days=6),
        TODAY,
    )
    assert resolve_range(1, None, None, today=TODAY) == (TODAY, TODAY)


def test_resolve_range_explicit_bounds_win_over_days():
    start, end = resolve_range(30, "2026-02-01", "2026-02-10", today=TODAY)
    assert (start.isoformat(), end.isoformat()) == ("2026-02-01", "2026-02-10")
    assert (end - start).days + 1 == 10


@pytest.mark.parametrize(
    ("start", "end", "detail"),
    [
        ("2026-02-10", "2026-02-01", "start must not be after end"),
        ("2026-02-01", None, "start and end must be provided together"),
        (None, "2026-02-01", "start and end must be provided together"),
        ("2026-13-01", "2026-13-02", "invalid start: expected YYYY-MM-DD"),
        ("2026-02-01", "not-a-date", "invalid end: expected YYYY-MM-DD"),
    ],
)
def test_resolve_range_rejects_invalid_input_with_400(start, end, detail):
    with pytest.raises(HTTPException) as excinfo:
        resolve_range(30, start, end, today=TODAY)
    assert excinfo.value.status_code == 400
    assert excinfo.value.detail == detail


def test_resolve_range_rejects_oversized_span():
    start = TODAY - timedelta(days=MAX_RANGE_DAYS)
    with pytest.raises(HTTPException) as excinfo:
        resolve_range(30, start.isoformat(), TODAY.isoformat(), today=TODAY)
    assert excinfo.value.status_code == 400
    assert excinfo.value.detail == f"range must not exceed {MAX_RANGE_DAYS} days"


# --------------------------------------------------------------------------- #
# pure cost rollup (honest unpriced / partial / mixed currency)
# --------------------------------------------------------------------------- #


def _cost_row(cost, currency, tokens):
    return {"estimated_cost": cost, "currency": currency, "total_tokens": tokens}


def test_cost_rollup_is_none_for_an_empty_window():
    rollup = _cost_rollup([])
    assert rollup["cost_status"] == "none"
    assert rollup["estimated_cost"] is None
    assert rollup["cost_by_currency"] == {}


def test_cost_rollup_never_turns_a_missing_price_into_zero():
    rollup = _cost_rollup([_cost_row(None, None, 500)])
    assert rollup["cost_status"] == "unpriced"
    assert rollup["estimated_cost"] is None
    assert rollup["currency"] is None
    assert rollup["unpriced_models"] == 1
    assert rollup["unpriced_total_tokens"] == 500


def test_cost_rollup_reports_partial_and_mixed_currency_honestly():
    partial = _cost_rollup([_cost_row(1.5, "CNY", 100), _cost_row(None, None, 50)])
    assert partial["cost_status"] == "partial"
    assert partial["estimated_cost"] == 1.5
    assert partial["unpriced_total_tokens"] == 50

    mixed = _cost_rollup([_cost_row(1.0, "CNY", 10), _cost_row(2.0, "USD", 10)])
    assert mixed["cost_status"] == "mixed_currency"
    assert mixed["mixed_currency"] is True
    assert mixed["currency"] is None
    assert mixed["estimated_cost"] is None
    assert mixed["cost_by_currency"] == {"CNY": 1.0, "USD": 2.0}


# --------------------------------------------------------------------------- #
# HTTP surface
# --------------------------------------------------------------------------- #


@pytest_asyncio.fixture
async def usage_client(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "DB_PATH", tmp_path / "usage-range.db")
    monkeypatch.setattr(config, "LOCAL_ONLY_MODE", False)
    monkeypatch.setattr(config, "SCHEDULER_ENABLED", False)
    async with app.router.lifespan_context(app):
        owner_id = await database.execute(
            "INSERT INTO users (email, is_admin) VALUES ('usage-range@test.local', 1)"
        )
        other_id = await database.execute(
            "INSERT INTO users (email) VALUES ('usage-range-other@test.local')"
        )
        await database.claim_unowned_data(owner_id)
        await database.seed_models_for_user(owner_id)
        await database.seed_models_for_user(other_id)

        token = "usage-range-owner-token"
        await database.execute(
            "INSERT INTO sessions (user_id, token_hash, expires_at) "
            "VALUES (?, ?, datetime('now', '+1 day'))",
            (owner_id, hashlib.sha256(token.encode()).hexdigest()),
        )

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            auth = {"Cookie": f"{config.AUTH_COOKIE_NAME}={token}"}
            yield client, auth, owner_id, other_id


async def _seed_usage(owner_id: int) -> None:
    """Three days of owner data: recent, mid, and outside the default window."""
    rows = [
        ("research", "priced-model", 100, 50, 150, _stamp(0)),
        ("chat", "priced-model", 200, 100, 300, _stamp(3)),
        ("chat", "free-model", 10, 5, 15, _stamp(3)),
        ("swarm", "priced-model", 1000, 1000, 2000, _stamp(60)),
    ]
    for session_type, model, prompt, completion, total, created_at in rows:
        await database.execute(
            "INSERT INTO llm_usage "
            "(session_type, model_name, prompt_tokens, completion_tokens, total_tokens, user_id, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (session_type, model, prompt, completion, total, owner_id, created_at),
        )
    await database.execute(
        "INSERT INTO model_pricing (user_id, model_name, input_per_1m, output_per_1m, currency) "
        "VALUES (?, 'priced-model', 2.0, 4.0, 'CNY')",
        (owner_id,),
    )


@pytest.mark.asyncio
async def test_usage_days_window_still_works_and_echoes_the_window(usage_client):
    client, auth, owner_id, _other = usage_client
    await _seed_usage(owner_id)

    response = await client.get("/api/usage", params={"days": 7}, headers=auth)
    assert response.status_code == 200
    body = response.json()
    assert body["days"] == 7
    assert body["start"] == _iso(6)
    assert body["end"] == _iso(0)
    assert body["total"]["total_tokens"] == 465  # 60-day-old row excluded
    assert [item["day"] for item in body["items"]] == [_iso(3), _iso(0)]


@pytest.mark.asyncio
async def test_usage_explicit_range_scopes_the_window(usage_client):
    client, auth, owner_id, _other = usage_client
    await _seed_usage(owner_id)

    response = await client.get(
        "/api/usage", params={"start": _iso(4), "end": _iso(1)}, headers=auth
    )
    assert response.status_code == 200
    body = response.json()
    assert body["start"] == _iso(4)
    assert body["end"] == _iso(1)
    assert body["days"] == 4
    assert body["total"] == {
        "prompt_tokens": 210,
        "completion_tokens": 105,
        "total_tokens": 315,
        "request_count": 2,
    }
    assert [item["day"] for item in body["items"]] == [_iso(3)]


@pytest.mark.asyncio
async def test_usage_range_ignores_data_outside_the_window(usage_client):
    client, auth, owner_id, _other = usage_client
    await _seed_usage(owner_id)

    response = await client.get(
        "/api/usage", params={"start": _iso(90), "end": _iso(30)}, headers=auth
    )
    body = response.json()
    assert body["total"]["total_tokens"] == 2000
    assert [item["day"] for item in body["items"]] == [_iso(60)]


@pytest.mark.asyncio
async def test_usage_invalid_range_is_an_honest_400(usage_client):
    client, auth, owner_id, _other = usage_client
    await _seed_usage(owner_id)

    inverted = await client.get(
        "/api/usage", params={"start": _iso(1), "end": _iso(5)}, headers=auth
    )
    assert inverted.status_code == 400
    assert inverted.json()["detail"] == "start must not be after end"

    half = await client.get("/api/usage", params={"start": _iso(1)}, headers=auth)
    assert half.status_code == 400
    assert half.json()["detail"] == "start and end must be provided together"

    malformed = await client.get(
        "/api/usage", params={"start": "2026-9-1", "end": _iso(1)}, headers=auth
    )
    assert malformed.status_code == 400
    assert malformed.json()["detail"] == "invalid start: expected YYYY-MM-DD"

    # Same validation on the sibling usage endpoints.
    assert (
        await client.get(
            "/api/usage/cost", params={"start": _iso(1), "end": _iso(5)}, headers=auth
        )
    ).status_code == 400
    assert (
        await client.get(
            "/api/usage/stats", params={"start": _iso(1), "end": _iso(5)}, headers=auth
        )
    ).status_code == 400


@pytest.mark.asyncio
async def test_usage_cost_accepts_explicit_range(usage_client):
    client, auth, owner_id, _other = usage_client
    await _seed_usage(owner_id)

    response = await client.get(
        "/api/usage/cost", params={"start": _iso(4), "end": _iso(1)}, headers=auth
    )
    assert response.status_code == 200
    body = response.json()
    assert body["start"] == _iso(4)
    assert body["end"] == _iso(1)
    assert body["days"] == 4
    assert body["total"]["estimated_cost"] == pytest.approx(0.0008)
    assert body["total"]["cost_status"] == "partial"
    assert body["total"]["unpriced_model_names"] == ["free-model"]


@pytest.mark.asyncio
async def test_stats_by_model_aggregates_tokens_and_cost(usage_client):
    client, auth, owner_id, _other = usage_client
    await _seed_usage(owner_id)

    response = await client.get(
        "/api/usage/stats",
        params={"dimension": "model", "start": _iso(4), "end": _iso(1)},
        headers=auth,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["dimension"] == "model"
    assert body["days"] == 4
    assert [item["key"] for item in body["items"]] == ["priced-model", "free-model"]

    priced, free = body["items"]
    assert priced["request_count"] == 1
    assert (priced["prompt_tokens"], priced["completion_tokens"]) == (200, 100)
    assert priced["total_tokens"] == 300
    assert priced["cost_status"] == "priced"
    assert priced["currency"] == "CNY"
    assert priced["estimated_cost"] == pytest.approx(0.0008)

    assert free["total_tokens"] == 15
    assert free["cost_status"] == "unpriced"
    assert free["estimated_cost"] is None
    assert free["currency"] is None

    assert body["total"]["total_tokens"] == 315
    assert body["total"]["request_count"] == 2
    assert body["total"]["cost_status"] == "partial"
    assert body["total"]["estimated_cost"] == pytest.approx(0.0008)
    assert body["total"]["unpriced_total_tokens"] == 15


@pytest.mark.asyncio
async def test_stats_by_session_type_folds_rows_and_keeps_cost_honest(usage_client):
    client, auth, owner_id, _other = usage_client
    await _seed_usage(owner_id)

    response = await client.get(
        "/api/usage/stats",
        params={"dimension": "session_type", "start": _iso(4), "end": _iso(1)},
        headers=auth,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["dimension"] == "session_type"
    assert [item["key"] for item in body["items"]] == ["chat"]

    chat = body["items"][0]
    assert chat["request_count"] == 2
    assert chat["total_tokens"] == 315
    assert chat["cost_status"] == "partial"
    assert chat["priced_models"] == 1
    assert chat["unpriced_models"] == 1
    assert chat["unpriced_total_tokens"] == 15
    assert chat["estimated_cost"] == pytest.approx(0.0008)
    assert body["total"]["total_tokens"] == 315


@pytest.mark.asyncio
async def test_stats_empty_window_returns_no_rows_and_no_invented_cost(usage_client):
    client, auth, owner_id, _other = usage_client
    await _seed_usage(owner_id)

    response = await client.get(
        "/api/usage/stats",
        params={"dimension": "model", "start": _iso(200), "end": _iso(100)},
        headers=auth,
    )
    assert response.status_code == 200
    body = response.json()
    assert body["items"] == []
    assert body["total"]["total_tokens"] == 0
    assert body["total"]["request_count"] == 0
    assert body["total"]["cost_status"] == "none"
    assert body["total"]["estimated_cost"] is None


@pytest.mark.asyncio
async def test_stats_rejects_unknown_dimension(usage_client):
    client, auth, owner_id, _other = usage_client
    response = await client.get(
        "/api/usage/stats", params={"dimension": "provider"}, headers=auth
    )
    assert response.status_code == 422


@pytest.mark.asyncio
async def test_stats_is_scoped_to_the_owner(usage_client):
    client, auth, owner_id, other_id = usage_client
    await _seed_usage(owner_id)
    await database.execute(
        "INSERT INTO llm_usage "
        "(session_type, model_name, prompt_tokens, completion_tokens, total_tokens, user_id, created_at) "
        "VALUES ('chat', 'leak-model', 999, 999, 1998, ?, ?)",
        (other_id, _stamp(1)),
    )

    response = await client.get(
        "/api/usage/stats", params={"dimension": "model", "days": 7}, headers=auth
    )
    assert response.status_code == 200
    keys = [item["key"] for item in response.json()["items"]]
    assert "leak-model" not in keys
