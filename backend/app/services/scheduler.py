"""Lightweight daily post-market alert and research scheduler."""
from __future__ import annotations

import asyncio
import json
import logging
import os
from datetime import datetime, timedelta
from typing import Any

from .. import config, database
from .alerts import scan_enabled_rules
from .auth import reset_current_user, set_current_user
from .market_data import MarketDataService
from .market_review import run_scheduled_market_review
from .memory_capture import persist_research_candidates
from .llm_usage import reset_usage_context, set_usage_context
from .notifications import publish_research_status
from .research_orch import run_research
from .research_jobs import (
    claim_research_job,
    due_research_jobs,
    finish_research_run,
    heartbeat_research_run,
    recover_stale_research_runs,
)

LOGGER = logging.getLogger(__name__)


def seconds_until_next_run(
    now: datetime | None = None,
    hour: int | None = None,
    minute: int | None = None,
) -> float:
    """Return the delay until the next configured local run time."""
    current = now or datetime.now()
    scheduled_hour = config.SCHEDULER_HOUR if hour is None else min(23, max(0, hour))
    scheduled_minute = config.SCHEDULER_MINUTE if minute is None else min(59, max(0, minute))
    next_run = current.replace(
        hour=scheduled_hour,
        minute=scheduled_minute,
        second=0,
        microsecond=0,
    )
    if next_run <= current:
        next_run += timedelta(days=1)
    return (next_run - current).total_seconds()


async def _load_daily_targets() -> list[tuple[int, str, str]]:
    """Reload the known research universe before each scheduled run."""
    rows = await database.query_all(
        "SELECT user_id, ticker, COALESCE(MAX(company_name), ticker) AS company_name "
        "FROM research_reports WHERE user_id IS NOT NULL GROUP BY user_id, ticker ORDER BY MAX(updated_at) DESC"
    )
    return [(int(row["user_id"]), row["ticker"], row["company_name"]) for row in rows]


async def _append_research_event(
    report_id: int,
    event: str,
    payload: dict[str, Any],
    user_id: int,
) -> None:
    await database.execute(
        "INSERT INTO research_events (research_id, event_type, agent_role_key, payload, user_id) VALUES (?, ?, ?, ?, ?)",
        (
            report_id,
            event,
            payload.get("role_key") or payload.get("agent"),
            json.dumps(payload, ensure_ascii=False),
            user_id,
        ),
    )


async def _mark_research_failed(report_id: int, message: str, user_id: int, *, record_event: bool = True) -> None:
    if record_event:
        await _append_research_event(report_id, "error", {"error": message}, user_id)
    await database.execute(
        "UPDATE research_reports SET status='failed', updated_at=datetime('now') "
        "WHERE id=? AND status='running' AND user_id=?",
        (report_id, user_id),
    )
    await publish_research_status(report_id, "failed", message, user_id=user_id)


