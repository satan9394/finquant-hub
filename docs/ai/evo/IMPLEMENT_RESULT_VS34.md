# IMPLEMENT_RESULT — VS-34：Chat 的静默吞错改为可归因、可重试

> 状态：**已完成为交付态**（不 commit）。门禁与鉴别力证据均为本会话实测原始输出。
> 任务卡：`docs/ai/evo/IMPLEMENTATION_BRIEF_VS34.md`
> 基线：`HEAD = a03ac75`（`Chat.tsx` 交付前的形态 = `HEAD:frontend/src/pages/Chat.tsx`，blob `4fd7d5826ffd616de442ed501b7bc5bb09c6cf6e`）
> 交付物：`frontend/src/pages/Chat.tsx`、`frontend/src/i18n/{zh,en}.ts`、`frontend/tests/ChatReadFailureRetry.test.tsx`、本文件。**未 commit。**

---

## 0. 作业窗口声明

- 本卡**不 commit**；未触碰 `frontend/src/components/LoadFailureAlert.tsx`（VS-29 唯一三态实现处）与 `ChatMessageBubble`（VS-23/28 截断链路）。
- **变异窗口声明**：本卡的"退回修复"实验**不在仓库工作树里做**——我把整个 `frontend/`（排除 `node_modules`/`dist`，用 junction 指回真实 `node_modules`）复制到
  `%TEMP%\vs34-mutant\frontend`，只在**副本**里把 `src/pages/Chat.tsx` 换回 HEAD。**仓库工作树在整段实验期间从未进入变异态**，故不存在"被误读成交付态"的窗口。
- **复原核对（SHA256，实验前后各一次，四次全部一致）**：

  | 文件 | SHA256（实验前 = 实验后） |
  |---|---|
  | `frontend/src/pages/Chat.tsx` | `9ACD8DC9C774226F100D0B65DD74B075F0BFBFAC09A666EEE74D6AFFE7F5395D` |
  | `frontend/src/i18n/zh.ts` | `A978850AD14E92078CD65B90AAFA273B5EFD643ED8F8973E662A1EBB73C712A5` |
  | `frontend/src/i18n/en.ts` | `18178E6B7E3320B52DB7F2C53B2AE8692400CD4BCC7A34B46A0A1FEFB2CDC34B` |
  | `frontend/tests/ChatReadFailureRetry.test.tsx` | `3E6270D3128969DBD94B0B77DFAA403F6B90EA51436755AF4C2F1C3D87376426` |

  副本里"退回修复"的**字节级**证明（不是"看起来像 HEAD"）：
  `git rev-parse HEAD:frontend/src/pages/Chat.tsx` = `4fd7d5826ffd616de442ed501b7bc5bb09c6cf6e`
  `git hash-object %TEMP%\vs34-mutant\frontend\src\pages\Chat.tsx` = `4fd7d5826ffd616de442ed501b7bc5bb09c6cf6e` ⇒ **identical = True**（blob 相同 = 逐字节相同）。
- **并发声明**：本窗口内 **VS-35 在制**，其文件集为 `backend/app/services/swarm_orch.py`、`backend/tests/test_swarm_orch.py`、`frontend/src/components/SwarmStatusCard.tsx`、`frontend/src/features/swarm/state.ts`、`frontend/src/pages/Research.tsx`、`frontend/tests/SwarmStatusCard.test.tsx`、`frontend/tests/swarm.test.ts`。
  - 与我的文件集**不相交**（我改的 i18n 两个文件经 `git diff` 逐行核对：`zh +10 / en +11` 行**全部**是本卡的 4 个键与注释，无一行来自 VS-35）。
  - 但 `bun run build`（`tsc -b` + `vite build`）会**编译** VS-35 的在制 `src/` ⇒ 该门禁属跨卡共享资源。**本卡实测该次 build 通过（exit 0）**；若它当时正处变异态，我也不能证明与我无关——如实记此边界，不替它归因。
- **清理**：本卡未杀任何进程（未启动任何后台服务）；未删除仓库内任何文件。副本留在 `%TEMP%\vs34-mutant`（内含指向真实 `node_modules` 的 junction，按仓规"含 junction 的目录回收易失败"故不冒险递归回收）。

