"""Benchmark the local SQLite scheduler runtime with deterministic fixtures only."""

from __future__ import annotations

import argparse
import asyncio
import json
import math
import platform
import sqlite3
import sys
import tempfile
from datetime import datetime, timedelta
from pathlib import Path
from time import perf_counter
from typing import Any

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app import config, database
from app.services import research_jobs, scheduler
from app.services.research_jobs import (
    claim_research_job,
    create_research_job,
    finish_research_run,
    list_research_runs,
    recover_stale_research_runs,
)

JSONDict = dict[str, Any]
DEFAULT_THRESHOLDS: JSONDict = {
    "lifecycle_p95_ms": 250.0,
    "batch_wall_ms": 5000.0,
    "recovery_wall_ms": 2000.0,
    "duplicate_critical_writes": 0,
    "failure_record_completeness": 1.0,
    "recovery_record_completeness": 1.0,
}


def percentile(values: list[float], quantile: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    index = max(0, min(len(ordered) - 1, math.ceil(quantile * len(ordered)) - 1))
    return ordered[index]


def _latency(values: list[float]) -> JSONDict:
    return {
        "samples_ms": [round(value, 4) for value in values],
        "p50_ms": round(percentile(values, 0.50), 4),
        "p95_ms": round(percentile(values, 0.95), 4),
        "max_ms": round(max(values, default=0.0), 4),
    }


def evaluate_slo(metrics: JSONDict, thresholds: JSONDict = DEFAULT_THRESHOLDS) -> JSONDict:
    values = {
        "lifecycle_p95_ms": metrics["lifecycle"]["p95_ms"],
        "batch_wall_ms": metrics["batch"]["wall_ms"],
        "recovery_wall_ms": metrics["recovery"]["wall_ms"],
        "duplicate_critical_writes": metrics["integrity"]["duplicate_critical_writes"],
        "failure_record_completeness": metrics["failure"]["record_completeness"],
        "recovery_record_completeness": metrics["recovery"]["record_completeness"],
    }
    checks = {
        "lifecycle_p95_ms": values["lifecycle_p95_ms"] <= thresholds["lifecycle_p95_ms"],
        "batch_wall_ms": values["batch_wall_ms"] <= thresholds["batch_wall_ms"],
        "recovery_wall_ms": values["recovery_wall_ms"] <= thresholds["recovery_wall_ms"],
        "duplicate_critical_writes": (
            values["duplicate_critical_writes"] == thresholds["duplicate_critical_writes"]
        ),
        "failure_record_completeness": (
            values["failure_record_completeness"] >= thresholds["failure_record_completeness"]
        ),
        "recovery_record_completeness": (
            values["recovery_record_completeness"] >= thresholds["recovery_record_completeness"]
        ),
    }
    failed = [name for name, passed in checks.items() if not passed]
    return {
        "status": "PASS" if not failed else "FAIL",
        "thresholds": thresholds,
        "observed": values,
        "checks": checks,
        "failed_checks": failed,
    }


async def _job(name: str) -> JSONDict:
    return await create_research_job(
        name=name,
        ticker="usAAPL",
        company_name="Fixture Apple",
        cron_expr="0 8 * * *",
        model_id=None,
        is_enabled=True,
        user_id=1,
    )


async def _count(table: str) -> int:
    row = await database.query_one(f"SELECT COUNT(*) AS n FROM {table}")
    assert row is not None
    return int(row["n"])


async def _lifecycle_metrics(samples: int, warmup: int) -> JSONDict:
    job = await _job("lifecycle")
    latencies: list[float] = []
    for index in range(samples + warmup):
        started = perf_counter()
        run = await claim_research_job(
            job["id"], 1, idempotency_key=f"lifecycle-{index}",
            lease_owner="benchmark-lifecycle",
        )
        assert run is not None
        completed = await finish_research_run(
            run["id"], 1, lease_owner="benchmark-lifecycle", status="completed",
        )
        assert completed
        elapsed = (perf_counter() - started) * 1000
        if index >= warmup:
            latencies.append(elapsed)
    return _latency(latencies)


async def _batch_metrics(job_count: int) -> JSONDict:
    jobs = [await _job(f"batch-{index}") for index in range(job_count)]

    async def no_op_target(*_args: Any, **_kwargs: Any) -> int:
        return 1

    original = scheduler._run_and_persist_target
    setattr(scheduler, "_run_and_persist_target", no_op_target)
    started = perf_counter()
    try:
        results = await asyncio.gather(*(
            scheduler.run_research_job(job["id"], 1, f"batch-{job['id']}")
            for job in jobs
        ))
    finally:
        elapsed = (perf_counter() - started) * 1000
        setattr(scheduler, "_run_and_persist_target", original)
    completed = await database.query_one(
        "SELECT COUNT(*) AS n FROM scheduled_research_runs "
        "WHERE status='completed' AND job_id IN ("
        + ",".join("?" for _ in jobs) + ")",
        tuple(job["id"] for job in jobs),
    )
    return {
        "jobs": job_count,
        "wall_ms": round(elapsed, 4),
        "scheduler_overhead_per_job_ms": round(elapsed / job_count, 4),
        "accepted_jobs": sum(bool(result) for result in results),
        "completed_jobs": int(completed["n"]) if completed else 0,
    }


async def _failure_metrics(job_count: int) -> JSONDict:
    jobs = [await _job(f"failure-{index}") for index in range(job_count)]
    started = perf_counter()
    run_ids: list[int] = []
    for job in jobs:
        run = await claim_research_job(
            job["id"], 1, idempotency_key=f"failure-{job['id']}",
            lease_owner="benchmark-failure",
        )
        assert run is not None
        run_ids.append(int(run["id"]))
        assert await finish_research_run(
            run["id"], 1, lease_owner="benchmark-failure",
            status="failed", error="FIXTURE_FAILURE: deterministic benchmark",
        )
    elapsed = (perf_counter() - started) * 1000
    complete = 0
    for job in jobs:
        history = await list_research_runs(job["id"], 1)
        if history[0]["status"] == "failed" and [
            event["event_type"] for event in history[0]["events"]
        ] == ["claimed", "failed"]:
            complete += 1
    return {
        "jobs": job_count,
        "wall_ms": round(elapsed, 4),
        "failed_jobs": len(run_ids),
        "record_completeness": round(complete / job_count, 4),
        "fixture_error": "FIXTURE_FAILURE",
    }


async def _recovery_metrics(job_count: int) -> tuple[JSONDict, JSONDict]:
    jobs = [await _job(f"recovery-{index}") for index in range(job_count)]
    lease_start = datetime(2026, 8, 13, 8, 0)
    run_ids: list[int] = []
    for index, job in enumerate(jobs):
        run = await claim_research_job(
            job["id"], 1, idempotency_key=f"recovery-{job['id']}",
            lease_owner="benchmark-killed", now=lease_start, lease_seconds=5,
        )
        assert run is not None
        run_ids.append(int(run["id"]))
        if index % 2 == 0:
            report_id = await database.execute(
                "INSERT INTO research_reports "
                "(ticker, company_name, report_data, agent_results, status, user_id, scheduled_run_id) "
                "VALUES ('usAAPL', 'Fixture Apple', '{}', '{}', 'completed', 1, ?)",
                (run["id"],),
            )
            memory_id = await database.execute(
                "INSERT INTO memory_records "
                "(user_id, subject_type, subject_id, memory_type, information_kind, content_json, "
                "source_kind, source_id, status, quality_flags_json, created_by) "
                "VALUES (1, 'instrument', 'usAAPL', 'hypothesis', 'AI_INFERENCE', '{}', "
                "'ai', ?, 'candidate', '[]', 'system')",
                (f"research_report:{report_id}",),
            )
            await database.execute(
                "UPDATE scheduled_research_runs SET report_id=?, memory_record_ids_json=? WHERE id=?",
                (report_id, json.dumps([memory_id]), run["id"]),
            )
    before = {
        "reports": await _count("research_reports"),
        "memories": await _count("memory_records"),
    }
    started = perf_counter()
    outcome = await recover_stale_research_runs(now=lease_start + timedelta(seconds=10))
    elapsed = (perf_counter() - started) * 1000
    second = await recover_stale_research_runs(now=lease_start + timedelta(seconds=20))
    after = {
        "reports": await _count("research_reports"),
        "memories": await _count("memory_records"),
    }
    complete = 0
    for job in jobs:
        history = await list_research_runs(job["id"], 1)
        events = [event["event_type"] for event in history[0]["events"]]
        if events in (["claimed", "recovered", "completed"], ["claimed", "recovered", "failed"]):
            complete += 1
    duplicates = (after["reports"] - before["reports"]) + (after["memories"] - before["memories"])
    recovery = {
        "stale_runs": job_count,
        "wall_ms": round(elapsed, 4),
        "reconciled": outcome["reconciled"],
        "retryable": outcome["retryable"],
        "record_completeness": round(complete / job_count, 4),
        "second_pass_changes": second["reconciled"] + second["retryable"],
    }
    integrity = {
        "critical_counts_before": before,
        "critical_counts_after": after,
        "duplicate_critical_writes": duplicates,
    }
    return recovery, integrity


async def run_benchmark(
    *, samples: int = 20, warmup: int = 3, job_count: int = 20,
) -> JSONDict:
    if samples < 1 or warmup < 0 or not 1 <= job_count <= 20:
        raise ValueError("samples >= 1, warmup >= 0, and 1 <= job_count <= 20 are required")
    original_db_path = config.DB_PATH
    original_runtime_lock = research_jobs._RUNTIME_LOCK
    temporary = tempfile.TemporaryDirectory(prefix="finquant-scheduler-benchmark-")
    db_path = Path(temporary.name) / "benchmark.db"
    environment: JSONDict = {}
    report: JSONDict = {}
    try:
        # Isolate the fixture runner from event loops used by a host test/process.
        setattr(research_jobs, "_RUNTIME_LOCK", asyncio.Lock())
        config.DB_PATH = db_path
        await database.init_db()
        await database.execute(
            "INSERT INTO users (id, email, is_admin) VALUES (1, 'scheduler-benchmark@test.local', 1)"
        )
        lifecycle = await _lifecycle_metrics(samples, warmup)
        batch = await _batch_metrics(job_count)
        failure = await _failure_metrics(job_count)
        recovery, integrity = await _recovery_metrics(job_count)
        version = await (await database.get_db().execute("PRAGMA user_version")).fetchone()
        assert version is not None
        metrics = {
            "lifecycle": lifecycle,
            "batch": batch,
            "failure": failure,
            "recovery": recovery,
            "integrity": integrity,
        }
        report = {
            "schema_version": "scheduler-runtime-benchmark/v1",
            "evidence_scope": "temporary_sqlite_deterministic_fixture_only",
            "environment": environment,
            "configuration": {
                "samples": samples,
                "warmup": warmup,
                "job_count": job_count,
                "real_llm_or_upstream_calls": 0,
            },
            "metrics": metrics,
            "slo": evaluate_slo(metrics),
        }
        environment.update({
                "python": platform.python_version(),
                "platform": platform.platform(),
                "sqlite": sqlite3.sqlite_version,
                "schema_version": int(version[0]),
                "temporary_database_removed": False,
        })
    finally:
        await database.close_db()
        setattr(research_jobs, "_RUNTIME_LOCK", original_runtime_lock)
        config.DB_PATH = original_db_path
        temporary.cleanup()
    environment["temporary_database_removed"] = not db_path.exists()
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--samples", type=int, default=20)
    parser.add_argument("--warmup", type=int, default=3)
    parser.add_argument("--jobs", type=int, default=20)
    args = parser.parse_args()
    report = asyncio.run(run_benchmark(samples=args.samples, warmup=args.warmup, job_count=args.jobs))
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["slo"]["status"] == "PASS" else 1


if __name__ == "__main__":
    raise SystemExit(main())
