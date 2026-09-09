"""Restore persisted MCP connections into the process-local tool registry."""

from __future__ import annotations

import asyncio
import json

from .. import database
from ..tools.mcp_bridge import MCPBridge, MCPServerConfig, remove_mcp_server


MCP_CONNECT_TIMEOUT_SECONDS = 10.0


async def connect_mcp_server(config: MCPServerConfig) -> int:
    """Connect any persisted MCP server; the bridge dispatches http vs stdio by config."""
    remove_mcp_server(config.name)
    bridge = MCPBridge(config)
    tools = await asyncio.wait_for(
        bridge.register_tools(),
        timeout=MCP_CONNECT_TIMEOUT_SECONDS,
    )
    return len(tools)


async def connect_http_mcp_server(name: str, url: str) -> int:
    """HTTP (SSE) MCP server, kept as a thin wrapper for existing callers."""
    return await connect_mcp_server(MCPServerConfig(name=name, url=url))


async def restore_enabled_mcp_servers() -> None:
    rows = await database.query_all(
        "SELECT id, name, url, command, args_json FROM mcp_server_configs WHERE is_enabled=1 ORDER BY id"
    )
    for row in rows:
        raw_args = row.get("args_json") or ""
        try:
            args = tuple(json.loads(raw_args)) if raw_args else ()
        except (TypeError, ValueError):
            args = ()
        config = MCPServerConfig(
            name=row["name"],
            url=row["url"] or None,
            command=row["command"] or None,
            args=args,
        )
        try:
            await connect_mcp_server(config)
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
