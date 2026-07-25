"""API 集成测试：ASGI 直测，LLM 用 Fake 客户端（不调真实 API）。

覆盖：模型 CRUD / 角色 CRUD / 单聊 SSE / 讨论 SSE / 仪表盘 / 错误路径。
"""
import json

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app import config, database
from app.routers import research as research_router
from app.main import app
from app.services import model_router


class FakeLLMClient:
    """确定性假 LLM：流式返回固定 token，非流式返回固定总结。"""

    async def chat(self, messages):
        return "【讨论总结】共识：测试通过。分歧：无。", 42

    async def chat_stream(self, messages):
        for t in ["这是", "假模型", "的回复。"]:
            yield t


async def _fake_get_client(model_id=None):
    return FakeLLMClient(), {"id": 1, "name": "FakeModel"}


@pytest_asyncio.fixture
async def client(tmp_path, monkeypatch):
    """每个测试独立 SQLite 库 + Fake LLM。"""
    monkeypatch.setattr(config, "DB_PATH", tmp_path / "test.db")
    monkeypatch.setattr(model_router, "get_client", _fake_get_client)
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
            yield c
    database._db = None


async def _collect_sse(resp) -> list[tuple[str, dict]]:
    events = []
    event = None
    async for line in resp.aiter_lines():
        if line.startswith("event:"):
            event = line[6:].strip()
        elif line.startswith("data:") and event:
            events.append((event, json.loads(line[5:])))
            event = None
    return events


class TestHealthAndSeed:
    @pytest.mark.asyncio
    async def test_health_wal(self, client):
        r = await client.get("/api/health")
        assert r.status_code == 200
        assert r.json()["db"] == "wal"  # DB-03

    @pytest.mark.asyncio
    async def test_seed_defaults(self, client):
        models = (await client.get("/api/models")).json()["items"]
        assert len(models) == 2  # MODEL-02
        assert {m["model_name"] for m in models} == {"deepseek-v4-flash", "deepseek-v4-pro"}
        assert sum(m["is_default"] for m in models) == 1
        agents = (await client.get("/api/agents")).json()["items"]
        assert len(agents) == 6  # MULTI-03 预置角色


class TestModelCRUD:
    @pytest.mark.asyncio
    async def test_crud_cycle(self, client):
        r = await client.post("/api/models", json={
            "name": "Test", "base_url": "https://api.example.com", "model_name": "x"})
        assert r.status_code == 201
        mid = r.json()["id"]

        r = await client.put(f"/api/models/{mid}", json={"temperature": 0.1})
        assert r.json()["temperature"] == 0.1

        r = await client.post(f"/api/models/{mid}/set-default")
        assert r.json()["ok"] is True
        models = (await client.get("/api/models")).json()["items"]
        assert [m["id"] for m in models if m["is_default"]] == [mid]  # 互斥

        r = await client.delete(f"/api/models/{mid}")
        assert r.json()["ok"] is True
        assert (await client.get("/api/models")).json()["items"][0]["id"] != mid

    @pytest.mark.asyncio
    async def test_update_missing_404(self, client):
        assert (await client.put("/api/models/999", json={"name": "x"})).status_code == 404

    @pytest.mark.asyncio
    async def test_model_list_never_returns_stored_api_key(self, client):
        created = await client.post("/api/models", json={
            "name": "Secret", "base_url": "https://api.example.com", "model_name": "x", "api_key": "secret-value"})
        assert created.status_code == 201
        assert "api_key" not in created.json()
        assert created.json()["has_api_key"] is True
        listed = (await client.get("/api/models")).json()["items"]
        assert all("api_key" not in item for item in listed)


