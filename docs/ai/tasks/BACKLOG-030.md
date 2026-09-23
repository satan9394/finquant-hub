# BACKLOG-030 — B12 重做②低风险批：顶部 MetricStrip 删除 + FinancialMetric 空值直传 + MDD 语义复核

> 状态：`[DONE]` ｜ 优先级：P1 ｜ 创建：2026-09-05 ｜ 完成：2026-09-05 ｜ 执行者：DSH
> 背景：B12 设计（`docs/ai/astra-review/b12-design-2026-09-05.md`）已由任务29产出、维护者审阅通过。本卡为 B12 拆分的**第一张顺序执行卡**，只做设计中的 ②-C/②-E/②-D（风险最低、E2E 影响已核为零的三步），其余步骤在 BACKLOG-031（②-A/B）与 BACKLOG-032（重做①）。

## 目标与范围（与任务卡一致）

- **②-C**：删除 StrategyLab 顶部独立 4 格 MetricStrip（CAGR/Sharpe/MDD/win-rate，原 `StrategyLab.tsx:706-713`）；**保留** BacktestSummary 内全部 `metric-*` data-testid 与结论 Alert（4173 `core-paths.spec.ts:186` 断言 `metric-total-return` 含 `+12.00%`）。`MetricStrip` 组件本身保留（StockAnalysis/PortfolioOverview 仍用）。
- **②-E**：BacktestSummary `pct()` 遇 null 返回 null（不再 pre-format `'—'`），value 原始直传；quality 按真实来源推导（值缺失 → `UNKNOWN`，来源上游错误 → `UPSTREAM_ERROR`，部分完整 → `PARTIAL`，否则 `OK`），不再恒 `"OK"`；FinancialMetric 显示层承接 null 显示 unknown 占位（组件已有该能力，未改 API）。
- **②-D**：顶部 MetricStrip 删除后全站 MDD 表达唯一化到 BacktestSummary（已是 `tone:'risk'` / `--fq-risk`）；复核全站无其他 MDD 用 `--fq-price-down`/绿。

## 实施证据

### ②-C diff（StrategyLab 删顶部 MetricStrip）与 metric-* 保留 grep 证据

- `frontend/src/pages/StrategyLab.tsx`：删除 `<MetricStrip items={[cagr/sharpe/mdd/win-rate]}/>`（原 L706-713，其中 MDD `tone:'down'` 即唯一一处绿色 MDD 表达）与 `import MetricStrip from '../components/MetricStrip';`（删除后该 import 变孤立）。`backtest-completed` section、Tabs、overview 内 BacktestSummary 顺序不变。
- `metric-*` 保留 grep 证据（BacktestSummary 内 data-testid 全部在位）：
  - `metric-total-return` / `metric-benchmark-return` / `metric-excess-return` / `metric-max-drawdown` / `metric-recovery` / `metric-trade-count`：`BacktestSummary.tsx:72-77`（metricCards 数组）
  - 折叠区 `metric-annualized-return`…`metric-trading-cost`：`BacktestSummary.tsx:33-55`
  - 结论 Alert：`BacktestSummary.tsx:82`
- E2E 实测：4173 `core-paths.spec.ts` strategy 用例（`metric-total-return` 含 `+12.00%`、`回测结论摘要` heading、`保存实验`、权益曲线 canvas）**50/50 全绿**，未改任何断言。
- 测试同步（语义不放松）：`StrategyLab.test.tsx` **无**对顶部 MetricStrip 的断言（grep CAGR/Sharpe/MDD/win-rate/MetricStrip 0 匹配），等价信息断言本就在 BacktestSummary.test.tsx，故无需删改；StrategyLab 10/10 全绿。

### ②-E diff（pct/quality/FinancialMetric 显示层）与测试同步

- `frontend/src/components/strategy/BacktestSummary.tsx`：
  1. `pct()` 改为 `string | null`（null 直传）；新增 `pctText()` 供 Statistic/拼接处兜底 `'—'`（professional/p1Diagnostics/costSummary 全部改用 `pctText`）。
  2. `recovery` 在 `max_drawdown_recovered === undefined` 时返回 **null**（原 `'—'`），六张指标卡 value 原样传 `FinancialMetric`。
  3. 新增 `qualityOf(value)`：`value == null → 'UNKNOWN'`；`run.provenance.quality_flags` 含 `UPSTREAM_ERROR → 'UPSTREAM_ERROR'`；flags 非空 → `'PARTIAL'`；否则 `'OK'`——不再恒 `"OK"`。
  4. 新增 `toneOf(tone, value)`：`risk` 保持；`return` 且值为 null → `neutral`（不再把 unknown 误标为绿 `down`）；非 null 保持原 up/down 语义。
