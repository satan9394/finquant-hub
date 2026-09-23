# Architecture — Codex 入口

## 权威来源

本文件只保留实现入口必须读取的硬边界，避免再次复制并漂移完整架构。当前架构事实以 `docs/ARCHITECTURE.md` 为准；端点与数据源分别以 `docs/API_CONTRACT.md`、`docs/ROUTER_MAP.md` 和 `docs/DATA_SOURCES.md` 为准。

## 一句话架构

FastAPI lifespan → 邮箱免密会话/本地所有者上下文 → 23 个 APIRouter → aiosqlite WAL 单连接（schema v23）→ Vite 代理 → React 18 + AntD 5 + lightweight-charts。

## 架构不变量（禁止违反）

- **无 ORM**：所有数据库访问使用 aiosqlite 原始 SQL。
- **无连接池**：单 aiosqlite 连接，`get_db()` 断言全局 `_db`。
- **无独立 DAL**：router 直接调用 `database.query_one/query_all/execute`。
- **无 WebSocket**：实时通信只用 SSE（sse-starlette）。
- **认证不可删除**：标准模式使用邮箱验证码 + HttpOnly Cookie；22 个非认证 APIRouter 统一附加 `authenticated_context`。
- **用户隔离不可削弱**：42 张用户业务表强制 `user_id` 归属；个人凭据另存于 `user_credentials` 并使用 Fernet 加密。
- **本地模式不得外溢**：`LOCAL_ONLY_MODE=true` 仅允许 development，使用内部本地所有者且不创建登录会话；production 必须拒绝启动。
- **无 SSR**：纯 CSR，Vite 代理开发、静态构建生产。
- **无自由 Agent 互聊**：基础研究 Agent 独立运行后单向汇总；Swarm 只按 DAG 向下游传递上下文。
- **无 DI 容器**：`MarketDataService` 通过 `request.app.state.market` 获取。
- 单一 axios 实例 `api.ts` 服务所有前端请求。

## 当前可执行事实

