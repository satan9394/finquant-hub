# FinQuant Hub 架构总览

## 1. 架构总览

FinQuant Hub 是一个面向中文个人投资者的**全栈量化投研 Web 系统**，覆盖 A/港股/美股的多 Agent 研究报告生成、技术指标分析、投资组合管理与策略回测功能。

### 系统分层

```
┌─────────────────────────────────────────────────────────┐
│                       浏览器层                           │
│  React 18 + Ant Design 5 + lightweight-charts           │
│  18 路由页面 | axios 统一代理 | React.lazy 代码分割         │
│  单 api.ts 实例 (/api/*)                               │
├─────────────────────────────────────────────────────────┤
│                    Vite 开发代理 (5173 → 8000)            │
├─────────────────────────────────────────────────────────┤
│                     路由层 (22 个 APIRouter)              │
│  /api/auth  /api/me/credentials  /api/models  /api/agents│
│  /api/chat  /api/discussion  /api/market  /api/dashboard │
│  /api/analysis  /api/portfolio  /api/wq  /api/research   │
│  /api/screening  /api/backtests  /api/instruments       │
│  /api/swarm /api/notifications /api/alerts /api/mcp      │
│  /api/settings  /api/usage  /api/thesis                  │
│  auth 独立注册，其余路由统一附加认证依赖；无自动发现       │
├─────────────────────────────────────────────────────────┤
│                     服务层                                │
│  ┌──────────────────────────────────────────────────┐   │
│  │  MarketDataService   (数据源适配器 + 降级链)       │   │
│  │   腾讯 → 新浪 → Yahoo (实时行情)                  │   │
│  │   新浪 → 腾讯 → Yahoo (K线)                      │   │
│  │   东方财富 + Yahoo (搜索)                         │   │
│  ├──────────────────────────────────────────────────┤   │
│  │  LLMClient            (OpenAI 协议抽象)            │   │
│  │   chat / chat_stream / chat_with_tools            │   │
│  │   chat_with_tools_safe / chat_with_tools_loop     │   │
│  ├──────────────────────────────────────────────────┤   │
│  │  research_orch / discussion_orch  (编排器)         │   │
│  │  4 Agent 并行 → team-lead / 多 Agent 轮序 | SSE   │   │
│  ├──────────────────────────────────────────────────┤   │
│  │  analysis/scoring.py + signals.py   (量化分析)     │   │
│  │  indicators.py  (7 指标 numpy 实现)              │   │
│  ├──────────────────────────────────────────────────┤   │
│  │  portfolio.py  /  alpha_service.py               │   │
│  │  backtest/ma_crossover.py + portfolio.py (v2)     │   │
│  └──────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────┤
│              Agent 工具层 (13 工具, function_calling)   │
│  GetStockData / CalculateIndicators / VerifyValuation   │
│  ScreenStocks / AuditReportData / SearchNews             │
│  CalculateByFinancialRigor / CheckBuffettRules           │
│  AdversarialReview / RunBacktest / AnalyzeShadowTrades  │
│  AnalyzePortfolioRisk / AssessTradingConnector           │
│  ToolRegistry 单例 + BaseTool 抽象基类                  │
├─────────────────────────────────────────────────────────┤
│                     数据层                                │
│  aiosqlite 单连接 + WAL + schema v24（49 张逻辑表）       │
│  database.query_one/query_all/execute 直接 SQL 调用     │
├─────────────────────────────────────────────────────────┤
│                     外部API                               │
│  腾讯 qt.gtimg.cn  |  新浪 hq.sinajs.cn                 │
│  东方财富 searchapi   |  Yahoo Finance v8/v1            │
│  DeepSeek API  (OpenAI 兼容协议)                        │
└─────────────────────────────────────────────────────────┘
```

## 2. 核心架构模式

以下八种模式构成了 FinQuant Hub 的实际架构骨架。每个模式都在代码中存在实际实现，并形成了可识别的约束。

### 2.1 路由统一注册模式

**实现位置**：`backend/app/main.py`

`auth.router` 独立注册；其余 22 个业务路由器通过一个 for 循环扁平注册，并统一附加 `authenticated_context`。业务路由无嵌套挂载、无前缀冲突检测、无自动发现机制。每个路由器各自定义 `prefix` 和 `tags`。

`main.py` 另支持显式 `SERVE_FRONTEND=1`/`true` 的单进程静态托管（默认关闭）：从入口文件定位仓库 `frontend/dist`，缺失则警告并跳过；全部 API（含 `/api/health`）注册后挂载存在的 `/assets`，最后的 GET fallback 保留 `/api` 与 `/api/*` 的 404 拦截，先用 `resolve()` + `is_relative_to()` 拒绝 dist 外路径（404），再优先返回 dist 内实际静态文件（含根级 `favicon.svg`，保留正确 content-type），其余路径回退 `index.html`；SPA fallback 不进入 OpenAPI。Windows start.bat 单进程使用入口固定为 8000，5173 仅用于开发或可选 Docker 路径；Docker 仍由 nginx 托管，认证与 CSR 模式不变。

```python
# 核心逻辑（实际代码）
app.include_router(auth.router)
for r in (credentials.router, models_crud.router, agents.router, ...):
    app.include_router(r, dependencies=[Depends(auth.authenticated_context)])
```

