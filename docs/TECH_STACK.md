# Tech Stack — FinQuant Hub

> 本文档是技术栈的**唯一权威来源**。其他文档引用本文档即可，不再重复列举。

---

## 一句话

FastAPI + aiosqlite WAL + React 18 + AntD 5 + lightweight-charts，本地运行，无 SSR，纯 CSR。

---

## 后端

| 技术 | 版本/说明 | 用途 |
|------|----------|------|
| Python | 3.12 | 运行时 |
| FastAPI | lifespan 启动 | Web 框架、路由、API 服务 |
| aiosqlite | WAL 模式，单连接 | 数据库（无 ORM，无连接池） |
| httpx | 异步客户端 | 调用行情源、LLM API（两个独立实例：A股直连 / Yahoo 代理） |
| sse-starlette | — | 实时通信（6 条 SSE 管线，7 个公开端点） |
| numpy | — | 技术指标计算（7 个指标） |
| Pydantic | — | 请求/响应校验 |

---

## 前端

| 技术 | 版本/说明 | 用途 |
|------|----------|------|
| React | 18 | UI 框架 |
| TypeScript | 5.6+ | 类型安全 |
| Vite | 6 | 开发服务器 + 生产构建 |
| Ant Design | 5 | 组件库 |
| @ant-design/pro-layout | — | 侧边栏导航布局 |
| React Router | 6（BrowserRouter + lazy） | 路由（18 个页面，lazy 加载） |
| lightweight-charts | 4.2 | 金融图表（K 线、权益曲线） |
| Zustand | 4 | 状态管理（auth、chat、model、discussion） |
| Axios | 单实例（api.ts） | HTTP 请求 |
| Bun | 1.3+ | 包管理 + 运行时 |
| CSS（--fq-* 变量） | Design System v1.0 | 设计令牌、dark mode、组件样式 |

---

## 数据层

| 技术 | 说明 |
|------|------|
| SQLite（via aiosqlite） | 单连接 + WAL 模式，schema v23，52 张逻辑表（含 1 张 FTS5 虚拟表） |
| 迁移策略 | lifespan 启动时按 `PRAGMA user_version` 顺序迁移，不绕过备份 |

---

## 外部数据源

| 来源 | 市场 | 用途 | 代理策略 |
|------|------|------|---------|
| 腾讯（qt.gtimg.cn） | A 股 | 实时行情 | trust_env=False（跳过 Clash） |
| 新浪（hq.sinajs.cn） | A 股 | K 线、行情 | trust_env=False |
| 东方财富 | A 股 | 搜索、筹码、新闻 | trust_env=False |
| Yahoo Finance | 港股/美股 | 行情、K 线 | trust_env=True（走代理） |
| DeepSeek API | — | LLM（OpenAI 兼容协议） | 走代理（7897） |

---

## LLM

| 组件 | 说明 |
|------|------|
| LLMClient | OpenAI Chat Completions 协议抽象，5 种 chat 方法 |
| ToolRegistry | 单例，13 个本地 BaseTool 子类型 + function_calling 循环 |
| 默认模型 | DeepSeek V4 Flash |

---

## 测试

| 工具 | 用途 | 命令 |
|------|------|------|
| Pytest | 后端单元/集成测试 | `cd backend && .venv\Scripts\python.exe -m pytest -q` |
| Ruff | Python lint | `cd backend && .venv\Scripts\python.exe -m ruff check .` |
| Vitest | 前端单元测试 | `cd frontend && bun run test` |
| Playwright | E2E 浏览器测试 | `cd frontend && bun run test:e2e` |
| tsc --noEmit | TypeScript 类型检查 | `cd frontend && npx tsc --noEmit` |

---

## 部署

| 模式 | 说明 |
|------|------|
| 本地开发 | `uvicorn --reload` (8000) + `bun run dev` (5173)，Vite 代理转发 |
| Docker Compose | `.\scripts\local.ps1 up`，前后端容器化，端口仅绑定 127.0.0.1 |
| 生产 | 静态构建（Vite build）+ Nginx 代理，需 HTTPS + SMTP + Cookie 安全 |

---

## 架构不变量（违反即回退）

- **无 ORM** — 全部 aiosqlite 原生 SQL
- **无连接池** — 单连接，`get_db()` 断言全局 `_db`
- **无独立 DAL** — 路由直调 `database.query_one/query_all/execute`
- **无 WebSocket** — 全部实时通信走 SSE（sse-starlette）
- **无 SSR** — 纯 CSR（Vite 代理开发，静态构建生产）
- **无 DI 容器** — MarketDataService 通过 `request.app.state.market` 手动注入
- **无 Agent 间通信** — 研究 Agent 各自独立，Swarm DAG 单向传递
- **认证不可删除** — 标准模式邮箱验证码 + HttpOnly Cookie
- **用户隔离不可削弱** — 42 张用户业务表强制 user_id 归属
- **本地模式不外溢** — LOCAL_ONLY_MODE=true 仅 development

---

## 变更记录

- 2026-08-21 首次创建。数据基于 EXEC_PLAN AIOS-088 完成后的代码状态。
