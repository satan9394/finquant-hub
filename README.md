# FinQuant Hub

个人全栈金融量化研究 Web 系统 — A/港股/美股多市场行情、技术分析、AI 多 Agent 投研、投资组合与策略回测。

> 当前交付目标：GitHub 获取、个人电脑本地安装和自用。运行时包含 23 个 APIRouter、133 个 `/api/*` 路径和 168 个 HTTP 操作。

## 安装与启动（两种路径）

不熟悉命令行？先看 [非技术用户快速上手](docs/QUICKSTART.md)，按“下载 → 双击 → 打开页面”开始。

### 路径 A：本地 Docker（推荐）

本地模式前后端全部运行在 Docker 中，浏览器端口仅绑定 `127.0.0.1`。应用使用一个内部本地所有者，不显示登录页、不发送验证码，也不创建浏览器会话；`user_id` 仍作为本地数据归属键保留。这是当前面向使用者的推荐安装路径，也是开源可复现的构建路径。

前置条件：Docker Desktop，或 Docker Engine + Docker Compose v2。克隆仓库并进入项目根目录后运行：

```powershell
# 首次 up 会创建 Git 忽略的 .env.local，先通过 doctor，再构建和启动
.\scripts\local.ps1 up

.\scripts\local.ps1 doctor
.\scripts\local.ps1 status
.\scripts\local.ps1 logs
.\scripts\local.ps1 down
```

Linux、macOS 或其他带 Bash 的 POSIX 环境使用同一组动作：

```bash
bash ./scripts/local.sh up

bash ./scripts/local.sh doctor
bash ./scripts/local.sh status
bash ./scripts/local.sh logs
bash ./scripts/local.sh down
```

启动成功后打开 `http://127.0.0.1:5173`；如果在 `.env.local` 修改了 `LOCAL_PORT`，使用对应端口。`doctor` 是只读检查，会报告关键文件、Docker CLI/daemon、Compose v2、配置格式、端口占用和 Compose 解析状态。`up` 在检查失败时不会启动服务，已有 `.env.local` 也绝不覆盖。

没有模型 API key 时系统仍可启动，非 AI 的本地功能不因此被禁用；模型驱动的聊天、讨论和研究能力需要在 `.env.local` 配置兼容的 `DEEPSEEK_API_KEY`（以及需要时的 `DEEPSEEK_BASE_URL`、`DEFAULT_MODEL`）。首页会把模型状态标为 `UNCONFIGURED` 或 `CONFIGURED_UNVERIFIED`：配置存在不代表真实连通，只有在模型管理中显式测试才能验证当次上游。行情等外部数据能力始终保留 `RUNTIME_CHECK_REQUIRED`，需要网络和对应上游可用；拿不到数据时应保留 UNKNOWN、PARTIAL 或 UPSTREAM_ERROR，不会补造数值。

`down` 只停止容器，不删除保存 SQLite 数据的 named volume。脚本不会执行 `down -v`、删除数据、杀掉端口进程或回显密钥。邮箱登录和公网安全配置仍保留在非本地模式中，但本地 Compose 不启用它们。

维护者可运行 `./scripts/verify_local_install.ps1` 做隔离发布源演练。它使用随机 Compose project、独立 loopback 端口和独立 volume，真实执行 image build/start、local-only HTTP 检查、`down`/`up` 持久化以及 SQLite 非覆盖 backup/restore；结束后停止隔离容器但保留证据 volume。当前工作树未提交时，这项结果不是 GitHub clean-clone 证据。

### 路径 B：本地开发（无 Docker，裸机运行）

不装 Docker 时也可直接运行前后端。前置：Python 3.12 venv、Node 20+ / Bun 1.3+。数据库使用仓库内 `backend/data/finquant.db`（首次启动自动建库迁移）。

```powershell
# 后端（默认 127.0.0.1:8000）
cd backend
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload

# 前端（默认 localhost:5173，Vite 代理 /api → 8000）
cd frontend
bun install
bun run dev
```

打开 `http://localhost:5173` 即进入本地模式（与路径 A 相同的 LOCAL_ONLY 内部所有者语义）。若 5173 被占用，按项目约定先查 `netstat -ano | findstr 5173` 杀掉占用者，不擅自换端口。本路径用于日常开发，发布验收以路径 A 为准。

已有 `frontend/dist` 构建产物时，可在后端进程环境或 `backend/.env` 设置 `SERVE_FRONTEND=1`（或 `true`），使用单个 uvicorn 进程托管前端；默认关闭，dist 缺失时警告并跳过，Docker 仍由 nginx 托管。

#### Windows 一键启动

先安装 Python 3.12（勾选加入 PATH）与 Bun，然后在项目根目录双击 [start.bat](start.bat)：缺少环境时自动创建 Python venv、安装项目已有依赖，需要时构建前端（否则复用 dist），以 `SERVE_FRONTEND=1`、`LOCAL_ONLY_MODE=1` 单进程启动并打开 `http://127.0.0.1:8000`。首次使用 AI 功能前，用记事本在自动创建的 `backend\.env` 填写 `DEEPSEEK_API_KEY`，保存后重启；不填有效 key 也能启动非 AI 功能，行情仍需网络与上游可用。保持启动窗口打开，按 Ctrl+C 停止；8000 被占用会提示并退出。

## 功能总览

