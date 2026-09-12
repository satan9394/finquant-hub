# IMPLEMENT_RESULT — Vertical Slice 13：前端补 `agent_failed` 分支

> **实现者：Orchestrator 接管**（原派出的 Implementer `7c787532` 在消耗 144 行后**因 429 限流中断且未写出任何代码**——本工作区限流严重，小改动的"派活"已不划算）。2026-09-13。
> **⚠️ 本卡由编排者实现，因此独立评估不可省**——已派独立 Evaluator 复核（见 `EVALUATION_RESULT_VS13.md`）。

## 一、改动（4 文件）

### 1. `frontend/src/pages/Research.tsx`
- **新增导出纯函数 `applyAgentEvent(agents, event, agentKey, failMessage?)`**：处理 `agent_started` → `running`、`agent_completed` → `completed`、`agent_failed` → `failed`（并写入 `progress`）；`role_key` 不在 `AGENT_KEYS` 中时**原样返回同一引用**（React 据此跳过重渲染，语义与改动前的 `if (idx >= 0)` 守卫等价）。
  - **抽取理由**：这三种状态迁移改动前**没有测试覆盖**（switch 内联在流回调里）。但纯函数测试**只覆盖状态迁移、不覆盖 switch 接线**——`agent_failed` 缺分支只是**降低**了逃逸概率，并未被拦下（详见 `EVALUATION_RESULT_VS13.md` §四 F1）。项目内既有同类先例：`swarm.test.ts` 的 `applySwarmEvent`。
- **新增 `case 'agent_failed'`**：按 `agentKey` 定位并把该卡片置 `failed` + 写入原因；**不弹全局 `message.error`**（它非致命，报告仍会完成并显示降级横幅）。原 `case 'error'`（真致命）**逐字未改**。
- 原 `agent_started` / `agent_completed` 两个分支改为调用该纯函数（**行为不变**）。
- 附带发现（写进注释）：`Research.tsx` 的**历史加载路径**（约 `:207`）本就用 `content?.startsWith('【分析失败】') ? 'failed' : 'completed'` 标记失败 Agent ⇒ **实时流与历史记录此前在状态判定上不一致**，本卡**在状态层面**消除该不一致。限定说明：历史路径**不写 `progress`**，故不显示失败原因文本（化妆品级差异）；`report_lead` 的失败两条路径同为 `completed`，由报告级降级横幅承载——详见 `EVALUATION_RESULT_VS13.md` §四 F3/F4。

### 2. `frontend/tests/ResearchAgentFailed.test.tsx`（新增，6 用例）
- `agent_failed`：卡片由 `running` 变 `failed` 且带原因；**不影响其他 Agent**；未提供原因时不写入 `progress`。
- 零回归：`agent_started` → running、`agent_completed` → completed。
- 未知 `role_key` / `undefined` → **返回同一引用**（等价于旧守卫）。
- **配套接线防线**（评估者 F1 处置时新增，同批交付）：`frontend/tests/ResearchAgentFailedWire.test.tsx` —— 真实渲染 `<Research>` + mock `fetch` 返回真实 `ReadableStream`，断言失败原因上屏、恰好一张卡片 `failed`、`message.error` 零调用、`done` 后降级横幅出现。删掉 `case 'agent_failed'` 时该文件**会挂**（变异实测原始输出见 `EVALUATION_RESULT_VS13.md` §四 F1 处置）。

### 3. 无 i18n 变更
复用了既有键 `deep.request.failed`，未新增键 ⇒ i18n parity 不受影响。

## 二、门禁实测（原始输出摘要）
- 新测试：`vitest run tests/ResearchAgentFailed.test.tsx` → **6 passed**（96ms 测试本体；文件耗时 120s，其中 import 113s——`Research.tsx` 依赖链重，属既有情况）。
- 回归：`vitest run tests/ResearchReportToMarkdown.test.tsx tests/ResearchDeepPlan.test.tsx tests/ResearchModeRouting.test.tsx` → **3 files / 16 tests passed**。
- `bun run build`（含 `tsc -b`）→ **✓ built in 52.54s，exit 0**。
- 未与 vitest 并行跑 build（遵守已知 bun 抖动）。

## 三、未解决问题 / 风险
1. **测试方式**：`applyAgentEvent` 是纯函数单测，**未**渲染组件并驱动真实 SSE 流。因此"switch 是否正确接线到该函数"当时仅由**代码审阅 + tsc** 保证，不由运行时测试保证。
   - **✅ 已处置（评估者 F1）**：先由评估者用临时组件级测试实测接线，再固化为常驻文件 `frontend/tests/ResearchAgentFailedWire.test.tsx`，并做了**变异实测**（删掉 `case 'agent_failed'` → 该文件挂；恢复 → 转绿）。接线现在由运行时测试保证，原始输出见 `EVALUATION_RESULT_VS13.md` §四 F1 处置。
2. **`:338` 兜底未改**：流未正常完成时把仍在 `running` 的 Agent 置 `failed` 的逻辑保持原样；正常 `done` 的情形现在由 `agent_failed` 分支覆盖（这正是本卡修的）。
3. **未做**：D3 提到的对话路径（`routers/chat.py` → `chat_with_tools_loop`）与 `agent_failed` 无关，不在本卡范围。
4. 本卡为编排者接管实现，**独立评估是唯一的验收来源**。
