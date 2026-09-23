# BACKLOG-036 — 模型管理后端契约重构（UX_ISSUES_20260907 问题一·后端）

> 状态：`[DONE]`（维护者复核 Codex 产物并合入，见 docs/ai/UX_FIX_EVIDENCE_20260907.md） ｜ 优先级：P1 ｜ 创建：2026-09-07 ｜ 完成：— ｜ 执行：DSH Worker
> 背景：用户实测反馈（`docs/ai/UX_ISSUES_20260907.md` 问题一）+ 维护者代码根因核实（2026-09-07）：
> - `model_configs.api_key_env` 存**环境变量名**（database.py L32），用户期望直接填 key 值。
> - `llm_client.py:86/117/164` `url = f"{base_url}/chat/completions"`——用户填完整 endpoint 会被**二次拼接** → OpenAI 测试 404（HTML 响应）根因。
> - 无"拉取该端点可用模型"端点。
> - 参考 CC Switch：供应商=名称/Base URL/Key **值**、密钥本地存、Full URL Endpoint 双模式。本项目已有 Fernet 加密凭据基建（credential_store.py）可复用，零新依赖。

## 目标

### 1. API Key 加密存储（值而非环境变量名）
- `model_configs` 表新增 `api_key` 列（存 credential_store 加密后的 key 值）；`api_key_env` 保留为**可选**兼容（两模式：直接填 key 或引用 env 名）。
- schema 迁移：手写增量（项目无迁移框架，参照既有 `_install_schema_cleanup`/SAVEPOINT 模式加版本步骤）；已有行保留（api_key 为空，回退 api_key_env）。
- `models_crud.py` create/update：`api_key` 字段接收明文 → `credential_store.encrypt_value` 加密存储；`_public_model` 永不明文返回 key（metadata-only，返回 has_api_key 布尔）。
- `model_router.py:38-43`：key 解析优先级改为 **api_key 密文解密 > api_key_env 环境变量**（保持两模式）。

### 2. URL 契约修复（不二次拼接）
- `llm_client.py`：`base_url` 语义明确为 base；请求拼接时若 `base_url` 已以 `/chat/completions`（或 `/v1/chat/completions`）结尾则**不重复拼接**；表单契约（前端 037）与文档注明"API 地址填 base（如 https://api.openai.com/v1）"。
- 修复后 OpenAI 测试不再 404（二次拼接消除）。

### 3. 拉取模型列表端点
- 新增 `GET /api/models/providers/{id}/fetch-models`（或并入 test）：对 OpenAI 兼容 base 调 `GET {base}/models`，返回模型 id 列表；不支持/失败返回诚实结构（`{"items": [], "note": "该端点不支持列出模型，请手动填写模型名"}`）——不 5xx。
- httpx 请求走与 llm_client 相同代理策略（LLM_PROXY_URL 7897），超时合理。

### 4. 测试报错可行动化
- `POST /{id}/test`：失败返回**响应体片段**（截断）+ 中文建议（"API 地址可能被重复拼接，当前请求了 {url}" 等）；成功返回延迟/模型名。

## 允许修改
- `backend/app/database.py`（model_configs 加 api_key 列 + 迁移）、`backend/app/models.py`（ModelConfigIn/Update 加 api_key）、`backend/app/routers/models_crud.py`、`backend/app/services/model_router.py`、`backend/app/services/llm_client.py`（拼接）、新增 fetch-models 端点（models_crud 或新路由）
- `backend/app/services/credential_store.py`（若需加模型 key 服务函数，复用既有加密原语）
- 测试：test_models_crud.py 或对应测试文件（加密存储/has_api_key 不回显/URL 不二次拼接/fetch-models 成功与失败/两模式 key 解析）
- 证据文档：`docs/ai/BACKLOG-036.md`、`docs/ai/tasks/BACKLOG-036.md`（新建）、`docs/ai/EXEC_PLAN.md`、`task/CHANGELOG.md`、`HANDOFF.md`
- `docs/API_CONTRACT.md`（新端点/字段）、`docs/ARCHITECTURE.md` SCHEMA（model_configs 列）

## 禁止修改
- 前端（Models.tsx 在 BACKLOG-037）；E2E/playwright config；依赖/锁文件；`reference/`
- 不删除文件（回收站铁律）；不加新依赖（加密复用 credential_store 的 cryptography，已存在）
- 不把明文 key 写入日志/响应/文档；不破坏既有 api_key_env 兼容路径（有环境变量的现有配置仍工作）

## 完成标准
1. model_configs 有 api_key 列（加密存）、迁移安全（既有行保留、api_key_env 回退可用）；`_public_model` 只回显 has_api_key
2. llm_client 拼接不二次（OpenAI 完整/标准 base 都正确）；fetch-models 端点成功返回列表、失败诚实不 5xx
3. test 端点失败含响应体片段+中文建议；成功含延迟
4. 确定性测试（httpx mock）全绿：加密存储不回显/URL 拼接两场景/fetch 成功失败/key 两模式解析；后端全量 853+ cov 不降 + ruff
5. 文档同步（API_CONTRACT/ARCHITECTURE SCHEMA）；git diff --check；删除 0；不 commit

## 参考
- 用户反馈+根因：`docs/ai/UX_ISSUES_20260907.md` 问题一（含 CC Switch 经验）
- 现状：`database.py:26-33`（model_configs DDL）、`credential_store.py`（Fernet encrypt/decrypt）、`models.py:5-22`（ModelConfigIn/Update）、`models_crud.py:18-115`、`model_router.py:38-43`、`llm_client.py:86`
- 迁移先例：database.py `_install_schema_cleanup`（v24）+ SAVEPOINT 模式

## 完成证据模板
```
- model_configs 迁移 diff + 既有行兼容验证
- llm_client 拼接修复 + OpenAI 标准/完整 base 两场景测试
- fetch-models 端点 + 成功/失败测试
- test 端点报错可行动化
- 全量门禁：backend pytest x/x、cov、ruff
- git diff --check、删除 0、未 commit
```
