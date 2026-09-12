# EVALUATION_RESULT — VS-34（独立验收）

> 判定：**ACCEPT**（无 REJECT 项；下列"残留"均为已记明、不阻塞的取舍，非缺陷）
> 被验提交：`92055e0`（VS-34）；基线锚点：`92055e0^ = a03ac75`
> 任务卡：`docs/ai/evo/IMPLEMENTATION_BRIEF_VS34.md`；实现者结果：`docs/ai/evo/IMPLEMENT_RESULT_VS34.md`
> 验收方式：**自建夹具**（`%TEMP%\vs34-eval\frontend\tests\EvalVS34Independent.test.tsx`，8 条），
> **不复用**实现者 `ChatReadFailureRetry.test.tsx` 的任何断言 / 计数 / 期望值。
> 临时与变异文件**全程只在 `$env:TEMP\vs34-eval`**（frontend 副本 + junction → 真实 `node_modules`）；仓库工作树未进变异态；未 commit；**未杀任何进程**。

---

## 0. 锚点与完整性（先立锚，再判）

| 项 | 结果 |
|---|---|
| 文件集（`92055e0^ → 92055e0`） | `docs/ai/evo/IMPLEMENT_RESULT_VS34.md`(A)、`frontend/src/i18n/en.ts`(M)、`frontend/src/i18n/zh.ts`(M)、`frontend/src/pages/Chat.tsx`(M)、`frontend/tests/ChatReadFailureRetry.test.tsx`(A) —— **恰好 5 个，与声称一致** |
| 既有测试是否被改 | `git diff --name-status 92055e0^ 92055e0 -- frontend/tests` ⇒ **仅 `A`**（新增）。**0 个既有测试文件被修改或放宽** |
| VS-29 唯一实现处 | `frontend/src/components/LoadFailureAlert.tsx` 与 `ChatMessageBubble.tsx` 在该提交中**零改动**（`git diff --stat` 空） |
| VS-23/28 截断链路 | `resolveTruncatedByDeadline`（`Chat.tsx:45`）与 `truncated_by_deadline` 挂载（`:354`）原样保留，未改 |
| 变异残留标记 | 对提交内容扫 `TEMP-REPRO|TEMP_REPRO|MUTATED|XXX-TEMP` ⇒ **无命中** |
| 我的副本 == 提交内容 | 4 个交付文件的 SHA256 与仓库工作树**逐一相等**（`Chat.tsx` = `9ACD8DC9…395D`，与实现者 §0 自报值一致） |
| i18n 键集合 | zh 2489 / en 2489，**无单边键、无重复**；4 个新键 `chat.messagesFailed|messagesLoading|messagesEmpty|rolesLoadFailed` **全部被 `Chat.tsx` 使用**（`rolesLoadFailed` 用 2 次，其余各 1 次） |

**⚠️ 锚点漂移（记录，不影响判定）**：验收过程中编排者提交了 `92b1b35`（VS-35），`HEAD` 由 `92055e0` 变为 `92b1b35` ⇒ 我早期用 `HEAD~1` 书写的对照在那一刻起会指向错对象（我的一次 blob 提取因此拿到 `e516346` 而非 `4fd7d58`，**靠哈希不等当场发现并纠正**）。此后所有证据一律改用**显式版本**（`92055e0^` / `a03ac75`）。这也印证仓规中的"提交后 `HEAD` vs 工作区对照会退化为同义反复"。

**鉴别力基线（我独立复现，非引用其结论）**：
`git hash-object(<a03ac75:frontend/src/pages/Chat.tsx>) = 4fd7d5826ffd616de442ed501b7bc5bb09c6cf6e`，
与 `git rev-parse a03ac75:frontend/src/pages/Chat.tsx` **逐字节相等** ⇒ 实现者 §0 声明的"退回修复"基线**成立且可复查**。

---

## 1. ⚠️ 两个吞错点是否真修好（自建夹具，两处独立断言）

**结论：是。** 判据 = 错误态 + **底层原因原文** + 可点重试三者同时出现，且失败态下**空态文案一个字都不出现**。

- 基线定位（我独立重扫 `a03ac75:frontend/src/pages/Chat.tsx`，全文 `catch` 命中 8 处）：
  **A = `:134-138`**（`.catch(() => {})` 在 **138**）喂角色 `Select.options` 与新建会话 `role_preset`；
  **B = `:176-178`**（`.catch(() => {})` 在 **178**）喂消息区。**与实现者的行号表逐条吻合**，也与卡里两个独立来源（VS-25 报角色选择器、VS-32 报详情消息读取）对得上。
