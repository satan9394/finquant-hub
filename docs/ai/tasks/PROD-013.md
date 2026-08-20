# PROD-013: 首次任务进度与上下文帮助

> 状态：`[DONE]`  
> 阶段：Productization Phase 1
> 完成日期：2026-08-09

## 用户问题

新用户能看到三个入口，但不知道自己已经完成了哪些关键首次任务；大段教程又会遮挡真实工作流。

## 目标行为

在 Dashboard 启动台显示本地首次进度：首次成功分析、首次完成回测、首次成功保存。提供一行可隐藏、可恢复的上下文提示，不使用阻塞式 tour 或外部追踪。

## 范围内文件

- `frontend/src/features/productProgress.ts`
- `frontend/src/pages/Dashboard.tsx`
- `frontend/src/pages/StockAnalysis.tsx`
- `frontend/src/pages/StrategyLab.tsx`
- `frontend/src/app.css`
- `frontend/tests/ProductProgress.test.ts`
- `frontend/tests/StrategyLab.test.tsx`
- `frontend/e2e/dashboard.spec.ts`
- `docs/ai/EXEC_PLAN.md`
- 本任务卡

## 明确非目标

- 不创建事件表、分析端点、外部 SDK 或跨用户指标。
- 不把页面访问、启动动作、失败回测或 Portfolio PnL 误计为完成。
- 不实现阻塞式新手 tour，不记录 ticker、prompt、结果或持仓。
- 不修改 `reference/`，不提交或发布。

## 验收

- 进度严格对应指标合同的成功条件：真实分析结果、completed 回测、成功保存。
- 进度仅存三个布尔值和提示隐藏状态，可跨本地会话恢复。
- 当前页完成后 Dashboard 能读取进度；同页可通过自定义事件即时刷新。
- 提示默认一行、可隐藏、可恢复，不遮挡三个主任务。
- 单元、E2E、构建和桌面/窄屏浏览器验证通过。

## 回滚方式

删除本地进度工具和调用点，回退 Dashboard 进度 UI/CSS/测试；可选删除浏览器中的 `finquant_product_progress_v1`，无数据库数据需要清理。

## 验证结果

- 单元测试先失败于进度模块不存在；实施后 ProductProgress + navigation：4 passed。
- Dashboard/Portfolio E2E：2 passed，覆盖 0/3、隐藏提示、恢复提示和示例引导。
- `bun run build`：通过，4,151 个模块完成转换。
- 浏览器真实运行 600519 分析后，Dashboard 从 0/3 更新为 1/3；已完成项仅为“首次分析”。
- 390×844 首视口保持 3/3 个任务可见，进度紧随任务之后；没有阻塞式 tour。
- 证据：`artifacts/productization/phase1/13-first-task-progress-desktop.png`、`14-first-task-progress-narrow-390x844.png`。
