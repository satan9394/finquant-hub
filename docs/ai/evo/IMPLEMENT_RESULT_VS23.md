# IMPLEMENT RESULT — Vertical Slice 23：整轮工具对话的聚合等待上界（deadline）

> 实现者：IMPLEMENTER（本会话）。任务卡：`docs/ai/evo/IMPLEMENTATION_BRIEF_VS23.md`（数字已由编排者核码）。
> 状态：**完成**（不 commit；改码前先落盘过骨架，见 git 未跟踪的本文件历史）。
> 变异/还原窗口声明：**本仓工作树全程处于交付态**；两处变异都做在 `$env:TEMP` 的**副本**里（见 §4）。

## 0. 一句话

「每次调用最多等 N 秒」≠「用户最多等 N 秒」。本卡给**整轮**带工具对话加聚合截止 `deadline_seconds`
（默认 `None` = 逐项零回归），把「因超时提前结束」变成**显式结果**（返回值第 4 项 + 受控事件
`tool_loop_truncated` + 聊天 SSE 正文提示与 `done` 标记），并顺带补上 VS-21 验收 NIT①（预算耗尽错误
不再丢掉脱敏后的上游 body）。

## 1. 改动清单（文件:行）

### 1.1 `backend/app/services/llm_client.py`（主）

| 行 | 改动 |
|---|---|
| 21-25 | 新增返回类型别名 `ToolLoopResult` / `ToolLoopResultWithStatus` |
| 52-62 | 新增 `DEFAULT_TOOL_LOOP_DEADLINE_SECONDS = 600.0`（含取 600 的三条依据；整轮上界 900s vs 改动前 1500s） |
| 128-135 | `TOOL_LOOP_EVENTS` **追加** `"tool_loop_truncated"`（"提前结束"在事件通道同样显式） |
| 222-224 | 新增 `_redact()`：脱敏口径**单一来源**（`api_key` → `[已隐藏]`） |
| 226-241 | 新增 `_response_snippet()`：脱敏后 `response.text[:300]`，无响应体时返回空串 |
| 243-251 | `_response_error()` 改用 `_redact()`（**行为逐字不变**，仅抽公共口径） |
| 252-267 | `_budget_exhausted_error(attempts, response, budget_seconds=None)`：**NIT①** 补上游片段；文案改「总时长预算已用尽（**本次 X 秒**）」，X 是**生效**预算；末尾追加关键字参数 |
| 271-273, 299, 318, 322 | `_post_chat_with_retry(self, payload, budget_seconds=None)`：末尾追加关键字参数；`budget = 覆盖值 or 客户端预算`；预算判定与预算错误都用 `budget` |
| 405-418 | `chat_with_tools_safe(..., *, with_finish_reason=False, budget_seconds=None)`：末尾 keyword-only，透传给重试循环 |
| 470-680 | `chat_with_tools_loop(..., *, deadline_seconds=None)`：构造期校验、`_remaining_round_budget()` / `_deadline_reached()` / `_status()` / `_finish()` / `_truncate()`、**每轮开始前**截止检查、轮内预算取 min、收尾请求前检查、docstring 写全上界公式 |
| 547-556 / 582 | 每轮开始前 `_deadline_reached()` ⇒ `return await _truncate("deadline_exceeded_before_tool_round")` |
| 663-672 | 轮数用尽后：先查截止（`"deadline_exceeded_before_final_answer"`），**先判断再**追加督促消息 |

### 1.2 `backend/app/routers/chat.py`

| 行 | 改动 |
|---|---|
| 16 | 导入 `DEFAULT_TOOL_LOOP_DEADLINE_SECONDS` |
| 189-204 | 传入 `deadline_seconds=DEFAULT_TOOL_LOOP_DEADLINE_SECONDS`；解 4 元组；截断时把「（因超过总时长上限提前结束，以下为已完成部分）」**置前**写入 `full`（用户所见 == 落库内容） |
| 223 | `done` 载荷新增机器可读字段 `truncated_by_deadline` |

### 1.3 测试

