# PROD-037: 本地 Alpha 研究保存与恢复

> 状态：`[DONE]`  
> 阶段：Productization Phase 3

## 用户问题

Alpha 模板、模拟、解释和内存相关性已经可用，但刷新会丢失研究结果，无法达到 Phase 3 的“保存”退出门槛。观察输入可能包含用户私有横截面数据，不能在未说明的情况下自动持久化。

## 目标行为

模拟成功后，用户显式输入研究名称并保存派生结果快照；快照包含模板、参数、指标、期收益和权益曲线，不包含原始观察行。刷新后自动选择最近保存快照的真实模板，用户可以恢复或删除本地快照。

## 范围内文件

- `frontend/src/features/alpha/studies.ts`
- `frontend/src/components/alpha/AlphaSimulationWorkbench.tsx`
- `frontend/src/pages/AlphaResearch.tsx`
- `frontend/tests/AlphaStudies.test.ts`
- `frontend/tests/AlphaSimulationWorkbench.test.tsx`
- `frontend/tests/AlphaResearch.test.tsx`
- `docs/ai/PRODUCT_CAPABILITY_MATRIX.md`
- `docs/ai/EXEC_PLAN.md` 和本任务卡

## 明确非目标

- 不自动保存，不持久化 CSV/JSON 原始观察输入、factor 横截面或 symbol 行。
- 不新增后端表、同步、分享、云端存储或 BRAIN 提交。
- 不保存未命名、失败或尚未完成的模拟。
- 不修改架构或 `reference/`，不新增依赖，不提交或发布。

## 验收

- 只有用户显式命名并点击保存后写入本地存储。
- 存储内容不含 `observations` 或原始 symbol/factor 行，只含可核对的派生快照。
- 刷新后可恢复最近保存研究的模板、参数和结果；删除是显式动作。
- 损坏或旧版本存储安全降级为空，不影响 Alpha 基础流程。
- 前端完整测试、构建和桌面/窄屏浏览器持久化验证通过。

## 回滚方式

移除本地研究存储 helper、保存/恢复 UI 和最近模板恢复；Alpha 模拟、相关性与 P2 评估保持不变。

## 完成记录

- 新增版本化本地研究存储，最多保留 20 个显式命名快照；内容仅含模板、分位、年化期数、指标、期收益和权益曲线，没有 `observations`、symbol/factor 行或原始文本。
- 刷新后只在保存快照引用的模板仍存在于真实 `/wq/templates` 目录时自动选择并恢复；观察输入始终清空，损坏存储降级为空。
- 保存按钮只在模拟成功后出现且名称非空才可用；研究可手动恢复。移除进入独立本地回收站并支持撤销，不永久删除唯一副本。
- GitHub 开源模式检索因当前网络错误未取得结果；实现复用项目现有 localStorage 防御模式，无新增依赖或后端表。
- 验证：聚焦 AlphaStudies/Workbench/Research 3 files / 6 tests；完整前端 39 files / 90 tests，TypeScript 与生产构建通过；Ruff 和 diff check 通过。
- 浏览器证据：`artifacts/productization/phase3/15-alpha-save-boundary-desktop.jpg`、`16-alpha-save-boundary-narrow-390x844.jpg`。因没有真实观察输入，浏览器验证选择模板后 `saveButtons=0`、存储键为空且未模拟/保存；精确保存和刷新恢复由 jsdom 合同测试验证，窄屏 `scrollWidth=375`。
