# BACKLOG-042 完成证据

> 任务：MCP 供应商兼容——补 stdio transport（本地 command+args+env，通用 MCP 客户端形态）
> 执行：DSH Worker ｜ 完成：2026-09-13 ｜ 状态：代码完成待维护者复核合入

## 改动清单（严格限于卡 §允许）

### 后端
- `backend/app/database.py`：
  - `mcp_server_configs` 建表改可空 `url TEXT` 并新增 `command TEXT`、`args_json TEXT`、`env_json TEXT`（新库经 CREATE TABLE 直接带列）。
  - **v25 迁移**：新增 `_MCP_STDIO_VERSION = 25`、`_SCHEMA_VERSION` 提升到 `_MCP_STDIO_VERSION`、`_MIGRATION_NAMES[25]="install_mcp_stdio_transport"`；`_migrate_schema()` 增 `if version < _MCP_STDIO_VERSION` SAVEPOINT 块（commit 后 `PRAGMA user_version=25` + `_record_schema_version` + 失败 ROLLBACK TO SAVEPOINT）；`_install_mcp_stdio_transport()` 幂等 `ALTER TABLE ... ADD COLUMN`（已存在则忽略）。**旧 http 行 `url` 保留、`command/args_json/env_json` 留空即 http 兼容**；既有 v24 库会正确升级（见门禁实测）。未动 v24 及更早任何迁移/清理逻辑。
- `backend/app/routers/mcp.py`：
  - `MCPServerCreate`/`Update` 改 `url`/`command` 可为空 + `args: list[str]`；`validated_config()` 组装 `MCPServerConfig`（bridge `__post_init__` 强制 url 与 command **二选一**：`(url is None)==(command is None)` 抛 ValueError → 路由 catch → 422；http 含 args/env 亦拒绝 → 满足"http=url、stdio=command+args"两 transport 校验）。
  - create/update INSERT/UPDATE 写 `url,command,args_json`（`json.dumps(args)`，重复 init 幂等）。
  - `_public_config` 按 `command` 是否有值回显 `transport: 'http'|'stdio'` + `args` 数组（不暴露密钥，stdio 亦不存 env 明文敏感值——env 列本卡仅预留不落地，见 §边界声明）。
  - connect 端点改为经 `connect_mcp_server(config)` 按 config 分派。
- `backend/app/services/mcp_runtime.py`：
  - 新增 `connect_mcp_server(config)`（统一入口，bridge 内部按 `url`→`Client(url)`、`command`→`stdio_client(StdioServerParameters(...))` 分派；`register_tools()` 10s 超时不变）；`connect_http_mcp_server` 保留为 http 薄封装；`restore_enabled_mcp_servers` 读 `url,command,args_json` 并按行做 json args 解析后逐都一样分派。
- 新增 `backend/tests/test_mcp_transport.py`：确定性 6 用例（独立临时 DB 隔离）：http create roundtrip、stdio create roundtrip、both URL+command 拒绝 422、neither 拒绝 422、restore 按 command 分派 mock（2 行 http/stdio）、建表含 command/args_json/env_json 列。**不真启外部进程**（mock connect）。

### 前端
- `frontend/src/services/mcpApi.ts`：`MCPServerConfigItem` 增 `command/args`、`transport` 扩 `'http'|'stdio'`；`MCPServerConfigInput` 增可选 `command/args`。
- `frontend/src/components/settings/MCPServerSettingsPanel.tsx`：新增 transport 切换 `Select`（http→url 组 / stdio→command+args 组，env 不落表单）；编辑回填 `item.command→stdio / else http`、args 逗号分隔回填；保存按 transport 组装 `{url}` 或 `{command, args}`（args 逗号分并 trim+过滤空）；中文提示 `npx/uvx/node` AutoComplete 候选。
- `frontend/src/i18n/zh.ts`+`en.ts`：新增 6 key（transport/transportHttp/transportStdio/command/args/argsHelp），变更 title/notice 文案为"支持 http+stdio"。**parity 0**（见下）。
- `frontend/src/types/openapi.generated.ts`：`MCPServerCreate/Update` 同步 `url/command` 可空 + `args` 数组（与后端 pydantic 逐字段一致；openapi_tsgen `--check` 报 fresh）。