---

## 0.5 半成品的处置决定：**(a) 续写**（理由如下，且最终交付由我负全责）

**先看 diff 再决定**。`git diff frontend/src/pages/Chat.tsx` 给出 `+99/-20`，逐 hunk 审视结论：

| hunk | 内容 | 判定 |
|---|---|---|
| `@@ -87,7 +87,19 @@` | 删 `loadingMessages`，新增 `agentsFailed/agentsError/agentsRequestRef` 与 `messagesLoadedId/messagesFailed/messagesError/messagesErrorId/messagesRequestRef` | 方向正确：与**同文件既有** `loadSessions`（VS22）的 state 形状同构 |
| `@@ -129,16 +141,31 @@` | `loadAgents` 抽成可重复调用 + 请求序号丢弃过期响应 + 仅成功才清失败态 | 与 VS-25 `Discussion.loadAgents` **逐行同构**，正确 |
| `@@ -170,14 +197,42 @@` | `loadMessages(sessionId)` 抽取 + 作用域化的失败归属 | 正确，且比 VS-25 多做了"错误原文按实体作用域"（正是 VS-32 的教训） |
| `@@ -323,6 +378,20 @@` | `messagesState = readStateOf({...})` 经 `LoadStateView` 渲染消息区 | 正确：复用 VS-29 三态契约，未另造判定 |
| `@@ -408,10 +477,20 @@` | 消息区 render 换成 `LoadStateView` | 正确 |

**半成品缺的是什么（这才是它"停在半路"的地方）**：
1. 吞错点 A（`/agents`）**只有 state、没有 UI** —— `agentsFailed`/`agentsError` 被写、从不被读；原文最后一句正是 "Now the message area render and the roles failure alert"（消息区已做完，角色失败提示未做）。
2. 三个新 i18n 键（`chat.messagesFailed` / `chat.messagesLoading` / `chat.messagesEmpty`）**不存在** ⇒ `translate()` 会原样回退成键名（`frontend/src/i18n/index.ts:16`），消息区会把 `chat.messagesFailed` 这种字样直接渲染给用户。
3. `Spin` 成为未使用导入（原 `loadingMessages` 的 `<Spin/>` 已被删）。

**为什么选续写而不是重做**：①方向不是"看起来对"而是**与族内既有范式逐行同构**（`loadSessions`/`loadAgents`/`LoadStateView`），重做只会把同一设计再写一遍；②缺失的三项都是**有明确边界的补集**，不是"看起来差不多"；③丢弃它反而会丢掉一处**比 VS-25 更完整**的设计（`messagesErrorId` 的实体作用域），而那是 VS-32 用代价换来的教训。
**同时声明**：该半成品**从未被验收**，因此我**不是**在"沿用已认可的进度"——我把它当作**未验收的草稿**，逐条复核（上面 5 个 hunk）、补完缺失项，并对最终整份改动负责。复核中另发现的 3 处问题（未使用导入、缺 i18n、`readStateOf` 的 `count` 需含流式气泡）已一并处理。

---

## 1. 第一步：`Chat.tsx` 内全部吞错点清单（逐处归因）

> 逐处结论先行：**2 处要改（A、B），其余 5 处不改并给出理由**。
> 行号以基线 `HEAD` 的 `frontend/src/pages/Chat.tsx`（481 行）为准，**由我独立重扫确认**（不是照抄骨架）。

