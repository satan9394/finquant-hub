# Thesis Claim Evidence Contract

## 权威边界

`evidence_objects` 是金融事实和计算结果的唯一 canonical 来源。`thesis_claim_evidence_edges` 只表达某条证据在一段时间内支持或反对 claim，不复制事实值，也不把 `USER_HYPOTHESIS`、`AI_INFERENCE` 或历史状态升级为事实。

## 时间边

每条 edge 归属于同一 `user_id` 下的 Thesis、claim 和 evidence，并包含：

- `stance`：仅 `supporting` 或 `opposing`；
- `valid_from` / `valid_to`：证据关系的适用窗口，结束不得早于开始；
- `observed_at`：该证据被观察或采集的时间；
- `created_source`：`user`、`automatic` 或迁移来源；
- `status`：`active`、`superseded` 或 `invalidated`。

同一来源替换 edge 时，旧 active 行设置 `status=superseded` 并补齐 `valid_to`，历史行不得 DELETE。人工 edge 与 automatic edge 分开替换，互不覆盖。

## 状态事件

`thesis_claim_status_events` 是 append-only 状态历史，记录 `from_status`、`to_status`、`actor`、`trigger_kind`、`reason`、可选 `evidence_id` 和时间。

- 新建 claim 写入 `initial_create`；旧库迁移写入 `legacy_backfill`。
- 用户编辑写入 `actor=user`、`trigger_kind=manual`。
- 漂移核验写入 `actor=system`、`trigger_kind=deterministic_check`。
- 数据库约束强制 deterministic 非 `unknown` 事件必须引用同用户 canonical evidence。

如果当前数值可计算但不能形成 canonical evidence，规则和事件必须降级为 `unknown`，原因保留 `canonical evidence unavailable`。持仓和报告文本目前没有对应 canonical adapter，因此不会用无来源快照或文本相似度产生确定状态。

## 隔离、兼容与回退

所有读取和写入都包含 `user_id`，复合外键拒绝跨用户 Thesis、claim 或 evidence 引用。旧 claim 更新请求可不传 `evidence_edges`；旧 current-view 字段不变，新增 `evidence_edges` 与 `status_events` 只扩展响应。

schema v16 迁移前创建 `<database>.pre-v16.bak`。回退时停止应用并恢复快照。验证仅使用 deterministic fixture/mock 与本地 SQLite，不是真实金融上游验证。
