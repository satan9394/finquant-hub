# BACKLOG-047 — 死代码收口：移除 mcp_runtime.connect_http_mcp_server（零调用点）

> 状态：`[DONE]` ｜ 优先级：P3 ｜ 创建：2026-09-13 ｜ 完成：2026-09-13 ｜ 执行：DSH Worker（代码完成，待维护者复核合入）

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

## 执行结果（2026-09-13，DSH Worker）

完整证据见 `docs/ai/tasks/BACKLOG-047.md`，要点：

1. **删除 diff**：`mcp_runtime.py` 仅删 `connect_http_mcp_server` 函数 + docstring + 相邻空行（文件 59→54 行，-5 行净变化；PEP8 双空行保留）；`connect_mcp_server`/`restore_enabled_mcp_servers`/imports 一字未动。
2. **代码全仓 grep 0 命中**：移除后 `backend/app`、`backend/tests`、`frontend/src`、`frontend/e2e`、`frontend/e2e-8000`、`scripts/`、`memory/` 均 0 命中（含变体 `connect_http`/`connectHttp`）；函数名仅残留于 **docs 历史证据**（042/042b 卡及 tasks 证据），按本卡 §目标 3 如实注明已收口，历史证据文件不在 §允许清单故未改。
3. **门禁**：全量 `pytest -q` **909 passed / 0 failed**（与 045 基线一致）；`ruff check .` exit 0；`git diff --check` exit 0；删除 0；未 commit。
4. **测试零改动**：042b（`c8735c3`）已把两个 MCP 测试 patch 目标改为 `connect_mcp_server`，复核无任何测试引用该符号，故按 §允许"若零引用则零改动"执行。
5. **环境说明（诚实声明）**：隔离沙箱默认 `no_proxy` 含 `[::1]` 触发 httpx 0.28.1 `URLPattern` `Invalid port: ':1]'`（首轮 12 failed + 89 errors 全同根因，均与删除无关，`httpx.AsyncClient(trust_env=True)` 本地复现可证）；按项目既有惯例（见 HANDOFF 2026-08-29 SOCKS/代理环境记录）Python 进程内覆盖 `no_proxy` 后重跑，不改任何代码/测试。