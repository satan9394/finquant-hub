from __future__ import annotations

import pytest
import pytest_asyncio

from app import config, database
from app.services.monitor_targets import confirm_monitor_target, draft_monitor_target


@pytest_asyncio.fixture(autouse=True)
async def monitor_db(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "DB_PATH", tmp_path / "monitor-target-branches.db")
    await database.init_db()
    await database.execute("INSERT INTO users (id, email) VALUES (1, 'owner@fixture.local')")
    try:
        yield
    finally:
        await database.close_db()


def _values(**updates):
    values = {
        "target_type": "thesis", "target_id": 1, "ticker": None, "name": "fixture",
        "signal_type": "golden_cross", "direction": "bullish", "user_id": 1,
    }
    values.update(updates)
    return values


@pytest.mark.asyncio
async def test_invalid_target_type_and_missing_thesis_are_rejected():
    with pytest.raises(ValueError, match="target_type"):
        await draft_monitor_target(**_values(target_type="unknown"))
    with pytest.raises(ValueError, match="Thesis 不存在"):
        await draft_monitor_target(**_values())


@pytest.mark.asyncio
async def test_portfolio_binding_requires_owner_and_existing_position():
    with pytest.raises(ValueError, match="Portfolio 不存在"):
        await draft_monitor_target(**_values(target_type="portfolio", ticker="usAAPL"))

    portfolio_id = await database.execute("INSERT INTO portfolios (name, user_id) VALUES ('Core', 1)")
    with pytest.raises(ValueError, match="不在当前用户 Portfolio"):
        await draft_monitor_target(**_values(target_type="portfolio", target_id=portfolio_id, ticker="usAAPL"))


@pytest.mark.asyncio
async def test_saved_strategy_binding_and_empty_name_validation():
    strategy_id = await database.execute(
        "INSERT INTO quant_backtests (user_id, symbol, strategy_type, params_json, is_saved) "
        "VALUES (1, 'usAAPL', 'ma_crossover', '{}', 1)"
    )
    draft = await draft_monitor_target(**_values(target_type="strategy", target_id=strategy_id))
    assert draft["target"] == {
        "type": "strategy", "id": strategy_id, "title": f"ma_crossover #{strategy_id}", "ticker": "usAAPL",
    }

    thesis_id = await database.execute(
        "INSERT INTO thesis (user_id, ticker, title, thesis) VALUES (1, 'usAAPL', 'Apple', 'claim')"
    )
    with pytest.raises(ValueError, match="规则名称不能为空"):
        await draft_monitor_target(**_values(target_id=thesis_id, name="   "))


@pytest.mark.asyncio
async def test_confirmation_rejects_unknown_condition():
    thesis_id = await database.execute(
        "INSERT INTO thesis (user_id, ticker, title, thesis) VALUES (1, 'usAAPL', 'Apple', 'claim')"
    )
    with pytest.raises(ValueError, match="没有可验证技术条件"):
        await confirm_monitor_target(**_values(target_id=thesis_id, signal_type=None))
