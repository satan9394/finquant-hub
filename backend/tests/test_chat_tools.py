import json

import pytest

from app import config, database
from app.agent.tools import BaseTool, ToolRegistry, ToolResult
from app.models import MessageIn
from app.routers import chat
from app.routers.chat import _execute_tool
from app.services import model_router
from app.services.llm_client import DEFAULT_TOOL_LOOP_DEADLINE_SECONDS


class StubTool(BaseTool):
    name = "echo"
    description = "Echo tool"
    parameters = {"type": "object", "properties": {"ticker": {"type": "string"}}}

    async def run(self, **kwargs):
        return ToolResult(True, data={"echo": kwargs})


@pytest.mark.asyncio
async def test_chat_tool_executor_validates_and_serializes(monkeypatch):
    async def fake_dispatch(self, name, arguments):
        if name == "echo":
            if isinstance(arguments, str):
                try:
                    arguments = json.loads(arguments) if arguments.strip() else {}
                except json.JSONDecodeError:
                    return ToolResult(False, error="工具参数不是有效 JSON")
            if not isinstance(arguments, dict):
                return ToolResult(False, error="工具参数必须是对象")
            result = await StubTool().run(**arguments)
            return ToolResult(True, data=result.data)
        return ToolResult(False, error=f"未知工具：{name}")

    monkeypatch.setattr("app.routers.chat.ToolRegistry.dispatch", fake_dispatch)

    success = json.loads(await _execute_tool("echo", '{"ticker":"600519"}'))
    missing = json.loads(await _execute_tool("missing", "{}"))
    malformed = json.loads(await _execute_tool("echo", "[]"))

    assert success == {"success": True, "data": {"echo": {"ticker": "600519"}}, "error": None}
    assert missing["success"] is False
    assert "未知工具" in missing["error"]
    assert "对象" in malformed["error"]


class LoopStubTool(BaseTool):
    name = "echo"
    description = "Echo tool"
    parameters = {"type": "object", "properties": {"ticker": {"type": "string"}}}

    async def run(self, **kwargs):
        return ToolResult(True, data={"echo": kwargs})


@pytest.mark.asyncio
async def test_tool_loop_emits_controlled_events(monkeypatch):
    """chat_with_tools_loop 的 event_sink 发出受控事件枚举，SSE 层可直接转发。"""
    from app.services.llm_client import LLMClient, TOOL_LOOP_EVENTS
    client = LLMClient(base_url="http://x", api_key="k", model="m")

    async def fake_safe(messages, tools, **_kwargs):
        # 第一轮返回工具调用，第二轮直接回复文本
        if not any(msg.get("role") == "tool" for msg in messages):
            return "思考中", [{
                "id": "call_1",
                "type": "function",
                "reasoning_content": None,
                "function": {"name": "echo", "arguments": '{"ticker":"600519"}'},
            }], 10, "tool_calls"
        return "最终答案", [], 5, "stop"

    monkeypatch.setattr(client, "chat_with_tools_safe", fake_safe)
    events: list[tuple[str, dict]] = []

    async def sink(event, data):
        events.append((event, data))

    async def executor(name, arguments):
        result = await ToolRegistry().dispatch(name, arguments)
        return json.dumps({"success": result.success, "data": result.data, "error": result.error}, ensure_ascii=False)

    registry = ToolRegistry()
    previous = registry.get("echo")
    registry.register(LoopStubTool())
    try:
        text, calls, tokens = await client.chat_with_tools_loop(
            [{"role": "user", "content": "hi"}],
            registry.to_openai_tools(),
            executor,
            event_sink=sink,
        )
    finally:
        if previous is not None:
            registry.register(previous)
        else:
            registry.remove("echo")

    assert text == "最终答案"
    assert len(calls) == 1
    assert calls[0]["name"] == "echo"
    names = [e for e, _ in events]
    assert names == ["tool_started", "tool_completed", "tool_loop_done"]
    assert all(name in TOOL_LOOP_EVENTS for name in names)
    assert events[0][1]["tool_name"] == "echo"


@pytest.mark.asyncio
async def test_tool_loop_pre_and_post_hooks(monkeypatch):
    """pre_tool_hook 拦截执行，post_tool_hook 替换结果——guardrail 语义。"""
    from app.services.llm_client import LLMClient

    client = LLMClient(base_url="http://x", api_key="k", model="m")

    async def fake_safe(messages, tools, **_kwargs):
        if not any(msg.get("role") == "tool" for msg in messages):
            return "思考中", [{
                "id": "call_1",
                "type": "function",
                "reasoning_content": None,
                "function": {"name": "echo", "arguments": '{"ticker":"600519"}'},
            }], 10, "tool_calls"
        return "最终答案", [], 5, "stop"

    monkeypatch.setattr(client, "chat_with_tools_safe", fake_safe)
    executed: list[str] = []

    async def executor(name, arguments):
        executed.append(name)
        return '{"success": true, "data": {"echo": {"ticker": "600519"}}}'

    async def pre_hook(name, arguments):
        if name == "blocked":
            return "已被 guardrail 拦截"
        return None

    async def post_hook(name, arguments, result):
        if "600519" in result:
            return '{"success": true, "data": {"audited": true}}'
        return None

    registry = ToolRegistry()
    previous = registry.get("echo")
    registry.register(LoopStubTool())
    try:
        text, calls, _ = await client.chat_with_tools_loop(
            [{"role": "user", "content": "hi"}],
            registry.to_openai_tools(),
            executor,
            pre_tool_hook=pre_hook,
            post_tool_hook=post_hook,
        )
    finally:
        if previous is not None:
            registry.register(previous)
        else:
            registry.remove("echo")

    assert text == "最终答案"
    assert executed == ["echo"]  # pre_hook 未拦截 echo
    assert "audited" in calls[0]["result"]  # post_hook 替换了结果


