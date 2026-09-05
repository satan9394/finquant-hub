"""BACKLOG-029 A3 回归：SSE 断连后报告必须落 failed（不留永久 running）。

Astra 断言（P1）：断连取消会打断 finally 清理——sse_starlette 在客户端
http.disconnect 时 cancel task group，进入生成器 finally 后任何 await
（aclose / 查询状态 / 失败落库）仍处于取消作用域内会再次抛 CancelledError，
使清理无法完成，报告永久停留 running（Astra 探针：status=running、
fail_called=False）。

本测试走完整 ASGI（httpx ASGITransport + app.state.market 注入），客户端
读完首帧即关闭 → http.disconnect → 模拟生产断连，随后轮询报告状态。
修复前预期红（status 停留 running），修复后必须 failed。
"""
from __future__ import annotations

import asyncio
import json

import pytest
import pytest_asyncio

from app import config, database
from app.main import app
from app.routers import research
from app.routers.auth import get_current_user
from app.routers.research import ResearchRequest


class FixtureMarket:
    async def quote(self, ticker):
        return {"code": ticker, "name": "Fixture", "price": 100, "source": "fixture"}

    async def search(self, _raw):
        return []


def _request():
    from types import SimpleNamespace

    return SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(market=FixtureMarket())))


@pytest_asyncio.fixture(autouse=True)
async def sse_db(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "DB_PATH", tmp_path / "research-disconnect.db")
    await database.init_db()
    await database.execute("INSERT INTO users (id, email) VALUES (1, 'disc@fixture.local')")
    app.dependency_overrides[get_current_user] = lambda: {"id": 1, "email": "disc@fixture.local"}
    app.state.market = FixtureMarket()
    try:
        yield
    finally:
        app.state.market = None
        app.dependency_overrides.pop(get_current_user, None)
        await database.close_db()


async def _wait_report_status(report_id: int, wanted: set[str], timeout: float = 5.0) -> dict:
    deadline = asyncio.get_running_loop().time() + timeout
    while asyncio.get_running_loop().time() < deadline:
        row = await database.query_one("SELECT status FROM research_reports WHERE id=?", (report_id,))
        if row and row["status"] in wanted:
            return row
        await asyncio.sleep(0.02)
    raise AssertionError(f"report {report_id} 未在 {timeout}s 内到达 {wanted}，当前 {row}")


@pytest.mark.asyncio
async def test_sse_disconnect_fails_running_report(monkeypatch):
    """完整 ASGI 断连（手动驱动 receive/send，模拟 http.disconnect）→ 报告落 failed。"""
    resolve_calls = []

    async def resolve(_raw, _market):
        resolve_calls.append(_raw)
        return "usAAPL", "Apple"

    async def slow_research(*_args, **_kwargs):
        """保持流打开直到断连，模拟真实研究中途被断。"""
        try:
            section = 0
            while True:
                yield "report_progress", {"section": section, "total": 9, "name": "持续中"}
                section += 1
                await asyncio.sleep(0.02)
        finally:
            pass

    monkeypatch.setattr(research, "resolve_research_target", resolve)
    monkeypatch.setattr(research, "run_research", slow_research)

    report_id: int | None = None

    async def fake_send(message: dict) -> None:
        nonlocal report_id
        if message["type"] == "http.response.start":
            assert message["status"] == 200
        elif message["type"] == "http.response.body":
            text = message["body"].decode("utf-8", "replace")
            if '"report_id"' in text:
                for line in text.splitlines():
                    if line.startswith("data:"):
                        report_id = int(json.loads(line[5:])["report_id"])

    scope = {
        "type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1",
        "method": "POST", "scheme": "http", "path": "/api/research",
        "raw_path": b"/api/research", "query_string": b"",
        "root_path": "", "headers": [
            (b"host", b"test"), (b"content-type", b"application/json"),
        ],
        "client": ("127.0.0.1", 1234), "server": ("test", 80), "state": {},
    }
    body = json.dumps({"ticker": "AAPL"}).encode()
    messages: asyncio.Queue = asyncio.Queue()
    await messages.put({"type": "http.request", "body": body, "more_body": False})
    seen: list[str] = []

    async def fake_receive() -> dict:
        msg = await messages.get()
        seen.append(msg["type"])
        return msg

    task = asyncio.create_task(app(scope, fake_receive, fake_send))
    deadline = asyncio.get_running_loop().time() + 5
    while report_id is None and asyncio.get_running_loop().time() < deadline:
        await asyncio.sleep(0.02)
    assert report_id is not None, "未收到 report_started 帧"

    # 客户端断连 → sse_starlette 收到 http.disconnect 并取消流
    await messages.put({"type": "http.disconnect"})
    await asyncio.wait_for(task, timeout=5)

    assert resolve_calls == ["AAPL"]
    assert "http.disconnect" in seen
    # 断连返回后给后台清理任务一个完成窗口（cleanup 是独立 task 异步落库）
    await asyncio.sleep(0.3)
    row = await database.query_one("SELECT status FROM research_reports WHERE id=?", (report_id,))
    assert row is not None
    assert row["status"] == "failed", f"断连后报告必须落 failed（实际 {row['status']}）"


@pytest.mark.asyncio
async def test_sse_disconnect_event_stream_direct(monkeypatch):
    """直连事件流模拟断连：_fail_report 被调、报告 failed（Astra 探针同构）。"""
    fail_called = []

    async def resolve(_raw, _market):
        return "usAAPL", "Apple"

    async def slow_research(*_args, **_kwargs):
        try:
            while True:
                yield "report_progress", {"section": 0, "total": 9, "name": "x"}
                await asyncio.sleep(0.01)
        finally:
            pass

    original_fail = research._fail_report

    async def spy_fail(report_id, message, user_id, *, record_event=True):
        fail_called.append(report_id)
        await original_fail(report_id, message, user_id, record_event=record_event)

    monkeypatch.setattr(research, "resolve_research_target", resolve)
    monkeypatch.setattr(research, "run_research", slow_research)
    monkeypatch.setattr(research, "_fail_report", spy_fail)

    response = await research.start_research(
        ResearchRequest(ticker="AAPL"), _request(), {"id": 1},
    )
    # 模拟断连：读一个事件后立即 aclose 底层迭代器（等同客户端中断）。
    iterator = response.body_iterator
    first = await anext(iterator)
    report_id = json.loads(first["data"])["report_id"]
    try:
        await iterator.aclose()
    except asyncio.CancelledError:
        pass

    row = await _wait_report_status(report_id, {"failed", "completed"})
    assert row["status"] == "failed"
    assert fail_called == [report_id]