async def _run_and_persist_target(
    ticker: str,
    company_name: str,
    user_id: int,
    model_id: int | None = None,
    scheduled_run_id: int | None = None,
) -> int:
    """Run one scheduled research target and persist its full lifecycle."""
    report_id = await database.execute(
        "INSERT INTO research_reports "
        "(ticker, company_name, report_data, agent_results, model_id, status, updated_at, user_id, scheduled_run_id) "
        "VALUES (?, ?, '{}', '{}', ?, 'running', datetime('now'), ?, ?)",
        (ticker, company_name, model_id, user_id, scheduled_run_id),
    )
    if scheduled_run_id is not None:
        await database.execute(
            "UPDATE scheduled_research_runs SET report_id=? WHERE id=? AND user_id=?",
            (report_id, scheduled_run_id, user_id),
        )
    terminal = False
    failure: str | None = None
    research_stream = None
    auth_token = set_current_user({"id": user_id})
    usage_token = set_usage_context("scheduled_research", report_id, user_id)
    try:
        research_stream = run_research(ticker, company_name, model_id=model_id, user_id=user_id)
        async for event, payload in research_stream:
            if event == "done":
                payload = {**payload, "report_id": report_id}
            await _append_research_event(report_id, event, payload, user_id)

            if event == "error":
                message = payload.get("error") or "研究管线异常"
                await _mark_research_failed(report_id, message, user_id, record_event=False)
                terminal = True
                failure = message
                LOGGER.warning("Post-market analysis failed for %s: %s", ticker, message)
                break
            if event == "done":
                report_data = payload.get("report", {})
                await database.execute(
                    "UPDATE research_reports SET report_data=?, agent_results=?, status='completed', "
                    "updated_at=datetime('now') WHERE id=? AND status='running' AND user_id=?",
                    (
                        json.dumps(report_data, ensure_ascii=False),
                        json.dumps(payload.get("agent_results", {}), ensure_ascii=False),
                        report_id,
                        user_id,
                    ),
                )
                memory_ids = await persist_research_candidates(report_id, ticker, report_data, user_id)
                evidence_candidates: set[str] = set()

                def collect(value: Any) -> None:
                    if isinstance(value, str) and value.startswith("ev_"):
                        evidence_candidates.add(value)
                    elif isinstance(value, dict):
                        for child in value.values():
                            collect(child)
                    elif isinstance(value, list):
                        for child in value:
                            collect(child)

                collect(report_data)
                evidence_ids: list[str] = []
                if evidence_candidates:
                    placeholders = ",".join("?" for _ in evidence_candidates)
                    rows = await database.query_all(
                        f"SELECT evidence_id FROM evidence_objects WHERE user_id=? "
                        f"AND evidence_id IN ({placeholders}) ORDER BY evidence_id",
                        (user_id, *sorted(evidence_candidates)),
                    )
                    evidence_ids = [str(row["evidence_id"]) for row in rows]
                if scheduled_run_id is not None:
                    evidence_status = "UNKNOWN"
                    if evidence_ids:
                        evidence_status = (
                            "OK" if len(evidence_ids) == len(evidence_candidates) else "PARTIAL"
                        )
                    await database.execute(
                        "UPDATE scheduled_research_runs SET evidence_status=?, "
                        "evidence_ids_json=?, memory_record_ids_json=? "
                        "WHERE id=? AND user_id=?",
                        (
                            evidence_status,
                            json.dumps(evidence_ids), json.dumps(memory_ids), scheduled_run_id, user_id,
                        ),
                    )
                await publish_research_status(report_id, "completed", user_id=user_id)
                terminal = True
                break
    except asyncio.CancelledError:
        if not terminal:
            await _mark_research_failed(report_id, "盘后研究被取消", user_id)
        raise
    except Exception as exc:
        if not terminal:
            await _mark_research_failed(report_id, f"盘后研究异常：{exc}", user_id)
        raise
    finally:
        reset_usage_context(usage_token)
        reset_current_user(auth_token)
        close = getattr(research_stream, "aclose", None)
        if close is not None:
            try:
                await close()
            except Exception:
                LOGGER.exception("Failed to close post-market stream for %s", ticker)

    if not terminal:
        failure = "盘后研究流在完成前中断"
        await _mark_research_failed(report_id, failure, user_id)
    if failure:
        raise RuntimeError(failure)
    return report_id


async def run_post_market_analysis(
    max_targets: int | None = None,
    concurrency: int | None = None,
) -> None:
    """Run the existing research pipeline once for every known research target."""
    targets = await _load_daily_targets()
    if not targets:
        LOGGER.info("Post-market analysis skipped: no research targets")
        return

    target_limit = config.SCHEDULER_MAX_TARGETS if max_targets is None else min(1000, max(1, max_targets))
    worker_limit = config.SCHEDULER_CONCURRENCY if concurrency is None else min(20, max(1, concurrency))
    selected_targets = targets[:target_limit]
    if len(targets) > len(selected_targets):
        LOGGER.warning(
            "Post-market analysis limited to %d of %d research targets",
            len(selected_targets),
            len(targets),
        )

    semaphore = asyncio.Semaphore(worker_limit)

    async def analyze_target(user_id: int, ticker: str, company_name: str) -> None:
        async with semaphore:
            try:
                await _run_and_persist_target(ticker, company_name, user_id)
            except asyncio.CancelledError:
                raise
            except Exception:
                LOGGER.exception("Post-market analysis crashed for %s", ticker)

    await asyncio.gather(*(
        analyze_target(user_id, ticker, company_name)
        for user_id, ticker, company_name in selected_targets
    ))


