# RAW C-ARCH audit findings (extracted from subagent transcript)


--- finding 1 ---
我是 SUBAGENT C — ARCHITECTURE_DX_AUDITOR。任务是只读审计 FinQuant Hub 的架构与开发者体验，然后写报告文件 `docs/ai/evo/ARCHITECTURE_REPORT.md`。

让我先做一些并行读取：
- `docs/ai/evo/PROJECT_BRIEF.md`（必须读）
- `docs/ARCHITECTURE.md`
- `docs/TECH_STACK.md`
- `docs/API_CONTRACT.md`
- `docs/ROUTER_MAP.md`
- `backend/app/main.py`
- `backend/app/database.py`
- `backend/app/services/` 目录
- `frontend/src/services/api.ts`
- `frontend/src/store/`

我应该先用 todo 列表规划，然后并行读取文件。让我开始。



--- finding 2 ---
我已经读了 PROJECT_BRIEF.md 和 ARCHITECTURE.md。现在继续读 TECH_STACK.md、API_CONTRACT.md、ROUTER_MAP.md、backend/app/main.py、backend/app/database.py。让我并行读取。继续读取核心文档与后端入口。

--- finding 3 ---
继续读取 database.py、API_CONTRACT.md、config.py，然后看 services 目录结构和前端。database.py 可能很大，先看看行数。



--- finding 4 ---
我已经收集了核心信息。注意 database.py 很大（1172+ 行被截断），说明集中建表在 database.py 中。让我继续读 database.py 的其余部分，同时看看 services 目录结构、前端 api.ts、store 目录。

让我列出 services 目录和前端 src 结构。



--- finding 5 ---
好，我看到 services 目录有 58 个文件。让我看看 database.py 的其余部分（1973-2358 行）、前端 api.ts、config 相关的，还有 market_data.py（数据源适配器，这是"加供应商"的路径）、llm_client.py、model_router.py（这是"加模型供应商"的路径）。



--- finding 6 ---
现在我已经掌握了后端数据层架构。关键发现：
1. `database.py` 2358 行，集中管理全部 schema + 迁移 + 查询辅助——超级大文件（上帝模块）。
2. `_ensure_column` 用 `ALTER TABLE ADD COLUMN`，不支持列删除/重命名/类型变更（已在文档确认）。
3. 迁移函数大量重复模式（SAVEPOINT try/except 各 26 个版本——重复代码）。实际上可以看到每个版本都是重复的样板代码 `if version < _XXX: await _db.execute("SAVEPOINT ...") try: ... except: ROLLBACK...`。这是明显的重复实现。
4. `_OWNER_TABLES` 42+ 张表，手工维护列表，新表必须记得加入——扩展成本高。
5. `claim_unowned_data` 循环表手工 SQL。
6. 备份函数 13 个几乎一模一样的函数 —— 明显重复。

现在我需要看：
- `market_data.py`（数据源适配器——"加供应商"路径）
- `model_router.py` + `llm_client.py` + `models_crud.py`（"加模型供应商"路径）
- 前端 store（状态管理）
- API_CONTRACT.md（API 契约）
- routers 目录列表

让我并行读取。market_data.py 可能较大，先读一部分。



--- finding 7 ---
模型供应商管理看起来已经相当完整（CRUD + discover + test + set-default + 凭据加密）。这是"加模型供应商"的路径——已经做得不错。

现在需要检查：
1. `llm_client.py` —— LLM 客户端
2. `market_data.py` —— 数据源适配器（"加数据源"路径）—— 这是重点
3. 前端 store
4. API_CONTRACT.md 的部分
5. routers 目录

market_data.py 是关键。让我看它的结构和行数。

--- finding 8 ---
好。现在让我读 market_data.py 的重点（它是"加数据源"路径的核心，912 行）和 llm_client.py（331 行）。还要看看 routers 目录有啥。让我并行读取 market_data.py 的前 250 行和 llm_client.py 全、routers 列表。

--- finding 9 ---
我已经掌握了 LLM 供应商路径的关键。market_data.py 是 1011 行（实际行数 1011，之前 Measure-Object 说 912，可能因为不同的行计算方式——不重要）。

现在我需要再看几个东西：
1. market_data.py 其余部分（quote/kline 的组织方式）——看降级链如何硬编码
2. API_CONTRACT.md 快速浏览
3. routers 目录列表
4. 前端 src 结构（pages/components/services/store）
5. agent/tools 目录——"加工具"路径
6. docs/ai/ 目录里是否有 EXEC_PLAN 等

让我并行读取。

--- finding 10 ---
我看到了 market_data.py 的降级链——quote/kline 有 `_quote_from` / `_kline_sina` 等每个 provider 一个方法，用 if/elif 分支。这就是"加数据源"的高成本点：每加一个数据源，需要在 `_quote_from`、`_kline_*`、`search`、检测逻辑、优先级配置（configure_source_priority 的 expected set！）等 5-6 处修改。

而且 `configure_source_priority` 明确硬编码了 `{"tencent","sina","yahoo"}` 集合且要求 `len(providers) != 3`——新的数据源加进来需要动这个校验。

再看一下 agent/tools.py 的注册机制（"加工具"路径）、API_CONTRACT.md 开头、前端结构。还有 frontend/src/services 目录、前端页面数。然后看 docs/ai/ 有没有 EXEC_PLAN 显示正在进行的需求。

让我并行读取剩下的。

