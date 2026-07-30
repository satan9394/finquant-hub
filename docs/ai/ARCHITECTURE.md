# Architecture — FinQuant Hub

## 一句话架构

FastAPI lifespan → aiosqlite WAL 单连接 → 14 路由 → Vite 代理 → React 18 + AntD 5 + lightweight-charts

## 架构不变量（禁止违反）

- **无 ORM**: 所有 DB 用 aiosqlite 原始 SQL
- **无连接池**: 单 aiosqlite 连接，get_db() 断言全局 _db
- **无独立 DAL**: router 直接调 database.query_one/query_all/execute
- **无 WebSocket**: 实时通信只用 SSE（sse-starlette）
- **无认证**: 零鉴权，无 login/session/JWT
- **无 SSR**: 纯 CSR，Vite 代理开发，静态构建生产
- **无 agent 间通信**: 4 个 research agent 独立运行
- **无 DI 容器**: MarketDataService 通过 request.app.state.market 注入
- 单 axios 实例 (api.ts) 服务所有前端请求

## 数据源规则

- 腾讯/新浪: `trust_env=False`（跳过 Clash 代理）
- Yahoo: `trust_env=True`
- DeepSeek API: 走代理

## 路由表

见 `docs/ROUTER_MAP.md`，改端点后同步更新。
