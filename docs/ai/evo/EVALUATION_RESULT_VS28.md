# EVALUATION RESULT — VS28（独立验收）

> 评估者：**EVALUATOR**（独立于实现者；不采信其自述，凡关键结论均自行构造夹具重跑）。
> 被验提交：**`3109b6e`**（VS-28「让 chat 的整轮截断信号真的有消费方」）。
> 验证时 HEAD＝`9ed1287`；`git diff --name-only 3109b6e HEAD -- backend frontend docs/API_CONTRACT.md` **为空** ⇒
> 受验代码与交付提交**逐字节一致**（其后仅有 `PRODUCT_GAP_MAP.md` / `PRODUCT_STATE.md` 两处编排者文档提交）。
> 开始与结束时 `git status --porcelain` **均为空**；评估者**未 commit、未触碰仓库内文件**（变异与临时件全部在 `$env:TEMP`）。

## 判定：**ACCEPT**

方案 A（接线）**真的落地**，且本卡要消灭的中间态（"声明了却没有消费方"）**已消除**；首要质疑点（回放字段从正文反推）
被证实存在一处**误标路径**，但判为**残余风险可接受**（非设计缺陷），理由与升级路径见 §4。

---

## 0. 独立验证方法（与实现者用例**不共用断言**）

| 证据来源 | 性质 | 说明 |
|---|---|---|
| `$env:TEMP\vs28-eval\eval_vs28_backend.py` | 评估者自建 | 自建临时库 → 自插 11 行各种形态 → 直接调 `chat.list_messages`，绕开实现者的测试文件 |
| `$env:TEMP\vs28-eval\eval_vs28_sink.py` | 评估者自建 | 替身 client 主动向 `_event_sink` 发 `tool_loop_truncated` 等 4 事件，实测客户端收到的序列 |
| `$env:TEMP\vs28-eval\frontend\tests\EvalVs28Independent.test.tsx` | 评估者自建 6 用例 | 在**副本**中运行（E1–E6），覆盖实现者用例**未覆盖**的两点：`done` **完全缺字段**、`user/agent/system` 角色守卫 |
| 副本变异（M1/M2） | 评估者自建 | 变异只作用于 `$env:TEMP` 副本，用 SHA256 前后比对证明还原 |

副本构造：`robocopy frontend → $env:TEMP\vs28-eval\frontend`（排除 `node_modules/dist/test-results`）+
`node_modules` **junction** 指向真实目录（**只读使用，不修改真实仓库**）。

---

## 1. 用户真能看到，且提示**持久**（卡内验收 2）

**结论：是。** 三重证据（实时渲染 / 流结束后仍在 / 刷新回放仍在），且回放一侧由**真实后端**独立证实。

1. **实时**（评估者副本 E1，自建夹具）：`done.truncated_by_deadline=true` ⇒
   `getByTestId('chat-truncated-by-deadline')` 命中，节点 `role="status"`，文案＝`t('chat.truncatedByDeadline')`；
   随后断言 `isStreaming===false`、流式占位文案（`chatBubble.typing`）**已消失**而提示节点**仍在**
   ⇒ 它挂在**消息本体**上，不是流式气泡、不是 toast。**通过**。
2. **刷新/回放**（E2，独立构造）：挂载 → `unmount()`（≈刷新）→ 重新挂载，走
   `GET /chat/sessions/42/messages`；同会话 3 条消息中**只有**被标记的那条出现提示（`getAllByTestId(TID)` 长度＝1）。
   **通过**。
3. **回放字段真的由后端产出**（评估者自建 Python 探针，非前端桩）：真实临时库 + 真实 `list_messages`：
   - 截断形态落库（`notice + "\n\n" + 正文`）⇒ `truncated_by_deadline=True`
   - 端到端走真实 `chat.send_message`（截断、正文为空）⇒ 落库内容**恰好**是 notice，回放⇒`True`
   - 字段恒为真布尔（无 `None`）**通过**。

> 两半合起来构成完整链：**后端确实产出该字段**（探针）＋**前端确实渲染持久提示**（E1/E2）。
> 未做浏览器真人点击与 Playwright E2E（与实现者 §7-4 同）；此为**已披露的验证边界**，非缺陷。