- `backend/app/main.py` 注册 23 个 APIRouter；`/api/health` 是额外的内联公开端点。
- 当前 OpenAPI 生成 133 个 `/api/*` 路径、168 个 HTTP 操作。
- `backend/app/database.py` 的目标 schema version 为 23，定义 52 张逻辑表（含 1 张 FTS5 虚拟表）。
- 既有数据库在 lifespan 启动时按 `PRAGMA user_version` 顺序迁移，不得绕过备份与归属迁移步骤。
- typed memory rollout 的 shadow/opt-in 开关均默认关闭；`memory_rollout_audits` 只保存 owner-scoped 哈希、计数、预算和 outcome，不保存查询、回答或召回正文。
- `thesis`/`thesis_claims` 保持兼容 current view；`thesis_versions` 保存不可变判断快照；claim evidence 时间边只失效不删除，状态事件 append-only，自动非 `UNKNOWN` 变化必须引用同用户 canonical evidence。
- Thesis 版本 diff 只比较相邻持久化快照；`thesis_version_confirmations` 只追加用户 `acknowledged`/`disputed` 事件，不具备修改 current view、版本、claim、edge 或 confidence 的权限。
- `decision-inbox/v1` 是 owner-scoped 只读聚合：仅使用确定性 Thesis 状态事件、待用户复核版本和定时研究失败；不调用上游、不创建提醒，缺 canonical evidence 显示 UNKNOWN，失败显示 UPSTREAM_ERROR。
- schema v18 的 monitor target 复用 `alert_rules`：草稿零写入且无条件时 UNKNOWN；只有显式 confirm 才保存对象绑定、confirmation key 并启用，重复确认幂等。
- schema v19 的 `scheduled_research_runs` 保存 owner-scoped attempt/run key/retry/report 谱系；证据只接受报告中可回链的同用户 canonical IDs，缺失保留 `PARTIAL`/`UNKNOWN`，失败保留 `UPSTREAM_ERROR`，memory 仍仅在 opt-in 时写 candidate `AI_INFERENCE`。
- schema v20 的 Thesis review 将 deterministic drift 变化保存为 `COMPUTED_RESULT`、canonical evidence IDs 和 owner-scoped projection；确认/驳回/失败事件 append-only，用户决定不改写 Thesis 或 confidence，核验异常保留 `UPSTREAM_ERROR`。
- schema v21 的产品指标仅保存 owner、四种 allowlist 事件、有界数值和时间；默认关闭、90 日窗口、可清除、小样本不输出分位数，不包含金融正文或对象标识。
- schema v22 的 Paper Portfolio 使用独立 `paper_portfolios`/`paper_portfolio_ledger`；记录只追加，跨币种模拟成交必须显式提供 FX provenance，当前估值缺价格或 FX 时不汇总；所有响应固定声明无真实账户、真实指令或自动执行能力。
- Paper Portfolio 复盘动态复用 owner-scoped typed hypothesis 与估值，不新增 schema；只读草稿将收益标记为 `COMPUTED_RESULT` 且不推荐 outcome，显式保存复用 `memory_records.review_outcome` 写 `USER_HYPOTHESIS`、`causal_proof=false`，不修改原 hypothesis/Thesis/confidence，非 OK 估值只允许 inconclusive。
- schema v23 为单机 scheduler 增加 run idempotency identity、有限 lease/heartbeat 与 owner-scoped append-only event log；状态和事件同事务提交。过期 run 若已有 completed report 只 reconciliation，未完成则标 failed/`UPSTREAM_ERROR` 并以相同 identity 建下一 attempt；不引入队列、第二连接或分布式 exactly-once 承诺。
- AIOS-061 用三次临时 SQLite deterministic fixture 测得最差 lifecycle P95 4.6498 ms、20-job batch 84.3661 ms、20-run recovery 8.2897 ms，重复关键写入 0 且失败/恢复记录完整率 100%；当前未触发 PostgreSQL/durable queue 决策门。它只度量本机 scheduler bookkeeping，不是 LLM、行情、网络、多人并发或跨进程生产 SLO；详见 `SCHEDULER_SLO_BASELINE.md`。
- AIOS-064 的离线 runner 仅对显式路径使用 SQLite backup API：source 只读，backup/restore 必须为不存在的新文件且绝不覆盖。三份 snapshot 均核对 integrity/FK/schema/fingerprint/row counts，并审计 evidence input mirror、scheduled/review JSON refs 与 run/report 双向链接；只报告、不修复、不输出正文，也不在线替换权威数据库。操作边界见 `DATABASE_RECOVERY_RUNBOOK.md`。
- `share-preview/v1` 是 Thesis / saved completed strategy 的 authenticated owner-only 动态只读 projection：allowlisted `USER_HYPOTHESIS`/`COMPUTED_RESULT`、metadata-only provenance、许可/时效/质量/脱敏审计和免责声明。它不持久化、不生成 URL/token、没有 publish/send/copy 动作，公开门禁固定 BLOCKED；见 `PRIVATE_SHARE_PREVIEW_CONTRACT.md`。
- `strategy-ir/v1` 是无持久化、无 LLM、无执行能力的 allowlist parser：只接受一个 ticker、两个有界 SMA 窗口、日线收盘上下穿与下一交易日开盘语义；歧义、未支持指标和代码内容返回结构化 invalid，成本等参数仍需显式确认。
- `ma-crossover-draft/v1` 只从 canonical IR 可逆编译 symbol/快慢窗口与固定执行口径；日期、资金、成本、基准和风控不得出现在已映射 parameters，任何未知字段、canonical key 或执行语义漂移均拒绝。
- `thesis-validation-experiment/v1` 由 owner-scoped Thesis 按 ID 动态生成；只带入规范 ticker 与固定策略能力，URL 刷新重新鉴权，禁止从论文正文推断均线或金融参数，也不自动运行/保存回测。
- Challenge My Thesis 是显式只读视图：复用 persisted claim/version evidence 与既有 adversarial review，输出仅为 `AI_INFERENCE`/`UNKNOWN`，不启动自由 Agent、不调用上游、不自动改写 Thesis。
- Thesis check 使用 `thesis-drift/v1` 纯规则引擎；price/fundamental 要求 baseline/current 双侧 canonical evidence，position/report 在缺 adapter/人工复核时保持 UNKNOWN，文本相似度没有事实状态决定权。

## 数据源规则

- 腾讯/新浪：`trust_env=False`（跳过 Clash 代理）。
- Yahoo：`trust_env=True`。
- DeepSeek API：走代理。

## 同步要求

改端点后同步 `docs/API_CONTRACT.md` 与 `docs/ROUTER_MAP.md`；改架构边界前先记录 `docs/ai/DECISIONS.md` 并 @Satanchen。
