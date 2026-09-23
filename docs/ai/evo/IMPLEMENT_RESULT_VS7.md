# IMPLEMENT_RESULT — Vertical Slice 7（降级语义补全：落库一致 + 捕获面扩大）

> IMPLEMENTER 结果文件，2026-09-13。任务卡：`docs/ai/evo/IMPLEMENTATION_BRIEF_VS7.md`。**未 commit。**

## 1. 结论

P0 / P1a / P1b 全部落地为代码，门禁全绿：目标三文件 **56 passed**，扩展回归 **78 passed**，`ruff check .` → `All checks passed!`。
核心做法：quality 由 `research_orch.run_research` **单一源头**产生并**并入 `report_data` 内部**，定时路径（只落 `payload["report"]`）无需改动即天然带上质量标记。

## 2. 改动（文件:行）

### `backend/app/services/research_orch.py`
| 行 | 改动 |
|---|---|
| 27 | 新增 `_TOOL_ERROR_PREFIX = "工具执行异常："`（与 `llm_client` 同文案，作为"工具异常被吞成文本"的唯一可识别信号） |
| 30-32 | 新增 `_is_tool_failure(result_text)` 判定助手 |
| 96 | `_execute_tool_call` 的 except 改用 `_TOOL_ERROR_PREFIX`（行为不变，仅去掉魔法字符串重复） |
| 110-116 | `_call_agent` 新增 **keyword-only** `degraded_reasons: list[str] \| None = None`（默认 None，既有调用零影响） |
| 157-158 | 工具并发执行后：任一结果命中 `_is_tool_failure` → `degraded_reasons.append("tool_failed")`（**P1b-1 研究路径**） |
| 174-175 | 5 轮 tool_use 循环耗尽、强制收敛前 → `degraded_reasons.append("tool_loop_exhausted")`（**P1b-2 研究路径**） |
| 244-248 | `run_agent` 用局部 `agent_reasons` 接收，非空即 `degraded = True` |
| 317-318 | lead 调用同样传入 `lead_reasons` |
| 328 | **P1a**：`if lead_reasons or not lead_content: degraded = True` —— 与 `report_builder.py:368` 的真值判定（`"audited" if lead else "degraded"`）**完全同口径** |
| 354-355 | **P0**：`quality = "degraded" if degraded else "audited"` → `report_data["quality"] = quality`（源头并入报告内部） |
| 362 | `done_payload["quality"]` 保留顶层（兼容既有 SSE 消费方与前端 `resolveReportQuality`），值与 report 内一致 |

### `backend/app/services/llm_client.py`
| 行 | 改动 |
|---|---|
| 319-330 | 工具执行异常分支补发 `await event_sink("tool_failed", {tool_name, arguments, error})`（`event_sink` 为 None 时跳过）。`tool_failed` 早在 `TOOL_LOOP_EVENTS`（:27）声明却从未发出，此处补齐 —— 即 brief 所指"异常被吞成文本、编排层无信号"处 |

### `backend/app/routers/research.py`
| 行 | 改动 |
|---|---|
| 276-284 | 交互路径合并改为幂等兜底：顶层 `quality` 缺失时沿用 `report` 内已有 quality，最后才回落 `"audited"`。**修复前** `data.get("quality", "audited")` 会在顶层缺失时把 degraded 反写成 audited。顶层存在时语义与改动前完全一致 |

### `backend/tests/test_research_orch.py`
- 扩展 `test_complete_flow_marks_quality_audited`：新增 `report["quality"] == "audited"` 与 `report["lead_review_status"] == "audited"`（口径一致 + 内嵌 quality 断言）。
- 新增 `test_lead_empty_content_is_degraded_and_matches_lead_review_status`（**P1a**：lead 空内容 → 顶层与 report 内 quality 均 degraded，且与 `lead_review_status` 一致）。
- 新增 `test_call_agent_flags_tool_execution_failure`（**P1b-1** 单元）。
- 新增 `test_call_agent_flags_tool_loop_exhaustion`（**P1b-2** 单元，断言 5 轮耗尽后 `reasons == ["tool_loop_exhausted"]`）。
- 新增 `test_call_agent_reports_no_degraded_reason_on_happy_path`（零回归：全成功 → reasons 为空）。
- 新增参数化 `test_agent_degraded_reasons_propagate_to_report_data[tool_failed / tool_loop_exhausted]`（原因 → `report_data.quality == "degraded"` 全链路传导）。

