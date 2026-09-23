# EVALUATION RESULT — Vertical Slice 23：整轮工具对话的聚合等待上界（deadline）

> 独立验收者：EVALUATOR（独立会话）。被验提交：`abb2a7f`（验收期间编排者另提交 `62acc50` 仅同步 `docs/API_CONTRACT.md`；
> `git diff --stat abb2a7f HEAD -- <被验 6 个源码/测试文件>` 为空 ⇒ 被验代码未变）。
> 判定：**ACCEPT**（无 REJECT 级问题；4 条 NIT + 1 条已声明的范围外遗留）。

---

## 1. 静态核对（逐条）

| 必做项 | 结论 | 证据 |
|---|---|---|
| `deadline_seconds` 是 `chat_with_tools_loop` **末尾 keyword-only、默认 None** | ✅ | `llm_client.py:479-480` `*,` + `deadline_seconds: float | None = None`（在 `post_tool_hook` 之后，无位置参数被插中段） |
| `DEFAULT_TOOL_LOOP_DEADLINE_SECONDS == 600.0` | ✅ | `llm_client.py:62`（`600.0` 字面量，含取 600 的三条依据注释） |
| `tool_loop_truncated` 加入 `TOOL_LOOP_EVENTS` | ✅ | `llm_client.py:132-135`（**追加**，既有 5 个枚举名未删；唯一消费方 `tests/test_chat_tools.py:107` 用 `all(... in ...)` 判定，追加安全） |
| `_redact` 与 `_response_error` **同源** | ✅ | `_redact`（`:222-224`）唯一实现；`_response_error:249` 与 `_response_snippet:239` 都调用它。`_budget_exhausted_error:265` 走 `_response_snippet` ⇒ 同源 |
| VS-21 语义未被改动 | ✅ | `_MAX_ATTEMPTS`/`_RETRYABLE_STATUS`/`_RETRY_AFTER_MAX_SECONDS`/抖动/`total_budget_seconds` 均未出现在 `git diff` 的任何 hunk 中；预算比较由 `self.total_budget_seconds` 改为 `budget = 覆盖值 or self.total_budget_seconds`（`None` 时逐值等价）。动态复核见 §3.6 |
| `chat_with_tools_loop` 轮数语义不变 | ✅ | 仍 `for _round in range(max_rounds)`（`:579`）；越界后仍追加督促消息 + 收尾调用（`:666-675`） |
| 卡外文件是否**纯机械适配** | ✅ | 新增行含 `assert` **0** 条、`def test_` **0** 条；**删除行 9 条**中同样含 `assert`/`def test_` **0** 条 ⇒ 删的只是旧替身签名/返回行。改动面 = 1 个 5 行纯函数 `_loop_result`（按同一契约补第 4 项）+ 4 处替身签名与返回 |
| 鉴别力：既有测试是否被改 | ✅ | `test_llm_client.py`（402/0）、`test_chat_tools.py`（110/0）**零删除行**；`test_llm_client.py` 只有单个 hunk `@@ -707,0 +708,402 @@` ⇒ 既有 707 行一字未动。动态：`-k "not vs23"` ⇒ **48 passed, 19 deselected**（= 声称的基线 48） |
| 工作树残留变异标记 | ✅ | `git grep -E "MUTATION-A\|MUTATION-B\|TEMP-REPRO\|MUTATED" -- backend` 为空 |

### 1.1「条件 arity」重点质疑（按指令**不据此判 REJECT**）

- **4 条既有绿色断言确实存在且确实会被迫改动**：`test_llm_client.py:174` `content, calls, tokens = await ...`、
  `:199` 同形、`test_chat_tools.py:90` `text, calls, tokens = await ...`、`:149` `text, calls, _ = await ...`——
  全部是定长 3 元解包，改成恒定 4 元组必 `ValueError`。**属实**（逐行读过原文）。
- **调用点是否枚举齐全：是**。全仓 `chat_with_tools_loop` 命中 = 1 处生产（`routers/chat.py:189`，解 4 元组）、
  4 处真实实现调用（`test_llm_client.py:174/:199`、`test_chat_tools.py:90/:149`，均不传截止 ⇒ 3 元组）、
  4 处替身（`test_api.py:46/:265/:303`、`test_memory_rollout.py:148`，均已加 keyword-only 形参并按同一规则应答）。
  无 `getattr` 动态调用、无子类覆盖（`def chat_with_tools_loop` 只在 `llm_client.py:470` 与测试替身里出现）。
  漏一处会 `ValueError: too many values to unpack`（响亮失败），**无静默路径**。

