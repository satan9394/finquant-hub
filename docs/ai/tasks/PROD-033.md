# PROD-033: Alpha 类别、模板和通俗说明

> 状态：`[DONE]`  
> 阶段：Productization Phase 3

## 用户问题

Alpha 页面目前只有关键词搜索，用户必须先知道字段 ID 或 Alpha 编号；后端已有 7 类真实字段目录和 5 个只由已打包字段生成的模板，但前端没有入口、用途解释或字段覆盖信息。

## 目标行为

接入 `/api/wq/categories` 和 `/api/wq/templates`，先展示真实类别规模，再提供 5 个可选择模板。每个模板显示通俗假设、主要局限、真实字段 ID/描述/coverage 和关键设置；表达式渐进披露。类别或模板接口失败时明确不可用，不用静态数量或虚构模板替代。保留字段搜索作为专业入口。

## 范围内文件

- `frontend/src/services/alphaApi.ts`
- `frontend/src/features/alpha/catalog.ts`
- `frontend/src/components/alpha/AlphaTemplateCatalog.tsx`
- `frontend/src/pages/AlphaResearch.tsx`
- `frontend/tests/AlphaCatalog.test.ts`
- `frontend/tests/AlphaTemplateCatalog.test.tsx`
- `frontend/tests/AlphaResearch.test.tsx`
- `docs/ai/EXEC_PLAN.md` 和本任务卡

## 明确非目标

- 不运行本地模拟、相关性、IC、分位、衰减或外部 BRAIN 操作；这些由后续任务处理。
- 不修改模板表达式、字段目录、coverage、设置或后端接口。
- 不把 coverage 当成当前用户标的覆盖率，不编造区域、收益或质量分数。
- 不新增依赖，不修改 `reference/`，不提交或发布。

## 验收

- 页面加载并显示接口返回的类别名称、数量和示例字段。
- 5 个真实模板显示用途、局限、表达式、设置以及字段 ID/描述/coverage。
- 模板选择只更新本地研究上下文，不自动模拟或提交。
- 字段搜索继续可用；接口失败有明确错误和可重试入口。
- 测试、构建和桌面/窄屏浏览器验证通过。

## 回滚方式

移除 Alpha catalog 服务、说明和组件，恢复 AlphaResearch 的单一 `/wq/search` 页面；后端和任何研究数据不受影响。

## 完成记录

- 接入真实 `/wq/categories` 与 `/wq/templates`：页面显示 7 类字段目录和 5 个仅由已打包字段生成的模板；搜索继续复用 `/wq/search`。
- 每个模板显示本地通俗假设/局限、接口字段 ID/描述/coverage、明确缺失的区域信息和折叠表达式/设置；选择只更新本地页面状态。
- 接口失败或空结果不使用静态数量、模板或覆盖率替代；coverage 缺失统一显示 `UNKNOWN`。
- 验证：聚焦 3 files / 4 tests；全量前端 36 files / 81 tests；TypeScript、生产构建和 diff check 通过；live API 桌面与 390×844 浏览器检查通过，修复长字段 ID 后窄屏 `scrollWidth=375`。
- 证据：`artifacts/productization/phase3/07-alpha-templates-desktop.jpg`、`08-alpha-templates-narrow-390x844.jpg`。未调用本地模拟、相关性或 BRAIN 接口。
