# Changelog

> Codex 每次开发后将改动记录在此。格式见 CLAUDE.md → Change record convention。
> 只记架构级变更（新增路由/服务/表/端点），纯重构不记。

## 2026-08-30
- **Fix: PortfolioWhy 负数货币格式（¥-10.00 → -¥10.00）**
  - What: `frontend/src/components/PortfolioWhy.tsx` 新增 `formatMoney`（符号在 ¥ 前，负数为 `-¥10.00`，正数 contribution 列保留 `+¥20.00`、marketValue 列无符号）与 `formatPercent`；更新 `frontend/tests/PortfolioWhy.test.tsx` 断言
  - Why: BACKLOG-007 记录的业务表现——负贡献显示为 `¥-10.00` 不符合中文财务惯例（符号应在前）
  - Docs: `task/CHANGELOG.md`
  - Verification: PortfolioWhy 测试 2/2；`bun run build` 通过；全量 Vitest 无回归
  - Risk: low（纯展示格式，无数据/逻辑改动）

## 2026-08-30
- **Test: BACKLOG-005 Chat/Discussion SSE 与系统页 E2E 扩面**
  - What: 新增 `frontend/e2e/helpers.ts` 统一确定性 API/SSE mock；新增 `chat-paths.spec.ts` 6 条、`discussion-paths.spec.ts` 5 条、`system-pages.spec.ts` 8 条，覆盖 Chat/Discussion 空态、创建、SSE done/error、旧路由，以及 knowledge/models/mcp-market/alerts/settings/compare/thesis/analysis 的渲染和关键交互
  - Why: 消除核心 AI 流式交互与系统/知识页的 E2E 空白，所有 `/api/**` 均 mock，防止测试依赖真实网络或本地数据
  - Docs: `docs/ai/tasks/BACKLOG-005.md`、`docs/ai/EXEC_PLAN.md`、`task/CHANGELOG.md`
  - Verification: 新增 spec 19 passed（14.1s）；完整 Playwright 35 passed（33.4s）；Vitest 63 files / 198 tests passed（509.23s）；OpenAPI 59 schemas freshness、TypeScript、Vite build（4,237 modules）与 diff/白名单检查通过
  - Risk: low（纯 E2E 与文档；Discussion 不渲染 token/轮次/agent_end 时间线的业务缺口仅记录，未改 `frontend/src`；未 commit）

- **Fix: 补齐 socksio 依赖 + 修正 LLM/News 代理端口（7890→7897）**
  - What: `backend/requirements.txt` 增加 `socksio>=1.0`（httpx[socks] 的 socks5 协议依赖，Yahoo 客户端 `trust_env=True` 在开代理时走 socks5 需要它）；`backend/.env`（gitignored）`LLM_PROXY_URL`/`NEWS_PROXY_URL` 从死端口 7890 改为真实代理 7897（AGENTS.md 约定端口），已验证 DeepSeek 经 7897 真实连通
  - Why: ①socksio 缺失导致开代理状态下 3 个真实网络测试失败（ImportError: socksio not installed）②. env 的 7890 是死端口（无监听），开代理时 LLM/News 代理实际走不通
  - Docs: `task/CHANGELOG.md`
  - Verification: 完整后端套件 551 passed / 0 failed（此前须排除 3 个 SOCKS 测试文件）；LLM 经 7897 代理真实连通（102 tokens）；socksio 1.0.0
  - Risk: low（纯依赖补齐 + 本地 .env 端口修正；socksio 是 httpx 官方 extras）

## 2026-08-30
- **Fix: 预存测试失败排查——LOCAL_ONLY_MODE 测试隔离缺陷（8 项）**
  - What: 排查并修复 8 个预存失败，根因是 `backend/.env` 的 `LOCAL_ONLY_MODE=true` 被测试进程继承，而 session 认证类测试 fixture 未显式关闭——local-only 模式会让 auth 路由按设计返回 404、且所有请求落为同一本地所有者导致跨用户断言失效
  - Files: `backend/tests/test_auth.py`（fixture 加 `monkeypatch.setattr(config, "LOCAL_ONLY_MODE", False)`）、`backend/tests/test_credentials.py`、`backend/tests/test_user_isolation.py`、`backend/tests/test_api.py`（同源修复）、`backend/tests/test_router_contracts.py`（加 lifespan 上下文 + DB_PATH + 关 local-only）
  - Why: 这 8 项此前被归类为"预存环境性失败"；深入排查确认是测试隔离缺陷而非环境问题——修复后无需任何环境变量 hack 即可全绿
  - Docs: `task/CHANGELOG.md`
  - Verification: 后端全量 538 passed / 0 failed（此前 525/8）；ruff 通过；auth 5/5、credentials 4/4、user_isolation 2/2、router_contracts 3/3、test_api 49/49
  - Risk: low（纯测试 fixture 修复，不涉及业务代码/schema/依赖）

