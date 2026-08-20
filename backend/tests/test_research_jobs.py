import asyncio
from datetime import datetime, timedelta
import json

import pytest
import pytest_asyncio

from app import config, database
from app.services import scheduler
from app.services.cron import CronExpression
from app.services.research_jobs import (
    claim_research_job,
    create_research_job,
    due_research_jobs,
    finish_research_run,
    get_research_job,
    heartbeat_research_run,
    list_research_runs,
    recover_stale_research_runs,
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

    async def run_target(ticker, company_name, user_id, model_id=None, scheduled_run_id=None):
        calls.append((ticker, company_name, user_id, model_id, scheduled_run_id))

    monkeypatch.setattr(scheduler, "_run_and_persist_target", run_target)
    assert await scheduler.run_research_job(job["id"], 1) is True
    saved = await get_research_job(job["id"], 1)
    assert calls[0][:4] == ("usAAPL", "Apple", 1, 7)
    assert isinstance(calls[0][4], int)
    assert saved["last_status"] == "completed"
    assert saved["last_run_at"] is not None
    run = await database.query_one("SELECT * FROM scheduled_research_runs WHERE job_id=?", (job["id"],))
    assert run["status"] == "completed"


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
    run = await database.query_one("SELECT status, evidence_status, error FROM scheduled_research_runs")
    assert run == {"status": "failed", "evidence_status": "UPSTREAM_ERROR", "error": "provider down"}


@pytest.mark.asyncio
async def test_scheduler_cancellation_is_terminal_and_auditable(monkeypatch):
    job = await create_research_job(
        name="cancel", ticker="usAAPL", company_name="Apple",
        cron_expr="0 8 * * *", model_id=None, is_enabled=True, user_id=1,
    )

    async def cancel(*_args, **_kwargs):
        raise asyncio.CancelledError

    monkeypatch.setattr(scheduler, "_run_and_persist_target", cancel)
    with pytest.raises(asyncio.CancelledError):
        await scheduler.run_research_job(job["id"], 1, "cancel-request")
    history = await list_research_runs(job["id"], 1)
    assert history[0]["status"] == "cancelled"
    assert history[0]["evidence_status"] == "UPSTREAM_ERROR"
    assert [item["event_type"] for item in history[0]["events"]] == ["claimed", "cancelled"]


@pytest.mark.asyncio
async def test_failed_run_retries_and_links_completed_report_memory_evidence_notification(monkeypatch):
    monkeypatch.setattr(config, "MEMORY_CANDIDATE_EXTRACTION_ENABLED", True)
    job = await create_research_job(
        name="linked", ticker="usAAPL", company_name="Apple",
        cron_expr="0 8 * * *", model_id=None, is_enabled=True, user_id=1,
    )
    await database.execute(
        "INSERT INTO evidence_objects "
        "(user_id, evidence_id, kind, data_status, subject_type, subject_id, metric, value_json, "
        "source, retrieved_at, license_scope) VALUES "
        "(1, 'ev_linked_0001', 'observed_fact', 'OK', 'instrument', 'usAAPL', 'price', "
        "'100', 'fixture.market', '2026-08-12T00:00:00Z', 'test-only')"
    )

    attempts = 0

    async def fake_research(ticker, company_name, model_id=None, *, user_id):
        nonlocal attempts
        attempts += 1
        if attempts == 1:
            yield "error", {"error": "fixture upstream failed"}
            return
        yield "done", {"report": {
            "executive_summary": "AI-generated scheduled thesis",
            "risk_analysis": "AI-generated scheduled risk",
            "evidence_ids": ["ev_linked_0001", "ev_cross_owner_missing"],
        }}

    monkeypatch.setattr(scheduler, "run_research", fake_research)
    assert await scheduler.run_research_job(job["id"], 1) is True
    assert await scheduler.run_research_job(job["id"], 1) is True

    runs = await database.query_all(
        "SELECT id, attempt, retry_of_run_id, report_id, status, evidence_status, "
        "evidence_ids_json, memory_record_ids_json FROM scheduled_research_runs ORDER BY id"
    )
    assert len(runs) == 2
    assert runs[0]["attempt"] == 1
    assert runs[1]["attempt"] == 2
    assert runs[1]["retry_of_run_id"] == runs[0]["id"]
    assert [row["status"] for row in runs] == ["failed", "completed"]
    assert json.loads(runs[0]["evidence_ids_json"]) == []
    assert json.loads(runs[1]["evidence_ids_json"]) == ["ev_linked_0001"]
    assert [row["evidence_status"] for row in runs] == ["UPSTREAM_ERROR", "PARTIAL"]
    assert json.loads(runs[0]["memory_record_ids_json"]) == []
    assert len(json.loads(runs[1]["memory_record_ids_json"])) == 2
    reports = await database.query_all("SELECT id, scheduled_run_id, status FROM research_reports ORDER BY id")
    assert [(row["scheduled_run_id"], row["status"]) for row in reports] == [
        (runs[0]["id"], "failed"), (runs[1]["id"], "completed"),
    ]
    assert await database.query_one("SELECT COUNT(*) AS n FROM memory_records") == {"n": 2}
    notifications = await database.query_all("SELECT payload FROM notifications ORDER BY id")
    assert [json.loads(row["payload"])["scheduled_run_id"] for row in notifications] == [
        runs[0]["id"], runs[1]["id"],
    ]


@pytest.mark.asyncio
async def test_run_history_is_owner_scoped_and_preserves_job_lineage():
    job = await create_research_job(
        name="history", ticker="usAAPL", company_name="Apple",
        cron_expr="0 8 * * *", model_id=None, is_enabled=True, user_id=1,
    )
    await database.execute("INSERT INTO users (id, email) VALUES (2, 'other@test.local')")
    await database.execute(
        "INSERT INTO scheduled_research_runs "
        "(user_id, job_id, run_key, attempt, status, started_at) "
        "VALUES (1, ?, ?, 1, 'failed', '2026-08-12 08:00:00')",
        (job["id"], "a" * 64),
    )

    assert len(await list_research_runs(job["id"], 1)) == 1
    with pytest.raises(LookupError):
        await list_research_runs(job["id"], 2)


@pytest.mark.asyncio
async def test_claim_lease_heartbeat_and_event_log_are_owner_scoped_and_idempotent():
    job = await create_research_job(
        name="lease", ticker="usAAPL", company_name="Apple",
        cron_expr="0 8 * * *", model_id=None, is_enabled=True, user_id=1,
    )
    now = datetime(2026, 8, 13, 8, 0)
    claims = await asyncio.gather(*(
        claim_research_job(
            job["id"], 1, idempotency_key="slot-2026-08-13",
            lease_owner=owner, now=now, lease_seconds=60,
        )
        for owner in ("worker-a", "worker-b")
    ))
    claimed = [item for item in claims if item is not None]
    assert len(claimed) == 1
    run = claimed[0]
    assert run["attempt"] == 1
    assert run["lease_owner"] in {"worker-a", "worker-b"}
    assert await heartbeat_research_run(
        run["id"], 1, lease_owner="other-worker", now=now + timedelta(seconds=20),
    ) is False
    assert await heartbeat_research_run(
        run["id"], 1, lease_owner=run["lease_owner"],
        now=now + timedelta(seconds=20), lease_seconds=60,
    ) is True

    history = await list_research_runs(job["id"], 1)
    assert [event["event_type"] for event in history[0]["events"]] == ["claimed", "heartbeat"]
    assert "research" not in json.dumps(history[0]["events"])
    assert await heartbeat_research_run(
        run["id"], 2, lease_owner=run["lease_owner"], now=now,
    ) is False


@pytest.mark.asyncio
async def test_completed_idempotency_replay_does_not_create_a_second_run():
    job = await create_research_job(
        name="replay", ticker="usAAPL", company_name="Apple",
        cron_expr="0 8 * * *", model_id=None, is_enabled=True, user_id=1,
    )
    run = await claim_research_job(
        job["id"], 1, idempotency_key="same-request",
        lease_owner="worker-a", lease_seconds=60,
    )
    assert await finish_research_run(
        run["id"], 1, lease_owner="worker-a", status="completed",
    ) is True
    replay = await claim_research_job(
        job["id"], 1, idempotency_key="same-request",
        lease_owner="worker-b", lease_seconds=60,
    )
    assert replay["id"] == run["id"]
    assert replay["idempotent_replay"] is True
    assert await database.query_one("SELECT COUNT(*) AS n FROM scheduled_research_runs") == {"n": 1}


@pytest.mark.asyncio
async def test_stale_completed_report_is_reconciled_once_without_duplicate_critical_writes():
    job = await create_research_job(
        name="reconcile", ticker="usAAPL", company_name="Apple",
        cron_expr="0 8 * * *", model_id=None, is_enabled=True, user_id=1,
    )
    now = datetime(2026, 8, 13, 8, 0)
    run = await claim_research_job(
        job["id"], 1, idempotency_key="completed-slot",
        lease_owner="worker-dead", now=now, lease_seconds=5,
    )
    report_id = await database.execute(
        "INSERT INTO research_reports "
        "(ticker, company_name, report_data, agent_results, status, user_id, scheduled_run_id) "
        "VALUES ('usAAPL', 'Apple', '{}', '{}', 'completed', 1, ?)",
        (run["id"],),
    )
    memory_id = await database.execute(
        "INSERT INTO memory_records "
        "(user_id, subject_type, subject_id, memory_type, information_kind, content_json, "
        "source_kind, source_id, status, quality_flags_json, created_by) "
        "VALUES (1, 'instrument', 'usAAPL', 'hypothesis', 'AI_INFERENCE', '{}', "
        "'ai', ?, 'candidate', '[]', 'system')",
        (str(report_id),),
    )
    await database.execute(
        "UPDATE scheduled_research_runs SET report_id=?, memory_record_ids_json=? WHERE id=?",
        (report_id, json.dumps([memory_id]), run["id"]),
    )
    path = config.DB_PATH
    await database.close_db()
    await database.init_db()
    assert config.DB_PATH == path

    first = await recover_stale_research_runs(now=now + timedelta(seconds=10))
    second = await recover_stale_research_runs(now=now + timedelta(seconds=20))
    current = await database.query_one(
        "SELECT status, report_id, memory_record_ids_json FROM scheduled_research_runs WHERE id=?",
        (run["id"],),
    )
    assert first == {"reconciled": 1, "retryable": 0}
    assert second == {"reconciled": 0, "retryable": 0}
    assert current == {
        "status": "completed", "report_id": report_id,
        "memory_record_ids_json": json.dumps([memory_id]),
    }
    assert await database.query_one("SELECT COUNT(*) AS n FROM research_reports") == {"n": 1}
    assert await database.query_one("SELECT COUNT(*) AS n FROM memory_records") == {"n": 1}
    events = (await list_research_runs(job["id"], 1))[0]["events"]
    assert [item["event_type"] for item in events] == ["claimed", "recovered", "completed"]


@pytest.mark.asyncio
async def test_stale_incomplete_run_retries_with_same_identity_and_lineage_after_reopen(
    tmp_path, monkeypatch,
):
    job = await create_research_job(
        name="restart", ticker="usAAPL", company_name="Apple",
        cron_expr="0 8 * * *", model_id=None, is_enabled=True, user_id=1,
    )
    now = datetime(2026, 8, 13, 8, 0)
    first = await claim_research_job(
        job["id"], 1, idempotency_key="restart-slot",
        lease_owner="worker-killed", now=now, lease_seconds=5,
    )
    path = config.DB_PATH
    await database.close_db()
    monkeypatch.setattr(config, "DB_PATH", path)
    await database.init_db()

    assert await recover_stale_research_runs(now=now + timedelta(seconds=10)) == {
        "reconciled": 0, "retryable": 1,
    }
    assert await finish_research_run(
        first["id"], 1, lease_owner="worker-killed", status="completed",
    ) is False

    async def retry_target(*_args, **_kwargs):
        return 1

    monkeypatch.setattr(scheduler, "_run_and_persist_target", retry_target)
    assert await scheduler.run_due_research_jobs(now + timedelta(seconds=11)) == 1
    runs = await list_research_runs(job["id"], 1)
    retry = runs[0]
    assert retry["attempt"] == 2
    assert retry["retry_of_run_id"] == first["id"]
    assert retry["idempotency_key"] == first["idempotency_key"]
    assert [item["status"] for item in runs] == ["completed", "failed"]
    assert [event["event_type"] for event in runs[0]["events"]] == [
        "retry_started", "completed",
    ]
