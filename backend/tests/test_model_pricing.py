"""BACKLOG-044: 计价模块——表迁移/CRUD/校验/用户隔离/费用估算 unpriced（确定性，不联网）。"""

import hashlib

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app import config, database
from app.main import app
from app.routers.usage import estimate_cost


@pytest_asyncio.fixture
async def pricing_client(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "DB_PATH", tmp_path / "pricing.db")
    monkeypatch.setattr(config, "LOCAL_ONLY_MODE", False)
    monkeypatch.setattr(config, "SCHEDULER_ENABLED", False)
    async with app.router.lifespan_context(app):
        owner_id = await database.execute(
            "INSERT INTO users (email, is_admin) VALUES ('pricing-owner@test.local', 1)"
        )
        other_id = await database.execute(
            "INSERT INTO users (email) VALUES ('pricing-other@test.local')"
        )
        await database.claim_unowned_data(owner_id)
        await database.seed_models_for_user(owner_id)
        await database.seed_models_for_user(other_id)

        tokens = {"owner": "pricing-owner-token", "other": "pricing-other-token"}
        for key, token in tokens.items():
            user_id = owner_id if key == "owner" else other_id
            await database.execute(
                "INSERT INTO sessions (user_id, token_hash, expires_at) "
                "VALUES (?, ?, datetime('now', '+1 day'))",
                (user_id, hashlib.sha256(token.encode()).hexdigest()),
            )

        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            yield (
                client,
                {"Cookie": f"{config.AUTH_COOKIE_NAME}={tokens['owner']}"},
                {"Cookie": f"{config.AUTH_COOKIE_NAME}={tokens['other']}"},
                owner_id,
                other_id,
            )


async def _usage(model: str, prompt: int, completion: int, user_id: int, day: str = "2026-09-01") -> None:
    await database.execute(
        "INSERT INTO llm_usage "
        "(session_type, model_name, prompt_tokens, completion_tokens, total_tokens, user_id, created_at) "
        "VALUES ('chat', ?, ?, ?, ?, ?, ?)",
        (model, prompt, completion, prompt + completion, user_id, f"{day} 00:00:00"),
    )


# --- schema / migration -------------------------------------------------------


@pytest.mark.asyncio
async def test_model_pricing_table_exists_with_expected_columns(pricing_client):
    columns = {row["name"] for row in await database.query_all("PRAGMA table_info(model_pricing)")}
    assert {
        "id", "user_id", "model_name", "input_per_1m", "output_per_1m",
        "currency", "source", "updated_at",
    } <= columns
    assert database._SCHEMA_VERSION == 26
    assert (await database.query_one("PRAGMA user_version"))["user_version"] == 26
    recorded = await database.query_one("SELECT name FROM schema_version WHERE version=26")
    assert recorded["name"] == "install_model_pricing"


@pytest.mark.asyncio
async def test_v25_database_gains_model_pricing_without_losing_usage(tmp_path, monkeypatch):
    """旧库兼容：v25 库补建表，既有 llm_usage 记录一字不动。"""
    db_path = tmp_path / "legacy-v25.db"
    monkeypatch.setattr(config, "DB_PATH", db_path)
    monkeypatch.setattr(config, "SCHEDULER_ENABLED", False)
    await database.init_db()
    try:
        await database.execute(
            "INSERT INTO llm_usage (session_type, model_name, prompt_tokens, completion_tokens, "
            "total_tokens, user_id, created_at) "
            "VALUES ('chat', 'legacy-model', 10, 5, 15, NULL, '2026-09-01 00:00:00')"
        )
        # 回退到 v25 形态：删表 + 降版本号 + 移除 v26 审计行。
        await database.execute("DROP TABLE model_pricing")
        await database.execute("PRAGMA user_version=25")
        await database.execute("DELETE FROM schema_version WHERE version=26")
    finally:
        await database.close_db()

    await database.init_db()
    try:
        columns = {row["name"] for row in await database.query_all("PRAGMA table_info(model_pricing)")}
        assert {"model_name", "input_per_1m", "output_per_1m", "currency", "source"} <= columns
        assert (await database.query_one("PRAGMA user_version"))["user_version"] == 26
        usage = await database.query_one("SELECT model_name, total_tokens FROM llm_usage")
        assert usage == {"model_name": "legacy-model", "total_tokens": 15}
    finally:
        await database.close_db()