## 2026-08-29
- **Architecture: 重构决策分析（基于 vibevibe 进阶篇基准）**
  - What: 抓取 vibevibe.cn/Advanced/ 基准 + 4 个并行子代理分析（现状审计 / 基准对标 / 技术栈评估 / Agent SDK 评估），产出 `docs/ai/REFACTOR_DECISION.md`
  - Why: 用户认为当前项目"东一点西一点"，需要基于基准判定是否重构
  - Docs: `docs/ai/REFACTOR_DECISION.md`（新增）、`task/CHANGELOG.md`
  - 结论: ①值得重构，做"保留式减法"（3-5 周）而非重写（6-10 周）②维持 FastAPI + React（4.50 分），不迁 Next.js 全栈（3.80 分），Docker 保留 ③不引入 OpenAI/Anthropic Agent SDK，自研吸收 3 个设计点（类型驱动工具校验 / event_sink 事件协议 / loop guardrail）
  - 验证: 纯只读分析 + 文档交付；未改代码/依赖/schema/数据库
  - Risk: low（决策文档，等待维护者确认后转执行计划）

## 2026-08-29（Phase 0-1 执行）
- **Phase 0: Scope Freeze v1 冻结**
  - What: 产出 `docs/ai/SCOPE_FREEZE_V1.md`——核心用户旅程（7 步闭环）、P0/P1/P2 范围清单、冻结规则、Phase 1-4 路线图、校准记录
  - Docs: `docs/ai/SCOPE_FREEZE_V1.md`（新增）、`task/CHANGELOG.md`
  - Risk: low（纯文档，维护者已批准执行）
- **Phase 1: 前端减法（孤儿页/死组件回收 + Alpha 工作台接线）**
  - What: 回收 2 个真孤儿页面（`frontend/src/pages/AlphaResearch.tsx`、`Screening.tsx`）、4 个死组件（`components/ChinaMap.tsx`、`CountUp.tsx`、`Marquee.tsx`、`ScrollingTable.tsx`）、2 个测试文件（`tests/AlphaResearch.test.tsx`、`tests/VisualComponents.test.tsx`），全部进回收站；移除死依赖 `@datapool/china.geojson`（仅 ChinaMap 使用）；新建 `components/alpha/AlphaResearchPanel.tsx` 并让 Discover `?mode=alpha` 分发渲染（原独立页面的 Alpha 工作台能力收敛为 Discover 模式面板）；补 `tests/DiscoverModeDispatch.test.tsx`（2 tests）
  - Why: 执行已批准的保留式减法；回收业务零引用的孤儿资产，同时修复 Discover alpha 模式从未渲染工作台的入口断裂，避免 PROD-034/036/037 成果静默丢失
  - Docs: `docs/ai/SCOPE_FREEZE_V1.md`（§7 执行校准）、`task/CHANGELOG.md`
  - Verification: `bun run build` 通过；Vitest 62 files / 196 tests 全绿（含新增 DiscoverModeDispatch 2 tests）；前端页面/组件 grep 零残留引用
  - Risk: low（删除进回收站可恢复；Alpha 工作台能力保留并有测试背书）
