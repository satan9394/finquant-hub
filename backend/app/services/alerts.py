"""基于技术信号的预警规则与幂等触发账本。"""

import asyncio
import logging
import sqlite3

from .. import database
from . import indicators
from .analysis import signals as signal_detector
from .market_data import MarketDataService
from .notifications import publish_notification

LOGGER = logging.getLogger(__name__)

SIGNAL_TYPES = frozenset({
    "*",
    "golden_cross",
    "death_cross",
    "top_divergence",
    "bottom_divergence",
    "breakout_up",
    "breakout_down",
    "volume_surge",
    "rsi_oversold",
    "rsi_overbought",
})
DIRECTIONS = frozenset({"bullish", "bearish", "neutral"})


class DuplicateRuleError(ValueError):
    """相同股票、信号类型与方向的规则已存在。"""


def _rule(row: dict) -> dict:
    item = dict(row)
    item["is_enabled"] = bool(item["is_enabled"])
    return item


def _validate_signal_type(signal_type: str) -> str:
    value = signal_type.strip()
    if value not in SIGNAL_TYPES:
        raise ValueError(f"不支持的信号类型：{value}")
    return value


def _validate_direction(direction: str | None) -> str | None:
    if direction is None:
        return None
    value = direction.strip()
    if value not in DIRECTIONS:
        raise ValueError(f"不支持的信号方向：{value}")
    return value


async def create_rule(
    name: str,
    ticker: str,
    signal_type: str,
    direction: str | None = None,
    *,
    is_enabled: bool = True,
) -> dict:
    name = name.strip()[:100]
    if not name:
        raise ValueError("规则名称不能为空")
    signal_type = _validate_signal_type(signal_type)
    direction = _validate_direction(direction)
    try:
        rule_id = await database.execute(
            """
            INSERT INTO alert_rules (name, ticker, signal_type, direction, is_enabled)
            VALUES (?, ?, ?, ?, ?)
            """,
            (name, ticker, signal_type, direction, int(is_enabled)),
        )
    except sqlite3.IntegrityError as exc:
        raise DuplicateRuleError("相同股票、信号类型与方向的规则已存在") from exc
    return _rule(await database.query_one("SELECT * FROM alert_rules WHERE id=?", (rule_id,)))


async def list_rules(*, enabled_only: bool = False) -> list[dict]:
    where = "WHERE is_enabled=1" if enabled_only else ""
    rows = await database.query_all(f"SELECT * FROM alert_rules {where} ORDER BY id DESC")
    return [_rule(row) for row in rows]


async def get_rule(rule_id: int) -> dict | None:
    row = await database.query_one("SELECT * FROM alert_rules WHERE id=?", (rule_id,))
    return _rule(row) if row else None


async def update_rule(rule_id: int, changes: dict) -> dict | None:
    current = await get_rule(rule_id)
    if current is None:
        return None

    values = {
        "name": current["name"],
        "ticker": current["ticker"],
        "signal_type": current["signal_type"],
        "direction": current["direction"],
        "is_enabled": current["is_enabled"],
    }
    values.update(changes)
    values["name"] = values["name"].strip()[:100]
    if not values["name"]:
        raise ValueError("规则名称不能为空")
    values["signal_type"] = _validate_signal_type(values["signal_type"])
    values["direction"] = _validate_direction(values["direction"])

    try:
        await database.execute(
            """
            UPDATE alert_rules
            SET name=?, ticker=?, signal_type=?, direction=?, is_enabled=?, updated_at=datetime('now')
            WHERE id=?
            """,
            (
                values["name"],
                values["ticker"],
                values["signal_type"],
                values["direction"],
                int(values["is_enabled"]),
                rule_id,
            ),
        )
    except sqlite3.IntegrityError as exc:
        raise DuplicateRuleError("相同股票、信号类型与方向的规则已存在") from exc
    return await get_rule(rule_id)


async def delete_rule(rule_id: int) -> bool:
    db = database.get_db()
    cursor = await db.execute("DELETE FROM alert_rules WHERE id=?", (rule_id,))
    await db.commit()
    return cursor.rowcount == 1


async def list_triggers(
    *,
    rule_id: int | None = None,
    ticker: str | None = None,
    limit: int = 50,
) -> list[dict]:
    if not 1 <= limit <= 100:
        raise ValueError("limit 必须在 1 到 100 之间")
    clauses: list[str] = []
    params: list[str | int] = []
    if rule_id is not None:
        clauses.append("rule_id=?")
        params.append(rule_id)
    if ticker is not None:
        clauses.append("ticker=?")
        params.append(ticker)
    where = f"WHERE {' AND '.join(clauses)}" if clauses else ""
    params.append(limit)
    return await database.query_all(
        f"SELECT * FROM alert_triggers {where} ORDER BY id DESC LIMIT ?",
        tuple(params),
    )


