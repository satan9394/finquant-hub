# IMPLEMENT_RESULT — Vertical Slice 21：重试的"整次调用总时长预算"

> 状态：**已完成（待独立 Evaluator 复核）** — 实现者 IMPLEMENTER，2026-09-11。
> 任务卡：`docs/ai/evo/IMPLEMENTATION_BRIEF_VS21.md`
> 改动文件（**未 commit**）：`backend/app/services/llm_client.py`、`backend/tests/test_llm_client.py`
> 临时产物：门禁原始输出已贴进本文件，`_vs21_*.txt` 与 TEMP 下的变异副本已**送回收站**。

## 0. 结论先行

- 重试循环现在有一条**可配置的整次调用总时长预算**（构造参数 `total_budget_seconds`，默认 `180.0` 秒），自循环开始计时，**每次 `asyncio.sleep` 之前**判定。
- 语义选择：**已用 ≥ 预算 ⇒ 立即停止重试并抛可行动 `LLMError`**；**剩余预算 < 计划等待 ⇒ 等待截断到剩余预算**（两条等待来源——`Retry-After` 与回落抖动退避——都截断）。
- **可判定上界：整次调用墙钟 ≤ 预算 + 单次尝试超时**（已写进 `_post_chat_with_retry` docstring）。默认值下 = **300 秒**；实测最坏路径由改动前的 **420 秒** 降到 **270 秒**（同样的"每次尝试跑满 120s + 上游要求 30s 等待"场景）。
- **两类耗尽文案可区分**：`总时长预算已用尽…` vs `网络错误或超时，已用尽 3 次尝试（尝试次数用尽）…`（有专门的判别用例）。
- 门禁：`pytest tests/test_llm_client.py` **48 passed**；`ruff check .` **All checks passed!**；鉴别力证明：把预算判断从**副本**移除后 **6 条新用例变红**（被验文件全程未被触碰）。

## 1. 改动清单（文件:行）

### `backend/app/services/llm_client.py`（+61 / -2）

| 位置 | 改动 |
|---|---|
| `:10` | `import time`（新增，预算计时用 `time.monotonic`） |
| `:36-45` | 新增常量 `_DEFAULT_TOTAL_BUDGET_SECONDS = 180.0`，附取值依据注释 |
| `:46-49` | 新增常量 `_BUDGET_EPSILON_SECONDS = 1e-6`（判据浮点容差，见 §2.6） |
| `:149` | 构造参数 `total_budget_seconds: float = _DEFAULT_TOTAL_BUDGET_SECONDS`（插在 `timeout` 与 `context_budget` 之间；**所有既有调用点均为"≤3 个位置参数 + 关键字"，已逐处核对**） |
| `:156-158` | 构造期校验：非正有限数 ⇒ `ValueError`（与既有 `context_budget < 256` 同款 fail-fast） |
| `:166` | `self.total_budget_seconds = total_budget_seconds` |
| `:214-226` | 新增 `_budget_exhausted_error(attempts, response)`：预算耗尽的**可行动**文案（含状态码/参数名/调大方法） |
| `:237-244` | `_post_chat_with_retry` docstring 增补 VS21 语义与**上界公式** |
| `:250` | `started_at = time.monotonic()`——**预算自循环开始计时** |
| `:265-274` | 循环尾部：`remaining = 预算 - (now - started_at)`；`remaining <= _BUDGET_EPSILON_SECONDS` ⇒ 抛预算错误（有 `last_exc` 时 `raise … from last_exc` 保留真因）；否则 `await asyncio.sleep(min(计划等待, remaining))`——**两次尝试之间**才判定，绝不打断进行中的尝试 |
| `:275-278` | 次数耗尽的收尾文案补上"已用尽 `_MAX_ATTEMPTS` 次尝试（尝试次数用尽）"，与预算文案形成可判定区分（原句 `网络错误或超时…` 前缀保留，既有断言 `match="网络错误"` 不受影响） |

