# EVALUATION_RESULT — VS20（独立验收）

- 被验提交：`c1a469d`（VS-20：降级/失败状态结构化，实时与回放同源且不再依赖字符串哨兵）
- 评判者：独立 Evaluator（**未采信实现者自述**，全部结论由自身复跑/自造夹具得出）
- 结论：**ACCEPT**（无 REJECT 项；文末列 3 条非阻塞 NIT）
- 验收时工作树状态：被验的两个文件 `frontend/src/pages/Research.tsx`、`backend/app/services/research_orch.py` 与 `c1a469d` **逐字一致**（`git status` 仅显示 VS-23 在途文件），故所有复跑都是在**已提交内容**上进行的，不是变异窗口内的瞬间态。

---

## 0. 判定摘要（对应任务卡的 5 项必做核对 + 5 项重点质疑）

| 核对项 | 结论 | 独立证据 |
|---|---|---|
| 1 后端结构化接线 | ✔ 真接线 | `_agent_result()` 在 `research_orch.py:423/444/509` 三处**实际被调用**；`agent_results[key]` 带 `status`；失败带 `error`（`:385`、`:449`、`:514`）；降级带 `degraded_reasons`（`:409`、`:515`）；主编失败写 `status=failed`（`:499-500`）；`done_payload` 原样透传（`:559` `{k: dict(v)}`） |
| 2 回放判据改结构化 | ✔ | `Research.tsx:451` 调 `deriveAgentOutcomes(report.agent_results, report.events)`；顺序为**结构化（`:232-246`）→ 事件（`:249-254`）→ 哨兵（`:256-258`）→ unknown（`:264`）** |
| 3 哨兵保留 | ✔ | `FAILURE_SENTINEL = '【分析失败】'`（`:138`）仍在，作为**最后一级**兜底；原 `:235` 的 `content?.startsWith(...)` 主判据已删 |
| 4 无证据不默认完成 | ✔ | 自造夹具：`deriveAgentOutcomes({}).report_lead` → `{status:'unknown'}`；回放映射 unknown→卡片 `pending`（`:459`），实测 `.agent-status-card--waiting` = 1（跑通用例 `agent_results 缺某个 key …`） |
| 5 实时/回放同源 | ✔ | 两处调用点：实时 `:594` `noticesFromOutcomes(deriveAgentOutcomes(data.agent_results, null), t)`；回放 `:451`+`:463` `noticesFromOutcomes(deriveAgentOutcomes(report.agent_results, report.events), t)`。**同一函数、同一数据源**（`done` 携带的 `agent_results` 就是 router 落库的那份，`research.py:286→403`），实时只是不额外读事件（其 `agent_results` 已带结构化状态），语义一致 |
| 6 原因展示 / 不编造 / 不塞堆栈 | ✔ | `Research.tsx:734-753` 逐条列「哪个 Agent + 失败/降级 + 原因」，无原因时 `t('deep.agent.reasonUnrecorded')` =「原因未记录」；`summarizeReason`（`:167-175`）丢弃 `Traceback`/`File "…"` 行并截断 120 字符，实测 `'Traceback…\n File "app/x.py"…\nValueError: boom'` → `'ValueError: boom'` |
| 7 i18n 一一对应 | ✔ **各 9 键，键集合完全一致** | zh.ts / en.ts 新增 9 条：`noticeTitle`、`notice.failed`、`notice.degraded`、`notice.unknown`、`reasonUnrecorded`、`reason.toolFailed`、`reason.toolLoopExhausted`、`reason.emptyContent`、`reason.outputTruncated`（`AuthUnavailable.test.tsx` 的 parity 用例 17 passed） |

---

## 1. 重点质疑独立复核

### 1.1 「矛盾输入」用例是否真在证主判据换位 —— **是**（我独立做了变异实测）

