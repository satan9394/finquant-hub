"""Persisted HTTP MCP servers and their discovered runtime tools."""

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field, field_validator

from .. import database
from ..services.mcp_runtime import connect_http_mcp_server
from ..tools.mcp_bridge import (
    MCPServerConfig,
    is_mcp_server_connected,
    list_mcp_servers,
    remove_mcp_server,
    set_mcp_tool_enabled,
)

router = APIRouter(prefix="/api/mcp", tags=["mcp"])


class MCPToolToggle(BaseModel):
    enabled: bool


class MCPServerCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    url: str = Field(min_length=1, max_length=2048)

    @field_validator("name", "url")
    @classmethod
    def strip_value(cls, value: str) -> str:
        return value.strip()

    def validated_config(self) -> MCPServerConfig:
        return MCPServerConfig(name=self.name, url=self.url)


class MCPServerUpdate(MCPServerCreate):
    pass


def _public_config(row: dict) -> dict:
    return {
        **row,
        "is_enabled": bool(row["is_enabled"]),
        "connected": is_mcp_server_connected(row["name"]),
        "transport": "http",
    }


async def _config_or_404(config_id: int) -> dict:
    row = await database.query_one("SELECT * FROM mcp_server_configs WHERE id=?", (config_id,))
    if row is None:
        raise HTTPException(404, f"MCP 服务器配置不存在：id={config_id}")
    return row


@router.get("/configs")
async def list_mcp_configs():
    rows = await database.query_all("SELECT * FROM mcp_server_configs ORDER BY id")
    return {"items": [_public_config(row) for row in rows], "total": len(rows)}


@router.post("/configs", status_code=status.HTTP_201_CREATED)
async def create_mcp_config(body: MCPServerCreate):
    try:
        body.validated_config()
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    if await database.query_one("SELECT id FROM mcp_server_configs WHERE name=?", (body.name,)):
        raise HTTPException(409, f"MCP 服务器名称已存在：{body.name}")
    config_id = await database.execute(
        "INSERT INTO mcp_server_configs (name, url) VALUES (?, ?)",
        (body.name, body.url),
    )
    return _public_config(await _config_or_404(config_id))


@router.put("/configs/{config_id:int}")
async def update_mcp_config(config_id: int, body: MCPServerUpdate):
    existing = await _config_or_404(config_id)
    try:
        body.validated_config()
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    duplicate = await database.query_one(
        "SELECT id FROM mcp_server_configs WHERE name=? AND id<>?",
        (body.name, config_id),
    )
    if duplicate:
        raise HTTPException(409, f"MCP 服务器名称已存在：{body.name}")
    remove_mcp_server(existing["name"])
    await database.execute(
        """
        UPDATE mcp_server_configs SET
            name=?, url=?, is_enabled=0, last_error=NULL, updated_at=datetime('now')
        WHERE id=?
        """,
        (body.name, body.url, config_id),
    )
    return _public_config(await _config_or_404(config_id))


@router.delete("/configs/{config_id:int}")
async def delete_mcp_config(config_id: int):
    existing = await _config_or_404(config_id)
    remove_mcp_server(existing["name"])
    await database.execute("DELETE FROM mcp_server_configs WHERE id=?", (config_id,))
    return {"ok": True}


@router.post("/configs/{config_id:int}/connect")
async def connect_mcp_config(config_id: int):
    existing = await _config_or_404(config_id)
    try:
        tool_count = await connect_http_mcp_server(existing["name"], existing["url"])
    except Exception as exc:
        message = f"{type(exc).__name__}: {exc}"[:500]
        await database.execute(
            "UPDATE mcp_server_configs SET is_enabled=0, last_error=?, updated_at=datetime('now') WHERE id=?",
            (message, config_id),
        )
        raise HTTPException(502, f"MCP 服务器连接失败：{message}") from exc
    await database.execute(
        "UPDATE mcp_server_configs SET is_enabled=1, last_error=NULL, updated_at=datetime('now') WHERE id=?",
        (config_id,),
    )
    return {**_public_config(await _config_or_404(config_id)), "tool_count": tool_count}


@router.post("/configs/{config_id:int}/disconnect")
async def disconnect_mcp_config(config_id: int):
    existing = await _config_or_404(config_id)
    remove_mcp_server(existing["name"])
    await database.execute(
        "UPDATE mcp_server_configs SET is_enabled=0, last_error=NULL, updated_at=datetime('now') WHERE id=?",
        (config_id,),
    )
    return _public_config(await _config_or_404(config_id))


@router.get("/servers")
async def get_mcp_servers():
    servers = list_mcp_servers()
    return {
        "items": servers,
        "total_servers": len(servers),
        "total_tools": sum(len(server["tools"]) for server in servers),
    }


@router.patch("/tools/{local_name}")
async def toggle_mcp_tool(local_name: str, body: MCPToolToggle):
    try:
        return set_mcp_tool_enabled(local_name, body.enabled)
    except KeyError as exc:
        raise HTTPException(404, f"未发现 MCP 工具：{local_name}") from exc
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc
