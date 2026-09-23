# EVALUATION RESULT — VS-25：AI 讨论首用不得"静默死胡同"

> 独立验收（EVALUATOR）。被验提交：**`96fb632`**（VS-25）。工作目录 `E:\Code_file\Projects\finquant-hub`。
> 立场：**假设实现有错**；实现者 `IMPLEMENT_RESULT_VS25.md` 的自述只当待验断言，全部结论取自本次独立复跑与自造夹具。
> 本评估**未修改任何被验文件**（`git diff --stat HEAD -- <VS-25 四文件>` 为空），未 commit。

## 判定：**ACCEPT**

三条要害全部独立复现：**失败真可归因且误导提示已消除**、**重试真重发（以请求计数证明）**、**成功路径零回归**。
实现者的报告与本次实测一致；仅发现 1 条**非阻塞**的残余窗口（下"观察项 O1"），不构成拒收理由。

## 0. 验证对象锚定（先说清"验的是哪份东西"）

| 项 | 结论 |
|---|---|
| 起始 HEAD | `96fb632`（= 被验提交本身） |
| 验证过程中 HEAD 变化 | 编排者提交 VS-26 文档补档 ⇒ `718936f`（无害） |
| VS-25 四文件在 `96fb632..HEAD` 间是否有改动 | **无**（`git diff --stat 96fb632 HEAD -- <四文件>` 为空） |
| 工作树中 VS-25 四文件是否脏 | **干净**（`git diff --stat HEAD -- <四文件>` 为空） |

⇒ 本次在工作树上跑的门禁与沙箱基线，等价于对被验提交的验证。验证期间工作树里只有 VS-27 的在途文件（`Research.tsx`、`backend/...`），**未触碰**。

修前形态（`git show 96fb632^:frontend/src/pages/Discussion.tsx`）实测确认本卡问题为真：

```
94:  apiClient.get('/agents').then((res) => { if (!cancelled) setAgents(res.data.items ?? []); }).catch(() => {});
142: if (selectedRoles.length < 3) { message.warning(t('discussion.rolesRequired')); return; }
zh 'discussion.rolesRequired': '至少选择 3 个角色'
```

## 1. 门禁（全部本机复跑，原始输出留 `$env:TEMP`）

### GATE-1 本卡口径 —— **通过**
`cd frontend; bun x vitest run tests/Discussion.test.tsx tests/DiscussionRolesUnavailable.test.tsx`

```
 ✓ tests/DiscussionRolesUnavailable.test.tsx (6 tests) 5809ms
 ✓ tests/Discussion.test.tsx (10 tests) 4794ms
 Test Files  2 passed (2)
      Tests  16 passed (16)
```
首次即绿，未出现 forks worker 超时，无需按环境噪声重跑。

### GATE-2 零回归抽样 —— **通过**
`bun x vitest run tests/ListFailureNotEmptiness.test.tsx tests/ChatSessionDeepLink.test.tsx tests/ResearchFollowupPrompt.test.tsx`

```
 ✓ tests/ResearchFollowupPrompt.test.tsx (10 tests) 6614ms
 ✓ tests/ListFailureNotEmptiness.test.tsx (14 tests) 10461ms
 ✓ tests/ChatSessionDeepLink.test.tsx (14 tests) 6839ms
 Test Files  3 passed (3)
      Tests  38 passed (38)
```
`ListFailureNotEmptiness` 覆盖 `LoadFailureAlert` 的三个既有调用点（Chat 左栏 / Discussion 左栏 / 首页研究运行区块），14/14 绿 ⇒ **VS-22 契约未被 VS-25 破坏**。

### GATE-3 串行 `bun run build`（含 `tsc -b`）—— **通过**
```
OK: frontend/src/types/openapi.generated.ts is fresh (60 schemas)
$ tsc -b && vite build
✓ 4262 modules transformed.
✓ built in 1m 44s
[exit code: 0]
```
无 `error TS` / `error during build`。构建期工作树含 VS-27 在途改动（`Research.tsx`、backend）仍全绿。
（`dist/` 被重新生成，是 `bun run build` 的固有产物且被 git 忽略；所有门禁**日志**均写在 `$env:TEMP`，未落仓库目录。）

