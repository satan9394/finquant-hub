# Execution Plan — FinQuant Hub

优先级规则：P0 > P1 > P2。全部完成后移除。

---

## [READY] BACKLOG-009: 历史讨论观点显示修复 + 剩余组件测试清零（综合）

**优先级**: P1
**任务卡**: `docs/ai/tasks/BACKLOG-009.md`
**范围**: ①业务修复（BACKLOG-008 记录缺陷）：InvestmentCommittee 的 `completed` 过滤把 `position` 当硬条件，历史 Discussion 消息无 position → 观点（summary）不可见。修复：completed 只按 status 过滤、position 全程可选（positionCounts/leadingPosition/hasConflict 只统计有 position 成员、disagreement 区无 position 成员显示 summary+UNKNOWN）、不得用非空断言 `!`；增强 InvestmentCommittee.test.tsx ≥2 用例；②组件测试清零：20 个无直接测试组件（AlphaResearchPanel/BacktestCharts/CommandBar/EvidenceDrawer/LazyEChart/ModelSelector/StockChart/TimeseriesChart/SystemSettingsPanel 等）全部补齐每组件 ≥2 用例（≥40 用例）；③保持 i18n parity、E2E 36 基线（DOM 变化可更新断言不得放宽语义）。
**证据**: （执行后填写——修复设计 + 组件清零结果 + build/test/e2e + i18n parity）

---

## [DONE] BACKLOG-008: Discussion 流式时间线 E2E + 剩余组件测试转正 + E2E 并行稳定性（综合）

**优先级**: P1
**任务卡**: `docs/ai/tasks/BACKLOG-008.md`
**范围**: ①核心：Discussion 流式时间线（BACKLOG-006 新功能）浏览器级 E2E——新增/增强 ≥3 用例断言流式区实时文本/轮次标签/状态 Tag/completed/failed 收束（断言 `.investment-committee__stream`，非只最终 summary），且无 streaming 数据的历史房间向后兼容；②剩余组件测试转正：AgentModeSelector/AlphaResearchPanel/BacktestCharts/CommandBar/CompareGrid/DecisionCard/DiscoverResults/LangSwitcher/MetricStrip/ModelSelector/MonitorCard/StreamingText/ThesisBlock/LazyEChart 等 ≥10 组件每组件 ≥2 用例；③E2E 并行稳定性修复（维护者实测：35 用例全并行偶发 1-2 个不同用例失败、单独重跑通过）：限 workers / 本机 retries:1 / 慢断言加显式 timeout，修复后完整 E2E 连跑 3 次全绿，不得放宽断言语义；④纯测试 + 仅允许改 playwright.config.ts，不改业务代码（发现 bug 只记录）。
**证据**: Discussion 3 个目标 E2E 均限定断言 `.investment-committee__stream`：完成态验证两帧 token 合并文本/第 1 轮/已完成，失败态验证部分文本/第 2 轮/失败及页面错误，历史态验证房间/成员/完成态且无流式区；focused 6/6。新增 10 个独立组件测试文件 / 20 用例，每组件 2 用例；全量 Vitest 86→96 files、252→272 tests，96/96 与 272/272 全绿。修改前原始 4 workers/0 retries 连跑 3 次均 35/35（本机未复现既有随机失败）；按维护者既有资源竞争证据将本机最小限制为 2 workers/retries 1，并给新增慢断言 10s 显式 timeout，未放宽语义。修复后完整 E2E 36/36 连跑 3 次全绿且无 retry 记录。OpenAPI 59 schemas freshness、TypeScript、Vite build 4,238 modules、`git diff --check` 与范围审计通过；记录历史消息受缺失 `position` 门控而不显示的业务缺陷，未越界修复。无 `frontend/src`/后端/schema/auth/依赖/锁文件/`reference/` 改动，未 commit/push/publish/deploy。

---

## [DONE] BACKLOG-007: 前端组件测试续扩 + 后端覆盖率攻坚 86.8%→90%（综合）

**优先级**: P1
**任务卡**: `docs/ai/tasks/BACKLOG-007.md`
**范围**: ①前端组件测试续扩：42 个无直接测试组件中补 ≥12 个（优先 20 个完全裸奔的：ActionBar/CommandBar/EventTimeline/EvidenceDrawer/EvidenceRail/FinancialTable/FundamentalsSourcePanel/MCPServerSettingsPanel/ModelSelector/SourceChip/StatusChip/StockChart/TimeseriesChart/LazyEChart/SystemSettingsPanel/Today 系列等，每组件 ≥2 用例 ≥25 用例）；②后端覆盖率 86.83%→≥90%：优先 backtests 74.9% / market_review 80% / news_search 82.7% / market_overview 84% / settings 80% / discussion_orch / swarm_orch / mcp_bridge；③纯补测试，不改业务代码（发现 bug 只记录）。
**证据**: 前端新增 12 个独立组件测试文件 / 25 用例，每组件 ≥2；全量 Vitest 74→86 files、227→252 tests，86/86 与 252/252 全绿。OpenAPI 59 schemas freshness、TypeScript、Vite production build 4,238 modules 通过；当前 shell 无 Bun，按 package scripts 拆分执行同一锁定工具。后端新增 5 files / 97 tests，全量 710/710；TOTAL 86.83%→90.59%。八靶点依次为 backtests 95.4%、market_review 97.4%、news_search 89.8%、market_overview 89.7%、settings 96.5%、discussion_orch 96.2%、swarm_orch 97.4%、mcp_bridge 92.6%；均 +5pp 或 ≥88%。新增后端测试代理关闭 97/97、7897 代理开启 97/97，Ruff 通过；仅测试和证据文档，无业务代码/schema/auth/dependency/lock/reference 改动，未 commit。记录 `PortfolioWhy` 负数货币显示为 `¥-10.00`，未越界修复。

---

## [DONE] BACKLOG-006: Discussion 流式时间线修复 + 前端组件测试扩面（综合）

**优先级**: P1
**任务卡**: `docs/ai/tasks/BACKLOG-006.md`
**范围**: ①业务改动（BACKLOG-005 暴露缺口）：Discussion 页 SSE 消费侧收集流式状态（agent_start/token/agent_end/error→streamingByAgent），InvestmentCommittee 新增流式时间线展示区（实时文本/轮次标签/失败态，向后兼容），i18n 双语；②测试闭环：InvestmentCommittee.test.tsx（≥5）+ DiscussionStreaming.test.tsx（≥4，推荐提取纯函数 reduceDiscussionStream）+ 核心组件测试扩面（≥10 组件每组件 ≥2 用例）；③后端/契约/依赖零改动。
**证据**: 新增纯函数 `reduceDiscussionStream` 与 per-agent `{ round, content, status }` 状态；Discussion 按 agent_start/token/agent_end/error/summary/done 实时更新并在停止/Abort 时保留部分文本、收束失败态，InvestmentCommittee output 区新增可选 `streaming` 时间线（轮次、实时/最终文本、失败态、aria-live），缺省不渲染。新增 11 files / 29 tests：InvestmentCommittee 6、DiscussionStreaming 5、另 9 个核心组件各 2，共覆盖清单中 10 个组件。OpenAPI freshness 59 schemas、TypeScript、Vite production build 4,238 modules、全量 Vitest 74/74 files 与 227/227 tests、Discussion E2E 5/5、完整 Chromium E2E 35/35、zh/en 2,208/2,208 且重复/差异均 0、`git diff --check` 全通过；E2E 断言无需调整。当前 shell 无 Bun，使用项目现有锁定工具拆分执行等价门禁；未新增依赖、未改后端/SSE 契约、未 commit。

---

## [DONE] BACKLOG-005: E2E 扩面——SSE 交互管线（Chat/Discussion）+ 系统/知识页

**优先级**: P1
**任务卡**: `docs/ai/tasks/BACKLOG-005.md`
**范围**: ①`frontend/e2e/chat-paths.spec.ts`（≥6 用例）：Chat SSE 对话管线——空态/创建会话/SSE 流式回复（token+done 帧 mock）/error 事件/校验失败/旧路由 /chat 重定向；②`frontend/e2e/discussion-paths.spec.ts`（≥5 用例）：多 Agent SSE 讨论流（agent_start/token/agent_end/done 帧 mock）；③`frontend/e2e/system-pages.spec.ts`（≥8 用例）：knowledge/models/mcp-market/alerts/settings/compare/thesis/analysis 渲染+关键交互。API 全 mock 确定性，不改业务组件（发现 bug 只记录）。
**证据**: 新增共享 API/SSE mock helper 与 19 个确定性 Chromium E2E：Chat 6、Discussion 5、knowledge/models/mcp-market/alerts/settings/compare/thesis/analysis 各 1，共 system 8；所有 `/api/**` 请求均拦截，未声明请求固定 404。Chat 按 `token/token/done` 与 error、Discussion 按 `agent_start/token/agent_end/done` 与 error 的 `event:` + `data:` + 空行契约返回 `text/event-stream`。新增 spec 19 passed（14.1s），完整 E2E 35 passed（既有 16 + 新增 19，33.4s）；Vitest 63 files / 198 tests passed（509.23s）；OpenAPI 59 schemas freshness、TypeScript 与 Vite production build（4,237 modules）通过，diff/白名单检查通过。Discussion 当前不展示流式 token、轮次或 agent_end 时间线，已按任务边界记录且未改业务组件；未改 backend/schema/auth/deps/`reference/`，未 commit。

---

## [DONE] BACKLOG-004: 后端覆盖率攻坚（84%→≥87%）+ SSE 管线错误路径补强

