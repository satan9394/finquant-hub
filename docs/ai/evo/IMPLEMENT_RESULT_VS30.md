# IMPLEMENT_RESULT — Vertical Slice 30：让"被截止砍断"在**预算耗尽**这条路径上也不漏报（F1）

> 实现者：IMPLEMENTER（子 agent）。工作目录 `E:\Code_file\Projects\finquant-hub`。**我本人未执行任何 commit**。
> 任务卡：`docs/ai/evo/IMPLEMENTATION_BRIEF_VS30.md`。
> 前端**未改动**（`git status` 里 `frontend/**` 的改动属于 VS-29 / VS-31，与本卡无关，也不计入我的门禁结论）。

## 0. 结论速览

- **判据怎么设计的**：`LLMError` 新增**两个结构化字段**（`llm_client.py:159-184`）——`budget_exhausted: bool`（本条错误是否出自 VS21"总时长预算耗尽"分支）与 `effective_budget_seconds: float | None`（当时**实际生效**的单次预算）。`research_orch` 侧新增 `_is_deadline_budget_exhaustion(exc, client, deadline_at)`（`:262-297`），**三条结构化条件缺一不可**：①本轮截止确实启用；②`exc.budget_exhausted is True`；③`exc.effective_budget_seconds` **严格小于** `client.total_budget_seconds`（说明当时生效的预算就是被 `min(客户端预算, 截止剩余)` 压低后的值 ⇒ 压死这次调用的约束是截止）。**没有任何错误文案匹配**。
- **该路径是否真置了信号**：是。Agent（`:555-567`）与主编（`:673-684`）两条 `except LLMError` 分支都在命中判据时置 `truncated = True`，最终写进 `report_data["truncated_by_deadline"]` 与 `done["truncated_by_deadline"]`（VS-27 的既有落库/消费链一字未动）。改前为红的用例见 §6。
- **普通 LLMError 是否确实不被误标**：不被。反例用例 4 条（§4）：普通失败（`budget_exhausted=False`/无字段）False；预算耗尽但**未启用截止** False；预算耗尽但**截止不是约束**（生效预算 == 客户端预算）False；未截断运行 False。**变异证明**：把判据③去掉（只留"预算耗尽"）⇒ 恰好这两条"不得误报"用例变红（§6）。
- **VS-27 是否零回归**：是。`test_research_deadline_vs27.py` 16 条全绿；`deadline_seconds=None` 时 `_remaining_call_budget` 仍返回 `None`、不注入 `budget_seconds`，判据①即 False ⇒ **逐项与改动前一致**。聚焦门禁 **141 passed**、`ruff check .` **All checks passed**。
- **一个必须如实说明的发现（不改变本卡的修复）**：在**真实单调时钟**下，"某次调用把被截止压低的预算耗光"这件事**本身就意味着整轮已经越过截止**（两者是同一个时钟），于是**旧的**"轮间检查"路径会在主编那一步把 `truncated` 置为 `True`（我用副本探针实测，见 §3.3）。因此：①评估者 F1 的复现形状（其余 3 个 Agent 与主编仍成功、字段 False）需要"客户端替身在不推进研究时钟的情况下抛出预算耗尽"这类**解耦夹具**，在真实时钟下不可复现；②**真正生产可达的漏报是"主编本身被压低预算打死"**——它是最后一个环节，之后没有任何检查，旧代码下整轮字段停在 `False`。本卡两条都修：Agent 支满足卡的"两条路径同源"要求并消除潜在回归，主编支是可直接观测的那一条。

---

## 1. 判据设计及理由

### 1.1 结构化信号放哪：生产者写在 `LLMError` 上，消费者在编排层判定

```python
class LLMError(Exception):
    def __init__(self, message, *, budget_exhausted: bool = False,
                 effective_budget_seconds: float | None = None): ...   # llm_client.py:159-184
```