def _matches(rule: dict, signal: dict) -> bool:
    return (
        rule["signal_type"] in ("*", signal["type"])
        and (rule["direction"] is None or rule["direction"] == signal["direction"])
    )


async def _publish_trigger(trigger: dict) -> None:
    if trigger.get("notification_id") is not None:
        return
    severity = {
        "bullish": "success",
        "bearish": "warning",
        "neutral": "info",
    }[trigger["direction"]]
    notification = await publish_notification(
        "signal.alert",
        f"预警触发 · {trigger['rule_name']}",
        f"{trigger['ticker']} · {trigger['description']}",
        severity=severity,
        source_type="alert_trigger",
        source_id=trigger["id"],
        payload={
            "url": f"/analysis/{trigger['ticker']}",
            "ticker": trigger["ticker"],
            "signal_type": trigger["signal_type"],
            "direction": trigger["direction"],
            "signal_date": trigger["signal_date"],
        },
        dedupe_key=f"alert-trigger:{trigger['id']}",
    )
    if notification is None:
        notification = await database.query_one(
            "SELECT id FROM notifications WHERE dedupe_key=?",
            (f"alert-trigger:{trigger['id']}",),
        )
    if notification is not None:
        await database.execute(
            "UPDATE alert_triggers SET notification_id=? WHERE id=?",
            (notification["id"], trigger["id"]),
        )


async def evaluate_signals(ticker: str, signals: list[dict], days: list[str]) -> list[dict]:
    """只评估最新交易日的信号，并为每条规则幂等创建触发记录。"""
    if not days:
        return []
    rules = await database.query_all(
        "SELECT * FROM alert_rules WHERE is_enabled=1 AND ticker=? ORDER BY id",
        (ticker,),
    )
    if not rules:
        return []

    latest_index = len(days) - 1
    created: list[dict] = []
    for signal in signals:
        if signal.get("index") != latest_index:
            continue
        signal_type = signal.get("type")
        direction = signal.get("direction")
        if signal_type not in SIGNAL_TYPES - {"*"} or direction not in DIRECTIONS:
            continue
        for rule in rules:
            if not _matches(rule, signal):
                continue
            dedupe_key = f"{rule['id']}:{ticker}:{signal_type}:{days[latest_index]}"
            db = database.get_db()
            cursor = await db.execute(
                """
                INSERT INTO alert_triggers (
                    rule_id, rule_name, ticker, signal_type, direction,
                    confidence, signal_date, description, dedupe_key
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(dedupe_key) DO NOTHING
                """,
                (
                    rule["id"],
                    rule["name"],
                    ticker,
                    signal_type,
                    direction,
                    signal.get("confidence"),
                    days[latest_index],
                    str(signal.get("description") or signal_type)[:1000],
                    dedupe_key,
                ),
            )
            await db.commit()
            trigger = await database.query_one(
                "SELECT * FROM alert_triggers WHERE dedupe_key=?",
                (dedupe_key,),
            )
            try:
                await _publish_trigger(trigger)
            except Exception:
                LOGGER.exception("Failed to publish alert trigger %s", trigger["id"])
            if cursor.rowcount == 1:
                created.append(
                    await database.query_one("SELECT * FROM alert_triggers WHERE id=?", (trigger["id"],))
                )
    return created


async def scan_enabled_rules(
    market: MarketDataService,
    *,
    max_targets: int = 20,
    concurrency: int = 2,
) -> list[dict]:
    """按股票去重扫描启用规则；单个行情失败不阻断其他规则。"""
    target_limit = min(1000, max(1, max_targets))
    worker_limit = min(20, max(1, concurrency))
    rows = await database.query_all(
        "SELECT DISTINCT ticker FROM alert_rules WHERE is_enabled=1 ORDER BY ticker LIMIT ?",
        (target_limit,),
    )
    semaphore = asyncio.Semaphore(worker_limit)

    async def scan(ticker: str) -> list[dict]:
        async with semaphore:
            try:
                bars = await market.kline(ticker, "1d", 120)
                computed = indicators.compute(bars)
                close = [bar["close"] for bar in bars]
                detected = signal_detector.detect_all(
                    computed,
                    close,
                    [bar["high"] for bar in bars],
                    [bar["low"] for bar in bars],
                    [bar["volume"] for bar in bars],
                )
                return await evaluate_signals(ticker, detected, [bar["day"] for bar in bars])
            except asyncio.CancelledError:
                raise
            except Exception:
                LOGGER.exception("Alert scan failed for %s", ticker)
                return []

    groups = await asyncio.gather(*(scan(row["ticker"]) for row in rows))
    return [trigger for group in groups for trigger in group]
