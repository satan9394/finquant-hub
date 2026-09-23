# BACKLOG-032 证据 — B12 重做① 首页→研究连续工作面：单 ⌘K + Composer 语境化 + 空 Rail 折叠 + DecisionCard 瘦身

> 完成：2026-09-06 ｜ 执行：DSH Worker（BACKLOG-032，Step C→A→B→D 每步独立改动，未 commit 待维护者复核合入）
> 对应卡：`docs/ai/BACKLOG-032.md` ｜ 设计：`docs/ai/astra-review/b12-design-2026-09-05.md` §1.2/§1.4/§5

## 改动清单（按执行顺序 C→A→B→D）

### Step C — 空 AgentRail 默认折叠（桌面不再占 376px 空右栏）
- `frontend/src/App.tsx`：`agentRailOpen` 初始值从"非窄屏 true"改为 `false`（默认折叠）。`.research-os-shell--rail-closed` 既有 CSS 使 grid 第二列归 0，空 Rail 不占宽；header Robot 按钮仍可手动打开（`agent.open`）。
- `frontend/tests/ResearchOSComponents.test.tsx`：新增"以 AgentStatusCard 在内容区呈现真实阶段"冒烟用例——研究页真实阶段（deep 模式 Research.tsx 四 Agent 已用 AgentStatusCard、analyst 用 SwarmStatusCard）不随 Rail 折叠丢失信息。
- E2E 核对：4173/8000 无 agent-rail 展开/376px 断言（实施前 grep 确认），研究页 E2E 断言内容区元素不受影响（4173 50/50、8000 21/21 复跑全绿）。

### Step A — ⌘K 收敛 App 层单次 + CommandBar triggerOnly + 唯一弹窗宿主
- `frontend/src/components/GlobalTaskEntry.tsx`：
  - 移除组件内 `window keydown` ⌘K 自注册（原每实例注册 → 首页双监听）；
  - 新增导出 `GLOBAL_TASK_OPEN_EVENT = 'finquant:open-global-entry'`，组件改为监听该事件打开自身；
  - 新增 `hideTrigger?: boolean`：纯弹窗宿主模式（隐藏自带 trigger 按钮，仅响应全局事件）。
- `frontend/src/App.tsx`：
  - ⌘K 注册收敛到 AppLayout 一次：`keydown` (meta/ctrl)+k → `preventDefault` + dispatch `GLOBAL_TASK_OPEN_EVENT`；
  - header `headerContentRender` 的 CommandBar 改 `triggerOnly`（不再内嵌 GlobalTaskEntry 实例）；
  - ProLayout children 顶层渲染唯一宿主 `<GlobalTaskEntry hideTrigger onNavigate={navigate} />`——任何路由都挂载、全局唯一 Modal。
- `frontend/src/components/CommandBar.tsx`：新增 `triggerOnly` 变体——渲染"输入框形态"触发按钮（复用 `global-task-entry-trigger` class，aria-label 沿用 `command.open`），点击 dispatch 全局事件。
- `frontend/src/pages/Dashboard.tsx`：hero CommandBar 改 `<CommandBar variant="hero" triggerOnly />`——hero 与 header/⌘K 共用 App 层唯一弹窗。
- 测试同步（语义不放松）：
  - `tests/CommandBar.test.tsx`：triggerOnly 用例——不渲染内嵌实例、点击 dispatch 事件一次、不自行 navigate；
  - `tests/GlobalTaskEntry.test.tsx`：新增用例——组件不再自注册 ⌘K（直接派发 Ctrl+K 不打开）、收到全局事件才打开（act 包裹）；
  - `AppNavigation.test.tsx`/`Dashboard.test.tsx` 无改动但复跑通过（回归）。
- 验证：8000 `ticker-input.spec`（禁改，首页 `getByRole('button',{name:'打开全局命令栏'})` 依赖 hero 触发按钮 aria=command.open）6/6 全绿；4173 50/50、8000 21/21 全绿——单实例单弹窗达成。

### Step B — CommandComposer 仅研究语境渲染为追问条
- `frontend/src/App.tsx`：移除全局无条件底部 `<CommandComposer onSubmit={→ /research?prompt=}>`；改为仅当路径匹配 `/research/:symbol` 或 `/analysis/:ticker`（排除 `/research/reports`）时渲染追问条，`contextLabel` 携带当前对象（symbol），提交导航 `/research/${symbol}?prompt=<原问题>`（原问题保留在 URL/query state，B6 已接无标 `/research?prompt=` 路径继续可用）。首页不再有第二种提交行为（hero 触发已进同一全局弹窗）。
- `frontend/src/components/CommandComposer.tsx`：新增可选 `contextLabel`——追问条形态（对象徽标 + placeholder 指明"就当前对象继续追问"）；提交逻辑保留（trim 后回调、Enter 提交、清空）。
- `frontend/src/i18n/zh.ts`/`en.ts`：新增 `composer.followupPlaceholder`（zh "就 {object} 继续追问…（原问题会带进研究页）" / en 对应）——同步，parity 0（2277→2278 key）。
- `frontend/src/app.css`：`.command-composer__box` + `.command-composer__context`（对象徽标观感），sticky bottom/移动端规则保留。
- 测试：`tests/CommandComposer.test.tsx` 新增 contextLabel 用例（对象可见 + 提交透传原问题）；原 2 用例（空提交忽略/trim+Enter+清空）保留语义。无 e2e 断言 command-composer（grep 确认）。
- E2E 影响核对：4173 core-paths/chat-paths、8000 均无 composer 断言；研究页 E2E 断言内容区不受影响（复跑全绿）。