- **Phase 2: 后端盘点校准 + Agent SDK 3 设计点自研吸收**
  - What: ①后端死资产断言校准——v1 回测 `/api/backtest` 被 Chat 对话回测活跃消费、`/api/analysis/stock` 是 research 轻量别名、scheduler_loop 是"配置变更重启"非双调度器，均保留；仅组合三轨孤岛表（portfolio_groups/items/trades 零读写）归入 Phase 3 schema 迁移 ②Agent SDK 3 设计点自研吸收（零新依赖）：`ToolRegistry.dispatch()` + `validate_tool_arguments()` 类型驱动前置校验（tools.py）；`TOOL_LOOP_EVENTS` 受控事件枚举 + `chat_with_tools_loop` event_sink/pre_tool_hook/post_tool_hook（llm_client.py）；chat.py `_execute_tool` 改走 dispatch、SSE 工具事件改由 event_sink 收集转发
  - Why: 执行已批准的 REFACTOR_DECISION §5.2；不引入 OpenAI/Anthropic SDK，自研吸收其 3 个设计点
  - Docs: `docs/ai/SCOPE_FREEZE_V1.md`（§8/§9）、`task/CHANGELOG.md`
  - Verification: test_tool_registry + test_chat_tools 共 8 passed；mypy 3 文件 Success；ruff 通过；test_agent_tools_execution 2 项失败为环境性（系统 SOCKS 代理缺 socksio，与改动无关）
  - Risk: low（新增参数全默认值向后兼容；chat SSE 事件流保持原 tool_call 协议）
- **Phase 3: schema v24 收敛迁移（删除组合三轨孤岛表）+ 真实备份演练**
  - What: `database.py` 新增 `_SCHEMA_CLEANUP_VERSION = 24`，从 `_OWNER_TABLES` 与 `SCHEMA` 移除 portfolio_groups/items/trades（零读写遗留表），新增 `_install_schema_cleanup()`（DROP 三表）+ pre-v24 备份；真实 `backend/data/finquant.db` 完成 v23→v24 迁移（副本演练通过后执行，数据完整，pre-v24.bak 生成）；更新 test_api.py 三个 LLM stub 适配 chat_with_tools_loop 新签名（event_sink 等）、test_database_recovery_audit / test_scheduler_runtime_benchmark 版本断言改 `database._SCHEMA_VERSION`
  - Why: 执行已批准 SCOPE_FREEZE Phase 3——只减表、先备份，活跃组合数据不受影响
  - Docs: `docs/ai/SCOPE_FREEZE_V1.md`（§9 Phase 3）、`docs/TECH_STACK.md`（v24/49 表）、`docs/ARCHITECTURE.md`（v24 段落/图/表数）、`task/CHANGELOG.md`
  - Verification: 迁移测试 16/16；后端全量 525 passed / 8 failed = 基线 520 passed / 8 failed（8 个失败经 git stash 基线对比确认全为预存环境性失败，与改动无关）；ruff/mypy 通过；真实 DB user_version=24、遗留表 0、portfolios/positions/research_reports 数据完整
  - Risk: low（备份先行、可恢复；只删确认零读写的表）
- **Phase 4: 契约层（OpenAPI→TS 零依赖生成器 + build 门禁）+ README 双路径**
  - What: 新建 `scripts/openapi_tsgen.py`（纯标准库，从运行时 OpenAPI 生成 `frontend/src/types/openapi.generated.ts`，59 schemas / 361 行，`--check` 模式检测漂移）；`frontend/package.json` 加 `prebuild` 契约门禁（漂移即 build 失败）；README 安装段重构为 Docker（推荐）/ 裸机开发双路径并列；补 `backend/tests/test_openapi_tsgen.py`（5 tests）
  - Why: 执行已批准 SCOPE_FREEZE Phase 4——分离栈 AI 维护契约层（OpenAPI→TS 自动生成，零新依赖不违反冻结规则），消除前后端类型手写漂移
  - Docs: `docs/ai/SCOPE_FREEZE_V1.md`（§9 Phase 4）、`README.md`（双路径）、`task/CHANGELOG.md`
  - Verification: 生成器测试 5/5；ruff 通过；`bun run build`（含 prebuild 契约检查）通过；漂移拦截实测（注入注释 → build exit 1；恢复 → 通过）；生成物 `tsc --noEmit` 独立编译零错误
  - Risk: low（生成物只读导入，不替换手写 types/index.ts；prebuild 失败即阻断，可随时移除）

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

