# PROD-014: 统一页面任务头结构

> 状态：`[DONE]`  
> 阶段：Productization Phase 1
> 完成日期：2026-08-09

## 用户问题

核心页面分别使用搜索栏、Hero、工具条或普通标题开场，用户进入页面后不能稳定地看到“当前任务、当前对象、数据状态和下一步主操作”。

## 目标行为

为个股分析、标的研究、策略实验室和投资组合统一任务头顺序：页面目标、当前对象、数据状态、主操作。复用各页已有状态与处理函数，不改变业务调用。

## 范围内文件

- `frontend/src/components/TaskPageHeader.tsx`
- `frontend/src/pages/StockAnalysis.tsx`
- `frontend/src/pages/ResearchWorkspace.tsx`
- `frontend/src/pages/StrategyLab.tsx`
- `frontend/src/pages/Portfolio.tsx`
- `frontend/src/app.css`
- `frontend/tests/TaskPageHeader.test.tsx`
- 相关现有测试、`docs/ai/EXEC_PLAN.md` 和本任务卡

## 明确非目标

- 不统一结果正文、证据卡、方法区或保存历史；这些属于 Phase 2+。
- 不改接口、路由、表单参数、回测计算或持久化。
- 不引入依赖，不修改 `reference/`，不提交或发布。

## 验收

- 四个核心页面均使用同一任务头组件。
- 标题、目标、对象、状态和主操作具有稳定语义与响应式顺序。
- 状态来自当前页面真实加载/结果状态，不伪造“已同步”。
- 原有主要操作仍可执行且不重复显示同一顶部操作。
- 组件测试、现有页面测试、构建和桌面/窄屏浏览器验证通过。

## 回滚方式

恢复各页原标题/工具条/Hero，删除共享组件与样式/测试；业务状态和数据不受影响。

## 验证结果

- `TaskPageHeader` 组件测试与现有 StrategyLab 回归：3 passed。
- `bun run build`：通过，4,152 个模块完成转换。
- 桌面浏览器验证四页真实对象与状态；个股分析、策略回测、保存研究和新建组合主操作均只出现一次。
- 研究工作区上游部分失败时明确显示“部分数据不可用”，未伪造同步成功。
- 390×844 下四页任务头均按列排列，无页面横向溢出；Portfolio 加载完成后主操作可见。
- 证据：`artifacts/productization/phase1/15-task-header-desktop.png`、`16-task-header-narrow-390x844.png`。