- **只由生产代码写入**：`_budget_exhausted_error()`（`llm_client.py:281-303`）在构造预算耗尽错误时带上 `budget_exhausted=True, effective_budget_seconds=effective_budget`。其余所有 `LLMError(...)`（上游 4xx、网络重试耗尽、模型未配置…）拿到的是缺省值 `False/None` ⇒ "普通失败"有唯一的、结构化的缺省形态。
- **keyword-only + 有缺省** ⇒ 既有的 10 处 `LLMError("…")` 构造与所有 `except LLMError` 调用方**零改动、零回归**（`pytest tests/test_llm_client.py` 全绿）。
- 为什么不在 `LLMError` 上直接写"是不是被截止砍断"：`llm_client` **不知道**调用方为什么把预算压到这个值（它只看到一个数）。"是不是截止造成的"这件事只有编排层知道（`_remaining_call_budget` 是它的函数）。所以客户端只报"事实"（是不是预算耗尽、生效预算多少），编排层做**判定**。这也避免了把研究侧的语义下沉到通用 LLM 客户端。

### 1.2 判定函数（`research_orch.py:262-297`）

```python
if deadline_at is None:                                   # ①
    return False
if getattr(exc, "budget_exhausted", False) is not True:    # ②
    return False
effective = getattr(exc, "effective_budget_seconds", None)
client_budget = getattr(client, "total_budget_seconds", None)
... 类型/有限性校验（bool 不算数、NaN/Inf 不算数）...
return float(effective) < float(client_budget)             # ③
```

- **① 必须真的启用了截止**：`deadline_seconds=None` 时 `_remaining_call_budget` 返回 `None`、压根不注入 `budget_seconds` ⇒ 这条路径不可能存在。把它写成显式条件，是为了让"未启用截止"这一零回归场景**结构上不可能**被判截断（实测用例 §4 第 2 条）。
- **② 只有"预算耗尽"才算**：普通失败（上游 401/429 不可重试、网络重试三次用尽、模型配置缺失）没有这个标记。
- **③ 生效预算必须严格小于客户端预算**：`_remaining_call_budget = min(client.total_budget_seconds, 截止剩余)` 是 `min()` 的结果，
  - 若取到"截止剩余" ⇒ 必然**严格小于**客户端预算 ⇒ 压死这次调用的约束是截止 ⇒ 判截断；
  - 若取到客户端预算（截止剩余充足 / 未启用截止）⇒ 两者**相等** ⇒ 客户端自己的预算耗尽，与截止无关 ⇒ 判**不**截断。
  因为 `min()` 返回的必然是其中一个操作数的**原值**，这里用精确 `<` 而非容差比较即可，不存在"浮点上差一点"的歧义。（用容差反而会在"剩余恰等于客户端预算"的边界上引入不确定性。）
- **不用文案**：`message` 里无论如何都**不参与判定**。§5 的用例专门把两者做成互相矛盾（文案喊"被截止砍断"但字段说不是 ⇒ 不判；文案只有"上游连接被重置"但字段说是 ⇒ 判），证明判据与文案完全解耦。

### 1.3 为什么两条 `except LLMError` 都要改（同源）

VS-27 让单次预算 = `min(客户端预算, 截止剩余)` ⇒ 当"截止剩余 < 客户端预算"时，`llm_client` 的预算耗尽会**先于** `_deadline_reached` 的轮间检查触发。异常只走 `except LLMError`，与"轮间检查发现截止已过"**不是同一处代码**——这正是本仓"同一件事的两条路径必须同源"那条纪律针对的形态。两条分支（Agent `:555-567`、主编 `:673-684`）都置同一个 `truncated` 变量，最终只有一个出口（`report_data["truncated_by_deadline"]`）。

### 1.4 刻意**没有**做的事（以及理由）

