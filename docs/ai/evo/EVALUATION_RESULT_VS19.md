# EVALUATION_RESULT — Vertical Slice 19（独立验收）

> 验收者：EVALUATOR（独立于实现者），2026-09-11。
> 任务卡：`docs/ai/evo/IMPLEMENTATION_BRIEF_VS19.md`；实现者报告：`docs/ai/evo/IMPLEMENT_RESULT_VS19.md`。
> 被验对象：**已提交状态** commit `3cdd46d`（前端 8 个文件）。工作树中 `backend/*`（VS-21）与 `frontend/src/pages/Research.tsx`（另一卡片在途，230 行改动，23:11 才落盘）**均未读取、未触碰、不计入判定**。
> 方法：读实现（不采信自述）→ 复跑门禁 → 在 `$env:TEMP` 副本上做**自己的**变异（两轮 5 处缺陷）→ 逐条质疑。

---

## 判定：**ACCEPT**

目标达成：`/dashboard/stats` 失败不再伪装成"暂无会话/暂无讨论"；`?session=`/`?room=` 落空不再静默；**"列表读取失败"没有被说成"已不存在"**（两个不同 i18n key + 用例独立捕获）。无阻断缺陷。

---

## 1. 实现核对（逐条看代码，非看报告）

### 1.1 首页 `Dashboard.tsx`

| 核对项 | 结论 | 证据 |
|---|---|---|
| `statsFailed`/`statsError` 状态存在 | ✅ | `:53-54` |
| 失败路径**真的**置真 | ✅ | `loadStats` `:69-79`：`catch` 内 `setStats(null)` + `setStatsError(error instanceof Error ? error.message : '')` + `setStatsFailed(true)`；原先的 `catch { /* non-critical context */ }` 已删除（`git show` 确认） |
| 每次请求开头复位（重试不粘死） | ✅ | `:70-71` `setStatsFailed(false); setStatsError('')` |
| **两张**卡片都成立 | ✅ | `:115` 近期会话、`:133` 近期讨论，均为 `{statsFailed ? statsAlert : (<List … />)}` |
| 空态只在"成功且为空"出现 | ✅ | `today.noConversations`/`today.noDiscussions` 只在 `List` 的 `locale.emptyText`（`:128`/`:146`）上，而 `List` 仅在 `statsFailed === false` 分支渲染 |
| 与 `DecisionInboxPanel` **同款** Alert | ✅ | `statsAlert :99` = `<Alert type="error" showIcon message={t('today.statsFailed')} description={statsError} action={<Button onClick={() => void loadStats()}>{t('today.retry')}</Button>} />`；对照 `:25` 的收件箱 Alert 为 `type="error" showIcon message={t('today.inboxFailed')} description={error} action={<Button onClick={onRetry}>{t('today.retry')}</Button>}` —— 组件/类型/三要素结构一致，仅文案 key 不同 |
| 失败文案 + 具体错误 + **可点的重试** | ✅ | 三者齐备；重试按钮 `onClick={() => void loadStats()}` 真的重新调用请求函数（非只清错误态，见 §4 变异 E） |

### 1.2 深链 `Chat.tsx` / `Discussion.tsx`

| 核对项 | 结论 | 证据 |
|---|---|---|
| `notifyOnce` **先判后记** | ✅ | `Chat.tsx:118-122`：`if (notifiedSessionRef.current === requestedSessionId) return;` **读**，紧接 `notifiedSessionRef.current = requestedSessionId;` **写**；`Discussion.tsx:79-83` 同构 |
| `notified*Ref` 既被读也被写 | ✅ | 读在 `Chat:119`/`Discussion:80`，写在 `Chat:120`/`Discussion:81`（grep 全仓确认无第三处） |
| **只有真命中**才写 `applied*Ref` | ✅ | 命中路径 `Chat:128`/`Discussion:89` 才写；两条落空分支（`:124`/`:127`、`:85`/`:88`）**直接 return，不写** `applied*Ref` |
| **不清空**既有选中 | ✅ | 落空分支无任何 `setCurrentSessionId`/`setCurrentRoomId` 调用 |
| 不为非法 id 发请求 | ✅ | 落空分支不发请求；用例断言 `not.toHaveBeenCalledWith('/chat/sessions/999/messages')`、`not.toHaveBeenCalledWith('/discussion/rooms/999')`（既有 VS16 用例 + 新增用例均含） |
| 列表请求自身失败被**记录**（不再静默） | ✅ | `Chat:94` `.catch(() => { if (!cancelled) setSessionsFailed(true); … })`（原为只留注释的静默 catch）；`Discussion:68` 同款；`Discussion` 另补 `cancelled` 卸载守卫（`:65,70`） |

