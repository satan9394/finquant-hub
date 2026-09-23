# PROD-031: 回测结论摘要、失败原因排序和指标解释

> 状态：`[DONE]`  
> 阶段：Productization Phase 3

## 用户问题

完成回测后 13 个指标同级展示，主要结论、未跑赢原因、回撤、样本不足和稳健性限制需要用户自行拼接；失败时只有一条原始错误，缺少可执行下一步。

## 目标行为

保留现有“收益为正、最大回撤不低于 -20%、至少 5 笔交易”的基础门槛，先给结论和四项决策指标，再按优先级解释未跑赢、回撤、样本和稳健性限制；专业指标折叠并附通俗定义。失败按数据、参数或执行分类，不隐藏原始错误。

## 范围内文件

- `frontend/src/features/backtest/interpretation.ts`
- `frontend/src/components/strategy/BacktestSummary.tsx`
- `frontend/src/components/strategy/BacktestFailurePanel.tsx`
- `frontend/src/pages/StrategyLab.tsx`
- `frontend/tests/BacktestInterpretation.test.ts`
- `frontend/tests/BacktestSummary.test.tsx`
- `docs/ai/EXEC_PLAN.md` 和本任务卡

## 明确非目标

- 不改变回测、指标、显著性、交易、费用或基础结论阈值。
- 不新增投资建议、自动调参或模型生成解释。
- 不隐藏原始警告、失败文本、数据来源或方法参数。
- 不修改 `reference/`，不提交或发布。

## 验收

- 摘要先显示结论、总收益、基准/超额收益、最大回撤和交易数。
- 未跑赢、回撤、样本与稳健性原因按决策优先级展示实际值。
- 专业指标附用途解释并默认折叠；警告转为可读限制且保留未知代码。
- 失败区分数据、参数和执行问题，给出下一步并保留原始错误。
- 测试、构建和桌面/窄屏浏览器验证通过。

## 回滚方式

移除解释模块与两个组件，恢复 StrategyLab 原摘要指标网格、警告标签和通用错误 Alert；后端与保存数据不受影响。

## 完成记录

- 保留原三项基础门槛，新增结论优先的五项摘要、实际值原因排序、稳健性限制和可读警告；未知代码与原始错误保持可见。
- 专业指标默认折叠并附通俗解释；完成结果的补充 K 线加载失败被诚实标为“部分证据不可用”，不误报为回测未完成。
- 验证：聚焦 3 files / 8 tests；全量前端 31 files / 71 tests；TypeScript 与生产构建通过；桌面和 390×844 已保存真实回测浏览器检查通过，窄屏 `scrollWidth=375`。
- 证据：`artifacts/productization/phase3/03-backtest-summary-desktop.jpg`、`04-backtest-summary-narrow-390x844.jpg`。验证未运行、保存或修改业务数据。