| 没做 | 理由 |
|---|---|
| 不改 `agent_results[key]` 的形态（不加 `degraded_reasons`，不改 `error` 文案） | VS-20 契约保持原样：该环节仍是 `status=failed` + 真实错误文本。**实测前端对 `failed` 状态根本不读 `degraded_reasons`**（`Research.tsx:252-254` 在 `status==='failed'` 时直接 `buildOutcome('failed', false, summarizeReason(error))`），加了也是**无消费方的死字段**；而把 `error` 换成统一"总时长上限"文案会**掩盖真实原因**（真实错误里带着上游状态码与响应片段），与"不得遮蔽真实失败原因"冲突。 |
| 不改错误文案（不去掉"或调大 total_budget_seconds"那句） | 该文案在**客户端自身**预算耗尽时是正确建议；仅在**截止压低**时略显误导。而它文案与判据无关（§1.2）。改它会波及 chat 侧（VS-28 成果，本卡不动 chat）。**登记为风险**（§9）。 |
| 不改 `_remaining_call_budget` / 上界公式 | VS-27 的行为逐项保留。 |
| 不改前端 | `resolveTruncatedByDeadline` 已在读该字段，且实时/回放两条路径共用（§3.4 实测）。 |

---

## 2. 改动清单（文件:行）

### `backend/app/services/llm_client.py`（+32 / -2）

| 行 | 内容 |
|---|---|
| 159–184 | `LLMError.__init__` 新增 **keyword-only** 结构化字段 `budget_exhausted=False` / `effective_budget_seconds=None`，docstring 写明"失败种类必须结构化可读、不得靠文案"。既有单位置参数构造**逐字兼容** |
| 281–303 | `_budget_exhausted_error()` 在构造错误时带上 `budget_exhausted=True`（:301）与 `effective_budget_seconds=effective_budget`（:302，`None` 覆盖时即 `self.total_budget_seconds`），docstring 注明 VS30 口径 |

### `backend/app/services/research_orch.py`（+54 / -0）

| 行 | 内容 |
|---|---|
| 262–297 | 新增 `_is_deadline_budget_exhaustion(exc, client, deadline_at)`：三条结构化判据（§1.2），docstring 写明"为什么这条路径存在""为什么三条缺一不可""为什么用严格小于""为什么不用文案" |
| 478–488 | `run_research` docstring 增补 VS30 段：**两条触发路径同源同类**，判据结构化 |
| 555–567 | Agent 的 `except LLMError`：命中判据 ⇒ `truncated = True`（原有 G-03 降级行为、`agent_failed` 事件、`status=failed` + `error` **一字未动**） |
| 673–684 | 主编的 `except LLMError`：同样命中判据 ⇒ `truncated = True`（`lead_error` 留存真实原因、不补发 `agent_completed` 等 VS-20/VS-27 约束**一字未动**） |

> 出口未改：`report_data["truncated_by_deadline"] = truncated`（`:749`，VS-27 原样）与 `done_payload["truncated_by_deadline"]`（`:769`，VS-27 原样）⇒ 落库/实时/回放三处仍同源。

### 新增测试

- `backend/tests/test_research_deadline_budget_vs30.py`（7 条，全部假时钟、零真实等待）

### 未改动

`frontend/**`、`routers/**`、`scheduler`、`database`、schema：**零改动**。无新依赖。

---

## 3. 验收 #1：该路径真置信号，且用户会出现提示

前端读取点（未改动，`frontend/src/pages/Research.tsx:145-149`）：

```ts
resolveTruncatedByDeadline(data) = (data?.truncated_by_deadline ?? data?.report?.truncated_by_deadline) === true
```
实时 `done`（:616）与回放 `report_data`（:470）调**同一个**函数，`:763` 只在它为 `true` 时渲染提示条（文案 `deep.report.truncatedByDeadline`）。测试里用 `frontend_shows_truncation_banner()` **逐字镜像**该函数并断言两种形状都为真，而不是只断言"字段存在"。

