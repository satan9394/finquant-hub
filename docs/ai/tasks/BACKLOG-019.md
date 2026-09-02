# BACKLOG-019 — 单进程托管缺陷修复：根级静态文件（favicon）+ 使用入口端口收敛

> 状态：`[READY]` ｜ 优先级：P1 ｜ 创建：2026-09-02 ｜ 执行者：Codex
> 背景：BACKLOG-016 的单进程托管（`SERVE_FRONTEND=1`）只挂载了 `frontend/dist/assets`，**dist 根目录的静态文件（如 `/favicon.svg`）未服务**——SPA fallback 把它们当 index.html 返回，导致浏览器标签页无 logo（用户实测反馈："8000 logo 欠缺"）。另外用户反馈"端口没固定好/一会儿 5713 一会儿 8000"——查实代码中无 5713，实为 **5173（dev/Docker）与 8000（单进程）两个入口并存**造成混淆；`start.bat` 本身固定 8000 未变。本任务：①修复 main.py 的 SPA fallback 支持 dist 根级静态文件（静态优先、回退 index.html、含路径穿越防护）；②补确定性测试；③收敛 README/QUICKSTART 的端口口径（8000 为唯一使用入口，5173 仅开发/Docker）。
>
> **开工前必读（维护者调研结论，勿跳过）**：
> 1. **根因**：`frontend/index.html` 引用 `<link rel="icon" href="/favicon.svg">`，build 后 `favicon.svg` 在 `frontend/dist/` 根目录（不在 `assets/`）。当前 `main.py`（`backend/app/main.py` L149-162）的 `frontend_fallback` 只对 `/api` 拦截后一律返回 `index.html`，因此 `/favicon.svg` 请求返回 HTML（content-type text/html）→ 浏览器无图标。dev（vite 服务整个根）与 Docker（nginx 服务整个 dist 根）正常。
> 2. **修复语义**：fallback 内**静态优先**——`full_path` 对应的 `frontend_dist / full_path` 是文件则 `FileResponse` 返回它（正确 content-type），否则才返回 `index.html`（SPA 路由）。必须保留 `/api` 与 `/api/*` 的 404 拦截（防吞 API，BACKLOG-016 已有）。**路径穿越防护**：`full_path` 来自 URL 可能含 `../`/编码，需 `resolve()` 后校验 `is_relative_to(frontend_dist.resolve())`，越界则返回 404（不做 FileResponse）。
> 3. **现有测试**：`backend/tests/test_main_static.py`（BACKLOG-016 新增，21 项）已覆盖 index/fallback/assets/路径穿越(`/assets/%2e%2e/index.html`)/api 404/OpenAPI 不变。本任务在**该文件追加**用例，不删改既有断言；新增用例需与既有 `make_app`/`dist` fixture 风格一致（tmp_path 假 dist + 隔离模块加载）。
> 4. **端口收敛（文档层）**：`start.bat` 固定 8000 **不改**；`README.md` 目前把"路径 A：本地 Docker（推荐）"（5173）标为推荐，与 QUICKSTART 引导的 start.bat(8000) 并存致混淆。收敛为：README 顶部"安装与启动"处明确"**日常使用 Windows 双击 start.bat → http://127.0.0.1:8000（唯一使用入口）**；5173 仅用于开发（路径 B）或 Docker（路径 A），是可选/开发者路径"；QUICKSTART 已在 FAQ 强调 8000，可补一句"本项目使用入口固定 8000"。
> 5. **诚实边界**：不新增依赖、不改 Docker/nginx、不删文件、不回显密钥。

---

## 允许修改

- `backend/app/main.py`（仅 `frontend_fallback`：静态优先 + 路径穿越防护）
- `backend/tests/test_main_static.py`（**追加**根级静态文件/favicon/穿越用例）
- `README.md`（端口口径收敛，措辞层面）
- `docs/QUICKSTART.md`（补"使用入口固定 8000"一句，如需要）
- `docs/ai/tasks/BACKLOG-019.md`、`docs/ai/EXEC_PLAN.md`、`docs/ARCHITECTURE.md`（如 main.py 语义说明需更新）、`task/CHANGELOG.md`

## 禁止修改

