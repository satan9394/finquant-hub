# IMPLEMENT_RESULT — VS-4：G-11 LLM 调用瞬时故障重试

> Implementer（Orchestrator 接管）｜ 2026-09-13 ｜ **待独立 Evaluator 质疑**

## 结论
LLM 的 3 个 chat 调用点（`chat` / `chat_with_tools` / `chat_with_tools_safe`）统一走带**指数退避重试**的新 helper：瞬时故障（网络错误/超时、429、5xx）最多 3 次尝试（首次 + 2 次重试，退避 0.5s → 1.0s）；不可重试的 4xx 仍一次即报错。

## 改动（2 文件）
1. **backend/app/services/llm_client.py**
   - 新增模块常量：`_RETRYABLE_STATUS = {429,500,502,503,504}`、`_MAX_ATTEMPTS = 3`、`_BACKOFF_BASE_SECONDS = 0.5`；补 `import asyncio`。
   - 新增 `_post_chat_with_retry(payload)`：封装 POST /chat/completions 的重试语义——
     - 网络类异常（`httpx.HTTPError`）→ 重试；
     - 状态码在 `_RETRYABLE_STATUS` → 重试；
     - 其它状态码 → **立即返回响应**（交调用方 `_response_error` 生成可行动错误，不重试）；
     - 重试耗尽：网络类抛 `LLMError("网络错误或超时…")`；状态码类返回最后一次响应（保留真实状态码）。
   - 三处调用点由「url+try/except+post」收敛为一行 `resp = await self._post_chat_with_retry(payload)`（消除三份重复样板）。
   - `list_models` 未改（非长管线路径，保持现状）。
2. **backend/tests/test_llm_client.py**
   - 新增 autouse fixture `_no_retry_backoff`（退避基数置 0，避免测试真实等待）。
   - 适配 `test_chat_success_and_api_error`：503 属可重试，备足 `_MAX_ATTEMPTS` 份响应并断言用满。
   - 新增 5 个测试（含参数化共 7 例）：429 后成功、网络错误后成功、400/401/404 不重试、网络错误耗尽抛 LLMError、5xx 耗尽报最后状态码。

## 门禁实测
- 聚焦：`pytest tests/test_llm_client.py tests/test_llm_reasoning.py tests/test_llm_usage.py` → **21 passed**
- `ruff check .` → **exit 0（All checks passed）**
- 全量 backend：见提交前补跑记录

## 未解决问题 / 风险
1. `chat_stream`（SSE 流式）未加重试——流式一旦开始收到 token，重试会产生重复输出；若首包前失败可考虑重试，但需区分"未收到任何字节"与"已部分输出"，本次不做（保守）。
2. `list_models` 未重试（用户单次操作，失败有明确提示）。
3. 退避为固定基数 × 2^n，未加抖动（jitter）；个人本地单用户场景下抖动收益低。
