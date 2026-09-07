# BACKLOG-034 证据 — A7 scheduler 报告 INSERT + run 回填原子化（B12 后 Astra 遗留项）

> 完成：2026-09-06 ｜ 执行：DSH Worker（e2de7f57 完成代码后于并发探针阶段终止，维护者接手补完验证与文档）
> 维护者复核：代码审阅通过（含必要范围扩展核证）+ 全量门禁独立复跑全绿后合入。

## 改动清单

### `backend/app/services/scheduler.py`
- **A7 原子落盘**（`_run_and_persist_target`）：`scheduled_run_id is not None`（定时研究路径）时，report INSERT 与 `UPDATE scheduled_research_runs SET report_id=…` 包进 `_run_tx_lock()` + `database.exclusive_transaction()`——两写同事务原子落盘，崩溃/异常不留"报告在但 run 无 report_id"半链接。post-market 路径（scheduled_run_id=None）单 INSERT 无回填、无半链接风险，保持原样仅加锁（注释说明）。
- **写锁 `_RUN_TX_LOCKS`**（必要范围扩展）：单 aiosqlite 连接下 `exclusive_transaction` 的 BEGIN IMMEDIATE 不可并发进入；scheduler 经 `asyncio.gather`（L284，SCHEDULER_CONCURRENCY 上限）并发跑多 target，若并发 target 的 `database.execute`（INSERT 与 commit 是 aiosqlite 分离 await）插入另一 target 的事务段之间，会把后者撞成 "cannot start a transaction within a transaction"（research_jobs 用 `_RUNTIME_LOCK` 杜绝同一问题）。因此把 scheduler 内所有写段（`_append_research_event`、`_mark_research_failed` 的 execute 与 publish）收敛到同一把按 event loop 惰性取的锁（生产单 loop 单锁、测试多 loop 隔离，仿 notifications._current_wakeup 模式）。锁只覆盖短写段，LLM/研究 io 等待不持锁，并发保留。

### `backend/tests/test_scheduler.py`
- 新增 2 回归：`test_scheduled_run_report_insert_and_backfill_rollback_together`（两写间抛异常 → report 不存在 + run.report_id None，无半链接）；`test_scheduled_run_report_insert_and_backfill_commit_together`（正常路径报告与回填统一提交同步落盘）。

## 维护者接手说明

- Worker（e2de7f57）完成 scheduler.py + test_scheduler.py 代码与 41/41 聚焦测试后，在跑"真实并发探针"验证阶段被终止。5 个 `_probe_*a7.py` 调试探针（untracked in-flight 残留）已由维护者送回收站清理。
- 维护者独立复核：代码审阅确认写锁扩展**必要且正确**（scheduler L284 gather 并发 + 单连接事务不可嵌套，锁覆盖短写段不损并发）；聚焦 scheduler+transaction 14 passed；全量 backend 853/853、cov 92.53%、ruff 全过。

## 验证（维护者独立复跑）

- 聚焦：test_scheduler.py + test_transaction_atomicity_backlog029.py 14/14
- 全量 backend：853/853（851 基线 + 2 新测试，含并行 033 的断言强化）、cov 92.53%（不降反升）、ruff 全过
- frontend build ✓（后端改动不影响，确认无编译回归）；Vitest 124/386、4173 E2E 50/50、8000 E2E 21/21（并行 033 门禁同批验证）
- git diff --check 通过；删除 0（探针为 untracked 调试残留，回收站清理非正式删除）

## 诚实声明

- Worker 范围扩展（写锁）超出卡字面"只改 INSERT+回填段"，但经维护者核实为 A7 收口在并发模型下的必要防御（否则并发 target 会撞 BEGIN IMMEDIATE 嵌套 crash），非越界乱改；已在卡/本文档声明。
- heartbeat 失租终止等其他 A7 部分未做（另行记录，不在本卡）。
- 探针文件为调试产物已清理；无遗留 untracked 文件。
