# IMPLEMENT RESULT — VS28：让 chat 的"整轮截断"信号真的有消费方

> 基线：开始前 `git status --porcelain` 为空（工作树干净）。**未 commit。**
> 注意：作业期间仓库被编排者推进到 `6ee76f7`，且 `docs/ai/evo/IMPLEMENT_RESULT_VS26.md` / `docs/ai/evo/PRODUCT_STATE.md` 有**其他 agent 的在途改动**（非本卡），我**未触碰**。

## 0. 选定方案：**A（接线）**

**选 A 的理由（三条，按权重）**

1. **本卡的名字就是"让信号真的有消费方"。** 任务卡标题为《…让 chat 的"整轮截断"信号真的有消费方（或如实改正说法）》，方案 B 是**回落**而非首选；卡内也明说"本卡要的是诚实，不是非要加功能"——即 B 也是**诚实的一种**，但只有在 A 不划算时才选它。
2. **A 的成本已经被 VS-27 验证过、且很小。** 研究侧刚用同一手法（`resolveTruncatedByDeadline` + 可见 `Alert`）落地过一遍，模式、i18n 双写、测试写法都可直接对照。本卡明确要求"可对照其做法（但不要去改研究侧代码）"——我确实**没有**改 `Research.tsx`（见 §1 与 `git diff --stat`）。
3. **只做 B 会留一个已知的"孤儿契约"**：`done.truncated_by_deadline` 是**已经发出、已经写进 API 文档**的机器契约，删不掉（"不能破坏既有字段"）。若只改注释，它就永远是"有契约、无读者"。A 用最小接线把它变成"有读者"，且**不新增任何字段、不改 schema、不加依赖**。

**A 的边界（我刻意没做的事）**：**没有**转发 `tool_loop_truncated` 事件。转发会造出**第三条通道**，而前端若要消费它，就等于把"截断"这件事渲染两遍；若不消费，就又是一条"声明了没消费方"的通道——正是本卡要消灭的形态。所以事件通道保持**不外发**，并把 `llm_client.py` 里"事件通道同样显式"的说法**改正**（A 与 B 都需要的动作，一并做了）。

---

## 1. 改动清单（文件:行）

### 后端

| 文件:行 | 改动 |
|---|---|
| `backend/app/routers/chat.py:36-42` | 新增模块级常量 `DEADLINE_TRUNCATION_NOTICE` + 判据 `_marked_truncated()`。写入端（正文前缀）与读取端（历史回放）**共用同一常量**——这是"同源"的落点。 |
| `backend/app/routers/chat.py:121-131` | `GET /chat/sessions/{id}/messages`：每条 `assistant` 行回填 `truncated_by_deadline`（**只对 assistant 判定**，用户自己打出同一句话不会被标成"被截断"）。 |
| `backend/app/routers/chat.py:193-198` | `_event_sink` 注释澄清：白名单**刻意只放行 `tool_completed`**，`tool_loop_truncated` 不等客户端；并写明"用户可见通道只有两条且都已接线"。 |
| `backend/app/routers/chat.py:218-223` | 截断分支改用共享常量（**文案逐字不变**），注释同步为两通道口径。 |
| `backend/app/services/llm_client.py:131-136` | **改正原文**"使'提前结束'在**事件通道**上同样显式、不可静默"（与生产链路不符）。 |
| `backend/app/services/llm_client.py:533-538` | **改正原文**"事件通道与返回值同源，两条都不静默"。 |
| `backend/tests/test_chat_tools.py:270-335` | 新增 2 条用例（回放字段 + 未截断反例 + 用户消息不被误标）。 |

### 前端

