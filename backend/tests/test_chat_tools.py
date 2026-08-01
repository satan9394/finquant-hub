import json

import pytest

from app.agent.tools import ToolResult
from app.routers.chat import _execute_tool


class StubTool:
    async def run(self, **kwargs):
        return ToolResult(True, data={"echo": kwargs})


@pytest.mark.asyncio
async def test_chat_tool_executor_validates_and_serializes(monkeypatch):
    monkeypatch.setattr("app.routers.chat.ToolRegistry.get", lambda self, name: StubTool() if name == "echo" else None)

    success = json.loads(await _execute_tool("echo", '{"ticker":"600519"}'))
    missing = json.loads(await _execute_tool("missing", "{}"))
    malformed = json.loads(await _execute_tool("echo", "[]"))

    assert success == {"success": True, "data": {"echo": {"ticker": "600519"}}, "error": None}
    assert missing["success"] is False
    assert "对象" in malformed["error"]
