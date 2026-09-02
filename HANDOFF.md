# HANDOFF —— 项目交接档案

> 用途：跨会话/跨 agent 接续的权威档案。会话结束时更新；新会话先读本文件再动手。
> 由 harness-engineering v4.11.0 `bootstrap.py --init` 生成，首次真实工作替换于 2026-08-20，最近更新 2026-08-21（会话恢复校准）。

## 当前目标（Objective）

**Local OSS v1 发布就绪**。功能全部完备（88 个任务 + AIOS-000~088 全 DONE），Design System v1.0 已落地，技术栈文档已整合。当前阶段：**发布前收尾**——LICENSE 文件创建、docs/ 引用注释清理、浏览器视觉验收确认。

工作树干净：`git status` 无已跟踪文件修改，只有未跟踪的设计文档/产物。

## 完成标准（Definition of Done）

### 已完成 ✅

- [x] Design System v1.0 tokens（`--fq-*` CSS 变量）已定义并接入新组件
- [x] Dashboard 从"金融仪表盘"重构为"evidence-first workbench"
- [x] Research/Discussion/Portfolio/Backtest 页面接入新组件族
- [x] 全部新组件与修改文件已 git commit（7 个 commit：harness init、Design System + UI redesign、harness infrastructure、design docs + screenshots、tech stack consolidation 等）
- [x] `bun run build` 通过（TypeScript tsc --noEmit 零错误）
- [x] 后端 `/api/dashboard/news` 端点可用（浏览器实机验证 MarketBrief/LatestNews/DecisionCard 可见）
- [x] 技术栈文档集中：`docs/TECH_STACK.md` 建立为唯一权威来源
- [x] `task/PROJECT_CONTEXT.md` 重写去重（14→23 路由器、6→13 工具、15→52 表、66→133 端点）
- [x] `README.md`、`CLAUDE.md`、`docs/audit/functional-gap.md` 加 TECH_STACK 引用注释

### 未完成（发布前必须做）

- [ ] **LICENSE 文件**：Apache-2.0 已授权（Copyright 2026 Satanchen），根目录 LICENSE 未创建
- [ ] **docs/PRD.md 3.2 节**加一行引用注释指向 TECH_STACK.md
- [ ] **docs/PRODUCT_MAP.md** 单行技术栈加引用

### 不阻塞发布（长期）

- [ ] Design System 新老双轨迁移（`--fq-*` tokens 只被新组件消费，旧硬编码色值 `#dce5ef`/`#1890ff` 未迁移）
- [ ] Graphiti/Mem0 选型：AIOS-004/005/034 仍 BLOCKED，依赖第三方包安装和 ADR 决策

## 验证命令（Verification）

```bash
# 后端测试
cd backend && .venv\Scripts\python.exe -m pytest -q

# 后端 lint
cd backend && .venv\Scripts\python.exe -m ruff check .

# 前端构建
cd frontend && bun run build

# Harness 审计
python scripts/audit.py .
```

## 边界（Boundaries）

- 不改 `docs/ai/ARCHITECTURE.md` 中的架构不变量（无 ORM、无连接池、无 WebSocket、认证不可删除、用户隔离不可削弱）
- 不改 `reference/` 目录
- 不新增后端 schema 或数据库表
- 不引入新的 npm/Python 依赖（Design System 纯 CSS 实现）
- 删除走 PowerShell 回收站（禁 rm）
- 改端点后同步 `docs/API_CONTRACT.md` 与 `docs/ROUTER_MAP.md`
- 提交前跑 `pytest -q && ruff check . && cd frontend && bun run build`
- **技术栈信息唯一权威**：只看 `docs/TECH_STACK.md`；其他文件中的技术栈表优先加引用/注释而非重复维护

## 当前运行状态

后台服务（2026-08-21 会话结束时记录，新会话需自行验证）：
- 后端 uvicorn `127.0.0.1:8000`——需 `cd backend && .venv\Scripts\python.exe -m uvicorn app.main:app --reload` 启动
- 前端 vite `localhost:5173`——需 `cd frontend && bun run dev -- --strictPort --port 5173` 启动

重要环境事实：
- **5173 曾长期被旧 Docker 容器占用**（`finquant-hub-local-frontend-1`，旧镜像）——已 `docker stop`。若再报 "port in use"，先 `docker ps` 查容器、`netstat -ano | findstr 5173` 查进程。
- 前端 dev 用 `bun run dev -- --strictPort --port 5173` 固定端口。
- 用户要求不要偷偷换端口：端口被占用要杀掉占用者，不是换新端口。

