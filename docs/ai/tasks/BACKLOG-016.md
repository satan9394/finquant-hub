# BACKLOG-016 — 生产单进程托管：FastAPI 直接服务前端产物

> 状态：`[DONE]` ｜ 优先级：P1 ｜ 创建：2026-09-02 ｜ 执行者：Codex
> 背景：方向 2（本地快速部署）第一张卡。当前前端产物（`frontend/dist`，vite build）只能由 Docker 的 nginx（路径 A）或裸机 dev 双终端（路径 B：vite dev + uvicorn）托管；`backend/app/main.py` **不挂载静态产物**，因此"无 Docker、生产模式、单进程"无法实现。本任务让 FastAPI 在**显式启用时**直接托管 `frontend/dist`（含 SPA fallback），实现"一个 uvicorn 进程起完整应用"，为 BACKLOG-017 一键启动铺路。
>
> **开工前必读（维护者调研结论，勿跳过）**：
> 1. **现状**：`backend/app/main.py` L100 `app = FastAPI(...)`；L133-138 `app.include_router(...)` 挂载全部 router（`/api/*` 全在 router 下）；L141 `/api/health`。**无** `StaticFiles`/`FileResponse`/`dist` 引用。前端 `vite.config.ts` 默认 `outDir=dist`（`frontend/dist` 已存在）。
> 2. **关键约束：不能破坏 Docker 路径**。Docker（`Dockerfile` frontend 阶段）用 nginx 托管 `frontend/dist`（`docker/nginx.local.conf`/`nginx.conf`），后端容器只跑 uvicorn。**因此本任务的静态挂载必须是"显式开关"**——默认关闭，Docker 环境不启用，避免后端与 nginx 双重托管或干扰现有 `docker-compose.yml`。建议开关：环境变量 `SERVE_FRONTEND=1`（读自 `backend/app/config.py`，默认 `False`），仅在 `SERVE_FRONTEND=1` 时挂载。
> 3. **SPA fallback 不能挡 `/api/*`**：静态挂载用 `StaticFiles(html=True)` + 一个 catch-all fallback 路由（非 `/api` 且非已有路径 → 返回 `index.html`）。**必须先挂 router（`/api/*`）再挂 fallback**，且 fallback 用 `@app.get("/{full_path:path}")` 时需确保 `/api/*` 由 router 优先处理（FastAPI 按注册顺序匹配，router 先注册则 `/api/*` 先命中；但**建议 fallback 路由内显式跳过 `/api/` 前缀**，双重保险，避免静态 fallback 吞掉 API 404）。
> 4. **dist 路径解析**：相对 `backend/app/main.py` 的 `frontend/dist`——需从仓库根定位（`Path(__file__).resolve().parents[2] / "frontend" / "dist"`，即 backend 上两级到仓库根再进 frontend）。挂载前检查目录存在，不存在则**记录警告并跳过挂载**（不抛错，保持无前端产物时后端仍可测可跑）。
> 5. **测试纪律**：新增确定性测试用 `TestClient`（`backend/tests/test_main_static.py` 新建）——验证 `SERVE_FRONTEND=1` 且 dist 存在时 `/` 返回 index.html、SPA fallback（如 `/research/600519` 返回 index.html）、`/api/health` 仍正常、**`/api/*` 不被 fallback 吞掉**（不存在的 `/api/nope` 返回 404 而非 index.html）；默认（未设 SERVE_FRONTEND）时挂载不启用。dist 目录在测试里可用 `tmp_path` 或 monkeypatch 模拟，**不依赖真实 build 产物**（避免测试被构建污染）。
> 6. **config.py 约束**：`SERVE_FRONTEND` 读取为 `config.SERVE_FRONTEND`（bool，默认 False）。Docker 环境不设此变量 → 行为不变。

---

## 允许修改

- `backend/app/config.py`（新增 `SERVE_FRONTEND: bool = False` 环境变量读取）
- `backend/app/main.py`（静态挂载 + SPA fallback，仅在 `SERVE_FRONTEND=1` 时启用）
- `backend/tests/test_main_static.py`（**新建**，确定性测试）
- `backend/tests/`（如需微调既有 main import 的 fixture，仅当破坏时，且说明）
- `docs/ai/tasks/BACKLOG-016.md`、`docs/ai/EXEC_PLAN.md`、`task/CHANGELOG.md`、`docs/ARCHITECTURE.md`（若 main.py 结构变化需注明）
- `README.md`（仅当需要说明新开关；可选，BACKLOG-018 会做完整文档）

