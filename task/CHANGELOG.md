# Changelog

> Codex 每次开发后将改动记录在此。格式见 CLAUDE.md → Change record convention。
> 只记架构级变更（新增路由/服务/表/端点），纯重构不记。

## 2026-07-28

- **Architecture: 完整架构文档体系建立**
  - What: 分析 6 个参考项目 + 自身代码库，产出 ARCHITECTURE.md / API_CONTRACT.md / ARCHITECTURE_ANALYSIS.json
  - Why: 项目缺少统一的架构视图，文档散落在 PRD / HANDOVER 中
  - Docs: docs/ARCHITECTURE.md, docs/API_CONTRACT.md, docs/ARCHITECTURE_ANALYSIS.json

- **Tech debt: ticker 三路径统一**
  - What: resolve_ticker() 改为委托 normalize_code()，去掉重复解析逻辑
  - Files: backend/app/services/analysis/ticker.py

- **Tech debt: 建表路径合并**
  - What: backtest.py 移除内联 CREATE TABLE backtest_runs；portfolio.py 移除独立 ensure_tables()
  - Files: backend/app/routers/backtest.py, backend/app/services/portfolio.py, backend/app/database.py

- **Harness: CLAUDE.md 重构**
  - What: 新增架构不变量/服务层规则/路由地图/技术债务/文档同步规则
  - Files: CLAUDE.md, README.md

