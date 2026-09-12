# EVALUATION_RESULT — Vertical Slice 27：研究编排整轮上界 + 截断可见

> **判定：ACCEPT**（带 1 条次要漏报 + 1 条需编排者追认的口径变更 + 2 条已披露的边界说明）
> 被验提交：`b56f6e8ada9d75405b4b285a9ca031740aae8c69`（`git log -1` 的 HEAD，VS-27）
> 验证者：EVALUATOR（独立子 agent）。工作目录 `E:\Code_file\Projects\finquant-hub`。
> 立场：**不采信 `IMPLEMENT_RESULT_VS27.md` 的自述**；下列每一条结论都由本轮**独立执行**或**对 HEAD 原文的直读**得出。
> 时间窗：本卡的读取与门禁在**工作树干净时**完成（首个 `git status --porcelain` 为空）。此后另一 agent 的 **VS-28 在途改动**出现（mtime ≥ 02:02:04），**本验证未触碰**；已用 `git diff --stat HEAD` 确认本卡四个相关文件（`research_orch.py` / `Research.tsx` / `test_research_deadline_vs27.py` / `ResearchDeadlineSignal.test.tsx`）**与 HEAD 逐字节相同**，故结论不受 VS-28 影响。

---

## 0. 一句话结论

**七条验收标准逐条通过**：上界公式与假时钟实测一致且前提（只在轮间检查）成立；显式 `None` 逐项零回归；部分结果保留、状态如实（**独立构造"只有一个 Agent 超时"的夹具**证实）；截断信号**确有真实消费方**且实时/回放同源同函数；边界与非法值按卡要求处理；副本变异使 5 条用例变红；四项门禁全绿。
另有 **1 条次要漏报**（Agent 因"被截止压低的单次预算"耗尽而 LLMError 时，整轮 `truncated_by_deadline` 仍为 `false`）与 **1 条需追认的口径变更**（`run_research` 的默认值由"无上界"改为 900s）。

---

## 1. 必做 #1：上界可判定（公式 vs 假时钟实测）

**实现者写明的公式**（`backend/app/services/research_orch.py:425`，docstring）：

> 整轮墙钟 ≤ `deadline_seconds` + `client.timeout`（默认 900 + 120 = **1020s**）

**独立核对结论：公式与实测一致，且"只在轮间检查"这一前提成立。**

| 核对项 | 证据（直读 HEAD 源码） |
|---|---|
| 每次调用**发起前**检查、进行中的调用不打断 | `_call_agent` 轮循环 `:339` + 强制收尾 `:384` 各有一处 `_deadline_reached`；两处都在 `await _request_tool_round(...)` **之前** |
| 检查用**绝对**截止点（并行 4 Agent 读同一时刻） | `deadline_at = time.monotonic() + deadline_seconds`（`:452`），`_deadline_reached` 比较 `deadline_at - time.monotonic() <= 1e-6`（`:237`） |
| 单次调用被压到整轮剩余 ⇒ 溢出量恰为"一次尝试超时" | `_remaining_call_budget = min(client.total_budget_seconds, deadline_at - now)`（`:253`），透传到 `chat_with_tools_safe`/`chat_with_tools` 的 `budget_seconds`；`llm_client._post_chat_with_retry` 的既有权衡是"本次调用 ≤ 生效预算 + 单次尝试超时"（`llm_client.py:289`） |
| 主编串行且同样在发起前检查 | `:611-623` 传同一个 `deadline_at`；已过 ⇒ 一次不发 |

**实测（我自己的夹具，非实现者用例）**：截止 500s、单次调用耗 200 假秒 ⇒ 4 个 Agent 在假时刻 `1000/1200/1400` 各发 3 次调用（截止点 1500），**没有任何调用在截止之后发起**；被压低的预算实测为 `180 → 180 → 100`（最后一次取剩余 100），整轮假墙钟 **600.0 ≤ 500 + 120**。与实现者 §4 表格的数字**逐项吻合**（不吻合的地方见 §7 说明 F2 与 F4）。

**边界条件（已验证、且已写在 docstring 里，非隐瞒）**：
- 公式**不含**三类耗时——工具自身执行、收尾进度动画（`asyncio.sleep(0.05) × 13`）、前置步骤（记忆检索/取 client）（docstring `:434-436`）。故更准确的说法是"**LLM 等待墙钟** ≤ 截止 + 单次尝试超时"，见说明 F3。
- `_remaining_call_budget` 在客户端**没有** `total_budget_seconds` 时返回 `None`（不压缩单次预算，`:250-252`）⇒ 对这类客户端公式前提不成立。生产侧 `model_router.get_client` 一律构造 `LLMClient`（`model_router.py:42`），**当前不可达**，见说明 F4。

