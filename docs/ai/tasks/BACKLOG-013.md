# BACKLOG-013 — 资金流向走势图：证据卡片从快照升级为时间序列

> 状态：`[READY]` ｜ 优先级：P1 ｜ 创建：2026-09-01 ｜ 执行者：Codex
> 背景：BACKLOG-012 已把资金流向接上 ResearchWorkspace（`/api/instruments/{symbol}/money-flow` 端点 + 资金流向证据卡片）。当前卡片只显示**最新五档净流入快照**（主力/超大单/大单/中单/小单），而服务端 `money_flow` 返回的 `items` 里已有完整分钟序列（push2 klt=1 全天分时）与 120 日序列（push2his daykline），前端未绘图——数据在，证据没用起来。本任务把资金流向卡片从"最新快照"升级为"快照 + 时间序列走势图"，并在卡片内提供 **分钟 / 120 日**周期切换。
>
> **开工前必读（维护者调研结论，勿跳过）**：
> 1. **零后端改动、零新依赖**：本任务纯前端。服务端 `money_flow` 已返回 `{time|date, main_net, small_net, medium_net, large_net, super_large_net}` 的 `items`（`backend/app/services/a_stock_extra.py` L311-354；分钟项 `time` 形如 `"2026-08-31 14:59"`，120 日项 `date` 形如 `"2026-08-31"`），前端类型 `MoneyFlowItem` 已定义（`frontend/src/types/research.ts`）。
> 2. **图表复用现有 hook，零改动**：`frontend/src/hooks/useLightweightCharts.ts` 已暴露 `setAreaData(data: AreaChartData[])` 与 `switchToArea(data)`（Area 序列，L162-171/L203-209）；`AreaChartData = { time: UTCTimestamp | string, value: number }`（`frontend/src/types/index.ts` L424）。**禁止修改此 hook**。
> 3. **主题沿用现有先例**：现有 `StockChart` 在 `StockAnalysis.tsx` L189 硬编码 `theme="light"`；且 `readChartTokens()`（`frontend/src/styles/themeTokens.ts`）通过 `getComputedStyle` 读 `.app-theme` CSS 变量，**自动适配亮/暗**。新组件照此传 `theme="light"` 即可。
> 4. **时间转换**：分钟序列是中国时间（东财交易所时区），中国无夏令时，可用固定 UTC+8 纯函数解析 `"YYYY-MM-DD HH:MM"` → epoch 秒（`Date.UTC(y, m-1, d, hh, mm) - 8*3600*1000`），**不引入 dayjs 时区插件**；120 日序列直接传 `"YYYY-MM-DD"` 字符串给 lightweight-charts。
> 5. **落点**：ResearchWorkspace 资金流向卡片（`frontend/src/pages/ResearchWorkspace.tsx`，BACKLOG-012 新增，`data-testid="money-flow-card"`）五档快照 `Row` 下方新增图表区 + `Segmented`（分钟/120 日）周期切换。
> 6. **诚实数据纪律**：`items` 中的无效点（时间解析失败、金额非有限值）一律**丢弃**，不补造、不插值。

---

## 允许修改

- `frontend/src/utils/formatAStock.ts`（**追加**纯函数，或新建 `frontend/src/utils/moneyFlowChart.ts`——建议新建保持单一职责）
- `frontend/src/components/MoneyFlowChart.tsx`（**新建**）
- `frontend/src/pages/ResearchWorkspace.tsx`（资金流向卡片接入图表 + 周期切换）
- `frontend/src/i18n/zh.ts`、`frontend/src/i18n/en.ts`（新增 key 双语同步，parity 差集 0）
- `frontend/tests/`（新增/扩展：`moneyFlowChart.test.ts`、`MoneyFlowChart.test.tsx`、扩展 `ResearchWorkspaceEvidence.test.tsx`）
- `frontend/e2e/`（**新增** 1 个轻量用例文件或追加到既有 research spec；不改既有断言语义，见目标 4）
- `docs/ai/tasks/BACKLOG-013.md`、`docs/ai/EXEC_PLAN.md`、`task/CHANGELOG.md`

