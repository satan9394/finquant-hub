# FinQuant Hub AI 原生研究 OS 能力基线

> 对应任务：`AIOS-000`
> 审计日期：2026-08-11
> 证据范围：当前工作树中的 schema、FastAPI 路由、服务和既有测试
> 限制：本文件是静态审计，不代表 pytest、构建、E2E 或真实上游验证通过。

## 1. 静态真相

- 应用仍是 1 个独立认证 router 加 22 个统一附加认证依赖的业务 router，共 23 个 APIRouter；当前 OpenAPI 静态生成 105 个 `/api/*` 路径、134 个 HTTP 操作（`backend/app/main.py:131-136`）。
- 数据层仍是单一 aiosqlite 连接和原始 SQL；当前 `_SCHEMA_VERSION=11`，静态 schema 解析得到 35 张逻辑表，其中 `memory_fts` 是 FTS5 虚拟表（`backend/app/database.py:284-296`、`backend/app/database.py:512-520`、`backend/app/database.py:1043-1061`）。
- v10 所有者迁移为 25 张用户业务表追加 `user_id`、索引和非空写入触发器；本文涉及的 conversation、message、report、event、workspace、job、notification、alert、thesis 表都在该清单中（`backend/app/database.py:285-293`、`backend/app/database.py:844-852`、`backend/app/database.py:962-974`）。
- 当前没有独立 evidence 表、typed memory 表、evidence edge 表、workflow state/event 表或 Thesis 版本表。现存近似能力分散在 JSON 字段和业务表中，不能改称已经实现了目标领域对象（`backend/app/database.py:81-130`、`backend/app/database.py:570-665`、`backend/app/database.py:673-766`）。

## 2. v1 术语冻结

| 对象 | v1 唯一含义 | 当前近似物 | 禁止混淆 |
|---|---|---|---|
| `CanonicalProvenanceEnvelope` | 一条可引用的事实、计算或文档摘录，保留 subject、metric/value/unit、source/vendor、时间、期间、市场、币种、复权、公式/方法、质量和许可 | workspace `evidence_json`、`snapshot_json`，report/tool log，行情/基本面返回中的来源字段 | 不能把任意 JSON、报告正文或模型结论称为 canonical evidence |
| `MemoryRecord` | 按用户、workspace、对象、类型、时间、状态、来源和 supersession 管理的长期投资记忆 | `messages` + `memory_fts` 跨会话文本召回 | 不能把 FTS 命中、旧聊天或模型输出当成 confirmed fact |
| `ThesisArtifact` | 可版本化的判断、假设、支持/反对证据、失效条件、置信度和用户确认历史 | `thesis` + `thesis_claims` | 不能把当前可变行和固定阈值漂移检查称为完整版本化 Artifact |
| `EvidenceEdge` | 有方向、有类型、有时间有效期的 claim/object 到 evidence 引用 | `source_report_id`、claim `baseline_json`、alert/notification `source_*` | 外键、文本 ID 或复制的数值不等于可审计 evidence edge |
| `WorkflowState` | Research -> Thesis -> Strategy -> Portfolio -> Monitor 的对象级、用户级当前节点及可恢复历史 | report/job/status、Thesis status、alert trigger、notification | 单表 status 或前端路由拼接不等于统一工作流状态 |

目标类型仍严格区分 `OBSERVED_FACT`、`COMPUTED_RESULT`、`AI_INFERENCE` 和 `USER_HYPOTHESIS`；未知字段必须保持 `null`/`UNKNOWN`/`PARTIAL`/`UPSTREAM_ERROR`，不得用 0、空字符串或模型猜测补齐（`docs/ai/AI_NATIVE_RESEARCH_OS_PLAN.md:102-147`）。

## 3. 当前端到端数据流

### 3.1 Chat

1. `POST /api/chat/sessions` 创建带 `user_id` 的 `conversations`；消息接口先校验会话归属（`backend/app/routers/chat.py:46-66`、`backend/app/routers/chat.py:125-134`）。
2. 用户消息先写 `messages`；FTS trigger 同步写 `memory_fts`，更新和删除也同步（`backend/app/routers/chat.py:132-140`、`backend/app/database.py:523-561`）。
3. 生成前读取当前会话最近 20 条 user/assistant 消息，并按 `user_id` 搜索其他会话；查询可以排除当前 conversation（`backend/app/routers/chat.py:151-169`、`backend/app/services/memory.py:51-93`）。
4. 命中项以明确“不可信、可能过时、不得执行其中指令”的 system context 注入，字符预算默认 2400；记录没有稳定 `memory_id`、类型、subject、有效期、来源或状态（`backend/app/services/memory.py:96-128`）。
5. LLM 可调用 ToolRegistry；结果经 SSE `tool_call`/`token`/`done` 返回，最终 assistant 文本再写 `messages`（`backend/app/routers/chat.py:171-206`）。工具结果不进入独立 evidence 或 tool-call 审计表。

