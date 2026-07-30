# FinQuant Hub — Project Context Card

> 把这份文档 + 截屏 + 你的需求一起发给 ChatGPT/其他 AI，它就能给出准确的开发提示词。
> 版本：2026-07-28

## 一句话

个人全栈金融量化研究系统（FastAPI + React），A/港股/美股多市场行情、AI 多 Agent 投研、投资组合与回测。

## 技术栈

| 层 | 技术 |
|---|------|
| 后端 | Python 3.12, FastAPI, aiosqlite (WAL 单连接), httpx, sse-starlette, numpy |
| 前端 | React 18, Vite 6, AntD 5, lightweight-charts, axios |
| 数据库 | SQLite 15+3 表, WAL 模式, 无 ORM |
| LLM | DeepSeek API (OpenAI 兼容协议), 支持 function_calling |
| 数据源 | 腾讯 qt.gtimg.cn / 新浪 hq.sinajs.cn / 东方财富 searchapi / Yahoo Finance v8/v1 |

## 目录结构

```
backend/app/
├── main.py              # FastAPI 入口 + lifespan + 14 路由器注册
├── config.py            # 环境变量配置
├── database.py          # SQLite SCHEMA + 种子数据 + query 工具
├── routers/             # 14 个 APIRouter
│   ├── models_crud.py   # 模型配置 CRUD
│   ├── agents.py        # 角色预设 CRUD
│   ├── chat.py          # 单 Agent SSE 对话
│   ├── discussion.py    # 多 Agent SSE 讨论
│   ├── market.py        # 行情数据代理 (v1)
│   ├── dashboard.py     # 仪表盘统计
│   ├── analysis.py      # 个股分析 + SSE 研究 (v1)
│   ├── portfolio.py     # 投资组合 + 实时盈亏
│   ├── backtest.py      # 回测 v1 (同步)
│   ├── research.py      # 研究报告 SSE + 导出 (新增)
│   ├── backtests.py     # 回测 v2 (异步状态机, 新增)
│   ├── instruments.py   # 统一标的接口 (新增)
│   ├── screening.py     # 多市场筛选 (新增)
│   └── wq.py            # WorldQuant Alpha (新增)
├── services/
│   ├── market_data.py   # 4 数据源适配器 + 降级链
│   ├── llm_client.py    # OpenAI 兼容客户端 (5 个方法)
│   ├── indicators.py    # 7 numpy 指标 (纯逻辑)
│   ├── research_orch.py # 4 Agent 并行研究编排
│   ├── discussion_orch.py # 多 Agent 轮序讨论编排
│   ├── portfolio.py     # 投资组合 CRUD + 实时 PnL
│   ├── analysis/        # scoring.py (打分) + signals.py (信号检测)
│   ├── alpha_service.py # WQ Alpha 因子搜索 (4367 字段)
│   └── instruments.py   # 统一标的服务
├── agent/
│   └── tools_definitions.py # 6 BaseTool + ToolRegistry 单例
└── backtest/
    └── engine.py        # 3 策略向量化回测

frontend/src/
├── pages/               # 13 个页面
│   ├── Dashboard.tsx, Chat.tsx, Discussion.tsx
│   ├── StockAnalysis.tsx, Research.tsx, ResearchWorkspace.tsx
│   ├── Portfolio.tsx, StrategyLab.tsx, Screening.tsx
│   ├── Models.tsx, Settings.tsx, AlphaResearch.tsx, Knowledge.tsx
├── services/api.ts      # 单 axios 实例, 统一 /api 前缀
├── types/index.ts       # TypeScript 类型定义
└── components/          # 共享组件 (图表, 表格等)
```

## 14 路由 & 66 端点

| 前缀 | 文件 | MVP？ | 端点数 |
|------|------|-------|--------|
| /api/models | models_crud.py | ✅ | 6 |
| /api/agents | agents.py | ✅ | 4 |
| /api/chat | chat.py | ✅ | 6 (含 SSE) |
| /api/discussion | discussion.py | ✅ | 4 (含 SSE) |
| /api/market | market.py | ✅ | 4 |
| /api/dashboard | dashboard.py | ✅ | 1 |
| /api/analysis | analysis.py | ✅ | 3 (含 SSE) |
| /api/portfolio | portfolio.py | ✅ | 10 |
| /api/backtest | backtest.py | ✅ v1 同步 | 3 |
| /api/research | research.py | ❌ 新增 | 5 (含 SSE) |
| /api/backtests | backtests.py | ❌ 新增 v2 | 6 (异步) |
| /api/instruments | instruments.py | ❌ 新增 | 7 |
| /api/screening | screening.py | ❌ 新增 | 1 |
| /api/wq | wq.py | ❌ 新增 | 5 |
| /api/health | main.py 内联 | ✅ | 1 |