- 交付后全文件已**无任何空 catch**（正则 `catch \(\) => \{\}|catch\s*\{\s*\}` 命中 0）。

我自建夹具的原始结果（交付态）：

```
✓ B-1 失败 ⇒ 错误态 + 底层原因原文 + 可点重试；且**不出现**空态文案
✓ B-4 失败但本地已有已知记录 ⇒ 记录不得被藏掉（失败不顺手抹掉真实数据）
✓ A-1 失败 ⇒ 左栏与角色下拉区**两处独立**都给错误态 + 原因原文 + 可点重试
```

- B：`/chat/sessions/42/messages` 以 `EVAL-B-STORE-DOWN` 拒绝 ⇒ `消息记录读取失败` + `EVAL-B-STORE-DOWN` + 重试按钮 + `.ant-alert-error` 全部出现；同时 `assert queryByText('这个会话还没有消息') === null` 且 `正在读取消息记录… === null` ⇒ **失败不伪装成空**（VS-19/VS-22 底线）成立，且三态互斥。
- A：`/agents` 以 `EVAL-A-UPSTREAM-DOWN` 拒绝 ⇒ **左栏 `rail` 与 content（下拉区）两个作用域各自独立**断言全部通过（各自有文案 + 原文 + 可点重试）。
- 额外（我加的，非卡要求）：失败时若本地已有已知记录，记录**不被藏掉**（`showContentOnError` + `retainedCount` 生效）。

## 2. ⚠️ 重试是否真重发（自建计数，且与"是否成功"解耦）

**结论：是，且解耦成立。** 我用**自己的**逐 URL 计数器（`makeApi()`，与实现者的 `stubApi` 无关），并刻意让**第二次仍然失败**——这样"计数为 2"就不可能由"重试后成功"伪装出来：

```
✓ B-2 重试真重发（n=1→n=2）且与是否成功解耦：第二次仍失败，计数仍为 2，屏上是第二次的原文
✓ A-2 重试真重发（n=1→n=2）且与成功解耦：第二次仍失败，计数 2，两处都换成第二次原文
```

断言序列（B）：首次失败 `EVAL-B-FIRST-FAIL`，计数 `=== 1` → 点击重试 → **计数 `=== 2`**（`waitFor`），且屏上换成 `EVAL-B-SECOND-FAIL`（证明**第二次响应真被消费**，而不是"只把提示关掉"），旧原文消失，错误态与重试按钮仍在，空态文案仍不出现。A 同款，且两处作用域都换成第二次原文。

⇒ 实现者声称的"以请求计数 n=1→n=2 证明，与是否成功解耦"**成立**，并且我用的夹具比其用例更强（其"在途"用例靠 never-settle 的 pending，我的用例靠"第二次也失败且原文更新"）。

## 3. ⚠️ 反向守卫是否真在守

**结论：在守，且我独立证明了它会变红。**

- 交付态下我自建的两条反向守卫均绿：`B-3`（`/messages` 成功但 `items: []` ⇒ **只**出现空态文案，`queryByText('消息记录读取失败') === null` 且**无重试按钮**、无 `.ant-alert-error`）、`A-3`（`/agents` 成功但 `[]` ⇒ 任何地方都不得出现 `角色列表读取失败`/重试按钮）。
- **是否真的有鉴别力**（不是"永远是绿的摆设"）：我在副本里把**成功路径**变异为"成功也置失败"（`setAgentsFailed(false)` → `true)`，仅 1 处、在副本内）：

```
× B-3 反向守卫：成功但确实为空 ⇒ 只出现空态，**不得**出现错误态
× A-3 反向守卫：成功但没有角色 ⇒ 任何地方都不得出现错误态
Tests  2 failed (8)
```

⇒ 反向守卫确实会因"把空/成功误报成失败"而变红。**边界说明（不掩饰）**：这次变异里 `B-3` 变红的原因是"content 作用域内多出的是**角色**告警的重试按钮"（我的断言语域与实现者的不同），并非 B 侧判据本身；而 `A-3` 是**按其本义**变红（`queryByText('角色列表读取失败')` 命中）。B 侧反向守卫的鉴别力在**另一处**已独立证实：对修前代码 `B-3` 变红（`Unable to find an element with the text: 这个会话还没有消息`）。

## 4. ⚠️ 清单对 C/D/E/F/G 五处"不改"的归因是否成立

**结论：五处归因全部成立，未发现"实为吞错却被判为不改"的情形。** 逐处给判据（行号为交付态 `Chat.tsx`）：