| # | 位置（基线行） | 代码形态 | 它喂的是什么 UI | 归因 |
|---|---|---|---|---|
| A | `132-140`（`.catch` 在 **138**） | `apiClient.get('/agents').then(...).catch(() => {})` | 右栏工具栏角色 `Select` 的 `options`（`:393`）+ 新建会话的 `role_preset`（`:191`） | **改**。读取失败被整个吞掉 ⇒ 下拉永远是空的，"失败"与"确实没有角色"在界面上完全一样，且**没有任何重试入口**。与 VS-25 在 `Discussion.tsx` 修的**同类同形**。 |
| B | `173-180`（`.catch` 在 **178**） | `apiClient.get(.../messages).then(...).catch(() => {}).finally(...)` | 右栏消息流（`:415` `currentMessages.map`） | **改**。读取失败后消息区**什么都不渲染** ⇒ 被渲染成"这个会话是空的"（VS-19/VS-22 底线），且无重试。**主内容区**，危害最大。 |
| C | `275` | `await response.json().catch(() => ({ detail: t('chat.requestFailed') }))` | 非 2xx 时构造 `throw new Error(...)` 的文案 | **不改，且不是吞错**。它把"响应体不是 JSON"降级成**更笼统但真实**的原因（"请求失败"），该原因随即被 `:276` 抛出、由 `:310` 的 `message.error` **显示给用户**。被吞的是"解析失败"这一种，不是"请求失败"。 |
| D | `308-311` | `catch (err) { if (err.name !== 'AbortError') message.error(...) }` | 发送失败的 toast | **不改**。失败**可见**（toast 带底层 message）。忽略 `AbortError` 是**用户自己按了"停止"**（`handleStop` → `abortRef.abort()`）——把用户的主动取消渲染成"发送失败"才是缺陷。 |
| E | `196-198` | `catch (e: any) { message.error(e.message) }`（新建会话，写路径） | toast | **不改**（本卡范围是**读取**）。失败可见。遗留风险：`e.message` 对非 Error rejection 可能是 `undefined` ⇒ toast 无文案；**已记入 §6**，不在本卡改动面内。 |
| F | `207-209` | 同上（删除会话，写路径） | toast | **不改**，理由同 E。 |
| G | `219-221` | 同上（切换角色，写路径） | toast | **不改**，理由同 E。 |

**扫描完整性（可复查）**：对 `HEAD:frontend/src/pages/Chat.tsx` 全文检索 `catch|try {|.then(|await apiClient|await fetch|readSSE|.finally(`，命中：`:121`（`loadSessions` 的 try/catch，VS22，失败**可见**，非吞错）、`:138`（A）、`:178`（B）、`:196`/`:207`/`:219`（E/F/G）、`:275`（C）、`:308`（D），另 `:280` `readSSE`。
即 **3 个 promise `.catch(` + 5 个 `try/catch` = 8 处，无遗漏**。其中唯一被静默吞掉的只有 A 与 B。
`readSSE` 的 `error` 事件分支（`:281-284`）走 `message.error(data.error ?? data.message ?? t('chat.sendFailed'))` ⇒ **有底层原因、可见，非吞错**。

**"两个独立来源都对得上"**：VS-25 报的 `:119-127` 与 VS-32 报的 `:176-179` 在基线行号上正是 A（`/agents`：`:132-140`，卡里引的是其上文的 effect 头部）与 B（`/messages`：`:173-180`，卡里引的正是 `.catch` 那一行 `:178`）。

---

## 2. 改动（文件:行）

### 2.1 `frontend/src/pages/Chat.tsx`

`git diff --numstat HEAD -- frontend/src/pages/Chat.tsx` ⇒ **`146 37`**（合计 +146/-37）。其中半成品遗留 `+99/-20`，**本卡在其上净 +47/-17**（补角色失败 UI 两处、i18n 接线、`Spin` 导入清理与注释）。

| 位置（交付后行号） | 改动 |
|---|---|
| `L6` | antd 导入移除已不再使用的 `Spin`（原 `loadingMessages` 的 `<Spin/>` 已由 `LoadStateView` 的 loading 分支取代） |
| `L15-18` | 新增 `import LoadFailureAlert, { LoadStateView, readStateOf } from '../components/LoadFailureAlert';`（**复用** VS-29 族内唯一实现处，不另造） |
| `L90-102` | 新增吞错点 A 的 state（`agentsFailed`/`agentsError`/`agentsRequestRef`）与吞错点 B 的 state（`messagesLoadedId`/`messagesFailed`/`messagesError`/`messagesErrorId`/`messagesRequestRef`），替换 `loadingMessages` |
| `L144-169` | `loadAgents` 抽成可重复调用 + `useEffect(() => void loadAgents())`（原为 `.catch(() => {})`） |
| `L199-235` | `loadMessages(sessionId)` 抽成可重复调用 + effect 接线（原为 `.catch(() => {})`）；`currentSessionId` 变为 `null` 时**作废在途请求**并清三态 |
| `L381-393` | 消息区三态事实：`scopedMessagesFailed`（错误**按会话作用域**）/`scopedMessagesResolved`/`visibleMessageCount` ⇒ `readStateOf(...)` |
| `L401-419` | **新增**：左栏"新建会话"按钮下方的角色失败态（`LoadFailureAlert`，`onRetry={() => void loadAgents()}`） |
| `L466-498` | **新增**：工具栏改为"flex 行 + 其下角色失败态"两段结构，角色 `Select` 正下方原位给出失败态与重试 |
| `L510-545` | 消息区改由 `LoadStateView` 一个 switch 渲染（`failureMessage`/`loadingText`/`emptyContent`/`retainedCount`/`showContentOnError`） |

