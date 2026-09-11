"""SQLite job store for configurable scheduled research targets."""
from __future__ import annotations

import asyncio
import hashlib
import json
import re
from datetime import datetime, timedelta
from typing import Any, cast

from .. import database
from .cron import CronExpression

_DATE_FORMAT = "%Y-%m-%d %H:%M:%S"
JSONDict = dict[str, Any]
_RUNTIME_LOCK = asyncio.Lock()
# G-02: 定时研究任务失败重试上限（含首次之后的失败 attempt）。
# 达到上限后 claim 返回 None，调度器不再抓取，防止持续失败时无限重试。
_MAX_RETRY_ATTEMPTS = 5
_HEX_KEY = re.compile(r"[0-9a-f]{64}")
_EVENT_PAYLOAD_KEYS = {
    "attempt", "error", "lease_expires_at", "lease_owner", "reason",
    "report_id", "retry_of_run_id", "status",
}


def format_local(value: datetime) -> str:
    return value.strftime(_DATE_FORMAT)


def next_run_at(cron_expr: str, now: datetime | None = None) -> str:
    return format_local(CronExpression.parse(cron_expr).next_after(now or datetime.now()))


def _idempotency_key(value: str) -> str:
    clean = value.strip().lower()
    if _HEX_KEY.fullmatch(clean):
        return clean
    if not clean:
        raise ValueError("idempotency_key is required")
    return hashlib.sha256(clean.encode()).hexdigest()


def _safe_event_payload(payload: JSONDict) -> JSONDict:
    result = {key: value for key, value in payload.items() if key in _EVENT_PAYLOAD_KEYS}
    if "error" in result:
        result["error"] = str(result["error"])[:500]
    return result


async def _insert_research_run_event(
    db: Any,
    *,
    user_id: int,
    job_id: int,
    run_id: int,
    event_type: str,
    payload: JSONDict,
) -> int:
    cursor = await db.execute(
        "INSERT INTO scheduled_research_run_events "
        "(user_id, job_id, run_id, event_type, payload_json) VALUES (?, ?, ?, ?, ?)",
        (user_id, job_id, run_id, event_type, json.dumps(_safe_event_payload(payload))),
    )
    return cast(int, cursor.lastrowid)


async def append_research_run_event(
    *, user_id: int, job_id: int, run_id: int, event_type: str, payload: JSONDict,
) -> int:
    async with _RUNTIME_LOCK:
        async with database.exclusive_transaction():
            return await _insert_research_run_event(
                db=database.get_db(), user_id=user_id, job_id=job_id, run_id=run_id,
                event_type=event_type, payload=payload,
            )


