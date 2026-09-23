# Local Job Runtime Contract

## 范围

AIOS-060 加固现有单进程 scheduler，不替换它。权威存储仍是单个 aiosqlite WAL 连接；不引入 PostgreSQL、Redis、Celery、外部 durable queue、连接池或第二数据库连接。

## 持久化模型

- `scheduled_research_jobs` 保留 cron、next/last run 和用户状态，并暂存下一次 claim 的 64 位 idempotency identity。
- `scheduled_research_runs` 保留 run key、稳定 idempotency identity、单调 attempt、retry lineage、report/evidence/memory 回链，以及 lease owner、expiry、heartbeat 和终态。
- `scheduled_research_run_events` 是 owner-scoped append-only 日志；UPDATE/DELETE 触发器拒绝修改历史。

事件仅允许 `claimed`、`heartbeat`、`recovered`、`retry_started`、`completed`、`failed`、`cancelled`。payload allowlist 只包含 job/run/report 状态标识、attempt、lease 时间/owner、retry ID 和最多 500 字符的错误摘要，不保存研究正文、prompt、凭据、token 或金融值。

## Claim 与 heartbeat

claim、run 创建和首个事件在一个 `BEGIN IMMEDIATE` 事务内提交。同一 job 的有效 running 状态只允许一个本进程 claim；相同 identity 的 running run 不重复认领，相同 identity 的 completed run 直接幂等回放。lease 为有限时长，只有同用户、同 run、同 lease owner 且尚未过期的 worker 能 heartbeat 延长。

heartbeat、terminal 状态和对应事件分别在同一个 SQLite 事务内提交。失去 lease 的旧 worker 不能覆盖 recovery 或新 attempt 的状态。

## 重启恢复

scheduler 每轮先扫描过期 lease：

- 若 run 已回链到 `status=completed` 的 report，只把 run/job reconciliation 为 completed 并追加 recovered/completed 事件；不重新运行研究，不创建 report、memory 或 evidence。
- 若没有 completed report，将仍 running 的 report 标为 failed，把 run 标为 failed、`evidence_status=UPSTREAM_ERROR`，保存 `LEASE_EXPIRED` 摘要，并把同一 idempotency identity 置为待重试。
- 下一次 claim 创建 attempt+1，`retry_of_run_id` 指向中断 run；重复 recovery 不追加第二组事件或关键写入。

schema 迁移前生成 `.pre-v23.bak`，迁移可重复。回退服务代码时保留 v23 schema/event 历史；需要完整降级时从备份恢复，不执行破坏性 SQL。

## 保证与非保证

保证范围是单进程、本地 SQLite、进程重启后的确定性去重与可审计恢复。测试使用独立数据库关闭/重开和 fixture runner 模拟 kill/restart；不是真实进程信号、真实模型或真实上游验证。

不保证跨进程 exactly-once、网络分区容错、横向扩展或分布式 lease。若负载/SLO 证据触发路线图 7.2 决策门，必须先写 ADR 并 `@Satanchen`，不能直接引入外部队列或 PostgreSQL。
