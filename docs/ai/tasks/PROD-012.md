# PROD-012: 三个真实示例任务

> 状态：`[DONE]`  
> 阶段：Productization Phase 1
> 完成日期：2026-08-09

## 用户问题

三个任务入口说明了方向，但仍要求用户先选择标的、参数或组合结构；新用户无法直接复测第一次真实结果。

## 目标行为

为股票分析、策略回测和组合查看提供 600519 真实示例起点。示例只预填可验证的输入，不伪造价格、成本或结果；任何组合写入仍由用户在表单中确认。

## 范围内文件

- `frontend/src/pages/Dashboard.tsx`
- `frontend/src/pages/Portfolio.tsx`
- `frontend/src/app.css`
- `frontend/e2e/dashboard.spec.ts`
- `docs/ai/EXEC_PLAN.md`
- 本任务卡

## 明确非目标

- 不自动运行回测，不自动创建组合/持仓。
- 不把固定价格或回测收益写成示例结果。
- 不修改接口、数据库或现有任务的默认行为。
- 不引入依赖，不修改 `reference/`，不提交或发布。

## 验收

- 股票示例直达 `/analysis/600519`。
- 策略示例直达 MA20/50 页面并预填 `symbol=600519`。
- 组合示例进入明确引导；已有组合时预填 600519、贵州茅台、10 股并留空成本；无组合时先预填组合名称。
- 页面明确说明提交前不会写入，成本须使用用户真实成本。
- E2E、构建和浏览器复测通过。

## 回滚方式

回退三项示例入口、Portfolio query 引导及测试；没有自动产生的持久数据需要清理。

## 验证结果

- E2E 先分别失败于示例按钮和 Portfolio 引导不存在；实施后 Dashboard/Portfolio E2E：2 passed。
- `bun run build`：通过，4,150 个模块完成转换。
- 浏览器确认策略示例 URL 为 `/strategy-lab/ma-crossover?symbol=600519`，股票代码输入值为 `600519`。
- 浏览器确认 Portfolio 仅预填 `600519`、`贵州茅台`、`10`，成本为空；未点击确认，没有写入持仓。
- 桌面和 390×844 下三个示例动作均可见。
- 证据：`artifacts/productization/phase1/10-real-examples-desktop.png`、`11-real-examples-narrow-390x844.png`、`12-portfolio-example-prefill.png`。