---

## 2. 动态验收：**Evaluator 自造夹具**（未复用实现者用例）

夹具（均在 `$env:TEMP`，跑完送回收站）：
`%TEMP%\vs23_eval\eval_vs23.py`（30 条断言，含真实 HTTP 服务的端到端路径）、
`%TEMP%\vs23_eval\eval_vs23_chat.py`（12 条断言，真实 `chat.send_message` SSE 生成器 + 临时库）。

门禁（本机实跑）：

```
cd backend; $env:no_proxy='localhost,127.0.0.1,::1'
.venv\Scripts\python.exe -m pytest tests/test_llm_client.py tests/test_chat_tools.py -q --no-cov -p no:cacheprovider
........................................................................  [100%]
72 passed in 1.36s
.venv\Scripts\python.exe -m ruff check .
All checks passed!
```

自造夹具汇总：**`eval_vs23.py` FAIL 数 0 / 30 条断言；`eval_vs23_chat.py` FAIL 数 0 / 12 条断言。**

---

## 3. 三条指定结论 + 关键实测

### 3.1 「None 默认是否真零回归」 ⇒ **是，逐项零回归**

- 同一替身下跑两遍：静态时钟 vs **每次读时钟跳 1e9 秒**的时钟 ⇒ `(content, tool_calls, tokens)`、每轮
  `budget_seconds`（`[None, None, None]`）、调用次数（3）**逐项相同**。
- `None` ⇒ 返回 **3 元组**，第 3 项是 token 数（int），无状态项；`_deadline_reached()` 恒 `False`、
  `_remaining_round_budget()` 恒 `None`（不读时钟）⇒ **无任何时间判断**。
- 唯一新增的无条件读取是入口处 `loop_started_at = time.monotonic()`（`llm_client.py:536`）：它不参与任何分支，
  跳变时钟下结果不变 —— 是"无害的一次读数"，不构成行为差异。
- `max_rounds` 语义未变（2 轮工具 + 1 次收尾 = 3 次调用）；既有 48 条实跑全绿（§1 表）。

### 3.2 「截断是显式的」 ⇒ **是，三通道同源、不可静默**

- 返回 4 元组，`status = {'truncated_by_deadline': True, 'reason': 'deadline_exceeded_before_tool_round',
  'deadline_seconds': 50.0, 'llm_calls': 1, 'elapsed_seconds': 60.0}`；第 2 轮**未发起**（`llm_calls=1`）；
  已完成的工具调用记录被保留；第 1 项 = 最后一段可用文本。
- 事件流：`['tool_started', 'tool_completed', 'tool_loop_truncated']` —— 截断事件确实发出。
- 路由侧（真实 `chat.send_message`）：SSE `token.delta` == `"（因超过总时长上限提前结束，以下为已完成部分）\n\n已完成的部分正文"`，
  **落库内容与之逐字相同**（用户所见 == 落库）；`done.truncated_by_deadline == True`；无 `error` 事件。
  正文为空时仍发提示并落库（`full = notice`）。
- 反例：未截断时正文原样、落库一致、`done` 标记 `False`、整条 SSE 不含"提前结束"字样、事件序列恰为 `token, done`。

### 3.3 「上界」 ⇒ **成立，且比卡的上界更紧**

对抗形态（每次调用都吃满"生效预算 + 单次尝试超时"，假时钟）：

| 场景 | 设定 | 实测整轮墙钟 | 卡的上界 `deadline+300` | 更紧上界 `deadline+timeout` |
|---|---|---|---|---|
| P5a | deadline=600，单次预算=180，timeout=120，轮次预算 `[180, 180]` | **600.0s** | 900 ✅ | 720 ✅ |
| P5b | deadline=250，轮次预算 `[180, **50**]`（剩余被压低） | **370.0s** | 550 ✅ | **370 ✅（取等，上界是紧的）** |