**优先级**: P1
**任务卡**: `docs/ai/tasks/BACKLOG-004.md`
**范围**: ①覆盖率攻坚：9 个薄弱靶点模块（market_data 76.5% / scheduler 75.5% / fundamentals 77.4% / monitor_targets 74.7% / report_export 79.8% / report_audit 79.1% / thesis_drift 78.8% / research_jobs 80.9% / thesis 83.4%）确定性补测，总体从 84% 提到 ≥87%；②SSE 管线错误路径：6 条管线（chat/discussion/analysis/research/swarm/notifications）各补 ≥2 个错误路径用例（上游失败→error 事件、校验失败→4xx、流中断清理）；③纯补测试，不改业务代码（发现 bug 只记录）。
**证据**: 新增 9 个确定性测试文件、62 个测试：TOTAL 84%（551 passed）→ 87%（613 passed），九靶点依次为 market_data 86%、scheduler 93%、fundamentals 95%、monitor_targets 95%、report_export 98%、report_audit 94%、thesis_drift 100%、research_jobs 89%、thesis 90%，均满足至少 +5pp 或 ≥88%。chat/discussion/analysis/research/swarm/notifications 各新增 2 个错误路径用例，覆盖 error 事件/4xx/中断清理，notifications 另覆盖 replay cursor 与 ping。9 文件在代理开/关环境均为 62 passed（11.82s / 13.53s）；完整无覆盖率 613 passed（84.15s），覆盖率 613 passed / TOTAL 87%（141.36s），全 tests Ruff 通过。未改 `backend/app`、schema、认证、依赖、frontend 或 `reference/`，未 commit。

---

## [DONE] BACKLOG-003: 真实网络 Agent 工具测试稳定化（去网络依赖）

**优先级**: P1
**任务卡**: `docs/ai/tasks/BACKLOG-003.md`
**范围**: 把 `test_agent_tools_execution.py` 中两个真实请求腾讯行情的测试（test_get_stock_data_returns_quote_fields / test_calculate_indicators_returns_requested_indicators）改为 `monkeypatch` mock `MarketDataService.quote/kline` 的确定性测试（参考 test_trading_agent_tools 既有模式）；核查 test_agent_market_tools 是否已确定性；不改业务代码。
**证据**: `test_agent_tools_execution.py` 的 quote/kline 遗留真实请求已改为类方法 monkeypatch fixture，kline 固定 120 根；`test_agent_market_tools.py` 核查为既有确定性 mock，无需修改。代理开启（3 个变量均为 `http://127.0.0.1:7897` 且端口监听）与子进程临时清空 `ALL_PROXY/HTTP_PROXY/HTTPS_PROXY` 两种环境运行相同三文件测试均为 13 passed（1.68s / 0.70s）；完整 backend 保持 551 passed（62.28s），指定 Ruff 通过。未改业务代码、依赖、schema、前端或 `reference/`，未 commit。

---

## [DONE] BACKLOG-002: Discover 路径 E2E 补测（Alpha 工作台 + 旧路由重定向）

**优先级**: P1
**任务卡**: `docs/ai/tasks/BACKLOG-002.md`
**范围**: 新建 `frontend/e2e/discover-paths.spec.ts` 覆盖 `/discover` 默认模式、`/alpha`→`?mode=alpha` 重定向、`/screening`→`?mode=screening` 重定向、alpha 工作台渲染（mock /wq API）与 390px 无溢出；必要时增强 DiscoverModeDispatch 组件测试。
**证据**: 新增 `discover-paths.spec.ts` 5 个确定性用例，覆盖 `/discover` 默认筛选、`/alpha` 与 `/screening` 重定向、API-backed Alpha 类别/模板/搜索结果以及 390px 页面级无横向溢出；同步既有 E2E 的 zh 语言、当前 Tab/FinancialMetric/Today 断言。`bun run build` 4,237 modules；Vitest 63/63 files、198/198 tests；Playwright 16/16 tests（原 11 + 新增 5）；`git diff --check` 通过。无业务组件、后端、schema、认证或依赖改动。

---

## ✅ TASK-001: 前端路由懒加载拆包

**状态**: 已完成。router.tsx 已有 `React.lazy()`，vite.config.ts 已有 `manualChunks`。
**验证**: `bun run build` 产出 vendor-antd + lightweight-charts 等 3+ 个 JS 文件。

---

## ✅ TASK-002: SSE 四个端点加 try/finally 错误守卫

**状态**: 已完成。chat.py / discussion.py / analysis.py / research.py 均有 try/except/finally + aclose 清理。

---

## ✅ TASK-003: Portfolio HK/US PnL

**状态**: 已完成。calc_pnl() 使用 MarketDataService 全市场行情，已有 test_pnl_with_hk_ticker() 测试。
**验证**: `pytest tests/test_portfolio_market.py -v` 通过。

---

## ✅ TASK-004: Alpha 搜索缺省值

**状态**: 已完成。search_alpha("") 返回全部字段列表，不抛异常。
**验证**: `pytest tests/test_alpha_search.py -v` 通过。

---

## ✅ TASK-005: ticker 解析器合并收尾

**状态**: 已完成。resolve_ticker() 委托 normalize_code()，无残留重复解析逻辑。

---

## 全部完成

**最终验收**: 101 passed / ruff 0 / frontend build 0 errors.

---

## 下一阶段：6 项目统一

见 `docs/ai/UNIFICATION_PLAN.md`。

---

## [DONE] TASK-006: BigDataView 大屏仪表盘融入

**优先级**: P0
**状态**: 已完成。Codex 通过 node_repl MCP 修改了 Dashboard.tsx 和 app.css，新增深色金融大屏概览区（KPI 网格、状态指示、响应式布局）。
**验证**: `cd frontend && bun run build` 零错误。
**注意**: Codex CLI Windows 沙箱无法运行 shell，通过 node_repl MCP 直接读写文件绕过了该限制。

---

## [DONE] TASK-007: report_audit 工具吸收

**优先级**: P1
**状态**: 已完成。Codex 通过 node_repl MCP 新建 `backend/app/tools/report_audit.py`（371 行），含 extract_data_points、render_verdict、Markdown 表格解析。
**验证**: ruff=0 / pytest 101 passed / build ✓
**注意**: 第二次下发才成功——第一次 Codex 用了 apply 机制失败，第二次指定 node_repl fs.writeFileSync 才写入。

---

## [DONE] TASK-010: Chat 页面集成策略回测触发

**优先级**: P2
**状态**: 已完成。Codex 修改 Chat.tsx + 新建 BacktestResultCard.tsx，含权益曲线 (lightweight-charts)、核心指标。
**验证**: `bun run build` ✓ / pytest 107 passed / ruff 0

---

## 全部完成 🎉

**最终验收**: 107 passed / ruff 0 / frontend build 0 errors.
**已吸收**: BigDataView / ai-berkshire (report_audit) / Vibe-Trading (chat backtest)

---

## [DONE] TASK-011: 轻量定时任务调度器

**优先级**: P3
**状态**: 已完成。Codex 新建 scheduler.py（72 行），修改 main.py lifespan 注册 asyncio 每日 18:00 调度任务。
**验证**: pytest 110 passed / ruff 0

---

## 全部完成 🎉

**最终验收**: 110 passed / ruff 0 / frontend build 0 errors.
**6 项目统一完成**: BigDataView / ai-berkshire / Vibe-Trading / daily_stock_analysis / wq-alpha-research / stock-analyzer 核心能力已吸收。

---

## 产品化 Phase 0

### [DONE] PROD-000: 统一架构文档真相

**优先级**: P0
**状态**: 已完成。文档已对齐当前认证、23 个 APIRouter、schema v11/35 张逻辑表，并记录权威来源和同步规则。
**验证**: 运行时 OpenAPI 105 个 API 路径 / 134 个操作；文档一致性检查与 `git diff --check`。

### [DONE] PROD-001: 当前页面、流程与能力矩阵

**优先级**: P0
**状态**: 已完成。盘点 17 个页面组件、18 个明确路径、核心旅程与指标能力，区分已展示、后端未接线、真缺口和设计限制。

### [DONE] PROD-002: 主流程截图与首次任务步骤基线

**优先级**: P0
**状态**: 已完成。保存桌面/窄屏和三条主任务截图；统一记录当前步骤数、首视口可见性及错误恢复事实。

### [DONE] PROD-003: 本地产品指标最小测量合同

**优先级**: P0
**状态**: 已完成。定义人工基线优先、可选本地事件后置的指标公式、完成条件、allowlist、隐私和清除规则。

### [DONE] PROD-010: 六组一级导航与路由映射

**优先级**: P0
**状态**: 已完成。原同级菜单已归入今日、研究、策略、组合、知识和系统工具六组导航，深度研究直接可达，动态分析路由归入研究上下文。
**验证**: 导航结构测试 2 passed；前端构建通过；桌面与 390×844 浏览器抽屉验证通过。

### [DONE] PROD-011: Dashboard 任务启动台

**优先级**: P0
**状态**: 已完成。三个核心任务位于首视口，大屏与市场雷达下移；桌面和窄屏均显示 3/3 个任务。
**验证**: Dashboard E2E 1 passed；前端构建通过；桌面与 390×844 截图通过。

### [DONE] PROD-012: 三个真实示例任务

**优先级**: P0
**状态**: 已完成。600519 分析、MA20/50 回测和非自动写入的组合预填均可直接复测；价格与成本未伪造。
**验证**: Dashboard/Portfolio E2E 2 passed；前端构建通过；桌面、窄屏和表单预填浏览器验证通过。

### [DONE] PROD-013: 首次任务进度与上下文帮助

**优先级**: P0
**状态**: 已完成。成功分析、completed 回测和成功保存驱动本地 3 步进度；提示可隐藏/恢复，窄屏不遮挡三个任务。
**验证**: ProductProgress/navigation 4 passed；Dashboard/Portfolio E2E 2 passed；真实 600519 分析推进 0/3→1/3；桌面/窄屏截图通过。

### [DONE] PROD-014: 统一页面任务头结构

**优先级**: P0
**状态**: 已完成。四个核心页面复用同一语义任务头，展示目标、对象、真实数据状态和唯一主操作。
**验证**: 组件/StrategyLab 3 passed；前端构建通过；桌面与 390×844 四页浏览器验证通过。

### [DONE] PROD-015: 全局标的与任务入口

**优先级**: P0
**状态**: 已完成。Header 可搜索标的或问题并明确选择任务；组合、论文、预警和问答仅预填，不自动提交。
**验证**: 前端 45 tests / E2E 2 passed / build / Ruff / 桌面与 390×844 浏览器通过；后端实时上游门禁见任务卡。

## 产品化 Phase 2

### [DONE] PROD-020: 统一摘要、证据与方法结果框架

