# AIOS-013 - 统一 Citation UI 与来源/计算方法

## 状态

`[DONE]`

## 优先级

P0

## 用户结果

在现有“方法与来源”层内提供统一、可展开的 Citation UI，让用户看到来源、截止时间、质量状态，以及存在时的公式、方法版本和输入 evidence IDs。

## 允许修改

- `frontend/src/components/CitationDetails.tsx`（新建）
- `frontend/src/components/research/FundamentalMetricsPanel.tsx`
- `frontend/src/pages/StrategyLab.tsx`
- `frontend/tests/CitationDetails.test.tsx`（新建）
- `frontend/tests/FundamentalMetricsPanel.test.tsx`
- AIOS 长期计划、EXEC_PLAN 与本任务卡

## 禁止修改

- 后端/API/schema、其他页面、依赖与锁文件、`reference/`
- 用界面推断缺失来源、公式、输入引用或上游状态

## 完成标准

- 共享组件明确区分 OK、PARTIAL、UNKNOWN、UPSTREAM_ERROR。
- “查看来源/计算方法”可键盘展开，来源、时间、期间、币种、复权、频率、质量、公式、方法版本和输入引用缺失时显示 UNKNOWN。
- 基本面和策略结果复用同一组件；旧合同缺口不补造。
- component tests、完整前端 tests、TypeScript/build 和浏览器桌面/390px 证据通过。

## 验证

```powershell
cd frontend
bun run test -- CitationDetails.test.tsx FundamentalMetricsPanel.test.tsx
bun run test
bunx tsc -b --pretty false
bun run build
cd ..
git diff --check
```

## 回退

删除共享组件/测试，恢复两个消费点和计划 Markdown；无数据迁移或后端回退。

## 完成证据

- 共享 `CitationDetails` 明确显示 OK/PARTIAL/UNKNOWN/UPSTREAM_ERROR，并由基本面和策略页复用。
- 原生 `<details>/<summary>` 可展开；所有缺失来源/方法/输入引用保持 UNKNOWN。
- focused 8 tests；完整 48 files / 127 tests（Windows 线程池，15 秒 test timeout）；TypeScript 与生产 build 通过。
- 实际已保存 AAPL 回测浏览器显示 yahoo / 2026-07-27 / USD / none / 1d；旧 lineage 字段保持 UNKNOWN。
- 桌面 1280px 和 390px 均无文档横向溢出；未运行或保存回测，未触发外部写操作。
- React best-practices 检查无新增 waterfall、state/effect 或重型依赖问题。