**关键特征**：
- 新增路由需要两处改动：在 `routers/` 下建文件 + 在 `main.py` 的 import 和注册循环中各加一行
- 无统一前缀验证，路由前缀在各自的 Router 定义中（如 `prefix="/api/chat"`）
- 所有路由函数直接调用 `database.query_one/query_all/execute`，没有独立的 Data Access Layer
- 共享依赖通过 `request.app.state.market` 获取（`MarketDataService` 单例）
- `instruments.py` 另含 2 个 `AStockExtraService` 薄包装端点（资金流向、龙虎榜），`market.py` 含 1 个独立涨跌停池薄包装端点；三者只负责参数/错误映射和 `aclose()`，直接透传既有服务结果，未改变服务层、旧 `/chip-distribution` 或旧 `/limit-up` 行为。

### 2.2 服务层分层模式

**实现位置**：`backend/app/services/` 目录

服务层分为三个子层次：
- **纯逻辑服务**：`indicators.py`、`analysis/scoring.py`、`analysis/signals.py`、`alpha_service.py` — 只处理 Python 数据结构，无 I/O，纯 numpy 计算，可单元测试
- **I/O 服务**：`market_data.py`、`llm_client.py`、`portfolio.py` — 封装外部 API 调用和数据库操作，可注入 httpx 客户端便于测试
- **编排器**：`research_orch.py`、`discussion_orch.py` — 协调多个子服务完成复杂业务流程，使用异步生成器推送 SSE 事件

**关键约束**：编排器可以调用 I/O 服务和纯逻辑服务；I/O 服务可以调用纯逻辑服务；纯逻辑服务不引用任何其他服务。

### 2.3 Agent 工具框架

**实现位置**：`backend/app/agent/tools.py` + `tools_definitions.py`

基于 `BaseTool` 抽象基类和 `ToolRegistry` 单例的工具框架：

```
BaseTool (ABC)
 ├── name / description / parameters (类属性)
 ├── run() → ToolResult(success, data, error) (抽象方法)
 └── to_openai_tool() → OpenAI function_calling dict

ToolRegistry (单例)
 ├── register(tool) / get(name) / list_all()
 ├── to_openai_tools() → list[dict]
 └── remove(name) / clear()
```

13 个已注册工具：GetStockData、CalculateIndicators、VerifyValuation、ScreenStocks、AuditReportData、SearchNews、CalculateByFinancialRigor、CheckBuffettRules、AdversarialReview、RunBacktest、AnalyzeShadowTrades、AnalyzePortfolioRisk、AssessTradingConnector。最后一个工具严格为 `design_only`，没有账户或订单 I/O。外部 MCP 工具在运行时按启用状态动态加入同一注册表，不计入这 13 个本地工具。

**使用链路**：research_orch/chat → ToolRegistry → LLMClient tool loop → LLM 选择工具 → 执行 tool.run() → 结果反馈给 LLM → 最终生成分析。

### 2.4 数据源适配器模式

**实现位置**：`backend/app/services/market_data.py`

一个 `MarketDataService` 类封装了 4 个数据源（腾讯、新浪、东方财富、Yahoo Finance），对外提供统一的标的行情、市场快照与源健康接口：

```
对外接口         内部降级链
─────────────────────────────────
search()   → 东方财富 + Yahoo（双源并行，结果合并去重）
quote()    → 腾讯 → 新浪 → Yahoo（逐级降级）
kline()    → 新浪 → 腾讯 → Yahoo（逐级降级）
fundamentals() → A 股 AkShare → Tushare → Yahoo；港/美 Yahoo
index_quote() → A 股复用 quote；港/美指数走 Yahoo
quote_enriched() → 主源事实不覆盖，低优先级源只补缺失字段
prefetch_quotes() → 有界并发，保留逐 ticker 错误
```

**关键设计决策**：
- A 股走腾讯/新浪/东方财富（国内市场直连，`trust_env=False` 绕过系统代理）
- 港股/美股走 Yahoo（系统代理可达，`trust_env=True`）
- 两个独立的 httpx 客户端（`self.http` 和 `self.yahoo_http`）
- `detect_market()` 和 `normalize_code()` 函数统一将用户输入的多种格式（如 `600519`、`00700.HK`、`AAPL`）规范化为内部 ticker 格式（如 `sh600519`、`hk00700`、`usAAPL`）
- 腾讯/新浪/Yahoo/东方财富各有进程内 CircuitBreaker；行情与 K 线源顺序可配置并持久化到 `system_settings`
- `MarketOverviewService` 提供主要指数、A 股全市场分页涨跌统计、行业/概念排行、人气股和涨停池；港/美无可靠成分集合时 breadth 明确返回 `unsupported`
- `market_reviews` 分开保存 provider snapshot 与 LLM synthesis，便于复核模型是否越过证据边界
- `NewsSearchService` 统一 Tavily/SerpAPI/Bocha/Brave/SearXNG/新浪结构，fallback/aggregate 均保留逐条来源
- `scheduled_research_jobs` 保存 5 字段 cron、启停、最近/下次运行状态；本进程 asyncio 轮询，不引入 Celery

