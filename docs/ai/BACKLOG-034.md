# BACKLOG-034 — A7 重启恢复事务收口：scheduler 报告 INSERT + run 回填合并 exclusive_transaction

> 状态：`[READY]` ｜ 优先级：P1 ｜ 创建：2026-09-06 ｜ 完成：— ｜ 执行：DSH Worker
> 背景：Astra A7 断言（机制已证实、无受损实例）+ BACKLOG-029 核验表记录项。`scheduler.py` `_run_and_persist_target` 中 report INSERT（L97-105，`database.execute` 独立隐式提交）与 `UPDATE scheduled_research_runs SET report_id=…`（L105-106，又一次提交）**分两次 commit**——两写之间进程崩溃/取消会留下"报告存在但 run 无 report_id 反向链接"的不完整记录。BACKLOG-029 A2 已建 `database.exclusive_transaction()`（统一 BEGIN IMMEDIATE → 事务内 execute 不隐式提交 → 成功统一 commit/异常统一 rollback），本卡把该基建用于此处收口。

## 目标

1. `scheduler.py` `_run_and_persist_target`：report INSERT 与 run.report_id 回填包进**同一个** `database.exclusive_transaction()`——两写原子，崩溃不留半链接。
2. 补回归测试：模拟两写之间异常 → 报告与回填都不落（或都落），无"报告在 run 无引用"的中间态。
3. 不影响既有 scheduled run 正常路径（completed/failed 状态、evidence/memory 回填顺序不变）。

## 允许修改
- `backend/app/services/scheduler.py`（仅 `_run_and_persist_target` 的 INSERT+回填段收敛进 exclusive_transaction）
- `backend/tests/test_scheduler.py` 或 `backend/tests/test_transaction_atomicity_backlog029.py`（补回归）
- 证据文档：`docs/ai/BACKLOG-034.md`、`docs/ai/tasks/BACKLOG-034.md`（新建）、`docs/ai/EXEC_PLAN.md`、`task/CHANGELOG.md`、`HANDOFF.md`

## 禁止修改
- 后端除 scheduler.py 外一切（不碰 research_jobs/recover/database 核心——A2 已建基建，本卡只消费）
- 前端一切、E2E、playwright config、依赖/锁文件、`reference/`；不删除文件；不加依赖
- 不扩大范围到 A7 其他部分（heartbeat 失租终止等，另行记录）

## 完成标准
1. INSERT+回填原子（exclusive_transaction 包裹，异常统一回滚）
2. 回归测试：两写间抛异常 → report 不存在（无半链接）；正常路径 → 报告+run.report_id 都落
3. 全量门禁：backend pytest 全绿（851+新）、覆盖率不降、ruff；frontend 不受影响（build 确认）
4. git diff --check、删除 0、工作树干净

## 参考
- Astra A7：`docs/ai/astra-review/verification-2026-09-04.md` A7 段（机制已证实/受损实例待核）
- A2 基建：`database.exclusive_transaction()`（database.py，BACKLOG-029 A2 5f81378 建的 asynccontextmanager）+ 用法先例 `research_jobs.py` 五事务函数
- 现状：`scheduler.py:97-106`（INSERT 与回填分两次 commit）
- 测试先例：`backend/tests/test_transaction_atomicity_backlog029.py`

## 完成证据模板
```
- scheduler.py diff（INSERT+回填进 exclusive_transaction）
- 回归测试（异常回滚无半链接 + 正常双落）
- 全量门禁：backend pytest x/x、cov、ruff；build 确认
- git diff --check、删除 0、未 commit
```
