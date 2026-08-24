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
