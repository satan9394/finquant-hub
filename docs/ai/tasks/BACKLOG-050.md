# BACKLOG-050: 双协议转换内核与全链路耗时遥测采集

> 目标模型：Codex (GPT-6 Luna · 最大思考模式)
> 前置基线：main @ d085d9f
> 核心定位：微内核协议桥接 + 耗时遥测埋点 + schema v27 增量持久化

---

## 1. 目标 (Task)
在现有 `backend/app/services/` 中构建轻量、纯函数式的 Anthropic Messages 协议双向转换层，并为全系统模型调用建立高精度的性能与用量遥测采集（TTFT、生成吞吐 tok/s、Prompt Caching 命中与推理 Token 细分），完成 schema v27 增量迁移以持久化新指标。

---

## 2. 边界控制 (Touch Boundaries)
- **允许修改/新建**：
  - `backend/app/services/anthropic_protocol.py` (NEW)
  - `backend/app/services/llm_client.py` (MODIFY: 协议分派与测速埋点)
  - `backend/app/services/llm_usage.py` (MODIFY: 接收并落盘新指标)
  - `backend/app/database.py` (MODIFY: schema v27 增量迁移)
  - `backend/tests/test_anthropic_protocol.py` (NEW)
  - `backend/tests/test_llm_telemetry.py` (NEW)
- **严禁触碰**：
  - 严禁引入任何新的 pip 依赖（纯基于原生 Python 与已有 `httpx`）。
  - 严禁改动上层 Agent 接口签名（`chat`, `chat_stream`, `chat_with_tools_loop` 对外契约保持不变）。
  - 严禁修改已有测试断言以迁就实现。

---

## 3. 架构规则与参考指针 (Decision Rules & Reference)
- **架构不变量**：保持零 ORM，所有数据库更新通过原生 SQL aiosqlite 执行；保持微内核设计。
- **协议转换参考**：
  - 本地自研参考：`E:\DeepSeek_Harness\workspace\2026_09_08\model-infra-kit\packages\mik\src\ai\protocols.ts`（重点参考 Anthropic 与 OpenAI 协议头与格式定义）。
  - 开源模式参考：`abhiram1809/anthropic-adapter` 与 `LiteLLM` 的无状态转换字典。
- **协议核心映射规则**：
  - OpenAI 请求 → Anthropic 规范：剥离顶层 `system`；将 `tools[].parameters` 映射为 `input_schema`；合并连续同角色消息；约束 `max_tokens`。
  - Anthropic 响应 → 统一契约：提取 `content` 块为统一文本与 `tool_calls`；映射 `usage` 中缓存字段。
  - 流式 SSE：解析 `content_block_delta` 的 `text_delta` 为增量文本。
- **测速指标公式**：
  - 首字延迟 `ttft_ms` = 首个流式 chunk 收到时刻 - 请求发起时刻。
  - 吞吐速率 `tokens_per_second` = `completion_tokens / (总耗时秒数 - 首字延迟秒数)`。
  - 缓存命中率 `cache_hit_rate` = `cached_tokens / prompt_tokens * 100%`。

---

## 4. 契约规范 (Output Contract)
- **数据库增量迁移**：
  - `_SCHEMA_VERSION` 升级至 27，新增 `_LLM_TELEMETRY_VERSION = 27`。
  - 为 `llm_usage` 表幂等补充 6 列：`cached_tokens` (INTEGER), `cache_creation_tokens` (INTEGER), `reasoning_tokens` (INTEGER), `ttft_ms` (INTEGER), `duration_ms` (INTEGER), `tokens_per_second` (REAL)。
- **端点分派**：
  - `model_configs.provider == "anthropic"` 时，自动分派至 `{base_url}/v1/messages`，附带 `x-api-key: {api_key}` 与 `anthropic-version: 2023-06-01`。
  - `provider == "openai"` 时，保持原有的 `/chat/completions` 与 Bearer 认证。

---

## 5. 验证门禁 (Validation Gates)
交付前必须在本地依次执行以下检查并确保全绿：

```bash
# 1. 针对性单元测试（协议转换、流式分块、指标计算与 schema v27 迁移）
cd backend && .venv\Scripts\python.exe -m pytest tests/test_anthropic_protocol.py tests/test_llm_telemetry.py -q

# 2. 后端代码规范检查
cd backend && .venv\Scripts\python.exe -m ruff check .

# 3. 前端编译健康检查
cd frontend && bun run build
```

---

## 6. 完工闭环 (Documentation Closeout)
全部代码与测试通过后，自主更新以下文档：
1. 更新 `docs/ai/evo/NEXT_BACKLOG.md`，追加 BACKLOG-050 为完成状态，并记录提交 SHA。
2. 在 `task/CHANGELOG.md` 尾部追加符合规范的变更记录。