**未改动**：`_MAX_ATTEMPTS=3`、`_RETRYABLE_STATUS`、`_BACKOFF_BASE_SECONDS`、`_RETRY_AFTER_MAX_SECONDS=30.0`、`_BACKOFF_JITTER_RATIO`、`_http_date_seconds`、`_retry_after_seconds`、`_backoff_seconds`、`_retry_delay_seconds`、`chat_stream`（仍完全不重试）、`self.timeout` 语义（仍只作用于单次尝试）。

### `backend/tests/test_llm_client.py`（+232）

新增 `budget_clock` fixture（假时钟 + 睡眠记录器）与 10 条 VS21 用例（其中 1 条参数化 6 例，共 15 个测试用例）：

| 用例 | 覆盖的验收点 |
|---|---|
| `test_vs21_budget_exhaustion_stops_retries_and_truncates_wait` | ①预算耗尽即停（3 次尝试只用 2 次，**不是**被 `_MAX_ATTEMPTS` 停的）+ ③等待截断 + 文案可区分 + 状态码不丢 |
| `test_vs21_wall_clock_within_budget_plus_single_attempt_timeout` | ②上界（假墙钟 270s ≤ 180+120）+ VS10 的 30s 单次上限仍生效 +"改动前是 3 次/420s" |
| `test_vs21_wait_truncated_exactly_at_budget_boundary` | ③`Retry-After: 30` vs 剩余 5s ⇒ 实测等待恰为 5s，随后边界相等即停 |
| `test_vs21_backoff_path_wait_is_also_truncated` | ③**同源**：回落退避路径（无 `Retry-After`）同样被截断到剩余 0.3s |
| `test_vs21_first_attempt_success_is_never_overridden_by_budget` | 边界：首次尝试就用光预算但成功 ⇒ 返回真实结果 |
| `test_vs21_non_retryable_4xx_still_returns_first_response_under_tiny_budget` | 不能破坏项：非可重试 4xx 仍只发一次、仍报真实状态码 |
| `test_vs21_budget_exhaustion_keeps_real_cause_for_network_errors` | 网络类：抛预算文案但 `__cause__` 仍是 `httpx.ConnectError` |
| `test_vs21_two_exhaustion_kinds_are_distinguishable` | ④两类耗尽文案互斥可辨别 |
| `test_vs21_non_positive_or_non_finite_budget_is_rejected`（参数化 6 例：`0 / -1 / 0(int) / -0.5 / nan / inf`） | 边界：0/负数/NaN/Inf ⇒ `ValueError`（拒绝语义） |
| `test_vs21_default_budget_is_injectable_and_documented` | ⑥预算为可注入构造参数；`timeout` 语义未被改动 |

## 2. 设计决策与理由

### 2.1 默认预算 = 180.0 秒

依据（写在常量注释里，测试 `assert _DEFAULT_TOTAL_BUDGET_SECONDS > 120 + 30` 把①钉住）：

1. **不废掉重试**：`180 > 120 + 30` ⇒ 即使首次尝试跑满单次超时，紧随其后的一次**完整 30 秒上游指示等待**仍放得下；
2. **真能压短最坏等待**：上界 = 180 + 120 = **300 秒（5 分钟）**，比改动前的 420 秒短 29%；实测同场景最坏由 420s → **270s**；
3. **不误伤常规瞬时故障**：快速 429/5xx 几乎不消耗预算，仍能拿满 3 次尝试。

### 2.2 剩余预算 < 计划等待 ⇒ **截断**（而非直接停止）

卡里要求"择一并在结果文件写明"。选**截断**：剩余预算本就是这次调用已经付出的时间成本，直接丢弃等于让用户白等（例如"已等 175 秒、只差 5 秒就能再试一次"却立刻失败）。截断不越过预算，上界公式（预算 + 单次尝试超时）依然成立。已测到：`Retry-After: 30` + 剩余 5s ⇒ 实测等待恰为 `5.0`。

### 2.3 预算为 0 / 负数 / NaN / Inf ⇒ **拒绝（构造期 `ValueError`）**