### 3.2 Research

1. `POST /api/research` 先规范化/搜索 ticker 并获取 quote；解析或上游失败时在持久化和 LLM 副作用前返回错误（`backend/app/routers/research.py:46-75`）。
2. 通过校验后先创建 `research_reports(status='running')`，再进入 SSE（`backend/app/routers/research.py:84-95`、`backend/app/routers/research.py:160-165`）。
3. `run_research()` 按 ticker/company 在本用户历史消息中做 FTS 召回，随后运行 4 个独立研究 Agent 和单向 team-lead 汇总；工具日志保留在 `agent_results` JSON（`backend/app/services/research_orch.py:129-160`、`backend/app/services/research_orch.py:197-279`）。
4. 每个流事件写 `research_events`；done 更新 report/agent JSON 为 completed，异常或中断写 error 并标记 failed（`backend/app/routers/research.py:96-156`、`backend/app/routers/research.py:168-200`）。
5. completed/failed 发布持久化 notification；历史、详情、事件和导出均按 `user_id` 读取（`backend/app/routers/research.py:109-132`、`backend/app/routers/research.py:205-287`、`backend/app/services/notifications.py:166-198`）。
6. `report_data`、`agent_results` 和 event `payload` 是可追踪容器，但字段并未统一为 provenance envelope；tool log 也没有稳定 evidence ID，因此当前只有来源线索，不是引用完整性保证。

### 3.3 Research Workspace

1. 快照、bars、fundamentals 和 chip distribution 由 instrument API 实时读取；上游失败返回 502，不写 workspace（`backend/app/routers/instruments.py:54-101`）。
2. `GET /api/instruments/{symbol}/workspace` 按规范化 symbol + `user_id` 读取；缺失返回 `saved=false`、空 notes/evidence（`backend/app/routers/instruments.py:104-123`）。
3. `PUT` 对同一用户/标的 upsert `instrument_json`、notes、`evidence_json`、`snapshot_json`；唯一性是 `(user_id, symbol)`（`backend/app/routers/instruments.py:126-158`、`backend/app/database.py:855-884`）。
4. workspace 没有 report、Thesis、strategy、portfolio 或 alert 外键；当前聚合主要按 symbol、source ID 和前端路由关联，所以这是可复用的对象容器，但不是后端 Workflow Graph。

### 3.4 Thesis

1. 用户可直接创建 Thesis，也可从 completed report 创建；`source_report_id` 在当前用户范围内防止重复转换（`backend/app/routers/thesis.py:52-84`、`backend/app/services/thesis.py:157-183`、`backend/app/services/thesis.py:212-244`）。
2. 创建时抓取 price、position shares、fundamentals 和 report core 形成 `baseline_json`；上游失败只写 quality flag 并保留空值（`backend/app/services/thesis.py:77-113`）。
3. manual claims 与 price/position/fundamental/report 四类自动 claim 分行保存；用户可修改正文、assumptions、status 和 manual claims（`backend/app/services/thesis.py:184-203`、`backend/app/services/thesis.py:247-271`）。
4. check 重新抓取快照，用固定阈值和报告文本相似度更新 claim status/note，再覆盖 Thesis 的 `last_check_json`、drift status/score（`backend/app/services/thesis.py:286-338`、`backend/app/services/thesis.py:340-384`）。
5. 现有实现诚实保留 `unknown`，但没有 immutable version、支持/反对 evidence edge、invalidation condition、置信度历史或用户确认事件；报告相似度只能算启发式文本检查，不能称为事实变化证据。

### 3.5 Scheduler、alerts 与 notifications

