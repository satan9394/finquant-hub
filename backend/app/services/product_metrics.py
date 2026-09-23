"""Opt-in local product metrics with a deliberately tiny privacy allowlist."""
from __future__ import annotations

import logging
import math
from statistics import median
from typing import Any

from .. import database


LOGGER = logging.getLogger(__name__)
EVENT_NAMES = {
    "first_value",
    "result_saved",
    "workflow_continued",
    "repeat_research",
}


def _validate_event(event_name: str, value: int | None) -> None:
    if event_name not in EVENT_NAMES:
        raise ValueError(f"不支持的产品指标事件：{event_name}")
    if event_name == "first_value":
        if value is None or not 0 <= value <= 86_400_000:
            raise ValueError("first_value.value 必须是 0..86400000 毫秒")
    elif event_name == "repeat_research":
        if value is None or not 0 <= value <= 365:
            raise ValueError("repeat_research.value 必须是 0..365 天")
    elif value is not None:
        raise ValueError(f"{event_name} 不接受 value")


async def product_metrics_enabled(user_id: int) -> bool:
    row = await database.query_one(
        "SELECT enabled FROM product_metric_preferences WHERE user_id=?", (user_id,)
    )
    return bool(row and row["enabled"])


async def set_product_metrics_enabled(user_id: int, enabled: bool) -> None:
    await database.execute(
        "INSERT INTO product_metric_preferences (user_id, enabled) VALUES (?, ?) "
        "ON CONFLICT(user_id) DO UPDATE SET enabled=excluded.enabled, updated_at=datetime('now')",
        (user_id, int(enabled)),
    )


async def record_product_metric(
    user_id: int,
    event_name: str,
    *,
    value: int | None = None,
) -> bool:
    """Best-effort event intake; database failures never escape to a business caller."""
    _validate_event(event_name, value)
    try:
        if not await product_metrics_enabled(user_id):
            return False
        await database.execute(
            "DELETE FROM product_metric_events "
            "WHERE user_id=? AND occurred_at < datetime('now', '-90 days')",
            (user_id,),
        )
        await database.execute(
            "INSERT INTO product_metric_events (user_id, event_name, value) VALUES (?, ?, ?)",
            (user_id, event_name, value),
        )
        return True
    except Exception:
        LOGGER.exception("Local product metric write failed")
        return False


async def get_product_metrics(user_id: int) -> dict[str, Any]:
    rows = await database.query_all(
        "SELECT event_name, value FROM product_metric_events "
        "WHERE user_id=? AND occurred_at >= datetime('now', '-90 days') ORDER BY id",
        (user_id,),
    )
    ttfv = sorted(
        int(row["value"])
        for row in rows
        if row["event_name"] == "first_value" and row["value"] is not None
    )
    enough = len(ttfv) >= 10
    return {
        "enabled": await product_metrics_enabled(user_id),
        "retention_days": 90,
        "events_total": len(rows),
        "counts": {
            "result_saved": sum(row["event_name"] == "result_saved" for row in rows),
            "workflow_continued": sum(row["event_name"] == "workflow_continued" for row in rows),
            "repeat_research": sum(row["event_name"] == "repeat_research" for row in rows),
            "repeat_research_within_7d": sum(
                row["event_name"] == "repeat_research"
                and row["value"] is not None
                and int(row["value"]) <= 7
                for row in rows
            ),
        },
        "ttfv": {
            "count": len(ttfv),
            "median_ms": float(median(ttfv)) if enough else None,
            "p90_ms": ttfv[math.ceil(0.9 * len(ttfv)) - 1] if enough else None,
            "insufficient_sample": not enough,
        },
    }


async def clear_product_metrics(user_id: int) -> int:
    cursor = await database.get_db().execute(
        "DELETE FROM product_metric_events WHERE user_id=?", (user_id,)
    )
    await database.get_db().commit()
    return cursor.rowcount