卡里同为"择一"。选拒绝：与既有 `context_budget < 256` 的构造期校验同款，配置错误在启动时就暴露，而不是变成"一次都不试"（0 秒预算会静默禁用重试）或"永不停止"（NaN 会让 `remaining <= 0` 恒为 False，预算形同不存在——这正是本卡要消灭的"没有上界"）。**正数预算（哪怕极小）保证首次尝试一定执行**，因为判定只发生在两次尝试之间。

### 2.4 预算耗尽时的收尾类别（与"状态码类返回最后响应"的关系）

**明确记一笔**：预算耗尽时**总是抛 `LLMError`**（即使最后一次是 429/5xx）。理由是卡里验收标准 ① 要求"抛出 `LLMError` 且文案指明是总时长预算耗尽"，而"状态码类返回最后响应"针对的是**尝试次数用尽**这一既有出口（该出口原样未动，`test_chat_retry_exhausted_5xx_reports_last_status` 仍绿）。为避免丢信息，预算文案会带上"最后一次尝试返回 HTTP {status}"；网络类则用 `raise … from last_exc` 保留原始异常（有用例断言 `__cause__`）。对调用方而言两类最终都是 `LLMError`，可观测差异只在文案与 `__cause__`。

### 2.5 可判定上界（已写进 docstring）

**整次调用墙钟 ≤ 预算 + 单次尝试超时**。因为只在 sleep 前检查：最后一次尝试的**开始时刻**必然满足"已用 < 预算"，而它自身最多再花一个完整 `timeout`。默认值下 ≤ 300 秒。卡里"不得截断进行中的尝试"由此结构性保证（循环内没有任何 `wait_for`/取消）。

### 2.6 浮点容差 `1e-6`（**实测发现，非预防性添加**）

先写的判据是 `remaining <= 0`。新用例 `test_vs21_backoff_path_wait_is_also_truncated`（预算 0.3s、退避 0.75~1.25s）当场暴露抖动：假时钟 `1000.3 - 1000.0 = 0.2999999999999545` ⇒ `remaining = +4.5e-14 > 0` ⇒ 代码会 `sleep(4.5e-14)` 后**再发一次尝试**，与"已用 ≥ 预算即停"的字面语义相悖（虽不破坏上界：那次尝试的开始时刻仍 ≈ 预算）。故判据改为 `remaining <= _BUDGET_EPSILON_SECONDS`（1 微秒，相对 180 秒预算可忽略），使边界在浮点噪声下仍然确定。**这是唯一由测试反推出来的代码改动**，如实记录。

### 2.7 测试时钟接缝（不需要新构造参数）

`llm_client` 现在是唯一使用 `time.monotonic` 的地方，测试只需 `monkeypatch.setattr(llm_client, "time", SimpleNamespace(monotonic=fake))`——与既有 `recorded_sleeps` 替换 `llm_client.asyncio` 完全同款（只动本模块的引用，不污染全局模块 / pytest-asyncio）。因此**生产 API 表面只增加了 `total_budget_seconds` 一个参数**，没有为测试引入时钟参数。`budget_clock` fixture 让 handler 每次推进假时钟（模拟"一次尝试的真实耗时"）、`sleep` 也推进它，于是"假墙钟"= 尝试耗时 + 等待时长，可直接断言上界。**没有任何用例真实等待**（全文件 0.30s 跑完）。

### 2.8 逐条核对"不能破坏"