| 文件:行 | 改动 |
|---|---|
| `frontend/src/types/index.ts:315-321` | `Message.truncated_by_deadline?: boolean`（可选 ⇒ 对 Discussion 等既有用法零影响）。 |
| `frontend/src/pages/Chat.tsx:32` | SSE 载荷类型加 `truncated_by_deadline`。 |
| `frontend/src/pages/Chat.tsx:35-46` | **唯一读取点** `resolveTruncatedByDeadline()`（与 VS-27 同口径：只有显式 `true` 才算截断）。 |
| `frontend/src/pages/Chat.tsx:295-297` | `done` 到达时写入消息对象——**这就是"消费方"**。 |
| `frontend/src/components/ChatMessageBubble.tsx:2, 63-75` | 渲染持久警示条（`role="status"`、`data-testid="chat-truncated-by-deadline"`）。 |
| `frontend/src/i18n/zh.ts:1864-1866` / `en.ts:1865-1867` | i18n 双写 `chat.truncatedByDeadline`。 |
| `frontend/tests/ChatDeadlineSignal.test.tsx`（新增） | 5 条用例（见 §4/§5）。 |

### 文档

| 文件:行 | 改动 |
|---|---|
| `docs/API_CONTRACT.md:25-29` | 在 `62acc50` 的既有文本上**增补**（未推倒重写）：写明 `done.truncated_by_deadline` 的**消费方是谁、在哪里**；`GET .../messages` 回放同源；并**显式声明 `tool_loop_truncated` 不外发、本表不承诺它**。 |
| `docs/API_CONTRACT.md:143` | GET messages 行标注返回 `truncated_by_deadline`。 |

**未改**：`frontend/src/pages/Research.tsx`（研究侧）——`git diff --stat` 中不含它。

---

## 2. "用户确实能看到 + 提示是持久的"实测证据

**能看到的证据不是推理，是渲染断言**（`frontend/tests/ChatDeadlineSignal.test.tsx`）：

```
 ✓ tests/ChatDeadlineSignal.test.tsx (5 tests) 5093ms
     ✓ 实时：done.truncated_by_deadline=true ⇒ 屏上出现提示，且流结束后仍在消息上  3191ms
     ✓ 回放：重新加载会话（GET messages 带同一字段）⇒ 用户回看时仍看得见提示  570ms
     ✓ 未截断：done 明确为 false ⇒ 不得出现任何"被截断"提示  902ms
     ✓ 回放：历史消息缺该字段（旧数据）⇒ 同样不得误报  419ms
     ✓ 只有显式 true 才算截断；false / 缺字段 / 非布尔一律不算
 Test Files  1 passed (1)
      Tests  5 passed (5)
```

断言的是 **DOM 节点**（`getByTestId('chat-truncated-by-deadline')` + `getByText(t('chat.truncatedByDeadline'))`），不是"字段被读到了"。

**"持久"分两层，都实测了（这是本卡最容易做成假的地方，我按最严口径做的）**：

1. **流结束后仍在**（不是 toast、不是流式气泡）：用例①在 `done` 之后断言 `isStreaming === false`、流式气泡文案（`chatBubble.typing`）已消失，**而提示节点仍在**。它是"消息对象上的一个属性"，挂在消息本体上。
2. **刷新/重新加载会话后仍在**：用例②不跑 SSE，直接走 `GET /chat/sessions/{id}/messages` 的返回（历史行带同一字段）⇒ 提示照常出现。**用户回看时知道这条回答被截断过。**

> **实现细节（诚实交代）**：`messages` 表**没有**结构化标记列，而本卡禁止改 schema，所以"回放"这一层的字段由后端从**落库正文**用**写入端同一个常量**（`DEADLINE_TRUNCATION_NOTICE`）反推。它不是两条各自为政的路径：常量只有一份，写在 `chat.py:36`，写入（`chat.py:223`）与读取（`chat.py:127`）都用它。同时**限定了作用域**：只对 `role='assistant'` 判定，并有专门断言（用户消息以同一句提示词开头 ⇒ 仍为 `False`）。
> 这与仓库既有的 `Research.tsx:154 FAILURE_SENTINEL`（"历史兜底哨兵，仅用于没有结构化状态的旧报告，不得作为主判据"）是同一形态；这里**主判据仍是结构化的 `done.truncated_by_deadline`**，反推只用于回放。**风险见 §7-1，我不认为它是零风险的做法，交给评估者判。**

