# BACKLOG-039 — 导航冗余收口：研究模式入口与研究页合并

> 状态：`[READY]` ｜ 优先级：P2 ｜ 创建：2026-09-07 ｜ 完成：— ｜ 执行：DSH Worker
> 背景：用户实测反馈（`docs/ai/UX_ISSUES_20260907.md` 问题三）：顶栏"研究模式"（快速分析/深度研究/Review/Thesis）与独立"研究/研究工作区"入口职责重叠，用户困惑"为什么两处都提供，多余、体验差"。

## 目标

1. **现状定位**：先核实现有"研究模式"选择器组件（frontend/src 中 ResearchModeSelector 或类似，位于顶栏/页头）与研究工作区（/research 连续工作面，BACKLOG-032 后）的实际关系与重复入口。
2. **收口方案**（择一，以核实现状为准）：
   - 研究模式选择器**移入研究页内部**（进入 /research 后在页内选"快速/深度/Review/Thesis"），顶栏移除独立模式下拉；或
   - 顶栏只保留一个"研究"入口，模式选择收敛为研究页内的下一步动作（呼应 BACKLOG-032 连续工作面：提交→选对象→选深度）。
3. 目标：**任一时刻只有一个主入口 + 明确下一步**；消除顶栏与页内重复。
4. i18n 文案同步（zh/en parity 0）；导航/路由不破坏既有路径（/research、/research/:symbol、mode 参数向后兼容——旧链接仍工作）。

## 允许修改
- `frontend/src/pages/Research.tsx` 或研究工作区相关、模式选择器组件、`App.tsx`（若顶栏入口在此）、`frontend/src/i18n/zh.ts`+`en.ts`
- `frontend/tests/Research*.test.tsx`、模式相关测试（同步）
- 证据文档：`docs/ai/BACKLOG-039.md`、`docs/ai/tasks/BACKLOG-039.md`（新建）、`docs/ai/EXEC_PLAN.md`、`task/CHANGELOG.md`、`HANDOFF.md`

## 禁止修改
- 后端；E2E/playwright config（路由若被 e2e 断言先核，禁止改断言）；依赖/锁文件；`reference/`
- 不删除文件（回收站铁律）；不加依赖；不破坏旧路由/旧参数兼容
- 不改 Discover/LimitPool（038 域）；不实施其他 UX 项

## 完成标准
1. 顶栏与页内研究模式入口收敛为单主入口（实现后人工走查首页/研究页确认无重复）
2. 旧路由/参数（/research、/research/:symbol、mode=fast/deep/review/thesis）仍工作
3. i18n parity 0；build + Vitest 全量 + 4173 50 + 8000 21 全绿；git diff --check；删除 0；不 commit

## 参考
- 用户反馈：`docs/ai/UX_ISSUES_20260907.md` 问题三
- 现状：`frontend/src/pages/Research.tsx`（模式选择器）、`App.tsx`（导航）、`researchContinuity.ts`（mode 参数处理）
- 注意：039 与 038 都改 i18n，**串行执行**（038 先，039 后）

## 完成证据模板
```
- 现状定位（模式选择器组件/入口位置）结论
- 收口 diff（顶栏移除/移入研究页、路由兼容验证）
- 测试同步
- 全量门禁：build、Vitest、4173、8000
- git diff --check、删除 0、未 commit
```
