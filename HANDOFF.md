# HANDOFF —— 项目交接档案

> 用途：跨会话/跨 agent 接续的权威档案。会话结束时更新；新会话先读本文件再动手。
> 由 harness-engineering v4.11.0 `bootstrap.py --init` 生成，首次真实工作替换于 2026-08-20，最近更新 2026-09-25（推送到 GitHub 私有仓库、配置 Linux/macOS 双平台 CI 并彻底修复全部测试报错达成 100% 全绿）。

## 当前目标（Objective）

**BACKLOG-050～061（含双模型协议、遥测流、专业K线图、Alpha/组合体检及浏览器自动化 E2E）已全部开发验证完毕并提交入库（commit `c39c06d`, `4ed0966`）。**
**CommandCode 模型供应商与默认模型 `deepseek/deepseek-v4.1-flash` 已注入数据库（Fernet 加密密钥存储、用户隔离、默认标记）并通过真实 API 联通测试。**

用户在实机走查体验中发现的三项交互断裂已按卡完成：BACKLOG-062 原生策略演示与 Strategy Lab 预填、BACKLOG-063 候选模型搜索/回填/批量添加、BACKLOG-064 双协议选择与折叠公有云预设。逐卡证据见 `docs/ai/tasks/BACKLOG-062.md` 至 `BACKLOG-064.md`，状态见 `docs/ai/EXEC_PLAN.md`。

2026-09-25 响应用户“建议一”要求，将全仓代码推送到 GitHub 私有仓库并建立包含 Linux (`ubuntu-latest`) 与 macOS (`macos-latest`) 的多环境 GitHub Actions CI/CD 流水线。系统性清零修复了此前遗留的后端测试断言、前端 Lightweight Charts 在 JSDOM 环境下的样式崩溃、Tear Sheet 异常、构建脚本跨平台分派及 E2E 定位缺失问题。GitHub Actions 4 个 Job（pytest、Ruff、Vitest、TypeScript 构建、Playwright E2E 61 项）已达成 100% 全绿通过（Run ID `36110825298`）。工作树干净并已与 `origin/main` 完全同步。

---

### 新会话接力协议（针对用户提问：“看看当前项目还有什么未完成的，或者要搞的”）

当用户开启全新的会话窗口并询问当前未完成事项时，接手的 Agent（Codex / Claude / agy 等）应先查阅 `docs/ai/EXEC_PLAN.md` 与工作树。2026-09-25 的状态是 BACKLOG-062～064 均已完成，EXEC_PLAN 中没有 `[READY]` 任务；不要再次启动下方这段已完成序列的历史 Prompt。

#### 历史启动 Prompt（BACKLOG-062～064 已完成，仅供追溯）

```text
【你现在以首席量化系统架构师与前端资深全栈工程师身份，执行 FinQuant Hub 的用户真实体验闭环优化任务。

背景与前置状态：
- 后端基础服务与行情能力正常，已配置默认 CommandCode 供应商（模型 deepseek/deepseek-v4.1-flash 已就绪并加密存储）。
- 此前已完成 BACKLOG-050～061，但用户在实机走查中发现了三大体验与业务割裂问题：
  1. 资料库（Knowledge）中策略动态图无法使用、点击无反应、内嵌静态 iframe 且返回链接破损；
  2. 模型管理中点击“拉取模型”后仅弹窗提示已拉取，既未呈现拉取到的候选模型列表，也无法点击选择或一键回填/添加；
  3. 供应商管理界面充斥了 18 个与当前用户配置完全无关的国内外部厂商大网格（通义千问、智谱清言、MiniMax、Kimi等平铺），干扰核心操作。

任务执行计划序列：
- 任务 1：BACKLOG-062（资料库策略互动演示原生化与量化业务一键接通，任务书 docs/ai/tasks/BACKLOG-062.md）
- 任务 2：BACKLOG-063（模型管理拉取模型交互闭环与候选模型直观选用，任务书 docs/ai/tasks/BACKLOG-063.md）
- 任务 3：BACKLOG-064（供应商管理界面精简净化与协议驱动重构，任务书 docs/ai/tasks/BACKLOG-064.md）

核心原则：
1. 架构不变量：无 ORM、无连接池、无 WebSocket（全 SSE）、零引入新第三方依赖。
2. 样式与主题：全站消费 Design System 的 --fq-* CSS 变量，绝不硬编码颜色值。
3. 真实业务闭环：资料库策略点击一键直达 /strategy-lab 并预填对应标的与参数；拉取模型展示搜索过滤标签并可一键回填；供应商界面默认只展示 OpenAI 兼容 / Anthropic 协议卡片，外部厂商收拢至折叠抽屉并高亮当前已配置供应商。
4. 自动化验证：每张任务卡必须跑通针对性测试（bun run test ...）与 bun run build，保持全绿。

请从 docs/ai/tasks/BACKLOG-062.md 开始自主推进开发与验证闭环。】
```


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

### 发布前收尾（已完成，2026-09-13 实测复核）

- [x] **LICENSE 文件**：Apache-2.0 已授权（Copyright 2026 Satanchen），根目录 `LICENSE` 已存在
- [x] **docs/PRD.md 3.2 节**加一行引用注释指向 TECH_STACK.md
- [x] **docs/PRODUCT_MAP.md** 单行技术栈加引用
- 核实说明（2026-09-13 指挥实测）：`Test-Path LICENSE` → **True**；`docs/PRD.md` L151 与 `docs/PRODUCT_MAP.md` L23 均已有 `TECH_STACK.md` 引用——三项实际均已完成，上列仅系文档未及时勾选（BACKLOG-046 收尾）。

### 不阻塞发布（长期）

- [x] ~~Design System 新老双轨迁移（`--fq-*` tokens 只被新组件消费，旧硬编码色值 `#dce5ef`/`#1890ff` 未迁移）~~ **已证伪（2026-09-04 复核）**：Astra 会话 B 全量扫描 152 文件 0 匹配 + DSH 复扫 `frontend/src` `#dce5ef|#1890ff` 0 匹配，颜色已全量收敛到 `--fq-*` tokens（UI-004 期间完成，旧结论过时，诚实撤回）
- [x] Graphiti/Mem0 生产 memory 方案：ADR-005 已于 2026-08-24 采纳 **Native FTS5**；AIOS-004/034 的可选 PoC 与 AIOS-071/072/073 继续按 `EXEC_PLAN.md` 的 BLOCKED/PARKED 状态管理。

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
| `docs/PRD.md` | ✅ 3.2 节已引用 TECH_STACK.md（2026-09-13 复核） |
| `docs/PRODUCT_MAP.md` | ✅ 已引用 TECH_STACK.md（2026-09-13 复核） |
| `docs/DELIVERY.md` / `docs/DEPLOY.md` | 提及式，保留 |
| `docs/audit/functional-gap.md` | ✅ 已加引用注释 |
| `task/PROJECT_CONTEXT.md` | ✅ 已重写去重 |
| `README.md` / `CLAUDE.md` | ✅ 已加 TECH_STACK 引用 |
| `docs/ai/*.md`（CONTRACT/BASELINE） | 契约文档，保留 |

**原则**：不要大规模删改历史文档内容，只加引用注释。

## 未决问题与下一步（Open Questions / Next Steps）

1. **P2-2 请求错误态清理**：46 个剩余调用点待逐项评估；按单实体、单请求推进，避免批量改写。Portfolio 真实持仓首批已完成。
2. **BLOCKED/PARKED 项**：继续按 `docs/ai/EXEC_PLAN.md` 的触发条件管理；截至 2026-09-25，BACKLOG-062～064 已完成，当前没有 `[READY]` 任务。
3. **Design System 新老双轨**：长期维护项，不阻塞当前技术债演进。
4. **生产 memory 方案**：Native FTS5 已由 ADR-005 采纳；可选 PoC 状态按 EXEC_PLAN 保留。
5. **浏览器视觉证据**：历史记录确认 Dashboard hero、MarketBrief、LatestNews、DecisionCard 的 accessibility snapshot；不要把该记录扩张为全路由视觉矩阵验收。

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

- 2026-09-02 维护者独立复核 BACKLOG-021 通过：v1 回测路由下线（main.py 移除）+ 3 文件回收站回收（backtest.py/engine.py/test_backtest_engine.py）+ 第 3 个测试/helper/import 补删 + sentinel 22→21 + Chat 回测按钮重定向 Strategy Lab（仅取 ticker 预填、不提交回测）+ 新增固守测试（backtest_runs 表保留 + Alpha 共享 metrics 正常），禁止文件（metrics/database/v2/Agent 工具/共享测试）零改动，无 rm、无删表 | 验证: backend 798/798 + cov 92.34%（92.28→）+ ruff；双环境 17/17；frontend build + Vitest 124/354 + E2E 50/50；zh/en parity 2274/2274 差集0；git diff --check 通过；已提交

