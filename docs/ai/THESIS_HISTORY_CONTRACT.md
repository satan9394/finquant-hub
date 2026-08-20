# Thesis History Contract

## 边界

- `thesis` 与活动 `thesis_claims` 是兼容 current view；`thesis_versions` 是不可变判断快照。
- 历史接口按版本倒序返回；`diff_from_previous` 由后端比较相邻持久化快照生成，前端不重算。
- confidence 变化必须返回 `from`、`to` 和产生当前版本的 `change_reason`。

## 用户确认

- schema v17 的 `thesis_version_confirmations` 是 owner-scoped append-only 事件表。
- 只允许显式 `acknowledged` 或 `disputed`，且必须提供非空 reason。
- 重复决定追加新事件，不覆盖旧事件；数据库触发器拒绝更新和删除。
- 确认操作只写确认事件，不修改 Thesis current view、不可变版本、claim、claim-evidence edge 或 confidence。

## 隔离与迁移

- 版本读取与确认写入都同时约束 `user_id`、`thesis_id` 和版本；跨用户目标表现为不存在。
- 既有 schema v16 数据库升级前生成一次 `.pre-v17.bak`，再在单 aiosqlite 连接内执行显式迁移。
- 本功能不调用金融上游；测试证据仅为 deterministic fixture 与本地 SQLite，不代表真实上游验证。
