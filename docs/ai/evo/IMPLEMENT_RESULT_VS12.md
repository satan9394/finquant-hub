# IMPLEMENT_RESULT — Vertical Slice 12：研究失败语义收口

> 状态：**完成**（源码三处改动 + 测试 + 门禁全绿）。
> 实现者：IMPLEMENTER（DeepSeek Harness 子 agent）2026-09-13。**未 commit**（按卡要求）。
> 任务卡：`docs/ai/evo/IMPLEMENTATION_BRIEF_VS12.md`

## 一、改动清单（文件:行）

### 1) P1-1 降级判据结构化 → `backend/app/services/research_orch.py`
- `:33` 新增 `_JSON_ERROR_PREFIX = "错误：工具 "`（工具不存在 / 未授权两种文本形态）。
- `:36-63` `_is_tool_failure` 由"只匹配文本前缀哨兵"改为**读结构**，覆盖 `_execute_tool_call` 全部 5 种失败形态：
  1. `工具执行异常：…`（`:127-128` 异常分支，旧前缀哨兵**保留兼容**）
  2. `错误：工具 X 不存在`（`:99-100`）
  3. `错误：工具 X 未授权给当前 Agent`（`:96-97`）
  4. `{"success": false, ...}`（`:113-116` 参数校验失败）
  5. `{"success": false, ...}`（`:123-126` 工具跑了但失败）
  - 以 `{` 开头 → `json.loads` 后看 `success`（`success is not True` 即失败）；
    **明确不用"以 `{` 开头"判失败**，docstring 写明原因（成功结果同样是 JSON）。
  - JSON 解析不了 → 判失败（错误场景 2）。
- `:243` `tool_failed` 经 `_mark_agent_degraded` 追加（同因只记一次，错误场景 1）。

### 2) P1-3 `node_failed` 改非致命 → `research_orch.py`
- `:375-391` `node_failed` 分支：`yield "error"` → **`yield "agent_failed"`**（`:384`）；
  仍写 `【分析失败】…` 占位、仍置 `degraded = True`、内容仍进 `agent_results`。
- `:308` **真致命路径原样保留**：`except LLMError`（拿不到 LLM client）仍 `yield "error"` + `return`。
- 全文件复核：仅这两处 `yield "error"`（`:308` 致命、`:384` 已改非致命）。
- `:282-287` `run_research` docstring 补齐 `agent_failed` / `error` 的语义边界。

### 3) P1-2 产出质量判据 → `research_orch.py` + `backend/app/services/llm_client.py`
- `research_orch.py:170-179` 新增 `_flag_incomplete_output`：
  空内容（`content.strip()` 为空）→ `empty_content`；`finish_reason == "length"` → `output_truncated`。
- `research_orch.py:233` / `:266` 在两个产出出口（无工具调用的最终回答、工具循环耗尽后的强制收敛）判定。
- `llm_client.py:104-117` 新增 `_finish_reason_of(data)`：从 `choices[0].finish_reason` 读取
  （**choice 级字段，不随 usage 回传**），缺失/非法结构返回 None（不误报截断）。
- `llm_client.py:249-294`（`chat_with_tools`）/ `:296-344`（`chat_with_tools_safe`）：
  新增 **keyword-only** `with_finish_reason: bool = False`；为 True 时额外返回第 4 项 `finish_reason`；
  默认 False 时返回**仍是 3 元组**（公共契约不变，既有调用方零影响）。
- `llm_client.py:392` / `:469` `chat_with_tools_loop` 两处改读 4 元组（解包时忽略该值，行为不变）。
- `research_orch.py:149-166` 新增 `_request_tool_round`（统一取回 finish_reason）；
  `:138-146` `_unpack_tool_response` 兼容 3/4 元组返回形态。

### 4) 测试改动（5 个文件）
- `backend/tests/test_research_orch.py`：
  - `test_unexpected_agent_failure_emits_error_and_completes` → 重写为
    `test_unexpected_agent_failure_is_non_fatal_and_keeps_other_agents`（`:183-217`）。
  - 新增 `test_missing_llm_client_is_still_fatal`（`:220-233`，致命路径不回归）。
  - 新增 `FailingTool` / `ValidatingTool` + `TOOL_FAILURE_FORMS` + 参数化
    `test_every_tool_failure_form_marks_degraded`（`:600-670`，5 形态各一条）。
  - 新增 `test_empty_agent_content_marks_degraded`、`TruncatedClient` +
    `test_truncated_agent_output_marks_degraded`、`test_three_tuple_return_is_still_supported`。
  - 测试替身同步：`FakeToolCallingClient` / `MockLLMClient` / `ExhaustingToolClient` 接受
    `with_finish_reason` 关键字（前两个返回 4 元组，`ExhaustingToolClient` **刻意保留 3 元组**
    以覆盖 `_unpack_tool_response` 的兼容路径）。