## docs/ 技术栈引用注释任务（上次会话分析）

grep 分析 93 处技术栈匹配，结论：

| 文件 | 处置 |
|------|------|
| `docs/TECH_STACK.md` | ✅ 唯一权威来源 |
| `docs/ARCHITECTURE.md` | 保留（架构文档，引 TECH_STACK 即可） |
| `docs/PRD.md` | ⬜ 3.2 节加引用注释指向 TECH_STACK.md（待做） |
| `docs/PRODUCT_MAP.md` | ⬜ 单行技术栈加引用（待做） |
| `docs/DELIVERY.md` / `docs/DEPLOY.md` | 提及式，保留 |
| `docs/audit/functional-gap.md` | ✅ 已加引用注释 |
| `task/PROJECT_CONTEXT.md` | ✅ 已重写去重 |
| `README.md` / `CLAUDE.md` | ✅ 已加 TECH_STACK 引用 |
| `docs/ai/*.md`（CONTRACT/BASELINE） | 契约文档，保留 |

**原则**：不要大规模删改历史文档内容，只加引用注释。

## 未决问题与下一步（Open Questions / Next Steps）

1. **LICENSE 文件创建**：Apache-2.0 已授权（Copyright 2026 Satanchen），根目录未创建。发布前必须完成。
2. **docs/ 引用注释收尾**：PRD.md 3.2 节 + PRODUCT_MAP.md 单行 → 加 TECH_STACK.md 引用（小改动）。
3. **Design System 新老双轨**：长期迁移，不阻塞发布。
4. **Graphiti/Mem0 选型**：AIOS-004/005/034 BLOCKED，不阻塞 Local OSS v1。
5. **浏览器视觉验收**：Dashboard hero、MarketBrief、LatestNews、DecisionCard 已通过 accessibility snapshot 验证；用户可打开 http://localhost:5173/ 实测确认。

---

## 变更日志（每轮结束追加一条）

- 2026-08-20 首次填充 HANDOFF.md，同步项目真实状态。Harness 治理层从骨架升级为可用。工作树 15 modified + 12 new 待提交。
- 2026-08-20 完成 4 个 commit：harness governance init、Design System v1.0 + UI redesign（10 新组件 + 5 页面重构 + CSS tokens + 后端 news）、harness infrastructure（.harness/ + scripts/ + hooks + skills）、design docs + UI screenshots。84 文件，+11,684/-961 行。TypeScript 零错误、Vite 构建通过、audit.py exit 0。
- 2026-08-21 修复端口占用的根因：旧 Docker 容器长期占用 5173 跑旧镜像，docker stop 后前端固定 5173（strictPort）。浏览器自动化（browser-skill）实机验证 Dashboard 新组件全部可见。
- 2026-08-21 commit `e9b4be4`：技术栈整合——新建 docs/TECH_STACK.md（唯一权威来源），重写 task/PROJECT_CONTEXT.md（14→23 路由器、6→13 工具、15→52 表、66→133 端点），README/CLAUDE.md 加引用，functional-gap.md 加历史注释。
- 2026-08-21 会话恢复校准：同步工作树状态（干净，无未提交修改）、EXEC_PLAN 全量完成（AIOS-000~088）、发布前剩余项（LICENSE + docs 引用注释）和 BLOCKED/PARKED 任务状态。
- 2026-08-21 根目录 MD 梳理：删除 5 个与 docs/ 重复的 `FinQuant_*` 残留副本（SHA256 相同、已提交于 d3bbd0d，删除进回收站）；补充 .gitignore（.dsh-vision-router/、artifacts/、backend/data/、*.bak）。根目录 MD 收敛为 8 个正式文件（AGENTS/CHANGELOG/CLAUDE/CONTRIBUTING/design-qa/HANDOFF/README/SECURITY）。
- 2026-08-23 BACKLOG-001 tasks 1-4 completed; AIOS-005 ADR package prepared; Batch 3 remains PARKED | 验证: backend 541 passed / 84.25%, Ruff passed, frontend build passed, static gates and localhost browser smoke passed

- 2026-08-23 BACKLOG-001 follow-up refreshed Graphiti/Mem0 metadata and corrected stale package-source blocker evidence; no packages installed | 验证: pip index resolved graphiti-core 0.29.3 and mem0ai 2.0.18 via 7897; local imports absent; shadow PoC native measured, candidates NOT_RUN; focused 2 and Ruff passed

