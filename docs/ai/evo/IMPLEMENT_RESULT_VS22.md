# IMPLEMENT_RESULT — VS-22：失败不得伪装成空态（第二批：左栏列表与运行记录）

> 实现者：IMPLEMENTER（deepseek-flash）。工作目录 `E:\Code_file\Projects\finquant-hub`。**未 commit**。
> 本轮从零开始（上一轮在本卡第 1 轮因 `PI_AI_ERROR` 中止，工作树确认干净，无前置工作可假设）。
> 门禁：相关 vitest **15 文件 91 用例全绿**；`bun run build`（`tsc -b && vite build`）**exit 0**。**未并行**。

---

## 1. 改动（文件:行）

### 1.1 新增共用错误态组件

| 文件 | 内容 |
| --- | --- |
| `frontend/src/components/LoadFailureAlert.tsx`（新增，37 行） | `Alert type="error" showIcon message=… description=… action=<Button>{t('common.retry')}</Button>`。三处**唯一**的错误态写法；无新依赖、无自定义样式（沿用既有 antd Alert + `--fq-*` 体系） |

### 1.2 三处显现面

| 位置 | 文件:行 | 改动 |
| --- | --- | --- |
| Chat 左栏 | `frontend/src/pages/Chat.tsx:84` | 新增 `sessionsError`（失败原因）与 `sessionsRequestRef`（丢弃过期响应） |
| | `Chat.tsx:98-115` | 列表读取抽成可重复调用的 `loadSessions`（成功才 `setSessionsResolved(true)` + 清失败态；失败置 `sessionsFailed` + `sessionsError`） |
| | `Chat.tsx:117` | `useEffect(() => { void loadSessions(); }, [loadSessions])` |
| | `Chat.tsx:319-324` | `sessionsFailed` ⇒ 原位渲染 `LoadFailureAlert`（`chat.listFailed` + 具体错误 + 重试） |
| | `Chat.tsx:326-328` | `sessionsFailed && sessions.length === 0 ? null : <List…/>` —— 失败且本地无记录时**整块不渲染列表**，从根上杜绝"暂无会话"被顺手写出来；失败后本地新建的会话仍可见 |
| Discussion 左栏 | `frontend/src/pages/Discussion.tsx:62,71-88,90,256-266` | 与 Chat **完全同构**（`roomsError` / `loadRooms` / `discussion.listFailed`） |
| ResearchRuns 区块 | `frontend/src/components/ResearchRuns.tsx:8-22` | 新增 `error?: string \| null` 与**必填** `onRetry`；`error != null` ⇒ 渲染 `LoadFailureAlert`（`today.researchRunsFailed`），**不再**退化成 `<p>UNKNOWN</p>` 空列表。判据用 `error != null` 而非"错误文案是否为空串"——底层错误可能没有 message，空串不得被误判成成功 |
| | `frontend/src/pages/Dashboard.tsx:102` | `statsAlert` 改由 `LoadFailureAlert` 渲染（`statsFailed ? statsAlert : …` 结构原样保留） |
| | `Dashboard.tsx:116` | `<ResearchRuns runs={researchRuns} error={statsFailed ? statsError : null} onRetry={() => void loadStats()} />` |

### 1.3 i18n（zh/en 同步；4 个新键，两边各 4 处）

| key | zh（行） | en（行） |
| --- | --- | --- |
| `chat.listFailed` | `zh.ts:1855` 会话列表读取失败 | `en.ts:1855` Could not load your sessions |
| `discussion.listFailed` | `zh.ts:1883` 讨论列表读取失败 | `en.ts:1884` Could not load your discussions |
| `today.researchRunsFailed` | `zh.ts:1122` 研究运行记录读取失败 | `en.ts:1122` Could not load research runs |
| `common.retry` | `zh.ts:1715` 重试 | `en.ts:1715` Retry |

zh/en **一键不差**：脚本比对全量键集合，两边各 **2478** 键，`only in zh = 0`、`only in en = 0`。

### 1.4 测试

