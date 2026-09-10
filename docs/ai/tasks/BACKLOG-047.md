# BACKLOG-047 完成证据 — 死代码收口：移除 mcp_runtime.connect_http_mcp_server（零调用点）

> 执行：DSH Worker（隔离子代理）｜ 日期：2026-09-13 ｜ 状态：代码完成，待维护者复核合入 ｜ **未 commit**
> 任务卡：`docs/ai/BACKLOG-047.md` ｜ 起点 HEAD=`e6ada26`（工作树含 BACKLOG-046 未提交文档改动，本卡零触碰）

---

## 0. 结论

`backend/app/services/mcp_runtime.py` 中的 `connect_http_mcp_server` 薄封装**已移除**（函数 + docstring，共 3 行 + 前后空行）。移除后：

- **代码全仓 grep 0 命中**：`backend/app`、`backend/tests`、`frontend/src`、`frontend/e2e`、`frontend/e2e-8000`、`scripts/`、`memory/` 均无任何 `connect_http_mcp_server` 引用残留。
- `connect_mcp_server`（统一分派入口）与 `restore_enabled_mcp_servers` **一字未动**；import、`MCPServerConfig` 使用、模块 docstring 均保持原样。
- 文档层面：`docs/ai/BACKLOG-042.md` / `BACKLOG-042b.md` 及其 tasks 证据中的函数名属于历史证据描述（卡 §目标 3 明确"如 042 卡证据里的描述，文档层面如实注明已收口"），按卡 §允许修改清单不触碰历史证据文件，收口事实由本证据 + EXEC_PLAN + CHANGELOG + HANDOFF 如实记载。
- 测试零改动（无任何测试引用该符号）。

门禁：全量 backend `pytest -q`（见 §3，环境适配后 **0 failed**）；`ruff check .` exit 0；`git diff --check` exit 0；删除 0；未 commit。

---

## 1. 删除 diff（函数 + 注释）

`git diff -- backend/app/services/mcp_runtime.py`：

```diff
@@ -23,11 +23,6 @@ async def connect_mcp_server(config: MCPServerConfig) -> int:
     return len(tools)
 
 
-async def connect_http_mcp_server(name: str, url: str) -> int:
-    """HTTP (SSE) MCP server, kept as a thin wrapper for existing callers."""
-    return await connect_mcp_server(MCPServerConfig(name=name, url=url))
-
-
 async def restore_enabled_mcp_servers() -> None:
```

删除前文件 59 行 → 删除后 54 行；净变化 **-5 行**（3 行函数 + docstring 上 1 行注释 + 函数后 1 个空行；PEP8 双空行分隔保留）。`connect_mcp_server` 与 `restore_enabled_mcp_servers` 之间仍保持标准双空行。

---

## 2. 移除后全仓 grep 0 命中证明

`Select-String`/ripgrep 全仓扫描 `connect_http_mcp_server`（含大小写不敏感复查无变体如 `ConnectHttpMcpServer`）：

| 范围 | 命中 |
|---|---|
| `backend/app/**`（含 services、routers、tools） | 0 |
| `backend/tests/**` | 0 |
| `frontend/src/**` | 0 |
| `frontend/e2e/**`、`frontend/e2e-8000/**` | 0 |
| `scripts/**` | 0 |
| `memory/**` | 0 |

唯一残留为文档历史记录（属预期，按卡 §目标 3 处理）：
- `docs/ai/BACKLOG-042.md`、`docs/ai/BACKLOG-042b.md`、`docs/ai/tasks/BACKLOG-042.md`、`docs/ai/tasks/BACKLOG-042b.md` —— 042/042b 历史证据描述，**不在本卡 §允许修改清单，不改**。
- `docs/ai/BACKLOG-047.md`（本卡自身标题/背景）、`docs/ai/EXEC_PLAN.md`（047 条目）、`task/CHANGELOG.md`（042b 历史条目）—— 收口事实记载。

**复核引用阶段结论**：无业务代码/测试引用该函数（042b 曾 patch 的两个测试已于 `c8735c3` 改为 patch `connect_mcp_server`，本卡复核 `app/routers/mcp.py` 无引用），**不需要动任何测试**。

---

## 3. 门禁

### 环境说明（诚实声明）

首轮全量 `pytest -q` 在隔离沙箱默认环境出现 **12 failed + 89 errors**，全部为同一环境性根因：httpx 0.28.1 `MarketDataService.__post_init__` → `httpx.AsyncClient(trust_env=True)` → `URLPattern(key)` 构造代理挂载点时，因 `no_proxy` 含 IPv6 方括号条目 `[::1]` 生成畸形 key `all://*[::1]`，`normalize_port` 报 `Invalid port: ':1]'`（httpx `_utils.get_environment_proxies` L69-70 对已带方括号的 IPv6 再包一层方括号导致）。**与本次代码删除无关**——失败用例全是构造 `MarketDataService()` / lifespan 的测试，且本地复现 `httpx.AsyncClient(trust_env=True)` 在同样环境变量下必然失败；将 `no_proxy` 改为无方括号形式（`localhost,127.0.0.1,::1`）后同一条命令构造成功。

按项目既有惯例（HANDOFF 2026-08-29 记录"SOCKS 失败经清除 ALL_PROXY 后通过（纯环境问题）"），门禁以**适配环境变量值**（仅覆盖 `no_proxy`/`all_proxy` 取值，不删环境变量、不改任何代码/测试）重跑。

### 结果（适配环境重跑）

```
全量 pytest -q: 909 passed / 0 failed（覆盖率与基线一致）
ruff check .    : All checks passed!（exit 0）
git diff --check: exit 0
```

- **pytest**：909 passed / 0 failed（与 BACKLOG-045 验证基线 909 passed / 0 failed 完全一致——本卡零测试改动、零新增用例，总数不变证明未删/未跳测试）。
- **ruff**：`All checks passed!`（删除后无未使用 import 等告警；`MCPServerConfig` 仍被 `connect_mcp_server` 签名与 `restore_enabled_mcp_servers` 使用，import 保留正确）。
- **git diff --check**：exit 0（无空白错误）。

---

## 4. 是否动过测试

**零改动。** 复核确认测试全仓无 `connect_http_mcp_server` 引用（042b 已于 2026-09-13 `c8735c3` 将两个 MCP 测试的 patch 目标改为 `connect_mcp_server`），因此本卡按卡 §允许修改"测试：仅当确实引用了该函数名；若零引用则零改动"执行——**不需要修改任何测试**。

---

## 5. 完整性检查

- 全量 pytest **0 failed**（909 passed）✅
- `ruff check .` exit 0 ✅
- `git diff --check` exit 0 ✅
- 代码全仓 grep `connect_http_mcp_server` **0 命中** ✅
- 删除 0（无回收站操作、无文件删除）✅
- 未 commit ✅
- 禁止范围零触碰：`connect_mcp_server` 一字未动、`database.py` 未动、前端/E2E config/依赖未动 ✅