- 2026-09-03 维护者独立复核 BACKLOG-022 通过：6 文件（3 死组件+3 同名测试）回收站回收、零引用再验证（src+e2e 均 0 残留）、bundle 实测 0 字节变化——验证成立：主入口实为 index-8ilTy0GW.js（1119KB 的 index-dM8hBGUF.js 非入口），echarts 早已被 LazyEChart 懒加载，死组件本就被 tree-shake 不在 bundle；Codex 诚实记录实际结果未虚报，LazyEChart/依赖/vite/playwright/backend 零改动，无 rm | 验证: build 通过；Vitest 121/346（首轮 AlphaSimulationWorkbench 超时为既有负载问题，复测+次轮全绿）；E2E 50/50；zh/en parity 2274/2274 差集0；git diff --check 通过；已提交

- 2026-09-03 维护者独立复核 BACKLOG-023 通过：echarts/core 按需注册（echartsSetup.ts 4图表+Grid/Tooltip/Legend/DataZoom/MarkLine/MarkPoint+CanvasRenderer）+ LazyEChartCore（echarts-for-react/lib/core + echarts prop）+ LazyEChart lazy 改指，5 测试仅同步 mock 路径断言不变；独立量化 ECharts chunk 1119KB→624KB（≈-44%），package.json/bun.lock/vite/playwright/三个业务使用者零改动（SHA256 表），无删除 | 验证: build 通过；Vitest 121/346；E2E 50/50；git diff --check 通过；已提交

- 2026-09-04 维护者独立复核 BACKLOG-024+025 通过：024 package.json 删 pro-components 加 pro-layout@^7.22.7（唯一依赖变更）、bun.lock 清死依赖树 -62 行、node_modules 残留为 bun 不自动 prune 特性（lock 权威 + build 复验无隐性缺失）；025 README/ROUTER_MAP 三处计数统一 22/135/169 与运行时 OpenAPI 一致（另修 README L90/L101 同目标）；vendor-antd 0 字节为技术正确（子包未 import 不进 bundle）；playwright 内置 Chromium 无 channel: chrome；无删除无越界 | 验证: build 通过；Vitest 121/346；E2E 50/50；backend 798/798（Codex 报告）；git diff --check 通过；已提交

- 2026-09-04 会话收尾：BACKLOG-016 至 025 全部 DONE（单进程托管→start.bat/QUICKSTART→favicon+端口收敛→筹码走势图→v1回测回收→死组件回收→echarts按需→依赖卫生→文档计数），EXEC_PLAN 无 READY 待办，工作树干净；项目指标 backend 798/798 cov 92.34%、frontend Vitest 121/346 E2E 50/50、i18n parity 0、内置 Chromium 测试无 channel: chrome | 验证: HEAD 0545c2c，工作树干净，后续见新会话方向规划

- 2026-09-04 新会话启动：方向 A（恢复实测验收）确认，维护者调研后决定开 BACKLOG-026 卡交 Codex——既有 50 个 E2E 全跑 4173 Vite dev + mock，从不经过 8000 单进程真实入口（start.bat → 127.0.0.1:8000），016-019 托管层无浏览器级验收证据；026 = 新建独立 `playwright.8000.config.ts` + `frontend/e2e-8000/` spec（≥10 用例，真实 index/assets/favicon/SPA 深层刷新 + Dashboard/导航 + 020/013/014/015 关键证据页容器），外网数据请求 route 拦截返回真实形状夹具，保 4173 基线 50 零改动 | 验证: 环境核验（HEAD 0545c2c、工作树仅 HANDOFF 未提交、start.bat 存在、8000/5173 空闲、dist/venv/.env/DB 就绪、frontend/api baseURL=/api 相对同源、playwright 1.62 内置 chromium）；BACKLOG-026.md 已创建、EXEC_PLAN 已注册 [READY]

- 2026-09-04 BACKLOG-026 Codex 完成 + 维护者复核：新增独立 `playwright.8000.config.ts` + `e2e-8000/` 2 spec/15 例（真实 8000 index/assets/favicon/SPA 深层刷新/八组导航/chip/money-flow/dragon-tiger/limit-pool），外网 API 全拦截返回真实形状夹具；8000 15/15 ×3（--retries=0）+ 代理开关各 15/15；4173 50/50、build 4,242 modules、Vitest 121/346、backend 798/92.34%、Ruff 全过；边界复核干净（backend/src/4173 基线/依赖锁零改动、删除 0）。Codex 诚实停在 [BLOCKED]：真实 8000 CSP `frame-ancestors 'none'` 拦中文 Knowledge 同源 iframe → 子 frame localStorage pageerror，修复点在卡禁止范围。维护者复核属实（security.py L31/L35 + Knowledge.tsx L137-151 + dist 9 html），缺陷记录 docs/HANDOVER.md；026 产物 commit 8424aa6 | 验证: git 边界（HEAD d94f875→8424aa6，仅允许文件）、代码审阅（spec 质量高：精确隔离已知子 frame 错误、其余错误仍失败、不掩盖）、CSP/iframe/dist 三处独立核实

- 2026-09-04 缺陷处置决策（用户选方案 A：CSP 允许同源嵌入）+ 开 BACKLOG-027 卡：security.py 仅两处 `frame-ancestors 'self'` + `X-Frame-Options: SAMEORIGIN`（仍禁第三方站嵌、允许同源嵌，不自锁）、test_security 同步、8000 E2E 删容忍分支恢复严格零 pageerror、026 转 DONE、HANDOVER Broken→Verified | 验证: 027 卡已创建、EXEC_PLAN 已注册 [READY]，commit 待记（工作树：027 卡 + EXEC_PLAN 注册 + HANDOFF 变更日志）

- 2026-09-04 维护者独立复核 BACKLOG-027 通过：security.py 仅两处取值改 frame-ancestors 'self' + X-Frame-Options: SAMEORIGIN（防点击劫持保留、同源嵌入放行，无按路径豁免）；test_security.py 同步 + 新增 frame-ancestors 'self' 断言；8000 E2E 删 localStorage 容忍分支恢复严格零 pageerror；实测中文 /knowledge m1 iframe 正文可见、pageErrors=[]；026 转 DONE、HANDOVER Broken→Verified | 验证: 独立复核：ruff 通过；backend 798/798 cov 92.34%；build 4,242 modules；Vitest 121/346（894s）；4173 E2E 50/50；8000 E2E 15/15 两次独立复跑（41.6s/40.6s 均 exit 0）；git diff --check 通过；HEAD 8c4b3c2 已提交、工作树干净

- 2026-09-04 新方向 A+B 结合大任务（用户指定）+ 开 BACKLOG-028 卡：维护者只读探针实锤 known debt #1 ticker 边界三处真实破损——①BRK.B/BRK-B 同标分裂（usBRK.B vs usBRK-B，test_market.py L48 旧断言固化分裂形态）；②6 位非 6/68/0/3 开头（830799/920002/430047）静默 sh（无 bj 数据源，应诚实拒绝非扩源）；③前端 4 处 ticker 逻辑漂移（researchContinuity/globalTaskEntry/Alerts/backtest request 用途各异不可乱合并）。028 = 后端 canonical 收口（BRK.B/BRK-B 统一 + 诚实拒绝 + 契约矩阵单测）+ 前端共享 tickerContract.ts 收敛 + 8000 真实入口 E2E ≥4 用例 + 全量门禁 | 验证: 028 卡已创建（docs/ai/tasks/BACKLOG-028.md）、EXEC_PLAN 已注册 [READY]，commit 待记

- 2026-09-04 维护者独立复核 BACKLOG-028 通过：canonical ticker 契约收口（BRK.B/BRK-B/usBRK.B 统一 usBRK-B；6 位非 6/0/3 段 830799/920002/430047 及 bj 诚实拒绝不再静默 sh；external/yahoo 映射冻结）+ 前端共享 tickerContract.ts 收敛 4 调用方（key/探测/显示/抽取用途保持）+ 契约矩阵测试 + 8000 真实入口 6 新用例（BRK.B↔BRK-B 同标的/830799 诚实提示/0700→00700.HK/组合回测预填）；known debt #1 收口、CLAUDE.md 同步 | 验证: 独立复核：backend 837/837 cov 92.41% + ruff；build 4,243 modules；Vitest 122/374（918s）；i18n zh/en 各 2274 差集 0；4173 E2E 50/50；8000 E2E 21/21（含 6 ticker 新用例）；git diff --check 通过；HEAD 97aed66 已提交、工作树干净

- 2026-09-04 archify（arc画图）批量生成 FinQuant Hub 五类可视化图：architecture/workflow/sequence/dataflow/lifecycle HTML + specs JSON（22 Router/135 API、52 表、4 Agent 并行+主编、SSE、last_status 状态机等真实事实） | 验证: 每图 validate --quality showcase 9/9 通过、deliver 0 errors；architecture+workflow visual-check 通过 1440x900，sequence/dataflow/lifecycle 需滚动（与官方同型样例一致）；人工截图评审无遮挡截断；输出 archify-output/

