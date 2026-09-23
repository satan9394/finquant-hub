# IMPLEMENTATION_BRIEF — Vertical Slice 20：降级/失败的原因要能被回放，且不再依赖字符串哨兵

> Orchestrator 第五阶段产物，2026-09-11。来源：**R4 审计 D4 的两条 P2**（`RELIABILITY_REPORT_R4.md` §P2），**编排者已核码并修正其中一处表述**。

## 目标
用户**重新打开一份历史报告**时，看到的"哪个 Agent 失败/被降级、为什么"必须与**实时运行时**一致；判据必须是**结构化信号**，不是字符串前缀。

## 用户场景
研究跑完时界面会实时显示"某 Agent 异常"（`agent_failed`）。用户关掉页面，**第二天重新打开这份报告**——此时状态是按**存储内容**推导的，于是出现两种错误：
1. **主编失败的那一轮**：实时时明确报了失败，**重开却显示"完成"**（内容被判为空/不可解析，但没有任何失败标记）。
2. **因工具异常/工具循环耗尽而降级、但报告仍生成的那一轮**：重开后用户只看到报告级"可能不完整"的横幅，**不知道是哪个环节、因为什么**。

## 当前问题（编排者已核码，逐条给事实）
1. **实时与回放口径不同源**：
   - 实时路径 `frontend/src/pages/Research.tsx:333` 有 `case 'agent_failed'`（VS-13 加的）。
   - 回放路径 `Research.tsx:235` 判据是 **`resultMap[key]?.content?.startsWith('【分析失败】')`** ——**字符串前缀哨兵**（本项目 `AGENTS.md` 明令禁止的形态）。
2. **哨兵对"单 Agent 异常"有效、对"主编失败"失效**：
   - `backend/app/services/research_orch.py:346` 单 Agent 异常时 content 置为 **`f"【分析失败】{exc}"`** ⇒ 哨兵命中、回放显示 failed ✔
   - `research_orch.py:417-420` **主编失败**时 `lead_content = ""`、同时 `yield "agent_failed", {"role_key": "report_lead", …}` ⇒ **内容为空、哨兵不命中** ⇒ 回放显示"完成" ✘（与实时不一致）
3. **降级原因只喂给模型、从不呈现给用户**：
   - `research_orch.py:328` `agent_reasons: list[str]`；`:337` 作为 `degraded_reasons` **传给了 runner**（⇒ D4 原文"从不使用"**不准确**，编排者已修正）；`:349-350` 仅 `if agent_reasons: degraded = True`。
   - ⇒ 原因**从未 emit、也从未持久化**给界面；用户只看得到报告级"可能不完整"。
4. **`agent_failed` 事件其实已被持久化**：`backend/app/routers/research.py:264` 对 `async for event, data` 的**每个**事件调用 `_append_event(report_id, event, data, user_id)`（含 `agent_failed`，带 `role_key`/`error`）。⇒ **缺的不是持久化，而是"回放侧消费"**。

## 理想行为
1. **结构化优先**：`agent_results` 的每个条目除 `content` 外，带上**结构化状态**（如 `status: 'completed' | 'failed'` 与可选 `error`）；**主编失败**同样要有明确标记（不能只靠空内容）。
2. **回放判据改读结构**：`Research.tsx` 回放改为读结构化字段；**必须保留哨兵作为历史兼容兜底**（已存的历史报告只有 content）。
3. **降级原因可见**：至少要让用户看到"**哪个 Agent 被降级 + 原因摘要**"。若某些原因确实未记录，就**如实显示"原因未记录"**——**不得**用"可能不完整"含糊过去，也不得编造原因。
4. **实时与回放同源**：同一份报告在两种路径下给出的 Agent 状态**必须一致**。

## 涉及模块（建议范围，允许按实际调整）
- `backend/app/services/research_orch.py`（把状态/原因结构化进 `agent_results` 与事件）
- `backend/app/routers/research.py`（**若要**在报告详情里回放事件；注意 `_append_event` 已在持久化）
- `frontend/src/pages/Research.tsx`（回放判据 + 展示原因）
- 类型定义与测试

## 不能破坏
- **实时路径 `case 'agent_failed'`**（VS-13）与其测试 `ResearchAgentFailedWire.test.tsx`、`ResearchAgentFailed.test.tsx`。
- **报告级 `quality` 横幅**（`report.report_data.quality === 'degraded'`，`Research.tsx:230`）与 `reportToMarkdown` 的既有渲染。
- **历史报告的打开**：老报告（只有 `content`、含哨兵）必须仍正确显示 failed —— **故哨兵兜底不可删**。
- **`agent_failed` 非致命语义**（单个 Agent 失败只降级、不毁整轮）与 `:backup`/router 侧既有的 `error` 致命语义区分。
- **不改 schema**（用既有表与 JSON 字段）；不加依赖；不删文件；不 commit。
- **不得**把 `agent_reasons` 的原因**编造**或从异常里截取用户不可读的堆栈。

## 验收标准（可判定）
1. **主编失败回放一致**：构造"主编 LLMError"的报告 ⇒ 回放时**该 Agent 显示 failed**（且能看到原因摘要），与实时路径一致。
2. **单 Agent 异常**：实时与回放**都**显示 failed（既有哨兵行为不得回退）。
3. **降级原因可见**：工具异常/循环耗尽导致的降级 ⇒ 用户能看到"哪个 Agent + 原因"；确有未记录的情形则显示"原因未记录"。
4. **历史兼容**：**只含哨兵、无结构化字段**的旧报告（构造一个固定 fixture）仍显示 failed。
5. **结构化优先**：新报告以结构化字段为准；**构造"结构化说 completed 但 content 带哨兵"的矛盾输入**，断言以结构为准（证明哨兵已降级为兜底而非主判据）。
6. 后端聚焦测试 + `ruff check .` 干净；前端相关 vitest 全绿 + `bun run build`（含 `tsc -b`）；**不要并行跑 build 与 vitest**。
7. **不得**为迁就测试替身放宽生产代码的异常处理（见 `AGENTS.md`）。

## 错误场景
- 事件缺失/损坏（历史报告无事件表行）⇒ 回落到哨兵与"原因未记录"，**不得**崩或显示"完成"。
- `agent_results` 存在但某 key 缺失 ⇒ 该 Agent 显示未知/未运行，**不得**默认成"完成"。
- 原因字符串含用户不可读内容（异常堆栈）⇒ 只给可读摘要或"原因未记录"。

## 测试要求
- 后端：聚焦 pytest（**不要跑全量**，前置 `$env:no_proxy='localhost,127.0.0.1,::1'`）。
- 前端：`Research.tsx` 回放判据的用例——**必须包含"删掉结构化判据后测试变红"的鉴别力证明**（可临时变异副本验证，**不得**改被验文件）；以及第 4/5 条的历史兼容与矛盾输入用例。
- 由独立 Evaluator 复核：①主编失败是否**真的**在回放显示 failed；②旧报告是否仍兼容；③是否**真的**不再以哨兵为主判据；④原因是否可见且未编造。
