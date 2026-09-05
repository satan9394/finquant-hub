# BACKLOG-031 — B12 重做② 布局与 IR 折叠：360px 设置栏 + 弹性结果栏 + "一句话填规则"

> 状态：`[READY]` ｜ 优先级：P1 ｜ 创建：2026-09-05 ｜ 完成：— ｜ 执行：DSH
> 背景：B12 设计（`docs/ai/astra-review/b12-design-2026-09-05.md`）已审阅通过。本卡为 B12 拆分第二张，执行设计 ②-A（两栏布局）与 ②-B（IR 卡折叠）。依赖 BACKLOG-030 先行（顶部 MetricStrip 已删，无重复指标条）。
> 注意：②-A/②-B 是 UI 结构调整，E2E 无页内布局断言（已核），但按钮命名与文案锁定项不可破坏。

## 目标

### ②-A：设置靠后——360px 设置栏 + 弹性结果栏（桌面），窄屏（<900px）上下排
- 现状：StrategyLab 纵向单栏（TaskPageHeader → IR 大卡 → 验证 Alert → 表单 Collapse → 结果）。完成后才见结果。
- 改法：页面主区改两栏 Grid：左 360px（基础表单 + 折叠高级），右弹性（结果/图表区）；窄屏回单栏上下排。**不做组件级重构**——用 `.strategy-lab-layout` CSS grid 包现有 Card（表单）与结果区，Form 内容原样迁移。
- **关键约束**：TaskPageHeader actions 的 Run 按钮（`运行回测`）**保留常驻可见**（即使表单移左栏）——4173 core-paths 与 8000 ticker-input 都点它，命名/可见性不得改。
- 允许文件：`StrategyLab.tsx`（包 layout div）、`app.css`（grid + @media 回退）、`StrategyLab.test.tsx`（渲染断言若位置敏感需先核再同步）

### ②-B：首屏自然语言 IR 卡折叠为"用一句话填写规则"
- 现状：`strategy.ir.title` 大卡（StrategyLab.tsx:468）首屏铺开 + 实现术语（zh.ts:1052 "策略 IR（不执行）"，B8 记录项）。
- 改法：
  1. 折叠为紧凑入口（Collapse 默认收起或一行按钮"用一句话填写规则"）；展开后沿用既有 parse/apply 流程（**不动 IR 解析逻辑与后端**）。
  2. 解析结果展示中文规则 + 待确认项（既有 `strategy.ir.entry/exit/confirmExplicit` 已中文）；外层去 "IR" 术语（新 key 文案"用一句话填写规则"）。
  3. 自选股/市场参考：**设计已注明"现状未见独立卡实现细节则并入候选、不臆造"**——实施前先核 StrategyLab 表单结构，若现状无该结构则不新增。
- **文案锁定**：`chat-paths.spec.ts:351` 断言 `'策略描述中需要包含股票代码，例如 600519 或 AAPL'`（禁改 e2e）→ **该 message key 文案不得变**，只允许折叠 UI，不改文案。`strategy.ir.*` 中被 E2E 依赖的文案同理锁定。
- 允许文件：`StrategyLab.tsx`、`app.css`、`frontend/src/i18n/zh.ts`+`en.ts`（新增 key 同步、parity 0；**不动被 E2E 依赖的既有文案**）、`StrategyLab.test.tsx`（IR 相关同步新文案/折叠态，语义不放松）

## 允许修改
- `frontend/src/pages/StrategyLab.tsx`、`frontend/src/app.css`、`frontend/src/i18n/zh.ts`、`frontend/src/i18n/en.ts`
- `frontend/tests/StrategyLab.test.tsx`、（`DecisionWorkspaces.test.tsx` 若引用旧 IR 文案则同步）
- 证据文档：`docs/ai/tasks/BACKLOG-031.md`、`docs/ai/EXEC_PLAN.md`、`task/CHANGELOG.md`

## 禁止修改
- `frontend/e2e/*`、`frontend/e2e-8000/*`、`playwright*.config.ts`（断言禁改）；后端；依赖/锁文件；`reference/`
- `frontend/src/` 除允许文件外一切（不做 ②-C/②-E/②-D——已在 BACKLOG-030；不做重做①）
- 不改被 E2E 依赖的既有 i18n 文案（`chat-paths:351` message、`回测结论摘要` heading 等）
- 不删除文件（回收站铁律）；不新增依赖；不用 `channel: 'chrome'`

## 完成标准
1. 桌面 360px 设置栏 + 弹性结果栏同视野；<900px 上下排无横向滚动
2. IR 卡默认折叠，展开可"一句话填规则"并解析出中文规则；`运行回测`/`保存实验`按钮命名与可见性不变
3. 人工走查 1440/1280/1024 三宽度：主动作可达、无横向滚动（截图矩阵受浏览器策略限制则如实记录）
4. 全量门禁：build；Vitest 全量（StrategyLab 专项先跑）；4173 E2E 50/50；8000 E2E 21/21；i18n parity 0；backend 851 不受影响
5. `git diff --check`；删除 0；工作树干净；独立 commit

## 参考
- 设计：`docs/ai/astra-review/b12-design-2026-09-05.md` §2.2 Step A/B、§2.4 验收 B1/B2、§4 分步 4、§5 风险表
- E2E 依赖（禁改，锁定项）：`chat-paths.spec.ts:351`（IR message 文案）、`core-paths.spec.ts`（运行回测/回测结论摘要/metric-total-return/保存实验）、`ticker-input.spec.ts:140`（运行回测按钮）

## 完成证据模板
```
- ②-A diff（layout grid + @media）与三宽度走查结果（或如实记录受限）
- ②-B diff（IR 折叠 UI + 新 key）与 chat-paths:351 文案未变确认（grep）
- 自选股/市场参考结构核实结论（若现状无则不臆造）
- 全量门禁：build、Vitest x/x、4173 x/x、8000 x/x、backend 851、i18n parity
- git diff --check、删除 0、commit、工作树干净
```
