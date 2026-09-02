# BACKLOG-018 — 非技术用户快速上手文档

> 状态：`[DONE]` ｜ 优先级：P1 ｜ 创建：2026-09-02 ｜ 执行者：Codex
> 背景：方向 2（本地快速部署）第 3 卡，依赖 BACKLOG-016（单进程托管）与 BACKLOG-017（start.bat）。项目 README 面向开发者（venv/bun/Docker 命令），缺少给**不懂技术的使用者**的 3 分钟上手路径。本任务在 README 或独立 `docs/QUICKSTART.md` 补一份面向非技术用户的快速上手，把"下载 → 启动 → 配置 → 使用"讲成傻瓜步骤。
>
> **开工前必读（维护者调研结论，勿跳过）**：
> 1. **目标用户**：中文、非技术、个人投资者。文档要避免 CLI/终端术语，用点选步骤；但产品需本机运行，无法完全脱离命令行——因此用"复制粘贴命令 + 逐步说明"降低门槛。
> 2. **已有内容**：README 已有路径 A（Docker）/路径 B（裸机 dev）与 `SERVE_FRONTEND` 说明；BACKLOG-017 将新增 `start.bat`。本任务**不重写**已有内容，新增一份"新手路径"并互相链接。
> 3. **依赖 016/017**：单进程启动 = `start.bat`（017）或手动 `SERVE_FRONTEND=1` + uvicorn（016）；无 key 时可启动但模型功能不可用（本地行情/指标/搜索/筹码/资金流等仍可用）。文档要如实说明"没有 AI key 能干什么/不能干什么"。
> 4. **平台**：Windows 优先（start.bat），macOS/Linux 给等价的 `scripts/local.sh` 或裸机命令简述。不夸大 Docker 为"必须"，只作为可选项说明。
> 5. **诚实边界**：不写密钥、不提供远程部署/公网指南（产品目标是本地单人使用）。不新增依赖，纯文档任务。
> 6. **常见问题（FAQ）至少覆盖**：端口占用（8000/5173）、无 AI key、行情数据拿不到（UNKNOWN/PARTIAL 是正常降级而非故障）、bun/python 未装、如何更新到最新代码、数据存哪（本地 SQLite）。

---

## 允许修改

- `docs/QUICKSTART.md`（**新建**，非技术用户上手主文档）——或并入 README 小节（**二选一，推荐独立文件**并在 README 顶部加链接）
- `README.md`（顶部"快速开始"加一句链接到 `docs/QUICKSTART.md`；如需微调）
- `docs/ai/tasks/BACKLOG-018.md`、`docs/ai/EXEC_PLAN.md`、`task/CHANGELOG.md`

## 禁止修改

- `backend/`、`frontend/` 全部源码
- `start.bat`（017 产物，只读）、`scripts/`、`Dockerfile`、`docker-compose*.yml`
- **不新增任何依赖**；**不删除任何文件**；不写密钥/不提供公网部署指南
- 不夸大能力（AI 功能需 key、外部数据需网络与上游可用）

---

## 完成标准

### 目标 1：`docs/QUICKSTART.md`（新建，面向非技术用户）

中文、步骤化、少术语。结构建议：
1. **这是什么 / 你需要什么**：一句话说明 + 前置（Windows 10/11；装 Python 3.12 与 Bun 的傻瓜指引链接）
2. **三步上手**：①下载/解压项目 ②双击 `start.bat`（或 macOS/Linux 等价的 `bash scripts/local.sh up` / 单进程命令）③浏览器打开 `http://127.0.0.1:8000`
3. **首次配置（可选）**：填 `backend\.env` 的 `DEEPSEEK_API_KEY` 才能用聊天/讨论/研究；不填也能用哪些功能（行情/指标/筹码/资金流/涨停池等，列清楚）
4. **常见问题 FAQ**（覆盖上文第 6 点的场景，每条给"原因 + 怎么做"）
5. **数据与隐私**：数据存在本地 `backend/data/finquant.db`，不会上传；无公网部署
- 全文避免暴露密钥、避免终端操作强依赖（命令尽量复制粘贴）

### 目标 2：README 链接

`README.md` 顶部"快速开始"处加一行链接指向 `docs/QUICKSTART.md`（如"不熟悉命令行？看 [非技术用户快速上手](docs/QUICKSTART.md)"），不改动既有内容语义。

### 目标 3：一致性校验（文档类）

