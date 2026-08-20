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
