# BACKLOG-009 — 历史讨论观点显示修复 + 剩余组件测试清零（综合）

> 状态：`[DONE]` ｜ 优先级：P1 ｜ 创建：2026-08-30 ｜ 完成：2026-08-30 ｜ 执行者：Codex
> 背景：BACKLOG-008 记录了一个真实业务缺陷——**历史 Discussion 房间的观点不可见**。根因在 `frontend/src/components/InvestmentCommittee.tsx`：L37 `const completed = members.filter((member) => member.status === 'completed' && member.position)`——`position` 是硬性条件，而历史 Discussion 消息（`Discussion.tsx` 映射的成员）**没有 `position` 字段**，导致这些成员的 `summary`（讨论内容）在 disagreement 区（L75）被整体排除，用户打开旧房间看不到任何历史讨论观点。同时前端仍有 **20 个组件无直接测试**。
>
> 本任务 = **修复历史讨论观点显示缺陷（业务改动，主）** + **剩余组件测试清零（测试，次）**，二合一。

---

## 允许修改

- `frontend/src/components/InvestmentCommittee.tsx`（业务修复，见目标 1）
- `frontend/src/pages/Discussion.tsx`（如修复需要配合，见目标 1 边界）
- `frontend/src/i18n/zh.ts`、`en.ts`（如需新文案，保持 parity）
- `frontend/tests/InvestmentCommittee.test.tsx`（增强：无 position 的 completed 成员显示）
- `frontend/tests/*.test.tsx`（剩余组件转正，见目标 2）
- `docs/ai/tasks/BACKLOG-009.md`、`docs/ai/EXEC_PLAN.md`、`task/CHANGELOG.md`

## 禁止修改

- 后端代码、schema、认证、依赖、锁文件、`reference/`
- 后端 SSE 事件契约（`agent_start/token/agent_end/done/error` 不变）
- 新增 npm/Python 依赖

---

## 完成标准

### 目标 1：历史讨论观点显示修复（核心业务改动）

**根因**（已核实）：`InvestmentCommittee.tsx` L37 `completed` 过滤把 `position` 当硬条件；历史 Discussion 消息无 position → 观点不可见。L38-41 的 positionCounts/leadingPosition/hasConflict 也依赖 `member.position!`（非空断言）。

**要求**：
1. **`completed` 改为只按 status 过滤**：`members.filter((m) => m.status === 'completed')`——无 position 的 completed 成员也进入"已完成观点"集合。
2. **position 全程可选**：
   - `positionCounts` 只统计有 position 的成员（`member.position ? ... : skip` 或用 `??` 安全处理，**不能再用非空断言 `!`**）
   - `leadingPosition` 同理（无 position 的成员不参与共识统计）
   - `hasConflict` 只对**有 position** 的成员判断
   - `disagreement` 区（L75）：无 position 的成员显示 `positionLabel` → UNKNOWN 即可，但**必须显示 `summary`**（讨论内容）——这是修复的核心
3. **向后兼容**：有 position 的成员行为不变；无 streaming 数据的历史房间不受影响
4. **i18n**：如无需新文案则不动；若需要（如"无观点/UNKNOWN"提示）保持 zh/en parity
5. **测试**：`frontend/tests/InvestmentCommittee.test.tsx` 新增 ≥2 用例：
   - completed 成员**无 position 但带 summary** → 观点（summary）可见、position 显示 UNKNOWN、共识/冲突区不因它崩溃
   - 有 position 的成员行为与修复前一致（回归保护）
   - 若 E2E `discussion-paths.spec.ts` 的兼容用例因 DOM 变化失效，更新断言匹配新 UI（不得放宽语义）

### 目标 2：剩余组件测试清零（20 个全部补上）

以下 20 个组件**均无直接测试**，全部补齐（每组件 ≥2 用例）：

`AlphaResearchPanel`、`BacktestCharts`、`BacktestFailurePanel`、`CommandBar`、`EvidenceDrawer`、`FundamentalsSourcePanel`、`LazyEChart`、`MCPServerSettingsPanel`、`ModelSelector`、`PortfolioOverview`、`ProfessionalPreferencesPanel`、`ResearchArtifact`、`ResearchCharts`、`ResearchPlan`、`ResearchRuns`、`StockChart`、`SwarmStatusCard`、`SystemSettingsPanel`、`ThesisBlock`、`TimeseriesChart`