设计要点（三条均对齐 VS-25 范式）：
1. **可归因**：`catch (error: unknown) { set...Error(error instanceof Error ? error.message : '') }` —— 底层原因原样带出，由 `LoadFailureAlert` 的 `description` 呈现；
2. **真重发**：`onRetry` 直接调用 `loadAgents()` / `loadMessages(currentSessionId)`（而不是"只把提示关掉"）；
3. **失败不被渲染成空**：三态一律经 `readStateOf` 判定（失败优先于一切），页面**不自行编排** loading/empty/error；
   另外**重试发起时不清失败态**（仅成功才清），避免重试期间闪回"空/加载"。

### 2.2 `frontend/src/i18n/zh.ts`（`+10`）、`frontend/src/i18n/en.ts`（`+11`）

新增 4 个键（两语言同步，含说明注释）：`chat.messagesFailed`、`chat.messagesLoading`、`chat.messagesEmpty`、`chat.rolesLoadFailed`。
> 修前 Message 区三态文案不存在（沿用半成品会直接把键名渲染给用户）；且 `chat.messagesEmpty` 是"诚实的空态"的唯一出口。

### 2.3 `frontend/tests/ChatReadFailureRetry.test.tsx`（新增，9 条用例）

覆盖：B 失败可见/不伪装成空；B 重试真重发（计数）；B 重试在途保持失败态；B 成功且空 ⇒ 诚实空态；B 错误原文按会话作用域（正+反双向）；A 两处消费方都原位可见；A 重试真重发（计数）；A 成功但无角色 ⇒ **不得**报错（反向断言）。

---

## 3. 四条实测

### ① 失败可见（错误态 + **底层原因** + 可点重试）

用例 `失败 ⇒ 消息区原位给出失败文案 + 底层原因 + 可点重试，且绝不出现空态文案`：
断言 `within(content()).getByText('消息记录读取失败')` + `getByText('message store unavailable')` + `getByRole('button', { name: /重\s*试/ })` + `querySelector('.ant-alert-error')` + `.ant-alert-description.textContent === 'message store unavailable'`（与 VS22/25/29 的 `expectFailureSurfaced` 同款判据）。
吞错点 A 同款：`within(rail())` 与 `within(content())` **两处**各自独立断言通过。

### ② 重试**真的重发**——以**请求计数**证明（不是"重试后成功"）

- B：`expect(calls.messages).toBe(1)` → 点击重试 → `findByText('只回放属于 42 的历史消息')` → `expect(calls.messages).toBe(2)`。
- A：`expect(calls.agents).toBe(1)` → 点击重试 → `expect(calls.agents).toBe(2)`（`waitFor` 轮询）。
计数来自 `stubApi` 里对 `apiClient.get` 每个 URL 面的独立自增，**与"成功与否"完全解耦**。

### ③ 失败**不伪装成空**

- B 失败态下 `queryByText('这个会话还没有消息')` ⇒ `null`（同时也不得残留 loading 文案）。
- 反向：`/agents` 成功但 `items: []` ⇒ `queryByText('角色列表读取失败')` 与 `queryByRole('button', {name: RETRY})` 均为 `null`（否则就是把"失败可见"做成了"永远报错"）。
- 反向：`/messages` 成功且 `items: []` ⇒ **才**出现 `这个会话还没有消息`。

### ④ 零回归（Chat 既有测试全绿）