### 2.5 SSE 流式通信模式

**实现位置**：`backend/app/routers/chat.py`、`discussion.py`、`analysis.py`、`research.py`、`swarm.py`、`notifications.py`

6 条 SSE 管线承载 7 个公开端点；Swarm 四大师另保留 1 个不进入 OpenAPI 的兼容别名。它们共享同一架构模式：

```
请求 → 创建数据库记录 → 异步生成器 yield (event, data) →
EventSourceResponse 包装 → 前端逐事件消费
```

事件协议（所有 SSE 端点统一）：
- `{"event": "token", "data": {"delta": "..."}}` — 流式文本增量
- `{"event": "agent_started", "data": {...}}` — Agent 开始工作
- `{"event": "tool_call", "data": {...}}` — Agent 调用工具
- `{"event": "done", "data": {...}}` — 全部完成
- `{"event": "error", "data": {"error": "...", "message": "..."}}` — 异常（`error` 为规范字段，`message` 为旧客户端兼容别名；必须以此收尾，不能静默断流）

**关键设计**：所有 SSE 端点都在 `try/finally` 中确保 `error` 事件发送后结束响应，不会让前端等待超时。

### 2.6 LLM 客户端抽象层

**实现位置**：`backend/app/services/llm_client.py` + `model_router.py`

`LLMClient` 只依赖 OpenAI Chat Completions 协议，DeepSeek 等兼容供应商即插即用：

```
LLMClient (httpx 异步)
 ├── chat() → (content, tokens)           非流式单次
 ├── chat_stream() → AsyncIterator[str]   流式逐 token
 ├── chat_with_tools() → 带 function_calling
 ├── chat_with_tools_safe() → 保留 reasoning_content（DeepSeek 兼容）
 └── chat_with_tools_loop() → 完整 tool_use 循环

model_router.get_client(model_id) → (LLMClient, config)
  ├── model_id=None → 取数据库中 is_default=1 的配置
  ├── API Key 优先级：数据库字段 > 环境变量
  └── 通过 DB 模型配置表管理（用户界面可 CRUD）
```

### 2.7 回测 API（仅 v2）

**实现位置**：`backend/app/routers/backtests.py` + `backend/app/backtest/ma_crossover.py`，组合回测复用 `backtest/portfolio.py`。

BACKLOG-021 已回收 v1 router、`backtest/engine.py` 和专属测试，`/api/backtest` 不再提供服务。当前仅 v2 `/api/backtests`（9 路径、10 操作）；2026-09-07 新增模型列表发现接口后，全应用 OpenAPI 为 136 路径、170 操作。旧 `backtest_runs` 表及数据仍由 `database.py` 保留，v2 继续使用 `quant_backtests`，不做表迁移。共享 `backtest/metrics.py` 仍被 `alpha_simulator.py` 使用；Agent `run_backtest` 工具继续使用 v2。

Chat 回测入口重定向到 `/strategy-lab/ma-crossover?symbol={ticker}`：复用现有描述解析函数仅提取股票代码，缺少代码时保留提示；不传递旧策略类型，不自动运行。用户在 Strategy Lab 确认参数后使用既有 v2 流程。Chat 内的 v1 请求、结果 state/列表和 loading 态已移除，解析工具文件保留；无外部引用的 `BacktestResultCard` 及其同名测试已在 BACKLOG-022 回收至回收站。

| 维度 | v2 (backtests.py) |
|------|-------------------|
| 执行方式 | BackgroundTasks 异步 |
| 状态管理 | 状态机队列→loading→running→calculating→completed |
| 数据库 | database.py 统一初始化 quant_backtests |
| K 线来源 | InstrumentService 统一接口 |
| 策略 | MA Cross 为主，支持多标的组合 |
| 市场执行约束 | A 股 T+1/涨跌停/禁做空，可显式关闭或覆盖涨跌幅 |
| 结果校验 | Bootstrap/Monte Carlo/Walk-forward + 组合风险 X 光 |

**关键意义**：v2 不仅把长计算移到异步状态机，还承担真实市场执行约束与稳健性验证。涨跌停价从板块规则与前收盘推导，ST、上市初期例外需显式传入 `price_limit_ratio`；复权行情可能扭曲历史涨跌停推断，结果会公开该假设。

`strategy-ir/v1` 位于 v2 router 前的纯解析边界：它只把明确的单标的日线 MA crossover 描述映射为有限枚举、有界窗口、逐条件解释和 canonical key。`ma-crossover-draft/v1` 仅把 canonical IR 可逆映射为 symbol、快慢窗口和固定的 close -> next open / long-only 口径；日期、资金、成本、基准和风控不进入 parameters，仍需显式确认。两者均不调用 LLM、不生成代码、不运行或保存回测；Strategy Lab 只有用户点击应用后才更新三个可映射表单字段。

`thesis-validation-experiment/v1` 是 Thesis 到 Strategy Lab 的只读 handoff。API 先用当前用户读取 Thesis，intent 只携带 id/title/规范 ticker、固定 MA crossover 能力和执行口径；均线及所有金融参数保持待确认。URL 只保存 Thesis ID，刷新时重新走 owner-scoped API，不能靠客户端载荷绕过归属检查；创建、恢复和查看均不运行或保存回测。