**方法**（不触碰被验文件、不在 `src/`/`tests/` 留任何东西）：用 `bun` 脚本把 **真实源码** `frontend/src/pages/Research.tsx` 的 `:137-278` 纯函数块（`FAILURE_SENTINEL` … `deriveAgentOutcomes`，脚本按标记行切分并断言切分完整）原样抽出到 `$env:TEMP\vs20eval\`，生成 3 份变体后用 `bun` 直接执行 7 个判据用例：

- `baseline` = 原文
- `M1_no_structured` = 把 `const structured = …` 改成恒 `undefined`（复现原始缺陷）
- `M2_sentinel_first` = 在 `deriveAgentOutcome` 开头插入哨兵短路返回（"两个条件或起来"的形态）

**原始结果（摘）**：

```
baseline        A 矛盾输入(status=completed + content 带哨兵) = {status:"completed"}
                B 历史兼容(只有哨兵, 无 status, events=[])    = {status:"failed", reason:"上游模型暂不可用"}
                C 结构化 failed + 空 content(主编失败)        = {status:"failed", reason:"主编模型不可用"}
                D 缺 key                                      = {status:"unknown"}
                E 结构化 degraded 无原因                       = {status:"completed", degraded:true}
                F 只有落库事件(旧实现 agent_failed→agent_completed) = {status:"failed"}
                G 结构化 degraded + tool_failed                = {status:"completed", degraded:true, degradedReasons:["tool_failed"]}

