"""将外部 MCP 服务器工具桥接到 Agent ToolRegistry。"""

import hashlib
import re
from collections.abc import Callable, Mapping
from contextlib import AbstractAsyncContextManager
from dataclasses import dataclass
from typing import Any
from urllib.parse import urlsplit

from mcp import Client, StdioServerParameters
from mcp.client.stdio import stdio_client

from ..agent.tools import BaseTool, ToolRegistry, ToolResult

_INVALID_TOOL_NAME = re.compile(r"[^A-Za-z0-9_-]+")
_MAX_TOOL_NAME_LENGTH = 64
ClientFactory = Callable[[], AbstractAsyncContextManager[Any]]


@dataclass(frozen=True)
class MCPServerConfig:
    """一个 MCP 服务器连接；URL 与 command 必须二选一。"""

    name: str
    url: str | None = None
    command: str | None = None
    args: tuple[str, ...] = ()
    env: Mapping[str, str] | None = None

    def __post_init__(self) -> None:
        if not self.name.strip():
            raise ValueError("MCP 服务器 name 不能为空")
        if (self.url is None) == (self.command is None):
            raise ValueError("MCP 服务器必须且只能配置 url 或 command")
        if self.url is not None:
            parsed = urlsplit(self.url)
            if parsed.scheme not in {"http", "https"} or not parsed.netloc:
                raise ValueError("MCP url 必须是有效的 http(s) 地址")
            if self.args or self.env:
                raise ValueError("MCP HTTP 配置不能包含 args 或 env")
        if self.command is not None and not self.command.strip():
            raise ValueError("MCP command 不能为空")


class MCPTool(BaseTool):
    """运行时发现的远程 MCP 工具代理。"""

    name = "_mcp_runtime_tool"
    auto_register = False

    def __init__(
        self,
        bridge: "MCPBridge",
        remote_name: str,
        local_name: str,
        description: str,
        parameters: dict,
    ) -> None:
        self.bridge = bridge
        self.remote_name = remote_name
        self.name = local_name
        self.description = description
        self.parameters = parameters

    async def run(self, **kwargs) -> ToolResult:
        return await self.bridge.call_tool(self.remote_name, kwargs)


_MCP_TOOL_CATALOG: dict[str, MCPTool] = {}
_MCP_CONNECTED_SERVERS: set[str] = set()


class MCPBridge:
    """发现并调用一个外部 MCP 服务器暴露的工具。"""

    def __init__(self, config: MCPServerConfig, client_factory: ClientFactory | None = None) -> None:
        self.config = config
        self._client_factory = client_factory

    def _new_client(self) -> AbstractAsyncContextManager[Any]:
        if self._client_factory is not None:
            return self._client_factory()
        if self.config.url is not None:
            return Client(self.config.url)

        server = StdioServerParameters(
            command=self.config.command or "",
            args=list(self.config.args),
            env=dict(self.config.env) if self.config.env is not None else None,
        )
        return Client(stdio_client(server))

    async def discover_tools(self) -> list[MCPTool]:
        """读取服务器全部工具页并转为本地 BaseTool 代理。"""
        remote_tools = []
        seen_cursors: set[str] = set()
        cursor: str | None = None

        async with self._new_client() as client:
            while True:
                page = await client.list_tools(cursor=cursor)
                remote_tools.extend(page.tools)
                cursor = page.next_cursor
                if cursor is None:
                    break
                if cursor in seen_cursors:
                    raise RuntimeError(f"MCP 服务器 {self.config.name} 返回了重复分页游标")
                seen_cursors.add(cursor)

        proxies = [
            MCPTool(
                bridge=self,
                remote_name=tool.name,
                local_name=_local_tool_name(self.config.name, tool.name),
                description=tool.description or f"MCP 工具 {tool.name}",
                parameters=dict(tool.input_schema),
            )
            for tool in remote_tools
        ]
        names = [tool.name for tool in proxies]
        if len(names) != len(set(names)):
            raise ValueError(f"MCP 服务器 {self.config.name} 的工具名称映射后发生冲突")
        return proxies

    async def register_tools(self, registry: ToolRegistry | None = None) -> list[MCPTool]:
        """发现远程工具并原子式注册；不覆盖本地或其他服务器工具。"""
        registry = registry or ToolRegistry()
        proxies = await self.discover_tools()
        collisions = []
        for proxy in proxies:
            existing = registry.get(proxy.name)
            same_remote = (
                isinstance(existing, MCPTool)
                and existing.bridge.config == self.config
                and existing.remote_name == proxy.remote_name
            )
            if existing is not None and not same_remote:
                collisions.append(proxy.name)
        if collisions:
            raise ValueError(f"MCP 工具名称与现有注册项冲突：{', '.join(collisions)}")

        for proxy in proxies:
            _MCP_TOOL_CATALOG[proxy.name] = proxy
            registry.register(proxy)
        _MCP_CONNECTED_SERVERS.add(self.config.name)
        return proxies

    async def call_tool(self, remote_name: str, arguments: dict[str, Any]) -> ToolResult:
        """调用远程工具并转换为项目统一的 ToolResult。"""
        try:
            async with self._new_client() as client:
                result = await client.call_tool(remote_name, arguments)
        except Exception as exc:
            return ToolResult(False, error=f"MCP 工具调用失败：{exc}")

        content = [_dump_content(block) for block in result.content]
        data = result.structured_content if result.structured_content is not None else content
        if result.is_error:
            error = "\n".join(
                text for block in result.content if (text := getattr(block, "text", None))
            ) or f"MCP 工具 {remote_name} 执行失败"
            return ToolResult(False, data=data, error=error)
        return ToolResult(True, data=data)


