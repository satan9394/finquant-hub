# BACKLOG-045 — 使用统计详情模块（对齐 CC Switch Usage：范围选择 + 汇总卡 + 维度统计表）

> 状态：`[DONE]` ｜ 优先级：P2 ｜ 创建：2026-09-13 ｜ 完成：2026-09-13 ｜ 执行：DSH Worker ｜ **依赖**：BACKLOG-044（费用列接入）
> 证据：`docs/ai/tasks/BACKLOG-045.md`
> 背景：用户质问"使用统计详情模块做了没有"。**核实结论：只做了极小子集**——现状仅 `UsageTrendChart.tsx`（1.4KB 趋势图）+ `UsageRecordsPanel.tsx`（3.1KB 明细表）+ 固定 `days=30`。CC Switch 真实实现（只读参考源 `E:\DeepSeek_Harness\workspace\2026_08_17\cc-switch-src`）：`src/components/usage/` 下实为 **14 个文件**——核心为 `UsageDashboard.tsx`、`UsageHero.tsx`、`UsageTrendChart.tsx`、`UsageDateRangePicker.tsx`、`ProviderStatsTable.tsx`、`ModelStatsTable.tsx`、`RequestLogTable.tsx`、`RequestDetailPanel.tsx`、`format.ts`、`PricingConfigPanel.tsx` 等（注：`UsageFooter.tsx`/`UsageScriptModal.tsx` 实际位于 `src/components/` 下一级，**不在** `usage/`；本卡初稿写错，已由 Worker 核实更正）。本卡补齐"范围选择 + 汇总卡 + 维度统计表"。

## 目标

1. **日期范围选择器**（对齐 `UsageDateRangePicker.tsx`）：用量区从固定 `days=30` 改为可选范围（预设 7/30/90 天 + 自定义起止日期），后端 `/api/usage` 支持 `start`/`end` 参数（保持向后兼容 `days`），非法范围诚实 400。
2. **汇总卡 UsageHero**（对齐 `UsageHero.tsx`）：显示总 token（输入/输出）、总调用次数、日均 token、最活跃模型、估算费用（**费用取自 BACKLOG-044 的 `/api/usage/cost`；若 044 未合入则占位并诚实标注"待计价模块接入"**）。
3. **维度统计表**（对齐 `ProviderStatsTable.tsx`）：按 **模型** 与 **会话类型** 两个维度聚合（调用次数/token/占比/费用），可排序；空态诚实。
4. **保留既有不回归**：`UsageTrendChart`、`UsageRecordsPanel` 现有行为与 testId 不变，只在其上方组织新区域。
5. i18n zh/en parity 0；确定性测试（范围参数/汇总计算纯函数/维度聚合/空态/非法范围）。
6. 契约同步：`docs/API_CONTRACT.md`、`docs/ROUTER_MAP.md`（`/api/usage` 参数扩展）。

## 允许修改
- `backend/app/routers/usage.py`（start/end 参数 + 维度聚合，若需新端点）
- 前端：`frontend/src/pages/Settings.tsx`、新增 `frontend/src/components/settings/UsageHero.tsx`、`UsageDateRangePicker.tsx`、`UsageStatsTable.tsx`（命名可调，须说明）、`frontend/src/services/usageApi.ts`、`frontend/src/i18n/zh.ts`+`en.ts`
- 测试：`backend/tests/test_usage*.py`、`frontend/tests/*`
- 证据/契约：`docs/ai/BACKLOG-045.md`、`docs/ai/tasks/BACKLOG-045.md`、`docs/ai/EXEC_PLAN.md`、`docs/API_CONTRACT.md`、`docs/ROUTER_MAP.md`、`task/CHANGELOG.md`、`HANDOFF.md`

## 禁止修改
- 不加新依赖；不改 `llm_usage` 表/记录链路；不改 `context.py`；不动 `model_pricing` 表与计价面板（044 域）
- 不改 E2E/playwright config；不删文件；不臆造数据（无数据显示空态，不补造 0 值充数）

