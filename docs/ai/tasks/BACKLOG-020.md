# BACKLOG-020 — 筹码分布历史序列走势图

> 状态：`[READY]` ｜ 优先级：P1 ｜ 创建：2026-09-02 ｜ 执行者：Codex
> 背景：A 股证据主线对称补全。BACKLOG-013 给资金流向卡片加了走势图（最新快照 → 时间序列），但筹码分布卡片（ResearchWorkspace）仍只显示 `chips.latest` 快照（获利比例/平均成本/90-70 成本区间/集中度）。服务端 `fetch_chip_distribution` 返回的 `items` 数组已含**全部历史筹码数据**（每交易日一条），前端类型 `ChipDistributionItem` 已定义。本任务把筹码卡片升级为"快照 + 历史序列走势图"，与资金流走势图对称。
>
> **开工前必读（维护者调研结论，勿跳过）**：
> 1. **零后端改动、零新依赖**：服务端 `backend/app/services/chip_distribution.py` L93-104 返回 `{symbol, source, methodology, latest, items}`；`items` 为 `ChipDistributionItem[]`（已按 date 升序排序）。前端类型 `frontend/src/types/research.ts` L84-98：`ChipDistributionItem = { date, profit_ratio, average_cost, cost_90{low,high,concentration}, cost_70{...}, chip_peak }`。前端卡片已在 `loadWorkspace` 的 allSettled 里取 `chips`（A 股守卫 `/^\d{6}$/`），**数据现成**。
> 2. **图表复用策略（维护者已定，勿改）**：**不抽象/不改既有 `MoneyFlowChart`**（`data-testid="money-flow-chart"`、内部映射 `moneyFlowToAreaData`，BACKLOG-013 产物，回归风险高）。新建独立 `ChipHistoryChart.tsx`，复用 `useLightweightCharts` 的 `switchToArea`（Area 序列，零 hook 改动，theme="light" + readChartTokens 自动适配）。**仅当**把"绘图容器 + switchToArea"抽成通用 `AreaChart` 且 MoneyFlowChart 一并改用能在测试零回归时，才允许抽公共组件；否则保持独立（推荐独立，最小改动）。
> 3. **纯函数**：新建 `frontend/src/utils/chipChart.ts`——`chipToAreaData(items, field: 'profit_ratio' | 'average_cost'): AreaChartData[]`，`date` 直接作为 lightweight-charts 时间（`YYYY-MM-DD` 字符串，日频）；`profit_ratio` 是 0-1 小数（展示可转百分比，**在纯函数里保持原值**，前端渲染时决定），`average_cost` 是价格。无效点（date 空、数值非有限）**丢弃不补造**。
> 4. **落点**：ResearchWorkspace 筹码卡片（`data-testid` 暂未加，可加 `chip-card`）内，既有 `Descriptions` 快照下方新增走势图区 + 字段切换（获利比例/平均成本，用 `Segmented`，参照资金流 period 切换）。**切换纯前端 state，不重新请求**（数据已在 `chips.items`）。
> 5. **诚实纪律**：`items` 为空或映射后为空 → Empty 占位（i18n 新 key，措辞沿用"未用估算值替代"风格）；不插值、不补造。`chip_peak` 为 null 不画峰线。
> 6. **不回归**：既有筹码卡片快照（Statistic/Descriptions）保持；`MoneyFlowChart`/`moneyFlowChart.ts`/资金流卡片不动；既有 E2E 与组件测试断言语义不放松（DOM 变化可更新断言）。

---

## 允许修改

- `frontend/src/utils/chipChart.ts`（**新建**，纯函数）
- `frontend/src/components/ChipHistoryChart.tsx`（**新建**）
- `frontend/src/pages/ResearchWorkspace.tsx`（筹码卡片内接入走势图 + 字段切换）
- `frontend/src/i18n/zh.ts`、`frontend/src/i18n/en.ts`（新增 key 双语同步，parity 差集 0）
- `frontend/tests/chipChart.test.ts`（**新建**）、`frontend/tests/ChipHistoryChart.test.tsx`（**新建**）、`frontend/tests/ResearchWorkspaceEvidence.test.tsx`（扩展筹码用例）
- `frontend/e2e/money-flow.spec.ts` 或新建 `frontend/e2e/chip-chart.spec.ts`（**新增 1 轻量用例**：筹码卡片出现图表容器 + 切换字段不重新请求；canvas 内容不断言）
- `docs/ai/tasks/BACKLOG-020.md`、`docs/ai/EXEC_PLAN.md`、`task/CHANGELOG.md`

## 禁止修改

- `backend/` 全部
- `frontend/src/hooks/useLightweightCharts.ts`、`frontend/src/components/MoneyFlowChart.tsx`、`frontend/src/utils/moneyFlowChart.ts`、`frontend/src/pages/ResearchWorkspace.tsx` 的资金流/龙虎榜部分
- `frontend/playwright.config.ts`
- 既有 E2E 断言语义（DOM 变化可更新断言不得放宽语义）
- 其他页面/组件（LimitPool/Discover/StockAnalysis 只读）
- **不新增任何 npm/Python 依赖**；**不删除任何文件**

---

## 完成标准

### 目标 1：纯函数 `chipToAreaData`（可测）