M1_no_structured  A=**failed**  C=**unknown**  E=**degraded:false**  G=**degraded:false**   （B/D/F 不变）
M2_sentinel_first A=**failed**  （B/C/D/E/F/G **全部与 baseline 逐字相同**）
```

**判读（独立结论）**：M2 下**只有 A（矛盾输入）翻红**，其余 6 例一字不变 ⇒ 该用例**确实是**在证明"主判据已从哨兵换成结构化状态"，而不是被别的东西顺带覆盖。M1 让 A/C/E/G 四例翻红，且精确复现原始缺陷（主编失败 → `unknown`／`completed`）。实现者关于 M2 的鉴别力声明**属实**（他报的是"矛盾输入"这一类 2 例红，与我的 A 类一致；差异仅在他把纯函数同名用例也算作同类）。

### 1.2 历史兼容（只有 `content` 带哨兵、无 `status/error`、`events` 为空） —— **仍显示 failed** ✔

双证据：
- 我的独立夹具（上表 B）：`deriveAgentOutcomes({business_analyst:{content:'【分析失败】上游模型暂不可用'}}, [])` → `{status:'failed', reason:'上游模型暂不可用'}`（取自**真实源码文本**，非重写实现）。
- 组件级：`ResearchReplayAgentStatus.test.tsx:124-136` 的夹具正是"该 Agent 只有 `content` 哨兵、无 `status/error`，`events` 默认 `[]`"，断言 `.agent-status-card--failed` = 1 且文案「财务分析：失败 —— 原因：上游模型暂不可用」——**实测通过**。
- 追加：`agent_results` 缺 key / 空内容且无事件 → `unknown` → 卡片 `pending`，**不默认完成**（`:459`；用例 `:181-192` 通过，`.agent-status-card--waiting` = 1）。

### 1.3 卡外修复「主编失败后仍补发 `agent_completed`」 —— 地基成立，且**不影响正常路径** ✔

- **修前确实存在**：`git show c1a469d~1:backend/app/services/research_orch.py` 中，主编 `except LLMError` 只设 `lead_content=""` 并 `yield "agent_failed"`，其后的 `yield "agent_completed", {"role_key": "report_lead", …, "length": len(lead_content)}` 位于 **try/except 之外、无任何守卫** ⇒ 主编失败时事件序列恒为 `agent_failed → agent_completed`（与实现者 §2 探针输出一致）。前端 `applyAgentEvent`（`:116-122`）会把该卡片翻回 `completed` ⇒ 实时路径自相矛盾属实。**该删除属"两路径一致"的必要条件，不判 REJECT。**
- **正常路径未受损**：新代码用 `if lead_error is None:` 守卫（`:520-527`）⇒ 成功的 Agent/主编**仍照常发 `agent_completed`**；后端 happy-path 用例断言 `[name for name,_ in events].count("agent_completed") == 5`（4 个 Agent + 主编）并**实测通过**。
- 另确认 `done_payload` 的透传是**承重的**：`git show c1a469d~1:…` 显示旧代码 `"agent_results": {k: {"name":…, "content":…, "tool_log":…} for …}` 只挑 3 个字段，而 `routers/research.py:286` 落库读的正是 `data.get("agent_results")` ⇒ 不改成 `{k: dict(v)}`（`:559`），新字段在 SSE 路径就会丢，实时与落库再次分叉。

### 1.4 降级原因是否**真的首见**（只降级、不失败的情形） —— **是** ✔

- 后端：`agent_completed` 事件新增 `status` 与 `degraded_reasons`（`research_orch.py:400-406`），且与落库的 `agent_results[key]` 同源（`:407-410`）。后端用例 `test_degraded_reasons_are_structured_in_results_and_emitted` 用**逐字比对**钉住事件载荷 `{"role_key":"risk_assessor","name":…,"length":2,"status":"degraded","degraded_reasons":["tool_failed"]}` —— 实测通过。
- 前端回放：结构化 `degraded` + 原因码 → 环节提示「财务分析：已降级（产出可能不完整）—— 原因：工具调用失败」，**且不显示原始码**（用例 `:156-167` 断言 `queryByText(/tool_failed/)` 为 null）—— 实测通过。
- 前端实时：`:557-561` 由事件 `degraded_reasons` 登记提示；**并且** `done` 到达时用落库 `agent_results` 重算（`:592-595`）⇒ 即使事件分支失效，原因仍会显示。两条独立通路，非单点。
- 无原因可记录时（主编返回不可解析散文）：后端只写 `status='degraded'`、**不生成** `degraded_reasons` / `error`（`:503-506`；后端用例断言 `"degraded_reasons" not in lead`、`"error" not in lead`），前端如实显示「原因未记录」（用例 `:169-179` 通过）——未编造。

### 1.5 未破坏的面 —— ✔

- 报告级 `quality` 横幅：`Research.tsx:724-731` 原样保留；`git diff c1a469d~1 c1a469d -- frontend/src/pages/Research.tsx` 中**没有**任何涉及 `reportToMarkdown` / `qualityDegraded` / `degradedNotice` 的新增或删除行。
- `reportToMarkdown` 渲染：`tests/ResearchReportToMarkdown.test.tsx` 12 passed。
- VS-13 两个文件：`ResearchAgentFailed.test.tsx` 6 passed、`ResearchAgentFailedWire.test.tsx` 1 passed。
- `report_builder.py` 只按 key 读 `content`（`_content`、`_adversarial`、`raw_agents`），对 `agent_results` 条目的**新增字段是加法而非破坏**；`report_data`/`agent_results` 的 JSON 落库/读回路径未改（`research.py:403/509-511`）。
- 架构面：未改 schema、未加依赖、未删文件、未改 `except`（`git show c1a469d --stat` 只有 7 个文件；`git diff` 无 `except` 相关改动）。

---

## 2. 门禁原始输出（我自己的复跑，非引用实现者）

```
> cd backend; $env:no_proxy='localhost,127.0.0.1,::1'
> .venv\Scripts\python.exe -m pytest tests/test_research_orch.py tests/test_memory.py -q --no-cov -p no:cacheprovider
...................................                        [100%]
35 passed in 14.23s

> .venv\Scripts\python.exe -m ruff check .
All checks passed!

