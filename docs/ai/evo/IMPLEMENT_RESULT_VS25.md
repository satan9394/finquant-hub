# IMPLEMENT RESULT — VS25：AI 讨论首用不得"静默死胡同"

> 状态：**已完成**（未 commit；仓库工作树**从未**进入变异窗口 —— 变异全程只在 `$env:TEMP` 的副本里做）。
> 任务卡：`docs/ai/evo/IMPLEMENTATION_BRIEF_VS25.md`。门禁与变异输出**全部写在 `$env:TEMP`**，未落仓库目录。

## 0. 一句话

`Discussion.tsx` 里 `apiClient.get('/agents').catch(() => {})` 这条**静默吞错**已改成与左栏列表同构的
「成功 / 失败分开」：失败在**左栏**（无需任何点击即可见）与**创建对话框下拉上方**原位给出
`LoadFailureAlert`（失败文案 + 底层原因原文 + 可点重试），重试**真的重新发起**该请求；
点"创建"时不再一律甩"至少选择 3 个角色"，而是按成因分别说清（读取失败去重试 / 当前仅 N 个角色可用 / 确实没选够）。

## 1. 改动（文件:行）

### `frontend/src/pages/Discussion.tsx`
| 行 | 改动 |
|---|---|
| `:6` | `antd` 引入 `Alert`（仅用于"成功但角色不足"的如实说明，**不是**第二套错误态） |
| `:67-77` | 新增 `agentsResolved` / `agentsFailed` / `agentsError` / `agentsRequestRef`（与 VS22 的 rooms 三件套同构） |
| `:102-119` | 新 `loadAgents()`：可重复调用（重试入口）、请求序号丢弃过期响应、**失败时不清失败态**（避免重试期间闪回"空且无解释"） |
| `:121` | `useEffect(() => { void loadAgents(); }, [loadAgents])` —— 替换原来的 `.catch(() => {})` 静默 effect |
| `:123-128` | `rolesInsufficient` / `rolesInsufficientText`（"成功但可用角色 < 3"） |
| `:171-186` | `handleCreate` 的角色闸门改为三分支归因（失败→`rolesUnavailableHint`；不足→`rolesInsufficient`/`rolesNone`；否则才是 `rolesRequired`） |
| `:295-310` | 左栏"创建讨论"按钮下方：失败态 `LoadFailureAlert`（**不点任何东西就看得见**） |
| `:425-447` | 创建对话框"参与角色"标签与下拉之间：失败态 `LoadFailureAlert`（遮罩挡住左栏时，"重试"在这里也能点到）+ 角色不足的 warning `Alert` |

无新增依赖；未改后端；未改 schema；未删文件。

### `frontend/src/i18n/zh.ts` / `frontend/src/i18n/en.ts`（各自 +4 键，双写齐备）
| 键 | zh:行 | en:行 |
|---|---|---|
| `discussion.rolesLoadFailed` | `:1873` | `:1874` |
| `discussion.rolesUnavailableHint` | `:1875` | `:1876` |
| `discussion.rolesInsufficient`（含 `{count}`） | `:1877` | `:1878` |
| `discussion.rolesNone` | `:1878` | `:1879` |

键集合实测（bun 直接 import 两个模块比对，脚本在 `$env:TEMP\vs25-i18n\count.ts`）：

```
改动前：zh keys: 2479 unique: 2479 / en keys: 2479 unique: 2479 / onlyZh: 0 / onlyEn: 0 / dup: 0
改动后：zh keys: 2483 unique: 2483 / en keys: 2483 unique: 2483 / onlyZh: 0 / onlyEn: 0 / dupZh: [] dupEn: []
```
（任务卡写的基线是 2478/2478；**实测基线是 2479/2479** —— 期间有别的卡往 i18n 加过键，如实记录，未改动他人键。）

### `frontend/tests/DiscussionRolesUnavailable.test.tsx`（新增，6 用例 / 227 行）
覆盖：①失败原位可见+可归因+可重试，且"至少选择 3 个角色"不再是唯一解释；②401/500/timeout 三种失败形态走同一条路径；
③重试真重发 1→2→3 且恢复后错误态消失、角色真的可选；④成功但仅 1 个角色 ⇒ 如实说明、**不给**重试；
⑤成功但空数组 ⇒ "当前没有可用的角色"，不崩；⑥成功路径零回归（预填主题、预选 4 角色、`POST /discussion/rooms` 参数不变）。

## 2. 门禁原始输出

### 2.1 GATE-1：本卡口径（`cd frontend; bun x vitest run tests/Discussion.test.tsx tests/DiscussionRolesUnavailable.test.tsx`）
```
 ✓ tests/DiscussionRolesUnavailable.test.tsx (6 tests) 3506ms
 ✓ tests/Discussion.test.tsx (10 tests) 3410ms
 Test Files  2 passed (2)
      Tests  16 passed (16)
   Duration  36.62s
```
（**首次即绿**，无需重跑；未出现 forks worker 超时。）