**优先级**: P0
**状态**: 已完成。四个核心结果页统一为“摘要 / 证据 / 方法与来源”，保留现有真实数据、报告、回测与质量边界。
**验证**: 相关 6 tests / build / 四页桌面语义检查 / 390×844 浏览器检查通过。

### [DONE] PROD-021: 个股信号中文化与冲突解释

**优先级**: P0
**状态**: 已完成。9 个现有 signal code 均转为中文名称和尺度；摘要按可见计数给出偏强/中性/偏弱，并显式标记多空分歧。
**验证**: 前端 20 files / 49 tests、build、600519 实时混合信号、桌面与 390×844 浏览器检查通过。

### [DONE] PROD-022: 指标解释卡与知识锚点

**优先级**: P0
**状态**: 已完成。MA/MACD/KDJ/RSI 共享用途、读法、公式与误区；个股页显示真实末值并可进入原始图表、知识、深研和策略验证。
**验证**: 前端 22 files / 52 tests、build、600519 实时值、跨页路由及桌面/390×844 浏览器检查通过。

### [DONE] PROD-023: 研究工作区聚合快照、报告、分歧、笔记和历史版本

**优先级**: P0
**状态**: 已完成。单一标的工作区聚合保存快照、报告版本、精确观点文本变化、主题匹配讨论、论文漂移和最新笔记边界。
**验证**: 前端 23 files / 54 tests、build、本地 600519 的 3 报告/1 讨论/0 论文、版本与讨论深链、桌面/390×844 浏览器检查通过。

### [DONE] PROD-024: AI 意图入口：快速问答、深度研究、多视角审查

**优先级**: P0
**状态**: 已完成。用户先选择研究强度并看到产物、相对耗时、模型额度和最终确认动作；目标页只导航和预填，团队详情默认折叠。
**验证**: 前端 25 files / 57 tests、build、三条无自动调用路由、桌面与 390×844 浏览器检查通过。

### [DONE] PROD-025: 从研究结论创建论文、验证条件和预警

**优先级**: P0
**状态**: 已完成。已保存报告经显式确认创建关联论文和确定性验证条件；论文可带上下文预填技术预警，并明确当前 schema 无论文外键。
**验证**: 前端 27 files / 61 tests、build、报告确认无写入、论文/预警上下文、桌面与 390×844 浏览器检查通过。

### [DONE] PROD-026: 基本面/估值 P1 指标按真实数据可用性补齐

**优先级**: P0
**状态**: 已完成。P1 三组 13 项指标只展示提供方原值或组件可审计的确定性派生值；缺失字段保持 UNKNOWN，上游断连统一为 502。
**验证**: 后端 focused 23 passed、前端 28 files / 63 tests、build、Ruff、三市场实时 502 边界、桌面与 390×844 浏览器检查通过；全后端 381 passed / 4 个实时上游失败，coverage 83.21%。

## 产品化 Phase 3

### [DONE] PROD-030: 策略目标与预设选择，高级参数渐进披露

**优先级**: P0
**状态**: 已完成。趋势跟随与风险控制复用现有 MA 预设；均值回归诚实标为不可用；完整均线、费用和风控字段默认折叠。
**验证**: 前端 29 files / 66 tests、build、无自动提交、风险控制 MA30/90+12%、桌面与 390×844 浏览器检查通过。

### [DONE] PROD-031: 回测结论摘要、失败原因排序和指标解释

**优先级**: P0
**状态**: 已完成。保留原基础门槛，先展示结论和五项决策指标，再按实际值排序收益、回撤、样本和稳健性限制；专业指标默认折叠，失败与部分证据错误分类且保留原文。
**验证**: 前端 31 files / 71 tests、build、diff check、真实已保存回测桌面与 390×844 浏览器检查通过；未运行或保存业务数据。

### [DONE] PROD-032: 预设比较、单参数变化和保存实验

**优先级**: P0
**状态**: 已完成。已保存回测作为实验基准；0/1/多参数差异明确，只有同标的、区间、资金、成本和基准的真实结果进入预设比较，缺失结果保持未运行。
**验证**: 前端 33 files / 77 tests、build、diff check、真实已保存实验桌面与 390×844 浏览器检查通过；未运行或保存业务数据。

### [DONE] PROD-033: Alpha 类别、模板和通俗说明

**优先级**: P0
**状态**: 已完成。已接入 7 类真实字段目录和 5 个目录验证模板，展示通俗假设、局限、字段 ID/描述/coverage、缺失区域和折叠表达式/设置；选择仅更新本地上下文。
**验证**: 前端 36 files / 81 tests、build、diff check、live API 桌面与 390×844 浏览器检查通过；未调用模拟、相关性或 BRAIN。

### [DONE] PROD-034: 本地 Alpha 模拟和相关性

**优先级**: P0
**状态**: 已完成。显式 CSV/JSON 观察数据校验后才运行本地模拟；短样本不主推年化，相关性只按至少 3 个共同日期对齐，结果保留 `r/p/n/note` 和非因果说明。
**验证**: 前端 38 files / 86 tests、build、diff check、桌面与 390×844 输入边界浏览器检查通过；无真实观察数据时未调用模拟、相关性、持久化或 BRAIN。

### [DONE] PROD-035: P1 回测风险、基准归因和交易质量指标

**优先级**: P1
**状态**: 已完成。权益/基准曲线补齐波动、最大回撤持续/恢复和一元回归归因；完整交易、持仓 bar 与实际 fill 补齐交易质量及成本拆分，旧结果明确保持不可用。
**验证**: 后端共享路径 33 passed、完整门禁 384 passed / 4 个既有外部标的解析失败、coverage 83.32%、Ruff 通过；前端 38 files / 87 tests、build、桌面与 390×844 旧结果浏览器验证通过。

### [DONE] PROD-036: P2 Alpha IC、分位和衰减能力评估

**优先级**: P2
**状态**: 已完成。现有单期限、最少双标的合同不足以安全展示 ICIR、完整分位单调性和衰减；页面逐项展示设计状态和所需数据合同，不生成数值或动作。
**验证**: AlphaSimulationWorkbench 2 passed；前端 38 files / 87 tests、TypeScript 和生产构建通过；窄屏修正后聚焦测试/build 复验，桌面与 390×844 浏览器检查通过且未提交观察数据。

### [DONE] PROD-037: 本地 Alpha 研究保存与恢复

**优先级**: P0
**状态**: 已完成。只有显式命名并点击保存才落盘派生快照；刷新恢复真实模板、参数和结果但保持观察输入为空，移除进入可撤销本地回收站。
**验证**: 聚焦 3 files / 6 tests；完整前端 39 files / 90 tests、TypeScript、生产构建、Ruff 与 diff check 通过；桌面/390×844 空输入保存边界通过，持久化刷新由 jsdom 精确合同验证。

### [DONE] PROD-040: 接入组合回测和风险 X 光

**优先级**: P0
**状态**: 已完成。复用现有 `/backtests/portfolio`，从当前组合至少两个持仓显式运行等权基线模拟，展示校准权重、曲线、绩效、交易质量、逐资产来源和风险 X 光；不修改真实持仓。
**验证**: 聚焦 1 file / 2 tests；完整前端 40 files / 92 tests、TypeScript 和生产构建通过；真实 `000858`/`600519` 组合桌面与 390×844 浏览器验证通过，持仓未改变。

### [DONE] PROD-041: 组合风险指标通俗解释

**优先级**: P0
**状态**: 已完成。基于后端原始状态解释集中度、回撤、VaR/ES 和分散化，明确样本/口径/下一步；样本不足和不支持状态保持不可用，不前端补算。
**验证**: 聚焦 1 file / 3 tests；完整前端 40 files / 93 tests、TypeScript 和生产构建通过；桌面与 390×844 浏览器解释层通过。

### [DONE] PROD-042: 组合相关性和风险来源可视化

**优先级**: P0
**状态**: 已完成。后端校准权重形成降序集中来源图，平均相关性形成单点位置图并保留共同样本；明确完整矩阵和风险贡献缺口，不做反推。
**验证**: 聚焦 1 file / 3 tests；完整前端 40 files / 93 tests、TypeScript 和生产构建通过；真实 50/50 权重与 0.606 平均相关性桌面/390×844 浏览器通过。

### [DONE] PROD-043: 四种优化器只读比较

**优先级**: P0
**状态**: 已完成。固定资产、策略、样本、成本和初始资金，仅改变优化器，比较收益、回撤、后端汇总换手、交易数、集中度和假设；0% 权重路径已修复，不修改真实持仓。
**验证**: 后端 portfolio/risk 12 passed、Ruff；前端聚焦 6 tests、完整 40 files / 96 tests、TypeScript/build；四种真实结果及桌面/390×844 通过。

### [DONE] PROD-044: 行业、市场和币种暴露可行性与缺口

**优先级**: P1
**状态**: 已完成。逐资产展示加载器真实 market/currency 和覆盖率；行业合同缺失时保持 UNKNOWN，不从名称、代码或市场板块榜单推断。
**验证**: 后端 router 合同 1 passed、Ruff；前端聚焦 7 tests、完整 40 files / 97 tests、TypeScript/build；真实 CN/CNY 与行业 UNKNOWN 桌面/390×844 通过。

### [DONE] PROD-045: 组合风险到预警和定期复盘闭环

**优先级**: P0
**状态**: 已完成。成功风险结果提供显式 Alerts 预填和本地 7 天复盘待办；预填不创建规则，待办只保存派生摘要/时间并支持刷新恢复、完成、删除与撤销。
**验证**: 聚焦 2 files / 13 tests；完整前端 40 files / 99 tests、TypeScript/build；真实组合窄屏浏览器刷新、删除/撤销和 Alerts 取消后 0 条规则通过；后端 385 passed / 4 个既有外部数据失败、coverage 83.34%，Ruff 通过。

## 产品化 Phase 5

### [DONE] PROD-050: 保存常用指标、布局密度和研究模板

**优先级**: P0
**状态**: 已完成。版本化本地偏好显式保存常用指标、AntD 布局密度和真实 Alpha 模板 ID；刷新恢复、损坏数据回退和恢复新手默认值均不改变数据口径。
**验证**: 聚焦 4 files / 13 tests；完整前端 41 files / 105 tests、TypeScript/build/diff check；真实 600519 MA/RSI 展示、`price_reversal` 模板恢复、观察输入为空及桌面/窄屏重置通过。