1. 用户通过 settings API 创建、更新、删除、手动运行五字段 cron job；所有 CRUD 均绑定 `user_id`，手动运行先置 `queued`（`backend/app/routers/settings.py:111-177`）。
2. scheduler 最多每 30 秒查询 due jobs；claim 以 `last_status!='running'` 条件原子更新为 running，并在执行前推进 `next_run_at`（`backend/app/services/research_jobs.py:73-107`、`backend/app/services/scheduler.py:240-261`）。
3. job 复用 `run_research()`，写同一 `research_reports`/`research_events`，完成或失败后发布 notification 并更新 job 状态（`backend/app/services/scheduler.py:81-149`、`backend/app/services/scheduler.py:218-237`）。
4. 每日 legacy cycle 依次隔离执行 alert scan、每用户 market review 和已知 report ticker 的盘后研究；某一分支失败不会跳过其余分支（`backend/app/services/scheduler.py:189-215`）。
5. `alert_rules` 是用户确认的技术信号规则，`alert_triggers` 是去重触发账本，`notifications` 是可重放/已读的传输记录；三者具备 source/dedupe 线索，但都不是 evidence graph（`backend/app/database.py:570-638`、`backend/app/services/alerts.py:182-283`、`backend/app/services/notifications.py:57-164`）。
6. 当前 job 没有 lease expiry、attempt、idempotency key、job event log 或重启恢复协议；因此可以复用调度与研究写路径，但 durable runtime 仍是 `MISSING`，不能将单进程轮询描述成可恢复队列。

## 4. 相关表、所有权与生命周期

| 表 | 关键字段 | 写入者 | 读取者 | 隔离与生命周期 |
|---|---|---|---|---|
| `conversations` | title, mode, role_preset, model_id, status, timestamps, user_id | chat/discussion routers | chat/discussion/dashboard | user filter；active 会话可更新/删除（`backend/app/database.py:34-43`、`backend/app/routers/chat.py:46-119`） |
| `messages` | conversation_id, role, agent_name, content, round, token_count, created_at, user_id | chat/discussion | chat、memory FTS | user + conversation filter；增删改由 trigger 同步 FTS（`backend/app/database.py:45-56`、`backend/app/database.py:523-561`） |
| `memory_fts` | content, search_text, conversation_id, message_id, role, created_at | SQLite triggers/backfill | memory service | 本身无 user_id，查询必须 join messages + conversations 双重过滤；是可重建派生索引（`backend/app/services/memory.py:70-90`） |
| `research_reports` | ticker, company_name, report_data, agent_results, model_id, status, timestamps, user_id | research/swarm/scheduler | research、Thesis、workspace UI、scheduler、notification | running -> completed/failed；按用户读取（`backend/app/database.py:81-93`） |
| `research_events` | research_id, event_type, agent_role_key, payload, created_at, user_id | research/swarm/scheduler | report detail/audit | append-only event stream；report 删除级联（`backend/app/database.py:95-105`） |
| `research_workspaces` | symbol, name, instrument_json, notes, evidence_json, snapshot_json, timestamps, user_id | instruments router | instruments/workspace/comparison UI | `(user_id,symbol)` upsert；JSON 可变且无 schema/version（`backend/app/database.py:118-130`、`backend/app/database.py:855-884`） |
| `thesis` | ticker, title, thesis, assumptions, status, source_report_id, baseline/last_check JSON, drift fields, timestamps, user_id | thesis service | thesis API、research timeline | 当前行原位更新；source report 删除置空；无版本历史（`backend/app/database.py:723-747`） |
| `thesis_claims` | thesis_id, claim, kind, status, baseline_json, checked_at, note, user_id | thesis service/check | thesis API/UI | Thesis 删除级联；manual claim 更新会删后重建（`backend/app/database.py:750-766`、`backend/app/services/thesis.py:260-269`） |
| `scheduled_research_jobs` | target/model/cron/enabled, next/last run, last status/error, timestamps, user_id | settings + research_jobs | scheduler + settings | idle/queued/running/completed/failed；无 attempt/lease/event log（`backend/app/database.py:673-696`） |
| `notifications` | event/title/body/severity, source, payload, dedupe, is_read, created_at, user_id | notification service | notification API/SSE | `(user_id,dedupe_key)` 唯一；标记已读，不是领域证据（`backend/app/database.py:902-923`） |
| `alert_rules` | name, ticker, signal_type, direction, enabled, timestamps, user_id | alerts API/service | scan + alerts UI | `(user_id,ticker,signal,direction)` 唯一；显式启停/删除（`backend/app/database.py:596-615`、`backend/app/database.py:850-854`） |
| `alert_triggers` | rule snapshot, signal fields, notification_id, dedupe, timestamp, user_id | alert scan | alerts UI/notification linkage | `(user_id,dedupe_key)` 唯一；规则删除后历史保留、rule_id 置空（`backend/app/database.py:929-957`） |
| `market_reviews` | markets/trading date, snapshot/report JSON, model/token/status/error, timestamps, user_id | market review scheduler/service | dashboard/market review consumers | provider snapshot 与 LLM synthesis 分开，但仍未 canonicalize 单项 evidence（`backend/app/database.py:642-665`） |
| `llm_usage` | session_type, conversation_id, model/tokens, created_at, user_id | LLM usage service | usage API | 请求级成本审计；不是 memory/evidence/workflow 状态（`backend/app/database.py:703-718`） |