| 文件 | 内容 |
| --- | --- |
| `frontend/tests/ListFailureNotEmptiness.test.tsx`（新增，14 用例） | 三处共用一个判据函数 `expectFailureSurfaced`（失败文案 + 具体错误 + 可点重试 + `.ant-alert-error` + `description` 原文）与 `expectEmptyClaimAbsent`。Chat 6 条、Discussion 5 条、首页"研究运行"3 条 |
| `frontend/tests/ResearchRuns.test.tsx` | 既有 2 条补 `onRetry`；新增 2 条：失败原位报错且可重试 / "成功 == error 为 null，而不是错误文案为空串" |
| `frontend/tests/Dashboard.test.tsx`（**VS-19 的用例文件，见 §6 风险披露**） | 只把 3 处计数断言**限定到两张卡片所在区域** `.workbench-context-grid`（数字仍是 2），VS-19 原意"两张卡片位置各有一处"保持不变 |

---

## 2. 口径与设计决策

1. **一个组件、四处渲染**：`LoadFailureAlert` 同时服务 Chat 左栏、Discussion 左栏、首页两张卡片、首页"研究运行"区块。同一页面上"同一个失败两种待遇"（一处 Alert、一处空态）是本类缺陷的复发形态，共用实现后新接入的位置写不出第二种口径。
2. **判据唯一**：三处都只看"请求是否成功"（`sessionsFailed` / `roomsFailed` / `statsFailed`），空态文案只由 `List` 的 `dataSource` 为空触发，且**失败且本地无记录时列表整块不渲染**。
3. **失败态不在重试开始时清空**（与 `loadStats` 略有不同，属刻意）：若在重试发起时清掉，重试期间会闪回"暂无会话/暂无讨论"——正是本卡要消灭的假象。只有请求**真的成功**才清除错误态。
4. **重试 = 真的重发**：`loadSessions` / `loadRooms` 是 `useCallback` 出来的可重复调用函数，重试按钮直接调用它，不是"关掉提示"。用请求序号 `requestRef` 丢弃过期响应，避免慢的首次请求覆盖快的重试结果。
5. **失败不得藏起真实记录**：`sessionsFailed && sessions.length === 0` 才不渲染列表。失败之后本地新建的会话/讨论是真实存在的，必须照常可见（这条是自审时补的——初版会把它们一起藏掉）。

---

## 3. 错误场景的取舍（必答）

| 场景 | 行为 |
| --- | --- |
| **列表请求失败 且 深链指向某 id**（`?session=43` / `?room=42`） | **两条提示都出现，但归因完全一致**：①左栏**常驻**内联错误态（读取失败 + 具体错误 + 重试）；②VS-19 的**一次性** toast `chat.deepLinkUnavailable`（"会话列表读取失败，未能打开指定会话"）。两者是**同一次失败的两个粒度**（一个说"这块读不出来、可以重试"，一个说"你要打开的那条因此没打开"），不是重复弹同一条。**"该会话已不存在"（`deepLinkMissing`）一个字都不出现**——列表都没拿到，无法判定数据是否存在。两个 key 严格不混用（VS-19 成果保持）。 |
| **重试仍失败** | 错误态保持（不被清空），按钮仍在、可再点；`calls` 严格等于点击次数（无自动重发、无死循环）。用例断言 `calls===3`。 |
| **失败后恢复成功** | 错误态消失（`sessionsFailed=false` + `sessionsError=''`），列表正常渲染真实记录，且 `boom` 等错误文案不再残留。 |
| **stats 成功但 `recent_rooms` 为空** | 该区块显示其**既有空态**（`<p>UNKNOWN</p>`），**不**出现失败文案、**不**出现重试。合法空态未被误报为失败。 |

> 说明（口径观察，非本卡范围内改动）：`ResearchRuns` 的合法空态历史上就是 `<p>UNKNOWN</p>` 而不是"暂无研究运行记录"。本卡**未改**它（改了会破坏既有用例 `ResearchRuns.test.tsx` 的 `runs=[] → UNKNOWN` 断言，且属于既有设计问题）。见 §6。

---

## 4. 门禁原始输出

### 4.1 相关 vitest（15 文件 / 91 用例）

命令（`maxWorkers: 1`，串行）：

```
node node_modules\vitest\vitest.mjs run tests/ListFailureNotEmptiness.test.tsx tests/Dashboard.test.tsx tests/ResearchRuns.test.tsx tests/ChatSessionDeepLink.test.tsx tests/ChatStarterDraft.test.tsx tests/ChatBacktestRedirect.test.tsx tests/Discussion.test.tsx tests/DiscussionStreaming.test.tsx tests/DiscussionTimeline.test.tsx tests/I18n.test.tsx tests/CorePrimitiveI18n.test.tsx tests/AppNavigation.test.tsx tests/ResearchModeRouting.test.tsx tests/DiscoverModeDispatch.test.tsx tests/GlobalTaskEntry.test.tsx
```