`frontend/src/utils/chipChart.ts`：
- `chipToAreaData(items: ChipDistributionItem[], field: 'profit_ratio' | 'average_cost'): AreaChartData[]`
- 返回 `{ time: item.date, value: item[field] }`（date 直接字符串）；`field` 值 null/NaN/±Infinity 或 `date` 空 → 丢弃；返回新数组不修改入参
- 导出类型 `ChipSeriesField = 'profit_ratio' | 'average_cost'`

### 目标 2：`ChipHistoryChart` 组件（新建）

`frontend/src/components/ChipHistoryChart.tsx`：
- props：`items: ChipDistributionItem[]`、`field: ChipSeriesField`、`height?`（默认 ~260）
- 内部 `useLightweightCharts({theme:'light', autoSize:true, height}, ref)` + `useEffect` 中 `switchToArea(data)`（data 由 `chipToAreaData` useMemo 映射）
- 空序列 → Empty（i18n `research.chips.chartEmpty`）；容器 `data-testid="chip-history-chart"`
- 不读色、不引其他图表库

### 目标 3：ResearchWorkspace 筹码卡片接入

- 筹码卡片（建议加 `data-testid="chip-card"`）`Descriptions` 下方新增：
  - `Segmented` 字段切换（`获利比例` / `平均成本`，i18n `research.chips.series.profitRatio`/`research.chips.series.averageCost`），本地 state `chipSeriesField`（默认 `profit_ratio`），**切换不重新请求**（数据已在 items）
  - `<ChipHistoryChart items={chips.items} field={chipSeriesField} />`
  - 仅 A 股卡片（既有守卫天然满足）；仅 `chips?.items.length` 有数据时渲染，否则沿用现有 Empty
- i18n（zh/en 同步）：`research.chips.chart`（图表区标题，如"历史走势"）、`research.chips.chartEmpty`（无序列占位，沿用诚实措辞）、`research.chips.series.profitRatio`、`research.chips.series.averageCost`、`research.chips.seriesSwitch`（切换可访问标签）
- `profit_ratio` 展示时转百分比（值 ×100 + %），但纯函数保持原值

### 目标 4：测试与验证

- **纯函数** `frontend/tests/chipChart.test.ts`：≥3 用例——profit_ratio 映射保真、average_cost 映射、无效点（null/NaN/date 空）过滤 + 入参不变
- **组件** `frontend/tests/ChipHistoryChart.test.tsx`（jsdom）：≥2 用例——有数据渲染 `chip-history-chart` 容器且 switchToArea 收到映射数据、空 items 渲染 Empty 不建图（mock useLightweightCharts，参照 MoneyFlowChart.test.tsx）
- **ResearchWorkspaceEvidence 扩展**：≥1 用例——筹码卡片渲染图表容器、切换字段后不重新请求（`fetchChipDistribution` 调用数不变）且图表 field 变化；mock researchApi（参照既有 chips mock）
- **E2E**：+1 轻量用例（新建 `chip-chart.spec.ts` 或并入 money-flow.spec）——mock `/api/instruments/600519/chip-distribution` 返回多 items，断言 `chip-history-chart` 容器出现 + 切换字段不触发新请求；canvas 不断言
- 全量门禁：`cd frontend && bun run build`（4,242 modules 基线）、`bun run test`（121 files/337 tests 基线 + 新增）、`bun run e2e`（47 基线 + 1，保持 workers:2/retries:1）；`git diff --check` 通过
- **零后端改动、零新依赖、无删除**

### 目标 5：文档同步

- `docs/ai/EXEC_PLAN.md` 标记 `[DONE]`（证据：纯函数/组件/测试数/门禁）
- `task/CHANGELOG.md` 追加一条（**带 `## YYYY-MM-DD` 标题行**）

---

## 参考

- 服务端结构（只读）：`backend/app/services/chip_distribution.py` L93-104（items/latest）
- 前端类型（只读）：`frontend/src/types/research.ts` L84-98（`ChipDistributionItem`/`ChipDistributionResponse`）
- 对称先例：`frontend/src/utils/moneyFlowChart.ts` + `frontend/src/components/MoneyFlowChart.tsx`（BACKLOG-013，**只读参考，不改**）
- hook（只读）：`frontend/src/hooks/useLightweightCharts.ts`（`switchToArea`/`setAreaData`）；`frontend/src/types/index.ts`（`AreaChartData`）
- 落点：`frontend/src/pages/ResearchWorkspace.tsx` 筹码卡片（L643-655 快照区）
- 测试先例：`frontend/tests/moneyFlowChart.test.ts`、`frontend/tests/MoneyFlowChart.test.tsx`（mock hook）、`frontend/tests/ResearchWorkspaceEvidence.test.tsx`、`frontend/e2e/money-flow.spec.ts`（mock 整个 workspace）

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

- 修改文件清单（纯函数/组件/页面/i18n/测试/文档）
- 纯函数与组件清单（签名、props、渲染行为）
- 测试数；全量套件结果（build/Vitest/E2E 前后对比）
- 依赖变化（应为零）；后端零改动确认；MoneyFlowChart 未动确认
- 记录决策确认（独立组件不抽公共；字段切换不重请求；无效点丢弃不补造；profit_ratio 前端转百分比）