---

## 3. grep 证据

### 3.1 与事实不符的说法已消失（`backend/app` 全量）

```
$ grep -rn '事件通道|三通道' backend/app
backend\app\routers\chat.py:220:  # 两条，二者共用同一常量、与落库内容同源；事件通道不外发（见 _event_sink 注释）。
backend\app\services\llm_client.py:132:  # ⚠️ VS28 更正（原文为"使'提前结束'在**事件通道**上同样显式、不可静默"——与生产链路不符）：
backend\app\services\llm_client.py:534:  ⚠️ VS28 更正（原文为"事件通道与返回值同源，两条都不静默"）：事件只到 sink，
```

**逐条读上下文**：3 处命中**全部是"不外发/已更正"的表述**，其中 2 处把旧说法作为**被更正的引文**保留（`⚠️ VS28 更正（原文为…）`）。**没有任何一处再宣称该通道存在。** 原 `llm_client.py:521-522` 的断言（"事件通道同样显式"）已被替换为明确的"事件只到 sink、聊天 SSE 看不到它"。

> 若评估者用**字面** grep `事件通道同样显式`，会命中 `llm_client.py:132` 的**引文**。那是更正的引文，不是主张——我**故意**保留原文以便对照（§7-3 记了这一点，若评估者认为该引文本身有害，删掉引号内原文即可，不影响任何代码）。

### 3.2 消费方真的存在（`frontend/src`）

```
$ grep -rn 'truncated_by_deadline|truncatedByDeadline|resolveTruncatedByDeadline' frontend/src
frontend\src\types\index.ts:321:  truncated_by_deadline?: boolean;
frontend\src\pages\Chat.tsx:43: export function resolveTruncatedByDeadline(value: unknown): boolean {
frontend\src\pages\Chat.tsx:297:  truncated_by_deadline: resolveTruncatedByDeadline(data.truncated_by_deadline),
frontend\src\components\ChatMessageBubble.tsx:67: {message.role === 'assistant' && message.truncated_by_deadline === true ? (
frontend\src\components\ChatMessageBubble.tsx:72:  message={t('chat.truncatedByDeadline')}
frontend\src\i18n\zh.ts:1866: 'chat.truncatedByDeadline': '⏱ 这条回答因超过总时长上限提前结束…'
frontend\src\i18n\en.ts:1867: 'chat.truncatedByDeadline': '⏱ This answer ended early because…'
（另有 Research.tsx 的 VS-27 命中，本轮未改）
```

VS-23 时该 grep 的结果是"零命中"；现在**从"读入"到"渲染"到"文案"三段齐全**。

### 3.3 `API_CONTRACT.md` 与实际可观测行为一致（验收标准 4）

```
$ grep -n 'tool_loop_truncated|truncated_by_deadline|不外发' docs/API_CONTRACT.md
:22  | `done` | {… "truncated_by_deadline": false …}          ← 真的会被下发（chat.py:231-238）
:25  整轮截止（VS-23；消费方于 VS-28 补齐）：两条用户可见通道，均已接线
:27  > done.truncated_by_deadline 的消费方：Chat.tsx 读 → ChatMessageBubble 渲染持久警示条
:29  > tool_loop_truncated 不外发：sink 只放行 tool_completed；本表不承诺它
:143 GET messages 行：每条助手消息带 truncated_by_deadline
```

**"描述存在 ⇒ 必须真能被收到/被消费"逐条对照**：

| 契约里写的 | 真的吗 | 证据 |
|---|---|---|
| `done.truncated_by_deadline` 会下发 | ✅ | `test_chat_surfaces_deadline_truncation_explicitly`（断言 `done["truncated_by_deadline"] is True`） |
| 它有消费方 | ✅ | 前端用例①（SSE 路径渲染出提示节点） |
| 历史消息也带该字段 | ✅ | `test_chat_history_replays_deadline_truncation_mark` + 前端用例② |
| `tool_loop_truncated` **不外发** | ✅ | 白名单 `chat.py:199` 只放行 `tool_completed`；VS-23/VS-27 实测客户端序列只有 `token,tool_call,done` |
| SSE 事件表只列 `tool_call`/`token`/`done`/`error` | ✅ | 与白名单一致，无多余承诺 |