---

## 2. 必做 #2：`None` = 逐项零回归

**结论：显式传 `deadline_seconds=None` 逐项零回归——成立。但"不传"（省略实参）**不再**等价于 `None`**（见说明 F2，需编排者追认）。

- `_deadline_reached(None) → False`（`:235-236`）；`_remaining_call_budget(None) → None`（`:248-249`）；`_request_tool_round` **仅在非 None 时**才加 `budget_seconds` 这个 kwargs（`:224-225`）⇒ 调用形状与改动前逐字一致。
- 假时钟实测（实现者用例 + 我复核代码路径）：`deadline_seconds=None` 时记录到的预算**全是 `None`**、5 个 `agent_completed`、全 `completed`、`quality=audited`、`truncated_by_deadline=False`。
- `chat_with_tools_loop` / `chat_with_tools_safe` 的签名**未改**（`git show HEAD -- llm_client.py` 只新增 `chat_with_tools(..., *, budget_seconds=None)`）。
- 既有测试：见 §7 门禁（113 passed，含 `test_research_orch.py` / `test_llm_client.py`）。

⚠️ **口径变更（须追认）**：`run_research` 的 `deadline_seconds` 默认值由"无"改为 `DEFAULT_RESEARCH_DEADLINE_SECONDS = 900.0`（`:34`、`:405`）。三条生产调用路径（`routers/research.py:260`、`routers/analysis.py:62`、`services/scheduler.py:158`）**都不传**该参数 ⇒ 生产行为确实被改变（这正是本卡目的）。实现者在 `IMPLEMENT_RESULT_VS27.md:191` **主动、显著地披露**了这一取舍，未掩盖。卡内验收 #5 的字面表述是"不传截止时逐项与现状一致"，与"核心路径默认必须有界"直接冲突；本卡的目标与不再重犯 VS-23 的前提都要求后者。**建议编排者明确追认 900s 为产品决策**；若坚持字面零回归，则应把常量改由三条调用路径显式传入（源码已确认它们目前都不传）。

---

## 3. 必做 #3：触发时保留部分结果且状态如实（**独立夹具**）

实现者自带的整轮用例让**所有** Agent 同时被截断，无法证明"**已完成的 Agent 的成果仍在报告里**"。我另写了夹具（独立于仓库测试目录）：

`%TEMP%\vs27_eval\eval_mixed_agent_timeout.py` —— 假时钟下 `business_analyst` 每次调用吃 200 假秒且始终索要工具，其余 3 个 Agent 首轮即出结论；截止 500s（截止点 1500）。

**原始输出（节选）：**

```
== 调用轨迹 ==
    (1000.0, 'business_analyst', 180.0)   (1000.0, 'financial_analyst', 180.0)
    (1000.0, 'industry_researcher', 180.0) (1000.0, 'risk_assessor', 180.0)
    (1200.0, 'business_analyst', 180.0)   (1400.0, 'business_analyst', 100.0)
== 截止点 == 1500.0   整轮假墙钟 = 600.0
== agent 状态 ==
    financial_analyst completed     industry_researcher completed
    risk_assessor completed         business_analyst degraded ['deadline_exceeded']
    report_lead failed  因超过研究总时长上限（500 秒）未开始分析，已跳过
  OK   其余 3 个 Agent 必须如实 completed
  OK   被截断的 Agent 必须 degraded 而非 completed
  OK   截断原因必须是结构化原因码 deadline_exceeded
  OK   被截断 Agent 的已完成部分必须保留      OK  已完成工具记录必须保留（实际 3）
  OK   整轮截断信号必须为 True                OK  落库 report_data 同一字段必须为 True
  OK   不得有调用在截止之后才发起
  OK   financial_analyst/industry_researcher/risk_assessor 的成果必须在最终报告里
  OK   三个 completed 的 agent_completed 事件必须在实时通道里
== 结论 == PASS
```

⇒ **已完成的 Agent 成果确实保留在最终报告里**，被截断者 `degraded` + 结构化原因 + 最后一段可用文本 + 3 条工具记录，主编 `failed` 且带可读"未开始"原因。**没有任何 Agent 被静默标成 `completed`**。

---

## 4. 必做 #4（本卡的灵魂）：截断信号是否有真实消费方

**结论：是。且实时与回放读同一字段、同一个函数（同源）。**（不是"字段存在"）

