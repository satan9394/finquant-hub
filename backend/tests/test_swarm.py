from __future__ import annotations

import json

import pytest
import pytest_asyncio
from fastapi import HTTPException

from app import config, database
from app.routers import research, swarm


@pytest_asyncio.fixture
async def swarm_cancel_db(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "DB_PATH", tmp_path / "swarm-cancel.db")
    monkeypatch.setattr(config, "LOCAL_ONLY_MODE", False)
    monkeypatch.setattr(config, "SCHEDULER_ENABLED", False)
    await database.init_db()
    user_id = await database.execute(
        "INSERT INTO users (email) VALUES (?)",
        ("swarm-cancel@test.local",),
    )
    try:
        yield user_id
    finally:
        await database.close_db()


@pytest.mark.asyncio
async def test_cancel_swarm_run_persists_event_and_owner_status(swarm_cancel_db):
    user_id = swarm_cancel_db
    report_id = await research._create_report("600519", "Fixture", None, user_id)
    await research._append_event(
        report_id,
        "team_started",
        {"team": {"key": "four-masters"}},
        user_id,
    )

    result = await swarm.cancel_swarm_run(report_id, {"id": user_id})

    report = await database.query_one(
        "SELECT status FROM research_reports WHERE id=? AND user_id=?",
        (report_id, user_id),
    )
    events = await database.query_all(
        "SELECT event_type, payload FROM research_events WHERE research_id=? AND user_id=? ORDER BY id",
        (report_id, user_id),
    )
    assert result == {"report_id": report_id, "status": "canceled"}
    assert report == {"status": "canceled"}
    assert [event["event_type"] for event in events] == ["team_started", "team_canceled"]
    assert json.loads(events[-1]["payload"]) == {"report_id": report_id}

    repeated = await swarm.cancel_swarm_run(report_id, {"id": user_id})
    assert repeated == result
    assert len(await database.query_all(
        "SELECT id FROM research_events WHERE research_id=? AND user_id=?",
        (report_id, user_id),
    )) == 2


@pytest.mark.asyncio
async def test_cancel_swarm_run_does_not_cross_owner_or_cancel_non_swarm(swarm_cancel_db):
    owner_id = swarm_cancel_db
    other_id = await database.execute(
        "INSERT INTO users (email) VALUES (?)",
        ("other-swarm@test.local",),
    )
    report_id = await research._create_report("600519", "Fixture", None, owner_id)
    await research._append_event(report_id, "team_started", {"team": {}}, owner_id)

    with pytest.raises(HTTPException) as not_owner:
        await swarm.cancel_swarm_run(report_id, {"id": other_id})
    assert not_owner.value.status_code == 404

    non_swarm_id = await research._create_report("600519", "Deep research", None, owner_id)
    await research._append_event(non_swarm_id, "agent_started", {"role_key": "analyst"}, owner_id)
    with pytest.raises(HTTPException) as not_swarm:
        await swarm.cancel_swarm_run(non_swarm_id, {"id": owner_id})
    assert not_swarm.value.status_code == 404

    report = await database.query_one(
        "SELECT status FROM research_reports WHERE id=? AND user_id=?",
        (report_id, owner_id),
    )
    assert report == {"status": "running"}
