# PROD-040: 接入组合回测和风险 X 光

> 状态：`[DONE]`  
> 阶段：Productization Phase 4

## 用户问题

Portfolio 目前只展示持仓、盈亏和按市值配置，无法回答历史组合风险。后端已经有 `/backtests/portfolio`，会在样本前段校准权重并返回组合/基准曲线、逐资产结果和风险 X 光，但前端完全未接线。

## 目标行为

当前分组至少有两个持仓时，用户显式运行只读等权基线模拟；请求使用统一日频 MA20/50、60 期校准、800 条行情和现有持仓总成本作为初始资金。结果展示校准后权重、组合/基准曲线、绩效、交易数、逐资产来源/质量状态，以及 concentration、drawdown、tail risk 和 diversification 原始证据。

## 范围内文件

- `frontend/src/services/analysisApi.ts`
- `frontend/src/types/index.ts`
- `frontend/src/components/portfolio/PortfolioRiskWorkbench.tsx`
- `frontend/src/pages/Portfolio.tsx`
- `frontend/tests/PortfolioRiskWorkbench.test.tsx`
- `docs/ai/PRODUCT_CAPABILITY_MATRIX.md`
- `docs/ai/EXEC_PLAN.md` 和本任务卡

## 明确非目标

- 不修改、再平衡或下单真实持仓；校准权重只属于模拟结果。
- 不在前端计算风险指标，不替代缺失 VaR/ES、相关性或来源数据。
- 不在本任务比较四种优化器或增加行业/市场/币种暴露。
- 不新增依赖，不修改架构或 `reference/`，不提交或发布。

## 验收

- 少于两个持仓时明确说明无法运行，不发请求。
- 点击后请求只含当前持仓代码和披露的基线参数，不写持仓接口。
- 成功结果显示后端返回的权重、曲线、绩效、逐资产来源和四组风险 X 光。
- 上游或样本不足保留后端状态/错误，不前端估算。
- 前端测试、构建和桌面/窄屏浏览器验证通过。

## 回滚方式

移除组合风险工作台、前端结果类型和 `/backtests/portfolio` 客户端方法；现有 Portfolio CRUD 不受影响。

## 完成记录

- Portfolio 复用现有 `/api/backtests/portfolio`，只有当前分组至少两个持仓且用户显式点击时才运行等权基线；请求不调用持仓写接口。
- 结果展示组合/基准曲线、收益/回撤、交易数、胜率、盈亏比、校准权重、逐资产来源/截止时间/质量标记，以及后端 concentration、drawdown、tail risk 和 diversification 原始证据。
- 真实本地验证使用现有 `000858` 与 `600519` 持仓，来源为 Sina、截止 `2026-08-07`、质量标记 `unadjusted_prices`；运行后真实持仓数量和成本保持不变。
- GitHub 开源方案检索因当前网络错误未取得结果；本任务未新增依赖或重写组合回测实现。
- 验证：聚焦 1 file / 2 tests；完整前端 40 files / 92 tests；TypeScript 和生产构建通过；`git diff --check` 无空白错误。
- 浏览器证据：`artifacts/productization/phase4/01-portfolio-risk-live-desktop.jpg`、`03-portfolio-risk-responsive-narrow-390x844.jpg`；窄屏披露、操作和指标无横向溢出。
