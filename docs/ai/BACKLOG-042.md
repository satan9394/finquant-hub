# BACKLOG-042 — MCP 供应商兼容：补 stdio transport（本地 command+args+env，通用 MCP 客户端形态）

> 状态：`[READY]` ｜ 优先级：P2 ｜ 创建：2026-09-08 ｜ 完成：— ｜ 执行：DSH Worker
> 背景：用户指令"MCP 相关供应商兼容任何 MCP"+ 参考 CC Switch 统一 MCP 面板/通用 MCP 客户端。现状核实（2026-09-08）：后端 MCP 只支持 **HTTP（SSE）** transport——`mcp_server_configs` 表仅 `name/url`（database.py:203-211）、`mcp.py` 只 connect_http_mcp_server + HTTP CRUD/connect/disconnect；前端 `mcpApi.ts` 已预留 `transport: 'http' | 'stdio'` 类型但 create/update/config item 只发 url。**差距**：缺 stdio transport（本地 MCP 服务器 command + args + env，通用 MCP 客户端（Claude/CC Switch）的标准形态——大量本地 MCP 工具是 stdio 而非远程 HTTP）。

## 目标

1. **表扩展**：`mcp_server_configs` 加列 `transport TEXT NOT NULL DEFAULT 'http'`、`command TEXT`、`args_json TEXT`（JSON 数组）、`env_json TEXT`（JSON 对象，可选，**不存敏感 env 明文**——如需存凭据用 credential 或标注）——手写增量迁移（SAVEPOINT 模式，`_SCHEMA_VERSION` 提升），旧行默认 http 兼容。
2. **后端创建/更新**：`MCPServerCreate/Update` 支持 transport（http|stdio）；http 时校验 url、stdio 时校验 command（必填）+ args 数组；`validated_config()` 生成含 transport 的 config。
3. **连接**：`mcp_runtime.py` 新增 stdio 连接（spawn command + args + env，走 MCP stdio protocol）；`connect_mcp_config` 按 transport 分派（http→connect_http、stdio→connect_stdio）。**零新依赖**——若项目已有 MCP SDK（检查 requirements/是否有 mcp client 库）则复用；若无则 stdio 连接用 asyncio 子进程 + 手动 MCP 协议（stdin/stdout JSON-RPC over stdio），并如实说明实现深度。
4. **前端**：MCPServerSettingsPanel/mcpApi 支持 transport 切换（http 用 url 字段、stdio 用 command+args 字段组，env 可选）；新增字段中文提示（目标中文非技术用户）；config item transport 反映真实。
5. **契约**：新端点/字段同步 API_CONTRACT/ROUTER_MAP；测试（确定性：表迁移、create/update 校验两 transport、connect 按 transport 分派 mock）。

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