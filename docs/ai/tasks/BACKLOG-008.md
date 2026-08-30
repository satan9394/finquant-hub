# BACKLOG-008 — Discussion 流式 E2E + 剩余组件测试转正 + E2E 并行稳定性（综合）

> 状态：`[DONE]` ｜ 优先级：P1 ｜ 创建：2026-08-30 ｜ 执行者：Codex
> 背景：BACKLOG-006 新增的 Discussion 流式时间线（per-agent 实时文本/轮次/状态）**尚无浏览器级 E2E 验证**——现有 `discussion-paths.spec.ts` 只断言 done/error 收束，未断言流式文本实时出现在 DOM。同时前端仍有约 20 个无直接测试组件（多为仅被间接覆盖的转正候选）；且完整 E2E（35 用例）本机并行运行时**偶发 1-2 个用例失败**（失败集合每次不同、单独重跑通过），为既有并行稳定性缺陷（见目标 3）。
>
> 本任务 = **Discussion 流式时间线 E2E**（主）+ **剩余组件测试转正**（次）+ **E2E 并行稳定性修复**（新增），三合一。

---

## 允许修改

- `frontend/e2e/discussion-paths.spec.ts`（增强：新增流式时间线断言，或新建 `discussion-streaming.spec.ts`）
- `frontend/e2e/helpers.ts`（如需增强 SSE mock 支持多帧延迟/分批）
- `frontend/tests/*.test.tsx`（剩余组件转正，见目标 2）
- `docs/ai/tasks/BACKLOG-008.md`、`docs/ai/EXEC_PLAN.md`、`task/CHANGELOG.md`

## 禁止修改

- 后端代码、schema、认证、依赖、锁文件
- `frontend/src/` 业务组件——**纯测试**，发现 bug 只记录
- `reference/`、`docs/ui-current/`

---

## 完成标准

### 目标 1：Discussion 流式时间线 E2E（核心）

现有 `discussion-paths.spec.ts` 已验证 SSE done/error 收束，但**没有断言流式过程**。新增/增强用例（≥3 个）覆盖 BACKLOG-006 的流式渲染：

1. **实时流式文本**：mock SSE 分批返回帧（`agent_start` → 多个 `token` → `agent_end`），断言：
   - `agent_start` 后对应成员的流式条目出现（轮次标签可见，如"第 1 轮"）
   - `token` 帧之间**逐步断言文本增量**（Playwright 可对分批 fulfill 的 SSE 用 `expect.poll` 或分次 assert——注意 SSE mock 是单次 fulfill 整个 body，如需分批可在 fulfill 的 body 里用多次 `token` 帧 + 组件渲染时序；如果难以分批，改为断言"最终完整文本 + 轮次标签 + 状态 Tag"也可，但**必须断言流式区渲染了内容而非只有最终 summary**）
   - `agent_end` 后该成员状态 → completed、最终文本保留
2. **流式失败态**：`agent_start` → `token` → `error` → 断言流式条目显示 failed 态 + 部分已收集文本保留（若组件如此实现）+ 页面错误提示
3. **向后兼容**：无 streaming 数据的历史房间详情渲染与 BACKLOG-006 前一致（不渲染流式区）

**关键点**：断言必须落在 `InvestmentCommittee` 的流式区（`aria-label` 含流式标题的 section 或 `.investment-committee__stream`），不是只看最终 messages。可先跑 dev server 观察真实 DOM 结构再写断言。

### 目标 2：剩余组件测试转正（≥10 个组件）

以下组件仅被其他测试间接覆盖（已有部分断言）或仍裸奔，补**独立测试文件**（每组件 ≥2 用例）：

| 组件 | 备注 |
|------|------|
| `AgentModeSelector` | 模式选择/切换回调 |
| `AlphaResearchPanel` | 目录/模板加载态、错误态（mock fetchAlphaCatalog） |
| `BacktestCharts` / `ResearchCharts` | mock 图表渲染、aria-label、空态 |
| `CommandBar` | 命令输入、提交、结果 |
| `CompareGrid` | 对比网格渲染、空态 |
| `DecisionCard` | 决策卡渲染、动作回调 |
| `DiscoverResults` / `DiscoverSearch` | 结果列表、搜索提交 |
| `LangSwitcher` | 语言切换、持久化 |
| `MetricStrip` | 指标条渲染、UNKNOWN |
| `ModelSelector` | 模型下拉、切换回调 |
| `MonitorCard` / `MonitorTypeChips` | 监控卡、类型选择 |
| `ProfessionalPreferencesPanel` | 偏好表单、保存 |
| `ResearchPlan` / `ResearchRuns` | 计划/运行列表渲染 |
| `StreamingText` | 流式打字效果 |
| `ThesisBlock` | 论文块渲染、动作 |
| `LazyEChart` | 懒加载图表边界 |

**目标**：新增 ≥10 个组件、≥20 个测试用例（每组件 ≥2）。

### 目标 3：E2E 并行稳定性修复（新增，2026-08-30 维护者实测发现）

**背景**：完整 `bun run test:e2e`（35 用例）在本机多次运行，每次有 **1-2 个不同用例**偶发失败（chat 空态、strategy 回测、alerts 渲染轮流出现），**单独重跑全部通过**。根因是 `frontend/playwright.config.ts` 的 `fullyParallel: true` + 本机 workers 不限 + `retries: 0`——35 个测试全并行时 AntD Table 首屏渲染慢、SSE mock 与资源竞争导致部分 `toBeVisible()`（默认 5s 超时）过早断言失败。这是**既有稳定性缺陷**，不是任何单次改动引入。

