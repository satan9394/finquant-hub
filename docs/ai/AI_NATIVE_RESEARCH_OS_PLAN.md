# FinQuant Hub AI 原生投资研究操作系统长期开发计划

> 状态：`ACTIVE - LOCAL OSS V1`  
> 版本：v1.1  
> 制定日期：2026-08-11  
> 战略输入：`docx/FinQuant Hub 深度研究：从“金融功能集合”重构为 AI 原生投资研究操作系统.pdf`（25 页，已完整阅读并进行页面级视觉核验）  
> 前置成果：`PRODUCTIZATION_PLAN.md` 的 Phase 0-6 已完成，本计划是后续路线，不重跑既有 `PROD-*` 任务。  
> 执行入口：`EXEC_PLAN.md` 中最高优先级的 `[READY] AIOS-*` 任务及对应 `docs/ai/tasks/AIOS-*.md`。

> 2026-08-13 范围重置：项目当前由个人开发者维护，近期目标是 GitHub 可开源、他人可在自己的电脑上安装并自用，不是上线运营的现象级平台。公网分享、Remix、作者/模板市场、SaaS、多租户在线规模化和增长任务统一标记 `[PARKED]`，不进入 Local OSS v1 关键路径。

> **实现状态审计**（2026-08-21）：Phase 1-8 核心能力全部 DONE，BLOCKED=4（Graphiti/Mem0 外部依赖），PARKED=4（公开 Artifact/Remix/模板市场）

## 0. 结论

FinQuant Hub 已经完成从“功能可用”到“任务可达”的第一轮产品化，下一阶段不应继续增加孤立页面、指标或 Agent 展示。长期方向应是：

> 以自然语言承接投资意图，以研究对象维持长期上下文，以结构化证据支撑判断，以投资论文承载观点，以记忆与监控持续检验观点，以量化能力验证而非替代人的判断。

本轮最先建设的不是更大的模型或独立图数据库，而是三项基础合同：

1. **统一来源与证据合同**：事实、计算、AI 推论和用户假设必须可区分、可追溯、可按时间复核。
2. **类型化 Investment Memory**：从“检索旧聊天”升级为“记住用户研究过什么、相信什么、为什么相信、何时失效”。
3. **领域评估体系**：在引入任何外部记忆或图谱框架前，用可重复基准验证检索、时序、矛盾、隔离、成本和金融正确性。

推荐技术策略是 **native-first + adapter-ready**：

- 继续以当前 aiosqlite 原始 SQL 作为权威业务状态，保持 schema v12 架构不变量。
- 为记忆检索定义项目自己的接口、类型和评估集，不让产品语义绑定第三方框架。
- 将 Graphiti 作为首选隔离 PoC，用于验证 temporal evidence graph；PoC 只能是可重建读模型，不能直接成为权威事实库。
- 将 Mem0 作为混合检索与时间检索基准，不直接替换当前数据层。
- 在真实负载、多人并发和长任务可靠性达到迁移阈值前，不引入 PostgreSQL、Redis、Celery 或独立图数据库进入主路径。

### 0.1 当前交付层级

当前只追求一个可验证结果：用户从 GitHub 获得代码后，在受支持的个人电脑上完成本地安装和启动，浏览器访问 loopback 地址即可使用核心研究闭环；数据在本机持久化，可诊断、可备份、可升级，不要求维护者运营任何公网服务。

Local OSS v1 的优先级依次为：

1. 干净克隆后的安装、启动、停止和状态诊断。
2. 本地单用户默认安全、持久化、备份恢复与升级兼容。
3. 无付费模型 key 时仍能启动并使用不依赖 LLM 的功能；缺失能力必须解释清楚。
4. README、许可、安全说明、贡献指南、CI 和发布清单与实际代码一致。
5. 核心 A/HK/US 研究、Thesis、策略验证、Paper Portfolio 和记忆流程在本地可复现。

不把页面数量、Agent 数量、社区增长或云端规模当作 Local OSS v1 成功指标。

## 1. PDF 的战略要求与当前项目事实

### 1.1 PDF 的核心要求

PDF 提出的产品闭环是：

```text
发现问题 -> 理解 -> 研究 -> 验证 -> 形成判断 -> 跟踪判断
-> 新证据强化或证伪 -> 更新判断 -> 分享或复用
```

其关键建设方向包括：

- 单一意图入口与自动路由，而不是让用户理解内部模块。
- 一个标的或主题对应一个持续存在的 Research Workspace。
- 研究结果成为可编辑、可版本化、可监控的 Thesis Artifact。
- 每项输出区分事实数据、计算结果、AI 推论和用户假设。
- Evidence Graph、Investment Memory、Workflow Graph 和 Evaluation System 构成长线护城河。
- 量化是验证层，实盘交易不是早期目标。
- 先建立持续关系，再考虑公开分享、Remix 和社区增长。

### 1.2 已完成，不应重复建设

当前代码与 `PRODUCTIZATION_PLAN.md` 已经完成以下基础：