## 2. 逐条可判定结论

### 2.1 失败真可归因，且"请至少选择 3 个角色"不再是唯一解释 —— **成立**

不止复跑实现者的用例，我另写了一份**不复用其 mock 形状**的独立探针（`$env:TEMP` 沙箱，**不 mock `src/services/api`**，改为替换 axios `defaults.adapter`，让请求真的穿过 `api.ts` 的响应拦截器）：

```
 ✓ tests/Vs25IndependentProbe.test.tsx (4 tests) 6367ms
     ✓ P1: a real 503 detail from the backend is the reason shown in the rail, and Retry re-issues through the real client
     ✓ P2: 401 and timeout both land on the same visible, retryable error surface
     ✓ P4: exactly one role available is reported honestly, with no retry and no unreachable prompt
     ✓ P3: a successful but empty role list says so instead of blaming the user
 Test Files  1 passed (1)
      Tests  4 passed (4)
```

P1 断言的核心（我自造的 503 夹具，`data.detail = '角色预设尚未初始化（服务未就绪）'`）在失败时被**逐字**渲染为 `LoadFailureAlert` 的 `description`，实测 DOM：

```html
<div class="ant-alert ant-alert-error ant-alert-with-description" role="alert">
  <div class="ant-alert-message">角色列表读取失败</div>
  <div class="ant-alert-description">角色预设尚未初始化（服务未就绪）</div>
  <div class="ant-alert-action"><button ...><span>重 试</span></button></div>
</div>
```

⇒ ①"具体原因"确实**来自后端**（穿过拦截器后仍是 `detail`），不是测试替身自造的字符串；②失败态是 `ant-alert-error` + 可点重试；③它出现在**左栏**（`.ant-layout-sider` 内，无需任何点击即可见）。

**401 / 500 / timeout 三种是否同一路径**：**是，独立核实通过**。机制层面 `loadAgents` 只有一条 `catch`，把 `error.message` 原样落地，不区分状态码（`Discussion.tsx:114-118`）；P2 用真实拦截器分别注入 401（带 `detail`）与 timeout（`ECONNABORTED`，无 response），两者都落到**同一块** `ant-alert-error` + 同一重试按钮。

**误导提示已消除（本卡灵魂）**——以变异证据判定，而非以自述：把失败分支与三分支归因从副本去掉后，断言"不得再说『至少选择 3 个角色』"**变红**（见 §3 的 M-A）。

### 2.2 重试真重发（以请求计数证明 1→2→3）—— **成立**

- 实现者用例：`calls` 严格 `1 → 2 → 3` 且 `expect(calls).toBe(3)`（失败不触发任何自动重发，无重试死循环），恢复后两处错误态消失、`?topic=` 流程真的预选 4 个角色。
- 我的独立探针 P1：**在真实 axios 客户端上**替换 adapter 计数，点重试后 `agentCalls` `1 → 2`，且第二次成功后错误态消失、下拉选项 ≥3。
- 承重性：变异 M-B（只把 `onRetry={() => void loadAgents()}` 改成空函数，两处）⇒ `expected 1 to be 2`，**2 failed | 7 passed**（见 §3）。

### 2.3 角色本身不足 3 个时如实说明 —— **成立**

| 夹具 | 结果（独立探针，真实拦截器路径） |
|---|---|
| 成功返回 **1** 个角色 | 对话框中原位显示 `当前仅 1 个角色可用，无法选择至少 3 个角色`；**无**重试按钮、**无** `ant-alert-error`；点"创建"时 warning 就是这条（**不是** `至少选择 3 个角色`） |
| 成功返回 **0** 个角色 | 显示 `当前没有可用的角色，无法选择至少 3 个角色`，不崩；同样不给重试；点"创建"时的 warning 也不是 `至少选择 3 个角色` |

语义正确：这是"成功但受限"，不是故障，**不给重试**（重试也变不出角色）。空数组走 `res.data.items ?? []`，不抛异常。

### 2.4 成功路径零回归 —— **成立**