| 文件:行 | 内容 |
|---|---|
| `backend/tests/test_llm_client.py:710-1103` | 新增 VS23 段：**19 个用例**（10 个 `test_vs23_*` 覆盖①②④⑤⑥与上界 + 参数化拒绝 + 3 个 NIT① 用例 + 收尾/完成边界）；全部用 `budget_clock` 假时钟，**不真实等待** |
| `backend/tests/test_chat_tools.py:167-262` | 新增**可跑的** chat 侧聚焦测试：`chat_deadline_db` fixture + `_run_chat_sse()` + 2 个用例（截断显式透出 / 未截断不得误报） |
| `backend/tests/test_memory_rollout.py:148-158` | 机械适配（见 §1.4） |
| `backend/tests/test_api.py:22-35, 46, 265, 303, 313-317` | 机械适配（见 §1.4） |

### 1.4 两处**卡范围外**文件的改动（机械适配，已向编排者报备并获认可）

必要原因：本次改的是**公开签名** `chat_with_tools_loop(..., *, deadline_seconds=…)`，而这两个文件里有
**4 个该方法的替身**（`test_api.py` 3 个、`test_memory_rollout.py` 1 个），不接住新关键字参数会 TypeError
（在 chat SSE 里被兜底 `except` 吞成 error 事件 ⇒ 用例必红）。

改动内容：**只有**「签名末位加 `*, deadline_seconds=None`」+「按同一规则应答返回值形状」，
**没有新增任何断言、没有新增任何测试、没有新增任何业务逻辑**（`test_api.py:22` 的 `_loop_result` 是 5 行
纯函数：给定 deadline 非 None 时把 3 元组补成 4 元组，无副作用）。

> **更正（编排者核实）**：我先前说过"VS-21 也有同款先例（VS-21 为签名变化改过 test_api.py 的 3 个替身）"——
> **不成立**。`git show f4240e7 --name-only` 不含 `test_api.py`；VS-21 改的是**私有**
> `_post_chat_with_retry(self, payload, budget_seconds=…)`，替身替的是 `chat_with_tools_loop`，本不受影响。
> 正确理由是：**本次改的是公开签名 `chat_with_tools_loop`，而 `test_api.py` 里有 3 个该方法的替身。**
> 结论不变（改动必要且正当），但**先例那句话是错的**，在此更正并留痕。

> **运行验证状态（诚实标注）**：
> - `backend/tests/test_memory_rollout.py`：**已真实运行**，`5 passed in 2.17s`（原始输出见 §3）⇒ **经运行验证**。
> - `backend/tests/test_api.py`：按本卡门禁**未运行**（`AGENTS.md`：本机沙箱跑它会挂）⇒ 该处改动**未经运行验证**。
>   静态核对：3 个替身均在末位接受 `deadline_seconds`，路由固定传非 None ⇒ 返回 4 元组；`git diff` 见下证据。
>   建议复核方式（不触发全文件挂起）：`pytest tests/test_api.py -k "chat" -q --no-cov` 由编排者择机执行。
> - `git diff -- backend/tests/test_api.py backend/tests/test_memory_rollout.py` 全文已核对为纯机械适配（下面 §7 附）。

## 2. 设计裁决（含与编排者的设计分歧）

### 2.1 返回值形状：**条件 arity**（`deadline_seconds is None` ⇒ 3 元组；非 None ⇒ 4 元组）

编排者建议改成**恒定 4 元组**（消除"形状取决于入参"的脆性）。我选择**保留条件 arity**，理由：

1. **卡里这是硬要求**：§必做 1「默认 `None` ⇒ **行为与现状逐项一致**（这是硬要求）」+ §验收 1「**默认零回归**…**既有 `test_llm_client.py` 全绿**」。
   恒定 4 元组必须改掉 4 条**既有绿色断言**（`test_llm_client.py:174`、`:199`、`test_chat_tools.py:90`、`:149`），
   等于把"零回归"改成"改测试来适配"——独立评估者若按卡复核"既有用例是否未改"，会直接判不符。
2. **仓内先例**：VS12 的 `with_finish_reason` 就是"默认 3 元组 / 开启才 4 元组"，本仓已有此契约形态。
3. **结构上消灭"静默截断"**：设了截止就**一定**拿到状态项——不可能出现"设了截止却读不到截断标记"的写法，
   这正是卡的必做 4「绝不伪装成正常完成」的结构性保证。恒定 4 元组反而让"忘了看第 4 项"变成静默。
