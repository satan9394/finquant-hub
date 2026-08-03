"""API 集成测试：ASGI 直测，LLM 用 Fake 客户端（不调真实 API）。

覆盖：模型 CRUD / 角色 CRUD / 单聊 SSE / 讨论 SSE / 仪表盘 / 错误路径。
"""
import json
import hashlib

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app import config, database, main as main_module
from app.routers import analysis as analysis_router
from app.routers import research as research_router
from app.routers import swarm as swarm_router
from app.main import app
from app.services import model_router
from app.services.notifications import publish_notification


class FakeLLMClient:
    """确定性假 LLM：流式返回固定 token，非流式返回固定总结。"""

    async def chat(self, messages):
        return "【讨论总结】共识：测试通过。分歧：无。", 42

    async def chat_stream(self, messages):
        for t in ["这是", "假模型", "的回复。"]:
            yield t

    async def chat_with_tools_loop(self, messages, tools, executor):
        return "这是假模型的回复。", [], 12


async def _fake_get_client(model_id=None, **_kwargs):
    return FakeLLMClient(), {"id": 1, "name": "FakeModel"}


@pytest_asyncio.fixture
async def client(tmp_path, monkeypatch):
    """每个测试独立 SQLite 库 + Fake LLM。"""
    monkeypatch.setattr(config, "DB_PATH", tmp_path / "test.db")
    monkeypatch.setattr(model_router, "get_client", _fake_get_client)
    async with app.router.lifespan_context(app):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
            user_id = await database.execute(
                "INSERT INTO users (email, is_admin) VALUES ('tests@example.com', 1)"
            )
            await database.claim_unowned_data(user_id)
            token = "test-session-token"
            await database.execute(
                "INSERT INTO sessions (user_id, token_hash, expires_at) "
                "VALUES (?, ?, datetime('now', '+1 day'))",
                (user_id, hashlib.sha256(token.encode()).hexdigest()),
            )
            c.cookies.set(config.AUTH_COOKIE_NAME, token)
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


class TestGlobalExceptionHandlers:
    @pytest.mark.asyncio
    async def test_validation_returns_first_field_level_chinese_error(self, client):
        response = await client.post("/api/research", json={"ticker": ""})

        assert response.status_code == 422
        assert response.json() == {"detail": "ticker：长度不能少于 1 个字符"}

    @pytest.mark.asyncio
    async def test_unhandled_exception_is_sanitized_and_structured(self, client, monkeypatch):
        captured = {}

        async def fail_query(*_args, **_kwargs):
            raise RuntimeError("database secret")

        def capture_log(message, *args, **kwargs):
            captured.update({"message": message, "args": args, "kwargs": kwargs})

        monkeypatch.setattr(database, "query_one", fail_query)
        monkeypatch.setattr(main_module.LOGGER, "exception", capture_log)
        transport = ASGITransport(app=app, raise_app_exceptions=False)
        async with AsyncClient(transport=transport, base_url="http://t") as isolated_client:
            response = await isolated_client.get("/api/health")

        assert response.status_code == 500
        assert response.json() == {"detail": "服务内部错误，请稍后重试"}
        assert "database secret" not in response.text
        assert captured["message"] == "Unhandled request exception"
        assert captured["kwargs"]["extra"] == {
            "event": "http.request.failed",
            "http_method": "GET",
            "http_path": "/api/health",
            "exception_type": "RuntimeError",
        }


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
        assert kinds == ["token", "done"]
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

    @pytest.mark.asyncio
    async def test_chat_injects_memory_from_other_sessions(self, client, monkeypatch):
        captured_messages = []

        class CapturingClient:
            async def chat_with_tools_loop(self, messages, tools, executor):
                captured_messages.append(messages)
                return "已读取历史线索", [], 8

        async def get_capturing_client(model_id=None, **_kwargs):
            return CapturingClient(), {"id": 1, "name": "Capture"}

        historical_id = await database.execute(
            "INSERT INTO conversations (title, mode, user_id) VALUES ('Apple moat review', 'single', 1)"
        )
        await database.execute(
            "INSERT INTO messages (conversation_id, role, content, user_id) VALUES (?, 'user', ?, 1)",
            (historical_id, "AAPL moat was discussed as a historical hypothesis."),
        )
        current_id = (await client.post("/api/chat/sessions", json={})).json()["id"]
        monkeypatch.setattr(model_router, "get_client", get_capturing_client)

        async with client.stream(
            "POST",
            f"/api/chat/sessions/{current_id}/messages",
            json={"content": "Revisit AAPL moat"},
        ) as response:
            assert response.status_code == 200
            events = await _collect_sse(response)

        assert events[-1][0] == "done"
        memory_messages = [
            message for message in captured_messages[0]
            if message["role"] == "system" and "其他历史会话" in message["content"]
        ]
        assert len(memory_messages) == 1
        assert "Apple moat review" in memory_messages[0]["content"]
        assert "historical hypothesis" in memory_messages[0]["content"]
        assert captured_messages[0][-1] == {"role": "user", "content": "Revisit AAPL moat"}

    @pytest.mark.asyncio
    async def test_chat_executes_registered_tool_and_emits_tool_event(self, client, monkeypatch):
        class ToolCallingClient:
            async def chat_with_tools_loop(self, messages, tools, executor):
                result = await executor("calculate_by_financial_rigor", '{"expression":"2+2"}')
                return "精确计算结果为 4。", [{
                    "name": "calculate_by_financial_rigor",
                    "arguments": '{"expression":"2+2"}',
                    "result": result,
                }], 21

        async def get_tool_client(model_id=None, **_kwargs):
            return ToolCallingClient(), {"id": 1, "name": "ToolModel"}

        monkeypatch.setattr(model_router, "get_client", get_tool_client)
        session_id = (await client.post("/api/chat/sessions", json={})).json()["id"]
        async with client.stream(
            "POST", f"/api/chat/sessions/{session_id}/messages", json={"content": "精确计算 2+2"}
        ) as response:
            events = await _collect_sse(response)

        assert [event for event, _ in events] == ["tool_call", "token", "done"]
        assert events[0][1]["tool_name"] == "calculate_by_financial_rigor"
        assert events[-1][1]["tool_call_count"] == 1


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

    @pytest.mark.asyncio
    async def test_watchlist_import_multipart(self, client, monkeypatch):
        async def fake_search(candidate):
            matches = {
                "600519": [{"code": "sh600519", "name": "贵州茅台"}],
                "maotai": [{"code": "sh600519", "name": "贵州茅台"}],
                "AAPL": [{"code": "usAAPL", "name": "Apple Inc."}],
            }
            return matches.get(candidate, [])

        monkeypatch.setattr(app.state.market, "search", fake_search)
        response = await client.post(
            "/api/dashboard/watchlist/import",
            data={"text": "maotai", "existing": '["sh600519"]'},
            files={"file": ("watchlist.csv", b"code\nAAPL\n", "text/csv")},
        )

        assert response.status_code == 200
        assert response.json() == {
            "total": 2,
            "success": 1,
            "failed": 0,
            "duplicate": 1,
            "items": [{"code": "usAAPL", "name": "Apple Inc."}],
            "failures": [],
        }


