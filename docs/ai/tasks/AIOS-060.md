# AIOS-060 - job event log、lease、幂等 key 与恢复语义

## 状态

`[DONE]`

## 优先级

P1

## 用户结果

本地 scheduler 的持久化研究任务在进程取消、异常退出或重启后不会永久卡在 running，也不会因重新认领而重复生成已完成的 report、memory 或 evidence；用户与维护者可从 owner-scoped 事件历史核对 claim、heartbeat、恢复、重试和终态。

## 允许修改

- `backend/app/database.py`
- `backend/app/services/research_jobs.py`
- `backend/app/services/scheduler.py`
- `backend/app/routers/settings.py`（仅为现有 run history API 暴露事件最小修改）
- `backend/tests/test_database_migrations.py`
- `backend/tests/test_research_jobs.py`
- `backend/tests/test_research_orch.py`
- `backend/tests/test_api.py`
- `backend/tests/test_router_contracts.py`
- `docs/API_CONTRACT.md`
- `docs/ROUTER_MAP.md`
- `docs/ARCHITECTURE.md`
- `docs/ai/ARCHITECTURE.md`
- `docs/ai/JOB_RUNTIME_CONTRACT.md`（新建）
- AIOS 长期计划、EXEC_PLAN 与本任务卡

## 禁止修改

- 前端、LLM/Agent 业务语义、研究报告正文、memory/evidence schema 与写入规则、真实金融数据路径、`reference/`
- PostgreSQL、Redis、Celery、durable queue、第二数据库连接、ORM、独立 DAL、DI 容器、新生产依赖
- 跨进程/横向扩展承诺、无限自动重试、静默吞掉中断或把未完成任务标成成功
- 用 wall-clock 猜测覆盖已持久化终态，或在缺 report/memory/evidence 时伪造完成

## 完成标准

- 先审计当前 `scheduled_research_jobs`、`scheduled_research_runs`、`research_reports`、`research_events` 的 claim、取消、完成和重启缺口，复用现有 run key/attempt/report lineage。
- schema 迁移遵守 pre-v23 备份与幂等升级；lease/event 均 owner-scoped，事件 append-only，禁止跨用户引用。
- claim 使用稳定幂等 identity 和有限 lease；同一有效 lease 不重复认领，过期 lease 可被确定性恢复，heartbeat 只能由当前 lease owner 延长。
- 重启恢复区分：已有 completed report 的 run 只做终态 reconciliation，不重新生成 report/memory/evidence；无 completed report 的过期 run 明确标记 interrupted/failed 后创建有 lineage 的下一 attempt。
- claim、heartbeat、recovered、retry_started、completed、failed、cancelled 等关键转换写可排序事件；payload 只含 job/run/report IDs、状态、时间和错误摘要，不保存研究正文或凭据。
- owner isolation、并发 claim、lease owner、幂等 replay、取消、异常、stale lease、completed reconciliation、retry lineage、重复恢复不重复关键写入均有测试。
- kill/restart 通过确定性 fixture/独立数据库重开模拟；明确说明不是多进程队列或真实上游验证。
- focused migration/scheduler/API tests、Ruff、mypy、OpenAPI/docs/diff check 通过；不要求 Phase 6 全量退出门禁。

## 回退

回退服务接线前先保留 schema 与历史事件；不得删除已经写入的 run/event lineage。需要回退 schema 时使用迁移前备份恢复，不执行破坏性降级 SQL。

## 验证声明

本任务证明单机 SQLite scheduler 的确定性恢复和去重边界，不证明跨进程 exactly-once、分布式队列可靠性、真实模型/上游成功率或横向扩展能力。

## 实际修改

- `backend/app/database.py`
- `backend/app/services/research_jobs.py`
- `backend/app/services/scheduler.py`
- `backend/app/routers/settings.py`
- `backend/tests/test_database_migrations.py`
- `backend/tests/test_research_jobs.py`
- `backend/tests/test_api.py`
- `docs/API_CONTRACT.md`
- `docs/ROUTER_MAP.md`
- `docs/ARCHITECTURE.md`
- `docs/ai/ARCHITECTURE.md`
- `docs/ai/JOB_RUNTIME_CONTRACT.md`
- AIOS 长期计划、EXEC_PLAN 与任务卡

## 验证证据

- schema v23 / pre-v23 backup / 二次初始化幂等；52 张逻辑表、42 张 owner 表；event UPDATE/DELETE trigger 均拒绝修改。
- focused migration、scheduler、API、router：43 passed；Ruff 任务范围通过；mypy 4 source files 通过。
- 并发 claim 仅一个成功；错误 lease owner/跨 owner heartbeat 拒绝；相同 completed identity 幂等回放且 run 数不增加。
- claim/heartbeat/terminal/recovery 的状态与事件在同一 `BEGIN IMMEDIATE` 事务；event payload allowlist 不含研究正文。
- 独立数据库 close/reopen fixture：completed report reconciliation 只追加 recovered/completed，report/memory 仍各 1；未完成 run 标 failed/`UPSTREAM_ERROR`，下一 attempt 复用 identity 并回链旧 run；重复 recovery 为零变化，旧 worker 无法提交 completed。
- cancellation/failure 均保留终态和 append-only 事件；手动 run API 返回 64 位 idempotency identity，历史 API 可恢复 claimed/completed 时间线。
- 运行时 OpenAPI 保持 131 paths / 166 operations；定向 `git diff --check` 通过。

## 验证边界

kill/restart 使用独立 SQLite 关闭/重开和 fixture no-op runner 模拟；没有发送真实进程 kill 信号，没有调用真实模型或金融上游，也不证明跨进程 exactly-once、分布式 lease 或横向扩展。
