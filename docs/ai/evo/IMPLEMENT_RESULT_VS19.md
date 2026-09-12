# IMPLEMENT_RESULT — Vertical Slice 19：失败与"没有数据"在界面上可区分

> 实现者：IMPLEMENTER（DeepSeek Flash 工作流），2026-09-11。
> 任务卡：`docs/ai/evo/IMPLEMENTATION_BRIEF_VS19.md`（证据链由编排者核实）。
> 状态：**实现完成、门禁全绿、未 commit**。
> 目标一句话：空态**只能**代表"确实没有"；读取失败必须显式说出来。

---

## 1. 改动清单（文件:行）

### 1.1 首页：`stats` 失败态（不再伪装成空态）

| 文件 | 位置 | 改动 |
|---|---|---|
| `frontend/src/pages/Dashboard.tsx` | `:51-54` | 新增 `statsFailed` / `statsError` 两个状态（与 `stats` 并列） |
| 同上 | `:66-79` | `loadStats` 改写：删除 `catch { /* non-critical context */ }`；失败时 `setStats(null)` + `setStatsError(err.message)` + `setStatsFailed(true)`；每次请求开头复位 |
| 同上 | `:97-99` | 新增 `statsAlert`：与 `DecisionInboxPanel`(`:25`) **同款** Alert（`type="error" showIcon` + `message={t('today.statsFailed')}` + `description={statsError}` + `action=` 重试按钮 `t('today.retry')`） |
| 同上 | `:113-115` | 「近期会话」卡片：`{statsFailed ? statsAlert : (<List … today.noConversations />)}` |
| 同上 | `:131-133` | 「近期讨论」卡片：`{statsFailed ? statsAlert : (<List … today.noDiscussions />)}` |

即：**只有 `statsFailed === false`（请求成功）时才可能渲染"暂无会话/暂无讨论"**。

### 1.2 深链失效：一次性提示 + 两种失败分开归因

| 文件 | 位置 | 改动 |
|---|---|---|
| `frontend/src/pages/Chat.tsx` | `:80-85` | 新增 `sessionsFailed` 状态 + `notifiedSessionRef`（"已提示过的 id"守卫，与 `appliedSessionRef` 同构） |
| 同上 | `:92-94` | `/chat/sessions` 的 `.catch` 由静默改为置 `sessionsFailed`（仍保持"不臆造会话、不清空既有选中"） |
| 同上 | `:106-130` | `?session=` effect：抽出 `notifyOnce`（先判后记）；`!sessionsResolved` 且 `sessionsFailed` → `chat.deepLinkUnavailable`；列表已返回但不含该 id → `chat.deepLinkMissing`；命中才写 `appliedSessionRef` + `setCurrentSessionId` |
| `frontend/src/pages/Discussion.tsx` | `:56-61` | 新增 `roomsResolved` / `roomsFailed` 状态 + `notifiedRoomRef` |
| 同上 | `:63-71` | `/discussion/rooms` 的 `.catch` 由 `() => {}` 改为置 `roomsFailed`；成功置 `roomsResolved`；补 `cancelled` 卸载守卫 |
| 同上 | `:73-91` | `?room=` effect：同 Chat 的三分支（读取失败 / 不含该 id / 命中），`notifyOnce` 共用一处记账 |

**结构同构性**（这是"只提示一次"能成立的前提）：两个组件都改成
**只有"真的选中该记录"才写 `applied*Ref`**，落空路径（①不存在 ②列表读取失败）**由 `notified*Ref` 唯一兜底**。

### 1.3 i18n（zh/en parity）

| 文件 | 行 | key | 值 |
|---|---|---|---|
| `frontend/src/i18n/zh.ts` | `:1120` | `today.statsFailed` | 近期记录读取失败 |
| `frontend/src/i18n/en.ts` | `:1120` | `today.statsFailed` | Could not load recent records |
| `zh.ts` | `:1852` | `chat.deepLinkMissing` | 该会话已不存在，已显示当前会话列表 |
| `zh.ts` | `:1853` | `chat.deepLinkUnavailable` | 会话列表读取失败，未能打开指定会话 |
| `en.ts` | `:1853` | `chat.deepLinkMissing` | That session no longer exists. Showing your current session list. |
| `en.ts` | `:1854` | `chat.deepLinkUnavailable` | Could not read your session list, so the linked session was not opened. |
| `zh.ts` | `:1877` | `discussion.deepLinkMissing` | 该讨论已不存在，已显示当前讨论列表 |
| `zh.ts` | `:1878` | `discussion.deepLinkUnavailable` | 讨论列表读取失败，未能打开指定讨论 |
| `en.ts` | `:1878` | `discussion.deepLinkMissing` | That discussion no longer exists. Showing your current discussion list. |
| `en.ts` | `:1879` | `discussion.deepLinkUnavailable` | Could not read your discussion list, so the linked discussion was not opened. |