## 2026-08-29
- What changed: added five deterministic Discover-path Playwright tests for default screening, `/alpha` and `/screening` redirects, API-backed Alpha categories/templates/search, and 390px overflow; stabilized the existing E2E language and synchronized stale Strategy, Portfolio, and Today assertions with current accessible UI semantics.
- Why: close BACKLOG-002 with regression evidence for the merged Discover/Alpha route while keeping the full pre-existing E2E gate deterministic across browser locales.
- Docs updated: `docs/ai/tasks/BACKLOG-002.md`, `docs/ai/EXEC_PLAN.md`, and `task/CHANGELOG.md`.
- Verification: `bun run build` passed with 4,237 modules in 29.10s; full Vitest passed 63/63 files and 198/198 tests in 400.59s; full Playwright passed 16/16 tests (11 existing + 5 new) in 17.5s; focused Discover E2E passed 5/5; `git diff --check` and harness audit passed (audit retained existing informational/PII warnings).
- Risk: low; E2E and documentation only. No business component, backend, schema, authentication, dependency, `reference/`, commit, push, publish, or deploy change.
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

## 2026-08-29
- What changed: replaced two real-network Agent tool tests in `backend/tests/test_agent_tools_execution.py` with deterministic class-method monkeypatch fixtures for quote data and 120 K-line bars.
- Why: remove Tencent market-data and proxy-state dependencies so the Agent tool execution tests produce identical results online, offline, with or without proxy variables.
- Docs updated: `docs/ai/tasks/BACKLOG-003.md`, `docs/ai/EXEC_PLAN.md`, and `task/CHANGELOG.md`.
- Verification: the same three Agent test files passed 13/13 with proxy variables pointing to the listening `127.0.0.1:7897` and 13/13 after temporarily clearing `ALL_PROXY`, `HTTP_PROXY`, and `HTTPS_PROXY`; full backend remained 551/551 passed; focused Ruff passed.
- Risk: low; tests and task evidence only. `test_agent_market_tools.py` was already deterministic and remained unchanged; no business code, dependency, schema, frontend, `reference/`, commit, push, publish, or deploy change.

## 2026-08-30
- What changed: added 62 deterministic backend tests across nine coverage targets and six SSE pipelines, including market/fundamental degradation, scheduler and research-run recovery, monitor binding, four report export formats, audit verdict branches, Thesis drift/version/evidence/review paths, SSE upstream failures, validation rejection, replay, ping, and stream cleanup.
- Why: raise trustworthy backend coverage from 84% to the required 87% while proving failure and cleanup behavior without external network, LLM, market-data, proxy, or timing dependencies.
- Docs updated: `docs/ai/tasks/BACKLOG-004.md`, `docs/ai/EXEC_PLAN.md`, and `task/CHANGELOG.md`.
- Verification: full coverage suite passed 613/613 with TOTAL 87%; full no-coverage suite passed 613/613; all nine targets improved by at least 5 percentage points or reached 88%; the nine new files passed 62/62 both with the listening 7897 proxy enabled and with `ALL_PROXY` / `HTTP_PROXY` / `HTTPS_PROXY` temporarily unset; full backend test Ruff passed.
- Risk: low; tests and task evidence only. No `backend/app`, database schema, authentication, dependency, lock file, frontend, `reference/`, commit, push, publish, or deploy change.

- What changed: added a per-agent Discussion stream reducer/state and a backward-compatible InvestmentCommittee live timeline with round, live/final text, and failure status; added 29 deterministic tests across the stream reducer and 10 core components.
- Why: make the real Discussion SSE process visible before `agent_end` and close the direct-test gap on the changed UI and related research primitives.
- Docs updated: `docs/ai/tasks/BACKLOG-006.md`, `docs/ai/EXEC_PLAN.md`, and `task/CHANGELOG.md`.
- Verification: OpenAPI freshness passed for 59 schemas; TypeScript and Vite production build passed with 4,238 modules; full Vitest passed 74/74 files and 227/227 tests; Discussion E2E passed 5/5 and full Chromium E2E passed 35/35; zh/en dictionaries are 2,208/2,208 with zero duplicates/parity differences; `git diff --check` passed.
- Risk: medium; this is a user-visible Discussion behavior change. Streaming state remains frontend-session state and intentionally preserves partial text as failed when stopped or interrupted. No backend, schema, authentication, SSE contract, dependency, E2E assertion, `reference/`, commit, push, publish, or deploy change.

