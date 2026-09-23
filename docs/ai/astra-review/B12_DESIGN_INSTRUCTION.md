# B12 设计指令 — 给 BACKLOG-029 执行会话（任务29）

> 创建：2026-09-05 ｜ 维护者发出 ｜ 执行：BACKLOG-029 DSH 会话（任务29）
> 前置：BACKLOG-029 主体已完成并复核通过（HEAD ffc31e2）。B12 属任务书"禁止擅自实施"项，
> 故本指令只要求**设计拆解**，不改业务代码、不 commit。

## 指令正文（可直接贴给任务29）

收到，方向定为 B12（两处产品级重做）。按 BACKLOG-029 纪律 B12 属禁止擅自实施项，本轮只做**设计拆解，不改业务代码、不 commit**。

产出 `docs/ai/astra-review/b12-design-2026-09-05.md`，以当前 HEAD（ffc31e2）代码为准核实（Astra 会话 B 的 B4 方案是底稿，但 B2-B5 已修复，验收点必须反映已修复状态），须覆盖：

### 1. 重做① 首页→研究连续工作面

目标与用户流程：提交后问题不丢 → 自动搜索 → 选对象 → 研究完成先见结论。

组件层方案：
- CommandBar / GlobalTaskEntry 重复实例收敛——现状 header（App.tsx:223）+ Dashboard hero（Dashboard.tsx:75）两处，CommandBar 内嵌 GlobalTaskEntry，需核实重复注册与收敛方式（保留单一实例，顶部提供同一入口触发按钮）
- CommandComposer（App.tsx:318）只任研究语境追问，提交携带当前对象与原问题
- 空 AgentRail（App.tsx:320，376px 右栏）默认折叠或按需展示（有真实阶段才用 AgentStatusCard）
- DecisionCard 卡面瘦身：默认只保留"变化、影响、来源时间、一个动作"，证据 ID/质量枚举/provenance 入抽屉

token/排版：--fq-radius 等级、间距 token（8/16/24/32）、正文 14/22、结论 16/26、标题 24/32；来源 12px。

验收点：提交后原问题可见（B6 已接 prompt，需与已修复状态合并核对）；Ctrl+K 只开一个弹窗；空右栏不占宽；1440/1280/1024 下主动作可达；证据抽屉暗色一致（B3 已修 getContainer，按已修复状态核对）。

### 2. 重做② 策略实验室"规则—结果—限制"同视野

目标：普通用户能说清自己测试了什么，再理解历史结果。

- 首屏顺序反转：设置靠后、结果与中文结论优先；桌面 360px 设置栏 + 弹性结果栏，宽度不足上下排列
- StrategySetup 收敛为紧凑预设选择；标的/日期/快慢均线进基础表单
- 自然语言 IR 折叠为"用一句话填写规则"，解析后展示中文规则与待确认项；自选股/市场参考并入标的选择器候选，不做独立大卡
- BacktestSummary（解释与限制）先于指标条渲染；取消其上方重复的 CAGR/Sharpe/MDD 指标条
- MDD 红绿语义统一：StrategyLab.tsx:711 `tone:'down'` vs BacktestSummary:61 `tone:'risk'` 的不一致（--fq-price-down vs --fq-risk）
- FinancialMetric 原始空值直传 + 真实 quality：BacktestSummary.tsx:9 `pct()` 把 null pre-format 成 '—' 且传 quality="OK" 的问题仍在，需一并设计（破折号移入组件显示层，空值不标 OK）

### 3. 每处必须标明

- 允许改的文件清单（组件/页面/css/i18n/测试）
- 新增/复用 token（--fq-*）
- 受影响的既有 E2E 断言与 Vitest：改前逐一核对，注明会变哪些、如何最小化破坏（改前查 e2e 引用；4173 e2e/*、8000 e2e-8000/* 与 playwright config 为禁止项，不得因设计实施而放宽断言语义）
- i18n 影响：zh/en 同步新增 key，parity 0
- 分步实施建议：每步可独立验证、可独立 commit
- 风险与回滚

### 4. 现状核实纪律

以当前 HEAD 代码为准，不臆造过时结论。已知仍需处理现状（供核实）：
- BacktestSummary pct() pre-format（B11 记录项，未修）
- Professional 区 Sharpe/Sortino/Beta/R²/Tracking Error 英文（B8 记录项，未修）
- AgentRail 四标签空态占 376px（B10 记录项，未修）

设计文档落盘后交维护者审，审过再开正式执行卡。本轮结束工作树干净、无业务改动。

## 约束

- 只读设计：不产生业务代码改动；允许新增的唯一文件是 `docs/ai/astra-review/b12-design-2026-09-05.md`
- 不 commit、不 push、不加依赖、不删文件
- 完成后贴回设计文档路径与要点摘要，交维护者评审