`tests/Discussion.test.tsx` 10/10 绿；GATE-2 38/38 绿；我的独立探针 P1 后半段在真实客户端上确认"重试成功 ⇒ 错误态消失 + 下拉真的可选"；`tsc -b && vite build` 全绿。成功路径上无 `ant-alert-error` / `ant-alert-warning` 残留（含实现者用例 6 的契约断言）。

### 2.5 界定清晰的边界（都已在报告中如实标注，非缺陷）

- `LoadFailureAlert` 只在**失败**时出现两处（左栏 + 对话框下拉上方）——**刻意设计**，按任务卡防误判第 1 条不以"重复渲染"论处；实现者与我的断言均用 `within(rail())` / `within(dialog())` 限定，未用裸 `getByText`。
- i18n 本次 hunk 混入 VS-27 的 3 个键（`deep.agent.reason.deadlineExceeded` / `deadlineBeforeStart` / `deep.report.truncatedByDeadline`）——按任务卡防误判第 2 条**不据此判 REJECT**；我另行核实这 3 键 **zh/en 都有**，未造成键集合失衡（见 §4）。
- `tests/ResearchWorkspaceEvidence.test.tsx` 的竞态属 VS-26，本卡未运行该文件、未改动。

## 3. 鉴别力证明（我自造的变异，沙箱在 `$env:TEMP`，仓库工作树全程未入变异窗口）

沙箱：`$env:TEMP\vs25-eval-mut\`（`src`/`tests` 真副本 + `node_modules` **junction** 指回仓库）。
变异脚本 `mutate.mjs`：先落一份 **LF 归一化**的 `*.pristine-lf`（避开 CRLF 锚点匹配失败导致的"假绿"——实现者也踩过同一个坑），每次只施加一处变异，**锚点命中数不等于预期就抛错拒绝继续**。

**基线（未变异副本）**：`DiscussionRolesUnavailable` 6/6 绿、`Vs25IndependentProbe` 4/4 绿 ⇒ 差异只来自变异本身。

| 变异 | 去掉的东西 | 结果 |
|---|---|---|
| `M-A` | 左栏失败态 + 对话框失败态 + `handleCreate` 三分支归因（= 回到修前静默形态） | **8 failed \| 1 passed (9)** |
| `M-B` | 只把两处 `onRetry={() => void loadAgents()}` 切断（错误态仍在） | **2 failed \| 7 passed (9)** |

原始输出（逐字节选）：

```
=== M-A ===
 × surfaces the failure in place with its real cause and a retry, instead of only "至少选择 3 个角色"
 × surfaces every failure shape the same way (401 / 500 / timeout), not just one of them
 × really refetches the role list from retry (1→2→3), then clears the error state and makes roles selectable again
 × says plainly how many roles exist when the read succeeds with fewer than 3 (no unreachable prompt)
 × treats a successful but empty role list as "no roles available" instead of crashing
 × P1: a real 503 detail ... × P2: 401 and timeout ... × P3: a successful but empty role list ...
TestingLibraryElementError: Unable to find an element with the text: 角色列表读取失败.
TestingLibraryElementError: Unable to find an element with the text: agents down #1.
AssertionError: expected "Mock" to be called with arguments: [ '当前仅 1 个角色可用，无法选择至少 3 个角色' ]
AssertionError: expected "Mock" to be called with arguments: [ '当前没有可用的角色，无法选择至少 3 个角色' ]
AssertionError: expected "Mock" to not be called with arguments: [ '至少选择 3 个角色' ]     ← 本卡灵魂
 Test Files  2 failed (2)
      Tests  8 failed | 1 passed (9)

=== M-B ===
 × really refetches the role list from retry (1→2→3), then clears the error state and makes roles selectable again
 × P1: a real 503 detail from the backend is the reason shown in the rail, and Retry re-issues through the real client
AssertionError: expected 1 to be 2 // Object.is equality
AssertionError: expected 1 to be 2 // Object.is equality
 Test Files  2 failed (2)
      Tests  2 failed | 7 passed (9)
