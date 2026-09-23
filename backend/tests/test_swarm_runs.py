"""W2：`GET /api/swarm/runs` 只读回放列表的契约测试。

覆盖三条最容易做错的断言：
1. **只返回 swarm 运行**——同一 ticker 下混有深度研究报告时，后者必须被排除；
2. **用户隔离**——他人报告不得出现在结果里，且不能靠"本来就没数据"蒙对；
3. **首事件语义**——归属判定是"最小 event id 恰为 `team_started`"，不是"存在 `team_started`"。

事件一律走生产写入路径 `app.routers.research._append_event`（`routers/swarm.py` 用的同一函数），
因此本文件同时验证 payload/列映射没有被测试替身绕过。
"""

import hashlib
import json

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app import config, database
from app.main import app
from app.routers.research import _append_event

AAPL = "usAAPL"
MAOTAI = "sh600519"


async def _insert_report(
    ticker: str,
    company_name: str,
    user_id: int,
    status: str = "completed",
    report_data: str = "{}",
    agent_results: str = "{}",
) -> int:
    return await database.execute(
        "INSERT INTO research_reports "
        "(ticker, company_name, report_data, agent_results, model_id, status, updated_at, user_id) "
        "VALUES (?, ?, ?, ?, NULL, ?, datetime('now'), ?)",
        (ticker, company_name, report_data, agent_results, status, user_id),
    )


# 真实深度研究报告的载荷形态：非空 chapters + 四位研究 agent 的结果。
# 用"空载荷"做夹具会让"看 report_data 猜类型"的错误实现也蒙混过关。
_DEEP_REPORT_DATA = json.dumps(
    {"schema_version": 2, "quality": "audited", "chapters": [{"title": "公司概况", "content": "……"}]},
    ensure_ascii=False,
)
_DEEP_AGENT_RESULTS = json.dumps(
    {"business_analyst": {"status": "completed", "content": "商业模式"}, "risk_manager": {"status": "completed", "content": "风险"}},
    ensure_ascii=False,
)
# swarm 运行同样落一份非空 chapters 的 completed 报告：两类报告的载荷形态刻意保持同构，
# 唯一区别只能是事件流——判定不许落在 `report_data`/`agent_results` 的内容上。
_SWARM_REPORT_DATA = json.dumps(
    {"schema_version": 2, "quality": "audited", "chapters": [{"title": "团队结论", "content": "……"}]},
    ensure_ascii=False,
)


def _team_started_payload(team_key: str, team_name: str, ticker: str) -> dict:
    return {
        "team": {
            "key": team_key,
            "name": team_name,
            "description": f"{team_name} 拓扑",
            "agents": [{"key": "buffett", "name": "巴菲特", "avatar": "", "dependencies": [], "tools": []}],
        },
        "ticker": ticker,
        "company_name": ticker,
        "model": {"id": None, "name": "DeepSeek Flash"},
    }