--- finding 11 ---
我注意到一个关键发现：`tools_definitions.py` 里 GetStockData.run() 每次调用都创建一个新的 `MarketDataService()` 实例并 `aclose()`（第 53-59 行）——这是效率/一致性问题：Agent 工具每调用一次就创建新的 httpx 客户端（连接建立开销），而且不用 app.state.market 的单例（绕过熔断状态？实际上 CircuitBreaker 是 MarketDataService 实例内的 `breakers` dict——新实例没有共享熔断状态！）。这值得注意：Agent 工具使用独立 MarketDataService 实例意味着 CircuitBreaker 状态在该实例内丢失，源健康状态无法跨 Agent 工具调用共享。让我验证一下：`self.breakers: dict[str, CircuitBreaker] = field(default_factory=dict)`——是的，每个实例有自己独立的 breakers。而 main.py 的 `app.state.market` 是唯一持久实例。工具每次新建实例 → 熔断器状态丢失（每个调用都是冷启动）。

等等——`_CTX` 等……让我确认工具是否真的每次 new。tools_definitions.py 第 53-59 行确实 `service = MarketDataService()`。

不过 CircuitBreaker 具体实现要看 source_health.py。让我快速验证。

还要看：
- tools.py（ToolRegistry）
- 新的需求是什么？EXEC_PLAN.md 应该说明当前需求。让我看看 docs/ai/EXEC_PLAN.md 和 HANDOFF.md 来了解"当前新增需求"。
- 前端 src 目录结构总体、store 数量。
- market_data.py 剩余部分（671-1011）。

让我并行读取这些。

--- finding 12 ---
很好，我掌握了大量信息。现在让我看看几个剩余的关键点：

1. `market_data.py` 剩余部分（671-1011）—— 特别是 fundamentals、news_search 的组织
2. 前端 src 整体结构（components 数量）
3. docs/ 目录有哪些文档（了解文档体系）

关于 EXEC_PLAN：最近的需求是"供应商管理（BACKLOG-043）""计价模块（044）""用量统计详情（045）""Alpha 模拟绩效（048）"——这些是"新增需求"的实例。重点是判断哪个扩展路径最贵。

关键分析点已经浮现：
1. **加数据源（市场数据 provider）** —— market_data.py 1011 行单文件，`_quote_from`/`_kline_*`/搜索/检测/优先级校验（configure_source_priority 硬编码集合长度=3）都要改，是最贵的路径。
2. **加模型供应商** —— 已通过通用 OpenAI 协议 + model_configs CRUD + 凭据加密 + discover/test 完整支持，成本低。但注意 `model_configs.provider` 字段现在没被实际使用（LLMClient 只认 OpenAI 协议）——非 OpenAI 协议的供应商（如 Anthropic、Gemini 原生 API）无法接入，这是扩展边界。让我确认 provider 字段是否被使用。
3. **加表/加 schema 版本** —— database.py 2358 行单文件、每个新版本 3 处改动（_XXX_VERSION 常量、_MIGRATION_NAMES、_migrate_schema if 块 + 可能备份函数）、`_OWNER_TABLES` 手工列表、owner guards 手工触发。这是高摩擦路径，但有 SAVEPOINT 纪律。
4. **加工具** —— BaseTool 抽象 + ToolRegistry 单例，好设计，但 GetStockData.run() 每次 new MarketDataService() —— 熔断状态不共享 + 每次新建 httpx 客户端。
5. **加语言** —— i18n parity 0（2453 keys 中文），应该已经不错。

让我快速验证几个点：
- market_data.py 671-1011（fundamentals、news）
- tools.py（ToolRegistry）
- 前端 components 数量
- docs/ 目录

还有 provider 字段使用情况，用 grep。

--- finding 13 ---
确认了：`model_configs.provider` 字段只用于凭据存储的 provider 元数据（models_crud.py:101），LLMClient 完全不使用 provider 字段——它只支持 OpenAI 协议。所以"加供应商"实际是"加一个 OpenAI 兼容 endpoint"，非 OpenAI 协议的供应商（Anthropic/Gemini 原生）无法接入。这是"加模型供应商"路径的边界，但作为本地个人工具，目前这个抽象是可接受的（文档已声明）。

现在我还需要看：
1. tools.py（ToolRegistry 实现）— 已大体知晓（docs 都有）
2. 前端 components/features 数量、i18n 结构
3. docs/ 目录文件清单（了解文档体系）
4. 前端市场数据展示如何调用（不用了，够了）

我认为核心证据已经足够。让我快速再看几个关键点来补充：
- `research_orch.py` 的结构（编排器，4-agent）
- 前端 `frontend/src` 的总体布局（多个 features 目录？）
- 看是否有测试/CI 文档

再快速确认 GetStockData 每次 new MarketDataService 的问题在 tools_definitions 中是否普遍存在（其他工具是否也这样）。用 grep 数一下 MarketDataService() 出现次数。



--- finding 14 ---
重要发现确认：存在 **8 处 `MarketDataService()` 实例化**——main.py 一份是权威单例，但 tools_definitions.py 有 4 处（每次工具调用创建新实例 + 新 httpx 客户端 + 独立的 CircuitBreaker 状态），discussion_orch 和 swarm_orch、portfolio 也各自创建。这暴露了"MarketDataService 单例注入"的不变量其实没有真正落实——只有路由层部分使用 `request.app.state.market`，编排器和 Agent 工具各自 new。

关键影响：
1. **CircuitBreaker 熔断状态不共享**：工具/编排器每次创建新实例 → `breakers` dict 是实例字段 → 熔断状态丢失，每次调用都是冷状态。源健康状态（`/api/market/sources` 展示的）来自 main.py 单例，但工具调用路径用的是全新实例——健康状态与实际路径脱节。
2. **httpx 客户端反复新建**：每次工具调用建 2 个 httpx.AsyncClient（A 股直连 + Yahoo 代理），用完 aclose——连接复用为零，TLS 握手开销每次都有。预言：chat 工具的 GetStockData 每次调用都重建。
3. **与"无 DI 容器，MarketDataService 通过 request.app.state.market 手动注入"不变量**：文档说不变量存在，但实际只有部分遵守。

