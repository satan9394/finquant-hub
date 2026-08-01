from datetime import date

import pytest
import pytest_asyncio

from app import config, database
from app.services import market_review
from app.services.llm_client import LLMError


@pytest_asyncio.fixture(autouse=True)
async def review_db(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "DB_PATH", tmp_path / "market-review.db")
    monkeypatch.setattr(config, "EXTERNAL_SENDERS_ENABLED", False)
    await database.init_db()
    try:
        yield
    finally:
        await database.close_db()


class FakeClient:
    async def chat(self, messages):
        assert "缺失或不可验证" in messages[0]["content"]
        return (
            "```json\n{\"summary\":\"A股领涨，美股待开盘\","
            "\"market_reviews\":[],\"sector_mainline\":[{\"name\":\"AI\","
            "\"evidence\":\"concept rank\"}],\"cross_market\":\"unknown\","
            "\"risk_notice\":\"仅供研究\"}\n```",
            123,
        )


@pytest.mark.asyncio
async def test_create_market_review_persists_snapshot_report_and_notification(monkeypatch):
    async def snapshot(_market, markets, trading_date):
        return {"markets": markets, "trading_date": trading_date.isoformat(), "data": {}}

    async def fake_client(model_id):
        return FakeClient(), {"id": 7, "name": "Review Model"}

    monkeypatch.setattr(market_review, "collect_market_snapshot", snapshot)
    monkeypatch.setattr(market_review.model_router, "get_client", fake_client)

    result = await market_review.create_market_review(
        object(), ["cn", "hk", "cn"], date(2026, 7, 31), model_id=7
    )

    assert result["markets"] == ["cn", "hk"]
    assert result["status"] == "completed"
    assert result["report"]["summary"] == "A股领涨，美股待开盘"
    assert result["token_count"] == 123
    assert result["delivery"] == {"enabled": False, "results": []}
    notification = await database.query_one("SELECT event_type, source_id FROM notifications")
    assert notification == {"event_type": "market_review.completed", "source_id": str(result["id"])}


@pytest.mark.asyncio
async def test_review_failure_is_persisted(monkeypatch):
    async def snapshot(_market, markets, trading_date):
        return {"markets": markets, "trading_date": trading_date.isoformat()}

    async def fail_client(model_id):
        raise LLMError("missing key")

    monkeypatch.setattr(market_review, "collect_market_snapshot", snapshot)
    monkeypatch.setattr(market_review.model_router, "get_client", fail_client)

    with pytest.raises(LLMError, match="missing key"):
        await market_review.create_market_review(object(), ["us"], date(2026, 7, 31))
    row = await database.query_one("SELECT status, error_message FROM market_reviews")
    assert row == {"status": "failed", "error_message": "missing key"}


@pytest.mark.asyncio
async def test_scheduled_review_is_idempotent(monkeypatch):
    today = date.today().isoformat()
    review_id = await database.execute(
        "INSERT INTO market_reviews "
        "(markets_json, trading_date, snapshot_json, report_json, status) VALUES (?, ?, '{}', '{}', 'completed')",
        ('["cn", "hk", "us"]', today),
    )

    async def unexpected(*args, **kwargs):
        raise AssertionError("completed review must be reused")

    monkeypatch.setattr(market_review, "create_market_review", unexpected)
    result = await market_review.run_scheduled_market_review(object())
    assert result["id"] == review_id


def test_report_parser_falls_back_without_inventing_structure():
    parsed = market_review._parse_report("plain model response")
    assert parsed["summary"] == "plain model response"
    assert parsed["cross_market"] == "unknown"
    assert parsed["parse_status"] == "fallback"


def test_markets_are_validated():
    with pytest.raises(ValueError, match="markets"):
        market_review._normalize_markets([])
    with pytest.raises(ValueError, match="markets"):
        market_review._normalize_markets(["jp"])
