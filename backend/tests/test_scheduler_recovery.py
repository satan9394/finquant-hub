from __future__ import annotations

import asyncio
from datetime import datetime, timedelta

import pytest
import pytest_asyncio

from app import config, database
from app.services import research_jobs, scheduler
from app.services.research_jobs import (
    claim_research_job,
    create_research_job,
    finish_research_run,
    get_research_job,
    heartbeat_research_run,
    list_research_jobs,
    mark_job_finished,
    mark_job_running,
    update_research_job,
)


@pytest_asyncio.fixture(autouse=True)
async def scheduler_db(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "DB_PATH", tmp_path / "scheduler-recovery.db")
    await database.init_db()
    await database.execute("INSERT INTO users (id, email, is_admin) VALUES (1, 'scheduler@fixture.local', 1)")
    try:
        yield
    finally:
        await database.close_db()


async def _job(**updates):
    values = {
        "name": "fixture", "ticker": "usAAPL", "company_name": "Apple",
        "cron_expr": "0 8 * * *", "model_id": None, "is_enabled": True, "user_id": 1,
    }
    values.update(updates)
    return await create_research_job(**values)


def test_scheduler_time_bounds_and_research_event_payload_helpers():
    now = datetime(2026, 8, 30, 23, 59, 59)
    assert scheduler.seconds_until_next_run(now, hour=99, minute=-1) == 82_801
    assert research_jobs._idempotency_key("A" * 64) == "a" * 64
    with pytest.raises(ValueError, match="required"):
        research_jobs._idempotency_key("   ")
    safe = research_jobs._safe_event_payload({"error": "x" * 600, "secret": "drop", "status": "failed"})
    assert safe == {"error": "x" * 500, "status": "failed"}


@pytest.mark.asyncio
async def test_daily_targets_are_reloaded_and_empty_run_is_skipped():
    await database.execute(
        "INSERT INTO research_reports (ticker, company_name, report_data, agent_results, status, user_id) "
        "VALUES ('usAAPL', 'Apple', '{}', '{}', 'completed', 1)"
    )
    await database.execute(
        "INSERT INTO research_reports (ticker, company_name, report_data, agent_results, status, user_id) "
        "VALUES ('usAAPL', 'Apple Inc.', '{}', '{}', 'failed', 1)"
    )
    targets = await scheduler._load_daily_targets()
    assert targets == [(1, "usAAPL", "Apple Inc.")]

    await database.execute("DELETE FROM research_reports")
    await scheduler.run_post_market_analysis()
    assert await database.query_one("SELECT COUNT(*) AS n FROM research_reports") == {"n": 0}


@pytest.mark.asyncio
async def test_persist_target_marks_early_stream_end_failed(monkeypatch):
    async def interrupted(*_args, **_kwargs):
        yield "agent_started", {"role_key": "fixture"}

    monkeypatch.setattr(scheduler, "run_research", interrupted)
    with pytest.raises(RuntimeError, match="完成前中断"):
        await scheduler._run_and_persist_target("usAAPL", "Apple", 1)
    report = await database.query_one("SELECT status FROM research_reports")
    assert report == {"status": "failed"}
    events = await database.query_all("SELECT event_type FROM research_events ORDER BY id")
    assert [event["event_type"] for event in events] == ["agent_started", "error"]


@pytest.mark.asyncio
async def test_persist_target_marks_exception_and_cancellation_failed(monkeypatch):
    async def crashes(*_args, **_kwargs):
        raise RuntimeError("fixture crash")
        yield

    monkeypatch.setattr(scheduler, "run_research", crashes)
    with pytest.raises(RuntimeError, match="fixture crash"):
        await scheduler._run_and_persist_target("usAAPL", "Apple", 1)

    async def cancelled(*_args, **_kwargs):
        raise asyncio.CancelledError
        yield

    monkeypatch.setattr(scheduler, "run_research", cancelled)
    with pytest.raises(asyncio.CancelledError):
        await scheduler._run_and_persist_target("usMSFT", "Microsoft", 1)
    statuses = await database.query_all("SELECT status FROM research_reports ORDER BY id")
    assert [row["status"] for row in statuses] == ["failed", "failed"]