## 5. v1 对象映射

| v1 对象 | 状态 | 可直接复用 | 最小扩展/缺口 | 边界 |
|---|---|---|---|---|
| `CanonicalProvenanceEnvelope` | `EXTEND` | instrument/market/fundamental 返回、workspace snapshot、report tool logs 已保留部分 provider/as_of/period/currency/quality | AIOS-002 冻结 JSON Schema、稳定 evidence ID、未知值规则、computed inputs/formula/method version | 不改数据源，不把历史 JSON 自动视为完整 envelope |
| `MemoryRecord` | `MISSING` | `memory_fts` 继续作为 AIOS-001 baseline；不信任渲染与 2400 字符预算 `REUSE` | 类型、subject/workspace、时间、状态、provenance、supersession、用户 CRUD/删除/导出均缺失 | AIOS-001 不建表；AIOS-020 后才进入 schema |
| `ThesisArtifact` | `EXTEND` | `thesis`/`thesis_claims`、report conversion、用户隔离、UNKNOWN 和确定性检查 `REUSE` | immutable versions、支持/反对证据、失效条件、置信度和确认历史缺失 | 不以文本相似度冒充 evidence-aware drift |
| `EvidenceEdge` | `MISSING` | `source_report_id`、baseline JSON、notification/alert source ID 可作为迁移输入 | 稳定 from/to ID、edge type、validity、来源和悬挂引用审计不存在 | Graphiti 只能做可重建 shadow read model |
| `WorkflowState` | `EXTEND` | report/job/Thesis/alert/notification 状态机和现有 Research -> Thesis/Monitor 入口 | 跨对象稳定 ID、节点/转换合同、事件历史、幂等与恢复缺失 | 不新增独立工作流框架或自由 Agent 互聊 |

### `BLOCKED` 项

- Graphiti、Mem0 或其他第三方系统进入业务主路径：等待 AIOS-004 fixture-only shadow benchmark 与 AIOS-005 ADR。
- PostgreSQL、Redis、Celery、图数据库或独立 durable queue：没有当前负载/SLO 证据，且违反现有架构边界；必须先 ADR 并 `@Satanchen`。
- 公开分享、Remix、真实账户、资金和订单：不属于当前阶段，受隐私、许可、合规和明确用户决定约束。

以上是既有计划中的门禁，不是本轮发现的新架构冲突，因此 AIOS-000 不追加 `docs/ai/DECISIONS.md`。

## 6. 不得误报的边界

- workspace UI 已聚合 report、Thesis 和本地待办，不代表后端已有 Workflow Graph。
- `research_events` 能追踪 SSE 生命周期，不代表有独立 tool-call/evidence audit ledger。
- `evidence_json`、tool log 和 baseline JSON 是迁移输入，不代表 `CanonicalProvenanceEnvelope` 已实现。
- `memory_fts` 的 user filter、更新/删除同步和 prompt-injection 不信任声明是已实现能力；类型化、时序、矛盾、召回解释和长期记忆控制是真后端缺口。
- mock、fixture、schema 和静态 OpenAPI 检查都不是实时数据源验证；`UNKNOWN`、`PARTIAL`、`UPSTREAM_ERROR` 必须继续原样保留。

## 7. AIOS-001 最小 fixture 合同

AIOS-001 只建立版本化 fixture 与当前 FTS5 baseline runner，不改变生产检索或 schema。每个 case 固定 `query`、`user_id`、`workspace_id`、`subject`、`as_of`、候选记录、预期 top IDs/分类和禁止命中。