这是 P1/P2 级问题（一致性 + 效率 + 可观测性）。属于"已知技术债 vs 新发现"——文档里有 "No DI container — MarketDataService injected via request.app.state.market (manual)"，但没写明编排器/工具绕过了单例。

现在让我最后看一下：
1. tools.py（ToolRegistry）的注册方式——决定"加工具"成本
2. research_orch.py 概览（编排器结构）
3. 前端目录整体（components 数量）

然后写报告。让我快速读 tools.py 和 research_orch.py 的头部。

--- finding 15 ---
我已经有了充分的证据。让我检查一个细节：发现 research_orch 用 ThreadPoolExecutor 在线程里执行异步工具（`asyncio.run(tool.run())`）——这是一个架构上的复杂点：异步工具被塞进线程再跑新事件循环，是为了避免阻塞主循环。这本身属于已知处理（Astra A5）。

还有一点：`_TOOL_EXECUTOR = ThreadPoolExecutor(max_workers=4)` 是模块级单例，app 关闭时不 shutdown——轻微资源泄漏（线程池不回收），不过进程退出就没了。低优先级。

现在信息足够了。让我整理一下逐条问题清单，确保每条有文件:行证据：

### 架构现状速览
- 分层清晰：路由→服务（编排器→I/O→纯逻辑）→数据层；前端单 axios 实例 + zustand 4 store + features 纯函数模块。
- 23 个 APIRouter / 140+ 路径 / schema v26 / 50 表 / 909 后端测试 / 92.67% 覆盖。

### 发现的问题

**P0（阻碍核心使用/数据风险）**
1. 无。审计没有发现 P0 级数据风险问题——迁移有 SAVEPOINT + 备份前缀。但等等，让我想想：是否有数据风险？
   - `_migrate_schema()` 中 26 个版本手写迁移，`_ensure_column` 只加列。虽然备份函数在前面兜底，但备份只针对"已有数据库 + version 低于某版本"的情况，`executescript(SCHEMA)` 总是先跑（CREATE TABLE IF NOT EXISTS，幂等）。风险中等。
   - `claim_unowned_data` 把所有无主数据给第一个 admin——单用户场景没问题。
   - 我认为没有 P0。诚实地说：没有数据风险级问题。

**P1（破坏核心体验）**
2. **MarketDataService 单例不变量实际被绕过**：8 处 `MarketDataService()` 实例化（main.py:82 权威；tools_definitions.py:55,143,239,509；discussion_orch.py:32；portfolio.py:744；swarm_orch.py:139）。每次工具调用/编排器创建新实例 → 新建 httpx 客户端（信任 env 配置在 __post_init__ 重建）+ CircuitBreaker 状态（实例级 breakers dict，market_data.py:209）完全丢失 → 熔断实际只在路由层生效；`/api/market/sources` 的源健康状态（来自 main.py 单例的 breakers）与 LLM 工具实际调用路径（全新 breakers）脱节。影响：一致性与可观测性断裂、工具路径每次冷连接。建议：工具/编排器注入 request.app.state.market 或全局 service locator；至少把 CircuitBreaker 提升到模块级共享。

实际上这个是 P1 还是 P2？它不"破坏核心体验"本身（功能照常工作，只是熔断失效 + 连接开销），但"源健康/熔断"是核心可靠性机制的一部分，失效意味着降级链的熔断保护在 Agent 路径下形同虚设。我认为 P1 合理（核心体验=可靠性行为不一致）。或者 P2。我标 P1，理由：熔断被文档宣传为核心韧性机制，但一半调用路径绕过了它，是行为一致性破坏。

3. **database.py 2358 行单一文件**：SCHEMA + 26 个迁移 + 42 表 owner guards + 备份函数 + 查询助手全在一个文件。新加表/新版本要改多处（常量、_MIGRATION_NAMES、_migrate_schema 的 if 块、_OWNER_TABLES、备份函数），且 `_migrate_schema` 26 个几乎相同的 SAVEPOINT 样板（database.py:380-716）——重复实现。加列只支持 ADD COLUMN（_ensure_column，database.py:2252），不支持改类型/删列/重命名（需要重建表，如 v10 的 _rebuild_research_workspaces_for_owner_unique database.py:2044 手写全套）。扩展成本：每次 schema 变更都触碰核心文件，回归面大（v26 已触发 BACKLOG-042b 测试回归）。P1（阻碍演进的核心维护成本），代码里注释说"集中建表的版本化迁移纪律"是已知债务，但实际代价是：任何表变更都要改 2358 行文件 + 全量测试回归风险。

实际上这个更像 P2？"显著提升成熟度"。加列是支持的；加表版本迁移是机械的。但 2358 行单文件 + 每个迁移的重复样板确实是维护成本问题。考虑到它是主要扩展路径（加指标/加表），标 P1 或 P2。我标 P1：schema 是系统的地基，任何新需求的落点都经过它；手写迁移 + 无框架 + 单文件，每次 schema 变更全量回归的风险已经在 BACKLOG-042b 发生过（5 项测试回归）。这算"阻碍演进"的技术债。

**P2（显著提升成熟度）**
4. **市场数据源抽象是硬编码 if/elif 链，无 provider 协议**："加数据源"需改 6+ 处：`_quote_from` 分支（market_data.py:422-431）、`_kline` 分支（market_data.py:621-629）、search 双源硬编码（market_data.py:274-394）、`configure_source_priority` 的 expected 集合硬编码 `len(providers) != 3`（market_data.py:243-255，新源加入必须改这个校验）、fundamentals 的 adapters dict（market_data.py:753-756）、break provider 枚举。quote_enriched、prefetch 也依赖优先级元组。建议：定义 DataProvider 协议 + 注册表（文档长期路线图 4 已列，未做）。P2。