| 复核项 | 结论 | 证据 |
|---|---|---|
| ① 实时与回放是否同一字段同源 | **是** | 唯一读取点 `frontend/src/pages/Research.tsx:145 resolveTruncatedByDeadline`；回放 `:470` 读 `resolveTruncatedByDeadline(report.report_data)`；实时 `:616` 读 `resolveTruncatedByDeadline(data)`（done 载荷同时带顶层与 `report` 内两份同值，后端同一 `truncated` 变量：`research_orch.py:695` 与 `:715`）。两处调**同一个**函数，语义为 `(x ?? y) === true` |
| ② 截断时**真的**出现（可见文案） | **是** | 渲染 `:763-770`（`Alert` + `data-testid="research-truncated-by-deadline"`），文案 `deep.report.truncatedByDeadline`（zh.ts:2109，实测为中文整句）。本轮**实跑** `frontend/tests/ResearchDeadlineSignal.test.tsx`：回放用例与**真实 `done` 事件**用例都断言 `screen.getByText(t('deep.report.truncatedByDeadline'))` 为真 ⇒ 5 passed |
| ③ 未截断时**不得**出现 | **是** | 语义上"只有显式 `true` 才算截断"（`(a ?? b) === true`，`undefined/false` 一律 false）；渲染被 `done && truncatedByDeadline` 双重门控；新一轮开始 `:542` 复位。实测：历史报告缺字段用例 `queryByText(...) === null`，`resolveTruncatedByDeadline` 的 5 条纯函数断言（含 `{truncated_by_deadline:false, report:{truncated_by_deadline:true}} → false`）全部通过 |
| 环节级通道（附加） | **是** | `DEGRADED_REASON_KEYS` 登记 `deadline_exceeded` / `deadline_exceeded_before_start`（`:178-179`），实测渲染出中文整句"…原因：超过研究总时长上限，分析被提前结束（已完成的部分已保留）" |
| i18n 三键 | **在 HEAD 里** | `zh.ts:2107-2109` / `en.ts:2108-2110`（与提交说明的"已随 `96fb632` 进入 HEAD"一致，属预期而非遗漏） |
| 未覆盖面（如实） | 报告**导出文件**无独立截断行 | 实现者已在 `IMPLEMENT_RESULT_VS27.md:167` 论证并声明"仅界面两条通道可见"，非默认"加字段算完成" |

---

## 5. 必做 #5：边界与非法值（含我独立构造的"未开始即超时"）

我另写夹具 `%TEMP%\vs27_eval\eval_before_start.py`，在 **run_research 层**构造两种"截止在首轮之前已过"：

```
A) 截止本身极小（剩余 ≤ 1e-6 容差）: deadline=1e-09   检查时刻=1000.0
   LLM 调用次数: 0
   事件: agent_started, agent_failed ×5, report_progress ×13, done   （无 error、无 agent_completed）
   5 个 Agent 全部 failed | 因超过研究总时长上限（1e-09 秒）未开始分析，已跳过
   判定: PASS
B) 前置记忆检索耗时 10s > 截止 1s: deadline=1.0  检查时刻=1010.0
   同上（一次调用都没发，原因如实）
   判定: PASS
== 总结论 == PASS
```

- **截止恰在一次成功调用之后才越界 ⇒ 不误报截断**：`_call_agent` 在拿到最终回答后立即 `return`（`:355-358`），此后不再做任何截止检查；实测 `reasons == []`、完整文本返回。
- **非法值**：`research_orch.py:448-452` 在任何副作用**之前**（早于记忆检索 `:456` 与取 client `:470`）`ValueError`；实现者参数化用例覆盖 `0/-1/0/-0.5/NaN/Inf` 且断言零调用，我复核了该分支的位置确实在最前。

---

## 6. 必做 #6：鉴别力证明（**副本**变异，我独立执行）