### 2.8 统一研究报告模式

**实现位置**：`backend/app/services/report_builder.py` + `prompts/research_memo_prompt.py`

基础研究的 4 位并行 Agent 完成后，由 team-lead 读取全部结果并输出结构化评审。所有研究管线最终收敛到同一个 13 章 `schema_version=2` 报告，保留旧顶层字段兼容历史页面与导出。结构化附录包含四维评分、Bull/Bear、六关 Checklist、长短期四维评分、六维稀缺性和五级挑刺结果；证据不足使用 `unknown`/`null`，不得用占位结论冒充事实。

### 2.9 Paper Portfolio 模拟复盘

`portfolio.py` 在独立 Paper 账本之上提供只读复盘草稿：复用 owner-scoped typed hypothesis 与现有行情估值，模拟收益明确标记为 `COMPUTED_RESULT`，并保留公式、价格/FX 来源、时点和 `OK/PARTIAL/UNKNOWN/UPSTREAM_ERROR`。保存动作必须由用户显式选择 outcome、填写理由/观察窗口/幂等键，并复用 `memory_records.review_outcome` 写成 `USER_HYPOTHESIS`；它不修改原 hypothesis、Thesis 或 confidence，且固定 `causal_proof=false`。非 OK 估值只能保存 inconclusive。

### 2.10 单机 scheduler 恢复语义

schema v24 在既有 `scheduled_research_runs`（v23）之上移除三张零读写的遗留组合表（`portfolio_groups`/`portfolio_items`/`portfolio_trades`，见 §3 迁移记录），保留 v23 的稳定 idempotency identity、有限 lease owner/expiry/heartbeat 与 `scheduled_research_run_events` append-only claim、heartbeat、recovery、retry 和终态事件。状态转换与事件在同一 SQLite 事务提交；有效 lease 不重复认领。重启时，已有 completed report 的过期 run 只做终态 reconciliation，不重新生成 report/memory/evidence；未完成 run 标为 failed/`UPSTREAM_ERROR`，保留同一 identity 与 retry lineage 后由本机 scheduler 重试。该设计只覆盖单进程 SQLite 恢复，不承诺分布式 exactly-once 或横向扩展。

AIOS-061 的三次临时 SQLite deterministic fixture 基准均通过预设本地 SLO；最差 lifecycle P95 为 4.6498 ms、20-job batch 为 84.3661 ms、20-run recovery 为 8.2897 ms，重复关键写入为 0，失败/恢复记录完整率为 100%。该结果仅度量 scheduler/数据库 bookkeeping，不包含 LLM、行情、网络、真实多人并发或跨进程恢复，因此未触发 PostgreSQL 或 durable queue 决策门。可复核口径见 `docs/ai/SCHEDULER_SLO_BASELINE.md`。

### 2.11 SQLite 备份、恢复与逻辑一致性

AIOS-064 提供离线维护 runner，以 SQLite backup API 从只读 source 创建不可覆盖的新 backup，再恢复到另一个不可覆盖的新文件。source/backup/restore 都执行物理完整性、外键、schema、logical fingerprint 和 row-count 对比；额外审计 canonical evidence input mirror、scheduled run 的 evidence/memory JSON refs、Thesis review evidence refs 及 run/report 双向链接的悬挂、重复与跨 owner 状态。runner 只报告有限定位和计数，不输出业务正文、不自动修复，也不替换权威数据库。实际切换仍要求停止应用并取得单独的破坏性操作授权；详见 `docs/ai/DATABASE_RECOVERY_RUNBOOK.md`。

### 2.12 私有分享预览边界

`share-preview/v1` 由 Thesis 与 saved completed strategy 的 authenticated owner-scoped GET 动态生成，不持久化。Thesis 只输出 `USER_HYPOTHESIS` allowlist 与 metadata-only canonical evidence；strategy 只输出有限参数、`COMPUTED_RESULT` 指标和 persisted provenance，不含 trades/curves/raw bars。用户文本经过 credential/email/JWT 脱敏及输出后二次扫描；许可、时效、质量和 UNKNOWN 状态原样可见。所有响应固定 private/unpublished、无 URL/token/写入，publication gate 始终 BLOCKED，前端只有关闭/重试动作。公开分享仍由 AIOS-071 的隐私、许可和法律决定阻塞；详见 `docs/ai/PRIVATE_SHARE_PREVIEW_CONTRACT.md`。

## 3. 架构不变量

以下规则是代码中实际存在的隐式约束，以"不存在什么"的方式表达，违反即视为架构破防。

### 数据库层
- **不存在 ORM**：所有数据库操作为原生 SQL，没有 SQLAlchemy 或其他 ORM 层。
- **不存在连接池**：`aiosqlite` 单连接，`get_db()` 断言全局 `_db` 不为 None。
- **不存在 ORM 建模入口**：schema v24 的 49 张逻辑表由 `database.py` 的 `SCHEMA` 与集中迁移步骤创建，仍通过原生 SQL 管理；其中 `memory_fts` 是 FTS5 虚拟表。
- **不存在外部迁移框架**：`_migrate_schema()` 按 `PRAGMA user_version` 顺序执行显式迁移；简单变更使用 `ALTER TABLE`，需要调整唯一约束时重建目标表。