- `backend/tests/test_llm_client.py`：新增
  `test_tool_chat_can_return_finish_reason_without_breaking_legacy_arity`（默认 3 元组契约 + 4 元组取值）；
  两个 `chat_with_tools_loop` 替身改 4 元组。
- `backend/tests/test_chat_tools.py`：两个 `fake_safe` 替身改 4 元组 + `**kwargs`。
- `backend/tests/test_memory.py`：`MemoryProbeClient.chat_with_tools_safe` 加 `**kwargs`（其余未动）。
- **前端零改动；`routers/research.py` 零改动**（其 `agent_failed` 本就是非致命转发，`error` 仍 fail+break）。

## 二、实测原始输出（门禁）

```
E:\Code_file\Projects\finquant-hub\backend> .venv\Scripts\python.exe -m pytest tests/test_research_orch.py tests/test_research_jobs.py tests/test_llm_client.py -q --no-cov -p no:cacheprovider
.................................................................................                                                        [100%]
81 passed in 14.24s
```

```
E:\Code_file\Projects\finquant-hub\backend> .venv\Scripts\python.exe -m ruff check .
All checks passed!
```

与本改动相邻的两个测试文件（不在门禁内，因本次改动触及其中替身，额外跑了）：

```
> pytest tests/test_chat_tools.py tests/test_memory.py -q --no-cov -p no:cacheprovider
8 passed in 4.45s
```

### 核心判据实测（12 条 VS12 相关用例逐条）

```
tests/test_research_orch.py::test_unexpected_agent_failure_is_non_fatal_and_keeps_other_agents PASSED
tests/test_research_orch.py::test_missing_llm_client_is_still_fatal PASSED
tests/test_research_orch.py::test_complete_flow_marks_quality_audited PASSED
tests/test_research_orch.py::test_agent_llm_error_is_non_fatal_degraded PASSED
tests/test_research_orch.py::test_every_tool_failure_form_marks_degraded[tool_not_found] PASSED
tests/test_research_orch.py::test_every_tool_failure_form_marks_degraded[tool_not_authorized] PASSED
tests/test_research_orch.py::test_every_tool_failure_form_marks_degraded[argument_validation_failed] PASSED
tests/test_research_orch.py::test_every_tool_failure_form_marks_degraded[tool_returned_success_false] PASSED
tests/test_research_orch.py::test_every_tool_failure_form_marks_degraded[tool_raised_exception] PASSED
tests/test_research_orch.py::test_empty_agent_content_marks_degraded PASSED
tests/test_research_orch.py::test_truncated_agent_output_marks_degraded PASSED
tests/test_research_orch.py::test_three_tuple_return_is_still_supported PASSED
====== 12 passed, 12 deselected in 3.48s ======
```

### 变异敏感性实测（把 `_is_tool_failure` 退回只认前缀哨兵）

方法：临时 pytest 插件（放 `$env:TEMP`，跑完已送回收站）在导入期把
`research_orch._is_tool_failure` 换回旧实现：

```python
def _legacy_is_tool_failure(result_text):
    return isinstance(result_text, str) and result_text.startswith(ro._TOOL_ERROR_PREFIX)
```

原始输出：

```
> pytest tests/test_research_orch.py -q --no-cov -p no:cacheprovider -p vs12_mutant_plugin
E  AssertionError: tool_not_found 未被判为降级：reasons=[]
E  AssertionError: tool_not_authorized 未被判为降级：reasons=[]
E  AssertionError: argument_validation_failed 未被判为降级：reasons=[]
E  AssertionError: tool_returned_success_false 未被判为降级：reasons=[]
FAILED tests/test_research_orch.py::test_every_tool_failure_form_marks_degraded[tool_not_found]
FAILED tests/test_research_orch.py::test_every_tool_failure_form_marks_degraded[tool_not_authorized]
FAILED tests/test_research_orch.py::test_every_tool_failure_form_marks_degraded[argument_validation_failed]
FAILED tests/test_research_orch.py::test_every_tool_failure_form_marks_degraded[tool_returned_success_false]
4 failed, 20 passed in 9.08s
```

