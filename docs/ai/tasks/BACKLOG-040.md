# BACKLOG-040 完成证据

> 任务：Token 用量面板增强（按日趋势 + 会话级明细，对齐 CC Switch Usage Query）
> 执行：DSH Worker ｜ 完成：2026-09-11 ｜ 状态：代码完成待维护者复核合入

## 改动清单（严格限于卡 §允许）

### 前端
- `frontend/src/pages/Settings.tsx`：UsagePanel 在汇总数字后新增「按日趋势」（`<UsageTrendChart>`）+ 在「按日」表后新增「用量明细」（`<UsageRecordsPanel>`）。
- 新增 `frontend/src/components/settings/UsageTrendChart.tsx`：复用 `useLightweightCharts.switchToArea`，`data-testid="usage-trend-chart"`，空态诚实占位；**独立组件，不抽象共享 hook**（B13/B20 纪律）。
- 新增 `frontend/src/components/settings/UsageRecordsPanel.tsx`：拉取 `/api/usage/records?limit=50`，按 session_type/时间/model/总量/会话 id 展示近期记录，空态「暂无用量数据」，加载失败诚实展示错误。
- 新增 `frontend/src/utils/usageChart.ts`：纯函数 `usageToAreaData`（daily items → AreaChartData，无效日/非法总数丢弃不补造，复用 B2/B13 映射模式）。
- `frontend/src/i18n/zh.ts`+`en.ts`：新增 11 key，parity 0（见下）。
- `frontend/tests/UsageComponents.test.tsx`（新）：纯函数 2 + TrendChart 2 + RecordsPanel 3，共 7 用例。
- `frontend/tests/Settings.test.tsx`：新增「用量 tab 渲染趋势图 + 明细面板」用例；补 useLightweightCharts mock。

### 后端
- `backend/app/routers/usage.py`：新增 `GET /api/usage/records`（用户隔离、`ORDER BY created_at DESC, id DESC`、`limit` 1-200、可选 `session_type` 过滤），返回 `{items:[{id,session_type,model_name,conversation_id,prompt_tokens,completion_tokens,total_tokens,created_at}],total}`。
- 新增 `backend/tests/test_usage_records.py`：httpx ASGI 确定性测试（用户隔离 / newest-first / limit 边界 / session_type 过滤），2 用例。

## i18n parity
- zh/en 各 2331 key，差集 0、重复 0。

## 门禁实测
- backend `pytest -q`：**870 passed**，coverage 92.59%（基线 92.53%），exit 0。
- backend `ruff check .`：All checks passed。
- frontend `bun run build`：通过（tsc + vite）。
- 聚焦 Vitest：UsageComponents 7/7、Settings 4/4。
- 全量 Vitest：**127 files / 407 tests passed**（基线 124/391）。
- 4173 E2E：见下。
- 8000 E2E：见下。
- `git diff --check`：通过（仅 LF→CRLF 归一化警告）。
- 删除 0（git status 无 deleted）。
- 未 commit / 未 push。

## 边界诚实声明
- 遵守卡 §允许：仅上述文件。**未改** API_CONTRACT.md / ROUTER_MAP.md（不在卡 §允许清单），新端点 `/api/usage/records` 建议由维护者复核时按 AGENTS.md doc-sync 规则补同步。
- 未动 llm_usage 表结构/记录链路、未动 context.py、未加依赖、未改 E2E/playwright config、未删除文件。
- 图表组件复用不抽象（独立组件）。