# Copilot Instructions — FinQuant Hub

## 项目概览

个人量化金融研究系统。FastAPI + React 全栈，本地运行于 Windows 11。

## 快速命令

```bash
# 后端启动 (端口 8000)
cd E:\Code_file\Projects\finquant-hub\backend && .venv\Scripts\python.exe -m uvicorn app.main:app --reload
# 前端启动 (端口 5173)
cd E:\Code_file\Projects\finquant-hub\frontend && bun run dev
# 运行测试
cd E:\Code_file\Projects\finquant-hub\backend && .venv\Scripts\python.exe -m pytest -q
# 前端构建检查
cd E:\Code_file\Projects\finquant-hub\frontend && bun run build
# 后端 lint
cd E:\Code_file\Projects\finquant-hub\backend && .venv\Scripts\python.exe -m ruff check .
```

## 文档同步规则（重要）

**每次代码变更后，必须同步更新以下文档：**

| 变更类型 | 必须更新的文档 |
|----------|---------------|
| 增/删/改 API 端点 | `docs/API_CONTRACT.md` — 路由表 |
| 新增路由或改架构 | `docs/ARCHITECTURE.md` |
| 新增表或改 schema | `docs/ARCHITECTURE.md` 中的 SCHEMA 部分 |
| 修 known bug | `docs/HANDOVER.md` — 从 Broken 移到 Verified Working |
| 改启动/测试命令 | `CLAUDE.md` Quick commands + `README.md` |

**不需要更新文档的情况**：纯重构（不改接口）、加测试、改注释。

## 架构不变量

- **无 ORM**: 所有数据库操作用 aiosqlite 原始 SQL，不用 SQLAlchemy
- **无连接池**: 单 aiosqlite 连接，get_db() 断言全局 _db
- **无独立 DAL**: router 直接调用 database.query_one/query_all/execute
- **无 WebSocket**: 实时通信全部用 SSE（sse-starlette）
- **无认证**: 零鉴权，无登录/session/JWT
- **无 SSR**: 纯 CSR，Vite 代理开发，静态构建生产
- **无 agent 间通信**: 4 个 research agent 独立运行
- **无 DI 容器**: MarketDataService 通过 request.app.state.market 注入
- 单 axios 实例 (api.ts) 服务所有前端请求
- 腾讯/新浪数据源用 trust_env=False 跳过代理；Yahoo 用 trust_env=True
- ToolRegistry 是单例 (__new__)

## 服务层依赖方向

编排器 (research_orch, discussion_orch) → I/O 服务 (market_data, llm_client) → 纯逻辑服务 (indicators, scoring, signals, alpha_service)

纯逻辑服务不能有 I/O 依赖，必须单元测试可测。

## 代码风格

- 后端 Python 3.12，类型注解完整
- ruff 作为 linter（配置在 `backend/pyproject.toml`），提交前运行 `ruff check .`
- 行宽 120
- 所有 SQL 使用参数化 `?` 占位符，禁止拼接