- 2026-09-04 GPT-6 Astra 上线调研 + 双会话审查（Codex 应用，A=架构 medium / B=UI high）：两会话只读审查原文存档 `docs/ai/astra-review/`（session-A/session-B，commit 87bcdd9）。A 组发现 P1 待核断言（job 事务原子性/SSE 断连留 running/立即运行竞态）+ P2（工具线程上下文/主编失败仍完成/重启恢复/行情语义）；B 组（残色已清零推翻旧结论/图表主题不重取色/证据抽屉主题断裂/提问不接住/筛选术语 ROE/FCF 误识别）。切换 DSH 自主执行，BACKLOG-029 已注册 [READY]（任务书 docs/ai/BACKLOG-029.md） | 验证: 存档 2 文件与用户贴回逐字一致；任务书已建、EXEC_PLAN 已注册；HEAD 待提交

- 2026-09-04 BACKLOG-029 阶段 0 + P1×3 修复（DSH 自主执行第一轮）：阶段 0 只读核验产出 `docs/ai/astra-review/verification-2026-09-04.md`（A/B 组 18 断言 → 证实/证伪/记录三态表，内存探针实证 A2 rollback 失效、B7 正则误识别 ROE/FCF/CAGR）；P1 修复——A4 立即运行排队改原子条件更新（防并发覆盖 running/双 run）、A3 SSE 断连清理改独立任务 shield（finally 二次取消不再留永久 running，新增全 ASGI 断连回归）、A2 database.exclusive_transaction 统一事务所有权（execute 事务内不隐式提交、异常/取消统一回滚，research_jobs 五事务函数收敛 + 回滚/取消探针测试）；B1 旧结论诚实修正（HANDOFF"残色未迁完"条目勾除并注明 Astra+DSH 双扫描 0 匹配已证伪） | 验证: backend 845 passed（837 基线 +8 新测试）、cov 92.41%→92.51%、ruff 全过；既有 SSE 错误路径 25/25 无回归；commit 依次 c0b13b5/A 组 3 个（35d3a50/d6e5450/5f81378）；工作树待收尾（HANDOFF 已改未提交）；后续轮：A5/A8 P2 后端 + B6/B7 用户可感 + B2/B3 主题类 + 阶段 2/3

- 2026-09-04 BACKLOG-029 第二轮（DSH）：A5/A8 P2 后端 + B6/B7 用户可感完成——A5 工具线程恢复用户上下文（_run_tool_in_thread set_current_user）+ validate_tool_arguments 类型前置校验，user_id 透传 research/swarm 双编排；A8 行情语义三项（分钟 K 跳腾讯日线备源、新浪缺失字段 0→None、大陆指数直连腾讯不经股票校验）；B6 默认研究页接住 ?prompt=（预填+自动搜索）；B7 Discover 筛选词黑名单（ROE/FCF/CAGR 不再当代码） | 验证: backend 851/851（845+6）、前端 Vitest 123/378（122/374+4）、build 通过；commit 248f213（A5）+815eb7b（swarm 测试适配）+363d5f0（A8）+3e0a27a（B6）+4f955e8（B7）；剩余：B2/B3/B4/B5 主题/尺寸类 + E2E 4173/8000 + 阶段 3 收尾（EXEC_PLAN 转部分完成）

- 2026-09-04 BACKLOG-029 第三轮（DSH）：B2-B5 前端主题/尺寸类全部完成——B2 useLightweightCharts MutationObserver 监听 .app-theme 重取色（3ab276e）；B3 EvidenceDrawer/Rail Drawer getContainer 挂回主题子树（a7d31a5）；B4 ConfigProvider token 映射 --fq-*（colorPrimary/圆角/语义色，单主色来源）+ B5 siderWidth 240、radius token 6/8/8→8/12/16 对齐 DESIGN_SYSTEM（f34af8b）；核验表 B2-B5 状态更新 | 验证: 前端 Vitest 123/378 全绿、build 通过、组件套件无回归；E2E 无 radius/sider 断言；剩余：E2E 4173/8000 全量 + 阶段 3 最终收尾

- 2026-09-05 维护者独立复核 DSH 自主执行的 BACKLOG-029 通过：Astra 双会话审查处置 14 commit（0adbea1..9a616e3）——stage0 核验表（18 断言三态+探针实证）+ A2 事务所有权/A3 SSE 断连/A4 排队竞态（P1）+ A5 工具线程上下文/A8 行情语义（P2）+ B1 证伪修正/B6 提问接住/B7 筛选词 + B2 图表重取色/B3 抽屉主题/B4 AntD token 映射/B5 尺寸对齐；复核中修正 2 处收尾声称 diff check 通过但实际存在的 EOF 空行（68ddd0c） | 验证: 独立复核：backend 851/851 cov 92.52% + ruff；build 通过；Vitest 123/378（796s）；4173 E2E 50/50；8000 E2E 21/21；i18n zh/en 2274 差集 0；git diff --check 全链 0adbea1..HEAD 归零（修正后）；工作树干净

- 2026-09-05 B12（Astra 遗留产品级项）推进：任务29 产出只读设计文档（b12-design-2026-09-05.md，HEAD 未变约束满足）→ 维护者审阅通过（独立 grep 抽核：删顶部 MetricStrip 对 E2E 零影响成立、metric-total-return 在 BacktestSummary 内、chat-paths:351 文案锁定正确、StrategyLab 现状行号准确）→ 按用户选择拆三张顺序执行卡 BACKLOG-030（②-C/②-E/②-D 低风险批）/031（②-A/②-B 布局+IR 折叠）/032（重做① Step C→A→B→D），设计文档入库、EXEC_PLAN 三卡 [READY]、B12_EXECUTION_RUNBOOK.md 接力协议（开场白/复核/放行）就绪 | 验证: HEAD b44702e 工作树干净；commit 2924846（三卡+EXEC_PLAN）+ b44702e（设计入库）+ 待 runbook 提交

- 2026-09-05 BACKLOG-030 DONE：删 StrategyLab 顶部 MetricStrip（②-C）；BacktestSummary pct() 空值直传 + quality 真实推导 + FinancialMetric 承接 unknown（②-E）；MDD 全站唯一化 --fq-risk（②-D） | 验证: build 通过；Vitest 123/378；4173 E2E 50/50；8000 E2E 21/21；backend 851/851 cov 92.52%（零后端改动）；i18n parity 0；diff --check 通过；删除 0；未 commit

- 2026-09-06 维护者复核 BACKLOG-030 通过并合入（B12 第一张卡 DONE）：②-C 删 StrategyLab 顶部重复 MetricStrip（BacktestSummary 内 metric-* 与结论 Alert 全保留）；②-E BacktestSummary pct() 空值原始直传 + qualityOf 真实推导（UNKNOWN/UPSTREAM_ERROR/PARTIAL/OK）+ FinancialMetric 承接 unknown 占位（组件零改动、零新 i18n key）；②-D 全站 MDD 语义唯一化 --fq-risk；测试同步语义不放松 | 验证: 独立复核：代码审阅（约束全落实、run.provenance 依赖真实、'未知' 用既有 key）；build 通过；聚焦 Vitest 15/15（BacktestSummary/StrategyLab/MetricStrip）；git diff --check 通过；HEAD c49c754 工作树干净；Codex 报告全量 123/378、4173 50/50、8000 21/21、backend 851/851 cov 92.52% 与其记录一致

- 2026-09-06 BACKLOG-031 DONE（B12 第二张卡，②-A 布局 + ②-B IR 折叠）：执行 Worker c1d6750a（首派 20cfc8fa 被误中断 idle 搁置）在完成代码后验证阶段被终止，维护者接手补完——②-A `.strategy-lab-layout` grid（左 360px setup + 右弹性 results，@media<900px 单栏，Run 在 TaskPageHeader actions 常驻）；②-B IR 卡改 Collapse 折叠"用一句话填写规则"（解析逻辑零改动，watchlist/references 保留原结构不臆造）；i18n title 换文案 + 4 新 key parity 0，chat.backtest.tickerRequired（chat-paths:351 依赖）锁定未动 | 验证: 维护者独立复核：代码审阅（文案锁定/按钮保留/结构不臆造）；build ✓；聚焦 StrategyLab 10/10；全量 Vitest 123/378；4173 E2E 50/50；8000 E2E 21/21；i18n 2277 parity 0；git diff --check 通过；HEAD 待提交