## 2. 未截断时**不得**出现提示（卡内验收/错误场景）

**结论：是，两种情形都不出现，且均为"节点＋文案"双断言。**

| 情形 | 评估者用例 | 结果 |
|---|---|---|
| `done.truncated_by_deadline = false` | E3：`queryByTestId` 为 null **且** `queryByText(t('chat.truncatedByDeadline'))` 为 null | 通过 |
| **`done` 完全不带该字段**（实现者用例**未覆盖**的形态） | E4：同上双断言 | 通过 |
| 历史回放带 `false`（后端） | 自建探针：正常完成落库行 ⇒ `False` | 通过 |
| 历史回放**缺字段**（旧数据，前端） | 实现者用例④（在副本 STAGE1 复跑绿） | 通过 |
| `user` / `agent` / `system` 行即便被误标 `true`（前端角色守卫） | E5：`queryByTestId` 为 null 且文案为 null | 通过 |
| 非法值 `0/1/''/'true'/'false'/[]/{}/NaN/null/undefined` | E6：`resolveTruncatedByDeadline` 一律 `false` | 通过 |

> 后端侧另证：`_marked_truncated` 的空串、纯空白正文均判 `False`。

## 3. 说法与事实一致（卡内验收 3/4，grep 证据）

**结论：`backend/app` 与 `docs/API_CONTRACT.md` 均与事实一致；剩余 2 处属"引文/待验证议题"，已列 NIT。**

**(a) `backend/app` 内"事件通道/三通道"仅 3 处命中，无一宣称该通道存在：**

```
backend\app\routers\chat.py:220  …事件通道不外发（见 _event_sink 注释）。
backend\app\services\llm_client.py:132  ⚠️ VS28 更正（原文为"…在**事件通道**上同样显式、不可静默"——与生产链路不符）：
backend\app\services\llm_client.py:534  ⚠️ VS28 更正（原文为"事件通道与返回值同源，两条都不静默"）：事件只到 sink，
```
（与实现者 §3.1 所述一致；评估者独立 grep 复核。）

**(b) `API_CONTRACT.md` 的描述逐条与可观测行为核对：**

| 文档写的 | 真的吗 | 评估者的独立证据 |
|---|---|---|
| `done.truncated_by_deadline` 会下发 | ✅ | 自建 sink 探针的 `done` 载荷含 `"truncated_by_deadline": true` |
| 它有消费方（`Chat.tsx` 读 → `ChatMessageBubble` 渲染持久警示条） | ✅ | 代码 grep `Chat.tsx:297` / `ChatMessageBubble.tsx:67`；副本 E1 渲染命中 |
| `GET .../messages` 每条助手消息也带该字段（用写入端**同一常量**判定） | ✅ | 自建 Python 探针：真实库→真实 handler→字段为 `True`；文档也**如实交代**了"由正文反推"这一机制，未谎称有结构化列 |
| `tool_loop_truncated` **不外发**，本表不承诺它 | ✅ | **自建探针**：替身向 sink 发 `tool_started/tool_completed/tool_failed/tool_loop_truncated` 四事件，客户端实收序列＝`['tool_call','token','done']`，**无** `tool_loop_truncated` |
| SSE 事件表只列 `tool_call`/`token`/`done`/`error` | ✅ | 与 `chat.py:199` 白名单（仅 `tool_completed`）一致，无多余承诺 |

> **本卡的全部意义（"不允许声明了却没有消费方"）已达成**：VS-23 时该字段在 frontend **零命中**，现为
> "写入端(`Chat.tsx:297`) → 渲染端(`ChatMessageBubble.tsx:67`) → 文案(zh/en 双写) → 回放端(后端回填)"**四段齐全**，
> 且回放一段有**真实后端**证据。**不存在**新的孤儿契约（实现者刻意**未**转发 `tool_loop_truncated`，故没有增加第三条无人消费的通道）。

## 4. ⚠️ 首要质疑点：**回放字段由落库正文反推**（实现者 §7-1 交判）—— 逐条攻击

