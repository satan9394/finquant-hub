# EVALUATION_RESULT — VS-16：首页"最近会话/讨论"点击后打开所指记录

> 角色：EVALUATOR（独立验收，假设实现有错）。日期：2026-09-11。
> 待验：任务卡 `docs/ai/evo/IMPLEMENTATION_BRIEF_VS16.md`、实现者报告 `docs/ai/evo/IMPLEMENT_RESULT_VS16.md`。
> 判定：**ACCEPT**。

## 0. 被验对象（先说清 HEAD 的变动）

- 任务书交付的提交号是 `9979b14`。**我确实读到了它的问题**：`git show 9979b14:frontend/src/pages/ResearchWorkspace.tsx` 第 71 行是 `// TEMP-REPRO: 修前实现（不剥离记录 id），跑完立刻恢复。`，**缺 `next.delete('session'); next.delete('room');` 两行**；而同一提交里的 `ResearchModeRouting.test.tsx` 已包含两条断言"切模式后 URL 不含 session/room"的用例 ⇒ **该提交自身在干净检出上会红 2 例**（其提交信息却写着"ResearchWorkspace 切模式剥离 session/room"）。工作树当时已是修好的版本（mtime 22:06:43，晚于提交 22:06:11）。
- 编排者随后 `--amend` 修正，**当前 HEAD = `d0bcfc8`**（其前 `1f95d4f`）。复核：
  - `git show HEAD:frontend/src/pages/ResearchWorkspace.tsx` 的 `selectMode`（`:69-77`）**确实含** 注释 + `next.delete('session')` + `next.delete('room')`；
  - `git grep -n -E 'TEMP-REPRO|MUTATED' HEAD -- frontend` **无命中**；
  - `git diff --name-only HEAD` 只剩 `start.bat`（他人改动），工作树无本卡残留。
- 结论：**下述判定基于当前 HEAD（VS16 内容 == 工作树内容）**。第 1 条发现作为"过程失误已修复"记录，不构成对实现者的驳回。

## 1. Dashboard 链接（`frontend/src/pages/Dashboard.tsx`）

| 位置 | 实测 | 判定 |
|---|---|---|
| `:101` 最近会话项 | `` to={`/research?mode=fast&session=${item.id}`} `` | ✔ 规范目标、带 id |
| `:117` 最近讨论项 | `` to={`/research?mode=review&room=${item.id}`} `` | ✔ |
| `:94` 会话卡"查看全部" | `navigate('/chat')`，**无 id** | ✔ 未被污染 |
| `:110` 讨论卡"查看全部" | `navigate('/discussion')`，**无 id** | ✔ |
| `:127` 底部入口 | `/chat`、`/discussion`、`/models`、`/research`，**无 id** | ✔ |

**id 语义同源（独立核对后端）**：`dashboard.py:129-132` 的 `recent_conversations` 为 `SELECT c.* FROM conversations c WHERE mode='single' AND status='active' AND user_id=? ORDER BY updated_at DESC LIMIT 5` ⇒ `item.id` 是 `conversations.id`；`chat.py:64-78` 的 `/chat/sessions` 查同表同条件同口径 ⇒ 首页那 5 条必然是 `/chat/sessions` 的子集，深链的"成员资格校验"不会误杀。`recent_rooms`（`dashboard.py:133-134`）来自 `discussion_rooms`，与 `Discussion.tsx` 消费的 `/discussion/rooms`（`discussion.py:51-57`）同源。**另：`/chat/sessions` 无 LIMIT/分页**（我逐行看过 SQL），报告 §4.1 的风险提示成立且当前不触发。

## 2. Chat 深链（`frontend/src/pages/Chat.tsx`）

- `:64-65` **只接受十进制正整数**：`/^\d+$/.test(sessionParam) && Number(sessionParam) > 0`，否则 `null`。`abc/0/-1/1.5/43x/空` 六种畸形值均落到 `null`。✔
- `:79 + :88` **`sessionsResolved` 门控**：只有 `/chat/sessions` **成功返回**才置真；`:106` 未解析直接 return。列表请求失败则深链永不生效（回落，不臆造会话）。✔
- `:109` **成员资格校验**：`sessions.some(s => s.id === requestedSessionId)` 才 `setCurrentSessionId`。列表即"当前用户自己的会话"（后端 `chat.py:73` `AND c.user_id=?`）⇒ **非法/不存在/已删除/非本人 → 不选中**。✔
- **不为非法 id 发请求**：消息请求只由 `:113-120` 的 `currentSessionId` 驱动；非法 id 时 `currentSessionId` 不变（不会等于该 id），故**不会**为它发请求。✔（测试亦断言 `not.toHaveBeenCalledWith('/chat/sessions/999/messages')`。）
- `:80/:107-108` **`appliedSessionRef` 只应用一次**：命中/未命中都会置位，用户随后在左栏点其它会话不会被拽回 URL 的那一条。✔
- 零回归：`?prompt=`（`:61`、`:97-99`）逻辑一行未动，与深链共存。✔

## 3. Discussion（`frontend/src/pages/Discussion.tsx`）

