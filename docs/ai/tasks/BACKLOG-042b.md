# BACKLOG-042b 完成证据 — BACKLOG-042 回归修复（5 项既有测试跟上 v25 / connect 分派）

> 执行：DSH Worker（隔离子代理）｜ 日期：2026-09-13 ｜ 状态：代码完成，待维护者复核合入 ｜ **未 commit**
> 任务卡：`docs/ai/BACKLOG-042b.md` ｜ 起点 HEAD=`31c9f33`（工作树含 BACKLOG-043 未提交前端改动，本卡零触碰）

---

## 0. 结论

5 项回归**全部修复，且断言语义只增不减**。生产代码（`backend/app/**`）**零改动**——复核确认 BACKLOG-042 的生产行为正确（v25 迁移链完整、`restore_enabled_mcp_servers` 按 transport 分派且单服务器失败隔离），失败纯属测试未跟进。

全量门禁：`pytest -q` → **876 passed / 0 failed，覆盖率 92.57%**（修复前 871 passed + 5 failed = 876，总数不变，即没有靠删测试或跳过用例过关）；`ruff check .` exit 0；`git diff --check` exit 0；删除 0；未 commit。

---

## 1. 逐项修复（原断言 → 新断言 → 为何语义不放宽）

### 1.1 `test_database_migrations.py::test_legacy_research_and_backtest_tickers_are_normalized`

**原断言**：`assert history == [ ...1..24 硬编码字典列表... ]`（L36-61，v25 `install_mcp_stdio_transport` 落库后不等）。

**新断言**（同一处，拆成"固化历史 + 派生新增"两段）：

```python
expected_history = [ {"version": 1, ...}, ..., {"version": 24, "name": "install_schema_cleanup"} ]  # 仍为字面量
expected_history += [
    {"version": v, "name": database._MIGRATION_NAMES[v]}
    for v in range(25, database._SCHEMA_VERSION + 1)
]
assert history == expected_history
assert history[-1]["version"] == database._SCHEMA_VERSION
```

**为何不放宽**：v1..v24 仍是**逐条字面量**比对——迁移被删除、改名、跳号、错序都照样失败（`schema_version` 是 `INSERT OR IGNORE`，历史行名字一旦写错就永久留存，字面量正是为此存在）。v25 起从 `database._MIGRATION_NAMES` 派生，但**要求每个版本真的落库且已登记**：漏登记 → `KeyError`（见 §2 变异 A），跳号 → 列表长度/版本序列不等。同时新增 `history[-1]["version"] == _SCHEMA_VERSION` 显式锚定"迁移链走到了最新版本"，这是原断言隐含、新断言显式化的部分。原断言的意图（迁移链完整、按序、名字正确）**完全保留并加强**。

### 1.2 `test_database_migrations.py::test_job_runtime_migration_creates_pre_v23_backup_and_append_only_events`

**原断言**：`assert version[0] == database._SCHEMA_VERSION == 24`（v23 用例里硬编码 24）。

**新断言**：

```python
assert version[0] == database._SCHEMA_VERSION
assert version[0] >= database._JOB_RUNTIME_VERSION
recorded = await database.query_one("SELECT name FROM schema_version WHERE version=?", (database._JOB_RUNTIME_VERSION,))
assert recorded == {"name": "install_job_runtime"}
```

**为何不放宽**：`== 24` 的本意是"升级一路走到当时最新"。新断言保留 `== _SCHEMA_VERSION`（走到最新）并**新增**"v23 那一行必须被记录且名字为 `install_job_runtime`"——原断言只验证 `user_version` 终值，无法区分"真跑了 v23 迁移"与"只把 user_version 推到 24"。因此是加强：v23 迁移被跳过/漏记/改名仍会失败。同用例原有的备份存在、`scheduled_research_runs` 四列、事件表 append-only 双向 `IntegrityError` 断言一字未动。

### 1.3 `test_database_migrations.py::test_schema_cleanup_migration_creates_pre_v24_backup_and_drops_legacy_portfolio_tables`

**原断言**：`assert version[0] == database._SCHEMA_VERSION == 24`。

**新断言**：

