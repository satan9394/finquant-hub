# BACKLOG-031 证据 — ②-A 两栏布局 + ②-B IR 折叠（B12 重做②）

> 完成：2026-09-06 ｜ 执行：DSH 子 agent（c1d6750a，Worker 在验证阶段终止后由维护者接手补完门禁与文档）
> 维护者复核：代码审阅通过 + 全量门禁独立复跑全绿后合入。

## 改动清单

### ②-B：首屏 IR 大卡折叠为"用一句话填写规则"
- `frontend/src/pages/StrategyLab.tsx`：IR 大 Card 改为 `Collapse ghost` 折叠入口（`.strategy-ir-entry`），默认收起。
  - 折叠 label：标题 `strategy.ir.title`（新文案"用一句话填写规则"）+ 已应用 Tag（`strategy.ir.appliedTag`，有 draft 时）+ 描述摘要（有输入时 ellipsis）。
  - `extra`：fillExample 按钮（填入示例）。
  - 展开面板保留原全部流程：description、Input.TextArea、parse 按钮、Empty/loading/invalid/valid/draft 各状态 Alert、apply 按钮——**IR 解析逻辑与后端零改动**，仅外层 UI 折叠。
  - 外层已去 "IR" 术语（title 文案换新 key）。
- `frontend/src/i18n/zh.ts` / `en.ts`：改 `strategy.ir.title`（zh "用一句话填写规则" / en "Describe your rule in one sentence"）；新增 `strategy.ir.appliedTag`（已应用到表单 / Applied to form）、`strategy.setup.pane`（回测设置 / Backtest setup）、`strategy.setup.resultPane`（回测结果 / Backtest results）——zh/en 同步，parity 0。
- `frontend/tests/StrategyLab.test.tsx`：新增 `expandRuleEntry` helper（点标题展开 → 等文本域），三处 IR 交互用例前置调用；新增"默认折叠"断言（queryByLabelText 策略描述 → null）。**语义不放松**（交互流程保留，仅加展开步骤）。

### ②-A：360px 设置栏 + 弹性结果栏（桌面），窄屏单栏
- `frontend/src/pages/StrategyLab.tsx`：TaskPageHeader（含 Run 按钮，**常驻顶部**）→ validation Alerts → `.strategy-lab-layout` grid：
  - 左 `<aside class="strategy-lab-layout__setup">`（360px）：IR 折叠入口 + watchlist + references + StrategySetup + 表单卡。
  - 右 `<section class="strategy-lab-layout__results">`（弹性）：ExperimentWorkbench + saved + failure + run steps + completed 结果区。
- `frontend/src/app.css`：`.strategy-lab-layout`（grid 360px + minmax(0,1fr)）、`.strategy-lab-layout__setup/results`（min-width:0）、`@media(min-width:900px)` 栏内 `.ant-col` 强制单列防溢出、`@media(max-width:899.98px)` 单栏回退、`.strategy-ir-entry` 折叠观感（--fq-border/--fq-radius-md/--fq-surface-1/--fq-shadow-soft tokens）。

## 关键约束核对

| 约束 | 结果 |
|---|---|
| `运行回测`/`保存实验` 按钮命名可见性 | ✓ `strategy.run`/`strategy.result.save` key 未改；Run 在 TaskPageHeader actions 常驻顶部（grid 之外） |
| chat-paths:351 文案锁定（chat.backtest.tickerRequired） | ✓ zh.ts:1712 原样保留，Chat.tsx:151 仍引用；改的是 strategy.ir.title 非该 key |
| i18n zh/en parity | ✓ 2277/2277、差集 0（+3 key 同步） |
| 自选股/市场参考不臆造结构 | ✓ 保留既有 watchlist/references 卡（未并入候选，保守处理符合卡"不臆造"约束），随表单入左栏 |
| metric-* 与结论 Alert | ✓ 未动（030 已处理，BacktestSummary 内原样） |

## 验证（维护者独立复跑）

- build：✓ 通过
- 聚焦 Vitest：StrategyLab 10/10（IR 折叠展开流程 + 默认折叠断言）
- 全量 Vitest：123 files/378 tests 全绿（809s）
- 4173 E2E：50/50（含 core-paths strategy 用例 + chat-paths 回测入口——②-A/②-B 未破坏任何断言）
- 8000 E2E：21/21（--retries=0，ticker-input 策略实验室用例通过）
- i18n parity：zh/en 2277/2277 差集 0
- git diff --check：通过
- 删除 0；E2E/playwright config/后端/依赖零改动

## 诚实声明

- Worker（c1d6750a）完成 ②-A/②-B 代码 + 测试同步 + 聚焦验证（自报 10/10）后，在等待全量门禁时被终止（fail）。维护者接手：独立完成代码审阅 + build/全量 Vitest/两套 E2E 全量门禁复跑 + 本文档与卡/EXEC_PLAN/CHANGELOG/HANDOFF 同步。
- 三宽度人工视觉走查未做（截图矩阵受浏览器策略限制时如实记录）；布局响应式经 CSS @media 与 E2E 覆盖。