### 2.2 GATE-2：回归面（`LoadFailureAlert` 既有调用点 / i18n 键集合 / 其它 mock `/agents` 的用例）
```
 ✓ tests/ListFailureNotEmptiness.test.tsx (14 tests)     ← VS22 契约（Chat 左栏 / Discussion 左栏 / 首页研究运行区块）
 ✓ tests/ResearchFollowupPrompt.test.tsx   (10 tests)
 ✓ tests/I18n.test.tsx                     ( 2 tests)
 ✓ tests/ChatSessionDeepLink.test.tsx      (14 tests)
 ✓ tests/AuthUnavailable.test.tsx          (17 tests)     ← 含 `zh/en 键集合一致` 断言
 ✓ tests/DiscussionStreaming.test.tsx      ( 5 tests)
 Test Files  6 passed (6)
      Tests  62 passed (62)
   Duration  192.86s
```

### 2.3 GATE-3：`bun run build`（串行，含 `tsc -b`）
```
$ ../backend/.venv/Scripts/python.exe ../scripts/openapi_tsgen.py --check
OK: ...\frontend\src\types\openapi.generated.ts is fresh (60 schemas)
$ tsc -b && vite build
vite v6.4.3 building for production...
✓ 4262 modules transformed.
...
dist/assets/index-9UpjKX8h.js                   401.68 kB │ gzip: 125.01 kB
dist/assets/LazyEChartCore-BuRprY3U.js          639.26 kB │ gzip: 216.47 kB
dist/assets/vendor-antd-BPmhL3C_.js           1,566.95 kB │ gzip: 491.20 kB
✓ built in 1m 1s
```
`tsc -b` 无输出（= 通过），全流程 exit code 0；无 `error TS` / `error during build` 行。

> ⚠️ 共享工作树事实：本次 build 时工作树里还有**别的卡的在途改动**（`frontend/src/pages/Research.tsx`、
> `frontend/tests/ResearchWorkspaceEvidence.test.tsx`、backend 三处）。build 仍全绿，说明此刻没有互相打断；
> 但这意味着 GATE-3 覆盖的不只是本卡的文件。

### 2.4 鉴别力证明（变异在 `$env:TEMP` 副本上做，仓库工作树未被改动）

沙箱：`$env:TEMP\vs25-mut-0912012547\`（`src`/`tests` 真副本 + `node_modules` junction 指回仓库，**不是**软链源码）。
变异脚本 `mutate.ts`，从 `*.pristine` 起算、每次只施加一处变异；**先跑 baseline（未变异副本）= 6/6 绿**，确认差异只来自变异本身。
（首次尝试时锚点匹配失败——仓库检出是 **CRLF**，锚点按 LF 写 ⇒ M1/M3/M4 未生效却"假绿"。已修好并重跑，下面的是修复后的结果；
这也是"变异必须先自证生效"的一个实证。）

| 变异 | 去掉的东西 | 结果 |
|---|---|---|
| `baseline` | 无（pristine 副本） | **6 passed (6)** |
| `M1` | 失败分支 + 两处错误态渲染 + `handleCreate` 的归因分支（= 回到修前静默形态） | **5 failed \| 1 passed** |
| `M2` | 只把 `onRetry={() => void loadAgents()}` 改成不接线（错误态仍在） | **1 failed \| 5 passed** |
| `M3` | 只去掉"角色不足 3 个"的如实说明 | **2 failed \| 4 passed** |
| `M4` | 只去掉"失败时不再甩『至少选择 3 个角色』"那一层 | **3 failed \| 3 passed** |

原始输出（节选，逐字）：

```
===== baseline =====
✓ tests/DiscussionRolesUnavailable.test.tsx (6 tests) 4870ms
Tests  6 passed (6)

===== M1 =====
× surfaces the failure in place with its real cause and a retry, instead of only "至少选择 3 个角色"
× surfaces every failure shape the same way (401 / 500 / timeout), not just one of them
× really refetches the role list from retry (1→2→3), then clears the error state and makes roles selectable again
× says plainly how many roles exist when the read succeeds with fewer than 3 (no unreachable prompt)
× treats a successful but empty role list as "no roles available" instead of crashing
TestingLibraryElementError: Unable to find an element with the text: 角色列表读取失败. ...
TestingLibraryElementError: Unable to find an element with the text: agents down #1. ...
AssertionError: expected "Mock" to be called with arguments: [ '当前仅 1 个角色可用，无法选择至少 3 个角色' ]
AssertionError: expected "Mock" to be called with arguments: [ '当前没有可用的角色，无法选择至少 3 个角色' ]
Tests  5 failed | 1 passed (6)

===== M2 =====
× really refetches the role list from retry (1→2→3), then clears the error state and makes roles selectable again
AssertionError: expected 1 to be 2 // Object.is equality      ← 点了"重试"请求计数没涨：接线是真的承重
Tests  1 failed | 5 passed (6)

