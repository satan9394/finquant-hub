# EVALUATION_RESULT_VS7 — 降级（degraded）全落库路径验收

**验收者**：EVALUATOR（独立验收，未修改任何实现文件）
**日期**：2026-08-31
**范围**：`docs/ai/evo/IMPLEMENTATION_BRIEF_VS7.md` 四项声称改动（工作树未提交）
**判定**：**REJECT**（1 项阻断性缺陷；P0 / P1b / router / tool_loop_exhausted 三项核心机制经核实成立）

---

## 1. 结论速览

| 声称项 | 位置 | 独立核验结果 |
|---|---|---|
| P0 quality 并入 report_data | `research_orch.py:355` | **成立**（定时路径必然落库，见 §3） |
| P1a lead 空内容判降级 | `research_orch.py:328` | **口径不一致 → 阻断**（见 §2） |
| P1b 工具异常识别 + 循环耗尽 | `llm_client.py:319-330` / `research_orch.py:27-32,156-158,174-175` | **成立**（但 llm_client 那半不在研究路径上，见 §4.2） |
| router 幂等兜底 | `routers/research.py:276-284` | **成立**（无 degraded→audited 反写，见 §4.3） |
| 新增测试真实性 | `tests/test_research_jobs.py:188-219` | **真走 DB 落库路径**，但对 P0 源头行不敏感（见 §5） |

回归：`pytest tests/test_research_orch.py tests/test_research_jobs.py tests/test_llm_client.py -q --no-cov` → **56 passed**（17.82s，exit 0）。无失败路径仍 `quality='audited'`（`test_research_orch.py:330-354`），13 章结构与既有断言未破。

---

## 2. 阻断问题：P1a「同口径」不成立（谓词不同）

**文件:行**
- `backend/app/services/research_orch.py:328` — `if lead_reasons or not lead_content: degraded = True`
- `backend/app/services/report_builder.py:296,368` — `lead = parse_lead_review(lead_content)` / `"lead_review_status": "audited" if lead else "degraded"`

**原因**
两者取的是**同一个源字符串**（`research_orch.py:384` 把 `agent_results["report_lead"]["content"]` 原样传给 `build_unified_report(lead_content=lead)`，同源这点没问题），但**真值谓词不同**：

- `research_orch` 判的是 **原始字符串**非空；
- `report_builder` 判的是 `parse_lead_review()` **解析出的 JSON dict** 是否非空。

`parse_lead_review`（`report_builder.py:95-108`）在「无 JSON 括号 / 解析失败」时返回 `{}`，其 docstring 自述 *"invalid model output remains explicit unknown"*——即代码库**明确预期 lead 会输出不可解析内容**。

**实测证据**（在本仓库 venv 中执行）
```
$ .venv\Scripts\python.exe -c "from app.services.report_builder import parse_lead_review; c='抱歉，我无法完成本次审核。'; ..."
research_orch predicate (not lead_content) -> degraded: False
report_builder predicate (lead=parse_lead_review(c)) -> degraded: True
```

**后果**：lead 返回*非空但无 JSON* 的最终答复（模型给散文而非 JSON，是常态失败模式）且本轮无工具异常、循环未耗尽时 →
`quality = "audited"`（前端 Alert / 落库 `report_data.quality`）而 `report.lead_review_status = "degraded"`（Markdown 导出）。
这正是 P1a 声称要消除的「屏上提示与导出提示互相矛盾」，**只在 lead 空串这一种情况下被消除**。
`research_orch.py:324-327` 的注释「用与 report_builder 相同的真值判定」与事实不符。

**建议**（一行修复，二选一）
```python
# 方案 A：复用同一解析函数（推荐，真·同口径）
from ..services.report_builder import parse_lead_review
if lead_reasons or not parse_lead_review(lead_content):
    degraded = True

# 方案 B：以 report_data 的既有结论为准（构建 report 之后判定）
quality = "degraded" if degraded or report_data.get("lead_review_status") != "audited" else "audited"
```
并补一条变异敏感测试：`fake_call_agent(report_lead)` 返回 **散文**（非空、非 JSON），断言 `done["quality"] == "degraded"` 且与 `done["report"]["lead_review_status"]` 一致。

---

## 3. P0 复核通过：定时路径确实会持久化 quality

- 源头：`research_orch.py:350-355` 先 `_build_report(...)`，再 `report_data["quality"] = quality`，随后 `done_payload["report"] = report_data`（`:366`）。**无任何裁剪/重建**：`routers/research.py:285` 是 `{**report, "quality": quality}` 扩写；`scheduler.py:172` 直接 `payload.get("report", {})` 并 `json.dumps` 落库（`:174-183`）。
- 因此 `report_data.quality` **必然**进入 `research_reports.report_data`。source-level 单一事实来源成立。
- 注意：`research_orch.py:355` 在 `report_progress` 循环*之前*赋值，`persist_research_candidates`（`scheduler.py:184`）只读不写 quality，无覆盖风险。