### 服务层
- **不存在独立的 Data Access Layer / Repository**：路由函数直接调用 `database.query_one/query_all/execute`。
- **不存在全域唯一的 ticker 门面**：分析路由的 `resolve_ticker()` 已复用 `MarketDataService.search/normalize_code()`，但 instruments 仍保留面向 provider 的 `external_symbol()` 转换。
- **不存在 WebSocket**：所有实时通信都使用 SSE（sse-starlette），没有 WebSocket 端点。
- **不存在依赖注入容器**：`MarketDataService` 通过 `request.app.state.market` 手动获取，非 DI 框架注入。

### 前端
- **不存在每个服务的独立 API 客户端**：所有前端请求通过单一 `api.ts` 的 axios 实例。
- **邮箱免密认证**：验证码 + HttpOnly Cookie 会话，无密码存储；42 张用户业务表强制 `user_id` 归属，`user_credentials` 也按用户隔离且使用 Fernet 加密。目录/系统表按设计共享。详见 `docs/ai/AUTH_DESIGN.md`。
- **本地模型凭据**：直接输入的模型 Key 使用现有 `user_credentials` 的 `model:{id}`，不新增表或 schema 版本。显式 `MASTER_KEY` 优先；开发模式缺省时在数据库旁保存 `.credential-key` 以支持重启，生产模式仍要求显式主密钥。密钥文件需与数据库一起私下备份。
- **本地单用户模式**：显式设置 `LOCAL_ONLY_MODE=true` 时，development 自动使用单一内部所有者，不创建登录会话、不提供邮箱验证码；production 启动会拒绝该开关。该模式仍保留 `user_id` 归属和凭据加密，只能通过绑定 `127.0.0.1` 的本地 Docker 入口使用。
- **不存在服务端渲染**：纯 CSR，Vite 仅作开发代理和生产构建。

### Agent
- **基础研究只允许单向汇总**：四个基础研究 Agent 独立并行，team-lead 只读取前序结果；Swarm 团队通过 DAG 依赖向下游传递前序上下文，不存在自由互聊。
- **工具调用持久化范围有限**：研究/SSE 运行会把 `tool_call` 事件写入 `research_events`，但尚无独立、可查询的工具审计表。
- **不存在幂等性保障**：多次 POST /api/research 对同一 ticker 会创建多条记录，前端手动去重。

## 4. 数据流图

### 请求生命周期（以个股分析 SSE 为例）

```
用户点击"分析股票"
       │
       ▼
前端 axios POST /api/analysis/stock {ticker: "600519"}
       │
       ▼
Vite 代理 (dev) / Nginx (prod) → FastAPI
       │
       ▼
analysis.router.analyze_stock()
  ├─ resolve_ticker("600519") → "sh600519"
  ├─ MarketDataService.quote("sh600519") → {"name":"贵州茅台", "price":...}
  └─ 返回 EventSourceResponse(event_stream())
       │
       ▼
event_stream() 异步生成器
  ├─ run_research("sh600519", "贵州茅台")
  │    ├─ model_router.get_client(None) → LLMClient(DeepSeek Flash)
  │    ├─ ToolRegistry() → 6 tools
  │    ├─ asyncio.gather(4个 Agent 并行)
  │    │   ├─ Agent 1: system_prompt + "分析 600519"
  │    │   │   → LLM.chat_with_tools_safe() → LLM 选择 get_stock_data
  │    │   │   → GetStockData.run(ticker="sh600519")
  │    │   │   → MarketDataService.quote() → 腾讯API → 返回行情dict
  │    │   │   → LLM 继续 → 输出分析文本
  │    │   ├─ Agent 2: 同 Agent 1，并行执行
  │    │   ├─ Agent 3: ...
  │    │   └─ Agent 4: ...
  │    ├─ SSE yield "agent_started", "tool_call", "agent_completed"
  │    └─ _build_report() → 合并4份分析 → SSE yield "done"
  │
  ├─ _create_report() → INSERT INTO research_reports (status='running')
  ├─ _append_event() → INSERT INTO research_events (每次事件)
  └─ _complete_report() → UPDATE status='completed'
       │
       ▼
前端收到 SSE "done"
  ├─ 展示完整报告
  └─ 用户可 GET /api/research/{id} 重新拉取
```

### 数据写路径（以投资组合为例）

```
用户添加持仓
       │
       ▼
前端 POST /api/portfolio/groups/{id}/positions
       │
       ▼
portfolio.router → portfolio.add_position()
  ├─ ensure_tables() → CREATE TABLE IF NOT EXISTS portfolios / positions
  ├─ database.execute("INSERT INTO positions ...")
  ├─ database.execute("UPDATE portfolios SET updated_at=now() ...")
  └─ 返回新持仓记录
       │
       ▼
用户查看盈亏
       │
       ▼
前端 GET /api/portfolio/groups/{id}/pnl
       │
       ▼
portfolio.router → portfolio.calc_pnl()
  ├─ database.query_all("SELECT * FROM positions WHERE portfolio_id=?")
  ├─ MarketDataService.quotes([所有持仓 ticker])
  │   ├─ 腾讯/Yahoo 批量获取实时价格
  │   └─ 按 ticker 建立 quote 字典
  └─ 逐持仓计算 cost, market_value, pnl, pnl_pct
```

