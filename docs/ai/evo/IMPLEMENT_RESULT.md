# IMPLEMENT_RESULT — Vertical Slice：研究失败语义修正（G-02 + G-03）

> Implementer（Orchestrator 接管执行——两次子代理实现因环境卡死）｜ 2026-09-13 ｜ **未经独立 Evaluator 验收，待质疑**

## 结论
两个核心缺口已实现，**零 schema 变更、零新依赖**：G-03（报告质量标记）落地于研究编排与路由；G-02（调度重试上限）落地于 research_jobs。后端 26 项 research 相关测试全绿 + ruff 通过。**经独立 Evaluator 质疑并修复一个关键缺陷后验收**（见下）。

## 独立 Evaluator 质疑 → 修复记录（重要）
Evaluator（独立子代理）在评估时发现关键疑点：run_agent 的 LLMError 分支原本 `context.emit("error")`，而 router 收到 `error` 事件会 `_fail_report` + **break**——agent 失败时整份报告被判 failed、done 到不了前端，G-03 的 "degraded-completed" 语义落空。核实属实，修复：
- agent 的 LLMError 改为 `emit("agent_failed")`（**非致命**，与 lead 失败同语义）——报告仍完成但 quality=degraded，前端可诚实提示"某环节失败、报告不完整"；
- 把 `agent_failed` 加入 run_research 事件转发白名单（原只有 agent_started/tool_call/agent_completed/error）；
- 新增测试 `test_agent_llm_error_is_non_fatal_degraded` 覆盖"LLMError → 非致命 → done+degraded"，杜绝回归。
- node_failed（非 LLMError 真异常）保持 error（致命 → failed 合理：连降级文本都没有）。

## 改动清单（4 文件）

### G-03 报告质量标记
1. `backend/app/services/research_orch.py`：
   - 新增 `degraded = False` 标志（agent_results 初始化处）；
   - `node_failed` 分支（agent 异常）置 `degraded = True`（本已有降级文本，现补标志）；
   - `run_research` 的 lead LLMError 分支置 `degraded = True`；
   - `done_payload` 新增 `"quality": "degraded" if degraded else "audited"`（顶层，复用 BACKLOG-033 的 audited/degraded 语义，前端已有降级提示机制）。
2. `backend/app/routers/research.py`：donne 分支把 `data.get("quality")` 写入持久化的 `report_data`（`report = {**report, "quality": ...}`），**不改变完成状态机**（status 仍 completed；前端展示诚实提示）。

### G-02 调度重试上限
3. `backend/app/services/research_jobs.py`：新增常量 `_MAX_RETRY_ATTEMPTS = 5`；`claim_research_job` 中在计算 attempt 后加 `if attempt > _MAX_RETRY_ATTEMPTS: return None`——失败 attempt 达上限后不再 claim，调度器（每 30s 抓 due job）自然停止抓取；恢复语义：下次 cron 计划（next_run_at 到达）或用户手动重跑重新计数。

### 测试（2 文件，+3 用例）
4. `backend/tests/test_research_orch.py`：
   - `test_unexpected_agent_failure_emits_error_and_completes` 追加断言 `done["quality"] == "degraded"`；
   - 新增 `test_complete_flow_marks_quality_audited`（无失败 → audited）。
5. `backend/tests/test_research_jobs.py`：新增 `test_claim_stops_retrying_after_max_attempts`（插入 job + max_attempts 条失败 run → claim 返回 None）。

## 设计决策
- **为什么用顶层 quality 而非改 report 大结构**：`lead_review_status` 已存在于 report（BACKLOG-033），它只表达 lead 成败；本次补的是"整体（含 agent）是否降级"的诚实信号。用独立的 `done_payload.quality` + 持久化 `report_data.quality`，避免动既有 13 章报告结构（正常路径零变化）。
- **为什么 G-02 用 claim 拦截而非 scheduler 判断**：claim 是单点原子入口（exclusive_transaction），在源头拦截最彻底、无并发漏洞；调度器无需感知重试次数。

## 未解决问题 / 风险
1. 前端消费：`report_data.quality` 已持久化，但**前端 Research 展示区尚未接入该字段显示降级提示**（可复用 BACKLOG-033 的 degradedNotice 组件，未做——留给后续 G-04/UX 卡或独立小改）。
2. G-02 上限后 job 的 `last_status` 仍为 failed（未标 suspended）——语义上"停止自动重试"已达成（claim 拦截），但 UI 若需显式"已暂停"状态需后续加。
3. 重试计数基于 `scheduled_research_runs.attempt`（既有字段），跨"手动重跑"是否正确重置未在测试覆盖（依赖 attempt 归档机制）。

## 证据（文件:行）
- research_orch.py `degraded` 标志：L207；run_agent LLMError → agent_failed + degraded：L211/L227-234；node_failed：L256+；lead 失败：L287+；done_payload quality：L323-329。
- research.py done 分支 quality 持久化：L274-283。
- research_jobs.py `_MAX_RETRY_ATTEMPTS`：L19；claim 拦截：L196。
- 测试：test_research_orch.py（degraded/audited/LLMError 非致命三用例）+ test_research_jobs.py（G-02 上限用例）。