| 约束 | 状态 | 证据 |
|---|---|---|
| `_MAX_ATTEMPTS=3` 不变 | ✅ | `:23` 未动；`test_chat_retry_exhausted_*` 仍断言 `len(calls) == _MAX_ATTEMPTS` |
| `_RETRYABLE_STATUS` 不变 | ✅ | `:24` 未动 |
| 非可重试 4xx 立即返回 | ✅ | `:263` 分支未动 + 新用例（极小预算下 401 仍只发一次、报 401） |
| `Retry-After` 尊重 + 30s 上限 | ✅ | `_retry_after_seconds` 未动；新用例断言 `sleeps == [30.0]`（`99999` 被截到 30） |
| `_retry_delay_seconds` 抖动逻辑不变 | ✅ | 未动；`test_missing_retry_after_uses_jittered_backoff` 仍绿 |
| 网络类耗尽抛 `LLMError` | ✅ | 循环末出口未动（仅文案增补，前缀仍含"网络错误"） |
| 状态码类耗尽返回最后响应 | ✅ | `:262` 分支未动；`test_chat_retry_exhausted_5xx_reports_last_status` 仍绿 |
| 不为测试替身放宽异常处理 | ✅ | 没有新增任何 `except`；只捕获既有的 `httpx.HTTPError` |
| 不加依赖 / 不改 API 形状 / 不删文件 | ✅ | 只 `import time`（标准库）+ 一个带默认值的构造参数 |

## 3. 门禁原始输出

### 3.1 `pytest tests/test_llm_client.py -q --no-cov -p no:cacheprovider`（前置 `$env:no_proxy='localhost,127.0.0.1,::1'`）

```
................................................                                                                [100%]
48 passed in 0.30s
```

（改动前该文件 33 条用例；新增 15 条测试用例全部为绿。）

### 3.2 `ruff check .`

```
All checks passed!
```

### 3.3 鉴别力证明：把新加的预算判断从**副本**移除

**方法与卫生**：`robocopy backend <TEMP>\vs21_mutant3\backend /E /XD .venv data __pycache__ …`（排除 `.venv`、`data`、所有 `__pycache__`），只在副本上做替换——**被验文件 `backend/app/services/llm_client.py` 全程未被触碰**，运行前用 `Select-String` 双向核对：

```
副本仍含预算判断? False
被验文件仍含预算判断(未被触碰)? True
```

变异内容（副本 `app/services/llm_client.py`，即"把新加的预算判断去掉"、回到 VS21 之前的循环）：

```diff
             if attempt < _MAX_ATTEMPTS:
-                remaining = self.total_budget_seconds - (time.monotonic() - started_at)  # VS21
-                if remaining <= _BUDGET_EPSILON_SECONDS:
-                    budget_error = self._budget_exhausted_error(attempt, response)
-                    if last_exc is not None:
-                        raise budget_error from last_exc
-                    raise budget_error
-                await asyncio.sleep(min(_retry_delay_seconds(attempt, response), remaining))
+                await asyncio.sleep(_retry_delay_seconds(attempt, response))
```

在副本目录下用**同一个 venv** 跑同一测试文件，原始输出（`--tb=line`）：

