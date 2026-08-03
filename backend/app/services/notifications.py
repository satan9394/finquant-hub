"""持久化通知发布、查询与 SSE 唤醒。"""

import asyncio
import json
import logging
from dataclasses import dataclass
from typing import Any, cast

from .. import database

LOGGER = logging.getLogger(__name__)
SEVERITIES = {"info", "success", "warning", "error"}
JSONDict = dict[str, Any]


@dataclass
class _Wakeup:
    loop: asyncio.AbstractEventLoop
    condition: asyncio.Condition
    revision: int = 0


_wakeup: _Wakeup | None = None


def _current_wakeup() -> _Wakeup:
    global _wakeup
    loop = asyncio.get_running_loop()
    if _wakeup is None or _wakeup.loop is not loop:
        _wakeup = _Wakeup(loop=loop, condition=asyncio.Condition())
    return _wakeup


def notification_revision() -> int:
    return _current_wakeup().revision


async def wait_for_notifications(revision: int, timeout: float = 15.0) -> int:
    """等待进程内发布信号；超时后由调用方回查数据库以覆盖跨进程写入。"""
    wakeup = _current_wakeup()
    async with wakeup.condition:
        if wakeup.revision == revision:
            try:
                await asyncio.wait_for(wakeup.condition.wait(), timeout=timeout)
            except TimeoutError:
                pass
        return wakeup.revision


def _deserialize(row: JSONDict) -> JSONDict:
    item = dict(row)
    item["payload"] = json.loads(item.get("payload") or "{}")
    item["is_read"] = bool(item.get("is_read"))
    return item


async def publish_notification(
    event_type: str,
    title: str,
    body: str,
    *,
    user_id: int,
    severity: str = "info",
    source_type: str | None = None,
    source_id: str | int | None = None,
    payload: JSONDict | None = None,
    dedupe_key: str | None = None,
) -> JSONDict | None:
    """持久化并广播一条通知；重复 dedupe_key 返回 None。"""
    if severity not in SEVERITIES:
        raise ValueError(f"未知通知级别：{severity}")
    event_type = event_type.strip()[:100]
    title = title.strip()[:200]
    body = body.strip()[:1000]
    if not event_type or not title or not body:
        raise ValueError("event_type、title、body 不能为空")

    db = database.get_db()
    cursor = await db.execute(
        """
        INSERT INTO notifications (
            event_type, title, body, severity, source_type, source_id, payload, dedupe_key, user_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, dedupe_key) DO NOTHING
        """,
        (
            event_type,
            title,
            body,
            severity,
            source_type,
            str(source_id) if source_id is not None else None,
            json.dumps(payload or {}, ensure_ascii=False),
            dedupe_key,
            user_id,
        ),
    )
    await db.commit()
    if cursor.rowcount != 1:
        return None

    item = await database.query_one(
        "SELECT * FROM notifications WHERE id=? AND user_id=?", (cursor.lastrowid, user_id)
    )
    wakeup = _current_wakeup()
    async with wakeup.condition:
        wakeup.revision += 1
        wakeup.condition.notify_all()
    return _deserialize(cast(JSONDict, item))


async def list_notifications(
    *,
    user_id: int,
    after_id: int = 0,
    limit: int = 50,
    unread_only: bool = False,
) -> list[JSONDict]:
    if after_id < 0:
        raise ValueError("after_id 不能小于 0")
    if not 1 <= limit <= 100:
        raise ValueError("limit 必须在 1 到 100 之间")
    unread_clause = "AND is_read=0" if unread_only else ""
    rows = await database.query_all(
        f"SELECT * FROM notifications WHERE id>? AND user_id=? {unread_clause} ORDER BY id ASC LIMIT ?",
        (after_id, user_id, limit),
    )
    return [_deserialize(row) for row in rows]


async def recent_notifications(*, user_id: int, limit: int = 50, unread_only: bool = False) -> list[JSONDict]:
    if not 1 <= limit <= 100:
        raise ValueError("limit 必须在 1 到 100 之间")
    unread_clause = "AND is_read=0" if unread_only else ""
    rows = await database.query_all(
        f"SELECT * FROM notifications WHERE user_id=? {unread_clause} ORDER BY id DESC LIMIT ?",
        (user_id, limit),
    )
    return [_deserialize(row) for row in rows]


async def unread_count(user_id: int) -> int:
    row = await database.query_one(
        "SELECT COUNT(*) AS count FROM notifications WHERE is_read=0 AND user_id=?", (user_id,)
    )
    return int((row or {}).get("count", 0))


async def mark_notification_read(notification_id: int, user_id: int) -> bool:
    db = database.get_db()
    cursor = await db.execute(
        "UPDATE notifications SET is_read=1 WHERE id=? AND is_read=0 AND user_id=?",
        (notification_id, user_id),
    )
    await db.commit()
    return cursor.rowcount == 1


async def mark_all_notifications_read(user_id: int) -> int:
    db = database.get_db()
    cursor = await db.execute("UPDATE notifications SET is_read=1 WHERE is_read=0 AND user_id=?", (user_id,))
    await db.commit()
    return cursor.rowcount


async def publish_research_status(
    report_id: int,
    status: str,
    message: str | None = None,
    *,
    user_id: int,
) -> JSONDict | None:
    """发布研究终态；通知故障不得反向破坏已完成的研究。"""
    try:
        report = await database.query_one(
            "SELECT ticker, company_name FROM research_reports WHERE id=? AND user_id=?",
            (report_id, user_id),
        )
        if not report:
            return None
        name = report.get("company_name") or report["ticker"]
        completed = status == "completed"
        return await publish_notification(
            f"research.{status}",
            f"研究{'完成' if completed else '失败'} · {name}",
            message or (
                f"{report['ticker']} 的多智能体研究报告已生成。"
                if completed else f"{report['ticker']} 的研究任务未完成。"
            ),
            severity="success" if completed else "error",
            source_type="research_report",
            source_id=report_id,
            payload={"url": "/research/reports", "ticker": report["ticker"], "status": status},
            dedupe_key=f"research:{report_id}:{status}",
            user_id=user_id,
        )
    except Exception:
        LOGGER.exception("Failed to publish research notification for report %s", report_id)
        return None


async def publish_backtest_status(
    run_id: int,
    status: str,
    message: str | None = None,
    *,
    user_id: int,
) -> JSONDict | None:
    """发布回测终态；通知故障不得反向破坏回测结果。"""
    try:
        run = await database.query_one(
            "SELECT symbol, error_message FROM quant_backtests WHERE id=? AND user_id=?",
            (run_id, user_id),
        )
        if not run:
            return None
        completed = status == "completed"
        cancelled = status == "cancelled"
        label = "完成" if completed else "已取消" if cancelled else "失败"
        severity = "success" if completed else "warning" if cancelled else "error"
        return await publish_notification(
            f"backtest.{status}",
            f"回测{label} · {run['symbol']}",
            message or run.get("error_message") or f"回测任务状态：{label}",
            severity=severity,
            source_type="backtest_run",
            source_id=run_id,
            payload={
                "url": f"/strategy-lab/ma-crossover?symbol={run['symbol']}",
                "symbol": run["symbol"],
                "status": status,
            },
            dedupe_key=f"backtest:{run_id}:{status}",
            user_id=user_id,
        )
    except Exception:
        LOGGER.exception("Failed to publish backtest notification for run %s", run_id)
        return None
