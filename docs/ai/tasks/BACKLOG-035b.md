# BACKLOG-035b 证据 — B9 挂载收口：LocalCapabilityBanner 接入 Dashboard 首屏 + E2E mock 同步

> 完成：2026-09-07 ｜ 执行：DSH 隔离 Worker（session-4fc2a0d7）｜ 状态：代码完成 + 全量门禁全绿，未 commit（交维护者复核合入）

## 改动清单

### `frontend/src/pages/Dashboard.tsx`（仅挂载，组件零改动）
- hero 之后、`TodayNeedAttention`（决策/关注区）之前插入挂载点：
  ```tsx
  {/* BACKLOG-035b：stats 就绪（非 null）后首屏渲染 LocalCapabilityBanner 能力引导；null/加载态不渲染、不闪 banner。 */}
  {stats?.capabilities ? <LocalCapabilityBanner capabilities={stats.capabilities} onNavigate={navigate} /> : null}
  ```
- 渲染条件 `stats?.capabilities`（stats 非 null 才渲染）——stats 为 null/加载中不渲染、不闪 banner（035b §目标 1 / §完成标准 ①）。
- `LocalCapabilityBanner` 为 Dashboard.tsx 自导出组件（L28-40，035 已定稿双状态），本卡**零改动组件本身**，仅接线。
- 位置选择：hero 下方、决策区之前——`dashboard-hero` 有 `margin-bottom: 16px`、`.workbench-capabilities` 自带 `margin-bottom: 16px`，首屏首屏信息层级与既有 workbench 布局一致。

### `frontend/e2e/dashboard.spec.ts`（stats mock 补 capabilities，**仅加字段，零改动既有断言**）
- `/api/dashboard/stats` mock（L20-27）补 `capabilities` 字段，形状与后端 `dashboard/stats`（local-capabilities/v1）及 `types/index.ts:351-362` 一致：
  - `model_ai: { status: 'UNCONFIGURED', quality_status: 'UNKNOWN', credential_source: 'none', model_id: 1, action_path: '/models' }`（用户默认无凭据 → warning 行 + 配置按钮）
  - `market_data: { status: 'RUNTIME_CHECK_REQUIRED', quality_status: 'UNKNOWN' }`（诚实提示行 + 去 /discover）
- 两个既有测试用例的断言逐字未动（dashboard renders evidence-first workbench / portfolio prefill），mock 只多了一个字段。

### `frontend/tests/Dashboard.test.tsx`（渲染级断言 +3）
新增 describe `Dashboard page mount of LocalCapabilityBanner (BACKLOG-035b)`，整页渲染 `<MemoryRouter><Dashboard /></MemoryRouter>`（apiClient mock 按 URL 分发）：
1. `keeps the banner hidden while stats are loading (stats null → no flash)`——stats 请求悬挂时，等决策区空态落定后断言 Banner 三个元素（model 文案/市场 pending 文案/两按钮）全部不渲染。
2. `renders the LocalCapabilityBanner on first paint once stats resolve with capabilities`——stats 返回含 capabilities → `本地核心已可用，AI 模型尚未配置` + `模型：UNCONFIGURED / UNKNOWN` + `行情源状态待检查` + `配置模型`/`去行情检索试试` 全部可见。
3. `hides the market-data pending row at page level once quality_status is OK`——market_data `quality_status: 'OK'` 时市场 pending 行不渲染，model_ai 行保留。
- 既有 7 用例（DecisionInboxPanel 2 + LocalCapabilityBanner 4 + MarketSignalAvailability 1）断言逐字未动；语义增强而非放松。

## 范围诚实声明

- 后端零改动（capabilities 只消费展示）；`frontend/e2e/` 除 dashboard.spec.ts 外零改动（e2e-8000、playwright 双 config 未触碰）；依赖/锁文件、`reference/` 零改动。
- `LocalCapabilityBanner` 组件本身（035 定稿）未改一字；i18n 零新增（复用 035 的 3 个 market key + 既有 model key；zh/en 各 2,288 keys parity 0 复核）。
- 无删除（回收站铁律未触发）；未 commit、未 push。

## 验证（本 Worker 实测）

- focused Vitest：`tests/Dashboard.test.tsx` 10/10（7 既有 + 3 新增渲染级）。
- 生产构建：`bun run build` 通过（prebuild openapi_tsgen --check + tsc -b + vite）。
- 全量 Vitest：124 files / 391 tests（388 基线 + 3 新增）。
- 4173 E2E：50/50（--retries=0）。
- 8000 E2E：21/21（--retries=0，build + uvicorn 真实入口；真实 stats 恒含 capabilities，Banner 真实可见——8000 用例不含 Banner 文案断言故零影响）。
- i18n parity：zh/en 各 2,288 keys，差集空（035 已 +3，本卡 0 新增）。
- `git diff --check` 通过；删除 0。

## 完成标准对照

1. ✅ Dashboard 首屏（stats 就绪后）可见 Banner（model_ai + market_data 双状态）
2. ✅ dashboard.spec.ts mock 补 capabilities（仅加字段）；4173 E2E 50/50 全绿、既有断言零改动
3. ✅ build、Vitest 全量 124/391、8000 E2E 21/21 全绿；i18n parity 0
4. ✅ git diff --check 通过、删除 0；工作树未 commit（交维护者复核）