class TestThesis:
    @pytest.mark.asyncio
    async def test_manual_create_edit_filter_and_claim_update(self, client, monkeypatch):
        async def fake_quote(_ticker):
            return {"price": 88.0}

        async def fake_fundamentals(_ticker):
            return [{"metric": "total_revenue", "value": 90_000_000_000.0}]

        monkeypatch.setattr(app.state.market, "quote", fake_quote)
        monkeypatch.setattr(app.state.market, "fundamentals", fake_fundamentals)

        created = await client.post("/api/thesis", json={
            "ticker": "000858",
            "title": "五粮液渠道论文",
            "thesis": "渠道库存回归健康后，品牌势能可支撑收入恢复。",
            "assumptions": ["渠道库存逐季改善"],
            "claims": ["合同负债不再恶化"],
        })
        assert created.status_code == 201
        thesis_id = created.json()["id"]
        manual_claim = next(claim for claim in created.json()["claims"] if claim["kind"] == "manual")
        assert created.json()["ticker"] == "sz000858"
        assert created.json()["baseline"]["price"] == 88.0

        updated = await client.put(f"/api/thesis/{thesis_id}", json={
            "title": "五粮液渠道论文（复核）",
            "thesis": "渠道库存和合同负债共同改善后，收入恢复假设才成立。",
            "assumptions": ["渠道库存逐季改善", "合同负债企稳"],
            "claims": ["经销商回款保持稳定"],
            "status": "closed",
        })
        assert updated.status_code == 200
        assert updated.json()["status"] == "closed"
        assert [claim["claim"] for claim in updated.json()["claims"] if claim["kind"] == "manual"] == [
            "经销商回款保持稳定",
        ]

        # The edit replaces manual claims, so the stale claim id must not be writable.
        stale = await client.put(
            f"/api/thesis/{thesis_id}/claims/{manual_claim['id']}",
            json={"status": "confirmed", "note": "旧论点"},
        )
        assert stale.status_code == 404
        current_claim = next(claim for claim in updated.json()["claims"] if claim["kind"] == "manual")
        confirmed = await client.put(
            f"/api/thesis/{thesis_id}/claims/{current_claim['id']}",
            json={"status": "confirmed", "note": "已由最新渠道数据确认"},
        )
        assert confirmed.status_code == 200
        claim = next(item for item in confirmed.json()["claims"] if item["id"] == current_claim["id"])
        assert claim["status"] == "confirmed"
        assert claim["note"] == "已由最新渠道数据确认"

        filtered = await client.get("/api/thesis", params={"status": "closed"})
        assert filtered.status_code == 200
        assert [item["id"] for item in filtered.json()["items"]] == [thesis_id]

    @pytest.mark.asyncio
    async def test_from_report_and_drift_check(self, client, monkeypatch):
        market_state = {"price": 100.0}

        async def fake_quote(_ticker):
            return {"price": market_state["price"]}

        async def fake_fundamentals(_ticker):
            return []

        monkeypatch.setattr(app.state.market, "quote", fake_quote)
        monkeypatch.setattr(app.state.market, "fundamentals", fake_fundamentals)
        baseline_report = {
            "executive_summary": "品牌护城河稳固，现金流持续增长，长期逻辑成立。",
            "verdict": "长期关注",
            "team_lead_review": {"bull_case": "高端需求保持韧性", "bear_case": "渠道库存上升"},
            "fundamental_evidence": {"items": [{"metric": "total_revenue", "value": 100.0}]},
        }
        report_id = await database.execute(
            "INSERT INTO research_reports (ticker, company_name, report_data, status, user_id) "
            "VALUES (?, ?, ?, 'completed', 1)",
            ("sh600519", "贵州茅台", json.dumps(baseline_report, ensure_ascii=False)),
        )

        created = await client.post(f"/api/thesis/from-report/{report_id}")
        assert created.status_code == 201
        thesis_id = created.json()["id"]
        assert created.json()["source_report_id"] == report_id
        assert {claim["kind"] for claim in created.json()["claims"]} >= {
            "manual", "price", "position", "fundamental", "report",
        }

        market_state["price"] = 135.0
        drifted_report = {
            "executive_summary": "核心需求和竞争地位发生明显变化，原长期逻辑需要重估。",
            "verdict": "谨慎",
            "fundamental_evidence": {"items": [{"metric": "total_revenue", "value": 70.0}]},
        }
        await database.execute(
            "INSERT INTO research_reports (ticker, company_name, report_data, status, user_id) "
            "VALUES (?, ?, ?, 'completed', 1)",
            ("sh600519", "贵州茅台", json.dumps(drifted_report, ensure_ascii=False)),
        )

        checked = await client.post(f"/api/thesis/{thesis_id}/check")
        assert checked.status_code == 200
        payload = checked.json()
        assert payload["drift_status"] == "drifted"
        statuses = {claim["kind"]: claim["status"] for claim in payload["claims"]}
        assert statuses["price"] == "violated"
        assert statuses["fundamental"] == "violated"
        assert statuses["position"] == "unknown"

        duplicate = await client.post(f"/api/thesis/from-report/{report_id}")
        assert duplicate.status_code == 409


