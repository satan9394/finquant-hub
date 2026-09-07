# BACKLOG-032 — B12 重做① 首页→研究连续工作面：单 ⌘K + Composer 语境化 + 空 Rail 折叠 + DecisionCard 瘦身

> 状态：`[READY]`（代码完成待维护者复核合入，2026-09-06）｜ 优先级：P1 ｜ 创建：2026-09-05 ｜ 完成：— ｜ 执行：DSH
> 背景：B12 设计（`docs/ai/astra-review/b12-design-2026-09-05.md`）已审阅通过。本卡为 B12 拆分第三张，执行设计重做① Step C→A→B→D（建议序）。不依赖 030/031 完成即可独立执行（同为前端独立改动；若同批执行注意提交隔离）。
> 证据：`docs/ai/tasks/BACKLOG-032.md`（完整改动清单/⌘K 单实例/AgentStatusCard 接线/DecisionCard 瘦身/门禁结果）

## 目标（按建议顺序，每步独立 commit）

### Step C — 空 AgentRail 默认折叠（先做，低风险）
- 现状：AgentRail 四标签空态桌面默认展开占 376px（`App.tsx:188` agentRailOpen 初始=非窄屏 true、`app.css:111` grid 376px）。B10 记录项。
- 改法：`agentRailOpen` 初始改 `false`；右栏收起列宽归零（`.research-os-shell--rail-closed` grid-template-columns 0，`app.css:114`）；研究/讨论等有真实阶段页用既有 `AgentStatusCard` 在内容区呈现（信息不丢）。
- E2E：无 agent-rail 展开断言（已 grep）；研究页 E2E 断言内容区元素不受影响。
- 允许文件：`App.tsx:188`、`app.css`、`pages/ResearchWorkspace.tsx`/Discussion（如引入 AgentStatusCard）、`tests/AgentRail.test.tsx`、`tests/ResearchOSComponents.test.tsx`

### Step A — 收敛提问入口：单一 ⌘K + 顶部触发
- 现状：header CommandBar（App.tsx:223）与 Dashboard hero CommandBar（Dashboard.tsx:75）各内嵌 GlobalTaskEntry，**每实例向 window 注册 ⌘K**（GlobalTaskEntry.tsx:50-59）→ 首页两监听并存。
- 改法：⌘K 注册收敛到 App 层一次（openGlobalEntry 状态 + ref 触发唯一实例）；`CommandBar` 加 `triggerOnly` 变体（hero 渲染触发按钮点击/回车打开同一弹窗）；hero 与 header 共用 App 层唯一 GlobalTaskEntry。
- **保留**：hero 区既有 task-launchpad"试用 XX"按钮组（在 hero 下方，非 CommandBar 内）；Dashboard.spec 复跑确认无 getByRole 命名冲突。
- E2E：无 ⌘K/弹窗实例数断言（已 grep）。
- 允许文件：`App.tsx`、`components/CommandBar.tsx`、`components/GlobalTaskEntry.tsx`、`pages/Dashboard.tsx`、`app.css`、`tests/CommandBar.test.tsx`、`tests/GlobalTaskEntry.test.tsx`、`tests/AppNavigation.test.tsx`

### Step B — CommandComposer 只任研究语境追问
- 现状：CommandComposer 全局固定底部（App.tsx:318），提交恒 `/research?prompt=`（B6 已能接住做标的搜索，但自由问题无明确去向）。
- 改法：Step A 后从全局移除底部 Composer；仅研究语境（`/research`、`/research/:symbol`、`/analysis/*`）且已有上下文时渲染为"追问条"：onSubmit 携带 currentSymbol + 原问题 → `/research/:symbol?prompt=`（有标的）或 `/research?prompt=`（无标的，B6 处理）。首页不再有第二种提交行为。
- E2E：无 command-composer 断言（已 grep）。
- 允许文件：`App.tsx`、`components/CommandComposer.tsx`、`app.css`、`tests/CommandComposer.test.tsx`、`tests/AppNavigation.test.tsx`

### Step D — DecisionCard 卡面瘦身
- 现状：卡面平铺逐条 provenance（id/source/asOf/quality，DecisionCard.tsx:40）+ footer 重复 dueAt·quality。
- 改法：卡面保留 变化(title/whyNow)/影响(impact)/来源时间(少量)/一个动作；type/quality Tag 保留（语义色）；证据 chip 点击 → 打开既有 EvidenceDrawer/EvidenceRail（B3 已修主题一致），移除平铺 provenance 行。
- E2E：实施前 grep `decision-card__provenance` 与 dashboard.spec 断言复核；无直接平铺行断言（设计已核）。
- 允许文件：`components/DecisionCard.tsx`、`pages/Dashboard.tsx`（抽屉状态接线）、`app.css`、`tests/DecisionCard.test.tsx`（同步：删平铺断言→点 chip 断言抽屉）、i18n（如需新 key）

