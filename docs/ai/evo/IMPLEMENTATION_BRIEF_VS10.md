# IMPLEMENTATION_BRIEF — Vertical Slice 10：尊重上游的 `Retry-After` 并加入退避抖动

> Orchestrator 第五阶段产物，2026-09-13。来源：**R2 可靠性审计 D2 的 P1**（重试放大），**编排者已复核并重新定位重点**（见下）。

## 目标
让瞬时故障重试**按上游指示等待**，而不是无视对方给出的等待时长就立刻重试；并让并行 agent 的退避**不同步**。

## 用户场景
用户跑一次深度研究（4 个 agent 并行）。供应商返回 **429（限流）** 并附带 `Retry-After: 30`。**现状**：我们在 0.5 秒后就重试，等于**无视对方的明确要求**——后果是继续被拒，甚至被加重限流或临时封禁，用户的研究反复失败。同时 4 个 agent 因为退避参数完全相同，会**同步重试**形成脉冲式压力。

## 当前问题（已核实）
- `llm_client.py:20-22`：`_RETRYABLE_STATUS = {429,500,502,503,504}`、`_MAX_ATTEMPTS = 3`、`_BACKOFF_BASE_SECONDS = 0.5`（退避 0.5s → 1.0s）。
- `_post_chat_with_retry` 只用固定退避，**完全不读响应头**：全仓检索 `Retry-After` / `headers.get` **命中 0 处**（编排者实测）。
- 放大算式属实：`_MAX_ATTEMPTS(3)` × 每 agent 6 次调用（`research_orch.py:144` 的 `for _round in range(5)` + 1 次强制收尾）× 5 个 agent = 最坏 90 次上游请求。**但影响有界**（退避仅 0.5–1.0s、研究为用户单次发起）——所以**本卡的重点是"尊重上游指示 + 去同步"，不是压缩次数**。

## 理想行为
1. 可重试状态码且响应带 `Retry-After` → **按该值等待**（受上限约束，见下），而非固定退避。
2. `Retry-After` 支持两种合法格式：**整数秒** 与 **HTTP-date**；无法解析时回落到原有退避（不得因此报错）。
3. 回落退避加入**抖动**（随机化），避免并行 agent 同步重试。
4. **必须有上限**：单次等待不超过一个明确上限（建议 30 秒），使恶意/异常的超大 `Retry-After` 不会让一次研究长时间挂住；总尝试次数仍 ≤ `_MAX_ATTEMPTS`。
5. 不可重试的 4xx 行为**完全不变**（立即返回响应交由调用方报错）。

## 涉及模块
- `backend/app/services/llm_client.py`（`_post_chat_with_retry` 与其常量）
- `backend/tests/test_llm_client.py`（测试）

## 不能破坏
- 既有语义：4xx 不重试、网络类耗尽抛 `LLMError("网络错误或超时…")`、5xx 耗尽返回最后一次响应由调用方 `_response_error` 报真实状态码、`list_models`/`chat_stream` 不受影响。
- 架构不变量（无新依赖；`asyncio` 已导入）；不改前端；不改 `research_orch` 的调用方式。
- **测试不得真实等待**：沿用既有的"退避置 0"手法或 monkeypatch `asyncio.sleep` 记录时长。

## 验收标准（可判定）
1. 响应 `429` + `Retry-After: 7`（整数）→ **记录到的等待时长 ≥ 7 秒**（且 ≤ 上限），而非 0.5 秒。
2. 响应 `503` + `Retry-After: <HTTP-date，未来 5 秒>` → 等待时长 ≈ 该日期与当前时间之差（≥ 数秒、≤ 上限）；精度允许区间断言。
3. `Retry-After` **缺失或非法**（如 `"abc"`、负数、过去时间）→ 回落到带抖动的退避，**不抛异常**，重试次数与既有断言一致。
4. **上限生效**：`Retry-After: 99999` → 单次等待 ≤ 30 秒（不得真等 99999 秒）。
5. 抖动存在：同一代码路径多次取样，退避时长**不全相等**（可在测试中以宽松断言验证"存在非单一值"或直接验证抖动函数被调用）。
6. 4xx 不重试、耗尽语义、`list_models`/`chat_stream` 行为**零回归**（既有测试全绿）。
7. 门禁：`pytest tests/test_llm_client.py -q --no-cov` + `ruff check .` 全绿。

## 错误场景
- `Retry-After` 为 HTTP-date 但已过去 → 视为"可立即重试"（等待 0）或回落退避，不得为负数导致 `sleep` 异常。
- 响应头大小写不一（`retry-after` vs `Retry-After`）→ httpx 的 `headers` 大小写不敏感，按库行为处理即可，但请在测试中覆盖小写键名。
- 多个可重试状态混合出现（先 429 后 503）→ 每次都按当次响应决定等待。

## 测试要求
- 用 `httpx.MockTransport` 构造带 `Retry-After` 的响应；**monkeypatch `asyncio.sleep` 记录调用参数**，断言等待时长满足上述标准（不得真实 sleep）。
- 覆盖：整数秒、HTTP-date、非法值、超大值（上限）、缺失（回落+抖动）、以及既有 4xx 不重试与耗尽路径的回归。
- 由独立 Evaluator 复核"是否真的按上游指示等待"与"上限是否生效"。
