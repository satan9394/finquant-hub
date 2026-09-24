"""Owner-scoped telemetry and cache-savings aggregation for /api/usage/stats."""

import hashlib
from datetime import datetime, timezone

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app import config, database
from app.main import app


@pytest_asyncio.fixture
async def telemetry_client(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "DB_PATH", tmp_path / "usage-telemetry-stats.db")
    monkeypatch.setattr(config, "LOCAL_ONLY_MODE", False)
    monkeypatch.setattr(config, "SCHEDULER_ENABLED", False)
    async with app.router.lifespan_context(app):
        owner_id = await database.execute(
            "INSERT INTO users (email, is_admin) VALUES ('usage-telemetry@test.local', 1)"
        )
        other_id = await database.execute(
            "INSERT INTO users (email) VALUES ('usage-telemetry-other@test.local')"
        )
        await database.claim_unowned_data(owner_id)
        token = "usage-telemetry-owner-token"
        await database.execute(
            "INSERT INTO sessions (user_id, token_hash, expires_at) "
            "VALUES (?, ?, datetime('now', '+1 day'))",
            (owner_id, hashlib.sha256(token.encode()).hexdigest()),
        )
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            yield client, {"Cookie": f"{config.AUTH_COOKIE_NAME}={token}"}, owner_id, other_id


def _today() -> str:
    return datetime.now(timezone.utc).date().isoformat()


async def _insert_usage(
    *,
    owner_id: int,
    model: str,
    prompt: int,
    cached: int,
    speed: float | None,
    ttft: int | None,
    session_type: str = "research",
):
    await database.execute(
        "INSERT INTO llm_usage "
        "(session_type, model_name, prompt_tokens, completion_tokens, total_tokens, cached_tokens, "
        "tokens_per_second, ttft_ms, user_id, created_at) "
        "VALUES (?, ?, ?, 10, ?, ?, ?, ?, ?, ?)",
        (session_type, model, prompt, prompt + 10, cached, speed, ttft, owner_id, f"{_today()} 12:00:00"),
    )


async def _insert_price(*, owner_id: int, model: str, input_price: float, currency: str = "CNY"):
    await database.execute(
        "INSERT INTO model_pricing (user_id, model_name, input_per_1m, output_per_1m, currency) "
        "VALUES (?, ?, ?, 3.0, ?)",
        (owner_id, model, input_price, currency),
    )


@pytest.mark.asyncio
async def test_stats_aggregate_measured_metrics_and_cache_savings_by_recorded_prices(telemetry_client):
    client, auth, owner_id, other_id = telemetry_client
    await _insert_price(owner_id=owner_id, model="model-a", input_price=2.0)
    await _insert_price(owner_id=owner_id, model="model-b", input_price=4.0)
    await _insert_usage(owner_id=owner_id, model="model-a", prompt=1000, cached=500, speed=10, ttft=200)
    await _insert_usage(owner_id=owner_id, model="model-a", prompt=1000, cached=500, speed=30, ttft=None)
    await _insert_usage(owner_id=owner_id, model="model-b", prompt=1000, cached=250, speed=0, ttft=400)
    await _insert_usage(owner_id=other_id, model="model-a", prompt=5000, cached=5000, speed=500, ttft=1)

    response = await client.get("/api/usage/stats", params={"dimension": "model", "days": 1}, headers=auth)

    assert response.status_code == 200
    body = response.json()
    assert body["efficiency"] == {
        "avg_speed_tps": 20.0,
        "avg_ttft_ms": 300,
        "overall_cache_hit_rate": pytest.approx(1250 * 100 / 3000),
        "total_saved_cost": pytest.approx(0.0027),
        "currency": "CNY",
    }
    by_model = {item["key"]: item for item in body["items"]}
    assert by_model["model-a"]["avg_speed_tps"] == 20.0
    assert by_model["model-a"]["avg_ttft_ms"] == 200
    assert by_model["model-a"]["cached_tokens"] == 1000
    assert by_model["model-a"]["cache_hit_rate"] == 50.0
    assert by_model["model-b"]["avg_speed_tps"] is None