### 契约/证据
- `docs/API_CONTRACT.md`、`docs/ROUTER_MAP.md`：补 BACKLOG-042 transport 说明条目。
- `docs/ai/EXEC_PLAN.md`：顶部 042 `[READY]→[DONE]` + 证据段。
- `docs/ai/tasks/BACKLOG-042.md`（本文件）：完成证据。

## 表迁移与旧行兼容验证
- SAVEPOINT 增量迁移：`_SCHEMA_VERSION` 24→25，独立 `install_mcp_stdio_transport` SAVEPOINT 块。
- 实测（Driver，等价于卡 §标 pytest 的 `test_schema_columns_exist` 用例）：
  - fresh DB `init_db` → `mcp_server_configs` 含 `command/args_json/env_json`（CREATE TABLE 路径）✓
  - 模拟 v24 DB（建库后 `PRAGMA user_version=24` 再 `init_db`）→ 迁移到 `user_version=25` 且三列补齐（ALTER 路径）✓
- 旧 http 行：`url` 保留、新列 NULL → `_public_config` 回显 `transport:"http"`，行为不变。

## transport 校验 / 连接分派
- create http（url）roundtrip `transport=http` ✓；create stdio（command+args）roundtrip `transport=stdio, args=[...]` ✓；neither→422、both→422（bridge `__post_init__` 二选一不变量）✓；update stdio→http 后 `transport` 反映真实 ✓。
- connect/restore 按 `config.command` 是否为空分派：http 行→`url`、stdio 行→`command`（mock 断言两个 config 分别落到对应字段）✓。**零新依赖**：stdio 路径直接复用既有 MCP SDK `mcp.stdio_client`/`StdioServerParameters`（mcp>=2,<3 已装），未新增任何 python/npm 依赖。

## stdio 连接实现说明（深度）
- 复用既有 `mcp_bridge.MCPBridge._new_client()`：`url`→`Client(url)`（http/SSE），`command`→`StdioServerParameters(command,args=...)` + `stdio_client`→`Client`。本卡做到"能分派到 stdio 路径（拉起 command 并 `register_tools()` 发现工具）"深度即止；**stdio 真启外部进程的端到端未在沙箱内执行**（受限，见 §门禁实测），高级特性（env 注入、强交互/鉴权握手）留给后续卡。

## i18n parity
- zh/en 各 35 条 `settings.mcp.*`，差集 0、重复 0（新增 6 key 一一对应）。

## 门禁实测（本收尾会话）
- backend `ruff check app tests`：**通过（exit 0）**。
- backend `test_mcp_transport.py`（6 用例）+ 迁移 2 场景：**全绿**——经等价 Driver 直接执行验证（本会话为 DSH 委托沙箱，pytest 的 tmp/cleanup 目录枚举被沙箱 WinError 5 阻断、无法以 pytest 进程化运行；driver 逐条覆盖卡 §标用例的断言，见 §表迁移/校验/分派段落，均为 PASS 6/6 + 迁移 2/2）。
- frontend `tsc -b`：**通过（exit 0）**；`openapi_tsgen.py --check`：**fresh**。
- frontend `bun run build`/Vitest：本会话沙箱下 esbuild 子进程 spawn **EPERM**（沙箱禁传 pipe 的 child spawn，环境限制非代码），未能完成 vite bundling 与 Vitest；TS 已由 `tsc -b` 独立验证。详见 §边界诚实声明。
- `git diff --check`：见 commit 前校验。
- 删除 0；未 commit / 未 push（本证据落盘于 commit 前）。

## 边界诚实声明
- 遵守卡 §允许/§禁止：不加新依赖；不存 env 明文敏感值（`env_json` 列本卡**仅建列预留、未接 UI/未落敏感数据**；需凭据走既有 credential 机制，留后续）；不改其他 MCP 供应商/表；不删文件（回收站铁律；会话内临时 pytest 脚本已回收，残留 ACL 阻断目录由指挥清理）；不动模型/用量/context 域；不改 E2E/playwright config。
- 前端 vollständig build/Vitest 与 backend pytest **进程化门禁在本委托沙箱内未能跑通**（沙箱限制：pytest tmp 目录枚举 WinError 5、esbuild child spawn EPERM），已用等价 driver + `tsc -b` + ruff + parity 0 覆盖逻辑正确性，建议维护者在本机常规环境补跑 `backend pytest -q`、`bun run build`、聚焦 `MCPServerSettingsPanel.test.tsx`、`bun run test`。
- stdio 真启外部进程端到端未测（深度受限，如实）。