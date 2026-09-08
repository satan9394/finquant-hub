# BACKLOG-040 — Token 用量面板增强（按日趋势 + 会话级明细，对齐 CC Switch Usage Query）

> 状态：`[DONE]`（代码完成待维护者复核合入）｜ 优先级：P2 ｜ 创建：2026-09-08 ｜ 完成：2026-09-11 ｜ 执行：DSH Worker
> 背景：用户指令"token 消耗模块做好即可"+ 参考 CC Switch（farion1231/cc-switch）的 Usage Query 模块（用量查询/按计划展示/会话浏览）。现状核实（2026-09-08）：后端已有完整基础——`llm_usage` 表（prompt/completion/total_tokens + session_type/conversation_id + created_at）、`llm_usage.py`（set/reset context + record + lifespan flush）、`/api/usage`（按日/按 session_type 聚合，usage.py）、`context.py`（切分压缩）；前端 Settings.tsx:385 已调 `/usage?days=30` 显示汇总。**差距**：Settings 用量区只有汇总数字（UsageSummary），无按日趋势可视化、无会话级明细浏览——对齐 CC Switch 的"用量查询+会话浏览"补这两块。

## 目标

1. **按日趋势**：Settings 用量区新增按日 token 消耗趋势图（复用既有图表：轻量图表 hook `useLightweightCharts` 或 echarts 按需——选对现有组件影响最小的；数据源 `/api/usage?days=30` 已返回按日聚合 daily 字段则直接用，缺则后端补）。轴/标签中文，显示 prompt/completion/total 至少 total 趋势。
2. **会话级明细**：新增"用量明细"列表/抽屉——按 session_type 分组展示近期记录（conversation_id/时间/model/total_tokens），支持按会话查看消耗。后端 `/api/usage` 若已有会话级端点则复用，缺则补一个（如 `/api/usage/records?limit=50`，用户隔离）。
3. **i18n**：新增文案 zh/en parity 0（中文默认）。
4. **诚实**：无用量记录时显示"暂无用量数据"空态（不造假）。

## 允许修改
- `frontend/src/pages/Settings.tsx`（用量区扩展）、新增用量趋势/明细组件（`frontend/src/components/settings/` 下）
- `frontend/src/i18n/zh.ts`+`en.ts`（新 key parity 0）
- `backend/app/routers/usage.py`（若缺会话级端点则补 records 端点）
- `frontend/tests/Settings*.test.tsx` 或新用量组件测试（同步）
- 证据文档：`docs/ai/BACKLOG-040.md`、`docs/ai/tasks/BACKLOG-040.md`（新建）、`docs/ai/EXEC_PLAN.md`、`task/CHANGELOG.md`、`HANDOFF.md`

## 禁止修改
- E2E/playwright config（settings 相关 e2e 断言先核禁改）；依赖/锁文件；`reference/`；不删除文件；不加依赖（图表复用现有 hook/echarts 按需）
- 不改 llm_usage 表结构/记录链路（只消费查询）；不动 context.py（BACKLOG-043 域）

## 完成标准
1. Settings 用量区有按日趋势（total tokens，图表容器 data-testid）+ 会话级明细列表/抽屉（session_type/时间/model/总量）
2. 后端 records 端点（若补）：用户隔离、limit 合理、确定性测试（httpx mock）
3. i18n parity 0；build + Vitest 全量 + 4173 50 + 8000 21 全绿；git diff --check；删除 0；不 commit

## 参考
- CC Switch Usage Query：github.com/farion1231/cc-switch（用量查询/会话浏览）
- 现状：`backend/app/services/llm_usage.py`、`backend/app/routers/usage.py`、`frontend/src/pages/Settings.tsx:385`（UsageSummary）
- 图表复用先例：`frontend/src/hooks/useLightweightCharts.ts`（B2 已修主题重取色）、`components/MoneyFlowChart.tsx`

## 完成证据模板
```
- 前端用量趋势/明细 diff + data-testid
- 后端 records 端点（若补）diff + 测试
- i18n parity 0
- 全量门禁：build、Vitest、4173、8000
- git diff --check、删除 0、未 commit
```

## 完成证据（2026-09-11，DSH Worker，代码完成待维护者复核）
- 前端用量区按日趋势（`data-testid="usage-trend-chart"`）+ 会话级明细面板；纯函数 `usageToAreaData` 映射 daily→AreaChartData。
- 后端补 `GET /api/usage/records`（用户隔离/newest-first/limit/session_type 过滤）+ httpx ASGI 确定性测试。
- i18n zh/en 各 2331 key parity 0。
- 全量门禁：backend 870 passed cov 92.59%、ruff 全过、build ✓、全量 Vitest 127/407、聚焦 UsageComponents 7/7 + Settings 4/4、4173/8000 E2E 见任务卡。
- git diff --check 通过、删除 0、未 commit。详见 `docs/ai/tasks/BACKLOG-040.md`。