重试按钮复用既有 `today.retry`（zh `重试` / en `Retry`），不新增重复 key。**zh/en 一一对应，无缺失**。

### 1.4 测试

| 文件 | 行 | 用例 |
|---|---|---|
| `frontend/tests/Dashboard.test.tsx` | `:291-337` | ① stats 失败 → 两处 Alert + 重试，且**无**"暂无会话/暂无讨论"；② stats 成功且空 → **仍显示**"暂无…"；③ 点重试**再次发起** `/dashboard/stats`（`attempts === 2`）并恢复卡片 |
| `frontend/tests/ChatSessionDeepLink.test.tsx` | `:132-194` | ① 缺失 id → **恰好一次**警告（列表再变一次后仍为 1 次）+ 不选中 + 不发请求；② **合法 id 零警告**（列表再变一次后仍零）；③ 列表请求失败 → 报"读取失败"而**不是**"已不存在" |
| `frontend/tests/Discussion.test.tsx` | `:165-234` | 同上三例（`?room=`）；另 `:1-3` 补 `import { message }` |
| 既有用例改名（行为已变，文案须同步） | `ChatSessionDeepLink.test.tsx:83` | `falls back quietly…` → `falls back without selecting or querying a missing session` |
| 同上 | `Discussion.test.tsx:109` | `falls back quietly…` → `falls back without selecting or querying a missing room` |

---

## 2. 设计决策与理由

### 2.1 `stats` 失败时**清空** `stats`（而不是保留旧快照）

以"请求是否成功"为**唯一判据**（任务卡明示）。失败时保留旧 `stats`，会让两张卡片（以及 `capabilities` 引导条、`ResearchRuns`）继续渲染**可能已过期**的数据，等于把"上次的快照"当成"当前事实"；这正是本卡要消灭的形态的另一种写法。改为 `setStats(null)` 后，页面状态只有两种：**有数据** 或 **明确的失败 + 重试**，不存在第三种含混态。

### 2.2 错误归因：②"列表读取失败"**选择给出中性一次性提示**（而非静默）

任务卡允许"静默保持现状"或"中性读取失败提示"，**择一**。选后者，理由：

1. 本卡的验收目标是"失败要显式说出来"。若②静默，则用户点深链后**仍然**是"点了没反应"，只是恰好成因是网络故障——体感缺陷一模一样地留着；
2. **不构成错误归因**：文案是 `会话列表读取失败，未能打开指定会话`，主语是**列表读取**这个动作，全程不提"该会话不存在"；与①的 `该会话已不存在` 是**两个不同的 i18n key**，从代码层面就无法混用；
3. 同样受 `notified*Ref` 一次性约束，不会因列表/渲染反复触发而变噪声；
4. "不抢焦点"的既有语义**原样保留**（不清空既有选中、不为该 id 发任何请求），②路径同样满足。

### 2.3 `applied*Ref` 与 `notified*Ref` 的职责切分（"只提示一次"为什么必须这样写）

`applied*Ref` 的原语义是"**深链只应用一次**"（防止用户手选其它记录后被 URL 里的旧 id 抢回焦点，R3 的成果）。它**只在真的命中并选中时**才被写入。若落空时也写它，就等于"这次落空之后永不再试"，且**提示记账会被它顺手挡掉**，守卫失去意义。

因此落空（①与②）**单独**由 `notified*Ref` 记账：`notifyOnce` 内部**先判后记**（`if (notified.current === id) return; notified.current = id; message.warning(...)`），两条分支共用同一处记账——满足"与 `appliedRoomRef`/`appliedSessionRef` 同构：记住已提示过的 id"。

> **并发的副作用（已复盘）**：编排者在 22:58 的**变异窗口**内 grep 到的是"守卫行被删"的故意缺陷态，据此发过两条纠正。该缺陷态**已还原**，详见 §5。

### 2.4 未改动的部分（刻意保持）

- `?prompt=` / `?topic=` 行为：未触碰（`ChatStarterDraft` 与 `starterTopic` effect 原样）。
- `ChatBacktestRedirect` / `StockAnalysis` 复用路径：Chat/Discussion 的 props 与对外行为未变，未新增必填 props。
- 同页其它区块（决策收件箱、市场/新闻）的 Alert 与成功路径：未触碰。
- 不加依赖、不改后端、不删文件、未 commit。