> cd frontend; bun x vitest run tests/ResearchReplayAgentStatus.test.tsx tests/ResearchAgentFailed.test.tsx \
    tests/ResearchAgentFailedWire.test.tsx tests/ChatBacktestRedirect.test.tsx
 ✓ tests/ChatBacktestRedirect.test.tsx (8 tests) 1960ms
 ✓ tests/ResearchReplayAgentStatus.test.tsx (11 tests) 2428ms
 ✓ tests/ResearchAgentFailedWire.test.tsx (1 test) 1417ms
 ✓ tests/ResearchAgentFailed.test.tsx (6 tests) 5ms
 Test Files  4 passed (4)      Tests  26 passed (26)

> bun x vitest run tests/AuthUnavailable.test.tsx tests/ResearchReportToMarkdown.test.tsx
 ✓ tests/AuthUnavailable.test.tsx (17 tests) 1055ms
 ✓ tests/ResearchReportToMarkdown.test.tsx (12 tests) 8ms
 Test Files  2 passed (2)      Tests  29 passed (29)

> bun run build          # 在 vitest 全部结束后串行执行，未并行
✓ built in 19.28s
```

合计前端 **6 文件 55 例全绿**；`tsc -b` 包含在 build 中通过。**本次未出现 vitest forks worker 超时**（无需记环境噪声）。后台 `pytest` 已正常退出，收尾核对无遗留 `-m pytest` 孤儿进程。

---

## 3. 非阻塞 NIT（不影响 ACCEPT）

1. **`unknown` 的呈现面偏宽**：当整轮在读不到 `agent_results` 的形态下打开（如 `status='failed'` 的报告，或流未走完），5 个卡片都落 `pending`，并渲染出 5 行「状态未知（未运行或没有记录）」。口径是"宁说未知不说成功"，方向正确，但对该形态略显噪音（实现者已在 §6.3 自陈）。**建议（后续小项，非本卡）**：`agent_results` 为空/缺失时可不渲染该 Alert，或折叠为一行。
2. **实时的降级原因分支（`:557-561`）没有专属测试**：现有 2 个实时用例未覆盖"`agent_completed` 带 `degraded_reasons`"的 SSE 形态。功能上是安全的——`done` 重算（`:592-595`）与回放走的是同一函数，且已有回放侧覆盖。属覆盖缺口而非缺陷。
3. `deep.agent.notice.unknown` 的模板不含 `{reason}` 占位符，但 `outcomeToNotice` 仍会传入（`reason` 被忽略、无副作用）。可留作文案微调。

---

## 4. 卫生与范围

- 我的独立变异**只在 `$env:TEMP\vs20eval\`** 内进行（3 个生成的 `.ts` 变体 + 1 个抽取脚本），**已用 `Microsoft.VisualBasic.FileIO.FileSystem.DeleteDirectory(..., 'SendToRecycleBin')` 送回收站**，`Test-Path` 复核为 `False`；全程**未写入仓库任何文件**。
- `c1a469d` 的提交文件集 = `research_orch.py` / `test_research_orch.py` / `Research.tsx` / `ResearchReplayAgentStatus.test.tsx` / `zh.ts` / `en.ts` / `IMPLEMENT_RESULT_VS20.md` —— **无 VS-22/VS-23 在途文件被卷入**；`git status` 中在途的 `backend/app/routers/chat.py`、`backend/app/services/llm_client.py`、`backend/tests/test_api.py`、`docs/ai/evo/IMPLEMENT_RESULT_VS23.md` **我未触碰、未计入判定**。
- 变异残渣扫描：`git grep -n -E 'TEMP-REPRO|TEMP_REPRO|MUTATED|XXX-TEMP|vs20mutant'` 的命中**全部**落在 `AGENTS.md` 与历史 `docs/ai/evo/*` 文档正文中（引用该规则本身），**源码与测试文件零命中**；实现者声明的 `Research.vs20mutant.tsx` / `__vs20mutant.test.tsx` 在磁盘与提交中均不存在（故 `vitest` 的 11 例与 `Test Files 7 passed` 数字可信）。