### `backend/tests/test_research_jobs.py`
- 新增参数化 `test_scheduled_run_persists_report_quality_into_report_data[audited/degraded]`：走 `scheduler.run_research_job` 完成路径，断言 DB 中 `research_reports.report_data` 的 `quality` 与 done 事件一致（**P0 的直接证据：定时路径落库**）。

## 3. 测试结果（原始输出）

门禁（任务卡指定）：
```
cd E:\Code_file\Projects\finquant-hub\backend
$env:no_proxy='localhost,127.0.0.1,::1'
.venv\Scripts\python.exe -m pytest tests/test_research_orch.py tests/test_research_jobs.py tests/test_llm_client.py -q --no-cov -p no:cacheprovider
........................................................                                                        [100%]
56 passed in 18.03s
```
```
.venv\Scripts\python.exe -m ruff check .
All checks passed!
```
扩展回归（编排者建议集，避开本沙箱会挂起的 `tests/test_api.py`）：
```
.venv\Scripts\python.exe -m pytest tests/test_research_orch.py tests/test_research_jobs.py tests/test_llm_client.py tests/test_chat_tools.py tests/test_memory_rollout.py tests/test_model_ux.py -q --no-cov -p no:cacheprovider
..............................................................................                                  [100%]
78 passed in 28.44s
```
说明：`tests/test_api.py` 在本沙箱 51 例报 `httpx.InvalidURL: Invalid port: ':1]'`（`no_proxy` 含 `::1` 触发 httpx 解析），与本次改动无关；编排者亦实测该文件在本环境挂起，故未纳入门禁。

## 4. 未做（诚实声明）

1. **`discussion_orch` / 其它 `chat_with_tools_loop` 消费方未接 `tool_failed`**。
   `llm_client` 现在会发出 `tool_failed`（P1b-1 的"捕获面"已补齐），但本卡范围是"研究报告的降级语义"；讨论编排器没有 quality/degraded 语义，接入会引入本卡未定义的新状态机语义。故仅补齐信号发出，不做消费端改造。风险：`tool_failed` 目前只有 `routers/chat.py` 的事件收集器可见（属 `TOOL_LOOP_EVENTS` 白名单内，不破坏既有枚举）。
2. **`research_orch` 未消费 `llm_client` 的 `tool_loop_exhausted` 事件**，原因：研究路径**不经过** `llm_client.chat_with_tools_loop`（`_call_agent` 用自己的 5 轮循环 + `chat_with_tools_safe`），该事件在研究报告路径根本不会产生。研究路径的等价物已在 `_call_agent` 的循环耗尽处直接置位（:174-175），语义等价、且不引入跨模块事件管道。
3. **`_call_agent` 的 lead 空内容未发 `agent_failed` 事件**：仅置 degraded（前端 Alert 走 quality，无需新事件），避免新增 SSE 事件类型影响既有消费方。

## 5. 风险

- **低**。所有新增参数均为 keyword-only 且默认 `None`；既有 6 处 `_call_agent` 调用（生产 2 处 + 测试 4 处）签名兼容（测试用 `**kwargs` 吸收）。
- `report_data` 新增顶层 `quality` 键为**纯增量**：13 章结构、`schema_version`、`lead_review_status` 及既有断言均未改动；前端 `resolveReportQuality` 已同时兼容顶层与 report 内，**前端零改动**。
- 定时路径落库内容变为 `{"...报告字段", "quality": ...}`，`persist_research_candidates` / evidence 收集（递归遍历字符串）不受影响。
- 无新依赖、无 ORM/连接池/DAL 变更、无文件删除、未改前端、未 commit。

