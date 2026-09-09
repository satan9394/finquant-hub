# BACKLOG-042b — BACKLOG-042 回归修复：backend 5 项测试未跟上 v25/分派改动

> 状态：`[DONE]` ｜ 优先级：P0 ｜ 创建：2026-09-13 ｜ 完成：2026-09-13 ｜ 执行：DSH Worker（待维护者复核合入）
> 背景：BACKLOG-042（commit ed02b20）合入时指挥只补跑了新增的 `test_mcp_transport.py`（6/6），**未跑全量 backend 套件**，导致 5 项既有测试回归未被发现。BACKLOG-043 复核时暴露：`pytest tests/test_database_migrations.py tests/test_api.py -q` → **5 failed, 62 passed**。本卡修复这 5 项。

## 失败清单（实测，HEAD=31c9f33）
1. `tests/test_database_migrations.py::test_legacy_research_and_backtest_tickers_are_normalized` — 迁移列表比对失败（L60 硬编码 `{"version": 24, "name": "install_schema_cleanup"}`，v25 已加入）
2. `tests/test_database_migrations.py::test_job_runtime_migration_creates_pre_v23_backup_and_append_only_events` — `assert 25 == 24`
3. `tests/test_database_migrations.py::test_schema_cleanup_migration_creates_pre_v24_backup_and_drops_legacy_portfolio_tables` — `assert 25 == 24`
4. `tests/test_api.py::TestSettingsAndMCPConfiguration::test_mcp_http_server_configuration_lifecycle` — `AttributeError: module 'app.routers.mcp' ...`（测试 L1681 仍 patch `mcp_router.connect_http_mcp_server`）
5. `tests/test_api.py::TestSettingsAndMCPConfiguration::test_enabled_mcp_servers_restore_and_record_failures` — `assert [] == ['working:https://working.example.test/mcp']`（测试 L1736 patch `mcp_runtime.connect_http_mcp_server`，但 `restore_enabled_mcp_servers` 已改走 `connect_mcp_server` 分派，patch 失效）

## 根因
- `backend/app/services/mcp_runtime.py`：L26-28 `connect_http_mcp_server(name,url)` 已改为薄封装（内部调 `connect_mcp_server(MCPServerConfig(...))`）；L48 `restore_enabled_mcp_servers` 直接调 `connect_mcp_server(config)` 按 transport 分派。**生产逻辑正确**，是测试的 patch 目标与版本断言过时。
- `database.py`：`_SCHEMA_VERSION` 24→25（BACKLOG-042 有意变更），迁移测试硬编码 24。

## 目标
1. 修复上述 5 项测试，**使其校验真实意图而非硬编码常量**：
   - 版本相关：改为与 `database._SCHEMA_VERSION` 一致或显式断言 v25 存在（避免下次再加版本又要改）；**不得放宽断言语义**（该断言的目的是验证迁移链完整/备份表创建/遗留表被删，必须保留）。
   - MCP 相关：patch 目标改为新的分派入口（`connect_mcp_server`），并**新增/保留**对"单个失败服务器不阻断其他服务器恢复 + 记录失败"的断言。
2. **不得修改生产代码来迁就测试**——若核实发现生产行为确有缺陷，如实上报指挥，不擅自改 `mcp_runtime.py`/`database.py`（本卡默认只改测试）。
3. 全量 backend 套件必须 **0 failed**：`cd backend && .venv\Scripts\python.exe -m pytest -q`。
4. `ruff check .` 通过；删除 0；不 commit。

## 允许修改
- `backend/tests/test_database_migrations.py`、`backend/tests/test_api.py`
- 证据：`docs/ai/tasks/BACKLOG-042b.md`、`docs/ai/BACKLOG-042b.md`、`docs/ai/EXEC_PLAN.md`、`task/CHANGELOG.md`、`HANDOFF.md`

## 禁止修改
- `backend/app/**`（生产代码）——除非指挥另行授权；`frontend/**`；依赖/锁文件；`frontend/e2e/**`、`playwright*.config.ts`；不删文件

## 完成标准
1. 5 项失败全部修复且**断言语义不放宽**（说明每项改了什么、为何仍能捕获真实回归）
2. 全量 `pytest -q` **0 failed**（给出通过数/覆盖率数字）
3. `ruff check .` 通过；`git diff --check` 通过；删除 0；未 commit