def list_mcp_servers(registry: ToolRegistry | None = None) -> list[dict[str, Any]]:
    """按服务器列出已发现工具以及它们当前是否对 Agent 可用。"""
    selected_registry = registry or ToolRegistry()
    servers: dict[str, dict[str, Any]] = {}
    for tool in sorted(
        _MCP_TOOL_CATALOG.values(),
        key=lambda item: (item.bridge.config.name, item.remote_name),
    ):
        config = tool.bridge.config
        server = servers.setdefault(config.name, {
            "name": config.name,
            "transport": "http" if config.url is not None else "stdio",
            "tools": [],
        })
        server["tools"].append({
            "name": tool.remote_name,
            "local_name": tool.name,
            "description": tool.description,
            "parameters": tool.parameters,
            "enabled": selected_registry.get(tool.name) is tool,
        })
    return list(servers.values())


def set_mcp_tool_enabled(
    local_name: str,
    enabled: bool,
    registry: ToolRegistry | None = None,
) -> dict[str, Any]:
    """切换已发现 MCP 工具在 ToolRegistry 中的可用状态。"""
    tool = _MCP_TOOL_CATALOG.get(local_name)
    if tool is None:
        raise KeyError(local_name)

    selected_registry = registry or ToolRegistry()
    existing = selected_registry.get(local_name)
    if enabled:
        if existing is not None and existing is not tool:
            raise ValueError(f"工具名称已被其他实现占用：{local_name}")
        selected_registry.register(tool)
    elif existing is tool:
        selected_registry.remove(local_name)

    return {
        "name": tool.remote_name,
        "local_name": tool.name,
        "description": tool.description,
        "parameters": tool.parameters,
        "enabled": selected_registry.get(local_name) is tool,
    }


def clear_mcp_tool_catalog() -> None:
    """清空进程内发现目录；用于测试隔离或显式重新发现。"""
    _MCP_TOOL_CATALOG.clear()
    _MCP_CONNECTED_SERVERS.clear()


def remove_mcp_server(server_name: str, registry: ToolRegistry | None = None) -> None:
    """Atomically remove one server's discovered tools from the runtime."""
    selected_registry = registry or ToolRegistry()
    for local_name, tool in list(_MCP_TOOL_CATALOG.items()):
        if tool.bridge.config.name != server_name:
            continue
        if selected_registry.get(local_name) is tool:
            selected_registry.remove(local_name)
        del _MCP_TOOL_CATALOG[local_name]
    _MCP_CONNECTED_SERVERS.discard(server_name)


def is_mcp_server_connected(server_name: str) -> bool:
    return server_name in _MCP_CONNECTED_SERVERS


def _local_tool_name(server_name: str, remote_name: str) -> str:
    raw = f"mcp__{server_name}__{remote_name}"
    safe = _INVALID_TOOL_NAME.sub("_", raw).strip("_") or "mcp_tool"
    if safe != raw or len(safe) > _MAX_TOOL_NAME_LENGTH:
        digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()[:8]
        safe = f"{safe[:_MAX_TOOL_NAME_LENGTH - 9].rstrip('_')}_{digest}"
    return safe


def _dump_content(block: Any) -> Any:
    if hasattr(block, "model_dump"):
        return block.model_dump(mode="json", by_alias=True, exclude_none=True)
    return str(block)