- `start.bat`（固定 8000，不改）、`scripts/local.ps1`、`local.sh`、`Dockerfile`、`docker-compose*.yml`、`docker/`
- `frontend/` 全部（不重命名/移动 favicon 来规避——应修托管，非改前端）
- `backend/app/config.py`、`backend/app/routers/`、`database`、认证、schema
- **不新增任何依赖**；**不删除任何文件**；不回显密钥

---

## 完成标准

### 目标 1：SPA fallback 静态优先（main.py）

`frontend_fallback` 改为：
- `/api` 与 `/api/*` → 404（保留，防吞 API）
- 计算 `candidate = (frontend_dist / full_path).resolve()`；若 `full_path` 非空 且 `candidate.is_file()` 且 `candidate.is_relative_to(frontend_dist.resolve())` → `FileResponse(candidate)`（静态优先，正确 content-type）
- 否则 → `FileResponse(frontend_dist / "index.html")`（SPA 回退）
- 保持 `include_in_schema=False`、不进入 OpenAPI
- dist 缺失跳过的既有逻辑（`if config.SERVE_FRONTEND:` 块内）不变

### 目标 2：测试追加（test_main_static.py）

在既有 fixture 风格下追加（≥4 用例）：
1. `/favicon.svg` 存在时返回 200 + `image/svg+xml` + 正确内容（不再回退 index.html）
2. 其他根级静态文件（如 `robots.txt`）同理返回原文件
3. 路径穿越防护：`/../backend/...` 或编码穿越路径 → **404**（不做 FileResponse、不泄露文件）
4. 既有 SPA 路由（`/research/600519`）仍返回 index.html（不回归）
- 用 tmp_path 假 dist 内放 `favicon.svg`/`robots.txt` 验证，不依赖真实 build 产物
- 全量：`cd backend && .\.venv\Scripts\python.exe -m pytest ..\backend\tests -q --no-cov -p no:cacheprovider` 全绿（801 + 新增）
- 覆盖率 `--cov=app` 不降（92.28% 基线）；`ruff check .` 通过；`git diff --check` 通过

### 目标 3：端口口径收敛（README/QUICKSTART）

- `README.md`：安装与启动处明确 **8000 为使用入口**（start.bat / 单进程），5173 仅为开发（路径 B）与 Docker（路径 A）路径；调整"路径 A 推荐"措辞为"可选/容器化路径"或加一句对照说明，使两个入口不再混淆
- `docs/QUICKSTART.md`：确认已有 8000 口径，必要时补"本项目使用入口固定 8000；5173 是开发者/容器路径"
- `docs/ARCHITECTURE.md`：若 main.py fallback 语义从"一律 index.html"变为"静态优先+回退"，更新对应一句

### 目标 4：验证与文档同步

- 全量后端 pytest + 覆盖率 + ruff 全绿；前端不涉及（不改 frontend）
- `docs/ai/EXEC_PLAN.md` 标记 `[DONE]`（证据：fallback 语义/测试数/门禁）
- `task/CHANGELOG.md` 追加一条（**带 `## YYYY-MM-DD` 标题行**）

---

## 参考

- `backend/app/main.py` L149-162（`frontend_fallback`）
- `backend/tests/test_main_static.py`（既有 fixture `make_app`/`dist`、既有路径穿越用例 `/assets/%2e%2e/index.html`）
- `frontend/index.html`（favicon 引用）、`frontend/dist/favicon.svg`（build 产物）
- `README.md`（安装与启动、路径 A/B）、`docs/QUICKSTART.md`（三步上手/FAQ）
- BACKLOG-016（单进程托管实现与测试）

## 验证命令

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest ..\backend\tests\test_main_static.py -q --no-cov -p no:cacheprovider
.\.venv\Scripts\python.exe -m pytest ..\backend\tests -q --no-cov -p no:cacheprovider
.\.venv\Scripts\python.exe -m pytest ..\backend\tests -q --cov=app --cov-report=term-missing -p no:cacheprovider
.\.venv\Scripts\python.exe -m ruff check .
cd .. && git diff --check
```

## 完成证据（执行后填写）

- fallback 语义变更（静态优先 + 穿越防护代码）
- 新增测试数/用例名；全量套件结果；覆盖率前后
- README/QUICKSTART/ARCHITECTURE 端口口径收敛的具体改动
- 依赖变化（应为零）；start.bat/Docker/frontend 未动确认；无删除
- 用户反馈对照（8000 logo 修复、端口口径澄清）
