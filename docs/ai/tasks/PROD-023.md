# PROD-023: 研究工作区聚合快照、报告、分歧、笔记和历史版本

> 状态：`[DONE]`  
> 阶段：Productization Phase 2
> 完成日期：2026-08-09

## 用户问题

标的研究页已有行情、基本面和一份可保存笔记，但深度报告版本、讨论分歧、投资论文与刷新变化散落在不同页面，无法在同一标的上下文中复盘。

## 目标行为

只读聚合当前用户已有的报告历史、报告详情、讨论摘要和投资论文，并与当前/保存快照及最新笔记并列展示。版本变化只比较已保存的核心结论文本；无法可靠关联或当前 schema 不保存的内容明确标为不可用。

## 范围内文件

- `frontend/src/features/researchContinuity.ts`
- `frontend/src/components/research/ResearchContinuity.tsx`
- `frontend/src/pages/ResearchWorkspace.tsx`
- `frontend/src/pages/Research.tsx`
- `frontend/src/pages/Discussion.tsx`
- `frontend/src/pages/Thesis.tsx`
- `frontend/src/services/researchApi.ts`
- `frontend/src/types/research.ts`
- `frontend/src/app.css`
- `frontend/tests/ResearchContinuity.test.tsx`
- `docs/ai/EXEC_PLAN.md` 和本任务卡

## 明确非目标

- 不迁移数据库，不新增笔记修订表、讨论外键或报告计算。
- 不从模型正文推断新的投资结论；仅展示已保存字段和精确文本变化状态。
- 讨论仅按代码或公司名在主题文字中匹配，并显式标注该边界。
- 无 URL、无论文、无历史版本时保持空状态，不补造引用、验证条件或观点变化。
- 不修改 `reference/`，不提交或发布。

## 验收

- 工作区显示当前/保存快照刷新状态、笔记更新时间及“仅保留最新笔记”的 schema 边界。
- 同标的报告按时间显示版本、状态、核心结论、可点击 URL 数和最近两版文本变化。
- 同标的讨论显示已保存总结中的共识/分歧文本，并标记 MODEL_OUTPUT 与主题匹配口径。
- 同标的论文显示状态、漂移核验与来源报告；没有论文时明确为空。
- 聚合接口任一失败不影响核心行情/财务工作区，并显示局部错误。
- 测试、构建和桌面/窄屏浏览器验证通过。

## 回滚方式

移除持续研究组件和三个只读聚合请求；原行情、财务、筹码、笔记保存与各独立页面不受影响。

## 验证结果

- 测试先失败于连续性组件不存在；实施后 ResearchContinuity：1 file / 2 tests passed，覆盖三市场代码匹配、精确观点文本比较、引用计数和跨页链接。
- 前端全量测试：23 files / 54 tests passed；`bun run build` 通过，4,160 个模块完成转换；`git diff --check` 通过。
- 本地数据库只读核对：600519 有 3 个完成报告版本、1 个含“核心共识/主要分歧”的完成讨论、0 个投资论文、0 个该标的保存工作区；页面逐项一致。
- 实时工作区显示报告 3 / 主题匹配讨论 1 / 论文 0 / 笔记未记录；最新两版核心结论文本有变化；三个报告均明确“可点击引用 0”，未补造 URL。
- `查看版本` 直接打开 `/research/reports?symbol=600519&report=6` 并加载版本 #6；`打开讨论` 直接打开 `/discussion?room=1` 并显示已保存总结。
- 当前基本面和筹码上游错误仍单独可见；连续性聚合正常加载，验证局部失败不阻断核心工作区。
- 390×844 下卡片单列堆叠，标题与动作换行，`scrollWidth=375 <= innerWidth=390`。
- 证据：`artifacts/productization/phase2/11-research-continuity-desktop.png`、`12-research-continuity-narrow-390x844.png`。
- GitHub-first 搜索因搜索服务网络错误未完成；实现复用现有 report/discussion/thesis/workspace API，无新依赖或数据库变更。
