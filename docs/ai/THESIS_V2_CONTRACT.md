# Thesis v2 Contract

## 兼容模型

`thesis` 与 `thesis_claims` 继续承载旧 API 的 current view。schema v15 新增 `thesis_versions` 和 `thesis_version_evidence_refs`：每次创建或用户编辑写入一个不可变版本，current view 可以更新，但历史版本不能 UPDATE 或 DELETE。

旧数据库迁移时，每条 owner-scoped Thesis 回填 version 1：

- `thesis` 映射为 `judgment`；
- `assumptions` 和仍生效的 manual claims 原值保留；
- 来自研究报告的判断标记为 `AI_INFERENCE`，手工论文标记为 `USER_HYPOTHESIS`；
- 无历史来源的字段保持空数组或 `null`，`change_reason=legacy_backfill`，不推测 evidence 或 confidence。

## 版本字段

每个版本包含：

- `version`、`judgment`、`judgment_kind`；
- `assumptions`、manual `claims`、`invalidation_conditions`；
- `supporting_evidence_ids`、`opposing_evidence_ids`；
- `confidence`、`change_reason`、`created_by` 和 `created_at`。

`judgment_kind` 仅允许 `USER_HYPOTHESIS` 与 `AI_INFERENCE`。证据只支持判断或反对判断，不会把判断升级成 `FACT`；事实仍由 canonical evidence 合同表达。

## Evidence 与归属

Evidence 引用使用 `(user_id, evidence_id)` 外键。不存在、跨用户或同时列为 supporting/opposing 的引用会在任何 current-view 写入之前拒绝，整个编辑保持原子性。版本列表和 current version 都按 `user_id` 读取。

AIOS-030 只建立版本级支持/反对引用。claim-level edge、有效期和自动状态变化属于 AIOS-031，不在本任务中提前实现。

## Legacy claims

旧编辑语义仍表现为“当前 manual claims 被替换”，但数据库不再删除旧 claim：旧行只设置 `retired_at`，新行记录对应版本号。退休 claim 不再能通过旧更新端点修改，current-view 响应只返回未退休行。

## 回退与验证边界

迁移前创建 `<database>.pre-v15.bak`。回退必须先停止应用并恢复快照。验证使用 deterministic fixture、mock market 与本地 SQLite，不是真实金融上游验证。