评估者按卡内要求**实际构造**了三种攻击，结论如下（探针原始输出见 §8）。

**① 用户正文/模型正文恰好包含该提示文案——会不会被误标？**
- **用户正文**：**不会**。`chat.py:128` 有 `row.get("role") == "assistant"` 前置守卫；评估者实测：`role='user'` 且内容以提示语开头（含"仅提示语"这一极端形态）⇒ 均判 `False`。**反例断言真的能挡住 user 消息。**
- **助手正文合法地以提示语开头**：**会误标**。评估者构造 assistant 行 `"（因超过总时长上限提前结束…）\n\n（上面这句是用户让我复述的提示语）"` ⇒ `truncated_by_deadline=True`（**假阳性**，实测）。可达路径：用户让模型复述/翻译该提示语、或模型续写时复刻上一条的提示前缀。
- 范围：仅**回放/刷新**路径受影响；**实时**路径由结构化字段 `done.truncated_by_deadline` 驱动，**不受**此反推影响。

**② 正文只剩提示 / 提示被用户编辑或清空——判据是否仍成立？**
- **只剩提示**：判据**仍成立且正确**。写入端 `full = NOTICE if not full else f"{NOTICE}\n\n{full}"`；实测该形态 ⇒ `True`（真截断，非误报）。
- **被编辑/清空**：**不可达**。`backend/app` 全仓 **无任何 `UPDATE messages`**（grep 零命中），路由层只提供会话级 PUT（标题/角色/模型），**没有消息编辑/删除接口**。故"用户改写正文使反推失效"这一疑点在本仓库**不成立**。
- **反向漏报**：不存在。写入端只要截断就必然前置该常量，读取端 `startswith` 必然命中 ⇒ **只会多报、不会漏报**。

**③ 是否只作用于 assistant 角色？** 是（见 ①），且**讨论侧不受污染**：`discussion_orch.py:105` 落库 `role='agent'`，
被角色守卫排除；评估者 E5 另行断言 `agent/system/user` 行即使带 `true` 也**不渲染**提示条。

### 裁定：**残余风险可接受，不是设计缺陷**（记入待办，不阻塞 ACCEPT）

理由（四条，按权重）：

1. **本卡明令禁止改 schema**，而 `messages` 表**确无**结构化列（评估者已核 `database.py:52-62`，且确认不存在同名列会被 `SELECT *` 覆盖）。在"必须有回放字段"＋"不得加列"的约束下，正文反推是**唯一**可实现路径；实现者已把常量**单点化**（`chat.py:34`）并让写入/读取**共用**它。
2. **失效方向是保守的**：只可能"把没被截断的说成被截断"（多一条警示），**不可能**隐藏一次真实截断。相对 VS-23 的"用户完全不知道被截断"，这是**严格改善**。
3. **触发条件是窄的**：必须是**助手**消息、且正文**以那 23 个字符开头**；日常问答几乎不会自发产生该前缀。评估者已实测该路径可达（非"理论上"），但**未观察到**自然触发场景。
4. **主判据仍是结构化的**：用户生成后当场看到的提示走 `done.truncated_by_deadline`（机器字段）；反推**只**服务"刷新回看"这一补充场景。

**建议（不阻塞，供编排者择机开卡）**：给 `messages` 加一列 `truncated_by_deadline INTEGER`（写入端随截断置 1，
读取端直读），可**彻底**消除该反推；若暂不加列，可**收紧判据**为与写入端**逐字同形**——
`content == NOTICE or content.startswith(NOTICE + "\n\n")`——以排除"以提示语开头但形状不同"的误标
（**须诚实说明**：该收紧**不能**消除"模型完整复刻该句"这一类假阳性，只是收窄）。

## 5. 零回归

