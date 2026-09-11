# IMPLEMENT_RESULT — Vertical Slice 10：尊重上游 Retry-After + 退避抖动

- 任务卡：`docs/ai/evo/IMPLEMENTATION_BRIEF_VS10.md`
- 状态：**已完成**（聚焦门禁全绿；**未跑全量 pytest，原因见「未解决问题」**）
- 未 commit（按卡要求）。

## 1. 改动清单（含行号）

### 1.1 `backend/app/services/llm_client.py`（+76 −1）

| 位置 | 内容 |
|---|---|
| L6 / L8 / L9 / L11 | 新增标准库导入：`email.utils`、`math`、`random`、`from datetime import datetime, timezone`（**无新依赖**，均为 stdlib） |
| L28–L33 | 新增常量：`_RETRY_AFTER_MAX_SECONDS = 30.0`（单次等待上限）、`_BACKOFF_JITTER_RATIO = 0.25`（回落退避抖动幅度 base×[0.75,1.25]），附 VS10 动机注释 |
| L36–L51 | 新增 `_http_date_seconds(raw) -> float \| None`：解析 HTTP-date 为「距现在秒数」；无 tz 按 UTC；**过去/非法返回 None（绝不返回负数）**；捕获 `TypeError/ValueError/OverflowError` |
| L54–L76 | 新增 `_retry_after_seconds(response) -> float \| None`：读 `retry-after` 头（httpx Headers 大小写不敏感）；整数秒 → float；否则尝试 HTTP-date；**空/NaN/Inf/负数/不可解析 → None**；最后 `min(value, _RETRY_AFTER_MAX_SECONDS)` 施加上限；**全路径不抛异常** |
| L79–L84 | 新增 `_backoff_seconds(attempt)`：原 `_BACKOFF_BASE_SECONDS * 2**(attempt-1)` + `random.uniform(1-0.25, 1+0.25)` 抖动；`base <= 0` 时仍返回 `0.0`（保住既有测试「退避置 0」手法） |
| L87–L93 | 新增 `_retry_delay_seconds(attempt, response)`：**Retry-After 优先，否则回落抖动退避**（单一决策点） |
| L179–L180 | `_post_chat_with_retry` docstring 补充 VS10 等待时长语义（总尝试次数不变） |
| L185 | 循环内 `response: httpx.Response \| None = None`（网络异常分支下 `response` 不再是未绑定变量） |
| L199 | `await asyncio.sleep(_BACKOFF_BASE_SECONDS * (2 ** (attempt - 1)))` → `await asyncio.sleep(_retry_delay_seconds(attempt, response))` |

**未改动**（逐条对照卡上「不能破坏」）：
- 不可重试 4xx：L193–L195 仍是 `if not retryable: return response` —— 立即返回，只发一次请求。
- 5xx/429 耗尽：L196–L197 仍是 `if attempt == _MAX_ATTEMPTS: return response` —— 返回最后一次响应由调用方 `_response_error` 报真实状态码。
- 网络类耗尽：L200–L202 仍是抛 `LLMError("网络错误或超时，请检查 API 地址、网络/代理连接及供应商服务状态后重试。")`。
- `_MAX_ATTEMPTS` 仍为 3，尝试次数上限未变；`_RETRYABLE_STATUS` 未变。
- `list_models`（L204+）、`chat_stream` 未触碰（`chat_stream` 本就不走重试路径）。

### 1.2 `backend/tests/test_llm_client.py`（+165）

