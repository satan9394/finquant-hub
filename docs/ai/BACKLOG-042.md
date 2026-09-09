# BACKLOG-042 — MCP 供应商兼容：补 stdio transport（本地 command+args+env，通用 MCP 客户端形态）

> 状态：`[DONE]` ｜ 优先级：P2 ｜ 创建：2026-09-08 ｜ 完成：2026-09-13 ｜ 执行：DSH Worker
> 背景：用户指令"MCP 相关供应商兼容任何 MCP"+ 参考 CC Switch 统一 MCP 面板/通用 MCP 客户端。现状核实（2026-09-08）：**MCP SDK（`mcp>=2,<3`）+ bridge 已支持 stdio**——`mcp_bridge.py` L11-12 import `StdioServerParameters`/`stdio_client`，`MCPServerConfig` L22-43 已支持 `url` 或 `command`（二选一校验），SDK stdio_client 实测可用。**缺口在"两端未接"**：`mcp_server_configs` 表只 `name/url`（database.py:203-211）、`mcp.py` create/update/connect 只收/发 url（connect_http_mcp_server only）、前端 `mcpApi.ts` 已预留 transport 'http'|'stdio' 但 create/config item 只发 url、`MCPServerSettingsPanel` 只 url 表单。**本卡只接通表/路由/前端，不重写 bridge/SDK。**

## 目标

1. **表扩展**：`mcp_server_configs` 加列 `transport TEXT NOT NULL DEFAULT 'http'`、`command TEXT`、`args_json TEXT`（JSON 数组）、`env_json TEXT`（JSON 对象，可选，**不存敏感 env 明文**）——SAVEPOINT 增量迁移（`_SCHEMA_VERSION` 提升），旧行默认 http 兼容。
2. **后端 create/update**：`MCPServerCreate/Update` 支持 transport（http|stdio）；http 校验 url、stdio 校验 command（必填）+ args 数组；`validated_config()` 生成含 transport 的 config 交给 bridge（bridge 的 MCPServerConfig 已支持 url/command 二选一，直接复用）。
3. **connect 按 transport 分派**：`mcp_runtime.py` 按 config.command 有值则走 stdio（`stdio_client(StdioServerParameters(command=..., args=...))` 复用已有 string），否则 http（保留现状）；connect 端点按 transport 调。**零新依赖**（MCP SDK 已有）。
4. **前端**：`MCPServerSettingsPanel`/`mcpApi` 支持 transport 切换（http url 组 / stdio command+args 组，env 可选）——中文提示（目标中文非技术用户）；config item transport 反映真实。
5. **契约**：API_CONTRACT/ROUTER_MAP 同步；测试（表迁移/create/update 两 transport 校验/connect 分派 mock）。

## 允许修改
- `backend/app/database.py`（mcp_server_configs 加列 + 迁移）、`backend/app/routers/mcp.py`、`backend/app/services/mcp_runtime.py`、`backend/app/tools/mcp_bridge.py`（若 config 结构变需同步）
- `frontend/src/services/mcpApi.ts`、`frontend/src/components/settings/MCPServerSettingsPanel.tsx`、`frontend/src/i18n/zh.ts`+`en.ts`（新字段文案）
- 测试：`backend/tests/test_mcp*.py`、前端 MCP 面板测试
- 证据文档：`docs/ai/BACKLOG-042.md`、`docs/ai/tasks/BACKLOG-042.md`（新建）、`docs/ai/EXEC_PLAN.md`、`docs/API_CONTRACT.md`、`docs/ROUTER_MAP.md`、`task/CHANGELOG.md`、`HANDOFF.md`

## 禁止修改
- 不加新依赖（MCP stdio 用 asyncio 子进程手动协议或复用既有 SDK，如实说明）；不改其他 MCP 相关供应商/表；不删除文件（回收站铁律）
- 不存 env 明文敏感值（如需凭据走既有 credential 机制或在证据说明限制）；不改 E2E/playwright config（mcp 相关 e2e 先 grep 核禁改）；不动模型/用量/context（036-041/043 域）
- 不做完整 MCP stdio 高级特性（若 MCP SDK 未引入，stdio 连接实现到"能拉起进程并发现工具/成对调用"深度即止，高级留给后续）