### 3.1 Agent 支（评估者 F1 的复现形状）

`test_vs30_agent_killed_by_squeezed_budget_sets_visible_signal`：假时钟 1499、`deadline_seconds=1`（截止点 1500）⇒ 每次调用拿到被压低的 **1s** 预算（客户端预算 180s）；`business_analyst` 抛**由生产工厂 `_budget_exhausted_error` 产出**的预算耗尽错误，其余 3 个 Agent 与主编**全部 completed**。

```
✓ 每次调用记录到的 budget_seconds == {1.0}（证明"截止剩余 < 客户端预算"这条路径真的走到了）
✓ business_analyst.status == "failed"，error 含"总时长预算已用尽"（VS-20 契约不变）
✓ 其余 4 个环节全部 completed；agent_results 里**不含任何** deadline_exceeded 原因
  ⇒ 旧的"轮间检查"路径一次都没触发，信号只可能来自 VS30 的新判据
✓ done["truncated_by_deadline"] is True / done["report"]["truncated_by_deadline"] is True
✓ JSON 往返（落库形态）后仍为 True；quality == "degraded"
✓ 前端镜像读取函数在【实时形状 done】与【回放形状 {report: report_data}】上都为 True ⇒ 横幅出现
```

### 3.2 主编支（生产时钟下必然可达的那一支）

`test_vs30_lead_killed_by_squeezed_budget_sets_visible_signal`：真实 `LLMClient` + `httpx.MockTransport`，**`research_orch` 与 `llm_client` 共用同一个假时钟**（生产里两者都是 `time.monotonic`）。4 个 Agent 在 1499 各发一次调用并成功；主编拿到被压低的 1s 预算，该次尝试耗时 5s ⇒ 预算耗尽。

```
✓ 4 个 Agent 全部 completed；假时钟最终 = 1504.0 = 截止点 1500 + 4（这次尝试 5s > 被压低的 1s）
✓ report_lead.status == "failed"，error 含"总时长预算已用尽"
✓ done["truncated_by_deadline"] is True / report 内同样 True / quality degraded
✓ 前端镜像读取函数两种形状都为 True ⇒ 横幅出现
```

### 3.3 一个必须如实说明的边界：Agent 支在**共享时钟**下会被主编路径掩盖（实测）

我在 `$env:TEMP` 的**副本**（去掉 VS30 接线 = 旧行为）里跑了探针 `probe_shared_clock.py`：共享假时钟、截止 1s、**每一次调用**都耗 5s 并把时钟推过截止。旧代码的输出（原文）：

```
final fake clock: 1504.0 (deadline_at = 1500.0)
truncated_by_deadline: True
  business_analyst: status=failed reasons=None error='LLM 调用总时长预算已用尽（本次 1 秒）…'
  financial_analyst: status=failed reasons=None error='因超过研究总时长上限（1 秒）未开始分析，已跳过'
  industry_researcher: status=failed reasons=None error='因超过研究总时长上限（1 秒）未开始分析，已跳过'
  risk_assessor: status=failed reasons=None error='因超过研究总时长上限（1 秒）未开始分析，已跳过'
  report_lead: status=failed reasons=None error='因超过研究总时长上限（1 秒）未开始分析，已跳过'
```

结论（推理 + 上面这条实测的一致性）：**耗尽"被截止压低的预算"与"越过截止点"在同一个单调时钟下是同一件事**（客户端测的是同一次调用的 elapsed，`elapsed ≥ remaining` ⇒ `now ≥ deadline_at`）。所以：
- 若被打死的是**某个 Agent**，其余环节（尤其必然在最后的主编）下一次"发起前检查"就会看到截止已过，**旧代码也会把整轮字段置 True** ⇒ 整轮字段上的漏报**不可达**；评估者 F1 的复现（其余环节仍成功、字段 False）用的是"客户端替身不推进研究时钟"的解耦夹具。
- 若被打死的是**主编**，它后面没有任何检查 ⇒ **旧代码整轮字段停在 False**（§3.2 的用例在改前正是红，见 §6）⇒ 这是**真实可达**的漏报。

