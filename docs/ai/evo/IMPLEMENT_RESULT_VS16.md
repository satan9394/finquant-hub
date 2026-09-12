# IMPLEMENT_RESULT — Vertical Slice 16：首页"最近会话/讨论"点击后打开所指记录

> 状态：**完成（未 commit）**。执行者：IMPLEMENTER（worker）。日期：2026-09-11。
> 任务卡：`docs/ai/evo/IMPLEMENTATION_BRIEF_VS16.md`（链路事实由编排者核实，直接依赖，未重复推翻）。
> 本文件中的每一条"绿/红"都对应下面第 3 节里**实际跑出来的原始输出**，未跑过的不写。

---

## 1. 改动（文件:行）

### 1.1 `frontend/src/pages/Dashboard.tsx`（列表项带上记录 id）
| 位置 | 改动 |
|---|---|
| `Dashboard.tsx:100-101` | 最近**会话**项 `<Link to="/chat">` → `` <Link to={`/research?mode=fast&session=${item.id}`}> ``（规范目标，直书 `/research`，不经遗留重定向） |
| `Dashboard.tsx:116-117` | 最近**讨论**项 `<Link to="/discussion">` → `` <Link to={`/research?mode=review&room=${item.id}`}> `` |
| `Dashboard.tsx:94` / `:110` | **未改**：两张卡的"查看全部"仍是 `navigate('/chat')` / `navigate('/discussion')`（语义=去该功能区，不带 id） |
| `Dashboard.tsx:127` | **未改**：底部"开始新对话/新建讨论"等入口 |

### 1.2 `frontend/src/pages/Chat.tsx`（新增读取 `?session=<id>`）
| 位置 | 改动 |
|---|---|
| `Chat.tsx:62-65` | 新增 `sessionParam` / `requestedSessionId`：仅接受十进制正整数；缺省、`abc`、`0`、`-1`、`1.5`、`43x` 一律视为"无深链请求" |
| `Chat.tsx:77-80` | 新增 `sessionsResolved`（会话列表**成功返回**才置真）与 `appliedSessionRef`（只应用一次的守卫） |
| `Chat.tsx:84-95` | 会话列表加载：成功后 `setSessions(items)` + `setSessionsResolved(true)`；失败静默（回落），并加 `cancelled` 清理 |
| `Chat.tsx:101-110` | 新增生效 effect：列表返回后，**仅当该 id 出现在当前用户自己的会话列表里**才 `setCurrentSessionId(id)`（后端 `/chat/sessions` 已按 `user_id` 过滤）。非法/不存在/已删除/非本人 → 不选中、不为该 id 发任何请求 |
| `Chat.tsx:113-120` | **未改**：既有 "`currentSessionId` 变化 → `GET /chat/sessions/<id>/messages`" 逻辑被复用，深链因此自然拉取该会话消息 |

> `appliedSessionRef` 是**承重**的：没有它，用户在左栏点其它会话后不会被拉回深链那一条（见 `tests/ChatSessionDeepLink.test.tsx` 的 "no snap-back" 用例）。

### 1.3 `frontend/src/pages/Discussion.tsx`（`?room=` 既有能力 + **修一处可达缺陷**）
`?room=<id>` 本来就能用（编排者已核实），但**缺"只应用一次"守卫**，形成 snap-back：

- 修前（`Discussion.tsx:57-61` 原实现）：
  `useEffect(() => { if (Number.isInteger(requestedRoomId) && rooms.some(r => r.id === requestedRoomId)) setCurrentRoomId(requestedRoomId) }, [requestedRoomId, rooms, setCurrentRoomId])`
  依赖 `rooms` 且无守卫；`discussionStore.addRoom` 是 `set(s => ({ rooms: [room, ...s.rooms] }))`（**新数组**）⇒ 用户手选 room 43 后**新建一个讨论**，effect 重跑 → **被拽回 URL 里的 room 42**。（VS16 之前没有任何地方产出 `?room=` 链接，这条路径是**本卡新引入的可达性**。）

- 修后：
| 位置 | 改动 |
|---|---|
| `Discussion.tsx:32-35` | `Number(searchParams.get('room'))` → 与 Chat 同构的**正整数解析**（`null` 表示无深链）；避免 `Number(null)===0` 这种"整数"误判 |
| `Discussion.tsx:53-55` | 新增 `appliedRoomRef`（只应用一次的守卫） |
| `Discussion.tsx:63-70` | effect 改为：`requestedRoomId === null` 或已应用过 → 直接返回；不在用户自己的房间列表里 → 返回（等待列表/回落）；命中则**先记 ref 再选中** |

