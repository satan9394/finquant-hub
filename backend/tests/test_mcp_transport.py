"""BACKLOG-042: MCP stdio transport 接通——表/CRUD/分派（确定性，不真启外部进程）。"""

import json

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app import database
from app.routers import mcp as mcp_router
from app.services import mcp_runtime


@pytest.fixture(autouse=True)
async def iso_db(tmp_path, monkeypatch):
    """每个测试用独立临时 DB，避免污染真实 finquant.db。"""
    import app.config as config

    monkeypatch.setattr(config, "DB_PATH", tmp_path / "mcp-test.db")
    await database.init_db()
    try:
        yield
    finally:
        await database.close_db()


@pytest.fixture
def mcp_app(monkeypatch):
    """MCP router 独立 app：无 auth 依赖（原 router 也无 auth），mock 数据库。"""
    app = FastAPI()
    app.include_router(mcp_router.router)
    return app


@pytest.mark.asyncio
async def test_create_http_config_roundtrip(mcp_app):
    body = {"name": "http-srv", "url": "https://mcp.example.com/api"}
    async with AsyncClient(transport=ASGITransport(app=mcp_app), base_url="http://t") as client:
        resp = await client.post("/api/mcp/configs", json=body)
    assert resp.status_code == 201
    data = resp.json()
    assert data["transport"] == "http"
    assert data["url"] == "https://mcp.example.com/api"
    assert data["command"] is None


@pytest.mark.asyncio
async def test_create_stdio_config_roundtrip(mcp_app):
    body = {"name": "stdio-srv", "command": "npx", "args": ["-y", "mcp-srv"]}
    async with AsyncClient(transport=ASGITransport(app=mcp_app), base_url="http://t") as client:
        resp = await client.post("/api/mcp/configs", json=body)
    assert resp.status_code == 201
    data = resp.json()
    assert data["transport"] == "stdio"
    assert data["command"] == "npx"
    assert data["args"] == ["-y", "mcp-srv"]


@pytest.mark.asyncio
async def test_create_rejects_neither_url_nor_command(mcp_app):
    body = {"name": "bad-srv"}
    async with AsyncClient(transport=ASGITransport(app=mcp_app), base_url="http://t") as client:
        resp = await client.post("/api/mcp/configs", json=body)
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_create_rejects_both_url_and_command(mcp_app):
    body = {"name": "both-srv", "url": "https://mcp.example.com", "command": "npx"}
    async with AsyncClient(transport=ASGITransport(app=mcp_app), base_url="http://t") as client:
        resp = await client.post("/api/mcp/configs", json=body)
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_restore_dispatches_by_command(monkeypatch):
    """restore_enabled_mcp_servers 按 command 是否为空分派 http/stdio config。"""
    seen = []

    async def fake_connect(config):
        seen.append((config.name, config.url, config.command))

    monkeypatch.setattr(mcp_runtime, "connect_mcp_server", fake_connect)

    async def fake_query_all(*a, **k):
        return [
            {"id": 1, "name": "h", "url": "https://mcp.example.com", "command": None, "args_json": None},
            {"id": 2, "name": "s", "url": None, "command": "npx", "args_json": json.dumps(["-y", "srv"])},
        ]

    async def fake_execute(*a, **k):
        return None

    monkeypatch.setattr(mcp_runtime.database, "query_all", fake_query_all)
    monkeypatch.setattr(mcp_runtime.database, "execute", fake_execute)

    await mcp_runtime.restore_enabled_mcp_servers()
    assert len(seen) == 2
    assert seen[0] == ("h", "https://mcp.example.com", None)
    assert seen[1] == ("s", None, "npx")


@pytest.mark.asyncio
async def test_schema_columns_exist():
    """迁移后 mcp_server_configs 含 command/args_json/env_json 列（幂等 ALTER）。"""
    cols = await database.query_all("PRAGMA table_info(mcp_server_configs)")
    names = {col["name"] for col in cols}
    assert {"command", "args_json", "env_json"} <= names
