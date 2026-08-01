import asyncio
from datetime import datetime

import pytest
import pytest_asyncio

from app import config, database
from app.services import scheduler


@pytest_asyncio.fixture(autouse=True)
async def scheduler_db(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "DB_PATH", tmp_path / "scheduler.db")
    await database.init_db()
    try:
        yield
    finally:
        await database.close_db()


def test_seconds_until_next_run_before_close():
    now = datetime(2026, 7, 29, 17, 30, 15)

    assert scheduler.seconds_until_next_run(now) == 1785


def test_seconds_until_next_run_after_close():
    now = datetime(2026, 7, 29, 18, 0, 0)

    assert scheduler.seconds_until_next_run(now) == 24 * 60 * 60


def test_seconds_until_next_run_supports_configurable_time():
    now = datetime(2026, 7, 29, 16, 30, 0)

    assert scheduler.seconds_until_next_run(now, hour=17, minute=15) == 45 * 60


def test_scheduler_integer_settings_are_bounded(monkeypatch):
    monkeypatch.setenv("SCHEDULER_CONCURRENCY", "999")
    monkeypatch.setenv("SCHEDULER_MAX_TARGETS", "0")

    assert config._bounded_int("SCHEDULER_CONCURRENCY", 2, 1, 20) == 20
    assert config._bounded_int("SCHEDULER_MAX_TARGETS", 20, 1, 1000) == 1


@pytest.mark.asyncio
async def test_post_market_analysis_reloads_targets_and_consumes_research(monkeypatch):
    calls = []

    async def fake_targets():
        return [("sh600519", "贵州茅台"), ("usAAPL", "Apple Inc.")]

    async def fake_research(ticker, company_name, model_id=None):
        calls.append((ticker, company_name, model_id))
        yield "agent_started", {}
        yield "done", {"ticker": ticker}

    monkeypatch.setattr(scheduler, "_load_daily_targets", fake_targets)
    monkeypatch.setattr(scheduler, "run_research", fake_research)

    await scheduler.run_post_market_analysis()

    assert calls == [
        ("sh600519", "贵州茅台", None),
        ("usAAPL", "Apple Inc.", None),
    ]
    reports = await database.query_all(
        "SELECT id, ticker, status, report_data FROM research_reports ORDER BY id"
    )
    assert [(item["ticker"], item["status"]) for item in reports] == [
        ("sh600519", "completed"),
        ("usAAPL", "completed"),
    ]
    events = await database.query_all(
        "SELECT research_id, event_type, payload FROM research_events ORDER BY id"
    )
    assert [event["event_type"] for event in events].count("agent_started") == 2
    assert [event["event_type"] for event in events].count("done") == 2
    assert all('"report_id"' in event["payload"] for event in events if event["event_type"] == "done")
    notifications = await database.query_all(
        "SELECT event_type, source_id FROM notifications ORDER BY id"
    )
    assert [item["event_type"] for item in notifications] == [
        "research.completed",
        "research.completed",
    ]


@pytest.mark.asyncio
async def test_post_market_analysis_limits_targets_and_concurrency(monkeypatch):
    active = 0
    peak = 0
    calls = []

    async def fake_targets():
        return [(f"ticker-{index}", f"Company {index}") for index in range(5)]

    async def fake_research(ticker, company_name, model_id=None):
        nonlocal active, peak
        calls.append((ticker, company_name, model_id))
        active += 1
        peak = max(peak, active)
        try:
            await asyncio.sleep(0)
            yield "done", {"ticker": ticker}
        finally:
            active -= 1

    monkeypatch.setattr(scheduler, "_load_daily_targets", fake_targets)
    monkeypatch.setattr(scheduler, "run_research", fake_research)

    await scheduler.run_post_market_analysis(max_targets=3, concurrency=2)

    assert [ticker for ticker, _, _ in calls] == ["ticker-0", "ticker-1", "ticker-2"]
    assert peak == 2


@pytest.mark.asyncio
async def test_post_market_analysis_persists_failed_runs(monkeypatch):
    async def fake_targets():
        return [("usAAPL", "Apple Inc.")]

    async def fake_research(ticker, company_name, model_id=None):
        yield "error", {"error": "rate limited"}

    monkeypatch.setattr(scheduler, "_load_daily_targets", fake_targets)
    monkeypatch.setattr(scheduler, "run_research", fake_research)

    await scheduler.run_post_market_analysis()

    report = await database.query_one("SELECT id, status FROM research_reports")
    assert report["status"] == "failed"
    events = await database.query_all(
        "SELECT event_type, payload FROM research_events WHERE research_id=?",
        (report["id"],),
    )
    assert len(events) == 1
    assert events[0]["event_type"] == "error"


@pytest.mark.asyncio
async def test_scheduled_cycle_runs_research_even_when_alert_scan_fails(monkeypatch):
    calls = []

    async def fail_alerts(market, **kwargs):
        calls.append(("alerts", market, kwargs))
        raise RuntimeError("scan failed")

    async def fake_research():
        calls.append(("research",))

    async def fake_market_review(review_market):
        calls.append(("market_review", review_market))

    market = object()
    monkeypatch.setattr(scheduler, "scan_enabled_rules", fail_alerts)
    monkeypatch.setattr(scheduler, "run_scheduled_market_review", fake_market_review)
    monkeypatch.setattr(scheduler, "run_post_market_analysis", fake_research)

    await scheduler.run_scheduled_cycle(market)

    assert calls[0][0] == "alerts"
    assert calls[0][1] is market
    assert calls[1] == ("market_review", market)
    assert calls[2] == ("research",)
