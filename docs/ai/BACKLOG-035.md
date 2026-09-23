# BACKLOG-035 — B9 首用能力引导：LocalCapabilityBanner 扩展为 model_ai + market_data 双状态

> 状态：`[DONE]` ｜ 优先级：P2 ｜ 创建：2026-09-07 ｜ 完成：2026-09-07（代码完成，交维护者复核） ｜ 执行：DSH Worker
> 背景：Astra B9 断言（部分证实）+ 维护者现状核实（2026-09-07）：
> - Dashboard 已有 `LocalCapabilityBanner`（Dashboard.tsx:28-31），处理 `capabilities.model_ai`（UNCONFIGURED→warning"未配置"+配置按钮→action_path=/models；CONFIGURED_UNVERIFIED→info"已配置待验证"+测试按钮）——Astra 说"首页无模型引导"已大幅缓解。
> - **但 Banner 完全忽略 `capabilities.market_data`**（types/index.ts:362 `market_data: { status: 'RUNTIME_CHECK_REQUIRED', quality_status: 'UNKNOWN' }`）——本地部署中行情源可用性同样是关键首用状态，用户双击 start.bat 后若行情源异常（无网络/源挂了）应看到诚实提示而非静默 UNKNOWN。
> - 本卡做**最小真实改**：Banner 扩展为双状态展示（model_ai 行 + market_data 行），不改能力判定后端逻辑（capabilities 由后端 /api/dashboard/stats 提供，只消费展示）。

## 目标

1. `LocalCapabilityBanner` 扩展：除 model_ai 外，展示 market_data 状态——`RUNTIME_CHECK_REQUIRED`/非 OK 时显示一行"行情源状态待检查/暂不可用"提示（i18n key），提供动作（引导到行情相关页或说明无 key/网络影响）；model_ai 行保留现状。
2. 视觉：双状态清晰分层（每状态一行 Alert 内容或一个多行 Alert），不引入新组件/新依赖；沿用 workbench-capabilities 现有样式语义。
3. i18n：新增 market_data 状态文案 zh/en 同步、parity 0；不动既有 model_ai 文案（today.capability.* 已被引用）。
4. 测试：Dashboard/LocalCapabilityBanner 测试补 market_data 状态展示用例（含 RUNTIME_CHECK_REQUIRED 与 OK 两态）。

## 允许修改
- `frontend/src/pages/Dashboard.tsx`（LocalCapabilityBanner 扩展）
- `frontend/src/i18n/zh.ts`+`en.ts`（新增 market_data 状态文案）
- `frontend/src/app.css`（workbench-capabilities 若需双行微调）
- `frontend/tests/Dashboard.test.tsx`（补用例）
- 证据文档：`docs/ai/BACKLOG-035.md`、`docs/ai/tasks/BACKLOG-035.md`（新建）、`docs/ai/EXEC_PLAN.md`、`task/CHANGELOG.md`、`HANDOFF.md`

## 禁止修改
- 后端一切（capabilities 判定逻辑不动，只消费展示）；不新增 dashboard/stats 字段
- E2E/playwright config、依赖/锁文件、`reference/`；不删除文件；不加依赖；不改 model_ai 既有文案/行为；不实施"干净机器首用深度引导"（超本卡，另行记录）

## 完成标准
1. Banner 显示 model_ai + market_data 双状态；market_data 非 OK 显示诚实提示 + 动作
2. i18n zh/en parity 0；既有 model_ai 文案/测试不回归
3. build、Vitest 全量、4173 E2E 50/50、8000 E2E 21/21 全绿（dashboard.spec 若有相关断言先核）
4. git diff --check、删除 0、工作树干净

## 参考
- 现状：`Dashboard.tsx:28-31`（LocalCapabilityBanner）、`types/index.ts:351-362`（capabilities 结构含 market_data）、`i18n/zh.ts today.capability.*`
- Astra B9：`docs/ai/astra-review/verification-2026-09-04.md` B9 段
- 后端 capabilities 来源（只读）：dashboard router/stats 聚合

## 完成证据模板
```
- Dashboard LocalCapabilityBanner diff（双状态）
- i18n 新 key + parity 0 确认
- Dashboard 测试补用例结果
- 全量门禁：build、Vitest、4173、8000
- git diff --check、删除 0、未 commit
```

## 完成证据（2026-09-07 DSH Worker，代码完成待维护者复核）

- **Dashboard LocalCapabilityBanner diff（双状态）**：单 Alert → `<div class="workbench-capabilities">` 双 Alert——model_ai 行原样（type/message/description/action/onNavigate(action_path) 逐字段未动）；market_data 行仅当 `quality_status !== 'OK'` 渲染 warning"行情源状态待检查"诚实提示 + 动作落 `/discover`。判定 `const marketDataQuality: string` 宽化后比较（`types/index.ts` 不在允许清单，仅声明 UNKNOWN 字面量；TS2367 经组件内宽化消除，未来后端放宽值仍成立）。
- **i18n 新 key + parity 0**：zh/en 各 +3（`today.capability.marketPending` / `marketPendingDescription` / `marketExplore`），2285→2288，差集空、重复 0；既有 `today.capability.*` model_ai key 未动一字。
- **测试补用例结果**：Dashboard.test.tsx LocalCapabilityBanner +2——(a) RUNTIME_CHECK_REQUIRED 显示市场诚实提示（`行情源状态待检查` + `检查网络后重试`）+ 动作 navigate('/discover') 且 model 行不回归；(b) quality_status OK 时市场 pending 行不渲染（model 行保留）。聚焦 7/7。
- **全量门禁**：build ✓（tsc -b + vite）；全量 Vitest 124 files/388 tests（386+2）全绿；4173 E2E 50/50（--retries=0）；8000 E2E 21/21（--retries=0）。
- **git diff --check** 通过、删除 0、未 commit。
- **诚实声明**：`LocalCapabilityBanner` 自 8a0be88 重构后未挂载到 Dashboard 渲染区（仅定义导出+单测覆盖）；挂载会需要改 dashboard.spec mock，而 E2E 为本卡禁止范围——本卡按 §允许 落成组件级双状态 + i18n + 单测，未擅自接线。详见 `docs/ai/tasks/BACKLOG-035.md`。