===== M3 =====
× says plainly how many roles exist when the read succeeds with fewer than 3 (no unreachable prompt)
× treats a successful but empty role list as "no roles available" instead of crashing
TestingLibraryElementError: Unable to find an element with the text: 当前仅 1 个角色可用，无法选择至少 3 个角色. ...
Tests  2 failed | 4 passed (6)

===== M4 =====
× surfaces the failure in place with its real cause and a retry, instead of only "至少选择 3 个角色"
× says plainly how many roles exist when the read succeeds with fewer than 3 (no unreachable prompt)
× treats a successful but empty role list as "no roles available" instead of crashing
AssertionError: expected "Mock" to not be called with arguments: [ '至少选择 3 个角色' ]   ← 误导提示回归即红
Tests  3 failed | 3 passed (6)
```

完整输出留在 `$env:TEMP\vs25-mut-0912012547\out-{baseline,M1,M2,M3,M4}.txt`。

## 3. 未解决问题

1. **同类问题仍在 `Chat.tsx:119-127`**：`apiClient.get('/agents').then(...).catch(() => {})` 仍是静默吞错，
   而它喂的是 Chat 的**角色选择器**。本卡范围只到 Discussion（任务卡"涉及模块"未含 Chat），**未改**。
   它是同一类缺陷的下一处，建议单开一张卡（改法与本次完全同构，可照抄 `loadAgents`）。
2. **非 `Error` 的 rejection**（极少见）会得到**空的**"具体原因"：`error instanceof Error ? error.message : ''`
   与 VS22 的 `loadRooms` 逐字一致 —— 为保持同一契约未改。若要更严，应两处一起改。
3. **`frontend/tests/ResearchWorkspaceEvidence.test.tsx` 的预存在竞态**：本卡未运行、未改动该文件（按任务卡要求）；
   因此"跑全量测试"的结论本卡**没有**给出（只报了本卡相关面 + 一条回归面）。
4. `?topic=` 自动打开对话框的那条既有分支（`agents.length >= 3` 才触发）未动；"失败后重试成功"时会随之打开对话框 ——
   这是既有语义（用例 3 正是靠它证明"恢复后角色真的可选"），不是新行为。

## 4. 风险

| 风险 | 说明 | 缓解 |
|---|---|---|
| 同页出现**两处**同文案失败态（左栏 + 对话框） | 刻意的：左栏无需点击即可见，对话框内是"重试真的点得到"（antd 遮罩挡住左栏）。VS22 的 Dashboard 也有同页多条同文案 Alert 的先例 | 报告里写明；断言请用 `within(rail())` / `within(dialog())` 或 `getAllByText` |
| 用例 1 较重（整页渲染 + 打开 Modal + 三次 waitFor） | 本机并行跑测试时曾超默认 5s（**不是**功能问题：同一条用例在机器空闲时 3.5~4s 通过） | 该用例显式 `}, 20000)`，并在注释里写明原因 |
| 门禁跑在**共享工作树**上 | 并行卡（VS26/VS27）正在改 `Research.tsx` 等；若他们的在途改动破坏了 build，会被误读成本卡问题 | 已在 §2.3 标注；本次 build 全绿 |
| 改动集中在生产页而非新组件 | 风险低：失败态复用 `LoadFailureAlert`，成功路径逐字未动（用例 6 + 既有 10 条 Discussion 用例守着） | — |

## 5. 证据（可复核清单）

- 失败**真的可归因**：`GET /agents` reject ⇒ 左栏与原位对话框各一份 `LoadFailureAlert`，`description` **逐字**是底层错误原文
  （用例断言 `.ant-alert-description` 的 `textContent === 'agents 503'`）；401 / 500 / timeout 三种形态同一条路径。
- **误导提示已消除**：失败时点"创建"给的是"角色列表读取失败，无法选择角色；请先点"重试"重新加载角色"，
  用例显式断言 `warn).not.toHaveBeenCalledWith('至少选择 3 个角色')`；变异 M4 证明这条断言承重。
- **重试真的重发**：用例计数 `1 → 2 → 3`（严格等于点击次数，无自动重发/死循环）；变异 M2 只切断 `onRetry` 接线即变红（`expected 1 to be 2`）。
- **成功路径零回归**：`tests/Discussion.test.tsx` 10/10 绿 + `tests/ListFailureNotEmptiness.test.tsx` 14/14 绿（`LoadFailureAlert` 三个既有调用点契约不变）+ `tsc -b && vite build` 全绿。
- **i18n**：zh/en 各 2483 键、`onlyZh/onlyEn = 0`、无重复；`AuthUnavailable.test.tsx` 的 `zh/en 键集合一致` 断言通过。
- **工作树洁净**：本卡只改了 3 个既有文件 + 新增 1 个测试文件（`git status` 中本卡相关项仅此 4 个）；
  `grep -E 'MUTANT|TEMP-REPRO|TEMP_REPRO|XXX-TEMP'` 对我这 4 个文件**零命中**；变异全程在 `$env:TEMP` 副本上进行。
- 未 commit。