### 1.3 错误归因（本卡最要紧的性质）

三种情形**代码层三分支**，互不共用文案：

| 情形 | 触发条件（代码） | key | zh 实际文案 | en 实际文案 |
|---|---|---|---|---|
| ① 列表成功返回但不含该 id | `sessionsResolved && !sessions.some(...)` | `chat.deepLinkMissing` | 该会话已不存在，已显示当前会话列表 | That session no longer exists. Showing your current session list. |
| ② 列表请求自身失败 | `!sessionsResolved && sessionsFailed` | `chat.deepLinkUnavailable` | 会话列表读取失败，未能打开指定会话 | Could not read your session list, so the linked session was not opened. |
| ③ 命中 | `.some(...)` 为真 | —— | 无任何警告 | 无任何警告 |

`Discussion` 侧同构（`discussion.deepLinkMissing` / `discussion.deepLinkUnavailable`）。

**语义未写反**：已逐字读四个 key 的实际文案（`zh.ts:1852-1853`、`en.ts:1853-1854`；`zh.ts:1877-1878`、`en.ts:1878-1879`）。②的主语是"列表读取"这一动作，全程不提"不存在"；①才说"已不存在"。**两者是不同的 key，不可能混用**——并且这不是靠自觉：我把②的 key 换成①的 key（变异 D），两个"reports a list read failure instead of claiming …"用例**双双变红**（§4）。**结论：读取失败没有被误说成不存在。**

### 1.4 i18n parity（独立计数）

- 全文件 key 计数：`zh.ts` **2465** / `en.ts` **2465**，差集 **0 / 0**，两侧均无重复 key。
- 本卡新增 5 个 key，**zh/en 一一对应**：`today.statsFailed`、`chat.deepLinkMissing`、`chat.deepLinkUnavailable`、`discussion.deepLinkMissing`、`discussion.deepLinkUnavailable`。
- 重试复用既有 `today.retry`（`zh.ts:1079` 重试 / `en.ts:1079` Retry），未新增重复 key。

---

## 2. 独立测试（串行，我自己的进程与输出）

```
# 门禁三文件
cd frontend; bun x vitest run tests/Dashboard.test.tsx tests/ChatSessionDeepLink.test.tsx tests/Discussion.test.tsx
  ✓ tests/Dashboard.test.tsx        (16 tests)  4992ms
  ✓ tests/Discussion.test.tsx       (10 tests)  1856ms
  ✓ tests/ChatSessionDeepLink.test.tsx (14 tests) 1857ms
  Test Files  3 passed (3)      Tests  40 passed (40)      Duration 35.19s   exit 0

# 零回归两文件
bun x vitest run tests/ChatBacktestRedirect.test.tsx tests/ChatStarterDraft.test.tsx
  ✓ ChatBacktestRedirect (8) + ChatStarterDraft (1)
  Test Files  2 passed (2)      Tests  9 passed (9)       Duration 33.49s   exit 0

# 合计 5 文件 49 passed —— 与实现者自述一致
```

**未出现** `[vitest-pool]: Failed to start forks worker … Timeout`，三轮运行零环境噪声，无需重跑记录。

另跑构建（测试之后、串行，未并行）：`bun run build` → `tsc -b` 通过，`✓ built in 16.32s`，`dist/assets/Dashboard-BBNECcmS.js` 哈希与实现者报告**逐字一致**。注意：该次构建期工作树含**他卡在途**的 `Research.tsx`（230 行），故构建绿灯只能作为本卡的弱旁证（VS-19 文件本身与 HEAD 逐字节相同，见 §6）。

---

## 3. 独立复现"只提示一次"

实现者自述"提示后让列表再变一次仍为 1 次"。我**不采信**，改为在 `$env:TEMP` 副本上删掉守卫行来反证该断言**真的有机会触发第二次**：

变异后失败信息为 `AssertionError: expected "Mock" to be called 1 times, but got 2 times`（Chat `:160`、Discussion `:197`）。

