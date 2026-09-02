# BACKLOG-018 — 非技术用户快速上手文档

> 状态：`[READY]` ｜ 优先级：P1 ｜ 创建：2026-09-02 ｜ 执行者：Codex
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

## 完成证据（执行后填写）

- `docs/QUICKSTART.md` 章节清单与面向非技术用户的措辞要点
- README 链接确认
- 一致性核对结果（命令/端口/路径与 016/017 产物一致）
- 依赖变化（应为零）；无删除；源码零改动