## 禁止修改

- `backend/` 全部（服务层、router、schema、auth、测试）
- `frontend/src/hooks/useLightweightCharts.ts`（hook 已有 Area 能力，无需改）
- `frontend/playwright.config.ts`（保持 workers:2 / retries:1）
- 既有 E2E 断言语义（DOM 变化可更新断言，不得放宽语义）
- 其他页面/组件行为（Discover/Dashboard/StockAnalysis/LimitPool 只读）
- **不新增任何 npm/Python 依赖**（尤其不引入 dayjs 时区插件、echarts 之外的图表库）；**不删除任何文件**（如需清理走回收站）

---

## 完成标准

### 目标 1：纯函数（可测）

在 `frontend/src/utils/moneyFlowChart.ts`（新建）实现：
- `moneyFlowTimeToEpoch(time: string): number | null`——解析 `"YYYY-MM-DD HH:MM"` 为 **Asia/Shanghai** epoch 秒（固定 UTC+8，`Date.UTC - 8h`）；解析失败返回 `null`（不抛错）
- `moneyFlowToAreaData(items: MoneyFlowItem[], period: 'minute' | '120d'): AreaChartData[]`——`minute` → `{ time: epoch 秒, value: main_net }`（用 `moneyFlowTimeToEpoch`，null 丢弃）；`120d` → `{ time: "YYYY-MM-DD", value: main_net }`（原样字符串）；金额非有限值（null/NaN/±Infinity）丢弃；返回新数组不修改入参

> 说明：`MoneyFlowItem` 的 `main_net` 为可选字段，映射时按 `value ?? null` 处理并过滤。

### 目标 2：MoneyFlowChart 组件（新建）

`frontend/src/components/MoneyFlowChart.tsx`：
- props：`items: MoneyFlowItem[]`、`period: 'minute' | '120d'`、`height?: number`（默认约 260）
- 内部：`containerRef` + `useLightweightCharts({ theme: 'light', autoSize: true, height }, containerRef)`；`useMemo` 映射 `moneyFlowToAreaData`；`useEffect` 中 `switchToArea(mapped)`（items 变化或 period 变化时重设）
- `items` 为空或映射后为空 → 渲染 Empty/占位（文案走 i18n `research.moneyFlow.chartEmpty`），不创建空图
- 容器加 `data-testid="money-flow-chart"`；图表外层可用既有 `TimeseriesChart` 外壳（`frontend/src/components/TimeseriesChart.tsx`，仅 title + SourceChip + children）或纯 `<div>`——**选其一，保持最小**
- 用 `readChartTokens` 已有配色（hook 内部处理），组件本身不读色

### 目标 3：ResearchWorkspace 资金流向卡片接入

`frontend/src/pages/ResearchWorkspace.tsx` 资金流向卡片内：
- 新增 state：`moneyFlowPeriod: 'minute' | '120d'`（默认 `'minute'`）；`loadWorkspace` 的 `moneyFlowRequest` 用当前 `moneyFlowPeriod`
- 五档快照 `Row` 下方新增周期 `Segmented`（选项 `minute`/`120d`，标签复用 `research.moneyFlow.period.minute`/`research.moneyFlow.period.120d`）+ `<MoneyFlowChart items={moneyFlow.items} period={moneyFlow.period} />`
- 切换周期只重取资金流（`fetchMoneyFlow(currentSymbol, period)` → `setMoneyFlow`），**不动**其他六个 allSettled 结果；切换期间卡片显示 loading 或保留旧数据（选其一，注明）
- 仅 A 股 6 位代码卡片内渲染（既有 `/^\d{6}$/` 守卫已包住整个卡片，天然满足）
- 新增 i18n（zh/en 同步）：`research.moneyFlow.chart`（图表区标题，如"主力资金走势"）、`research.moneyFlow.chartEmpty`（无序列占位文案，沿用诚实措辞"暂无资金流序列；未用估算值替代"）、`research.moneyFlow.periodSwitch`（切换可访问标签）

