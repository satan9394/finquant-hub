# EVALUATION_RESULT — VS-21 独立验收：重试的"整次调用总时长预算"

> 状态：**ACCEPT**（3 条不阻断 NIT）
> 被验对象：实现提交 `f4240e7`（"VS-21：给重试加整次调用总时长预算"）。评估时 `HEAD` 已前移到 `030260a`（编排者的纯文档提交，未触及代码），故本卡**实现提交 = f4240e7**，**基线 = f4240e7~1 = 744312e**（已核：该版本 llm_client 无任何 `total_budget`/`monotonic` 痕迹）。
> 评估者 EVALUATOR，2026-09-11。**自带夹具**：`%TEMP%\vs21_eval\`（自有假时钟 + 自有 `_http_client` 注入，**未复用**实现者 `budget_clock` fixture），评估结束已整体送回收站。
> 被验文件全程未被触碰：`git diff f4240e7 -- backend/app/services/llm_client.py backend/tests/test_llm_client.py` 为空、`git status --porcelain` 对这两个文件为空。

## 0. 判定

**ACCEPT。** 四条验收标准（预算耗尽即停 / 不超上界 / 等待被截断 / 零回归）与"不能破坏"逐条独立复现通过；实现者自述的关键数字（默认配置下 270s、去掉预算判断回到 420s）在我**自建**的假时钟上逐字复现。两条自陈的取舍（截断等待、非正/NaN/Inf 构造期拒绝）与编排者裁决 (a)(b) 一致，且 (b) 的前提"无调用方依赖该路径返回响应"经复核**成立**。

## 1. 静态核对（逐条，含文件:行）

| # | 项 | 位置 | 结论 |
|---|---|---|---|
| 1 | `_DEFAULT_TOTAL_BUDGET_SECONDS` | `llm_client.py:45` = `180.0` | 存在 ✅ |
| 2 | `_BUDGET_EPSILON_SECONDS` | `:49` = `1e-6` | 存在 ✅ |
| 3 | 构造参数 `total_budget_seconds` | `:149`（默认取常量，插在 `timeout` 与 `context_budget` 之间） | 存在 ✅ |
| 4 | 非正 / NaN / Inf 抛 `ValueError` | `:157-158` `if not math.isfinite(v) or v <= 0: raise ValueError` | ✅ **NaN 被真拦**：`isfinite(nan)=False` ⇒ 短路进 `raise`，不会出现"`remaining <= eps` 恒假、预算形同不存在"的形态。实测 `0 / -1 / -0.5 / nan / inf / -inf` 全部 `ValueError: total_budget_seconds 必须是正有限数（单位：秒）`；`1e-9` 被接受 |
| 5 | docstring 写明可判定上界 | `:243-244` "整次调用墙钟 ≤ 预算 + 单次尝试超时（…默认值下为 ≤ 300 秒）"；另 `:239` 写明容差、`:241` 写明截断、`:242` 写明"不截断进行中的尝试" | ✅ 上界、容差、截断、非打断四项均成文 |
| 6 | `_MAX_ATTEMPTS` / `_RETRYABLE_STATUS` 未变 | `:25-26`；基线探针取值为 `3` 与 `{429,500,502,503,504}`，与当前一致 | ✅ |
| 7 | 非可重试 4xx 立即返回 | `:261-262` 分支逐字未动（2 处删除行中不含它） | ✅ 动态另证（D2） |
| 8 | `Retry-After` 尊重 + 30s 单次上限 | `_retry_after_seconds` `:70-95` 未动；`_RETRY_AFTER_MAX_SECONDS=30.0` 未动 | ✅ 动态另证（E1/E2） |
| 9 | `_retry_delay_seconds` 抖动未变 | `_backoff_seconds` `:98-103`、`_retry_delay_seconds` `:106-112` 未动 | ✅ 动态另证（E3 落界内） |
| 10 | 既有分工（网络类抛 `LLMError` / 次数耗尽状态码类返回最后响应） | `:263-264` 返回响应、`:275-278` 抛 `LLMError` 两支原样保留；仅末条文案加"（尝试次数用尽）" | ✅ 动态另证（C1/C2） |

**改动面**：`git diff --numstat f4240e7~1 f4240e7` = `backend/app/services/llm_client.py` **+59/-2**、`backend/tests/test_llm_client.py` **+232/-0**（测试为纯新增，`^-[^-]` 匹配为空 ⇒ **无既有断言被改弱**）。两处删除行仅为"旧 sleep 行"与"旧次数耗尽文案"。全库 `TEMP-REPRO|MUTATED|XXX-TEMP` 扫描为空（未落入变异窗口；`llm_client.py`/`test_llm_client.py` 与 `f4240e7` 逐字一致 ⇒ 非在途变异态）。

## 2. 动态验证（独立夹具：自有假时钟 + 自有 transport 注入）

夹具 `harness.py`：patch 模块级 `llm_client.time`（仅 `monotonic`，模块内唯一用途）与 `llm_client.asyncio`（仅 `sleep`），`_http_client` 由子类注入假 transport；假时钟由"每次尝试耗时"+"每次 sleep"共同推进，于是 `elapsed` 即假墙钟。**零真实等待**。三个变体：`cur`=被验文件、`base`=`f4240e7~1` 原始文件、`nobudget2`=被验文件**仅**删掉预算执法（保留参数/常量）。
（另建 `eps0` 变体：把常量改成 `0.0`，用于第 3 节。）

| 场景（自有编号） | 配置 | **被验实现** | 基线 `f4240e7~1` | 移除预算执法副本 | 结论 |
|---|---|---|---|---|---|
| **A1 上界**（状态码 429 + `Retry-After: 3600`，每次尝试跑满 timeout） | 预算 180 / timeout 120 | attempts=**2**、墙钟=**270.0s**、sleeps=`[30.0]`、`≤ 预算+timeout=300` ✅ | attempts=3、墙钟=**420.0s**、sleeps=`[30.0,30.0]` ❌ | attempts=3、墙钟=**420.0s**、sleeps=`[30.0,30.0]` ❌ | ✅ 上界成立；**420s 形态确实被消掉** |
| **A2 上界**（网络异常，回落抖动退避） | 预算 180 / timeout 120 | attempts=2、墙钟=**240.39s** ✅ | attempts=3、墙钟=361.68s | 同基线 | ✅ |
| **A3 极小预算**（429+`Retry-After: 3600`） | 预算 0.3 / timeout 120 | attempts=**1**、墙钟=120.0（**首次尝试未被缩短**） | attempts=3、墙钟=420.0 | attempts=3、420.0 | ✅ 首次尝试永远执行 |
| **B1 截断**（`Retry-After: 30`，剩余仅 5s） | 预算 125 / timeout 120 | sleeps=**`[5.0]`**（不是 30）、墙钟=245.0 = 上界 | sleeps=`[30,30]`、420.0 | 同基线 | ✅ 等待被截断到剩余预算 |
| **B2 截断同源**（无 `Retry-After`，走抖动退避） | 预算 120.2 / timeout 120 | sleeps=**`[0.2]`**（退避 0.375~0.625 被截断） | sleeps=`[0.62,1.16]` | 同基线 | ✅ 两条等待来源同源截断 |
| **B3 浮点边界** | 预算 0.3 / timeout 0.3 | attempts=**1**（即停） | attempts=3、墙钟 60.9 | attempts=3、60.9；**`eps0` 变体 attempts=2、sleeps=`[4.5e-14]`** | 见第 3 节 |
| **C1 次数耗尽（网络类）** | 预算 180 / timeout 0 | attempts=**3**、`网络错误或超时，已用尽 3 次尝试（尝试次数用尽）：…` | 同文案（无括号） | 同基线 | ✅ 出口未变，文案可辨 |
| **C2 次数耗尽（状态码类）** | 预算 10000 / timeout 0 | attempts=3、返回最后响应 ⇒ `API 返回 503：。请检查供应商服务状态后重试。` | 同 | 同 | ✅ "返回最后响应"仅保留在此出口 |
| **C3 预算耗尽（状态码类）** | 预算 180 / timeout 120 | attempts=2、抛 `LLM 调用总时长预算已用尽（180 秒）：已发起 2 次尝试仍未成功，停止重试。最后一次尝试返回 HTTP 429。…` | `API 返回 429：…`（420s） | 同基线 | ✅ 两类耗尽**互斥可辨**（C1 无"总时长预算"，C3 无"尝试次数用尽"） |
| **D1 首次即成功** | 预算 0.5 / timeout 120 | 返回真实结果 `("hi", None)`、attempts=1 | 同 | 同 | ✅ 不被"没预算了"误判为失败 |
| **D2 非可重试 401** | 预算 0.5 / timeout 120 | attempts=**1**、`API 返回 401：。请检查 API Key 是否正确、有效。` | 同 | 同 | ✅ 立即返回语义未被预算削弱 |
| **D3 网络异常 + 极小预算** | 预算 0.5 / timeout 120 | attempts=1、预算文案、**`__cause__=ConnectError` 保留** | attempts=3、网络文案 | attempts=3 | ✅ 真因不丢 |
| **E1 `Retry-After: 99999`（预算充裕）** | 预算 10000 | attempts=3、sleeps=`[30,30]`、`API 返回 503` | 同 | 同 | ✅ 30s 单次上限未削弱 |
| **E2 `Retry-After: 5`** | 预算 10000 | sleeps=`[5.0,5.0]` | 同 | 同 | ✅ |
| **E3 抖动退避落界** | 预算 10000 | sleeps=`[0.380, 0.804]` ⊆ `[0.375,0.625]×[0.75,1.25]` | `[0.553,0.862]` 同界内 | 同 | ✅ 抖动逻辑未动 |
| **E4 充裕预算下第三次尝试成功** | 预算 10000 | attempts=3、返回 `("hi",None)` | 同 | 同 | ✅ 零回归 |
| **单次 timeout 语义** | `timeout=77` | `httpx.AsyncClient(timeout=77.0, …)` 原样传入 | 同 | 同 | ✅ 未被预算改动（循环内无 `wait_for`/取消） |

**上界实测数字（必答）**：默认配置（180/120）+ 上游极大 `Retry-After` 的最坏形态，被验实现 **270.0s / 2 次尝试 / sleeps=[30.0]**，严格 `≤ 预算+单次超时 = 300s`；同一场景在基线与"移除预算执法"副本上均为 **420.0s / 3 次尝试 / sleeps=[30.0, 30.0]**，与 `3×120+2×30` 逐字吻合。

## 3. "1 微秒浮点容差"的评价：**合理工程处理，不是掩盖边界错误**

事实链（全部我自己复现，未采信自述）：

1. 独立探针：`repr(1000.3-1000.0) = 0.2999999999999545`，故 `remaining = 0.3 - (1000.3-1000.0) = **+4.546363285840016e-14**`——残差为**正**，属实。
2. 我自建的 `eps0` 副本（常量改 `0.0`，其余不动）在 B3 场景下：attempts=**2**、sleeps=`[4.5e-14]`、墙钟 0.6；被验实现 attempts=**1**、墙钟 0.3。
3. 方向判定：朴素谓词 `remaining <= 0` 会把"**应停**"判成"**继续**"——一个 `4.5e-14` 的浮点残差被当成"还有预算"，于是先睡一觉再**完整发起一次尝试**（真实世界最多再花一个 `timeout`）。容差修正的正是这个方向，**而不是**把"应继续"判成"停"。
4. 容差唯一的"副作用"是把 `remaining ∈ (0, 1µs]` 判成"停"。该区间相对 180s 预算不可观测（要让用户实际损失，得恰好落在百万分之一秒内），且语义上"不足 1µs"与"已用尽"无法区分——判成停是正确的。
5. 容差**收紧**而非放松上界：停止点变为 `预算 − 1µs`，最后一次尝试的起点严格早于预算 ⇒ `预算 + 单次超时` 的上界比无容差时更干净（无容差时那次多余尝试的起点是 `预算 + 4.5e-14`，上界会被微超）。
6. 文档一致性：容差在 `:49` 常量注释与 `:239` docstring 中均写明"含 `_BUDGET_EPSILON_SECONDS` 浮点容差"，实现与文档同源。

**结论**：这是对"浮点减法在相等点留下 ±1e-13 残差"的正常工程处理，不是用容差去掩盖真正的边界翻转；即便没有它，上界公式也仍成立，只是会退化成"多睡 1e-14 秒再多打一次上游"的荒谬形态。实现者自陈"由测试反推"与我的独立复现一致。

## 4. 裁决 (b) 前提复核：**"无调用方依赖该路径返回响应"成立**

`_post_chat_with_retry` 的全部调用方只有 3 处，**无一保留响应**：

- `chat` `:298-300`、`chat_with_tools` `:328-330`、`chat_with_tools_safe` `:378-380` —— 三处**同构**：`resp = await self._post_chat_with_retry(...)` 后立刻 `if resp.status_code != 200: raise self._response_error(resp.status_code, resp.text)`。
- 即"返回非 200 响应"这条路径在调用方**唯一的下场就是被立即翻译成 `LLMError`**。预算耗尽改为直接抛 `LLMError`，对调用方是**同类型异常、同一条传播路径**，可观测差异只在文案与 `__cause__`（我的 C2 vs C3 实测：`API 返回 429…` vs `总时长预算已用尽…`，两者都是 `LLMError`）。
- 全库 `except LLMError` 的 5 处（`routers/chat.py:218`、`services/discussion_orch.py:162`、`services/research_orch.py:306/339/417`、`services/swarm_orch.py:190`）**一律只做 `str(e)` 透传**，没有任何按状态码/前缀分流的分支；`_response_error` 也只在被调用方用于构造 `LLMError`。
- 既有回归证明：`test_chat_retry_exhausted_5xx_reports_last_status`（`tests/test_llm_client.py:58-73`，预算充裕 ⇒ 走次数耗尽出口）仍绿，48 passed 中包含它。

⇒ 裁决 (b) 的前提成立，**预算路径即使最后一次是 429/5xx 也抛 `LLMError`，不构成行为回归**。

## 5. 绕过路径排查（是否存在"机制声明了但没接线"）

- `_post_chat_with_retry` 是**唯一**带重试循环的 LLM 出口（`for attempt in range(1, _MAX_ATTEMPTS + 1)` `:251`），也是唯一"3×timeout+2×wait"形态的来源 ⇒ 该形态已消除。
- `chat_stream` `:533`：单次流式请求，**原本就不重试**，`httpx` 超时仍取 `self.timeout` ⇒ 有界（单次尝试）。卡内明确不在范围。
- `list_models` `:280`：单次 GET，走 `_http_client()`（`timeout=self.timeout`）⇒ 有界，且无重试。
- 未新增任何 `httpx` 调用点（本卡只多一个 `import time`；全库 `httpx.AsyncClient(` 的调用点与基线一致）。
- 未发现编排层对单次 `chat*` 的二次重试放大（`services/` 内除 `news_search.py` 的 2 次重试与 `research_jobs.py` 的**作业级**重试外，无 LLM 重试环）。**作业级重试属于裁决 (c) 的"整轮无聚合上界"，不计入本卡判定。**

## 6. NIT（不阻断，建议记入 LATER）

1. **预算耗尽路径丢失上游响应体**：`_budget_exhausted_error` `:221` 只带 `response.status_code`，而次数耗尽出口经 `_response_error` `:212` 会带 `body[:300]`。后果：同一类 429，次数耗尽时用户能看到上游正文（如"insufficient balance"），预算耗尽时只剩状态码 ⇒ 可能把"账户没钱"误读成"预算设小了"。建议 `detail` 追加 `response.text[:300]`（沿用 `_response_error` 的 api_key 脱敏）。
2. **上界公式的前提**："单次尝试 ≤ `timeout`"依赖 httpx `timeout=` 的**逐 I/O 操作**语义；滴流式上游（每个 `read` 间隔都 < 120s）理论上可让单次尝试超过 120s，届时 `预算+单次超时` 不再是硬上界。这是卡里给定的公式与 httpx 既有语义，**非本卡引入**；建议在待开的 deadline 卡里一并处理（如显式 `httpx.Timeout(connect/read/write/pool)` 或总时长 `wait_for`）。
3. **构造签名中段插入**：`total_budget_seconds` 插在 `timeout` 与 `context_budget` 之间。仓内所有调用点均为"≤3 个位置参数 + 关键字"（`services/model_router.py:42`、`routers/models_crud.py:38`、`tests/*` 全量核对）⇒ 无破坏；但仓外/脚本若按 4 个位置参数调用会被静默错位。建议以后追加到末尾或改 keyword-only。
4. **预算 < 1µs 会被接受但等效于"永不重试"**（`1e-9` 实测被接受；此时 `remaining <= ε` 恒真）。与"拒绝 0"的口径略有缝隙，语义上仍保证"首次尝试一定执行"，影响可忽略。

## 7. 未计入判定的在途项（按指令）

- 工作树另有 **VS-20 在途**的 `research_orch.py` / `routers/research.py` / `Research.tsx` / i18n：**未读取为判定依据、未触碰**。
- 裁决 (a)：截断等待 + 0/负/NaN/Inf 构造期 `ValueError` 两者并存 —— 已核实**两条都真实落地**（B1/B2 与静态 #4），非"声明未接线"。
- 裁决 (c)：默认 180s 只覆盖**单次调用**，`chat_with_tools_loop` 每轮独立起算、整轮研究仍无聚合上界，且预算未接 env/DB —— **属实**（`chat_with_tools_loop` `:447-531` 每轮调用 `chat_with_tools_safe` 各自起算；`model_router.get_client` `:42-49` 未传该参数），**按指令不据此判 REJECT**，仅在 NIT #2 里建议与新卡合并处理。

## 8. 门禁与卫生

| 检查 | 原始结果 |
|---|---|
| `cd backend; $env:no_proxy='localhost,127.0.0.1,::1'; .venv\Scripts\python.exe -m pytest tests/test_llm_client.py -q --no-cov -p no:cacheprovider` | `48 passed in 0.27s` ✅ |
| 同目录 `.venv\Scripts\python.exe -m ruff check .` | `All checks passed!` ✅ |
| 追加跨文件回归（`test_llm_client + test_model_ux + test_chat_tools + test_llm_reasoning + test_context`） | `74 passed in 2.30s` ✅ |
| 遗留进程核对 | 仅剩与本次无关的常驻 `python -m http.server 3001`（**未动**），无孤儿 pytest ✅ |
| 被验文件是否被本评估改动 | `git diff f4240e7 -- <两文件>` 与 `git status --porcelain -- <两文件>` 均为空 ✅ |
| 夹具卫生 | `%TEMP%\vs21_eval\`（harness/mk_mutant/fmt + base/cur/eps0/nobudget/nobudget2 副本 + 4 份 JSON）整体 `SendToRecycleBin` ✅ |