class TestAgentCRUD:
    @pytest.mark.asyncio
    async def test_create_and_duplicate(self, client):
        r = await client.post("/api/agents", json={
            "name": "自定义", "role_key": "custom_1", "system_prompt": "你是测试"})
        assert r.status_code == 201
        r = await client.post("/api/agents", json={
            "name": "重复", "role_key": "custom_1", "system_prompt": "x"})
        assert r.status_code == 409

    @pytest.mark.asyncio
    async def test_update_prompt(self, client):
        r = await client.put("/api/agents/1", json={"system_prompt": "新提示词"})
        assert r.json()["system_prompt"] == "新提示词"


class TestChat:
    @pytest.mark.asyncio
    async def test_full_chat_flow(self, client):
        sid = (await client.post("/api/chat/sessions", json={"role_preset": "value_investor"})).json()["id"]

        async with client.stream(
            "POST", f"/api/chat/sessions/{sid}/messages", json={"content": "分析一下茅台"}
        ) as resp:
            assert resp.status_code == 200
            assert "text/event-stream" in resp.headers["content-type"]
            events = await _collect_sse(resp)

        kinds = [e for e, _ in events]
        assert kinds == ["token", "token", "token", "done"]
        full = "".join(d["delta"] for e, d in events if e == "token")
        assert full == "这是假模型的回复。"
        done = events[-1][1]
        assert done["message_id"] > 0 and done["token_count"] > 0

        # CHAT-02 持久化 + CHAT-06 token 记录 + 自动标题
        msgs = (await client.get(f"/api/chat/sessions/{sid}/messages")).json()["items"]
        assert [m["role"] for m in msgs] == ["user", "assistant"]
        assert all(m["token_count"] for m in msgs)
        session = (await client.get("/api/chat/sessions")).json()["items"][0]
        assert session["title"] == "分析一下茅台"
        assert session["message_count"] == 2

    @pytest.mark.asyncio
    async def test_role_switch(self, client):
        """CHAT-04：PUT 更新 role_preset。"""
        sid = (await client.post("/api/chat/sessions", json={"role_preset": "tech_analyst"})).json()["id"]
        r = await client.put(f"/api/chat/sessions/{sid}", json={"role_preset": "value_investor"})
        assert r.json()["role_preset"] == "value_investor"

    @pytest.mark.asyncio
    async def test_delete_cascades(self, client):
        sid = (await client.post("/api/chat/sessions", json={})).json()["id"]
        async with client.stream("POST", f"/api/chat/sessions/{sid}/messages", json={"content": "hi"}) as resp:
            await _collect_sse(resp)
        assert (await client.delete(f"/api/chat/sessions/{sid}")).json()["ok"] is True
        assert (await client.get(f"/api/chat/sessions/{sid}/messages")).status_code == 404


class TestDiscussion:
    @pytest.mark.asyncio
    async def test_full_discussion_flow(self, client):
        r = await client.post("/api/discussion/rooms", json={
            "topic": "测试主题", "role_keys": ["value_investor", "tech_analyst", "risk_manager"],
            "total_rounds": 2})
        assert r.status_code == 201
        rid = r.json()["id"]
        assert len(r.json()["participants"]) == 3

        async with client.stream("POST", f"/api/discussion/rooms/{rid}/start") as resp:
            assert resp.status_code == 200
            events = await _collect_sse(resp)

        kinds = [e for e, _ in events]
        assert kinds.count("round_start") == 2
        assert kinds.count("agent_start") == 6   # 3 角色 × 2 轮
        assert kinds.count("agent_end") == 6
        assert kinds[-2:] == ["summary", "done"]
        # 轮次按 role_key 字母序
        starts = [d["agent"] for e, d in events if e == "agent_start"]
        assert starts[:3] == ["risk_manager", "tech_analyst", "value_investor"]

        detail = (await client.get(f"/api/discussion/rooms/{rid}")).json()
        assert detail["room"]["current_phase"] == "done"
        assert detail["room"]["summary"].startswith("【讨论总结】")
        assert len(detail["messages"]) == 6

        # 已完成房间不可重复启动
        assert (await client.post(f"/api/discussion/rooms/{rid}/start")).status_code == 409

    @pytest.mark.asyncio
    async def test_invalid_role_key(self, client):
        r = await client.post("/api/discussion/rooms", json={
            "topic": "测试", "role_keys": ["a", "b", "c"], "total_rounds": 1})
        assert r.status_code == 400

    @pytest.mark.asyncio
    async def test_min_three_roles(self, client):
        r = await client.post("/api/discussion/rooms", json={
            "topic": "测试", "role_keys": ["value_investor", "tech_analyst"], "total_rounds": 1})
        assert r.status_code == 422  # MULTI-01 至少 3 个角色


