# FinQuant Hub 架构总览

## 1. 架构总览

FinQuant Hub 是一个面向中文个人投资者的**全栈量化投研 Web 系统**，覆盖 A/港股/美股的多 Agent 研究报告生成、技术指标分析、投资组合管理与策略回测功能。

### 系统分层

```
┌─────────────────────────────────────────────────────────┐
│                       浏览器层                           │
│  React 18 + Ant Design 5 + lightweight-charts           │
│  13 页面 | axios 统一代理 | React.lazy 代码分割            │
│  单 api.ts 实例 (/api/*)                               │
├─────────────────────────────────────────────────────────┤
│                    Vite 开发代理 (5173 → 8000)            │
├─────────────────────────────────────────────────────────┤
│                     路由层 (14 个 APIRouter)              │
│  /api/chat  /api/discussion  /api/market  /api/analysis  │
│  /api/research  /api/portfolio  /api/backtest(s)        │
│  /api/agents  /api/models  /api/screening               │
│  /api/instruments  /api/dashboard  /api/wq               │
│  全部在 main.py 单循环注册，无自动发现                    │
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
│  │  4 Agent 并行 / 多 Agent 轮序  | SSE 事件流       │   │
│  ├──────────────────────────────────────────────────┤   │
│  │  analysis/scoring.py + signals.py   (量化分析)     │   │
│  │  indicators.py  (7 指标 numpy 实现)              │   │
│  ├──────────────────────────────────────────────────┤   │
│  │  portfolio.py  /  alpha_service.py               │   │
│  │  backtest/engine.py  (3 策略向量化回测)           │   │
│  └──────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────┤
│              Agent 工具层 (6 工具, function_calling)    │
│  GetStockData / CalculateIndicators / VerifyValuation   │
│  ScreenStocks / SearchNews / CalculateByFinancialRigor  │
│  ToolRegistry 单例 + BaseTool 抽象基类                  │
├─────────────────────────────────────────────────────────┤
│                     数据层                                │
│  aiosqlite 单连接 + WAL + 15 核心表 + 3 个自主建表        │
│  database.query_one/query_all/execute 直接 SQL 调用     │
├─────────────────────────────────────────────────────────┤
│                     外部API                               │
│  腾讯 qt.gtimg.cn  |  新浪 hq.sinajs.cn                 │
│  东方财富 searchapi   |  Yahoo Finance v8/v1            │
│  DeepSeek API  (OpenAI 兼容协议)                        │
└─────────────────────────────────────────────────────────┘
```

## 2. 核心架构模式

以下七种模式构成了 FinQuant Hub 的实际架构骨架。每个模式都在代码中存在至少两处实现，并形成了可识别的约束。

### 2.1 路由统一注册模式

**实现位置**：`backend/app/main.py` 第 31-34 行

所有 14 个路由器通过一个 for 循环扁平注册，无嵌套挂载、无前缀冲突检测、无自动发现机制。每个路由器各自定义 `prefix` 和 `tags`。

```python
# 核心逻辑（实际代码）
for r in (models_crud.router, agents.router, chat.router, ...):
    app.include_router(r)
```

**关键特征**：
- 新增路由需要两处改动：在 `routers/` 下建文件 + 在 `main.py` 的 import 和注册循环中各加一行
- 无统一前缀验证，路由前缀在各自的 Router 定义中（如 `prefix="/api/chat"`）
- 所有路由函数直接调用 `database.query_one/query_all/execute`，没有独立的 Data Access Layer
- 共享依赖通过 `request.app.state.market` 获取（`MarketDataService` 单例）

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

6 个已注册工具：GetStockData、CalculateIndicators、VerifyValuation、ScreenStocks、SearchNews、CalculateByFinancialRigor。

**使用链路**：research_orch → ToolRegistry → LLMClient.chat_with_tools_safe → LLM 选择工具 → 执行工具.run() → 结果反馈给 LLM → 最终生成分析。

### 2.4 数据源适配器模式

**实现位置**：`backend/app/services/market_data.py`

一个 `MarketDataService` 类封装了 4 个数据源（腾讯、新浪、东方财富、Yahoo Finance），对外提供统一接口（search/quote/kline/fundamentals）：

```
对外接口         内部降级链
─────────────────────────────────
search()   → 东方财富 + Yahoo（双源并行，结果合并去重）
quote()    → 腾讯 → 新浪 → Yahoo（逐级降级）
kline()    → 新浪 → 腾讯 → Yahoo（逐级降级）
fundamentals() → Yahoo（单源）
```

**关键设计决策**：
- A 股走腾讯/新浪/东方财富（国内市场直连，`trust_env=False` 绕过系统代理）
- 港股/美股走 Yahoo（系统代理可达，`trust_env=True`）
- 两个独立的 httpx 客户端（`self.http` 和 `self.yahoo_http`）
- `detect_market()` 和 `normalize_code()` 函数统一将用户输入的多种格式（如 `600519`、`00700.HK`、`AAPL`）规范化为内部 ticker 格式（如 `sh600519`、`hk00700`、`usAAPL`）

### 2.5 SSE 流式通信模式

**实现位置**：`backend/app/routers/chat.py`、`discussion.py`、`analysis.py`、`research.py`

4 个 SSE 端点共享同一架构模式：

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

### 2.7 双版本回测 API

**实现位置**：`backend/app/routers/backtest.py`（v1）+ `backtests.py`（v2）

| 维度 | v1 (backtest.py) | v2 (backtests.py) |
|------|------------------|-------------------|
| 执行方式 | 同步请求-响应 | BackgroundTasks 异步 |
| 状态管理 | 无 | 状态机队列→loading→running→calculating→completed |
| 数据库 | 自建 backtest_runs 表 | 自建 quant_backtests 表 |
| K 线来源 | 内联 Tencent 调用 | InstrumentService 统一接口 |
| 策略 | 3 种（ma_cross/rsi_reversal/bollinger） | MA Cross 为主 |

