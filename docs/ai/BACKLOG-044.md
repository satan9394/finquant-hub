# BACKLOG-044 — 计价模块（全新：模型单价配置 + 按 token 估算费用，对齐 CC Switch Pricing）

> 状态：`[READY]` ｜ 优先级：P2 ｜ 创建：2026-09-13 ｜ 完成：— ｜ 执行：DSH Worker
> 背景：用户质问"计价模块做了没有"。**核实结论：完全为零**。后端 `llm_usage` 只存 prompt/completion/total token，`database.py` 无任何 cost/price 字段，前端无用任何费用展示。CC Switch 真实实现（只读参考源 `E:\DeepSeek_Harness\workspace\2026_08_17\cc-switch-src`）：`src/components/usage/PricingConfigPanel.tsx`（Table+Dialog 单价配置面板）、`src/components/usage/PricingEditModal.tsx`（编辑弹窗）、`src/lib/modelsDevPricing.ts`（计价数据源）、`src-tauri/src/services/model_pricing.rs`（后端计价服务）。本卡从零建计价能力。

## 目标

1. **后端表**：新增 `model_pricing` 表（`model_name TEXT`、`input_per_1m REAL`、`output_per_1m REAL`、`currency TEXT DEFAULT 'CNY'`、`source TEXT`（manual/builtin）、`updated_at TEXT`、唯一约束 model_name）——SAVEPOINT 增量迁移 + `_SCHEMA_VERSION` 提升（先例 BACKLOG-042 v25）。
2. **后端端点**：`GET/POST/PUT/DELETE /api/model-pricing`（列表/新增/更新/删除，用户隔离，输入校验：单价 ≥0、model_name 非空）；`GET /api/usage/cost?days=N`（按 `llm_usage` 聚合，用 model_pricing 换算估算费用，**缺单价的模型诚实标注 unpriced 不猜价**）。
3. **前端面板**：Settings 用量区新增「计价配置」面板——表格（模型/输入单价/输出单价/币种/更新时间/操作）+ 编辑弹窗（对齐 `PricingEditModal.tsx` 的字段与校验），空态诚实；用量明细/趋势显示估算费用（有单价才显示，无单价标注"未配置单价"）。
4. **内置参考单价（可选、诚实标注）**：如加入内置单价表，必须给出官方定价页 URL 并在 UI/证据标注来源与"仅供参考，请以官方为准"；**拿不准一律不加**。
5. i18n zh/en parity 0；确定性测试（表迁移/CRUD 校验/费用换算/缺价 unpriced/用户隔离）。
6. 契约同步：`docs/API_CONTRACT.md`、`docs/ROUTER_MAP.md`、`docs/ARCHITECTURE.md` 的 SCHEMA 段。

## 允许修改
- `backend/app/database.py`（model_pricing 表 + SAVEPOINT 迁移）、新增 `backend/app/routers/model_pricing.py`（或并入 usage.py，二选一说明）、`backend/app/routers/usage.py`、`backend/app/main.py`（注册新 router，如需）
- 前端：`frontend/src/pages/Settings.tsx`、新增 `frontend/src/components/settings/PricingConfigPanel.tsx` + `PricingEditModal.tsx`、`frontend/src/services/usageApi.ts`（如需）、`frontend/src/i18n/zh.ts`+`en.ts`、`frontend/src/types/openapi.generated.ts`
- 测试：`backend/tests/test_model_pricing*.py`、`frontend/tests/*`
- 证据/契约：`docs/ai/BACKLOG-044.md`、`docs/ai/tasks/BACKLOG-044.md`、`docs/ai/EXEC_PLAN.md`、`docs/API_CONTRACT.md`、`docs/ROUTER_MAP.md`、`docs/ARCHITECTURE.md`、`task/CHANGELOG.md`、`HANDOFF.md`

## 禁止修改
- 不加新依赖；不改 `llm_usage` 表结构与既有记录链路（只读它）；不动 context.py；不改 E2E/playwright config
- 不存密钥明文；不臆造单价（无官方定价页一律不加）；不删文件
- 不动供应商/用量面板既有实现（043/045 域）；金额不做汇率自动换算（币种仅作展示字段）

## 完成标准
1. `model_pricing` 表 + SAVEPOINT 迁移（`_SCHEMA_VERSION` 提升），旧库兼容
2. CRUD 端点用户隔离 + 校验（单价 ≥0、model_name 非空、重复 model_name 处理明确）；费用端点缺单价时诚实 `unpriced`
3. 前端计价面板 + 编辑弹窗可用，用量区显示估算费用/未配置单价
4. i18n parity 0；确定性测试覆盖迁移/CRUD/换算/缺价/隔离
5. backend pytest + ruff + build + 聚焦 Vitest + 4173 50 + 8000 21 全绿；git diff --check；删除 0；不 commit

## 参考（**强制**：证据里必须给出被参考源码的 file:line 引用）
- 只读参考源：`E:\DeepSeek_Harness\workspace\2026_08_17\cc-switch-src`（**只读，禁止修改**）
  - `src/components/usage/PricingConfigPanel.tsx`、`src/components/usage/PricingEditModal.tsx`
  - `src/lib/modelsDevPricing.ts`、`src-tauri/src/services/model_pricing.rs`
- 现状：`backend/app/database.py`（llm_usage 表）、`backend/app/routers/usage.py`、`backend/app/services/llm_usage.py`、`frontend/src/pages/Settings.tsx`（UsagePanel）、`frontend/src/components/settings/UsageRecordsPanel.tsx`
- 迁移先例：BACKLOG-042（v25 SAVEPOINT 加列）、BACKLOG-036（api_key 列）

## 完成证据模板
```
- model_pricing 表迁移 diff + 旧库兼容验证
- CRUD/费用端点 diff + 校验与 unpriced 测试结果 + 用户隔离证明
- 前端计价面板/弹窗 diff + 空态与未配置单价展示说明
- 内置单价来源表（如有）：模型 → 官方定价页 URL → 加入/不加理由
- CC Switch 源码引用表：每个借鉴点 → cc-switch 文件:行 → 我们的实现位置
- 契约同步（API_CONTRACT/ROUTER_MAP/ARCHITECTURE SCHEMA）+ i18n parity + 门禁逐项
- git diff --check、删除 0、未 commit
```