| 模块 | 说明 |
|------|------|
| **多市场行情** | A 股（腾讯/新浪/东方财富三源自动降级）+ 港股/美股（Yahoo Finance）。实时报价 / K 线 / 搜索 |
| **技术指标** | 7 个 numpy 指标（MA/MACD/RSI/KDJ/BOLL/ATR/VolMA），A 股 SMA 口径 |
| **SSE 流式聊天** | 单 Agent 多轮对话 + 历史持久化 + 角色切换 |
| **多 Agent 讨论** | 6 预置投研角色轮序发言（价值投资/技术分析/量化/风控/宏观/情绪），实时时间线 + 自动总结 |
| **4 Agent 并行研究** | 独立工具循环 → 结构化报告，SSE 事件流推送进度 |
| **投资组合** | CRUD + 多市场实时盈亏（含港股/美股） |
| **策略回测** | v1 同步（3 策略）+ v2 异步 BackgroundTasks + 状态机 |
| **Alpha 研究** | 可分发的 8 字段 starter + 5 个模板；私有开发树可选加载许可未知的扩展目录；相关性计算 |
| **多市场筛选** | 用户提供 ticker 列表 → 实时行情 + 60 日动量筛选 |
| **模型管理** | OpenAI 兼容协议抽象，CRUD + 连通性测试，默认 DeepSeek |
| **统一标的接口** | A/HK/US 统一合约 + 元数据溯源 + 研究工作区持久化 |
| **报告导出** | Markdown / HTML / PDF / DOCX |

## 架构速览

```
浏览器层     React 18 + AntD 5 + ProLayout + lightweight-charts
代理层       Vite dev proxy (5173 → 8000) / Nginx (prod)
路由层       23 APIRouter → 133 个 /api/* 路径 / 168 个 HTTP 操作
服务层       3 层：编排器 → I/O 服务 → 纯逻辑服务
Agent 层     13 个本地工具 (ToolRegistry) + function_calling 循环
数据层       aiosqlite 单连接 + WAL + schema v23（52 张逻辑表）
外部 API     腾讯 / 新浪 / 东方财富 / Yahoo Finance / DeepSeek
```

详细技术栈见 [docs/TECH_STACK.md](docs/TECH_STACK.md)，架构细节见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。

## API 端点目录

当前 23 个 APIRouter 生成 133 个 `/api/*` 路径、168 个 HTTP 操作；另有内联健康检查。运行时 OpenAPI 是最终校验来源，完整清单见 **[docs/API_CONTRACT.md](docs/API_CONTRACT.md)**。

## 参考项目

本项目融合了 6 个 GitHub 量化/金融仓库的架构思路；私有开发树可能保留含 `.git` 历史的 `reference/`，公开源码快照不分发这些克隆：

| 项目 | 核心采纳 | 影响 |
|------|---------|------|
| [Vibe-Trading](https://github.com/HKUDS/Vibe-Trading) | Agent 工具框架 + function_calling 循环 + SSE 协议 | 高 |
| [stock-analyzer](https://github.com/luda66/stock-analyzer) | 多市场统一接口 + 降级链 + ticker 规范化 | 高 |
| [ai-berkshire](https://github.com/xbtlin/ai-berkshire) | 角色化投研 Agent + 讨论编排 | 中 |
| [wq-alpha-research](https://github.com/QuantML-Research/wq-alpha-research) | WorldQuant Alpha 因子库集成 | 高 |
| [daily_stock_analysis](https://github.com/ZhuLinsen/daily_stock_analysis) | — | 无直接采纳 |
| [BigDataView](https://github.com/iGaoWei/BigDataView) | — | 无直接采纳 |

## 开源准备状态

项目自有源码采用 [Apache-2.0](LICENSE)，版权声明为 `Copyright 2026 Satanchen`。私有开发树中的 `reference/` 和许可未知 WQ catalogue 不进入公开源码树；`./scripts/export_public_source.ps1 -Destination <项目外新目录>` 会从当前 worktree 的明确 allowlist 生成快照，排除 Git 元数据、上述第三方内容、用户 env/数据库、依赖与构建产物，并写入逐文件 SHA256 manifest。未提交的 dirty-worktree snapshot 本身不是 commit 或 clean clone。

贡献、安全报告、本地隐私和数据许可边界见 [CONTRIBUTING.md](CONTRIBUTING.md)、[SECURITY.md](SECURITY.md)、[Local data and privacy](docs/LOCAL_DATA_AND_PRIVACY.md)、[Publication boundary](docs/PUBLICATION_BOUNDARY.md) 与 [Data source and license boundaries](docs/DATA_SOURCE_AND_LICENSE_BOUNDARIES.md)。维护者可运行 `./scripts/audit_open_source_readiness.ps1` 获取私有开发树的只读、值脱敏审计结果。

## 测试

```bash
cd backend && ./.venv/Scripts/python.exe -m pytest -q
cd backend && ./.venv/Scripts/python.exe -m ruff check .
cd backend && ./.venv/Scripts/python.exe -m mypy app
cd frontend && bun run test
cd frontend && bun run build
```

核心旅程变更还需运行 `cd frontend && bun run test:e2e` 并完成桌面/窄屏浏览器验收。当前产品化基线见 [docs/ai/PRODUCT_USABILITY_BASELINE.md](docs/ai/PRODUCT_USABILITY_BASELINE.md)。

## 架构不变量（违反即回退）

完整清单见 [docs/TECH_STACK.md](docs/TECH_STACK.md)。核心约束：

- **无 ORM** — 全部 aiosqlite 原生 SQL
- **无连接池** — 单连接，`get_db()` 断言全局 `_db`
- **无独立 DAL** — 路由直调 `database.query_one/query_all/execute`
- **无 WebSocket** — 全部实时通信走 SSE（sse-starlette）
- **双运行模式** — 生产模式使用邮箱验证码/session；显式本地模式使用单一内部所有者且禁止在 production 启用
- **无服务端渲染** — 纯 CSR
- **无 Agent 间通信** — 4 个研究 agent 各自独立
- **无 DI 容器** — MarketDataService 通过 `request.app.state.market` 手动注入

## 免责

所有 AI 生成内容仅供研究参考，不构成投资建议。