---

## 3. 门禁原始输出

### 3.1 vitest（5 文件，`bun x vitest run …`）

```
 ✓ tests/ChatSessionDeepLink.test.tsx (14 tests) 1811ms
 ✓ tests/Dashboard.test.tsx (16 tests) 4874ms
     ✓ shows an explicit error with retry in both recent-record cards when stats fail  386ms
     ✓ refetches stats from the card retry and recovers the records once it succeeds  463ms
 ✓ tests/Discussion.test.tsx (10 tests) 2109ms
 ✓ tests/ChatBacktestRedirect.test.tsx (8 tests) 2080ms
 ✓ tests/ChatStarterDraft.test.tsx (1 test) 565ms

 Test Files  5 passed (5)
      Tests  49 passed (49)
   Duration  60.22s (transform 791ms, setup 1.52s, import 39.05s, tests 11.44s, environment 6.83s)
```

首次运行（22:56:12）同为 `5 passed (5) / 49 passed (49)`，本机**未**出现 `[vitest-pool]: Failed to start forks worker … Timeout`，无需重跑。

### 3.2 构建（`bun run build` = `tsc -b && vite build`，**串行**在测试之后）

```
frontend/package.json:9:    "build": "tsc -b && vite build",
…
dist/assets/Dashboard-BBNECcmS.js                18.51 kB │ gzip:   5.37 kB
dist/assets/vendor-antd-BPmhL3C_.js           1,566.95 kB │ gzip: 491.20 kB
(!) Some chunks are larger than 500 kB after minification. …
✓ built in 33.02s
```

`tsc -b` 通过（否则 `&&` 不会执行到 vite build）；chunk-size 警告为**既有**提示，非本卡引入。**测试与构建未并行执行。**

### 3.3 变异验证原始输出（证明测试**真的**有鉴别力）

做法：在**交付代码**上分别植入 3 处缺陷（删 `notifyOnce` 守卫行 ×2、删 `setStatsFailed(true)`），运行后**立即还原**：

```
 ❯ tests/Dashboard.test.tsx (16 tests | 2 failed) 7056ms
     × shows an explicit error with retry in both recent-record cards when stats fail 1161ms
     × refetches stats from the card retry and recovers the records once it succeeds 1116ms
 ❯ tests/ChatSessionDeepLink.test.tsx (14 tests | 1 failed) 9713ms
     × warns exactly once for a session missing from the list, even after the list changes again 224ms
 ❯ tests/Discussion.test.tsx (10 tests | 1 failed) 2176ms
     × warns exactly once for a room missing from the list, even after the list changes again 87ms

 FAIL  ChatSessionDeepLink > … > warns exactly once …
   AssertionError: expected "Mock" to be called 1 times, but got 2 times
 FAIL  Discussion > … > warns exactly once …
   AssertionError: expected "Mock" to be called 1 times, but got 2 times
 FAIL  Dashboard > … > shows an explicit error with retry …
   TestingLibraryElementError: Unable to find an element with the text: 近期记录读取失败
 Test Files  3 failed (3)
      Tests  4 failed | 36 passed (40)
```

**4 条用例各自精确捕获一处变异**，即"删掉守卫/接线也全绿"的形态**不成立**。还原后按 §3.1 复跑全绿。
`git diff --check` 无空白错误；`grep -n -E 'TEMP-REPRO|MUTATED|XXX-TEMP'` 在交付文件上**零命中**（变异窗口已关闭）。

---

## 4. 未解决问题

1. **Chat/Discussion 左侧列表本身的"空态即失败态"未在本卡范围内**：`/chat/sessions` 或 `/discussion/rooms` 失败时，左栏仍显示 `chat.empty`/`discussion.empty`（"暂无会话/暂无讨论"）。本卡只覆盖了**深链**路径的失败显性化（①/②），侧栏错误态属于同类问题的**未修部分**，建议作为后续卡的独立条目（形态与 Dashboard 完全一致，可用 `sessionsFailed`/`roomsFailed` 直接接线）。
2. **Dashboard 其它 stats 消费点**：`ResearchRuns`（`stats.recent_rooms`）在 stats 失败时退化为空列表，无独立错误态。同样超出本卡枚举的两处改动范围，仅作记录。
3. **`?session=` 深链在列表"稍后才含该 id"时的行为**：本卡把落空判定改为**不写 `applied*Ref`**（与 Discussion 的既有注释"列表未回来或该 room 不存在 → 继续等待/回落"一致）。因此若同一 id 之后出现在列表里，仍会被选中——这是"继续等待"语义的刻意保留，非缺陷；但**先提示"已不存在"、后又选中**在极端时序下文案会略早。判定为可接受（服务端 id 不会再生成同值）。
4. 本机**未**复现 `[vitest-pool] … Timeout`，因此无"环境噪声"记录可填。