## 2026-08-30
- What changed: added 12 direct frontend component test files with 25 cases and five deterministic backend coverage files with 97 cases, covering all eight BACKLOG-007 priority modules plus migration rollback and secondary router/service branches.
- Why: close direct component-test gaps and raise backend coverage from 86.83% to the required ≥90% without changing production behavior.
- Docs updated: `docs/ai/tasks/BACKLOG-007.md`, `docs/ai/EXEC_PLAN.md`, and `task/CHANGELOG.md`.
- Verification: frontend full Vitest passed 86/86 files and 252/252 tests; OpenAPI freshness (59 schemas), TypeScript, and Vite production build (4,238 modules) passed. Backend coverage and no-coverage suites both passed 710/710 with TOTAL 90.59%; all eight priority modules reached the +5pp-or-≥88% rule; the five new backend files passed 97/97 with proxy variables cleared and 97/97 with the 7897 proxy enabled; tests Ruff passed.
- Risk: low; tests and evidence docs only. `PortfolioWhy` currently formats a negative contribution as `¥-10.00`; recorded without changing business code. No `backend/app`, `frontend/src`, schema, authentication, dependency, lock file, `reference/`, commit, push, publish, or deploy change.

## 2026-08-30
- What changed: strengthened three Discussion browser paths around the live `.investment-committee__stream` contract, added 10 direct component test files with 20 cases, and limited local Playwright to 2 workers with one retry.
- Why: prove streamed text/round/status and failure retention in the browser, close the remaining direct component-test gap, and reduce known local E2E resource contention without weakening assertions.
- Docs updated: `docs/ai/tasks/BACKLOG-008.md`, `docs/ai/EXEC_PLAN.md`, and `task/CHANGELOG.md`.
- Verification: pre-change E2E ran 35/35 three times without reproducing the maintainer's intermittent failures; focused Discussion passed 6/6; full Vitest passed 96/96 files and 272/272 tests; OpenAPI freshness, TypeScript, and Vite production build (4,238 modules) passed; post-fix full E2E passed 36/36 three consecutive times with no retry records; `git diff --check` and scope audit passed.
- Risk: low; tests, Playwright scheduling, and evidence docs only. Historical Discussion messages are currently hidden by the committee's missing-position gate and were recorded without changing business code. No `frontend/src`, backend, schema, authentication, dependency, lock file, `reference/`, commit, push, publish, or deploy change.

- What changed: fixed `InvestmentCommittee` so completed historical Discussion members without `position` remain visible with their summary and an `UNKNOWN` position label; isolated position-only consensus/conflict statistics without non-null assertions; added 20 direct component test files with 40 cases plus 2 InvestmentCommittee regressions.
- Why: restore user-visible historical discussion viewpoints and clear the remaining 20-component direct-test backlog without changing backend or SSE contracts.
- Docs updated: `docs/ai/tasks/BACKLOG-009.md`, `docs/ai/EXEC_PLAN.md`, and `task/CHANGELOG.md`.
- Verification: OpenAPI freshness passed for 59 schemas; TypeScript and Vite production build passed with 4,238 modules; focused Vitest passed 21/21 files and 48/48 tests; full Vitest passed 116/116 files and 314/314 tests; Chromium E2E remained 36/36 without assertion changes; zh/en dictionaries remained 2,208/2,208 with zero duplicates or parity differences; `git diff --check` passed.
- Risk: low; the only production behavior change restores historical summaries previously hidden by a missing optional field. No Discussion mapping, i18n, E2E, backend, schema, authentication, SSE contract, dependency, lock file, `reference/`, commit, push, publish, or deploy change.

## 2026-08-31
- What changed: added five deterministic Chat deep-interaction E2E cases with method/path/body assertions and 24 deterministic backend tests for analysis SSE/chart errors, instrument provenance, Alpha correlation/search fallbacks, Agent tool validation/parser paths, and chip-distribution boundaries.
- Why: cover user-visible Chat session management and raise trustworthy backend coverage from 90.59% to the required ≥92% without changing production behavior.
- Docs updated: `docs/ai/tasks/BACKLOG-010.md`, `docs/ai/EXEC_PLAN.md`, and `task/CHANGELOG.md`.
- Verification: OpenAPI freshness (59 schemas), TypeScript, and Vite build (4,238 modules) passed; Vitest passed 116/116 files and 314/314 tests; Chromium E2E passed 41/41 (36 baseline + 5); backend coverage and no-cov suites passed 734/734 with TOTAL 92.05%; new backend tests passed 24/24 with proxy variables cleared and 24/24 with 7897 enabled; tests Ruff and `git diff --check` passed.
- Risk: low; tests and evidence docs only. No `frontend/src`, `backend/app`, schema, authentication, dependency, lock file, `reference/`, commit, push, publish, or deploy change; no new Chat business defect was found.