4. **脆性有界且是"响亮失败"**：形状由**入参**决定（不是由数据决定），仓内调用点**已全部枚举**（§2.2），
   唯一传截止的只有 `routers/chat.py:189`（已改并**运行验证**）；漏改的写法会在第一次运行时
   `ValueError: too many values to unpack`，**不会静默出错**；仓外无消费者。
5. 若编排者仍要求改成恒定形状：那是**对卡 §必做 1/§验收 1 的修订**，请明示后我再改（预计 15 分钟：改 4 条既有断言 + 4 个替身 + `chat.py` 解包）。

### 2.2 调用点清单（全仓，`grep -n 'chat_with_tools_loop('`，22 处命中）

**生产（唯一）**：`backend/app/routers/chat.py:189` —— 传 `deadline_seconds`，解 **4** 元组，已运行验证。

**测试里对真实实现的调用（不传截止 ⇒ 3 元组不变）**：`test_llm_client.py:174`、`:199`；`test_chat_tools.py:90`、`:149`。

**替身（4 处，均已适配）**：`test_api.py:46`、`:265`、`:303`；`test_memory_rollout.py:148`。

**VS23 新用例（传截止 ⇒ 4 元组）**：`test_llm_client.py:764/797/829/853/884/909/937/967/997/1030/1046`。

结论：**仓内所有调用点都已适配**；无位置参数被插中段（三个签名的新参数全部在**末尾**、关键字、带默认值——
`_post_chat_with_retry` 与 `_budget_exhausted_error` 的 `budget_seconds` 也是末尾追加；对应编排者提到的 NIT③）。

### 2.3 截止语义与上界

- 计时基准：**进入 `chat_with_tools_loop` 的 `time.monotonic()`**（相对时长，不是绝对时刻）。测试用假时钟注入。
- 检查点：**每轮开始前** + **收尾（强制最终回复）请求前**；轮内进行中的调用**不被打断**（与 VS-21 一致）。
- 单轮预算 = `min(self.total_budget_seconds, deadline - elapsed)`，作为 `budget_seconds` 一路透传到
  `_post_chat_with_retry`（`chat_with_tools_safe` 只是透传者）。
- **可判定上界**（已写进 docstring）：`整轮墙钟 ≤ deadline + 单次调用上界`（= 单次预算 + 单次尝试超时）。
  证明：轮间检查 ⇒ 只有"最后一次已开始的调用"能越过截止，它最多只剩"单次尝试超时"的溢出；
  默认值下 ≤ 600 + 300 = **900s**（改动前最坏 5 × 300 = **1500s**，缩短 40%）。
  **实测更紧的真实上界是 `deadline + self.timeout`**（单轮预算已被剩余值压低，溢出只剩那次未被打断的尝试）；
  两条都在用例里断言（`test_llm_client.py:892`、`:921` 实测 720.0 / 270.0）。
- 值校验：`0 / 负数 / NaN / Inf ⇒ ValueError("deadline_seconds 必须是正有限数（单位：秒）或 None")`，
  与 `total_budget_seconds` 同口径（卡 §错误场景）。
- **边界说明（重要，别误读）**：`deadline_seconds` 是**相对时长**，「首轮之前就已过」在数学上等价于
  "剩余 ≤ 1µs 浮点容差"，而 0/负数按卡要求被 `ValueError` 拒绝 ⇒ 该场景的**可达形态**就是"正数但 ≤ 容差"
  （用例 `test_llm_client.py:814` 用 `1e-9`：**零次 LLM 调用**、显式截断）。真正的"轮前已过"发生在**轮间**
  （用例 `:778`、`:980`）。
- 轮内因截止导致的预算耗尽 ⇒ `LLMError` **照原样上抛**（不在本层改写 VS-21 的错误语义；用例 `:863` 断言了这一点），
  chat.py 的既有 `except LLMError` 分支照常以 error 事件收尾。

## 3. 门禁原始输出