- 2026-08-24 Accepted Native FTS5 as the Local OSS v1 production memory provider; marked ADR-005 ACCEPTED and AIOS-005/BACKLOG-001 DONE; kept AIOS-004/034 optional PoCs BLOCKED and AIOS-071/072/073 PARKED. | 验证: Approval recorded for 2026-08-24; cross-document status checks, release static gates, git diff --check, and harness audit passed. No code/schema/dependency changes from approval closure.

- 2026-08-24 Implemented UI-000 through UI-003 and the safe UI-004 token subset; synchronized BLOCKED evidence for browser screenshot policy and legacy palette residual. | 验证: Frontend production build passed; changed-surface Vitest 11 files / 44 tests passed; Strategy 10/10, Alerts 5/5, Compare 4/4, Portfolio 8/8. Full default suite hit aggregate Windows timeouts.

- 2026-08-24 UI-004 palette convergence: removed unused legacy CSS, migrated CSS and TS/TSX colors to semantic tokens, added canvas runtime token resolution, and advanced Research/Today/Library i18n | 验证: frontend build passed; focused UI suites 30/30, 7/7, and 8/8 passed; CSS non-token and TS/TSX color literal audits both report 0

- 2026-08-24 UI-004 i18n: migrated the complete Strategy Lab flow to shared zh/en t(key) copy | 验证: StrategyLab.tsx Chinese literal audit 0; production build passed; StrategyLab test suite 10/10 passed

- 2026-08-24 Completed UI-000 to UI-004 code-side closure: eight-route visible zh/en migration, evidence-first UNKNOWN states, Strategy/Research/Today/Portfolio/Monitor i18n, and 6-8px token convergence; screenshot matrix remains policy-blocked. | 验证: Frontend production build passed (4219 modules); full Vitest 60 files / 180 tests passed in 775.01s; zh/en 1596 keys each with 0 duplicates and 0 parity diff; hardcoded colors and 100vh/h-screen audits 0; 13/13 first-class components present.

- 2026-08-24 Revalidated UI-000 to UI-004 visual gate: localhost 5173 is healthy and Browser runtime is discoverable, but two fresh tabs timed out at webview attachment; updated blocker evidence without claiming screenshots. | 验证: HTTP 200 on 127.0.0.1:5173; screenshot folder remains 17 historical plus 6 partial current images; no code/backend/schema/dependency/auth changes.

- 2026-08-24 Corrected the 5173 service, entered FinQuant through the supported local-only contract, accepted Today and Discover desktop/light/zh screenshots as real PNGs, and recycled four spinner-only captures. | 验证: Two screenshots manually inspected; no Vite overlay or loading state. Remaining matrix and rendered WCAG checks stopped by Browser URL policy; no product code/auth/schema/dependency changes.

- 2026-08-24 Added a token-level WCAG contrast gate, tightened nine light-theme semantic tokens, and synchronized pre-fix screenshot limitations across UI-000 to UI-004. | 验证: Contrast 58/58 with 4.50:1 minimum; Ruff and frontend build passed; full Vitest 175/180 under load, exact failed set 28/28 on focused rerun; final rendered matrix remains Browser-policy blocked.

- 2026-08-25 Restored the FinQuant localhost preview and closed the exact frontend test gate after the contrast-token update. | 验证: Frontend HTTP 200; backend health ok with WAL; bun run test passed 60/60 files and 180/180 tests in 476.64s while preview servers remained online; visual matrix remains Browser-policy blocked.

- 2026-08-25 Fixed four 390px UI defects and accepted 24 current mobile screenshots across Today/Research/Discover/Strategy/Portfolio/Monitor in light/dark and zh/en; Library/Settings and all 1440 states remain Browser-policy blocked. | 验证: Production build passed (4219 modules); single-worker Vitest passed 60/60 files and 180/180 tests in 766.94s; accepted routes had scrollWidth <= innerWidth, no Vite overlay, and no console error; frontend 5173 preview restored.

- 2026-08-25 Completed UI-000-UI-004 code acceptance audit: Research/Compare i18n, Discover filter chips, Strategy result tabs, real icon avatars, and honest disabled unsupported actions; Discover screenshots invalidated after visible change. | 验证: Production build 4219 modules; focused suites green; full single-worker frontend 60/60 files and 183/183 tests in 725.40s; zh/en 1728 keys each with zero duplicate/parity diff; frontend/backend HTTP 200. Browser visual matrix remains blocked pending manual reload.

