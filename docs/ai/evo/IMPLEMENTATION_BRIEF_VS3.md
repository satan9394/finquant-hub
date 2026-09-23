# IMPLEMENTATION_BRIEF — Vertical Slice 3：前端接入报告质量降级提示（G-03 用户可见闭环）

> Orchestrator 第五阶段产物，2026-09-13。来源：PRODUCT_GAP_MAP G-03 遗留（VS-1 只做了后端标记，前端未消费）。

## 目标
让后端已诚实标记的 `report_data.quality === 'degraded'`（任一分析环节失败）在**用户可见处**生效：屏上报告区明示"生成不完整"，Markdown 导出同样带提示。此前仅 `lead_review_status`（主编失败）在 Markdown 导出有提示，屏上完全没有。

## 用户场景
用户跑了一次研究，某个分析环节因模型故障失败。后端已把报告标为 `quality=degraded` 并照常给出报告。**现状**：屏上报告看起来和正常报告一模一样，用户误以为完整可信。**理想**：报告区顶部出现明确警示"本报告生成不完整：部分分析环节未能完成，内容可能有缺漏，请谨慎参考"。

## 当前问题（代码现实）
- `frontend/src/pages/Research.tsx:67-68`：`degradedPrefix` 只认 `lead_review_status === 'degraded'`，且**只用于 `reportToMarkdown`（导出）**。
- 报告**屏上渲染**（`ResultLayer`/`ResearchArtifact`）无任何质量提示。
- 后端已持久化 `report_data.quality`（VS-1 `909980b`），前端未读取。

## 涉及模块
- `frontend/src/pages/Research.tsx`（导出函数 + state + 屏上 Alert）
- `frontend/src/i18n/{zh,en}.ts`（新 key，parity 0）
- `frontend/tests/ResearchReportToMarkdown.test.tsx`（测试）

## 不能破坏
- 主编降级（`lead_review_status`）的既有文案与行为**零回归**；两者同时降级时优先主编文案（更具体）。
- 正常（audited/无 quality）报告**零变化**、不显示任何 ⚠️。
- 不改后端；不动其它页面/布局；不加依赖。

## 验收标准
1. `reportToMarkdown`：`quality==='degraded'` 且主编非降级 → 加通用"生成不完整"前缀；主编降级 → 仍用原文案（优先级正确）。
2. 屏上：`done && reportQuality==='degraded'` → 报告区顶部 warning Alert（`role="status"`）。
3. `quality` 在 done 事件与历史报告加载两条路径都被读取；新一轮运行重置。
4. i18n zh/en 新增 key 且 parity 0。
5. 测试覆盖：quality 降级前缀（chapters/legacy 两形态）、audited/缺省无提示、双降级优先级。
6. 门禁：聚焦 vitest + build + i18n parity。

## 错误场景
- 报告无 `quality` 字段（旧数据）→ 视为正常，不提示（向后兼容）。
- 流式中（未 done）→ 不提示（避免误报）。