| 项 | 结果 |
|---|---|
| **VS-23 正文前缀提示逐字未变** | ✅ 评估者用脚本比对：新常量与 `3109b6e~1:chat.py` 原字面量 `IDENTICAL`（长度均 23） |
| 既有 chat SSE 契约（`token`/`tool_call`/`done` 既有字段） | ✅ 自建 sink 探针实测序列仍为 `tool_call/token/done`；`done` 只**新增**原有字段，未删改 |
| 前端既有 chat 测试 | ✅ **默认 5s 超时**下 6 文件 **41 passed**（`ChatMessageBubble`/`ChatBacktestRedirect`/`ChatSessionDeepLink`/`ChatStarterDraft`/`ListFailureNotEmptiness`/`I18n`），本轮**未出现**抖动红 |
| 未加依赖 / 未改 schema / 未删文件 | ✅ 受验提交 11 个文件均无 `package.json`、`database.py` |
| 讨论侧不受影响 | ✅ E5 角色守卫 |

> 关于实现者 §5.3 的 `--testTimeout=30000`：评估者在**默认超时**下独立复跑同一批文件即全绿，
> **不需要**抬高超时；本机本轮亦未复现 `Test timed out in 5000ms`。实现者所述抖动评估者**未复现**，
> 但其垫高超时的做法**未削弱任何断言**（评估者已逐条读过其用例），故不构成问题。

## 6. 鉴别力证明（卡内验收 6）

变异**只在 `$env:TEMP` 副本**中进行（真实仓库零改动），前后 SHA256 比对确认还原：

- 真实态 `Chat.tsx` = `C9FD49AB…D04E`，`ChatMessageBubble.tsx` = `F97F8F5E…A9099`
- **M1**：删掉 `Chat.tsx:297` 的接线行 `truncated_by_deadline: resolveTruncatedByDeadline(...)`（＝"去掉新接线"）
- **M2**：`ChatMessageBubble.tsx:67` 条件改为 `false`（＝卡内举例）

| 阶段 | 退出码 | 结果 |
|---|---|---|
| STAGE1 基线（未变异副本） | 0 | 11 passed（评估者 6 + 实现者 5） |
| **STAGE2 M1 去掉 Chat.tsx 接线** | **1** | 实现者①**红** + 评估者 E1**红**；两处回放用例**仍绿** |
| **STAGE3 M2 渲染条件永假** | **1** | 实现者①②**红** + 评估者 E1/E2**红**；负向用例按设计仍绿 |
| STAGE4 还原后 | 0 | 11 passed，SHA256 与真实态**逐一相同** |

**M1 原始失败输出（节选）**：

```
FAIL tests/ChatDeadlineSignal.test.tsx > …> 实时：done.truncated_by_deadline=true ⇒ 屏上出现提示，且流结束后仍在消息上
TestingLibraryElementError: Unable to find an element by: [data-testid="chat-truncated-by-deadline"]
 ❯ tests/ChatDeadlineSignal.test.tsx (5 tests | 1 failed)
     × 实时：…  × 回放：…
 ❯ tests/EvalVs28Independent.test.tsx (6 tests | 1 failed)
     × E1 实时：提示渲染成 DOM 节点…
     ✓ E2 刷新/回放…
```

> 评估者的 M1 **比卡内举例更强**：卡内建议改渲染条件（M2），评估者另外**直接摘掉 `Chat.tsx` 的接线**——
> 证明"消费方真的存在"而非"组件刚好会渲染"。两个变异均至少一条新用例变红，**卡内验收 6 满足**。

## 7. 门禁（评估者原始输出）

```
# 后端聚焦 pytest（$env:no_proxy='localhost,127.0.0.1,::1'，未跑全量 / 未跑 test_api.py）
$ .venv\Scripts\python.exe -m pytest tests/test_chat_tools.py tests/test_llm_client.py -q --no-cov -p no:cacheprovider
..........................................................................  [100%]
74 passed in 1.87s                                    EXIT=0

$ .venv\Scripts\python.exe -m ruff check .
All checks passed!                                    EXIT=0

# 前端既有 chat 测试（默认 5s 超时，未垫高）
$ bun run test tests/ChatMessageBubble.test.tsx tests/ChatBacktestRedirect.test.tsx \
    tests/ChatSessionDeepLink.test.tsx tests/ChatStarterDraft.test.tsx \
    tests/ListFailureNotEmptiness.test.tsx tests/I18n.test.tsx
 Test Files  6 passed (6)
      Tests  41 passed (41)
   Duration  111.42s                                  EXIT=0

# 前端 build（串行，无并发任务）
$ bun run build
✓ built in 37.83s                                     EXIT=0
```