```
.................................FFFF..FF.......                                                                [100%]
==================================================================================== FAILURES =====================================================================================
E   AssertionError: 预算耗尽后不得再发起尝试
    assert 3 == 2
     +  where 3 = len([<Request('POST', 'https://llm.test/chat/completions')>, <Request('POST', 'https://llm.test/chat/completions')>, <Request('POST', 'https://llm.test/chat/completions')>])
...\vs21_mutant3\backend\tests\test_llm_client.py:530: AssertionError: 预算耗尽后不得再发起尝试
E   AssertionError: Regex pattern did not match.
      Expected regex: '总时长预算已用尽'
      Actual message: 'API 返回 503：unavailable。请检查供应商服务状态后重试。'
...\vs21_mutant3\backend\tests\test_llm_client.py:561: AssertionError: Regex pattern did not match.
E   AssertionError: Regex pattern did not match.
      Expected regex: '总时长预算已用尽'
      Actual message: 'API 返回 429：rate limited。请检查账户额度或稍后重试。'
...\vs21_mutant3\backend\tests\test_llm_client.py:582: AssertionError: Regex pattern did not match.
E   AssertionError: Regex pattern did not match.
      Expected regex: '总时长预算已用尽'
      Actual message: 'API 返回 503：unavailable。请检查供应商服务状态后重试。'
...\vs21_mutant3\backend\tests\test_llm_client.py:605: AssertionError: Regex pattern did not match.
E   AssertionError: assert 3 == 2
     +  where 3 = len([<Request('POST', 'https://llm.test/chat/completions')>, <Request('POST', 'https://llm.test/chat/completions')>, <Request('POST', 'https://llm.test/chat/completions')>])
...\vs21_mutant3\backend\tests\test_llm_client.py:660: AssertionError: assert 3 == 2
E   AssertionError: assert '总时长预算已用尽' in '网络错误或超时，已用尽 3 次尝试（尝试次数用尽）：请检查 API 地址、网络/代理连接及供应商服务状态后重试。'
...\vs21_mutant3\backend\tests\test_llm_client.py:685: AssertionError: assert '总时长预算已用尽' in '网络错误或超时，已用尽 3 次尝试（尝试次数用尽...
=================================================================================== short test summary info ====================================================================================
FAILED tests/test_llm_client.py::test_vs21_budget_exhaustion_stops_retries_and_truncates_wait - AssertionError: 预算耗尽后不得再发起尝试
FAILED tests/test_llm_client.py::test_vs21_wall_clock_within_budget_plus_single_attempt_timeout - AssertionError: Regex pattern did not match.
FAILED tests/test_llm_client.py::test_vs21_wait_truncated_exactly_at_budget_boundary - AssertionError: Regex pattern did not match.
FAILED tests/test_llm_client.py::test_vs21_backoff_path_wait_is_also_truncated - AssertionError: Regex pattern did not match.
FAILED tests/test_llm_client.py::test_vs21_budget_exhaustion_keeps_real_cause_for_network_errors - AssertionError: assert 3 == 2
FAILED tests/test_llm_client.py::test_vs21_two_exhaustion_kinds_are_distinguishable - AssertionError: assert '总时长预算已用尽' in '网络错误或超时，已用尽 3 次尝试（尝试次数用尽...
6 failed, 42 passed in 0.47s
```

**解读**：6 条"预算执法"用例变红，**42 条仍绿**（33 条既有用例 + 9 条不依赖预算执法的 VS21 边界/回归用例）⇒ 新用例确实钉住了新行为，且不是靠改既有断言变绿的。

同一变异下单独跑上界用例（`--tb=long`），可读出**改动前的 420 秒**：

```
monkeypatch = <_pytest.monkeypatch.MonkeyPatch object at 0x000002A36C629F10>, budget_clock = {'now': 1420.0, 'sleeps': [30.0, 30.0]}
E       AssertionError: Regex pattern did not match.
E         Expected regex: '总时长预算已用尽'
E         Actual message: 'API 返回 503：unavailable。请检查供应商服务状态后重试。'
FAILED tests/test_llm_client.py::test_vs21_wall_clock_within_budget_plus_single_attempt_timeout - AssertionError: Regex pattern did not match.
1 failed, 47 deselected in 0.32s
```

`now = 1420.0 - 1000.0 = 420.0` 秒、`sleeps = [30, 30]`、3 次尝试——与任务书的 `3×120 + 2×30 = 420` 完全一致；同一用例在**被验文件**上是 `270.0` 秒、2 次尝试、`sleeps = [30.0]`、抛预算文案。

## 4. 未解决问题

1. **预算只覆盖 `_post_chat_with_retry` 的一次调用，不覆盖"整次研究"**：`chat_with_tools_loop` 每轮都独立起算预算（4 个 Agent × 多轮 ⇒ 整轮研究的总时长仍无聚合上界）。卡里只要求"整次调用"，故**未做**；若 R4 D4 的意图是"用户在深度研究里等待的上界"，需要另开一张卡（建议名：整轮研究的截止时间/deadline 传递）。
2. **未接运行时配置**：预算目前只能由构造参数注入，`model_router.get_client` / `models_crud` 未传该参数（走默认 180s），也没有 env/DB 开关。卡里只要求"构造参数（默认值 + 可注入）"，故未扩面；若产品要"用户可调"，需另定配置口径（并同步前端文案）。
3. **预算耗尽时状态码类也抛 `LLMError`（见 §2.4）**：这是按卡里验收标准 ① 做的取舍，但确实改变了"最后一次是 429/5xx 时调用方拿到响应"这一**在预算路径上**的表象。Evaluator 若认为应保留"返回响应"，需要卡里先明确两者冲突时以哪条为准。
4. **文档同步未做**：`docs/ai/evo/IMPLEMENT_RESULT_VS10.md`、`IMPLEMENTATION_BRIEF_VS4/VS10`、`EVALUATION_RESULT_VS4` 里逐字引用了旧的重试耗尽文案（历史归档，记录当时事实，建议不改）；活的文档（`docs/HANDOVER.md`、`docs/ai/evo/PRODUCT_STATE.md`、`docs/ARCHITECTURE.md`）**未提及**该文案，故无承诺漂移。是否给 `PRODUCT_STATE.md` 补一条 VS-21 记录，留给编排者（避免与并行 slice 争抢同一文件）。

