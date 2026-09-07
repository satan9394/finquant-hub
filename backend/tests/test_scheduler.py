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
    await database.execute("INSERT INTO users (id, email, is_admin) VALUES (1, 'scheduler@test.local', 1)")
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
        return [(1, "sh600519", "贵州茅台"), (1, "usAAPL", "Apple Inc.")]

    async def fake_research(ticker, company_name, model_id=None, *, user_id):
        calls.append((ticker, company_name, model_id, user_id))
        yield "agent_started", {}
        yield "done", {"ticker": ticker}

    monkeypatch.setattr(scheduler, "_load_daily_targets", fake_targets)
    monkeypatch.setattr(scheduler, "run_research", fake_research)

    await scheduler.run_post_market_analysis()

    assert calls == [
        ("sh600519", "贵州茅台", None, 1),
        ("usAAPL", "Apple Inc.", None, 1),
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
        return [(1, f"ticker-{index}", f"Company {index}") for index in range(5)]

    async def fake_research(ticker, company_name, model_id=None, *, user_id):
        nonlocal active, peak
        calls.append((ticker, company_name, model_id, user_id))
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

    assert [ticker for ticker, _, _, _ in calls] == ["ticker-0", "ticker-1", "ticker-2"]
    assert peak == 2


@pytest.mark.asyncio
async def test_post_market_analysis_persists_failed_runs(monkeypatch):
    async def fake_targets():
        return [(1, "usAAPL", "Apple Inc.")]

    async def fake_research(ticker, company_name, model_id=None, *, user_id):
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

    async def fake_market_review(review_market, user_id):
        calls.append(("market_review", review_market, user_id))

    market = object()
    monkeypatch.setattr(scheduler, "scan_enabled_rules", fail_alerts)
    monkeypatch.setattr(scheduler, "run_scheduled_market_review", fake_market_review)
    monkeypatch.setattr(scheduler, "run_post_market_analysis", fake_research)

    await scheduler.run_scheduled_cycle(market)

    assert calls[0][0] == "alerts"
    assert calls[0][1] is market
    assert calls[1] == ("market_review", market, 1)
    assert calls[2] == ("research",)


async def _insert_scheduled_job_and_run() -> tuple[int, int]:
    """插一条 scheduled job + running run（A7 原子性回归用最小列）。"""
    job_id = await database.execute(
        "INSERT INTO scheduled_research_jobs (name, ticker, company_name, cron_expr, user_id) "
        "VALUES ('job', 'usAAPL', 'Apple Inc.', '0 18 * * *', 1)"
    )
    run_id = await database.execute(
        "INSERT INTO scheduled_research_runs (user_id, job_id, run_key, attempt, status, started_at) "
        "VALUES (1, ?, ?, 1, 'running', '2026-09-06 10:00:00')",
        (job_id, "a" * 64),
    )
    return int(job_id), int(run_id)


@pytest.mark.asyncio
async def test_scheduled_run_report_insert_and_backfill_rollback_together(monkeypatch):
    """A7：report INSERT 与 run.report_id 回填之间抛异常 → 两写都回滚（无半链接）。

    BACKLOG-034：此前两写各自隐式提交，回填失败会留下"报告存在但 run 无
    report_id"的不完整记录；包进 exclusive_transaction 后异常统一回滚。
    """
    _, run_id = await _insert_scheduled_job_and_run()
    real_execute = database.execute
    calls = {"n": 0}

    async def failing_execute(sql, params=()):
        calls["n"] += 1
        if calls["n"] == 2:  # 第二次 execute = run.report_id 回填 → 模拟两写之间崩溃
            raise RuntimeError("crash between report insert and backfill")
        return await real_execute(sql, params)

    monkeypatch.setattr(database, "execute", failing_execute)

    with pytest.raises(RuntimeError, match="crash between report insert and backfill"):
        await scheduler._run_and_persist_target(
            "usAAPL", "Apple Inc.", 1, scheduled_run_id=run_id,
        )

    assert await database.query_one("SELECT COUNT(*) AS n FROM research_reports") == {"n": 0}
    run = await database.query_one(
        "SELECT report_id FROM scheduled_research_runs WHERE id=? AND user_id=?", (run_id, 1)
    )
    assert run["report_id"] is None


@pytest.mark.asyncio
async def test_scheduled_run_report_insert_and_backfill_commit_together(monkeypatch):
    """A7：正常路径 → 报告与 run.report_id 在同一事务统一提交、同步落盘。"""
    _, run_id = await _insert_scheduled_job_and_run()

    async def fake_research(ticker, company_name, model_id=None, *, user_id):
        yield "agent_started", {}
        yield "done", {"ticker": ticker}

    monkeypatch.setattr(scheduler, "run_research", fake_research)

    report_id = await scheduler._run_and_persist_target(
        "usAAPL", "Apple Inc.", 1, scheduled_run_id=run_id,
    )

    report = await database.query_one(
        "SELECT id, status FROM research_reports WHERE id=?", (report_id,)
    )
    assert report["status"] == "completed"
    run = await database.query_one(
        "SELECT report_id, evidence_status FROM scheduled_research_runs WHERE id=? AND user_id=?",
        (run_id, 1),
    )
    assert run["report_id"] == report_id