## 2026-08-31
- What changed: added `AStockExtraService` with five A-share depth capabilities (locally inferred chip distribution, minute/120-day money flow, limit-up/down pools, dragon-tiger records with TOP5 seats, and current valuation snapshot with explicit UNKNOWN history); added one shared serialized Eastmoney throttle, four Agent tools, and 26 deterministic MockTransport tests.
- Why: fill the a-stock-data capability gaps using only direct httpx logic while preserving FinQuant's explicit failure/UNKNOWN and provenance rules.
- Docs updated: `docs/ai/tasks/BACKLOG-011.md`, `docs/ai/EXEC_PLAN.md`, `task/CHANGELOG.md`, and `HANDOFF.md`; no API contract update because no endpoint was added.
- Verification: full backend passed 760/760; coverage rose from 92.06% to 92.22% (new service 97.2%); focused tests passed 26/26 with proxy variables set to 7897 and 26/26 with proxy variables cleared; Ruff, mypy, and diff checks passed; requirements unchanged.
- Risk: medium; new provider-facing behavior depends on Eastmoney availability and throttling. Valuation history intentionally remains UNKNOWN because the referenced implementation requires baostock and exposes no verified zero-auth Eastmoney daily PE/PB HTTP contract. No schema, authentication, dependency, frontend, `reference/`, endpoint, commit, push, publish, or deploy change.

## 2026-09-01
- What changed: added three authenticated A-share REST thin wrappers, money-flow and dragon-tiger Research evidence cards, the lazy `/discover/limit-pool` page and navigation, shared A-share amount formatting, deterministic backend/frontend/E2E tests, and synchronized API/architecture/task evidence.
- Why: expose three already-implemented BACKLOG-011 capabilities to the evidence-first frontend while preserving service behavior, provenance, explicit UNKNOWN states, and existing chip/limit-up contracts.
- Docs updated: `docs/API_CONTRACT.md`, `docs/ARCHITECTURE.md`, `docs/ai/tasks/BACKLOG-012.md`, `docs/ai/EXEC_PLAN.md`, `task/CHANGELOG.md`, and `HANDOFF.md` via the required Harness handoff log.
- Verification: backend full no-cov and coverage suites passed 780/780 with TOTAL 92.26%; new MockTransport REST tests passed 20/20 with proxy 7897 and 20/20 with proxy variables cleared; backend Ruff passed. Frontend build passed with 4,240 modules; Vitest passed 118/118 files and 318/318 tests; Chromium E2E passed 43/43; zh/en parity was 2,259/2,259 with zero differences; OpenAPI reported 137 paths / 172 operations.
- Risk: medium; user-visible provider-backed A-share evidence depends on Eastmoney availability, but non-trading days remain honest UNKNOWN and upstream failures remain explicit. No service-layer, existing endpoint, schema, authentication, dependency, lock-file, Playwright-config, `reference/`, deletion, commit, push, publish, or deploy change.

## 2026-09-01
- What changed: added strict UTC+8 money-flow time mapping, an Area-based `MoneyFlowChart`, and a ResearchWorkspace minute/120-day switch that refetches only money flow while retaining the previous series under a loading overlay; added bilingual copy and deterministic unit/component/workspace/E2E coverage.
- Why: upgrade the A-share money-flow evidence card from a latest-value snapshot to the direct minute or 120-day series already returned by the existing endpoint, without estimates or interpolation.
- Docs updated: `docs/ai/tasks/BACKLOG-013.md`, `docs/ai/EXEC_PLAN.md`, and `task/CHANGELOG.md`; no API contract update because no endpoint changed. `HANDOFF.md` was intentionally not touched because it is outside BACKLOG-013's strict allowlist.
- Verification: focused Vitest passed 3/3 files and 11/11 tests; production build passed with 4,242 modules; full Vitest passed 120/120 files and 327/327 tests; Chromium E2E passed 44/44; zh/en parity was 2,262/2,262 with zero duplicates or differences; `git diff --check` and forbidden-surface audit passed.
- Risk: low; invalid times/dates and null/NaN/±Infinity values are dropped rather than fabricated. No backend, chart-hook, Playwright-config, dependency, lock-file, `reference/`, deletion, commit, push, publish, or deploy change.

