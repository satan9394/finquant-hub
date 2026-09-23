# BACKLOG-035 证据 — B9 首用能力引导：LocalCapabilityBanner 双状态（model_ai + market_data）

> 完成：2026-09-07 ｜ 执行：DSH 隔离 Worker（session-4fc2a0d7）｜ 状态：代码完成 + 全量门禁全绿，未 commit（交维护者复核合入）

## 改动清单

### `frontend/src/pages/Dashboard.tsx`（LocalCapabilityBanner L28-40）
- **双状态分层**：组件从单个 `<Alert>` 改为 `<div className="workbench-capabilities">` 包两个 Alert——①model_ai 行（原样保留，type/message/description/action/onNavigate(action_path) 逐字段未动）；②market_data 行（仅当 `quality_status !== 'OK'` 时渲染）。
- **market_data 可用性判定**：仅 `quality_status === 'OK'` 视为"已运行时确认可用"；当前后端契约恒发 `status: RUNTIME_CHECK_REQUIRED` + `quality_status: UNKNOWN`（dashboard.py L179-182），因此本地首用必显示诚实提示。判定经 `const marketDataQuality: string = …` 宽化后再比较——`types/index.ts:362` 只声明了 `'UNKNOWN'` 字面量（该文件不在本卡允许清单，未改），宽化后未来后端若放宽为 OK/PARTIAL/UPSTREAM_ERROR 等值本行逻辑依然成立（TS2367 已消）。
- **文案/动作**：非可用 → warning Alert，message=`today.capability.marketPending`，description=`today.capability.marketPendingDescription`，action=`去行情检索试试` → `onNavigate('/discover')`（行情/发现语境页，动作有真实落点，不空转）。
- **model_ai 零回归**：既有 key/文案/按钮/导航/类型分支全部原样；本卡测试里第一、二条用例断言逐字未动。

### `frontend/src/app.css`（L714 后 +1 行）
- `.workbench-capabilities .ant-alert + .ant-alert { margin-top: 8px; }` —— 双 Alert 纵向分层 8px 间隙，沿用既有 `.workbench-capabilities` 与 AntD Alert 样式语义；无新组件/新依赖/新 token。

### `frontend/src/i18n/zh.ts` + `en.ts`（各 +3 key）
- `today.capability.marketPending`：行情源状态待检查——行情数据可能暂不可用 / Market data source status pending — quotes may be temporarily unavailable
- `today.capability.marketPendingDescription`：本地部署启动时不会自动联网核验行情源；若网络或上游源异常，行情数据可能暂不可用，请检查网络后重试。 / The local deployment does not verify market sources at startup. If the network or an upstream source is failing, quotes may be temporarily unavailable — check the network and retry later.
- `today.capability.marketExplore`：去行情检索试试 / Try market discovery
- zh/en 各 2285→2288 keys；parity 0（差集空、无重复）；既有 `today.capability.*`（configured/unconfigured/status/configuredDescription/unconfiguredDescription/test/configure）**未动一字**。

### `frontend/tests/Dashboard.test.tsx`（LocalCapabilityBanner +2 用例）
1. `keeps the model row intact when market data is pending and adds an honest pending row`：RUNTIME_CHECK_REQUIRED + UNKNOWN 下——model 行文案/按钮仍 `本地核心已可用…`/`配置模型` 且点按 navigate('/models')；市场行诚实提示 `行情源状态待检查` + `检查网络后重试` 可见，`去行情检索试试` 点按 navigate('/discover')。
2. `hides the market-data pending row once quality_status is confirmed OK`：`quality_status: 'OK'` 时——model 行保留，市场 pending 文案与按钮**不渲染**。
- 既有两用例（missing model / configured-unverified）断言逐字未改；语义增强而非放松。

## 范围诚实声明

- **`LocalCapabilityBanner` 目前未被挂载到任何页面渲染**（仅定义导出 + 单测覆盖）：git 全历史 grep `<LocalCapabilityBanner` 的挂载点只存在于 fdcc535/8a0be88（旧 Dashboard），8a0be88 重构后 Dashboard 渲染区已不再渲染该组件；HEAD 下全 src 无第二处引用。dashboard.spec.ts 的 `/api/dashboard/stats` mock（L20-27）也完全不含 `capabilities` 字段——**挂载该 Banner 进页面会需要同步改 E2E mock，而 E2E/playwright 是本卡禁止范围**。因此本卡按卡内 §允许 的范围落成"组件级双状态 + i18n + 单测"，未把未挂载组件擅自接进 Dashboard 渲染区（那属于另行决策/另一张卡）。诚实记录：**成品 Banner 变更目前只被单元测试直接验证，未在真实页面 DOM 中出现**。
- 后端零改动（仅只读核实 dashboard.py capabilities 来源）；dashboard/stats 未加字段。
- E2E/playwright config、依赖/锁文件、reference/、既有 E2E 断言零改动；无删除（回收站铁律未触发——本卡无删除操作）；未 commit、未 push。
- "干净机器首用深度引导"未实施（超本卡，维持 BACKLOG-035 卡内记录）。

## 验证（本 Worker 实测）

- i18n parity：zh/en 各 2,288 keys，差集空、重复 0（脚本核对）。
- focused Vitest：Dashboard.test.tsx 7/7 通过。
- 生产构建：`bun run build` 通过（tsc -b + vite；首轮 TS2367 因 `types/index.ts` 字面量 `'UNKNOWN'` 与 `'OK'` 比较触发，经组件内 string 宽化修复——未越权改 types 文件）。
- 全量 Vitest：124 files / 388 tests 全绿（386 基线 + 2 新增），707.29s。
- 4173 E2E：50/50（--retries=0）。
- 8000 E2E：21/21（--retries=0，配置自带 build + 8000 uvicorn 真实入口）。
- `git diff --check` 通过；删除 0；工作树仅本卡允许文件（+证据文档）。

## 完成标准对照

1. ✅ Banner 双状态（model_ai 行原样 + market_data 非 OK 诚实提示 + 动作落 /discover）
2. ✅ i18n zh/en parity 0（+3 key/每语言）；既有 model_ai 文案/测试零回归
3. ✅ build、Vitest 全量 124/388、4173 50/50、8000 21/21 全绿
4. ✅ git diff --check 通过、删除 0；工作树未 commit（交维护者复核）
