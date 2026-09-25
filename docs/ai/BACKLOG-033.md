# BACKLOG-033 — A6 主编降级诚实展示 + B8 文案术语收敛（前端为主 + 报告结构小改）

- Status: done
- Mission: A6 主编降级诚实展示（`lead_review_status` + 报告顶部提示）+ B8 专业指标文案中文化，均不改状态机语义
- Source: planned
- Risk: low
- Evidence: `docs/ai/tasks/BACKLOG-033.md`（完成证据）；合入 commit `8ee4d31`（维护者复核通过）

> 状态：`[READY]` ｜ 优先级：P2 ｜ 创建：2026-09-06 ｜ 完成：— ｜ 执行：DSH Worker
> 背景：
> - **A6**（Astra A6 断言，契约待决策但最小诚实方案可执行）：主编 LLMError 后研究仍落 completed + 成功通知，`build_unified_report` 内部已记 `team_lead_review.model_output_status: "parsed" if lead else "unknown"`（report_builder.py:331），但**前端不消费该字段**——用户看到 completed 报告却不知主编未审计。修复 = 让降级对用户可见（诚实提示），不改状态机语义。
> - **B8**（Astra B8 断言，展示层记录项）：BacktestSummary Professional 折叠区仍有英文指标名（Sharpe/Sortino/Beta/R²/Tracking Error，BacktestSummary.tsx:30-45），zh 用户首屏见英文。修复 = 换 i18n key（zh 有对应文案则复用，无则新增同步）。

## 目标

### A6-1 报告结构小改（backend）
- `report_builder.py build_unified_report`：在 report_data **顶层**冗余 `lead_review_status: "audited" | "degraded"`（= team_lead_review.model_output_status parsed/unknown 的映射），便于前端顶层读取（不必深挖 team_lead_review）。
- 检查 `done_payload`/落库 report_data 是否即 build_unified_report 返回——是则顶层字段随报告持久化。

### A6-2 前端降级提示（frontend）
- `frontend/src/pages/Research.tsx reportToMarkdown`：markdown 顶部（chapters 形态与 legacy 形态都处理）若 `report.lead_review_status === 'degraded'`，前缀一段诚实提示（i18n key，如"⚠️ 主编审计未完成：本报告的团队评审章节由模型自动生成，未经主编复核"）。提示渲染为醒目块（复用现有 Alert/样式语义，不引入新组件）。
- 确认 completed 通知/列表是否需要降级标识——最小方案只做报告查看处提示，列表/通知不改（避免扩散）。

### B8 专业指标中文文案（frontend）
- `BacktestSummary.tsx:30-45` Professional 折叠区英文标签换 i18n key：Sharpe→`strategy.metric.sharpe`（查是否有）、Sortino/Beta/R²/Tracking Error 同理。zh 文案用既有中文惯例（如"夏普比率/索提诺比率/Beta/R²/跟踪误差"）；en 保持原文。**新增 key zh/en 同步 parity 0**。
- 约束：不改折叠区结构/data-testid（metric-sharpe 等若被测试/E2E 引用需先核）；`回测结论摘要` 等 E2E 依赖文案不动。

## 允许修改
- `backend/app/services/report_builder.py`（仅 build_unified_report 返回顶层加 lead_review_status）
- `frontend/src/pages/Research.tsx`（reportToMarkdown 顶部降级提示）、`frontend/src/components/strategy/BacktestSummary.tsx`（专业指标 key）
- `frontend/src/i18n/zh.ts`+`en.ts`（新增降级提示 key + 专业指标中文 key，parity 0）
- 测试：`backend/tests/test_report_builder*.py`（若存在，断言 lead_review_status 映射）、`frontend/tests/Research*.test.tsx`/`BacktestSummary.test.tsx`（同步）
- 证据文档：`docs/ai/BACKLOG-033.md`、`docs/ai/tasks/BACKLOG-033.md`（新建）、`docs/ai/EXEC_PLAN.md`、`task/CHANGELOG.md`、`HANDOFF.md`