@pytest_asyncio.fixture
async def swarm_runs_env(tmp_path, monkeypatch):
    """两个 owner + 同一 ticker 下混杂的深度研究报告与 swarm 运行。

    必须显式关闭 local-only，否则所有请求都落为同一本地所有者，跨用户断言必然失真
    （与 `test_user_isolation.py` 同一处理）。
    """
    monkeypatch.setattr(config, "DB_PATH", tmp_path / "swarm_runs.db")
    monkeypatch.setattr(config, "LOCAL_ONLY_MODE", False)
    monkeypatch.setattr(config, "SCHEDULER_ENABLED", False)
    async with app.router.lifespan_context(app):
        owner = await database.execute("INSERT INTO users (email, is_admin) VALUES ('owner@test.local', 1)")
        other = await database.execute("INSERT INTO users (email) VALUES ('other@test.local')")
        await database.claim_unowned_data(owner)
        await database.seed_models_for_user(other)

        tokens = {owner: "owner-token", other: "other-token"}
        for user_id, token in tokens.items():
            await database.execute(
                "INSERT INTO sessions (user_id, token_hash, expires_at) VALUES (?, ?, datetime('now', '+1 day'))",
                (user_id, hashlib.sha256(token.encode()).hexdigest()),
            )

        ids: dict[str, int] = {}

        # --- 同一 ticker（AAPL）下的深度研究报告：首个事件不是 team_started ⇒ 必须排除 ---
        # 载荷按真实形态填满（chapters + agent_results），避免"空报告"掩盖按内容猜测的错误实现。
        ids["deep"] = await _insert_report(
            AAPL, "苹果·深度研究", owner, report_data=_DEEP_REPORT_DATA, agent_results=_DEEP_AGENT_RESULTS
        )
        await _append_event(ids["deep"], "agent_started", {"role_key": "business_analyst"}, owner)
        await _append_event(ids["deep"], "agent_completed", {"role_key": "business_analyst"}, owner)
        await _append_event(ids["deep"], "done", {"ticker": AAPL}, owner)

        # --- 历史遗留报告：零事件（真实库中 1-4 号报告即此形态）⇒ 必须排除 ---
        ids["legacy"] = await _insert_report(AAPL, "苹果·无事件", owner, status="failed")

        # --- 首个事件是 team_started 的 swarm 运行 ⇒ 必须包含 ---
        ids["four_masters"] = await _insert_report(AAPL, "苹果", owner, report_data=_SWARM_REPORT_DATA)
        await _append_event(ids["four_masters"], "team_started", _team_started_payload("four-masters", "四大师投研团队", AAPL), owner)
        await _append_event(ids["four_masters"], "agent_started", {"role_key": "buffett"}, owner)
        await _append_event(ids["four_masters"], "done", {"ticker": AAPL}, owner)

        ids["earnings"] = await _insert_report(AAPL, "苹果", owner, report_data=_SWARM_REPORT_DATA)
        await _append_event(ids["earnings"], "team_started", _team_started_payload("earnings-review", "六 Agent 财报精读团队", AAPL), owner)
        await _append_event(ids["earnings"], "done", {"ticker": AAPL}, owner)

        # --- 防御性边界：team_started 载荷不是合法 JSON ⇒ 仍列出，team_key/name 降级为 None ---
        ids["broken_payload"] = await _insert_report(AAPL, "苹果", owner)
        await database.execute(
            "INSERT INTO research_events (research_id, event_type, agent_role_key, payload, user_id) "
            "VALUES (?, 'team_started', NULL, 'not-json', ?)",
            (ids["broken_payload"], owner),
        )

        # --- 首个事件不是 team_started、但之后有 team_started：区分 FIRST 与 EXISTS 两种实现 ---
        ids["late_team_started"] = await _insert_report(AAPL, "苹果·迟到团队事件", owner)
        await _append_event(ids["late_team_started"], "agent_started", {"role_key": "risk_manager"}, owner)
        await _append_event(ids["late_team_started"], "team_started", _team_started_payload("four-masters", "四大师投研团队", AAPL), owner)

        # --- 另一个 ticker 的 swarm 运行 ⇒ 不出现在 AAPL 结果里 ---
        ids["other_ticker"] = await _insert_report(MAOTAI, "贵州茅台", owner)
        await _append_event(ids["other_ticker"], "team_started", _team_started_payload("four-masters", "四大师投研团队", MAOTAI), owner)

        # --- 另一个用户的同 ticker swarm 运行 ⇒ 对 owner 不可见（但数据真实存在） ---
        ids["other_user"] = await _insert_report(AAPL, "苹果·他人", other)
        await _append_event(ids["other_user"], "team_started", _team_started_payload("four-masters", "四大师投研团队", AAPL), other)

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            def auth(user_id: int) -> dict[str, str]:
                return {"Cookie": f"{config.AUTH_COOKIE_NAME}={tokens[user_id]}"}

            yield client, auth, owner, other, ids


@pytest.mark.asyncio
async def test_runs_endpoint_returns_only_swarm_runs_for_the_ticker(swarm_runs_env):
    """③ 同一 ticker 下混有深度研究报告时，只有首个事件是 team_started 的运行被返回。"""
    client, auth, owner, _other, ids = swarm_runs_env

    response = await client.get("/api/swarm/runs", params={"ticker": AAPL}, headers=auth(owner))
    assert response.status_code == 200, response.text
    body = response.json()

    returned = [item["report_id"] for item in body["items"]]
    assert returned == [ids["broken_payload"], ids["earnings"], ids["four_masters"]]
    assert body["total"] == 3

    # 深度研究报告（同 ticker、有事件、状态 completed）必须被排除
    assert ids["deep"] not in returned
    # 零事件的历史报告必须被排除
    assert ids["legacy"] not in returned
    # 首个事件是 agent_started、team_started 出现在其后 ⇒ 按"首个事件"语义排除
    assert ids["late_team_started"] not in returned
    # 其他 ticker 的运行必须被排除
    assert ids["other_ticker"] not in returned

    by_id = {item["report_id"]: item for item in body["items"]}
    assert by_id[ids["four_masters"]]["team_key"] == "four-masters"
    assert by_id[ids["earnings"]]["team_key"] == "earnings-review"
    assert by_id[ids["broken_payload"]]["team_key"] is None
    assert by_id[ids["four_masters"]]["ticker"] == AAPL
    assert by_id[ids["four_masters"]]["company_name"] == "苹果"
    assert by_id[ids["four_masters"]]["status"] == "completed"
    assert by_id[ids["four_masters"]]["created_at"]

    # 团队名从 team_started 载荷里取，供前端直接展示
    assert by_id[ids["earnings"]]["team_name"] == "六 Agent 财报精读团队"


