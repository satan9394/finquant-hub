# BACKLOG-025 — 文档计数一致性：README/ROUTER_MAP 同步到运行时 OpenAPI

> 状态：`[READY]` ｜ 优先级：P2 ｜ 创建：2026-09-03 ｜ 执行者：Codex
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

- 修正前后计数对照（README/ROUTER_MAP 各文件行）
- 运行时实测计数（paths/operations/router 数）
- 一致性核对结果（三处文档一致）
- 代码零改动确认；无删除