- 2026-08-25 UI-002 Monitor Run now wired to existing indicators analysis, bilingual feedback/loading and regression tests; local preview restored on fixed ports | 验证: build 4219 modules; focused 8/8; full suite twice 59/60 files and 183/184 with rotating 5s timeouts, both failed files pass isolated; zh/en 1729 parity; frontend 5173 HTTP 200; backend health ok WAL

- 2026-08-25 Research 内接入 Fast/Deep/Review/Thesis 真实能力，保留旧路由参数，接通 Compare Ask Agent 与 Entity Watch，并完成模式页 zh/en 迁移 | 验证: build 4232 modules；专项 19/19 与 26/26；全量 Vitest 61/61 files、189/189 tests；i18n 2001/2001 parity

- 2026-08-25 Completed second UI-000 through UI-004 audit: real Deep plan/progress/activity, structured Review only, Evidence-to-Thesis prefill, Discover query consumption, Portfolio Thesis context, and active-route/shared-component i18n completion. | 验证: Frontend build 4233 modules; Vitest 64/64 files and 201/201 tests; zh/en 2176/2176 keys with no duplicates/diff; contrast 58/58 minimum 4.50:1; diff check passed; localhost:5173 HTTP 200; backend health ok/WAL. Browser screenshot/WCAG matrix and Deep Pause/Change scope remain blocked.

- 2026-08-25 Closed code-level keyboard accessibility gaps in Today recent context and Thesis selection; added bilingual action/eyebrow copy and synchronized UI-000 through UI-004 evidence. | 验证: Frontend build 4233 modules; focused 2/2 files 15/15 tests; full Vitest 64/64 files 201/201 tests in 385.29s; i18n 2178/2178 no duplicates/diff; contrast 58/58 min 4.50:1; non-native clickable-list scan zero.

- 2026-08-29 2026-08-29 UI full-chain audit: honest health indicator, active-copy i18n completion, unreachable legacy StockAnalysis removal, and evidence sync. | 验证: Frontend build 4231 modules; Vitest 64/64 files and 202/202 tests in 401.72s; i18n 2200/2200 parity; contrast 58/58 min 4.50:1; diff check and fixed-port health passed. Screenshot/rendered WCAG matrix and Deep Pause/Change scope remain blocked.

- 2026-08-29 UI screenshot evidence audit corrected the narrow-capture dimensions and retained all captures as historical reference only. | 验证: 24 final-labelled files are valid PNG; 23 are 375x812 and one is 390x844. Exact 390/current 1440 light-dark zh-en matrix remains Browser-policy blocked; no files deleted or converted.

- 2026-08-29 Re-audited the live research control contract before attempting Deep Pause or Change scope. | 验证: Live OpenAPI plus backend router/service and frontend caller scans expose no pause, resume, or change-scope operation; controls remain honestly disabled within the frontend-only goal boundary.

- 2026-08-29 Closed active-route form accessible-name gaps across Deep Research, Chat, Discussion, Thesis, and Entity search. | 验证: Active import graph covered 130 files; visible controls without an explicit or Form.Item accessible name reduced from 9 to 0; build 4231 modules; focused 5/5 plus isolated Thesis 1/1; full Vitest 64/64 files and 203/203 tests in 487.37s; i18n 2202/2202 parity.

- 2026-08-29 Recovered FinQuant backend after port 8000 drifted to an unrelated local API. | 验证: Stopped only PID 13732 child process, restored FinQuant uvicorn on PID 25496 at 127.0.0.1:8000; frontend 5173 HTTP 200, /api/health ok/wal, OpenAPI title FinQuant Hub.

- 2026-08-29 Corrected the current fixed-port runtime record after read-only re-verification showed port 8000 had been reclaimed by an unrelated local API. | 验证: Frontend 5173 returned HTTP 200; port 8000 OpenAPI title was 海之子 · 工地安全风险 AI 识别系统 API and health reported minimax-m3/glm-5.3, so FinQuant backend health is not currently claimed.

- 2026-08-29 Completed a requirement-by-requirement audit of the UI full-chain goal and UI-000 through UI-004 against the current tree. | 验证: All code-side criteria retain direct code/test evidence, all 13 required components have active consumers, and no further independent in-scope implementation remains; current screenshot/rendered-WCAG capture is policy-blocked, Deep Pause/Change scope lacks an API contract, and 8000 still serves an unrelated API.