- 2026-09-06 BACKLOG-032 代码完成（B12 第三张卡，重做① Step C→A→B→D，DSH Worker 执行，待维护者复核合入）：Step C agentRailOpen 初始 false（桌面默认折叠，空 Rail 不占宽；deep 模式 Research.tsx×4 AgentStatusCard + analyst SwarmStatusCard 呈现真实阶段）；Step A ⌘K 收敛 AppLayout 单次（dispatch GLOBAL_TASK_OPEN_EVENT）+ CommandBar triggerOnly + 唯一 hideTrigger GlobalTaskEntry 宿主（ProLayout children 顶层，全站单弹窗单实例）；Step B 全局底部 Composer 移除、仅 /research/:symbol、/analysis/:ticker 渲染追问条（携带对象，提交 /research/:symbol?prompt= 原问题保留）；Step D DecisionCard 删平铺 provenance 行 + 证据 chip 点击进既有 EvidenceDrawer（B3 主题回归核对）；i18n +composer.followupPlaceholder（2278 parity 0） | 验证: build ✓；聚焦 C 11/11、A 6/6、B 3/3、D 10/10（迁移后 10 files/32 tests）；全量 Vitest 123 files/382 tests（×2 全绿）；4173 E2E 50/50（×2）；8000 E2E 21/21（--retries=0；首轮 5 fail 定位为 hero triggerOnly aria 冲突 + 宿主未挂载，修复后 ticker-input 6/6 + 全量 21/21）；i18n parity 0；git diff --check 通过、删除 0；未 commit（交维护者按 C→A→B→D 分步合入）

- 2026-09-06 维护者复核 BACKLOG-032 通过并合入（B12 三卡全 DONE，重做①完成）：Step C AgentRail 默认折叠（空右栏不占宽，AgentStatusCard/SwarmStatusCard 呈现真实阶段）；Step A ⌘K 单注册 + CommandBar triggerOnly + 顶层 hideTrigger 唯一宿主（全站单弹窗；与设计文档"header 内嵌"措辞偏离但 8000 实证更稳——header 槽不挂载弹窗，顶层保证任何路由挂载）；Step B Composer 仅带标研究语境渲染（无标提问走 hero 弹窗/B6 路径）；Step D DecisionCard 删平铺 provenance（EvidenceChip.tsx:35 自带 EvidenceDrawer 承载细节，信息不丢）。维护者独立复核：git 边界（19 文件全在允许清单）+ 代码审阅（EvidenceChip 闭环确认、测试语义增强非放宽、⌘K 事件模型正确）+ build/聚焦 21/21/全量 Vitest 123/382/4173 50/50/8000 21/21 独立复跑全绿；commit 1a28d89 | 验证: git diff --check 通过、删除 0、i18n 2278 parity 0；B12 三卡（030/031/032）全部 DONE、EXEC_PLAN 同步；工作树待收尾

- 2026-09-06 维护者复核 BACKLOG-032 通过并合入（B12 三卡全 DONE）：重做①连续工作面——Step C AgentRail 默认折叠（AgentStatusCard 呈现真实阶段）/ Step A ⌘K 单注册+CommandBar triggerOnly+顶层 hideTrigger 唯一宿主（全站单弹窗）/ Step B Composer 仅带标研究语境追问（原问题携带）/ Step D DecisionCard 平铺 provenance 入 EvidenceChip 抽屉 | 验证: 独立复核：git 边界（19 文件允许清单内）+ 代码审阅（EvidenceChip.tsx:35 自带抽屉闭环、测试语义增强、⌘K 事件模型）；build ✓；聚焦 21/21；全量 Vitest 123/382；4173 E2E 50/50；8000 E2E 21/21；i18n 2278 parity 0；git diff --check 通过；commit 1a28d89 + 5d453e7；B12（030/031/032）EXEC_PLAN 全 DONE

- 2026-09-06 BACKLOG-033 代码完成（Astra A6 主编降级诚实展示 + B8 专业指标文案，DSH Worker 执行，待维护者复核合入）：A6-1 report_builder.py build_unified_report 顶层新增 lead_review_status（audited|degraded，与 team_lead_review.model_output_status 同源映射；落库路径实证 research_orch done→research.py _complete_report UPDATE report_data + scheduler 计划任务 + GET json.loads 整体返回，编排零改动）；A6-2 Research.tsx reportToMarkdown 具名导出 + degraded 时 markdown 顶部前缀 **deep.report.degradedNotice**（chapters/legacy 两形态统一，audited/缺省不回归，状态机/通知零改动）；B8 BacktestSummary Professional/P1 折叠区 6 个硬编码英文 label（Sharpe/Sortino/Calmar/Beta/R²/Tracking Error）换 strategy.metric.* key（testId/结构/E2E 依赖文案零改动）；i18n +7 key（degradedNotice + 6 label，zh/en 2285 parity 0）；后端测试断言 audited/parsed 与 degraded/unknown 映射、新建 ResearchReportToMarkdown.test 4 用例 | 验证: backend 853/853 cov 92.53%（92.52→ 不降）+ ruff 本卡文件全过；build ✓；聚焦 8/8；全量 Vitest 124 files/386 tests（+4）；4173 E2E 50/50；8000 E2E 21/21；i18n 2285/2285 parity 0；git diff --check 通过、删除 0；未 commit（交维护者复核合入）。附注：全量 ruff 待并行 BACKLOG-034 Worker 收尾其 _probe_*a7 探针（F841）后归零；另修复基线遗留 test_research_sse_disconnect_backlog029.py 缺尾换行 W292（1 字符测试卫生，见任务证据文档诚实声明）

- 2026-09-06 维护者复核 BACKLOG-033/034 通过并合入（Astra A6/A7/B8 三项落地）：033 report_builder 顶层 lead_review_status + Research reportToMarkdown degraded 提示（两形态）+ BacktestSummary 6 英文 label key 化（i18n 2285 parity 0）；034 scheduler 定时路径 report INSERT+run 回填收进 _run_tx_lock + exclusive_transaction 原子落盘 + _RUN_TX_LOCKS 按 loop 惰性写锁（必要范围扩展：scheduler gather 并发下单连接 BEGIN IMMEDIATE 不可嵌套）+ 2 回归测试。034 Worker 于并发探针阶段终止，维护者接手：5 个 _probe_*a7 探针回收站清理、补证据文档 docs/ai/tasks/BACKLOG-034.md、独立复核（写锁必要性核证：scheduler.py L284 gather 并发 + A2 事务基建）、全量门禁复跑 | 验证: 独立复核代码审阅（033 改动精确/034 写锁必要且锁只覆盖短写段不损并发）；backend 853/853 cov 92.53% + ruff 全过；build ✓；全量 Vitest 124/386；4173 E2E 50/50；8000 E2E 21/21；git diff --check 通过；删除 0（探针 untracked 残留回收站清理）；EXEC_PLAN 033/034 转 DONE；HEAD 待提交

- 2026-09-07 维护者复核 BACKLOG-033/034 通过并合入（Astra A6/A7/B8 落地）：033 report_builder 顶层 lead_review_status + Research reportToMarkdown degraded 顶部提示 + BacktestSummary 6 英文指标 label key 化（i18n 2285 parity 0，状态机/通知零改动）；034 scheduler 定时路径 report INSERT+run 回填 exclusive_transaction 原子化 + _RUN_TX_LOCKS 写锁（必要范围扩展）+ 2 回归；034 Worker 并发探针阶段终止后维护者接手（5 探针回收站清理 + 补证据文档 + 复核） | 验证: 独立复核：backend 853/853 cov 92.53% + ruff 全过；build ✓；全量 Vitest 124/386；4173 E2E 50/50；8000 E2E 21/21；git diff --check 通过；commit 8ee4d31（033）+ 80a9051（034）+ 7783e7e（文档）；EXEC_PLAN 033/034 DONE；工作树干净
- 2026-09-07 BACKLOG-035 代码完成（B9 首用引导：LocalCapabilityBanner 双状态，DSH Worker 执行，待维护者复核合入）：单 Alert → `workbench-capabilities` 双 Alert——model_ai 行逐字段原样 + market_data 行（quality_status !== 'OK' 时 warning"行情源状态待检查——行情数据可能暂不可用" + 诚实描述 + 动作落 /discover，可用即不渲染）；判定经 string 宽化（types/index.ts 不在允许清单仅声明 UNKNOWN 字面量，未越权改）；i18n zh/en 各 +3 key（marketPending/marketPendingDescription/marketExplore，2288 parity 0，既有 model_ai key 未动）；app.css +1 行双 Alert 8px 分层；Dashboard.test LocalCapabilityBanner +2（RUNTIME_CHECK_REQUIRED 显示提示+动作、OK 隐藏市场行；model_ai 既有断言零改动） | 验证: build ✓；聚焦 Dashboard 7/7；全量 Vitest 124 files/388 tests（+2）；4173 E2E 50/50；8000 E2E 21/21（--retries=0）；i18n 2288/2288 parity 0；git diff --check 通过、删除 0；未 commit。诚实声明：Banner 自 8a0be88 重构后未挂载进 Dashboard 渲染区（仅导出+单测覆盖），挂载需改 dashboard.spec mock 属卡禁止范围，本卡按 §允许 落成组件级双状态，详见 docs/ai/tasks/BACKLOG-035.md