## 6. 证据

- 正常路径零回归：`test_complete_flow_marks_quality_audited`、`test_mock_llm_runs_complete_four_agent_research_flow`（13 章断言 `len(done["report"]["chapters"]) == 13` 仍绿）。
- P1a 反例：`test_lead_empty_content_is_degraded_and_matches_lead_review_status` —— 改动前 `quality` 为 `audited` 而 `lead_review_status` 为 `degraded`（自相矛盾），现已同口径。
- P0 落库：`test_scheduled_run_persists_report_quality_into_report_data[degraded]` 直接读 DB `research_reports.report_data` 断言。
- P1b：`test_call_agent_flags_tool_execution_failure`（工具异常）、`test_call_agent_flags_tool_loop_exhaustion`（循环耗尽）。
- 相关行号：`research_orch.py:27,30-32,96,110-116,157-158,174-175,244-248,317-318,328,354-355,362`；`llm_client.py:319-330`；`routers/research.py:276-284`。

---

## 7. 独立 Evaluator REJECT → 修复记录（阻断项）

**Evaluator 判定**：REJECT（1 项阻断）。P0 落库链、`tool_loop_exhausted` 位置、router 幂等兜底三项经其独立核实**成立**；但 **P1a 声称的"同口径"为假**。

**阻断缺陷（谓词不同，非源不同）**：原实现 `research_orch.py:328` 判 `not lead_content`（**原始字符串**真值），而 `report_builder.py:296,368` 判 `parse_lead_review(lead_content)` 的**解析结果 dict** 真值。对"**非空但无法解析为 JSON 的散文**"（如"抱歉，我无法完成本次审核。"），二者一个说未降级、一个说降级——**P1a 想消除的矛盾依然存在**（只消除了空串这一种）。Evaluator 在本仓库 venv 实测确认。原注释"用与 report_builder 相同的真值判定"与事实不符。

**修复**：
1. `research_orch.py:20` 导入 `parse_lead_review`；判据改为 `if lead_reasons or not parse_lead_review(lead_content): degraded = True`——**复用同一解析函数**，口径逐字一致。
2. 新增变异敏感测试 `test_lead_unparseable_prose_is_degraded_and_matches_lead_review_status`（非空散文 lead → `quality` 与 `lead_review_status` 必须同为 degraded；退回旧实现必挂）。
3. 门禁复跑：`pytest tests/test_research_orch.py tests/test_research_jobs.py tests/test_llm_client.py tests/test_report_builder.py -q --no-cov` → **61 passed**；`ruff check .` → All checks passed。

**更正一处措辞不实（Evaluator 指出）**：前文暗示 `llm_client.py:319-330` 的 `tool_failed` 补发服务于研究路径——**不准确**。研究路径走 `chat_with_tools_safe`（单轮、不执行工具、无 `event_sink`），真正识别靠 `research_orch` 自有的 `_TOOL_ERROR_PREFIX` + `_execute_tool_call`。该补发位于 `chat_with_tools_loop`（生产调用方 `routers/chat.py:189`），价值是让**早已声明却从未发出**的 `tool_failed` 事件在聊天路径真正发出（独立改进，非研究路径因果链）。

**未纳入本卡的后续项（记入 BACKLOG）**：①工具返回 `{"success": false}` 与"幻觉工具名"分支不计入 degraded，与"涵盖真正失败类型"仍有口径缺口；②`swarm_orch.py:219` 调用 `_call_agent` 未接 `degraded_reasons`（签名兼容、无回归，但 swarm 报告同样看不到工具失败）；③调度落库测试对 `research_orch.py:355` 源头行不敏感（其 fake 预置了 quality），P0 灵敏度由 `test_research_orch` 侧承担。