# --- CRUD + validation --------------------------------------------------------


@pytest.mark.asyncio
async def test_crud_roundtrip_and_list_order(pricing_client):
    client, owner_auth, _other_auth, _owner_id, _other_id = pricing_client
    created = await client.post(
        "/api/model-pricing",
        json={"model_name": "deepseek-v4-flash", "input_per_1m": 0.5, "output_per_1m": 1.5, "currency": "CNY"},
        headers=owner_auth,
    )
    assert created.status_code == 201
    body = created.json()
    assert body["model_name"] == "deepseek-v4-flash"
    assert body["input_per_1m"] == 0.5 and body["output_per_1m"] == 1.5
    assert body["currency"] == "CNY" and body["source"] == "manual"
    assert body["updated_at"]
    pricing_id = body["id"]

    await client.post(
        "/api/model-pricing",
        json={"model_name": "aaa-model", "input_per_1m": 1, "output_per_1m": 2},
        headers=owner_auth,
    )
    listed = await client.get("/api/model-pricing", headers=owner_auth)
    assert listed.status_code == 200
    assert listed.json()["total"] == 2
    assert [item["model_name"] for item in listed.json()["items"]] == ["aaa-model", "deepseek-v4-flash"]
    # 未显式给币种时默认 CNY（仅展示字段，不做汇率换算）。
    assert listed.json()["items"][0]["currency"] == "CNY"

    updated = await client.put(
        f"/api/model-pricing/{pricing_id}",
        json={"model_name": "deepseek-v4-flash", "input_per_1m": 2.25, "output_per_1m": 9, "currency": "USD"},
        headers=owner_auth,
    )
    assert updated.status_code == 200
    assert updated.json()["input_per_1m"] == 2.25
    assert updated.json()["currency"] == "USD"

    deleted = await client.delete(f"/api/model-pricing/{pricing_id}", headers=owner_auth)
    assert deleted.status_code == 200 and deleted.json() == {"ok": True}
    assert (await client.get("/api/model-pricing", headers=owner_auth)).json()["total"] == 1
    assert (await client.delete(f"/api/model-pricing/{pricing_id}", headers=owner_auth)).status_code == 404


@pytest.mark.asyncio
async def test_validation_rejects_blank_name_and_negative_or_non_finite_price(pricing_client):
    client, owner_auth, _other_auth, _owner_id, _other_id = pricing_client
    cases = [
        {"model_name": "   ", "input_per_1m": 1, "output_per_1m": 1},
        {"model_name": "m", "input_per_1m": -0.01, "output_per_1m": 1},
        {"model_name": "m", "input_per_1m": 1, "output_per_1m": -1},
        {"model_name": "m", "input_per_1m": 1, "output_per_1m": 1, "currency": "  "},
    ]
    for payload in cases:
        response = await client.post("/api/model-pricing", json=payload, headers=owner_auth)
        assert response.status_code == 422, payload

    # 非有限数值：JSON 标准无 Infinity/NaN 字面量，直接发原始 body 覆盖校验分支。
    for raw in (
        '{"model_name": "m", "input_per_1m": 1e400, "output_per_1m": 1}',
        '{"model_name": "m", "input_per_1m": NaN, "output_per_1m": 1}',
    ):
        response = await client.post(
            "/api/model-pricing", content=raw, headers={**owner_auth, "Content-Type": "application/json"}
        )
        assert response.status_code == 422, raw
    assert (await client.get("/api/model-pricing", headers=owner_auth)).json()["total"] == 0