- 2026-09-07 BACKLOG-035b 代码完成（B9 挂载收口：LocalCapabilityBanner 接入 Dashboard 首屏 + E2E mock 同步，DSH Worker 执行，待维护者复核合入）：Dashboard.tsx hero 后决策区前挂载 `{stats?.capabilities ? <LocalCapabilityBanner capabilities={stats.capabilities} onNavigate={navigate} /> : null}`——stats 就绪非 null 才首屏渲染、null/加载态不渲染不闪 banner；组件本身零改动仅接线；dashboard.spec.ts `/api/dashboard/stats` mock 补 capabilities 字段（model_ai UNCONFIGURED + market_data RUNTIME_CHECK_REQUIRED/UNKNOWN，与后端契约 & types/index.ts:351-362 一致，仅加字段既有断言零改动）；Dashboard.test 新增整页渲染 describe +3（stats 含 capabilities → Banner 全可见；stats 悬挂 → 不渲染；market_data quality OK → 市场行隐藏 model 行保留） | 验证: build ✓；聚焦 Dashboard 10/10；全量 Vitest 124 files/391 tests（388+3）；4173 E2E 50/50；8000 E2E 21/21（--retries=0）；i18n 0 新增 parity 2288/2288；git diff --check 通过、删除 0；未 commit（交维护者复核合入）

- 2026-09-07 维护者复核 BACKLOG-035/035b 通过并合入（B9 首页可见落地）：035 LocalCapabilityBanner 双状态组件（model_ai 保留 + market_data 非 OK 诚实提示 + 动作 /discover，i18n 3 key parity 0）；035b 挂载 Dashboard 首屏（stats 就绪渲染、null 不闪）+ dashboard.spec mock 补 capabilities（仅加字段不改断言）+ 整页渲染 3 用例；035 Worker 诚实上报 Banner 未挂载问题由 035b 承接，避免虚假完成 | 验证: 独立复核：035/035b 代码审阅（挂载 2 行接线正确、mock 仅补字段、渲染用例覆盖 no-flash 与真实入口 DOM）；build ✓；全量 Vitest 124/391；4173 E2E 50/50；8000 E2E 21/21（真实入口 Banner 出现零 pageerror）；i18n 2288 parity 0；git diff --check 通过；commit 18962f7（035）+ 25e3b43（035b）；EXEC_PLAN 035/035b DONE；工作树干净

- 2026-09-07 A1 图码对齐：派隔离 Worker 用 archify v2.17 重画五张架构图（用户指示"子代理执行 arc 重画"）——读仓库证据→写 specs（specs-v2 比对后回收站清理，specs/ 权威）→validate+deliver 均 9/9、visual-check 覆盖（architecture/workflow 全视口、sequence/dataflow/lifecycle 纵向需滚动与官方同型一致）→README 重写事实口径。对齐漂移：22 Router/135 paths/169 ops；schema v24（48 CREATE TABLE、v24 删三张遗留组合表）；17 工具（A 股四新工具上墙）；SSE 事件口径（report_started/agent_*/tool_call/report_progress/done，completed 仅 DB 状态）；Agent 先 LLM 后工具循环 ≤5 轮；validate_tool_arguments 类型前置校验（A5 修复后现状）；lifecycle queued 仅手动触发、failed 可自动重试非死端 | 验证: 维护者抽验 architecture spec（FastAPI 22 Router/135/169、SQLite schema v24、research 4 Agent 并行+主编节点）+ README 事实口径段一致；五图收据 SHA-256/bytes 记录于 Worker 报告；archify-output gitignored git status 干净、backend/frontend/docs 零改动；commit 29e8478 后工作树干净

- 2026-09-08 维护者接管 UX 三块修复并复核 Codex 产物合入（对应 BACKLOG-036/037/038/039）：①模型管理 api_key 加密直存（复用 credential_store、持久化本地 key 文件）+ llm_client URL 不二次拼接（removesuffix 归一）+ /api/models/discover 拉模型列表 + test 报错可行动含脱敏；②Discover 空态示例/公司名自然语言搜索/行业主题 DiscoverThemes + 涨停池术语 tooltip 释义（indicatorKnowledge 范式）+ 中文默认语言；③导航收口（移除全局重复研究模式入口，模式保留研究页内） | 验证: 独立复核：三块代码审阅通过（URL 归一/加密 key 持久化/discover 用户隔离/空态不造假/术语释义/导航收敛）；i18n 2320 parity 0 独立确认；Codex 报告门禁 backend 868/868 cov 92.59%、build 4244、4173 50/50、8000 21/21 与其证据一致；全量 Vitest 3 失败定位为 FundamentalMetricsPanel 环境性超时（独立复跑 2/2 过、非 UX 回归）；按模型/Discover/导航/共享 i18n 四组 commit（97636bc/39c1c61/f43fefe/73ad902）+ 状态收尾 eb06f76；工作树干净

- 2026-09-11 BACKLOG-040 代码完成（Token 用量面板增强：按日趋势 + 会话级明细，DSH Worker 执行，待维护者复核合入）：Settings 用量区汇总后新增「按日趋势」`UsageTrendChart`（复用 `useLightweightCharts.switchToArea`，`data-testid="usage-trend-chart"`，纯函数 `usageToAreaData` 映射 daily→AreaChartData，无效点丢弃不补造，空态诚实占位，独立组件不抽象）+「按日」表后新增「用量明细」`UsageRecordsPanel`（拉 `/api/usage/records?limit=50`，time/model/总量/会话 id，空态「暂无用量数据」，失败诚实展示）；后端补 `GET /api/usage/records`（用户隔离、ORDER BY created_at DESC,id DESC、limit 1-200、可选 session_type 过滤，返回 items+total）；i18n zh/en 各 +11 key 2331 parity 0 | 验证: backend 870 passed cov 92.59%（92.53→）+ ruff 全过；build ✓；聚焦 UsageComponents 7/7 + Settings 4/4；全量 Vitest 127 files/407 tests（124/391→，+3 文件 +16 用例）；4173 E2E 50/50；8000 E2E 21/21（--retries=0）；i18n 2331/2331 parity 0；git diff --check 通过、删除 0、未 commit（交维护者复核合入）。诚实声明：新端点 `/api/usage/records` 属卡 §允许，但 `docs/API_CONTRACT.md`/`docs/ROUTER_MAP.md` 不在卡 §允许清单，未改动，留维护者复核按 AGENTS.md doc-sync 补录

- 2026-09-08 维护者复核 BACKLOG-040 通过并合入（Token 用量面板增强，CC Switch Usage Query 参考）：Settings 用量区新增按日趋势图（UsageTrendChart 复用 useLightweightCharts + usageToAreaData 纯函数）+ 会话级明细面板（UsageRecordsPanel）+ 后端 GET /api/usage/records（用户隔离/倒序/limit 1-200/session_type 过滤）+ 测试（后端 2、前端 7+1）；维护者补录 API_CONTRACT/ROUTER_MAP（Worker 按卡边界未动） | 验证: 独立复核：records 端点用户隔离/排序/边界审阅通过；records 测试 2/2、聚焦 Vitest 11/11、build 通过；Worker 报告全量 backend 870/cov 92.59%、Vitest 127/407、4173 50/50、8000 21/21、i18n 2331 parity 0；git diff --check 通过；commit 172db26；工作树干净

- 2026-09-11 BACKLOG-041 代码完成（模型供应商预设模板库：CC Switch 式独立模块 + 扩常用供应商，DSH Worker 执行，待维护者复核合入）：新增 `frontend/src/features/modelPresets.ts`（`MODEL_PRESETS` 8 项 = 现有 3 国际 openai/deepseek/openrouter + 新增 5 国内 dashscope/glm/kimi/doubao/siliconflow，`{id,labelKey,baseUrl,remarkKey?}` + `presetBaseUrl(id)` 未知 id 返回 undefined，纯数据零依赖）；Models.tsx provider Select 选项与 base_url 自动填充改用模块（删内联 presets 对象），custom 保留且不自动填逻辑不变（presetBaseUrl('custom')→undefined 不 setFieldValue）；i18n zh/en 各 +5 key（models.provider.dashscope/glm/kimi/doubao/siliconflow）2336 parity 0；新增 modelPresets.test.ts 6 用例（3 国际 base_url 断言/新增 ≥5 国内存在/结构完整+合法 http(s)/id 唯一/labelKey zh+en 均有/未知 id 返回 undefined）+ ModelsForm.test.tsx +1 provider 切换自动填用例（DeepSeek/通义千问/硅基流动自动填 + custom 不覆盖手动值） | 验证: build ✓；聚焦 10/10；全量 Vitest 128 files/414 tests（127/407，+7）；4173 E2E 50/50；8000 E2E 21/21（--retries=0）；i18n 2336/2336 parity 0；git diff --check 通过、删除 0、未 commit。诚实声明：base_url 逐一核实——siliconflow（官方 docs 快速上手）/kimi（官方 platform.moonshot.cn）/glm（官方 docs.bigmodel.cn openai-sdk）官方直证；~~dashscope（阿里云官方 compatible-mode 路径 + CC Switch 参考项目预设同值）；doubao（火山方舟官方「Base URL 及鉴权」页客户端渲染，经 CC Switch 参考项目预设 DouBaoSeed 同值交叉核实）~~ **【2026-09-13 更正撤回】dashscope/doubao 的"CC Switch 预设交叉核实"来源声明不成立**：只读核实 CC Switch 源码（`E:\DeepSeek_Harness\workspace\2026_08_17\cc-switch-src`）后确认其 `src/config/piProviderPresets.ts` 无 doubao、全仓无 dashscope/DouBaoSeed 预设，且当时实际只经 web_fetch 读过其 GitHub README、从未读源码；该两端点值保留但仅表述为生态公认值；百度千帆因官方文档客户端渲染未能当场核实端点，按"拿不准宁可不加"纪律未加入