@pytest.mark.asyncio
async def test_session_dimension_folds_metric_means_using_sample_counts(telemetry_client):
    client, auth, owner_id, _other_id = telemetry_client
    await _insert_price(owner_id=owner_id, model="model-a", input_price=2.0)
    await _insert_price(owner_id=owner_id, model="model-b", input_price=4.0)
    await _insert_usage(owner_id=owner_id, model="model-a", prompt=1000, cached=500, speed=10, ttft=200)
    await _insert_usage(owner_id=owner_id, model="model-a", prompt=1000, cached=500, speed=30, ttft=None)
    await _insert_usage(owner_id=owner_id, model="model-b", prompt=1000, cached=250, speed=0, ttft=400)

    response = await client.get("/api/usage/stats", params={"dimension": "session_type", "days": 1}, headers=auth)

    assert response.status_code == 200
    item = response.json()["items"][0]
    assert item["avg_speed_tps"] == 20.0
    assert item["avg_ttft_ms"] == 300
    assert item["cached_tokens"] == 1250
    assert item["cache_hit_rate"] == pytest.approx(1250 * 100 / 3000)


@pytest.mark.asyncio
async def test_unpriced_or_mixed_currency_cache_never_becomes_a_fabricated_total(telemetry_client):
    client, auth, owner_id, _other_id = telemetry_client
    await _insert_price(owner_id=owner_id, model="model-cny", input_price=2.0, currency="CNY")
    await _insert_price(owner_id=owner_id, model="model-usd", input_price=1.0, currency="USD")
    await _insert_usage(owner_id=owner_id, model="model-cny", prompt=100, cached=50, speed=None, ttft=None)
    await _insert_usage(owner_id=owner_id, model="model-usd", prompt=100, cached=50, speed=None, ttft=None)
    await _insert_usage(
        owner_id=owner_id, model="unpriced", prompt=100, cached=25, speed=None, ttft=None, session_type="chat"
    )

    response = await client.get("/api/usage/stats", params={"dimension": "model", "days": 1}, headers=auth)

    assert response.status_code == 200
    efficiency = response.json()["efficiency"]
    assert efficiency["total_saved_cost"] is None
    assert efficiency["currency"] == "UNAVAILABLE"

    mixed_response = await client.get(
        "/api/usage/stats",
        params={"dimension": "model", "days": 1, "session_type": "research"},
        headers=auth,
    )
    assert mixed_response.status_code == 200
    mixed_efficiency = mixed_response.json()["efficiency"]
    assert mixed_efficiency["total_saved_cost"] is None
    assert mixed_efficiency["currency"] == "MIXED"


@pytest.mark.asyncio
async def test_empty_and_zero_denominator_windows_keep_efficiency_unknown(telemetry_client):
    client, auth, owner_id, _other_id = telemetry_client
    await _insert_usage(owner_id=owner_id, model="zero", prompt=0, cached=0, speed=0, ttft=None)

    populated = await client.get("/api/usage/stats", params={"dimension": "model", "days": 1}, headers=auth)
    assert populated.status_code == 200
    populated_metrics = populated.json()["efficiency"]
    assert populated_metrics["avg_speed_tps"] is None
    assert populated_metrics["avg_ttft_ms"] is None
    assert populated_metrics["overall_cache_hit_rate"] is None
    assert populated_metrics["total_saved_cost"] == 0.0
    assert populated_metrics["currency"] == "N/A"

    empty = await client.get(
        "/api/usage/stats", params={"dimension": "model", "start": "2020-01-01", "end": "2020-01-02"}, headers=auth
    )
    assert empty.status_code == 200
    assert empty.json()["efficiency"] == {
        "avg_speed_tps": None,
        "avg_ttft_ms": None,
        "overall_cache_hit_rate": None,
        "total_saved_cost": None,
        "currency": "N/A",
    }
