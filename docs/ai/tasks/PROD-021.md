# PROD-021: 个股信号中文化与冲突解释

> 状态：`[DONE]`  
> 阶段：Productization Phase 2
> 完成日期：2026-08-09

## 用户问题

个股页直接展示 `golden_cross`、`volume_surge` 等内部代码，且没有说明信号适用的日线时间尺度；看多与看空信号同时出现时，用户也缺少明确的分歧提示。

## 目标行为

复用现有近期信号结果，将内部代码映射为中文名称和解释；给出偏强、中性或偏弱的透明计数结论、日线时间尺度，以及看多/看空并存时的冲突说明。不改变后端检测、评分或行情数据。

## 范围内文件

- `frontend/src/components/SignalInterpretation.tsx`
- `frontend/src/pages/StockAnalysis.tsx`
- `frontend/tests/SignalInterpretation.test.tsx`
- `docs/ai/EXEC_PLAN.md` 和本任务卡

## 明确非目标

- 不改变信号检测、20 日近期窗口、技术评分或 API。
- 不把事件信号解释成持续持仓建议，不补造信号日期、置信度或来源。
- 不实现指标知识卡或后续研究聚合任务。
- 不修改 `reference/`，不提交或发布。

## 验收

- 所有当前后端信号代码均显示为中文名称，页面不直接展示实现标识。
- 摘要显示偏强/中性/偏弱、日线短中期尺度和可复核的看多/看空/中性计数。
- 看多与看空并存时明确显示分歧，证据按方向分组并保留原始中文描述。
- 无结果和未知代码保持保守、可理解，不产生投资建议。
- 测试、构建和桌面/窄屏浏览器验证通过。

## 回滚方式

移除信号解释组件，恢复原有标签列表；后端信号和指标数据不受影响。

## 验证结果

- 测试先失败于 `SignalInterpretation` 不存在；实施后组件测试 3 passed，覆盖当前检测器的 9 个 signal code、冲突、多数结论、空状态和未知代码。
- 前端全量测试：20 files / 49 tests passed；`bun run build` 通过，4,156 个模块完成转换；`git diff --check` 通过。
- 实时 600519 返回看多 2、看空 2、中性 1；页面显示“中性 / 日线 · 短中期 / 多空信号并存”，并按方向展示中文名称、尺度和检测详情。
- 390×844 下证据分组单列堆叠，`scrollWidth=375 <= innerWidth=390`，无横向溢出。
- 证据：`artifacts/productization/phase2/03-signal-interpretation-desktop.png`、`04-signal-interpretation-narrow-390x844.png`、`05-signal-evidence-desktop.png`、`06-signal-evidence-narrow-390x844.png`。
- GitHub-first 搜索因搜索服务网络错误未完成；实现复用了仓库现有 detector、SignalBadge 和 Ant Design，无新依赖。