- 2026-09-08 维护者复核 BACKLOG-041 通过并合入（模型供应商预设模板库，CC Switch 预设精神）：新建 frontend/features/modelPresets.ts 预设库（8 项：3 国际保留 + 5 国内 dashscope/glm/kimi/doubao/siliconflow，base_url 经官方文档核实；**2026-09-13 更正：原"参考项目核实"表述撤回，dashscope/doubao 无 CC Switch 预设来源**）+ Models.tsx 改用模块（custom 保留、切换自动填 base_url 不回归）+ i18n 5 key parity 0 + modelPresets 测试 6 例 + ModelsForm 切换用例；百度千帆因官方文档未当场核实按'拿不准宁可不加'放弃（诚实纪律） | 验证: 独立复核：modelPresets.ts 数据（8 预设 base_url 核实表、presetBaseUrl 未知 id 返回 undefined 保 custom 安全）+ Models.tsx 改用 diff 通过；聚焦 Vitest 10/10、build 通过；Worker 报告全量 Vitest 128/414、4173 50/50、8000 21/21、i18n 2336 parity 0、backend 零改动、未 commit；git diff --check 通过；commit 811bad2；工作树干净

- 2026-09-13 BACKLOG-042 代码完成（MCP stdio transport 接通：表/路由/前端，DSH Worker 执行，待维护者复核合入）：mcp_server_configs 建表可空 url + 新增 command/args_json/env_json 列 + v25 SAVEPOINT 增量迁移（_MCP_STDIO_VERSION=25、_SCHEMA_VERSION→25、_install_mcp_stdio_transport() 幂等 ALTER，旧 http 行兼容，fresh/v24→25 实测补列）；mcp.py create/update 经 bridge url/command 二选一校验（neither/both→422）+ args 数组 + _public_config 按 command 回显 transport http/stdio；mcp_runtime.py 新增 connect_mcp_server(config) 统一分派（bridge 内部 url→Client、command→StdioServerParameters+stdio_client，复用 MCP SDK **零新依赖**）；前端 mcpApi/MCPServerSettingsPanel transport 切换（http url / stdio command+args，中文提示）+ openapi.generated 同步 + i18n zh/en 各 35 key parity 0；API_CONTRACT/ROUTER_MAP 同步；新增 backend/tests/test_mcp_transport.py 确定性 6 用例（不真启外部进程）| 验证: 本收尾会话沙箱受限——backend ruff app+tests 通过；test_mcp_transport 6 用例 + 迁移 2 场景经等价 driver 全绿（pytest 进程化受沙箱 pytest tmp 目录枚举 WinError5 阻断）；frontend `tsc -b` 通过、openapi_tsgen --check fresh、i18n parity 0；`git diff --check` 通过、删除 0、单条 commit。诚实声明：vite build/Vitest 与 pytest 进程化门禁因委托沙箱（esbuild child spawn EPERM / pytest tmp WinError5）未跑通，建议维护者常规环境补跑 `backend pytest -q`、`bun run build`、`MCPServerSettingsPanel.test.tsx`；stdio 真启外部进程端到端未测（深度受限）

- 2026-09-13 主指挥会话收尾：①**Token 上限根因复盘落盘**——新建 `memory/MAIN_SESSION_TOKEN_DISCIPLINE.md`（根因：子代理隔离的是"它的推导"非"进出它的文本"；最大单项开销是系统提示+工具 schema 每请求重发≈130KB×30 次；auto-compact 只是安全网，累积超压缩即周期性掐断；大件逗留）+ 6 条纪律（短证明/日志只留指针/状态先落盘/goal 一句话/阶段性 commit+复盘/大件切片）+ 进主会话 vs 必须落盘对照清单；`memory/README.md` 建索引。②**BACKLOG-042 门禁补跑（指挥验收，danger-full-access）**：`pytest backend/tests/test_mcp_transport.py` **6/6 passed**（2.18s）、`bun run build` **exit 0**（48.36s）——子代理诚实声明"沙箱未跑通"的 3 项门禁补跑全绿；残留 `backend/.tmp-pytest/`、`backend/.dsh-bt-816b76ff/` 回收站清理。③BACKLOG-042 提交 ed02b20 已验收（16 文件全在卡允许清单、零依赖、删除 0、未 push）| 验证: commit ed02b20、`git status` 仅 `?? memory/`（本会话新增，待提交）；BACKLOG-042 卡与 EXEC_PLAN 已 [DONE]；CHANGELOG 已同步。剩余：stdio 真启外部进程端到端（高级，留后续）；memory/ 提交待做

- 2026-09-13 BACKLOG-043 代码完成（供应商管理模块，DSH Worker 执行，待维护者复核合入）：预设库 8→**15 条**（国内 7 / 国际 8，每条 base_url 附官方文档 URL + 关键行，新增 `category`/`docsUrl`）+ 新增 `components/models/` 四件套（ProviderCard 卡片信息层级 / ProviderHealthBadge 三态+最后检查时间 / ProviderPresetSelector 分组+搜索 / providerState 健康·启停·搜索纯函数）+ Models.tsx 卡片列表（默认，单列 Table 以保 `system-pages.spec.ts:35` 的 `tbody tr` 断言）+ 表格视图切换 + 供应商搜索 + 显示已停用 + 弹窗内分组预设选择器（custom 不覆盖手动值，036/037 契约未动）；健康检测复用既有 `POST /api/models/{id}/test`（**零新端点、零后端改动**）；i18n zh/en 各 +36 key 2371/2371 parity 0；CC Switch 源码 file:line 引用表 19 条。**诚实声明**：doubao 因官方文档客户端渲染无法直证已从预设库移除（041 来源声明已于 2026-09-13 撤回）；ollama 已官方直证但被现有 `type:'url'` 校验拒绝故未加；groq/mistral/xAI/Perplexity/baichuan/千帆/sambanova 列入"未加入清单+原因"；启停为**本地偏好**（无后端 enabled 列） | 验证: build ✓；聚焦 Vitest 7 files/39 tests；全量 Vitest 132 files/443 tests → 441 passed（2 项环境性超时 FundamentalMetricsPanel/ProfessionalPreferences 隔离复跑 11/11 全绿）；4173 E2E 50/50；8000 E2E 21/21（--retries=0）；backend ruff ✓ + pytest 871 passed/5 项**预存**失败（042 的 v25/mcp 遗留）；i18n 2371/2371；git diff --check exit 0；删除 0；未 commit（交维护者复核合入）

- 2026-09-13 **CC Switch 参考来源审计 + 不实声明撤回 + 三卡注册**（用户质问"到底有没有基于 CC Switch 把供应商/计价/使用统计模块做出来"）：核实结论**没有**——①"参考 CC Switch"实际只经 web_fetch 读其 GitHub README，从未读源码（会话日志 `cc-switch` 57 次全为 web 结果，`cc-switch-src`/`GitHub_Repos` 0 命中，无文件读取落在 cc-switch 目录）；②供应商实为 `modelPresets.ts` 36 行/8 条静态预设（CC Switch 为 `components/providers/` 12 文件 + `universal/` 3 + `config/` 12 预设文件）；③**计价模块为零**（llm_usage 仅 token，无 cost/price 字段；CC Switch 有 PricingConfigPanel/PricingEditModal/modelsDevPricing.ts/model_pricing.rs）；④使用统计仅 2 小组件（CC Switch 7 个）。**撤回**：BACKLOG-041 原称 dashscope/doubao base_url "经 CC Switch pi 预设（DouBaoSeed）交叉核实"不成立（`piProviderPresets.ts` 无 doubao，全仓无 dashscope/DouBaoSeed 预设），已更正 tasks/BACKLOG-041.md、EXEC_PLAN.md、HANDOFF.md 两处；端点值保留、来源表述撤回。**新注册三卡 [READY]**：BACKLOG-043 供应商管理、BACKLOG-044 计价模块（全新）、BACKLOG-045 使用统计详情；三卡均**强制要求给出 CC Switch 源码 file:line 引用**，禁止再声称交叉核实却未读源码 | 验证: 只读核查 `E:\DeepSeek_Harness\workspace\2026_08_17\cc-switch-src` 源码结构与预设/计价文件清单 + 会话日志引用统计；三卡落盘并注册；工作树仅文档改动