5. **Agent 工具的行数据客户端重复实例化 + 工具在 ThreadPoolExecutor 线程里 asyncio.run**：research_orch._TOOL_EXECUTOR（research_orch.py:22）+ _run_tool_in_thread（research_orch.py:26-41）。异步工具被塞线程重开事件循环，是为了不阻塞主循环 + 恢复 ContextVar；但这是性能与复杂度代价，且工具内 MarketDataService() 每次新建 httpx 客户端（TLS 握手）。建议：要么全局单例 + 直接 await（工具本来就是异步方法，dispatch 也是 async —— 为什么还要线程？可能因为 tool.run 内部用同步库如 akshare？CheckBuffettRules/CalculateByFinancialRigor 用 Decimal 纯计算。akshare 是同步库，fundamentals 用的。所以线程可能是为了容纳同步工具）。这个属于已知设计（Astra A5），但"每工具调用重建 httpx 客户端 + 熔断丢失"是新发现。合并进问题 2 或单列。我单列一个 P2：扩展工具成本的纠纷点。

其实问题 2 和 5 可以合并叙述为"MarketDataService 实例化纪律涣散 + 工具执行线程模型"，但我分开写更好。

6. **无独立工具审计表**：文档自认（ARCHITECTURE.md:268-269 "尚无独立、可查询的工具审计表"）+ 无幂等（269）。已知债务，中期路线图已列。P3（高级）或 P2？"工具调用持久化与审计"是中期 2。P2。

