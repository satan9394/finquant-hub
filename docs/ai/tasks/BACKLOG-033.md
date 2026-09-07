# BACKLOG-033 证据 — A6 主编降级诚实展示 + B8 文案术语收敛

> 完成：2026-09-06 ｜ 执行：DSH Worker（BACKLOG-033，A6-1 后端 → A6-2 前端 → B8 前端，未 commit 待维护者复核合入）
> 对应卡：`docs/ai/BACKLOG-033.md` ｜ 背景核验：`docs/ai/astra-review/verification-2026-09-04.md` A6/B8 段（均已证实）

## 改动清单

### A6-1 报告结构小改（backend）— `lead_review_status` 顶层冗余 + 落库确认

- `backend/app/services/report_builder.py` `build_unified_report`：
  - 返回值顶层新增 `"lead_review_status": "audited" if lead else "degraded"`——与内部 `team_lead_review.model_output_status`（`"parsed" if lead else "unknown"`，同源同一 `lead = parse_lead_review(lead_content)` 真值）映射，前端不必深挖 team_lead_review。
  - 位置：report dict 内 `timestamp`/`status` 之后、`chapters` 之前，带注释说明 A6 用途与"不改 completed/failed 状态机语义"约束。仅加字段，其余零改动。
- **落库路径确认（report_data 即 build_unified_report 返回）**：
  1. 交互研究：`research_orch.py` L304/L313-315 `report_data = _build_report(...)` → `_build_report` = `build_unified_report(...)`（L327-330）→ `done_payload["report"] = report_data` → router `research.py` L275 `_complete_report(report_id, data.get("report", {}), ...)` → L391-394 `UPDATE research_reports SET report_data=?`（json.dumps 全量持久化）→ L283 `publish_research_status(completed)`。
  2. 计划任务：`scheduler.py` L128-133 收到 run 产生的 done payload，`report_data = payload.get("report", {})` → `UPDATE research_reports SET report_data=?` 落库。
  3. 读取侧：`research.py` GET `/research/{id}` `_load_report`（L493-501）解析 `report_data` JSON 整体返回 → 前端拿到含顶层 `lead_review_status` 的 report_data。
  - 结论：**顶层 `lead_review_status` 随报告持久化并随 GET 返回**，前端历史报告/实时报告都能读取。research_orch/scheduler/research router 编排零改动。
  - 附带说明：Swarm 路径 `swarm_orch.py` 两个 builder 也走 `build_unified_report`（report_type four_masters/earnings_review），同样获得该字段——其 lead_content 取自 report_lead/earnings_editor 内容，语义一致。
- 后端测试 `backend/tests/test_report_builder.py`：
  - `test_unified_report_has_13_chapters...` 增 `assert report["lead_review_status"] == "audited"` + `model_output_status == "parsed"`（合法 lead 映射）；
  - `test_invalid_lead_output_preserves_unknown...` 增 `assert report["lead_review_status"] == "degraded"` + `model_output_status == "unknown"`（invalid/空 lead 映射）。

### A6-2 前端降级提示（frontend）— reportToMarkdown 顶部诚实提示（两形态）

- `frontend/src/pages/Research.tsx` `reportToMarkdown`（L66-86 区域，改后保持导出）：
  - 函数改具名 `export function reportToMarkdown(...)`（供纯函数单测 import；模块内 3 处既有调用 `reportToMarkdown(report.report_data, t)` / `reportToMarkdown(report, t)` 不变，无命名冲突——同文件无其它同名导出）。
  - 顶部逻辑：`report.lead_review_status === 'degraded'` 时前缀 `**{t('deep.report.degradedNotice')}**\n\n---\n\n`；**chapters 形态与 legacy 形态都处理**（degradedPrefix 在 return 前统一拼接，两分支都走 prefix+body）。audited/缺省（undefined/其它值）→ 空前缀，不回归。
  - 渲染：降级提示以加粗行进入 markdown 顶部 → ResearchArtifact summary 层第一块、MarkdownContent 渲染为醒目 strong 段（复用既有 prose 样式，无新组件/新依赖）。
  - 空正文边缘：degraded 且 chapters 为空/legacy 无正文时前缀仍保留（诚实信号不因正文缺失而丢失）。
  - splitReportLayers：降级提示不含 `##`，并入首个 summary 块顶部 → 显示在摘要层开头（报告查看处顶部）；evidence 层不含提示（提示属摘要层一次性告知）。
- i18n 新 key：`deep.report.degradedNotice`（zh：`⚠️ 主编审计未完成：本报告的团队评审章节由模型自动生成，未经主编复核。`；en 对应英文），与 B8 的 6 个指标 label key 合计新增 7 key（zh/en 各 2285 keys，基线 2278），parity 0。
- 新增测试 `frontend/tests/ResearchReportToMarkdown.test.tsx`（jsdom，纯函数断言，真实 zh 文案）：
  1. chapters 形态 + degraded → markdown 以提示前缀开头且含 `⚠️ 主编审计未完成`/`未经主编复核`，正文章节完整保留；
  2. legacy 形态 + degraded → 同样前缀 + 执行摘要/综合结论正文保留；
  3. audited / 缺省 → 两形态均无 `⚠️`，正文正常；
  4. degraded + 空 chapters → 提示仍保留。
- 状态机语义未动：completed/failed 判定、通知、research_orch 编排、scheduler 恢复逻辑均零改动（A6 最小方案=报告查看处提示，列表/通知不改——卡 §目标 A6-2 已明确）。

### B8 专业指标中文 label（frontend）— Professional 折叠区英文换 i18n key

