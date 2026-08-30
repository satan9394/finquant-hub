import asyncio
from pathlib import Path
import sys

import pytest

from app import database
from app.services import research_jobs

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
if str(SCRIPTS) not in sys.path:
    sys.path.insert(0, str(SCRIPTS))

from benchmark_scheduler_runtime import DEFAULT_THRESHOLDS, evaluate_slo, percentile, run_benchmark


def test_percentile_and_slo_threshold_boundaries_are_deterministic():
    assert percentile([4, 1, 3, 2], 0.50) == 2
    assert percentile([4, 1, 3, 2], 0.95) == 4
    metrics = {
        "lifecycle": {"p95_ms": 250.0},
        "batch": {"wall_ms": 5000.0},
        "recovery": {"wall_ms": 2000.0, "record_completeness": 1.0},
        "failure": {"record_completeness": 1.0},
        "integrity": {"duplicate_critical_writes": 0},
    }
    passed = evaluate_slo(metrics, DEFAULT_THRESHOLDS)
    assert passed["status"] == "PASS"
    assert passed["failed_checks"] == []

    metrics["lifecycle"]["p95_ms"] = 250.0001
    failed = evaluate_slo(metrics, DEFAULT_THRESHOLDS)
    assert failed["status"] == "FAIL"
    assert failed["failed_checks"] == ["lifecycle_p95_ms"]


@pytest.mark.asyncio
async def test_fixture_benchmark_covers_load_failure_recovery_and_cleans_temp_database():
    report = await run_benchmark(samples=4, warmup=1, job_count=4)

    assert report["schema_version"] == "scheduler-runtime-benchmark/v1"
    assert report["evidence_scope"] == "temporary_sqlite_deterministic_fixture_only"
    assert report["environment"]["schema_version"] == database._SCHEMA_VERSION
    assert report["environment"]["temporary_database_removed"] is True
    assert report["configuration"] == {
        "samples": 4,
        "warmup": 1,
        "job_count": 4,
        "real_llm_or_upstream_calls": 0,
    }
    assert len(report["metrics"]["lifecycle"]["samples_ms"]) == 4
    assert report["metrics"]["batch"]["completed_jobs"] == 4
    assert report["metrics"]["failure"]["failed_jobs"] == 4
    assert report["metrics"]["failure"]["record_completeness"] == 1.0
    assert report["metrics"]["recovery"]["stale_runs"] == 4
    assert report["metrics"]["recovery"]["record_completeness"] == 1.0
    assert report["metrics"]["recovery"]["second_pass_changes"] == 0
    assert report["metrics"]["integrity"]["duplicate_critical_writes"] == 0
    assert report["slo"]["status"] == "PASS"


def test_fixture_benchmark_isolates_a_runtime_lock_bound_to_an_old_event_loop(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    old_loop = asyncio.new_event_loop()
    old_lock = asyncio.Lock()

    async def bind_lock() -> None:
        await old_lock.acquire()
        waiter = asyncio.create_task(old_lock.acquire())
        await asyncio.sleep(0)
        waiter.cancel()
        with pytest.raises(asyncio.CancelledError):
            await waiter
        old_lock.release()

    old_loop.run_until_complete(bind_lock())
    old_loop.close()
    monkeypatch.setattr(research_jobs, "_RUNTIME_LOCK", old_lock)

    report = asyncio.run(run_benchmark(samples=1, warmup=0, job_count=2))

    assert report["slo"]["status"] == "PASS"
    assert research_jobs._RUNTIME_LOCK is old_lock
