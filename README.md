# FinQuant Hub

个人全栈金融量化研究 Web 系统 — A/港股/美股多市场行情、技术分析、AI 多 Agent 投研、投资组合与策略回测。

> 系统状态：✅ 66 API 端点 / 14 路由 / 13 页面 / 42 MVP + 24 新增 / 38 测试通过

## 功能总览

| 模块 | 说明 |
|------|------|
| **多市场行情** | A 股（腾讯/新浪/东方财富三源自动降级）+ 港股/美股（Yahoo Finance）。实时报价 / K 线 / 搜索 |
| **技术指标** | 7 个 numpy 指标（MA/MACD/RSI/KDJ/BOLL/ATR/VolMA），A 股 SMA 口径 |
| **SSE 流式聊天** | 单 Agent 多轮对话 + 历史持久化 + 角色切换 |
| **多 Agent 讨论** | 6 预置投研角色轮序发言（价值投资/技术分析/量化/风控/宏观/情绪），实时时间线 + 自动总结 |
| **4 Agent 并行研究** | 独立工具循环 → 结构化报告，SSE 事件流推送进度 |
| **投资组合** | CRUD + 多市场实时盈亏（含港股/美股） |
| **策略回测** | v1 同步（3 策略）+ v2 异步 BackgroundTasks + 状态机 |
| **WorldQuant Alpha** | 4367 因子字段搜索 + 类别聚合 + 相关性计算 |
| **多市场筛选** | 用户提供 ticker 列表 → 实时行情 + 60 日动量筛选 |
| **模型管理** | OpenAI 兼容协议抽象，CRUD + 连通性测试，默认 DeepSeek |
| **统一标的接口** | A/HK/US 统一合约 + 元数据溯源 + 研究工作区持久化 |
| **报告导出** | Markdown / HTML / PDF / DOCX |

## 快速开始（Windows 11）

前置：Python 3.12（或 uv）、bun（或 npm）。

```bash
# 1. 后端（端口 8000）
cd backend
uv venv --python 3.12 .venv
uv pip install --python .venv/Scripts/python.exe -r requirements.txt
# 配置密钥：复制 .env.example 为 .env，填入 DEEPSEEK_API_KEY
./.venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload

# 2. 前端（端口 5173，另开终端）
cd frontend
bun install
bun run dev
# 浏览器打开 http://localhost:5173
```

## 架构速览

```
浏览器层     React 18 + AntD 5 + lightweight-charts (13 pages)
代理层       Vite dev proxy (5173 → 8000) / Nginx (prod)
路由层       14 APIRouter → 66 端点（全部扁平注册）
服务层       3 层：编排器 → I/O 服务 → 纯逻辑服务
Agent 层     6 工具 (ToolRegistry) + function_calling 循环
数据层       aiosqlite 单连接 + WAL = 15 + 3 表
外部 API     腾讯 / 新浪 / 东方财富 / Yahoo Finance / DeepSeek
```

详细架构文档见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。

## API 端点目录

66 个端点按 14 个路由分组，含 42 MVP + 24 新增端点。完整清单见 **[docs/API_CONTRACT.md](docs/API_CONTRACT.md)**。

| 前缀 | 说明 | 阶段 |
|------|------|------|
| `/api/health` | 健康检查 | MVP |
| `/api/models` | 模型配置 CRUD | MVP |
| `/api/agents` | 角色预设 CRUD | MVP |
| `/api/chat` | 单 Agent SSE 对话 | MVP |
| `/api/discussion` | 多 Agent SSE 讨论 | MVP |
| `/api/market` | 行情数据代理 | MVP |
| `/api/dashboard` | 仪表盘统计 | MVP |
| `/api/analysis` | 个股分析 + SSE 研究 | MVP |
| `/api/portfolio` | 投资组合 + 实时盈亏 | MVP |
| `/api/backtest` | 回测 v1（同步） | MVP |
| `/api/research` | 研究报告 SSE + 导出 | 新增 |
| `/api/backtests` | 回测 v2（异步状态机） | 新增 |
| `/api/instruments` | 统一标的接口 | 新增 |
| `/api/screening` | 多市场筛选 | 新增 |
| `/api/wq` | WorldQuant Alpha | 新增 |

## 参考项目

本项目融合了 6 个 GitHub 量化/金融仓库的架构思路（完整克隆见 `reference/`，含 `.git` 历史）：

| 项目 | 核心采纳 | 影响 |
|------|---------|------|
| [Vibe-Trading](https://github.com/HKUDS/Vibe-Trading) | Agent 工具框架 + function_calling 循环 + SSE 协议 | 高 |
| [stock-analyzer](https://github.com/luda66/stock-analyzer) | 多市场统一接口 + 降级链 + ticker 规范化 | 高 |
| [ai-berkshire](https://github.com/xbtlin/ai-berkshire) | 角色化投研 Agent + 讨论编排 | 中 |
| [wq-alpha-research](https://github.com/QuantML-Research/wq-alpha-research) | WorldQuant Alpha 因子库集成 | 高 |
| [daily_stock_analysis](https://github.com/ZhuLinsen/daily_stock_analysis) | — | 无直接采纳 |
| [BigDataView](https://github.com/iGaoWei/BigDataView) | — | 无直接采纳 |

## 测试

```bash
cd backend && ./.venv/Scripts/python.exe -m pytest -q   # 38 测试（仅 MVP 覆盖）
cd frontend && bun run build                             # 前端类型检查 + 构建
```

> ⚠️ 新功能（研究管線、投资组合、回测 v2、WQ Alpha、筛选、统一标的）零测试覆盖。详情见 [docs/HANDOVER.md](docs/HANDOVER.md)。

## 架构不变量（违反即回退）

- **无 ORM** — 全部 aiosqlite 原生 SQL
- **无连接池** — 单连接，`get_db()` 断言全局 `_db`
- **无独立 DAL** — 路由直调 `database.query_one/query_all/execute`
- **无 WebSocket** — 全部实时通信走 SSE（sse-starlette，4 个端点）
- **无认证/授权** — 无登录/session/JWT
- **无服务端渲染** — 纯 CSR
- **无 Agent 间通信** — 4 个研究 agent 各自独立
- **无 DI 容器** — MarketDataService 通过 `request.app.state.market` 手动注入

完整清单见 CLAUDE.md → Architecture invariants 章节。

## 免责

所有 AI 生成内容仅供研究参考，不构成投资建议。
