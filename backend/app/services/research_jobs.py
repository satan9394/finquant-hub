"""SQLite job store for configurable scheduled research targets."""
from __future__ import annotations

from datetime import datetime

from .. import database
from .cron import CronExpression

_DATE_FORMAT = "%Y-%m-%d %H:%M:%S"


def format_local(value: datetime) -> str:
    return value.strftime(_DATE_FORMAT)


def next_run_at(cron_expr: str, now: datetime | None = None) -> str:
    return format_local(CronExpression.parse(cron_expr).next_after(now or datetime.now()))


async def create_research_job(
    *,
    name: str,
    ticker: str,
    company_name: str,
    cron_expr: str,
    model_id: int | None,
    is_enabled: bool,
) -> dict:
    new_id = await database.execute(
        """
        INSERT INTO scheduled_research_jobs
        (name, ticker, company_name, cron_expr, model_id, is_enabled, next_run_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (name, ticker, company_name, CronExpression.parse(cron_expr).raw, model_id,
         int(is_enabled), next_run_at(cron_expr) if is_enabled else None),
    )
    return await get_research_job(new_id)


async def get_research_job(job_id: int) -> dict | None:
    return await database.query_one("SELECT * FROM scheduled_research_jobs WHERE id=?", (job_id,))


async def list_research_jobs() -> list[dict]:
    return await database.query_all("SELECT * FROM scheduled_research_jobs ORDER BY id DESC")


async def update_research_job(job_id: int, updates: dict) -> dict | None:
    current = await get_research_job(job_id)
    if current is None:
        return None
    values = dict(updates)
    cron_expr = CronExpression.parse(str(values.get("cron_expr", current["cron_expr"]))).raw
    enabled = bool(values.get("is_enabled", current["is_enabled"]))
    values["cron_expr"] = cron_expr
    values["next_run_at"] = next_run_at(cron_expr) if enabled else None
    values["is_enabled"] = int(enabled)
    assignments = ", ".join(f"{key}=?" for key in values)
    await database.execute(
        f"UPDATE scheduled_research_jobs SET {assignments}, updated_at=datetime('now') WHERE id=?",
        (*values.values(), job_id),
    )
    return await get_research_job(job_id)


async def due_research_jobs(now: datetime | None = None) -> list[dict]:
    current = format_local(now or datetime.now())
    return await database.query_all(
        """
        SELECT * FROM scheduled_research_jobs
        WHERE is_enabled=1 AND next_run_at IS NOT NULL AND next_run_at<=?
          AND last_status!='running'
        ORDER BY next_run_at, id LIMIT 20
        """,
        (current,),
    )


async def mark_job_running(job_id: int, now: datetime | None = None) -> bool:
    current = now or datetime.now()
    job = await get_research_job(job_id)
    if job is None:
        return False
    cursor = await database.get_db().execute(
        """
        UPDATE scheduled_research_jobs
        SET last_status='running', last_error=NULL, last_run_at=?,
            next_run_at=?, updated_at=datetime('now')
        WHERE id=? AND last_status!='running'
        """,
        (
            format_local(current),
            next_run_at(job["cron_expr"], current),
            job_id,
        ),
    )
    await database.get_db().commit()
    return cursor.rowcount == 1


async def mark_job_finished(job_id: int, *, error: str | None = None) -> None:
    await database.execute(
        "UPDATE scheduled_research_jobs SET last_status=?, last_error=?, updated_at=datetime('now') WHERE id=?",
        ("failed" if error else "completed", error, job_id),
    )