- **Memory: 4 个记忆文件建立**
  - What: 架构分析 / 技术债务路线图 / 参考项目影响 / 架构不变量
  - Files: memory/*.md, memory/MEMORY.md

## 2026-07-28 (doc-sync 桥接层)

- **桥接: .github/copilot-instructions.md 建立**
  - What: 创建 Codex 可读的项目规则文件，包含 doc-sync 规则、架构不变量、代码风格
  - Why: Codex 不读 CLAUDE.md 和 hooks，需要在它自己的指令体系里写规则
  - Risk: low

- **审计: 修复另一个对话 review 发现**
  - What: HANDOVER.md 追加 portfolio.py 死代码记录 + 延迟导入注释需求
  - Why: review 发现 _tencent_code() / _parse_tencent_map() 已无人调用
  - Files: docs/HANDOVER.md
  - Risk: low（只改文档，不改代码）

## 2026-07-28 (harness 工程化)

- **约束层: PostToolUse hook 搭建**
  - What: 编辑后自动 ruff lint 后端代码 + 前端构建检查
  - Why: agent 写完代码不再自查，hook 替代人工 review 第一批问题
  - Files: .claude/hooks/post-tool-use.ps1, .claude/settings.json

- **约束层: PreCommit hook 搭建**
  - What: 提交前自动跑完整测试套件，失败则阻止提交
  - Why: 确保没有破坏已有功能就提交
  - Files: .claude/hooks/pre-commit.ps1, .claude/settings.json

- **指令层: CLAUDE.md 精简至 99 行**
  - What: 路由器地图 → docs/ROUTER_MAP.md，数据源 → docs/DATA_SOURCES.md
  - Why: 100 行原则——超出部分下沉 docs/，让核心信息不被稀释
  - Files: CLAUDE.md, docs/ROUTER_MAP.md, docs/DATA_SOURCES.md

- **基础设施: ruff lint 配置 + 代码清理**
  - What: pyproject.toml 配置 ruff (F/W/E 类检查); 修复 17+5 个 F 类问题（未引用导入/变量/正则）
  - Why: 为 PostToolUse hook 提供干净基线
  - Risk: low（仅清理死代码，无行为变更）

## 2026-07-28 (P1 测试覆盖)

- **Test: 回测引擎统一测试（Codex）**
  - What: test_backtest_engine.py 8 用例覆盖 3 策略 + 边界
  - Files: backend/tests/test_backtest_engine.py

- **Test: Analysis scoring 测试（Codex）**
  - What: test_scoring.py 4 用例覆盖 trend/momentum/volume/composite
  - Files: backend/tests/test_scoring.py

- **Test: ToolRegistry 测试（Codex）**
  - What: test_tool_registry.py 3 用例覆盖单例/注册/格式
  - Files: backend/tests/test_tool_registry.py

- **Test: Signal 边界测试（Codex）**
  - What: test_signals.py 追加 4 用例（金叉/突破/背离/放量）
  - Files: backend/tests/test_signals.py

- **全量测试从 65 → 84 passed，HANDOVER.md 同步更新**

## 2026-07-28 (下一阶段: 6 项目统一)

- **规划: UNIFICATION_PLAN.md 制定**
  - What: 6 个参考项目吸收计划，按 P0-P3 优先级排列
  - Files: docs/ai/UNIFICATION_PLAN.md

- **执行: TASK-006 BigDataView 大屏仪表盘（通过 Codex 插件下发）**
  - What: Codex 通过 node_repl MCP 写入 Dashboard.tsx + app.css，新增深色金融大屏 KPI 网格
  - How: 使用 codex-companion.mjs task --write 远程调用，因 Windows 沙箱限制只能 node_repl MCP
  - Verify: bun run build ✓ built

- **验证: 本地前后端服务启动测试**
  - Backend /api/health → 200 ✅
  - Frontend localhost:5173 → 200 ✅

- **验证: TASK-001~005 全部已实现**
  - TASK-001: 前端 `React.lazy()` + `manualChunks` 已存在 ✅
  - TASK-002: 4 个 SSE 端点均有 try/except/finally + aclose ✅
  - TASK-003: calc_pnl() 支持多市场，test_pnl_with_hk_ticker() 已覆盖 ✅
  - TASK-004: search_alpha("") 返回全部字段 ✅
  - TASK-005: resolve_ticker() 委托 normalize_code()，无重复逻辑 ✅

- **最终验收: 101 passed / ruff 0 / frontend build 0 errors**
- **归档: docs/ai/EXEC_PLAN.md 全部标记完成**

## 2026-07-29 (6 项目统一完成)

- **执行: TASK-006 BigDataView 大屏仪表盘**
  - Codex 通过 node_repl MCP 修改 Dashboard.tsx + app.css → 深色 KPI 网格
- **执行: TASK-007 report_audit 工具吸收**
  - Codex 新建 backend/app/tools/report_audit.py 371 行
- **执行: TASK-009 report_audit 单元测试**
  - Codex 新建 6 测试 + 1 断言修正
- **执行: TASK-010 Chat 集成回测按钮**
  - Codex 修改 Chat.tsx + 新建 BacktestResultCard.tsx（含权益曲线）
- **执行: TASK-011 定时调度器**
  - Codex 新建 scheduler.py 72 行 + 修改 main.py lifespan
- **执行: TASK-012 主题切换图标**
  - Codex 修改 App.tsx → actionsRender 添加 Sun/Moon 圆形按钮
- **执行: TASK-013 移除设置页外观**
  - Codex 删除 Settings.tsx 中外观选项卡

**最终验收: 110 passed / ruff 0 / bun run build ✓**
**6 项目统一完成**: BigDataView / ai-berkshire / Vibe-Trading / daily_stock_analysis / wq-alpha-research / stock-analyzer

## 2026-08-01
- What changed: completed `docs/ai/LONG_TERM_GOAL.md` Phase 9.0-9.4 across backend, frontend, tests, and architecture/API/data-source docs.
- Why: close the verified gap-analysis sequence from exception/SSE containment through report, market, backtest, and tool-chain capabilities.
- Docs updated: `docs/API_CONTRACT.md`, `docs/ARCHITECTURE.md`, `docs/DATA_SOURCES.md`, `docs/ROUTER_MAP.md`, `docs/ai/LONG_TERM_GOAL.md`, `docs/ai/TRADING_CONNECTOR_ASSESSMENT.md`, `CLAUDE.md`.
- Risk: medium; real-money and login capabilities remain explicitly unimplemented.

## 2026-08-06
- What changed: completed TASK-026 real two-user E2E; enforced authentication at the shared business-router registration point, preserved Host through the Vite proxy for CSRF, repaired browser auth/KPI coverage, and removed duplicate thesis keys/auth-loading warnings.
- Why: prove the TASK-021–025 authentication migration works as a real multi-user system and close regressions found only through browser/HTTP validation.
- Docs updated: `docs/ai/E2E_VALIDATION.md`, `docs/HANDOVER.md`, `task/CHANGELOG.md`.
- Verification: 369 backend tests / 83.45%, Ruff, mypy, 30 frontend tests, Playwright 1/1, frontend build, and bidirectional owner isolation passed.
- Risk: high security surface, mitigated by centralized authentication and explicit cross-owner 404 regression coverage.

## 2026-08-08
- What changed: added an all-Docker localhost profile and explicit development-only single-owner mode with no email-code, session, login, or logout flow.
- Why: support the personal local MVP without a cloud host while retaining production authentication and all `user_id` ownership constraints.
- Files: `docker-compose.local.yml`, `docker/nginx.local.conf`, `scripts/local.ps1`, backend auth/config/lifespan, frontend auth shell, tests, and architecture/handover docs.
- Risk: an authentication bypass is security-sensitive; production rejects the flag and the local frontend port is bound to `127.0.0.1` only.

- What changed: expanded the dashboard into a five-view A-share market radar backed by `/api/market/pulse`: breadth, daily movers, industry/concept strength, sector/stock order-flow ranks, weekly movers enriched with Tonghuashun funds, and popularity.
- Evidence policy: every section keeps source status; Tonghuashun batch coverage and failures are explicit, raw fund values retain the provider's `wan_cny` unit, and unavailable dimensions are never filled with estimates.
- Scope boundary: this reproduces the reference monitor's public dimensions, not either platform's paid, private, login-only, or complete internal dataset.
- What changed: added keyword-driven theme classification over the complete EastMoney board catalog, with built-in related-term groups for robots, compute infrastructure, power/grid, and semiconductors; matching boards expose constituents, four ranking modes, deduplicated candidates, and bounded Tonghuashun fund enrichment.

## 2026-08-23
- What changed: completed BACKLOG-001 tasks 1-4 and prepared the blocked AIOS-005 provider ADR; added TECH_STACK references and migrated the explicit `#dce5ef`/`#1890ff` gates to existing `--fq-*` tokens.
- Why: close runnable Local OSS v1 release cleanup while keeping Graphiti/Mem0 and public-operation work behind their existing approval gates.
- Docs updated: `docs/PRD.md`, `docs/PRODUCT_MAP.md`, `docs/ai/AI_NATIVE_RESEARCH_OS_PLAN.md`, `docs/ai/EXEC_PLAN.md`, `docs/ai/decisions/ADR-005-memory-provider.md`, and task evidence.
- Verification: backend 541 passed / 84.25% with `LOCAL_ONLY_MODE=false`, Ruff passed, frontend production build passed, static color/link gates passed, and localhost browser smoke check passed.
- Risk: low; no backend/schema/dependency changes, and third-party providers remain uninstalled and blocked.
- Follow-up evidence: package metadata is now reachable through the mandated `127.0.0.1:7897` proxy (`graphiti-core 0.29.3`, `mem0ai 2.0.18`), but both imports remain absent; AIOS-004 rerun kept both candidates `NOT_RUN`, with focused 2 passed and Ruff clean.

## 2026-08-24
- What changed: completed the eight-route visible zh/en migration for Today, Research, Strategy, Portfolio, Monitor, evidence/provenance surfaces, and converged remaining explicit radii to the 6-8px token system.
- Why: finish the code, i18n, and anti-slop portions of UI-000 through UI-004 without changing backend contracts or fabricating unavailable financial data.
- Docs updated: `docs/ai/EXEC_PLAN.md`, `docs/ai/tasks/UI-000.md` through `UI-004.md`, `HANDOFF.md` via handoff log.
- Risk: medium; production build and full frontend 60 files / 180 tests pass, translation dictionaries are 1,596/1,596 with zero duplicates/diff, while the required screenshot matrix remains policy-blocked.

- What changed: recorded maintainer approval of Native FTS5, accepted ADR-005, and closed AIOS-005 and BACKLOG-001 while leaving AIOS-004/034 as optional blocked PoCs and Batch 3 parked.
- Why: finalize the Local OSS v1 memory-provider decision without adding unverified third-party dependencies or infrastructure.
- Docs updated: `docs/ai/decisions/ADR-005-memory-provider.md`, `docs/ai/tasks/AIOS-005.md`, `docs/ai/tasks/BACKLOG-001.md`, `docs/ai/AI_NATIVE_RESEARCH_OS_PLAN.md`, `docs/ai/EXEC_PLAN.md`, and `task/CHANGELOG.md`.
- Verification: maintainer explicitly approved “保持 Native FTS5”; status counts and cross-document task states were synchronized; no code, schema, dependency, or production-data changes.
- Risk: low; this is a documentation and decision-state closure only.
- What changed: recorded the current Agent Extension Plane status and future compatibility direction for Skills, plugin Agents, MCP, and external Agent ecosystems.
- Why: preserve the distinction between the existing extensible Agent kernel and a future marketplace-grade plugin platform.
- Docs updated: `docs/ai/AGENT_EXTENSION_STATUS.md`, `docs/ai/DECISIONS.md`, and `task/CHANGELOG.md`.
- Verification: documentation-only update; no backend, schema, dependency, or runtime changes.
- Risk: low; the extension platform remains pending and no third-party plugin code was installed or executed.

## 2026-08-24
- What changed: implemented the UI-000–UI-003 Research OS shell, entity research, Monitor/Today, Strategy/Discover/Portfolio workspaces, and the safe UI-004 token/anti-slop subset across frontend routes, components, styles, i18n, and tests.
- Why: execute the approved FinQuant Hub UI optimization chain while preserving real-data provenance, `UNKNOWN` gaps, old-route compatibility, and backend boundaries.
- Docs updated: `docs/UI_OPTIMIZATION_PLAN.md`, `docs/ai/EXEC_PLAN.md`, and `docs/ai/tasks/UI-000.md` through `UI-004.md`.
- Risk: medium; production build and 44 targeted UI tests pass, but the required screenshot matrix is blocked by browser URL policy and 432 legacy hardcoded-color lines remain for a separate audited migration.

## 2026-08-24
- What changed: removed unused legacy dashboard CSS, migrated all active CSS and TS/TSX color literals to semantic `--fq-*` tokens, added a canvas-safe runtime token resolver, and moved the Research, Today, and Library primary surfaces toward shared `t(key)` copy.
- Why: continue UI-004 design-system convergence without changing backend behavior or fabricating financial data.
- Docs updated: `docs/UI_OPTIMIZATION_PLAN.md`, `docs/ai/EXEC_PLAN.md`, and `docs/ai/tasks/UI-004.md`.
- Risk: medium; production build passes and focused UI suites pass, while remaining full-site i18n and the policy-blocked screenshot matrix keep UI-004 blocked.

## 2026-08-24
- What changed: refreshed UI-000 through UI-004 blocker evidence after revalidating the current local server and built-in browser runtime.
- Why: distinguish the resolved URL-policy condition from the current webview-attachment failure and avoid claiming unobserved visual/WCAG proof.
- Docs updated: `docs/ai/EXEC_PLAN.md`, `docs/ai/tasks/UI-000.md` through `UI-004.md`, and `task/CHANGELOG.md`.
- Verification: `127.0.0.1:5173` returned HTTP 200 from the expected Node dev server; the built-in browser was discoverable, but two fresh local tabs timed out before webview attachment. No code, backend, schema, dependency, auth, or screenshot files changed.
- Risk: low; documentation-only evidence correction, with all five UI stages intentionally remaining `[BLOCKED]` on the visual matrix.

## 2026-08-24
- What changed: corrected the service occupying port 5173, started FinQuant Hub with its existing local-only authentication contract, accepted two stable desktop/light/zh screenshots, converted them to actual PNG encoding, and recycled four loading-state captures.
- Why: advance the UI visual gate with evidence that was actually rendered and inspected while rejecting spinner-only or mislabeled image artifacts.
- Docs updated: `docs/ai/EXEC_PLAN.md`, `docs/ai/tasks/UI-000.md` through `UI-004.md`, `task/CHANGELOG.md`, and `HANDOFF.md` via handoff log.
- Verification: Today and Discover screenshots were opened and inspected; both show the real FinQuant three-column shell without a Vite overlay or loading spinner. Research, Strategy, Portfolio, and Monitor captures were rejected and sent to the recycle bin. The remaining matrix and rendered WCAG checks were stopped by Browser URL policy.
- Risk: low; no product code, backend code, schema, authentication contract, dependency, commit, push, publish, or deploy change.

## 2026-08-24
- What changed: tightened nine light-theme semantic color tokens and added a standard-library contrast audit for light/dark text, semantic states, focus, evidence chips, and status chips.
- Why: close the deterministic UI-004 token-level contrast gap without changing component behavior, data binding, backend contracts, or dependencies.
- Docs updated: `docs/ai/EXEC_PLAN.md`, `docs/ai/tasks/UI-000.md` through `UI-004.md`, `task/CHANGELOG.md`, and `HANDOFF.md` via handoff log.
- Verification: contrast audit 58/58 passed with a 4.50:1 minimum; script Ruff and production build passed. The full frontend rerun was load-sensitive at 55/60 files and 175/180 tests, while the exact five-file failure set passed independently at 5/5 files and 28/28 tests. `git diff --check` reported no errors.
- Risk: low; the two accepted screenshots predate the token fix and are only partial evidence. The final 64-state screenshot matrix and rendered WCAG regression remain blocked by Browser URL policy; no commit, push, publish, or deploy was performed.

## 2026-08-25
- What changed: restored the local FinQuant frontend/backend preview and replaced the prior load-sensitive aggregate test result with a clean exact full-suite rerun.
- Why: keep the user-visible preview available on the mandated port and close the explicit `bun run test` gate before final visual acceptance.
- Docs updated: `docs/ai/EXEC_PLAN.md`, `docs/ai/tasks/UI-000.md` through `UI-004.md`, `task/CHANGELOG.md`, and `HANDOFF.md` via handoff log.
- Verification: frontend HTTP 200 with title `FinQuant Hub`; backend health `ok` with SQLite WAL; exact `bun run test` passed 60/60 files and 180/180 tests in 476.64s while both preview servers remained online.
- Risk: low; the Browser URL policy still blocks agent-side localhost capture, so post-fix visual evidence remains incomplete. No commit, push, publish, or deploy was performed.

- What changed: fixed four browser-observed 390px defects (Today grid min-content overflow, Research long-link overflow, Portfolio table containment, and mobile Agent Rail default state) and accepted 24 current mobile screenshots across six primary routes, both themes, and both languages.
- Why: advance the hard UI-000/UI-004 visual gate using only stable current-run browser evidence and reject loading, overlay, stale-theme, or horizontally overflowing states.
- Docs updated: `docs/ai/EXEC_PLAN.md`, `docs/ai/tasks/UI-000.md` through `UI-004.md`, `task/CHANGELOG.md`, and `HANDOFF.md` via handoff log.
- Verification: production build passed with 4,219 modules; single-worker full Vitest passed 60/60 files and 180/180 tests in 766.94s; all six accepted 390px routes satisfy `scrollWidth <= innerWidth`, show no Vite overlay, and produced no console error. Frontend preview was restored on port 5173 after the test run.
- Risk: low; Library/Settings, all 1440 states, keyboard/focus, and the complete rendered WCAG matrix remain Browser-policy blocked. No backend/schema/auth/dependency/reference change and no commit, push, publish, or deploy.

- What changed: completed a requirement-by-requirement UI-000–UI-004 code audit; migrated Entity/Thesis/Evidence/Review/Compare chrome to shared i18n, made Discover Filter Chips selectable without auto-running, made Strategy result Tabs switch real panels, replaced RoleAvatar emoji placeholders with existing icons, and disabled unbound AgentRun actions.
- Why: close code-side acceptance gaps without fabricating unavailable financial data or pretending unsupported Pause/Change scope and Run now contracts exist.
- Docs updated: `docs/UI_OPTIMIZATION_PLAN.md`, `docs/ai/EXEC_PLAN.md`, `docs/ai/tasks/UI-000.md` through `UI-004.md`, `task/CHANGELOG.md`, and `HANDOFF.md` via handoff log.
- Verification: production build passed with 4,219 modules; focused Research/Compare/Discover/Strategy tests passed; final single-worker suite passed 60/60 files and 183/183 tests in 725.40s; zh/en dictionaries are 1,728/1,728 with zero duplicates or parity differences; frontend and backend HTTP are 200.
- Risk: low; Discover's four earlier 390 screenshots are now historical because the visible chips changed, leaving 20 current mobile screenshots. Browser visual/WCAG gates and unsupported backend action contracts remain explicit blockers. No backend/schema/auth/dependency/reference change and no commit, push, publish, or deploy.

- What changed: wired the Monitor card `Run now` action to the existing per-ticker indicators analysis flow, refreshed trigger history after completion, added bilingual feedback/loading state, and covered the interaction in Alerts and Monitor card tests.
- Why: complete the UI-002 single-rule immediate-check interaction without adding a backend contract or fabricating monitor results.
- Docs updated: `docs/UI_OPTIMIZATION_PLAN.md`, `docs/ai/EXEC_PLAN.md`, `docs/ai/tasks/UI-002.md`.
- Verification: production build passed with 4,219 modules; focused Vitest passed 2/2 files and 8/8 tests; zh/en dictionaries are 1,729/1,729 with zero duplicates or parity differences. Two default single-worker full-suite runs each ended at 59/60 files and 183/184 tests with a different unchanged test timing out at 5 seconds; `AlphaTemplateCatalog` then passed 1/1 alone and `PortfolioRiskWorkbench` passed 8/8 alone. The aggregate gate is recorded as load-sensitive, not passed.
- Risk: low; enabled rules for the selected ticker are evaluated from real market data through the existing analysis endpoint, while disabled rules remain non-runnable.

- What changed: replaced Research mode placeholders with the existing Fast, Deep Research, Review, and Thesis v2 capabilities; preserved legacy-route query parameters; wired Compare Ask Agent and Entity Watch; disabled unbound Add to Thesis; and migrated Chat, Deep, Review, Thesis, and Agent status copy to shared zh/en dictionaries.
- Why: complete the code-side Research Workspace chain without adding backend contracts, dependencies, fabricated data, or visual-only controls that appear functional.
- Docs updated: `docs/UI_OPTIMIZATION_PLAN.md`, `docs/ai/EXEC_PLAN.md`, `docs/ai/tasks/UI-001.md`, `task/CHANGELOG.md`, and `HANDOFF.md` via handoff log.
- Verification: production build passed with 4,232 modules; related suites passed 19/19 and 26/26 tests; final full Vitest passed 61/61 files and 189/189 tests in 417.14s; zh/en dictionaries are 2,001/2,001 with zero duplicates or parity differences; `git diff --check` passed after one trailing-space correction.
- Risk: medium; Research/Entity/Deep/Review/Compare/Thesis visible states changed and need a new screenshot/WCAG matrix. Deep Pause/Change scope still lacks a backend contract, so UI-001 remains `[BLOCKED]`. No backend/schema/auth/dependency/reference change and no commit, push, publish, or deploy.

- What changed: completed a second UI-000–UI-004 completion audit; added real Deep Research plan/progress/activity, removed the Review chat timeline, wired Entity evidence into a prefilled Thesis, consumed Discover command queries, preserved ticker context for Portfolio/Thesis actions, and migrated remaining active system/shared UI copy to the common zh/en dictionary.
- Why: close concrete full-chain interaction and bilingual gaps discovered after the first implementation audit while preserving honest `UNKNOWN` states and existing backend contracts.
- Docs updated: `docs/UI_OPTIMIZATION_PLAN.md`, `docs/ai/EXEC_PLAN.md`, `docs/ai/tasks/UI-000.md` through `UI-004.md`, `task/CHANGELOG.md`, and `HANDOFF.md` via handoff log.
- Verification: production build passed with 4,233 modules; full Vitest passed 64/64 files and 201/201 tests in 437.15s; zh/en dictionaries are 2,176/2,176 with zero duplicates or parity differences; token contrast passed 58/58 with a 4.50:1 minimum; `git diff --check` passed. Frontend `http://localhost:5173/` returned HTTP 200 with title `FinQuant Hub`, and backend health returned `status=ok`, `db=wal`.
- Risk: medium; current-run screenshot comparison and rendered keyboard/focus/WCAG evidence remain blocked by the existing Browser URL-policy failure, and Deep Pause/Change scope still has no backend contract. No backend/schema/auth/dependency/reference change and no commit, push, publish, or deploy.

- What changed: replaced mouse-only Today recent-context rows with native links, added an explicit Thesis-list open action, and moved the Today eyebrow plus action labels into shared zh/en resources.
- Why: close code-level keyboard and bilingual gaps found during the final UI-000–UI-004 accessibility audit.
- Docs updated: `docs/UI_OPTIMIZATION_PLAN.md`, `docs/ai/EXEC_PLAN.md`, `docs/ai/tasks/UI-000.md` through `UI-004.md`, `task/CHANGELOG.md`, and `HANDOFF.md` via handoff log.
- Verification: production build passed with 4,233 modules; focused tests passed 2/2 files and 15/15 tests; full Vitest passed 64/64 files and 201/201 tests in 385.29s; zh/en dictionaries are 2,178/2,178 with no duplicate/parity differences; contrast passed 58/58 with a 4.50:1 minimum; non-native clickable-list scan returned zero findings.
- Risk: low; the full current screenshot/rendered WCAG matrix and Deep Pause/Change scope remain blocked. No backend/schema/auth/dependency/reference change and no commit, push, publish, or deploy.
- Runtime correction: FinQuant Hub was restored on port 8000 only temporarily. The fixed port was subsequently reclaimed by the unrelated `src.api.app:app --reload` service; the latest read-only check returns OpenAPI title `海之子 · 工地安全风险 AI 识别系统 API` and health models `minimax-m3` / `glm-5.3`, so no current FinQuant backend-health claim is made.
- Runtime recovery after recheck: the unrelated listener later exited and port 8000 became free. Started the project backend with `backend/.venv` on `127.0.0.1:8000`; OpenAPI now identifies `FinQuant Hub` with 134 paths, and both direct and Vite-proxied health checks return `status=ok`, `db=wal`. Frontend 5173 remains HTTP 200 with title `FinQuant Hub`.
- Runtime full-chain smoke: exercised 20 representative read-only endpoints through the live 5173 Vite proxy across Today (4), Research (3), Discover (2), Strategy (1), Portfolio (2), Monitor (3), Library (1), and Settings (4); all 20 returned HTTP 200. No records were created or mutated.
- Runtime route smoke: requested all eight primary routes, six merged legacy routes, and two system-tool routes from the live 5173 server; 16/16 returned HTTP 200 HTML with title `FinQuant Hub`, no Vite error-overlay marker, and no route returned 404.
- Runtime response-contract smoke: parsed the same 20 representative API responses and asserted the top-level arrays, totals, metadata, source/as-of fields, settings objects, and product-metric objects consumed by the current frontend; 20/20 shape checks passed with no data mutation.
- Follow-up evidence: re-audited the live OpenAPI document plus backend routers/services and frontend callers. Research exposes create/read/export, Swarm start, and scheduled-run history/run operations, but no pause/resume/change-scope contract; the existing disabled controls remain the only honest UI state within the frontend-only scope.

## 2026-08-29
- What changed: replaced the always-green shell health claim with a real `/api/health`-backed checking/ok/unavailable indicator; localized remaining active shell, page-eyebrow, loading, language-switcher, portfolio and evidence copy; and removed the unreachable pre-Research-OS 13-chapter `StockAnalysis` implementation from the compile path.
- Why: close the final code-audit gaps without inventing health, market, source or portfolio data, and remove an inaccessible legacy surface that still carried mouse-only and hardcoded copy.
- Docs updated: `docs/UI_OPTIMIZATION_PLAN.md`, `docs/ai/EXEC_PLAN.md`, `docs/ai/tasks/UI-000.md` through `UI-004.md`, `task/CHANGELOG.md`, and `HANDOFF.md` via handoff log.
- Verification: production build passed with 4,231 modules; `StockAnalysis` chunk reduced from 196.67 kB / 63.07 kB gzip to 179.87 kB / 57.32 kB gzip; full Vitest passed 64/64 files and 203/203 tests in 487.37s; zh/en dictionaries are 2,202/2,202 with zero duplicates/parity differences; contrast passed 58/58 with a 4.50:1 minimum; active import-graph scan covered 130 files with zero non-native clickables and zero visible form controls lacking an explicit accessible name; `git diff --check` passed; frontend returned HTTP 200. The latest fixed-port check found an unrelated API on 8000, so current FinQuant backend health remains unverified. The 24 final-labelled narrow captures are real PNGs, but 23 encode at 375×812 and one at 390×844, so they are retained only as historical reference rather than claimed as a complete exact-390 matrix.
- Completion audit: re-read the full-chain goal and UI-000 through UI-004 cards against the current tree. All 13 required first-class components exist and have active consumers; eight navigation groups, legacy redirects, bilingual persistence, command routing, Entity/Research/Monitor/Today/Strategy/Discover/Portfolio structures, token/static accessibility gates, and existing regression gates have direct code or test evidence. The remaining acceptance requirements are the current-run screenshot/rendered-WCAG matrix and Deep Research Pause/Change scope; neither has an in-scope executable path while Browser capture is policy-blocked and the backend contract is absent.
- Risk: low; the full current screenshot/rendered WCAG matrix and Deep Pause/Change scope remain blocked. No backend/schema/auth/dependency/reference change and no commit, push, publish, or deploy.
