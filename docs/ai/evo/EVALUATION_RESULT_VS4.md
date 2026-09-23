# EVALUATION_RESULT — VS-4（G-11 LLM 重试）

## 独立评估（补做）

**判定：ACCEPT**（独立 Evaluator，第 4 次尝试成功，此前 3 次因 429 中断）

**评估范围**：commit `cda6f76`，`backend/app/services/llm_client.py`。
**证据来源**：只读该文件 + `backend/tests/test_llm_client.py` + `git show cda6f76`；实跑 `pytest tests/test_llm_client.py -q --no-cov -p no:cacheprovider` → **18 passed in 3.33s**。

| # | 判据 | 结论 | 独立证据（文件:行） |
|---|---|---|---|
| 1 | 循环次数 ≤ `_MAX_ATTEMPTS`、无死循环 | ✅ | `llm_client.py:111` `for attempt in range(1, _MAX_ATTEMPTS + 1)`，`_MAX_ATTEMPTS = 3`（:21）；三个出口齐备：非重试 4xx `return`(:121)、末次重试 `return`(:123)、循环结束 `raise`(:126)，无不可达/无限分支 |
| 2 | `_RETRYABLE_STATUS` 不含 400/401/404 | ✅ | `llm_client.py:20` `frozenset({429, 500, 502, 503, 504})`，集合内无 4xx（仅 429） |
| 3 | 网络耗尽 → 抛 LLMError（非 None / 裸异常） | ✅ | `llm_client.py:126-128` `raise LLMError("网络错误或超时…") from last_exc`。落出循环的唯一路径是每次尝试都被 `except httpx.HTTPError`(:115) 捕获并写入 `last_exc`(:116)，故 `from None` 情形不可达 |
| 4 | 5xx 耗尽 → 返回最后响应（调用方报真实状态码） | ✅ | `llm_client.py:122-123` `if attempt == _MAX_ATTEMPTS: return response`；调用方 `chat` 在 :149-150 走 `_response_error(resp.status_code, resp.text)`，状态码原样保留 |
| 5 | 三处调用点均整改、无遗漏裸 post | ✅ | `chat`:148、`chat_with_tools`:174、`chat_with_tools_safe`:216 均调用 `_post_chat_with_retry`；全文 `http.post` **仅**出现于 helper 内部 :114；`list_models` 仍为 `http.get`(:133-134)、`chat_stream` 仍为 `http.stream`(:362)，**未动**（`git show cda6f76` 的 llm_client 变更行中不含这两个函数签名，与结论一致） |
| 6 | 测试全绿 | ✅ | 18 passed，0 failed，3.33s（无 skip/xfail） |
| 7 | 测试真覆盖（非"永远通过"） | ✅ | 用 `httpx.MockTransport` 注入 handler 并记录 `calls`（`test_llm_client.py:10-13`），断言是**计数式**而非仅 `raises`：非瞬态 4xx 参数化 400/401/404 断言 `len(calls) == 1`(:237-249)；网络耗尽断言 `len(calls) == _MAX_ATTEMPTS`(:253-264)；5xx 耗尽断言 `match="503"` 且 `len(calls) == _MAX_ATTEMPTS`(:268-279)。退避被 `_BACKOFF_BASE_SECONDS = 0.0` 旁路(:17-19)，故断言不受计时影响、不产生假绿 |
| 8 | 重试用满后不放大限流 | ✅ | 上限收敛为 3 次尝试、退避 0.5s→1.0s(:22, :125)，量级可接受 |

**独立评估补充观察**（不构成 REJECT）：原自查记录的"死赋值已删"经复核属实——`except` 分支仅保留 `last_exc = exc`(:116)，无未读变量。`chat_stream` 不参与重试（首包前 503 仍直接失败）属**有意设计**，非本卡缺陷。

**历史记录保留**：以下原始记录如实保留，其中"未获独立评估"的状态已被本节取代。

## ⚠️ 重要声明：本卡**未获得独立评估**（历史记录，补做前状态）
独立 Evaluator 连续 **3 次** 尝试均被环境阻断（**HTTP 429 RATE_LIMIT**），未能产出判定：
- 第 1 次 `ea466fd3`：已读完 `llm_client.py` 与测试文件、正在跑 pytest 时 429 终止（无判定）
- 第 2 次 `01ecda2a`：极简指令（只读 1 文件 + 跑 1 命令）仍在 429 终止（无判定）
- 第 3 次尝试同样 429

**结论：本卡的验收证据来自实现者自查，不构成独立验证。** 依据本项目"禁止 Implementer 自我验收"的纪律，本卡应在**后续环境恢复后补做独立评估**（已记入 PRODUCT_STATE 待办）。前三个 Slice（VS-1/VS-2/VS-3）均完成了独立评估，且三次都抓到真缺陷，故此处不做"以自查冒充独立评估"的表述。

## 自查（明示：非独立评估）发现的真实问题并已修复
1. **死赋值**：`_post_chat_with_retry` 的 `except httpx.HTTPError` 分支内 `retryable = True` 从未被读取（循环后只判断 `attempt < _MAX_ATTEMPTS`）→ 已删除。（ruff 未报，属人工审查发现）

## 自查覆盖的验收点（对照 IMPLEMENTATION_BRIEF_VS4）
| 验收点 | 自查结论 | 依据 |
|---|---|---|
| 无死循环，尝试次数 ≤ `_MAX_ATTEMPTS`(3) | ✅ | `for attempt in range(1, _MAX_ATTEMPTS + 1)`；测试断言调用次数 == 3 |
| 429/5xx/网络错误 → 重试 | ✅ | `_RETRYABLE_STATUS` 含 429/500/502/503/504；`except httpx.HTTPError` 亦重试 |
| **4xx（400/401/404）不重试** | ✅ | 非重试状态码 → `return response`（立即交调用方报错）；参数化测试断言调用次数 == 1 |
| 重试成功 → 调用方无感 | ✅ | 429→成功、网络→成功 两个测试断言正常返回 |
| 网络耗尽 → 抛 LLMError | ✅ | 循环结束 `raise LLMError("网络错误…") from last_exc`；测试断言调用次数 == 3 |
| 5xx 耗尽 → 保留真实状态码 | ✅ | `return response` → 调用方 `_response_error(status)`；测试断言 `match="503"` |
| 三处 chat 调用点全部改用 helper | ✅ | grep 确认 `http.post` 仅存于 helper；`list_models`(GET) 与 `chat_stream`(流式) 未动（有意） |
| 既有测试未被改弱 | ✅ | `test_chat_success_and_api_error` 是**加强**（新增 `responses == []` 断言证明用满重试） |

## 门禁实测（实现者）
- `pytest tests/test_llm_client.py` → **18 passed**（修复死代码后）
- `pytest tests/test_llm_client.py tests/test_llm_reasoning.py tests/test_llm_usage.py` → **21 passed**
- `ruff check .` → exit 0
- 全量 backend：见提交记录

## 待补（不阻塞，已记入 PRODUCT_STATE）
- 环境恢复后**补做独立 Evaluator**（重点复查：重试是否可能放大限流、`chat_stream` 是否需要首包前重试）。