`bun run test -- <8 个文件>` ⇒ **Test Files 8 passed (8) / Tests 75 passed (75)**；另补跑 `tests/ResearchModeRouting.test.tsx`（mock 了 Chat）⇒ **5 passed**。
**既有断言一条未改、未放宽**（`git status` 显示我只新增了 `tests/ChatReadFailureRetry.test.tsx`，未修改任何既有测试文件）。

---

## 4. 门禁原始输出

### 4.1 相关 vitest（新增文件，首次）

```
$ vitest run tests/ChatReadFailureRetry.test.tsx
 ✓ tests/ChatReadFailureRetry.test.tsx (9 tests) 4946ms
     ✓ 失败 ⇒ 消息区原位给出失败文案 + 底层原因 + 可点重试，且绝不出现空态文案  2180ms
     ✓ 重试**真的重发请求**（计数 n=1→n=2），且恢复成功后失败态消失、历史消息出现  388ms
     ✓ 重试在途 ⇒ 失败态保持（不闪回"加载中"，也不闪回空态）  444ms
     ✓ 43 自己失败 ⇒ 必须显示 43 自己的错误原文（反向断言：不得修成"错误永不显示"）  432ms
     ✓ 失败 ⇒ 左栏（新建会话的 role_preset）与角色下拉下方两处都原位给出失败态  406ms
     ✓ 重试**真的重发请求**（计数 n=1→n=2），恢复后两处失败态都消失  307ms
     ✓ 成功但确实没有角色 ⇒ 不得出现失败态（把"失败可见"做成"永远报错"同样是缺陷）  302ms
 Test Files  1 passed (1)
      Tests  9 passed (9)
   Duration  192.77s (transform 1.26s, setup 9.27s, import 133.74s, tests 4.95s, environment 43.28s)
```

### 4.2 相关 vitest（Chat 全族 + 本卡新增，共 8 文件）

```
$ vitest run tests/ChatReadFailureRetry.test.tsx tests/ChatDeadlineSignal.test.tsx tests/ChatSessionDeepLink.test.tsx tests/ChatBacktestRedirect.test.tsx tests/ChatStarterDraft.test.tsx tests/ChatMessageBubble.test.tsx tests/ListFailureNotEmptiness.test.tsx tests/ReadStateThreeWay.test.tsx
 ✓ tests/ReadStateThreeWay.test.tsx (22 tests) 6398ms
 ✓ tests/ListFailureNotEmptiness.test.tsx (14 tests) 7959ms
 ✓ tests/ChatReadFailureRetry.test.tsx (9 tests) 4054ms
 ✓ tests/ChatBacktestRedirect.test.tsx (8 tests) 3314ms
 ✓ tests/ChatDeadlineSignal.test.tsx (5 tests) 2468ms
 ✓ tests/ChatSessionDeepLink.test.tsx (14 tests) 2471ms
 ✓ tests/ChatStarterDraft.test.tsx (1 test) 670ms
 ✓ tests/ChatMessageBubble.test.tsx (2 tests) 80ms
 Test Files  8 passed (8)
      Tests  75 passed (75)
   Duration  160.46s (transform 1.88s, setup 3.54s, import 108.71s, tests 27.41s, environment 17.14s)
```

其中 `ChatDeadlineSignal.test.tsx`（VS-23/28 截断链路）5 条、`ReadStateThreeWay.test.tsx`（VS-29 三态契约）22 条 **全绿**。
**本窗口未出现任何 `Test timed out in 5000ms`**：无需登记超时噪声（这一条是实测结论，不是默认假定）。

### 4.3 串行 `bun run build`

```
$ bun run build
$ ../backend/.venv/Scripts/python.exe ../scripts/openapi_tsgen.py --check
OK: E:\Code_file\Projects\finquant-hub\frontend\src\types\openapi.generated.ts is fresh (60 schemas)
$ tsc -b && vite build
vite v6.4.3 building for production...
✓ 4263 modules transformed.
✓ built in 40.85s
(!) Some chunks are larger than 500 kB after minification. ...
=== exit=0 ===
```
（`bun run build` 期间无本卡其他门禁并发；`tsc -b` 覆盖含 VS-35 在制文件在内的整个 `src/`，通过。见 §0 并发声明。）