- 2026-08-29 Restored the FinQuant Hub backend after the unrelated 8000 listener exited. | 验证: Uvicorn session 74494 started backend/.venv app.main:app on 127.0.0.1:8000; OpenAPI title FinQuant Hub with 134 paths; direct and Vite-proxied health status ok/db wal; frontend 5173 HTTP 200.

- 2026-08-29 Completed a live read-only API smoke across all eight primary UI modules after restoring the fixed backend port. | 验证: 20/20 representative endpoints through the 5173 Vite proxy returned HTTP 200: Today 4, Research 3, Discover 2, Strategy 1, Portfolio 2, Monitor 3, Library 1, Settings 4; no records mutated.

- 2026-08-29 Completed live route fallback smoke for primary, legacy, and system-tool UI paths. | 验证: 16/16 routes on 5173 returned HTTP 200 HTML titled FinQuant Hub with no Vite error-overlay marker: eight primary, six merged legacy, two system tools; no route returned 404.

- 2026-08-29 读取 Codex 全链路会话（rollout-2026-08-24T03-06-38）最终进度：会话以 task_complete 结束，最后在验证"HTTP 200 但数据形状错误"层（八个模块代表 API 的 JSON 顶层结构核对，并同步 UI_OPTIMIZATION_PLAN 最终构建/测试证据）。| 验证: 全链路收尾证据 = build 4231 modules、Vitest 64/64 files 203/203 tests（487.37s）、i18n 2202/2202 parity、对比度 58/58、16/16 路由 200 无 404、20/20 API 200。剩余真实阻塞：① 截图/WCAG 矩阵被浏览器 URL policy 阻断；② Deep Pause/Change scope 无后端合同；③ 8000 端口曾漂移（已在会话内恢复 FinQuant）。

- 2026-08-29 Phase 0-2 减法重构执行：SCOPE_FREEZE_V1 冻结（用户旅程+P0/P1/P2+校准）；Phase 1 前端减法回收 2 孤儿页（AlphaResearch/Screening）+4 死组件（ChinaMap/CountUp/Marquee/ScrollingTable）+2 测试文件（回收站）+死依赖 @datapool/china.geojson，新建 AlphaResearchPanel 接入 Discover ?mode=alpha 并补测试；Phase 2 后端盘点校准（v1 回测/Chat 活跃消费、/api/analysis/stock 轻量别名、scheduler_loop 重启机制均保留，组合三轨表归入 Phase 3）+ Agent SDK 3 设计点自研吸收（ToolRegistry.dispatch 类型驱动校验、TOOL_LOOP_EVENTS+event_sink、pre/post_tool_hook guardrail，零新依赖） | 验证: bun run build 通过；Vitest 62 files/196 tests 全绿（含 DiscoverModeDispatch 2 新增）；后端 agent 相关测试字母序 36 passed，5 个 SOCKS 失败经清除 ALL_PROXY 后 13/13 通过（纯环境问题）；mypy/ruff 通过

- 2026-08-29 Phase 3 schema v24 收敛迁移完成：database.py 新增 _SCHEMA_CLEANUP_VERSION=24，从 _OWNER_TABLES/SCHEMA 移除 portfolio_groups/items/trades（零读写遗留表），新增 _install_schema_cleanup DROP 三表 + pre-v24 备份；真实 finquant.db 副本演练后执行 v23→v24（数据完整，pre-v24.bak 生成）；test_api.py 三个 LLM stub 适配 chat_with_tools_loop 新签名，版本断言改 _SCHEMA_VERSION | 验证: 迁移测试 16/16；后端全量 525 passed/8 failed vs 基线 520/8（8 失败经 git stash 确认预存环境性）；ruff/mypy 通过；前端 build 通过；真实 DB user_version=24 遗留表 0 数据完整

- 2026-08-29 Phase 4 契约层与 README 双路径完成：新建 scripts/openapi_tsgen.py（零依赖从运行时 OpenAPI 生成 frontend/src/types/openapi.generated.ts，59 schemas，--check 漂移检测）；frontend package.json prebuild 挂契约门禁（漂移即 build 失败，已实测拦截）；README 安装段重构为 Docker（推荐）/裸机开发双路径；补 test_openapi_tsgen.py 5 tests | 验证: 生成器测试 5/5；ruff 通过；bun run build（含 prebuild 契约检查）通过；漂移注入实测 exit 1 阻断后恢复通过；生成物 tsc --noEmit 零错误