- `:34-35` 与 Chat **同构的正整数解析**（修掉了旧 `Number(searchParams.get('room'))` 让 `null → 0` 也算"整数"的误判）。✔
- `:55` `appliedRoomRef` 就位；`:65-70` 未命中/已应用即 return，命中才置位并选中。✔
- 与 Chat 的写法差异：Discussion **没有** 显式 `roomsResolved` 门控，靠"`rooms` 里没有就 return"。安全性不因此受损（后端按 `user_id` 过滤 + store 是单用户态），仅在列表未回来但 store 残留旧列表时会提前命中；属一致性小瑕疵，见 §7.4。

## 4. ResearchWorkspace（`frontend/src/pages/ResearchWorkspace.tsx`）

- HEAD `:69-77` `ResearchModeSurface.selectMode`：写新 `mode` 前 `next.delete('session'); next.delete('room')` ⇒ `fast&session=5` 切走不带 session，`review&room=42` 切走不带 room。✔（`ResearchModeRouting.test.tsx` 两条新用例正是断言此点。）
- **未在 `ResearchModeSurface` 里转发参数**是正解：`Chat`/`Discussion` 与它同处一个 Router 上下文，各自 `useSearchParams()` 已能读到。`ResearchWorkspace.tsx:888-897` 的分发确认 `?mode=fast|deep|review` → `ResearchModeSurface`，`?mode=thesis` → `ThesisModeSurface`。✔

## 5. 关键安全性质：**深链不可能打开"别人的"记录**（本卡最关键）

后端三处**全部**按 `user_id` 过滤，且详情类接口在未命中时**抛 404**：

| 接口 | 证据 | 越权 id 的结果 |
|---|---|---|
| `GET /chat/sessions` | `chat.py:64-78`，`WHERE c.mode='single' AND c.status='active' AND c.user_id=?` | 不出现 ⇒ 前端不选中 |
| `GET /chat/sessions/{id}/messages` | `chat.py:107-114` → `_get_session`（`chat.py:42-48`，`WHERE id=? AND user_id=?`，`None → HTTPException(404)`） | 404 ⇒ 前端 `.catch(()=>{})` 静默 |
| `GET /discussion/rooms` | `discussion.py:51-57`，`WHERE user_id=?` | 不出现 ⇒ 前端不选中 |
| `GET /discussion/rooms/{room_id}` | `discussion.py:59-70`，`WHERE id=? AND user_id=?` | 404 |

前端再加一层"必须出现在我自己的列表里"（`Chat.tsx:109` / `Discussion.tsx:67`）。**两层防护，结论：不存在跨用户串记录的路径。** 编排者对"非法 id 不清空既有选中"的裁定**前提成立**（兜底在后端），据此**不判 REJECT**。

## 6. 测试与门禁（串行实测，非采信自述）

**(a) 任务书指定 4 文件**（`bun x vitest run tests/ChatSessionDeepLink.test.tsx tests/Dashboard.test.tsx tests/Discussion.test.tsx tests/ResearchModeRouting.test.tsx`）

- 第一次：`Test Files 2 failed | 2 passed (4) / Tests 2 failed | 34 passed (36)`，用时 **274s**（import 阶段 177s）。两处失败均为 `Test timed out in 5000ms`，且**都是与本卡 diff 无关的既有用例**：`Dashboard.test.tsx:32 DecisionInboxPanel > renders loading, error, and empty states explicitly`、`Discussion.test.tsx:51 Discussion async room detail guard > shows a loading state…`。（注意：不是报告 §3.4 说的 `[vitest-pool]` workers 超时，而是单测 5s 超时。）
- 第二次（**原样重跑这两个文件**）：`Test Files 2 passed (2) / Tests 20 passed (20)`，用时 **83s**（import 54.6s）。**全部通过**。
- 我核对了这两条用例与 VS16 diff 的关系：`DecisionInboxPanel` 是 `components/` 里的独立组件；`Discussion.test.tsx:51` 走的是 `MemoryRouter` 无查询串路径（`requestedRoomId === null`），新旧 effect 在该输入下行为**完全等价**（旧：`Number(null)=0`，`Number.isInteger(0)` 真但 `rooms.some(id===0)` 假 ⇒ 同样什么都不做）。⇒ **判定为机器高负载导致的环境噪声**（首轮 CPU 争用：import 177s vs 55s），非本卡缺陷。

**(b) 零回归补充**：`ChatBacktestRedirect.test.tsx`(8) + `ChatStarterDraft.test.tsx`(1) + `ResearchLanding.test.tsx`(2) = **11 passed**。`Chat.tsx` 改动的 `?prompt=`/回测跳转路径未回归。✔

**(c) 构建门禁**：`bun run build`（prebuild openapi 校验 + `tsc -b` + `vite build`）`✓ built in 32.19s`，退出码 0。✔

**(d) 鉴别力的独立复核（不采信 §3.1 的自述）**：我把 `Discussion.tsx` **复制**到 `frontend/tests/__vs16eval_DiscussionNoGuard.tsx`，**只做一处最小变异**——删掉"只应用一次"守卫：