并断言"没有任何一次调用是在截止之后才发起的"（`starts` 全部 `≤ deadline`）——这正是"只在轮间检查"的结构性证明。
（实现者报告里的 720.0 是另一种对抗排布；我的两组独立实测同样满足其上界公式，两者不矛盾。）

### 3.4 「成功后恰越截止是否误报截断」 ⇒ **不误报，标记为完成**

一次成功调用耗时 1000s（deadline=50）后返回最终回答 ⇒ `truncated_by_deadline=False`、`reason=None`、
内容为完整回答、事件只有 `tool_loop_done`（**无** `tool_loop_truncated`）。完成就是完成。

### 3.5 截止在首轮之前就已过 ⇒ **零 LLM 调用**

- 形态 A（进入循环后第一次读时钟即越界）：`llm_calls=0`、`truncated_by_deadline=True`、
  `reason=deadline_exceeded_before_tool_round`、零调用。
- 形态 B（正数但 ≤ 浮点容差，`1e-9`，卡里可达的形态）：同样零调用 + 显式截断。
- `0 / -1 / NaN / +Inf / -Inf` ⇒ `ValueError`（与 `total_budget_seconds` 同口径）。

### 3.6 NIT① 正反例 +「本次 X 秒」是**生效值**（真实 HTTP 路径，本地 429 服务 + 假时钟驱动重试）

- **正例**（client 预算 180，整轮截止 2s ⇒ 单轮预算被压低为 2）：
  `LLM 调用总时长预算已用尽（本次 2 秒）：已发起 2 次尝试仍未成功，停止重试。最后一次尝试返回 HTTP 429。
  上游响应片段：{"error": {"message": "insufficient_quota key=[已隐藏] AAA…"}…`
  ⇒ ①含脱敏后的上游 body 片段（`insufficient_quota`）；②`api_key` **不出现**且已替为 `[已隐藏]`；
  ③`本次 2 秒` 是**生效值**、`当前 180 秒` 才是客户端预算值（两个数字同时出现，无法误归因）；
  ④该轮等待被截到 `2s`（无 30s 等待）；⑤body 片段被截到 300 字（我埋的 `TAIL_SENTINEL` 未出现）。
- **反例**（`budget_seconds=None` ⇒ 回落客户端预算 1s）：`本次 1 秒 / 当前 1 秒`，仍不泄露密钥 ⇒ VS-21 路径未被破坏。

### 3.7 VS-21 其他不变式的动态复核（真实 HTTP）

- `Retry-After: 999` ⇒ 实际等待 `[30.0, 30.0]`（**尊重 Retry-After 且 30s 上限生效**，2 次重试 = `_MAX_ATTEMPTS` 不变）；
  尝试次数用尽后 `_post_chat_with_retry` **返回**最后一次 429 响应，由调用方 `_response_error` 报"API 返回 429…"，**非**预算文案。
- 非可重试 4xx（400）⇒ 零等待、立即返回 400（1 次尝试）。
- 截止生效但上游一路 429 ⇒ 轮内 `LLMError` **照原样上抛**（不伪装成"截断完成"），路由既有 `except LLMError` 分支照常收尾。

---

## 4. 重点质疑逐条回应

1. **条件 arity**：理由的两条前提均**属实**（4 条断言存在且会被迫改；调用点枚举齐全）。按指令**不据此判 REJECT**。
2. **是否存在绕过截止的路径**：
   - 轮内工具执行循环 `for tc in tool_calls`（`llm_client.py:610-659`）**不看剩余预算**；单次 LLM 调用只受"生效预算 +
     单次尝试超时"约束（该约束本身成立，§3.3）。
   - 后果：`deadline + 单次调用上界` 这条上界**以"最后一轮的工具执行耗时相对 LLM 调用可忽略"为前提**——工具是本地
     `ToolRegistry`（部分工具会走行情/新闻网络 I/O），故极端情况下真实墙钟可超出 `deadline + timeout`，超出量 = 最后一轮
     的工具执行总耗时 + 该轮 LLM 调用耗时。**卡只要求"已过截止 ⇒ 不再发起新的 LLM 调用"，实现满足该要求**；
     上界公式的这条前提未在 docstring 里写明 ⇒ 记 **NIT-1**（建议在 docstring 补一句"工具执行时间不在此上界内"）。
   - 未发现其他绕过路径（`_deadline_reached()` 在**每轮开始前**与**收尾请求前**各查一次，且收尾那次在追加督促消息**之前**）。
