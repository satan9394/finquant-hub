# IMPLEMENTATION_BRIEF — Vertical Slice 13：前端补 `agent_failed` 分支，闭合"失败可见"的最后一环

> Orchestrator 第五阶段产物，2026-09-13。来源：**VS-12 独立评估者的非阻断项 F1**（`EVALUATION_RESULT_VS12.md`），**编排者已核实代码事实**。

## 目标
让**单个 Agent 失败**在界面上**可见且终结**：该 Agent 的卡片不得永远停在"运行中"，而应显示为失败并给出原因；同时**不**把整轮研究误报为失败（报告仍会完成，只是降级）。

## 用户场景
用户跑深度研究，某个 Agent 因 LLM 错误或内部异常失败。**现状**：后端已正确地把该 Agent 标记为 `【分析失败】`、报告整体以 `quality="degraded"` 完成（报告级提示正常），但**该 Agent 的卡片会一直显示"运行中"、永远转圈**——用户看不出这个环节已经失败，会以为程序卡死。改造前（`case 'error'`）至少会把卡片置为失败并显示原因，所以这是一处**可见性回退**。

## 当前问题（已核实）
- `frontend/src/pages/Research.tsx` 的 SSE `switch` 只有 6 个分支：`report_started`(`:287`)、`agent_started`(`:292`)、`agent_completed`(`:301`)、`report_progress`(`:310`)、`done`(`:314`)、`error`(`:329`)——**没有 `agent_failed`**（全文件检索该词命中 0 处）。
- `agent_started` 把卡片置 `running`（`:295-297`）；`agent_completed` 置 `completed`（`:304-306`）；**失败时没有任何分支终结该卡片**。
- `:338-340` 的兜底**仅在流未正常完成时**生效（`if (!streamCompleted && ...)`），正常走到 `done` 的情形不在覆盖内 ⇒ 崩溃 Agent 的卡片**永远停在 running**。
- **归属**：`agent_failed` 事件是 **VS-1** 为 agent `LLMError` 引入的非致命事件（`research_orch.py`），**VS-12** 把 `node_failed` 也改用它。**该前端缺口自 VS-1 起即存在**，非 VS-12 造成——但既然后端现在两条失败路径都用它，前端必须补齐。

## 理想行为
1. 新增 `case 'agent_failed'`：按 `agentKey` 定位该 Agent，把卡片置 `failed` 并写入失败原因（形状可镜像 `:329-335` 的 `error` 分支）。
2. **不得**因 `agent_failed` 弹出全局错误提示（`message.error`）——它**不是**整轮失败；报告会继续并在 `done` 时由既有逻辑显示降级横幅（`resolveReportQuality`）。
3. 其余 Agent 的卡片状态**不受影响**。
4. 报告级路径零改动：`done` 分支的 `quality` / 降级横幅 / 标题 / 内容均不变。

## 涉及模块
- `frontend/src/pages/Research.tsx`（新增一个 switch 分支）
- 对应前端测试（新增或扩展）
- 视需要 `frontend/src/i18n/zh.ts` / `en.ts`（**优先复用既有键**，如 `deep.request.failed`；若确需新键，zh/en 必须同步、parity 保持一致）

## 不能破坏
- `error` 分支语义（真致命：置 failed + `message.error`）**不得被合并或改写**。
- `done` / `agent_completed` / `agent_started` 的既有行为；`reportQuality` 与降级横幅（VS-3）。
- `:338-340` 的流未完成兜底逻辑。
- 不加依赖；不改后端；不删文件；不 commit。

## 验收标准（可判定）
1. **失败 Agent 卡片终结**：喂入 `agent_started`(A) → `agent_failed`(A, 带 error) 事件后，Agent A 的卡片 `status === 'failed'` 且显示失败原因；**不再是 `running`**。
2. **不影响其他 Agent**：同时喂入 B 的 `agent_started`，B 仍为 `running`（或其后 `agent_completed` 正常置 `completed`）。
3. **不弹全局错误**：`agent_failed` 路径**不**调用 `message.error`（可用 spy 断言）。
4. **报告级零回归**：`done` 仍设置 quality；降级横幅逻辑不受影响（既有测试全绿）。
5. 门禁：相关 vitest（含既有 Research/SSE 测试）全绿；`bun run build`（含 `tsc -b`）通过。**不要与 vitest 并行跑 build**。

## 错误场景
- `agent_failed` 的 `role_key` 不在 `AGENT_KEYS` 中（未知 Agent）→ **不得抛异常、不得刷全局错误**；可忽略或走中性提示（由实现者判断，需在结果文件说明）。
- `agent_failed` 载荷缺少 `error` → 使用兜底文案（复用既有键），不得渲染 `undefined`。
- 同一 Agent 先 `agent_failed` 后（异常情况下）又收到 `agent_completed` → 以后到的为准即可，不得抛错。

## 测试要求
- 至少覆盖：①失败 Agent 卡片变 failed 且带原因；②其他 Agent 不受影响；③不触发 `message.error`；④`done` 的 quality 路径零回归。
- 建议用与既有 `ResearchReportToMarkdown.test.tsx` / `AuthUnavailable.test.tsx` 相同的手法（真实渲染组件 + mock SSE 数据源，或用导出纯函数并在测试里驱动）。
- 由独立 Evaluator 复核：失败卡片是否**真的**终结、以及是否**误报**整轮失败。
