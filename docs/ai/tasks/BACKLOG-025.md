# BACKLOG-025 — 文档计数一致性：README/ROUTER_MAP 同步到运行时 OpenAPI

> 状态：`[DONE]` ｜ 优先级：P2 ｜ 创建：2026-09-03 ｜ 完成：2026-09-04 ｜ 执行者：Codex
> 背景：BACKLOG-021 下线 v1 回测后，运行时 OpenAPI 为 **135 paths / 169 operations**，但部分文档仍写旧计数，且 ROUTER_MAP 内部自相矛盾。维护者已核实：
> - `README.md` L5 写"23 个 APIRouter、133 个 `/api/*` 路径和 168 个 HTTP 操作" —— **过时**
> - `docs/ROUTER_MAP.md` 标题写"23 APIRouter，168 个 OpenAPI 操作"、L3 写"133 个路径、168 个操作" —— **过时且与文件结尾 L438（已正确 135/169）矛盾**
> - `docs/API_CONTRACT.md` 尾部已更新到 135/169（正确，不改）
> - `docs/ai/tasks/AIOS-*.md` 是历史任务记录快照，**不改**
>
> 本任务只做**纯文档计数核对修正**（以运行时 OpenAPI 为唯一权威），零代码/零测试改动。

## 允许修改

- `README.md`（L5 计数行）
- `docs/ROUTER_MAP.md`（标题/L3 计数行；若全文还有其他旧计数一并核对）
- `docs/ai/tasks/BACKLOG-025.md`、`docs/ai/EXEC_PLAN.md`、`task/CHANGELOG.md`

## 禁止修改

- `backend/`、`frontend/` 一切代码
- `docs/API_CONTRACT.md`（已正确）、`docs/ai/tasks/AIOS-*.md`（历史快照）
- 其他文档语义（只改计数数字，不改内容措辞）
- **不新增依赖、不删除文件**

## 完成标准

### 目标 1：计数核对与修正

- 以运行时 OpenAPI 为准（`backend/.venv/Scripts/python.exe -c "from app.main import app; ..."` 实测 paths/operations + router 数）
- 修正 `README.md` L5 与 `docs/ROUTER_MAP.md` 标题/L3 的过时计数（APIRouter 数、路径数、操作数三者都核对——注意 v1 下线后 business router 数变化，以运行时 `main.py` 实际 include 为准）
- 修正后全文扫一遍无残留旧计数（133/168 等）

### 目标 2：验证

- `git diff --check` 通过
- 纯文档改动，代码零改动确认（git status 仅文档文件）
- 一致性核对：README/ROUTER_MAP/API_CONTRACT 三处计数与运行时一致

### 目标 3：文档同步

- `docs/ai/EXEC_PLAN.md` 标记 `[DONE]`
- `task/CHANGELOG.md` 追加一条（**带 `## YYYY-MM-DD` 标题行**）

## 参考

- 运行时权威：`cd backend && .\.venv\Scripts\python.exe -c "from app.main import app; p=app.openapi()['paths']; print(len(p), sum(len([m for m in v if m in ('get','post','put','patch','delete')]) for v in p.values()))"`
- BACKLOG-021（v1 下线导致计数变化）、`docs/API_CONTRACT.md` 尾部（已正确 135/169）

## 验证命令

```powershell
cd backend && .\.venv\Scripts\python.exe -c "from app.main import app; p=app.openapi()['paths']; print(len(p), sum(len([m for m in v if m in ('get','post','put','patch','delete')]) for v in p.values()))"
cd .. && git diff --check
git status --short
```

## 完成证据（执行后填写）

- **运行时权威实测**：使用项目后端 venv 直接 import `app.main.app`，OpenAPI title 为 `FinQuant Hub`，`len(paths)` 为 **135**，GET/POST/PUT/PATCH/DELETE operation 合计 **169**。对 `backend/app/main.py` 的实际注册结构做 AST 核对：`auth.router` 直接 include 1 个，受 `authenticated_context` 保护的 tuple include 21 个，合计 **22 个 APIRouter**；`GET /api/health` 仍为额外内联路由。
- **修正前后**：`README.md` L5、路由层摘要和 API 概览三处均由 `23 / 133 / 168` 修正为 **`22 / 135 / 169`**；`docs/ROUTER_MAP.md` 标题由 `23 / 168` 修正为 **`22 / 169`**，L3 由 `133 / 168` 修正为 **`135 / 169`**。除数字外未改变这些行的措辞，也未改 ROUTER_MAP 的其他语义。
- **一致性**：修正后 README 三处、ROUTER_MAP 标题/L3 与只读的 `docs/API_CONTRACT.md` L438 均为 **22 APIRouter + 1 内联 health、135 paths、169 operations**；对 README/ROUTER_MAP 全文扫描，旧的 23-router / 133-path / 168-operation 当前计数残留为 0。`docs/API_CONTRACT.md` 和历史 `docs/ai/tasks/AIOS-*.md` 均未修改。
- **范围与验证**：025 只新增 README、ROUTER_MAP、本卡、EXEC_PLAN、CHANGELOG 五份文档差异；进入 025 时已完成的 024 package/lock 差异保持不变，`backend/` 与 `frontend/src/` 等代码零新增改动。`git diff --check` 和累计八文件允许范围审计通过，暂存区为空；无依赖新增、文件删除、commit 或 push。