@pytest.mark.asyncio
async def test_duplicate_model_name_conflicts_on_create_and_update(pricing_client):
    client, owner_auth, _other_auth, _owner_id, _other_id = pricing_client
    first = await client.post(
        "/api/model-pricing", json={"model_name": "dup", "input_per_1m": 1, "output_per_1m": 1}, headers=owner_auth
    )
    second = await client.post(
        "/api/model-pricing", json={"model_name": "dup", "input_per_1m": 2, "output_per_1m": 2}, headers=owner_auth
    )
    assert first.status_code == 201 and second.status_code == 409

    other = await client.post(
        "/api/model-pricing", json={"model_name": "keep", "input_per_1m": 1, "output_per_1m": 1}, headers=owner_auth
    )
    conflict = await client.put(
        f"/api/model-pricing/{other.json()['id']}",
        json={"model_name": "dup", "input_per_1m": 1, "output_per_1m": 1},
        headers=owner_auth,
    )
    assert conflict.status_code == 409
    # 同名自身更新不算冲突
    same = await client.put(
        f"/api/model-pricing/{other.json()['id']}",
        json={"model_name": "keep", "input_per_1m": 3, "output_per_1m": 4},
        headers=owner_auth,
    )
    assert same.status_code == 200 and same.json()["input_per_1m"] == 3


@pytest.mark.asyncio
async def test_pricing_is_isolated_per_user(pricing_client):
    client, owner_auth, other_auth, owner_id, other_id = pricing_client
    mine = await client.post(
        "/api/model-pricing", json={"model_name": "shared-name", "input_per_1m": 1, "output_per_1m": 2},
        headers=owner_auth,
    )
    assert mine.status_code == 201

    # 其他用户列表看不到，也不能改/删（404），且同名可各自独立配置。
    assert (await client.get("/api/model-pricing", headers=other_auth)).json()["total"] == 0
    assert (
        await client.put(
            f"/api/model-pricing/{mine.json()['id']}",
            json={"model_name": "shared-name", "input_per_1m": 9, "output_per_1m": 9},
            headers=other_auth,
        )
    ).status_code == 404
    assert (await client.delete(f"/api/model-pricing/{mine.json()['id']}", headers=other_auth)).status_code == 404
    theirs = await client.post(
        "/api/model-pricing", json={"model_name": "shared-name", "input_per_1m": 7, "output_per_1m": 8},
        headers=other_auth,
    )
    assert theirs.status_code == 201

    # 费用端点同样只用自己的单价：owner 用自己的 1/2，other 用自己的 7/8。
    await _usage("shared-name", 1_000_000, 1_000_000, owner_id)
    await _usage("shared-name", 1_000_000, 1_000_000, other_id)
    owner_cost = (await client.get("/api/usage/cost", headers=owner_auth)).json()
    other_cost = (await client.get("/api/usage/cost", headers=other_auth)).json()
    assert owner_cost["total"]["estimated_cost"] == pytest.approx(3.0)
    assert other_cost["total"]["estimated_cost"] == pytest.approx(15.0)


# --- cost estimation ----------------------------------------------------------


@pytest.mark.asyncio
async def test_cost_endpoint_is_unpriced_without_price_and_never_zero(pricing_client):
    client, owner_auth, _other_auth, owner_id, _other_id = pricing_client
    await _usage("unpriced-model", 1_000_000, 1_000_000, owner_id)

    body = (await client.get("/api/usage/cost", params={"days": 30}, headers=owner_auth)).json()
    assert body["items"][0]["model_name"] == "unpriced-model"
    assert body["items"][0]["priced"] is False
    assert body["items"][0]["estimated_cost"] is None
    assert body["items"][0]["currency"] is None
    assert body["total"]["unpriced_models"] == 1
    assert body["total"]["unpriced_model_names"] == ["unpriced-model"]
    assert body["total"]["unpriced_total_tokens"] == 2_000_000
    assert body["total"]["estimated_cost"] is None
    assert body["total"]["cost_by_currency"] == {}
    assert body["total"]["mixed_currency"] is False
    assert body["total"]["total_tokens"] == 2_000_000


