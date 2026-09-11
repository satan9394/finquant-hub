# IMPLEMENTATION_BRIEF — Vertical Slice 12：研究失败语义收口（可见但不致命 + 判据结构化）

> Orchestrator 第五阶段产物，2026-09-13。来源：**R3 审计 D3 的三条 P1**（`RELIABILITY_REPORT_R3.md`），**编排者已逐条核实代码事实**。这是 VS-1/VS-3/VS-7 "失败诚实"主题的收口——实测仍有 3 处漏点。

## 目标
让"某个研究环节失败"**可见但不致命**：不毁掉整轮研究、且**所有**失败形态都计为降级。

## 用户场景
用户跑一次深度研究（4 个 Agent 并行 + 主编，耗时数分钟、花钱调 API）。某个 Agent 抛出一个非 `LLMError` 的异常（工具 bug、解析错误、第三方库异常等），或某个工具"跑了但失败"（如行情源全挂返回 `success:false`）。**现状**：整轮研究被判 `failed`、**另 3 个已完成 Agent 的成果全部丢弃**，用户白等白花钱；或者报告照常完成，但 `quality="audited"`——**前端零提示**，用户以为数据完整。

## 当前问题（三处，均已核实）
1. **P1-3（最严重）——一个 Agent 的异常毁掉整轮**：
   - `research_orch.py:286-295` 的 `node_failed` 分支**本意是继续**：置 `degraded = True`（`:289`）并写入 `【分析失败】` 占位（`:291-295`）；
   - 但它**同时** `yield "error"`（`:290`）；而 `routers/research.py:265-273` 收到 `error` 即 `_fail_report` + publish `failed` + **`break`**。
   - ⇒ 两者意图直接冲突，整轮被丢弃。
   - **这正是 VS-1 修过的同一类缺陷**（当时把 agent `LLMError` 的 `error` 改成非致命的 `agent_failed`），但**只堵了两条路径中的一条**。
   - **分界（勿误改）**：`research_orch.py` 全文只有两处 `yield "error"`——`:219`（拿不到 LLM client，**真致命，须保留**）与 `:290`（须改为非致命）。
2. **P1-1 = `BACKLOG-049`**：降级判据是**字符串前缀哨兵** `_TOOL_ERROR_PREFIX = "工具执行异常："`（`research_orch.py:30-32`，判定在 `:157-158`），而工具失败有 **5 种形态，只有 1 种匹配**：
   | 位置 | 返回 | 现是否降级 |
   | --- | --- | --- |
   | `:69-70` | `f"错误：工具 {name} 不存在"`（模型幻觉工具名） | ❌ |
   | `:66-67` | `f"错误：工具 {name} 未授权给当前 Agent"` | ❌ |
   | `:81-86` | `{"success": false, ...}`（参数校验失败） | ❌ |
   | `:91-94` | `{"success": result.success(false), ...}`（**工具跑了但失败**） | ❌ |
   | `except` 分支 | `f"{_TOOL_ERROR_PREFIX}{exc}"` | ✅ 唯一 |
   ⇒ **API Key 失效 / 行情源全挂**时，四个 Agent 拿着空数据编结论，报告仍以 `audited` 落库、前端无提示。
3. **P1-2**：Agent 产出**无质量判据**——`if not tool_calls: return content`（`:147-149`）不判空；`llm_client` **从不读 `finish_reason`**（`llm_client.py:252-268`）⇒ `max_tokens` 截断不可见，**空/半截章节仍判 audited**。

## 理想行为
1. 单个 Agent 失败（`node_failed`）→ 管线**继续**，该 Agent 记为 `【分析失败】`，最终报告 `done` 且 `quality="degraded"`；**其余 Agent 成果保留**。
2. **所有**工具失败形态（上述 5 种）都计入降级。
3. Agent 返回**空内容**或 `finish_reason == "length"`（截断）→ 计入降级。
4. 真正的致命错误（`research_orch.py:219` 拿不到 LLM client）**仍应** `failed`。

## 涉及模块
- `backend/app/services/research_orch.py`（`:290` 事件类型、降级判据结构化、产出质量判据）
- `backend/app/services/llm_client.py`（**仅在需要**让 `chat_with_tools*` 回传 `finish_reason` 时最小改动；若改动过大，可在结果文件说明并只做 `research_orch` 侧可判定部分）
- `backend/tests/test_research_orch.py`（测试）

## 不能破坏
- `research_orch.py:219` 的致命语义（拿不到 client → `error` → router 判 failed）。
- VS-7 已建立的语义：`quality` 并入 `report_data` 源头落库、lead 空/不可解析判降级（`parse_lead_review` 同口径）、`routers/research.py` 的幂等合并**不把 degraded 反写成 audited**。
- `routers/research.py` 的 `error` 分支行为（对真正的致命错误仍须 fail+break）。
- 13 章报告结构、`AGENT_KEYS`、前端（`resolveReportQuality` 已兼容，**前端应零改动**）。
- 无新依赖；不删文件；不 commit。

## 验收标准（可判定）
1. **模拟某 Agent 抛非 `LLMError` 异常**（触发 `node_failed`）→ 事件流中**不再出现 `error`**（应为 `agent_failed`）；最终有 `done`；`quality == "degraded"`；**其余 Agent 的内容仍在报告内**（断言某个正常 Agent 的文本存在）。
2. **工具失败 5 形态各一条测试**：分别构造"工具不存在 / 未授权 / 参数校验失败 / `success:false` / 抛异常"，断言均置 `degraded`（**变异敏感**：把判据退回只认前缀哨兵时，前四种必须挂）。
3. Agent 返回**空内容** → `degraded`。
4. **截断**：若实现了 `finish_reason` 判据 → `finish_reason == "length"` 时 `degraded`；若未实现，须在结果文件**明确写"未做 + 原因"**（不得沉默略过）。
5. **致命路径不回归**：拿不到 LLM client 时仍 `failed`（既有测试应覆盖，若无则补一条）。
6. 正常路径 `quality == "audited"` 零回归；13 章结构不变。
7. 门禁：`pytest tests/test_research_orch.py tests/test_research_jobs.py tests/test_llm_client.py -q --no-cov` 全绿 + `ruff check .` 干净。**不要跑 `tests/test_api.py` / 全量**（本沙箱会挂）。

## 错误场景
- 同一 Agent 同时命中多种失败形态 → 只记一次降级即可（**不要**因为记了 5 次而崩溃或重复写）。
- 工具返回的 JSON 无法解析 → 归入失败（不得当成成功）。
- 降级原因列表为空但内容为空 → 仍须降级（质量判据独立于工具判据）。

## 测试要求
- 五个工具形态各一条变异敏感测试；`node_failed` 一条（断言"不 yield error + 其余成果保留"）；空内容一条；正常路径零回归一条。
- 由独立 Evaluator 复核：①`node_failed` 是否真的改成非致命且**未误改** `:219`；②五种形态是否**都被**判降级（而非只加注释）；③致命路径是否仍致命。

## 建议实现方向（供参考，非强制）
把"工具失败"从**字符串前缀**改为**结构化信号**：让 `_execute_tool_call` 的所有失败分支返回可识别的结构（例如统一带 `success:false`，或在返回对象上附标记），`_is_tool_failure` 改为读结构而非匹配前缀；同时保留对旧前缀的兼容判定以免遗漏。
