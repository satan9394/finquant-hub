# BACKLOG-002 — Discover 路径 E2E 补测：Alpha 工作台与旧路由重定向

> 状态：`[READY]` ｜ 优先级：P1 ｜ 创建：2026-08-30 ｜ 执行者：Codex
> 背景：重构（Phase 1）将独立 AlphaResearch 页面收敛为 Discover 的 `?mode=alpha` 面板（`frontend/src/components/alpha/AlphaResearchPanel.tsx`），并保留 `/screening`、`/alpha` 旧路由重定向到 `/discover?mode=...`。当前 Playwright E2E（11 个测试）覆盖 research/strategy/portfolio 三条主链，**完全没有 Discover 路径**。本任务为重构产出补 E2E 证据并守住回归。

---

## 允许修改

- `frontend/e2e/discover-paths.spec.ts`（新建）
- `frontend/e2e/*.spec.ts`（如需共享 helper，优先放新文件内，避免大改既有）
- `frontend/tests/DiscoverModeDispatch.test.tsx`（如需增强组件级断言）
- `docs/ai/tasks/BACKLOG-002.md`、`docs/ai/EXEC_PLAN.md`、`task/CHANGELOG.md`

## 禁止修改

- 后端代码、schema、认证、依赖
- `frontend/src/pages/Discover.tsx`、`frontend/src/components/alpha/AlphaResearchPanel.tsx` 等业务组件**除非** E2E 暴露真实缺陷（此时记录缺陷并最小修复，标注原因）
- `reference/`、`docs/ui-current/` 截图矩阵（浏览器 URL policy 仍阻断，不在本任务范围）

---

## 完成标准（全部满足才算完成）

1. **新建 `frontend/e2e/discover-paths.spec.ts`**，覆盖以下场景（用 Playwright API mock 保证确定性，参考 `core-paths.spec.ts` 的既有模式）：
   - `GET /discover` 默认模式：筛选搜索框可见、无 alpha 工作台（`data-testid="alpha-research"` 不存在）
   - `GET /alpha` → 重定向到 `/discover?mode=alpha`：AlphaResearchPanel 渲染（`data-testid="alpha-research"` 可见），包含"Alpha 因子研究"标题
   - `GET /screening` → 重定向到 `/discover?mode=screening`：回到筛选模式，alpha 工作台不存在
   - alpha 模式下：mock `GET /wq/categories`、`GET /wq/templates`、`POST /wq/search` 返回最小 fixture，验证类别卡与模板列表渲染（`data-testid="alpha-category-*"` 至少 1 个）
   - 390px 窄屏：alpha 工作台无页面级横向溢出（复用 core-paths 的 overflow 断言模式）

2. **组件级补充**（`frontend/tests/DiscoverModeDispatch.test.tsx`）：
   - 若 E2E 无法稳定断言重定向后 query 保持（如 `/alpha?query=xxx`），在组件级补一个"URL preset 查询在 alpha 面板生效"的用例（现有测试只验证 mode 分发，未验证 query 传递）

3. **验证**：
   - `cd frontend && bun run build` 通过
   - `bun run test`（Vitest）全绿
   - `bun run test:e2e`（Playwright，11 + 新增 ≥ 5 个用例）全绿——**Playwright 需真实起 dev server（baseURL 4173），确保端口未被占用**
   - `git diff --check` 通过

4. **文档同步**：
   - `docs/ai/EXEC_PLAN.md` 本任务标记 `[DONE]`（证据段记录 build/test/e2e 结果）
   - `task/CHANGELOG.md` 追加一条（What/Why/Docs/Verification/Risk）

---

## 参考（既有模式）

- `frontend/e2e/core-paths.spec.ts`：API mock 方式、overflow 断言、keyboard focus 断言
- `frontend/e2e/dashboard.spec.ts`：fixture 数据注入方式
- `frontend/src/components/alpha/AlphaResearchPanel.tsx`：面板结构（`data-testid="alpha-research"`、`AlphaTemplateCatalog` 的 `data-testid="alpha-category-{name}"`）
- `frontend/src/pages/Discover.tsx`：mode 分发逻辑（`?mode=alpha` → 面板，默认 → 筛选）

## 验证命令

```powershell
cd frontend
bun run build
bun run test
bun run test:e2e
cd .. && git diff --check
```

## 完成证据（执行后填写）

- 修改文件清单：
- 验证输出（build/test/e2e 结果）：
- 备注（发现的真实缺陷或未完成项）：