@pytest.mark.asyncio
async def test_cost_endpoint_multiplies_tokens_by_configured_price(pricing_client):
    client, owner_auth, _other_auth, owner_id, _other_id = pricing_client
    await client.post(
        "/api/model-pricing",
        json={"model_name": "priced-model", "input_per_1m": 2.0, "output_per_1m": 4.0, "currency": "CNY"},
        headers=owner_auth,
    )
    await _usage("priced-model", 1_000_000, 500_000, owner_id)

    body = (await client.get("/api/usage/cost", headers=owner_auth)).json()
    item = body["items"][0]
    assert item["priced"] is True and item["currency"] == "CNY" and item["price_source"] == "manual"
    assert item["estimated_cost"] == pytest.approx(2.0 + 2.0)
    assert body["total"]["estimated_cost"] == pytest.approx(4.0)
    assert body["total"]["currency"] == "CNY"
    assert body["total"]["cost_by_currency"] == {"CNY": pytest.approx(4.0)}
    assert body["total"]["unpriced_models"] == 0


@pytest.mark.asyncio
async def test_cost_endpoint_reports_mixed_currencies_without_conversion(pricing_client):
    client, owner_auth, _other_auth, owner_id, _other_id = pricing_client
    for name, currency, price in (("cny-model", "CNY", 1.0), ("usd-model", "USD", 3.0)):
        await client.post(
            "/api/model-pricing",
            json={"model_name": name, "input_per_1m": price, "output_per_1m": 0, "currency": currency},
            headers=owner_auth,
        )
        await _usage(name, 1_000_000, 0, owner_id)

    total = (await client.get("/api/usage/cost", headers=owner_auth)).json()["total"]
    assert total["mixed_currency"] is True
    assert total["currency"] is None
    # 不做汇率换算：不给出跨币种合计，只给分币种明细。
    assert total["estimated_cost"] is None
    assert total["cost_by_currency"] == {"CNY": pytest.approx(1.0), "USD": pytest.approx(3.0)}


@pytest.mark.asyncio
async def test_cost_endpoint_scopes_window_and_session_type(pricing_client):
    client, owner_auth, _other_auth, owner_id, _other_id = pricing_client
    await client.post(
        "/api/model-pricing", json={"model_name": "m", "input_per_1m": 1.0, "output_per_1m": 0.0},
        headers=owner_auth,
    )
    today = await database.query_one("SELECT date('now') AS day")
    await _usage("m", 1_000_000, 0, owner_id, day=today["day"])
    await _usage("m", 5_000_000, 0, owner_id, day="2020-01-01")

    body = (await client.get("/api/usage/cost", params={"days": 30}, headers=owner_auth)).json()
    assert body["items"][0]["prompt_tokens"] == 1_000_000
    assert body["items"][0]["estimated_cost"] == pytest.approx(1.0)
    filtered = await client.get(
        "/api/usage/cost", params={"days": 30, "session_type": "research"}, headers=owner_auth
    )
    assert filtered.status_code == 200
    assert filtered.json()["items"] == []


@pytest.mark.asyncio
async def test_records_carry_estimate_and_unpriced_flag(pricing_client):
    client, owner_auth, _other_auth, owner_id, _other_id = pricing_client
    await client.post(
        "/api/model-pricing",
        json={"model_name": "priced", "input_per_1m": 2.0, "output_per_1m": 4.0, "currency": "CNY"},
        headers=owner_auth,
    )
    await _usage("priced", 1_000_000, 250_000, owner_id, day="2026-09-02")
    await _usage("unpriced", 10, 5, owner_id, day="2026-09-03")

    body = (await client.get("/api/usage/records", headers=owner_auth)).json()
    by_model = {item["model_name"]: item for item in body["items"]}
    assert by_model["priced"]["priced"] is True
    assert by_model["priced"]["currency"] == "CNY"
    assert by_model["priced"]["estimated_cost"] == pytest.approx(2.0 + 1.0)
    assert by_model["priced"]["prompt_tokens"] == 1_000_000
    assert by_model["unpriced"]["priced"] is False
    assert by_model["unpriced"]["estimated_cost"] is None
    assert by_model["unpriced"]["currency"] is None


def test_estimate_cost_returns_none_instead_of_zero_when_unpriced():
    assert estimate_cost(1_000_000, 1_000_000, None, 1.0) is None
    assert estimate_cost(1_000_000, 1_000_000, 1.0, None) is None
    assert estimate_cost(0, 0, 0.0, 0.0) == 0.0
    assert estimate_cost(1_000_000, 500_000, 2.0, 4.0) == pytest.approx(4.0)
