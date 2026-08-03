from datetime import datetime

import pytest
import pytest_asyncio

from app import config, database
from app.services import scheduler
from app.services.cron import CronExpression
from app.services.research_jobs import (
    create_research_job,
    due_research_jobs,
    get_research_job,
    update_research_job,
)


@pytest_asyncio.fixture(autouse=True)
async def job_db(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "DB_PATH", tmp_path / "jobs.db")
    await database.init_db()
    await database.execute("INSERT INTO users (id, email, is_admin) VALUES (1, 'jobs@test.local', 1)")
    try:
        yield
    finally:
        await database.close_db()


def test_five_field_cron_supports_lists_ranges_steps_and_standard_day_or_semantics():
    expression = CronExpression.parse("*/15 9-10 1 * 1")
    assert expression.matches(datetime(2026, 6, 1, 9, 30))
    assert expression.matches(datetime(2026, 6, 8, 10, 45))
    assert expression.matches(datetime(2026, 7, 1, 9, 0))
    assert not expression.matches(datetime(2026, 6, 2, 9, 30))
    assert expression.next_after(datetime(2026, 6, 1, 9, 31)) == datetime(2026, 6, 1, 9, 45)


@pytest.mark.parametrize("value", ["0 0 * *", "60 0 * * *", "*/0 0 * * *", "x 0 * * *"])
def test_invalid_cron_is_rejected(value):
    with pytest.raises(ValueError):
        CronExpression.parse(value)


@pytest.mark.asyncio
async def test_job_store_recalculates_next_run_and_finds_due_jobs(monkeypatch):
    monkeypatch.setattr("app.services.research_jobs.datetime", type("Clock", (), {
        "now": staticmethod(lambda: datetime(2026, 8, 1, 8, 0)),
    }))
    job = await create_research_job(
        name="晨报", ticker="sh600519", company_name="贵州茅台",
        cron_expr="30 8 * * 1-5", model_id=None, is_enabled=True,
        user_id=1,
    )
    assert job["next_run_at"] == "2026-08-03 08:30:00"
    assert await due_research_jobs(datetime(2026, 8, 3, 8, 29)) == []
    assert [item["id"] for item in await due_research_jobs(datetime(2026, 8, 3, 8, 30))] == [job["id"]]

    disabled = await update_research_job(job["id"], {"is_enabled": False}, 1)
    assert disabled["next_run_at"] is None


@pytest.mark.asyncio
async def test_scheduler_claims_job_once_and_persists_completion(monkeypatch):
    job = await create_research_job(
        name="测试", ticker="usAAPL", company_name="Apple",
        cron_expr="0 8 * * *", model_id=7, is_enabled=True,
        user_id=1,
    )
    calls = []

    async def run_target(ticker, company_name, user_id, model_id=None):
        calls.append((ticker, company_name, user_id, model_id))

    monkeypatch.setattr(scheduler, "_run_and_persist_target", run_target)
    assert await scheduler.run_research_job(job["id"], 1) is True
    saved = await get_research_job(job["id"], 1)
    assert calls == [("usAAPL", "Apple", 1, 7)]
    assert saved["last_status"] == "completed"
    assert saved["last_run_at"] is not None


@pytest.mark.asyncio
async def test_scheduler_persists_job_failure(monkeypatch):
    job = await create_research_job(
        name="失败", ticker="usAAPL", company_name="Apple",
        cron_expr="0 8 * * *", model_id=None, is_enabled=True,
        user_id=1,
    )

    async def fail(*args, **kwargs):
        raise RuntimeError("provider down")

    monkeypatch.setattr(scheduler, "_run_and_persist_target", fail)
    assert await scheduler.run_research_job(job["id"], 1) is True
    saved = await get_research_job(job["id"], 1)
    assert saved["last_status"] == "failed"
    assert saved["last_error"] == "provider down"
