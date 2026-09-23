from __future__ import annotations

import pytest
from pydantic import ValidationError

from app import config, database
from app.main import app
from app.routers.settings import ProductMetricEventInput
from app.services.product_metrics import (
    clear_product_metrics,
    get_product_metrics,
    record_product_metric,
    set_product_metrics_enabled,
)


@pytest.fixture
async def metrics_db(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "DB_PATH", tmp_path / "product-metrics.db")
    await database.init_db()
    owner_id = await database.execute("INSERT INTO users (email) VALUES ('owner@test.local')")
    other_id = await database.execute("INSERT INTO users (email) VALUES ('other@test.local')")
    await database.claim_unowned_data(owner_id)
    try:
        yield owner_id, other_id
    finally:
        await database.close_db()


@pytest.mark.asyncio
async def test_metrics_are_disabled_by_default_owner_scoped_and_clearable(metrics_db) -> None:
    owner_id, other_id = metrics_db
    columns = await database.query_all("PRAGMA table_info(product_metric_events)")
    assert [column["name"] for column in columns] == [
        "id", "user_id", "event_name", "value", "occurred_at",
    ]
    assert (await get_product_metrics(owner_id))["enabled"] is False
    assert await record_product_metric(owner_id, "result_saved") is False
    assert await database.query_one("SELECT COUNT(*) AS n FROM product_metric_events") == {"n": 0}

    await set_product_metrics_enabled(owner_id, True)
    assert await record_product_metric(owner_id, "result_saved") is True
    assert await record_product_metric(owner_id, "workflow_continued") is True
    assert await record_product_metric(owner_id, "repeat_research", value=4) is True
    for value in range(1_000, 11_000, 1_000):
        assert await record_product_metric(owner_id, "first_value", value=value) is True

    owner = await get_product_metrics(owner_id)
    assert owner["events_total"] == 13
    assert owner["counts"] == {
        "result_saved": 1, "workflow_continued": 1,
        "repeat_research": 1, "repeat_research_within_7d": 1,
    }
    assert owner["ttfv"] == {
        "count": 10, "median_ms": 5500.0, "p90_ms": 9000,
        "insufficient_sample": False,
    }
    assert (await get_product_metrics(other_id))["events_total"] == 0
    assert await record_product_metric(other_id, "result_saved") is False

    assert await clear_product_metrics(owner_id) == 13
    assert (await get_product_metrics(owner_id))["events_total"] == 0
    assert (await get_product_metrics(owner_id))["enabled"] is True


@pytest.mark.asyncio
async def test_metric_write_is_best_effort_and_event_contract_rejects_extra_fields(
    metrics_db, monkeypatch,
) -> None:
    owner_id, _ = metrics_db
    await set_product_metrics_enabled(owner_id, True)

    async def fail_query(*args, **kwargs):
        raise RuntimeError("fixture write unavailable")

    monkeypatch.setattr(database, "query_one", fail_query)
    assert await record_product_metric(owner_id, "result_saved") is False

    with pytest.raises(ValueError, match="不支持"):
        await record_product_metric(owner_id, "ticker_viewed")

    with pytest.raises(ValidationError):
        ProductMetricEventInput.model_validate({
            "event_name": "result_saved",
            "ticker": "AAPL",
        })


def test_openapi_exposes_only_local_owner_metric_controls() -> None:
    paths = app.openapi()["paths"]
    assert paths["/api/settings/product-metrics"]["get"]["tags"] == ["settings"]
    assert paths["/api/settings/product-metrics"]["patch"]["tags"] == ["settings"]
    assert paths["/api/settings/product-metrics/events"]["post"]["tags"] == ["settings"]
    assert paths["/api/settings/product-metrics/events"]["delete"]["tags"] == ["settings"]
