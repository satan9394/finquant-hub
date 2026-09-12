# IMPLEMENT_RESULT — Vertical Slice 27：研究编排整轮等待有上界 + 截断信号有真实消费方

> 实现者：IMPLEMENTER（子 agent）。工作目录 `E:\Code_file\Projects\finquant-hub`。**我本人未执行任何 commit**。
> 任务卡：`docs/ai/evo/IMPLEMENTATION_BRIEF_VS27.md`。
>
> **提交状态（核查于收尾时）**：编排者在我收尾期间把本卡实现提交为 **`b56f6e8`**（VS-27，含 `research_orch.py`/`llm_client.py`/`Research.tsx`/两个新测试文件/本文件当时的版本）。
> 之后我又对**本文件**做了少量修订（行号引用校正 + 变异基线证据，`+12/-3`）——这部分**尚未提交**，在工作树里。
> 五个代码/测试文件的工作区内容与 `b56f6e8` **逐字一致**（`git diff` 为空）。`frontend/src/i18n/{zh,en}.ts` 的 3 个键已更早在 `96fb632`（VS-25）里由编排者一并提交（见 §1 末注）。
> 收尾时另有**编排者自己**发起的 pytest 进程在跑（PID 15264/26372，跑 `test_research_deadline_vs27.py test_research_orch.py test_llm_client.py`）——那是验收动作，**我没有动它**；我自己起的进程已全部结束，无孤儿。

## 0. 结论速览

- **改了什么**：把运行级截止从 `run_research` 下传到每个 Agent 的**每一次** LLM 调用（`_call_agent` 轮间检查 + 单次预算压低），并把"整轮被截断"做成**结构化信号**（`agent_results[key].status/degraded_reasons` + `report_data.truncated_by_deadline`），由**既有且已接线的**前端消费链呈现给用户。
- **上界公式**：`整轮墙钟 ≤ deadline_seconds + client.timeout`（默认 900 + 120 = **1020s**；改动前最坏 ≈ 60 分钟）。假时钟实测：截止 500s、单次 200s ⇒ 每 Agent 只发 3 次调用（1000/1200/1400 时刻，全部 < 截止点 1500），整轮假墙钟 **600s ≤ 620s**，且**没有任何调用在截止之后才发起**。
- **信号谁在消费、用户在哪看到**：`frontend/src/pages/Research.tsx`。①报告级：`done`（实时）与 `report_data`（回放）两路都经 `resolveTruncatedByDeadline`(:145) → `setTruncatedByDeadline`(:616 实时 / :470 回放) → 渲染(:763-770, `data-testid="research-truncated-by-deadline"`)，文案 `deep.report.truncatedByDeadline`（zh.ts:2109）；②环节级：原因码 `deadline_exceeded` 经 `DEGRADED_REASON_KEYS`(:179-180) 变成中文，进 VS-20 已有的"环节状态"提示条（实时 :557-561 / 回放）。**实测**：新增 `frontend/tests/ResearchDeadlineSignal.test.tsx` 5 条全绿，其中 2 条是**界面断言**（回放渲染 + 真实 `done` 事件驱动渲染），断言的是用户可见中文文案，不是"字段存在"。
- **不传截止是否零回归**：**是**。`deadline_seconds=None` ⇒ 不做任何时间判断、**不注入** `budget_seconds`（实测记录到的值全是 `None`）、结果与改动前逐项一致；`chat_with_tools_loop`/`chat_with_tools_safe` 签名与行为未动（其 VS23 用例全绿）。

---

## 1. 改动清单（文件:行）

### `backend/app/services/research_orch.py`（主要）