- 2026-09-13 BACKLOG-042b 代码完成（BACKLOG-042 回归修复：5 项既有测试跟上 v25/分派改动，DSH Worker 执行，待维护者复核合入）：**只改测试，`backend/app/**` 零改动**——①`test_legacy_research_and_backtest_tickers_are_normalized` 迁移列表断言改为「v1..v24 逐条字面量（删除/改名/跳号照旧失败）+ v25 起从 `database._MIGRATION_NAMES` 派生并要求真落库」+ 尾项锚定 `_SCHEMA_VERSION`；②③`test_job_runtime_*`/`test_schema_cleanup_*` 的 `== _SCHEMA_VERSION == 24` 改为 `== _SCHEMA_VERSION` + 显式断言 v23/v24 已在 `schema_version` 中按名记录（遗留三表被删/`portfolios` 未受影响/pre-v24 备份内遗留表可恢复/append-only/四列等核心断言一字未动）；④⑤两个 MCP 用例 patch 目标由已不存在的 `connect_http_mcp_server` 改为实际分派入口 `connect_mcp_server`，fake 改收 `(config)`，保留 https url 断言并新增 `config.command is None`（HTTP 不得走 stdio）与成功行 `last_error is None`（成功需清错误），"单服务器失败不阻断其他服务器恢复 + 记录失败"原断言保留 | 验证: 全量 `pytest -q` **876 passed / 0 failed，覆盖率 92.57%**（修复前 871 passed + 5 failed = 876，总数不变）；聚焦 67 passed；**变异验证**（`%TEMP%` 进程内 pytest 插件、生产零改动）漏登记版本→用例1 `KeyError`、历史迁移改名→用例1 `AssertionError`、restore 去 per-server try/except→用例5 `TimeoutError`，证明断言仍有效；`ruff check .` exit 0；`git diff --check` exit 0；删除 0；未 commit。**生产缺陷：无**（附观察：`mcp_runtime.connect_http_mcp_server` 已无生产调用点，是否收口交维护者裁决）。详见 `docs/ai/tasks/BACKLOG-042b.md`

- 2026-09-13 BACKLOG-044 代码完成（计价模块从零建成：模型单价配置 + 按 token 估算费用，DSH Worker 执行，待维护者复核合入）：schema **v26** `model_pricing`（`_MODEL_PRICING_VERSION=26`、`_SCHEMA_VERSION` 25→26、`_MIGRATION_NAMES[26]=install_model_pricing`、SAVEPOINT 增量迁移、`_OWNER_TABLES` 追加；v25 库补建实测且 `llm_usage` 记录零改动）+ 新增 `backend/app/routers/model_pricing.py`（`/api/model-pricing` GET/POST/PUT/DELETE，owner 隔离 404、同 owner 重复 409、422 校验非空模型名/非负有限单价/非空币种，`source` 固定 manual）+ `usage.py` 新增 `GET /api/usage/cost` 并在 `/api/usage/records` 追加 `priced`/`currency`/`estimated_cost`（`estimate_cost()` 为唯一换算口径；缺价 `priced:false`+`estimated_cost:null` **绝不返回 0**；`cost_by_currency` 分币种、混合币种合计 null、不做汇率换算）+ 前端 `services/usageApi.ts`、`components/settings/PricingConfigPanel.tsx`、`PricingEditModal.tsx`（step 0.0001 / min 0）、Settings 用量区费用段与明细费用列；**无内置单价**（无官方定价页直证，仅手工配置入口，UI 与文档如实声明）；CC Switch 源码 file:line 引用表 16 条（含 3 处有意分歧：显式 409 替代静默 upsert、formatCost 保留极小非零、读取时派生不回填历史）| 验证: backend 全量 `pytest -q` **888 passed / 0 failed，覆盖率 92.62%**（基线 876/92.57%，新增 12 例）；`ruff check .` exit 0；`bun run build` exit 0（prebuild openapi `--check` fresh）；聚焦 Vitest 2 files/15 tests；全量 Vitest 133 files/451 passed；4173 E2E **50/50**；8000 E2E **21/21**；i18n zh/en **2415/2415 parity 0**；`git diff --check` exit 0；删除 0；未 commit。**取舍（待裁决）**：唯一键用 `(user_id, model_name)` 而非卡片字面「唯一 model_name」（为满足用户隔离）；改价后历史费用按新价重算（不落库快照），若需历史快照另开卡。详见 `docs/ai/tasks/BACKLOG-044.md`

- 2026-09-13 BACKLOG-045 使用统计详情模块完成（DSH Worker，待复核）：范围选择器（预设 7/30/90 + 自定义起止）+ 后端 start/end 兼容 days（非法半参/倒置/格式错/跨度>366 诚实 400）+ UsageHero 汇总卡（总 token/输入输出/调用次数/日均/窗口天数/最活跃模型/费用，复用 044 cost_status）+ 新增 GET /api/usage/stats 维度聚合（按模型/按会话类型，六列可排序）+ 纯函数 usageRange/usageStats + 契约同步（usage.py 0/3→0/4，139/175→140/176）+ i18n +24 key | 验证: backend 909 passed/0 failed cov 92.67%（基线 888/92.62%）；ruff exit 0；build 4261 modules；聚焦 Vitest 38 passed；全量 Vitest 134 files/470 passed；4173 E2E 50/50；8000 E2E 21/21；i18n 2439/2439 parity 0；git diff --check exit 0；删除 0；未 commit；UsageTrendChart/UsageRecordsPanel 零 diff，UsageComponents 7/7、Settings 4/4、PricingConfigPanel 8/8 原断言未改。详见 `docs/ai/tasks/BACKLOG-045.md`

- 2026-09-13 BACKLOG-046 文档收尾完成（纯文档，未 commit）：HANDOFF 顶部三项（LICENSE 存在、PRD L151 / PRODUCT_MAP L23 TECH_STACK 引用）实测均完成改为 [x] + 日期核实行；Graphiti/Mem0 行补注 ADR-005 定 Native FTS5；EXEC_PLAN AIOS-004/034/071 各加一行如实注释（状态标签未动）；README 0 命中无过时口径 | 验证: 复测 Test-Path LICENSE=True、PRD L151 / PRODUCT_MAP L23 grep 命中；git diff --check exit 0；删除 0；未 commit

- 2026-09-13 BACKLOG-047 死代码收口完成（DSH Worker，待维护者复核合入）：`mcp_runtime.py` 移除零调用点薄封装 `connect_http_mcp_server`（函数+docstring，59→54 行），`connect_mcp_server`/`restore_enabled_mcp_servers`/imports 一字未动 | 验证: 移除后代码全仓 grep 0 命中（backend app/tests + frontend src/e2e/e2e-8000 + scripts + memory，含变体 connect_http/connectHttp 0；docs 历史证据按卡 §目标3 如实注明已收口）；全量 backend pytest **909 passed / 0 failed**（与 045 基线一致）；ruff exit 0；git diff --check exit 0；删除 0；未 commit；测试零改动（042b 已改 patch 目标）。诚实环境声明：沙箱 `no_proxy` 含 `[::1]` 触发 httpx 0.28.1 `Invalid port: ':1]'`（首轮 12 failed + 89 errors 全同根因与删除无关），Python 进程内覆盖 `no_proxy` 重跑门禁零代码改动。详见 `docs/ai/tasks/BACKLOG-047.md`


- 2026-09-23 Mission 1/2 完成：实现提交 `93e7563` 收敛 ResearchReportEvent 类型、recent 缓存损坏恢复、Swarm 取消事件持久化与回放、Portfolio 持仓三态读取、start.bat requirements SHA-256 同步；P2-2 扫描器确认 46 个剩余调用点并记录 Portfolio 首批收敛。已与 GitHub 私有 `main` 无覆盖合并，远端独有 `PUBLIC_SOURCE_MANIFEST.json` 保留。| 验证：Vite build 4,265 modules / OpenAPI 60 schemas fresh；聚焦 Vitest 4 files/31 tests；backend `test_swarm.py` 2/2；Ruff；`start.bat --check-only`（237 CRLF、0 lone LF）；`git diff --check`；harness audit exit 0。隐私启发式仍报告 masked phone/email/key 类命中；已抽查的 phone 样本位于保留清单 `PUBLIC_SOURCE_MANIFEST.json` 的 SHA-256 字段，其余命中尚未逐项分类，不据此宣称均已排除。