| PDF 方向 | 当前证据 | 结论 |
|---|---|---|
| 任务优先入口 | Dashboard 三个核心任务、全局任务入口、六组导航 | 保留并继续收敛，不重做产品壳 |
| Research Workspace | `/research/:symbol` 聚合数据、笔记、报告、论文、时间线 | 从页面聚合升级为对象级上下文 |
| 结果分层 | 摘要 / 证据 / 方法与来源 | 扩展为统一证据对象，不另建展示框架 |
| Thesis | CRUD、报告转论文、claim、确定性漂移检查 | 升级 Artifact 与证据链接，不重建论文系统 |
| 持续研究 | cron 任务、scheduler、通知、alerts | 加强可靠性和 Thesis 触发，不重写调度器 |
| 对抗审查 | 多方/空方/对抗式工具与研究 Agent | 产品化为 Challenge My Thesis |
| 金融验证 | 回测、Alpha、组合风险、相关矩阵、风险贡献 | 作为 Thesis 的验证工具接入 |
| 跨会话记忆 | SQLite FTS5 检索旧消息并注入 chat/research | 作为 baseline，不能误称完整 Investment Memory |
| 数据可信度 | provider、as_of、period、currency、quality flags、UNKNOWN | 需要统一为可引用的 provenance envelope |

### 1.3 真正缺口

1. `memory_fts` 只索引消息正文，没有稳定的实体、类型、有效期、来源、版本、矛盾和失效语义。
2. Thesis claim 与研究报告、原始数值、计算过程之间没有统一 evidence edge。
3. 工作区、报告、论文、策略、组合和预警存在业务链接，但没有显式 Workflow Graph。
4. 漂移核验主要使用固定阈值和文本相似度，不能说明哪条新证据支持或反驳哪个假设。
5. scheduler 是单进程轮询；能够满足本地产品，但还不是可恢复、可重放、可横向扩展的 durable runtime。
6. 没有领域记忆评估集，无法判断外部记忆框架是否真的优于当前 FTS5 baseline。
7. 分享、Remix、作者身份和公开 Artifact 尚未建设；在安全、许可和合规合同完成前不应提前开放。

## 2. 产品北极星与边界

### 2.1 北极星体验

用户输入公司、主题、策略或持仓问题后，系统能够：

1. 自动识别对象和任务意图。
2. 拉取带时间与来源的真实数据。
3. 生成可审计研究，并显示支持证据、反对证据和未知项。
4. 把判断保存为可版本化 Thesis Artifact。
5. 用策略、组合和风险工具验证判断。
6. 在后续数据变化时指出哪条假设被强化、削弱或证伪。
7. 让用户查看系统记住了什么、为什么召回、如何修正或删除。

### 2.2 永久红线

- 不编造金融数值；拿不到就返回 `UNKNOWN`、`PARTIAL` 或 `UPSTREAM_ERROR`。
- 不把单季度推成 TTM，不隐藏复权、期间、币种、成本或基准。
- 不让 LLM 直接充当金融数据库；所有关键值从结构化工具获得。
- 不存储或展示模型隐藏推理过程；只保存用户可审计的结论、证据和理由摘要。
- 不把模型输出、旧聊天或用户猜测无条件升级为事实。
- 不削弱 `user_id` 隔离；跨用户记忆泄漏必须为零。
- 不记录验证码、Cookie、API key、凭据、自由文本产品遥测或敏感持仓正文到第三方服务。
- 不实现自动投顾、真实账户、资金、订单或实盘跟单。
- 不修改 `reference/`。
- 不违反当前无 ORM、无连接池、无 WebSocket、无 SSR、无 DI 容器、无自由 Agent 互聊等不变量。
- PostgreSQL、消息队列或图数据库进入权威主路径前，必须先记录 ADR、`@Satanchen` 并取得明确架构决定。

## 3. 目标领域模型

### 3.1 四类信息必须显式区分

| 类型 | 示例 | 可否直接进入事实记忆 | 必需元数据 |
|---|---|---:|---|
| `OBSERVED_FACT` | 2025Q4 营收同比 16.2% | 是 | provider、as_of、period、retrieved_at、quality |
| `COMPUTED_RESULT` | PE 五年分位 23% | 是 | inputs、formula、method_version、as_of |
| `AI_INFERENCE` | 悲观预期可能已部分计价 | 否，需标注推论 | supporting evidence、counter-evidence、confidence |
| `USER_HYPOTHESIS` | 未来三年收入 CAGR >= 10% | 否，属于用户判断 | owner、created_at、invalidation conditions |

### 3.2 Investment Memory 类型

第一版只允许以下类型，禁止自由扩张：

- `preference`：解释密度、常用任务、非敏感展示偏好。
- `research_interest`：用户明确关注的公司、行业、主题或策略。
- `hypothesis`：用户或 Thesis 的可检验假设。
- `decision`：用户明确保存的研究判断，不等同于交易建议。
- `evidence_reference`：指向权威 evidence object 的引用，不复制来源正文。
- `risk_concern`：用户明确担心的风险及适用对象。
- `invalidation_condition`：Thesis 失效条件。
- `workflow_state`：Research -> Thesis -> Strategy -> Portfolio -> Monitor 的当前节点。
- `review_outcome`：用户确认的复盘结论。