- 2026-08-29 预存测试失败深入排查完成：8 项全部定位为 LOCAL_ONLY_MODE 测试隔离缺陷（backend/.env 的 local-only 被测试进程继承，session 认证类 fixture 未显式关闭），非环境问题。修复 test_auth/test_credentials/test_user_isolation/test_api fixture 显式关闭 local-only，test_router_contracts 补 lifespan+DB_PATH+关 local-only | 验证: 后端全量 538 passed / 0 failed（此前 525/8）；无需环境变量 hack；ruff 通过；commit 6c48ca3

- 2026-08-29 代理链路修复：requirements.txt 增加 socksio>=1.0（httpx[socks]）；backend/.env 的 LLM_PROXY_URL/NEWS_PROXY_URL 从死端口 7890 改为真实代理 7897；已验证 DeepSeek 经 7897 真实连通 | 验证: 完整后端套件 551 passed / 0 failed（此前须排除 3 个 SOCKS 测试文件）；开代理状态 13/13 SOCKS 测试通过；commit 4c7e7a8

- 2026-08-29 BACKLOG-002 完成（Codex 执行）：新增 frontend/e2e/discover-paths.spec.ts 5 用例覆盖 Discover 默认模式、/alpha 与 /screening 旧路由重定向、alpha 工作台 API 渲染与 390px 无溢出；固定既有 E2E 语言为 zh 并同步当前 UI 断言；校准 /api/wq/search 为 GET | 验证: build 4,237 modules；Vitest 63/63 files 198/198；e2e 16/16（11+5）；Discover 专项 5/5；git diff --check 通过

- 2026-08-29 BACKLOG-003 完成（Codex 执行）：test_agent_tools_execution 两个真实腾讯行情测试改为 monkeypatch mock MarketDataService.quote/kline 确定性测试（类方法补丁+参数断言+120根K线fixture），零业务代码改动 | 验证: 开代理 13 passed / 关代理 13 passed（确定性）；完整后端 551 passed 基线保持；ruff 通过；commit 7aace3b

- 2026-08-30 BACKLOG-004 完成（Codex 执行）：9 个确定性测试文件 62 用例（market_data 降级链/熔断/快照、scheduler 恢复、fundamentals 降级、monitor_targets、report_export/audit、thesis_drift、thesis 服务）+ 6 条 SSE 管线错误路径全覆盖（上游失败→error 事件+流关闭+报告落 failed、校验失败→4xx、notifications 断点续传/ping）；零业务代码改动 | 验证: 覆盖率 84%→86.83%（≈87%）；613 passed 无回归；开/关代理双环境 62 passed 确定性一致；ruff 通过；commit 待记

- 2026-08-31 BrowserSkill 副本升级 0.1.10→0.1.11（Codex 调用用）：git fast-forward 67 commits（6b78211→120dc44）至 Tencent/BrowserSkill main；215 文件 +28k/-3k（trace v2/v3 协议、跨框架录制、vom semantic-graph、dsh-plugin phase-one 工具族、evals/browser 评测 harness） | 验证: 与远程零差异；bsk CLI 0.1.11 已装（C:\Users\Satanchen\.local\bin）；bsk doctor 全 ok（daemon 运行、extension 连接 1 浏览器、protocol 兼容、agent skill up to date in 3 harnesses）；工作树干净

- 2026-08-30 BACKLOG-005 完成（Codex 执行）：E2E 扩面新增 19 用例（helpers.ts 统一 mock + chat-paths 6 + discussion-paths 5 + system-pages 8），覆盖 SSE 交互管线与系统/知识页；E2E 35/35、Vitest 63/198 全绿；零业务代码改动；记录业务缺口：Discussion 消费 token/agent_end 但不渲染时间线（未修，待后续任务） | 验证: 独立复测：Playwright 35/35（50.7s）、Vitest 63 files/198 tests（457s）；SSE 帧契约与 sse.ts 解析吻合；git diff 确认无 frontend/src 改动

- 2026-08-30 完成 BACKLOG-006：Discussion per-agent SSE 流式状态、InvestmentCommittee 流式时间线、i18n 与 10 个核心组件直接测试扩面 | 验证: OpenAPI 59 schemas；tsc/Vite build 4238 modules；Vitest 74/74 files 227/227；Discussion E2E 5/5；全量 E2E 35/35；i18n 2208/2208；diff check passed