### 目标 4：测试与验证

- **Vitest 纯函数**（`frontend/tests/moneyFlowChart.test.ts`）：≥4 用例——分钟→epoch 正确性（含跨日/零填充、`"2026-08-31 14:59"` → 精确秒值）、坏时间 → null、120d 映射保真、无效金额点过滤
- **MoneyFlowChart 组件测试**（`frontend/tests/MoneyFlowChart.test.tsx`，jsdom）：≥2 用例——有数据渲染 chart 容器（`data-testid="money-flow-chart"`）、空 items 渲染占位不崩溃
- **ResearchWorkspace 证据卡片扩展**（`frontend/tests/ResearchWorkspaceEvidence.test.tsx`）：≥1 用例——切换 period 后 `fetchMoneyFlow` 以新 period 被调用且卡片更新；或断言图表容器随数据出现
- **E2E**：新增 ≤2 个轻量用例（可追加到既有 `research-*` spec 或新建 `e2e/money-flow.spec.ts`）——用 `mockApi` 断言资金流卡片含 `data-testid="money-flow-chart"` 且切换 120 日后请求携带 `period=120d`；canvas 内容不断言
- 全量门禁：`cd frontend && bun run build`（4,240 modules 基线）、`bun run test`（118 files/318 tests 基线 + 新增）、`bun run e2e`（43 基线 + 新增，保持 workers:2/retries:1 稳定）；`git diff --check` 通过
- **零后端改动、零新依赖、无删除**

### 目标 5：文档同步

- `docs/ai/EXEC_PLAN.md` 标记 `[DONE]`（证据：组件/纯函数/测试数/门禁结果）
- `task/CHANGELOG.md` 追加一条
- 无新端点 → `docs/API_CONTRACT.md` 不需改（若改了端点才需同步，本任务不改）

---

## 参考

- 服务端数据结构（只读）：`backend/app/services/a_stock_extra.py` L311-354（`money_flow` 返回与 `items` 结构）；前端类型 `frontend/src/types/research.ts`（`MoneyFlowResponse`/`MoneyFlowItem`）
- hook（只读）：`frontend/src/hooks/useLightweightCharts.ts` L162-171（`setAreaData`）、L203-209（`switchToArea`）；`frontend/src/types/index.ts` L424（`AreaChartData`）
- 主题（只读）：`frontend/src/styles/themeTokens.ts`（`readChartTokens` 自动适配）
- 先例：`frontend/src/components/StockChart.tsx`（`useLightweightCharts` + `theme="light"` 用法）、`frontend/src/pages/StockAnalysis.tsx` L189（TimeseriesChart 外壳用法）
- 落点：`frontend/src/pages/ResearchWorkspace.tsx` 资金流向卡片（BACKLOG-012 新增，`data-testid="money-flow-card"`）；fetcher `frontend/src/services/researchApi.ts` `fetchMoneyFlow(symbol, period)`
- 测试先例：`frontend/tests/ResearchWorkspaceEvidence.test.tsx`（mock researchApi 范式）、`frontend/e2e/helpers.ts`（mockApi）

## 验证命令

```powershell
cd frontend
$env:Path = "D:\Technology_application\NVM_Windows\nvm_a\v22.19.0;$env:Path"
& "D:\Technology_application\NVM_Windows\nvm_a\v22.19.0\bun.exe" run build
& "D:\Technology_application\NVM_Windows\nvm_a\v22.19.0\bun.exe" run test
& "D:\Technology_application\NVM_Windows\nvm_a\v22.19.0\bun.exe" run test:e2e
cd .. && git diff --check
```

## 完成证据（执行后填写）

- 修改文件清单（组件/纯函数/页面/i18n/测试/文档）
- 纯函数与组件清单（函数签名、组件 props、渲染行为）
- 测试数；全量套件结果（build/Vitest/E2E 前后对比）
- 依赖变化（应为零）；后端零改动确认
- 记录决策确认（图表用 Area 序列、主题沿用 light + CSS 变量自适应、无效点丢弃不补造）
