# BACKLOG-058: 模型流式遥测与预算条的浏览器自动化交互与 E2E 验证

## 目标与用户价值
对 BACKLOG-050～053 新落地的模型双协议遥测与提示词缓存管理功能，构建完整的真实浏览器自动化交互模拟与 Playwright E2E 测试套件。
确保用户在真实浏览器操作中，能够通过鼠标点击查看流式遥测指标、展开上下文预算条、切换 Settings 用量与计价面板，并在交互中保持 0 控制台未捕获错误。

## 交互测试场景与路径
1. **Chat 页面流式遥测交互 (`/chat`)**:
   - 导航至 `/chat` 页面，模拟发送对话请求。
   - 监听后台推送的真实或 Mock `llm_metrics` SSE 事件流。
   - 鼠标悬停并点击紧凑型遥测徽章（`ModelTelemetryBadge`，`data-testid="model-telemetry-badge"`）。
   - 断言徽章平滑展开，包含首字延迟（TTFT，毫秒）、Token 生成速率（tok/s）、输入/输出 Token 计数以及缓存命中数。
   - 检查上下文预算条（`ContextBudgetBar`，`data-testid="context-budget-bar"`），断言进度条随 Token 累积而动态响应。

2. **Research 页面研报多 Agent 遥测交互 (`/research`)**:
   - 导航至 `/research`，模拟多 Agent 研报生成。
   - 断言各 Agent 节点的遥测徽章独立渲染各自的执行耗时与速率。
   - 验证无网络异常状态下的降级展示（如无计价时显示 `unpriced`，无流式速率时诚实隐藏而非显示 0）。

3. **Settings 用量与缓存分析交互 (`/settings`)**:
   - 导航至 `/settings`，点击切换到“用量与计价”面板。
   - 点击日期范围选择器（`UsageDateRangePicker`），模拟点击切换 7 天、30 天与自定义日期。
   - 校验缓存节省收益卡片（`UsageHero`），断言根据单价计算的节省金额正确显示，并在跨币种时显示 `MIXED` 提示。

## 交付文件
- `frontend/e2e/model-telemetry.spec.ts`: 覆盖 Chat、Research、Settings 遥测与缓存的 Playwright E2E 交互测试用例。
- 必要时更新 `frontend/e2e/helpers.ts` 中的 mock 辅助函数以支持 `llm_metrics` 流式测试。

## 验证门禁
- `cd frontend && bun run test:e2e e2e/model-telemetry.spec.ts` 退出码 0，用例全部通过。
- 浏览器控制台 0 uncaught exception。
- 执行过程截屏或 Trace 录制正常，无 DOM 节点遮挡或重叠报错。

## 执行证据（2026-09-23）
- 新增 `frontend/e2e/model-telemetry.spec.ts`：Chat SSE 遥测徽章悬停/点击展开、数值详情与 12,000 Token 上下文预算；Research 两个 Agent 的 SSE `role_key` 独立遥测徽章与缺失速率/TTFT 的 UNKNOWN 展示；Settings 7 天、30 天、自定义日期及缓存节省 USD/MIXED 状态。所有 API/SSE 都由确定性 fixture 拦截，测试断言 `pageerror` 与浏览器 `console.error` 均为 0，并保存每例最终页面截图。
- 实测发现 `UsageDateRangePicker` 点击“自定义”只切换按钮样式，没有显示日期输入；修复局部展开状态后，日期输入与应用请求均由 E2E 覆盖。修复文件：`frontend/src/components/settings/UsageDateRangePicker.tsx`。
- 为满足卡片的逐 Agent 场景，Research 现在按 SSE `role_key` 保存并渲染各 Agent 的最新指标；缺速率继续显示 UNKNOWN，不伪造为 0。将 Agent 状态网格调整为 3 列，避免窄卡挤压遥测与角色文案。修复文件：`frontend/src/pages/Research.tsx`。
- 验证：`bun run test:e2e e2e/model-telemetry.spec.ts` → **3 passed (10.0s, serial、无 retry)**；`bun run test tests/UsageDetail.test.tsx` → **19 passed**；Research agent focused suites → **19 passed**。Playwright `test-results/` 下每例均保留 `browser-final-state.png`。
- E2E 使用 deterministic API/SSE fixture，未调用真实模型/行情上游；实时上游链路仍须由服务层集成验证。