## 参考
- `backend/app/services/mcp_runtime.py`（L15 connect_mcp_server / L26 connect_http_mcp_server 薄封装 / L48 restore 分派）
- `backend/app/database.py`（`_SCHEMA_VERSION`=25、`_MIGRATION_NAMES`、`_install_mcp_stdio_transport`）
- 相关提交：`ed02b20`（BACKLOG-042）

## 完成证据模板
```
- 5 项逐条：原断言 → 新断言 → 为何语义不放宽（该断言原本要捕获什么回归）
- 全量 pytest 结果（passed/failed/覆盖率）
- ruff / git diff --check / 删除 0 / 未 commit
- 是否发现生产代码缺陷（有则如实上报，不擅自改）
```

## 完成证据（2026-09-13，DSH Worker，待维护者复核合入）

**结论**：5 项全修，断言语义只增不减；`backend/app/**` **零改动**（复核确认 BACKLOG-042 生产行为正确，失败纯属测试未跟进）。

1. **`test_legacy_research_and_backtest_tickers_are_normalized`**：原 `history == [1..24 字面量列表]` → 新「v1..v24 仍逐条字面量 + v25 起从 `database._MIGRATION_NAMES` 派生并要求真落库」+ `history[-1]["version"] == _SCHEMA_VERSION`。历史迁移删除/改名/跳号照旧失败，新增"版本漏登记"检测（`KeyError`）。
2. **`test_job_runtime_...pre_v23_backup_and_append_only_events`**：原 `== _SCHEMA_VERSION == 24` → `== _SCHEMA_VERSION` + `>= _JOB_RUNTIME_VERSION` + 显式断言 `schema_version` 中 v23 行 `name == "install_job_runtime"`。补上"v23 迁移是否真跑过"，备份/四列/append-only 断言未动。
3. **`test_schema_cleanup_...drops_legacy_portfolio_tables`**：原 `== _SCHEMA_VERSION == 24` → 同上模式 + 显式断言 v24 行 `name == "install_schema_cleanup"`。三张遗留表被删、`portfolios` 未受影响、`pre-v24.bak` 内遗留表可恢复等核心断言原样保留。
4. **`test_mcp_http_server_configuration_lifecycle`**：patch 目标 `mcp_router.connect_http_mcp_server` → `mcp_router.connect_mcp_server`，fake 签名改 `(config)`，保留 `url.startswith("https://")` 并**新增** `config.command is None`（HTTP 不得走 stdio 分派）。其余生命周期断言未动。
5. **`test_enabled_mcp_servers_restore_and_record_failures`**：patch 目标 `mcp_runtime.connect_http_mcp_server` → `mcp_runtime.connect_mcp_server`，fake 改 `(config)`；"坏服务器失败不阻断好服务器恢复"+"失败被记录"两条原断言保留，**新增**成功行 `last_error is None`（成功需清错误）。

**变异验证**（`%TEMP%` 一次性 pytest 插件，进程内注入、生产文件零改动）：`_MIGRATION_NAMES.pop(25)` → 用例 1 FAILED（`KeyError: 25`）；`_MIGRATION_NAMES[1]` 改名 → 用例 1 FAILED（`AssertionError`）；restore 去掉 per-server `try/except` → 用例 5 FAILED（`TimeoutError`）。三项证明修复后断言仍在真实捕获回归。

**门禁**：全量 `cd backend && .venv\Scripts\python.exe -m pytest -q` → **876 passed / 0 failed，覆盖率 92.57%**（修复前 871 passed + 5 failed = 876，总数不变）；聚焦 `pytest tests/test_database_migrations.py tests/test_api.py -q --no-cov` → **67 passed**；`ruff check .` → `All checks passed!` exit 0；`git diff --check` → exit 0；**删除 0**；**未 commit**。

**生产缺陷**：未发现。附一条交裁决的观察（本卡未动）：`mcp_runtime.connect_http_mcp_server`（L26-28）已无生产调用点，仅为历史测试保留的兼容薄封装，是否收口由维护者决定。

详见 `docs/ai/tasks/BACKLOG-042b.md`。
