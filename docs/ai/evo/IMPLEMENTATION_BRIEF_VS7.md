# IMPLEMENTATION_BRIEF — Vertical Slice 7：降级语义补全（落库一致 + 捕获面扩大）

> Orchestrator 第五阶段产物，2026-09-13。来源：**R2 可靠性审计 D2 的 P0 + P1**（`RELIABILITY_REPORT_R2.md`）。

## 目标
让"降级"这个诚实信号**在所有落库路径上都成立**、且**涵盖真正的失败类型**：
1. **P0 落库一致**：定时研究（scheduler 路径）产出的降级报告，不得以"与正常报告无区别的 completed"入库。
2. **P1 捕获面**：除 `LLMError` 外，其它会让报告"实际不完整"的情况也必须标降级。

## 用户场景
用户设了定时研究。某天模型/工具出问题，报告实际不完整。**现状**：交互路径能看到降级提示，但**定时路径的报告重开后与正常报告一模一样**——用户据此做投资判断。且若失败发生在**工具调用**层（而非 LLM 层），任何路径都不标降级。

## 当前问题（证据，已核实/待实现者复核）
- **P0 落库**：`research_orch.py:327-329` 把 `quality` 放在 `done_payload` **顶层**；`scheduler.py:171-183`（定时路径）只持久化 `payload["report"]` 与 `payload["agent_results"]` → **quality 丢失**；而 `routers/research.py`（交互路径）额外把 quality 合并进 report 才落库。**两条路径行为不一致。**
- **P1a 界面与导出口径不一致（编排者已实测核实）**：
  - `report_builder.py:368`：`lead_review_status = "audited" if lead else "degraded"` → **lead 返回空内容即 degraded**；
  - `research_orch.py:329`：`quality` 仅在**异常**路径置 degraded（`:232` agent LLMError、`:262` node_failed、`:293` lead LLMError）；
  - ⇒ **lead 空返回（无异常）时 `lead_review_status='degraded'` 而 `quality='audited'`** → Markdown 导出带降级提示、**屏上 Alert 不显示**（VS-3 的 Alert 只看 `quality`）。同一份报告两种口径。
- **P1b 捕获面**（D2 标注，实现者需复核行号）：
  - 工具异常被 `llm_client.py:318-322` 吞成文本，不置 degraded；
  - `tool_loop_exhausted`（`research_orch.py` 事件白名单 `:254` 附近）未被消费，不置 degraded。

## 理想行为
- 质量标记由**单一源头**产生并随 `report_data` 一起持久化 → 交互/定时两条路径天然一致，无需各自补救。
- 任何导致"报告内容不完整"的已识别情况都置 `degraded`：agent LLMError、agent 非 LLM 异常、工具异常、工具循环耗尽、lead 失败或空返回。

## 涉及模块
- `backend/app/services/research_orch.py`（源头把 quality 并入 report_data；扩大 degraded 置位点）
- `backend/app/routers/research.py`（交互路径的合并可保留或简化——若源头已含，避免重复/冲突）
- `backend/app/services/scheduler.py`（确认定时路径落库的是含 quality 的 report_data）
- `backend/tests/test_research_orch.py`、`tests/test_research_jobs.py` 或新增（**调度路径落库断言**）

## 不能破坏
- **正常（无失败）路径零回归**：`quality='audited'`、报告结构、`lead_review_status` 语义不变；前端 `resolveReportQuality`（VS-3 已同时兼容顶层与 report 内）**零改动**。
- 不改 `model_pricing`/`llm_usage`/`context` 等无关域；不加依赖；不删文件；不 commit。
- 报告 13 章结构与既有键不破坏。

## 验收标准
1. `report_data.quality` 在**交互路径与定时路径**都被持久化（可用测试断言 DB 中 `research_reports.report_data` 含 quality）。
2. 下列情况均置 `degraded`：agent `LLMError`、agent 非 LLM 异常、**工具异常**、**工具循环耗尽**、**lead 失败或空返回**。
3. 无失败时 `quality='audited'`，报告结构与既有断言零回归。
4. 新增/更新测试覆盖上述路径 + **调度路径落库**。
5. 门禁：backend `pytest`（相关文件必须全绿）+ ruff。

## 错误场景
- lead 返回空字符串 → 必须 degraded（不是 audited）。
- 工具执行异常导致某 agent 内容为占位文本 → 必须 degraded。
- 工具循环耗尽（`tool_loop_exhausted`）→ 必须 degraded。
- 定时任务路径：完成事件落库后，重新读取报告应能看到 quality。

## 测试要求
- 单元：各失败类型 → `quality == 'degraded'`；正常 → `'audited'`。
- 落库：模拟 scheduler 的 done 处理，断言 `research_reports.report_data` 内含 quality（这是本卡 P0 的直接证据）。
- 回归：既有 research/调度测试全绿。