```
PS> cd E:\Code_file\Projects\finquant-hub\backend; $env:no_proxy='localhost,127.0.0.1,::1'
PS> .venv\Scripts\python.exe -m pytest tests/test_llm_client.py -q --no-cov -p no:cacheprovider
...................................................................                                        [100%]
67 passed in 0.50s

PS> .venv\Scripts\python.exe -m pytest tests/test_chat_tools.py -q --no-cov -p no:cacheprovider
.....                                                                                                      [100%]
5 passed in 0.93s

PS> .venv\Scripts\python.exe -m pytest tests/test_memory_rollout.py -q --no-cov -p no:cacheprovider
.....                                                                                                      [100%]
5 passed in 2.17s

PS> .venv\Scripts\python.exe -m ruff check .
All checks passed!

--- 孤儿进程核对 ---
ProcessId cmd
    27104 "...\Anaconda3\envs\claude\python.exe" -m http.server 3001 --bind 127.0.0.1   ← 既有常驻服务，非本次遗留
（无遗留 `-m pytest` 进程）
```

基线（改动前）：`48 passed in 0.51s` ⇒ 既有 48 条全绿，新增 19 条 = 67。**未跑全量 pytest / test_api.py**（按卡）。

## 4. 鉴别力证明（变异在 `$env:TEMP` **副本**，仓库工作树始终为交付态）

声明：变异窗口只存在于 `%TEMP%\vs23_mut_a` / `%TEMP%\vs23_mut_b`（各是 `backend\` 的 robocopy 副本，
排除 `.venv/data/__pycache__`），用仓库 venv 的 python 运行；仓库内从未植入缺陷（§7 有 `git grep` 残留核对为空）。

### 变异 A：删掉新增的整轮截止判断（`_deadline_reached()` 恒 `False`）

```
MUTATION-A applied
>            return False  # MUTATION-A: 删掉整轮截止判断

PS> C:\Users\...\AppData\Local\Temp\vs23_mut_a\backend> pytest tests/test_llm_client.py -q --no-cov -p no:cacheprovider
...
>       assert attempts["n"] == 2
E       assert 7 == 2
tests\test_llm_client.py:942: AssertionError
...
>       assert seen == [20.0, 8.0]
E       assert [20.0, 8.0, -4.0] == [20.0, 8.0]
E         Left contains one more item: -4.0
tests\test_llm_client.py:1001: AssertionError
=============================================================================
FAILED tests/test_llm_client.py::test_vs23_deadline_stops_loop_with_explicit_truncation_flag - AssertionError: 提前结束必须是显式标记，不得伪装成正常完成
FAILED tests/test_llm_client.py::test_vs23_deadline_already_spent_before_first_round_issues_no_llm_call - AssertionError: 首轮开始前已过截止 ⇒ 不得发起任何 LLM 调用
FAILED tests/test_llm_client.py::test_vs23_round_budget_is_min_of_single_budget_and_remaining - AssertionError: 第 1 轮 min(180,180)=180；第 2 轮剩余 7s < 180s ⇒ 必须压低为 7s
FAILED tests/test_llm_client.py::test_vs23_worst_case_wall_clock_within_deadline_plus_single_call_bound - assert False is True
FAILED tests/test_llm_client.py::test_vs23_end_to_end_wall_clock_upper_bound_with_real_retry_path - assert 7 == 2
FAILED tests/test_llm_client.py::test_vs23_deadline_before_forced_final_answer_is_explicit - assert [20.0, 8.0, -4.0] == [20.0, 8.0]
6 failed, 61 passed in 0.81s
[exit code: 1]
```

⇒ **6 条**新用例变红（①零回归用例仍绿，正是"只删新判断"应有的形态）。

### 变异 B：`_response_snippet()` 恒返回空串（= 回到 VS-21 NIT① 的"只带状态码"）

```
MUTATION-B applied   # snippet = ""  # MUTATION-B