以下内容不得自动进入长期记忆：寒暄、模型自述、工具日志、未经确认的模型猜测、完整报告正文、凭据、验证码、会话 token、隐藏推理和原始持仓金额。

### 3.3 Canonical Provenance Envelope

所有可引用事实和计算结果统一采用以下语义；第一版可以保存为 JSON，但字段名称和验证规则必须稳定：

```json
{
  "evidence_id": "stable-id",
  "kind": "observed_fact | computed_result | document_excerpt",
  "subject": {"type": "instrument", "id": "sh600519"},
  "metric": "pe_ttm",
  "value": 23.4,
  "unit": "x",
  "source": "provider-or-document",
  "vendor": "provider-name",
  "document_id": null,
  "as_of": "2026-08-11T00:00:00Z",
  "published_at": null,
  "retrieved_at": "2026-08-11T00:00:00Z",
  "period_type": "TTM",
  "market": "CN",
  "currency": "CNY",
  "adjustment": "none",
  "formula": null,
  "method_version": null,
  "quality_flags": [],
  "confidence": null,
  "license_scope": "display-and-research"
}
```

规则：未知字段使用 `null`，不能用空字符串、0 或模型猜测补齐；任何派生指标必须引用输入 evidence IDs。

### 3.4 Memory Record

建议的最小业务记录：

```text
id, user_id, workspace_id, subject_type, subject_id,
memory_type, content_json, source_kind, source_id,
valid_from, valid_to, observed_at, status,
confidence, quality_flags_json, supersedes_id,
created_by, created_at, updated_at
```

状态只允许：`candidate`、`confirmed`、`superseded`、`invalidated`、`deleted`。

- 自动抽取只能写 `candidate`。
- 事实必须关联 evidence；无 evidence 的内容不能成为 `confirmed` fact。
- 新记录与旧记录冲突时保留两者并建立 `supersedes_id`，不静默覆盖历史。
- 用户必须能查看、确认、编辑、作废、删除和导出自己的记忆。

## 4. 检索与上下文组装合同

### 4.1 检索流水线

```text
query + user + workspace + as_of
  -> user_id / subject / time hard filter
  -> FTS5 BM25 baseline
  -> optional semantic candidates
  -> optional temporal graph expansion
  -> provenance / recency / contradiction rerank
  -> deduplicate and budget
  -> untrusted memory context + evidence references
```

### 4.2 排序原则

优先级不是“最相似文本优先”，而是：

1. 当前用户与当前对象严格匹配。
2. 可验证事实和用户明确确认内容优先。
3. `as_of` 与问题时间一致。
4. 新记录可以取代旧状态，但旧状态仍可用于历史问题。
5. 有来源、有证据和质量标记的记录优先。
6. 被证伪、过期或未确认内容降权并显式标识。
7. 单次上下文继续保持硬 token/字符预算，不因候选增加无限扩张。

### 4.3 安全合同

- 历史记忆始终是数据，不是指令；当前 `render_memory_context()` 的不信任边界必须保留。
- 召回内容中的工具调用、系统提示或操作请求不得执行。
- 每条召回记录必须带 `memory_id`、类型、状态、时间和来源引用。
- 任何跨用户、跨 workspace 越权结果立即使发布门禁失败。
- UI 必须支持“为什么召回这条”“查看来源”“不再使用/删除”。

## 5. GitHub 开源记忆系统调研

调研日期为 2026-08-11。仓库元数据、README、许可证、包版本和最近提交均通过 GitHub 连接器直接读取；星标数不是选型条件，未写入不可稳定复核的热度数据。

