# BACKLOG-035b — B9 挂载收口：LocalCapabilityBanner 接入 Dashboard 首屏 + E2E mock 同步

> 状态：`[READY]` ｜ 优先级：P2 ｜ 创建：2026-09-07 ｜ 完成：— ｜ 执行：DSH Worker
> 背景：BACKLOG-035 已把 `LocalCapabilityBanner` 扩展为 model_ai + market_data 双状态并合入（18962f7），但 Worker 诚实上报：该 Banner **自 8a0be88 重构后从未挂载进 Dashboard 渲染区**（仅导出 + 单测覆盖，用户首屏看不到）——B9"首页可见首用引导"未真正达成。挂载需动 `dashboard.spec.ts` mock（E2E 是 035 的禁止项故未越界），本卡**明确授权**挂载 + E2E mock 补 capabilities 字段（测试夹具更新，非放宽断言）。

## 目标

1. `Dashboard.tsx` 渲染区：stats 加载成功后（stats 非 null）渲染 `<LocalCapabilityBanner capabilities={stats.capabilities} onNavigate={navigate} />`（放首屏合适位置，如 hero 下方/现有 capabilities 应处）；stats null/加载态不渲染（不闪 banner）。
2. `frontend/e2e/dashboard.spec.ts`：mock 的 `/api/dashboard/stats` 响应补 `capabilities` 字段（model_ai + market_data，与 types/index.ts:351-362 契约一致）——**只加字段不改既有断言语义**；若 dashboard 渲染有相关断言则核对不冲突。
3. 验证真实入口下 Banner 出现：8000 E2E 或 Vitest Dashboard 渲染断言覆盖（stats mock 含 capabilities → Banner 可见）。
4. i18n 复用 035 已加 key，零新增（除非发现缺）。

## 允许修改
- `frontend/src/pages/Dashboard.tsx`（挂载 Banner）
- `frontend/e2e/dashboard.spec.ts`（stats mock 补 capabilities 字段——**仅补字段，禁改既有断言**）
- `frontend/tests/Dashboard.test.tsx`（若需渲染级断言：stats mock 含 capabilities → Banner 出现）
- 证据文档：`docs/ai/BACKLOG-035b.md`、`docs/ai/tasks/BACKLOG-035b.md`（新建）、`docs/ai/EXEC_PLAN.md`、`task/CHANGELOG.md`、`HANDOFF.md`

## 禁止修改
- 后端（capabilities 判定只消费）；`frontend/e2e/` 除 dashboard.spec.ts 外一切、`frontend/e2e-8000/*`、playwright config
- 依赖/锁文件、`reference/`；不删除文件；不加依赖；不改 LocalCapabilityBanner 组件本身（035 已定）；不实施其他 Astra 项

## 完成标准
1. Dashboard 首屏（stats 就绪后）可见 Banner（model_ai + market_data 双状态）
2. dashboard.spec.ts mock 补 capabilities，4173 E2E 50/50 全绿（既有断言零改动）
3. build、Vitest 全量、8000 E2E 21/21 全绿；i18n parity 0
4. git diff --check、删除 0、工作树干净

## 参考
- 035 产物：`docs/ai/tasks/BACKLOG-035.md`、Dashboard.tsx LocalCapabilityBanner（L28-40）
- 契约：`types/index.ts:351-362`（capabilities.model_ai/market_data）
- E2E mock 先例：`frontend/e2e/dashboard.spec.ts`（stats mock L20-27，现无 capabilities）
- 后端 stats 来源（只读）：dashboard router/stats 聚合

## 完成证据模板
```
- Dashboard 挂载 diff（stats 就绪渲染、null 不渲染）
- dashboard.spec.ts mock 补字段 diff（仅加不改）
- 渲染/断言验证（Banner 出现）
- 全量门禁：build、Vitest、4173 50、8000 21
- git diff --check、删除 0、未 commit
```