### [DONE] PROD-051: 跨标的、策略和组合比较工作区

**优先级**: P0
**状态**: 已完成。比较工作区只读取已保存研究、完成策略实验和已验证本地组合复盘，持久化最多四个来源 ID；跨类型仅元数据，同类型策略必须完整且同口径才显示数值。
**验证**: 聚焦 3 files / 8 tests；完整前端 43 files / 111 tests、TypeScript/build/diff check；真实两条旧 AAPL 实验的缺失成本/风控字段保持 UNKNOWN 和不可比，策略+组合跨类型边界桌面/窄屏通过。

### [DONE] PROD-052: 研究版本、参数、来源和方法导出

**优先级**: P0
**状态**: 已完成。复用比较工作区的显式来源选择和规范化候选，生成 schema v1 JSON 可复现清单；预览与下载使用同一对象，旧记录缺失字段保持 UNKNOWN，敏感/原始数据明确排除，下载只在用户点击后发生。
**验证**: 聚焦 3 files / 10 tests；完整前端 44 files / 115 tests、TypeScript/build/diff check；真实 AAPL 已保存策略与本地组合复盘的桌面/窄屏预览、UNKNOWN 缺口和显式下载触发通过。

### [DONE] PROD-053: P2 因子、风险贡献和压力测试能力证据审计

**优先级**: P2
**状态**: 已完成。现有显式 Alpha 观察合同新增横截面 Pearson IC、Spearman Rank IC 与非年化 ICIR；组合真实对齐收益新增完整相关矩阵和样本协方差风险贡献。完整分位、衰减和压力测试继续保持数据不足/设计状态。
**验证**: 后端聚焦 28 passed、Ruff；完整后端 386 passed / 4 个既有失败、coverage 83.34%；前端聚焦 2 files / 10 tests、完整 44 files / 115 tests、TypeScript/build；真实 5 标的 × 5 日期 Alpha 与 739 期双资产组合桌面/窄屏通过。

### [DONE] PROD-054: 论文更新、观点漂移和研究待办统一时间线

**优先级**: P1
**状态**: 已完成。研究首页按时间聚合已保存工作区、报告版本、论文漂移状态和本地组合复盘待办；后端持久化与本地派生明确分层，缺失更新时间保持 UNKNOWN，只有原记录链接。
**验证**: 聚焦 3 files / 7 tests；完整前端 45 files / 117 tests、TypeScript/build/diff check；真实 1 个工作区、8 个报告版本、0 个论文和 1 个本地复盘待办按时间排序，桌面/390×844 无写请求和文档级横向溢出。

### [DONE] PROD-055: 系统工具与普通产品入口彻底分层

**优先级**: P0
**状态**: 已完成。知识库与模型/MCP/设置拆为独立“知识”和“系统工具”导航组；三个系统深链保留原路由，并统一显示非前置说明和返回研究工作区路径。全局任务入口只保留产品任务并明确维护入口边界。
**验证**: 聚焦 2 files / 4 tests；完整前端 45 files / 117 tests、TypeScript/build/diff check；`/models`、`/mcp-market`、`/settings` 深链和返回 `/research` 通过，桌面/390×844 无文档级横向溢出或配置写入。

## 产品化 Phase 6

### [DONE] PROD-060: 核心路径 E2E 与错误/空状态回归

**优先级**: P0
**状态**: 已完成。Playwright 为个股研究、策略验证和组合体检建立确定性成功/空/错误合同；Portfolio 初始加载不再静默吞错，按组合列表/汇总/持仓/配置显示来源失败与安全重试。390px 大额 KPI 保持卡片内可读。
**验证**: 聚焦 Vitest 1 passed；完整前端 46 files / 118 tests；Playwright 9 passed；TypeScript/build/diff check。真实 600519 研究保留 tencent/sina 来源与基本面/筹码 UNKNOWN，真实策略/组合只读路径及三页 390×844 无文档级溢出。

### [DONE] PROD-061: 键盘、焦点、对比度、缩放和图表文字摘要审计

**优先级**: P0
**状态**: 已完成。共享交互控件统一获得 light/dark 可见 `:focus-visible`；研究与回测图表新增同数据的日期、数值、来源/复权、回撤和成交文字摘要，组合图表新增语义名称。三条核心路径键盘主操作与 200% 等效视口通过。
**验证**: 聚焦 2 files / 10 tests；完整前端 47 files / 120 tests；Playwright 11 passed；TypeScript/build/diff check。真实搜索按钮焦点环约 2.84px，关键 light/dark 对比度 5.69–10.75:1；真实 600519 三条图表摘要及三页 720px 无溢出。

### [DONE] PROD-062: 首屏、图表和长列表性能优化

**优先级**: P1
**状态**: 已完成。可重复生产构建测量定位到三条核心初始路由提前请求 1.146 MB ECharts/ZRender；研究、回测和组合结果图改为共享按需边界，Dashboard 与全部数据、来源、排序、空错和文字摘要合同保持不变。
**验证**: 三页初始资产由 2.75–2.77 MB 降至 1.60–1.62 MB（41.36%–41.71%）；聚焦 2 files / 10 tests，完整前端 47 files / 120 tests，Playwright 11 passed，TypeScript/build/diff check。真实 600519 三张延迟图表、260 条 `sina` 日线与来源摘要通过。

### [DONE] PROD-063: 真实 A/HK/US 数据和来源失败回归

**优先级**: P0
**状态**: 已完成。真实 600519 搜索/快照/日线分别验证 Eastmoney/Tencent/Sina 与 CNY、截止时间、未复权质量标记；A 股基本面及 HK/US Yahoo 能力当前真实失败，全部保持 502。失败消息新增 provider、异常类型和 `circuit_open` 归因，不补造数值。
**验证**: 真实跨市场 JSON 与 HK/US 浏览器失败页；聚焦 53 + 4 passed；完整后端 392 passed / 83.51% coverage；完整 Ruff、TypeScript/build，前序同工作树完整前端 120 tests / Playwright 11 passed。

### [DONE] PROD-064: 金融指标口径、期间、复权、成本和基准审计

**优先级**: P0
**状态**: 已完成。基本面、价格、策略、组合与 Alpha 建立输入到展示追踪；旧图表缺失指标不再显示 0，策略/Alpha 明示 Sharpe/Sortino 零阈值与年化频率，组合/Alpha 明示未覆盖的交易成本和 FX 边界。
**验证**: 后端金融计算 57 passed；完整后端 392 passed / 83.51% coverage；完整前端 47 files / 121 tests；Playwright 11 passed；Ruff、TypeScript/build/diff check。真实已保存 AAPL `none / 1d` 口径与组合成本边界通过。

### [DONE] PROD-065: 文档、截图、API 合同和发布清单同步

**优先级**: P0
**状态**: 已完成。运行时 105 个 API 路径 / 134 个操作、23 个 APIRouter、schema v11 / 35 个逻辑表及 18 个懒加载页面 / 19 个产品路径已与权威文档同步；39 个任务证据路径全部存在，3 个 JSON 可解析，93 张图片非空。最终后端 392 passed / 83.51%、Ruff、mypy、前端 121 tests、Playwright 11 tests、TypeScript/build/diff check 全部通过；发布清单保留真实上游失败和未提交/未发布边界。

---

## AI 原生投资研究 OS

长期路线与执行合同见 `docs/ai/AI_NATIVE_RESEARCH_OS_PLAN.md`。这是已完成 `PROD-*` 产品化后的后续阶段，不重跑 Phase 0-6。

### [DONE] AIOS-000: AI 原生研究 OS 基线与领域合同冻结

**优先级**: P0
**任务卡**: `docs/ai/tasks/AIOS-000.md`
**范围**: 只读审计与文档；不修改业务代码、依赖、数据库或 `reference/`。
**完成条件**: 当前 memory/workspace/thesis/evidence/job 数据流可追踪，v1 领域对象完成 `REUSE/EXTEND/MISSING/BLOCKED` 映射，并为 AIOS-001 固定评估场景。
**证据**: `docs/ai/AI_NATIVE_CAPABILITY_BASELINE.md`；静态核对 23 个 APIRouter、105 个 `/api/*` 路径、134 个 HTTP 操作、schema v11、35 张逻辑表；未运行 pytest/build/E2E 或真实上游验证。

### [DONE] AIOS-001: 投资记忆 fixture 与 FTS5 baseline runner

**优先级**: P0
**任务卡**: `docs/ai/tasks/AIOS-001.md`
**范围**: 按 `AI_NATIVE_CAPABILITY_BASELINE.md` 固定的中英、时序、矛盾、隔离、prompt injection、删除同步和上游失败场景建立可重复基线。
**前置**: `AIOS-000` 已完成；不引入 Graphiti、Mem0 或生产依赖。
**证据**: `aios-memory-fixture-v1` 13 条 synthetic records / 6 cases；Recall@5 1.0000、Precision@5 0.9167；隔离泄漏和注入执行为 0；focused pytest 7 passed、Ruff 与 diff check 通过。未执行真实上游验证。

### [DONE] AIOS-002: CanonicalProvenanceEnvelope 与 JSON Schema

**优先级**: P0
**范围**: 定义稳定的 provenance envelope、未知值和派生输入规则，并验证现有行情、基本面和计算结果可无损映射；不迁移数据库、不接第三方系统。
**前置**: `AIOS-001` 已完成；任务卡按长期计划与当前架构边界生成。
**证据**: Draft 2020-12 schema 自检；3 个有效 fixture 映射通过、7 个非法合同拒绝；focused pytest 3 passed、Ruff 与 diff check 通过。仅 deterministic fixture，不是真实上游验证。

### [DONE] AIOS-003: MemoryProvider 与 MemoryCandidate 端口

**优先级**: P0
**范围**: 在不接第三方系统、不迁移数据库的前提下定义项目自有端口，并由 native FTS5 provider 保持 chat/research 当前行为。
**前置**: `AIOS-002` 已完成。
**证据**: native provider 接管 chat/research，旧函数兼容；focused pytest 12 passed，Ruff、mypy、diff check 通过。