@pytest.mark.asyncio
async def test_runs_endpoint_scopes_to_the_current_user(swarm_runs_env):
    """② 他人报告不可见；并且证明"看不到"不是因为库里没有这份数据。"""
    client, auth, owner, other, ids = swarm_runs_env

    owner_runs = (await client.get("/api/swarm/runs", params={"ticker": AAPL}, headers=auth(owner))).json()
    other_runs = (await client.get("/api/swarm/runs", params={"ticker": AAPL}, headers=auth(other))).json()

    owner_ids = [item["report_id"] for item in owner_runs["items"]]
    other_ids = [item["report_id"] for item in other_runs["items"]]
    assert ids["other_user"] not in owner_ids
    assert other_ids == [ids["other_user"]]
    assert set(owner_ids).isdisjoint(other_ids)

    # 该行确实存在于库中（同一 ticker、同一归属事件），排除"本来就没数据"的假阳性
    stored = await database.query_one(
        "SELECT user_id, event_type FROM research_events WHERE research_id=? ORDER BY id LIMIT 1",
        (ids["other_user"],),
    )
    assert stored == {"user_id": other, "event_type": "team_started"}

    # 未认证请求不得拿到任何行
    anonymous = await client.get("/api/swarm/runs", params={"ticker": AAPL})
    assert anonymous.status_code == 401


@pytest.mark.asyncio
async def test_runs_endpoint_matches_normalized_and_raw_ticker_and_validates_input(swarm_runs_env):
    """ticker 同时接受裸代码与规范化代码；空 ticker 由 FastAPI 直接拒绝。"""
    client, auth, owner, _other, ids = swarm_runs_env
    headers = auth(owner)

    for raw in ("AAPL", "usAAPL", "aapl"):
        payload = (await client.get("/api/swarm/runs", params={"ticker": raw}, headers=headers)).json()
        assert [item["report_id"] for item in payload["items"]] == [
            ids["broken_payload"],
            ids["earnings"],
            ids["four_masters"],
        ], raw

    for raw in ("600519", "sh600519"):
        payload = (await client.get("/api/swarm/runs", params={"ticker": raw}, headers=headers)).json()
        assert [item["report_id"] for item in payload["items"]] == [ids["other_ticker"]], raw

    empty = await client.get("/api/swarm/runs", params={"ticker": ""}, headers=headers)
    assert empty.status_code == 422

    # 未知代码、无法规范化的输入、纯空白：都退化为空列表，不报错也不退化成全量列表
    for raw in ("usZZZZ", "@@@", " "):
        payload = (await client.get("/api/swarm/runs", params={"ticker": raw}, headers=headers)).json()
        assert payload == {"items": [], "total": 0}, raw


@pytest.mark.asyncio
async def test_runs_endpoint_is_read_only_get_without_side_effects(swarm_runs_env):
    """端点必须是只读 GET：不改库、不落事件、不新增报告。"""
    client, auth, owner, _other, _ids = swarm_runs_env

    # 只读 GET：OpenAPI 里该路径只有 get 一个操作，没有 post/put/patch/delete
    operations = app.openapi()["paths"]["/api/swarm/runs"]
    assert set(operations) == {"get"}

    before_events = await database.query_one("SELECT COUNT(*) AS n FROM research_events")
    before_reports = await database.query_one("SELECT COUNT(*) AS n FROM research_reports")

    assert (await client.get("/api/swarm/runs", params={"ticker": AAPL}, headers=auth(owner))).status_code == 200

    after_events = await database.query_one("SELECT COUNT(*) AS n FROM research_events")
    after_reports = await database.query_one("SELECT COUNT(*) AS n FROM research_reports")
    assert after_events == before_events
    assert after_reports == before_reports


def test_team_metadata_degrades_on_malformed_payload():
    """载荷异常只降级，不让整个列表 500。"""
    from app.routers.swarm import _team_metadata

    assert _team_metadata("{not json") == (None, None)
    assert _team_metadata(None) == (None, None)
    assert _team_metadata("[1, 2]") == (None, None)
    assert _team_metadata(json.dumps({"team": "四大师"})) == (None, None)
    assert _team_metadata(json.dumps({"team": {"key": 1, "name": 2}})) == (None, None)
    assert _team_metadata(json.dumps({"team": {"key": "four-masters", "name": "四大师投研团队"}})) == (
        "four-masters",
        "四大师投研团队",
    )