## 8. 评估者自建探针原始输出（节选）

```
# eval_vs28_backend.py —— 真实库 + 真实 list_messages
PASS | 截断行(notice+正文) -> True
PASS | 正文只剩 notice -> True
PASS | 正常回答 -> False
PASS | 用户行(notice 开头) -> False
PASS | 用户行(仅 notice) -> False
FAIL | [攻击] 助手正文合法地以提示语开头 -> 期望 False（实际误标） | got=True want=False   ← 假阳性，已实测确认
PASS | 提示语在正文中间 -> False
PASS | 空正文 -> False
PASS | 纯空白正文 -> False
PASS | 字段恒为布尔 True/False（无 None）
  端到端事件: ['token', 'done']   落库助手内容: '（因超过总时长上限提前结束，以下为已完成部分）'
PASS | 截断且正文为空 -> 落库恰好是 notice
PASS | 端到端回放标记 -> True

# eval_vs28_sink.py —— 替身主动发 4 种事件，看客户端到底收到什么
替身向 sink 发出的事件: ['tool_started', 'tool_completed', 'tool_failed', 'tool_loop_truncated']
客户端实际收到的事件序列: ['tool_call', 'token', 'done']
PASS: sink 白名单确实只放行 tool_completed
PASS: done.truncated_by_deadline = True
```

## 9. NIT / 建议（**均不阻塞 ACCEPT**）

- **NIT-1（低）｜`llm_client.py:132`、`:534` 保留了被更正的**原文引文**。评估者逐条读上下文，它们是
  `⚠️ VS28 更正（原文为"…"）` 的引文，**不是主张**，故不违反卡内验收 3。但**字面 grep 旧句仍会命中**——
  本仓刚发生过"注释与事实不符"引出整张卡（VS-23→D5），保留原文有被后续审计**再次误报**的成本。
  建议：改为"原文已删除（见 `git show 3109b6e~1`）"，不复述旧句。**纯文案，零行为影响。**
- **NIT-2（低，**归编排者**，不在受验提交内）｜`docs/ai/evo/PRODUCT_GAP_MAP.md:204` 被后续提交（`22accf4`）
  就地更正时**留下了悬空尾句**：前半已写"已由 VS-28 接上真实消费方…"，句尾却仍是
  "（编排者独立 grep：frontend 全库零命中）⇒ **用户实际只看到正文前缀**"——**尾句现为假**，与前半自相矛盾。
  建议删掉悬空尾句。同文件 `:196`/`:214` 与 `PRODUCT_UX_REPORT_R5.md:179`、`PROJECT_BRIEF.md:72` 把
  "三通道一致性"列为**待验证议题**（非事实主张），评估者认为**可保留**，但可在下一轮统一加"已由 VS-28 关闭"标注。
- **FUP-1（建议开卡）｜加结构化列**以取代 §4 的正文反推（详见 §4 建议）。

## 10. 判定与理由（一句话）

**ACCEPT**：方案 A 真的落地——`done.truncated_by_deadline` 现在有**真实消费方**（`Chat.tsx:297` → `ChatMessageBubble.tsx:67`
的持久警示条），**刷新/回放**后仍看得见（1 由前端渲染断言 + 1 由**真实后端**探针分别证实），未截断的两种形态
（`false` / **缺字段**）**都**不出现提示；`backend/app` 与 `API_CONTRACT.md` 的说法与可观测行为一致，
`tool_loop_truncated` 经自建探针证实**确不外发**；去掉接线（M1）⇒ 新用例必然变红，还原后 SHA256 与交付态相同。
唯一实质发现是**"回放字段由落库正文反推"存在一条已实测可达的假阳性路径**（助手正文合法地以提示语开头 ⇒ 被误标），
评估者判为**残余风险可接受**（本卡禁改 schema、失效方向保守、仅影响回放、只作用于 assistant 角色），
并给出"加列"这一彻底升级路径与"逐字同形收紧"这一折中方案。
