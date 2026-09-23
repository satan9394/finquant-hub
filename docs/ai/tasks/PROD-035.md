# PROD-035: P1 回测风险、基准归因和交易质量指标

> 状态：`[DONE]`  
> 阶段：Productization Phase 3

## 用户问题

单策略回测已有收益、最大回撤和少量风险调整指标，但不能回答最大回撤何时恢复、收益有多少来自基准暴露，以及单笔交易和真实成交成本是否健康。旧结果也不会自动拥有新增证据，前端不能反推或补造。

## 目标行为

后端从已对齐的权益/基准曲线计算年化波动、下行波动、最大回撤持续和恢复期、回归 Alpha/Beta/R² 与 Tracking Error；从完整交易、持仓区间和实际 fill 成本计算单笔期望、平均盈利/亏损、平均持有期、市场暴露和费用拆分。前端按风险、基准归因和交易质量展示，并对旧结果明确标为不可用。

## 范围内文件

- `backend/app/backtest/metrics.py`
- `backend/app/backtest/ma_crossover.py`
- `backend/tests/test_backtest_metrics.py`
- `backend/tests/test_ma_crossover.py`
- `frontend/src/types/research.ts`
- `frontend/src/components/strategy/BacktestSummary.tsx`
- `frontend/tests/BacktestSummary.test.tsx`
- `docs/ai/PRODUCT_CAPABILITY_MATRIX.md`
- `docs/ai/EXEC_PLAN.md` 和本任务卡

## 明确非目标

- 不从旧持久化结果前端推算新增指标，不补造无真实输入的数据。
- 不引入无风险利率或因子模型；Alpha 为策略收益对基准收益的一元回归截距年化。
- 持有期、回撤持续和恢复期均按观测 bar 数表达，不伪装成自然日。
- 不修改多资产组合合同、架构、`reference/`，不新增依赖，不提交或发布。

## 验收

- 风险和基准指标由等长曲线计算；样本或基准方差不足时保持 `null`。
- 最大回撤区分已恢复和未恢复；未恢复时恢复期为 `null`。
- 成交成本由佣金、印花税和滑点逐笔汇总且可对账；交易质量只用完整交易。
- 旧结果显示缺口，不做浏览器端推算；新字段有类型、解释和测试。
- 聚焦测试、完整门禁和桌面/窄屏浏览器验证完成。

## 回滚方式

移除新增共享指标、MA 成交质量汇总和前端 P1 指标组；已有回测结果与持久化结构无需迁移。

## 完成记录

- 共享绩效层新增年化/下行波动、最大回撤持续和恢复期、回归 Alpha/Beta/R² 与 Tracking Error；零方差或样本不足保持 `null`，无回撤明确为 0 期且已恢复。
- MA 引擎仅用完整交易计算单笔期望、平均盈利/亏损和平均持有 bar；市场暴露来自逐 bar 持仓。佣金、印花税和滑点按每个实际 fill 累加，即使期末卖出因 T+1 被拒也保留已发生的入场成本。
- 结果摘要把恢复状态提升到主指标，并折叠展示 P1 指标的口径说明；旧持久化结果统一显示 `—` 和“本页不会从旧结果推算”。
- 验证：后端共享消费者 33 passed；完整后端 384 passed / 4 failed、coverage 83.32%，失败均为既有 US/HK/AAPL 外部标的解析边界；Ruff 通过。前端 38 files / 87 tests、TypeScript 与生产构建通过。
- 浏览器证据：`artifacts/productization/phase3/11-backtest-p1-legacy-desktop.jpg`、`12-backtest-p1-legacy-narrow-390x844.jpg`；旧 AAPL 结果无 P1 字段时未重跑、未保存、未前端推算，窄屏 `scrollWidth=375`。