class TestDashboard:
    @pytest.mark.asyncio
    async def test_stats_shape(self, client):
        r = await client.get("/api/dashboard/stats")
        assert r.status_code == 200
        d = r.json()
        for key in ("model_count", "conversation_count", "discussion_count",
                    "message_count", "default_model", "recent_conversations", "recent_rooms"):
            assert key in d
        assert d["default_model"]["model_name"] == "deepseek-v4-flash"


class TestResearchHistory:
    @pytest.mark.asyncio
    async def test_research_persists_events_and_provenance(self, client, monkeypatch):
        async def fake_research(ticker, company_name, model_id):
            yield "agent_started", {"role_key": "business_analyst", "name": "商业模式"}
            yield "tool_call", {"role_key": "business_analyst", "tool_name": "search_news", "arguments": '{"keyword":"AAPL"}'}
            yield "done", {
                "report": {"ticker": ticker, "company_name": company_name, "business_model_analysis": "完成"},
                "agent_results": {"business_analyst": {"name": "商业模式", "content": "完成", "tool_log": [{"name": "search_news", "result": "[]"}]}},
            }

        monkeypatch.setattr(research_router, "run_research", fake_research)
        async with client.stream("POST", "/api/research", json={"ticker": "600519", "model_id": 1}) as response:
            assert response.status_code == 200
            events = await _collect_sse(response)

        started = next(data for event, data in events if event == "report_started")
        report_id = started["report_id"]
        listed = (await client.get("/api/research")).json()["items"]
        assert listed[0]["id"] == report_id
        assert listed[0]["status"] == "completed"
        assert listed[0]["model_id"] == 1

        detail = (await client.get(f"/api/research/{report_id}")).json()
        assert detail["agent_results"]["business_analyst"]["tool_log"][0]["name"] == "search_news"
        assert [event["event_type"] for event in detail["events"]] == ["agent_started", "tool_call", "done"]

        async with client.stream("POST", "/api/research", json={"ticker": "600519", "model_id": 1}) as second_response:
            second_events = await _collect_sse(second_response)
        second_report_id = next(data for event, data in second_events if event == "report_started")["report_id"]

        grouped = (await client.get("/api/research/history")).json()
        assert grouped["total"] == 1
        assert grouped["items"][0]["ticker"] == "sh600519"
        assert grouped["items"][0]["run_count"] == 2
        assert {run["id"] for run in grouped["items"][0]["runs"]} == {report_id, second_report_id}

        markdown = await client.get(f"/api/research/{report_id}/export?format=md")
        assert markdown.status_code == 200
        assert "text/markdown" in markdown.headers["content-type"]
        assert "研究报告" in markdown.text and "商业模式" in markdown.text

        html = await client.get(f"/api/research/{report_id}/export?format=html")
        assert html.status_code == 200
        assert "text/html" in html.headers["content-type"]
        assert "<h2>商业模式</h2>" in html.text

        pdf = await client.get(f"/api/research/{report_id}/export?format=pdf")
        assert pdf.status_code == 200 and pdf.content.startswith(b"%PDF")

        docx = await client.get(f"/api/research/{report_id}/export?format=docx")
        assert docx.status_code == 200 and docx.content.startswith(b"PK")

        assert (await client.get(f"/api/research/{report_id}/export?format=xlsx")).status_code == 422