## 允许修改
- `frontend/src/App.tsx`、`components/CommandBar.tsx`、`components/GlobalTaskEntry.tsx`、`components/CommandComposer.tsx`、`components/DecisionCard.tsx`、`components/AgentRail.tsx`（若需）、`pages/Dashboard.tsx`、`pages/ResearchWorkspace.tsx`（如接 AgentStatusCard）、`app.css`、`frontend/src/i18n/zh.ts`+`en.ts`（仅新增/必要改，parity 0）
- 对应测试：`tests/CommandBar/GlobalTaskEntry/CommandComposer/AppNavigation/AgentRail/DecisionCard/ResearchOSComponents.test.*`
- 证据文档：`docs/ai/tasks/BACKLOG-032.md`、`docs/ai/EXEC_PLAN.md`、`task/CHANGELOG.md`、`docs/HANDOVER.md`（如需）

## 禁止修改
- `frontend/e2e/*`、`frontend/e2e-8000/*`、`playwright*.config.ts`（断言禁改）；后端；依赖/锁文件；`reference/`
- `frontend/src/` 除允许文件外一切（不做重做② 任何步骤——BACKLOG-030/031）
- 不删除 hero 区 task-launchpad"试用 XX"按钮（Dashboard E2E 依赖）
- 不删除文件（回收站铁律）；不新增依赖；不用 `channel: 'chrome'`

## 完成标准
1. ⌘K 全站只开一个弹窗（首页/header 同一实例）；hero 触发按钮进同一弹窗
2. 底部 Composer 仅研究语境出现且携带对象+原问题；首页无第二提交行为
3. 空 AgentRail 不占宽（默认折叠）；研究页有真实阶段用 AgentStatusCard 呈现
4. DecisionCard 卡面瘦身完成；证据详情经 chip 进抽屉（暗色一致，B3 已修回归核对）
5. 提交后原问题可见（B6 已接，回归核对）、1440/1280/1024 主动作可达
6. 全量门禁：build；Vitest 全量；4173 E2E 50/50；8000 E2E 21/21；i18n parity 0；backend 851 不受影响
7. `git diff --check`；删除 0；每步独立 commit；工作树干净

## 参考
- 设计：`docs/ai/astra-review/b12-design-2026-09-05.md` §1.2 Step A-D、§1.4 验收 A1-A6、§4 分步 5、§5 风险表
- E2E 依赖（禁改）：`dashboard.spec.ts`（hero 试用按钮）、`core-paths.spec.ts`、`ticker-input.spec.ts:140`
- B6/B3 已修复状态（验收点据此）：ResearchWorkspace 接 prompt、EvidenceDrawer getContainer

## 完成证据模板
```
- 四步各自改动清单与 diff 摘要 → 见 docs/ai/tasks/BACKLOG-032.md（C→A→B→D 逐项）
- ⌘K 单实例验证（首页/header）、hero 触发同一弹窗 → Step A：App.tsx 唯一 keydown listener dispatch
  GLOBAL_TASK_OPEN_EVENT；唯一 hideTrigger GlobalTaskEntry 宿主（ProLayout children 顶层）弹起同一 Modal；
  header/hero CommandBar 均 triggerOnly dispatch；GlobalTaskEntry.test/CommandBar.test 新用例实证；
  8000 ticker-input 6/6 真实入口验证
- 空 Rail 不占宽、AgentStatusCard 接线证据 → Step C：agentRailOpen 初始 false +
  .research-os-shell--rail-closed 列宽 0；deep 模式 Research.tsx×4 AgentStatusCard + analyst SwarmStatusCard
  呈现真实阶段；ResearchOSComponents.test 新增 AgentStatusCard 冒烟
- DecisionCard 瘦身 + chip→抽屉；dashboard.spec 复跑结果 → Step D：删平铺 provenance 行（DecisionCard.tsx L40）
  与 .decision-card__provenance 死 CSS；EvidenceChip 自带 EvidenceDrawer（B3 主题已修，复用回归核对）；
  Dashboard.test 同步为点 chip 断言抽屉（语义不放松）；dashboard.spec 复跑 50/50 全绿
- 全量门禁：build 通过、Vitest 123 files/382 tests 全绿、4173 E2E 50/50（×2）、8000 E2E 21/21、
  backend 851 不受影响（零后端改动）、i18n parity 0（zh/en 2278/2278 差集 0 重复 0）
- git diff --check 通过、删除 0、工作树 14 修改文件全在允许范围、未 commit（交维护者复核分步合入）
```