## 2026-09-01
- What changed: `frontend/src/pages/LimitPool.tsx` now links stock codes to `/research/{code}` with a bilingual column tooltip; `frontend/src/pages/ResearchWorkspace.tsx` adds a dragon-tiger window-end DatePicker with isolated fetching, retained rows under Spin, and date rollback/error deduplication. Updated `frontend/src/i18n/zh.ts` and `en.ts`; added `frontend/tests/LimitPool.test.tsx`, extended `ResearchWorkspaceEvidence.test.tsx`, appended one `frontend/e2e/limit-pool.spec.ts` case and added `frontend/e2e/dragon-tiger.spec.ts`.
- Why: complete BACKLOG-014's list-to-research navigation and historical dragon-tiger lookup using the existing API and money-flow switching pattern; distinguish the requested window end from the actual listing date and preserve honest empty-window notes.
- Docs updated: `docs/ai/tasks/BACKLOG-014.md`, `docs/ai/EXEC_PLAN.md`, and `task/CHANGELOG.md`. No endpoint or architecture changes; `HANDOFF.md` remains untouched because it is outside the card's strict allowlist.
- Verification: sequential `bun run build`, `bun run test`, and `bun run test:e2e` all passed. Build remains 4,242 modules with 59 OpenAPI schemas fresh; Vitest increased from the recorded 120 files / 327 tests baseline to 121/121 files / 331/331 tests (929.06s); Chromium E2E increased from 44 to 46/46 (58.7s, workers:2/retries:1, no retries). New tests cover navigation, isolated refetching/loading, successive failed historical dates with rollback/error deduplication, recovery to server-note Empty, and preservation of unrelated errors. zh/en 2,265/2,265 keys, zero duplicates/differences; `git diff --check`, unchanged existing E2E prefix, and strict allowlist checks passed.
- Risk: low; selected dates remain look-back window endpoints, listing dates remain provider-returned values, and failed requests retain the previous records without relabelling them. No backend, chart-hook, Playwright-config, existing E2E assertion, dependency, lock-file, `reference/`, deletion, commit, push, publish, or deploy change.

## 2026-09-02
- What changed: BACKLOG-015 upgraded `frontend/src/pages/ResearchWorkspace.tsx` to a selectable dragon-tiger history list; synchronized five keys in `frontend/src/i18n/zh.ts` and `frontend/src/i18n/en.ts`; extended `frontend/tests/ResearchWorkspaceEvidence.test.tsx` by six cases and appended one case to `frontend/e2e/dragon-tiger.spec.ts`.
- Why: expose all provider-returned listing records, show the selected record and its actual seats, explain missing historical seats honestly, and reset selection only after a successful date/workspace load. Mouse and keyboard selection issue no additional requests.
- Docs updated: `docs/ai/tasks/BACKLOG-015.md` (DONE and complete evidence), `docs/ai/EXEC_PLAN.md` (DONE), and `task/CHANGELOG.md`. HANDOFF remains unchanged under the task's strict allowlist.
- Verification: production build passed with 4,242 modules and 59 fresh OpenAPI schemas; full Vitest passed 121/121 files and 337/337 tests (+6, 933.95s); focused evidence suite passed 12/12; final full Chromium E2E passed 47/47 (+1, 58.9s, original workers:2/retries:1, no retries). Initial E2E run passed all 46 existing cases; the new case incorrectly assumed one initial request despite dev StrictMode, so its initial count assumption was corrected to an unchanged-count comparison and the full suite rerun. Existing E2E semantics remain intact, with only four detail locator scopes updated. zh/en 2,270 keys each, zero duplicates/differences; git diff --check and final scope audit passed.
- Risk: low; no backend, chart hook, Playwright configuration, other page/component, dependency, lock-file, or reference changes; no deleted files. Latest seats are never copied into historical records, and historical seats supplied in the future are displayed directly. HEAD remains 891416e and the index is empty; no commit or push.