class TestResearchHistory:
    @pytest.mark.asyncio
    async def test_research_persists_events_and_provenance(self, client, monkeypatch):
        async def fake_research(ticker, company_name, model_id, *, user_id):
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
        done_event = next(event for event in detail["events"] if event["event_type"] == "done")
        assert done_event["payload"]["report_id"] == report_id
        notification = await database.query_one(
            "SELECT event_type, source_id FROM notifications WHERE dedupe_key=?",
            (f"research:{report_id}:completed",),
        )
        assert notification == {"event_type": "research.completed", "source_id": str(report_id)}

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

    @pytest.mark.asyncio
    async def test_research_error_is_normalized_and_persisted_once(self, client, monkeypatch):
        async def fake_research(ticker, company_name, model_id, *, user_id):
            yield "error", {"role_key": "risk_manager", "error": "API rate limit exceeded"}

        monkeypatch.setattr(research_router, "run_research", fake_research)
        async with client.stream("POST", "/api/research", json={"ticker": "AAPL"}) as response:
            events = await _collect_sse(response)

        report_id = next(data["report_id"] for event, data in events if event == "report_started")
        error = next(data for event, data in events if event == "error")
        assert error == {
            "error": "API rate limit exceeded",
            "message": "API rate limit exceeded",
            "role_key": "risk_manager",
        }

        detail = (await client.get(f"/api/research/{report_id}")).json()
        persisted_errors = [event for event in detail["events"] if event["event_type"] == "error"]
        assert detail["status"] == "failed"
        assert len(persisted_errors) == 1
        assert persisted_errors[0]["payload"]["error"] == "API rate limit exceeded"
        notification = await database.query_one(
            "SELECT event_type FROM notifications WHERE dedupe_key=?",
            (f"research:{report_id}:failed",),
        )
        assert notification["event_type"] == "research.failed"

    @pytest.mark.asyncio
    async def test_research_completion_failure_transitions_to_failed(self, client, monkeypatch):
        async def fake_research(ticker, company_name, model_id, *, user_id):
            yield "done", {"report": {"ticker": ticker}, "agent_results": {}}

        async def fail_completion(*args, **kwargs):
            raise RuntimeError("database write failed")

        monkeypatch.setattr(research_router, "run_research", fake_research)
        monkeypatch.setattr(research_router, "_complete_report", fail_completion)

        async with client.stream("POST", "/api/research", json={"ticker": "AAPL"}) as response:
            events = await _collect_sse(response)

        report_id = next(data["report_id"] for event, data in events if event == "report_started")
        error = next(data for event, data in events if event == "error")
        assert error["error"] == "研究管线异常：database write failed"
        assert error["message"] == error["error"]
        report = await database.query_one("SELECT status FROM research_reports WHERE id=?", (report_id,))
        assert report["status"] == "failed"


class TestSwarm:
    @pytest.mark.asyncio
    async def test_analyze_persists_structured_report_and_sse_contract(self, client, monkeypatch):
        async def fake_resolve(raw, svc):
            return "usAAPL", "Apple Inc."

        async def fake_swarm(ticker, company_name, model_id):
            yield "team_started", {"ticker": ticker, "company_name": company_name}
            yield "agent_started", {"role_key": "value_investor"}
            yield "done", {
                "status": "completed",
                "agent_results": {
                    "value_investor": {"content": "价值结论", "token_count": 10},
                    "tech_analyst": {"content": "技术结论", "token_count": 20},
                    "macro_strategist": {"content": "宏观结论", "token_count": 30},
                    "risk_manager": {"content": "风控结论", "token_count": 40},
                },
                "failed_agents": [],
                "skipped_agents": [],
                "token_count": 100,
            }

        monkeypatch.setattr(swarm_router, "resolve_research_target", fake_resolve)
        monkeypatch.setattr(swarm_router, "run_four_masters", fake_swarm)

        metadata = (await client.get("/api/swarm/teams/four-masters")).json()
        assert metadata["key"] == "four-masters"
        assert [agent["key"] for agent in metadata["agents"]][-1] == "report_lead"
        assert "system_prompt" not in metadata["agents"][0]

        async with client.stream(
            "POST",
            "/api/swarm/analyze",
            json={"ticker": "AAPL", "model_id": 1},
        ) as response:
            assert response.status_code == 200
            assert "text/event-stream" in response.headers["content-type"]
            events = await _collect_sse(response)

        assert [event for event, _ in events] == ["report_started", "team_started", "agent_started", "done"]
        report_id = events[0][1]["report_id"]
        assert events[1][1] == {"ticker": "usAAPL", "company_name": "Apple Inc."}
        assert events[-1][1]["report_id"] == report_id
        assert events[-1][1]["report"]["technical_analysis"] == "技术结论"

        detail = (await client.get(f"/api/research/{report_id}")).json()
        assert detail["status"] == "completed"
        assert detail["ticker"] == "usAAPL"
        assert detail["report_data"]["report_type"] == "four_masters_swarm"
        assert detail["report_data"]["industry_analysis"] == "宏观结论"
        assert detail["agent_results"]["risk_manager"]["content"] == "风控结论"
        assert [event["event_type"] for event in detail["events"]] == [
            "team_started", "agent_started", "done",
        ]

    @pytest.mark.asyncio
    async def test_analyze_failure_is_persisted_once(self, client, monkeypatch):
        async def fake_resolve(raw, svc):
            return "usAAPL", "Apple Inc."

        async def fake_swarm(ticker, company_name, model_id):
            yield "error", {"error": "LLM unavailable", "message": "LLM unavailable"}

        monkeypatch.setattr(swarm_router, "resolve_research_target", fake_resolve)
        monkeypatch.setattr(swarm_router, "run_four_masters", fake_swarm)

        async with client.stream("POST", "/api/swarm/analyze", json={"ticker": "AAPL"}) as response:
            events = await _collect_sse(response)

        report_id = events[0][1]["report_id"]
        assert events[-1] == ("error", {"error": "LLM unavailable", "message": "LLM unavailable"})
        detail = (await client.get(f"/api/research/{report_id}")).json()
        assert detail["status"] == "failed"
        assert [event["event_type"] for event in detail["events"]].count("error") == 1