### [BLOCKED] AIOS-004: Graphiti 与 Mem0 fixture-only shadow PoC

**优先级**: P0
**范围**: 仅使用 synthetic fixture 比较候选；不注入模型、不写生产数据、不新增生产依赖。不可用候选必须明确报告并回退 native baseline。
**前置**: AIOS-003 已完成。

### [DONE] AIOS-005: memory provider 选型 ADR

**范围**: 基于可重复 native baseline 与第三方候选的真实证据边界，决定 Local OSS v1 的生产 memory provider；不把 `NOT_RUN` 冒充候选 benchmark。
**证据**: native 6 cases 已实测；Graphiti/Mem0 均未安装，候选指标保持 `null`。2026-08-24，维护者 `@Satanchen` 明确批准保持 Native FTS5；`ADR-005-memory-provider.md` 已标记 `ACCEPTED`。AIOS-004/034 继续作为未来可选隔离 PoC 保持 `[BLOCKED]`，不再阻塞生产选型。

### [DONE] AIOS-010: Evidence object 与派生输入引用 schema

**优先级**: P0
**范围**: 在现有单 aiosqlite 连接和原始 SQL 架构内新增 canonical evidence 与 computed input references；必须迁移可备份回滚、保持未知值和用户隔离。
**前置**: AIOS-002 provenance 合同已完成；不依赖被阻塞的第三方 shadow benchmark 或 AIOS-005 选型 ADR。
**证据**: schema v12 / 37 张逻辑表；v11 自动 `.pre-v12.bak`；UNKNOWN、computed input 与 owner-scoped 复合外键约束通过。focused 7 passed、Ruff、mypy、diff check 通过。完整既有 cross-user API 测试受工作树 `LOCAL_ONLY_MODE` 默认行为影响失败，未在本任务越界修改。

### [DONE] AIOS-011: 行情、基本面与研究报告 provenance adapter

**优先级**: P0
**范围**: 复用现有 provider 返回和 `CanonicalProvenanceEnvelope v1`，把三类业务结果映射并持久化到 evidence foundation；未知/上游失败不得补造。
**前置**: AIOS-010 schema v12 已完成。
**证据**: 三类 adapter 通过 canonical schema；字段/UNKNOWN/AI 文档边界与显式 owner 写入通过。focused 6 passed、Ruff、mypy、diff check 通过；没有隐式业务写入或真实上游验证。

### [DONE] AIOS-012: 计算结果 provenance 与可复算 fixture

**优先级**: P0
**范围**: 为现有回测、风险和 Alpha 确定性计算记录 formula、input evidence IDs 与 method_version，并以 fixture 证明可复算；不重新实现计算引擎。
**前置**: AIOS-011 adapters 与 schema v12 已完成。
**证据**: 现有三套引擎复算 total return 0.16、HHI 0.58、terminal equity 1.0404，并生成完整 lineage envelope。focused 5 passed、Ruff、mypy、diff check 通过；仅 deterministic fixture。

### [DONE] AIOS-013: 统一 Citation UI 与来源/计算方法

**优先级**: P0
**范围**: 在现有结果页信息架构中复用统一 citation 组件，清楚展示来源、时间、质量状态和计算方法；缺失保持 UNKNOWN/UPSTREAM_ERROR。
**前置**: AIOS-012 computed provenance 合同已完成。
**证据**: 基本面/策略共享组件；完整 127 tests、TypeScript/build；实际 AAPL saved run 桌面/390px 来源展开且无溢出，旧 lineage 保持 UNKNOWN。未运行或保存业务数据。

### [DONE] AIOS-014: Evidence audit API 与导出清单 v2

**优先级**: P0
**范围**: 提供当前用户 evidence 清单与引用完整性审计，导出只含 canonical metadata/value 和 lineage，不含凭据、会话或原始敏感正文。
**前置**: AIOS-013 Citation UI 已完成；schema v12 与 adapters 可用。
**证据**: owner audit/export focused 2 passed、Ruff/mypy；OpenAPI 107/136。Phase 1 标准模式后端 419 passed / 83.61%，全 Ruff/mypy，前端 127 tests、TypeScript/build、E2E 11 passed、diff check 均通过。

### [DONE] AIOS-020: 类型化 memory records、状态与 supersession

**优先级**: P0
**范围**: 在单 aiosqlite/raw SQL 架构内新增 owner-scoped typed memory schema 与最小 CRUD；状态历史和 supersession 不得静默覆盖，事实确认必须引用 evidence。
**前置**: Phase 1 Evidence Foundation 退出门禁已通过；不依赖被阻塞的第三方框架 PoC。
**证据**: schema v13、pre-v13 backup、typed CRUD/supersession/isolation focused 8 passed，Ruff、mypy、diff check 通过。

### [DONE] AIOS-021: 显式保存和 background candidate 抽取

**优先级**: P0
**范围**: 复用 typed memory service 提供显式保存入口与可关闭的后台 candidate 抽取；自动内容不得写为 confirmed 或冒充 FACT。
**前置**: AIOS-020 typed memory schema 与 CRUD 已完成。
**证据**: 显式 owner save API 与默认关闭的幂等 background capture 完成；自动内容仅为 AI_INFERENCE candidate。focused 4 passed、Ruff、mypy、OpenAPI 108/137、diff check 通过。

### [DONE] AIOS-022: subject/time/provenance-aware retrieval

**优先级**: P0
**范围**: 在 typed memory 上实现 owner/subject/time/status/provenance-aware 检索与可重复 benchmark，不替换现有 FTS 主路径。
**前置**: AIOS-021 显式保存与 opt-in candidate capture 已完成。
**证据**: synthetic fixture typed Recall@5 1.0000 / Precision@5 1.0000，不低于 FTS 1.0000/0.9167；semantic 6/6、owner leakage 0、本地 P95 0.6133 ms；focused 3 passed、Ruff、mypy、diff check 通过。

### [DONE] AIOS-023: context assembler 与 recall explanation

**优先级**: P0
**范围**: 将 typed memory 候选装配为有 token/字符预算、明确不信任边界、状态/时间/provenance 引用和召回解释的上下文；不接入回答主路径。
**前置**: AIOS-022 typed retrieval 与 benchmark gates 已通过。
**证据**: 完整 JSON-line 双预算 assembler、stable citations、recall explanation、UNKNOWN provenance 与 prompt-injection trust boundary；focused 4 passed、Ruff、mypy、diff check 通过，尚未接入主路径。

### [DONE] AIOS-024: 用户查看、确认、编辑、作废、删除、导出记忆

**优先级**: P0
**范围**: 提供当前用户 typed memory 的查看、确认、编辑、作废、soft-delete 与安全导出 API/界面，删除范围清晰可验证。
**前置**: AIOS-023 retrieval/context contract 已完成。
**证据**: owner-scoped 管理/allowlist export API 与 Knowledge UI 完成；edit supersession 保留历史且用户修订重新分类，FACT 禁止改写；backend 6 tests、frontend 4 tests、Ruff/mypy、TypeScript/build、OpenAPI 110/141、diff check 通过。

### [DONE] AIOS-025: chat/research shadow -> opt-in rollout

**优先级**: P0
**范围**: 先以 shadow 审计 typed retrieval 与现有 FTS 候选差异，再提供默认关闭、可立即回退的 chat/research opt-in context；记录候选差异、字符/token 成本，不记录金融正文。
**前置**: AIOS-024 用户控制面与 Phase 2 memory contracts 已完成。
**证据**: schema v14/pre-v14 backup；默认关闭 shadow/opt-in、metadata-only owner audit、chat/research 注入与 FTS fallback 完成。focused 57 passed；Phase 2 标准模式 backend 443 passed/83.83%，全 Ruff/mypy，frontend 130 tests、TypeScript/build、E2E 11 passed，diff check 通过。

### [DONE] AIOS-030: Thesis v2 版本化领域模型

**优先级**: P0
**范围**: 在现有单 aiosqlite/raw SQL thesis 服务上增加判断、假设、支持、反对、失效条件、置信度和不可变版本历史；旧 thesis 必须无损读取，更新不得静默覆盖历史。
**前置**: Phase 2 Investment Memory v1 退出门禁已通过。
**证据**: schema v15/pre-v15 backup；legacy current view/API 兼容；不可变版本、retired claim history、同用户 evidence refs 与 AI_INFERENCE/USER_HYPOTHESIS 边界完成。focused 17 passed、Ruff/mypy、OpenAPI 111/142、diff check 通过。

### [DONE] AIOS-031: claim-evidence edges 与时间有效期

**优先级**: P0
**范围**: 在 canonical evidence 与 Thesis v2 上增加 owner-scoped claim/evidence 支持或反对边、有效期和状态事件历史；自动状态变化必须可回链，缺失 evidence 保持 UNKNOWN。
**前置**: AIOS-030 Thesis v2 不可变版本与同用户 evidence 引用已完成。
**证据**: schema v16/pre-v16 backup；manual/automatic temporal edge history 与 append-only status events；deterministic 非 UNKNOWN 数据库级 evidence 强制；focused 17 passed，Ruff/mypy、OpenAPI 111/142、diff check 通过。

### [DONE] AIOS-032: Challenge My Thesis 产品动作

**优先级**: P0
**范围**: 复用现有 bearish/contrarian/research 能力，对当前 Thesis 生成最强反证、遗漏变量和脆弱假设；所有事实与计算必须引用 canonical evidence，模型内容保持 AI_INFERENCE，缺证据结论保持 UNKNOWN。
**前置**: AIOS-031 claim-evidence 时间边与状态事件已完成。
**证据**: owner-scoped 只读 API/UI；三类 AI_INFERENCE 输出与 canonical refs/UNKNOWN；读前后无 Thesis 写入。backend focused 13、frontend 3，Ruff/mypy/TypeScript/build，OpenAPI 112/143、diff check 通过。

### [DONE] AIOS-033: deterministic + evidence-aware drift engine