- 文档中的命令/端口/文件路径与真实项目一致（`start.bat`、`backend\.env`、`frontend\dist`、`SERVE_FRONTEND`、端口 8000）
- 与 BACKLOG-016/017 产物核对：`SERVE_FRONTEND=1` 单进程、`start.bat` 存在
- `git diff --check` 通过；不破坏任何测试（纯文档）
- **零新依赖、无删除**

### 目标 4：文档同步

- `docs/ai/EXEC_PLAN.md` 标记 `[DONE]`（证据：文档章节/一致性核对）
- `task/CHANGELOG.md` 追加一条（**带 `## YYYY-MM-DD` 标题行**）

---

## 参考

- BACKLOG-016（单进程托管开关 `SERVE_FRONTEND`）、BACKLOG-017（`start.bat`）
- `README.md`（现有路径 A/B、功能总览）、`backend/.env.example`
- 项目文档约定：`docs/ARCHITECTURE.md`、`docs/HANDOVER.md`

## 验证命令

```powershell
git diff --check
# 纯文档，无源码测试；确认 README 链接存在且目标文件可读
Test-Path docs/QUICKSTART.md
Select-String -Path README.md -Pattern 'QUICKSTART'
```

## 完成证据（2026-09-02）

- **顺序与产物**：017 的任务卡/EXEC_PLAN 已先标记 DONE 并记录验证，然后才创建 `docs/QUICKSTART.md`。README 安装与启动标题下（第 9 行）增加“非技术用户快速上手”链接，保留路径 A/B 的原有语义。
- **章节**：准备工具 → 三步上手（下载解压、双击、浏览器与首次使用）→ 可选 AI 配置 → macOS/Linux 与可选 Docker → FAQ → 数据与隐私。FAQ 覆盖 8000/5173 占用、无 key/AI 报错、数据 UNKNOWN/PARTIAL/UPSTREAM_ERROR、Bun/Python/构建问题、旧页面、更新备份、数据位置。用 Code/Download ZIP、资源管理器、记事本和中文导航点选解释操作；必要命令标明窗口与目录，可直接复制，不承诺首次下载构建在三分钟内完成。
- **功能与隐私真实性**：对照当前 App 导航、ResearchWorkspace 和 zh 字典，列出非 AI 行情/指标/A 股筹码/资金流/龙虎榜/涨跌停池及需有效 key 的聊天/讨论/AI 研究。筹码注明推算、数据可缺失；本机 SQLite 不自动上传给维护者，但行情请求和 AI 问题/上下文会发送上游，未作“完全离线/绝不外传”承诺。模板占位不等于有效 key；网页加密凭据缺持久 MASTER_KEY 的重启限制也注明。
- **命令与路径核对（10/10）**：README 链接、016 SERVE_FRONTEND 挂载、017 LOCAL_ONLY_MODE、uvicorn loopback 8000、Docker 5173/.env.local、已有依赖与 build 命令、dist/package 时间与源码更新限制、backend/.env/数据库位置、诚实数据状态、017 产物只读均通过。macOS/Linux 使用现有 `bash ./scripts/local.sh up/down`，明确这是 Docker 路径而非 8000 单进程；用户数据卷与裸机 data 文件夹不混用。Windows 更新流程先停止/备份、另目录解压、只迁移数据配置；Git 路径使用 fast-forward 并主动重新安装已有依赖/构建，不删除旧文件或强制重置。
- **链接与来源**：README + QUICKSTART 共 20 个本地 Markdown 文件链接均可解析，目标文档可读；README 中文锚点与原有标题核对。2026-09-02 已读取 Python 官方 3.12.10 发布页与 Bun 官方安装文档，核对 Windows installer、Windows 10 1809 门槛、PowerShell 安装命令与 PATH 指引；文档就近附官方链接，并明确 3.12.10 不是最新安全发布。没有安装工具或执行下载命令。
- **018 阶段只读边界**：`start.bat` 在 017 完成时和 018 核对时的 SHA256 都为 `2788E5E2BE322F687901E4DD593FA92B5791ACC4813515486600213BA0B9D5B8`。后端、前端、scripts、Docker 与依赖/锁文件 tracked diff 为空；本卡纯文档、零新依赖、无删除、无密钥写入/回显、无公网部署内容。未重复运行源码测试，也未将 017 的 801/801 冒充为本卡重新执行的测试。
- **收尾同步**：EXEC_PLAN 标记 018 DONE，CHANGELOG 追加 `## 2026-09-02` 标题条目；`git diff --check` 与允许范围核对通过。HANDOFF 不在两卡 allowlist，保持不动；无 commit/push。