### Step D — DecisionCard 卡面瘦身 + 证据 chip → 既有 EvidenceDrawer
- `frontend/src/components/DecisionCard.tsx`：删除卡面平铺逐条 provenance 行（`{id} · {source} · {asOf} · {quality}`）。卡面保留 type/quality Tag（语义色）、title/whyNow、impact、来源时间 footer（dueAt·quality）、一个动作；evidence chips 保留——**EvidenceChip 自带 EvidenceDrawer**（点击 chip 即开抽屉；B3 已修 getContainer 挂回 .app-theme，暗色一致为回归核对项）。
- `frontend/src/app.css`：删除 `.decision-card__provenance` 死规则。
- `frontend/tests/Dashboard.test.tsx`：同步——删"平铺 provenance 文本可见"断言，改为"平铺行不存在 + 点证据 chip 开抽屉看到 source/fixture.market"（语义不放松：同信息移入抽屉展示）。
- 实施前 grep 复核：`decision-card__provenance` 仅出现于 DecisionCard.tsx L40 与 app.css L745（本次删）与 Dashboard.test L48（本次同步）；dashboard.spec 无 DecisionCard/provenance 断言（decision-inbox items=[]，只断言 hero/launchpad 文本——hero triggerOnly 后 dashboard.spec 复跑 50/50 全绿，无 getByRole 命名冲突）。
- 暗色一致（B3 已修回归核对）：EvidenceDrawer `getContainer={() => document.querySelector('.app-theme') ?? document.body}` 未动，抽屉挂回主题子树——本次仅复用，无回归（EvidenceDrawer.test 2/2、EvidenceChip.test 2/2 复跑绿）。

## ⌘K 单实例验证
- GlobalTaskEntry 不再自注册 keydown；App.tsx 唯一 listener dispatch `GLOBAL_TASK_OPEN_EVENT`；唯一 hideTrigger 宿主（ProLayout children 顶层）响应 → 全站仅一个 Modal 实例、一个打开通道。
- GlobalTaskEntry.test 新用例实证：组件内派发 Ctrl+K 不打开（无自注册），dispatch 全局事件打开一次。
- CommandBar.test triggerOnly 用例实证：hero/header 触发按钮 dispatch 一次事件、不自行 navigate。
- 8000 ticker-input 6 例（真实入口从首页点开全局弹窗完成 BRK-B/600519/0700/portfolio/backtest 流程）全绿——唯一弹窗实例在真实浏览器验证通过。

## 空 Rail / AgentStatusCard 接线证据
- `agentRailOpen` 初始 false：桌面默认折叠；`.research-os-shell--rail-closed { grid-template-columns: minmax(0,1fr) 0 }`（app.css:114 既有）→ 空右栏 0 宽。
- AgentStatusCard（既有，`components/AgentStatusCard.tsx`）研究页真实消费：deep 模式 `pages/Research.tsx`（AGENT_KEYS×4 卡 running/completed/failed/waiting + stage），analyst 默认工作区有 SwarmStatusCard（advanced-research-disclosure）；讨论 review 模式有 InvestmentCommittee 流式时间线。Rail 折叠后真实阶段信息不丢。
- ResearchOSComponents.test 新增 AgentStatusCard 冒烟（running 阶段/证据数/失败态可见）；AgentStatusCard.test 2/2 保留。

## 验证（门禁结果）
- build：✓ 通过（tsc + vite，多轮均绿）
- 聚焦 Vitest：Step C 11/11（AgentRail 2 + AgentStatusCard 2 + ResearchOSComponents 7）；Step A 6/6（CommandBar 3 + GlobalTaskEntry 3）；Step B 3/3（CommandComposer）；Step D 10/10（DecisionCard 2 + Dashboard 5 + CorePrimitiveI18n 1 + EvidenceChip 2）；宿主迁移后聚焦 10 files / 32 tests 全绿
- 全量 Vitest：123 files / 382 tests 全绿（首跑 695.76s；宿主迁移后复跑 693.91s 亦全绿）
- 4173 E2E：50/50（首轮 + 宿主迁移后复跑均全绿）
- 8000 E2E：21/21（`--retries=0` 首轮 16 过 5 fail 定位为 hero triggerOnly 后 aria 冲突 + 宿主挂载问题 → 修复后 ticker-input 6/6 → 全量 21/21）
- i18n parity：zh/en 各 2278 keys（基线 2277 + composer.followupPlaceholder），重复 0、双向差集 0
- git diff --check：通过（多次）；删除 0（无文件删除，仅代码删行）；backend/依赖/锁文件/playwright config/E2E 零改动

## 诚实声明
- 首轮 8000 E2E 5 例失败并已修复：hero triggerOnly 初版把触发按钮 aria-label 用 `command.placeholder`，8000 ticker-input（禁改）依赖首页 `打开全局命令栏` → 改回 `command.open`；随后发现 8000 真实渲染下 ProLayout header 的 headerContentRender 槽并不挂载弹窗宿主，hero 触发事件无人接收 → 把唯一宿主迁移到 ProLayout children 顶层（hideTrigger GlobalTaskEntry），header/hero CommandBar 均 triggerOnly。修复后 8000 ticker-input 6/6、全量 21/21 复跑绿。
- 三宽度（1440/1280/1024）人工视觉走查未做（截图矩阵受浏览器策略限制时如实记录）；响应式由既有 @media + E2E（4173 390px 无溢出断言、8000 Desktop Chrome 1280 主流程）覆盖。
- 每步独立改动未独立 commit（任务指示不 commit，交由维护者复核后按 C→A→B→D 分步合入）。