这条证据的推理是闭合的：**若测试根本没有触发第二次 effect 求值，删掉守卫也只能得到 1 次调用、用例仍会绿**；实测得到 2 次，说明"列表再变一次"确实让 effect 以新依赖重新求值并**再次走到了 `notifyOnce`**，只是因为守卫（读+写同时存在）才被拦下。**即：不是靠"测试没触发第二次"蒙对的。**

---

## 4. 鉴别力独立复核（我自己做的变异，非采信报告）

做法：把 `frontend/src`+`tests`+配置复制到 `$env:TEMP\vs19_mut`（`node_modules` 用 junction 指向真实目录），**在副本上**植入缺陷；被验文件全程只读、未改一字节。两轮共 5 处缺陷。

**第一轮（删接线/删守卫）** — 期望 4 红，实测 4 红，逐条对得上：

| 变异 | 位置 | 变红的用例 |
|---|---|---|
| A 删 `setStatsFailed(true);` | Dashboard `:77` | Dashboard「shows an explicit error with retry in both recent-record cards when stats fail」＋「refetches stats from the card retry …」（Unable to find text: 近期记录读取失败） |
| B 删 `if (notifiedSessionRef.current === …) return;` | Chat `:119` | Chat「warns exactly once … even after the list changes again」→ `got 2 times` |
| C 删 `if (notifiedRoomRef.current === …) return;` | Discussion `:80` | Discussion「warns exactly once …」→ `got 2 times` |

```
 Test Files  3 failed (3)      Tests  4 failed | 36 passed (40)      exit 1
```

**第二轮（换 key / 假重试）** — 期望 3 红，实测 3 红：

| 变异 | 位置 | 变红的用例 |
|---|---|---|
| D ②的 key 换成①的 key（`*Unavailable` → `*Missing`） | Chat `:124`、Discussion `:85` | **两侧**「reports a list read failure instead of claiming … does not exist」→ `expected "Mock" to be called with arguments: [ '会话列表读取失败，未能打开指定会话' ]` / `[ '讨论列表读取失败，未能打开指定讨论' ]` |
| E 重试按钮改成只清错误态（`() => setStatsFailed(false)`） | Dashboard `:99` | Dashboard「refetches stats from the card retry and recovers the records …」→ 找不到记录链接 |

```
 Test Files  3 failed (3)      Tests  3 failed | 37 passed (40)      exit 1
```

⇒ ①"失败不再伪装成空态"、②"只提示一次"、③"读取失败 ≠ 已不存在"、④"重试真的重新发起请求"四类断言**各自都有真实鉴别力**，"删掉机制也全绿"的形态不成立。

---

## 5. 重点质疑逐条裁定

| 质疑 | 裁定 |
|---|---|
| "只提示一次"是否真只一次 | **成立**（§3 反证：删守卫即 2 次，说明第二次触发真实存在） |
| 变异复核（不采信报告） | **已独立重做**（§4，5 处缺陷全部精确捕获，4+3 条用例变红） |
| "重试"是否真的重新发起请求 | **是**。代码：`onClick={() => void loadStats()}`（非只 `setStatsFailed(false)`）；用例断言 `attempts === 2` 且卡片恢复；变异 E 反证 |
| 成功但为空时"暂无…"是否照常 | **是**。`statsFixture` 的 `recent_conversations`/`recent_rooms` 真为 `[]`（`:145-146`），用例断言两处"暂无"出现且无 Alert；变异 A（失败态失效）不影响该用例通过，说明它走的是成功路径 |
| `catch` 是否又变成另一种静默 | 部分成立，见下"非阻断观察"，**不计入判定** |
| 错误归因是否写反 | **未写反**（逐字读文案 + 变异 D 双向验证） |
| 是否清空既有选中 / 为非法 id 发请求 | **均未**（落空分支无 setter、无请求；用例与代码双证） |
| 是否碰了 `backend/*`（VS-21 在途） | **未读、未动**；本卡 commit 只含 `frontend/` 8 文件 + 结果文档 |
| 是否有变异残渣被提交 | **无**。`git grep -n -E 'TEMP-REPRO|TEMP_REPRO|MUTATED|XXX-TEMP' 3cdd46d -- frontend/` 零命中；`git show --check` 无空白错误 |

---

## 6. 边界与状态核实