```

结论：**新用例对"失败分支 / 重试接线"确有鉴别力**，且我自造的探针同样变红（说明不是只有实现者自己写的用例才守得住）。

> 过程留痕（如实记录我自己的失误）：M-B 第一次跑时锚点 `onRetry={() => void loadAgents()}`（14 空格）是对话框那行（16 空格）的子串而命中 2 次，脚本按预期抛错，但 TARGET 仍停在 M-A 变异态 ⇒ 那一轮的"M-B 结果"实为 **M-A 的复现**。已改正为显式 `expect=2` 后重跑，上表是修正后的结果。

## 4. i18n 独立核对（与实现者数字的差异已查明）

`bun` 直接 import 两个模块比对（脚本 `$env:TEMP\vs25-i18n-check.ts`）：

```
{ "zh": 2486, "zhUnique": 2486, "en": 2486, "enUnique": 2486,
  "onlyZh": [], "onlyEn": [], "dupZh": 0, "dupEn": 0,
  "vs25KeysPresentInBoth": ["discussion.rolesLoadFailed","discussion.rolesUnavailableHint","discussion.rolesInsufficient","discussion.rolesNone"],
  "vs27KeysAlsoInThisCommit": ["deep.agent.reason.deadlineExceeded","deep.agent.reason.deadlineBeforeStart","deep.report.truncatedByDeadline"] }
```

- **zh/en 键集合完全一致**（各 2486，无单边键、无重复）⇒ 未破坏"双写齐备"约束。
- 我实测 **2486**、实现者报告 **2483**：差 3 恰为 **VS-27 的 3 个键**（其测量时那 3 键尚未进入工作树）。与提交信息里"VS-25 的 4 键与 VS-27 的 3 键同处连续区块、无法按 hunk 分离"的说法**互相印证**，不是矛盾也不是虚报。

## 5. 观察项（**均不构成拒收**，供编排者排期）

- **O1（唯一实质残余）**：`agents` 尚在**请求中**（既未 resolved 也未 failed）的那段窗口里，用户打开创建对话框会看到空下拉 + 提示"请至少选择 3 个角色"。这不是"静默死胡同"（请求一旦失败，左栏会立即给出可归因的可重试错误态），且窗口被 `api.ts` 的 `timeout: 30000` 有界。若日后要更严，可在 `!agentsResolved && !agentsFailed` 时给"正在加载角色…"。
- **O2**：`frontend/src/pages/Chat.tsx:119-127` 仍是 `apiClient.get('/agents')...catch(() => {})`，喂的是 Chat 的角色选择器——**同一类缺陷的下一处**，本卡"涉及模块"未含 Chat，实现者已主动报备，建议单开卡（改法可照抄 `loadAgents`）。
- **O3**：非 `Error` 的 rejection 会得到空 `description`（`error instanceof Error ? error.message : ''`），与 VS-22 `loadRooms` 逐字一致；属有意保持一致，非本卡引入。
- **O4**：`handleCreate` 的闸门是"选得不够就提前 return"，若在失败前已选满 3 个角色则仍会放行创建——极端组合，未观察到实际影响。

## 6. 结论与要求

**ACCEPT。** 实现达到了任务卡的三条验收标准与两条错误场景要求，且**误导性提示已被变异证明真正消除**。
无需返工；建议编排者按 O2 单独开卡处理 Chat 的同类静默吞错。

**未做/做不到的事（如实标注）**：未跑 `tests/test_api.py` 或全量 pytest（按任务卡与项目铁律）；未做浏览器端 E2E（本卡门禁为 vitest + build）；`ResearchWorkspaceEvidence.test.tsx` 未运行（VS-26 在制，与本卡无关）。

## 7. 证据留存

- 仓库外（`$env:TEMP`，验收后已送**回收站**）：`vs25_eval_gate1.txt`、`vs25_eval_gate2.txt`、`vs25_eval_gate3_build.txt`、`vs25-eval-mut\{out-pristine-probe,out-MA,out-MB2,out-probe4}.txt`、`mutate.mjs`、`Vs25IndependentProbe.test.tsx`、`vs25-i18n-check.ts`。
- 工作树：本卡相关文件**未做任何改动**，未 commit；`grep -E 'MUTANT|TEMP-REPRO|TEMP_REPRO|XXX-TEMP|pristine'` 对 VS-25 四文件零命中。