输出尾部（原样粘贴；vitest 在本机只回显滚动尾部）：

```
 ✓ tests/ResearchRuns.test.tsx (4 tests) 647ms
     ✓ reports a read failure in place instead of the empty run list, with a working retry  358ms
 ✓ tests/CorePrimitiveI18n.test.tsx (1 test) 334ms
     ✓ renders decision, artifact, and metric boundaries in English  332ms
 ✓ tests/DiscussionTimeline.test.tsx (2 tests) 282ms
 ✓ tests/DiscussionStreaming.test.tsx (5 tests) 5ms

 Test Files  15 passed (15)
      Tests  91 passed (91)
   Duration  142.55s (transform 1.45s, setup 3.20s, import 99.31s, tests 19.47s, environment 16.92s)
```

> 本机既有噪声照录：`⚠️ React Router Future Flag Warning`、`Not implemented: Window's getComputedStyle() ... pseudo-elements` —— 修前同样存在。本轮**未**出现 forks worker 超时，无需重跑。

### 4.2 `bun run build`（串行，未与 vitest 并行）

```
$ tsc -b && vite build
dist/assets/LoadFailureAlert-CFIpF9GZ.js          3.04 kB │ gzip:   1.30 kB
dist/assets/Dashboard-CRSXLaMq.js                18.57 kB │ gzip:   5.42 kB
dist/assets/Research-CDtlYY2m.js                 47.55 kB │ gzip:  14.60 kB
✓ built in 20.71s
EXIT=0
```

### 4.3 i18n zh/en 一一对应

```
zh keys=2478  en keys=2478
only in zh: 0 ->
only in en: 0 ->
common.retry : zh=True en=True
today.researchRunsFailed : zh=True en=True
chat.listFailed : zh=True en=True
discussion.listFailed : zh=True en=True
```

---

## 5. 鉴别力证明（**改副本**，真实工作树全程未被变异）

做法：把 `frontend/src` + `frontend/tests` 全量复制到 `$env:TEMP\vs22-mut2-*`，`node_modules` 用 junction 指向真实目录，**只在副本里植入缺陷**再跑 `tests/ListFailureNotEmptiness.test.tsx`（14 用例）。真实工作树**从未**处于变异态，事后已核对无 `TEMP-REPRO|MUTATED|false ? (` 等标记。跑完回收 junction + 临时目录（真实 `node_modules` 完好）。

| 变异 | 植入 | 结果（原始输出摘录） |
| --- | --- | --- |
| **M1** | `Chat.tsx`：`{sessionsFailed ? (` → `{false ? (`（去掉左栏失败判据） | `Tests 5 failed \| 9 passed (14)`；红：`shows an in-place error with a retry instead of the empty state when /chat/sessions fails`、`really refetches the list from the retry…`、`keeps the error state and stays retryable…`、`keeps a session created after a failed list read visible…`、`keeps the deep-link notice and the list-read failure distinct…` |
| **M2** | `Discussion.tsx`：`{roomsFailed ? (` → `{false ? (` | `Tests 4 failed \| 10 passed (14)`；红：Discussion 的 4 条（失败原位报错 / 重试重发 / 重试再失败 / 失败后新建仍可见） |
| **M3** | `ResearchRuns.tsx`：`error != null ?` → `false ?`（去掉区块失败判据） | `Tests 2 failed \| 12 passed (14)`；红：`surfaces the same failure in place instead of only rendering the empty run list`、`really refetches stats from the block retry and renders the runs once it succeeds` |
| **M4** | `Chat.tsx`：`onRetry={() => void loadSessions()}` → `onRetry={() => undefined}`（重试不再重发，只留提示） | `Tests 2 failed \| 12 passed (14)`；红：`really refetches the list from the retry, and recovers once it succeeds`（`AssertionError: expected 1 to be 2`）、`keeps the error state and stays retryable when the retry fails again (no retry loop)` |

关键**对照**：四个变异下**"成功且为空 ⇒ 仍显示暂无…"与"stats 成功但无记录 ⇒ 仍显示空态"两组用例始终为绿**（9/10/12/12 通过）——说明这些用例真的在区分"失败"与"合法空态"，而不是笼统地"一变就红"。