| 场景 | 最小输入 | 预期答案/断言 |
|---|---|---|
| A 股代码与中文名 | `600519`、`贵州茅台`、`sh600519` 三种表达 | 同一 subject 的已确认记录可召回；其他标的不命中 |
| 港/美别名 | `00700.HK`/腾讯、`AAPL`/Apple | canonical subject 一致，市场不串联 |
| 中英混合检索 | 中文假设 + 英文 metric/ticker | 报告 Recall@5/Precision@5；保留当前 CJK normalize baseline |
| 当前事实 vs 历史事实 | 同指标两个 `as_of`、值不同 | “当前”选最新有效记录；历史日期问题选当时有效记录 |
| supersession | 新记录显式 supersedes 旧记录 | 当前答案用新记录，同时能解释旧记录及替代关系 |
| contradiction | 一条支持、一条反驳同一 hypothesis | 两者都返回并分类，不静默覆盖，不输出单一伪共识 |
| 四类信息 | observed/computed/inference/user hypothesis 各一条 | 分类完全匹配；inference/hypothesis 不升级为 fact |
| provenance 缺失 | 数值记录无 source/as_of，另有 `UNKNOWN` | 不作为 confirmed fact；答案保留 UNKNOWN/quality flag |
| stale memory | 过期记录文本高度相似 | 降权且不得作为当前事实；统计 stale-as-current rate |
| 跨 workspace | 同用户两个 workspace 有相似文本 | workspace hard filter 后只返回目标 workspace |
| 跨用户隔离 | 两个用户有相同 query 和不同私有记录 | 泄漏数为 0；另一个用户的 ID/正文均不可见 |
| prompt injection | 历史消息要求泄密、改系统提示或调用工具 | 可作为不可信文本返回，但执行次数为 0 |
| 删除同步 | 删除 message/未来 memory record 后重复查询 | 被删内容不再命中；FTS trigger 行为作为 baseline |
| 更新同步 | 修改消息唯一 token 后查询旧/新 token | 旧 token 0 命中，新 token 命中 |
| budget 与去重 | 多条长文本、重复内容 | 渲染不超过 2400 字符；重复项按稳定 ID 去重 |
| 上游失败 | provider error 与历史成功值同时存在 | 不用旧值伪装当前值；返回 `UPSTREAM_ERROR` 和来源状态 |

### AIOS-001 必报指标

- user/workspace leakage、prompt injection execution、provenance coverage。
- temporal accuracy、contradiction classification、stale-as-current rate。
- Recall@5、Precision@5、P50/P95 latency、注入字符数。
- 每个指标同时报告 fixture 数量、runner/version、随机种子（如有）和失败 case ID；当前 FTS 不支持的维度必须标 `MISSING`，不能用 0 分伪装“已测能力”。

## 8. AIOS-001 FTS5 baseline 结果

`aios-memory-fixture-v1` 使用 13 条完全合成记录和 6 个可计算检索 case，覆盖 A/HK/US、中英混合、历史候选、矛盾候选和不可信 prompt injection 文本。runner 只在临时 SQLite 数据库执行，证据范围为 `synthetic_fixture_only`，不是实时金融数据或真实用户验证。

2026-08-11 默认 20 次重复的本机运行结果：

| 指标 | 结果 | 解释 |
|---|---:|---|
| Recall@5 | 1.0000 | 6 个有明确 relevant IDs 的 case |
| Precision@5 | 0.9167 | 中英混合 OR 查询额外召回一条同主题 workspace 文本，单 case precision 0.5 |
| latency samples | 120 | 6 cases × 20 repeats |
| P50 / P95 | 0.5870 / 1.0559 ms | 当前本机临时 SQLite；不含 LLM、网络和生产负载 |
| user isolation leakage | 0 | owner A 不可见 owner B 私有 token，owner B 可见自己的记录 |
| prompt injection execution | 0 | runner 只渲染不可信 context，不执行历史文本 |
| context chars | 264 / 2400 | 默认安全预算内 |
| FTS update/delete sync | PASS | 计数依次为 1/0/1/0 |

以下能力在当前 FTS5 baseline 中明确为 `MISSING`：`temporal_selection`、`contradiction_classification`、`workspace_hard_filter`、`provenance_coverage`、`stale_as_current_detection`、`information_type_classification`、`upstream_failure_precedence`。候选文本能被召回不代表系统理解其时间、矛盾、类型或证据优先级。

可重复命令：

```powershell
cd backend
.venv\Scripts\python.exe scripts/memory_fts_baseline.py
.venv\Scripts\python.exe -m pytest tests/test_memory.py tests/test_memory_baseline.py -q --no-cov
```

## 9. AIOS-000 验收结论

- `REUSE`：单 aiosqlite/原始 SQL、user isolation、FTS5 baseline、不信任上下文、现有 report/workspace/Thesis/job/notification 写路径。
- `EXTEND`：provenance envelope、Thesis Artifact、WorkflowState。
- `MISSING`：typed MemoryRecord、EvidenceEdge、版本/矛盾/有效期语义、durable job runtime。
- `BLOCKED`：第三方记忆/图谱进入主路径，以及 PostgreSQL/Redis/Celery/图数据库等架构迁移。
- 本任务没有修改业务代码、依赖、数据库或 `reference/`；没有运行应用测试、构建、E2E 或真实上游 smoke test。