**优先级**: P0
**范围**: 将 Thesis 漂移核验收敛为明确规则与 canonical evidence 的确定性引擎；移除报告文本相似度的状态决定权，展示 UNKNOWN、输入、公式/阈值和规则版本。
**前置**: AIOS-032 Challenge My Thesis 已完成；AIOS-031 状态事件与时间边可用。
**证据**: thesis-drift/v1 四类版本化规则；price/fundamental baseline/current 双侧 evidence 门禁；position/report UNKNOWN；UI 展示公式/参数/证据且不重算。backend focused 14、frontend 3，Ruff/mypy/TypeScript/build、OpenAPI 112/143、diff check 通过。

### [BLOCKED] AIOS-034: 可选 Graphiti read model 同步与重建

**优先级**: P1
**范围**: 仅在 fixture/shadow 边界内定义由 authoritative SQLite 重建的 temporal graph read model，验证删除后全量重建与双边计数；不得新增生产依赖或接入业务主路径。
**前置**: AIOS-033 evidence-aware drift engine 已完成；AIOS-004 外部 Graphiti 包仍为 BLOCKED，因此本任务先执行无第三方依赖的 adapter contract、export fixture 与 rebuild harness。
**证据**: thesis-graph-export/v1 与内存 sink clear/rebuild 通过，五类 source/export/sink 计数一致、跨用户泄漏 0；focused 2、Ruff/mypy/diff check。Graphiti 包未安装且未运行，候选指标均 null。ADR-005 已接受 Native FTS5；本任务仅作为未来可选隔离 PoC 保持 `[BLOCKED]`。

### [DONE] AIOS-035: Thesis 历史、差异和用户确认流程

**优先级**: P1
**范围**: 在 Thesis v2 不可变版本和 AIOS-031 状态事件基础上提供版本差异、置信度变化原因与显式用户确认；系统不得自动替用户改变判断或 confidence。
**前置**: AIOS-030/031/032/033 已完成；不依赖被阻塞的 Graphiti read model。
**证据**: schema v17/pre-v17 backup；相邻版本 diff 与 confidence old/new/change_reason；owner-scoped append-only acknowledged/disputed；UI 历史/证据/错误态。focused backend 17 + frontend 4；Phase 3 backend 461/83.87%、frontend 133、E2E 11，Ruff/mypy/TypeScript/build 通过。

### [DONE] AIOS-040: 个性化 Today / Decision Inbox

**优先级**: P1
**范围**: 复用现有 owner-scoped Thesis、Portfolio、research、notification/evidence 事实，在今日首页提供只与当前用户对象相关的 decision items；每项必须含 why-now、对象、证据/质量和明确下一步，缺证据不得生成确定提醒。
**前置**: AIOS-035 与 Phase 3 退出门禁已完成；不依赖 AIOS-034 Graphiti read model。
**证据**: decision-inbox/v1 owner-scoped 只读聚合；Thesis 确定事件、待确认版本、定时研究失败三类；UNKNOWN/UPSTREAM_ERROR 保真；Dashboard 四态与 390px 行动布局。backend 47、frontend 2、Ruff/mypy/TypeScript/build、OpenAPI 114/145、diff check 通过；Phase 4 回归补齐 E2E 空态 mock，targeted 1 + full 11 passed。

### [DONE] AIOS-041: Thesis / Portfolio / Strategy 原生 monitor targets

**优先级**: P1
**范围**: 在现有 alert/scheduled research 能力上提供与 Thesis、Portfolio、Strategy 对象绑定的 monitor target 草稿和显式确认流程；默认只读、无外部写操作，不凭空生成金融阈值。
**前置**: AIOS-040 Decision Inbox 已完成；复用现有 alert_rules、scheduled_research_jobs 与用户对象，不引入新基础设施。
**证据**: schema v18/pre-v18 backup；对象绑定与 confirmation key；无条件 UNKNOWN、draft 零写、confirm 幂等启用、owner isolation。backend 63、Alerts 5、Ruff/mypy/TypeScript/build、OpenAPI 116/147 通过。

### [DONE] AIOS-042: scheduled research 结果与 memory/evidence 串联

**优先级**: P1
**范围**: 将既有 scheduled research 的运行结果以幂等、可回链方式连接 owner-scoped research report、typed memory、canonical evidence 与通知；失败、重试、SSE/通知保持可追溯且不编造结果。
**前置**: AIOS-041 monitor targets 已完成；复用现有 scheduler/research jobs/memory/evidence/notifications，不引入外部队列。
**证据**: schema v19/pre-v19 backup；owner-scoped run key/attempt/failure retry/report lineage；evidence OK/PARTIAL/UNKNOWN/UPSTREAM_ERROR 保真；memory opt-in candidate-only；notification 回链与 Settings 历史 UI。backend focused 79、frontend 5、Ruff/mypy/TypeScript/build，OpenAPI 117/148 通过。fixture/mock 不是真实上游验证。

### [DONE] AIOS-043: 复盘工作流：新证据 -> 判断变化 -> 用户确认

**优先级**: P1
**范围**: 在既有 canonical evidence、Thesis 不可变版本/差异/确认和 scheduled run lineage 上建立 owner-scoped review workflow；用户可从新证据检查判断变化并显式确认，刷新可恢复、历史不覆盖、失败不丢状态。
**前置**: AIOS-035 与 AIOS-042 已完成；复用 Thesis/evidence/status events，不新建 workflow runtime、不自动替用户改判断。
**证据**: schema v20/pre-v20 backup；deterministic `COMPUTED_RESULT` review 含 rule/version、old/new、canonical evidence；确认/驳回/失败事件 append-only 且决定幂等；失败 `UPSTREAM_ERROR` 不覆盖 pending。backend 69、frontend 6、Ruff/mypy/TypeScript/build，OpenAPI 119/150 通过。

### [DONE] AIOS-044: 本地可选产品指标

**优先级**: P1
**范围**: 仅在用户显式开启时，本地记录 TTFV、保存、继续和重复研究等产品事件；不保存金融正文、ticker、对象 ID 或凭据，支持用户清除。
**前置**: AIOS-040/041/042/043 已完成；指标不影响业务结果或金融决策。
**证据**: schema v21/pre-v21 backup；默认关闭、owner-scoped、可清除、90 天保留、event/value/time allowlist、未知字段拒绝、best-effort。focused backend 62 + frontend 9；OpenAPI 121/154。Phase 4 backend 479/83.74%、frontend 143、E2E 11，全 Ruff/mypy/TypeScript/build/diff check 通过；fixture 不是真实采用率。

### [DONE] AIOS-050: 自然语言 -> 有限策略 IR

**优先级**: P1
**范围**: 将用户自然语言策略描述解析为版本化、有限、可解释且不可直接执行的策略 IR；只支持现有能力可承载的 allowlist，歧义或未支持条件必须拒绝，不生成 Python/SQL/JavaScript 或任意表达式。
**前置**: AIOS-044 与 Phase 4 退出门禁已完成；复用现有策略实验室、ticker 规范和回测语义，不调用 LLM、不自动运行回测。
**证据**: `strategy-ir/v1` allowlist parser、结构化 invalid、认证 API 与 Strategy Lab 四态完成；backend 13、frontend 6、Ruff/mypy/TypeScript/build、OpenAPI 122/155、当前源码桌面端到端通过。无 LLM、数据库写入、自动回测或真实上游验证；390px 未取得浏览器实机证据。

### [DONE] AIOS-051: IR -> 现有筛选/回测能力

**优先级**: P1
**范围**: 将已验证的 `strategy-ir/v1` 确定性编译为现有 MA crossover 回测可接受的参数草稿，并在 Strategy Lab 中仅经用户显式应用；编译结果可逆、保留完整执行口径，不运行或保存回测。
**前置**: AIOS-050 已完成；复用现有 backtests API、表单与执行语义，不扩展策略语言或回测引擎。
**证据**: `ma-crossover-draft/v1` 仅映射 symbol/窗口/固定执行口径，九项参数待确认；IR/draft 可逆且篡改拒绝。backend 20、frontend 7、Ruff/mypy/TypeScript/build、OpenAPI 123/156 通过；无执行、保存或真实上游验证。

### [DONE] AIOS-052: Thesis 一键创建验证实验

**优先级**: P1
**范围**: 从 owner-scoped Thesis 显式创建可复核的 MA crossover 验证实验草稿，复用 Strategy Lab 与既有策略 IR/编译合同；只带入对象与明确策略参数，不自动运行或保存高成本回测。
**前置**: AIOS-051 已完成；复用 Thesis current view、Strategy Lab query state 和现有 backtests，不新增执行器或数据库表。
**证据**: `thesis-validation-experiment/v1` owner-scoped 动态 intent；ticker-only、11 项待确认、URL 刷新重新鉴权、无自动执行/保存。backend 10、frontend 17、Ruff/mypy/TypeScript/build、OpenAPI 124/157；浏览器无权错误态通过，本地库无 Thesis 且未写用户数据。

### [DONE] AIOS-053: Paper Portfolio 与真实组合严格分离

**优先级**: P1
**范围**: 在当前 owner-scoped portfolio 能力旁建立明确标记的模拟组合账本，记录模拟现金、持仓、成本和估值口径；与真实/用户组合数据表和路由严格分离，不存在账户、订单或交易接口。
**前置**: AIOS-052 已完成；优先复用现有行情、ticker 规范、组合 UI 与 raw SQL/单连接模式，任何 FX 缺口必须保持 UNKNOWN。

**证据**: schema v22/pre-v22 backup；独立 owner-scoped paper tables 与 immutable ledger；幂等/负现金/裸卖空/停用/成本/FX/UNKNOWN 边界。backend focused 23、frontend 5、Ruff/mypy/TypeScript/build、OpenAPI 129/163；隔离临时库浏览器 empty/create/append/valid/refresh、390px 无横溢出和键盘关闭通过。当次浏览器只读行情取得 `tencent` source/as-of；不构成真实账户或成交验证。

### [DONE] AIOS-054: 模拟复盘与 hypothesis outcome

**优先级**: P1
**范围**: 将 owner-scoped Paper Portfolio 的可复现账本/估值快照与已有 typed hypothesis memory 显式关联，保存用户选择的 review outcome；收益只作为 `COMPUTED_RESULT` 输入，不自动证明、否定或改写假设。
**前置**: AIOS-053 已完成；复用 `memory_records.review_outcome`、Paper Portfolio snapshot/valuation 与 Portfolio UI，不新增工作流引擎或第三方依赖。