**关键意义**：这是全项目中唯一显式的版本演进痕迹，反映了对回测场景"短同步可接受 → 长计算必须异步"的设计认知提升。

## 3. 架构不变量

以下规则是代码中实际存在的隐式约束，以"不存在什么"的方式表达，违反即视为架构破防。

### 数据库层
- **不存在 ORM**：所有数据库操作为原生 SQL，没有 SQLAlchemy 或其他 ORM 层。
- **不存在连接池**：`aiosqlite` 单连接，`get_db()` 断言全局 `_db` 不为 None。
- **不存在统一的建表入口**：`database.py` 定义 15 张核心表，但 `portfolio.py`、`backtest.py`、`backtests.py` 各自自建额外表，共 3 个独立建表路径。
- **不存在迁移框架**：`_migrate_schema()` 使用 `PRAGMA table_info` + `ALTER TABLE ADD COLUMN` 的朴素方式实现向后兼容。

### 服务层
- **不存在独立的 Data Access Layer / Repository**：路由函数直接调用 `database.query_one/query_all/execute`。
- **不存在统一的 ticker 解析**：`analysis/routers/analysis.py` 使用 `resolve_ticker()`，`instruments.py` 使用 `external_symbol()`，`market_data.py` 有独立的 `normalize_code()` — 三条路径做同一件事。
- **不存在 WebSocket**：所有实时通信都使用 SSE（sse-starlette），没有 WebSocket 端点。
- **不存在依赖注入容器**：`MarketDataService` 通过 `request.app.state.market` 手动获取，非 DI 框架注入。

### 前端
- **不存在每个服务的独立 API 客户端**：所有前端请求通过单一 `api.ts` 的 axios 实例。
- **不存在认证/授权**：无登录、无 session、无 JWT、无 API Key 鉴权。
- **不存在服务端渲染**：纯 CSR，Vite 仅作开发代理和生产构建。

### Agent
- **不存在 Agent 间通信**：research_orch 四个 Agent 各自独立执行，无交叉引用、无辩论、无结果互相验证。
- **不存在工具调用持久化**：除了 `agent_runs` 表的 token_usage，工具调用参数和结果不被记录。
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
| | SSE 流式推送 | 高 | 4 个 SSE 端点的事件协议设计 |
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
  │   ├── research.py      → database, research_orch, report_export
  │   ├── market.py        → market_data, indicators
  │   │   └── market_data.py (htttpx: Tencent/Sina/EastMoney/Yahoo)
  │   ├── portfolio.py     → database, market_data
  │   │   └── portfolio.py (service)
  │   │       ├── database
  │   │       └── market_data
  │   ├── backtest.py      → database, market_data (v1, 同步)
  │   ├── backtests.py     → database, instruments (v2, 异步)
  │   │   └── instruments.py → market_data
  │   ├── instruments.py   → database, instruments (service), market_data
  │   ├── screening.py     → market_data (用户提交 ticker 列表)
  │   ├── wq.py            → alpha_service (纯逻辑, 无外部依赖)
  │   ├── dashboard.py     → database
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

1. **消除 ticker 解析三路径**
   - `resolve_ticker()` (analysis/ticker.py) / `external_symbol()` (instruments.py) / `normalize_code()` (market_data.py)
   - 方案：统一到 `market_data.normalize_code()`，其他两处改为调用它。

2. **合并三处独立建表路径**
   - `database.py` / `portfolio.py` / `backtest.py` 各自有 `CREATE TABLE IF NOT EXISTS`
   - 方案：将 `portfolios`、`positions`、`portfolio_trades`、`backtest_runs`、`quant_backtests` 全部移入 `database.py` 的 `SCHEMA`。

3. **补全 SSE 路由缺少的 finally 兜底**
   - 审查所有 4 个 SSE 端点确保 `try/finally` 中发生 `error` 事件
   - `discussion_orch.py` 已有兜底，其他端点需确认一致。

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

3. **统一的 API 错误格式**
   - 当前部分路由返回 `{"detail": "..."}`（FastAPI 默认），部分返回 `{"message": "..."}`（SSE 事件）
   - 方案：定义 `ApiResponse` 基类，所有非 SSE 响应统一封装为 `{"success": bool, "data": ..., "error": ...}`。

4. **研究结果的幂等性去重**
   - 多次 POST /api/research 对同一 ticker 会创建多条记录
   - 方案：短时间窗口（如 5 分钟内）对同一 ticker+model 的请求返回已有进行中的 report_id。

5. **前端 API 层按领域拆分**
   - 当前单一 `api.ts` 实例 + 4 个分散的 service 文件
   - 方案：按领域（chat、market、portfolio、research）建立各自的 API 模块，复用统一实例。

### 长期（架构级，需分阶段推进）

1. **数据库迁移框架**
   - 当前 `_migrate_schema()` 的 `PRAGMA table_info` + `ALTER TABLE ADD COLUMN` 方式不可扩展
   - 方案：引入 `alembic` 或自建基于版本号的迁移系统，支持列删除/重命名/类型变更。

2. **认证与授权体系**
   - 当前无任何安全控制，所有数据和功能完全开放
   - 方案：引入 OAuth 2.0 + JWT，区分用户数据和系统配置；API Key 管理用于 Agent 工具的外部访问。

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
   - 当前零测试覆盖新功能（CLAUDE.md 明确标注）
   - 方案：建立 pytest 端到端测试套件，Mock 外部 API（使用 respx 或 pytest-httpx），覆盖主要 API 路径和 SSE 事件流。
