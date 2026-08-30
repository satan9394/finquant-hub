# BACKLOG-006 — Discussion 流式时间线修复 + 前端组件测试扩面（综合）

> 状态：`[READY]` ｜ 优先级：P1 ｜ 创建：2026-08-30 ｜ 执行者：Codex
> 背景：BACKLOG-005 的 E2E 暴露真实业务缺口——Discussion 讨论页消费 SSE 时**丢弃流式过程**：token 累加进 `accumulatedContent` 但 agent_end 前不渲染；`agent_start`/`round` 信息被忽略；`InvestmentCommittee` 渲染层只有成员状态（waiting/running/completed），无 per-member 流式文本、轮次标签、agent_end 时间线。同时前端有 **52 个组件无直接测试**，其中 `InvestmentCommittee`（本任务核心修改组件）等属于核心 UI 原语。
>
> 本任务 = **修复 Discussion 流式时间线缺口（业务改动）** + **为修改面与核心组件补测试（质量闭环）**，二合一。

---

## 允许修改

- `frontend/src/pages/Discussion.tsx`（SSE 消费：收集并保留流式过程状态）
- `frontend/src/components/InvestmentCommittee.tsx`（渲染：新增流式时间线展示区）
- `frontend/src/i18n/zh.ts`、`en.ts`（新增文案 key，双语同步，保持 parity）
- `frontend/tests/InvestmentCommittee.test.tsx`（新建，覆盖新渲染区）
- `frontend/tests/DiscussionStreaming.test.tsx`（新建，SSE 消费流式状态收集）
- `frontend/tests/` 其他核心组件测试（见目标 3）
- `docs/ai/tasks/BACKLOG-006.md`、`docs/ai/EXEC_PLAN.md`、`task/CHANGELOG.md`

## 禁止修改

- 后端代码、schema、认证、依赖、`reference/`
- 新增 npm/Python 依赖（沿用项目铁律）
- 修改既有 SSE 事件契约（后端 event 名不变，只改前端消费/渲染）

---

## 完成标准

### 目标 1：Discussion 流式时间线（核心业务改动）

**现状**（已核实）：
- `frontend/src/pages/Discussion.tsx` L137-180：`readSSE` 回调里 `accumulatedContent` 累加 token，但 agent_end 前不 setState；`agent_start`/round 信息仅用于重置（L146-149）；渲染层只看到最终 messages。
- `frontend/src/components/InvestmentCommittee.tsx`：`CommitteeMember` 只有 status/summary，无流式字段。

**要求**：
1. **Discussion.tsx 消费侧**：新增流式状态 `streamingByAgent`（如 `Record<agentKey, { round: number; content: string; status: 'running' | 'completed' | 'failed' }>`）：
   - `agent_start`（含 `agent`/`name`/`round`）→ 初始化该 agent 的流式条目（round、content 清空、status running）
   - `token`（`delta`）→ 追加到当前 agent 的 content（setState 让 UI 实时更新）
   - `agent_end`（`message_id`/`token_count`）→ 该 agent status → completed，保留最终 content
   - `error` → 当前 agent status → failed，消息提示
   - `done`/`summary` → 清空流式状态或标记全部 completed（按合理语义）
   - 停止/中断（handleStop / AbortError）→ 流式状态保留已收集部分或标记，不挂起
2. **InvestmentCommittee.tsx 渲染侧**：
   - `CommitteeMember` 扩展可选字段：`streaming?: { round: number; content: string; status: 'running' | 'completed' | 'failed' }`
   - 新增"流式时间线"展示区（role rail 或 output 区）：当前 `running` 成员显示实时 content（可加光标/加载态）、`completed` 显示最终 content + 轮次标签（如 "第 N 轮"）、`failed` 显示失败标记
   - 向后兼容：`streaming` 缺省时不渲染新区（既有调用不受影响）
3. **i18n**：新增 key 双语（如 `committee.stream.round`、`committee.stream.running/completed/failed` 等），zh/en parity 校验通过（项目有 0 duplicate/0 parity 门禁）

**验收**：`bun run test` 新增用例 + 既有全绿；`bun run build` 通过；E2E `discussion-paths.spec.ts` 仍全绿（其断言的是 done/error 收束，不冲突）；`zh.ts`/`en.ts` parity 0 diff。

### 目标 2：修改面测试闭环

