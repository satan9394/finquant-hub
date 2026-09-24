# FinQuant Hub — Project Context Card

> 把这份文档 + 截屏 + 你的需求一起发给 ChatGPT/其他 AI，它就能给出准确的开发提示词。
> 版本：2026-08-21（与 EXEC_PLAN AIOS-088 对齐）

## 一句话

个人全栈金融量化研究系统（FastAPI + React），A/港股/美股多市场行情、AI 多 Agent 投研、投资组合与策略回测。

## 技术栈

详见 [docs/TECH_STACK.md](../docs/TECH_STACK.md)（唯一权威来源）。

| 层 | 技术 |
|---|------|
| 后端 | Python 3.12, FastAPI, aiosqlite (WAL 单连接), httpx, sse-starlette, numpy |
| 前端 | React 18, Vite 6, AntD 5, lightweight-charts, Zustand, axios, Design System v1.0 |
| 数据库 | SQLite schema v23, 52 张逻辑表, WAL 模式, 无 ORM |
| LLM | DeepSeek API (OpenAI 兼容协议), 13 个本地工具 function_calling |
| 数据源 | 腾讯 / 新浪 / 东方财富 / Yahoo Finance / DeepSeek |
| 部署 | Docker Compose (Local-only) 或 Vite dev proxy (5173→8000) |

## 架构速览

```
浏览器层     React 18 + AntD 5 + ProLayout + lightweight-charts
代理层       Vite dev proxy (5173 → 8000) / Nginx (prod)
路由层       23 APIRouter → 133 个 /api/* 路径 / 168 个 HTTP 操作
服务层       3 层：编排器 → I/O 服务 → 纯逻辑服务
Agent 层     13 个本地工具 (ToolRegistry) + function_calling 循环
数据层       aiosqlite 单连接 + WAL + schema v23（52 张逻辑表）
外部 API     腾讯 / 新浪 / 东方财富 / Yahoo Finance / DeepSeek
```

## 架构不变量（违反即回退）

1. **无 ORM** — 全部 aiosqlite 原生 SQL
2. **无连接池** — 单连接，`get_db()` 断言全局 `_db`
3. **无独立 DAL** — 路由直调 `database.query_one/query_all/execute`
4. **无 WebSocket** — 全部实时通信走 SSE（sse-starlette）
5. **认证不可删除** — 邮箱验证码 + HttpOnly Cookie；本地模式用内部所有者
6. **用户隔离不可削弱** — 42 张用户业务表强制 user_id 归属
7. **无服务端渲染** — 纯 CSR
8. **无 Agent 间通信** — 研究 Agent 各自独立，Swarm DAG 单向传递
9. **无 DI 容器** — MarketDataService 通过 `request.app.state.market` 手动注入

## 服务层依赖规则

```
编排器 (research_orch, discussion_orch) → I/O 服务 (market_data, llm_client) → 纯逻辑服务 (indicators, scoring, signals, alpha_service)
```

## SSE 事件协议（6 管线统一）

`token` / `agent_started` / `tool_call` / `agent_completed` / `done` / `error`

所有 SSE 端点用 `try/finally` 保证 `error` 事件发送后结束响应。

## 项目文档清单

| 文件 | 内容 |
|------|------|
| `docs/TECH_STACK.md` | 技术栈（唯一权威来源） |
| `CLAUDE.md` | 项目规则、架构不变量、命令 |
| `docs/ARCHITECTURE.md` | 完整架构文档 |
| `docs/API_CONTRACT.md` | 133 端点目录 |
| `docs/HANDOVER.md` | 工程状态 + 修复优先级 |
| `docs/ROUTER_MAP.md` | 23 个路由器映射 |
| `docs/DATA_SOURCES.md` | 数据源矩阵 |
| `README.md` | 概览 + 快速开始 |