**因此我没有把"评估者的复现不可达"当成"不必修"**：①主编支是真实缺陷，本卡修掉了；②Agent 支与它同属"同一件事的两条路径"，卡面明确要求同源，修掉它也消除了以后一旦调整环节顺序/主编处理就会复现的隐患；③两次修复共用**同一个**结构化判据，不增加第二条真相来源。

### 3.4 前端消费方：**未改动**，但既有的界面用例实测仍绿

```
frontend> bun x vitest run tests/ResearchDeadlineSignal.test.tsx
 ✓ tests/ResearchDeadlineSignal.test.tsx (5 tests) 15317ms
     ✓ 回放：落库 report_data.truncated_by_deadline=true ⇒ 屏上出现"提前结束"提示
     ✓ 回放：历史报告没有该字段 ⇒ 不得误报截断
     ✓ 实时：SSE done 携带 truncated_by_deadline=true ⇒ 同一条提示同样出现
 Test Files  1 passed (1)      Tests  5 passed (5)
```

即：**后端本次写入的字段与形状**（`done.truncated_by_deadline` / `report_data.truncated_by_deadline`）**正是**该用例已经渲染出用户可见中文横幅的那两个形状。前端**无需改动**，故我一行也没动（工作树里 `frontend/**` 的改动属于 VS-29/VS-31）。

> **时序如实记录**：本次跑该前端用例**第一次**（`bun run test tests/ResearchDeadlineSignal.test.tsx`）以 **退出码 255 且无任何测试输出**结束。同窗口内 VS-31 通报它清理自己孤儿进程时误杀了两个 vitest 运行、其中一个文件名被截断为 `ResearchDeadlineSi…`（即本文件）。**我无法证明那次异常就是它造成的**（也不能证明无关），故**以重跑为准**：随后两次 `bun x vitest run tests/ResearchDeadlineSignal.test.tsx` 均为 **5 passed / 退出码 0**（第二次输出已留档）。该次异常没有被我用作任何结论。

---

## 4. 验收 #2 / #3：不误报 + 未截断仍不出现提示

| 用例 | 构造 | 断言（实测全绿） |
|---|---|---|
| `test_vs30_llm_client_budget_exhaustion_carries_structured_fields` | 真实 `LLMClient` 三种失败 | (a) 被压低到 1s 的预算耗尽 ⇒ `budget_exhausted is True`、`effective_budget_seconds == 1.0`、判据 True；`deadline_at=None` ⇒ False；(b) 客户端**自身**预算耗尽 ⇒ `effective == 180.0` ⇒ 判据 **False**；(c) 上游 401 ⇒ `budget_exhausted is False`、`effective is None` ⇒ **False** |
| `test_vs30_client_own_budget_exhaustion_is_not_a_deadline_truncation` | 截止 10000s（启用但**不是**约束）、客户端预算 180s，5 个环节全部"总时长预算已用尽" | `truncated_by_deadline is False`（+ report 内 False、前端镜像 False）；并断言**确实发生了预算耗尽失败**（否则用例空转）；假墙钟远未到截止 |
| `test_vs30_no_deadline_budget_exhaustion_is_not_a_deadline_truncation` | `deadline_seconds=None` + 全部环节预算耗尽 | `truncated_by_deadline is False` + 前端镜像 False |
| `test_vs30_generous_deadline_run_shows_no_banner` | 截止 10000s、正常运行 | 5 个 `agent_completed`、`quality=audited`、字段 False、前端镜像 False |

**普通 `LLMError` 不被误标的直接反例**（同一条判据的两个方向都被钉住）：

