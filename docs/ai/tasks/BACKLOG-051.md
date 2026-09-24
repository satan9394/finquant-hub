# BACKLOG-051: SSE 实时指标流式分发与 Agent 编排贯通

> 目标模型：Codex (GPT-6 Luna · 最大思考模式)
> 依赖前置：BACKLOG-050 已合入
> 核心定位：实时遥测事件派发 + 多 Agent 宏观效能汇总 + 模型管理接口适配

---

## 1. 目标 (Task)
将 BACKLOG-050 采集到的实时推理指标（TTFT、tok/s 速率、缓存命中率）通过 SSE 管道向上分发给前端客户端，并在 Research 深度研究和 Swarm 专家团队的复杂编排中贯通效能聚合，同时使模型管理端点适配 Anthropic 官方协议。

---

## 2. 边界控制 (Touch Boundaries)
- **允许修改/新建**：
  - `backend/app/routers/chat.py` (MODIFY: 派发指标事件)
  - `backend/app/routers/research.py` (MODIFY: 派发指标事件)
  - `backend/app/routers/swarm.py` (MODIFY: 派发指标事件)
  - `backend/app/routers/models_crud.py` (MODIFY: 适配 Anthropic 连接测试与模型列表拉取)
  - `backend/app/services/research_orch.py` (MODIFY: 收集并聚合 Agent 性能)
  - `backend/app/services/report_builder.py` (MODIFY: 报告元数据追加效能汇总)
  - `docs/API_CONTRACT.md` (MODIFY: 补充 SSE llm_metrics 契约)
  - `backend/tests/test_chat_metrics_sse.py` (NEW)
  - `backend/tests/test_models_crud_anthropic.py` (NEW)
- **严禁触碰**：
  - 严禁破坏既有 SSE 文本流与工具事件的 payload 结构。
  - 严禁在任何日志或响应中打印未脱敏的 API Key。

---

## 3. 架构规则与参考指针 (Decision Rules & Reference)
- **实时通信不变量**：保持零 WebSocket，所有实时通信严格基于 SSE（sse-starlette）。
- **指标事件派发契约**：
  - 事件名称：`llm_metrics`。
  - 触发时机：每次模型完成推理并成功提取 usage 后立即触发。
  - 负载结构：`{"model": str, "ttft_ms": int, "speed_tps": float, "prompt_tokens": int, "cached_tokens": int, "cache_hit_rate": float, "completion_tokens": int, "reasoning_tokens": int, "context_used": int}`。
- **Anthropic 模型管理参考**：
  - 参考本地 `E:\DeepSeek_Harness\workspace\2026_09_08\model-infra-kit\packages\mik\src\ai\protocols.ts` 的 `parseAnthropicList`。
  - `test` 端点：Anthropic 模式下发送最小单轮问答（如 `Reply with OK`）走 `/v1/messages` 验证鉴权。
  - `fetch-models` 端点：Anthropic 模式下请求 `GET {base_url}/v1/models`，附带 `x-api-key` 与 `anthropic-version`，解析返回标准模型列表。

---

## 4. 契约规范 (Output Contract)
- `docs/API_CONTRACT.md` 显式记录 `event: llm_metrics` 事件规范。
- 深度研究统一报告数据（`report_data`）的顶层增加可选键 `telemetry_summary`：
  - `avg_tokens_per_second` (float)
  - `total_duration_seconds` (float)
  - `cache_savings_ratio` (float)

---

## 5. 验证门禁 (Validation Gates)
```bash
# 1. 针对性单元测试（ASGI 模拟 SSE 流式连接、Anthropic test/fetch 端点）
cd backend && .venv\Scripts\python.exe -m pytest tests/test_chat_metrics_sse.py tests/test_models_crud_anthropic.py -q

# 2. 后端代码规范检查
cd backend && .venv\Scripts\python.exe -m ruff check .

# 3. 前端编译门禁
cd frontend && bun run build
```

---

## 6. 完工闭环 (Documentation Closeout)
1. 更新 `docs/ai/evo/NEXT_BACKLOG.md`，追加 BACKLOG-051 为完成状态。
2. 同步 `docs/API_CONTRACT.md`。
3. 追加 `task/CHANGELOG.md` 记录。