## 禁止修改

- 前端 `frontend/` 全部（本任务纯后端入口）
- `backend/app/routers/`、`backend/app/database.py`、`backend/app/services/`、`backend/app/agent/`、认证、schema
- `Dockerfile`、`docker-compose*.yml`、`docker/`（Docker 路径保持 nginx 托管，不引入后端托管）
- **不新增任何 Python/npm 依赖**（标准库 `pathlib`/`os` 足够）；**不删除任何文件**
- 既有后端测试断言语义（新增挂载不得让既有 `/api/*` 测试误中 fallback）

---

## 完成标准

### 目标 1：config 开关

`backend/app/config.py` 新增 `SERVE_FRONTEND: bool`（默认 `False`），从环境变量读取（沿用现有 `getenv`/`parse_bool` 风格，若项目有 bool 解析 helper 则复用）。`SERVE_FRONTEND=1`/`true` 启用。

### 目标 2：静态托管 + SPA fallback

`backend/app/main.py`，仅在 `config.SERVE_FRONTEND` 为真时执行（包一层 `if config.SERVE_FRONTEND:`，避免影响 Docker/测试默认路径）：
- 解析 `frontend/dist` 路径（`Path(__file__).resolve().parents[2] / "frontend" / "dist"`），目录存在才继续，否则 `LOGGER.warning("SERVE_FRONTEND=1 但未找到 frontend/dist，跳过静态托管")` 并跳过
- 在**全部 router 挂载之后**：`app.mount("/assets", StaticFiles(directory=dist / "assets"), name="static-assets")`（若 assets 存在），再注册 SPA fallback：`@app.get("/{full_path:path}")` → 若非 `full_path.startswith("api/")` 则返回 `FileResponse(dist / "index.html")`，否则 `raise HTTPException(404)`（保底，确保 `/api/*` 不被 fallback 吞掉）
- 挂载顺序：router（`/api/*`）→ assets → fallback；`/api/health` 已存在不受影响
- 不做 SSR，不引入新依赖

### 目标 3：测试

`backend/tests/test_main_static.py`（**新建**，确定性，无真实网络）：
- 用 monkeypatch 控制 `config.SERVE_FRONTEND` 与 dist 路径（`tmp_path` 生成假 dist + index.html + assets），**不依赖真实 build 产物**
- 用例（≥5）：
  1. `SERVE_FRONTEND=1` + dist 存在 → `GET /` 返回 200 + text/html + index.html 内容
  2. SPA fallback：`GET /research/600519`（无对应静态文件）→ 200 + index.html
  3. `/assets/*` 静态文件返回正确 content-type
  4. `/api/health` 仍 200（router 优先于 fallback）
  5. 不存在的 `/api/nope` → **404**（不被 fallback 吞掉）
  6. `SERVE_FRONTEND` 默认/未设时 → 不挂载（`GET /` 404 或行为与改前一致）
- 全量：`cd backend && .\.venv\Scripts\python.exe -m pytest ..\backend\tests -q --no-cov -p no:cacheprovider` 全绿（780 + 新增）
- 覆盖率 `--cov=app` 不降（92.26% 基线）；`ruff check .` 通过；`git diff --check` 通过
- 既有 780 测试不破坏（尤其 import `app.main` 的 TestClient 套件）

### 目标 4：文档同步

- `docs/ai/EXEC_PLAN.md` 标记 `[DONE]`（证据：开关/挂载/测试数/门禁）
- `task/CHANGELOG.md` 追加一条（**带 `## YYYY-MM-DD` 标题行**）
- `docs/ARCHITECTURE.md`：main.py 挂载说明补一句（SERVE_FRONTEND 单进程托管，Docker 仍 nginx）
- `README.md`：仅在需要时补一行开关说明（完整文档留给 BACKLOG-017/018）

---

## 参考

- `backend/app/main.py` L100/L133-138/L141（app 定义、router 挂载、health）
- `backend/app/config.py`（环境变量读取风格）
- `frontend/vite.config.ts`（outDir=dist 默认）、`frontend/dist`（产物）
- `Dockerfile`（frontend 阶段 nginx 托管——本任务不碰）
- 测试先例：`backend/tests/test_api.py`（TestClient import app.main）

