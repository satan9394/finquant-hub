# IMPLEMENTATION_BRIEF — Vertical Slice 24：让"有标的时的追问"真正被接住（P1，核心交互静默失效）

> Orchestrator 第五阶段产物，2026-09-12。来源：**R5 审计 A5 的 P1-1**（`PRODUCT_UX_REPORT_R5.md`），**编排者已核码并列为 R5 综合的 NOW-1**。

## 目标
在**标的研究页**（`/research/:symbol`）提交的追问，必须**真的被接住并执行**——而不是只躺进地址栏、界面毫无变化。

## 用户场景
用户打开某只标的的研究页，在追问条（`CommandComposer`）里输入问题并提交。**当前：界面毫无反应**，问题只出现在地址栏 `?prompt=…` 里；用户会以为"点了没反应/坏了"，反复重试或放弃。**而同一个按钮从 `/analysis/:ticker` 提交却正常工作**——同类操作两种结果。

## 当前问题（编排者已核码，逐条给事实）
- `frontend/src/App.tsx:345-350`：`/research/:symbol` 渲染 `CommandComposer`，onSubmit 导航到 `/research/<symbol>?prompt=…`。
- `frontend/src/App.tsx:334`：**同一 Route 只改查询串不会重挂载**。
- `frontend/src/pages/ResearchWorkspace.tsx:199-202`：`useState(urlPrompt)` **只在挂载时取值**；`:256-262` 的自动搜索条件含 `!currentSymbol` ⇒ **有标的时永不触发**；全库 `urlPrompt` 仅 199/200/257 三处，**没有任何 effect 同步 query**。
- ⇒ 结论：**有标的时追问静默失效**；而 `/analysis/:ticker` 提交时 Route 变化触发重挂载，故正常。
- 并且这与 `App.tsx:238` 的注释、`CommandComposer` 的"问题不丢"承诺**冲突**——**代码的承诺与行为不一致**。

## 理想行为
1. 在 `/research/:symbol` 提交追问后，**研究页真的以该问题发起一次研究/追问**（与 `/analysis/:ticker` 路径**同源**，不得两条路径两套实现）。
2. **两条路径行为一致**：同一按钮无论从哪个入口提交，结果相同。
3. **用完即清**：处理完该 `prompt` 后应把查询串中的 `prompt` 去掉（或标记已消费），避免刷新/返回时**重复执行**同一次追问。
4. 若因故**确实无法执行**，必须给出**可见反馈**（而不是静默）——**宁可明说，也不要让用户以为点了没反应**。

## 涉及模块
- `frontend/src/pages/ResearchWorkspace.tsx`（主要）
- `frontend/src/App.tsx`（若需调整 Route/入口）
- 相关测试（含 `/analysis/:ticker` 路径的**同源**断言）

## 不能破坏
- `/analysis/:ticker` 提交追问的**既有正常行为**。
- `ResearchWorkspace` 的 `selectMode` 剥参行为（VS-16：切模式剥离 `session`/`room`）——**若本卡要一并处理 `prompt`，须单独论证并保持既有测试全绿**。
- `?prompt=` 在**其它**页面的既有消费（如 `Chat` 的 `?prompt=` 草稿——**不要动它**）。
- 不加依赖、不改后端、不改 schema；不删文件；**不 commit**。

## 验收标准（可判定）
1. **标的研究页追问生效**：在 `/research/<symbol>` 以 `?prompt=X` 进入（模拟按钮提交）⇒ **确实以 X 发起**（断言请求/UI 状态变化），**而非**停在原地。
2. **两路径同源**：同一次追问从 `/analysis/:ticker` 与 `/research/:symbol` 两条入口提交，**结果一致**（给出两组的实测对照）。
3. **不重复执行**：消费后查询串中的 `prompt` 被清（或标记），**刷新/返回不再重复发起**（给出实测）。
4. **零回归**：`ResearchWorkspace` 既有测试全绿、`?prompt=` 在 `Chat` 侧的既有用例全绿、i18n zh/en 一致。
5. **鉴别力证明**：把新增的同步逻辑从**副本**去掉后，至少一条新用例变红（贴原始输出）。
6. 门禁：相关 vitest 全绿 + **串行** `bun run build`（含 `tsc -b`）。

## 错误场景
- 空 `prompt`（`?prompt=`）⇒ **不得**发起空研究；应忽略并清理。
- `prompt` 与 `session`/`room`/`mode` 同时存在 ⇒ 明确优先级并在结果文件说明。
- 极长 `prompt` ⇒ 不崩、不截断内容（除非既有约定如此）。
- 用户**连续提交**两次不同追问 ⇒ 以最后一次为准且**不重复跑**第一次（除非产品上就是要排队——请明确选择并说明）。

## 测试要求
- 必须含**两路径对照**用例（同源是本卡的核心，不是附加项）。
- **鉴别力证明**：去掉新逻辑的副本后用例变红。
- 临时/变异文件放 `$env:TEMP`，**绝不放 `src/`/`tests/`**；**不要把门禁输出写进仓库目录**；做变异/还原验证**先声明窗口**。
- 本机偶发 vitest forks worker 超时 ⇒ 原样重跑一次并如实记为环境噪声。
- 由独立 Evaluator 复核：①标的研究页追问**真的**执行了；②两路径**真的**同源；③**没有**重复执行；④未破坏 `/analysis/:ticker` 与 `Chat` 的 `?prompt=`。