**要求**：
- 每组件 ≥2 用例（渲染基本态 + 至少 1 个行为/边界态：空数据/加载/错误/回调触发）
- 图表类（LazyEChart/StockChart/TimeseriesChart/BacktestCharts/ResearchCharts）mock 图表渲染边界（参考 `ChartAccessibility.test.tsx` 既有模式，或 mock echarts）
- 面板类（MCPServerSettingsPanel/SystemSettingsPanel/ProfessionalPreferencesPanel）验证表单/开关交互 + 保存回调（mock）
- `AlphaResearchPanel` mock `fetchAlphaCatalog`（参考 `DiscoverModeDispatch.test.tsx` 已 mock 的方式）
- 确定性：`LanguageProvider` 包裹、mock 一切外部、无网络
- **目标：20 个组件全部覆盖，新增 ≥40 个用例**（组件测试覆盖率清零）

### 目标 3：验证

- `cd frontend && bun run build` 通过（TypeScript + Vite）
- `bun run test` 全绿（96 files 基线 + 新增；InvestmentCommittee 增强用例必须过）
- `bun run test:e2e` 全绿（36 基线；若 InvestmentCommittee DOM 变化影响既有断言，更新但不得放宽语义）
- i18n parity 检查（zh/en keys 数量一致、无重复）
- `git diff --check` 通过

### 目标 4：文档同步

- `docs/ai/EXEC_PLAN.md` 标记 `[DONE]`（证据：修复设计、新增用例数、build/test/e2e 结果）
- `task/CHANGELOG.md` 追加一条（标注这是业务行为修复：历史讨论观点现在可见）

---

## 参考

- `frontend/src/components/InvestmentCommittee.tsx`（L36-41 缺陷区、L74-77 渲染区）
- `frontend/src/pages/Discussion.tsx` L262-273（members 映射，无 position）
- `frontend/tests/InvestmentCommittee.test.tsx`（BACKLOG-006 新增，含流式用例）
- `frontend/tests/ChartAccessibility.test.tsx`（图表 mock 模式）
- `frontend/tests/DiscoverModeDispatch.test.tsx`（AlphaResearchPanel API mock 模式）

## 验证命令

```powershell
cd frontend
bun run build
bun run test
bun run test:e2e
cd .. && git diff --check
```

## 完成证据（执行后填写）

- 修改文件清单（业务 + 测试）：业务仅修改 `frontend/src/components/InvestmentCommittee.tsx`；增强 `frontend/tests/InvestmentCommittee.test.tsx` 2 个回归用例；新增任务列出的 20 个同名直接测试文件（`frontend/tests/<Component>.test.tsx`），每文件 2 个用例。未修改 `Discussion.tsx`、i18n、E2E、后端、依赖或锁文件。
- 修复设计说明（completed 过滤/position 可选/summary 可见）：`completed` 只按 `status === 'completed'` 收集所有已完成观点；单独派生 `positionedCompleted` 与安全的 `Partial<Record<CommitteePosition, number>>` 统计，共识分母、leadingPosition、hasConflict 仅使用有 position 的成员；无 position 成员仍进入 disagreement 并显示 `summary`，标签为 `UNKNOWN`。组件内 `position!` 与既有 `streaming!` 均已移除，无非空断言。
- 组件测试清零结果（20/20 组件，新增用例数）；Vitest 总结果（96 → ? files，272 → ? tests）：20/20 组件全部新增直接测试，每组件 2 个，共 40 个组件用例；InvestmentCommittee 新增 2 个，因此总计新增 20 files / 42 tests。聚焦 21 files / 48 tests 通过；全量由 96 → 116 files、272 → 314 tests，116/116、314/314 全绿（810.22s）。图表边界使用 ECharts/lightweight-charts mock；设置面板覆盖交互与保存/连接回调；AlphaResearchPanel mock `fetchAlphaCatalog`/`searchAlpha`，全程无网络。
- E2E 结果（36 基线 + 是否更新断言）：Chromium 36/36 通过（48.3s）；历史 Discussion 向后兼容用例通过，既有断言无需修改，未减少或放宽语义。
- i18n parity 结果：未新增或修改 key；zh/en 均 2,208 keys，双方重复 key 0、parity 差集 0。
- 备注（未完成项或风险）：OpenAPI freshness 59 schemas、`tsc -b`、Vite production build 4,238 modules 与 `git diff --check` 均通过。当前 shell 无全局 Bun，按 package scripts 直接调用同一项目本地版本锁定入口完成 build/Vitest/Playwright；未 commit/push/publish/deploy。风险低，唯一业务变化是恢复历史讨论观点可见性。
