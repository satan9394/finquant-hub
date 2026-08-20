# Scheduler Runtime SLO Baseline

## Evidence boundary

This baseline was recorded on 2026-08-13 with `backend/scripts/benchmark_scheduler_runtime.py`. It uses a fresh temporary SQLite database, schema v23, the existing single `aiosqlite` connection, deterministic no-op work, deterministic failure records, and synthetic stale runs. It made **zero** real LLM, market-data, network, or other upstream calls and removed the temporary database after every run.

It measures scheduler/database bookkeeping overhead only. It is not evidence for production capacity, real upstream latency, multi-user concurrency, cross-process recovery, or distributed exactly-once delivery.

## Reproduction

From `backend/`:

```powershell
$env:LOCAL_ONLY_MODE='false'
.venv\Scripts\python.exe scripts/benchmark_scheduler_runtime.py --samples 20 --warmup 3 --jobs 20
```

The command emits `scheduler-runtime-benchmark/v1` JSON, including all lifecycle samples and failed checks. It exits non-zero if any SLO check fails.

## Fixed workload and thresholds

- Environment: Python 3.12.12, SQLite 3.50.4, Windows 11 `10.0.26200`, schema v23.
- Lifecycle: 3 warmups followed by 20 measured claim + terminal transactions.
- Batch: 20 scheduled jobs with deterministic no-op target work; wall time and scheduler overhead per job exclude LLM and upstream work.
- Failure: 20 explicit deterministic failures; each must retain claimed and failed events.
- Recovery: 20 expired leases, split into 10 completed-report reconciliations and 10 retryable failures; a second recovery pass must make no change.
- SLO: lifecycle P95 <= 250 ms; 20-job batch <= 5,000 ms; 20-run recovery <= 2,000 ms; duplicate critical writes = 0; failure and recovery record completeness = 100%.

## Three independent runs

| Run | Lifecycle P50 / P95 / max (ms) | 20-job batch wall (ms) | Failure wall / completeness | 20-run recovery wall / completeness (ms) | Duplicate critical writes | Result |
|---:|---:|---:|---:|---:|---:|---:|
| 1 | 3.5235 / 4.3470 / 4.4920 | 79.0725 | 67.7949 / 100% | 8.2897 / 100% | 0 | PASS |
| 2 | 3.4448 / 4.6498 / 4.9981 | 82.0851 | 68.4885 / 100% | 8.2405 / 100% | 0 | PASS |
| 3 | 3.5059 / 4.5607 / 5.7311 | 84.3661 | 67.7071 / 100% | 7.9340 / 100% | 0 | PASS |

Every batch accepted and completed 20/20 jobs. Every failure workload persisted 20/20 failed runs. Every recovery workload reconciled 10 completed reports and made 10 incomplete runs retryable; every second recovery pass reported zero changes. Every run used zero real upstream calls and confirmed temporary database removal.

Worst observed values were lifecycle P95 **4.6498 ms**, batch wall **84.3661 ms**, and recovery wall **8.2897 ms**. These are respectively 1.86%, 1.69%, and 0.41% of their fixed ceilings.

## Decision gate

**PASS — the roadmap section 7.2 architecture decision gate is not triggered by this fixture-only local baseline.** The current single-connection SQLite scheduler remains appropriate for the measured local bookkeeping workload. `AIOS-062` (durable queue ADR) and `AIOS-063` (PostgreSQL ADR/PoC) remain blocked pending real evidence such as sustained SLO breach, required cross-process recovery/horizontal scaling, unacceptable restart loss, or measured multi-user/capacity pressure.

This result does not approve TencentDB-Agent-Memory, Graphiti, Mem0, PostgreSQL, Redis, Celery, or any other production dependency. Any such adoption still requires its own fixture/shadow evidence and ADR decision.
