from __future__ import annotations

import pytest

from app import config, database
from app.services.monitor_targets import confirm_monitor_target, draft_monitor_target


@pytest.fixture
async def monitor_db(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "DB_PATH", tmp_path / "monitor-targets.db")
    await database.init_db()
    owner_id = await database.execute("INSERT INTO users (email) VALUES ('owner@test.local')")
    other_id = await database.execute("INSERT INTO users (email) VALUES ('other@test.local')")
    await database.claim_unowned_data(owner_id)
    try:
        yield owner_id, other_id
    finally:
        await database.close_db()


@pytest.mark.asyncio
async def test_draft_requires_explicit_condition_and_confirm_is_idempotent(monitor_db) -> None:
    owner_id, other_id = monitor_db
    thesis_id = await database.execute(
        "INSERT INTO thesis (ticker, title, thesis, user_id) VALUES ('usAAPL', 'Apple', 'Judgment', ?)",
        (owner_id,),
    )
    empty = await draft_monitor_target(
        target_type="thesis", target_id=thesis_id, ticker=None, name="Apple monitor",
        signal_type=None, direction=None, user_id=owner_id,
    )
    assert empty["status"] == "UNKNOWN"
    assert empty["ready_to_confirm"] is False
    assert empty["confirmation_key"] is None

    values = {
        "target_type": "thesis", "target_id": thesis_id, "ticker": None,
        "name": "Apple monitor", "signal_type": "death_cross", "direction": "bearish",
        "user_id": owner_id,
    }
    draft = await draft_monitor_target(**values)
    assert draft["ready_to_confirm"] is True
    assert draft["condition"]["source"] == "user_selection"
    assert draft["condition"]["quality_status"] == "UNKNOWN"
    assert await database.query_one("SELECT id FROM alert_rules WHERE user_id=?", (owner_id,)) is None

    first = await confirm_monitor_target(**values)
    second = await confirm_monitor_target(**values)
    assert first["created"] is True
    assert second["created"] is False
    assert first["rule"]["id"] == second["rule"]["id"]
    row = await database.query_one(
        "SELECT target_type, target_id, confirmation_key, confirmed_at, is_enabled "
        "FROM alert_rules WHERE id=? AND user_id=?",
        (first["rule"]["id"], owner_id),
    )
    assert row["target_type"] == "thesis"
    assert row["target_id"] == thesis_id
    assert row["confirmation_key"] == draft["confirmation_key"]
    assert row["confirmed_at"] is not None
    assert row["is_enabled"] == 1

    with pytest.raises(ValueError, match="不属于当前用户"):
        await draft_monitor_target(**{**values, "user_id": other_id})


@pytest.mark.asyncio
async def test_portfolio_requires_an_owned_position_ticker(monitor_db) -> None:
    owner_id, _ = monitor_db
    portfolio_id = await database.execute(
        "INSERT INTO portfolios (name, user_id) VALUES ('Core', ?)", (owner_id,)
    )
    await database.execute(
        "INSERT INTO positions (portfolio_id, ticker, shares, avg_cost, user_id) "
        "VALUES (?, 'usMSFT', 1, 100, ?)", (portfolio_id, owner_id),
    )
    with pytest.raises(ValueError, match="明确选择"):
        await draft_monitor_target(
            target_type="portfolio", target_id=portfolio_id, ticker=None, name="Core",
            signal_type="golden_cross", direction=None, user_id=owner_id,
        )
    draft = await draft_monitor_target(
        target_type="portfolio", target_id=portfolio_id, ticker="usMSFT", name="Core",
        signal_type="golden_cross", direction=None, user_id=owner_id,
    )
    assert draft["target"]["ticker"] == "usMSFT"