**`api_contract` 里没有"写了却收不到"的项。** 反之，代码里也不再宣称客户端收不到的东西。

### 3.4 仓库其余位置（**如实列出，含我未改的**）

| 文件 | 形态 | 我的处置 |
|---|---|---|
| `docs/ai/evo/IMPLEMENT_RESULT_VS23.md:11,22` | **历史档案**：记录 VS-23 当时"追加事件=事件通道同样显式"的**说法** | **未改**。改写历史档案=伪造记录；该说法已被 R5 审计与 VS-28 更正，档案本身就是证据链的一环。 |
| `docs/ai/evo/EVALUATION_RESULT_VS23.md:69,144-147` | VS-23 评估：§3.2 曾写"三通道同源"，但 **NIT-2 已自行更正**为"SSE 里看不到" | **未改**（自洽，且属历史） |
| `docs/ai/evo/RELIABILITY_REPORT_R5.md` | **发现该缺陷的审计报告** | **未改**（它正是依据） |
| `docs/ai/evo/PRODUCT_GAP_MAP.md:170,204` | **现役状态文档**：仍写"🟠 三通道实为一通道 / `done.truncated_by_deadline` 前端零消费方" | **未改，需编排者更新**（见 §6-2）——它与 `PRODUCT_STATE.md` 同属编排者维护的状态文档，且此刻**正被其他 agent 在途修改**，我贸然改会撞车。 |
| `docs/ai/evo/IMPLEMENTATION_BRIEF_VS27.md:21`、`PROJECT_BRIEF.md:72`、`PRODUCT_UX_REPORT_R5.md:179` | 把"三通道一致性"作为**待验证议题/反面教材**提及 | **未改**，它们**没有**宣称通道存在（属正确的表述）。 |

---

## 4. 边界用例（本卡硬要求）

| 边界 | 断言 | 结果 |
|---|---|---|
| **截断恰在成功之后才越界 ⇒ 按正常完成、不得误报** | 后端 `test_vs23_deadline_crossed_after_successful_call_is_reported_as_completed`（`test_llm_client.py:953`）+ `test_chat_does_not_mark_normal_completion_as_truncated` | ✅ 全绿（见 §5） |
| **未截断 ⇒ 前端不得出现任何"被截断"提示** | 前端用例③：`done.truncated_by_deadline=false` ⇒ `queryByTestId(...)` 为 `null` **且** `queryByText(t('chat.truncatedByDeadline'))` 为 `null` | ✅ 通过 |
| **历史数据缺字段 ⇒ 不得误报** | 前端用例④（回放不带该字段）+ 后端 `test_chat_history_does_not_mark_normal_completion` | ✅ 通过 |
| **用户自己打出同一句提示词 ⇒ 不得被标成被截断** | 后端 `test_chat_history_replays_deadline_truncation_mark` 内（`role='user'` 行断言 `False`） | ✅ 通过 |
| **非法值不误报** | 前端 `resolveTruncatedByDeadline('true') / 1 / null` ⇒ 全 `false` | ✅ 通过 |

---

## 5. 门禁原始输出

### 5.1 后端聚焦 pytest

```
$ $env:no_proxy='localhost,127.0.0.1,::1'; .venv\Scripts\python.exe -m pytest tests/test_chat_tools.py -q --no-cov -p no:cacheprovider
.......                                                                          [100%]
7 passed in 31.81s
EXIT=0
```

```
$ … -m pytest tests/test_llm_client.py -q --no-cov -p no:cacheprovider
...................................................................              [100%]
67 passed in 3.23s
EXIT=0
```