**证据**: owner/type 隔离、只读草稿、显式 outcome、幂等 replay/conflict、原 hypothesis 不变、UNKNOWN 仅 inconclusive；backend focused 11、frontend 8、OpenAPI 131/166。Phase 5 全量 backend 513/83.94%、frontend 157、E2E 11；隔离浏览器 desktop 保存/刷新/键盘与 390px 无溢出通过。fixture/mock 不是真实上游或因果验证。

## AI Native Research OS Phase 6

### [DONE] AIOS-060: job event log、lease、幂等 key 与恢复语义

**优先级**: P1
**范围**: 在现有单进程 scheduler、`scheduled_research_jobs`/`scheduled_research_runs` 与研究事件上补齐可审计的 claim/heartbeat/terminal event、有限 lease、稳定幂等 key 和重启恢复；不引入外部队列或第二连接。
**前置**: AIOS-054 与 Phase 5 退出门禁已完成；复用现有 raw SQL、单 aiosqlite 连接、run/report lineage 和通知能力。

**证据**: schema v23/pre-v23 backup、owner-scoped immutable events、同事务 lease/status/event；focused 43、Ruff/mypy、OpenAPI 131/166、diff check。独立库 close/reopen 下 completed report 不重复 report/memory，未完成 run 以同 identity 建 attempt+1；仅 fixture 单机恢复验证。

### [DONE] AIOS-061: scheduler load/SLO 基线

**优先级**: P1
**范围**: 用独立 SQLite 与 deterministic no-op/失败 fixture 测量当前单连接 scheduler 的 claim/事件/终态写延迟、批量排队、失败和恢复成本，建立可重复 SLO 基线并核对第 7.2 节架构决策门。
**前置**: AIOS-060 已完成；基准只使用现有 job runtime，不调用真实模型/上游，不调整生产并发或引入外部基础设施。

**证据**: schema v23 临时 SQLite deterministic fixture 三次 PASS；最差 lifecycle P95 4.6498 ms、20-job batch 84.3661 ms、20 stale recovery 8.2897 ms，重复关键写入 0，失败/恢复完整率 100%。focused 3、Ruff/mypy、三次 runner、docs/diff check 通过；full-suite event-loop lock 回归修复后 backend 526/83.94%；未触发第 7.2 节架构决策门，不是真实上游或生产容量验证。

### [DONE] AIOS-064: backup/restore 与 memory/evidence consistency audit

**优先级**: P1
**范围**: 在现有单 SQLite 权威数据层上建立可重复的备份/恢复演练与 owner-scoped memory/evidence 跨表一致性审计，报告悬挂引用、归属错误和不可恢复状态；不引入外部数据库、队列或迁移框架。
**前置**: AIOS-060/061 已完成；AIOS-062/063 的条件式架构决策未触发且不构成本任务依赖。

**证据**: non-overwrite SQLite backup/restore runner 与 logical audit 完成；deterministic schema v23 三份 823,296-byte snapshot fingerprint 一致，restore integrity/logical PASS、issue 0，临时产物送入回收站。focused 5、Ruff/mypy/docs check；Phase 6 backend 526/83.94%、frontend 157、TypeScript/build、E2E 11 全通过；无真实上游或生产灾备验证。

## AI Native Research OS Phase 7

### [DONE] AIOS-070: 私有 share preview，默认不发布

**优先级**: P2
**范围**: 为 owner-scoped Thesis/Strategy 产物生成默认私有、不可公开访问的 share preview；只输出 allowlisted 摘要、来源/时效/许可/质量与免责声明，必须先通过脱敏审计且不触发发布或外部写操作。
**前置**: Phase 6 本地 durable runtime 退出门禁已通过；公开卡片 AIOS-071 的隐私、许可和法律决定仍保持 BLOCKED。

**证据**: `share-preview/v1` 两个 owner-scoped GET、统一 404、固定 private/unpublished/BLOCKED；Thesis metadata-only evidence 与 strategy persisted provenance、脱敏后二次扫描、PARTIAL/UNKNOWN 和无发布动作完成。backend 7、frontend 21、Ruff/mypy/TypeScript/build 通过；隔离 desktop 与 390px Chromium/Escape 验证通过。fixture/mock 不是真实上游、公开发布或法律许可验证。

### [PARKED] AIOS-071: 公开只读 Thesis/Strategy 卡片

**阻塞**: 需要隐私、数据再分发许可、免责声明与法律边界的明确决定；AIOS-070 不提供 URL、token 或发布动作。

### [PARKED] AIOS-072: Remix 并保留 lineage

**阻塞**: 依赖 AIOS-071 公开 Artifact 合规通过；不得绕过公开门禁建立派生主路径。

### [PARKED] AIOS-073: 模板市场/作者身份

**阻塞**: 依赖公开 Artifact、作者身份、滥用治理和合规决定；当前不建设 feed、排行或市场。

## AI Native Research OS Phase 8 - Local OSS v1

### [DONE] AIOS-080: Local OSS v1 产品层级与发布合同重置

**优先级**: P0
**任务卡**: `docs/ai/tasks/AIOS-080.md`
**范围**: 只读核对当前安装、Docker、README、CI、许可和发布事实；把近期目标从公网平台增长改为 GitHub 可开源、本机可安装自用，并将不属于该目标的公开增长任务 PARKED。
**证据**: 已有 Docker local MVP、loopback Compose、PowerShell 启动器和 CI 可复用；README 存在 API/schema 漂移、仅 Windows 启动入口、无 doctor、根目录无 LICENSE，clean-clone/持久化升级尚无发布级证据。`PROJECT_CONTRACT.md` 与长期路线已同步 Local OSS v1 验收标准。

### [DONE] AIOS-081: 跨平台本地启动器与 doctor

**优先级**: P0
**前置**: AIOS-080 已完成。
**范围**: 复用现有 Docker Compose local profile，提供 PowerShell 与 POSIX 的一致命令，并在不启动服务的 doctor 模式中检查 Docker/Compose、配置文件、端口、Compose 解析和关键路径；不得删除 volume、修改现有数据或访问外部服务。
**证据**: PowerShell 5 与 Bash 当前本机 doctor 通过；隔离合同验证缺 env、非法端口、不覆盖、不泄密和预检阻断。parser、`bash -n`、Compose config、ignore 与 diff check 通过；未执行 image build、服务重启或真实上游请求。

### [DONE] AIOS-082: 首次启动与可选能力降级

**前置**: AIOS-081 已完成。
**范围**: 复用当前默认模型、加密凭据和 Dashboard stats，在不探测外部服务的情况下诚实区分本地核心、模型配置与运行时上游状态，并给首次用户明确修复入口。
**证据**: `local-capabilities/v1` 与模型 credential source 完成；backend 8、frontend 5、Ruff/mypy/TypeScript/build、OpenAPI 133/168、diff check 通过。未调用真实模型或行情上游，当前 Docker image 未重建。

### [DONE] AIOS-083: 隔离发布源安装、持久化与恢复演练

**前置**: AIOS-082 已完成。
**范围**: 使用独立 Compose project、loopback 端口和 named volume 构建当前发布源，验证健康、前端、重启持久化、SQLite backup/restore 与旧 schema 升级；当前未提交工作树不得描述成 GitHub clean clone。
**证据**: 隔离 build/start/HTTP/local-only、schema v23/52 表、down/up probe、exclusive-create backup/restore 全通过；迁移/恢复 18、Ruff/contract/parser/Compose config 通过。最新随机 project 已 down、volume 保留，默认 5173 栈 ID/健康未变；不是 clean clone。

### [DONE] AIOS-084: GitHub 开源治理、安全材料与许可决策包

**前置**: AIOS-083 已完成；LICENSE 类型需要维护者作出法律选择，其他材料可先完成。
**范围**: 建立贡献、安全报告、本地隐私、数据来源/再分发边界和可重复仓库审计；准备 LICENSE 决策包但不得代替维护者作出法律选择。
**证据**: governance/privacy/license-boundary pack 与脱敏 audit 完成；审计为 4 BLOCKED/6 WARN。frontend 52 files/164 tests、Ruff/mypy/TypeScript/build、YAML/Markdown links 通过；未创建 LICENSE 或执行 GitHub 写操作。

### [DONE] AIOS-085: Local OSS v1 发布候选门禁

**前置**: AIOS-084 已完成；只生成本地发布证据，不自动推送或创建 GitHub Release。
**证据**: @Satanchen 已授权 Apache-2.0、`Copyright 2026 Satanchen` 与范围受控本地 candidate commit。clean-clone 工程候选 `18bca55a2ba6be5b55d27401afd324d15e61ccff`：backend 535 passed/1 explicit skip、coverage 84.16%、Ruff/mypy；frontend 52/52 files、TypeScript/build、串行 E2E 11/11；双 doctor、readiness BLOCKED=0/WARN=0、YAML 6、Markdown links 11。真实隔离 Compose build/start、local-only/no-key、v23/52、down/up persistence、backup/restore 通过；migration/recovery 18。候选容器已停止并保留证据 volume；最终状态同步候选仍只在本地生成，不 push/release/deploy。

### [DONE] AIOS-086: 可分发 Alpha starter catalogue 与公开源码树

**前置**: AIOS-084 已完成；AIOS-085 的第三方分发阻塞可通过不修改私有开发树的公开导出边界继续收敛。
**范围**: 完整 WQ catalogue 保留为私有开发树的许可未知可选数据；应用缺失该文件时使用项目自有最小 starter catalogue 并明确 PARTIAL。生成独立公开源码树时排除 `reference/`、完整 WQ JSON、用户数据和构建产物，再从导出树真实 Docker build/start；不创建 Git 仓库、不 commit/push/release。
**证据**: backend 18（含缺失/无效 JSON 降级）、frontend 5、Ruff/mypy/TypeScript/build、export contract 通过；项目外 605 文件 snapshot（tree SHA256 `84b944b7bc960ec74e83e68d1d4b2a9ae70dd98936e6385caf36c831c82267a9`）逐文件 SHA256，`reference`/WQ 排除 14,246/2。真实 Docker build/start 返回 starter `FINQUANT_STARTER/PARTIAL/PROJECT_AUTHORED`、8 字段/5 模板/coverage UNKNOWN；local-only/no-key、v23/52、持久化与 backup/restore 通过，证据树/volume 保留。

