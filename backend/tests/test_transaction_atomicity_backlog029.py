"""BACKLOG-029 A2 回归：显式事务期间普通 execute 不得提前提交 job 部分状态。

Astra A2 P1：job 用 _RUNTIME_LOCK + BEGIN IMMEDIATE，但共享连接上其他请求的
database.execute() 每次都隐式 commit，可在 job 事务中途把其部分状态提前落盘；
随后 job 的 rollback 失效（探针实证：事务内记录在另一写入提交后仍存在）。

修复：database.exclusive_transaction() 统一 BEGIN IMMEDIATE → execute 不再隐式
提交（in_transaction 检查）→ 成功统一 commit、异常/取消统一 rollback。
本测试复刻 Astra 探针：开事务写入 → 模拟外部 execute 写另一表 → 回滚 → 断言
事务内写入已被撤销（修复前：事务写入被外部 commit 提前落盘而仍存在）。
"""
import asyncio
import pytest
import pytest_asyncio

from app import config, database


@pytest_asyncio.fixture(autouse=True)
async def tx_db(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "DB_PATH", tmp_path / "a2-tx.db")
    await database.init_db()
    try:
        yield
    finally:
        await database.close_db()


@pytest.mark.asyncio
async def test_exclusive_transaction_exception_rolls_back_interleaved_and_own_writes():
    """事务抛异常 → 事务内写入与事务期间外部 execute 写入一起回滚（无部分提交）。"""
    with pytest.raises(RuntimeError, match="boom"):
        async with database.exclusive_transaction():
            await database.execute(
                "INSERT INTO users (id, email, is_admin) VALUES (10, 'own@a2.local', 1)"
            )
            # 另一请求在 job 事务中途 execute：修复前会隐式 commit 把上方 INSERT
            # 提前落盘；修复后 execute 不隐式提交，随事务一起回滚。
            await database.execute(
                "INSERT INTO users (id, email, is_admin) VALUES (11, 'interleave@a2.local', 1)"
            )
            raise RuntimeError("boom")

    assert await database.query_one("SELECT COUNT(*) AS n FROM users") == {"n": 0}


@pytest.mark.asyncio
async def test_exclusive_transaction_success_commits_all_writes_at_once():
    """事务正常退出 → 事务内全部写入统一提交。"""
    async with database.exclusive_transaction():
        await database.execute(
            "INSERT INTO users (id, email, is_admin) VALUES (20, 'ok@a2.local', 1)"
        )
        await database.execute(
            "INSERT INTO users (id, email, is_admin) VALUES (21, 'ok2@a2.local', 1)"
        )
    assert await database.query_one("SELECT COUNT(*) AS n FROM users") == {"n": 2}


@pytest.mark.asyncio
async def test_execute_outside_transaction_still_commits_immediately():
    """无显式事务时 execute 维持原有隐式提交语义（兼容既有行为）。"""
    await database.execute(
        "INSERT INTO users (id, email, is_admin) VALUES (30, 'plain@a2.local', 1)"
    )
    assert await database.query_one("SELECT COUNT(*) AS n FROM users") == {"n": 1}


@pytest.mark.asyncio
async def test_transaction_cancellation_rolls_back():
    """事务内 CancelledError → 统一回滚（Astra：取消异常此前不在回滚范围）。"""
    task = asyncio.get_running_loop().create_task(_run_cancelled_tx())
    await asyncio.sleep(0.05)  # 让事务进入 await 挂起点
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert await database.query_one("SELECT COUNT(*) AS n FROM users") == {"n": 0}


async def _run_cancelled_tx() -> None:
    async with database.exclusive_transaction():
        await database.execute(
            "INSERT INTO users (id, email, is_admin) VALUES (40, 'cancel@a2.local', 1)"
        )
        await asyncio.sleep(60)  # 让外部取消命中 await 点
