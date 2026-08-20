# PROD-000: 统一架构文档真相

> 状态：`[DONE]`  
> 阶段：Productization Phase 0  
> 完成日期：2026-08-09

## 用户问题

产品化计划不能同时遵守“无认证、14 路由”和当前认证、用户隔离及 23 路由实现，需要先确定唯一架构真相。

## 当前证据

- `backend/app/main.py` 注册 `auth.router` 和 22 个统一附加 `authenticated_context` 的业务路由器。
- `app.openapi()` 生成 105 个 `/api/*` 路径、134 个 HTTP 操作；另有内联 `GET /api/health`。
- `backend/app/database.py` 目标 `_SCHEMA_VERSION=11`，定义 35 张逻辑表；`_OWNER_TABLES` 含 25 张既有用户业务表，`user_credentials` 另按用户隔离。
- `docs/ai/DECISIONS.md` 已接受邮箱免密认证和 development-only 本地所有者模式。
- 开工时工作树已有多项用户改动；本任务没有修改任何业务代码，也没有覆盖这些改动。

## 目标行为

所有架构入口对认证、用户隔离、路由数量、数据库目标版本和禁止技术给出一致答案，并明确哪个文档是权威来源。

## 范围内文件

- `docs/ARCHITECTURE.md`
- `README.md`
- `docs/API_CONTRACT.md`
- `docs/ROUTER_MAP.md`
- `docs/ai/ARCHITECTURE.md`
- `docs/ai/DECISIONS.md`
- `docs/ai/LONG_TERM_GOAL.md`
- `docs/ai/TRADING_CONNECTOR_ASSESSMENT.md`
- `docs/ai/PRODUCTIZATION_PLAN.md`
- 本任务卡

## 明确非目标

- 不修改业务代码、认证实现、数据库或迁移。
- 不启动应用以迁移现有 SQLite 文件。
- 不修改 `reference/`。
- 不提交、推送、发布或部署。

## 数据与金融口径

本任务不生成金融数据。现有真实数据、来源、`unknown` 和质量状态合同保持不变。

## 验收

- 两份架构文档不再包含“无认证”或 14/20 路由硬事实。
- API 合同和 Router Map 包含 auth、credentials 及当前 OpenAPI 总数。
- 数据库文档区分 schema v11 目标、35 张逻辑表和用户归属范围。
- `git diff --check` 通过，`reference/` 无差异。
- 因无业务代码改动，不运行后端/前端全量测试与浏览器验收。

## 回滚方式

仅回退本任务列出的文档差异；不得回退开工前已有的用户改动。