class TestNotifications:
    @pytest.mark.asyncio
    async def test_list_and_mark_read(self, client):
        notification = await publish_notification(
            "test.completed",
            "测试完成",
            "测试任务已完成",
            user_id=1,
            payload={"url": "/"},
        )

        response = await client.get("/api/notifications")
        assert response.status_code == 200
        assert response.json()["unread_count"] == 1
        assert response.json()["items"][0]["payload"] == {"url": "/"}

        marked = await client.post(f"/api/notifications/{notification['id']}/read")
        assert marked.json() == {"id": notification["id"], "is_read": True}
        assert (await client.get("/api/notifications?unread_only=true")).json()["items"] == []
        assert (await client.post("/api/notifications/999/read")).status_code == 404


class TestAlerts:
    @pytest.mark.asyncio
    async def test_rule_api_evaluates_latest_signal_idempotently(self, client, monkeypatch):
        created = await client.post("/api/alerts/rules", json={
            "name": "Apple 金叉",
            "ticker": "AAPL",
            "signal_type": "golden_cross",
            "direction": "bullish",
        })
        assert created.status_code == 201
        rule = created.json()
        assert rule["ticker"] == "usAAPL"
        assert "golden_cross" in (await client.get("/api/alerts/signal-types")).json()["items"]

        duplicate = await client.post("/api/alerts/rules", json={
            "name": "重复规则",
            "ticker": "usAAPL",
            "signal_type": "golden_cross",
            "direction": "bullish",
        })
        assert duplicate.status_code == 409

        async def fake_kline(ticker, period, count):
            return [
                {
                    "day": f"2026-07-{index + 1:02d}",
                    "open": 100.0,
                    "high": 101.0,
                    "low": 99.0,
                    "close": 100.0,
                    "volume": 1000.0,
                }
                for index in range(30)
            ]

        monkeypatch.setattr(app.state.market, "kline", fake_kline)
        monkeypatch.setattr(analysis_router.indicators, "compute", lambda bars: {})
        monkeypatch.setattr(
            analysis_router.sig_mod,
            "detect_all",
            lambda ind, close, high, low, volume: [{
                "type": "golden_cross",
                "index": len(close) - 1,
                "direction": "bullish",
                "confidence": "high",
                "description": "MACD 金叉",
            }],
        )
        monkeypatch.setattr(
            analysis_router.score_mod,
            "composite_score",
            lambda *args: {"composite_score": 50, "components": {}},
        )

        first = await client.get("/api/analysis/AAPL/indicators?count=30")
        second = await client.get("/api/analysis/AAPL/indicators?count=30")
        assert first.status_code == 200
        assert len(first.json()["alert_triggers"]) == 1
        assert second.json()["alert_triggers"] == []

        triggers = (await client.get("/api/alerts/triggers?ticker=AAPL")).json()["items"]
        assert len(triggers) == 1
        assert triggers[0]["notification_id"] is not None

        updated = await client.put(f"/api/alerts/rules/{rule['id']}", json={"is_enabled": False})
        assert updated.json()["is_enabled"] is False
        assert (
            await client.put(f"/api/alerts/rules/{rule['id']}", json={"is_enabled": None})
        ).status_code == 400
        assert (await client.get("/api/alerts/rules?enabled_only=true")).json()["items"] == []
        assert (await client.delete(f"/api/alerts/rules/{rule['id']}")).json() == {"ok": True}
        assert (await client.delete(f"/api/alerts/rules/{rule['id']}")).status_code == 404
        assert (await client.get("/api/alerts/triggers")).json()["items"][0]["rule_id"] is None