PS> ...\vs23_mut_b\backend> pytest tests/test_llm_client.py -q --no-cov -p no:cacheprovider -k vs23_budget_exhausted
>       assert "insufficient_quota" in message   # 上游给出的真实原因（额度/鉴权）不得被丢掉
tests\test_llm_client.py:1067: AssertionError
>       assert "[已隐藏]" in message
E       AssertionError: assert '[已隐藏]' in 'LLM 调用总时长预算已用尽（本次 1 秒）：已发起 1 次尝试仍未成功，停止重试。最后一次尝试返回 HTTP 429。请检查...'
tests\test_llm_client.py:1089: AssertionError
FAILED tests/test_llm_client.py::test_vs23_budget_exhausted_error_carries_redacted_upstream_body
FAILED tests/test_llm_client.py::test_vs23_budget_exhausted_error_never_leaks_api_key
2 failed, 65 deselected in 0.52s
[exit code: 1]
```

⇒ NIT① 正反两例都具备鉴别力（删掉 body 片段即变红，且红在"真实原因被丢"上）。

## 5. 验收标准逐条对照

| 卡 §验收 | 落点 | 状态 |
|---|---|---|
| 1 默认零回归（None ⇒ 逐项一致、既有用例全绿） | `test_llm_client.py:739`（3 元组 / `budget_seconds` 恒 `None` / 事件序列 / 时钟推进 10000s 也不影响）；既有 48 条未改且全绿 | ✅ |
| 2 截止生效 + **显式**标记（给出实际取值） | `:778` ⇒ `truncated_by_deadline=True`、`reason="deadline_exceeded_before_tool_round"`；`llm_calls=2`（第 3 次不发） | ✅ |
| 3 上界成立（假时钟） | `:892` 实测 `elapsed == 720.0 ≤ 600 + 300`（且 ≤ 600+120）；`:921` 端到端实测 `270.0 ≤ 250+300` | ✅ |
| 4 单轮预算被压低为剩余值（断言实测值） | `:842` `seen == [180.0, 7.0]`；`:863` 端到端：等待被截断到 `4.0`（未压低会是 30s）且错误文案写「本次 5 秒」 | ✅ |
| 5 NIT① 正反例（body 出现 / api_key 不出现） | `:1050`（`insufficient_quota` 出现、300 字截断、尾部标记不出现）、`:1074`（`[已隐藏]`、密钥不出现）、`:1094`（无响应体时不崩） | ✅ |
| 6 显式而非静默（截止恰在成功调用之后） | `:953` ⇒ `truncated_by_deadline=False`、`reason=None`、事件只有 `tool_loop_done` | ✅ |
| 7 门禁 | §3 | ✅ |
| 8 鉴别力证明 | §4 | ✅ |

**错误场景**：0/负/NaN/Inf ⇒ `ValueError`（`:1042`，6 个参数化取值）；首轮前已过 ⇒ **零调用**（`:814`）；
最后一轮成功但已超截止 ⇒ 报"完成"（`:953`）；触发时进行中的调用不被打断（`:892` 的对抗性最坏形态即依赖这一点）。

**"不能破坏"逐项**：`total_budget_seconds` 语义 / sleep 前判定 / 剩余不足截断 / 不打断进行中的尝试 /
两类耗尽文案互斥 / `_MAX_ATTEMPTS` / `_RETRYABLE_STATUS` / 非可重试 4xx 立即返回 / `Retry-After` 尊重与 30s 上限 /
抖动 / `None` 预算下的既有行为 / `max_rounds` 轮数语义 —— 既有 48 条 VS-21/VS10/VS12 用例**一字未改**且全绿；
其中新增的端到端用例（`:941`）显式断言 `sleeps == [30.0]`（Retry-After 上限未被削弱）。
**改动纯属追加**：`git diff --numstat` ⇒ `test_llm_client.py 402/0`、`test_chat_tools.py 110/0`，
`test_llm_client.py` 只有单个 hunk `@@ -707,0 +708,402 @@` ⇒ 既有 707 行**一字未改**。

## 6. 未解决问题 / 已知边界（**不做**，留给后续卡）

1. **配置化**：`DEFAULT_TOOL_LOOP_DEADLINE_SECONDS = 600.0` 是**代码常量**，未接 env/DB
   （`PRODUCT_GAP_MAP.md` 提到的"把预算接运行时配置"属另一张卡；本卡范围限定没给 config 文件）。
2. **研究路径未接**：`research_orch._call_agent` 有自己的 5 轮循环（不经 `chat_with_tools_loop`），
   **整轮研究的聚合上界仍然不存在**；且卡明确禁止本卡改 `research_orch.py`（VS-20 在改）。这是本卡**最大的遗留面**。
3. **`docs/API_CONTRACT.md` 未同步**：chat SSE 的 `done` 事件新增字段 `truncated_by_deadline`（附加字段，
   前端忽略未知字段，无破坏性）。按本卡范围限制未改文档 ⇒ **记在此处待编排者处理**（AGENTS.md 的 doc-sync 规则）。
4. **前端未改**：截断提示靠既有 `token` 增量渲染（`frontend/src/pages/Chat.tsx:245` 只要 `data.delta !== undefined`
   就累加，与事件名无关）⇒ 无需改前端；但"专门的截断样式/图标"没做（也不在本卡范围）。
5. **`chat_stream` 不加重试** 与 **超时是否计费** 两个旧问题未触及（前者卡外，后者无口径）。
6. **`with_finish_reason` 仍未被 loop 消费**（VS12 的 F2 遗留）：本卡未顺手做，避免扩大范围。

## 7. 风险

| 风险 | 评估 | 缓解 |
|---|---|---|
| 条件 arity 被误用 | 中（编排者已提出） | §2.2 全量调用点清单；形状由**入参**决定、失败**响亮**（`too many values to unpack`）；docstring 首段即写"设了截止 ⇒ 4 元组"；如需改恒定形状见 §2.1 第 5 点 |
| `test_api.py` 改动未经运行验证 | 中 | 纯机械、`git diff` 全文附证据；`test_memory_rollout.py` 同款替身**已实跑通过**（同构证据）；建议编排者用 `-k chat` 择机复核 |
| 600s 是否合适 | 低 | 常量集中在一处、注释写明依据；未接配置（见 §6.1） |
| 轮内预算耗尽走上抛 LLMError（而非"部分结果"） | 低 | 与 VS-21 语义一致（不吞错误）；chat.py 既有 error 分支照常提示；`:863` 已断言 |
| 文案进入落库内容 | 低 | 刻意为之：用户所见 == 落库内容（避免刷新后提示消失）；`:218` 已断言 |

## 8. 证据

**仓库工作树无变异残留**（`git grep -n -E "MUTATION-A|MUTATION-B|TEMP-REPRO|MUTATED" -- backend`）：空。

**改动集（`git diff --stat`，只列本次涉及的文件；其余 frontend/`PRODUCT_STATE.md` 是**其他卡的并行在途改动**，非本卡）**：

```
 backend/app/routers/chat.py              |  14 ++++-
 backend/app/services/llm_client.py       | 180 ++++++++++++++++++++++++---
 backend/tests/test_api.py                |  28 ++++++---
 backend/tests/test_chat_tools.py         | 110 +++++++++++++++++
 backend/tests/test_llm_client.py         | 402 +++++++++++++++++++++++++++++++++++++++
 backend/tests/test_memory_rollout.py     |  14 ++++-
```

**`test_api.py` 机械适配全文**：见 §1.4 的 diff（新增 `_loop_result` 5 行纯函数 + 3 处签名/返回值）。
**`test_memory_rollout.py` 机械适配全文**：同上。

**关键契约取值（可直接引用）**：
- 正常完成（无截止）：`(content, tool_calls, total_tokens)`。
- 带截止：`(content, tool_calls, total_tokens, status)`，
  `status = {"truncated_by_deadline": bool, "reason": "deadline_exceeded_before_tool_round" | "deadline_exceeded_before_final_answer" | None, "deadline_seconds": float | None, "llm_calls": int, "elapsed_seconds": float}`。
- 默认整轮截止（聊天路由）：`DEFAULT_TOOL_LOOP_DEADLINE_SECONDS = 600.0` ⇒ 整轮最坏 ≈ 900s（改动前 1500s）。
- 事件：截断时额外发 `tool_loop_truncated`（`TOOL_LOOP_EVENTS` 已含）。
- 用户可见文案：`（因超过总时长上限提前结束，以下为已完成部分）`。
