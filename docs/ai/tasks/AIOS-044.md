# AIOS-044 - 本地可选产品指标

## 状态

`[DONE]`

## 优先级

P1

## 用户结果

用户可显式开启本地产品使用指标，查看 TTFV、保存、继续和重复研究的聚合结果，并随时清除。默认不记录，事件不包含金融正文、ticker、对象 ID、查询或凭据。

## 允许修改

- `backend/app/database.py`
- `backend/app/config.py`
- `backend/app/services/product_metrics.py`（新建）
- `backend/app/routers/settings.py`
- 直接对应的 backend focused tests
- `frontend/src/pages/Settings.tsx`
- `frontend/tests/ProfessionalPreferences.test.tsx`
- `docs/API_CONTRACT.md`
- `docs/ROUTER_MAP.md`
- `docs/ARCHITECTURE.md`
- `docs/ai/ARCHITECTURE.md`
- `docs/ai/PRODUCT_METRICS_LOCAL_CONTRACT.md`（新建）
- AIOS 长期计划、EXEC_PLAN 与本任务卡

## 禁止修改

- 依赖、其他前端页面、`reference/`、外部 analytics/telemetry 服务
- 金融正文、ticker/symbol、业务对象 ID、查询、prompt、模型回答、凭据或 session token
- 默认开启、跨用户聚合或不可清除指标
- 让指标写入失败改变业务操作结果

## 完成标准

- 开关默认关闭且 owner-scoped；关闭时事件写入为零。
- allowlist 仅包含 TTFV、save、continue、repeat-research 所需的类别、时间和数值；未知字段拒绝。
- 指标 API/UI 只返回当前用户聚合，支持清除并显示 disabled/loading/empty/error/data 状态。
- 事件记录 best-effort，无金融正文/对象标识/凭据；owner isolation 和删除后零记录通过。
- backend/frontend focused tests、Ruff、mypy、TypeScript、build、OpenAPI/docs/diff check 通过；Phase 4 完整门禁通过。

## 验证声明

本地 fixture 事件只验证隐私和聚合合同，不表示真实用户采用率。

## 完成证据

- schema v21 / pre-v21 backup；`product_metric_preferences` 与 `product_metric_events` 均 owner-scoped，默认关闭。
- 事件表只保存 event/value/time；allowlist、未知字段拒绝、90 天保留、清除、owner isolation 和 best-effort 失败通过。
- focused backend 62 passed、frontend 9 passed；Ruff、mypy、TypeScript、production build、OpenAPI 121 paths / 154 operations 与定向 diff check 通过。
- Phase 4 完整门禁：backend 479 passed、coverage 83.74%、全 Ruff、mypy 118 source files；frontend 50 files / 143 tests、TypeScript、build、E2E 11 passed。
- 以上均为本地 fixture/mock/合同验证，不表示真实用户采用率或真实金融上游验证。