## 4. 其余三项复核

### 4.1 `tool_loop_exhausted` 追加位置安全（最危险点已排除）
`research_orch.py:144-149`：`for _round in range(5)` 内 `if not tool_calls: return content, tool_calls_log` —— **正常路径提前 return**，`:174-175` 的 append 只在真正跑满 5 轮后执行。**不存在「所有报告都被标 degraded」的风险**。测试 `test_research_orch.py:382-393`（`ExhaustingToolClient` 每轮都请求工具）与 `:468-491`（parametrize `tool_failed`/`tool_loop_exhausted`）覆盖该语义。
另：`swarm_orch.py:219` 调用同一 `_call_agent` 但**不传** `degraded_reasons`（默认 `None`），`if degraded_reasons is not None` 守卫使该路径行为不变，无回归。

### 4.2 P1b 成立，但 llm_client 那一半不在研究路径上
- 真正生效的识别链：`research_orch._execute_tool_call`（`:95-96`）捕获异常 → 返回 `"工具执行异常：{exc}"` → `_is_tool_failure`（`:30-32`）前缀匹配 → `:157-158` 记 `tool_failed` → `:260-261` `degraded = True`。`_execute_tool_call` 的成功结果一律是 `json.dumps({...})`（以 `{` 开头），**不存在前缀误判**。
- **但** `research_orch.py:145` 调用的是 `client.chat_with_tools_safe`（`llm_client.py:196-236`：单轮原始请求，**不执行工具、不接受 event_sink**），而新增的 `tool_failed` 补发位于 `llm_client.py:326` 的 `chat_with_tools_loop`（`:249`）内部。`chat_with_tools_loop` 的唯一生产调用方是 `routers/chat.py:189`。
- 即：llm_client 的 `tool_failed` 修复**对本任务的降级判定链路没有贡献**（本身无副作用、对 chat 路径有益），P1b 在 VS-7 上生效完全靠 research_orch 自有前缀识别。声称中把两者描述为一条因果链，属**表述不实**，非功能缺陷。

### 4.3 router 幂等兜底成立
`routers/research.py:280-285`：顶层 `quality` 缺失时回退 `report["quality"]`，仍缺才 `or "audited"`；随后 `{**report, "quality": quality}`。**不会**把 degraded 反写成 audited（旧行为已消除）。
残留（非阻断，仅记录）：若未来某生产者使顶层=`"audited"` 而 `report["quality"]="degraded"`，顶层仍会覆盖内部。当前 `run_research` 两者恒等（同一 `quality` 变量），故不可达。更严格写法：`if quality == "audited" and report.get("quality") == "degraded": quality = "degraded"`。

---

## 5. 测试真实性

- `tests/test_research_jobs.py:188-219`：**确实**调用 `scheduler.run_research_job` 并查询 `research_reports.report_data` 断言 `quality`（非内存对象），满足验收要求。
- **但**其 `fake_research`（`:198-206`）自己把 `quality` 预置进 `report`，且 monkeypatch 掉了 `run_research` —— 因此该用例**对 P0 源头行（`research_orch.py:355`）不敏感**：回退该行仍会通过。它锁的是「scheduler 原样落库 payload["report"]」这一未改动契约。
- P0/P1a/P1b 的变异敏感性由 `test_research_orch.py` 承担且达标：`:351`（`report.quality == "audited"`）、`:379`（空 lead → report 内 quality=degraded）、`:419`（`reasons == ["tool_failed"]`）、`:491`（原因传导到 `report_data.quality`）——回退任一实现行均会失败。
- **未覆盖**：§2 的散文 lead 场景，故 P1a 缺陷逃逸。

---

## 6. 建议处置

1. 按 §2 修复 P1a 谓词（一行）并补变异敏感用例。
2. 顺手修正 `research_orch.py:324-327` 的注释表述，或把 `research_orch.py:26` 的注释改为「research_orch 自行产生同文案前缀，与 llm_client 循环保持语义一致」。
3. 非阻断观察（可留 BACKLOG）：
   - 工具返回 `{"success": false, ...}`、或模型幻觉工具名（`_execute_tool_call:67,70` 的「未授权/不存在」分支）**不计入** degraded，与「涵盖真正的失败类型」的目标存在口径缺口；
   - router 顶层优先的潜在反转（§4.3）。

**判定**：**REJECT** — 阻断项仅 §2（P1a 口径不一致，可一行修复）；其余三项核心机制与 56 条测试均通过。
