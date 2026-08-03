import pytest
import pytest_asyncio

from app import config, database
from app.services import alerts as alerts_service
from app.services.alerts import (
    DuplicateRuleError,
    create_rule,
    delete_rule,
    evaluate_signals,
    get_rule,
    list_rules,
    list_triggers,
    scan_enabled_rules,
    update_rule,
)


@pytest_asyncio.fixture
async def alert_db(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "DB_PATH", tmp_path / "alerts.db")
    await database.init_db()
    await database.execute("INSERT INTO users (id, email, is_admin) VALUES (1, 'alerts@test.local', 1)")
    try:
        yield
    finally:
        await database.close_db()
        database._db = None


@pytest.mark.asyncio
async def test_rule_lifecycle_and_duplicate_guard(alert_db):
    first = await create_rule("Apple 金叉", "usAAPL", "golden_cross", "bullish", user_id=1)
    assert first["is_enabled"] is True
    assert (await list_rules(user_id=1, enabled_only=True))[0]["id"] == first["id"]

    with pytest.raises(DuplicateRuleError):
        await create_rule("重复", "usAAPL", "golden_cross", "bullish", user_id=1)

    updated = await update_rule(first["id"], {"name": "Apple 金叉观察", "is_enabled": False}, 1)
    assert updated["name"] == "Apple 金叉观察"
    assert updated["is_enabled"] is False
    assert await list_rules(user_id=1, enabled_only=True) == []
    assert await delete_rule(first["id"], 1) is True
    assert await get_rule(first["id"], 1) is None
    assert await delete_rule(first["id"], 1) is False


@pytest.mark.asyncio
async def test_latest_signal_triggers_once_and_publishes_notification(alert_db):
    rule = await create_rule("Apple 看多", "usAAPL", "*", "bullish", user_id=1)
    signals = [
        {
            "type": "golden_cross",
            "index": 1,
            "direction": "bullish",
            "confidence": "high",
            "description": "MACD 金叉",
        },
        {
            "type": "breakout_down",
            "index": 1,
            "direction": "bearish",
            "confidence": "high",
            "description": "向下突破",
        },
    ]

    first = await evaluate_signals("usAAPL", signals, ["2026-07-28", "2026-07-29"], user_id=1)
    await database.execute(
        "UPDATE alert_triggers SET notification_id=NULL WHERE id=?",
        (first[0]["id"],),
    )
    second = await evaluate_signals("usAAPL", signals, ["2026-07-28", "2026-07-29"], user_id=1)

    assert len(first) == 1
    assert second == []
    trigger = (await list_triggers(user_id=1, rule_id=rule["id"]))[0]
    assert trigger["signal_type"] == "golden_cross"
    assert trigger["signal_date"] == "2026-07-29"
    assert trigger["notification_id"] is not None
    notification = await database.query_one(
        "SELECT event_type, source_id, dedupe_key FROM notifications WHERE id=?",
        (trigger["notification_id"],),
    )
    assert notification == {
        "event_type": "signal.alert",
        "source_id": str(trigger["id"]),
        "dedupe_key": f"alert-trigger:{trigger['id']}",
    }


@pytest.mark.asyncio
async def test_old_or_disabled_signal_does_not_trigger(alert_db):
    rule = await create_rule("Apple 金叉", "usAAPL", "golden_cross", user_id=1)
    old_signal = {
        "type": "golden_cross",
        "index": 0,
        "direction": "bullish",
        "confidence": "high",
        "description": "昨天的金叉",
    }
    assert await evaluate_signals("usAAPL", [old_signal], ["2026-07-28", "2026-07-29"], user_id=1) == []

    await update_rule(rule["id"], {"is_enabled": False}, 1)
    current_signal = {**old_signal, "index": 1}
    assert await evaluate_signals("usAAPL", [current_signal], ["2026-07-28", "2026-07-29"], user_id=1) == []


@pytest.mark.asyncio
async def test_deleting_rule_preserves_trigger_history(alert_db):
    rule = await create_rule("Apple 金叉", "usAAPL", "golden_cross", user_id=1)
    await evaluate_signals(
        "usAAPL",
        [{
            "type": "golden_cross",
            "index": 0,
            "direction": "bullish",
            "confidence": "high",
            "description": "MACD 金叉",
        }],
        ["2026-07-29"],
        user_id=1,
    )

    assert await delete_rule(rule["id"], 1) is True
    trigger = (await list_triggers(user_id=1))[0]
    assert trigger["rule_id"] is None
    assert trigger["rule_name"] == "Apple 金叉"


@pytest.mark.asyncio
async def test_scheduled_scan_deduplicates_tickers_and_isolates_market_failures(alert_db, monkeypatch):
    await create_rule("Apple 金叉", "usAAPL", "golden_cross", user_id=1)
    await create_rule("Apple 看多", "usAAPL", "*", "bullish", user_id=1)
    await create_rule("Microsoft 金叉", "usMSFT", "golden_cross", user_id=1)
    calls = []

    class FakeMarket:
        async def kline(self, ticker, period, count):
            calls.append((ticker, period, count))
            if ticker == "usMSFT":
                raise RuntimeError("provider unavailable")
            return [
                {
                    "day": f"2026-07-{index + 1:02d}",
                    "high": 101.0,
                    "low": 99.0,
                    "close": 100.0,
                    "volume": 1000.0,
                }
                for index in range(29)
            ]

    monkeypatch.setattr(alerts_service.indicators, "compute", lambda bars: {})
    monkeypatch.setattr(
        alerts_service.signal_detector,
        "detect_all",
        lambda ind, close, high, low, volume: [{
            "type": "golden_cross",
            "index": len(close) - 1,
            "direction": "bullish",
            "confidence": "high",
            "description": "MACD 金叉",
        }],
    )

    triggers = await scan_enabled_rules(FakeMarket(), max_targets=10, concurrency=2)

    assert len(triggers) == 2
    assert calls.count(("usAAPL", "1d", 120)) == 1
    assert calls.count(("usMSFT", "1d", 120)) == 1