### 1.4 `frontend/src/pages/ResearchWorkspace.tsx`（切模式不得带走旧记录 id）
| 位置 | 改动 |
|---|---|
| `ResearchWorkspace.tsx:71-73` | `ResearchModeSurface.selectMode` 在写入新 `mode` 前 `next.delete('session'); next.delete('room')` ⇒ `fast&session=5` 切到"审查"不会带着 `session=5`，反之亦然 |

> 未在 `ResearchModeSurface` 里向 `Chat`/`Discussion` 转发参数——**已核实二者与 `ResearchModeSurface` 同处一个 Router 上下文**，各自 `useSearchParams()` 即可读到 `session`/`room`（`ResearchWorkspace.tsx:65-85`）。任务卡中该项标为"可选"，此处选择不改。

### 1.5 测试
| 文件 | 改动 |
|---|---|
| `frontend/tests/ChatSessionDeepLink.test.tsx`（**新增，11 例**） | `?session=<有效>` 选中并拉取**该条**消息；`?session=<不存在>` 回落；`abc/0/-1/1.5/43x/空` 六种畸形值回落；深链后手点其它会话不回跳；`?prompt=` 与深链共存；无 session 时 `?prompt=` 仍是可编辑草稿 |
| `frontend/tests/Dashboard.test.tsx`（+3 例） | 断言两条链接的 `href` **含正确 id**；两张卡的"查看全部"点击后落在**不带查询串**的 `/chat`、`/discussion` |
| `frontend/tests/Discussion.test.tsx`（+4 例） | `?room=42` 打开并拉详情；`?room=999` 回落；**新增** snap-back 回归（修前必红，见下）；`?topic=` 既有预填未回归 |

i18n：**未新增任何用户可见文案**，故 zh/en 无需同步（无新键）。无新依赖、无后端改动、无文件删除、**未 commit**。

---

## 2. 验收标准对照

| 卡上验收项 | 判据 | 结果 |
|---|---|---|
| 1 会话链接为 `/research?mode=fast&session=<id>`，点击后加载该会话历史 | `Dashboard.test.tsx` href 断言 + `ChatSessionDeepLink` 断言 `GET /chat/sessions/43/messages` 被调用且渲染出 43 的消息、**从未为 42 发请求** | 通过 |
| 2 讨论链接为 `/research?mode=review&room=<id>`，点击后打开该 room | `Dashboard.test.tsx` href 断言 + `Discussion.test.tsx` 断言 `GET /discussion/rooms/42` 与 `currentRoomId===42` | 通过 |
| 3 "查看全部"不带 id | 点击后落点恰为 `/chat`、`/discussion`（无查询串） | 通过 |
| 4 非法 id 优雅回落 | `?session=999/abc/0/-1/1.5/43x/''`、`?room=999`：无该 id 的请求、不崩、停在默认视图 | 通过 |
| 5 `?prompt=`/`?room=`/`?topic=` 零回归 | 新增 + 既有 `ChatBacktestRedirect`/`ChatStarterDraft`/`Discussion` 全绿 | 通过 |
| 6 门禁 | 相关 vitest 8 文件 59 例全绿 → `bun run build`（含 `tsc -b`）退出码 0 | 通过 |

---

## 3. 实测原始输出

### 3.1 `Discussion` snap-back：修前**必红**（证明该回归测试有鉴别力）

临时还原修前实现后：`bun x vitest run tests/Discussion.test.tsx -t 'does not snap back'`

```
 ❯ tests/Discussion.test.tsx (7 tests | 1 failed | 6 skipped) 1089ms
     × does not snap back to the deep-linked room after the user picks another one 1087ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  tests/Discussion.test.tsx > Discussion ?room= deep link (VS16 regression) > does not snap back to the deep-linked room after the user picks another one
AssertionError: expected 42 to be 43 // Object.is equality

- Expected
+ Received

- 43
+ 42

 ❯ tests/Discussion.test.tsx:144:57
    143|     expect(await screen.findByText('新建的讨论')).toBeTruthy();
    144|     expect(useDiscussionStore.getState().currentRoomId).toBe(43);

 Test Files  1 failed (1)
      Tests  1 failed | 6 skipped (7)
[exit code: 1]
```

恢复正常选中。修后同一用例（含全套 7 例）绿：`Test Files 1 passed (1) / Tests 7 passed (7)`。

