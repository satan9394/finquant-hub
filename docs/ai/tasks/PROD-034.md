# PROD-034: 本地 Alpha 模拟和相关性

> 状态：`[DONE]`  
> 阶段：Productization Phase 3

## 用户问题

Alpha 模板可以选择和解释，但仍无法在页面使用现有 `/wq/simulate/local` 与 `/wq/correlation`。模拟接口要求调用者明确提供横截面 factor 与下一期收益；短样本会产生极端年化值，相关性接口又只接收两个无日期序列，若前端不约束会制造错误对齐和过度解读。

## 目标行为

用户选择模板后，粘贴含 `date,symbol,factor,forward_return` 的 CSV 或 JSON 观察数据；前端先验证字段、有限数值、重复键和每日至少两个标的，再显式运行本地多空模拟。结果显示区间收益、回撤、换手、正收益期占比、样本期数与质量警告；短样本不主推年化指标。用户可把一次结果设为本地相关性基准，第二次模拟后只按共同日期对齐，至少 3 个共同期才调用相关性接口。

## 范围内文件

- `frontend/src/services/alphaApi.ts`
- `frontend/src/features/alpha/observations.ts`
- `frontend/src/components/alpha/AlphaSimulationWorkbench.tsx`
- `frontend/src/pages/AlphaResearch.tsx`
- `frontend/tests/AlphaObservations.test.ts`
- `frontend/tests/AlphaSimulationWorkbench.test.tsx`
- `frontend/tests/AlphaResearch.test.tsx`
- `docs/ai/EXEC_PLAN.md` 和本任务卡

## 明确非目标

- 不生成、下载或补造观察数据；不从模板表达式推算 factor。
- 不计算后端尚未提供的 IC、分位收益、衰减、显著性或因果结论。
- 不自动保存、模拟或提交外部 BRAIN；页面不调用 `/wq/brain/*`。
- 不把短样本年化值当作主要结论，不把相关性当因果。
- 不新增依赖，不修改 `reference/`，不提交或发布。

## 验收

- CSV/JSON 观察数据校验通过后才可显式运行；错误包含可执行修正信息。
- 模拟结果展示真实 API 指标、期数和样本质量；原始期收益与权益曲线日期可核对。
- 相关性只比较共同日期且至少 3 期，显示 `r`、`p_value`、`n` 与后端 note。
- 模板选择、模拟、设置基准和相关性均为独立显式动作；无 BRAIN 请求。
- 测试、构建和桌面/窄屏浏览器验证通过；浏览器验证不提交虚构观察数据。

## 回滚方式

移除观察数据解析、模拟工作台和 Alpha API 写方法，恢复 PROD-033 的类别/模板/搜索页面；后端与数据不受影响。

## 完成记录

- 新增 CSV/JSON 观察数据解析与前端校验：必需列、有限数值、`date/symbol` 重复键和每日至少两个标的；不生成示例数值或 factor。
- 显式调用本地模拟后展示区间收益、回撤、换手、正收益期、期数和 Sharpe；少于 20 期明确标为样本不足，不主推极端年化值。
- 用户可把一次内存结果设为相关性基准；第二次结果仅按共同日期对齐且至少 3 期才调用相关性接口，显示 `r/p/n/note` 和非因果说明。
- 验证：聚焦 3 files / 6 tests；全量前端 38 files / 86 tests；TypeScript、生产构建和 diff check 通过；桌面与 390×844 输入边界浏览器检查通过，窄屏 `scrollWidth=375`。
- 证据：`artifacts/productization/phase3/09-alpha-simulation-input-desktop.jpg`、`10-alpha-simulation-input-narrow-390x844.jpg`。因未提供真实观察数据，浏览器只验证空输入拒绝，未调用模拟、相关性、持久化或 BRAIN。