## 5. 参考项目影响地图

| 参考项目 | 已采纳的设计 | 优先级 | 影响路径 |
|---------|-------------|--------|---------|
| **Vibe-Trading** | Agent 工具框架 (BaseTool/ToolRegistry/ToolResult) | 高 | tools.py + tools_definitions.py 直接参考其抽象设计 |
| | function_calling 循环 (chat_with_tools_loop) | 高 | llm_client.py 实现了完整的多轮 tool_use 循环 |
| | 多 Agent 并行编排 | 中 | research_orch.py 4 Agent 并行设计受其启发 |
| | SSE 流式推送 | 高 | 6 条 SSE 管线的事件协议设计 |
| **AI Berkshire** | 角色化 System Prompt 投研 Agent | 中 | PRESET_ROLES 和 RESEARCH_ROLES 的设计思路 |
| | 增强记忆上下文的讨论编排 | 中 | discussion_orch 的前序发言摘要截断策略 |
| **stock-analyzer** | 多市场行情统一接口 | 高 | MarketDataService 的 search/quote/kline/fundamentals 接口设计 |
| | 降级链模式 (Tencent→Sina→Yahoo) | 高 | 三层降级逻辑实现 |
| | ticker 规范化和市场检测 | 高 | detect_market() + normalize_code() 函数 |
| | 解析函数与 I/O 分离 | 高 | parse_tencent_quotes/parse_sina_quotes 独立为纯函数 |
| **BigDataView** | — | — | 无直接代码采纳，其数据可视化参考已由 lightweight-charts 覆盖 |
| **daily_stock_analysis** | — | — | 无直接代码采纳，其每日分析流程已由 research_orch 替代 |
| **wq-alpha-research** | WorldQuant Alpha 因子库集成 | 高 | alpha_service.py 直接采纳了其字段搜索和表达式展示设计 |
| | 相关性计算 | 中 | calc_correlation() 的 Pearson + p-value 实现 |
| | 因子分类体系 | 中 | list_categories() 的类别聚合和示例展示 |

## 6. 组件依赖关系

```
main.py (lifespan + router registration)
  ├── database.py
  │   ├── config.py
  │   └── prompts/roles.py
  ├── routers/
  │   ├── chat.py          → database, model_router, llm_client
  │   ├── discussion.py    → database, discussion_orch
  │   │   └── discussion_orch.py
  │   │       ├── database
  │   │       ├── model_router → llm_client
  │   │       └── market_data
  │   ├── analysis.py      → indicators, scoring, signals, ticker, research_orch
  │   │   ├── research_orch.py
  │   │   │   ├── model_router → llm_client
  │   │   │   ├── agent/tools → ToolRegistry → tools_definitions
  │   │   │   └── prompts/research_roles, research_memo_prompt
  │   │   ├── indicators.py (纯 numpy)
  │   │   ├── scoring.py (纯 numpy)
  │   │   └── signals.py (纯 numpy)
  │   ├── research.py      → database, research_orch, report_export, report_audit
  │   ├── market.py        → market_data, indicators, a_stock_extra（涨跌停池薄包装）
  │   │   └── market_data.py (htttpx: Tencent/Sina/EastMoney/Yahoo)
  │   ├── portfolio.py     → database, market_data
  │   │   └── portfolio.py (service)
  │   │       ├── database
  │   │       └── market_data
  │   ├── backtests.py     → database, instruments (v2, 异步)
  │   │   └── instruments.py → market_data
  │   ├── instruments.py   → database, instruments (service), market_data, a_stock_extra（资金流/龙虎榜薄包装）
  │   ├── screening.py     → market_data, stock_screener (两阶段)
  │   ├── wq.py            → alpha_service, alpha_simulator, alpha_brain
  │   ├── swarm.py         → swarm_orch, research_reports
  │   ├── notifications.py → notifications service
  │   ├── alerts.py        → alerts service, market_data
  │   ├── mcp.py           → mcp_bridge, mcp_runtime
  │   ├── settings.py      → system_settings
  │   ├── dashboard.py     → decision_inbox → database
  │   ├── models_crud.py   → database
  │   └── agents.py        → database
  └── app.state.market = MarketDataService()
```

### 关键依赖链路（按调用深度）

最长调用链为个股分析 SSE 请求，跨越 6 层：

```
Router → ticker.py → MarketDataService → 腾讯API
      → research_orch → model_router → LLMClient → DeepSeek API
                      → ToolRegistry → tools_definitions → MarketDataService → 腾讯/新浪
                                                            → indicators (numpy)
                                                            → financial_rigor
      → database (5次写操作: report + events + message + updates)
      → report_export (md/html/pdf/docx 可选)
```

## 7. 技术债务与改进路线图

### 短期（可单独修复，1-2 天内完成）

1. **收敛剩余 ticker provider 转换**
   - `resolve_ticker()` 已复用 `MarketDataService`；`external_symbol()` 仍承担 instruments provider 格式转换。
   - 方案：明确 canonical ticker 与 provider symbol 的边界，避免路由层新增第四套转换。