- `frontend/src/components/FinancialMetric.tsx`：显示层原本已实现 `value == null || value === '' → t('financialMetric.unknown')` 与 `quality !== 'OK'` 时展示 quality 标记（L26/L32）——**API 与行为零改动**，空值短路问题根因在 BacktestSummary 的 pre-format，本卡已移除。无新 i18n key（复用 `financialMetric.unknown`），zh/en parity 0 保持（实测 2,274/2,274，双向差集 0、重复 0）。
- 测试同步（语义不变，空值不再冒充 OK）：`BacktestSummary.test.tsx` legacy 空 metrics 用例断言从 `metric-recovery` 含 `'—'` 改为**含 `'未知'` 且不含 `'—'`**（即"显示 unknown 占位而非假 OK"）；非空 fixture 下 `+12.00%`/`+15.00%`/`-3.00%`/`-24.00%`/`已恢复 · 2期` 断言全部原样保留（BacktestSummary 3/3 全绿）。

### ②-D MDD 语义全站扫描结果（删除后）

- `StrategyLab.tsx`：MDD 绿色表达（顶部条 `tone:'down'`）**已删除**；其余 MDD 引用为纯文本（method 面板回撤止损 `pct()`、warnings 标签）无红绿语义。
- `BacktestSummary.tsx`：`metric-max-drawdown` 卡 `tone:'risk'` → `--fq-risk`（`app.css:753 .financial-metric--risk`）——**全站唯一带语义色的 MDD 表达**。
- 其余 MDD 展示均为中性文本/Statistic：`AlphaSimulationWorkbench.tsx:227`、`ExperimentWorkbench.tsx:111`、`ComparisonWorkspace.tsx:102`、`PortfolioRiskWorkbench.tsx:267/426`、`BacktestCharts.tsx:24`（drawdownSummary 文案）。
- `--fq-price-down` 其余使用均为**收益/价格方向**（B4 允许：收益方向用 up/down）：`Portfolio.tsx:31`（PnL 方向）、`StockChart.tsx:109/114`（价格方向）、`app.css:345 .price-down`、`app.css:752 .financial-metric--down`（BacktestSummary excess-return 负值卡，收益方向）、`app.css:827 .metric-strip__item--down`（StockAnalysis 价格 / PortfolioOverview 盈亏方向）。
- 结论：**全站无 MDD 用 `--fq-price-down`/绿表达，MDD 语义唯一化为 `--fq-risk`**。

## 全量门禁（全部实测通过）

- frontend build：`bun run build` 通过（4,243 modules，tsc -b + vite build，prebuild openapi_tsgen --check OK）。
- Vitest：聚焦 3 文件 15/15（StrategyLab 10/10、BacktestSummary 3/3、MetricStrip 2/2）；全量 **123 文件 378/378**（首轮全量在四任务并发压测下 1 例 Thesis 5s 超时、与本次改动无关——Thesis.tsx 不引用任何改动文件；单跑 Thesis 通过后全量独占复跑 378/378 全绿）。
- 4173 E2E：**50/50**（`--retries=0`，断言零改动）。
- 8000 E2E：**21/21**（`--retries=0`，断言零改动）。
- backend：**851/851**，覆盖率 92.52%（≥80% 门槛；**零后端改动**确认：`git diff` 仅 3 个前端文件）。
- i18n parity：zh/en 各 **2,274** key，双向差集 0、重复 0（本卡零新增 key）。
- `git diff --check`：通过；**删除 0**（仅 `M` 状态 3 文件）；依赖/锁文件、`reference/`、E2E 目录、playwright config 零变化；未使用 `channel: 'chrome'`；**未 commit、未 push**（按任务卡要求）。

## 允许修改清单核对

- 改动：`frontend/src/pages/StrategyLab.tsx`、`frontend/src/components/strategy/BacktestSummary.tsx`、`frontend/tests/BacktestSummary.test.tsx`（3 文件）
- 未改动（允许但无需）：`FinancialMetric.tsx`（显示层已达标）、`app.css`（占位样式已存在）、`StrategyLab.test.tsx`（无顶部条断言）、`MetricStrip.tsx`（保留通用）
- 证据文档：本卡 + `docs/ai/EXEC_PLAN.md` + `task/CHANGELOG.md`

## 边界核对

- 未实施 ②-A/②-B（BACKLOG-031）与重做①（BACKLOG-032）；未删任何文件（回收站铁律）；未改后端/依赖/E2E/playwright config/`reference/`；未放宽任何既有断言语义（StrategyLab 测试无顶部条断言故零改动；BacktestSummary 空值断言改为"显示 unknown 而非假 OK"）。