> `--no-cov` 的理由：仓内 `pytest` 配了 `--cov-fail-under=80`，只跑聚焦文件时覆盖率必然低于 80（首次运行输出 `FAIL Required test coverage of 80.0% not reached. Total coverage: 9.89%` / `7 passed`），**这是配置噪声不是测试失败**；加 `--no-cov` 后退出码才真实反映用例结果。**未跑** `tests/test_api.py`，**未跑**全量 pytest（环境铁律）。

### 5.2 后端 ruff

```
$ .venv\Scripts\python.exe -m ruff check .
All checks passed!
EXIT=0
```

### 5.3 前端 vitest（chat 相关 7 个文件）

```
$ bun run test --testTimeout=30000 tests/ChatDeadlineSignal.test.tsx tests/ChatMessageBubble.test.tsx \
    tests/ChatBacktestRedirect.test.tsx tests/ChatSessionDeepLink.test.tsx tests/ChatStarterDraft.test.tsx \
    tests/ListFailureNotEmptiness.test.tsx tests/I18n.test.tsx
 Test Files  7 passed (7)
      Tests  46 passed (46)
   Duration  209.57s (transform 2.78s, setup 4.86s, import 151.78s, tests 28.98s, environment 19.94s)
EXIT=0
```

> **如实交代 `--testTimeout=30000`**：默认 5s 下，同一批文件在本机出现过**随机某一文件的第 1 条用例**超时（先后命中 `ChatStarterDraft:9`、`ListFailureNotEmptiness:84`、`ChatSessionDeepLink:73`，均为 `Error: Test timed out in 5000ms`，同批 `import` 高达 **121–162 秒**）。我按卡内"零回归"要求做了对照：
> - **改动前（路径限定 `git stash` 回 `HEAD`）单跑 `ListFailureNotEmptiness` ⇒ 14 passed**；
> - **改动后单跑同一文件 ⇒ 14 passed**；
> - 说明超时是**本机负载抖动**（我自己并发跑了后端 pytest 时最明显），**不是本卡的回归**。抬高 per-test 超时只是让这 46 条能在同一批内跑完，**没有放宽任何断言**。
> ⚠️ **变异/还原窗口**：上述 stash 期间（约 1 分钟）我的 7 个文件临时回到 `HEAD`，随后 `git stash pop` 已还原（`git status` 复核通过）。

### 5.4 前端串行 build

```
$ bun run build          # prebuild=openapi_tsgen --check → tsc -b → vite build
✓ built in 45.26s
EXIT=0
```

---

## 6. 鉴别力证明（选 A 必做）

> **⚠️ 变异窗口声明**：约 1 分钟内 `frontend/src/components/ChatMessageBubble.tsx` 含**故意缺陷**，验完立即还原。

**变异**：把新接线的条件改成永假 —— `{message.role === 'assistant' && message.truncated_by_deadline === true ? (` → `{false && …`（等价于"去掉新接线"，其余代码不动）。

```
$ bun run test --testTimeout=30000 tests/ChatDeadlineSignal.test.tsx
 ❯ tests/ChatDeadlineSignal.test.tsx (5 tests | 2 failed) 14240ms
     × 实时：done.truncated_by_deadline=true ⇒ 屏上出现提示，且流结束后仍在消息上   10158ms
     × 回放：重新加载会话（GET messages 带同一字段）⇒ 用户回看时仍看得见提示        1742ms
     ✓ 未截断：done 明确为 false ⇒ 不得出现任何"被截断"提示
     ✓ 回放：历史消息缺该字段（旧数据）⇒ 同样不得误报
     ✓ 只有显式 true 才算截断；false / 缺字段 / 非布尔一律不算
 FAIL … Unable to find an element by: [data-testid="chat-truncated-by-deadline"]
 Test Files  1 failed (1)
      Tests  2 failed | 3 passed (5)
```

⇒ **去掉接线后 2 条新用例变红**（且失败原因是"找不到提示节点"，正是"用户看不到"的机械证据）。另外 3 条是**负向**用例（断言"不得出现"），按设计必然保持绿——它们的作用是防误报，不是防漏接。