| # | 位置 | 我的独立核验 | 裁决 |
|---|---|---|---|
| C | `:332` | **代码读 + 实测双证**：`response.json()` 失败降级为 `{detail: t('chat.requestFailed')}` → `:333 throw` → 外层 `:365 catch` → `:367 message.error(...)`。我自建用例 `C-1` 把 `fetch` 伪装成 `ok:false, status:502, json()=>reject`，点击发送后 **`请求失败` toast 确实出现在屏幕上（用例通过）** ⇒ **降级 + 抛出 + toast 可见**三者全部成立，**确非静默吞错** | 成立 |
| D | `:365-368` | `if (err.name !== 'AbortError') message.error(...)`；全文件 `abortRef...abort()` **只有 `handleStop` 一处**（`:377`，用户点"停止"） ⇒ 忽略 AbortError = 尊重用户主动取消。把用户取消渲染成"发送失败"才是缺陷 | 成立 |
| E | `:253-255` | 新建会话写路径，`message.error(e.message)` **toast 可见** | 成立 |
| F | `:264-266` | 删除会话写路径，同上 | 成立 |
| G | `:276-278` | 切换角色写路径，同上 | 成立 |
| 附 | `:135-141` | `loadSessions`（VS-22 既有）catch 会置 `sessionsFailed/sessionsError`，由左栏 `LoadStateView` 呈现 ⇒ 可见，非吞错 | 成立 |
| 附 | `:338-341` | `readSSE` 的 `event==='error'` 分支 `message.error(data.error ?? data.message ?? t('chat.sendFailed'))` ⇒ 有底层原因、可见 | 成立 |

⇒ **不做反驳**。C 的"降级"确实丢掉了"解析失败"这一具体原因（只保留"请求失败"），但**请求失败本身是显式可见的**，属措辞粒度问题，不构成吞错。

## 5. 零回归（独立复跑，且核对既有断言未被放宽）

| 文件 | 我复跑结果 |
|---|---|
| `ChatDeadlineSignal.test.tsx`（VS-23/28 截断链路） | **5 passed** |
| `ReadStateThreeWay.test.tsx`（VS-29 三态契约） | **22 passed** |
| `ChatSessionDeepLink.test.tsx` | 14 passed |
| `ChatBacktestRedirect.test.tsx` | 8 passed |
| `ChatStarterDraft.test.tsx` | 1 passed |
| `ChatMessageBubble.test.tsx` | 2 passed |
| `ListFailureNotEmptiness.test.tsx`（VS-19/22 族） | 14 passed |
| `ResearchModeRouting.test.tsx` | 5 passed |
| 实现者新增 `ChatReadFailureRetry.test.tsx` | 9 passed |
| **我新增的 `EvalVS34Independent.test.tsx`** | **8 passed** |
| 合计 | **88 passed / 0 failed**，全窗口**未出现一次 `Test timed out in 5000ms`** |

**既有断言是否被改/放宽**：`git diff --name-status 92055e0^ 92055e0 -- frontend/tests` ⇒ 只有 `A frontend/tests/ChatReadFailureRetry.test.tsx` ⇒ **本卡只新增测试文件，未改任何既有测试、未放宽任何断言**（与卡要求一致）。

## 6. i18n 一致性

zh/en 各 2489 键、差集为空；两文件内均无重复键；4 个新键**全部在 `Chat.tsx` 有真实消费点**（`rolesLoadFailed` 在 `:413` 与 `:491`，`messagesFailed` `:517`、`messagesLoading` `:519`、`messagesEmpty` `:520`）。无单边键、无"声明未用"键。

## 7. 边界（提交只含应含之物；未动他卡链路）

- 提交文件集 **= `Chat.tsx` + `i18n/{zh,en}.ts` + 新测试 + 结果文件**，无第 6 个文件，无 `dist/`、无临时夹具入库。
- VS-29 三态契约：`LoadFailureAlert.tsx` **零改动**；`Chat.tsx` 只**提供事实**（`scopedMessagesFailed/scopedMessagesResolved/visibleMessageCount`）后交给族内唯一的 `readStateOf` + `LoadStateView`，**未另造三态判定**（全文仅这一处 `readStateOf` 用于消息区，另一处是既有的左栏列表）。
- VS-23/28 截断链路：`resolveTruncatedByDeadline` 与其消费点原样（见 §0）。
- **VS-35 边界**：`bun run build` 会编译 VS-35 的文件（跨卡共享门禁）。我在 `HEAD=92b1b35`（VS-35 已入库、工作树 `git status --porcelain` 为空）下串行执行 ⇒ **`bun run build` exit 0**（prebuild openapi 60 schemas fresh；`tsc -b && vite build` ✓ 45.59s）。**若该次失败，我也不会替它归因**；本次成功，故无需裁决归属。
- 环境噪声如实登记：本机当时 `Win32_Processor.LoadPercentage ≈ 97%`，且**另有卡（`%TEMP%\eval_vs35\fe`）正在并发跑 vitest**；在上述负载下本卡全部用例仍绿、无超时。⇒ 未因负载放宽任何断言或超时。