async def create_research_job(
    *,
    name: str,
    ticker: str,
    company_name: str,
    cron_expr: str,
    model_id: int | None,
    is_enabled: bool,
    user_id: int,
) -> JSONDict:
    new_id = await database.execute(
        """
        INSERT INTO scheduled_research_jobs
        (name, ticker, company_name, cron_expr, model_id, is_enabled, next_run_at, user_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (name, ticker, company_name, CronExpression.parse(cron_expr).raw, model_id,
         int(is_enabled), next_run_at(cron_expr) if is_enabled else None, user_id),
    )
    return cast(JSONDict, await get_research_job(new_id, user_id))


async def get_research_job(job_id: int, user_id: int) -> JSONDict | None:
    return await database.query_one(
        "SELECT * FROM scheduled_research_jobs WHERE id=? AND user_id=?", (job_id, user_id)
    )


async def list_research_jobs(user_id: int) -> list[JSONDict]:
    return await database.query_all(
        "SELECT * FROM scheduled_research_jobs WHERE user_id=? ORDER BY id DESC", (user_id,)
    )


async def list_research_runs(job_id: int, user_id: int, limit: int = 20) -> list[JSONDict]:
    if await get_research_job(job_id, user_id) is None:
        raise LookupError(f"定时研究任务不存在：id={job_id}")
    rows = await database.query_all(
        "SELECT * FROM scheduled_research_runs WHERE job_id=? AND user_id=? "
        "ORDER BY id DESC LIMIT ?", (job_id, user_id, max(1, min(limit, 100))),
    )
    for row in rows:
        row["evidence_ids"] = json.loads(row.pop("evidence_ids_json"))
        row["memory_record_ids"] = json.loads(row.pop("memory_record_ids_json"))
        events = await database.query_all(
            "SELECT id, event_type, payload_json, created_at "
            "FROM scheduled_research_run_events WHERE run_id=? AND user_id=? ORDER BY id",
            (row["id"], user_id),
        )
        for event in events:
            event["payload"] = json.loads(event.pop("payload_json"))
        row["events"] = events
    return rows


async def claim_research_job(
    job_id: int,
    user_id: int,
    *,
    idempotency_key: str,
    lease_owner: str,
    now: datetime | None = None,
    lease_seconds: int = 60,
) -> JSONDict | None:
    """Atomically claim one local job and create its leased run attempt."""
    current = now or datetime.now()
    clean_owner = lease_owner.strip()
    if not clean_owner or len(clean_owner) > 100:
        raise ValueError("lease_owner must be between 1 and 100 characters")
    identity = _idempotency_key(idempotency_key)
    duration = max(5, min(3600, lease_seconds))
    outcome: JSONDict | None = None
    async with _RUNTIME_LOCK:
        db = database.get_db()
        async with database.exclusive_transaction():
            existing_row = await (await db.execute(
                "SELECT * FROM scheduled_research_runs "
                "WHERE job_id=? AND user_id=? AND idempotency_key=? "
                "ORDER BY attempt DESC LIMIT 1",
                (job_id, user_id, identity),
            )).fetchone()
            existing = dict(existing_row) if existing_row else None
            if existing is not None and existing["status"] == "running":
                return None
            if existing is not None and existing["status"] == "completed":
                return {**existing, "idempotent_replay": True}

            job_row = await (await db.execute(
                "SELECT * FROM scheduled_research_jobs WHERE id=? AND user_id=?",
                (job_id, user_id),
            )).fetchone()
            if job_row is None:
                return None
            job = dict(job_row)
            next_at = next_run_at(str(job["cron_expr"]), current)
            # G-02（修正）：重试上限必须
            #   ① 只统计"自上次成功以来"的连续失败（原实现按 job 全历史 attempt 累加，
            #      导致正常任务跑满上限次数后也被永久拦下）；
            #   ② 在改动 job 状态（last_status='running'）之前判定——原实现先提交
            #      running 再 return None，job 会永久卡在 running、无 run 行可被
            #      recover_stale_research_runs 回收，定时研究静默死亡。
            failed_row = await (await db.execute(
                "SELECT COUNT(*) AS n FROM scheduled_research_runs r "
                "WHERE r.job_id=? AND r.user_id=? AND r.status IN ('failed', 'cancelled') "
                "AND r.id > COALESCE((SELECT MAX(s.id) FROM scheduled_research_runs s "
                "  WHERE s.job_id=? AND s.user_id=? AND s.status='completed'), 0)",
                (job_id, user_id, job_id, user_id),
            )).fetchone()
            consecutive_failures = int(failed_row["n"]) if failed_row else 0
            if consecutive_failures >= _MAX_RETRY_ATTEMPTS:
                # 停止失败重试风暴：不创建新 run（不烧上游），记录原因并推进到下一次
                # 计划时间——正常调度不受影响，下一次到点仍会尝试一次。
                await db.execute(
                    "UPDATE scheduled_research_jobs SET last_status='failed', last_error=?, "
                    "next_run_at=?, pending_idempotency_key=NULL, updated_at=datetime('now') "
                    "WHERE id=? AND user_id=?",
                    (
                        f"连续失败 {consecutive_failures} 次，已暂停自动重试；"
                        "请检查模型配置、额度与网络后，等待下次计划或手动重跑。",
                        next_at,
                        job_id,
                        user_id,
                    ),
                )
                return None
            cursor = await db.execute(
                "UPDATE scheduled_research_jobs SET last_status='running', last_error=NULL, "
                "last_run_at=?, next_run_at=?, pending_idempotency_key=NULL, "
                "updated_at=datetime('now') WHERE id=? AND user_id=? AND last_status!='running'",
                (format_local(current), next_at, job_id, user_id),
            )
            if cursor.rowcount != 1:
                return None

            latest_row = await (await db.execute(
                "SELECT * FROM scheduled_research_runs WHERE job_id=? AND user_id=? "
                "ORDER BY attempt DESC, id DESC LIMIT 1",
                (job_id, user_id),
            )).fetchone()
            latest = dict(latest_row) if latest_row else None
            prior = existing or (
                latest if latest is not None and latest["status"] in {"failed", "cancelled"} else None
            )
            attempt = int(latest["attempt"]) + 1 if latest else 1
            retry_of = int(prior["id"]) if prior else None
            run_key = hashlib.sha256(
                f"{user_id}:{job_id}:{identity}:{attempt}".encode()
            ).hexdigest()
            expires_at = format_local(current + timedelta(seconds=duration))
            cursor = await db.execute(
                "INSERT INTO scheduled_research_runs "
                "(user_id, job_id, run_key, idempotency_key, attempt, retry_of_run_id, status, "
                "started_at, lease_owner, lease_expires_at, heartbeat_at) "
                "VALUES (?, ?, ?, ?, ?, ?, 'running', ?, ?, ?, ?)",
                (
                    user_id, job_id, run_key, identity, attempt, retry_of,
                    format_local(current), clean_owner, expires_at, format_local(current),
                ),
            )
            run_id = cast(int, cursor.lastrowid)
            event_type = "retry_started" if retry_of is not None else "claimed"
            await _insert_research_run_event(
                db, user_id=user_id, job_id=job_id, run_id=run_id,
                event_type=event_type,
                payload={
                    "attempt": attempt,
                    "retry_of_run_id": retry_of,
                    "lease_owner": clean_owner,
                    "lease_expires_at": expires_at,
                },
            )
            outcome = {"id": run_id}
    if outcome is None:
        return None
    result = await database.query_one(
        "SELECT * FROM scheduled_research_runs WHERE id=? AND user_id=?", (outcome["id"], user_id),
    )
    assert result is not None
    result["idempotent_replay"] = False
    return result


async def heartbeat_research_run(
    run_id: int,
    user_id: int,
    *,
    lease_owner: str,
    now: datetime | None = None,
    lease_seconds: int = 60,
) -> bool:
    current = now or datetime.now()
    expires_at = format_local(current + timedelta(seconds=max(5, min(3600, lease_seconds))))
    async with _RUNTIME_LOCK:
        db = database.get_db()
        async with database.exclusive_transaction():
            row = await (await db.execute(
                "SELECT job_id FROM scheduled_research_runs WHERE id=? AND user_id=?",
                (run_id, user_id),
            )).fetchone()
            if row is None:
                return False
            cursor = await db.execute(
                "UPDATE scheduled_research_runs SET heartbeat_at=?, lease_expires_at=? "
                "WHERE id=? AND user_id=? AND status='running' AND lease_owner=? "
                "AND lease_expires_at>?",
                (
                    format_local(current), expires_at, run_id, user_id,
                    lease_owner, format_local(current),
                ),
            )
            if cursor.rowcount != 1:
                return False
            await _insert_research_run_event(
                db=database.get_db(), user_id=user_id, job_id=int(row["job_id"]), run_id=run_id,
                event_type="heartbeat",
                payload={"lease_owner": lease_owner, "lease_expires_at": expires_at},
            )
            return True


async def finish_research_run(
    run_id: int,
    user_id: int,
    *,
    lease_owner: str,
    status: str,
    error: str | None = None,
) -> bool:
    if status not in {"completed", "failed", "cancelled"}:
        raise ValueError("invalid terminal research run status")
    async with _RUNTIME_LOCK:
        db = database.get_db()
        async with database.exclusive_transaction():
            row = await (await db.execute(
                "SELECT job_id FROM scheduled_research_runs WHERE id=? AND user_id=?",
                (run_id, user_id),
            )).fetchone()
            if row is None:
                return False
            cursor = await db.execute(
                "UPDATE scheduled_research_runs SET status=?, error=?, "
                "evidence_status=CASE WHEN ?='completed' THEN evidence_status "
                "ELSE 'UPSTREAM_ERROR' END, completed_at=datetime('now'), "
                "lease_owner=NULL, lease_expires_at=NULL "
                "WHERE id=? AND user_id=? AND status='running' AND lease_owner=?",
                (status, error, status, run_id, user_id, lease_owner),
            )
            if cursor.rowcount != 1:
                return False
            await db.execute(
                "UPDATE scheduled_research_jobs SET last_status=?, last_error=?, "
                "pending_idempotency_key=NULL, updated_at=datetime('now') "
                "WHERE id=? AND user_id=?",
                (
                    "completed" if status == "completed" else "failed",
                    None if status == "completed" else error,
                    int(row["job_id"]), user_id,
                ),
            )
            await _insert_research_run_event(
                db=database.get_db(), user_id=user_id, job_id=int(row["job_id"]), run_id=run_id,
                event_type=status,
                payload={"status": status, "error": error} if error else {"status": status},
            )
            return True


async def recover_stale_research_runs(
    now: datetime | None = None,
    *,
    user_id: int | None = None,
) -> dict[str, int]:
    """Reconcile expired single-process leases without replaying completed reports."""
    current = format_local(now or datetime.now())
    owner_clause = " AND r.user_id=?" if user_id is not None else ""
    params: tuple[Any, ...] = (current, user_id) if user_id is not None else (current,)
    reconciled = 0
    retryable = 0
    async with _RUNTIME_LOCK:
        db = database.get_db()
        async with database.exclusive_transaction():
            cursor = await db.execute(
                "SELECT r.*, p.status AS report_status FROM scheduled_research_runs r "
                "LEFT JOIN research_reports p ON p.id=r.report_id AND p.user_id=r.user_id "
                "WHERE r.status='running' AND r.lease_expires_at IS NOT NULL "
                "AND r.lease_expires_at<=? " + owner_clause + " ORDER BY r.id",
                params,
            )
            rows = [dict(row) for row in await cursor.fetchall()]
            for run in rows:
                run_user_id = int(run["user_id"])
                job_id = int(run["job_id"])
                run_id = int(run["id"])
                await _insert_research_run_event(
                    db, user_id=run_user_id, job_id=job_id, run_id=run_id,
                    event_type="recovered",
                    payload={
                        "reason": (
                            "completed_report"
                            if run["report_status"] == "completed"
                            else "lease_expired"
                        ),
                        "report_id": run["report_id"],
                    },
                )
                if run["report_status"] == "completed":
                    await db.execute(
                        "UPDATE scheduled_research_runs SET status='completed', "
                        "completed_at=COALESCE(completed_at, ?), lease_owner=NULL, "
                        "lease_expires_at=NULL WHERE id=? AND user_id=? AND status='running'",
                        (current, run_id, run_user_id),
                    )
                    await db.execute(
                        "UPDATE scheduled_research_jobs SET last_status='completed', "
                        "last_error=NULL, pending_idempotency_key=NULL, "
                        "updated_at=datetime('now') WHERE id=? AND user_id=?",
                        (job_id, run_user_id),
                    )
                    await _insert_research_run_event(
                        db, user_id=run_user_id, job_id=job_id, run_id=run_id,
                        event_type="completed",
                        payload={"status": "completed", "reason": "reconciled_completed_report"},
                    )
                    reconciled += 1
                    continue
                error = "LEASE_EXPIRED: scheduler 进程中断，未完成 run 可安全重试"
                if run["report_id"] is not None:
                    await db.execute(
                        "UPDATE research_reports SET status='failed', updated_at=datetime('now') "
                        "WHERE id=? AND user_id=? AND status='running'",
                        (run["report_id"], run_user_id),
                    )
                await db.execute(
                    "UPDATE scheduled_research_runs SET status='failed', "
                    "evidence_status='UPSTREAM_ERROR', error=?, completed_at=?, "
                    "lease_owner=NULL, lease_expires_at=NULL "
                    "WHERE id=? AND user_id=? AND status='running'",
                    (error, current, run_id, run_user_id),
                )
                await db.execute(
                    "UPDATE scheduled_research_jobs SET last_status='failed', last_error=?, "
                    "next_run_at=?, pending_idempotency_key=?, updated_at=datetime('now') "
                    "WHERE id=? AND user_id=?",
                    (error, current, run["idempotency_key"], job_id, run_user_id),
                )
                await _insert_research_run_event(
                    db, user_id=run_user_id, job_id=job_id, run_id=run_id,
                    event_type="failed",
                    payload={"status": "failed", "error": error, "reason": "lease_expired"},
                )
                retryable += 1
    return {"reconciled": reconciled, "retryable": retryable}


async def update_research_job(job_id: int, updates: JSONDict, user_id: int) -> JSONDict | None:
    current = await get_research_job(job_id, user_id)
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
        f"UPDATE scheduled_research_jobs SET {assignments}, updated_at=datetime('now') WHERE id=? AND user_id=?",
        (*values.values(), job_id, user_id),
    )
    return await get_research_job(job_id, user_id)


async def due_research_jobs(now: datetime | None = None) -> list[JSONDict]:
    current = format_local(now or datetime.now())
    return await database.query_all(
        """
        SELECT * FROM scheduled_research_jobs
        WHERE user_id IS NOT NULL AND is_enabled=1 AND next_run_at IS NOT NULL AND next_run_at<=?
          AND last_status!='running'
        ORDER BY next_run_at, id LIMIT 20
        """,
        (current,),
    )


async def mark_job_running(job_id: int, user_id: int, now: datetime | None = None) -> bool:
    current = now or datetime.now()
    job = await get_research_job(job_id, user_id)
    if job is None:
        return False
    cursor = await database.get_db().execute(
        """
        UPDATE scheduled_research_jobs
        SET last_status='running', last_error=NULL, last_run_at=?,
            next_run_at=?, updated_at=datetime('now')
        WHERE id=? AND user_id=? AND last_status!='running'
        """,
        (
            format_local(current),
            next_run_at(job["cron_expr"], current),
            job_id,
            user_id,
        ),
    )
    await database.get_db().commit()
    return cursor.rowcount == 1


async def mark_job_finished(job_id: int, user_id: int, *, error: str | None = None) -> None:
    await database.execute(
        "UPDATE scheduled_research_jobs SET last_status=?, last_error=?, updated_at=datetime('now') "
        "WHERE id=? AND user_id=?",
        ("failed" if error else "completed", error, job_id, user_id),
    )