```python
assert version[0] == database._SCHEMA_VERSION
assert version[0] >= database._SCHEMA_CLEANUP_VERSION
recorded = await database.query_one("SELECT name FROM schema_version WHERE version=?", (database._SCHEMA_CLEANUP_VERSION,))
assert recorded == {"name": "install_schema_cleanup"}
```

**为何不放宽**：核心断言（`portfolio_groups`/`portfolio_items`/`portfolio_trades` 三表已被删除、`portfolios` 活跃表未受影响、`pre-v24.bak` 已生成且备份内遗留表仍可恢复）**全部原样保留**——"遗留表被删 + 备份可恢复"这条真正要抓的回归没动一分。新增的 `install_schema_cleanup` 落库校验，补上了"清理迁移是否真的执行过"（原断言只能证明 `user_version` 到了 24）。

### 1.4 `test_api.py::TestSettingsAndMCPConfiguration::test_mcp_http_server_configuration_lifecycle`

**原断言/写法**：`monkeypatch.setattr(mcp_router, "connect_http_mcp_server", connect)`，fake 签名 `(name, url)` → `AttributeError`（路由已改导入 `connect_mcp_server`）。

**新断言/写法**：

```python
async def connect(config) -> int:
    assert config.command is None, "HTTP 服务器不应按 stdio 分派"   # 新增
    assert config.url.startswith("https://")                        # 保留
    connected.add(config.name)
    return 3
monkeypatch.setattr(mcp_router, "connect_mcp_server", connect)
```

**为何不放宽**：patch 目标改为端点实际调用的符号（`mcp.py:142 connect_mcp_server`），fake 仍断言"HTTP 配置必须带 https url"，并**新增** `config.command is None`——即"HTTP 配置不得走 stdio 分派"，正是 042 引入 transport 分派后最该守的语义。用例其余断言（非法 `file://` → 422、重名 → 409、connect 返回 `connected=True` 且 `tool_count == 3`、update 后 `is_enabled=False` 且连接被清、disconnect/delete/404）全部保留。`tool_count == 3` 只能来自 fake 的返回值，等价于"patch 点确实被端点命中"——若将来分派入口再次改名，patch 立刻失效并像本次一样硬失败。

### 1.5 `test_api.py::TestSettingsAndMCPConfiguration::test_enabled_mcp_servers_restore_and_record_failures`

**原断言/写法**：`monkeypatch.setattr(mcp_runtime, "connect_http_mcp_server", connect)`，fake 签名 `(name, url)`；patch 失效导致 `assert [] == ["working:..."]`。

**新断言/写法**：

```python
async def connect(config) -> int:
    if config.name == "broken":
        raise TimeoutError("deadline")
    restored.append(f"{config.name}:{config.url}")
    return 2
monkeypatch.setattr(mcp_runtime, "connect_mcp_server", connect)
await mcp_runtime.restore_enabled_mcp_servers()
assert restored == ["working:https://working.example.test/mcp"]        # 保留
assert failed["is_enabled"] == 1 and failed["last_error"] == "TimeoutError: deadline"  # 保留
# 新增：失败服务器不得污染成功服务器
assert working["is_enabled"] == 1 and working["last_error"] is None
```

**为何不放宽**：patch 目标改为 `restore_enabled_mcp_servers` 实际调用的 `connect_mcp_server`（`mcp_runtime.py:48`）。原有两条核心断言一字不改——"坏服务器抛异常后，好服务器仍被恢复"（`restored` 列表）+"失败被记录到该行 `last_error` 且 `is_enabled` 不被翻成 0"。**新增**成功行 `last_error is None`，补上"成功恢复要清错误"这一半语义（原用例只查失败行）。这样"单服务器失败不阻断其他服务器恢复 + 记录失败"两个意图都被覆盖，且 §2 变异 C 证明该用例确实会因"失败即中断"而失败。

---

## 2. 变异验证（证明断言仍然有效，未改生产文件）

用一次性 pytest 插件（`%TEMP%\fq042b_mutate.py`，仅在**进程内**改运行时对象，仓库与生产文件零改动）注入三种真实回归，跑修复后的用例：