---

## 8. 残留（**不阻塞 ACCEPT**；均为已记明取舍，非缺陷）

1. `Chat.tsx:253/264/276` 的 `catch (e: any) { message.error(e.message) }`：对**非 `Error` 的 rejection**，`e.message` 为 `undefined` ⇒ toast 可能无文案。实现者已在结果文件 §6.1 **如实记为未解决**，且本卡范围是读取路径 ⇒ 归因成立，不改可接受。
2. 角色失败态在 Chat 出现**两份**（左栏 + 下拉正下方）：两个独立消费方、两处都常驻可点，属**有意冗余**，实现者已明示取舍（§6.2）。
3. 消息区新增"诚实空态"文案（`这个会话还没有消息`）：修前"成功且为空"是**完全空白**，属**行为变化**，方向与 VS-29 契约一致，已在 zh/en 同步并记入 §6.3。
4. `visibleMessageCount` 含流式气泡（`isStreaming ? 1 : 0`）：实现者自标为**代码结构推理、未单独写用例**（§6.4）。我核对了 `readStateOf` 的优先级（`failed` → `count>0` → `resolved` → `loading`）与 `LoadStateView` 的 error 分支（`showContentOnError && retainedCount>0` 才渲染 children），推理成立。
5. 实现者 §0.5 关于"半成品中途缺失三项"的**中间态证据在提交后已不可复查**（半成品从未入库）；该项属自述，**我未采信为事实**，只对**最终交付态**负责——最终态经上述全部检查。

---

## 9. 复现命令（全部在 `$env:TEMP` 副本，仓库未写入任何门禁产物）

```powershell
# 副本（junction 指回真实 node_modules）
robocopy E:\Code_file\Projects\finquant-hub\frontend $env:TEMP\vs34-eval\frontend /E /XD node_modules dist
New-Item -ItemType Junction -Path $env:TEMP\vs34-eval\frontend\node_modules -Target E:\Code_file\Projects\finquant-hub\frontend\node_modules

# 自建夹具（8 条）+ 回归
cd $env:TEMP\vs34-eval\frontend
bun x vitest run tests/EvalVS34Independent.test.tsx tests/ChatDeadlineSignal.test.tsx tests/ReadStateThreeWay.test.tsx `
  tests/ChatReadFailureRetry.test.tsx tests/ChatMessageBubble.test.tsx tests/ChatSessionDeepLink.test.tsx `
  tests/ChatStarterDraft.test.tsx tests/ChatBacktestRedirect.test.tsx      # 8 files / 69 passed

# 鉴别力：副本内把 Chat.tsx 换回 a03ac75（先做 SHA256/hash-object 核对），仓库不动
cmd /c "cd /d E:\Code_file\Projects\finquant-hub && git show a03ac75:frontend/src/pages/Chat.tsx > %TEMP%\vs34-eval\backup\Chat.prefix.tsx"
git -C E:\Code_file\Projects\finquant-hub hash-object %TEMP%\vs34-eval\backup\Chat.prefix.tsx   # 4fd7d582…cf6e
# ⇒ 实现者文件 9 tests | 8 failed（唯一仍绿 = 反向守卫）；我的文件 8 tests | 7 failed

# 门禁
cd E:\Code_file\Projects\finquant-hub\frontend && bun run build    # exit 0
```

**一句话**：半成品续写的最终交付态经**自建夹具**独立复核——两处吞错点（`/agents`、`/messages`）已成"错误态 + 底层原文 + 真重发的重试"，失败不再伪装成空、反向守卫确实会因"误报失败"变红，重试以**逐 URL 计数 n=1→n=2 且第二次仍失败**证明与成功解耦；C/D/E/F/G 五处"不改"的归因逐处成立（C 为实测），VS-23/28 与 VS-29 链路零改动，88 条相关用例全绿、`bun run build` exit 0 ⇒ **ACCEPT**。