2. **维持集中建表的版本化迁移纪律**
   - 49 张逻辑表已集中到 `database.py`；当前目标 schema version 为 24，迁移入口仍是 `_migrate_schema()`。
   - 方案：继续保持单入口，并为不可逆结构变化引入显式 schema version 步骤。

3. **维持 SSE 可观测性纪律**
   - 6 条 SSE 管线均有 `try/finally`，异常管线使用 `logger.exception` 留存服务端堆栈。
   - 新增 SSE 端点必须复用同一错误收尾与清理纪律。

4. **给投资组合持仓添加多市场实时盈亏测试**
   - `portfolio.calc_pnl()` 的 HK/US 成本计价路径无测试覆盖
   - 方案：为 `calc_pnl` 编写单元测试，mock `MarketDataService.quotes()` 返回港股/美股行情。

### 中期（需设计评审，1-2 周）

1. **引入独立的 Data Access Layer**
   - 当前所有路由直接调用 `database.query_one/query_all/execute`
   - 方案：建立 repository 类（如 `ResearchReportRepository`、`PortfolioRepository`），封装查询逻辑，路由通过 repository 访问数据。

2. **工具调用持久化与审计**
   - 当前 `agent_runs` 表只记录 token_usage，工具参数和结果不落库
   - 方案：扩展 `agent_runs` 或新建 `agent_tool_calls` 表，记录每次工具调用的输入/输出/耗时。

3. **维持统一的 API 错误格式**
   - 非 SSE 校验与未处理异常已统一为 `{"detail": "..."}`；SSE 终止事件使用 `error`，并保留 `message` 兼容字段。
   - 新增路由不得绕过全局 handler 泄露内部异常。

4. **研究结果的幂等性去重**
   - 多次 POST /api/research 对同一 ticker 会创建多条记录
   - 方案：短时间窗口（如 5 分钟内）对同一 ticker+model 的请求返回已有进行中的 report_id。

5. **前端 API 层按领域拆分**
   - 当前单一 `api.ts` 实例 + 领域 service 模块
   - 方案：按领域（chat、market、portfolio、research）建立各自的 API 模块，复用统一实例。

### 长期（架构级，需分阶段推进）

1. **数据库迁移框架**
   - 当前 `_migrate_schema()` 的 `PRAGMA table_info` + `ALTER TABLE ADD COLUMN` 方式不可扩展
   - 方案：引入 `alembic` 或自建基于版本号的迁移系统，支持列删除/重命名/类型变更。

2. **认证与授权体系（TASK-021～025 已完成）**
   - 当前使用邮箱验证码 + HttpOnly 服务端会话，所有用户数据按 `user_id` 隔离，个人凭据使用 Fernet 加密。
   - 个人本机运行可使用显式 local-only profile：内部所有者取代登录流程，但不删除生产认证实现或数据归属约束。
   - 后续仅在确有第三方身份联合需求时评估 OAuth；不得用 JWT 或重型认证框架替换现有会话而没有新的架构决策。

3. **WebSocket 替代 SSE（高频率场景）**
   - 当前 SSE 对回测进度推送和实时行情更新不是最优
   - 方案：为 `backtests`（状态机高频更新）和实时行情推送（MarketDataWebSocket）建立 WebSocket 端点。

4. **多数据源统一抽象层**（已部分实现的继续强化）
   - 当前 Yahoo 和腾讯/新浪接口签名不同，`quote()` 内部分支判断市场
   - 方案：定义 `DataProvider` 协议类，每个数据源实现独立 provider，通过策略模式选择。

5. **Agent 间交叉验证与辩论机制**
   - 当前 4 Agent 各自独立，无观点碰撞
   - 方案：研究 agent 第二轮互评机制，或引入辩论 Agent 作为 Review 环节。

6. **端到端测试体系**
   - 后端已执行 `pytest --cov --cov-fail-under=80` 门禁，并覆盖主要 API、SSE 与外部数据源降级路径；前端仍缺浏览器级覆盖率门禁。
   - 方案：补关键页面真实浏览器流程与前端覆盖率度量，持续提高故障路径覆盖。

---

## 8. 已知架构演进建议

> 来源：`docs/ai/GAP_ANALYSIS.md`（2026-08-01，Phase 9 差距清算）。以下变更均为架构级演进需求，开工前必须先更新本文档对应章节，遵循"新增不变量前先更新文档"红线。

### 8.1 依赖环与异步路径整治（高优先，9.0）

- **services↔backtest、database→services 双向软环**：当前服务层存在跨层反向引用，需梳理并消除，保持"编排器 → I/O 服务 → 纯逻辑服务"单向分层。
- **阻塞式同步 HTTP 混入异步路径（9.0 已完成）**：`resolve_ticker()` 已改为注入并复用 `MarketDataService` 异步客户端，降级链测试覆盖腾讯/新浪/Yahoo 顺序与客户端策略。

### 8.2 全局异常与可观测性（高优先，9.0）

- **全局异常处理器（9.0 已完成）**：`RequestValidationError` 返回首条字段级中文错误，兜底 handler 返回脱敏 `detail` 并记录结构化日志。
- **SSE 异常日志与清理（9.0 已完成）**：5 个异常管线已补 `logger.exception`，notifications `/stream` 已恢复 `try/finally`。