## 验证命令

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest ..\backend\tests\test_main_static.py -q --no-cov -p no:cacheprovider
.\.venv\Scripts\python.exe -m pytest ..\backend\tests -q --no-cov -p no:cacheprovider
.\.venv\Scripts\python.exe -m pytest ..\backend\tests -q --cov=app --cov-report=term-missing -p no:cacheprovider
.\.venv\Scripts\python.exe -m ruff check .
cd .. && git diff --check
```

## 完成证据（2026-09-02）

- **修改文件（8 个）**：入口配置 `backend/app/config.py`、入口 `backend/app/main.py`；新增 `backend/tests/test_main_static.py`；文档 `docs/ai/tasks/BACKLOG-016.md`、`docs/ai/EXEC_PLAN.md`、`task/CHANGELOG.md`、`docs/ARCHITECTURE.md`、`README.md`。既有测试文件无需修改。
- **开关**：`SERVE_FRONTEND: bool = _env_flag("SERVE_FRONTEND")` 复用现有解析器；未设、`0`、`false` 均关闭，`1`、`true` 启用。默认即使存在 dist，也不注册 assets/fallback。
- **路径与顺序**：仅开关启用时用 `Path(__file__).resolve().parents[2] / "frontend" / "dist"` 定位；目录缺失记录约定 warning 并跳过。全部业务 router → 内联 `/api/health` → 存在的 `/assets` → GET SPA fallback；assets 目录缺失时仍可返回 index。请求路径不用于拼接磁盘文件路径；资产目录边界由现有 `StaticFiles` 处理。
- **API 保护**：`/api`、`/api/`、`/api/nope` 返回 JSON 404；`/api/health` 仍调用原查询并返回 JSON 200；未登录的 `/api/models` 仍返回 401。`/apiary` 属于非 API 路径，可正常 fallback。fallback 使用 `include_in_schema=False`，开关前后完整 OpenAPI JSON 相等。
- **确定性测试**：21 项，覆盖环境开关 5 项、首页/SPA/查询参数/相似前缀 4 项、CSS/JS 类型与内容 2 项、缺失资产/目录越界 2 项、health 1 项、API 404 边界 3 项、认证 1 项、dist 缺失 1 项、assets 缺失 1 项、OpenAPI 一致性 1 项。`tmp_path` 生成假 dist，monkeypatch 配置与独立入口模块的 `__file__`，并切至无关 cwd 验证路径解析；不 reload 全局 `app.main`，不运行 lifespan，health 用 `AsyncMock`，无真实网络、数据库或真实 build 依赖。

验证命令均见上节，使用现有 `backend/.venv`，结果如下（exit 0）：

| 门禁 | 实测结果 |
| --- | --- |
| 修改前全量 + 覆盖率 | 780 passed，99.64s；92.25% |
| 新增专项 `--no-cov` | 21 passed，11.92s |
| 修改后全量 `--no-cov` | 801 passed，85.00s（既有 780 + 新增 21） |
| 修改后全量 `--cov=app` | 801 passed，138.46s；92.28% |
| Ruff `check .` | All checks passed |
| `git diff --check`、文件范围检查 | 通过；仅上述 8 文件，无删除，暂存区为空 |

- **覆盖率核对**：卡片历史记录 92.26%，本轮修改前在 `fdea1d2` 实测为 92.25%；修改后 92.28%，高于两者。`app/main.py` 89.1% → 91.0%，新增托管代码行与分支均覆盖；未降低覆盖率门槛或修改覆盖率配置。
- **首轮测试修正**：新增测试最初 5 项在路由结构检查处失败，原因是当前 FastAPI 的 `_IncludedRouter` 没有 `.path`；改为兼容该对象的路径读取后专项及两次全量全部通过。HTTP 行为断言均保留，既有测试断言未改。
- **边界确认**：Python/npm 依赖与锁文件变化为零；`Dockerfile`、`docker-compose*.yml`、`docker/`、`frontend/`、routers/database/services/agent/认证/schema、`reference/` 均未修改；没有删除文件。未运行前端 build（保持前端禁止修改边界），未启动或改动 Docker/nginx。`HANDOFF.md` 与 `scripts/handoff-log.py` 不在卡片允许清单，故不运行会写入 HANDOFF 的收尾脚本，以本卡和 CHANGELOG 留存交接证据。
- **决策确认**：默认关闭维持 Docker/nginx 和既有 API 测试路径；dist 缺失只警告不抛错；API 前缀显式排除；保持 CSR、零依赖。静态入口不改变 API 契约，无需修改允许清单外的 API 文档。
- **交付状态**：卡片及 EXEC_PLAN 已标记 `[DONE]`，CHANGELOG 带日期标题；风险低。HEAD 保持 `fdea1d2`，未 commit、未 push；本卡无待办，不自动开始 BACKLOG-017/018。