| 变异 | 注入内容 | 结果 | 证明 |
|------|----------|------|------|
| A `drop_name` | `_MIGRATION_NAMES.pop(25)`（新版本漏登记） | **FAILED** `KeyError: 25` @ `database.py:710` | 1.1 的派生段真的在核对登记完整性 |
| B `rename_name` | `_MIGRATION_NAMES[1] = "normalize_legacy_tickers_renamed"` | **FAILED** `AssertionError` @ `test_database_migrations.py:69` | 1.1 的 v1..v24 字面量比对仍然生效 |
| C `restore_abort` | `restore_enabled_mcp_servers` 去掉 per-server `try/except` | **FAILED** `TimeoutError: deadline` @ `test_api.py:1734` | 1.5 确实能抓到"单服务器失败中断恢复" |

（变异 A 运行结束后 pytest 进程因残留 aiosqlite 线程未退出，已按 25s 上限 kill 并取日志；这是变异注入造成的进程收尾现象，与修复后的用例无关。）

1.4 的有效性无需变异即可判定：它 patch 的正是端点调用点，若调用点再变（本次就是这样），patch 立刻 `AttributeError` 或 fake 被绕过（真连网 → 502 → `tool_count == 3` 断言失败），失败是硬性的。

---

## 3. 门禁结果（HEAD=`31c9f33` + 本卡改动）

| 门禁 | 命令 | 结果 |
|------|------|------|
| 全量 backend | `cd backend && .venv\Scripts\python.exe -m pytest -q` | **876 passed / 0 failed**，覆盖率 **92.57%**（门限 80%），261.34s |
| 修复前对照 | 同上（HEAD 未改） | 871 passed / 5 failed（BACKLOG-043 记录一致） |
| 聚焦复跑 | `pytest tests/test_database_migrations.py tests/test_api.py -q --no-cov` | **67 passed**（原 62 passed + 5 failed） |
| Lint | `cd backend && .venv\Scripts\python.exe -m ruff check .` | `All checks passed!` exit 0 |
| 空白/冲突 | `git diff --check` | exit 0（仅 CRLF 提示，非错误） |
| 删除 | — | **0**（未删任何文件；未 commit） |

---

## 4. 生产代码缺陷核查

**未发现生产缺陷，`backend/app/**` 零改动**。逐条核实：

- `database.py`：`_SCHEMA_VERSION = _MCP_STDIO_VERSION = 25`，`_MIGRATION_NAMES` 含 v25 `install_mcp_stdio_transport`，`_migrate_schema` 在 `version < _MCP_STDIO_VERSION` 时执行 `_install_mcp_stdio_transport()` + `_record_schema_version(25)`，与测试新断言一致。
- `mcp_runtime.py`：`connect_mcp_server(config)` 为唯一分派入口（L15），`connect_http_mcp_server(name, url)` 仅为兼容薄封装（L26-28，全仓已无生产调用点，只有测试曾引用）；`restore_enabled_mcp_servers`（L31-59）逐行 `try/except`，失败写 `last_error`、成功清 `last_error`，`is_enabled` 不被改写——测试断言与之一致。
- `routers/mcp.py`：`connect` 端点调用 `connect_mcp_server(config)`（L142），失败置 `is_enabled=0` 并 502，成功置 1 并返回 `tool_count`。

**一处提请注意（非缺陷，交指挥裁决，本卡未动）**：`mcp_runtime.connect_http_mcp_server` 已成为无生产调用点的兼容薄封装（仅历史测试引用）。若维护者希望收口，可后续单独开卡评估删除；本卡按"禁止改生产代码"边界保留原样。

---

## 5. 诚实声明

- 本卡只改 `backend/tests/test_database_migrations.py`、`backend/tests/test_api.py` 两个测试文件；`backend/app/**`、`frontend/**`（含 BACKLOG-043 未提交改动）、依赖/锁文件、E2E 配置均零触碰。
- 覆盖率 92.57% 为全量 `pytest -q`（含 `--cov`）实测值；修复前对照的 871/5 取自 BACKLOG-043 记录，本卡未重跑修复前基线。
- 变异验证的插件位于 `%TEMP%`（仓库外），仓库内无残留探针文件。
- 未 commit、未 push，交维护者复核合入。