| 行 | 内容 |
|---|---|
| 30–42 | `DEFAULT_RESEARCH_DEADLINE_SECONDS = 900.0`（:34，运行级默认上界，理由写在注释里）；`_DEADLINE_EPSILON_SECONDS`（:37，与 llm_client 同款浮点容差）；`DEADLINE_REASON_TRUNCATED = "deadline_exceeded"`、`DEADLINE_REASON_NOT_STARTED = "deadline_exceeded_before_start"`（:41-42） |
| 200–226 | `_request_tool_round(..., budget_seconds=None)`（:206）：仅在非 None 时才把该 kwargs 传下去 ⇒ **默认调用形状与改动前逐字一致** |
| 229–237 | `_deadline_reached(deadline_at)`：绝对单调时钟点 + 浮点容差；`None` ⇒ 恒 `False` |
| 240–253 | `_remaining_call_budget(client, deadline_at)` = `min(client.total_budget_seconds, 截止剩余)`；未启用截止 / 客户端没有该属性 ⇒ `None` |
| 256–259 | `_deadline_not_started_message()`：用户可读的"未开始即已超时"文案（进 `agent_results[key].error`） |
| 285–307 | `_call_agent(..., deadline_at=None)`（:286）新增参数 + **docstring 写明"本 Agent 上界 = deadline_at + client.timeout"与"只在两次调用之间检查"这一前提** |
| 332–356 | 轮循环：`last_content` 追踪；**每次调用发起前**检查截止（:339），已过 ⇒ 返回"最后一段可用文本 + 已完成工具记录"，原因码取 `deadline_exceeded(_before_start)` |
| 382–393 | 强制收尾（第 6 次调用）发起前同样检查（:384）；被截断则不再发起它 |
| 405 | `run_research(..., deadline_seconds: float | None = DEFAULT_RESEARCH_DEADLINE_SECONDS)` —— **默认即上界**，三条生产调用路径（`routers/research.py:260`、`routers/analysis.py:62`、`services/scheduler.py:158`）都不传 ⇒ 同源吃默认值，不存在"改了一条忘了另一条" |
| 408–453 | `run_research` docstring：**上界公式 + 前提 + 不在上界内的三类耗时 + 截断语义**（本卡验收 #1 要求写进 docstring 的内容） |
| 446–451 | 非法截止值（0/负/NaN/Inf）在**任何副作用之前** `ValueError`（早于记忆检索与取 client） |
| 488 | `truncated` 标志（整轮是否真的截断过） |
| 508–512 | Agent 节点把 `deadline_at` 传给 `_call_agent` |
| 528–537 | 截断 ⇒ `truncated=True`（:528-529）；"一次都没发起"⇒ `status=failed` + `error` + 非致命 `agent_failed` 事件（:530-537，**不是**整轮失败，其余 Agent 成果保留） |
| 622 | 主编同样吃 `deadline_at`；"主编未开始"⇒ `lead_error` + `agent_failed`（不补发 `agent_completed`，VS-20 既有约束） |
| 695 | `report_data["truncated_by_deadline"] = truncated`（**与 `quality` 同一处、随报告落库**） |
| 715 | `done_payload["truncated_by_deadline"]`（顶层，与 `report_data` 内同值） |

### `backend/app/services/llm_client.py`

| 行 | 内容 |
|---|---|
| 359–376 | `chat_with_tools(..., *, with_finish_reason=False, budget_seconds: float | None = None)`：**新增 keyword-only、默认 None**。研究的**强制收尾调用**走的就是这个方法；它若不接受该参数，整轮上界就不成立。默认 None ⇒ 透传 `None` ⇒ 用客户端预算（逐项零回归） |
| 386 | `_post_chat_with_retry(payload, budget_seconds=budget_seconds)` |

`chat_with_tools_loop` / `chat_with_tools_safe` 的签名**一个字没动**。

### `frontend/src/pages/Research.tsx`

| 行 | 内容 |
|---|---|
| 145–154 | `resolveTruncatedByDeadline()`：**唯一读取点**（顶层与 `report` 内两形态都认；只有显式 `true` 才算截断） |
| 178–180 | `DEGRADED_REASON_KEYS` 登记 `deadline_exceeded` / `deadline_exceeded_before_start`（未知码仍原样显示，不改既有兜底语义） |
| 89（`ResearchStreamData`）/ 428–429 | 类型与 state `truncatedByDeadline` |
| 470 | 回放（`GET /research/{id}` → `report_data`）读同一字段 |
| 542 | 新一轮研究开始时复位（不复用上一轮的横幅） |
| 616 | 实时 `done` 事件读同一字段 |
| 763–770 | **用户可见的回执**：`Alert` + `data-testid="research-truncated-by-deadline"` |

### `frontend/src/i18n/zh.ts` / `en.ts`

`deep.agent.reason.deadlineExceeded`、`deep.agent.reason.deadlineBeforeStart`、`deep.report.truncatedByDeadline`（zh.ts:2107-2109 / en.ts:2108-2110）。

> ⚠️ **事实澄清（不是我的提交）**：这 3 个键在我编辑之后，被**编排者**并入了 **VS-25 的提交 `96fb632`**（其提交说明里明确写了"还同时含有 VS-27（在制）的 3 个键…一并提交"）。因此工作区对这两个文件**已无差异**（`git hash-object frontend/src/i18n/zh.ts` == `HEAD` 版本），它们**已经是最终态且已在 HEAD 里**。我这边的编辑没有被回退，只是"提交者不是我"。