- 既有用例 `test_agent_llm_error_is_non_fatal_degraded` / `test_agent_llm_error_is_structurally_recorded_as_failed` / `test_lead_failure_is_structurally_recorded_as_failed`（`test_research_orch.py`，用**不带结构化字段的** `LLMError("上游模型暂不可用")` 走 monkeypatch 的 `_call_agent`）在本次门禁里**全绿**——判据用 `getattr(..., False)` 读，这类历史/替身错误形态一律 False。
- 另有 §5 的"文案与字段相矛盾"两个对照。

---

## 5. 判据是结构化的（与错误文案无关）——`test_vs30_criterion_ignores_error_message_wording`

| 对照 | 错误文案 | 结构化字段 | 期望/实测 |
|---|---|---|---|
| (a) | "因超过研究总时长上限，预算已用尽，本轮被截止砍断（这是文案，不是判据）" | `budget_exhausted=False`（普通 `LLMError`） | `truncated_by_deadline is False`（文案不得成为判据）+ 前端镜像 False |
| (b) | "上游连接被重置"（**不含"预算/截止"任何字样**） | `budget_exhausted=True`、`effective_budget_seconds=1.0` | `truncated_by_deadline is True`（判据必须读结构化字段）+ 前端镜像 True |

两个对照都在"截止剩余 1s < 客户端预算 180s、每次调用确实被压到 1s"的同一前提下运行（用例断言记录到的 `budget_seconds == {1.0}`），排除了"因为没走那条路径所以判 False"的空转解释。

---

## 6. 验收 #5：鉴别力证明（**副本**变异，仓库**全程未进入变异态**）

**窗口声明**：变异**只发生在 `$env:TEMP\vs30_mut\` 的副本**（`Copy-Item` 出的 `app/` + `tests/` + `pytest.ini`），改动脚本 `mutate.py` 与所有输出都在 `$env:TEMP\vs30_evidence\`；**仓库目录从未被变异**（`git status` 全程只有我这两个后端源文件被修改 + 一个新测试文件 + 本文件；`grep -n -E 'TEMP-REPRO|TEMP_REPRO|MUTATED|XXX-TEMP'` 对 `backend/app`、`backend/tests`、`frontend/src` 扫描**零命中**）。副本已回收进回收站。

### 变异 A：去掉 VS30 判据的**接线**（删掉两处 `if _is_deadline_budget_exhaustion(...): truncated = True`）

基线（同一副本、未变异）：`7 passed in 8.42s`

```
FF....F                                                                                    [100%]
FAILED test_vs30_agent_killed_by_squeezed_budget_sets_visible_signal - assert False is True
FAILED test_vs30_lead_killed_by_squeezed_budget_sets_visible_signal - assert False is True
FAILED test_vs30_criterion_ignores_error_message_wording - AssertionError: 判据必须读结构化字段
3 failed, 4 passed in 9.65s
```

⇒ **至少一条新用例变红**：实际 3 条变红（Agent 支、主编支、文案对照 (b)），而 4 条反例/零回归用例保持绿 ⇒ 变异是**定向的**，不是"全红"。同时这也**正面证明**了"改前这两条路径的整轮信号确实是 `False`"（= 任务卡 F1 的现象）。

### 变异 B：把判据放松成"只要预算耗尽就算截断"（删掉条件③）

```
..FF...                                                                                    [100%]
FAILED test_vs30_llm_client_budget_exhaustion_carries_structured_fields
       - assert True is False   （客户端自身预算耗尽被误判为截止截断）
FAILED test_vs30_client_own_budget_exhaustion_is_not_a_deadline_truncation
       - AssertionError: 客户端自身预算耗尽不得被误报成截止截断
