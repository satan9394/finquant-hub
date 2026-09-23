# EVALUATION_RESULT — Vertical Slice 30（补 F1：被截止压低后的预算耗尽也要看得见）

> 评估者：EVALUATOR（独立子 agent，**不采信实现者自述**）。被验提交 `38b8e65`（工作树 `E:\Code_file\Projects\finquant-hub`）。
> 任务卡 `docs/ai/evo/IMPLEMENTATION_BRIEF_VS30.md`；待验断言 `docs/ai/evo/IMPLEMENT_RESULT_VS30.md`。
> 方法：读提交后的真实代码 + 在 `$env:TEMP\vs30_eval\` 的**副本**里自建探针与变异体（仓库目录**全程未被修改/变异**）。

## 判定：**ACCEPT**

无阻塞缺陷。实现者 5 条声称全部**独立复现成立**；判据③"严格小于"经浮点论证 + 实测证明**不会误判**；零文案匹配；反例与接线均有牙齿；VS-27 零回归。仅 2 条非阻塞 NIT（§7）。

---

## 1. 独立复核方式（可复算）

| 项 | 做法 |
|---|---|
| 代码事实 | 直接读 `38b8e65` 提交后的 `llm_client.py` / `research_orch.py`（`git status --porcelain -- backend` 为空 ⇒ 工作树 == 提交，无变异窗口） |
| 复现 | `$env:TEMP\vs30_eval\mut\`（`Copy-Item` 出 `app/`+`tests/`+`pytest.ini`，用仓库同一 `.venv\Scripts\python.exe` 跑），**仓库目录零改动** |
| 变异 | `$env:TEMP\vs30_eval\mutate.py`，只改副本；每步 `restore` 回仓库源 |
| 自建探针 | `mut\tests\test_eval_float_probe.py`（浮点/判据/文案对照）、`mut\tests\test_eval_old_behavior_probe.py`（P1/P2/P2b/P3，用 `VS30_EXPECT=new|old` 同一份探针跑新旧行为） |
| 原始输出 | `$env:TEMP\vs30_eval\eval_baseline2.txt`、`eval_mut_drop2.txt`、`eval_mut_loose2.txt`、`focused_pytest.txt` |

## 2. 实现者 5 条声称的逐条核验

| # | 声称 | 核验结论 | 证据 |
|---|---|---|---|
| 1 | `LLMError` 加两个 keyword-only 字段，仅 `_budget_exhausted_error()` 写入 | **成立** | `llm_client.py:175-184`（`*`、缺省 `False/None`）；`:294-303` 写入 `budget_exhausted=True`、`effective_budget_seconds=effective_budget`（`budget_seconds is None` 时回落客户端预算）；`_post_chat_with_retry` 把生效预算**原值**交给工厂（`:332`、`:355`），无任何改写 |
| 2 | `_is_deadline_budget_exhaustion` 三条结构化条件缺一不可 | **成立** | `research_orch.py:285-297`：①`deadline_at is None → False`；②`getattr(exc,"budget_exhausted",False) is not True → False`；③类型/有限性校验后 `return float(effective) < float(client_budget)` |
| 3 | 命中即置 `truncated=True`（Agent `:565-566`、主编 `:682-683`），出口与 VS-27 同源 | **成立** | 两处写同一个 `truncated`（`:531` 定义）→ `report_data["truncated_by_deadline"]`(`:749`) → `_build_report` 落库（`routers/research.py:286` → `:405` `research_reports.report_data`）+ `done_payload["truncated_by_deadline"]`(`:769`)；回放读同一字段（`Research.tsx:470`），实时读 done（`:616`），渲染在 `:763` |
| 4 | 零文案匹配 + 两个对照 | **成立** | §4 |
| 5 | 反例 4 条全绿、聚焦 141 passed、ruff 全过 | **成立** | §5、§6 |

## 3. 必做 1 —— 判据③"严格小于"是否正确（浮点论证 + 实测）

**结论：正确。不存在"未压低却被判截断"的浮点误判。**

论证（三段，均在代码里可逐行对上）：

1. **未压低时 min() 返回的是操作数原值，不做算术。** `_remaining_call_budget`（`:250-253`）是 `min(float(client_budget), deadline_at - time.monotonic())`。当 `deadline_at - now >= float(client_budget)` 时返回的就是 `float(client_budget)` **这个值本身**（不是它再算过一遍）。
2. **比较的两侧同源同量纲。** 判据③比较 `float(exc.effective_budget_seconds)` 与 `float(client.total_budget_seconds)`；前者由 `_post_chat_with_retry` 把生效预算**原样**交给工厂（`:332`→`:355`→`:294`），后者就是 `_remaining_call_budget` 用的同一个 `client` 对象的同一个属性（`run_research` 里 `client` 只有 `:513` 一个来源）。两边单位都是秒。`float()` 对 float 是**恒等**的，对 int 也精确（`float(180) == 180.0`）⇒ 未压低时 `x < x` 恒为 `False`。
3. **因此用精确 `<` 而非容差是正确的**：容差反而会在"remaining 恰等于客户端预算"处引入不确定方向；精确比较在这里有唯一、可辩护的语义（剩余严格更小 ⇒ 截止才是更紧的约束）。

实测（`$TEMP\vs30_eval\eval_baseline2.txt`，副本 == 提交态）：

```
[nominal-equal] remaining=180.0 cb=180.0 got=180.0 rel_delta=0.0
16 passed
```

自建探针共 3 组断言全绿：
- `test_unsqueezed_returns_client_budget_bit_exact`：**7 种客户端预算**（`180.0 / 180(int) / 0.1+0.2 / 0.3 / 1e9 / 1e-3 / 300.0`）× **5 种余量**（`0, 1e-9, 1e-3, 12.5, 1024`）逐位断言 `repr(got) == repr(float(client_budget))`。
- `test_criterion_is_exactly_strict_less_than_remaining`：固定种子随机网格（5 种预算 × 150 组 `now/deadline`），断言 **判据真值 == (remaining < client_budget)**，且 `got` 逐位等于 `client_budget`（未压低）或 `remaining`（压低）。
- `test_production_error_path_stamps_effective_budget_verbatim`：走**真实** `_post_chat_with_retry` + `httpx.MockTransport`，(a) 不传覆盖值、(b) 传**恰好等于**客户端预算的覆盖值 ⇒ `repr(effective) == "180.0"` 且判据 `False`；(c) 覆盖值 1.0 ⇒ `True`。

**如实说明一个 1ulp 边界（不是缺陷）**：`deadline_at - time.monotonic()` 这个**减法**本身可能把"名义相等"推到客户端预算之下 1ulp。实测在 `budget=1e-3` 时 `4096.001 - 4096.0 == 0.0009999999997635313`（比 1e-3 小 2.4e-16 相对量级）⇒ 判 True。评估意见：①量级 ≤1ulp，物理上是"两条约束同时到期"的**单点**，此时判"被截止砍断"是可辩护的（属于**超前报**而非漏报，方向与 VS-27"宁可让用户看见被砍断"一致）；②不存在"客户端预算明显更紧却误判"的反例——只要 `remaining >= client_budget`，第 1 步保证返回的就是客户端预算原值；③生产量级（180s 预算 / 数百秒截止）下要命中该点需要 elapsed 恰好等于某一位模式，不可达。故**不需要**改成容差比较。

## 4. 必做 2 —— 零文案匹配（grep 证明 + 两个独立对照）

**证明**：`_is_deadline_budget_exhaustion` 函数体（`research_orch.py:285-297`）只出现 `deadline_at is None` / `getattr` / `isinstance` / `math.isfinite` / `float(...) < float(...)`，**没有任何字符串字面量比较**；对 VS30 diff 的新增行做 `in str(|startswith|endswith|== "|find(|match(` 扫描，**唯一命中是一行 docstring**，不在判据里。

**我自建的两个对照**（`test_eval_float_probe.py::test_wording_controls_independent`，副本实跑通过）：

| 对照 | 文案 | 结构化字段 | 实测 |
|---|---|---|---|
| (a) 文案说截断、字段说不是 | "因超过研究总时长上限，预算已用尽，本轮被截止砍断" | 缺省（普通 `LLMError`） | 判据 `False` |
| (b) 文案与截断无关、字段说是 | "上游连接被重置" | `budget_exhausted=True, effective=1.0`（截止已启用） | 判据 `True` |

（另有实现者的**流程级**对照 `test_vs30_criterion_ignores_error_message_wording`，在基线里同样绿。）

## 5. 必做 3 / 6 —— 反例与接线都有牙齿（变异实测，原始输出）

**变异 B：删掉判据③（放松成"预算耗尽即截断"）⇒ `4 failed, 8 passed`**

```
FAILED tests/test_eval_float_probe.py::test_criterion_is_exactly_strict_less_than_remaining - AssertionError: (180.0, 180.0, False, True)
FAILED tests/test_eval_float_probe.py::test_production_error_path_stamps_effective_budget_verbatim - AssertionError: assert True is False
FAILED tests/test_research_deadline_budget_vs30.py::test_vs30_llm_client_budget_exhaustion_carries_structured_fields - AssertionError: assert True is False
FAILED tests/test_research_deadline_budget_vs30.py::test_vs30_client_own_budget_exhaustion_is_not_a_deadline_truncation - 客户端自身预算耗尽不得被误报成截止截断
4 failed, 8 passed in 8.34s
```
⇒ **"不得误报"有牙齿**：判据一退化成"预算耗尽即截断"，**客户端自身预算耗尽**（`remaining == 180.0` 却判 True）立刻变红。

**变异 A：去掉两处 VS30 接线（== 旧行为）⇒ `3 failed, 13 passed`**

```
FAILED tests/test_research_deadline_budget_vs30.py::test_vs30_agent_killed_by_squeezed_budget_sets_visible_signal - assert False is True
FAILED tests/test_research_deadline_budget_vs30.py::test_vs30_lead_killed_by_squeezed_budget_sets_visible_signal - assert False is True
FAILED tests/test_research_deadline_budget_vs30.py::test_vs30_criterion_ignores_error_message_wording - AssertionError: 判据必须读结构化字段
3 failed, 13 passed in 14.94s
```
⇒ **鉴别力成立**（至少一条新用例变红，实际 3 条），且**定向**：4 条反例/零回归用例与 5 条自建探针保持绿。同时这**正面证明**了"改前这两条路径的整轮信号确实是 `False`"（= 任务卡 F1 的现象）。

## 6. 必做 4 —— F1 影响面三点：**独立复核（不采信裁定）**

我不用实现者的探针，而是自建 `test_eval_old_behavior_probe.py`（同一份探针用 `VS30_EXPECT=new|old` 跑新旧两态），在**去接线的副本（旧行为）**上得到：

| 探针 | 构造（全部共享同一假单调时钟，起点 1499.0、截止点 1500.0、客户端预算 180s ⇒ 每次调用拿到被压低的 1s） | 旧行为实测 | 新行为实测 |
|---|---|---|---|
| **P1** 解耦时钟，`business_analyst` 被压低预算打死（客户端替身**不推进**研究时钟） | 其余 3 Agent + 主编**全部 completed** | `truncated=False`（= F1 原复现形状） | `True` |
| **P2** 共享时钟，`business_analyst` 被打死（时钟被推过截止） | 全环节 failed | `True` | `True` |
| **P2b** 隔离主编：victim=`risk_assessor`，时钟推过截止 | 前 3 个 Agent **completed**、`risk_assessor` failed、`report_lead` failed 且 error = "因超过研究总时长上限（1 秒）**未开始分析**，已跳过" | `True`（置位者是**主编的发起前检查** `:695-696`） | `True` |
| **P3** 共享时钟，**主编**被压低预算打死 | 4 个 Agent 全 completed、主编 failed | **`False`**（真实可达的漏报） | `True` |

**三点结论（均独立成立）**：
1. **①成立**：`deadline_seconds=None` 之外的爆炸点必然经 P2b 的路径——主编在全部 Agent 之后**串行**开始，其 `_call_agent` 第一轮就做 `_deadline_reached` 检查（`:377-384`），命中即写 `DEADLINE_REASON_NOT_STARTED` ⇒ `:695-696` 置 `truncated=True`。**关键前提我已单独核验**：`_BUDGET_EPSILON_SECONDS`(`llm_client.py:52`) 与 `_DEADLINE_EPSILON_SECONDS`(`research_orch.py:37`) **都是 1e-6**，且两边都用 `time.monotonic()`（同一时钟）。代数上：`budget - (t - started_at) ≤ 1e-6` 且 `budget = deadline_at - t0`（`t0 ≤ started_at`）⇒ `deadline_at - t <= 1e-6` ⇒ 更晚时刻的 `_deadline_reached` 必为 True。**若两个容差不相等，此结论就会失效**——这是我实际去查的条件，不是转述。
2. **②成立**：F1 的复现形状（其余环节仍 completed、字段 `False`）在共享实时时钟下**不可达**——P2/P2b 直接给出了旧行为的 `True`。P1 证明该形状只能在"客户端替身抛预算耗尽却不推进研究时钟"的**解耦夹具**下出现（实现者自带用例 `BudgetStarvedClient` 正是这种替身，其时钟 `state` 永停在 1499.0）。
3. **③成立**：主编是**最后一个**环节，异常之后没有任何截止检查（`lead_reasons` 为空、`:695` 不触发）；P3 在旧行为下实测 `False`，这就是**生产可达**的那一支。

**⇒ 影响面表述按此更正（与实现者/编排者一致，且为我的独立结论）**：**F1 应表述为"主编被截止压低后的预算打死时整轮不报"，而非"任一 Agent 被打死都不报"。** 实现者"两条都修"的选择正确且不引入第二条真相来源（两处共用同一判据）。

## 7. 必做 5 —— 零回归（可判定）

| 项 | 实测 |
|---|---|
| 聚焦 pytest（副本外的**仓库态**，6 文件） | **141 passed in 31.23s**（与自述一致） |
| VS-27 既有用例单独跑 | **16 passed**（含上界公式、部分结果保留、状态如实、`None` 零回归、非法截止值） |
| `deadline_seconds=None` | `_remaining_call_budget` 仍返回 `None`（`:248-249`）⇒ 不注入 `budget_seconds`（`:224`）⇒ 判据①直接 False；VS-27 的 `None` 用例断言记录到的预算全为 `None`，绿 |
| 其余 `LLMError` 构造点缺省值 | `budget_exhausted=` / `effective_budget_seconds=` 在整个 `backend/app` **只出现在** `llm_client.py` 的类定义与 `:297`（新工厂）⇒ 其余构造点必然缺省 |
| VS-20 契约 | `except LLMError` 分支里 `status=failed` + `error` + `agent_failed` 事件一字未动；`agent_results` 无新增字段 |
| chat（VS-28） | `routers/chat.py` / `chat_with_tools_loop` 未改；`test_chat_tools.py`、`test_model_ux.py` 在 141 里绿 |
| ruff | `All checks passed!`（scope=整个 `backend/`，当次 `git status -- backend` 为空 ⇒ 无他卡在制后端文件混入） |

**NIT（非阻塞）**：`IMPLEMENT_RESULT_VS30.md:8` 写"其余 **10** 处 `LLMError` 保持缺省"——实测 `backend/app` 域内 `LLMError(` 文本命中 10 处，其中含**类定义** `:159` 与**新的** `:297`，真正的"其余构造点"是 **8 处**（`llm_client.py:279/360/379/753`、`models_crud.py:37`、`model_router.py:20/29/41`）。**实质结论正确**（这 8 处确实都不带新字段），仅是计数口径不准。

**NIT（非阻塞）**：本卡未做界面级端到端复跑（我同意不做——VS-29 正在并发改 `frontend/src`，且 `Research.tsx` 在 VS-30 提交时**未被任何卡改动**）。我改用**读码**验证消费链：`Research.tsx:146-148` 的 `resolveTruncatedByDeadline` 读的正是 `data.truncated_by_deadline ?? data.report.truncated_by_deadline`，实时 `done`(`:616`) 与回放 `report.report_data`(`:470`) 两条路径调用同一函数、`:763` 渲染提示条；后端两个出口形状与之一一对应（`done_payload` 顶层 + `report_data` 内部）。

## 8. 环境与卫生（如实记录）

- 未跑全量 pytest、未跑 `tests/test_api.py`；只跑聚焦文件与 TEMP 副本。收尾核对 `Get-CimInstance Win32_Process -Filter "Name='python.exe'"` ⇒ **当前无任何 python 进程**（无 pytest 孤儿，也未触碰他卡的 node/bun）。
- 变异与探针**只在** `$env:TEMP\vs30_eval\`（副本 + 脚本 + 原始输出）；仓库目录**零污染**：`git status --porcelain -- backend` 为空（本次评估**未改任何后端文件**）；工作树里可见的改动全部属于 VS-29/VS-31（`frontend/**`）与他卡结果文件，**未计入本判定**。
- **未 commit**。
- 并发如实记录：本窗口同一工作树有 VS-29/VS-31 在跑。我的后端门禁作用域仅 `backend/`，当次其后端文件集为空（除被验提交本身已入库）；因此后端 pytest/ruff 不存在"把别人在制代码扫进来"的情形。反过来说，并发负载下**一切耗时数字都不是静默基线**（141 passed 用时 31.23s 仅作参考，不作性能结论）。

## 9. 遗留风险（承接实现者 §9，评估者意见）

1. 预算耗尽文案在"被截止压低"场景下仍写着"或调大 total_budget_seconds（当前 180 秒）"——文案与实际压死它的约束（截止剩余）不符。**不构成缺陷**（判据与文案解耦；该句在"客户端自身预算耗尽"时是正确的），但会轻微误导用户。建议另开卡处理（属文案/i18n 面）。
2. 判据③依赖客户端暴露 `total_budget_seconds`；替身/其它客户端缺该属性时保守判 `False`（不误报）。我已独立断言该保守性成立。
3. 1ulp 级的"名义相等"边界（§3 末）——仅需知晓，不需要动作。