| 行号 | 内容 |
|---|---|
| L2 / L6–L8 | 测试导入 `email.utils`、`random`、`datetime/timedelta/timezone`、`SimpleNamespace` |
| L286–L301 | `recorded_sleeps` fixture：`monkeypatch.setattr(llm_client, "asyncio", SimpleNamespace(sleep=fake_sleep))`，把等待值记进列表。**只替换 llm_client 模块内的 asyncio 引用（该模块仅用 `asyncio.sleep`），不污染全局 asyncio，避免干扰 pytest-asyncio** |
| L304–L317 | `_ok_response()` 与 `_run_chat()` 辅助（MockTransport + calls 记录） |
| L320–L334 | ① `test_retry_after_integer_seconds_is_respected`：429 + `Retry-After: 7` → `7 <= wait <= 30` |
| L336–L350 | ② `test_retry_after_http_date_is_respected`：503 + HTTP-date（now+5s）→ `3.0 <= wait <= 6.0` |
| L352–L367 | ③ `test_retry_after_invalid_falls_back_without_raising`（参数化 `"abc"` / `"-3"` / `"0x10"` / `""`）：不抛异常、重试 3 次、回落值 `[0.0, 0.0]`（基数置 0） |
| L370–L381 | ③ `test_retry_after_past_http_date_falls_back`：已过去日期 → 回落，等待非负 |
| L384–L394 | ④ `test_retry_after_is_capped_at_max`：`Retry-After: 99999` → 单次等待 == 30.0 |
| L397–L419 | ⑤ `test_missing_retry_after_uses_jittered_backoff`：spy `random.uniform` 断言被调用且区间 `(0.75, 1.25)`；`_backoff_seconds(1)` 取样 50 次 → 唯一值 > 1 |
| L422–L430 | ⑥ `test_retry_after_lowercase_header_key`：`retry-after: 4` → 等待 4.0 |
| L433–L444 | 混合状态：429(`2`) → 503(`6`) → 每次按当次响应等待 `[2.0, 6.0]` |

既有 18 个用例（含 VS-4 的 429/5xx/网络/4xx 不重试）**一行未改**。

## 2. 门禁实测原始输出

```
PS> cd backend; $env:no_proxy='localhost,127.0.0.1,::1'
PS> .venv\Scripts\python.exe -m pytest tests/test_llm_client.py tests/test_llm_reasoning.py tests/test_llm_usage.py -q --no-cov -p no:cacheprovider
................................                                                                             [100%]
32 passed in 2.43s

PS> .venv\Scripts\python.exe -m ruff check .
All checks passed!
```

耗时 2.43 秒（含全部 HTTP-date/上限用例）→ **没有真实等待**，`asyncio.sleep` 确实被替换为记录器。

## 3. 核心判据实测原始输出（monkeypatch 记录到的等待时长）

证据脚本（临时文件，置于 `%TEMP%\vs10_evidence.py`，**不在仓库内建临时目录**；用后已送回收站）：
把 `llm_client.asyncio.sleep` 换成记录器，逐个真实响应场景跑 `chat()` 并打印记录到的等待值。

```
_BACKOFF_BASE_SECONDS = 0.5
_RETRY_AFTER_MAX_SECONDS = 30.0
_BACKOFF_JITTER_RATIO = 0.25
--------------------------------------------------------------------------------------------------------------
429 + Retry-After: 7                           waits=[7.0]  outcome=ok:ok
503 + HTTP-date(future +5s)                    waits=[4.718109]  outcome=ok:ok
429 + Retry-After: abc (非法)                    waits=[0.6012499003698037]  outcome=ok:ok
429 + Retry-After: -3 (负数)                     waits=[0.46816248331750243]  outcome=ok:ok
429 + HTTP-date 已过去                            waits=[0.5673074247303227]  outcome=ok:ok
429 + Retry-After: 99999 (上限)                  waits=[30.0]  outcome=ok:ok
429 + retry-after: 4 (小写键名)                    waits=[4.0]  outcome=ok:ok
429 无 Retry-After (抖动回落)                       waits=[0.5057630737430124, 0.9352596690460631]  outcome=ok:ok
先 429(2) 后 503(6) 每响应分别生效                      waits=[2.0, 6.0]  outcome=ok:ok
400 不可重试 (行为不变)                                waits=[]  outcome=LLMError: API 返回 400：bad。请检查供应商服务状态后重试。
--------------------------------------------------------------------------------------------------------------
抖动采样（_backoff_seconds(1)，base=0.5，20 次取样）:
  [0.4124, 0.5662, 0.4255, 0.3872, 0.5083, 0.5015, 0.5911, 0.6088, 0.5458, 0.5117, 0.477, 0.5898, 0.4112, 0.6107, 0.4765, 0.4294, 0.4732, 0.6199, 0.4249, 0.5613]
  唯一值个数 = 50 / 50
4 个并行 agent 的首次回落退避（模拟同步重试脉冲是否被打破）:
  [0.5077, 0.4924, 0.4341, 0.5556]
Retry-After 解析直读（未 monkeypatch sleep，纯解析）:
   '7'                                -> 7.0
   '0'                                -> 0.0
   '-1'                               -> None
   'abc'                              -> None
   ''                                 -> None
   '1e999'                            -> None
   'nan'                              -> None
   'Tue, 15 Nov 1994 08:12:31 GMT'    -> None
```