# ==================== VS23: 整轮截止在聊天 SSE 上的**显式**透出 ====================
# 卡里要求"调用方/chat.py 侧据此如实提示"。本文件可直接运行（不像 test_api.py），
# 故聚焦用例放在这里：用替身驱动真实路由 chat.send_message 的 SSE 生成器，逐事件断言。

@pytest.fixture
async def chat_deadline_db(tmp_path, monkeypatch):
    """临时库 + 单一本地所有者（与 test_memory_rollout 同款最小 setup）。"""
    monkeypatch.setattr(config, "DB_PATH", tmp_path / "chat-deadline.db")
    monkeypatch.setattr(config, "MEMORY_TYPED_SHADOW_ENABLED", False)
    monkeypatch.setattr(config, "MEMORY_TYPED_CONTEXT_ENABLED", False)
    await database.init_db()
    user_id = await database.execute("INSERT INTO users (email) VALUES ('deadline@test.local')")
    try:
        yield user_id
    finally:
        await database.close_db()


async def _run_chat_sse(user_id, monkeypatch, loop_result):
    """驱动一次聊天 SSE，返回 (事件列表, 落库的助手内容, 路由实际传入的 deadline)。"""
    seen_deadlines: list[float | None] = []

    class DeadlineClient:
        async def chat_with_tools_loop(
            self, messages, tools, executor, max_rounds=5, event_sink=None,
            pre_tool_hook=None, post_tool_hook=None, *, deadline_seconds=None,
        ):
            seen_deadlines.append(deadline_seconds)
            return loop_result(deadline_seconds)

    async def fake_get_client(model_id=None, **_kwargs):
        return DeadlineClient(), {"id": 1, "name": "DeadlineModel"}

    async def empty_native_search(*args, **kwargs):
        return []

    monkeypatch.setattr(model_router, "get_client", fake_get_client)
    monkeypatch.setattr(chat.native_memory_provider, "search", empty_native_search)
    conversation_id = await database.execute(
        "INSERT INTO conversations (title, mode, user_id) VALUES ('', 'single', ?)", (user_id,)
    )

    response = await chat.send_message(conversation_id, MessageIn(content="hi"), {"id": user_id})
    events = [chunk async for chunk in response.body_iterator]
    stored = await database.query_one(
        "SELECT content FROM messages WHERE conversation_id=? AND role='assistant'", (conversation_id,)
    )
    return events, (stored["content"] if stored else None), seen_deadlines


@pytest.mark.asyncio
async def test_chat_surfaces_deadline_truncation_explicitly(chat_deadline_db, monkeypatch):
    """VS23：因总时长上限提前结束 ⇒ 正文如实提示 + done 载荷带显式标记（绝不伪装成正常回答）。"""
    user_id = chat_deadline_db

    def truncated(deadline_seconds):
        return ("已完成的部分正文", [], 7, {
            "truncated_by_deadline": True,
            "reason": "deadline_exceeded_before_tool_round",
            "deadline_seconds": deadline_seconds,
            "llm_calls": 3,
            "elapsed_seconds": 601.0,
        })

    events, stored, seen_deadlines = await _run_chat_sse(user_id, monkeypatch, truncated)

    kinds = [event["event"] for event in events]
    assert "error" not in kinds, "整轮截止是**正常收尾**，不得走 error 事件"
    assert seen_deadlines == [DEFAULT_TOOL_LOOP_DEADLINE_SECONDS], "聊天路由必须真的带上整轮截止"

    delta = json.loads(next(event for event in events if event["event"] == "token")["data"])["delta"]
    assert delta.startswith("（因超过总时长上限提前结束，以下为已完成部分）")
    assert "已完成的部分正文" in delta

    done = json.loads(next(event for event in events if event["event"] == "done")["data"])
    assert done["truncated_by_deadline"] is True, "done 载荷必须带机器可读的显式标记"
    assert stored is not None and "因超过总时长上限提前结束" in stored, "落库内容必须与用户所见一致"


@pytest.mark.asyncio
async def test_chat_does_not_mark_normal_completion_as_truncated(chat_deadline_db, monkeypatch):
    """VS23 反例：未截断 ⇒ 不得出现任何"提前结束"提示，done 标记为 False（不得误报截断）。"""
    user_id = chat_deadline_db

    def completed(deadline_seconds):
        return ("正常回答", [], 7, {
            "truncated_by_deadline": False,
            "reason": None,
            "deadline_seconds": deadline_seconds,
            "llm_calls": 1,
            "elapsed_seconds": 1.0,
        })

    events, stored, _ = await _run_chat_sse(user_id, monkeypatch, completed)

    assert [event["event"] for event in events] == ["token", "done"]
    delta = json.loads(events[0]["data"])["delta"]
    assert delta == "正常回答"
    assert "总时长上限" not in delta
    done = json.loads(events[1]["data"])
    assert done["truncated_by_deadline"] is False
    assert stored == "正常回答"