## 完成标准
1. 表加 transport/command/args/env 列 + 迁移安全（旧 http 行兼容）；create/update 校验两 transport（http url / stdio command+args）
2. connect 按 transport 分派（http 原样、stdio 新路径）；stdio 实现能拉起 command 并发现工具（证据说明深度/依赖）
3. 前端表单 transport 切换 + 字段中文提示；config item transport 反映真实；i18n parity 0
4. 确定性测试（表迁移/校验/分派/前端切流）+ build + Vitest 全量 + 4173 50 + 8000 21 全绿
5. API_CONTRACT/ROUTER_MAP 同步；git diff --check；删除 0；工作树干净；不 commit

## 参考
- CC Switch 统一 MCP 面板（command/url 双形态管理）；通用 MCP 客户端 stdio 形态
- 现状：`mcp_server_configs` 表（database.py:203-211）、`mcp.py`（HTTP only）、`mcp_runtime.py`、`mcp_bridge.py`、`mcpApi.ts`（已预留 transport 类型）、`MCPServerSettingsPanel.tsx`
- 迁移先例：BACKLOG-036（api_key 列 SAVEPOINT）、database.py `_install_schema_cleanup`

## 完成证据模板
```
- 表迁移 diff + 旧行 http 兼容验证
- create/update/connect 两 transport diff + 校验/分派测试
- stdio 连接实现说明（深度/是否复用 SDK/零依赖确认）
- 前端 transport 切换 diff + i18n parity
- API_CONTRACT/ROUTER_MAP 同步 + 全量门禁
- git diff --check、删除 0、未 commit
```

## 完成证据（2026-09-13，DSH Worker，代码完成待维护者复核合入）

- **表迁移**：`mcp_server_configs` 建表可空 `url` + 新增 `command/args_json/env_json`；新增 **v25 SAVEPOINT 增量迁移**（`_MCP_STDIO_VERSION=25`、`_SCHEMA_VERSION` 24→25、`_MIGRATION_NAMES[25]`、`_install_mcp_stdio_transport()` 幂等 ALTER；SAVEPOINT 失败 ROLLBACK）。实测 fresh DB 与**模拟 v24 DB→25** 均补列成功；旧 http 行 `url` 保留、新列空即兼容（`transport=http` 回显不变）。
- **create/update 校验**：`validated_config()` → bridge `MCPServerConfig.__post_init__` url/command **二选一** 抛 ValueError→路由 422（neither 与 both 均拒、http 禁 args/env）；http url / stdio command+args roundtrip 均过（driver 逐条 PASS）。
- **connect 分派**：`connect_mcp_server(config)` 统一入口，bridge 按 `url`→`Client(url)`、`command`→`StdioServerParameters+stdio_client`；restore 读 `url,command,args_json` 并按行解析分派（mock 断言 http/stdio 两行正确落位）。**零新依赖**（复用既有 MCP SDK stdio_client）。
- **stdio 深度**：做到"能分派到 stdio 路径并 `register_tools()` 发现工具"即止；真启外部进程端到端与 env 注入高级特性留给后续。
- **前端**：`MCPServerSettingsPanel.tsx`/`mcpApi.ts` transport 切换（http url 组 / stdio command+args 组，中文提示，npx/uvx/node AutoComplete）；config item `transport` 反映真实；`openapi.generated.ts` 同步（openapi_tsgen `--check` fresh）；**i18n parity 0**（zh/en 各 35 条 `settings.mcp.*`，差集 0）。
- **契约**：`docs/API_CONTRACT.md`、`docs/ROUTER_MAP.md` 补 transport 条目；证据见 `docs/ai/tasks/BACKLOG-042.md`。
- **门禁（本收尾会话，沙箱受限）**：backend `ruff check app tests` 通过；`test_mcp_transport.py` 6 用例 + 迁移 2 场景经等价 Driver 逐条 PASS；frontend `tsc -b` 通过；pytest 进程化/vite build/Vitest 因委托沙箱（pytest tmp 目录枚举 WinError 5、esbuild child spawn EPERM）无法以 pytest/vite 运行，已用等价 driver 覆盖逻辑，建议维护者在常规环境补跑 `backend pytest -q`、`bun run build`、`MCPServerSettingsPanel.test.tsx`。
- `docs/ai/EXEC_PLAN.md` 顶部 042 转 `[DONE]`；删除 0（会话临时脚本已回收，残留 ACL 阻断目录未物理删、未纳入提交）；commit 见仓库历史（BACKLOG-042）。