### [DONE] AIOS-087: Local OSS 公开树测试合同可移植性

**前置**: AIOS-086 已完成；AIOS-085 clean-clone 暴露公开边界与旧测试假设不一致。
**范围**: 只修改 Alpha 与 security 测试，使同一测试套件依据 catalogue metadata 验证私有扩展/公开 starter 双模式，并对公开树刻意不发布的公网 Compose 明确 skip；不改业务代码、Compose、依赖或架构。
**证据**: 私有树 focused 23 passed；公开树 22 passed/1 explicit skip；Ruff 通过。skip 仅覆盖未发布的公网 Compose，local Compose 安全测试继续执行；不是公网 TLS 或 WorldQuant 上游验证。

### [DONE] AIOS-088: 产品运行一致性与信号空状态修复

**前置**: AIOS-087 已完成；2026-08-16 维护者已授权修复运行验收暴露的旧镜像与信号摘要 404。
**范围**: 删除无权威数据来源的 `/api/signals/summary` 前端死调用，以显式 `UNKNOWN` 和个股分析入口替代；Local doctor 对比镜像与构建输入时间；同步当前六组导航和 Dashboard 产品矩阵。不得新增聚合后端、schema、依赖或修改 `reference/`。
**证据**: 删除死请求与伪 mock，跨标的信号保持 UNKNOWN；frontend 52 files/166 tests、backend 536/84.19%（测试进程显式关闭现有 `.env` local-only）、Ruff/mypy/TypeScript/build、E2E 11 通过。doctor 重建前 stale WARN、重建后双 PASS；HTML no-cache/哈希资源 immutable，内置浏览器纯 URL 新标签显示新状态且 console 0，600519 修复路径通过。未改 backend/schema/依赖/`reference/`，未 commit/push/publish。

AIOS-088 已完成，当前无 `[READY]`。AIOS-005 已接受 Native FTS5；其余 `[BLOCKED]` 第三方 PoC/阈值 ADR 与 `[PARKED]` 公网运营任务保持原状态，等待新的维护者决定或触发证据。

## 发布前收尾与长期路线图

### [DONE] BACKLOG-001: 发布前收尾与长期路线图

**任务卡**: `docs/ai/tasks/BACKLOG-001.md`
**证据**: 任务 1-4 已完成：LICENSE 当前事实校准、PRD/PRODUCT_MAP 技术栈引用和两项 legacy color gate 迁移；backend 541/84.25%、Ruff、frontend build、静态门禁与浏览器验证通过。2026-08-24，`@Satanchen` 明确批准保持 Native FTS5，AIOS-005 与 ADR-005 已关闭；公开 Artifact/Remix/模板市场按范围继续 `[PARKED]`。

## UI 优化阶段 — FinQuant Research OS

> 依据 `docs/UI_OPTIMIZATION_PLAN.md`（`[APPROVED]`，2026-08-24）。维护者已确认：① 删除独立页面并入 Research；② 中英文双语切换。执行 agent 按 UI-000 → UI-004 顺序推进，每任务独立验证。

### [BLOCKED] UI-000: Global Shell 与 i18n 双语基础

**优先级**: P0
**任务卡**: `docs/ai/tasks/UI-000.md`
**范围**: 三栏 Shell + 8 组一级导航（Today/Research/Discover/Strategy/Portfolio/Monitor/Library/Settings）+ Global Command Bar 意图识别 + 系统状态降级 + Model Selector 语义层 + 纯前端自建 i18n（zh/en 持久化切换）。删除的独立页面保留旧路由重定向，不 404。

**证据**: Shell、8 导航、旧路由重定向与 zh/en 持久化实现通过；模型管理、MCP 市场、登录、通知中心及活跃共享组件的剩余硬编码文案已进入同一字典。右上角系统状态先显示检查中，仅在 `/api/health` 明确返回 `ok` 后显示 `System OK`，失败时显示状态未知。最新生产构建通过（4,231 modules），全量前端复测 64/64 files、203/203 tests 通过（487.37s），zh/en 各 2,202 keys 且无重复/差异。正确入口 `http://localhost:5173/` 已以 HTTP 200 复验；2026-08-29 最新复验中，固定端口 8000 的 OpenAPI 为 `FinQuant Hub`（134 paths），直连及 5173 代理健康均为 `status=ok` / `db=wal`，八个一级模块抽样的 20/20 个只读代理 API 均返回 HTTP 200，按前端实际消费契约检查的顶层 JSON 结构也为 20/20 通过；八个一级路由、六个旧路由和两个系统工具路由共 16/16 个真实 5173 地址均返回标题 `FinQuant Hub` 的 HTTP 200 HTML，无 Vite error overlay 标记。Browser 截图能力仍被既有 URL policy 错误阻断，Discover、Library/Settings、修正后主链与全部 1440 状态未补拍，最终矩阵未完成，详见任务卡。

### [BLOCKED] UI-001: Research Workspace 重构

**优先级**: P0
**前置**: UI-000 已完成。
**任务卡**: `docs/ai/tasks/UI-001.md`
**范围**: Entity 页头 + 8 tab、Agent 模式（Fast/Analyst/Deep/Review）、Thesis 数据对象化（drift/conviction/evidence）、Evidence 引用系统、Multi-Agent 改 Review、Compare 自然语言化。

**证据**: Fast、Deep Research、Review 与完整 Thesis v2 已在 `/research` 上下文内加载真实能力；Deep 按真实 Agent 状态展示 Plan/Progress/Activity 且未知来源数不伪造为 0，Review 只保留结构化委员会输出。旧能力路由保留原查询参数，Compare 行级 Ask Agent、Entity Watch 和 Entity Evidence → 新 Thesis ticker/claim 预填均已接线；Thesis 列表使用明确的键盘原生“打开”按钮。不可达的旧版 13 章个股页已从 `StockAnalysis` 编译路径移除，当前只保留 Entity Workspace。最新生产构建通过（4,231 modules），全量 64/64 files、203/203 tests 通过（487.37s），zh/en 各 2,202 keys、重复 0、差异 0；Deep ticker、Chat、Discussion、Thesis status 与 Entity search 均已有显式可访问名称。2026-08-29 运行中 OpenAPI 复审确认研究相关路径只有 `/api/research` 创建/读取/导出、Swarm start 及 Scheduled Research Run，没有 pause/resume/change-scope 端点；修正后 Entity/Deep/Review/Compare/Thesis 与全部 1440 状态仍需重拍，故继续 `[BLOCKED]`，详见任务卡。

### [BLOCKED] UI-002: Monitor 一级化与 Today 重做

**优先级**: P1
**前置**: UI-000 已完成。
**任务卡**: `docs/ai/tasks/UI-002.md`
**范围**: Monitor 一级模块（10 种类型 + MonitorCard）+ Today 重做（处理队列 → My Universe → 市场脉搏 → Research Runs），系统状态退出首屏。

**证据**: Today/Monitor 可见组件共享 i18n 静态扫描为 0；Today 与 Monitor 的窄屏历史 PNG 已逐张复核；Today 个性化上下文卡片溢出已修复，近期会话/讨论条目已改为原生链接，Monitor 类型条只在自身容器滚动。单规则 `Run now` 复用既有 indicators 分析合同，立即检查真实行情/信号并刷新触发记录。最新生产构建 4,231 modules、全量 64/64 files/203/203 tests 通过（487.37s）。剩余精确 390/1440 截图门禁未完成，详见任务卡。

### [BLOCKED] UI-003: Strategy / Discover / Portfolio 归位

**优先级**: P1
**前置**: UI-000、UI-001 已完成。
**任务卡**: `docs/ai/tasks/UI-003.md`
**范围**: Strategy Lab 自然语言优先 + 结果视图、Discover 合并选股器与 Alpha、Portfolio P&L 首页 + Portfolio↔Research 双向连接。

**证据**: Strategy、Discover、Portfolio 可见组件共享 i18n 静态扫描为 0；Discover 四个 Filter Chips 可选/可取消且只预填，Global Command Bar 的 `query` 参数现由 Discover 实际读取；Strategy 六个结果 Tabs 切换对应内容；Portfolio 与全局 Thesis 动作会携带 ticker/new 上下文。最新生产构建 4,231 modules、全量 64/64 files/203/203 tests 通过（487.37s）。Strategy/Portfolio 的窄屏历史 PNG 已逐张复核；Discover 重拍和精确 390/1440 截图门禁仍未完成，详见任务卡。

### [BLOCKED] UI-004: 视觉 Token 收敛与反 slop 审计

**优先级**: P2
**前置**: UI-000 ~ UI-003 已完成。
**任务卡**: `docs/ai/tasks/UI-004.md`
**范围**: `--fq-*` tokens 全站收敛（radius/shadow/spacing）、行情与系统状态颜色分离、13 个第一等组件落地、taste-skill 反 slop 审计清单全过。

**证据**: 最新生产构建通过（4,231 modules）；`scripts/ui-contrast-audit.py` 对 light/dark 的文本、语义色、focus、evidence/status chip 共 58 组 token 组合复测 58/58 通过，最低 4.50:1；全量前端复测 64/64 files、203/203 tests 通过（487.37s），`git diff --check` 通过。13/13 组件齐全，radius 统一为 6/8px（仅语义胶囊保留 999px），soft shadow 为 none，`100vh`/`h-screen`、纯黑与 token 定义外硬编码色值均为 0。zh/en 各 2,202 keys、重复 0、差异 0；活跃导入图覆盖 130 个文件，可见表单控件无显式可访问名称缺口由 9 降为 0；RoleAvatar 与 Settings Agent 占位均已移除 emoji，活跃页面眉题、语言切换和图表加载态已进入字典；不可达的旧版 StockAnalysis 已移出编译路径。当前视觉证据仍非修正后的完整矩阵；Discover、Library/Settings、全部 1440 与完整渲染态 WCAG 仍因 Browser URL policy 未完成。
