"""Restore persisted HTTP MCP connections into the process-local tool registry."""
from __future__ import annotations

import asyncio

from .. import database
from ..tools.mcp_bridge import MCPBridge, MCPServerConfig, remove_mcp_server


MCP_CONNECT_TIMEOUT_SECONDS = 10.0


async def connect_http_mcp_server(name: str, url: str) -> int:
    remove_mcp_server(name)
    bridge = MCPBridge(MCPServerConfig(name=name, url=url))
    tools = await asyncio.wait_for(
        bridge.register_tools(),
        timeout=MCP_CONNECT_TIMEOUT_SECONDS,
    )
    return len(tools)


async def restore_enabled_mcp_servers() -> None:
    rows = await database.query_all(
        "SELECT id, name, url FROM mcp_server_configs WHERE is_enabled=1 ORDER BY id"
    )
    for row in rows:
        try:
            await connect_http_mcp_server(row["name"], row["url"])
        except Exception as exc:
            message = f"{type(exc).__name__}: {exc}"[:500]
            await database.execute(
                "UPDATE mcp_server_configs SET last_error=?, updated_at=datetime('now') WHERE id=?",
                (message, row["id"]),
            )
        else:
            await database.execute(
                "UPDATE mcp_server_configs SET last_error=NULL, updated_at=datetime('now') WHERE id=?",
                (row["id"],),
            )
