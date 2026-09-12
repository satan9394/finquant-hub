import json

import pytest

from app.agent.tools import BaseTool, ToolRegistry, ToolResult
from app.routers.chat import _execute_tool


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