---

## 5. 鉴别力证明（退回修复 ⇒ 新用例变红）

**做法**：副本 `%TEMP%\vs34-mutant\frontend`（junction → 真实 `node_modules`）里把 `src/pages/Chat.tsx` 换回 `HEAD`（blob 相同 = 逐字节相同，见 §0），**保留**新测试文件与 i18n 键（i18n 对退回后的实现是惰性的，故被验对象只有"修复本身"）。

```
$ cd %TEMP%\vs34-mutant\frontend && bun run test -- tests/ChatReadFailureRetry.test.tsx
 ❯ tests/ChatReadFailureRetry.test.tsx (9 tests | 8 failed) 9909ms
 ⎯⎯⎯⎯⎯⎯⎯ Failed Tests 8 ⎯⎯⎯⎯⎯⎯⎯⎯⎯
FAIL  ... > 失败 ⇒ 消息区原位给出失败文案 + 底层原因 + 可点重试，且绝不出现空态文案
TestingLibraryElementError: Unable to find an element with the text: 消息记录读取失败. ...
 ❯ tests/ChatReadFailureRetry.test.tsx:119:11
FAIL  ... > 重试**真的重发请求**（计数 n=1→n=2），且恢复成功后失败态消失、历史消息出现
TestingLibraryElementError: Unable to find an element with the text: 消息记录读取失败. ...
 ❯ tests/ChatReadFailureRetry.test.tsx:140:11
FAIL  ... > 重试在途 ⇒ 失败态保持（不闪回"加载中"，也不闪回空态）
TestingLibraryElementError: Unable to find an element with the text: 消息记录读取失败. ...
FAIL  ... > 成功且确实为空 ⇒ 才出现空态文案（诚实的空 ≠ 失败）
TestingLibraryElementError: Unable to find an element with the text: 这个会话还没有消息. ...
FAIL  ... > 42 失败后切到 43（在途）⇒ 消息区不得再显示 42 的错误原文，也不得退化成空态
TestingLibraryElementError: Unable to find an element with the text: session 42 read failed. ...
FAIL  ... > 43 自己失败 ⇒ 必须显示 43 自己的错误原文（反向断言：不得修成"错误永不显示"）
TestingLibraryElementError: Unable to find an element with the text: session 42 read failed. ...
FAIL  ... > 失败 ⇒ 左栏（新建会话的 role_preset）与角色下拉下方两处都原位给出失败态
TestingLibraryElementError: Unable to find an element with the text: 角色列表读取失败. ...
FAIL  ... > 重试**真的重发请求**（计数 n=1→n=2），恢复后两处失败态都消失
TestingLibraryElementError: Unable to find an element with the text: 角色列表读取失败. ...
 Test Files  1 failed (1)
      Tests  8 failed | 1 passed (9)
```

逐条裁决（原始输出机读形式）：

```
× 失败 ⇒ 消息区原位给出失败文案 + 底层原因 + 可点重试，且绝不出现空态文案 1989ms
× 重试**真的重发请求**（计数 n=1→n=2），且恢复成功后失败态消失、历史消息出现 1106ms
× 重试在途 ⇒ 失败态保持（不闪回"加载中"，也不闪回空态） 1112ms
× 成功且确实为空 ⇒ 才出现空态文案（诚实的空 ≠ 失败） 1097ms
× 42 失败后切到 43（在途）⇒ 消息区不得再显示 42 的错误原文，也不得退化成空态 1097ms
× 43 自己失败 ⇒ 必须显示 43 自己的错误原文（反向断言：不得修成"错误永不显示"） 1101ms
× 失败 ⇒ 左栏（新建会话的 role_preset）与角色下拉下方两处都原位给出失败态 1077ms
× 重试**真的重发请求**（计数 n=1→n=2），恢复后两处失败态都消失 1075ms
✓ 成功但确实没有角色 ⇒ 不得出现失败态（把"失败可见"做成"永远报错"同样是缺陷） 253ms
```

**9 条里 8 条变红**。唯一仍绿的是**故意设计成两态都绿的反向守卫**（"成功但确实为空不得报错"）——它守的是"不得把失败可见做成永远报错"，因此**它在修前修后都必须绿**，这也正是它与其余 8 条**覆盖不同失败模式**的证据（沿用 VS-32 的结论：新增断言与既有断言不能互相替代）。