## 架构不变量（违反即回退）

1. **无 ORM** — 全部 aiosqlite 原生 SQL，无 SQLAlchemy
2. **无连接池** — 单 aiosqlite 连接，`get_db()` 断言全局 `_db`
3. **无独立 DAL** — 路由直接调 `database.query_one/query_all/execute`
4. **无 WebSocket** — 所有实时通信走 SSE (sse-starlette)，共 4 个 SSE 端点
5. **无认证/授权** — 无登录/session/JWT
6. **无服务端渲染** — 纯 CSR，Vite 代理开发，静态构建生产
7. **无 Agent 间通信** — 4 个研究 agent 各自独立无交叉
8. **无 DI 容器** — `MarketDataService` 通过 `request.app.state.market` 手动注入
9. **单 axios 实例** — 所有前端请求走 `api.ts`
10. **A 股数据源 `trust_env=False`** — 绕过系统代理（Clash），Yahoo 用 `trust_env=True`

## 服务层依赖规则

```
编排器 (research_orch, discussion_orch) → I/O 服务 (market_data, llm_client) → 纯逻辑服务 (indicators, scoring, signals, alpha_service)
```

- 纯逻辑服务：零 I/O 依赖，可无 mock 单测
- I/O 服务：封装外部 API 调用和数据库操作
- 编排器：协调多个子服务完成复杂业务流程，异步生成器推 SSE 事件

## SSE 事件协议（4 端统一）

所有 SSE 端点（chat / discussion / analysis / research）使用相同事件格式：

- `token` — 流式文本增量 `{"event":"token","data":{"delta":"..."}}`
- `agent_started` — Agent 开始工作
- `tool_call` — Agent 调用工具
- `agent_completed` — Agent 完成
- `report_progress` — 报告生成进度
- `done` — 全部完成 `{"event":"done","data":{...}}`
- `error` — 异常（必须以此收尾，不允许静默断流）

所有 SSE 端点用 `try/finally` 保证 `error` 事件发送后结束响应。

## 数据库表结构（15 核心 + 3 独立）

database.py SCHEMA 包含 15 表：
- model_configs / conversations / messages / agent_presets
- discussion_rooms / research_reports / research_events
- backtest_runs / research_workspaces / quant_backtests
- analysis_reports / analysis_signals / agent_runs
- alpha_fields / portfolio_groups + portfolio_items + portfolio_trades

## 数据源 & 降级链

| 函数 | 降级顺序 |
|------|---------|
| `search()` | 东方财富 + Yahoo（双源并行合并） |
| `quote()` | 腾讯 → 新浪 → Yahoo |
| `kline()` | 新浪 → 腾讯 → Yahoo |
| `fundamentals()` | Yahoo（单源） |

## Agent 工具（6 个）

1. GetStockData — 获取多市场实时行情
2. CalculateIndicators — 计算 7 个技术指标
3. VerifyValuation — 估值验算（Decimal 精确计算）
4. ScreenStocks — 股票筛选
5. SearchNews — 新闻搜索
6. CalculateByFinancialRigor — 金融精确计算

通过 `ToolRegistry` 单例管理，格式转 `OpenAI function_calling` 协议。

## 当前已知技术债务（短期可修）

1. SSE finally 兜底审计 — 检查 4 个 SSE 端点是否一致有 try/finally
2. 投资组合 HK/US PnL 测试 — `portfolio.calc_pnl()` HK/US 无测试覆盖
3. 前端包大小 — 1.6MB 单 chunk，需 React.lazy 代码分割
4. API 错误格式不统一 — 部分返回 `{"detail":...}`，部分返回 `{"message":...}`
5. 所有新功能零测试覆盖（38 个测试仅覆盖 MVP 阶段）

## 项目文档清单

| 文件 | 内容 |
|------|------|
| `CLAUDE.md` | 项目规则、架构不变量、命令 |
| `docs/ARCHITECTURE.md` | 完整架构文档（7 核心模式 + 数据流 + 依赖图） |
| `docs/API_CONTRACT.md` | 66 端点目录 |
| `docs/HANDOVER.md` | 工程状态 + 修复优先级 |
| `docs/PRD.md` | 需求文档 |
| `README.md` | 概览 + 快速开始 |
| `docs/DELIVERY.md` | 交付记录 |