@pytest.mark.asyncio
async def test_scheduled_cycle_isolates_all_three_failures(monkeypatch):
    calls = []

    async def fail(name):
        calls.append(name)
        raise RuntimeError(name)

    monkeypatch.setattr(scheduler, "scan_enabled_rules", lambda *_args, **_kwargs: fail("alerts"))
    monkeypatch.setattr(scheduler, "run_scheduled_market_review", lambda *_args: fail("review"))
    monkeypatch.setattr(scheduler, "run_post_market_analysis", lambda: fail("research"))
    await scheduler.run_scheduled_cycle(object())
    assert calls == ["alerts", "review", "research"]


@pytest.mark.asyncio
async def test_heartbeat_loop_stops_when_lease_is_lost(monkeypatch):
    calls = []

    async def no_sleep(_seconds):
        return None

    async def lost(*args, **kwargs):
        calls.append((args, kwargs))
        return False

    monkeypatch.setattr(scheduler.asyncio, "sleep", no_sleep)
    monkeypatch.setattr(scheduler, "heartbeat_research_run", lost)
    await scheduler._heartbeat_lease(4, 1, "worker")
    assert len(calls) == 1


@pytest.mark.asyncio
async def test_scheduler_loop_runs_due_and_daily_once_before_cancel(monkeypatch):
    sleeps = 0
    calls = []

    async def sleep(_delay):
        nonlocal sleeps
        sleeps += 1
        if sleeps == 2:
            raise asyncio.CancelledError

    async def due():
        calls.append("due")
        raise RuntimeError("fixture poll failure")

    async def daily(_market):
        calls.append("daily")

    monkeypatch.setattr(scheduler, "seconds_until_next_run", lambda: 0.0)
    monkeypatch.setattr(scheduler.asyncio, "sleep", sleep)
    monkeypatch.setattr(scheduler, "run_due_research_jobs", due)
    monkeypatch.setattr(scheduler, "run_scheduled_cycle", daily)
    with pytest.raises(asyncio.CancelledError):
        await scheduler.scheduler_loop(object())
    assert calls == ["due", "daily"]


@pytest.mark.asyncio
async def test_job_validation_lookup_update_and_legacy_status_helpers():
    assert await update_research_job(999, {"name": "missing"}, 1) is None
    assert await mark_job_running(999, 1) is False
    assert await scheduler.run_research_job(999, 1) is False

    disabled = await _job(is_enabled=False)
    assert disabled["next_run_at"] is None
    assert [item["id"] for item in await list_research_jobs(1)] == [disabled["id"]]
    enabled = await update_research_job(disabled["id"], {"is_enabled": True, "name": "enabled"}, 1)
    assert enabled["name"] == "enabled"
    assert enabled["next_run_at"] is not None
    assert await mark_job_running(enabled["id"], 1, datetime(2026, 8, 30, 8)) is True
    assert await mark_job_running(enabled["id"], 1, datetime(2026, 8, 30, 8)) is False
    await mark_job_finished(enabled["id"], 1, error="fixture")
    assert (await get_research_job(enabled["id"], 1))["last_status"] == "failed"
    await mark_job_finished(enabled["id"], 1)
    assert (await get_research_job(enabled["id"], 1))["last_status"] == "completed"


@pytest.mark.asyncio
async def test_claim_heartbeat_and_finish_reject_invalid_or_missing_runs():
    job = await _job()
    for owner in ("", "x" * 101):
        with pytest.raises(ValueError, match="lease_owner"):
            await claim_research_job(job["id"], 1, idempotency_key="fixture", lease_owner=owner)
    assert await claim_research_job(999, 1, idempotency_key="fixture", lease_owner="worker") is None
    assert await heartbeat_research_run(999, 1, lease_owner="worker") is False
    with pytest.raises(ValueError, match="invalid terminal"):
        await finish_research_run(999, 1, lease_owner="worker", status="running")
    assert await finish_research_run(999, 1, lease_owner="worker", status="failed") is False

    now = datetime(2026, 8, 30, 8)
    run = await claim_research_job(
        job["id"], 1, idempotency_key="fixture", lease_owner="worker", now=now, lease_seconds=5,
    )
    assert await heartbeat_research_run(
        run["id"], 1, lease_owner="worker", now=now + timedelta(seconds=6),
    ) is False
    assert await finish_research_run(run["id"], 1, lease_owner="wrong", status="failed") is False