### 新增测试

- `backend/tests/test_research_deadline_vs27.py`（16 条，全部假时钟、零真实等待）
- `frontend/tests/ResearchDeadlineSignal.test.tsx`（5 条，含 2 条界面断言）

---

## 2. 上界公式与前提（= 写进 docstring 的同一份口径）

**整轮墙钟 ≤ `deadline_seconds` + `client.timeout`**

前提与推导（docstring 原文，`research_orch.py:408-453`）：

1. 4 个 Agent **并行**，各自最多 6 次调用（5 轮 + 1 次强制收尾），**每次调用发起前**检查同一个**绝对**截止点（含 `_DEADLINE_EPSILON_SECONDS` 容差）；已过 ⇒ 该次调用根本不发起；
2. 每次调用的单次预算被压低为 `min(client.total_budget_seconds, 截止剩余)` ⇒ 该次调用墙钟 ≤ 生效预算 + 单次尝试超时（llm_client `_post_chat_with_retry` 的既有权衡）；
3. 主编在全部 Agent 之后**串行**开始，同样在发起前检查；已过 ⇒ 一次调用都不发。

合起来：**最后一个"已发起"的调用最多在截止后再跑完一次尝试** ⇒ ≤ 截止 + `client.timeout`。
默认值下：900 + 120 = **1020s**（改动前最坏 ≈ 6 × 300 + 主编 300 ≈ 60 分钟）。

**不在该上界内的**（docstring 已写明，不隐瞒）：①工具自身执行时长（由工具超时/熔断负责，编排层不做时间切片）；②收尾进度动画（恒定 ~0.7s）；③前置步骤（记忆检索 / 取 LLM client）——本地检索与本地解析，且在第一次调用**之前**发生。

---

## 3. 门禁（原始输出）

命令（前置 `$env:no_proxy='localhost,127.0.0.1,::1'`；`-o addopts="" -p no:cacheprovider` 以免把 htmlcov/.pytest_cache 写进仓库；输出留在 `$env:TEMP\vs27_evidence\`，**未写进仓库**）：

```
backend> python -m pytest tests/test_research_deadline_vs27.py tests/test_research_orch.py tests/test_llm_client.py
                        tests/test_memory.py tests/test_memory_rollout.py tests/test_chat_tools.py tests/test_model_ux.py
                        -q -o addopts="" -p no:cacheprovider --no-header
..............................................................................................................................................                               [100%]
142 passed in 27.96s
```

```
backend> python -m ruff check .
All checks passed!
```

```
frontend> bun run test tests/ResearchDeadlineSignal.test.tsx tests/ResearchReplayAgentStatus.test.tsx
 ✓ tests/ResearchDeadlineSignal.test.tsx (5 tests) 6962ms
     ✓ 回放：落库 report_data.truncated_by_deadline=true ⇒ 屏上出现"提前结束"提示  4003ms
     ✓ 回放：历史报告没有该字段 ⇒ 不得误报截断  1044ms
     ✓ 实时：SSE done 携带 truncated_by_deadline=true ⇒ 同一条提示同样出现  1902ms
 ✓ tests/ResearchReplayAgentStatus.test.tsx (11 tests) 4974ms
 Test Files  2 passed (2)
      Tests  16 passed (16)
