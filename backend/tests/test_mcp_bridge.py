from types import SimpleNamespace

import pytest
from httpx import ASGITransport, AsyncClient
from mcp import Client
from mcp.server import MCPServer

from app.agent.tools import ToolRegistry
from app.main import app
from app.tools.mcp_bridge import (
    MCPBridge,
    MCPServerConfig,
    MCPTool,
    clear_mcp_tool_catalog,
    is_mcp_server_connected,
    remove_mcp_server,
)


class FakeContent:
    def __init__(self, text: str):
        self.text = text

    def model_dump(self, **kwargs):
        return {"type": "text", "text": self.text}


class FakeMCPClient:
    def __init__(self, state: dict):
        self.state = state

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def list_tools(self, cursor=None):
        self.state.setdefault("list_cursors", []).append(cursor)
        if cursor is None:
            return SimpleNamespace(
                tools=[SimpleNamespace(
                    name="add",
                    description="Add two numbers",
                    input_schema={"type": "object", "properties": {"a": {"type": "number"}}},
                )],
                next_cursor="page-2",
            )
        return SimpleNamespace(
            tools=[SimpleNamespace(name="status", description=None, input_schema={"type": "object"})],
            next_cursor=None,
        )

    async def call_tool(self, name, arguments):
        self.state.setdefault("calls", []).append((name, arguments))
        return self.state["call_result"]


@pytest.fixture
def bridge_state():
    return {
        "call_result": SimpleNamespace(
            structured_content={"answer": 5},
            content=[FakeContent("5")],
            is_error=False,
        )
    }


@pytest.fixture
def bridge(bridge_state):
    config = MCPServerConfig(name="math", url="https://mcp.example.test/mcp")
    return MCPBridge(config, client_factory=lambda: FakeMCPClient(bridge_state))


@pytest.fixture
def isolated_registry(monkeypatch):
    clear_mcp_tool_catalog()
    monkeypatch.setattr(ToolRegistry, "_instance", None)
    registry = ToolRegistry()
    yield registry
    clear_mcp_tool_catalog()


def test_server_config_requires_exactly_one_transport():
    with pytest.raises(ValueError, match="只能配置"):
        MCPServerConfig(name="bad")
    with pytest.raises(ValueError, match="只能配置"):
        MCPServerConfig(name="bad", url="https://example.test/mcp", command="python")
    with pytest.raises(ValueError, match="http"):
        MCPServerConfig(name="bad", url="file:///tmp/server")


@pytest.mark.asyncio
async def test_discovers_all_pages_and_registers_proxies(bridge, bridge_state, isolated_registry):
    proxies = await bridge.register_tools(isolated_registry)

    assert bridge_state["list_cursors"] == [None, "page-2"]
    assert [tool.name for tool in proxies] == ["mcp__math__add", "mcp__math__status"]
    assert all(isinstance(tool, MCPTool) for tool in proxies)
    assert isolated_registry.get("mcp__math__add").to_openai_tool()["function"] == {
        "name": "mcp__math__add",
        "description": "Add two numbers",
        "parameters": {"type": "object", "properties": {"a": {"type": "number"}}},
    }
    assert is_mcp_server_connected("math") is True

    remove_mcp_server("math", isolated_registry)

    assert is_mcp_server_connected("math") is False
    assert isolated_registry.get("mcp__math__add") is None


@pytest.mark.asyncio
async def test_proxy_calls_remote_tool_and_uses_structured_result(bridge, bridge_state, isolated_registry):
    await bridge.register_tools(isolated_registry)

    result = await isolated_registry.get("mcp__math__add").run(a=2, b=3)

    assert result.success
    assert result.data == {"answer": 5}
    assert bridge_state["calls"] == [("add", {"a": 2, "b": 3})]


@pytest.mark.asyncio
async def test_remote_error_becomes_tool_result(bridge, bridge_state):
    bridge_state["call_result"] = SimpleNamespace(
        structured_content=None,
        content=[FakeContent("remote failed")],
        is_error=True,
    )

    result = await bridge.call_tool("add", {"a": 2})

    assert not result.success
    assert result.error == "remote failed"
    assert result.data == [{"type": "text", "text": "remote failed"}]


@pytest.mark.asyncio
async def test_registration_does_not_overwrite_existing_tool(bridge, isolated_registry):
    existing = isolated_registry.get("get_stock_data")
    existing.name = "mcp__math__add"
    isolated_registry.register(existing)

    with pytest.raises(ValueError, match="冲突"):
        await bridge.register_tools(isolated_registry)


@pytest.mark.asyncio
async def test_market_api_lists_parameters_and_toggles_runtime_access(bridge, isolated_registry):
    await bridge.register_tools(isolated_registry)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        market = (await client.get("/api/mcp/servers")).json()
        assert market["total_servers"] == 1
        assert market["total_tools"] == 2
        assert market["items"][0]["name"] == "math"
        assert market["items"][0]["transport"] == "http"
        add = market["items"][0]["tools"][0]
        assert add["name"] == "add"
        assert add["parameters"]["properties"]["a"]["type"] == "number"
        assert add["enabled"] is True

        disabled = await client.patch(f"/api/mcp/tools/{add['local_name']}", json={"enabled": False})
        assert disabled.status_code == 200
        assert disabled.json()["enabled"] is False
        assert isolated_registry.get(add["local_name"]) is None

        enabled = await client.patch(f"/api/mcp/tools/{add['local_name']}", json={"enabled": True})
        assert enabled.json()["enabled"] is True
        assert isolated_registry.get(add["local_name"]) is not None

        missing = await client.patch("/api/mcp/tools/mcp__missing", json={"enabled": False})
        assert missing.status_code == 404


@pytest.mark.asyncio
async def test_official_sdk_in_memory_round_trip():
    server = MCPServer("calculator")

    @server.tool()
    def multiply(a: int, b: int) -> dict:
        return {"product": a * b}

    bridge = MCPBridge(
        MCPServerConfig(name="calculator", url="https://unused.example.test/mcp"),
        client_factory=lambda: Client(server),
    )

    tools = await bridge.discover_tools()
    result = await tools[0].run(a=6, b=7)

    assert tools[0].name == "mcp__calculator__multiply"
    assert tools[0].parameters["required"] == ["a", "b"]
    assert result.success
    assert '"product": 42' in result.data[0]["text"]