3. **`research_orch._call_agent` 仍无整轮上界** ⇒ **声明属实**：`research_orch.py:260` `for _round in range(5)`，
   走的是 `chat_with_tools_safe`（`:199`，非 `chat_with_tools_loop`），全文件**无** `deadline` 引用；
   该文件不在本提交改动集内。**范围外遗留，不据此判 REJECT。**

---

## 5. NIT 清单（均不阻断验收）

- **NIT-1**：`deadline + 单次调用上界` 的可判定上界隐含"轮内工具执行耗时≈0"。建议 docstring 明示该前提，
  或后续考虑在轮内工具循环前后也查一次截止（只影响上界的严格性，不影响"不发起新 LLM 调用"这条卡要求）。
- **NIT-2**：`tool_loop_truncated` 事件在循环层确实发出，但 `routers/chat.py:176-187` 的 `_event_sink` **只转发
  `tool_completed` ⇒ `tool_call`**，故 SSE 事件流里**看不到** `tool_loop_truncated`（实测事件序列仅 `token, done`）。
  卡要求的是"正文与 done 载荷同步反映"，**已满足**；此条只是可观测性缺口（前端无法据事件名做专属样式）。
  实现者报告 §0 的表述（"受控事件 tool_loop_truncated + 聊天 SSE 正文提示与 done 标记"）容易读成"SSE 里有该事件"，
  建议澄清。**注意**：`docs/API_CONTRACT.md` 已如实写明"内部 tool_started/tool_failed 不外发"，与此条一致。
- **NIT-3**：`tests/test_api.py` 的改动**未经运行验证**（按卡约束未运行；编排者实测 `-k chat` 5 分钟无输出，确认约束）。
  我**没有尝试运行**它。静态复核：3 个替身均在末位接受 keyword-only `deadline_seconds`，并统一经 `_loop_result`
  按"非 None ⇒ 4 元组"应答，与 `routers/chat.py:189` 的 4 元解包同源；同构的 `test_memory_rollout.py` 替身已实跑通过
  （实现者报告 `5 passed`）。风险低，但状态仍是"未经运行验证"。
- **NIT-4**：`IMPLEMENT_RESULT_VS23.md` §6.3 称"`docs/API_CONTRACT.md` 未同步…待编排者处理"——**已过期**：
  编排者在 `62acc50` 已同步（`docs/API_CONTRACT.md:22/:25`），我逐字比对 `routers/chat.py:181-186/:218-226` 确认文档所述
  （6 字段 `done` 载荷、正文前置提示、用户所见==落库、恰在成功后越界按完成、整轮截止压低当轮单次预算）**与实现一致**。
  文档侧 doc-sync 缺口已闭合，无需再动。

---

## 6. 未验证 / 未做（如实记录）

- `tests/test_api.py` **未运行**（遵守卡与 `AGENTS.md` 约束，也避免触发挂起）。其改动按"纯机械适配"接受。
- 未跑全量 pytest（环境约束）；只跑卡里指定的两个文件 + ruff，另加 `-k "not vs23"` 的 48 条既有用例回归。
- 未触碰、未计入 VS-22 在途的前端文件（`Chat.tsx`/`Discussion.tsx`/`Dashboard.tsx`/`ResearchRuns.tsx`/
  `LoadFailureAlert.tsx`/i18n/前端测试）——本提交的改动集不含任何前端文件。
- 收尾核对：`Get-CimInstance Win32_Process -Filter "Name='python.exe'"` 只剩常驻 `python -m http.server 3001`
  （**未误杀**），无遗留 `-m pytest` 孤儿进程。

---

## 7. 判定

**ACCEPT。** 卡的四条核心可判定标准（默认零回归 / 截止生效且显式 / 上界成立 / NIT① 脱敏不泄露）均经**独立夹具动态验证**
成立；既有 48 条用例零改零回归；卡外两处测试文件确为纯机械适配；无静默截断路径；无 REJECT 级缺陷。
建议编排者按 NIT-1（docstring 补前提）与 NIT-2（事件可观测性/表述澄清）择机跟进，二者均不阻断本卡。