**窗口声明**：变异**仅发生在 `%TEMP%\vs27_eval\mut\` 的副本**（`Copy-Item` 出的 `app/` + `tests/` + `pytest.ini`，539 个文件）。**仓库目录全程未被改动**（变异前后 `git status` 中本卡文件集不变）。
变异内容：把副本 `app/services/research_orch.py` 的 `_deadline_reached` 体改为 `return False`（等价于"去掉截止判断"），脚本断言目标串唯一命中。

```
MUTATED: _deadline_reached 恒 False
FAILED tests/test_research_deadline_vs27.py::test_vs27_run_wall_clock_bounded_and_no_call_starts_after_deadline - assert False is True
FAILED tests/test_research_deadline_vs27.py::test_vs27_agent_truncation_keeps_partial_output_and_structured_reason - assert [1000.0, 1200...800.0, 2000.0] == [...]
FAILED tests/test_research_deadline_vs27.py::test_vs27_agent_deadline_spent_before_first_call_issues_no_call - AssertionError: 截止已到就不得发起任何调用
FAILED tests/test_research_deadline_vs27.py::test_vs27_run_research_truncation_keeps_partial_results_and_persists_signal - AssertionError: industry_researcher
FAILED tests/test_research_deadline_vs27.py::test_vs27_default_deadline_bounds_the_run_without_being_passed - AssertionError: 默认截止必须真的生效，而不是只写在常量里
5 failed, 11 passed in 11.67s
```

⇒ **5 条变红、11 条保持绿**（定向变异，不是"全红"），与实现者 §9 报告的形态一致。

---

## 7. 必做 #7：门禁（原始输出）

| 门禁 | 命令（前置 `$env:no_proxy='localhost,127.0.0.1,::1'`，`-o addopts="" -p no:cacheprovider`） | 结果 |
|---|---|---|
| 聚焦 pytest | `backend> .venv\Scripts\python.exe -m pytest tests/test_research_deadline_vs27.py tests/test_research_orch.py tests/test_llm_client.py -q -o addopts="" -p no:cacheprovider --no-header -rf` | **113 passed in 19.73s**（exit 0） |
| ruff | `backend> .venv\Scripts\python.exe -m ruff check .` | **All checks passed!**（exit 0） |
| 前端聚焦 | `frontend> bun run test tests/ResearchDeadlineSignal.test.tsx tests/ResearchReplayAgentStatus.test.tsx` | **Test Files 2 passed / Tests 16 passed**（exit 0） |
| 生产构建 | `frontend> bun run build` | `✓ built in 37.09s`（exit 0；仅 chunk > 500kB 的既有告警） |

- **未跑**全量 pytest、**未跑** `tests/test_api.py`（按环境铁律）；门禁输出未写入仓库目录。
- 收尾核对 `Get-CimInstance Win32_Process -Filter "Name='python.exe'"` ⇒ **无残留**（无孤儿 pytest）。
- `git status` 复核：本卡交付文件处于最终态；工作树中出现的 **VS-28 在途改动未被触碰、未被提交**。
- 变异标记扫描 `git grep -n -E 'TEMP-REPRO|TEMP_REPRO|MUTATED|XXX-TEMP' HEAD -- backend/app frontend/src` ⇒ **零命中**。

---

## 8. 发现（Findings）

### F1（次要，**漏报**，不阻塞）：被截止压低的预算耗尽时，整轮截断信号为 `false`
**位置**：`backend/app/services/research_orch.py:512-523`（`except LLMError` 分支）+ `:528-529`（只有 `agent_reasons` 里的截止码才会置 `truncated=True`）。

**现象（我独立复现，`%TEMP%\vs27_eval\eval_budget_starved.py`）**：假时钟在记忆检索期间跳到 1499（截止点 1500）⇒ 每次调用的单次预算被压到 1s ⇒ `business_analyst` 抛"LLM 调用总时长预算已用尽（本次 1 秒）"的 `LLMError`；其余 3 个 Agent 与主编仍在 1499 发起并成功。原始输出：

```
business_analyst failed | LLM 调用总时长预算已用尽（本次 1 秒）：已发起 1 次尝试仍未成功，停止重试。
financial_analyst completed / industry_researcher completed / risk_assessor completed / report_lead completed
agent_failed 事件: [('agent_failed', 'business_analyst')]
quality = degraded
done['truncated_by_deadline'] = False
done['report']['truncated_by_deadline'] = False
```

**影响**：该 Agent **确实是被截止（压低后的预算）打死的**，但报告级横幅不会出现（消费方只在字段为 `true` 时渲染）。属**漏报**而非误报——用户仍能在"环节状态"看到该环节 `failed` + 可读原因，`quality=degraded` 也有降级提示，**不会**被误认为"已完整"或"还在跑"，故不触碰卡内"不得静默变 `completed`"的红线。

**建议（低风险一行级）**：让 `llm_client` 的"预算耗尽"错误带结构化标记（如 `LLMError.budget_exhausted = True`），并在 `:517` 的 `except LLMError` 里对 `deadline_at is not None and getattr(exc, "budget_exhausted", False)` 也置 `truncated = True`。**不要**用错误文案做字符串判据（本仓已有"不用字符串哨兵"的铁律）。

### F2（须编排者追认，**非缺陷**）：`run_research` 默认值语义变更
见 §2。`research_orch.py:405` 的默认值由"无上界"改为 900s，使"**不传**"≠"`None`"。实现者已在结果文件显著披露；本卡的目的事实上要求如此。请编排者确认 900s 是产品决策（并考虑是否要同步 `docs/` 里关于研究时长的说明）。

### F3（已披露的公式口径）：公式是"LLM 等待墙钟"上界
docstring `:425` 写"整轮墙钟 ≤ deadline_seconds + client.timeout"，而同段 `:434-436` 明确排除工具执行时长、收尾进度动画（≈0.7s）与前置步骤。⇒ 严格说，端到端 HTTP 墙钟**可以**超过该式。属**主动披露**，非隐瞒；建议（可选）把 docstring 的措辞改为"LLM 等待墙钟"，避免后续读者把它当成端到端 SLA。

### F4（已披露、当前不可达）：缺少 `total_budget_seconds` 的客户端会破坏公式前提
`_remaining_call_budget`（`:250-252`）对这种客户端返回 `None`（不压缩单次预算），此时单次调用仍可跑满客户端预算 + 超时，公式的"溢出恰为一次尝试超时"不再成立。生产的 `model_router.get_client` 一律返回 `LLMClient`（含该属性），**当前不可达**；docstring 已把该情形限定为"测试替身"。记录在案即可。

---

## 9. 逐条对照验收标准

| 卡内标准 | 判定 | 依据 |
|---|---|---|
| 1 上界可判定（公式 + 无调用在截止后发起） | **PASS** | §1（独立复核公式所依赖的每一处源码 + 实测 600 ≤ 620、发起时刻全 < 截止点） |
| 2 部分结果保留 + 状态如实 | **PASS** | §3（独立"单 Agent 超时"夹具，PASS） |
| 3 信号有真实消费方 | **PASS** | §4（同函数同字段 + 实跑界面断言 + 反向用例） |
| 4 同源（用户所见 == 落库） | **PASS** | `research_orch.py:695`/`:715` 同一变量；前端同一读取点；JSON 往返断言 |
| 5 零回归（`None`） | **PASS**（附 F2 口径追认） | §2 |
| 6 鉴别力证明 | **PASS** | §6（5 红 / 11 绿） |
| 7 门禁 | **PASS** | §7（113 passed / ruff / 16 vitest / build） |
| 边界：成功后才越界不误报 | **PASS** | §5 |
| 边界：首轮前已过 ⇒ 零调用 + 如实"未开始" | **PASS** | §5（A/B 两形态） |
| 边界：非法值明确拒绝 | **PASS** | §5 |
| 不能破坏：VS-20 结构化状态契约 | **PASS** | 全程用 `status/degraded_reasons/error`，无字符串哨兵 |
| 不能破坏：4 Agent 并行 + `max_rounds=5` | **PASS** | `:338 range(5)` 未改；实测 4 个 Agent 在假时刻 1000 **同时**发起 |
| 不能破坏：`chat_with_tools_*` 签名契约 | **PASS** | `git show HEAD -- llm_client.py`：只**新增** `chat_with_tools` 的 keyword-only `budget_seconds=None` |
| 不加依赖 / 不改 schema / 不删文件 / 不 commit | **PASS** | `git show --stat HEAD` 仅 6 个文件；无新增依赖 |

---

## 10. 证据索引（全部在 `%TEMP%`，仓库零污染）

| 证据 | 位置 |
|---|---|
| 独立夹具：只有 1 个 Agent 超时（部分结果 + 状态如实） | `%TEMP%\vs27_eval\eval_mixed_agent_timeout.py`（输出见 §3） |
| 独立夹具：截止在首轮前已过（run_research 层，两形态） | `%TEMP%\vs27_eval\eval_before_start.py`（输出见 §5） |
| 独立探针：被截止压低的预算耗尽 ⇒ 截断信号 | `%TEMP%\vs27_eval\eval_budget_starved.py`（输出见 §8 F1） |
| 变异副本 + 变异脚本 | `%TEMP%\vs27_eval\mut\`、`%TEMP%\vs27_eval\mutate.py` |
| 本卡交付文件与 HEAD 的一致性核对 | `git diff --stat HEAD -- backend/app/services/research_orch.py frontend/src/pages/Research.tsx backend/tests/test_research_deadline_vs27.py frontend/tests/ResearchDeadlineSignal.test.tsx` → 空 |