## 完成标准
1. 范围选择器可用（预设 + 自定义），后端 start/end 兼容 days，非法范围诚实 400
2. 汇总卡显示总 token/调用次数/日均/最活跃模型/费用（或诚实占位）
3. 维度统计表按模型 + 会话类型聚合，可排序，空态诚实
4. 既有 UsageTrendChart/UsageRecordsPanel 零回归（原测试全绿）
5. i18n parity 0；确定性测试覆盖范围/汇总纯函数/聚合/空态
6. backend pytest + ruff + build + 聚焦 Vitest + 4173 50 + 8000 21 全绿；git diff --check；删除 0；不 commit

## 参考（**强制**：证据里必须给出被参考源码的 file:line 引用）
- 只读参考源：`E:\DeepSeek_Harness\workspace\2026_08_17\cc-switch-src`（**只读，禁止修改**）
  - `src/components/usage/`（14 文件，实测）：`UsageDashboard.tsx`(520)、`UsageHero.tsx`(394)、`UsageTrendChart.tsx`(339)、`UsageDateRangePicker.tsx`(507)、`ProviderStatsTable.tsx`(103)、`ModelStatsTable.tsx`(97)、`RequestLogTable.tsx`(404)、`RequestDetailPanel.tsx`(324)、`format.ts`(97) 等
  - 另有 `src/components/UsageFooter.tsx`、`src/components/UsageScriptModal.tsx`（**在 components/ 下一级，不在 usage/**——初稿路径写错，已更正）
- 现状：`frontend/src/components/settings/UsageTrendChart.tsx`、`UsageRecordsPanel.tsx`、`frontend/src/pages/Settings.tsx`（UsagePanel）、`backend/app/routers/usage.py`、`backend/app/services/llm_usage.py`
- 依赖：`docs/ai/BACKLOG-044.md`（费用端点）

## 完成证据模板
```
- 范围选择器 diff + start/end 兼容与非法范围测试结果
- 汇总卡 diff + 计算纯函数测试 + 费用接入/占位说明
- 维度统计表 diff + 聚合测试 + 排序说明
- 既有组件零回归证据（原 testId/原用例全绿）
- CC Switch 源码引用表：每个借鉴点 → cc-switch 文件:行 → 我们的实现位置
- 契约同步 + i18n parity + 门禁逐项
- git diff --check、删除 0、未 commit
```

## 完成证据（2026-09-13，DSH Worker，代码完成待维护者复核）

完整证据见 `docs/ai/tasks/BACKLOG-045.md`。要点：

- **范围选择**：`UsageDateRangePicker.tsx`（预设 7/30/90 + 自定义起止 + 应用/非法本地报错）；后端 `resolve_range()` 让 `start`/`end` 与既有 `days` 并存，非法（半参/倒置/格式错/跨度 >366 天）一律诚实 400，响应回显解析后的 `start`/`end`/`days`。
- **汇总卡**：`UsageHero.tsx` + `buildUsageHero()` 纯函数（总 token/输入/输出/调用次数/日均/窗口天数/最活跃模型/费用）；费用**复用 044** 的 `cost_status`，缺单价显示「未配置单价」、混合币种不换算，**不出现 `CNY 0`**。
- **维度统计表**：新增 `GET /api/usage/stats?dimension=model|session_type`（每行 token/次数/占比/`cost_status`），`UsageStatsTable.tsx` 六列、其中五列可排序（`sortUsageStatsRows()` 纯函数，未知费用恒排末尾），空态诚实。
- **零回归**：`UsageTrendChart.tsx`/`UsageRecordsPanel.tsx` 零 diff；`UsageComponents.test.tsx` 7/7、`Settings.test.tsx` 4/4、`PricingConfigPanel.test.tsx` 8/8 原断言未改。
- **门禁**：backend **909 passed / 0 failed，覆盖率 92.67%**（基线 888/92.62%）；ruff exit 0；build ✓（4261 modules）；聚焦 Vitest 38 passed；全量 Vitest **134 files/470 passed**；4173 E2E **50/50**；8000 E2E **21/21**；i18n **2439/2439 parity 0**；`git diff --check` exit 0；删除 0；未 commit。
- **诚实出入**：参考源 `usage/` 目录实为 14 个文件且**不存在** `UsageFooter.tsx`/`UsageScriptModal.tsx`；CC Switch 用量表**不带排序**（排序为本卡新增）；契约计数 139/175 → **140/176**（新增端点所致）。