class TestQuantResearchV2:
    @pytest.mark.asyncio
    async def test_chip_distribution_endpoint_contract(self, client, monkeypatch):
        async def fake_chips(symbol, adjustment):
            assert symbol == "600519"
            assert adjustment == "qfq"
            return {
                "symbol": symbol, "provider": "akshare.stock_cyq_em", "source": "eastmoney.kline",
                "as_of": "2026-07-31", "timezone": "Asia/Shanghai", "currency": "CNY",
                "adjustment": adjustment, "frequency": "daily",
                "methodology": "akshare_cyq_calculator_120_day_turnover_decay",
                "quality_flags": ["derived_from_price_volume_turnover", "chip_peak_not_exposed_by_provider"],
                "latest": {"chip_peak": None}, "items": [{"chip_peak": None}],
            }

        monkeypatch.setattr("app.routers.instruments.fetch_chip_distribution", fake_chips)
        response = await client.get("/api/instruments/600519/chip-distribution")
        assert response.status_code == 200
        assert response.json()["latest"]["chip_peak"] is None
        assert response.json()["quality_flags"][0] == "derived_from_price_volume_turnover"

    @pytest.mark.asyncio
    async def test_instrument_contract_and_workspace_upsert(self, client, monkeypatch):
        async def fake_quote(ticker):
            return {
                "code": "usAAPL", "name": "Apple Inc.", "price": 200.0,
                "last_close": 198.0, "open": 199.0, "high": 201.0, "low": 197.0,
                "volume": 1000, "amount": None, "change": 2.0, "change_percent": 1.01,
                "turnover_rate": None, "pe": None, "pb": None, "market_cap": None,
                "amplitude": 2.02, "timestamp": 1_767_225_600, "currency": "USD",
                "source": "test_provider", "exchange": "NASDAQ", "timezone": "America/New_York",
            }

        async def fake_kline(ticker, period, count):
            return [
                {
                    "day": f"2026-01-{index + 1:02d}", "open": 100 + index,
                    "high": 101 + index, "low": 99 + index, "close": 100.5 + index,
                    "volume": 1000, "source": "test_provider", "adjustment": "split_adjusted",
                }
                for index in range(30)
            ]

        async def fake_fundamentals(ticker):
            return [{"metric": "trailingNetIncome", "value": 123.0, "as_of": "2026-03-31", "currency": "USD", "period_type": "TTM"}]

        monkeypatch.setattr(app.state.market, "quote", fake_quote)
        monkeypatch.setattr(app.state.market, "kline", fake_kline)
        monkeypatch.setattr(app.state.market, "fundamentals", fake_fundamentals)

        snapshot = (await client.get("/api/instruments/AAPL/snapshot")).json()
        assert snapshot["instrument"]["symbol"] == "AAPL"
        for key in ("provider", "as_of", "timezone", "currency", "adjustment", "frequency", "quality_flags"):
            assert key in snapshot

        bars = (await client.get("/api/instruments/AAPL/bars?count=30")).json()
        assert len(bars["items"]) == 30 and "macd" in bars["indicators"]
        fundamentals = (await client.get("/api/instruments/AAPL/fundamentals")).json()
        assert fundamentals["items"][0]["as_of"] == "2026-03-31"

        payload = {
            "name": "Apple Inc.", "instrument": snapshot["instrument"], "notes": "first",
            "evidence": [{"label": "FACT", "title": "quote", "detail": "200", "provider": "test_provider"}],
            "snapshot": snapshot,
        }
        assert (await client.put("/api/instruments/AAPL/workspace", json=payload)).status_code == 200
        payload["notes"] = "updated"
        await client.put("/api/instruments/AAPL/workspace", json=payload)
        workspaces = (await client.get("/api/instruments/workspaces")).json()
        assert workspaces["total"] == 1
        assert workspaces["items"][0]["notes"] == "updated"

    @pytest.mark.asyncio
    async def test_backtest_job_contract_and_validation(self, client, monkeypatch):
        from datetime import date, timedelta

        start = date(2026, 1, 1)
        closes = [100 + ((index % 30) if (index // 30) % 2 == 0 else 30 - (index % 30)) for index in range(120)]

        async def fake_kline(ticker, period, count):
            return [
                {
                    "day": (start + timedelta(days=index)).isoformat(),
                    "open": close, "high": close + 1, "low": close - 1, "close": close,
                    "volume": 1000, "source": "test_provider", "adjustment": "split_adjusted",
                }
                for index, close in enumerate(closes)
            ]

        monkeypatch.setattr(app.state.market, "kline", fake_kline)
        body = {
            "symbol": "AAPL", "start_date": "2026-01-01", "end_date": "2026-05-30",
            "short_window": 5, "long_window": 15, "initial_capital": 100000,
            "commission_bps": 3, "slippage_bps": 2, "benchmark": "buy_and_hold",
        }
        created = await client.post("/api/backtests", json=body)
        assert created.status_code == 202
        detail = (await client.get(f"/api/backtests/{created.json()['id']}")).json()
        assert detail["status"] == "completed"
        assert detail["metrics"]["trade_count"] > 0
        assert len(detail["equity_curve"]) == 120
        assert detail["provenance"]["provider"] == "test_provider"
        trades = (await client.get(f"/api/backtests/{detail['id']}/trades")).json()["items"]
        assert trades and trades[0]["entry_fee"] > 0 and trades[0]["entry_slippage_cost"] > 0
        assert (await client.post(f"/api/backtests/{detail['id']}/save")).json()["is_saved"] is True

        invalid = await client.post("/api/backtests", json={**body, "short_window": 20, "long_window": 20})
        assert invalid.status_code == 422

    @pytest.mark.asyncio
    async def test_multi_market_portfolio_backtest_contract(self, client, monkeypatch):
        from datetime import date, timedelta

        requested: list[tuple[str, str, int]] = []
        start = date(2026, 1, 1)

        async def fake_kline(ticker, period, count):
            requested.append((ticker, period, count))
            scale = 0.4 if ticker == "usAAPL" else 1.4
            return [
                {
                    "day": (start + timedelta(days=index)).isoformat(),
                    "open": 100 + (index % 12) * scale,
                    "high": 102 + (index % 12) * scale,
                    "low": 99 + (index % 12) * scale,
                    "close": 101 + (index % 12) * scale,
                    "volume": 1000,
                    "source": "test_provider",
                    "adjustment": "split_adjusted",
                }
                for index in range(90)
            ]

        monkeypatch.setattr(app.state.market, "kline", fake_kline)
        response = await client.post("/api/backtests/portfolio", json={
            "assets": [
                {"symbol": "AAPL", "period": "60m", "short_window": 3, "long_window": 8},
                {"symbol": "0700.HK", "period": "1d", "short_window": 3, "long_window": 8},
            ],
            "optimizer": "inverse_volatility",
            "optimization_lookback": 20,
            "count": 80,
            "initial_capital": 100_000,
        })

        assert response.status_code == 200
        payload = response.json()
        assert {item["symbol"] for item in payload["assets"]} == {"AAPL", "00700.HK"}
        assert {period for _, period, _ in requested} == {"60m", "1d"}
        assert sum(payload["weights"].values()) == pytest.approx(1.0)
        assert payload["metrics"]["annualized_return"] is None
        assert "cross_currency_returns_normalized_without_fx" in payload["warnings"]
        assert payload["capabilities"]["optimizers"] == [
            "equal_weight", "risk_parity", "mean_variance", "inverse_volatility",
        ]

        duplicate = await client.post("/api/backtests/portfolio", json={
            "assets": [
                {"symbol": "AAPL", "period": "1d"},
                {"symbol": "usAAPL", "period": "1d"},
            ],
            "count": 120,
            "optimization_lookback": 20,
        })
        assert duplicate.status_code == 422


class TestCoverageCriticalRoutes:
    @pytest.mark.asyncio
    async def test_portfolio_full_lifecycle_and_not_found_contracts(self, client, monkeypatch):
        from app.routers import portfolio as portfolio_router

        created = await client.post("/api/portfolio", json={
            "name": "Global", "description": "multi-market", "currency": "USD",
        })
        assert created.status_code == 201
        portfolio_id = created.json()["id"]
        assert (await client.get("/api/portfolio")).json()["items"][0]["position_count"] == 0
        assert (await client.get(f"/api/portfolio/{portfolio_id}")).json()["name"] == "Global"

        assert (await client.put(f"/api/portfolio/{portfolio_id}", json={})).json()["name"] == "Global"
        updated = await client.put(f"/api/portfolio/{portfolio_id}", json={
            "name": "Global Core", "description": "updated", "currency": "HKD",
        })
        assert updated.json()["currency"] == "HKD"

        position = await client.post(f"/api/portfolio/{portfolio_id}/positions", json={
            "ticker": "0700.HK", "shares": 10, "avg_cost": 300, "name": "Tencent",
        })
        assert position.status_code == 201
        position_id = position.json()["id"]
        assert position.json()["currency"] == "HKD"
        assert len((await client.get(f"/api/portfolio/{portfolio_id}/positions")).json()["items"]) == 1
        assert (await client.put(f"/api/portfolio/positions/{position_id}", json={})).json()["shares"] == 10
        changed = await client.put(f"/api/portfolio/positions/{position_id}", json={"shares": 12, "avg_cost": 310})
        assert changed.json()["avg_cost"] == 310

        async def fake_pnl(requested_id, user_id):
            assert requested_id == portfolio_id
            assert user_id == 1
            return {"total_cost": 3720, "total_market_value": 4000, "total_pnl": 280, "total_pnl_pct": 7.53, "positions": []}

        monkeypatch.setattr(portfolio_router.svc, "calc_pnl", fake_pnl)
        assert (await client.get(f"/api/portfolio/{portfolio_id}/pnl")).json()["total_pnl"] == 280

        assert (await client.delete(f"/api/portfolio/positions/{position_id}")).json() == {"ok": True}
        assert (await client.delete(f"/api/portfolio/positions/{position_id}")).status_code == 404
        assert (await client.put(f"/api/portfolio/positions/{position_id}", json={"shares": 1})).status_code == 404
        assert (await client.delete(f"/api/portfolio/{portfolio_id}")).json() == {"ok": True}
        assert (await client.get(f"/api/portfolio/{portfolio_id}")).status_code == 404
        assert (await client.put(f"/api/portfolio/{portfolio_id}", json={"name": "missing"})).status_code == 404
        assert (await client.delete(f"/api/portfolio/{portfolio_id}")).status_code == 404
        assert (await client.post("/api/portfolio/999/positions", json={
            "ticker": "AAPL", "shares": 1, "avg_cost": 100,
        })).status_code == 404
        assert (await client.get("/api/portfolio/999/positions")).status_code == 404
        assert (await client.get("/api/portfolio/999/pnl")).status_code == 404

    @pytest.mark.asyncio
    async def test_market_routes_map_success_and_provider_errors(self, client, monkeypatch):
        from app.routers import market as market_router
        from app.services.market_data import MarketError

        bars = [{"day": "2026-01-01", "open": 9, "high": 11, "low": 8, "close": 10, "volume": 100}]

        async def search(query):
            return [{"code": "usAAPL", "name": "Apple"}]

        async def quote(ticker):
            return {"code": "usAAPL", "name": "Apple", "price": 200}

        async def kline(ticker, period, count):
            return bars

        monkeypatch.setattr(app.state.market, "search", search)
        monkeypatch.setattr(app.state.market, "quote", quote)
        monkeypatch.setattr(app.state.market, "kline", kline)
        monkeypatch.setattr(market_router.indicators, "compute", lambda rows, names=None: {"requested": names})
        calendar = (await client.get("/api/market/calendar?date=2026-02-23")).json()
        assert calendar["is_trading_day"] is False
        assert calendar["reason"] == "exchange_holiday"
        assert (await client.get("/api/market/search?q=Apple")).json()["items"][0]["code"] == "usAAPL"
        assert (await client.get("/api/market/quote?ticker=AAPL")).json()["price"] == 200
        assert len((await client.get("/api/market/kline?ticker=AAPL&count=1")).json()["items"]) == 1
        indicators = (await client.get("/api/market/indicators?ticker=AAPL&count=30&indicators=ma,rsi")).json()
        assert indicators["indicators"] == {"requested": ["ma", "rsi"]}

        async def market_failure(*args, **kwargs):
            raise MarketError("provider down")

        async def invalid_input(*args, **kwargs):
            raise ValueError("invalid ticker")

        monkeypatch.setattr(app.state.market, "search", market_failure)
        assert (await client.get("/api/market/search?q=AAPL")).status_code == 502
        for method, path in (
            ("quote", "/api/market/quote?ticker=AAPL"),
            ("kline", "/api/market/kline?ticker=AAPL"),
        ):
            monkeypatch.setattr(app.state.market, method, invalid_input)
            assert (await client.get(path)).status_code == 400
            monkeypatch.setattr(app.state.market, method, market_failure)
            assert (await client.get(path)).status_code == 502

        monkeypatch.setattr(app.state.market, "kline", kline)
        monkeypatch.setattr(
            market_router.indicators,
            "compute",
            lambda rows, names=None: (_ for _ in ()).throw(ValueError("bad indicator")),
        )
        assert (await client.get("/api/market/indicators?ticker=AAPL&count=30")).status_code == 400
        monkeypatch.setattr(app.state.market, "kline", invalid_input)
        assert (await client.get("/api/market/indicators?ticker=AAPL&count=30")).status_code == 400
        monkeypatch.setattr(app.state.market, "kline", market_failure)
        assert (await client.get("/api/market/indicators?ticker=AAPL&count=30")).status_code == 502

    @pytest.mark.asyncio
    async def test_market_foundation_and_review_routes(self, client, monkeypatch):
        from app.routers import market as market_router
        from app.services.market_overview import MarketOverviewService

        async def overview(self, market):
            return {"market": market, "indices": [], "breadth": {"status": "ok"}}

        async def sectors(self, kind, limit):
            return {"kind": kind, "items": [{"name": "AI"}]}

        async def popular(self, limit):
            return {"items": [{"rank": 1, "code": "sh600519"}]}

        async def limit_up(self, trading_date):
            return {"date": trading_date.isoformat(), "items": []}

        async def prefetch(tickers, *, enriched, concurrency):
            return {"items": [{"code": tickers[0]}], "errors": {}}

        async def create_review(market, markets, trading_date, model_id, *, user_id):
            assert user_id == 1
            return {"id": 8, "markets": markets, "trading_date": trading_date.isoformat()}

        async def list_reviews(user_id, limit):
            assert user_id == 1
            return [{"id": 8, "limit": limit}]

        async def get_review(review_id, user_id):
            assert user_id == 1
            return {"id": review_id} if review_id == 8 else None

        monkeypatch.setattr(MarketOverviewService, "overview", overview)
        monkeypatch.setattr(MarketOverviewService, "sectors", sectors)
        monkeypatch.setattr(MarketOverviewService, "popular", popular)
        monkeypatch.setattr(MarketOverviewService, "limit_up", limit_up)
        monkeypatch.setattr(app.state.market, "prefetch_quotes", prefetch)
        monkeypatch.setattr(market_router, "create_market_review", create_review)
        monkeypatch.setattr(market_router, "list_market_reviews", list_reviews)
        monkeypatch.setattr(market_router, "get_market_review", get_review)

        assert (await client.get("/api/market/overview?market=us")).json()["market"] == "us"
        assert (await client.get("/api/market/sectors?kind=concept&limit=3")).json()["kind"] == "concept"
        assert (await client.get("/api/market/popular?limit=3")).json()["items"][0]["rank"] == 1
        assert (await client.get("/api/market/limit-up?date=2026-07-31")).json()["date"] == "2026-07-31"
        assert (await client.post("/api/market/prefetch", json={"tickers": ["AAPL"]})).status_code == 200

        sources = await client.patch("/api/market/sources", json={
            "quote": ["sina", "tencent", "yahoo"],
            "fundamentals": ["tushare", "akshare", "yahoo"],
        })
        assert sources.json()["priorities"]["quote"][0] == "sina"
        assert sources.json()["priorities"]["fundamentals"][0] == "tushare"
        assert (await client.get("/api/market/sources")).status_code == 200
        assert (await client.patch("/api/market/sources", json={})).status_code == 422
        assert (await client.patch("/api/market/sources", json={"quote": ["sina"]})).status_code == 400

        created = await client.post("/api/market/reviews", json={
            "markets": ["cn", "us"], "trading_date": "2026-07-31", "model_id": 1,
        })
        assert created.json()["id"] == 8
        assert (await client.get("/api/market/reviews?limit=5")).json()["items"][0]["limit"] == 5
        assert (await client.get("/api/market/reviews/8")).json()["id"] == 8
        assert (await client.get("/api/market/reviews/999")).status_code == 404

    @pytest.mark.asyncio
    async def test_screening_sorts_valid_items_and_preserves_errors(self, client, monkeypatch):
        from app.services.market_data import MarketError

        async def quote(ticker):
            if ticker == "BAD":
                raise MarketError("unknown")
            return {"code": ticker, "name": ticker, "price": 120, "change_percent": 1.5}

        async def kline(ticker, period="1d", count=60):
            start, end = ((100, 120) if ticker == "AAPL" else (100, 90))
            return [{"close": start}, {"close": end}]

        monkeypatch.setattr(app.state.market, "quote", quote)
        monkeypatch.setattr(app.state.market, "kline", kline)
        response = await client.post("/api/screening", json={"tickers": [" AAPL ", "MSFT", "BAD", " "]})
        assert response.status_code == 200
        body = response.json()
        assert [item["ticker"] for item in body["items"]] == ["AAPL", "MSFT"]
        assert body["items"][0]["signal"] == "动量偏强"
        assert body["items"][1]["signal"] == "动量偏弱"
        assert body["errors"] == [{"ok": False, "ticker": "BAD", "error": "unknown"}]


class TestSettingsAndMCPConfiguration:
    @pytest.mark.asyncio
    async def test_system_settings_are_allowlisted_persisted_and_applied(self, client, monkeypatch):
        tracked = (
            "SCHEDULER_ENABLED", "SCHEDULER_CONCURRENCY", "SCHEDULER_MAX_TARGETS",
            "SCHEDULER_HOUR", "SCHEDULER_MINUTE",
        )
        for attribute in tracked:
            monkeypatch.setattr(config, attribute, getattr(config, attribute))

        initial = await client.get("/api/settings/system")
        assert initial.status_code == 200
        assert initial.json()["metadata"]["secrets_exposed"] is False
        assert "DEEPSEEK_API_KEY" not in initial.text

        updated = await client.patch("/api/settings/system", json={
            "scheduler_enabled": False,
            "scheduler_concurrency": 4,
            "scheduler_max_targets": 50,
            "scheduler_hour": 19,
            "scheduler_minute": 30,
        })
        assert updated.status_code == 200
        assert updated.json()["settings"] == {
            "scheduler_enabled": False,
            "scheduler_concurrency": 4,
            "scheduler_max_targets": 50,
            "scheduler_hour": 19,
            "scheduler_minute": 30,
        }
        assert config.SCHEDULER_CONCURRENCY == 4
        stored = await database.query_all("SELECT key, value_json FROM system_settings")
        assert {row["key"] for row in stored} == {
            "scheduler_enabled", "scheduler_concurrency", "scheduler_max_targets",
            "scheduler_hour", "scheduler_minute",
        }
        config.SCHEDULER_CONCURRENCY = 2
        from app.services.system_settings import load_system_settings
        assert (await load_system_settings())["scheduler_concurrency"] == 4
        assert (await client.patch("/api/settings/system", json={})).status_code == 422
        assert (await client.patch(
            "/api/settings/system", json={"scheduler_concurrency": 21},
        )).status_code == 422

    @pytest.mark.asyncio
    async def test_scheduled_research_job_crud(self, client):
        created = await client.post("/api/settings/research-jobs", json={
            "name": "茅台晨报",
            "ticker": "600519",
            "company_name": "贵州茅台",
            "cron_expr": "30 8 * * 1-5",
        })
        assert created.status_code == 201
        job = created.json()
        assert job["ticker"] == "sh600519"
        assert job["next_run_at"] is not None

        listed = (await client.get("/api/settings/research-jobs")).json()["items"]
        assert [item["id"] for item in listed] == [job["id"]]
        disabled = await client.patch(
            f"/api/settings/research-jobs/{job['id']}", json={"is_enabled": False}
        )
        assert disabled.json()["next_run_at"] is None
        assert (await client.delete(f"/api/settings/research-jobs/{job['id']}")).json() == {"ok": True}

    @pytest.mark.asyncio
    async def test_scheduled_research_job_rejects_invalid_cron(self, client):
        response = await client.post("/api/settings/research-jobs", json={
            "name": "坏任务", "ticker": "AAPL", "cron_expr": "60 8 * * *",
        })
        assert response.status_code == 422

    @pytest.mark.asyncio
    async def test_mcp_http_server_configuration_lifecycle(self, client, monkeypatch):
        from app.routers import mcp as mcp_router

        connected: set[str] = set()

        async def connect(name: str, url: str) -> int:
            assert url.startswith("https://")
            connected.add(name)
            return 3

        def remove(name: str) -> None:
            connected.discard(name)

        monkeypatch.setattr(mcp_router, "connect_http_mcp_server", connect)
        monkeypatch.setattr(mcp_router, "remove_mcp_server", remove)
        monkeypatch.setattr(mcp_router, "is_mcp_server_connected", connected.__contains__)

        invalid = await client.post("/api/mcp/configs", json={
            "name": "files", "url": "file:///tmp/server",
        })
        assert invalid.status_code == 422

        created = await client.post("/api/mcp/configs", json={
            "name": "research", "url": "https://mcp.example.test/api",
        })
        assert created.status_code == 201
        config_id = created.json()["id"]
        assert created.json()["connected"] is False
        assert (await client.post("/api/mcp/configs", json={
            "name": "research", "url": "https://other.example.test/api",
        })).status_code == 409

        connected_response = await client.post(f"/api/mcp/configs/{config_id}/connect")
        assert connected_response.json()["connected"] is True
        assert connected_response.json()["tool_count"] == 3
        assert (await client.get("/api/mcp/configs")).json()["total"] == 1

        updated = await client.put(f"/api/mcp/configs/{config_id}", json={
            "name": "research-v2", "url": "https://mcp2.example.test/api",
        })
        assert updated.json()["is_enabled"] is False
        assert connected == set()
        assert (await client.post(f"/api/mcp/configs/{config_id}/connect")).json()["connected"] is True
        assert (await client.post(f"/api/mcp/configs/{config_id}/disconnect")).json()["connected"] is False
        assert (await client.delete(f"/api/mcp/configs/{config_id}")).json() == {"ok": True}
        assert (await client.get("/api/mcp/configs")).json()["total"] == 0
        assert (await client.delete("/api/mcp/configs/999")).status_code == 404

    @pytest.mark.asyncio
    async def test_enabled_mcp_servers_restore_and_record_failures(self, client, monkeypatch):
        from app.services import mcp_runtime

        await database.execute(
            "INSERT INTO mcp_server_configs (name, url, is_enabled) VALUES (?, ?, 1)",
            ("working", "https://working.example.test/mcp"),
        )
        failed_id = await database.execute(
            "INSERT INTO mcp_server_configs (name, url, is_enabled) VALUES (?, ?, 1)",
            ("broken", "https://broken.example.test/mcp"),
        )
        restored: list[str] = []

        async def connect(name: str, url: str) -> int:
            if name == "broken":
                raise TimeoutError("deadline")
            restored.append(f"{name}:{url}")
            return 2

        monkeypatch.setattr(mcp_runtime, "connect_http_mcp_server", connect)
        await mcp_runtime.restore_enabled_mcp_servers()

        assert restored == ["working:https://working.example.test/mcp"]
        failed = await database.query_one(
            "SELECT is_enabled, last_error FROM mcp_server_configs WHERE id=?",
            (failed_id,),
        )
        assert failed["is_enabled"] == 1
        assert failed["last_error"] == "TimeoutError: deadline"