```

（**没有**跑全量 pytest、**没有**跑 `tests/test_api.py`——按环境铁律。）

---

## 4. 验收 #1：上界可判定（假时钟实测）

测试：`test_vs27_run_wall_clock_bounded_and_no_call_starts_after_deadline`、`test_vs27_default_deadline_bounds_the_run_without_being_passed`。

假时钟接缝：`monkeypatch.setattr(research_orch, "time", SimpleNamespace(monotonic=fake_monotonic))`（只替换本模块内的 `time`，不动全局）；客户端替身每次调用消耗 `cost` 假秒，推进用 `max(now, start+cost)`，使**并行**的兄弟调用能在**同一假时刻**发起（不把并发算重）。

| 场景 | 结果 |
|---|---|
| deadline=500s、单次 200s | 每个 Agent 只发 3 次调用，发起时刻 = `[1000.0, 1200.0, 1400.0]` **全部 < 截止点 1500.0**；整轮假墙钟 `600.0 ≤ 500 + 120 = 620`；溢出 100s ≤ 一次调用耗时 200s |
| 同上，单次预算下压 | 记录到的预算 = `180`（剩余 500/300 时取客户端预算 180）与 `100`（剩余 100 时取剩余）⇒ `min(budgets) == 100.0`，证明"单次预算被整轮剩余压低"真的生效 |
| **默认不传**（900s、单次 200s） | 4 个 Agent 各发 5 次调用（1000…1800，全部 < 1900），第 6 轮检查时跳过；主编一次都不发；`done["truncated_by_deadline"] is True`；整轮假墙钟 `1000.0 ≤ 900 + 120 = 1020` |
| 边界 | 截止**恰在一次成功调用之后**越过（`_call_agent` 层）⇒ `reasons == []`、完整文本返回，**不误报截断** |
| 边界 | 截止在首轮之前已过（`deadline_at = now + 1e-9`）⇒ `client.calls == []`、`reasons == ["deadline_exceeded_before_start"]` |
| 非法值 | `0.0 / -1.0 / 0 / -0.5 / NaN / Inf` ⇒ `ValueError`，且 `client.calls == []`（零副作用） |

---

## 5. 验收 #2：部分结果保留 + 状态如实

`test_vs27_agent_truncation_keeps_partial_output_and_structured_reason`：
`content == "business_analyst 的中间结论"`（最后一段可用文本保留）、`len(tool_log) == 3`（已完成的工具记录保留）、`reasons == ["deadline_exceeded"]`。

`test_vs27_run_research_truncation_keeps_partial_results_and_persists_signal`：对每个 Agent 断言 `status in {degraded, failed}`（**没有任何 Agent 被静默标成 completed**）；`degraded` ⇒ `"deadline_exceeded" in degraded_reasons` 且 `content.strip()` 非空；`failed` ⇒ `error` 含"总时长上限"；主编（串行、必然在截止后）⇒ `status == "failed"` 且事件序列是 `agent_failed`（**不补发** `agent_completed`）。局部的截断**不升级**为整轮失败：`done` 仍然产出、其余 Agent 的章节仍在报告里。

---

## 6. 验收 #3：信号有真实消费方（用户在哪看到）

**这是本卡的灵魂。正面证据如下（不是"字段存在"）：**

| 通道 | 后端产出 | 前端消费点（文件:行） | 用户可见文案 |
|---|---|---|---|
| 报告级（实时） | `done_payload["truncated_by_deadline"]` / `done.report.truncated_by_deadline` | `Research.tsx:616`（→ `case 'done'` 在 `:605`）→ 渲染 `:763-770` | `deep.report.truncatedByDeadline`（zh.ts:2109）："⏱ 本次研究因超过总时长上限提前结束：已完成的环节成果仍然保留，未完成的环节见上方"环节状态"。" |
| 报告级（回放） | 落库 `research_reports.report_data.truncated_by_deadline` | `Research.tsx:470` → 同一渲染分支 | 同上（同一条文案，同一 reader） |
| 环节级（实时） | `agent_completed.degraded_reasons=["deadline_exceeded"]`（`research_orch.py:547-553`） | `Research.tsx:577-586`（`case 'agent_completed'`）→ `DEGRADED_REASON_KEYS:179` → VS-20 提示条 `:775-790` | "财务分析：已降级（产出可能不完整）—— 原因：超过研究总时长上限，分析被提前结束（已完成的部分已保留）" |
| 环节级（回放） | `agent_results[key].status/degraded_reasons` | `deriveAgentOutcomes`/`noticesFromOutcomes` → 同一提示条（`:775-790`） | 同上 |
| 卡片/正文 | 未开始的 Agent：`status=failed` + `error`；正文写入 `【分析失败】因超过研究总时长上限（900 秒）未开始分析，已跳过` | `AgentStatusCard` + 报告正文 | 失败原因可见；报告导出/正文里也带该行 |

**实测（界面断言，不是纯函数）**：`frontend/tests/ResearchDeadlineSignal.test.tsx`
- 回放：`GET /research/9` 返回 `report_data.truncated_by_deadline=true` ⇒ `expect(screen.getByText(t('deep.report.truncatedByDeadline'))).toBeTruthy()` ✅
- 实时：mock 掉 `readSSE`，走 **真实的 `done` 事件处理分支**（`Research.tsx:605-625`）⇒ 同一条文案出现、环节原因出现 ✅
- 反向：**历史报告没有该字段 ⇒ `queryByText(...)` 为 `null`**（不得误报） ✅

此外后端事件通道也落库：`routers/research.py:264 _append_event` 把每个 SSE 事件写进 `research_events`（环节原因码在事件时间线上同样可查）。

**没有"只落库不展示"的部分需要辩护**——信号在实时与回放两条路径上都有界面消费方。唯一**未**展示的形态是报告**导出文件**（MD/HTML/PDF/DOCX）里没有单独一行"本轮提前结束"：我**选择不改导出契约**（`report_to_markdown` 已按 `quality=degraded` 打"生成不完整"横幅，且被截断 Agent 的正文自带失败原因行），理由是避免为一个已经在界面上双通道可见的信号去动导出格式契约——这一点如实写在这里，而不是默认"加了字段就算完成"。

---

## 7. 验收 #4：同源（用户所见 == 已保存内容）

1. `done_payload["report"]` **就是**落库的那份 dict：`routers/research.py:286 _complete_report(report_id, report, data.get("agent_results"))`、`services/scheduler.py:172-179` 写的是 `payload.get("report")`。测试断言 `done["report"]["truncated_by_deadline"] is True`，且 **JSON 往返（落库形态）后仍为 `True`**、`persisted["quality"] == done["quality"] == "degraded"`。
2. `done_payload["truncated_by_deadline"]` 与 `report_data["truncated_by_deadline"]` 同值（同一次计算的同一个 `truncated` 变量）。
3. `done["agent_results"]` 是 `{k: dict(v) for ...}` 的浅拷贝，字段逐字相同 ⇒ 前端实时读它的结果与回放读落库结果一致（前端两条路径调用**同一个** `resolveTruncatedByDeadline` 与 `deriveAgentOutcomes`，用例已实测两条路径产出同一段文案）。
4. 前端用例同时覆盖"实时形状（顶层）"与"回放形状（report.report_data）" ⇒ 两处读同一字段、零分叉。

---

## 8. 验收 #5：零回归

| 项 | 实测 |
|---|---|
| `deadline_seconds=None` | 假时钟每次调用推进 **100000s**（任何截止判断都会立刻截断），结果仍是：5 个 `agent_completed`、全 `completed`、`quality=audited`、`truncated_by_deadline is False`；且记录到的 `budget_seconds` **全是 `None`**（证明没有改写调用形状） |
| 既有 `research_orch` 测试 | 全绿（在 142 passed 里） |
| 既有 `llm_client` 测试（含 VS21/VS23 截止用例） | 全绿 |
| `chat_with_tools_loop` / `chat_with_tools_safe` 签名 | **未改**；`test_vs23_*` 全部通过 |
| `chat_with_tools` 新增参数 | `test_vs27_chat_with_tools_budget_override_defaults_to_none`：默认透传 `None`、显式传 12.5 ⇒ `seen == [None, 12.5]` |
| 相邻路径（research 调用方） | `test_memory.py` / `test_memory_rollout.py` / `test_chat_tools.py` / `test_model_ux.py` 全绿 |
| 前端 | `ResearchReplayAgentStatus.test.tsx`（VS-20，11 条）、`ResearchDeepPlan.test.tsx`、`CorePrimitiveI18n.test.tsx` 全绿 |
| 默认值变化的口径说明 | "不传 `deadline_seconds`"**不再等于**"无上界"——这正是本卡的目的（核心路径默认有界，三条调用路径同源）。要"逐项与改动前一致"就显式传 `None`（已有专门用例）。此取舍写在此处，便于 Evaluator 判定。 |

---

## 9. 验收 #6：鉴别力证明（**副本**变异，仓库始终未被改动）

**窗口声明**：变异**只发生在 `$env:TEMP\vs27_mut\` 的副本**（一次性 `Copy-Item` 出来的 `app/` + `tests/` + `pytest.ini`）；仓库目录**从未**进入变异态（`git status` 全程只有我那 3 个已修改文件 + 3 个新文件，且已 `grep -n -E 'TEMP-REPRO|TEMP_REPRO|MUTATED|XXX-TEMP'` 扫过、零命中）。副本在结论取出后已**回收进回收站**。

变异内容：把副本 `app/services/research_orch.py` 里**两处** `if _deadline_reached(deadline_at): … return last_content, tool_calls_log` 整块删除（脚本输出 `removed blocks: 2`，事后 `Select-String '_deadline_reached'` 只剩函数定义那一行）⇒ 语义 = "去掉截止判断"。

变异前（**同一副本**，未变异）：

```
$env:PYTHONPATH=$env:TEMP\vs27_mut; python -m pytest tests/test_research_deadline_vs27.py -q -o addopts="" -p no:cacheprovider --no-header
................                                                                                                                                                             [100%]
16 passed in 10.38s
```

变异后：

```
$env:PYTHONPATH=$env:TEMP\vs27_mut; python -m pytest tests/test_research_deadline_vs27.py -q -o addopts="" -p no:cacheprovider --no-header -rf
FAILED tests/test_research_deadline_vs27.py::test_vs27_run_wall_clock_bounded_and_no_call_starts_after_deadline - assert False is True
FAILED tests/test_research_deadline_vs27.py::test_vs27_agent_truncation_keeps_partial_output_and_structured_reason - assert [1000.0, 1200...800.0, 2000.0] == [1000.0, 1200.0, 14...
FAILED tests/test_research_deadline_vs27.py::test_vs27_agent_deadline_spent_before_first_call_issues_no_call - AssertionError: 截止已到就不得发起任何调用
FAILED tests/test_research_deadline_vs27.py::test_vs27_run_research_truncation_keeps_partial_results_and_persists_signal - AssertionError: business_analyst
FAILED tests/test_research_deadline_vs27.py::test_vs27_default_deadline_bounds_the_run_without_being_passed - AssertionError: 默认截止必须真的生效，而不是只写在常量里
5 failed, 11 passed in 7.49s
```

⇒ **至少一条新用例变红**：实际 5 条变红（覆盖上界、部分结果、首轮前已过、整轮同源、默认值生效），另外 11 条（零回归类）保持绿 ⇒ 变异是**定向**的，不是"全红"。

---

## 10. 未解决问题 / 风险 / 证据

### 风险与取舍

1. **默认值 900s 是产品取值判断**：改动前最坏 ≈ 60 分钟，900s 把它压到 ≈ 17 分钟（1020s 硬上界）。若编排者/用户认为过短（会牺牲深研质量）或过长，只需改 `DEFAULT_RESEARCH_DEADLINE_SECONDS` 一个常量。**刻意不在 router 里写常量**（不同 `chat.py:196` 的写法），因为研究有 3 条调用路径，写在第 3 处迟早会漏改一条——默认值放在函数签名上 = 三条路径天然同源。
2. **工具执行时长不在上界内**：工具在 `ThreadPoolExecutor` 里跑，网络挂起时仍可能拖长整轮。若要更紧的上界，需要给工具加超时/取消（超出本卡范围，已写进 docstring 的"不在上界内"清单）。
3. **主编被跳过时报告仍是 `status=completed`**（`quality=degraded`）：这是 VS-12/VS-20 的既有语义（局部失败不升级为整轮失败）。用户看到的是"提前结束"横幅 + 主编卡片 failed + 环节状态原因，不会误以为完整。
4. **导出文件不带独立的截断行**（见 §6 末段）：已论证并如实记录；未改导出契约。
5. **`i18n` 键由编排者并入 VS-25 提交（`96fb632`）**：我这边工作区对 `zh.ts`/`en.ts` 已无差异，提交时不要以为"它们没改过"而漏掉——它们在 HEAD 里，是最终态。

### 环境与卫生

- 未跑全量 pytest，未跑 `tests/test_api.py`；只跑了 7 个聚焦后端文件 + 2 个聚焦前端文件。
- 门禁输出、变异副本、证据文件全部在 `$env:TEMP`（`vs27_evidence/`、`vs27_mut/`），**仓库目录零污染**；`git status` 复核：仅 `backend/app/services/llm_client.py`、`backend/app/services/research_orch.py`、`frontend/src/pages/Research.tsx` 三个已修改文件 + 三个新文件（本文件、后端测试、前端测试）。
- 收尾核对 `Get-CimInstance Win32_Process -Filter "Name='python.exe'"` ⇒ **无残留 pytest 进程**（无孤儿 python）。
- 未 commit（按要求）。

### 证据索引

| 证据 | 位置 |
|---|---|
| 聚焦 pytest（142 passed） | `%TEMP%\vs27_evidence\focused_pytest.txt` |
| ruff | `%TEMP%\vs27_evidence\ruff.txt` |
| 变异前基线 | `%TEMP%\vs27_evidence\mutation_baseline.txt`（16 passed） |
| 变异运行原始输出 | `%TEMP%\vs27_evidence\mutated.txt`（5 failed / 11 passed） |
| 前端两条路径断言 | `%TEMP%\vs27_evidence\frontend.txt` + `frontend/tests/ResearchDeadlineSignal.test.tsx` |
| 上界/边界/零回归用例 | `backend/tests/test_research_deadline_vs27.py`（16 条） |
