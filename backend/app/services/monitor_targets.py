"""Draft and explicitly confirm native object-bound technical monitors."""
from __future__ import annotations

import hashlib
import json
from typing import Any

from .. import database
from . import alerts


TARGET_TYPES = frozenset({"thesis", "portfolio", "strategy"})


async def _target(target_type: str, target_id: int, ticker: str | None, user_id: int) -> dict[str, Any]:
    if target_type == "thesis":
        row = await database.query_one(
            "SELECT id, title, ticker FROM thesis WHERE id=? AND user_id=?", (target_id, user_id)
        )
        if row is None:
            raise ValueError("Thesis 不存在或不属于当前用户")
        return {"type": target_type, "id": target_id, "title": row["title"], "ticker": row["ticker"]}
    if target_type == "portfolio":
        row = await database.query_one(
            "SELECT id, name FROM portfolios WHERE id=? AND user_id=?", (target_id, user_id)
        )
        if row is None:
            raise ValueError("Portfolio 不存在或不属于当前用户")
        if not ticker:
            raise ValueError("Portfolio monitor 必须由用户明确选择持仓 ticker")
        position = await database.query_one(
            "SELECT ticker FROM positions WHERE portfolio_id=? AND ticker=? AND user_id=?",
            (target_id, ticker, user_id),
        )
        if position is None:
            raise ValueError("所选 ticker 不在当前用户 Portfolio 中")
        return {"type": target_type, "id": target_id, "title": row["name"], "ticker": ticker}
    if target_type == "strategy":
        row = await database.query_one(
            "SELECT id, symbol, strategy_type FROM quant_backtests "
            "WHERE id=? AND user_id=? AND is_saved=1",
            (target_id, user_id),
        )
        if row is None:
            raise ValueError("已保存 Strategy 不存在或不属于当前用户")
        return {
            "type": target_type, "id": target_id,
            "title": f"{row['strategy_type']} #{target_id}", "ticker": row["symbol"],
        }
    raise ValueError("target_type 必须是 thesis、portfolio 或 strategy")


async def draft_monitor_target(
    *, target_type: str, target_id: int, ticker: str | None, name: str,
    signal_type: str | None, direction: str | None, user_id: int,
) -> dict[str, Any]:
    target_type = target_type.strip()
    if target_type not in TARGET_TYPES:
        raise ValueError("target_type 必须是 thesis、portfolio 或 strategy")
    target = await _target(target_type, target_id, ticker, user_id)
    if not signal_type:
        return {
            "status": "UNKNOWN", "ready_to_confirm": False, "confirmation_key": None,
            "target": target, "condition": None,
            "reason": "没有可验证技术条件；必须由用户明确选择 signal_type。",
            "execution_boundary": "确认前不创建或启用规则；确认后仅进入既有技术信号扫描。",
        }
    validated_signal = alerts._validate_signal_type(signal_type)
    validated_direction = alerts._validate_direction(direction)
    normalized_name = name.strip()[:100]
    if not normalized_name:
        raise ValueError("规则名称不能为空")
    payload = {
        "target_type": target_type, "target_id": target_id, "ticker": target["ticker"],
        "name": normalized_name, "signal_type": validated_signal, "direction": validated_direction,
    }
    confirmation_key = hashlib.sha256(
        json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()
    return {
        "status": "READY", "ready_to_confirm": True, "confirmation_key": confirmation_key,
        "target": target,
        "condition": {
            "kind": "technical_signal", "signal_type": validated_signal,
            "direction": validated_direction, "source": "user_selection", "quality_status": "UNKNOWN",
        },
        "reason": "技术条件由用户显式选择；尚未运行行情扫描。",
        "execution_boundary": "确认前不创建或启用规则；确认后仅进入既有技术信号扫描。",
        "name": normalized_name,
    }


async def confirm_monitor_target(**kwargs: Any) -> dict[str, Any]:
    draft = await draft_monitor_target(**kwargs)
    if not draft["ready_to_confirm"]:
        raise ValueError(draft["reason"])
    user_id = int(kwargs["user_id"])
    existing = await database.query_one(
        "SELECT * FROM alert_rules WHERE user_id=? AND confirmation_key=?",
        (user_id, draft["confirmation_key"]),
    )
    if existing is not None:
        existing["is_enabled"] = bool(existing["is_enabled"])
        return {"created": False, "rule": existing, "draft": draft}
    rule = await alerts.create_rule(
        draft["name"], draft["target"]["ticker"], draft["condition"]["signal_type"],
        draft["condition"]["direction"], user_id=user_id, is_enabled=True,
    )
    await database.execute(
        "UPDATE alert_rules SET target_type=?, target_id=?, confirmation_key=?, "
        "confirmed_at=datetime('now') WHERE id=? AND user_id=?",
        (draft["target"]["type"], draft["target"]["id"], draft["confirmation_key"], rule["id"], user_id),
    )
    confirmed = await alerts.get_rule(int(rule["id"]), user_id)
    return {"created": True, "rule": confirmed, "draft": draft}