---

## 5. 风险

| 风险 | 等级 | 说明 / 缓解 |
|---|---|---|
| 一次性提示守卫漏接 → 反复打扰 | **低** | 已用变异验证反证（§3.3）：删守卫即 2 次调用、用例变红 |
| 失败时清空 `stats` 会让刷新失败瞬间"丢掉"已有卡片内容 | **低** | 属**刻意**选择（§2.1）：宁可显式失败 + 重试，也不渲染过期快照；重试成功后立即恢复（已有用例断言） |
| ②"读取失败"提示可能被误读为数据问题 | **低** | 文案主语为"列表读取失败"，与"已不存在"是不同 key；用例 `reports a list read failure instead of claiming …` 显式断言**不得**出现"已不存在"文案 |
| 改 `applied*Ref` 写入时机（落空不再写）影响 VS16 | **低** | 命中路径与"不抢焦点"断言未变；`ChatSessionDeepLink` 的 `keeps the session list clickable after a deep link`、`Discussion` 的 `does not snap back …` 两条例既有用例仍全绿 |
| 既有用例改名造成"改动范围"观感变化 | **低** | 仅改 `it(...)` 描述字符串（两条），断言语义未动；原因：原描述 `falls back quietly` 已与新行为矛盾（文档/注释须与实现一致） |
| **变异窗口污染并行读者** | **中（已发生）** | 编排者在窗口内 grep 到故意缺陷态并发出两条纠正；已还原 + 原始证据澄清。缓解：后续变异验证**先声明窗口**，或改用 `$env:TEMP` 副本 |
| 工作树含他人改动被误归本卡 | **低** | `backend/app/services/llm_client.py`、`backend/tests/test_llm_client.py`、`docs/ai/evo/IMPLEMENT_RESULT_VS21.md` 为 **VS-21** 在途改动，**非本卡**；本卡只动 `frontend/` 5 个源文件 + 3 个测试文件 + 1 个结果文件 |

---

## 6. 证据（可复现）

```powershell
# 1) 门禁（先测试）
cd E:\Code_file\Projects\finquant-hub\frontend
& 'D:\Technology_application\NVM_Windows\nvm_a\v22.19.0\bun.exe' x vitest run `
  tests/Dashboard.test.tsx tests/ChatSessionDeepLink.test.tsx tests/Discussion.test.tsx `
  tests/ChatStarterDraft.test.tsx tests/ChatBacktestRedirect.test.tsx
# → Test Files 5 passed (5) / Tests 49 passed (49)

# 2) 构建（再构建，串行，勿并行）
& 'D:\Technology_application\NVM_Windows\nvm_a\v22.19.0\bun.exe' run build
# → tsc -b 通过；✓ built in 33.02s

# 3) 判据①"失败不再伪装成空态"：看 Demo 用 Dashboard.test.tsx:299
#    断言 = 出现 2×「近期记录读取失败」+ 2×重试按钮，且 queryByText('暂无会话'/'暂无讨论') === null
# 4) 判据②"提示只一次且不误伤合法 id"：
#    ChatSessionDeepLink.test.tsx:149 / Discussion.test.tsx:186（列表再变一次后仍 toHaveBeenCalledTimes(1)）
#    反例：ChatSessionDeepLink.test.tsx:168 / Discussion.test.tsx:205（合法 id ⇒ not.toHaveBeenCalled()）
# 5) 未经 commit：git status 中本卡文件为 M/??，HEAD 未变动
```

**交付文件集（本卡）**：`frontend/src/pages/Dashboard.tsx`、`frontend/src/pages/Chat.tsx`、`frontend/src/pages/Discussion.tsx`、`frontend/src/i18n/zh.ts`、`frontend/src/i18n/en.ts`、`frontend/tests/Dashboard.test.tsx`、`frontend/tests/ChatSessionDeepLink.test.tsx`、`frontend/tests/Discussion.test.tsx`、`docs/ai/evo/IMPLEMENT_RESULT_VS19.md`。
