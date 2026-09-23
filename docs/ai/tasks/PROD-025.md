# PROD-025: 从研究结论创建论文、验证条件和预警

> 状态：`[DONE]`  
> 阶段：Productization Phase 2

## 用户问题

报告、投资论文和预警能力已经存在，但用户需要在多个页面重新定位标的和上下文，难以把一次研究结论变成持续核验流程。

## 目标行为

从已保存报告显式确认创建关联论文，创建后直接打开论文及其自动生成的价格、持仓、基本面和报告验证条件；再从论文预填技术信号预警。所有写操作仍由用户点击确认，且页面明确当前预警表没有论文外键。

## 范围内文件

- `frontend/src/features/researchTracking.ts`
- `frontend/src/components/research/ResearchContinuity.tsx`
- `frontend/src/pages/Research.tsx`
- `frontend/src/pages/Thesis.tsx`
- `frontend/src/pages/Alerts.tsx`
- `frontend/tests/ResearchTracking.test.ts`
- `frontend/tests/Alerts.test.tsx`
- `frontend/tests/ResearchContinuity.test.tsx`
- `frontend/tests/Thesis.test.tsx`
- `docs/ai/EXEC_PLAN.md` 和本任务卡

## 明确非目标

- 不新增或迁移数据库，不伪造论文与预警的持久化关联。
- 不改变报告转论文、漂移核验或技术信号扫描算法。
- 不从模型正文推断新的阈值、价格目标或基本面数值。
- 路由预填不自动创建论文或预警；不修改 `reference/`，不提交或发布。

## 验收

- 已完成报告可进入显式确认的论文创建动作，成功后打开具体论文。
- 论文显示来源报告、验证条件及类型解释，并可预填对应标的的技术预警。
- 预警弹窗显示论文来源上下文和 schema 边界，保存前可编辑且不会自动写入。
- 工作区已有论文可直接查看或设置预警；未转换报告可进入对应版本。
- 测试、构建和桌面/窄屏浏览器验证通过。

## 回滚方式

移除跨页动作、预填参数和说明文案；报告、论文与预警现有 API、表和独立页面均不受影响。

## 验证结果

- 测试先失败于研究跟踪路由模块不存在；实施后相关 4 files / 9 tests passed，覆盖精确报告、论文来源与条件说明、论文到预警预填及无自动写入。
- 前端全量测试：27 files / 61 tests passed；`bun run build` 通过；`git diff --check` 通过。
- 实时 600519 工作区从报告版本 #6 进入精确报告，点击“创建论文与验证条件”只显示明确确认；取消后 `/api/thesis` 仍为 0。
- 论文页测试证明来源报告深链、中文验证条件类型和技术预警入口；自动条件仅复用现有价格、持仓、基本面、报告核验，不新增推断值。
- 技术预警携带论文 #7、600519 和可编辑规则名打开；未点击保存，`/api/alerts/rules` 仍为 0；页面明确当前表不保存论文外键。
- 390×844 下预警弹窗宽 374px，`scrollWidth=390 <= innerWidth=390`，字段和确认动作可见。
- 证据：`artifacts/productization/phase2/15-report-thesis-confirm-desktop.png`、`16-thesis-alert-prefill-desktop.png`、`17-thesis-alert-prefill-narrow-390x844.png`。
- GitHub-first 搜索因搜索服务网络错误未完成；实现复用现有 report/thesis/alert API，无新依赖、迁移或业务算法变更。