### 3.2 最终门禁批次（串行执行，vitest 结束**之后**才跑 build）

```
D:\...\bun.exe x vitest run tests/Dashboard.test.tsx tests/Discussion.test.tsx tests/ChatSessionDeepLink.test.tsx tests/ChatBacktestRedirect.test.tsx tests/ChatStarterDraft.test.tsx tests/ResearchModeRouting.test.tsx tests/ResearchLanding.test.tsx tests/ResearchWorkspaceEvidence.test.tsx
```
```
 ✓ tests/Discussion.test.tsx (7 tests)
     ✓ still pre-fills the creation dialog from ?topic=  304ms
 ✓ tests/ChatBacktestRedirect.test.tsx (8 tests) 7870ms
 ✓ tests/ResearchLanding.test.tsx (2 tests) 4713ms
 ✓ tests/ChatSessionDeepLink.test.tsx (11 tests) 4570ms
     ✓ selects the deep-linked session and loads exactly that record  2425ms
     ✓ keeps the session list clickable after a deep link (no snap-back to the URL id)  417ms
     ✓ keeps the existing ?prompt= behavior alongside a session deep link  305ms
 ✓ tests/ChatStarterDraft.test.tsx (1 test) 966ms
 ✓ tests/ResearchModeRouting.test.tsx (3 tests) 1480ms
     ✓ switches depth inside Research while keeping the company context  541ms

 Test Files  8 passed (8)
      Tests  59 passed (59)
[exit code: 0]
```
（另有更早一批 6 文件 `Test Files 6 passed (6) / Tests 42 passed (42)`；`Dashboard.test.tsx` 13 例中含本次新增 3 例。）

### 3.3 构建门禁

`D:\...\bun.exe run build`（`prebuild` openapi 校验 + `tsc -b` + `vite build`）
```
dist/assets/Dashboard-DRghSEEm.js                18.24 kB │ gzip:   5.32 kB
dist/assets/ResearchWorkspace-dXj-JgJU.js        79.23 kB │ gzip:  22.30 kB
(!) Some chunks are larger than 500 kB after minification. ...
✓ built in 1m 3s
[status: completed, exit code: 0]
```

### 3.4 环境噪声（非本次改动缺陷，供复核者甄别）
第一次 `vitest run` 出现 `[vitest-pool]: Failed to start forks worker ... Timeout waiting for worker to respond`（60s 超时、`no tests`）。同一条命令**原样重跑即通过**，此后 6 次运行均正常。判断为本机负载导致的 worker 启动抖动（`vite.config.ts:9-11` 的注释 `maxWorkers: 1` 也是为规避 Windows 上同类停顿），与本卡改动无关。

---

## 4. 未解决问题 / 风险

1. **深链生效的前提是"该 id 出现在用户自己的列表里"**。当前 `/chat/sessions`、`/discussion/rooms` 都是**按 `user_id` 过滤且不分页**（`backend/app/routers/chat.py:64-78`），所以首页那 5 条必然在列表内。若将来给列表加分页/截断，深链可能"回落"到默认视图（表现为点了没跳过去），需要在彼时同步调整。
2. **非法 id 时的落点**：Chat/Discussion 都**不覆盖 store 里既有的选中**（同一用户此前打开的会话/房间），而不是清空成"未选择"空态。理由：`/chat`、`/discussion` 深链与"正常浏览"共用一条状态，强行清空会破坏既有交互（如 `ChatBacktestRedirect.test.tsx` 依赖 `currentSessionId=7` 跨渲染保留）。**不存在串到"别人的"记录**：列表与详情接口都按 `user_id` 过滤，越权 id 在后端返回 404。若验收方要求"非法 id 必须落到空态"，这是**一处需明确的口径差异**，请裁定。
3. **模式切换会丢弃记录深链**：`fast&session=5` 切到"审查"后 `session` 被删除，再切回"快速"不会回到该会话（卡上要求"不得把旧 id 带到新模式"）。若产品更希望"切回原模式恢复原记录"，需要改回保留参数——**这是有意的取舍，不是遗漏**。
4. **Dashboard 采用规范目标 `/research?mode=...`**，不是 `/chat?session=`。`/chat`、`/discussion`、`/thesis`、`/research/reports` 的遗留重定向与 `LegacyResearchRedirect` 的参数保留语义**一行未动**（`App.tsx` 本次零改动）。
5. **工作树里另有他人在改的文件**：`start.bat`（已修改）、`docs/ai/evo/IMPLEMENT_RESULT_VS17.md`（未跟踪）——**不是本卡产物**，我未读写/未触碰。
6. 未做**真实浏览器点击**验证（本卡门禁只要求 vitest + build）。"点击后真的打开那一条"的证据是：链接 `href` 含正确 id **且** 目标页对同一 id 发出 `/chat/sessions/43/messages`、`/discussion/rooms/42` 并渲染出该记录内容。若要端到端截图级证据，需要起前后端服务，**未做**。