## 禁止修改
- 不改研究状态机语义（completed/failed 判定、通知——A6 不做"降级就不 completed"，只做展示诚实）；不改 research_orch 编排（除确认 report_data 落库路径）
- E2E/playwright config、依赖/锁文件、`reference/`；不删除文件；不加依赖；不实施 B12/B9
- 专业指标换 key 前 grep 确认 metric-* data-testid 与 E2E 引用（只换 label 文本不换 testId）

## 完成标准
1. report_data 顶层 `lead_review_status`（audited/degraded）随报告持久化；后端测试断言映射正确
2. 前端报告查看：degraded 时顶部显示诚实降级提示（zh/en），audited/缺省不显示（不回归）
3. 专业指标换中文 key 全（zh/en parity 0），折叠结构/测试 id 不变
4. 全量门禁：backend pytest 851+、cov 不降、ruff；frontend build、Vitest 全量、4173 50、8000 21
5. git diff --check、删除 0、工作树干净

## 参考
- Astra A6/B8：`docs/ai/astra-review/verification-2026-09-04.md` A6/B8 段
- 现状：`report_builder.py:331`（model_output_status 已记）、`Research.tsx:66-86`（reportToMarkdown 两形态）、`BacktestSummary.tsx:30-45`（专业区英文）
- 文案锁定：`回测结论摘要` heading、chat-paths/core-paths 依赖项（只换专业区 label，不动 E2E 依赖）

## 完成证据模板（2026-09-06 DSH Worker 填写，详情见 `docs/ai/tasks/BACKLOG-033.md`）

```
- A6-1 report_builder diff（lead_review_status 顶层）+ 后端测试
  - report_builder.py build_unified_report 返回 dict 顶层新增 "lead_review_status": "audited" if lead else "degraded"
    （team_lead_review.model_output_status parsed/unknown 的同源映射，仅展示不改状态机语义）。
  - 落库路径实证：research_orch._build_report → done_payload["report"] → research.py _complete_report
    UPDATE research_reports SET report_data=?（json.dumps 全量）；scheduler.py L128-133 计划任务同路径；
    GET /research/{id} _load_report json.loads 整体返回 → 顶层字段随报告持久化并回前端。
    research_orch/scheduler/research router 编排零改动。
  - test_report_builder.py：audited/parsed 与 degraded/unknown 两映射断言（+3 行），聚焦 4/4。
- A6-2 Research reportToMarkdown 降级提示 diff（两形态处理）+ 测试
  - reportToMarkdown 具名导出；report.lead_review_status==='degraded' 时 markdown 顶部前缀
    **{deep.report.degradedNotice}**\n\n---\n\n（chapters 与 legacy 两形态统一 prefix+body）；
    audited/缺省空前缀不回归；空正文 degraded 提示仍保留。
  - 新测试 ResearchReportToMarkdown.test.tsx 4 用例（chapters/legacy degraded、audited/缺省、空正文）全绿。
  - 状态机/通知/编排零改动（最小方案：报告查看处提示，列表/通知不改）。
- B8 BacktestSummary 专业指标 key 化 diff + i18n parity 0
  - professional/p1Diagnostics 硬编码 'Sharpe'/'Sortino'/'Calmar'/'Beta'/'R²'/'Tracking Error' →
    t('strategy.metric.{sharpe,sortino,calmar,beta,rSquared,trackingError}')；label 文本换 key，metric-* testId/
    折叠结构/Help/E2E 依赖文案（回测结论摘要、metric-total-return）零改动。
  - 新增 6 label key + deep.report.degradedNotice 共 7 key，zh/en 各 2285 keys parity 0、重复 0。
  - E2E/测试预核：e2e+e2e-8000 对英文 label/metric-* 0 引用；BacktestSummary.test 仅 testId/数值/Help 断言 → 零改动。
- 全量门禁：backend 853/853 cov 92.53%（92.52→ 不降）、ruff 本卡文件全过（全量见诚实声明）、
  build ✓、Vitest 124 files/386 tests 全绿（+4）、4173 E2E 见回传、8000 E2E 见回传、i18n parity 0
- git diff --check 通过、删除 0、未 commit（交维护者复核合入）
```