---

## 6. 未解决问题 / 风险

### 6.1 【需编排者裁决】我改了 VS-19 的用例文件（语义未变，但确实动了）

`frontend/tests/Dashboard.test.tsx` 的 VS-19 用例里有两处**全局计数**断言：

```ts
expect(screen.getAllByText('stats upstream unavailable')).toHaveLength(2);
expect(screen.getAllByRole('button', { name: /重\s*试/ })).toHaveLength(2);
```

`stats` 失败时"研究运行"区块现在**也会**显示同一个具体错误与自己的重试，页面因此有 **3** 处。我把这两条（以及第 3 条用例里点重试的那一处）**限定到两张卡片所在容器 `.workbench-context-grid`**，数字与断言原意（"两张卡片位置各有一处"）都保持不变。其余 VS-19 断言一字未动，VS-19 的 7 条用例全绿。

- 我认为这是"新增错误面"的必然结果，且限定作用域比把 2 改成 3 更能保住 VS-19 的原意；
- 但"零回归：VS-19 的既有用例全绿"是硬标准，**动过它的测试文件这件事必须由你确认**。若你要求 VS-19 文件一字不改，替代方案是让"研究运行"区块改用不带重试、不带错误原文的轻量提示（代价：三处口径不再完全一致）。请裁决。

### 6.2 `ResearchRuns` 的合法空态仍是 `<p>UNKNOWN</p>`

它表达"未知"而不是"确实没有运行记录"，语义上与空态原则仍有轻微张力。本卡未改（超出范围，且会破坏既有断言）。建议单开小卡：`runs=[]` ⇒ "暂无研究运行记录"，同时更新 `ResearchRuns.test.tsx`。

### 6.3 加载期仍有一瞬空态

列表请求在途时（`sessionsResolved=false`、`sessionsFailed=false`）左栏仍渲染 `List` 的空态文案，直到响应落地。与 VS-19 首页卡片的行为一致，本卡未扩大范围（未加 loading 骨架）。若要求"在途也不得显示空态"，需另开卡。

### 6.4 其他

- 未加依赖、未改后端、未改 schema、未删文件、未 commit。
- 仓规要求"修 bug → 同步 `docs/HANDOVER.md`"、收尾追加 `task/CHANGELOG.md`：这两个文件**在本卡允许范围之外**（本卡只允许前端 + 本结果文件），**故意未动**，留给编排者/提交者按收尾流程处理。
- 范围外文件（`backend/app/services/llm_client.py`、`backend/app/routers/chat.py`、`research_orch.py`、`frontend/src/pages/Research.tsx` 等）**未触碰**。
- 行尾：改动文件在索引中均为 LF（`.gitattributes` 未覆盖 `.ts`，工作副本 LF/CRLF 混存属本机 `autocrlf=true` 既有状态，`git diff` 无全文件行尾噪声）。

---

## 7. 证据

- 三处判据的**同一套**断言：`frontend/tests/ListFailureNotEmptiness.test.tsx` 的 `expectFailureSurfaced`（失败文案 + 具体错误 + 可点重试 + `.ant-alert-error` + `description` 原文）、`expectEmptyClaimAbsent`（失败时空态文案必须为空）。
- "重试真的重发"的**量化**证据：用例里数 `apiClient.get` 调用次数（`calls` 1→2→3），M4 变异下 `AssertionError: expected 1 to be 2`。
- "未误伤合法空态"的**量化**证据：`成功后为空 ⇒ 暂无会话/暂无讨论` 三条 + `stats 成功无记录 ⇒ 区块空态` 一条，在 M1–M4 四个变异下**始终为绿**。
- VS-19 成果保持：`ChatSessionDeepLink.test.tsx` / `Discussion.test.tsx` 的深链用例（一次性提示、两 key 不混用、不为非法 id 发请求）全绿；新增用例额外断言"列表失败时绝不出现'已不存在'"。
- 全文 `git status`：`frontend/src/components/LoadFailureAlert.tsx`、`frontend/src/components/ResearchRuns.tsx`、`frontend/src/pages/{Chat,Discussion,Dashboard}.tsx`、`frontend/src/i18n/{zh,en}.ts`、`frontend/tests/{ListFailureNotEmptiness,ResearchRuns,Dashboard}.*` 与本文档；**无其他文件**，**未 commit**。
