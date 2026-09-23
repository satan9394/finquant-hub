# IMPLEMENT_RESULT — VS-3：前端接入报告质量降级提示

> Implementer（Orchestrator 接管）｜ 2026-09-13 ｜ **经独立 Evaluator REJECT → 已修复**（见下）

## 独立 Evaluator 质疑 → 修复记录（关键，第三次验证独立评估价值）
Evaluator 判定 **REJECT**，根因定位准确：后端 `research_orch.py` 的 `done_payload` 把 `quality` 放在**顶层**（与 `report` 平级），`routers/research.py` 只把 quality 合并进**落库副本**，而向 SSE 前端 `yield` 的仍是原始 `data`；前端读的是 `data.report.quality`（恒 undefined）→ **实时路径警示永不出现、当次导出也缺前缀**，只有历史重开才有。这正是 VS-3 要解决的痛点，且我的测试只覆盖纯函数、未覆盖 done→state 映射，缺陷本该逃逸。

修复（3 处，前端 only）：
1. done 分支改为读**顶层** `data.quality`（兼容 `report.quality` 回退）；
2. 把映射提为**可导出纯函数 `resolveReportQuality`**，供直接单测（补测试盲区）；
3. 消除 Alert 双图标（`showIcon` + 文案自带 ⚠️）。
新增 4 例映射测试（顶层/回退/优先级/缺省不误报）。

## 结论（修复后）
让 VS-1 的后端诚实标记真正触达用户：屏上报告区 + Markdown 导出双侧提示，实时路径与历史路径一致。

## 改动（4 文件）
1. **frontend/src/pages/Research.tsx**
   - 新增导出纯函数 `resolveReportQuality(data)`：顶层 quality 优先、回退 `report.quality`、缺省 unknown → 'audited'（不误报）。
   - `reportToMarkdown`：主编降级 → 原 `degradedNotice`（零回归）；否则 `quality==='degraded'` → 新 `qualityDegraded`（不误述为主编问题）。
   - done 分支：用 `resolveReportQuality(data)` 判定，并把 quality 并入传给 `reportToMarkdown` 的报告对象（当次导出也有前缀）。
   - 新增 state `reportQuality`；三处维护（done / 历史加载 / 新运行重置）。
   - 报告输出区条件 Alert（`done && degraded`，`role="status"`，无 showIcon 避免双图标）。
2. **frontend/src/i18n/zh.ts + en.ts**：新增 `deep.report.qualityDegraded`。parity 2454/2454。
3. **frontend/tests/ResearchReportToMarkdown.test.tsx**：+8 例（quality 前缀两形态、audited/缺省无提示、双降级优先主编 + 4 例映射）。

## 门禁实测
- 聚焦 vitest：**12/12 passed**（修复前 8，新增 4 映射）
- 研究页回归（5 文件）：**34/34 passed**
- i18n parity：**2454/2454 OK**
- build：见提交前实测

## 未解决问题 / 风险
1. 屏上 Alert 仅在 `done` 后显示（流式中不提示，设计如此避免误报）。
2. 报告列表页未加质量徽章（超出本 slice 范围）。
3. 后端 `research.py` 向 SSE yield 的 `data` 仍是原始顶层形态——前端已按顶层读取适配；若将来要统一为 `report.quality`，需前后端同步改（已记录）。
