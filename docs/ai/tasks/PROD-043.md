# PROD-043: 四种优化器只读比较

> 状态：`[DONE]`  
> 阶段：Productization Phase 4

## 用户问题

Portfolio 已经能运行等权基线，但后端已有风险平价、均值方差和逆波动优化器仍未形成可比较工作流。现有组合指标没有汇总换手，无法满足优化前后同时比较收益、风险、换手和假设的阶段退出要求。

## 目标行为

等权基线完成后，用户显式运行四种优化器比较；资产、MA20/50、60 期校准、800 条行情、初始资金和成本全部固定，只改变 `optimizer`。结果并排展示收益、最大回撤、组合级换手、交易数、最大权重和有效资产数，并说明每种优化器假设。

## 范围内文件

- `backend/app/backtest/portfolio.py`
- `backend/tests/test_portfolio_backtest.py`
- `frontend/src/components/portfolio/PortfolioRiskWorkbench.tsx`
- `frontend/src/types/index.ts`
- `frontend/tests/PortfolioRiskWorkbench.test.tsx`
- `docs/ai/PRODUCT_CAPABILITY_MATRIX.md`
- `docs/ai/EXEC_PLAN.md` 和本任务卡

## 明确非目标

- 不推荐“最佳”优化器，不自动采用任何权重，不修改持仓或产生订单。
- 不在前端汇总或推算换手；组合级换手必须由后端从逐资产真实结果汇总。
- 不改变优化器算法、市场数据降级链、策略参数或成本口径。
- 不新增依赖，不修改架构或 `reference/`，不提交或发布。

## 验收

- 组合级换手由后端返回并有回归测试，布尔/整数指标类型不漂移。
- 比较请求只改变 `optimizer`，等权结果可复用，不重复提交持仓写请求。
- 四行结果展示收益、回撤、换手、交易数和集中度证据，并逐项说明优化假设。
- 任一方案失败时明确该方案不可用，不用其他结果替代；真实持仓保持不变。
- 前后端聚焦测试、前端完整测试、构建及桌面/窄屏浏览器验证通过。

## 回滚方式

移除组合级换手字段和优化器比较区；现有等权模拟、风险解释和可视化不受影响。

## 完成记录

- 后端按校准权重汇总逐资产真实换手，并排除 0% 权重资产对组合交易/分散化指标的污染；0% 资产仍保留诊断结果和明确 warning。
- 修复均值方差可合法产生 0% 权重时向单资产引擎传入零资本的根因，四种已声明优化器均可完成同口径模拟。
- 前端复用等权结果，只额外请求风险平价、均值方差和逆波动；所有请求除 `optimizer` 外完全一致，单方案失败及旧响应缺少换手均保持“不可用”。
- 每行展示总收益、最大回撤、组合换手、交易数、最大权重、有效资产数和算法假设，不排序或推荐方案，不修改真实持仓。
- GitHub 开源方案检索因当前网络错误未取得结果；没有新增依赖或改变优化器算法。
- 验证：后端 portfolio/risk 12 passed、Ruff 通过；前端聚焦 1 file / 6 tests、完整 40 files / 96 tests、TypeScript 和生产构建通过。
- 真实结果：等权 `-21.43% / -22.33% / 13.960x`，风险平价 `-22.52% / -22.63% / 14.488x`，均值方差 `-26.84% / -27.66% / 16.561x` 且最大权重 100%，逆波动与风险平价在当前样本相同。
- 浏览器证据：`artifacts/productization/phase4/08-portfolio-optimizer-comparison-desktop.jpg`、`09-portfolio-optimizer-comparison-narrow-390x844.jpg`。