**还原复核**：`Select-String -Pattern 'false &&|TEMP-REPRO|MUTATED|XXX-TEMP' ChatMessageBubble.tsx` ⇒ **无命中**（退出码 1）；随后 §5.3 的 7 文件全量复跑 **46 passed** ⇒ 还原态与交付态一致。

> **与卡内措辞的偏差（如实说明）**：卡里写的是"从**副本**去掉新接线"。我做的是**原地变异 + 声明窗口 + 还原复核**，而非复制整棵 `frontend`（需要连带复制 `node_modules`，本轮预算不够）。**若评估者认为必须用副本，请把这一项视为"未按指定方式做"**——但红/绿的鉴别力证据本身是真跑出来的。

---

## 7. 未验证 / 未做 / 风险（如实）

1. **【风险·中】回放字段由正文反推**：`messages` 表无结构化列且本卡禁止改 schema，故 `GET .../messages` 的 `truncated_by_deadline` 是**从落库正文前缀反推**的（写入/读取共用 `chat.py:36` 同一常量，且只对 `assistant` 判定）。
   - 残余风险：若将来有人**改动前缀文案却只改一处**（例如绕过常量直接写字面量），回放判定会静默失效；若模型自发输出该句开头，理论上会误标（未构造该场景，**未验证**）。
   - 缓解：常量已单点化；反例（用户消息）已有断言。**若评估者认为该反推不可接受，正确的替代是加一列 `messages.truncated_by_deadline`（需改 schema，超出本卡授权）。**
2. **【需编排者处理】现役状态文档尚未同步**：`docs/ai/evo/PRODUCT_GAP_MAP.md:170` 与 `:204` 仍把"三通道实为一通道 / 该字段前端零消费方"记为 🟠 问题；`PRODUCT_STATE.md` 亦可能有对应条目。**我未改**（该文件此刻正被其他 agent 在途修改，且属编排者维护的状态文档）。**验收前应据此更新，否则本卡"全仓说法一致"仍差这一步。**
3. **【刻意保留】更正引文仍含旧句子**：`llm_client.py:132/534` 引用原文以便对照。字面 grep 旧句会命中，但上下文是 `⚠️ VS28 更正`。若评估者要求"字面也不再出现"，删掉引号内文字即可（**不影响任何行为**）。
4. **【未验证】真实浏览器端到端**：所有"用户能看到"的证据均来自 **jsdom 渲染断言**，**没有**起 dev server 用真人点一遍，**也没有**跑 `frontend/e2e`（Playwright）。渲染断言已覆盖"节点出现在 DOM 且带 `chat.truncatedByDeadline` 文案"，但"观感是否足够显眼"**未验证**。
5. **【未验证】真实 600s 截止的端到端**：未真的触发一次 600 秒整轮截止（不可行/不必）；前后端用例都用**注入的确定性夹具**驱动 `truncated_by_deadline=true`。
6. **【未做】`:300` 附近新增的 `data-testid` 是否与设计系统有冲突**：`Alert` 直接用了 antd 默认样式（与 VS-27 研究侧一致），**未做视觉走查**。
7. **【非本卡】工作树中存在他人改动**：`docs/ai/evo/PRODUCT_STATE.md`、`docs/ai/evo/IMPLEMENT_RESULT_VS26.md` 在我作业期间被其他 agent 修改。**提交时请只 `git add` 本卡路径**（§1 列出的 10 个文件 + 1 个新增测试 + 本结果文件），不要 `git add .`。

---

## 8. 一句话结论

**选了 A（接线）**：`done.truncated_by_deadline` 现在**真的**有消费方（前端渲染持久警示条），且**回放（刷新/回看）时同样看得见**；**未截断的运行在前端不出现任何"被截断"提示**（有专门断言），"截断恰在成功之后越界"仍按正常完成（VS-23 原用例全绿）。