**要求**：
1. **诊断**：先复现——连跑 `bun run test:e2e` 2-3 次记录失败集合（应各不相同、单独重跑通过），确认并行资源竞争。
2. **修复**（选一或组合，**最小改动**）：
   - `playwright.config.ts`：本机 `workers` 限制（如 `workers: process.env.CI ? 1 : 2` 或显式 `fullyParallel: false`），或本机 `retries: 1`（仅失败重试一次）
   - 对**已知慢的断言**（AntD Table cell 可见性、SSE 流式文本）显式加 `expect(...).toBeVisible({ timeout: 10_000 })` 或 `await expect(...).toBeVisible()` 默认即可但确认不缩
   - 若某用例有真实时序依赖（如 SSE mock 分批帧），用 `expect.poll` 等待
3. **验证**：修改后完整 `bun run test:e2e` **连跑 3 次全绿**（35/35 × 3），这是稳定性达标的硬证据。
4. **不得**放宽断言语义（不能把 `toBeVisible` 改成不检查、不能移除断言）；只加等待/降并行。

### 目标 4：验证

- `cd frontend && bun run build` 通过
- `bun run test` 全绿（86 files 基线 + 新增）
- `bun run test:e2e` 全绿（35 基线 + 新增 ≥3；**修复后连跑 3 次全绿**）
- `git diff --check` 通过
- i18n parity 不受影响（不新增 key 则跳过，若需要新增流式相关文案 key 则保持 zh/en parity）

### 目标 5：文档同步

- `docs/ai/EXEC_PLAN.md` 标记 `[DONE]`（证据：流式 E2E 用例清单、组件转正数、**E2E 稳定性修复说明 + 3 次全绿**、build/test/e2e 结果）
- `task/CHANGELOG.md` 追加一条

---

## 参考

- `frontend/e2e/discussion-paths.spec.ts`（BACKLOG-005 新增）：SSE mock 帧契约与 done/error 断言
- `frontend/e2e/helpers.ts`：`fulfillSSE` + `mockApi`
- `frontend/src/features/discussionStream.ts`：流式状态 reducer
- `frontend/src/components/InvestmentCommittee.tsx`：流式渲染区（`.investment-committee__stream`、`aria-label` 流式标题、轮次 Tag）
- BACKLOG-006 任务卡：流式功能设计（streamingByAgent 结构）

## 验证命令

```powershell
cd frontend
bun run build
bun run test
bun run test:e2e
cd .. && git diff --check
```

## 完成证据（执行后填写）

- 修改文件清单（E2E + 组件测试）：增强 `frontend/e2e/discussion-paths.spec.ts`；调整 `frontend/playwright.config.ts`；新增 `AgentModeSelector`、`CompareGrid`、`DecisionCard`、`DiscoverResults`、`DiscoverSearch`、`LangSwitcher`、`MetricStrip`、`MonitorCard`、`MonitorTypeChips`、`StreamingText` 共 10 个独立 `frontend/tests/*.test.tsx` 文件。未修改 `frontend/src`、后端、schema、认证、依赖、锁文件或 `reference/`。
- 流式 E2E 用例清单（3 个目标用例）：① `discussion renders streamed text, round, and completed status before retaining the result` 在 `.investment-committee__stream` 内断言两帧 token 合并后的“我认为估值合理”、`第 1 轮` 与 `已完成` Tag，并确认停止按钮收束；② `discussion preserves partial streamed text and marks the member failed after an SSE error` 在同一流式区断言“已识别回撤风险”、`第 2 轮`、`失败` Tag 与页面错误提示；③ `discussion keeps historical room details backward compatible without a streaming region` 断言历史房间、成员与完成态继续渲染，且 `.investment-committee__stream` 数量为 0。focused Discussion E2E 6/6 通过。
- 组件转正数 / 用例数 = 10/20，每组件 2 用例；全量 Vitest 从 86/252 增至 96/272，`96/96 files`、`272/272 tests` 全绿（1253.83s）。
- E2E 稳定性诊断与修复：修改前保留原始 `fullyParallel: true`、本机 4 workers、0 retries 连跑 3 次，均为 35/35（50.9s、45.2s、49.5s），本次主机未复现维护者记录的随机失败，故没有虚构失败集合或单项复跑证据。基于既有“失败集合随机且单独重跑通过”的资源竞争证据，最小调整为本机 `workers: 2`、`retries: 1`（CI 仍为 1 worker/2 retries），并仅给新增 SSE/历史详情可见性断言增加 10s 显式 timeout；未删除或弱化断言。
- E2E 总结果（35 + 净新增 1 = 36；其中 2 个既有用例增强为流式区断言、1 个新增长期兼容用例）：修复后完整 Chromium E2E 连跑 3 次均为 36/36（1.2m、1.1m、1.2m），三轮均无 retry 记录，满足 36/36 × 3 硬验收。
- 其余验证：OpenAPI 59 schemas freshness、TypeScript、Vite production build（4,238 modules）通过；未新增 i18n key，parity 不受影响；`git diff --check` 与变更范围审计通过。未 commit、push、publish 或 deploy。
- 备注（发现的真实缺陷，只记录）：历史房间详情 API 的 `messages` 已载入，但 `InvestmentCommittee` 的历史观点展示被 `completed` 成员必须同时具有 `position` 的条件门控，而 Discussion 映射未提供 `position`，因此“历史观点仍可读取”不会出现在当前委员会 DOM。按本任务纪律未修改业务组件；兼容 E2E 只验证现有可承诺的房间/成员/完成态和无流式区边界。
