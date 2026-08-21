# HANDOFF —— 项目交接档案

> 用途：跨会话/跨 agent 接续的权威档案。会话结束时更新；新会话先读本文件再动手。
> 由 harness-engineering v4.11.0 `bootstrap.py --init` 生成，首次真实工作替换于 2026-08-20，最近更新 2026-08-21。

## 当前目标（Objective）

收敛为现象级个人量化投研产品：功能已基本完备（88 个任务全部 DONE），当前阶段聚焦 **UI/UX 优化**——将 Design System v1.0 落地到全部核心页面，提升视觉一致性和用户体验。同时整理项目 MD 文档体系（技术栈集中、去重、修正过时数据）。

## 完成标准（Definition of Done）

已完成：
- [x] Design System v1.0 tokens（`--fq-*` CSS 变量）已定义并接入新组件
- [x] Dashboard 从"金融仪表盘"重构为"evidence-first workbench"
- [x] Research/Discussion/Portfolio/Backtest 页面接入新组件族
- [x] 全部新组件与修改文件已 git commit（7 个 commit，见下方变更日志）
- [x] `bun run build` 通过（23.79s，TypeScript tsc --noEmit 零错误）
- [x] 后端 `/api/dashboard/news` 端点可用（浏览器实机验证 MarketBrief/LatestNews/DecisionCard 可见）
- [x] 技术栈文档集中：docs/TECH_STACK.md 建立为唯一权威来源

未完成（下一步做）：
- [ ] docs/ 目录技术栈信息分布梳理与去重（见"docs/ 技术栈清理任务"章节）
- [ ] LICENSE 文件（Apache-2.0 已授权，根目录未创建，发布前必须完成）
- [ ] Design System 新老双轨迁移（`--fq-*` tokens 只被新组件消费，旧硬编码色值未迁移）—— 不阻塞

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
- **技术栈信息系唯一权威**：只看 `docs/TECH_STACK.md`；其他文件中的技术栈表优先加引用/注释而非重复维护

## 当前运行状态（2026-08-21 会话结束时）

后台任务（pwsh 后台作业）：
- `pwsh-1` **running** — 后端 uvicorn `127.0.0.1:8000`（health ok / WAL）
- `pwsh-3` **running** — 前端 vite `localhost:5173`（strictPort，HTTP 200）
- `pwsh-2` completed（早期 strictPort 失败尝试，可忽略）

重要环境事实：
- **5173 曾长期被旧 Docker 容器占用**（`finquant-hub-local-frontend-1`，`127.0.0.1:5173->80`，旧镜像）——这是"页面没变化"的真正原因。已 `docker stop` 该容器 + 旧后端容器 `finquant-hub-local-backend-1`。
- 前端 dev 用 `bun run dev -- --strictPort --port 5173` 固定端口；若再报 "port in use"，先 `docker ps` 查容器、`netstat -ano | findstr 5173` 查进程。
- 用户要求不要偷偷换端口：端口被占用要杀掉占用者，不是换新端口。

## docs/ 技术栈清理任务（用户最后提出的问题）

用户问：`docs/` 下面这么多 `.md`，技术栈信息是不是也有重复/过时需要清理？

已完成的 grep 分析（93 处技术栈相关匹配），结论：

| 文件 | 技术栈信息 | 处置 |
|------|-----------|------|
| `docs/TECH_STACK.md` | 唯一权威来源（已建） | ✅ 保留 |
| `docs/ARCHITECTURE.md` | 架构图含 React 18/AntD 5/lightweight-charts/aiosqlite | 保留（架构文档，引 TECH_STACK 即可，无需删） |
| `docs/PRD.md` | 完整技术栈表格（3.2 节）+ 目录结构 | 历史需求文档，**加引用注释**即可，不改内容 |
| `docs/DELIVERY.md` | FastAPI 任务执行器提及 | 提及式，保留 |
| `docs/DEPLOY.md` | FastAPI 三件套提及 | 提及式，保留 |
| `docs/PRODUCT_MAP.md` | 单行技术栈 + 数据源 | 提及式，保留 |
| `docs/audit/functional-gap.md` | 历史审计技术栈表 | ✅ 已加引用注释（上次会话完成） |
| `docs/ai/PROJECT_CONTRACT.md` | "FastAPI + React 全栈"一句话 | 提及式，保留 |
| `docs/ai/ARCHITECTURE.md` | 摘要式 | 提及式，保留 |
| `docs/ai/*.md`（各种 CONTRACT/BASELINE） | 各自领域提及 | 契约文档，保留 |
| `task/PROJECT_CONTEXT.md` | 技术栈表 + 目录结构 | ✅ 已重写去重（上次会话完成） |
| `README.md` | 架构速览 | ✅ 已加 TECH_STACK 引用（上次会话完成） |
| `CLAUDE.md` | Key files 表 | ✅ 已加 TECH_STACK 引用（上次会话完成） |

**剩余可做（下次会话执行）**：`docs/PRD.md` 3.2 技术栈节加一行引用注释指向 TECH_STACK.md；`docs/PRODUCT_MAP.md` 单行技术栈加引用。其余保持不动。**不要**大规模删改历史文档内容。

## 未决问题与下一步（Open Questions / Next Steps）

1. **docs/ 技术栈引用注释**：PRD.md 3.2 节 + PRODUCT_MAP.md 单行 → 加 TECH_STACK.md 引用（小改动，可直接做）。
2. **Design System 新老双轨**：`--fq-*` tokens 只被新组件消费，既有样式硬编码色值（`#dce5ef`、`#1890ff`）。长期全量迁移，当前不阻塞。
3. **Graphiti/Mem0 选型**：AIOS-004/005/034 仍 BLOCKED，依赖第三方包安装和 ADR 决策。不阻塞 Local OSS v1。
4. **LICENSE 文件**：Apache-2.0 已授权（Copyright 2026 Satanchen），根目录 LICENSE 未创建。发布前必须完成。
5. **浏览器视觉验收**：Dashboard hero、MarketBrief、LatestNews、DecisionCard 已通过 accessibility snapshot 验证可见；用户可打开 http://localhost:5173/ 实测，如有视觉问题再做 CSS 调整。

---

## 变更日志（每轮结束追加一条）

- 2026-08-20 首次填充 HANDOFF.md，同步项目真实状态。Harness 治理层从骨架升级为可用。工作树 15 modified + 12 new 待提交。
- 2026-08-20 完成 4 个 commit：harness governance init、Design System v1.0 + UI redesign（10 新组件 + 5 页面重构 + CSS tokens + 后端 news）、harness infrastructure（.harness/ + scripts/ + hooks + skills）、design docs + UI screenshots。84 文件，+11,684/-961 行。TypeScript 零错误、Vite 构建通过、audit.py exit 0。
- 2026-08-21 修复端口占用的根因：旧 Docker 容器长期占用 5173 跑旧镜像，docker stop 后前端固定 5173（strictPort）。浏览器自动化（browser-skill）实机验证 Dashboard 新组件全部可见。
- 2026-08-21 commit `e9b4be4`：技术栈整合——新建 docs/TECH_STACK.md（唯一权威来源），重写 task/PROJECT_CONTEXT.md（14→23 路由器、6→13 工具、15→52 表、66→133 端点），README/CLAUDE.md 加引用，functional-gap.md 加历史注释。
- 2026-08-21 更新本档案：同步运行服务状态、docs/ 技术栈清理任务分析、下一步计划。