1. **`frontend/tests/InvestmentCommittee.test.tsx`**（新建，≥5 用例）：
   - 基础：topic/成员/phase 渲染
   - **流式 running**：某成员 `streaming: { round: 1, content: '正在发言', status: 'running' }` → 显示实时文本 + 进行中标记
   - **流式 completed**：`status: 'completed'` → 显示最终文本 + 轮次标签
   - **流式 failed**：显示失败态
   - 向后兼容：无 streaming 字段时渲染与旧版一致（回归保护）
2. **`frontend/tests/DiscussionStreaming.test.tsx`**（新建，≥4 用例）：
   - 用既有 Discussion E2E 的 SSE 帧契约，mock `readSSE` 或直接测消费函数：agent_start → token 累加 → agent_end → completed 状态收集正确
   - error 事件 → failed + 提示
   - done 收束后流式状态清理/标记
   - 停止中断不挂起
   - （如消费逻辑内联在页面组件难测，可提取纯函数 `reduceDiscussionStream(prev, event, data)` 到 `frontend/src/features/discussionStream.ts` 再单测——推荐，便于确定性测试）

### 目标 3：核心组件测试扩面（≥10 个组件，每组件 ≥2 用例）

从以下**无直接测试**的核心组件中选 ≥10 个补测试（优先与 Discussion/委员会/研究流程相关的）：
`InvestmentCommittee`（目标 1 已含）、`DiscussionTimeline`、`RoleAvatar`、`EvidenceChip`、`EvidenceCard`、`EvidenceDrawer`、`EntityHeader`、`AgentStatusCard`、`AgentRail`、`AgentRun`、`CommandComposer`、`CommandBar`、`DecisionCard`、`EventTimeline`、`CompareGrid`、`FinancialMetric`、`FinancialTable`、`MetricStrip`、`ActionBar`、`LangSwitcher`

每个组件测试：
- 渲染基本态（props 驱动，`@testing-library/react` + jsdom，参考既有组件测试模式）
- 至少 1 个行为/边界态（空数据、加载、错误、交互回调触发）
- **确定性**：无网络/无真实依赖（mock 一切外部）

### 目标 4：验证

- `cd frontend && bun run build` 通过
- `bun run test`（Vitest）全绿——**63 + 新增（预计 ≥19）files，198 + 新增 tests**
- `bun run test:e2e` 全绿（35 基线不减少；`discussion-paths.spec.ts` 必须仍过——若新渲染区改变 DOM 结构导致既有断言失效，**更新 E2E 断言以匹配新 UI**，但不得放宽行为断言）
- `git diff --check` 通过；i18n parity 检查（zh/en keys 数量一致、无重复）

### 目标 5：文档同步

- `docs/ai/EXEC_PLAN.md` 本任务标记 `[DONE]`（证据段记录：流式设计、新增测试数、build/test/e2e 结果）
- `task/CHANGELOG.md` 追加一条（What/Why/Docs/Verification/Risk，标注这是业务行为改动——Discussion 讨论过程现在可见）

---

## 参考

- SSE 帧契约（BACKLOG-005 已确认）：`agent_start {agent,name,round}` → `token {delta}`（多个）→ `agent_end {agent,message_id,token_count}` → `summary {content}` / `done {room_id}` / `error {error}`
- `frontend/src/pages/Discussion.tsx` L137-189（消费侧）、L266-277（InvestmentCommittee 调用）
- `frontend/src/components/InvestmentCommittee.tsx`（渲染侧，全 81 行）
- `frontend/src/services/sse.ts` `readSSE`（分帧解析）
- 既有组件测试模式：`frontend/tests/InvestmentCommittee` 无；参考 `frontend/tests/TaskPageHeader.test.tsx`、`frontend/tests/EvidenceChip` 类（`@vitest-environment jsdom` + `@testing-library/react`）

## 验证命令

```powershell
cd frontend
bun run build
bun run test
bun run test:e2e -- --grep "discussion"
bun run test:e2e
cd .. && git diff --check
```

## 完成证据（执行后填写）

- 修改文件清单（页面/组件/i18n/测试）：
- 流式时间线设计说明（状态结构 + 渲染区 + 兼容性）：
- 新增测试数：InvestmentCommittee / DiscussionStreaming / 组件扩面 = ?/?/?
- Vitest 总结果（63 → ? files，198 → ? tests）：
- E2E 结果（35 基线 + 是否更新 discussion 断言）：
- i18n parity 结果：
- 备注（未完成项或风险）：
