# IMPLEMENTATION_BRIEF — Vertical Slice 4：G-11 LLM 调用瞬时故障重试

> Orchestrator 第五阶段产物，2026-09-13。来源：PRODUCT_GAP_MAP G-11（可靠性审计 D 报告）。

## 目标
LLM 调用对**瞬时故障**（网络错误/超时、HTTP 429、5xx）做**有限次指数退避重试**，避免长研究管线（4 Agent × 多轮工具调用，5-10 分钟）因单次上游抖动整轮失败。

## 用户场景
用户跑一次深度研究，第 3 个 Agent 的第 2 轮工具调用时上游返回 429 或短暂断连。**现状**：该 Agent 立即降级为"【分析失败】"，整份报告带上 degraded（VS-1 已诚实标记，但用户拿不到完整内容）。**理想**：短暂抖动被自动重试吸收，研究正常完成，用户无感。

## 当前问题（代码现实）
`backend/app/services/llm_client.py` 三处 chat POST（`chat` / `chat_with_tools` / `chat_with_tools_safe`）均为**单次尝试**：`httpx.HTTPError` 即抛 LLMError，非 200 即抛 `_response_error`。无任何重试。

## 涉及模块
- `backend/app/services/llm_client.py`（新增重试 helper + 三处调用点改用）
- `backend/tests/test_llm_client.py`（新测试 + 既有 503 用例适配）

## 不能破坏
- **不可重试的 4xx**（400/401/404 等地址或鉴权类）必须**只调用一次**（重试无意义、且会放大无谓请求与限流）。
- 错误文案与既有行为：重试耗尽后网络类抛 LLMError（原文案）、状态码类仍走 `_response_error`（含状态码与建议）。
- `list_models`（GET /models）本次不改（用户单次操作，非长管线路径）。
- 零新依赖；`chat_stream` 行为不变。

## 验收标准
1. 429/5xx/网络错误 → 重试，最多 `_MAX_ATTEMPTS`(3) 次，指数退避（0.5s → 1.0s，基线可配）。
2. 400/401/404 等 → **不重试**，一次即报错。
3. 重试成功 → 调用方无感返回正常结果。
4. 重试耗尽 → 网络类抛 LLMError（原文案）；5xx 类以最后一次响应报错（保留状态码）。
5. 测试覆盖上述四类；既有 llm 测试全绿（含把 503 用例适配为多次响应）。
6. 门禁：聚焦 llm 测试 + 全量 backend + ruff。

## 错误场景
- 全程断网 → 3 次尝试后 LLMError（不无限重试）。
- 429 持续 → 3 次后报 429（提示检查额度）。
- 401 → 立即报错（不浪费时间重试）。
