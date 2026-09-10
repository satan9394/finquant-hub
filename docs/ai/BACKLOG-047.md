# BACKLOG-047 — 死代码收口：移除 mcp_runtime.connect_http_mcp_server（零调用点）

> 状态：`[READY]` ｜ 优先级：P3 ｜ 创建：2026-09-13 ｜ 完成：— ｜ 执行：DSH Worker

## 背景

BACKLOG-042（`ed02b20`）把 MCP 连接重构为 `connect_mcp_server(config)` 统一分派后，`backend/app/services/mcp_runtime.py` L26-28 的 `connect_http_mcp_server(name, url)` 变成薄封装（内部调 `connect_mcp_server(MCPServerConfig(...))`）。042b（`c8735c3`）把测试 patch 目标改为 `connect_mcp_server` 后，指挥实测（2026-09-13）该函数**全程零调用点**（仅剩自身定义）——纯死代码。

## 目标

1. 移除 `connect_http_mcp_server` 定义（约 3 行：L26-28 + 相关注释）。
2. 全仓复核（`backend/app`、`backend/tests`）确认移除后无任何引用残留——若有（如测试、其他 service），说明并评估是跟随移除还是保留。
3. 若有补丁/注释引用该函数名（如 042 卡证据里的描述），文档层面如实注明已收口。

## 允许修改
- `backend/app/services/mcp_runtime.py`（仅删该函数 + 相关注释）
- 测试：`backend/tests/test_mcp_transport.py`、`backend/tests/test_api.py`（**仅当**确实引用了该函数名；若零引用则零改动）
- 证据：`docs/ai/tasks/BACKLOG-047.md`、`docs/ai/BACKLOG-047.md`、`docs/ai/EXEC_PLAN.md`、`task/CHANGELOG.md`、`HANDOFF.md`

## 禁止修改
- 不得改动 `connect_mcp_server` 或任何其他生产函数行为；不改 `database.py`；不动前端/依赖/E2E config
- 不删文件；不 commit

## 完成标准
1. `connect_http_mcp_server` 从 `mcp_runtime.py` 移除；全仓 grep `connect_http_mcp_server` **0 命中**
2. 全量 backend 门禁通过：`cd backend && .venv\Scripts\python.exe -m pytest -q` **0 failed**、`ruff check .` exit 0
3. `git diff --check` 通过；删除 0；未 commit

## 参考
- `backend/app/services/mcp_runtime.py` L15（connect_mcp_server 分派）、L26-28（待删薄封装）、L48（restore 走 connect_mcp_server）
- 相关提交：`ed02b20`（042 重构）、`c8735c3`（042b 测试 patch 目标变更）

## 完成证据模板
```
- 删除 diff（函数 + 注释）与全仓 grep 0 命中证明
- 全量 pytest 结果（passed/failed）+ ruff 结果
- 是否动过测试（若无则说明为何不需要）
- git diff --check、删除 0、未 commit
```