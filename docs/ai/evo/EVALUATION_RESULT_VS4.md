# EVALUATION_RESULT — VS-4（G-11 LLM 重试）

## ⚠️ 重要声明：本卡**未获得独立评估**
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