- **被验文件 == HEAD == 3cdd46d**：8 个 VS-19 文件逐一 `git hash-object` 比对，`wt == HEAD == 3cdd46d` 全部为真（说明我测的就是交付态，不是变异窗口态）。
- **HEAD 已前移**（`3cdd46d` → `744312e` → `f4240e7` → `030260a`），但 `git diff --stat 3cdd46d HEAD -- frontend` **为空** ⇒ 前端交付内容未被后续提交改动，判定仍锚定 `3cdd46d` 的前端状态。
- 工作树另有他卡在途改动：`backend/app/services/llm_client.py`、`backend/tests/test_llm_client.py`（VS-21）与 `frontend/src/pages/Research.tsx`（另一卡片，23:11 落盘）。**均未读取、未触碰、不计入判定**；未做任何 `git add`/`commit`。
- 变异副本已清理：先单独回收 junction（**先在与真实 `node_modules` 无关的临时夹具上验证过"回收 junction 只删链接、不伤目标"**），再回收整个副本目录；真实 `frontend/node_modules` 顶层条目 208 → 208、体积 286.1 MB 不变。`$env:TEMP` 无残留。

---

## 7. 非阻断观察（不构成 REJECT）

1. **实现者 §4 的"同类未修面"声明属实**（我独立核码确认，且编排者已将其立为 VS-22，见 commit `744312e`）：
   - `Chat.tsx:319` 左栏 `List` 的 `locale.emptyText` 仍是 `t('chat.empty')`，`sessionsFailed`（`:81`）只服务深链提示 ⇒ 左栏自身读取失败仍显示"暂无会话"；
   - `Discussion.tsx:256` 同款（`roomsFailed` 同样只服务深链）；
   - `Dashboard.tsx:94/111` 的 `ResearchRuns` 由 `stats?.recent_rooms ?? []` 推出，stats 失败时同页两张卡片显示 Alert 而它静默渲染空列表（同页两种待遇）。
   三者都在**本卡枚举范围之外**，故按任务书要求**不据此判 REJECT**，仅记录。
2. **`?session=` 落空提示后若该 id 稍后出现在列表里仍会被选中**（落空不写 `applied*Ref` 的刻意保留，与 Discussion 既有"继续等待"注释一致）。极端时序下"先提示已不存在、后选中"文案略早，服务端 id 不会复用，判定可接受（实现者 §4.3 已主动声明）。
3. **构建绿灯的旁证强度有限**：该次 `bun run build` 期间工作树含他卡在途的 `Research.tsx`；虽然退出码 0，但严格意义上的"对 `3cdd46d` 前端状态的构建验证"只能在无他卡在途时复现（本卡 8 文件与 HEAD 逐字节相同这一点已确认）。
4. **本次未复现环境噪声**：三轮 vitest 全部一次通过，无 fork worker 超时。

---

## 8. 复现命令

```powershell
cd E:\Code_file\Projects\finquant-hub\frontend
$env:no_proxy='localhost,127.0.0.1,::1'
& 'D:\Technology_application\NVM_Windows\nvm_a\v22.19.0\bun.exe' x vitest run `
  tests/Dashboard.test.tsx tests/ChatSessionDeepLink.test.tsx tests/Discussion.test.tsx
# → 3 passed (3) / 40 passed (40)
& 'D:\Technology_application\NVM_Windows\nvm_a\v22.19.0\bun.exe' x vitest run `
  tests/ChatBacktestRedirect.test.tsx tests/ChatStarterDraft.test.tsx
# → 2 passed (2) / 9 passed (9)
& 'D:\Technology_application\NVM_Windows\nvm_a\v22.19.0\bun.exe' run build
# → tsc -b 通过 + ✓ built（串行，勿与 vitest 并行）

# 变异复核（在副本上做，勿改被验文件）：
#   副本 = %TEMP%\vs19_mut（src/tests/config + node_modules junction）
#   A 删 Dashboard.tsx 的 setStatsFailed(true)
#   B/C 删 Chat.tsx / Discussion.tsx 的 notified*Ref 判读行
#   D 把 *Unavailable 的 key 换成 *Missing
#   E 把 statsAlert 重试按钮改成 () => setStatsFailed(false)
```

**验收结论：ACCEPT。** 空态现已只代表"确实没有"；读取失败被显式说出，且**没有被误归因为"已不存在"**。
