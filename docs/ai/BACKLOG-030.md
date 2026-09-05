# BACKLOG-030 — B12 重做② 低风险批：顶部 MetricStrip 删除 + FinancialMetric 空值直传 + MDD 语义复核

> 状态：`[READY]` ｜ 优先级：P1 ｜ 创建：2026-09-05 ｜ 完成：— ｜ 执行：DSH
> 背景：B12 设计（`docs/ai/astra-review/b12-design-2026-09-05.md`）已由任务29产出、维护者审阅通过。本卡为 B12 拆分的**第一张顺序执行卡**，只做设计中的 ②-C/②-E/②-D（风险最低、E2E 影响已核为零的三步），其余步骤在 BACKLOG-031/032。

## 目标

### ②-C：删除 StrategyLab 顶部重复 MetricStrip
- 现状：完成后顺序 = StrategyLab 顶部 MetricStrip（`StrategyLab.tsx:706-713`，CAGR/Sharpe/MDD/win-rate，MDD `tone:'down'` 绿）→ Tabs → overview 内 BacktestSummary（结论 Alert → 指标行 → 限制）。顶部 4 格与 BacktestSummary 内指标**重复**（annualized_return=CAGR、max_drawdown=MDD 均已在 BacktestSummary 有 data-testid 展示）。
- 改法：删除 `StrategyLab.tsx:708-713` 顶部 MetricStrip（及若变孤立的 import/state）。`MetricStrip` 组件本身保留（通用）。
- **关键约束**：BacktestSummary 内 `metric-total-return` 等全部 data-testid 与结论 Alert **必须保留**（4173 core-paths:186 断言 `metric-total-return` 含 `+12.00%`）——只删 StrategyLab 顶部那个独立 4 格，绝不删 BacktestSummary 内指标。
- 同步：`tests/StrategyLab.test.tsx` 若断言顶部 MetricStrip 出现则删该断言（**语义等价信息仍在 BacktestSummary，非放松**）。

### ②-E：FinancialMetric 原始空值直传 + 真实 quality
- 现状：`BacktestSummary.tsx:9` `pct()` 把 null pre-format 成 `'—'` 字符串 → L67-73 传 `value='—'` + `quality="OK"` → `FinancialMetric.tsx:26` 的 null 判断被短路，空值显示为"OK 的破折号"。
- 改法：
  1. BacktestSummary 不再 pre-format 空值：`pct()` 遇 null 返回 null（或拆 `pctValue` 保持非空行为），value 原样传；quality 按真实来源（metrics 缺失 → `'UNKNOWN'`/`'PARTIAL'`，由 run 数据推导）而非恒 `"OK"`。
  2. `FinancialMetric.tsx` 显示层承接 null：`value == null` → 显示 unknown 文案（复用 t('financialMetric.unknown')），占位移入组件；quality ≠ OK 时展示 quality 标记（组件已有）。
- 同步：`BacktestSummary.test.tsx`——metric-* 文本断言在非空 fixture 下不变；legacy 空 metrics 测试若断言 `'—'` → 改断言 unknown 文案/组件占位输出（**语义不变**，空值不再冒充 OK）。

### ②-D：MDD 红绿语义复核
- 顶部 MetricStrip 删除后（②-C），StrategyLab 页 MDD 表达天然唯一化到 BacktestSummary（已是 `tone:'risk'` / `--fq-risk`）。复核全站无其他 MDD 用 `--fq-price-down`/绿；若有，统一 `--fq-risk`。
- `BacktestSummary.test.tsx` 若已断言 metric-max-drawdown 文本，不改 tone 断言（组件内部 tone 映射保持）。

## 允许修改

- `frontend/src/pages/StrategyLab.tsx`（删 L708-713 MetricStrip 及相关 import/state）
- `frontend/src/components/strategy/BacktestSummary.tsx`（pct 语义 + value/quality 直传）
- `frontend/src/components/FinancialMetric.tsx`（显示层空值占位，不改 API 签名）
- `frontend/src/app.css`（占位样式若需；`.metric-strip` 若仅此用可留作通用）
- `frontend/tests/StrategyLab.test.tsx`、`frontend/tests/BacktestSummary.test.tsx`（同步，语义不放松）
- 证据文档：`docs/ai/tasks/BACKLOG-030.md`、`docs/ai/EXEC_PLAN.md`、`task/CHANGELOG.md`、`docs/HANDOVER.md`（如需）

## 禁止修改

- `frontend/e2e/*`、`frontend/e2e-8000/*`、`playwright*.config.ts`（4173/8000 E2E 断言**禁改**）
- `frontend/src/` 除上述允许文件外一切；后端一切；依赖/锁文件；`reference/`
- 不删除 BacktestSummary 内任何 `metric-*` data-testid 或结论 Alert（E2E 依赖）
- 不实施 ②-A/②-B（两栏布局/IR 折叠，在 BACKLOG-031）或重做①任何步骤（BACKLOG-032）
- 不得删除文件（回收站铁律）；不新增依赖；不用 `channel: 'chrome'`

## 完成标准

1. ②-C：顶部 MetricStrip 删除；build 通过；StrategyLab/BacktestSummary Vitest 全绿；`metric-total-return` 仍在 BacktestSummary（grep 确认）
2. ②-E：BacktestSummary 空 metrics 传原始 null + 非恒 quality="OK"；FinancialMetric 显示 unknown 占位；空值测试断言更新为"显示 unknown 而非假 OK"（语义不放松）
3. ②-D：全站 MDD 无 `--fq-price-down`/绿表达（grep `max_drawdown|mdd` + tone 检查）
4. 全量门禁：backend 851/851 + ruff 不受影响（零后端改动）；frontend build；Vitest 全量；4173 E2E 50/50；8000 E2E 21/21；i18n parity 0（应无新 key，若有需 zh/en 同步）
5. `git diff --check` 通过；删除 0；工作树干净；commit 独立（建议 1 个 commit 含 ②-C/②-E/②-D，或按步拆 2-3 个）

## 参考

- 设计文档：`docs/ai/astra-review/b12-design-2026-09-05.md` §2.2 Step C/D/E、§2.4 验收 B3/B4/B5、§4 分步 1-3、§5 风险表
- 现状：`StrategyLab.tsx:706-713`、`BacktestSummary.tsx:9/61/66-77`、`FinancialMetric.tsx:26`
- E2E 依赖（禁改）：`frontend/e2e/core-paths.spec.ts:186`（metric-total-return `+12.00%`）、`chat-paths.spec.ts:351`（IR 文案，本卡不触及）

## 完成证据模板

```
- ②-C diff（StrategyLab 删顶部 MetricStrip）与 metric-* 保留 grep 证据
- ②-E diff（pct/quality/FinancialMetric 显示层）与测试同步（语义不放松说明）
- ②-D MDD 语义全站扫描结果
- 全量门禁：build、Vitest x/x、4173 E2E x/x、8000 E2E x/x、backend 851（零改动确认）、i18n parity
- git diff --check、删除 0、commit、工作树干净
```