---

## 6. 未解决问题

1. **E/F/G 三处写路径的 `catch (e: any) { message.error(e.message) }`**（`Chat.tsx` 基线 `:196/:207/:219`）：对**非 `Error` 的 rejection**（例如 `throw 'x'`、`Promise.reject()`）`e.message` 为 `undefined` ⇒ toast 无文案。本卡范围是**读取**，且无证据表明当前有此类 rejection，故**未改**（改它会把写路径卷进来）。**如实记录，不声称已修**。
2. **角色失败态在 Chat 出现两处**（左栏 + 工具栏）。这是**有意为之**：两个独立消费方（新建会话的 `role_preset` / 会话内切角色），且两处都常驻可点。代价是同一失败在屏上可能出现两份 Alert。若评估者认为冗余，可只保留左栏那一份（工具栏是"下拉正下方"的更强归因位）；此取舍已在此明示，不是疏漏。
3. **消息区新增了空态文案**（`这个会话还没有消息`）：修前"成功且为空"时该区域是**完全空白**。这是行为变化（VS-29 口径下"空态只代表确实没有数据"，故应当说出口），已在 zh/en 同步。若产品口径要求"空会话保持沉默"，改 `emptyContent` 一处即可。
4. **`visibleMessageCount` 含流式气泡（`isStreaming ? 1 : 0`）**：使"正在生成的回答"在读取失败时不致被顺手藏掉。该判断为**代码结构推理**（`retainedCount` 只影响 error 分支是否继续渲染 children），未单独写用例覆盖"流式中恰逢读取失败"这一组合。
5. **未做的仓库日志**：按卡要求 **不 commit**，故未追加 `task/CHANGELOG.md` / `docs/HANDOVER.md`（那属于提交动作的一部分，留给编排者）。

---

## 7. 风险

1. **跨卡门禁污染（已实测通过，但边界如实声明）**：`bun run build` 会编译 VS-35 的在制 `src/` 文件。本次 exit 0；但若 VS-35 在其变异窗口内且 build 失败，**那份失败不能自动归给本卡**——判据是失败信息落在谁的文件上。
2. **负载抖动**：本仓默认 `testTimeout` 5000ms。本次所有门禁**未出现超时**，故无需登记噪声；若后续窗口出现落在本卡未触及用例上的 `Test timed out in 5000ms`，应按噪声处理，**不得据此放宽断言或超时**。
3. **两处角色失败态的可点重复**：用户可能两份 Alert 都点（各自 `loadAgents()`）。`agentsRequestRef` 的请求序号保证**后发的结果胜出、过期响应被丢弃**，不会互相覆盖；但会多一次请求——属可接受的代价（人手动点击，非自动重发）。
4. **`setSelectedRole((prev) => prev ?? items[0].role_key)`** 与修前的无条件覆盖不同：修后"重试不得把用户已选角色改回去"。这是**行为改善**，但属行为变化；无既有断言依赖旧行为（Chat 全族实测全绿）。
5. **i18n 两文件与 VS-35 无重叠**（逐行核对：`zh +10 / en +11` 全部为本卡新增），但两卡若都后续追加 i18n 键，同文件仍可能产生并发写覆盖——建议编排者以"文件集不相交"为前提复核本卡与 VS-35 的边界。

---

## 8. 一句话结论

半成品**续写**（方向与族内范式逐行同构，缺的是"角色失败 UI + 3 个 i18n 键 + 未使用导入"）；两处吞错点（`/agents`、`/messages`）已变为**可归因 + 可点重试 + 真重发**（以请求计数 n=1→n=2 证明），**失败不再伪装成空**（失败优先于一切，且反向守卫禁止"永远报错"）；VS-23/28 截断链路（`ChatDeadlineSignal` 5 条）与 VS-29 三态契约（`ReadStateThreeWay` 22 条）**零回归**，Chat 全族 75+5 条全绿，`bun run build` exit 0；退回修复的副本里 **9 条新用例 8 条变红**（剩 1 条是两态都绿的反向守卫）。