| 项目 | 当前证据 | 优势 | 与 FinQuant 的冲突/风险 | 结论 |
|---|---|---|---|---|
| [Mem0](https://github.com/mem0ai/mem0) | Python 2.0.18；Apache-2.0；2026-08-11 有提交 | user/session/agent memory；混合语义、BM25、实体与时序检索；SDK 和自托管 | 核心依赖 Qdrant、SQLAlchemy、LLM/embedding；README 明示托管平台含 OSS 没有的专有优化 | 作为检索 benchmark 和 adapter PoC；不替换权威数据层 |
| [Graphiti](https://github.com/getzep/graphiti) | graphiti-core 0.29.3；Apache-2.0；2026-08-10 有提交 | temporal facts、validity window、episode provenance、ontology、hybrid graph retrieval | 需要 Neo4j/FalkorDB 等图存储；引入新基础设施与运维面 | **首选 Evidence Graph 隔离 PoC**；只做可重建读模型 |
| [Letta](https://github.com/letta-ai/letta) | legacy server 0.16.8；Apache-2.0；2026-08-01 有提交；活跃开发已迁往 letta-code | 完整 stateful agent runtime、memory blocks、SDK | 会替换现有 Agent/runtime 抽象；依赖面巨大；与当前 DAG/SSE/无自由 Agent 互聊边界冲突 | 不采用；仅参考 stateful agent 产品思想 |
| [LangMem](https://github.com/langchain-ai/langmem) | 0.0.30；MIT；2026-08-11 有提交 | hot-path/background memory、可插拔 store、语义/情景/程序性记忆思想 | 直接依赖 LangGraph/LangChain；当前路线明确禁止引入 LangGraph | 不引入依赖；参考 memory manager 和评估模式 |
| [Cognee](https://github.com/topoteretes/cognee) | 1.4.2；Apache-2.0；2026-08-10 有提交 | 图+向量、ontology、tenant isolation、traceability、本地运行 | 依赖面大，包含 FastAPI/SQLAlchemy/多数据库，与当前应用高度重叠 | Graphiti PoC 失败时的备选，不进入主路径 |
| [Memobase](https://github.com/memodb-io/memobase) | Apache-2.0；最近提交 2026-01-11 | 用户 profile、event timeline、可控 profile、Postgres/Redis 自托管 | 面向用户画像而非金融 evidence/claim；更新活跃度相对较低；增加独立服务 | 仅参考偏好/事件模型，不采用服务 |

### 5.1 选型决定

不选择“一个框架包办所有记忆”。FinQuant 的投资记忆含金融时间语义、事实/推论边界、来源许可、用户假设、反证与 Thesis 漂移，通用聊天记忆不能直接充当领域模型。

执行顺序：

1. 先建立原生接口、类型和 benchmark。
2. 用当前 FTS5 形成 baseline。
3. 在 fixture 数据上比较 native hybrid、Mem0 adapter 与 Graphiti read model。
4. 只有通过第 6 节门禁的候选才可进入后续 ADR。
5. 未通过时继续增强原生实现，不为了“用了图数据库”而引入基础设施。

## 6. 评估体系与采用门槛

### 6.1 固定评估集

创建不含真实用户隐私的版本化 fixture，至少覆盖：

- A/HK/US 同名、别名与代码规范化。
- 同一指标在不同报告期的变化。
- 最新事实与历史事实冲突。
- 用户假设被新证据支持、削弱或证伪。
- 事实、计算、AI 推论和用户假设的分类。
- 跨 workspace 相似文本但对象不同。
- 恶意历史消息中的 prompt injection。
- 两个用户具有相同问题但私有记忆不同。
- 来源缺失、过期、`UNKNOWN` 和 provider 失败。
- 历史时间问题与“当前状态”问题。

### 6.2 必测指标

| 指标 | Phase 0 门槛 | 发布门槛 |
|---|---:|---:|
| 用户隔离泄漏 | 0 | 0 |
| prompt injection 被执行 | 0 | 0 |
| provenance coverage（事实/计算） | 100% | 100% |
| temporal answer accuracy | 建立 FTS baseline | >= 95% fixture |
| contradiction classification | 建立 baseline | >= 95% fixture |
| Recall@5 / Precision@5 | 报告 baseline | 候选不得同时低于 baseline |
| stale memory 误作当前事实 | 报告 baseline | <= 2% fixture |
| P95 retrieval latency | 报告本机 baseline | native <= 250 ms；graph <= 500 ms，不含 LLM 抽取 |
| 单次注入预算 | <= 2400 字符 baseline | 不超过任务定义预算 |
| LLM 抽取成本 | 记录 token/调用数 | 必须有上限、失败回退和关闭开关 |

### 6.3 Shadow Mode

外部候选的第一阶段只允许 shadow mode：

- 生产回答继续使用当前安全路径。
- 候选并行生成检索结果，但不注入模型、不改变用户输出。
- 只保存非敏感 fixture 或经允许的本地评估摘要。
- 达标后再进行显式小流量开关；失败可一键回到 native baseline。

## 7. 演进式目标架构

### 7.1 现在到单机专业版

```text
React CSR
  -> FastAPI routers
    -> Intent Router / Research Orchestrator
      -> Market & Financial Tools
      -> Evidence Service
      -> Investment Memory Service
      -> Thesis / Strategy / Portfolio Services
    -> aiosqlite authoritative store
      -> FTS5 baseline index
      -> optional rebuildable graph adapter (shadow)
    -> SSE progress / persisted notifications
```

此阶段不改变当前数据库不变量。`EvidenceService` 和 `InvestmentMemoryService` 是业务服务，不是 DAL 或 DI 容器；router 仍可使用现有 `database.query_*` 原始 SQL 模式。

### 7.2 进入多人在线前的决策门

只有出现以下任一可测事实，才评估 PostgreSQL / durable queue：

- 单 writer 等待导致 P95 写延迟持续超出既定 SLO。
- 长任务需要跨进程恢复、重试或横向扩展。
- 单进程 scheduler 重启造成不可接受的任务遗漏。
- 多人并发和数据量已超过单机备份、恢复或迁移窗口。
- 图查询的真实产品价值已通过 benchmark 和用户任务验证。

届时先写 ADR，再采用双写/回放/校验的渐进迁移；禁止一次性重写。

## 8. 分阶段路线图

任务状态允许 `[READY]`、`[BLOCKED]`、`[PENDING]`、`[PARKED]`、`[DONE]`。`[PARKED]` 表示经产品范围决定主动延期，不是当前阻塞；同一时间只能有一个 `[READY]`。

### Phase 0 - 真相、合同与 benchmark（P0）

目标：在写新能力前建立可比较的领域真相。

| 任务 | 状态 | 结果 | 验证 |
|---|---|---|---|
| `AIOS-000` | `[DONE]` | 盘点现有 memory/workspace/thesis/evidence/job 数据流，冻结 v1 术语和边界 | `AI_NATIVE_CAPABILITY_BASELINE.md`、schema/API 静态跟踪、无业务代码修改 |
| `AIOS-001` | `[DONE]` | 建立版本化投资记忆 fixture 与 FTS5 baseline runner | 13 条 synthetic records、6 cases、Recall@5 1.0、Precision@5 0.9167、隔离/注入硬门通过 |
| `AIOS-002` | `[DONE]` | 定义 `CanonicalProvenanceEnvelope` 与 JSON Schema | 3 类现有合同映射通过，7 类非法合同拒绝，UNKNOWN/派生输入规则固定 |
| `AIOS-003` | `[DONE]` | 定义 `MemoryProvider`/`MemoryCandidate` 端口，不接第三方 | native provider 接管 chat/research，旧函数兼容，12 tests + Ruff + mypy |
| `AIOS-004` | `[BLOCKED]` | Graphiti 与 Mem0 fixture-only shadow PoC | native 已实测；候选包缺失且包源代理失败，候选 `NOT_RUN`，见 `AIOS_MEMORY_SHADOW_POC.md` |
| `AIOS-005` | `[BLOCKED]` | 根据 benchmark 做 ADR：native / Graphiti read model / 暂缓 | AIOS-004 无候选实测且 ADR 需要 `@Satanchen` 明确决定；未确认不引入主路径 |

退出门槛：基线可重复；所有事实类型、时间语义和来源字段有唯一含义；外部框架没有进入业务主路径。

### Phase 1 - Evidence Foundation（P0）

| 任务 | 状态 | 结果 | 验证 |
|---|---|---|---|
| `AIOS-010` | `[DONE]` | 新增 evidence object 与派生输入引用 schema | schema v12、pre-v12 backup、7 focused tests + Ruff + mypy |
| `AIOS-011` | `[DONE]` | 行情/基本面/研究报告适配 provenance envelope | 6 focused tests + Ruff + mypy；无隐式业务写入 |
| `AIOS-012` | `[DONE]` | 计算结果记录 formula、inputs、method_version | 回测/风险/Alpha 5 focused tests + Ruff + mypy |
| `AIOS-013` | `[DONE]` | 统一 Citation UI 与“查看来源/计算方法” | 127 frontend tests + TypeScript/build + desktop/390px browser |
| `AIOS-014` | `[DONE]` | Evidence audit API 与导出清单 v2 | owner audit/export 2 tests；Phase 1 全门禁通过 |

退出门槛：关键数值和计算结果 100% 可追溯；旧记录缺失字段保持 `UNKNOWN`。

### Phase 2 - Investment Memory v1（P0）

| 任务 | 状态 | 结果 | 验证 |
|---|---|---|---|
| `AIOS-020` | `[DONE]` | 类型化 memory records、状态和 supersession | schema v13；8 focused tests + Ruff + mypy |
| `AIOS-021` | `[DONE]` | 显式保存和 background candidate 抽取 | 4 focused tests；自动内容仅 candidate；默认关闭 |
| `AIOS-022` | `[DONE]` | subject/time/provenance-aware retrieval | Recall 1.0 / Precision 1.0；semantic 6/6；P95 0.6133 ms |
| `AIOS-023` | `[DONE]` | context assembler 与 recall explanation | 4 focused tests；双预算、引用、UNKNOWN 与注入边界通过 |
| `AIOS-024` | `[DONE]` | 用户查看、确认、编辑、作废、删除、导出记忆 | owner API/UI；backend 6 + frontend 4 tests；build 通过 |
| `AIOS-025` | `[DONE]` | chat/research shadow -> opt-in rollout | schema v14；默认关闭；metadata-only audit；Phase 2 全门禁通过 |

退出门槛：FinQuant 能回答“我为什么关注/相信/担心这个对象”，并清楚区分用户确认与模型推断。

### Phase 3 - Thesis Artifact 与 Evidence Graph（P0-P1）

| 任务 | 状态 | 结果 | 验证 |
|---|---|---|---|
| `AIOS-030` | `[DONE]` | Thesis v2：判断、假设、支持、反对、失效条件、置信度、版本 | schema v15；旧 API 兼容；不可变历史；focused 17 passed |
| `AIOS-031` | `[DONE]` | claim <-> evidence edges 与时间有效期 | schema v16；focused 17 passed；自动确定状态强制 evidence 回链 |
| `AIOS-032` | `[DONE]` | Challenge My Thesis 产品动作 | owner-scoped 只读挑战；AI_INFERENCE/UNKNOWN；focused 13 backend + 3 frontend |
| `AIOS-033` | `[DONE]` | deterministic + evidence-aware drift engine | thesis-drift/v1；双侧 evidence 门禁；文本相似度无状态权；focused 14 |
| `AIOS-034` | `[BLOCKED]` | 可选 Graphiti read model 同步与重建 | native export/rebuild 2 passed；Graphiti 未安装/未运行，指标 null，pending ADR |
| `AIOS-035` | `[DONE]` | Thesis 历史、差异和用户确认流程 | schema v17；append-only 用户确认；Phase 3 全门禁通过 |

退出门槛：每条 Thesis 状态变化都有来源、时间、旧值、新值和用户控制。

### Phase 4 - 持续研究与 Decision Inbox（P1）

| 任务 | 状态 | 结果 | 验证 |
|---|---|---|---|
| `AIOS-040` | `[DONE]` | 个性化 Today/Decision Inbox 只展示与用户对象相关变化 | decision-inbox/v1；focused backend 47 + frontend 2；E2E 回归/full 11 passed |
| `AIOS-041` | `[DONE]` | Thesis/Portfolio/Strategy 原生 monitor targets | schema v18；draft→confirm；focused backend 63 + frontend 5 |
| `AIOS-042` | `[DONE]` | scheduled research 结果与 memory/evidence 串联 | schema v19；run/retry/report/evidence/memory/notification lineage；backend 79 + frontend 5 |
| `AIOS-043` | `[DONE]` | 复盘工作流：新证据 -> 判断变化 -> 用户确认 | schema v20；COMPUTED_RESULT review + append-only decisions/failures；backend 69 + frontend 6 |
| `AIOS-044` | `[DONE]` | 本地可选产品指标：TTFV、保存、继续、重复研究 | schema v21；focused backend 62 + frontend 9；Phase 4 backend 479/83.74%、frontend 143、E2E 11 |

退出门槛：已通过。首页从“有什么数据”升级为“今天什么与我的判断有关”，且没有无来源提醒；Phase 4 完整 backend/frontend/E2E 门禁通过。

### Phase 5 - 自然语言策略与 Paper Portfolio（P1）

| 任务 | 状态 | 结果 | 验证 |
|---|---|---|---|
| `AIOS-050` | `[DONE]` | 自然语言 -> 有限策略 IR，不直接生成可执行代码 | backend 13、frontend 6、Ruff/mypy/TypeScript/build、OpenAPI 122/155、桌面四态 |
| `AIOS-051` | `[DONE]` | IR -> 现有筛选/回测能力 | backend 20、frontend 7；可逆、无 look-ahead、未决参数不伪造 |
| `AIOS-052` | `[DONE]` | Thesis 一键创建验证实验 | backend 10、frontend 17；owner-safe URL 恢复、ticker-only、无自动执行 |
| `AIOS-053` | `[DONE]` | Paper Portfolio 与真实组合严格分离 | schema v22；独立 append-only ledger；backend 23、frontend 5、390px/浏览器运行时验证 |
| `AIOS-054` | `[DONE]` | 模拟复盘与 hypothesis outcome | owner-safe 显式 outcome；Phase 5 backend 513/83.94%、frontend 157、E2E 11 |

退出门槛：非量化用户能描述想法、理解规则、完成可复现验证，不接触实盘。

### Phase 6 - Durable Runtime 决策与工程化（P1-P2）

| 任务 | 状态 | 结果 | 验证 |
|---|---|---|---|
| `AIOS-060` | `[DONE]` | job event log、lease、幂等 key、恢复语义 | schema v23；focused 43；close/reopen 不重复关键写入 |
| `AIOS-061` | `[DONE]` | scheduler load/SLO 基线 | 3 runs PASS；最差 P95 4.6498 ms；full-suite lock isolation 修复后 backend 526 passed |
| `AIOS-062` | `[BLOCKED]` | durable queue ADR | 仅在第 7.2 节阈值触发后解除 |
| `AIOS-063` | `[BLOCKED]` | PostgreSQL 迁移 ADR/PoC | 仅在并发或容量证据触发后解除 |
| `AIOS-064` | `[DONE]` | backup/restore、memory/evidence consistency audit | snapshot fingerprint 一致；Phase 6 backend 526/83.94%、frontend 157、E2E 11 |

退出门槛：本地模式保持简单；扩展只由实测瓶颈驱动，不以架构时髦度驱动。

### Phase 7 - 分享、Remix 与合规增长（远期设想）

| 任务 | 状态 | 结果 | 验证 |
|---|---|---|---|
| `AIOS-070` | `[DONE]` | 私有 share preview，默认不发布 | owner GET、脱敏与 metadata-only provenance；backend 7、frontend 21、390px/Escape、TypeScript/build 通过 |
| `AIOS-071` | `[PARKED]` | 公开只读 Thesis/Strategy 卡片 | Local OSS v1 不上线运营或提供公网分享 |
| `AIOS-072` | `[PARKED]` | Remix 并保留 lineage | Local OSS v1 不建设公开 Artifact 派生生态 |
| `AIOS-073` | `[PARKED]` | 模板市场/作者身份 | Local OSS v1 不建设 feed、作者体系、排行或市场 |

退出门槛：本阶段不属于 Local OSS v1，只有维护者未来明确决定运营公开服务时才重新评估。

### Phase 8 - Local OSS v1 与 GitHub 发布准备（P0）

目标：让陌生用户在自己的电脑上从干净克隆得到可运行、可诊断、可保留数据的 FinQuant Hub；不要求公网部署或任何运营能力。

| 任务 | 状态 | 结果 | 验证 |
|---|---|---|---|
| `AIOS-080` | `[DONE]` | 重置产品层级并冻结 Local OSS v1 验收合同 | 当前安装/文档/许可/CI 事实审计；公开增长任务 PARKED；任务卡与计划同步 |
| `AIOS-081` | `[DONE]` | 跨平台本地启动器与 doctor | PowerShell 5 + Bash doctor 通过；隔离合同覆盖缺 env/非法端口/不覆盖/不泄密；parser、Compose config、diff check 通过 |
| `AIOS-082` | `[DONE]` | 首次启动与可选能力降级 | backend 8、frontend 5、Ruff/mypy/TypeScript/build、OpenAPI 133/168；配置不冒充连通性 |
| `AIOS-083` | `[DONE]` | 隔离发布源安装、持久化与恢复演练 | 真实 build/start/HTTP、v23/52 表、down/up probe、non-overwrite backup/restore；迁移/恢复 18、Ruff/contract 通过 |
| `AIOS-084` | `[DONE]` | GitHub 开源治理、安全材料与许可决策包 | 52 files/164 frontend tests、Ruff/mypy/TS/build、YAML/links；审计识别 4 BLOCKED/6 WARN |
| `AIOS-085` | `[DONE]` | Local OSS v1 发布候选门禁 | Apache-2.0；clean clone backend 535/84.16%、frontend 52 files、E2E 11、doctor/readiness/build/install/persistence/restore 全通过；仅本地候选 |
| `AIOS-086` | `[DONE]` | 可分发 Alpha starter catalogue 与公开源码树 | focused 18+5、Ruff/mypy/TS/build/export contract；项目外 605 文件 snapshot 真实 build/start，starter PARTIAL 8 字段/5 模板，持久化/恢复通过 |
| `AIOS-087` | `[DONE]` | Local OSS 公开树测试合同可移植性 | 私有 23 passed；公开 22 passed/1 explicit skip；Ruff，通过 metadata 双模式断言 |
| `AIOS-088` | `[DONE]` | 产品运行一致性与信号空状态修复 | frontend 52/166、backend 536/84.19%、E2E 11、Ruff/mypy/TS/build；doctor stale→fresh、HTML no-cache、内置浏览器纯 URL 通过 |

退出门槛：干净克隆在声明支持的平台上按 README 成功启动；仅绑定 loopback；数据库 volume 持久化；无 key/上游失败有明确状态；核心旅程和完整质量门禁通过；GitHub 所需法律、安全、贡献和发布材料齐备。

Phase 8 已达到 Local OSS v1 本地候选退出门槛。2026-08-16 的 `AIOS-088` 已修复旧镜像/入口缓存遮蔽当前产品壳和 Dashboard 信号摘要死请求。当前无新的 `[READY]`；`AIOS-004/005/034/062/063` 继续等待既定 ADR、第三方环境或阈值证据，`AIOS-071/072/073` 继续 `[PARKED]`。

## 9. Codex 执行合同

### 9.1 每轮开始

1. 读取 `PROJECT_CONTRACT.md`、`ARCHITECTURE.md`、`EXEC_PLAN.md`。
2. 读取本计划和最高优先级 `[READY]` 的 `AIOS-*` task 文件。
3. 核对 `git status --short`，保护当前大量未提交成果，不覆盖无关修改。
4. 搜索代码库现有 helper、schema、API 和测试；优先接线和删除重复方案。
5. 若任务涉及第三方项目，重新读取其当前 README、license、release/commit；本计划的版本快照可能过期。

### 9.2 每轮范围

- 一次只完成一个 `AIOS-*` 用户结果。
- 任务卡必须列出允许文件、禁止文件、验收命令和回退方式。
- 先写失败测试或 fixture，再做最小实现。
- 不顺手重构，不新增未请求抽象，不改 `reference/`。
- 数据库迁移必须备份、可重复、按 `PRAGMA user_version` 顺序执行。
- 任何外部副作用、发布、提交、推送或公开分享前都暂停并取得确认。

### 9.3 状态推进

- `[READY]`：依赖和产品决定已满足，可立即执行。
- `[PENDING]`：等待前置任务完成。
- `[BLOCKED]`：缺架构、合规、数据或用户决定；不得绕过。
- `[PARKED]`：经当前产品范围决定主动延期，不属于 Local OSS v1 完成条件。
- `[DONE]`：任务文件中的验证全部通过，证据路径已写回。

完成当前任务后：

1. 将任务卡标记 `[DONE]` 并记录证据。
2. 在本计划中同步状态。
3. 将同阶段下一项满足依赖的任务标记为唯一 `[READY]`；若仅剩显式用户/法律授权阻塞，则保持无 `[READY]`，不得伪造可执行任务绕过门禁。
4. 同步 `EXEC_PLAN.md`。
5. 未经确认不 commit。

## 10. 验证门槛

### 10.1 每项任务

- focused backend tests 使用 `--no-cov`，避免全局 80% coverage 干扰快速回归。
- 相关 Ruff、mypy、Vitest/TypeScript/build 必须通过。
- 正常、加载、空、错误、部分数据和旧记录兼容状态均有验证。
- 涉及 UI 时必须有桌面与 390px 浏览器证据、键盘和无横向溢出检查。
- 涉及金融值时必须核对来源、时间、期间、复权、币种、公式、成本、基准和 `UNKNOWN`。
- 涉及记忆时必须运行隔离、时序、矛盾、prompt injection、删除和回退测试。

### 10.2 每阶段退出

```powershell
cd backend
.venv\Scripts\python.exe -m pytest -q
.venv\Scripts\python.exe -m ruff check .
.venv\Scripts\python.exe -m mypy app

cd ..\frontend
bun run test
bun x tsc -b --pretty false
bun run build
bun run test:e2e
```

同时运行：

- 版本化 memory/evidence benchmark。
- `git diff --check`。
- API/Router/Schema 文档一致性检查。
- 当前真实数据 smoke test；外部源失败与 deterministic fixture 结果分开报告。

## 11. 风险登记

| 风险 | 早期信号 | 控制 |
|---|---|---|
| 通用记忆污染金融事实 | 模型推论被当成数值事实 | 类型白名单、evidence requirement、candidate 状态 |
| 图谱过度建设 | PoC 先引入 Neo4j 运维但无用户结果 | fixture-only shadow、可重建读模型、ADR 门禁 |
| 外部框架锁定 | 产品对象直接使用第三方 schema | 项目自有 provider port 与 canonical types |
| 隐私泄漏 | 跨 user/workspace 命中 | SQL hard filter、0 泄漏发布门槛、删除/导出控制 |
| 旧事实误导 | 不同 as_of 被合并 | validity window、supersession、time-aware query |
| 成本失控 | 每轮对话触发多个抽取/重排 LLM | background batch、调用上限、native fallback、开关 |
| 单机调度不可靠 | 重启漏任务或重复任务 | event log、lease、幂等 key；达到阈值再上队列 |
| 产品滑向投资建议 | 输出直接给买卖动作 | 研究与验证定位、无实盘、合规 gate |
| 当前工作树被覆盖 | 大量既有未提交文件 | 每轮 status/diff 审计、任务 allowlist、不自动 commit |

## 12. 当前结果定义

不按日历强行推进；以下是通过退出门槛后的目标状态：

- 用户可在一个 Research Workspace 内完成研究、证据核对、Thesis、验证和监控。
- FinQuant 能准确说明“系统记住了什么、来自哪里、何时有效、为什么召回”。
- 新证据能精确关联到 Thesis 假设，并由用户确认观点变化。
- 事实和计算 100% 带统一 provenance；推论和假设不冒充事实。
- 记忆检索在固定 benchmark 上满足隔离、时序、矛盾和注入门槛。
- 自然语言策略只生成受限、可解释、可回测的 IR，不生成任意可执行代码。
- Paper Portfolio 与真实资产严格分离。
- 是否引入 Graphiti、PostgreSQL 或 durable queue 都由实测收益和 ADR 决定。
- GitHub 用户可以在自己的电脑上安装、启动、诊断、备份和升级，不依赖维护者运营服务器。
- 分享/Remix、作者市场和多人在线保持 PARKED；只有未来决定运营公开服务时才进入规划。

## 13. 明确不做

- 不为了追赶概念重写现有 FastAPI/React 应用。
- 不直接采用完整 Letta/Cognee runtime。
- 不引入 LangGraph、CrewAI 或 AutoGen。
- 不让图数据库成为第一版权威数据源。
- 不做自动买卖、券商连接、资金管理、跟单或收益承诺。
- 不做无来源的“AI 信心分”或单一综合投资分数。
- 不做先于核心闭环的社区 feed、排行榜或模板市场。
- 不用星标数、营销 benchmark 或托管专有能力替代本项目验证。

## 14. 研究来源

### 本地权威来源

- `docs/ai/PROJECT_CONTRACT.md`
- `docs/ai/ARCHITECTURE.md`
- `docs/ARCHITECTURE.md`
- `docs/API_CONTRACT.md`
- `docs/DATA_SOURCES.md`
- `docs/ai/PRODUCTIZATION_PLAN.md`
- `docs/ai/PRODUCT_CAPABILITY_MATRIX.md`
- `docs/ai/PRODUCT_METRICS_CONTRACT.md`
- `backend/app/services/memory.py`
- `backend/app/services/thesis.py`
- `backend/app/services/research_jobs.py`
- `backend/app/services/scheduler.py`

### 外部一手来源

- [Mem0 repository](https://github.com/mem0ai/mem0)
- [Graphiti repository](https://github.com/getzep/graphiti)
- [Letta repository](https://github.com/letta-ai/letta)
- [LangMem repository](https://github.com/langchain-ai/langmem)
- [Cognee repository](https://github.com/topoteretes/cognee)
- [Memobase repository](https://github.com/memodb-io/memobase)
