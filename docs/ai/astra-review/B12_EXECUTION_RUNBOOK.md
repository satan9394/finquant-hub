# B12 执行接力 Runbook（BACKLOG-030 → 031 → 032）

> 创建：2026-09-05 ｜ 维护者编排 ｜ 依据：`docs/ai/astra-review/b12-design-2026-09-05.md`（设计已审）
> 前置：HEAD `b44702e`（三卡注册 + 设计入库）、工作树干净。
> 基线门禁：backend 851/851 cov 92.52%、ruff；build 通过；Vitest 123 files/378；4173 E2E 50/50；8000 E2E 21/21；i18n zh/en 2274 parity 0。

## 执行顺序与依赖

| 序 | 卡 | 内容 | 依赖 | 风险 |
|---|---|---|---|---|
| 1 | BACKLOG-030 | ②-C 删顶部重复 MetricStrip + ②-E FinancialMetric 空值直传 + ②-D MDD 语义 | 无 | 低（E2E 影响已核为零） |
| 2 | BACKLOG-031 | ②-A 360px 设置栏+弹性结果栏 + ②-B IR 折叠"一句话填规则" | 030 先行（顶条已删） | 中（UI 结构调整，人工走查） |
| 3 | BACKLOG-032 | 重做① Step C→A→B→D（Rail 折叠/单 ⌘K/Composer 语境/DecisionCard 瘦身） | 无（前端独立，可与 031 并行，但建议顺序执行便于隔离回归） | 中 |

## 每轮接力协议

1. **执行**：DSH 会话执行当前卡，填卡内"完成证据模板"，不 commit。
2. **复核**：维护者独立复核（git 边界 + 代码审阅 + 全量门禁重跑）。
3. **放行/回滚**：
   - 复核通过 → commit 该卡 → 放行下一张。
   - 复核发现越界/回归 → 指出问题退回修正；纯前端可控步骤出问题可 revert 该 commit（每卡/每步独立 commit 保证）。
4. **EXEC_PLAN**：每卡复核通过后状态 030/031/032 逐个转 [DONE]；三卡全过后 B12 设计闭环，遗留仅设计 §6 记录项。

## 给 DSH 会话的开场白（逐卡）

### BACKLOG-030
> 执行 BACKLOG-030（B12 重做②低风险批：删 StrategyLab 顶部重复 MetricStrip + FinancialMetric 空值直传 + MDD 语义复核）。先读 HANDOFF.md 最新日志、docs/ai/BACKLOG-030.md 与本卡"参考"的 b12-design-2026-09-05.md 设计文档 §2.2 Step C/D/E。遵守卡内允许/禁止：保留 BacktestSummary 内全部 metric-* data-testid 与结论 Alert（4173 core-paths:186 依赖）；不碰 E2E/playwright config/后端/依赖；不删除文件。完成后填完成证据模板贴回，不 commit。

### BACKLOG-031（030 复核通过后）
> 执行 BACKLOG-031（B12 重做②布局与 IR 折叠：360px 设置栏+弹性结果栏 + IR 卡折叠"用一句话填写规则"）。先读 HANDOFF、docs/ai/BACKLOG-031.md、设计文档 §2.2 Step A/B。遵守允许/禁止：Run 按钮（运行回测）常驻可见命名不变；chat-paths:351 与 E2E 依赖文案锁定不改，只折叠 UI；自选股/市场参考现状无结构则不臆造；三宽度（1440/1280/1024）人工走查。完成后贴回证据，不 commit。

### BACKLOG-032（031 复核通过后，或并行）
> 执行 BACKLOG-032（B12 重做①连续工作面：Step C AgentRail 折叠 → A 单 ⌘K → B Composer 语境化 → D DecisionCard 瘦身，每步独立 commit 逻辑）。先读 HANDOFF、docs/ai/BACKLOG-032.md、设计文档 §1.2 Step A-D。遵守允许/禁止：hero task-launchpad"试用 XX"按钮保留（dashboard.spec 依赖）；E2E/playwright config 禁改；⌘K 收敛后验证首页单弹窗；验收点按 B2/B3/B6 已修复状态核对。完成后贴回证据，不 commit。

## 复核清单（每卡维护者必查）

- git 边界：改动文件 ⊆ 卡"允许修改"；无删除；无依赖/锁变化；HEAD 推进仅该卡 commit
- 代码审阅：设计关键约束落实（metric-* 保留、按钮命名、文案锁定、token 一致）
- 全量门禁：backend 851/851 + ruff（后端应零改动，仅确认）、build、Vitest、4173 50/50、8000 21/21、i18n parity 0、git diff --check
- 文档同步：EXEC_PLAN 状态、HANDOFF/CHANGELOG 收尾、handoff-log.py

## 完成定义（三卡全过）

- EXEC_PLAN 030/031/032 均 [DONE]
- B12 两处重做落地：①首页→研究连续工作面（单 ⌘K、Composer 语境化、空 Rail 不占宽、DecisionCard 瘦身）②策略实验室规则-结果-限制同视野（360px 设置栏、一句话填规则、无重复指标条、MDD 语义统一、空值诚实）
- 全量门禁绿、i18n parity 0、删除 0、工作树干净
- 遗留仅设计 §6 记录项（视觉截图矩阵受浏览器策略限制等），如实记录