- `frontend/src/components/strategy/BacktestSummary.tsx`：
  - `professional` 数组：`'Sharpe'`→`t('strategy.metric.sharpe')`、`'Sortino'`→`t('strategy.metric.sortino')`、`'Calmar'`→`t('strategy.metric.calmar')`；
  - `p1Diagnostics` 数组：`'Beta'`→`t('strategy.metric.beta')`、`'R²'`→`t('strategy.metric.rSquared')`、`'Tracking Error'`→`t('strategy.metric.trackingError')`。
  - **只换 label 文本**：`metric-*` data-testid、折叠区结构（Collapse items/Row/Col/Statistic）、Help 说明、`回测结论摘要` 等 E2E 依赖文案零改动。
- i18n 新 key（zh/en 同步、parity 0）：
  - `strategy.metric.sharpe`：zh `夏普比率` / en `Sharpe ratio`
  - `strategy.metric.sortino`：zh `索提诺比率` / en `Sortino ratio`
  - `strategy.metric.calmar`：zh `Calmar 比率` / en `Calmar ratio`
  - `strategy.metric.beta`：zh `Beta` / en `Beta`（中文投资语境惯例保留 Beta 原词）
  - `strategy.metric.rSquared`：zh `R²` / en `R²`（惯例保留）
  - `strategy.metric.trackingError`：zh `跟踪误差` / en `Tracking error`
  - 说明：卡 §参考"查是否有对应 key"——`strategy.metric.sharpeHelp` 等 Help 存在但 label key 无；`backtestCard.metric.sharpe`（zh 已有 `夏普比率`）存在但 src 内零消费者（旧 MetricStrip 遗留孤立 key，禁改/删），故新增 `strategy.metric.*` label 族与同区 Help 对齐命名。zh 用卡指定的中文惯例文案。
- 测试同步：`frontend/tests/BacktestSummary.test.tsx` 断言均为 `data-testid` 值 + 数值 + Help 文案（`无风险收益按 0` 等），不依赖英文 label 文本 → **零改动**（复跑 3/3 绿，语义未放松）。
- E2E/测试引用预核：grep `metric-sharpe|metric-beta|metric-r-squared|metric-tracking-error|metric-sortino|metric-calmar|'Sharpe'|Sortino|Calmar|Tracking Error` 于 frontend/e2e + e2e-8000 → **0 匹配**（无 E2E 断言依赖英文 label）；`core-paths.spec.ts` 只断 `metric-total-return`（未动）。

### 附带：基线 ruff W292 修复（测试卫生，1 字符）

- `backend/tests/test_research_sse_disconnect_backlog029.py`（BACKLOG-029 A3 遗留测试文件，HEAD 基线即缺文件尾换行 → 全量 ruff `W292 no newline at end of file` 红，git blob 实证 68ddd0c/HEAD 相同末尾 `_id]` 无 LF，非本卡/034 引入）→ 追加单个 LF 修复，逻辑零改动。如实声明：该文件不在卡允许清单，属 ruff 全量门禁（完成标准 4）所需的最小测试卫生修复，已在回传声明。

## lead_review_status 落库路径确认（证据链）

```
build_unified_report (report_builder.py)
  └─ 顶层新增 lead_review_status: audited|degraded（与 team_lead_review.model_output_status 同源）
  ├─ research_orch._build_report (L327-330) → done_payload["report"] (L313-315)
  │    └─ research.py _complete_report (L275) → UPDATE research_reports SET report_data=? (L391-394, json.dumps)  [交互研究落库]
  ├─ scheduler.py L128-133 payload["report"] → UPDATE research_reports SET report_data=?                  [计划任务落库]
  └─ research.py _load_report (L493-501) GET 时 json.loads(report_data) 整体返回 → 前端 report_data 含顶层字段
```

## 验证（门禁结果）

- backend pytest：853/853 passed（851 基线 + report_builder 断言强化 + 并行 034 Worker 2 新测试），cov 92.53%（基线 92.52%，不降），`--no-cov` 聚焦 test_report_builder 4/4
- ruff：本卡文件全过（report_builder.py + test_report_builder.py）；全量 ruff 需 034 Worker 收尾其 `_probe_*a7` 探针后归零（034 in-flight，另见诚实声明）
- frontend build：✓（tsc + vite build 通过，chunk 与基线一致）
- 聚焦 Vitest：ResearchReportToMarkdown 4/4 + BacktestSummary 3/3 + ResearchDeepPlan 1/1 = 8/8
- 全量 Vitest：见回传最终值
- i18n parity：zh/en 各 2285 keys（基线 2278 + degradedNotice 1 + B8 指标 label 6），重复 0、双向差集 0（脚本核对）
- 4173/8000 E2E：见回传最终值（本卡改 label 后 e2e 无英文 label 断言，预期零改动）
- git diff --check、删除 0、工作树仅本卡 + 并行 034 文件（未 commit）

## 诚实声明

- 全量 ruff 在并行 Worker（BACKLOG-034）收尾前不归零：`tests/_probe_trace_a7.py` F841 属 034 in-flight 探针（untracked，非本卡、非我改动）；此外基线遗留 W292（见上）已修复。034 完成后全量 ruff 应绿。
- `test_research_sse_disconnect_backlog029.py` 尾换行修复越出卡允许清单（仅追加 1 个 LF、零逻辑），理由与影响见上。
- A6 只做展示诚实：状态机/通知/编排语义零改动；lead_review_status 仅为展示字段，不含任何 completed 判定逻辑。
- 未 commit / 未 push（任务指示）。