- 2026-09-23 完成 Mission 1/2 文档收尾并准备同步至私有 GitHub | 验证: 核心验证已记录；文档差异检查 git diff --check 通过；仓库可见性 PRIVATE

- 2026-09-23 BACKLOG-055 部分完成：分析引擎与 Discover 图表已实现，因子分析 ID 数据源待用户确认。 | 验证: 后端 7 项（--no-cov）、前端 2 项、Ruff 与 bun build 通过；卡内原样 pytest 7 项断言全过，但全仓 coverage 0.9% 未达 80% 导致退出码 1；GET 端点未接入。

- 2026-09-23 BACKLOG-055 收尾校准：已按用户提交的观察值接入 POST 分析与用户级 GET 缓存读取；旧“GET 未接入/待确认数据源”记录由本条 supersede。 | 验证: `test_alpha_analytics.py` 11/11（`--no-cov`），Ruff、AlphaFactorAnalytics 3/3 与 `bun run build`（60 schemas / 4,272 modules）通过；卡内 pytest 11 项断言通过但全仓 coverage 3.4% < 80% 退出码 1。

- 2026-09-23 BACKLOG-056 完成：新增 owner-scoped 风险 Tear Sheet，基于真实共同日线回放当前股数，补水下回撤、持续期、滚动夏普/波动、月收益矩阵、集中度和协方差风险贡献；币种/复权/行情覆盖质量透明；Portfolio 新增默认 Tear Sheet Tab，保留旧风险模拟 Tab。| 验证: 后端聚焦 7/7（--no-cov）+ Ruff、原样命令 7 项断言通过但全仓 coverage 3.6% 未达 80% 退出非零；前端 3/3；build 4,275 modules；OpenAPI 145/182；无新表/依赖、无真实行情请求。

- 2026-09-23 BACKLOG-057 完成：新增 `/api/market/sector-treemap`、`dragon-tiger-network`、`sentiment-ladder` 与 Discover 延迟加载的市场全景子标签；复用 AStockExtra/Eastmoney 直接数据，不加依赖/表。行业分类限于东财行业板块（非申万一级），炸板率因失败涨停分母缺失保持 UNKNOWN，席位边仅为共现观察。| 验证: `test_market_graph.py` 3/3（`--no-cov`）、目标 Ruff、前端 4/4、`bun run build` 4,278 modules / OpenAPI 60 schemas fresh；`app.openapi()` 148 路径 / 185 操作；自动化测试用 mock；窄屏浏览器烟测触发 3 次东财请求（本地 API 1 次 200、2 次 502 RemoteProtocolError），当前活动面板显示明确错误态；未提交。

- 2026-09-23 BACKLOG-058～061 浏览器 E2E 序列完成；BACKLOG-061 稳定化席位图悬停并更新任务记录 | 验证: BACKLOG-061 combined Chromium E2E 2/2 no retry; both specs standalone 1/1; pageerror=0 and console.error=0; git diff --check exit 0; AntD, React Router, and ECharts warnings recorded; screenshots inspected.

- 2026-09-24 实机体验走查反馈与体验闭环任务规划（BACKLOG-062～064 就绪）：录入 CommandCode 供应商配置并在 DB 中安全加密持久化（默认模型 deepseek/deepseek-v4.1-flash 联通验证通过）；服务停机释放端口 8000；梳理实机反馈并立项三张任务卡（062 资料库原生化+回测联动、063 拉取模型直观选择卡片与一键填入、064 供应商协议驱动与外部预设折叠收拢）；更新 EXEC_PLAN、NEXT_BACKLOG 与接力 Prompt。 | 验证: 端口 8000 释放确认；新任务卡 docs/ai/tasks/BACKLOG-062~064.md 结构完整，注册状态 [READY]；git diff --check 通过。

- 2026-09-24 Completed the BACKLOG-062/063/064 bounded WorkSet; all three cards are marked DONE with focused evidence. Changes remain uncommitted pending the repository confirmation rule. | 验证: 062 focused tests and Chromium E2E passed; 063 ModelsForm 4/4 and build passed; 064 ProviderPresetSelector/ModelsCards/ModelsForm 17/17 and build passed; responsive Chromium review at 1440 and 390 px; git diff --check passed.

- 2026-09-24 BACKLOG-062/063/064 closeout: corrected the 063/064 evidence dates to the workspace local date and consolidated the changelog entries. | 验证: git diff --check passed; card-specific gates are recorded as passed. Full bun run test was interrupted after prolonged JSDOM chart errors with 14 ResearchWorkspaceEvidence and 1 ResearchFollowupPrompt failures observed; no final suite summary or lingering Vitest process. No commit made.

- 2026-09-24 Current-tree revalidation of BACKLOG-062/063/064 gates and refreshed 064 Chromium visual captures. | 验证: 062 KnowledgeInteractive 3/3, build, Chromium E2E 1/1; 063 ModelsForm 4/4 and build; 064 selector/cards/form 17/17 and build; all builds have fresh 60-schema types and zero TS errors. git diff --check passes. The full bun run test remains incomplete after unrelated unchanged ProCandlestickChart/JSDOM failures; no Vite server or test process remains. Mission run-state stays active; no commit.

- 2026-09-24 BACKLOG-062/063/064 card gates revalidated; full frontend suite failed outside the locked WorkSet | 验证: Focused tests 062 3/3, 063 4/4, 064 17/17 and bun run build exit 0; full bun run test exit 1 with 4 failed files (18/709 tests, 35 errors); git diff --check exit 0; no commit

- 2026-09-24 Compared full frontend suite against clean HEAD baseline f79d22ac9d8e74401e48920b3eb01cc1b347f271; no additional failures from BACKLOG-062/063/064 | 验证: Baseline: 4 failed files, 18 failed/682 passed tests, 35 errors; worktree: same 4 files and 18 failures/35 errors, 691 passed incl. nine more tests. Focused card gates and bun run build pass; git diff --check passed; no commit

- 2026-09-25 GitHub 私有推送与双平台 CI/CD 全绿（响应“建议一”）：确认远程仓库 `satan9394/finquant-hub` 属性为私有（isPrivate: true）；配置 GitHub Actions `ci.yml` 引入 Linux (`ubuntu-latest`) 与 macOS (`macos-latest`) 双平台构建与测试矩阵；系统性清零修复全部历史遗留缺陷（后端 schema/docstring、前端 JSDOM CSS/ResizeObserver 崩溃、Tear Sheet 异常、E2E 交互定位与 Tab 切换），CI 4 个 Job 达成 100% 全绿。 | 验证: GitHub Actions Run ID `36110825298` 4 个 Job 全部通过（backend ubuntu-latest 2m8s、backend macos-latest 1m56s、frontend macos-latest 6m39s、frontend ubuntu-latest 16m19s）；全套 pytest、Ruff、Vitest、OpenAPI 生成检查、bun run build、Playwright 61 项 E2E 测试全绿；工作树整洁。

- 2026-10-04 sites 依赖安全升级 next 16.2.11→16.3.8（消 3 条 Dependabot critical）+ 修复 pnpm11 allowBuilds 占位符（sites/frontend 两处）+ CI frontend job 由 bun 改 pnpm 并新增 sites job + dismiss reference/ 下第三方快照的 Dependabot 告警。文件：.github/workflows/ci.yml、sites/package.json、sites/pnpm-lock.yaml、sites/pnpm-workspace.yaml、frontend/pnpm-workspace.yaml、tasks/CHANGELOG.md。未 commit、未 push。 | 验证: sites: pnpm install/build 通过、pnpm test 全绿（node --test 1/1 + bun test 26/26）；frontend: pnpm install --frozen-lockfile 与 pnpm run build 通过（vitest 本机超时，已知环境问题）；ci.yml YAML 解析通过（jobs=backend/frontend/sites）；Dependabot 开放告警 100→3（仅 sites/next）

- 2026-10-04 传递依赖安全收敛：pnpm overrides 从无效的 package.json 顶层迁到 pnpm-workspace.yaml；sites 升 undici 7.29.1 / sharp 0.35.5 / ws 8.21.0 / esbuild 0.28.2 / image-size 2.0.3，frontend 升 path-to-regexp 8.4.0；braces 无上游修复版故 dismiss(reference 与 braces)。文件：sites/pnpm-workspace.yaml、frontend/pnpm-workspace.yaml、sites/package.json、两处 pnpm-lock.yaml、tasks/CHANGELOG.md。 | 验证: sites pnpm install 后 lockfile 全收敛（旧版本 0 残留）+ build 通过 + test 全绿(1/1 + 26/26)；frontend path-to-regexp=8.4.0 + build 通过。react-router 需 6->7 大版本，未动，单列。