判据逐条对照：

1. **Retry-After 是否被尊重**：`Retry-After: 7` → 记录到 `7.0`（旧行为是固定 0.5s）；HTTP-date（未来 5 秒）→ `4.718109`（秒级截断后的真实差值）；小写键名 `retry-after: 4` → `4.0`；混合状态 429(2)/503(6) → `[2.0, 6.0]`，逐次按当次响应。
2. **上限是否生效**：`Retry-After: 99999` → **`30.0`**（= `_RETRY_AFTER_MAX_SECONDS`），未挂住 99999 秒。
3. **非法值回落且不抛异常**：`abc` → `0.6012…`、`-3` → `0.4681…`、已过去日期 → `0.5673…`，全部是 0.5×(1±0.25) 区间的抖动退避，`outcome=ok:ok` 无异常；纯解析表里全部非法输入 → `None`。
4. **抖动存在**：`_backoff_seconds(1)` 取样 50 次得到 50 个互不相同的值；4 个并行 agent 的首次退避为 `[0.5077, 0.4924, 0.4341, 0.5556]`（不再同步）。
5. **4xx 不变**：400 → `waits=[]`（零等待、只发一次），错误文案与既有 `_response_error` 输出一致。

`-v` 聚焦复核：

```
tests\test_llm_client.py ...........                    [100%]
11 passed, 18 deselected in 2.13s
```

## 4. 未解决问题

1. **未跑全量 pytest**：按编排者指令与沙箱已知限制，`tests/test_api.py` 明确不跑，其余全量套件（`pwsh-229` 后台 job）在本沙箱表现为挂起（网络类用例），已主动 kill 放弃。**因此本卡的证据范围是卡上指定的聚焦门禁 3 个文件（32 passed）+ `ruff check .`，不代表全仓回归结论。**
2. **抖动的统计形态**：采用 ±25% 乘性抖动（[0.75×, 1.25×]），不是「full jitter」（[0, base]）。去同步效果有限（首轮退避集中在 0.375–0.625s），只保证不全部相等；若后续观测到 4 agent 仍呈脉冲，可换成 full jitter（`random.uniform(0, base)`），但那会缩短平均等待。
3. **HTTP-date 只做秒级精度**：RFC 9110 的 HTTP-date 本身无亚秒精度，`now+5s` 实测差值 4.718s（跨秒截断），断言区间放宽为 `[3.0, 6.0]`。
4. `Retry-After: 0` 会被采纳为「等待 0 秒」（视为合法整数），而已过去的 HTTP-date 走回落退避——两者语义不同，属有意选择（前者是上游明确的「立即重试」，后者是解析不出有效时长）。

## 5. 风险

- **风险等级：低。** 改动集中在一个私有方法与 4 个纯函数，无新依赖、无接口变更、无并发结构变更。
- **最坏等待时间上升**：单次等待从 1.0s 上限变为 30s 上限，3 次尝试的一次调用最坏多等约 58 秒。这是卡上明示的取舍（尊重上游 > 快速失败），且 30s 是显式常量、可一处调低。
- **`response` 泄露风险**：新代码只在 `else:` 分支（无异常）把 `response` 交给 `_retry_delay_seconds`；网络异常分支下 `response is None` → 直接走退避，语义与从前一致。
- **测试隔离**：fixture 只替换 `llm_client` 模块的 `asyncio` 名字，不改全局 `asyncio.sleep`，不会影响 pytest-asyncio 的事件循环管理。`random` 也只在 ⑤ 用 `SimpleNamespace` 局部替换。

## 6. 证据文件

- 代码：`backend/app/services/llm_client.py`、`backend/tests/test_llm_client.py`
- 证据脚本：`%TEMP%\vs10_evidence.py`（已按删除铁律送回收站，仓库内无残留临时目录）
- `git diff --stat`：`backend/app/services/llm_client.py | 76 +++-`、`backend/tests/test_llm_client.py | 165 +++`，2 files changed, 240 insertions(+), 1 deletion(-)
