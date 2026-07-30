"""Lightweight daily post-market research scheduler."""
from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timedelta

from .. import config, database
from .research_orch import run_research

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


async def _load_daily_targets() -> list[tuple[str, str]]:
    """Reload the known research universe before each scheduled run."""
    rows = await database.query_all(
        "SELECT ticker, COALESCE(MAX(company_name), ticker) AS company_name "
        "FROM research_reports GROUP BY ticker ORDER BY MAX(updated_at) DESC"
    )
    return [(row["ticker"], row["company_name"]) for row in rows]


async def _append_research_event(report_id: int, event: str, payload: dict) -> None:
    await database.execute(
        "INSERT INTO research_events (research_id, event_type, agent_role_key, payload) VALUES (?, ?, ?, ?)",
        (
            report_id,
            event,
            payload.get("role_key") or payload.get("agent"),
            json.dumps(payload, ensure_ascii=False),
        ),
    )


async def _mark_research_failed(report_id: int, message: str, *, record_event: bool = True) -> None:
    if record_event:
        await _append_research_event(report_id, "error", {"error": message})
    await database.execute(
        "UPDATE research_reports SET status='failed', updated_at=datetime('now') "
        "WHERE id=? AND status='running'",
        (report_id,),
    )


async def _run_and_persist_target(ticker: str, company_name: str) -> None:
    """Run one scheduled research target and persist its full lifecycle."""
    report_id = await database.execute(
        "INSERT INTO research_reports "
        "(ticker, company_name, report_data, agent_results, model_id, status, updated_at) "
        "VALUES (?, ?, '{}', '{}', NULL, 'running', datetime('now'))",
        (ticker, company_name),
    )
    terminal = False
    research_stream = None
    try:
        research_stream = run_research(ticker, company_name)
        async for event, payload in research_stream:
            if event == "done":
                payload = {**payload, "report_id": report_id}
            await _append_research_event(report_id, event, payload)

            if event == "error":
                message = payload.get("error") or "研究管线异常"
                await _mark_research_failed(report_id, message, record_event=False)
                terminal = True
                LOGGER.warning("Post-market analysis failed for %s: %s", ticker, message)
                break
            if event == "done":
                await database.execute(
                    "UPDATE research_reports SET report_data=?, agent_results=?, status='completed', "
                    "updated_at=datetime('now') WHERE id=? AND status='running'",
                    (
                        json.dumps(payload.get("report", {}), ensure_ascii=False),
                        json.dumps(payload.get("agent_results", {}), ensure_ascii=False),
                        report_id,
                    ),
                )
                terminal = True
                break
    except asyncio.CancelledError:
        if not terminal:
            await _mark_research_failed(report_id, "盘后研究被取消")
        raise
    except Exception as exc:
        if not terminal:
            await _mark_research_failed(report_id, f"盘后研究异常：{exc}")
        raise
    finally:
        close = getattr(research_stream, "aclose", None)
        if close is not None:
            try:
                await close()
            except Exception:
                LOGGER.exception("Failed to close post-market stream for %s", ticker)

    if not terminal:
        await _mark_research_failed(report_id, "盘后研究流在完成前中断")


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

    async def analyze_target(ticker: str, company_name: str) -> None:
        async with semaphore:
            try:
                await _run_and_persist_target(ticker, company_name)
            except asyncio.CancelledError:
                raise
            except Exception:
                LOGGER.exception("Post-market analysis crashed for %s", ticker)

    await asyncio.gather(*(analyze_target(ticker, company_name) for ticker, company_name in selected_targets))


async def scheduler_loop() -> None:
    """Wait for the configured local time and run post-market analysis indefinitely."""
    while True:
        delay = seconds_until_next_run()
        LOGGER.info("Next post-market analysis runs in %.0f seconds", delay)
        await asyncio.sleep(delay)
        try:
            await run_post_market_analysis()
        except asyncio.CancelledError:
            raise
        except Exception:
            LOGGER.exception("Scheduled post-market analysis failed")
