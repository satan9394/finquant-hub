# PROD-030: 策略目标与预设选择，高级参数渐进披露

> 状态：`[DONE]`  
> 阶段：Productization Phase 3

## 用户问题

双均线实验室首屏直接平铺标的、日期、均线、费用和风控字段，用户必须先理解参数才能开始；现有预设只有名称，没有目标、适用场景或代价说明。

## 目标行为

先选择策略目标，再选择可解释预设和标的。趋势跟随与风险控制复用现有 MA crossover 参数；当前没有均值回归引擎，因此明确显示不可用。均线、费用和回撤止损等原有字段完整保留在高级披露，运行仍由用户确认。

## 范围内文件

- `frontend/src/features/backtest/presets.ts`
- `frontend/src/components/strategy/StrategySetup.tsx`
- `frontend/src/pages/StrategyLab.tsx`
- `frontend/tests/StrategySetup.test.tsx`
- `frontend/tests/StrategyLab.test.tsx`
- `docs/ai/EXEC_PLAN.md` 和本任务卡

## 明确非目标

- 不新增均值回归、交易信号、回测引擎或后端参数。
- 不改变三个现有 MA 预设、费用默认值、成交规则、指标或保存合同。
- 不自动运行回测；选择目标和预设只更新本地表单。
- 不修改 `reference/`，不提交或发布。

## 验收

- 首屏先显示趋势跟随、均值回归、风险控制及其当前可用性。
- 可执行预设说明参数、目的和主要取舍；选择后精确更新现有表单值。
- 标的、区间、初始资金和预设保持默认可见；MA、费用和回撤止损默认折叠且可完整编辑。
- 均值回归不伪装成 MA 预设，运行回测仍需点击主操作。
- 测试、构建和桌面/窄屏浏览器验证通过。

## 回滚方式

移除目标/预设组件和高级折叠，将原回测参数 Row 恢复为平铺；后端回测、历史与保存数据不受影响。

## 验证结果

- 测试先失败于策略设置组件不存在；实施后 StrategySetup/StrategyLab：2 files / 5 tests passed。
- 趋势跟随和风险控制明确为可运行；均值回归显示“当前没有均值回归引擎”并禁用，不用 MA crossover 冒充。
- 稳健、标准、进取三个现有预设保留原参数，并新增目的与主要取舍；风险控制精确带入 MA30/90 和 12% 回撤止损。
- 标的、开始/结束日期和初始资金默认可见；短/长均线、成本预设、手续费、滑点、印花税、最低佣金、回撤止损和基准默认折叠且可编辑。
- 实时页面选择风险控制后仅更新本地表单，未出现排队或运行状态，唯一主操作仍为“运行回测”。
- 前端全量测试：29 files / 66 tests passed；`bun run build` 和 `git diff --check` 通过。
- 390×844 下目标与预设单列，均值回归禁用、高级内容默认隐藏，`scrollWidth=375 <= innerWidth=390`。
- 证据：`artifacts/productization/phase3/01-strategy-goals-desktop.png`、`02-strategy-goals-narrow-390x844.png`。
- GitHub-first 搜索因搜索服务网络错误未完成；实现复用现有 MA crossover 和三个预设，无后端、依赖或计算变更。
