# PROD-032: 预设比较、单参数变化和保存实验

> 状态：`[DONE]`  
> 阶段：Productization Phase 3

## 用户问题

回测可以运行、保存和重开，但用户无法确认两个结果是否处于相同标的、区间和成本口径，也看不到本次到底改变了一个还是多个参数；并排比较预设时容易把不可比结果归因给策略参数。

## 目标行为

复用现有保存接口，把已保存回测表述为实验。用户打开一个已保存实验后，可看到当前表单相对基准的参数差异；恰好一项时明确可做单参数归因，多项时明确不可直接归因。三种预设只匹配同标的、同区间、同资金、同成本和同基准的真实已保存结果，缺失结果显示未运行。完成结果可与基准并排查看实际指标差异。

## 范围内文件

- `frontend/src/features/backtest/experiments.ts`
- `frontend/src/components/strategy/ExperimentWorkbench.tsx`
- `frontend/src/pages/StrategyLab.tsx`
- `frontend/tests/BacktestExperiments.test.ts`
- `frontend/tests/ExperimentWorkbench.test.tsx`
- `frontend/tests/StrategyLab.test.tsx`
- `docs/ai/EXEC_PLAN.md` 和本任务卡

## 明确非目标

- 不并发或自动运行多个回测，不自动保存，不修改真实交易或持仓。
- 不新增后端表、接口、依赖、实验名称或自由文本结论字段。
- 不比较标的、日期、资金、成本或基准口径不同的结果，不补造缺失指标。
- 不改变策略、费用、指标、稳健性或结论阈值。
- 不修改 `reference/`，不提交或发布。

## 验收

- 已保存回测以实验呈现；打开实验即成为只读比较基准。
- 当前表单与基准的 0、1、多参数差异状态明确，单参数显示前后实际值。
- 三个预设并排显示；只有完整上下文一致的真实已保存结果进入比较，其他显示未运行。
- 当前完成结果与基准展示总收益、超额收益、最大回撤和交易数的实际差异。
- 测试、构建和桌面/窄屏浏览器验证通过；验证不创建或保存业务数据。

## 回滚方式

移除实验解释模块和工作台，恢复 StrategyLab 的“已保存回测/查看结果/保存结果”文案；现有回测数据与接口不受影响。

## 完成记录

- 复用现有 `is_saved` 回测记录作为实验，不增加后端或依赖；打开已保存实验即选择只读基准，运行与保存仍是两个显式动作。
- 当前表单相对基准显示 0、1、多参数差异；只有同标的、区间、资金、成本和基准的真实结果进入三预设比较，缺失预设显示未运行。
- 完成结果可与基准比较总收益、超额收益、最大回撤和交易数；口径不同时拒绝展示指标差异。
- 验证：聚焦 3 files / 9 tests；全量前端 33 files / 77 tests；TypeScript、生产构建和 diff check 通过；桌面与 390×844 浏览器检查通过，窄屏 `scrollWidth=375`。
- 证据：`artifacts/productization/phase3/05-experiment-comparison-desktop.jpg`、`06-experiment-comparison-narrow-390x844.jpg`。浏览器仅打开已有实验并修改本地表单，未运行或保存业务数据。
