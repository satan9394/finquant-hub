# PROD-020: 统一摘要、证据与方法结果框架

> 状态：`[DONE]`  
> 阶段：Productization Phase 2
> 完成日期：2026-08-09

## 用户问题

核心结果页虽已有结论、图表、来源和参数，但标题与顺序各不相同；用户需要逐页重新判断“先看什么、证据在哪里、如何复现”。

## 目标行为

用同一语义层级组织个股分析、标的研究、深度研究和策略回测结果：先摘要，再证据，最后方法与来源。复用现有数据、结论和质量状态，不增加计算或伪造来源。

## 范围内文件

- `frontend/src/components/ResultLayer.tsx`
- `frontend/src/pages/StockAnalysis.tsx`
- `frontend/src/pages/ResearchWorkspace.tsx`
- `frontend/src/pages/Research.tsx`
- `frontend/src/pages/StrategyLab.tsx`
- `frontend/src/app.css`
- `frontend/tests/ResultLayer.test.tsx`
- 相关现有测试、`docs/ai/EXEC_PLAN.md` 和本任务卡

## 明确非目标

- 不改信号文案、评分、指标定义、报告生成、回测计算或 API。
- 不补造个股行情接口当前未暴露的 provider/as_of；缺失时明确显示未暴露。
- 不实现指标知识卡、研究聚合、论文/预警闭环；由后续 PROD-021–025 处理。
- 不修改 `reference/`，不提交或发布。

## 验收

- 四个结果页使用同一 `摘要 → 证据 → 方法与来源` 顺序和语义 landmark。
- 原有主要结果、图表、质量标记、参数、来源与保存动作不丢失。
- 摘要优先可见，专业参数和原始明细后置。
- 缺失来源明确为未暴露/未知，不以接口名冒充数据提供方。
- 组件/页面测试、构建和桌面/窄屏浏览器验证通过。

## 回滚方式

移除共享结果层包装和样式，将原有卡片恢复为页面直属结构；业务状态与数据不受影响。

## 验证结果

- 共享结果层测试先失败于组件不存在；实施后 ResultLayer/StrategyLab/GlobalTaskEntry/TaskPageHeader：4 files / 6 tests passed。
- `bun run build`：通过，4,155 个模块完成转换。
- 浏览器逐页确认 Stock Analysis、Research Workspace、Deep Research、Strategy Lab 均按 `summary → evidence → method` 输出三个 landmark。
- 全局入口的分析路径使用 `autorun=0`；浏览器确认模型分析未自动启动，摘要显示可执行空状态。
- Stock Analysis 对未暴露的 provider/复权/时区明确标记未知；Workspace 保留真实 provider、截止时间和质量 flags；Deep Research 保留 MODEL_OUTPUT 与逐条核对提示；Strategy 保留 benchmark、曲线、交易、参数、provider 和警告。
- 390×844 三层标题正常换行、无页面横向溢出。
- 证据：`artifacts/productization/phase2/01-result-framework-desktop.png`、`02-result-framework-narrow-390x844.png`。