2 failed, 5 passed in 8.70s
```

⇒ **"不得误报"的那两条用例有牙齿**：一旦判据退化成"预算耗尽即截断"，它们立刻变红（注意 `deadline_seconds=None` 那条仍绿，因为条件①独立兜住了"未启用截止"）。

---

## 7. 门禁原始输出（聚焦；输出全部留在 `$env:TEMP\vs30_evidence\`，**未写进仓库**）

命令（`backend` 目录，前置 `$env:no_proxy='localhost,127.0.0.1,::1'`；`-o addopts="" -p no:cacheprovider` 以免把 `htmlcov/`、`.pytest_cache/` 写进仓库）：

```
> python -m pytest tests/test_research_deadline_vs27.py tests/test_research_deadline_budget_vs30.py
                   tests/test_research_orch.py tests/test_llm_client.py tests/test_chat_tools.py tests/test_model_ux.py
                   -q -o addopts="" -p no:cacheprovider --no-header -rf
.............................................................................................................................  [100%]
141 passed in 30.28s
```

```
> python -m ruff check .
All checks passed!
```

（**没有**跑全量 pytest、**没有**跑 `tests/test_api.py`——按环境铁律。）

**并发如实记录**：本窗口内同一工作树另有 VS-29（`frontend/src`，8 个在制文件）与 VS-31（前端测试卫生，含 `bun run build` / vitest）在跑。我的门禁**全部限定在后端**：pytest 只跑上面 6 个聚焦文件；`ruff check .` 的作用域是整个 `backend/`，而该目录下**当次只有我这两个文件处于已修改状态**（`git status` 证据），因此不存在"把别人的在制代码扫进来"的情形。反过来说，若当时另有后端卡在变异窗口，我**既不能证明也不能排除**它会影响我的 ruff 结论；我只能给出"当次 `git status` 里后端只有我的两个文件被改"这一事实。

---

## 8. 零回归证据（VS-27 行为逐项保留）

| 项 | 实测 |
|---|---|
| VS-27 既有用例 | `tests/test_research_deadline_vs27.py` 16 条**全绿**（含上界公式、部分结果保留、状态如实、`None` 零回归、非法截止值） |
| `deadline_seconds=None` | 判据①直接 False（未启用截止）；`_remaining_call_budget` 仍返回 `None`、不再注入 `budget_seconds`（VS-27 用例仍断言记录到的预算全是 `None`）⇒ **逐项与改动前一致** |
| 上界公式 | 未触碰 `_remaining_call_budget` / `_deadline_reached` / 轮循环 / 收尾调用 ⇒ `整轮墙钟 ≤ deadline_seconds + client.timeout` 不变 |
| VS-20 结构化状态契约 | `except LLMError` 分支里 `status=failed` + `error` + `agent_failed` 事件的**原样保留**；未新增/删除任何 `agent_results[key]` 字段 |
| 普通 LLMError | 缺省字段 ⇒ 判据 False（既有 3 条 LLMError 用例全绿） |
| `LLMError` 构造兼容性 | 新增参数是 keyword-only 带缺省 ⇒ 仓库内 10 处 `LLMError("…")` 单参构造零改动 |
| chat 侧（VS-28） | `routers/chat.py`、`chat_with_tools_loop` **未改**；`tests/test_chat_tools.py`、`tests/test_model_ux.py` 全绿 |
| 是否新增依赖 / 改 schema / 删文件 | 均无 |

---

## 9. 未解决问题 / 风险

1. **【已在 §3.3 如实说明】"Agent 支的整轮字段漏报"在真实时钟下不可达**（会被必然执行的主编轮间检查掩盖）。我仍然修了它（卡面要求两条路径同源），但**任何据此断言"生产上必然出现横幅缺失"的说法都应以上面的实测为准**：可观测的那一支是**主编**。若编排者认为"F1 的实际影响面被高估"，请按此裁定，而不是按"卡面复现形状"来理解影响面。
2. **错误文案在"截止压低"场景下略具误导性**：预算耗尽文案的末尾写着"或调大 total_budget_seconds（当前 180 秒）"，而此时真正压死它的约束是**截止剩余**。我没有改文案（理由见 §1.4：同一文案在"客户端自身预算耗尽"时是对的，且改它波及 chat）。**若要改，建议的形态是**：在编排层把"本次生效预算 = 截止剩余"这一事实追加进 `agent_results[key].error` 的**尾部**（保留原始错误正文），并同步前端文案——但那属于另一个卡（涉及文案与 i18n）。
3. **判据③依赖客户端暴露 `total_budget_seconds`**：测试替身/其它客户端若无该属性 ⇒ 判 False（保守，不误报）。生产侧 `model_router.get_client` 一律返回 `LLMClient`（含该属性），与 VS-27 评估说明 F4 的口径一致。
4. **多 Agent 并发下，同一轮可能有多个环节命中判据**：结果是同一个 `truncated=True`，幂等，无副作用。
5. **前端可见性未由我自己做界面级断言**（VS-29 正在并发改 `frontend/src`，且卡面说前端无需改动）：我的证据是"字段/形状 + 前端读取函数逐字镜像 + 既有界面用例（同一形状）实测 5 passed"。这是一个**间接但完整**的链条，但严格来说不是"我这一版端到端跑一次界面"。如实记录，供评估者裁定是否需要补一次界面级复跑。

---

## 10. 环境与卫生

- 未跑全量 pytest、未跑 `tests/test_api.py`；只跑了 6 个聚焦后端文件 + 1 个聚焦前端文件。
- 变异副本 `$env:TEMP\vs30_mut`（已回收进回收站）、变异脚本与全部原始输出在 `$env:TEMP\vs30_evidence\`；**仓库目录零污染**（`git status` 复核：仅 `backend/app/services/llm_client.py`、`backend/app/services/research_orch.py` 两个已修改文件 + 新增 `backend/tests/test_research_deadline_budget_vs30.py` 与本文档）。
- `research_orch.py` 的工作区行尾是 **LF**，与 **HEAD blob 一致**（`git cat-file blob HEAD:…` 实测 `CRLF=0 / bareLF=731`；工作区 `CRLF=0 / bareLF=785`，只多出我新增的行）⇒ 不是本次改动引入的，`git diff` 只显示新增的 54 行；索引侧两个文件都是 `i/lf`，提交不受影响。
- 收尾核对 `Get-CimInstance Win32_Process -Filter "Name='python.exe'"` ⇒ **无任何 python 进程**（无 pytest 孤儿）。同机 `node.exe`/`bun.exe` 属**其它卡与其它项目**（VS-29/VS-31/DSH 等），我**未触碰**。
- **未 commit**（按要求）。

### 证据索引

| 证据 | 位置 |
|---|---|
| 新用例（首轮，含一次夹具自纠） | `%TEMP%\vs30_evidence\new_tests_1.txt`、`new_tests_2.txt`（7 passed） |
| 聚焦 pytest（最终，141 passed） | `%TEMP%\vs30_evidence\focused_pytest_final.txt` |
| ruff | `%TEMP%\vs30_evidence\ruff.txt`（All checks passed!） |
| 变异基线（同一副本） | `%TEMP%\vs30_evidence\mut_baseline.txt`（7 passed） |
| 变异 A：去掉接线 ⇒ 3 红 | `%TEMP%\vs30_evidence\mut_drop_criterion.txt` |
| 变异 B：放松判据 ⇒ 2 红 | `%TEMP%\vs30_evidence\mut_loose_criterion.txt` |
| 共享时钟旧行为探针 | `%TEMP%\vs30_evidence\probe_old_shared_clock.txt`（+ `probe_shared_clock.py`） |
| 前端消费方用例（重跑，5 passed） | `%TEMP%\vs30_evidence\frontend_consumer_rerun.txt` |
| 前端消费方用例（首次被外部中断的那次） | `%TEMP%\vs30_evidence\frontend_consumer.txt` |
| 变异脚本 | `%TEMP%\vs30_evidence\mutate.py` |