```
- if (requestedRoomId === null || appliedRoomRef.current === requestedRoomId) return;
+ if (requestedRoomId === null) return;
```

配同一份 `Discussion.test.tsx`（导入路径指向副本）运行结果：

```
❯ tests/__vs16eval_snapback.test.tsx (7 tests | 1 failed) 4861ms
    × does not snap back to the deep-linked room after the user picks another one
AssertionError: expected 42 to be 43 // Object.is equality
❯ tests/__vs16eval_snapback.test.tsx:144:57
Test Files  1 failed (1) / Tests 1 failed | 6 passed (7)
```

⇒ **该用例确实能捕获"缺守卫"的形态**（且只此一处变红，无误伤）。机制也读通了：`discussionStore.addRoom = set(s => ({rooms: [room, ...s.rooms]}))`（`discussionStore.ts:32`）产生**新数组** → 依赖 `rooms` 的 effect 重跑 → 无守卫时被 URL 里的旧 room 拽回。**临时副本已送回收站**，`git status --porcelain` 复核仅剩他人改动（`start.bat`、`IMPLEMENT_RESULT_VS17.md`），**未改任何被验文件**。

## 7. 发现（均不构成驳回）

### 7.1 过程失误：`9979b14` 提交了变异态（已由编排者 amend 修复）
见 §0。因合并冲突风险已被消除、且当前 HEAD 内容正确、我据 HEAD 重跑了全部验证，**不判 REJECT**；但记录在案：提交前必须对 HEAD 扫 `TEMP-REPRO|MUTATED`（该教训已写进 AGENTS.md）。

### 7.2 报告事实性错误：Discussion snap-back 并非"本卡首次引入的可达性"
报告 §1.3、提交信息、以及 R4 审计记录（`5170ccd`）与 `PRODUCT_STATE`（R146）均称"VS16 之前没有任何地方产出 `?room=` 链接"。**不成立**：
- `frontend/src/components/research/ResearchContinuity.tsx:115` 早就在产出 `` to={`/discussion?room=${discussion.id}`} ``（由 `fdcc535` "AI-native research OS baseline" 引入，`git log -S "discussion?room="` 可证）；
- `/discussion` 是 `LegacyResearchRedirect mode="review"`（`App.tsx:324`），它**保留查询串**再补 `mode`（`App.tsx:150-155`）⇒ `/research?mode=review&room=<id>`；
- 该 `id` 语义正确：`researchApi.ts:129-131` 的 `fetchResearchDiscussions` 直接取 `/discussion/rooms`（= `discussion_rooms.id`）。

⇒ 修前的 `Discussion` snap-back（`Number.isInteger(...) && rooms.some(...)`、无守卫、依赖 `rooms`）**在 VS16 之前就是可达的**。修复本身**正确且必要**，但"首次可达"的归因应更正（否则历史记录会低估该缺陷的暴露时长、并夸大本卡的贡献面）。

### 7.3 一致性小缺口：第二处 `AgentModeSelector` 未剥参
`ResearchWorkspace.tsx:461-466`（`ResearchWorkspaceCore` 落地页的 `modePanel`）与 `ThesisModeSurface.backToResearch:93-100` 都**不**删 `session`/`room`，只有 `ResearchModeSurface.selectMode:69-77` 删。可达性：需要**手工构造** `/research?session=7`（无 `mode`）后再选模式，应用内没有这样的链接产出者（`/research` 入口不带记录 id），故属**潜在**不一致、非现网可触发。建议：抽一个 `switchMode(searchParams, nextMode)` 共用。

### 7.4 一致性小缺口：Chat 与 Discussion 守卫形态不同
Chat 有显式 `sessionsResolved`（列表**成功返回**才放行），Discussion 只靠"`rooms` 里没有就 return"。当前两者都安全（后端过滤 + 单用户 store），但两处口径不同会让后续维护者难以判断"哪个才是基准"。建议后续统一（不影响本次验收）。

### 7.5 已被裁定的口径
非法 id **不清空** store 既有选中（`IMPLEMENT_RESULT_VS16.md` §4.2）。编排者已裁定接受；我已验证其前提（后端四处 `user_id` 过滤 + 404）**成立**，故不为"未落空态"扣分。残余体验：同一 SPA 会话内此前看过别的记录时，非法深链会停在**自己的**旧记录上（与 URL 不符），非跨用户问题。

## 8. 判定

**ACCEPT。** 卡上 6 条验收标准逐条独立复核通过：
链接指向"那一条"（含正确 id 与规范目标）、"查看全部"无 id、深链**仅在列表成功返回且属于当前用户时**生效、非法 id 不发请求且不崩、`?prompt=`/`?topic=`/`ChatBacktestRedirect` 零回归、4 文件 36 例 + 11 例回归 + `bun run build` 全绿。
本卡最关键的安全性质——**不可能打开别人的记录**——由后端四处 `user_id` 过滤（详情接口 404）+ 前端成员资格校验双重兜底，**成立**。
7.2/7.3/7.4 为文档归因与一致性改进项，建议列入后续小修，不影响本轮验收。