async def run_scheduled_cycle(market: MarketDataService) -> None:
    """运行一次盘后预警扫描和研究；其中一项失败不跳过另一项。"""
    try:
        await scan_enabled_rules(
            market,
            max_targets=config.SCHEDULER_MAX_TARGETS,
            concurrency=config.SCHEDULER_CONCURRENCY,
        )
    except asyncio.CancelledError:
        raise
    except Exception:
        LOGGER.exception("Scheduled alert scan failed")

    try:
        users = await database.query_all("SELECT id FROM users WHERE is_active=1 ORDER BY id")
        await asyncio.gather(*(run_scheduled_market_review(market, int(user["id"])) for user in users))
    except asyncio.CancelledError:
        raise
    except Exception:
        LOGGER.exception("Scheduled market review failed")

    try:
        await run_post_market_analysis()
    except asyncio.CancelledError:
        raise
    except Exception:
        LOGGER.exception("Scheduled post-market analysis failed")


async def _heartbeat_lease(run_id: int, user_id: int, lease_owner: str) -> None:
    while True:
        await asyncio.sleep(20)
        if not await heartbeat_research_run(
            run_id, user_id, lease_owner=lease_owner, lease_seconds=60,
        ):
            return


async def run_research_job(
    job_id: int,
    user_id: int,
    idempotency_key: str | None = None,
) -> bool:
    """Claim and execute one persisted research job without overlapping itself."""
    job = await database.query_one(
        "SELECT * FROM scheduled_research_jobs WHERE id=? AND user_id=?", (job_id, user_id)
    )
    if job is None:
        return False
    identity = idempotency_key or job.get("pending_idempotency_key") or (
        f"scheduled:{user_id}:{job_id}:{job.get('next_run_at') or datetime.now().isoformat()}"
    )
    lease_owner = f"local-{os.getpid()}-{job_id}-{id(asyncio.current_task())}"
    run = await claim_research_job(
        job_id, user_id, idempotency_key=identity, lease_owner=lease_owner,
    )
    if run is None:
        return False
    if run.get("idempotent_replay"):
        return True
    run_id = int(run["id"])
    heartbeat_task = asyncio.create_task(
        _heartbeat_lease(run_id, user_id, lease_owner),
        name=f"scheduled-research-heartbeat-{run_id}",
    )
    try:
        await _run_and_persist_target(
            job["ticker"], job["company_name"], user_id, job.get("model_id"), run_id,
        )
    except asyncio.CancelledError:
        await finish_research_run(
            run_id, user_id, lease_owner=lease_owner,
            status="cancelled", error="定时研究被取消",
        )
        raise
    except Exception as exc:
        await finish_research_run(
            run_id, user_id, lease_owner=lease_owner,
            status="failed", error=str(exc),
        )
        LOGGER.exception("Scheduled research job %d failed", job_id)
    else:
        await finish_research_run(
            run_id, user_id, lease_owner=lease_owner, status="completed",
        )
    finally:
        heartbeat_task.cancel()
        try:
            await heartbeat_task
        except asyncio.CancelledError:
            pass
    return True


async def run_due_research_jobs(now: datetime | None = None) -> int:
    await recover_stale_research_runs(now=now)
    jobs = await due_research_jobs(now)
    if not jobs:
        return 0
    results = await asyncio.gather(*(
        run_research_job(
            job["id"], int(job["user_id"]),
            idempotency_key=job.get("pending_idempotency_key") or (
                f"scheduled:{job['user_id']}:{job['id']}:{job['next_run_at']}"
            ),
        )
        for job in jobs
    ))
    return sum(results)


async def scheduler_loop(market: MarketDataService) -> None:
    """Run due cron jobs while retaining the legacy daily post-market cycle."""
    while True:
        daily_delay = seconds_until_next_run()
        delay = min(daily_delay, 30.0)
        await asyncio.sleep(delay)
        try:
            await run_due_research_jobs()
        except asyncio.CancelledError:
            raise
        except Exception:
            LOGGER.exception("Scheduled research job poll failed")
        if daily_delay <= delay + 0.5:
            await run_scheduled_cycle(market)
