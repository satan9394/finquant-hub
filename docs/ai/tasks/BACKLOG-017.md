# BACKLOG-017 — 一键启动脚本：Windows start.bat（单进程本地运行）

> 状态：`[READY]` ｜ 优先级：P1 ｜ 创建：2026-09-02 ｜ 执行者：Codex
> 背景：方向 2（本地快速部署）第 2 卡，依赖已完成的 BACKLOG-016（`SERVE_FRONTEND=1` 单进程托管）。当前裸机路径 B 要手动开两个终端（uvicorn + vite dev），对非技术用户门槛高。本任务提供**根目录 `start.bat` 双击即启动**：自动检测/引导环境 → 构建前端（或复用已有 dist）→ 以单进程启动 `uvicorn`（`SERVE_FRONTEND=1`）→ 打开浏览器。
>
> **开工前必读（维护者调研结论，勿跳过）**：
> 1. **依赖 016**：`backend/app/main.py` 已支持 `SERVE_FRONTEND=1`（默认关闭）单进程托管 `frontend/dist`；`frontend/dist` 由 `bun run build`（`tsc -b && vite build`）产出（`frontend/package.json`）。本任务**不再动 main.py**。
> 2. **现状**：项目已有 `scripts/local.ps1`（Docker 路径 A）、`README.md` 路径 A/B 文档。本任务只加**裸机单进程**的 Windows 双击入口，不动 Docker 脚本。根目录当前无 `.bat`/`.cmd`。
> 3. **启动命令**：`cd backend && .\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000`，需在进程环境设 `SERVE_FRONTEND=1`（batch 内 `set SERVE_FRONTEND=1`）。前端 build 用 `cd frontend && bun run build`（bun 路径见下）。
> 4. **bun 路径**：本机 bun 在 `D:\Technology_application\NVM_Windows\nvm_a\v22.19.0\bun.exe`（不在 PATH）。`start.bat` 需能定位 bun——优先 `where bun`，否则回退到该固定路径，或提示用户安装（`https://bun.sh`）。**不得硬编码死路径为唯一方案**。
> 5. **venv 引导**：`backend\.venv` 若不存在，提示用户运行 `cd backend && python -m venv .venv && .venv\Scripts\pip install -r requirements.txt`（脚本可自动尝试，失败给出明确指引，不强求脚本内装依赖以免超时）。
> 6. **env 模板**：根目录与 backend 各有 `.env.example`。脚本可检查 `backend\.env` 缺失时复制 `.env.example` 并提示用户填 `DEEPSEEK_API_KEY`（**不得回显或写入密钥**）。无 key 时系统仍可启动（本地功能可用），按 README 说明提示即可。
> 7. **端口**：默认 8000（uvicorn）。若占用，脚本提示先 `netstat -ano | findstr 8000` 检查（按项目约定不擅自换端口）。浏览器打开 `http://127.0.0.1:8000`。
> 8. **诚实与边界**：脚本只做"检测/引导/启动/打开浏览器"，不修改任何源码、不删文件、不新增依赖。失败路径给出中文提示而非静默失败。

---

## 允许修改

- `start.bat`（**新建**，项目根目录）
- `README.md`（快速开始处补一段"Windows 一键启动"，指向 `start.bat`；简短即可，完整留给 BACKLOG-018）
- `docs/ai/tasks/BACKLOG-017.md`、`docs/ai/EXEC_PLAN.md`、`task/CHANGELOG.md`

## 禁止修改

- `backend/` 全部（尤其 main.py/config.py，016 已完成）
- `frontend/` 全部
- `scripts/local.ps1`、`local.sh`、`Dockerfile`、`docker-compose*.yml`、`docker/`
- **不新增任何依赖**；**不删除任何文件**；不回显/写入任何密钥
- 不要求安装新工具（除检测 bun 时提示用户）

---

## 完成标准

### 目标 1：`start.bat`（根目录，双击可运行）

Windows 批处理，流程：
1. 定位 bun（`where bun` → 回退固定路径 → 仍无则提示安装网址并暂停退出）
2. 检查 `backend\.venv`：缺失则尝试创建 + `pip install -r backend\requirements.txt`（成功则继续，失败给中文指引并暂停）；已存在则直接使用
3. 检查 `frontend\dist`：不存在或 `frontend\package.json` 比 `dist\index.html` 新 → 运行 `bun run build`（`cd frontend && <bun> run build`）；失败给中文提示并暂停
4. 检查 `backend\.env`：缺失则从 `.env.example` 复制（**不写密钥**），提示用户可编辑填 `DEEPSEEK_API_KEY`
5. `set SERVE_FRONTEND=1`，`cd backend && .\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000`
6. 启动后打开默认浏览器到 `http://127.0.0.1:8000`（可用 `start "" http://...` 在启动前或延迟后执行）
7. 中文注释清晰；`chcp 65001`（UTF-8）避免中文乱码；`pause` 在关键错误后保留窗口信息

### 目标 2：README 快速开始补充

`README.md` 在路径 B 附近或新增小节，一段话说明：Windows 用户可在根目录双击 `start.bat` 完成"自动建 venv/装依赖/构建前端/单进程启动/打开浏览器"；需先装 Bun 与 Python 3.12；首次填 `backend\.env` 的 `DEEPSEEK_API_KEY`。简短，不重复 BACKLOG-018 的完整内容。

### 目标 3：测试与验证（脚本类）

- 脚本为批处理，**不新增自动化测试套件**；但需在证据中给出**手动冒烟步骤与结果**：在干净环境（或说明受限环境）执行 `start.bat` 的关键分支（dist 检测/build 触发/venv 检测/env 复制）——至少验证脚本**语法正确、可被 cmd 解析**（如 `cmd /c start.bat` 走到某分支并给出预期提示），以及 `SERVE_FRONTEND=1` + uvicorn 单进程确实能起（可配合 `backend` 已存在的 `test_main_static.py` 逻辑说明托管已测）。
- `git diff --check` 通过；不破坏任何现有测试（本任务不改源码，`backend` 全量 pytest 应仍 801/801；`frontend` 不受影响）
- **零新依赖、无删除、不改源码**

### 目标 4：文档同步

- `docs/ai/EXEC_PLAN.md` 标记 `[DONE]`（证据：脚本分支/冒烟结果）
- `task/CHANGELOG.md` 追加一条（**带 `## YYYY-MM-DD` 标题行**）

---

## 参考

- BACKLOG-016（已完成）：`backend/app/main.py` 的 `SERVE_FRONTEND=1` 单进程托管；`backend/tests/test_main_static.py`
- `frontend/package.json`（`build` 脚本）、`frontend/vite.config.ts`（outDir=dist）
- 本机 bun：`D:\Technology_application\NVM_Windows\nvm_a\v22.19.0\bun.exe`
- `README.md`（现有路径 A/B 说明）、`backend/.env.example`、根 `.env.example`

## 验证命令

```powershell
# 批处理冒烟（确认语法与分支提示；不要求完整启动成功）
cmd /c start.bat
# 源码测试不受影响
cd backend && .\.venv\Scripts\python.exe -m pytest ..\backend\tests -q --no-cov -p no:cacheprovider
git diff --check
```

## 完成证据（执行后填写）

- `start.bat` 的分支逻辑清单（bun 定位/venv 引导/build 触发/env 复制/启动/开浏览器）
- 冒烟验证结果（各分支实际输出或受限说明）
- 源码测试确认（801/801 不受影响）；依赖变化（应为零）；无删除
- README/CHANGELOG 同步确认
