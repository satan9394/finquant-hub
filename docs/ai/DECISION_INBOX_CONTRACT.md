# Decision Inbox Contract

## v1 输入边界

`decision-inbox/v1` 只读聚合当前用户已有的持久化变化：

- `deterministic_check` 产生的 Thesis claim 状态事件；
- 最新但尚无用户 confirmation 的开放 Thesis 版本；
- 最近一次执行状态为 failed 的定时研究任务。

Portfolio 当前只有 current state，没有变化事件账本，因此 v1 不推断“组合发生变化”。普通市场榜单和无 canonical evidence 的通知也不进入个性化收件箱。

## 输出契约

每项必须包含稳定 `id`、`kind`、`priority`、`why_now`、`occurred_at`、`object_ref`、`evidence_refs`、`quality_status` 和只导航到现有流程的 `next_action`。排序为 high、medium、low，各优先级内按时间和稳定 id 倒序，规则版本固定为 `decision-inbox/v1`。

canonical evidence 缺失时保留 `UNKNOWN`；定时研究失败为 `UPSTREAM_ERROR`，不提供虚构研究结论。服务不调用金融上游、不写数据库、不自动创建 monitor/alert，也不修改 Thesis、Portfolio 或 Strategy。

## 隔离与验证声明

所有查询强制 `user_id`，对象关联也同时约束 owner。focused tests 使用 fixture 与本地 SQLite，只验证聚合、隔离、质量状态和 UI，不构成真实金融上游验证。