## 5. 风险

- **低**：预算判定只在两次尝试之间执行，不引入取消/超时异常路径，不改变 4xx/网络类两条既有收尾出口的结构。
- **中（可观测）**：极端限流下"3 次尝试"可能变成 2 次（这正是本卡目的），但若上游恢复时间恰好落在 180–420s 窗口内，改动前能自愈、改动后可能失败。默认值 180s 是折中（≥1 次完整尝试 + 1 次完整 30s 等待）；如线上反馈"重试窗口太短"，调大 `_DEFAULT_TOTAL_BUDGET_SECONDS` 即可，测试用属性断言（`> 120 + 30`）而非硬编码数值约束松紧。
- **低（浮点）**：判据带 1 微秒容差（§2.6），上界不受影响。
- **无**：没有新增依赖、没有改动 `chat_stream`、没有触碰 `_MAX_ATTEMPTS`/`_RETRYABLE_STATUS`/`Retry-After` 逻辑、没有 commit。

## 6. 证据（可复现步骤）

```powershell
cd E:\Code_file\Projects\finquant-hub\backend
$env:no_proxy='localhost,127.0.0.1,::1'

# ① 门禁
.venv\Scripts\python.exe -m pytest tests/test_llm_client.py -q --no-cov -p no:cacheprovider   # 48 passed
.venv\Scripts\python.exe -m ruff check .                                                      # All checks passed!

# ② 鉴别力证明（副本变异，绝不动被验文件）
$src='E:\Code_file\Projects\finquant-hub\backend'; $dst="$env:TEMP\vs21_mutant3\backend"
robocopy $src $dst /E /XD .venv data __pycache__ .pytest_cache .ruff_cache .mypy_cache     # 0-7 = 成功
# 在副本里把 `remaining = self.total_budget_seconds …` 到 `min(_retry_delay_seconds(attempt, response), remaining))`
# 整段替换回 `await asyncio.sleep(_retry_delay_seconds(attempt, response))`（见 §3.3 的 diff）
Push-Location $dst
& "$src\.venv\Scripts\python.exe" -m pytest tests/test_llm_client.py -q --no-cov -p no:cacheprovider --tb=line
# ⇒ 6 failed, 42 passed
Pop-Location

# ③ 上界与两类耗尽（被验文件上的原始输出）
.venv\Scripts\python.exe -m pytest tests/test_llm_client.py -q --no-cov --no-header -k "vs21_wall_clock or vs21_two_exhaustion" -v
#   test_vs21_wall_clock_within_budget_plus_single_attempt_timeout  PASSED   （假墙钟 270.0 ≤ 180+120，2 次尝试，sleeps=[30.0]）
#   test_vs21_two_exhaustion_kinds_are_distinguishable              PASSED   （'总时长预算已用尽' / '尝试次数用尽' 互斥）
```

## 7. 不在范围（确认未顺手做）

- `chat_stream` **仍未加重试**（`:519` 起原样）：流式重试有重复已发出 token 的风险，需单独设计。
- **超时是否计入用量**未动（`record_llm_usage` 调用点未变）。
- 未改 `research_orch` / `swarm_orch` / 任何 SSE 层的超时口径。
- 未 commit、未 `git add`、未删文件。