结论：**恰好前四种挂、异常形态仍通过**，与卡里 `:69-70 / :66-67 / :81-86 / :91-94 / except`
五种形态表一致 —— 变异敏感成立。

## 三、验收标准逐条对照

| # | 验收标准 | 结论 | 证据 |
| --- | --- | --- | --- |
| 1 | Agent 抛非 LLMError 异常 → 不再出现 `error`、有 `done`、`quality=degraded`、其余 Agent 内容仍在报告内 | ✅ | `test_unexpected_agent_failure_is_non_fatal_and_keeps_other_agents`（断言 `"error" not in event_names`、`agent_failed` 载荷、`done.report.quality=="degraded"`、`financial_analysis`/`industry_analysis` 文本仍在） |
| 2 | 工具失败 5 形态各一条，均置 degraded，且变异敏感 | ✅ | 参数化 5 条全 PASSED；变异实测前四种 FAILED |
| 3 | Agent 返回空内容 → degraded | ✅ | `test_empty_agent_content_marks_degraded`（`reasons == ["empty_content"]`） |
| 4 | 截断 `finish_reason == "length"` → degraded | ✅ **已实现** | `test_truncated_agent_output_marks_degraded` + llm_client 侧 `test_tool_chat_can_return_finish_reason_without_breaking_legacy_arity` |
| 5 | 致命路径不回归（拿不到 LLM client 仍 failed） | ✅ | `test_missing_llm_client_is_still_fatal`（事件流只有 `{"error": "无可用模型"}`）；`research_orch.py:308` 未改 |
| 6 | 正常路径 `quality=audited`、13 章不变 | ✅ | `test_complete_flow_marks_quality_audited`、`test_mock_llm_runs_complete_four_agent_research_flow`（`len(chapters)==13`）全绿 |
| 7 | 门禁 | ✅ | 81 passed；`ruff check .` All checks passed |

## 四、未做 / 未解决问题

1. **`chat_with_tools_loop`（`llm_client.py`）未消费 finish_reason**：它现在能拿到该值但**未使用**，
   `tool_loop_done`/`tool_loop_exhausted` 事件里也没有截断信号。研究路径（`research_orch`）已覆盖，
   `routers/chat.py:189` 的对话路径仍不感知截断。**未做原因**：超出本卡范围（卡只要求研究路径降级可见），
   且改事件载荷会触及前端 SSE 消费方。**风险**：对话路径的截断仍不可见（与改前一致，无回归）。
2. **`test_api.py` 未跑**（卡明确禁止）；已用 grep 确认 `tests/` 内没有依赖"node_failed → error"
   旧行为的断言，故该文件预期不受影响，但**未经实测**。
3. **`_unpack_tool_response` 的 3 元组兼容分支**保留（防御性），由
   `test_three_tuple_return_is_still_supported` + `ExhaustingToolClient`（刻意返回 3 元组）覆盖；
   生产路径（`LLMClient`）恒为 4 元组。
4. 未改 `docs/HANDOVER.md` / `task/CHANGELOG.md`（卡只要求写本结果文件，且并行 agent 可能同时改这两个文件）。

## 五、取舍说明（编排者审查项）

- **已按编排者意见删除 `_request_tool_round` 的 `except TypeError` 兜底**。原写法会吞掉客户端内部
  真实的 TypeError（JSON/序列化 bug 等）并让同一次 LLM 调用**被重发一遍**（白付一次 API 费用）——
  与 VS12"失败必须可见、不得静默吞掉"的主题自相矛盾。现在直接
  `await call(messages, tools, with_finish_reason=True)`，不支持的替身改为显式接受 `**kwargs`。
- 保留 `_unpack_tool_response`：只兼容**返回值形态**（3/4 元组），不掩盖调用异常，无副作用。

## 六、风险

- **低**：`llm_client` 的公共契约未变（默认仍 3 元组）；新增关键字为 keyword-only。
- **低**：`agent_failed` 在 `routers/research.py:261-296` 与 `scheduler.py:159-171` 均为直通/非致命，
  两处持久化都从 `report_data.quality`（源头）取值，degraded 不会被反写成 audited（VS-7 语义保持）。
- **中-低**：`_is_tool_failure` 新增"JSON 解析失败即失败"的判定。理论上若某工具成功但返回**非 JSON**
  且以 `{` 开头的文本会误判；实测 `_execute_tool_call` 的所有成功分支都返回合法 JSON
  （`:123-126`），报告中无此形态。
- **无新依赖、无文件删除、未 commit。** 临时变异插件已送回收站（`Test-Path` 为 False）。