7. **前端领域 service 模块 15 个，全 import 同一个 api.ts 实例** —— 一致性 OK，但 API 契约重复手写类型？（frontend/src/services/*.ts 15 个文件都在各自定义接口类型）。看 types 目录？API 类型无 OpenAPI 生成（openapi_tsgen 只在 BACKLOG-042 提到同步）。前端类型和后端 Pydantic 模型手工同步 —— 高摩擦：每加一个端点要手动写前端类型 + 契约文档 + 验证。P2（一致性/维护成本）。

8. **i18n 2453 key 手工维护 + parity 校验** —— 做到 parity 0 很好，但是否有 key 重复/拼写？这不是问题，做得好。

9. **report_export 的 md/html/pdf/docx** —— 可能引入依赖？不深究。

10. **db 单连接 + WAL + 无池**：并发写串行，backtests v2 异步任务 + scheduler + SSE 全走一个连接。exclusive_transaction 已解决部分提交问题（Astra A2 P1）。这属于不变量，不是债。但 scheduler 长任务期间其他请求 execute 会阻塞吗？在事务内 execute 不 commit；但 SQLite 单连接所有语句串行执行是 aiosqlite 的默认（同连接），写期间读会被阻塞（WAL 模式下读写可并行吗？WAL 允许读者与作者并行，但同一连接只有一个语句执行——aiosqlite 默认单连接串行，所有查询排队）。单连接意味着任何慢查询阻塞所有请求？aiosqlite 的连接上并发 execute 会排队执行（lock 级别），不是 CPU 阻塞但会延迟。已知不变量，不列。

11. **backtest/engine.py v1 已回收但 backtest_runs 表保留**（ARCHITECTURE.md:199）：零读子孙表保留 —— 轻微死重。P4。

12. **`_OWNER_TABLES` 手工清单 42+ 表**（database.py:278-294）：新表忘记加 → 无 owner 守卫（INSERT 无 user_id 会成功，因为没有 trigger）。这是数据隔离风险！例如 model_pricing 表加入了 _OWNER_TABLES 吗？看 database.py:278-294 —— 有 "model_pricing"（最后一行）。好。但这是手工纪律：任何新 owner 表的迁移必须手工记得两处（_OWNER_TABLES + 迁移函数内 _install_required_owner_guards 调用）。漏一处 → 隔离漏洞。P2（数据隔离靠手工纪律维持，无自动机制）。

13. **文档漂移**：API_CONTRACT 说 472 行/134 端点旧统计（PROJECT_BRIEF 说 140 路径 176 操作），TECH_STACK 说 schema v24 49 表，实际 v26 50 表（database.py:_SCHEMA_VERSION=26）；ARCHITECTURE.md 头部说"22 个 APIRouter"但 ROUTER_MAP 说 23。文档版本滞后（TECH_STACK.md:49 "schema v24，49 张逻辑表" vs database.py:276 v26）。P3（文档一致性，DX）。

14. **config.py 环境变量仅 62 行但 .env 无 schema 文档**？不深究。

15. **config provider 字段未落地**：models_crud.py:101 存 provider 到凭据元数据，但 LLMClient 只支持 OpenAI 协议（llm_client.py:1-4 文档明确）。新增非 OpenAI 供应商（Anthropic/Gemini）需要改 LLMClient 或加转换层。用户新增供应商当前只能加 OpenAI 兼容的。这是"加模型供应商"路径的真实边界——在 UI 上用户可在 provider 下拉选任意预设（含 nur 非 OpenAI？预设 15 条都是 OpenAI 兼容格式）。诚信评估：对个人用途足够，但扩展成本=新增协议适配器。P3。

16. **`external_symbol()` 与 `normalize_code()` 双 ticker 转换**：文档已知（ARCHITECTURE.md:255,433 external_symbol 仍保留）。P3 已知。

17. **`scheduler_loop` 单进程 asyncio 轮询 + lease**：v23 已处理恢复语义。ok。

18. **news_search 六源**：NewsSearchService 统一结构。做得好。

19. **前端 store 只有 4 个，页面状态多处用 localStorage**（modelStore.ts:21）：researchMode 存 localStorage，页面内 state 散落。状态管理轻量但分散——对不同 store 未过度设计，可接受。P4。

20. **`GET /api/health` 用 PRAGMA journal_mode 探测 DB**（main.py:146）——ok。

21. **`tool_call` 事件进 research_events 但 agent_runs 只记 token**（已知）。

22. **无 CI**（AGENTS.md "No CI exists"）：本地门禁靠手工跑四条命令。P2（DX/可靠性）。

23. **单元测试 909 个但"前端仍缺浏览器级覆盖率门禁"**（已知长期 6）。P3。

24. **大盘文件问题**：market_data.py 1011 行、database.py 2358 行、tools_definitions.py 740 行、thesis.py? —— 单体类.

现在我需要确定"系统级洞察：哪个新增需求路径最贵"。

候选路径：
1. **加模型供应商**：已被模型管理模块很好覆盖（CRUD+discover+test+凭据+预设库 15 条）。成本：低（UI + CRUD 已通用）。边界：非 OpenAI 协议供应商需要 LLMClient 协议适配。成本低-中。
2. **加数据源（市场行情 provider）**：最高成本。需要动 market_data.py 的 6+ 处（_quote_from、_kline 分支、search、configure_source_priority 的硬编码集合与 len==3 校验、fundamentals adapters、breakers 枚举）+ 解析函数 + 测试 + DATA_SOURCES.md 契约。而且 configure_source_priority 硬编码集合意味着"加源"不是增量而是改校验逻辑。这是系统级最贵路径。
3. **加数据库表/字段**：database.py 单文件 + 26 迁移样板 + _OWNER_TABLES 手工清单 + owner guards + 备份函数样板 + 契约文档 + 前端类型。成本：中-高（机械但摩擦大，回归面全量测试）。
4. **加 Agent 工具**：BaseTool 子类 + __subclasses__ 自动发现（tools.py:111-114）——加工具成本低！但工具内部如果碰服务，会踩 MarketDataService 实例化问题。加工具=低摩擦，除非碰 I/O。
5. **加指标（技术指标）**：indicators.py 纯函数 + 前端调用。低。
6. **加语言**：i18n 2453 key parity 0 机制成熟，+key 流程已有。低-中（每个页面 +2 key zh/en）。

结论：**最贵路径=加市场数据源（新 provider）**，因为数据源抽象没有协议化，硬编码分支 + 优先级校验硬编码集合 + 熔断枚举 + 双客户端策略，全部耦合在一个 1011 行文件里；而且是"降级链/熔断"核心可靠性机制的一部分，动它风险最大。次贵=加表（database.py 单文件版迁移）。

再补充一个 P1 候选：**单 axios 30 秒超时**（api.ts:8 timeout 30000），研究报告生成/多 agent 讨论是长 SSE 流——SSE 用 EventSource 还是 axios？SSE 读取器在 sse.ts。SSE 不受 timeout 影响（EventSource/ReadableStream 无 axios timeout）？如果 SSE 走 fetch/EventSource 则不受此 timeout 限制。浏览下 sse.ts 确认——但大概率用 fetch。那个 timeout 只影响普通 JSON 请求。POST /api/research 返回 SSE——如果前端用 axios 发 POST 然后读流，30 秒超时可能切断长研究！让我快速 grep sse.ts 确认。

好，快速看一眼 sse.ts 的传输方式。这可能是 P1：长研究 >30s 被 axios timeout 掐断。



--- finding 16 ---
SSE 用 `ReadableStream`（fetch API），不走 axios timeout。好。但需要确认发起 POST SSE 的请求用 fetch 而不是 axios。researchApi.ts 大概率用 fetch。不深究了——sse.ts 接受 ReadableStream，说明调用方用 fetch。SSE 端点不受 30s timeout 影响。这条不列。

现在我对所有问题都有证据了。最后再快速确认一两个点：
1. `configure_source_priority` 硬编码 `len(providers) != 3`（market_data.py:252）——"加数据源必须改校验"确认。
2. `tools_definitions.py` 我有 0-60 行 + grep 行号 55/143/239/509。
3. `_OWNER_TABLES` 在 database.py:278-294，模型定价在最后。
4. 文档漂移的证据：
   - TECH_STACK.md:49 "schema v24，49 张逻辑表"
   - database.py:277 `_SCHEMA_VERSION = _MODEL_PRICING_VERSION`（v26）
   - ARCHITECTURE.md:18 "22 个 APIRouter" vs ROUTER_MAP.md:1 "23 APIRouter"
   - PROJECT_BRIEF.md:25 说 schema v26、140 路径——最新的对。
   - API_CONTRACT.md 首行没写端点统计？grep 一下 "134"。

先做一次精确 grep 验证文档数字。然后写报告。

还要确认后端测试数和 frontend 结构。已经有 PROJECT_BRIEF 的数字：909 测试 / 92.67% 覆盖；前端 134 文件 / 470 Vitest；i18n 2453 parity 0。EXEC_PLAN 里 BACKLOG-045 证据说 "backend 909 passed / 0 failed，覆盖率 92.67%"。

关于 docs/ai/ 下是否有 HANDOFF 让我看一下当前是否有进行中的需求（PROJECT_BRIEF 说 EXEC_PLAN 无 [READY] 待办）。EXEC_PLAN.md 顶部显示 DONE 卡片。所以"当前新增需求"指最近的 BACKLOG-043~048 这类（供应商管理、计价、用量、Alpha 绩效）——这些正是审计的参照系："加供应商"是用户问得最多的。

好，够证据了。做两个快速验证后写报告。

--- finding 17 ---
父 agent 要求我立即收尾。我已经有充分证据了。让我快速写报告文件 `docs/ai/evo/ARCHITECTURE_REPORT.md`。

我已经收集的证据：
1. PROJECT_BRIEF.md — 产品定位、已知约束
2. ARCHITECTURE.md — 分层、不变量、技术债
3. TECH_STACK.md — schema v24 49 表（过时，实际 v26 50 表）
4. ROUTER_MAP.md — 23 APIRouter / 140 路径 / 176 操作
5. API_CONTRACT.md — 契约格式、SSE 协议
6. main.py — 23 业务路由循环注册 + lifespan + 异常处理
7. database.py — 2358 行，SCHEMA + 26 个手写迁移 + _OWNER_TABLES + owner guards + 备份函数 + 查询助手
8. config.py — 62 行 env 配置
9. market_data.py — 1011 行，硬编码 if/elif provider 分派、configure_source_priority 硬编码 len==3、CircuitBreaker 实例级
10. llm_client.py — OpenAI 协议抽象，369 行
11. model_router.py — 50 行（模型解析）
12. models_crud.py — 149 行（CRUD + discover + test + set-default）
13. source_health.py — 60 行 CircuitBreaker
14. tools.py — 174 行 BaseTool + ToolRegistry（__subclasses__ 自动发现）
15. tools_definitions.py — 740 行，4 处 MarketDataService() 实例化（L55/143/239/509）
16. research_orch.py — ThreadPoolExecutor + _run_tool_in_thread (asyncio.run 在线程)
17. api.ts — 24 行单 axios 实例（30s 超时）
18. sse.ts — 75 行 ReadableStream SSE 解析
19. store 4 个 zustand：chatStore/discussionStore/authStore/modelStore
20. features 14 个纯函数模块
21. services 前端 15 个领域 API 模块
22. EXEC_PLAN.md — 最近需求（BACKLOG-043 供应商管理、044 计价、045 用量统计、048 Alpha 绩效）
23. provider 字段 grep — 只用于凭据元数据，LLM 协议只有 OpenAI 兼容

关键问题清单（最终确认）：

1. **P1 — MarketDataService 单例不变量被广泛绕过（8 处实例化）**：main.py:82 权威单例 vs tools_definitions.py:55/143/239/509、discussion_orch.py:32、portfolio.py:744、swarm_orch.py:139。影响：CircuitBreaker 是实例级字段（market_data.py:209 `breakers: dict = field(default_factory=dict)`），每次 new 实例 → 熔断状态从零开始 → Agent 工具路径的熔断保护失效；同时每次新建 1-2 个 httpx.AsyncClient（__post_init__ market_data.py:212-224）→ TLS 握手/连接复用为零；`/api/market/sources` 展示的健康状态（来自 main.py 单例）与实际数据路径脱节 → 可观测性失真。文档声称"MarketDataService 通过 request.app.state.market 手动注入"（ARCHITECTURE.md:257）实际只覆盖路由层。建议：工具接收注入实例/全局 registry；CircuitBreaker 提升为模块级共享（source_health 或 services 层）。

2. **P1 — database.py 2358 行上帝模块 + 26 版重复迁移样板**：_migrate_schema() database.py:373-720 里每个版本都是相同的 SAVEPOINT try/except 样板；加新表/版本要改 5 处（_XXX_VERSION 常量 251-277、_MIGRATION_NAMES 295-322、_migrate_schema if 块、_OWNER_TABLES 278-294、必要时备份函数 1854+）；_ensure_column 只支持 ADD COLUMN（database.py:2252-2255）；列删除/重命名必须手写整表重建（v10 案例 database.py:2044-2074）。影响：任何 schema 变更都触碰地基文件、回归面=全量测试；BACKLOG-042b 已证明迁移改动引发 5 项测试回归（EXEC_PLAN 提到）。建议：拆分为 schema 目录 + 迁移注册表；或至少提取迁移样板函数。

3. **P1/P2 — _OWNER_TABLES 手工清单 = 数据隔离靠纪律**：database.py:278-294 手工列 42 张表；新表漏加 → 无 user_id 列/无 require_owner trigger → 数据隔离不变量静默失效。这个防的是"新增需求"路径最常见错误。影响：数据风险（多用户场景）。建议：新表迁移模板自动对照/测试断言每张 owner 表都有 guard。标 P1（数据隔离是硬不变量，漏加即数据风险）。其实更准确 P2 因为单用户/local-only 下风险小、多用户才暴露；但"42 张表强制归属"被文档双列为不可削弱不变量（TECH_STACK.md:107-108）。给 P1 合适——它属于数据风险类。嗯，我按数据隔离不变量被手工纪律维持 → P1（潜在数据风险）。

4. **P2 — 市场数据源非协议化硬编码**："加数据源"要改至少 6 处：_quote_from（market_data.py:422-431）、kline 分支（621-629）、search 双源（274-394）、configure_source_priority 硬编码集合+len==3（243-255）、fundamentals adapters（753-769）、breaker provider 枚举（264-267, 406+）。文档长期路线图已列"定义 DataProvider 协议"（ARCHITECTURE.md:483-485）未做。影响：加一个行情源 = 高接触面改动 + 回归风险；优先级配置校验是硬编码的"必须且只有这三种"。

5. **P2 — 前端 API 类型与后端契约手工同步**：15 个领域 service 模块（frontend/src/services/）各自手写类型；api.ts 只做错误归一；无 openapi 生成类型驱动（前端 types 手工）。每加端点：后端 Pydantic + 前端类型 + API_CONTRACT.md + 测试四地同步，漂移已发生（TECH_STACK 等文档数字不一致）。建议：openapi-typescript 生成或至少类型抽查。嗯，需要验证前端 types 是否为生成——BACKLOG-042 提过 openapi.generated 同步。我不知道 frontend/src/types 是否由 openapi-ts 生成。证据不足 → 标注"未验证"。不过 openapi_tsgen 在 BACKLOG-042 的证据里出现 —— 说明项目里有 openapi_tsgen 流程！让我不臆断，写"前端存在 openapi 生成工具链（BACKLOG-042 证据提及 openapi_tsgen），但本审计未验证其覆盖面"。实际上 grep 到 docs/ai/tasks/BACKLOG-042.md 提 openapi_tsgen。所以有这个工具。那我就弱化这条：改为"API 契约同步依赖手工纪律，文档已多次漂移"。P3。

6. **P2 — 无 CI / 门禁全靠本地手工**：AGENTS.md 明确 "No CI exists"。909 测试 + 470 Vitest + E2E 50+21 全部本地跑。影响 DX/回归保护。P2（显著提升成熟度）。

7. **P2 — 文档数字漂移**：TECH_STACK.md:49 说 schema v24 49 表（实际 v26 50 表）；ARCHITECTURE.md:18 图说 22 个 APIRouter（实际 23，ROUTER_MAP.md:1 正确）；ARCHITECTURE.md:199 说 136 路径/170 操作（实际 140/176，ROUTER_MAP.md:3）。文档漂移是"文档同步靠八步纪律"的证据。P3（DX）。但它是 DX 审计重点 → P3。

8. **P3 — market_data.py 1011 行 + tools_definitions.py 740 行超长文件**：单一文件堆积所有 provider/工具。分割问题。P3。

9. **P3 — 工具执行线程模型 + 每次新建实例**：research_orch.py:22 ThreadPoolExecutor + _run_tool_in_thread (26-41) asyncio.run 在线程；工具内又 new MarketDataService()。纳入问题 1 的变体，或者单列。合并进 1。

10. **P3 — 非 OpenAI 协议供应商不可接入**：LLMClient 只实现 Chat Completions（llm_client.py:1-4）；model_configs.provider 字段仅当凭据元数据（models_crud.py:101）。加 Anthropic/Gemini 原生 = 写新适配器。当前模型管理模块（CRUD+discover+test+预设 15 条）对 OpenAI 兼容供应商已闭环（这是做得好的）。P3。

11. **P4 — 遗留表 dead storage**：backtest_runs 保留不删（ARCHITECTURE.md:199）。v1 已回收。P4。

12. **P3 — 工具调用无独立审计表**：已知（ARCHITECTURE.md:268）。中期路线图 2。P3。

13. **P4 — tools_definitions Eastmoney 常量重复**：tools_definitions.py:23-24 重复定义 EASTMONEY_SEARCH/TENCENT_QUOTE（market_data.py:20-22 已有）。轻微重复实现。P4。嗯：tools_definitions.py:23 EASTMONEY_SEARCH = "https://searchadapter.eastmoney.com/api/suggest/get" 与 market_data.py:20 "https://searchapi.eastmoney.com/api/suggest/get" —— 域名不同！searchadapter vs searchapi。可能是不同的端点（工具用的 vs 搜索用的）。不深究，标"未验证"或者删掉这条。这条证据不确定——去掉或者弱化为"常量重复定义"（TENCENT_QUOTE 完全相同两次：market_data.py:22 与 tools_definitions.py:24）。TENCENT_QUOTE 确实重复。保留但低优先级。

14. **P3 — scheduler 单进程轮询 + asyncio.create_task 未跟踪取消细节**：main.py:84-95 已正确取消。恢复语义已设计（v23）。不做问题。

15. **P2 — 前端状态管理分散**：4 store + localStorage（modelStore.ts:21 researchMode）。15 页面。状态边界可接受。P4。

现在最重要的是"系统级洞察：哪个新增需求路径最贵"：

- 加模型供应商：**最便宜**。模型模块已通用化（CRUD+discover+test+15 预设+凭据加密），加 OpenAI 兼容供应商 ≈ 0 代码（纯 UI 配置）；非 OpenAI 协议需适配器（P3 边界）。
- 加语言：便宜-中。i18n 2453 key parity 0 机制成熟，加 zh/en key 两行；全量系统 i18n 已 100% 覆盖（parity 0）。
- 加 Agent 工具：**便宜**。BaseTool __subclasses__ 自动发现（tools.py:111-114），新工具 = 1 个新类 + 注册自动；除非碰 I/O（踩 MarketDataService 问题）。
- 加技术指标：便宜。纯函数。
- **加市场数据源：最贵**。改动点：配置校验硬编码（configure_source_priority 必须且只能 3 个源）、_quote_from/kline/search/fundamentals 硬编码分支、breaker 枚举、解析函数 + 测试 + DATA_SOURCES 文档。而且动画到核心可靠性机制（降级链/熔断）——回归风险最高。需要 DataProvider 协议化（中期路线图已列未做）。
- 加表/schema 版本：次贵但机械。database.py 单文件 5 处改动 + 全量回归。

结论：最贵路径 = **加市场数据源（新行情 provider）**，因为它没有协议抽象、散布在 1011 行单文件的多处硬编码分派 + 优先级校验硬编码，且触及熔断/降级核心机制；其次昂贵的是加表（database.py 上帝模块）。

好，现在写报告。结构按模板。中文。文件路径 docs/ai/evo/ARCHITECTURE_REPORT.md。

我需要检查 docs/ai/evo/ 目录是否存在——PROJECT_BRIEF.md 就在那里，所以存在。

写文件。內容要精炼但完整。每条问题：问题/证据[文件:行]/影响/建议/优先级。

问题总数：我列 12 条左右。让我定稿：
1. P1 数据源单例绕过（熔断/连接复用/健康状态失真）
2. P1 database.py 上帝模块 + 迁移样板重复
3. P1 owner 表清单手工纪律（隔离靠人）
4. P2 数据源非协议化硬编码（加源成本）
5. P2 无 CI
6. P2 前端-后端类型同步手工（未验证生成工具覆盖面）
7. P3 文档数字漂移
8. P3 超长文件（market_data 1011 / tools_definitions 740 / database 2358）
9. P3 非 OpenAI 协议供应商边界
10. P3 工具调用无审计表（已知）
11. P4 遗留 backtest_runs dead table（已知）
12. P4 常量重复定义（TENCENT_QUOTE）
13. P3 工具线程模型复杂度（research_orch threadpool + asyncio.run）— 合并进 1 的叙述？分开：它本身是已知设计（Astra A5），我把它作为问题 1 的影响面提及即可。不单列。

好，12 条。P0：0 条。诚实：没有 P0，因为没有数据风险级当前缺陷（迁移有备份+SAVEPOINT）。

写报告时注意：每条优先级 + 系统级洞察 + 技术债清单（已知 vs 新发现，标注是否阻碍演进）+ 做得好的。

技术债清单：
- 已知（文档已认）：迁移无框架（ARCHITECTURE.md:471）、无 DAL（448）、无工具审计表（452）、无研究幂等（460）、无 DataProvider 协议（483）、WebSocket 替代 SSE 长期（479）、agent 交叉验证（487）、前端浏览器覆盖（491）、portfolio calc_pnl 多市场缺测试（442）
- 新发现：MarketDataService 单例绕过 8 处（文档只认路由层注入）、_OWNER_TABLES 手工清单、迁移样板重复 26 遍、TENCENT_QUOTE 常量重复、工具每次 new httpx 客户端

阻碍演进的：数据源协议缺失（阻碍加源）、database.py 单文件（阻碍加表）、单例绕过（阻碍加工具碰 I/O）。

做得好的：
- 服务层三层次依赖纪律（编排器→I/O→纯逻辑）文档化且大部分落实
- 模型供应商模块闭环（CRUD+discover+test+凭据加密+15 预设）——BACKLOG-041/043 的成果把"加供应商"变成了低摩擦路径
- SSE try/finally 纪律 6 条管线（ARCHITECTURE.md:173）+ 统一事件协议 + 前端共享 sse.ts
- exclusive_transaction 解决隐式提交/部分提交（database.py:2275-2300）——数据完整性工程设计
- SAVEPOINT + pre-N.bak 迁移安全性（每次迁移前备份 + 可回滚）
- CircuitBreaker 关闭/打开/半开状态机（source_health.py）+ configure_source_priority 校验（防配置错源）
- owner 隔离的 DB 级 trigger 强制（_install_required_owner_guards）+ evidence 表 CHECK 约束（诚实数据）
- i18n parity 0 全量（2453 key）
- ToolRegistry 自动发现（__subclasses__）——加工具零注册成本
- 文档纪律完整（API_CONTRACT/ROUTER_MAP/CHANGELOG/EXEC_PLAN 证据链）—— 虽然数字有漂移，但流程存在且 BACKLOG 卡证据详细

写吧。目标文件 E:\Code_file\Projects\finquant-hub\docs\ai\evo\ARCHITECTURE_REPORT.md。

注意：报告里每条证据必须是真实行号。我整理的证据行号：
- main.py:82 app.state.market = MarketDataService()
- main.py:135-141 路由注册循环
- market_data.py:200-210 dataclass breakers 实例字段；209 breakers: dict = field(default_factory=dict)
- market_data.py:212-224 __post_init__ httpx 客户端
- market_data.py:243-255 configure_source_priority（252: len(providers) != 3）
- market_data.py:400-431 quote/_quote_from 分支
- market_data.py:604-639 kline 分支
- market_data.py:274-394 search
- market_data.py:729-785 fundamentals adapters
- market_data.py:20-22 常量 EASTMONEY_SEARCH/TENCENT_QUOTE
- tools_definitions.py:23-24 常量重复（TENCENT_QUOTE）
- tools_definitions.py:55/143/239/509 MarketDataService()
- discussion_orch.py:32、portfolio.py:744、swarm_orch.py:139
- database.py:251-277 版本常量；295-322 _MIGRATION_NAMES；373-720 _migrate_schema；278-294 _OWNER_TABLES；2220-2233 _install_required_owner_guards；2252-2255 _ensure_column；2044-2074 整表重建案例
- database.py:2358 总行数
- config.py:22-62 env
- llm_client.py:1-4 OpenAI 协议
- models_crud.py:101 provider 存凭据
- research_orch.py:22 ThreadPoolExecutor；26-41 _run_tool_in_thread
- api.ts:8 timeout 30000
- sse.ts 全
- TECH_STACK.md:49 schema v24 49 表（过时）
- ARCHITECTURE.md:18 22 APIRouter（过时）；199 136 路径（过时）；257 request.app.state.market 注入声明
- ROUTER_MAP.md:1 23 APIRouter / 140 / 176（正确）
- EXEC_PLAN.md BACKLOG-042b 回归事件（5 项测试）
- PROJECT_BRIEF.md:25 909 tests 92.67%

现在写。收到指挥校正。已有证据充分，立即收尾写报告。

--- finding 18 ---
指挥要求立即写报告，禁止再扩展调查。我已有充分证据，现在一次性写报告文件，然后发 send_message 汇报，回复一句话摘要。
