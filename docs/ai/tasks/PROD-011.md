# PROD-011: Dashboard 任务启动台

> 状态：`[DONE]`  
> 阶段：Productization Phase 1
> 完成日期：2026-08-09

## 用户问题

Dashboard 的首视口被监控大屏占满，真正能产生结果的入口位于多屏之后；用户不知道第一步应分析股票、验证策略还是查看组合。

## 目标行为

在 Dashboard 标题后首先显示三个核心任务，并把监控大屏与市场雷达下移为次级信息。入口使用用户目标和可获得结果描述，不使用内部模块名作为主文案。

## 范围内文件

- `frontend/src/pages/Dashboard.tsx`
- `frontend/src/app.css`
- `frontend/e2e/dashboard.spec.ts`
- `docs/ai/EXEC_PLAN.md`
- 本任务卡

## 明确非目标

- 不实现示例数据预填、首次进度持久化或组合风险 X 光。
- 不改 Dashboard API、市场数据、大屏或其他页面实现。
- 不引入依赖，不修改 `reference/`，不提交或发布。

## 验收

- “分析股票、验证策略、查看组合”三个入口位于大屏之前。
- 每个入口说明用户问题、预期结果和一个明确主操作。
- 桌面首视口显示 3/3 个任务；390×844 至少显示完整启动台或清晰任务启动入口。
- 现有 Dashboard 监控、市场雷达和其他能力不丢失。
- E2E、前端构建和浏览器截图通过。

## 回滚方式

回退 Dashboard 启动台 JSX/CSS 和对应 E2E 断言；后端与持久数据不受影响。

## 验证结果

- E2E 先失败于启动台不存在，实施后 `bun run test:e2e -- dashboard.spec.ts`：1 passed。
- `bun run build`：通过，4,150 个模块完成转换。
- 桌面首视口：3/3 个任务完整显示，大屏位于其后。
- 390×844：3/3 个任务、问题标题和主操作均在首视口内，大屏标题开始出现在折叠线附近。
- 证据：`artifacts/productization/phase1/08-launchpad-desktop.png`、`09-launchpad-narrow-390x844.png`。
- GitHub 复用搜索因网络错误不可用；最终复用现有 Dashboard 导航与 AntD 按钮，无新依赖。
