# BACKLOG-019 — 单进程托管缺陷修复：根级静态文件（favicon）+ 使用入口端口收敛

> 状态：`[DONE]` ｜ 优先级：P1 ｜ 创建：2026-09-02 ｜ 执行者：Codex
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

- **完成日期 / 基点**：2026-09-02，基于 `0e88a89` 执行；开工时工作树干净。
- **fallback 语义**：`backend/app/main.py` 仅在 `frontend_fallback` 内增加 5 行。先保留 `/api` 与 `/api/*` 的 404 拦截；计算 `candidate = (frontend_dist / full_path).resolve()`，若不属于 `frontend_dist.resolve()` 则立即 404（包括越界但不存在的目标），不会进入 FileResponse；非空路径且为 dist 内文件时返回 `FileResponse(candidate)`，否则返回 `index.html`。默认关闭、dist 缺失跳过、assets 挂载、认证及 `include_in_schema=False` 均保持原样。
- **追加测试**：沿用原 `make_app` / `dist` fixture，tmp_path 假产物、隔离模块加载、进程内请求，不启动 lifespan/DB/行情网络。追加 4 个函数、7 个参数化实例，原有 21 项与全部原断言完整保留：`test_root_favicon_is_served_as_svg`（200、image/svg+xml、原 SVG 内容）；`test_other_root_static_file_is_served`（robots.txt 的 200、text/plain、原内容）；`test_fallback_rejects_paths_outside_dist`（4 种越界路径均 JSON 404）；`test_spa_route_with_root_static_files_still_returns_index`（存在根级静态文件时 `/research/600519` 仍返回原 index.html）。
- **穿越场景**：`/%2e%2e/%2e%2e/backend/private.txt`、`/%2e%2e%2f%2e%2e%2fbackend/private.txt`、`/%2e%2e/%2e%2e/backend/missing.txt`、`/%2e%2e/dist-other/private.txt`；临时目录内真实创建 dist 外文件及名称同前缀的兄弟目录，覆盖点编码、斜杠编码、目标不存在和字符串前缀误判。
- **修复前复现**：追加测试后、修改 main.py 前，专项为 22 passed / 6 failed（13.82s）；favicon/robots 实际返回 text/html，4 种越界请求实际返回 200。修复后曾有 1 项新增 robots fixture 因 Windows 写文本将 LF 转成 CRLF 而失败；将该新增 fixture 固定为 `newline="\n"` 后通过，响应内容仍严格相等，既有测试未改。
- **专项验证**：`cd backend; .\.venv\Scripts\python.exe -m pytest ..\backend\tests\test_main_static.py -q --no-cov -p no:cacheprovider` → **28 passed，11.94s**。既有 assets、API 404、认证、health、默认关闭、dist 缺失与 OpenAPI 不变用例均通过。
- **全量验证**：`cd backend; .\.venv\Scripts\python.exe -m pytest ..\backend\tests -q --no-cov -p no:cacheprovider` → **808 passed，80.09s**（801 + 7）；`cd backend; .\.venv\Scripts\python.exe -m pytest ..\backend\tests -q --cov=app --cov-report=term-missing -p no:cacheprovider` → **808 passed，110.10s**。
- **覆盖率前后**：修改前采用本卡及维护者已记录的 **92.28%** 基线（本轮未重跑修改前的全量覆盖率）；修改后实测 **92.28%**，精确值 **92.28125%**，按卡片精度持平、不下降。`app/main.py` 从已记录的 **91.0%** 到实测 **91.60%**（91.60305%）；覆盖率数据确认新增 5 行及其分支结果全部覆盖。覆盖率配置、门槛和依赖未变。
- **其他门禁**：`cd backend; .\.venv\Scripts\python.exe -m ruff check .` → All checks passed；根目录 `git diff --check` 通过。AST 对比确认 main.py 的函数体外无改动；test_main_static.py 原内容是修改后文件的完整前缀；README/QUICKSTART 的 **21 个本地文件链接及锚点** 校验通过。
- **文档收敛**：README 安装与启动开头明确 Windows 双击 start.bat → `http://127.0.0.1:8000` 为日常唯一使用入口；路径 A 从“推荐”改为“可选容器化路径”，路径 B 明确仅开发调试使用 5173。QUICKSTART 第三步补充固定 8000 与 5173 用途说明，并修正路径 A 标题变更后的链接锚点。ARCHITECTURE 更新为越界 404、静态优先、SPA 回退及对应端口说明；没有修改运行端口或 Docker 配置。
- **用户反馈对照**：“8000 logo 欠缺”的托管根因已修复，测试证明 `/favicon.svg` 返回 SVG 与正确 MIME；本轮未启动实际 8000 服务或进行浏览器标签页实测，运行中的旧进程需重启后加载修复。“端口来回”通过文档明确为日常 8000 与可选开发/Docker 5173 的区别，start.bat 仍固定 8000。
- **边界确认 / 交付**：仅修改本卡允许的 8 个文件；start.bat、scripts/local.ps1、local.sh、scripts/local.sh、Dockerfile、docker-compose*.yml、docker/、frontend/、config.py、routers/database/认证/schema、依赖与锁文件、reference/ 均未修改；零新依赖、无文件删除。不运行会写入允许清单外 HANDOFF.md 的 handoff-log 脚本，也不修改其他交接/API 文档。前端不涉及，未运行前端构建。任务卡及 EXEC_PLAN 标记 `[DONE]`，task/CHANGELOG.md 追加日期标题与验证记录；HEAD 保持 `0e88a89`，暂存区为空，**未 commit、未 push**。
