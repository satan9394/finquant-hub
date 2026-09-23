# IMPLEMENTATION_BRIEF — Vertical Slice：研究失败语义修正（报告质量标记 + 调度重试上限）

> Orchestrator 第五阶段产物，2026-09-13。来源：PRODUCT_GAP_MAP 的 G-02（调度无限重试）+ G-03（报告伪装成功）。
> 执行模式：独立 Implementer 实现 → 独立 Evaluator 质疑（IMPLEMENT→EVALUATE→FIX 循环）。Implementer 不得自我验收。

## 目标
让"研究（尤其定时研究）失败"行为诚实且受控：
1. **G-03 报告质量标记**：当任一 agent 或主编（report_lead）失败降级为"【分析失败】"时，报告不得再标记为无条件的 `completed` 成功——需携带 `quality`/`degraded` 语义（如 `status` 保持 completed 但 `report_data.quality` 诚实标注，或整体标记 PARTIAL），前端研究报告展示处显示诚实提示（沿用现有 degraded 提示机制，若有）。
2. **G-02 调度重试上限**：定时研究任务失败重试必须有限（max_attempts 上限 + 指数退避或失败挂起），杜绝每 30s 无限重试烧 API + DB 膨胀。

## 用户场景
非技术用户配置了定时研究。某天 LLM Key 失效或上游抖动：
- **现状**：生成一份全是"【分析失败】"文本、却显示"已完成"的报告；且任务每 30 秒自动重试、无限累计失败记录与 API 开销。
- **理想**：报告明确标识"生成不完整（部分环节失败）"+ 原因；任务在 N 次失败后停止自动重试并在 UI/日志提示"因持续失败已暂停"。

## 当前问题（代码现实，供 Implementer 复核）
- `backend/app/services/research_orch.py:223-225`：agent 捕获 LLMError 返回 `【分析失败】{exc}` 文本；`:255` 同；`:281-283` lead 失败 yield `agent_failed` 事件。
- `backend/app/routers/research.py:262-291`：`done` 事件 → `completed=True` → `publish "completed"`（无失败信号）。
- `backend/app/services/research_jobs.py:189`：`attempt = latest+1` 无条件递增；`scheduler.py` 每 30s `run_due_research_jobs` 重新 claim 失败 job（`pending_idempotency_key` 写回 → 无限重试）。
- 已知既有机制可复用：`report_builder.py` 的 `lead_review_status`（BACKLOG-033，audited/degraded 语义）；`frontend` Research 页"降级提示"。

## 涉及模块
- 后端：`services/research_orch.py`、`routers/research.py`、`services/research_jobs.py`、`services/scheduler.py`、`services/report_builder.py`（如改质量字段）、schema（如加 `attempts`/`max_attempts` 字段则需 migration——**优先无 schema 变更**）
- 前端：Research 报告展示区（降级提示）、定时研究任务列表（失败/暂停状态展示，若有）
- 文档：API_CONTRACT（如改报告数据结构）、CHANGELOG、HANDOFF、证据

## 不能破坏什么（回归边界）
- **架构不变量**：无 ORM/连接池/DAL/WS；aiosqlite 单连接；SSE from client 视角不变；核心数据流（研究→报告→前端）对外形状尽量少变。
- **既有行为**：正常（无失败）研究的报告结构/展示**零变化**；`lead_review_status=audited` 正常路径不走 degraded；调度正常任务不受重试上限影响（只在失败时计数）。
- **回归**：all existing tests 必须绿（backend 909 + Vitest + E2E 50/21）。

## 验收标准（Evaluator 将据此独立检查）
1. 单 agent 或 lead 失败时：报告数据含诚实质量标记（如 `quality: "degraded"` 或等价），前端展示降级提示；**不再出现"全是【分析失败】文本却标 completed"**。
2. 定时任务连续失败达到上限（如 5 次或可配置）后：**停止自动重试**（job 挂起/标记 disabled+原因），不再每 30s 重试；日志/查询可证。
3. 正常路径零回归：无失败研究报告结构与展示不变。
4. 测试：新增确定性测试覆盖"agent 失败→quality 标记""lead 失败→degraded""重试达到上限→挂起""正常路径不计数"。
5. 门禁全绿：backend `pytest -q`（0 failed）+ ruff + frontend build + 聚焦 vitest + E2E。

## 错误场景（必须覆盖）
- LLM 超时/401/5xx → agent 失败（已存在降级）→ 质量标记生效。
- 部分 agent 成功、部分失败 → **部分降级**标记（非全盘失败）。
- 重试中途恢复成功 → 挂起前成功一次即重置计数器（不得因历史失败永久禁用）。
- 调度器停启 → 状态不丢。

## 测试要求
- 后端单测：质量标记传播（orch→report→router 事件）、attempt 计数与上限、退避/挂起、恢复重置。
- 前端单测：降级提示渲染。
- 回归：全量 pytest + 相关 vitest。

## 约束
- **不新增依赖**；**优先无 schema 变更**（若确需字段，用 SAVEPOINT 迁移 + 版本提升，先例 BACKLOG-042/044）。
- 只读 `reference/`；删除走回收站；不 commit（由 Orchestrator 验收后合入）。
- 不得改 `model_pricing`/`llm_usage`/`context` 等无关域。