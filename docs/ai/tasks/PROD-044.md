# PROD-044: 行业、市场和币种暴露可行性与缺口

> 状态：`[DONE]`  
> 阶段：Productization Phase 4

## 用户问题

组合页面可以解释权重集中和历史风险，但还不能说明资产属于哪个市场、使用什么币种或行业。加载器已有规范化 instrument 的市场与币种元数据；行业榜单字段只覆盖特定市场快照，不是逐标的稳定合同，不能借用或猜测。

## 目标行为

组合回测逐资产 provenance 保留真实 `market` 与 `currency`，前端按资产展示校准权重、市场、币种及字段覆盖状态；行业一律显示 `UNKNOWN` 和缺失合同说明。任一市场/币种字段缺失时同样保持未知，不从股票代码、名称或提供方推断。

## 范围内文件

- `backend/app/routers/backtests.py`
- `backend/tests/test_backtest_loaders.py` 或现有相关 router 测试
- `frontend/src/components/portfolio/PortfolioRiskWorkbench.tsx`
- `frontend/src/types/index.ts`
- `frontend/tests/PortfolioRiskWorkbench.test.tsx`
- `docs/ai/PRODUCT_CAPABILITY_MATRIX.md`
- `docs/ai/EXEC_PLAN.md` 和本任务卡

## 明确非目标

- 不从代码后缀、名称、行情提供方、板块榜单或 AI 推断市场、币种或行业。
- 不新增行业数据源，不计算行业/市场/币种聚合权重或风险贡献。
- 不改变优化器、回测、真实持仓或订单，不新增依赖。
- 不修改架构或 `reference/`，不提交或发布。

## 验收

- router 从加载器规范化 instrument 显式传递 market，并继续传递 currency；缺失值保留 `null`。
- 页面逐资产展示权重、market、currency、industry=`UNKNOWN` 和覆盖状态。
- 页面解释行业缺少逐标的真实合同，市场/币种也可能因提供方缺失而未知。
- 前后端聚焦测试、前端完整测试、构建及桌面/窄屏浏览器验证通过。

## 回滚方式

移除 provenance 的 market 字段和暴露可行性区；现有组合风险、优化器比较和来源表不受影响。

## 完成记录

- `/backtests/portfolio` 从加载器规范化 instrument 显式传递 `market`，并继续保留 `currency`；router 合同测试覆盖 US/USD 与 HK/HKD。
- 前端逐资产展示校准权重、真实 market/currency 和行业 `UNKNOWN`，并展示市场/币种/行业字段覆盖数；缺失元数据不从代码或名称补推。
- 当前行业榜单只属于市场快照，不是逐标的稳定行业合同，因此没有复用、抓取或 AI 推断行业。
- GitHub 开源方案检索因当前网络错误未取得结果；没有新增数据源、依赖或聚合暴露计算。
- 验证：后端 router 合同 1 passed、Ruff；前端聚焦 1 file / 7 tests、完整 40 files / 97 tests、TypeScript 和生产构建通过。
- 真实浏览器结果：`000858@1d` 与 `600519@1d` 均为 CN/CNY，覆盖 `2/2 · 2/2 · 0/2`，行业均为 UNKNOWN；证据为 `artifacts/productization/phase4/10-portfolio-exposure-feasibility-desktop.jpg`、`11-portfolio-exposure-feasibility-narrow-390x844.jpg`。