- 2026-08-30 BACKLOG-007 完成（Codex 执行）：前端 12 组件测试文件 25 用例（ActionBar/EventTimeline/EvidenceRail/FinancialMetric/FinancialTable/PortfolioEvents/PortfolioWhy/SourceChip/StatusChip/Today 系列）；后端 5 确定性测试文件 97 用例，覆盖率 86.83%→90.59%（backtests 74.9→95.4%、market_review 80→97.4%、news_search→89.8%、market_overview→89.7%、settings→96.5% 等 8 靶点全达标）；710 passed 无回归；零业务代码改动 | 验证: 独立复测：后端 710/710 覆盖率 90.59%、前端 Vitest 86 files/252 tests、开/关代理 97/97 确定性一致

- 2026-08-30 维护者修复 PortfolioWhy 负数货币格式（¥-10.00 → -¥10.00）：formatMoney 符号前置 + formatPercent，contribution 列正数保留 +¥、marketValue 列无符号；更新测试断言；BACKLOG-008（Discussion 流式 E2E + 剩余组件测试转正）已登记供 Codex 执行 | 验证: PortfolioWhy 聚焦 2/2、全量 Vitest 252/252、build 通过；浏览器实测 Portfolio 页渲染正常（AntD destroyOnClose 弃用警告为库提示非错误）；commit b994582

- 2026-08-30 BACKLOG-008 完成（Codex 执行）：discussion-paths 增强 3 流式 E2E（流式区实时文本/轮次/状态、失败部分保留、历史房间向后兼容）+ 10 组件转正 20 用例 + playwright.config 本机 workers:2/retries:1 稳定性修复（CI 不变）；Vitest 96/96 files 272/272、E2E 36/36 x3（维护者独立连跑 3 次全绿）；零业务代码改动；记录历史房间观点被 position 门控隐藏的缺陷（未修） | 验证: 维护者独立复测：E2E 36/36 x3 全绿（稳定性达标）、Vitest 272/272、流式断言落 .investment-committee__stream

- 2026-08-31 BACKLOG-009 完成（Codex 执行）：InvestmentCommittee 修复历史讨论观点被 position 门控隐藏的缺陷（completed 只按 status、positionedCompleted 分离共识/冲突统计、无 position 成员显示 summary+UNKNOWN、非空断言清零）；20 组件测试清零（20 文件 40 用例）+ InvestmentCommittee 2 回归；Vitest 116/116 files 314/314、E2E 36/36 断言未改、i18n 2208 parity 0 | 验证: 维护者独立复测：Vitest 314/314、E2E 36/36、非空断言零残留、i18n parity 0；commit 待记

- 2026-08-31 BACKLOG-010 完成（Codex 执行）：chat-paths 新增 5 深交互 E2E（角色切换 PUT 契约/删除会话/历史恢复/角色预选/多会话隔离，断言请求方法+路由+请求体）；后端 24 确定性测试，覆盖率 90.59%→92.06%（analysis 61.7→97.4%、instruments→99.3%、alpha→98.8%、tools_definitions→99.3%、chip_distribution→100%）；734 passed 无回归；零业务代码改动 | 验证: 维护者独立复测：后端 734/734 覆盖率 92.06%、E2E 41/41、Vitest 314/314、开/关代理 24/24、ruff 通过

- 2026-08-31 决策记录（2026-08-31 调研）：Financial-API（同花顺官方，MIT，2057★）暂不接入——新项目(2个月)/限流政策模糊(动态限流无QPS承诺)/API Key 有真实坑(code=2003 官方未回)/MCP prompts/list 协议不完整/全量数据不含退市股无法历史回测/能力补全期(无分钟K/港股美股/两融)。标记 PARKED 待其成熟后评估（重点看基金数据与官方数据质量）。选定 a-stock-data（simonlin1212，9395★，零鉴权无key）作为 A 股数据能力扩展源 | 验证: GitHub Issues 调研：#37 QPS/429、#45 API Key 2003、#40 MCP prompts/list、#32 退市股缺失、#27 两融/分钟K 均未解决

- 2026-08-31 完成 BACKLOG-011：新增 a-stock-data 五项 A 股扩展能力、统一东财节流、4 个 Agent 工具与 26 个确定性测试；估值历史保持腾讯快照 + UNKNOWN | 验证: backend 760 passed，coverage 92.22%，新服务 97.2%；代理开/关均 26/26；零新依赖；未 commit

- 2026-09-01 Completed BACKLOG-012: added 3 A-share REST thin wrappers, Research money-flow/dragon-tiger evidence cards, and /discover/limit-pool with deterministic tests and synchronized docs; no commit or push | 验证: backend 780/780 no-cov and coverage, TOTAL 92.26%, Ruff passed; frontend build 4,240 modules, Vitest 118/118 files 318/318 tests, Chromium E2E 43/43; proxy on/off 20/20; diff check passed