---

## 5. 证据（可复核清单）

- 源码 diff：`git diff -- frontend/src/pages/{Dashboard,Chat,Discussion,ResearchWorkspace}.tsx`（4 文件，仅本卡相关行；`git diff --stat` 显示 Dashboard 6 行、Chat 25 行、Discussion 17 行、ResearchWorkspace 3 行）。
- 新增测试：`frontend/tests/ChatSessionDeepLink.test.tsx`（11 例）；`Dashboard.test.tsx` 末段 `Dashboard recent-record deep links (VS16)`（3 例）；`Discussion.test.tsx` 末段 `Discussion ?room= deep link (VS16 regression)`（4 例）。
- 关键链路事实（读码，未改后端）：`chat.py:64-78` 会话列表按 `user_id` 过滤、`chat.py:107-114` 消息接口先 `_get_session(id, user_id)`；`App.tsx:150-155` `LegacyResearchRedirect` 保留查询串；`ResearchWorkspace.tsx:65-85` 渲染 `Chat`/`Discussion` 于同一路由。
- 未提交：`git status --porcelain` 中本卡文件均为 ` M`/`??`，**没有执行任何 commit**。
- 临时文件：本次未产生临时文件（无写盘脚本、无中间产物）；`frontend/dist` 由 `bun run build` 生成，为仓库既有构建产物目录。

---

## 6. 交证后补充（22:0x–22:2x）

### 6.1 追加的两例测试：切模式不得带走旧记录 id
`frontend/tests/ResearchModeRouting.test.tsx` 新增 `LocationProbe` 与两例：
`drops the fast-mode session deep link when switching depth`、`drops the review-mode room deep link when switching depth`。
**修前必红**（临时摘掉 `next.delete('session')/delete('room')` 后实测）：

```
 FAIL  ... > drops the fast-mode session deep link when switching depth
AssertionError: expected '/research?mode=deep&session=7' not to contain 'session'
 FAIL  ... > drops the review-mode room deep link when switching depth
AssertionError: expected '/research?mode=fast&room=42' not to contain 'room'
 Tests  2 failed | 3 skipped (5)
```
恢复后单文件：`Test Files 1 passed (1) / Tests 5 passed (5)`。

### 6.2 一次未定性的观察（**非本卡文件，未完成归因，交 Evaluator 裁定**）
`tests/ResearchWorkspaceEvidence.test.tsx`（**我全程未改动该文件，也未改动它涉及的资金流向/龙虎榜卡片代码**）在 21:56 的批次里 14 例全绿；22:15、22:18 两次单独复跑均 **3 例失败**（`keeps historical selection after a failed date…`、`resets selection on a real symbol navigation…`、`keeps both cards visible with honest Empty fallbacks when fetchers fail`，失败形态为元素找不到，非 5s 超时）。两次复跑时 `git diff HEAD -- frontend/src frontend/tests` 均为空（src==HEAD），且当时 `tests/` 下正存在评估者的临时文件；我的改动只落在 `ResearchModeSurface.selectMode`（仅在点击模式单选时执行），与这三例的代码路径不相交。**我没有完成"回退 src 再复跑"的归因实验**（编排者已下达收尾停止指令），因此**不下结论**：既不说它是既有缺陷，也不说它是本次改动的回归。请 Evaluator 以 `1f95d4f^` 为对照裁定。

### 6.3 收尾确认
**收尾确认**：已停止、工作树无临时变异残留。`git status --short` 仅剩 ` M start.bat` 与 `?? docs/ai/evo/IMPLEMENT_RESULT_VS17.md`（均为 VS-17，与我无关）；`git grep -n -E 'TEMP-REPRO|TEMP_REPRO|MUTATED|TEMP-' -- frontend/src frontend/tests` **零命中**；`git diff --stat HEAD -- frontend/src frontend/tests` 为空（即 `frontend/src` 与 `frontend/tests` 的内容 == 已提交的 `1f95d4f`）。我遗留的后台 vitest 进程已终止；`bun run build`（PID 31004，启动于我做完全部改动之后）非我发起，**未触碰**。