### 8.3 后台任务与调度增强（9.4 及以后）

- **后台分析任务队列**：当前 research 为单请求同步 SSE 流式执行，无去重/取消/进度/批量能力。演进为后台队列 + 任务 SSE 事件是架构级变更（不引入 Celery 类重框架，优先 asyncio 任务管理 + 状态机，参照 backtests v2 的模式）。
- **可配置 cron 调度（9.4 已完成）**：保留原每日盘后循环，同时新增无依赖 5 字段 cron、SQLite job store、单任务防重入和状态/立即执行 API；仍为单进程调度，不承诺跨进程锁。

### 8.4 数据源韧性架构（9.2）

- **数据源熔断与优先级配置（9.2 已完成）**：`market_data` 已用 closed/open/half-open CircuitBreaker 管理逐源可用性；行情/K 线优先级经 `/api/market/sources` 校验并持久化。`quote_enriched()` 仅补空字段，`prefetch_quotes()` 有界并发并保留逐标的错误，不改变"多源 + 降级"方向。
- **市场级证据边界（9.2 已完成）**：A 股涨跌统计按 provider `total` 分页取全，板块/人气/涨停池保留来源；港/美 breadth 未安装可靠全集时返回 `unsupported`，不以指数样本冒充全市场。

### 8.5 推送与消息通道（9.2）

- **外部推送渠道（9.2 已完成）**：盘后复盘始终写站内通知，可选企微、飞书、邮件三个 Sender。外发默认关闭，只有 `EXTERNAL_SENDERS_ENABLED=true` 且环境密钥完整时才执行；单渠道失败隔离并记日志，API 不暴露密钥。此实现不改"无 WebSocket"不变量。

### 8.6 对话工具调用（9.4 已完成）

- **chat 路由接线 function calling**：chat 已复用 `LLMClient.chat_with_tools_loop` 与 ToolRegistry，SSE 公开 `tool_call` 后再返回最终文本；工具循环有轮数上限，不新增框架。

### 8.7 数据与交易工具边界（9.4 已完成）

- **多源新闻与基本面**：新闻支持六源统一结构和显式聚合；A 股财务在可选 AkShare/Tushare 间降级，最后回到 Yahoo，缺包/权限不伪装成零值。
- **研究型交易工具**：回测、组合风险、影子成交分析均复用纯逻辑服务；实盘连接器工具只返回设计评估，保证 `network_calls=false`、`order_submission=not_implemented`。
- **实盘 No-Go**：当前邮箱登录只解决应用身份与数据隔离，不构成交易授权或资金风控。独立项目仍必须先满足 `docs/ai/TRADING_CONNECTOR_ASSESSMENT.md` 的身份、风控、幂等、确认、审计和合规阶段门。

### 8.8 投研证据与 LLM 用量闭环

- **13 章基本面证据（TASK-014）**：Swarm 在 DAG 启动时通过统一 `InstrumentService.fundamentals()` 单次拉取，向各 Agent 注入原始字段，并由报告构建器确定性填充财务概览、盈利、成长、偿债和现金流章节。每条事实保留 provider/as-of/period；无法取得的章节继续使用 `unknown`。Yahoo 只从同口径原始字段派生毛利率、净利率与资产负债率，并公开组成字段。
- **LLM 用量持久化（TASK-015）**：Chat Completions 的每个真实上游请求写一条 `llm_usage`，工具循环不追加汇总行以避免重复计数；ContextVar 为 chat/research/swarm/discussion 传播场景与业务 ID。写入异步 best-effort，应用退出前 drain；`GET /api/usage` 提供有界 UTC 日聚合。该表不承担计费账单或用户授权语义。

### 8.8 回测执行与验证（9.3 已完成）

- **A 股执行约束**：仅 v2 单标的与组合回测，统一复用纯逻辑规则，模拟 T+1、涨跌停拒单与禁做空；v1 入口及引擎已回收。
- **统计稳健性**：单标的结果附带固定种子的移动块 Bootstrap、经验收益 Monte Carlo 与按时间扩展的固定参数 Walk-forward，避免把随机验证结果误认为确定事实。
- **组合风险 X 光**：组合结果给出 HHI 集中度、最大/当前回撤、历史 VaR/ES 与分散化收益；样本不足或混合频率时返回明确的 `status`，不伪造数值。
- **长周期指标**：研究行情统一输出 MA120、MA250 与 VolMA10；前端价格图展示 MA120/MA250。

### 8.9 前端结构演进

- **共享 SSE reader（9.0 已完成）**：`frontend/src/services/sse.ts` 统一处理分片、CRLF、心跳、尾帧与取消清理，页面不再保有内联读取循环。
- **大屏独立路由**：Dashboard 大屏区块从后台布局中拆为独立全屏路由，属前端路由结构调整。
- **登录页（已决策）**：@Satanchen 已决策引入邮箱免密认证（2026-08-01）。「不存在认证/授权」不变量已移除，改为「邮箱免密认证 + 数据完全隔离」。本文档第 3 节与 CLAUDE.md 已同步更新，设计见 `docs/ai/AUTH_DESIGN.md`。