- 2026-09-01 维护者独立复核 BACKLOG-012 通过：审阅 3 个薄包装端点/两张证据卡片/LimitPool 页/测试/文档边界，禁止文件（a_stock_extra、旧 chip/limit-up、依赖、playwright 配置）未触碰，无删除 | 验证: backend 780/780 + cov 92.25% + ruff；双环境 20/20；frontend build 4,240 modules + Vitest 118/318 + E2E 43/43；zh/en parity 0；git diff --check 通过

- 2026-09-01 维护者独立复核 BACKLOG-013 通过：审阅 moneyFlowChart 纯函数/MoneyFlowChart 组件/ResearchWorkspace 周期切换（只重取资金流+失败回滚）/测试/E2E/文档边界，后端、chart hook、playwright 配置、依赖零改动，无删除 | 验证: build 4,242 modules；Vitest 120/327；E2E 44/44；zh/en parity 2262/2262 差集0；git diff --check 通过；已提交

- 2026-09-02 维护者独立复核 BACKLOG-014 通过：审阅 LimitPool 穿透 Link/ResearchWorkspace 龙虎榜日期切换（复用 changeMoneyFlowPeriod 模式，只重取+失败回滚）/测试（真实 MemoryRouter 导航、pending 保留、错误去重）/E2E，后端、chart hook、playwright 配置、既有 E2E 断言零改动，无删除 | 验证: build 4,242 modules；Vitest 121/331；E2E 46/46；zh/en parity 2265/2265 差集0；git diff --check 通过；已提交

- 2026-09-02 维护者独立复核 BACKLOG-015 通过：审阅 ResearchWorkspace 龙虎榜历史上榜记录列表（selectedDragonTigerIndex 选中切换不重请求、历史条目席位占位、切日期/代码/重载重置选中）/测试（多记录、本地切换、占位、若历史有席位则渲染、失败保留选中）/E2E（含键盘可达），后端、chart hook、playwright 配置、既有 E2E 断言零改动，无删除 | 验证: build 4,242 modules；Vitest 121/337；E2E 47/47；zh/en parity 2270/2270 差集0；git diff --check 通过；已提交

- 2026-09-02 维护者独立复核 BACKLOG-016 通过：审阅 SERVE_FRONTEND 开关（默认关闭）/main.py 静态托管 + SPA fallback（dist 缺失跳过、/api 保护、include_in_schema=False）/test_main_static.py 21 项（隔离加载、tmp_path 假 dist、路径穿越防护、OpenAPI 不变），Docker/nginx、frontend、routers/database/auth 零改动，无删除 | 验证: backend 801/801 + cov 92.28%（main.py 91.0%）+ ruff；双环境 21/21；git diff --check 通过；已提交

- 2026-09-02 维护者独立复核 BACKLOG-017+018 通过：start.bat（固定 8000、venv/bun 引导、build 过期检测、env 模板复制不覆盖不读密钥、中文提示、端口占用检查）与 docs/QUICKSTART.md（三步上手、无 key 能力表、FAQ、数据隐私）质量高，README 链接接入；纯脚本+文档零源码改动，后端 801/801 不受影响，无删除 | 验证: backend 801/801；git diff --check 通过；已提交

- 2026-09-02 维护者独立复核 BACKLOG-019 通过：审阅 SPA fallback 静态优先（favicon.svg 修复 content-type）+ resolve/is_relative_to 路径穿越防护 404/test_main_static 追加 7 项（favicon/robots/4 种越界/SPA 不回归）/README+QUICKSTART 端口口径收敛（8000 唯一使用入口，5173 仅开发/Docker），start.bat、frontend、Docker 零改动，无删除 | 验证: backend 808/808 + cov 92.28% + ruff；双环境 28/28；git diff --check 通过；已提交

- 2026-09-02 维护者独立复核 BACKLOG-020 通过：审阅 chipToAreaData 纯函数（无效点过滤+入参不可变）/ChipHistoryChart（profit_ratio 展示层转百分比、空序列占位不建图）/筹码卡片接入（Segmented 切换不重请求、chip-card 标记）/测试（纯函数4+组件4+工作区2）/E2E（切换后请求数严格相等），后端、MoneyFlowChart、hook、playwright 配置零改动，无删除 | 验证: build 4,244 modules；Vitest 123/347；E2E 48/48；zh/en parity 2275/2275 差集0；git diff --check 通过；已提交
