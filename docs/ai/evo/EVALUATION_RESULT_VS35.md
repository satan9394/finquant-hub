# VS-35 独立验收报告（EVALUATOR）

- **被验提交**：`92b1b35`（VS-35，9 文件，`+704/-37`）
- **对照基线**：`92b1b35^` = **`92055e0`**（⚠️ 卡面写的 `a03ac75` 不是 `92b1b35^`；`a03ac75` 是更早的一次路线图更正的提交，`92055e0` 才是 VS-34 的入库提交。本报告一律用显式 sha，不用 `HEAD~1` 这类相对锚点。）
- **判定**：**ACCEPT**
- **方法**：所有结论均来自本次独立复跑/自建探针/自建变异体；实现者自述只当待验断言。

---

## 0. 环境与并发窗口（如实记录）

- 收尾时段另一张卡的评估者（VS-34）确实在 `C:\Users\Satanchen\AppData\Local\Temp\vs34-eval\frontend\`（TEMP 副本）里跑 vitest，**未使用真实 `frontend` 树**。
- 本卡前端门禁**全部在 TEMP 副本** `%TEMP%\eval_vs35\fe\` 中运行，`node_modules` 以 **junction** 指回真实目录（跑完核对真实 `frontend\node_modules` 仍有 **208** 个目录，完好）。
- 本窗口内**没有任何变异发生在仓库工作树**：收尾 `git status --porcelain` 无输出，且对 `swarm_orch.py` / `state.ts` 扫 `MUTANT|TEMP-REPRO|TEMP_REPRO|XXX-TEMP` 无命中。全部变异体在 `%TEMP%\eval_vs35\mut*` 副本内。
- **负载噪声（如实）**：我最初在副本里跑的**全量** vitest 在 22 分钟内只推进到部分测试文件（进程内核 CPU 累计仅 3.36s），我按"精确匹配自己命令行"（`eval_vs35\fe\node_modules\vitest\vitest.mjs`）把它终止，改跑**聚焦 7 个测试文件**；聚焦跑同一份未变异代码 **48 passed / 107.22s，其中 import 阶段 81.84s**。⇒ 本机这个窗口极慢，**耗时数字不可当作基线**，但**结论（passed/failed）可用**。
  - 我**未能**证明 VS-34 那次运行的进程消失与我的终止操作无关（我的匹配是正向匹配自己的路径，未使用排除法）。**我只给事实，不替它选归属**：VS-34 应以自己的重跑结果为准。
- 未跑全量 pytest、未跑 `tests/test_api.py`；聚焦 pytest 前置 `$env:no_proxy='localhost,127.0.0.1,::1'`。

---

## 1. ⚠️ 三点现状独立复核（我自己读 `92055e0` 版源码）

**① 成立。** `git show 92055e0:backend/app/services/swarm_orch.py`：

```
272     ordered_results = {
276         if agent.key in runtime.results          ← 只有"跑成了"的 Agent 才有条目
281         "status": "completed" if len(ordered_results) == len(team.agents) else "partial",
282         "agent_results": ordered_results,
283         "failed_agents": failed_agents,
285         "token_count": sum(result["token_count"] for result in ordered_results.values()),
```

逐 Agent 条目在旧 `243-249`（`return {role_key,name,avatar,content,tool_log,token_count}`）——**没有** `status`/`error`/`degraded_reasons`；失败/被跳过的 Agent 在 `agent_results` 里**根本没有条目**，事实只落在顶层两个 key 列表。与我自建探针在变异体上的观测一致（见 §6：读到 `'unknown'`）。

**② 成立。** `git show 92055e0:frontend/src/features/swarm/state.ts` 的 `done` 分支：

```ts
if (result) {
  return [key, { ...agent, status: 'completed' as const, ... }];   ← 对"存在条目"硬编码 completed
}
```
另经 grep 独立确认：`frontend/**`（含 `src` 与 `tests`）对 `failed_agents` / `skipped_agents` **零引用**（`No matches found`）；后端 `backend/app` 里这两个 key 只在 `swarm_orch.py:107-108 / 141-142`（放进报告字典）与 `:370-371`（产出）出现，**没有任何按它做判定的读取方** ⇒ 它当时是"只写不读"的第二载体。回放读取器 `Research.tsx:32` 的 `AGENT_KEYS = [business_analyst, financial_analyst, industry_researcher, risk_assessor, report_lead]` 确为 research 专用。

**③ "按字面不成立"这一如实说明——恰当，且我独立复核为真。**
我在旧文件里扫 `分析失败|失败】|【|sentinel|哨兵`，只命中两处**非哨兵**：`:150` 的 `sections.append(f"【{result['name']}】…")`（报告分节标题）与 `:180` 的 `【基本面事实…】`（上下文头）。**旧 swarm 侧确实从无"文案哨兵"**。所以：

- 卡面"swarm 逐 Agent 条目未走结构化契约"这一**目标**为真；
- 但卡面把它描述成"文案哨兵问题"**与事实不符**；实现者没有为了迎合卡面去**编造**一个不存在的哨兵，而是如实说明"按字面不成立"，同时指出真正存在的是**结构化重复载体**（缺条目 + 两个 key 列表），并把它消除。**这是恰当的**：判据是"事实是否准确"，不是"是否与卡面措辞一致"。

---

## 2. ⚠️ 形状是否真对齐（自建读取器 + 真实 done payload）

**自建探针**（`%TEMP%\eval_vs35\probe.py`，**不复用**实现者的任何测试助手）：只把 `_call_agent` / `model_router.get_client` / `_load_fundamentals` / `native_memory_provider.search` 换成替身，跑**真实**的 `swarm_orch.run_four_masters` 与 `research_orch.run_research`，取真实 `done` payload，再用**我方读取器** `status = entry.get('status')`（缺条目/缺字段 ⇒ `'unknown'`）逐 key 断言。

```
=== A. swarm 全成功：逐 key 结构化可读 + 核心字段齐备 ===
  OK   每个 Agent 都有条目 ['macro_strategist','report_lead','risk_manager','tech_analyst','value_investor']
  OK   value_investor: reader=completed   ... （5 个 key 逐个 OK，条目字段 = avatar,content,name,role_key,status,token_count,tool_log）
  OK   swarm 对每个 Agent 都传了 degraded_reasons（非 None）      ← 改动前此处为"没传 ⇒ 原因整段丢弃"
=== B. swarm 降级：同因同解 ===
  OK   tech_analyst -> degraded ；原因码 tool_failed 结构化留存；干净 Agent 不伪造原因码
=== C. swarm 失败+跳过：失败/被跳过者现在也有条目 ===
  OK   失败/被跳过的 Agent 也有条目
  OK   value_investor -> failed ；失败原文进入结构化 error ；content 为空、无文本哨兵
  OK   risk_manager -> skipped ；跳过原因非空
  OK   run 级 status 与旧口径逐项等价（旧=partial）；entries 的 failed/skipped 集合 == 顶层两个 key 列表
  OK   token_count 等价 14/14
=== D. research 同读者可读 + 同因同解 ===
  OK   research 每个 key 都读得到词表内状态；条目核心字段齐备
  OK   financial_analyst -> degraded ；degraded_reasons == ['tool_failed']（与 swarm 同因同码）
=== E. 失败 Agent 在 research 侧同样有条目（形状对等）===
  OK   research risk_assessor -> failed ；核心字段齐备
FAILS = 0
```

**结论**：形状**真对齐**——同一段读取代码在两侧都读得到、同因同解；**"失败/被跳过的 Agent 现在也有条目"这一本卡最关键的行为变化，我用自己的探针独立复现为真**（`value_investor -> failed`、`risk_manager -> skipped`，均含 `name/content/tool_log/status`，失败条目 `content == ""` 且无 `【分析失败】` 文本哨兵）。

**一处需说明的探针自纠**：首轮我自己的两处断言写错（把 `"value boom"` 当成 `f"{key} boom"` 的子串；以及把 research 的 `report_lead` 也当成"应为 completed"，实测为 `degraded`——那是 `research_orch` 既有的主编降级语义，且该文件本卡一行未改）。改正后 **FAILS=0**；两处均为我方探针缺陷，**不是实现缺陷**。

**残留观察（不构成缺陷）**：`done` payload 里顶层 `failed_agents`/`skipped_agents` **仍然保留**（向后兼容）。它们与条目**由同一个事件分支派生**，我探针实测两者集合相等；前端对其零引用。⇒ 属于"冗余但同源"，不是第二处真相来源。

---

## 3. ⚠️ 裁决前提的机器核对（`git diff 92055e0 92b1b35 -- backend/tests/test_swarm_orch.py` 逐行）

3 处 `fake_call_agent` 的改动**逐字**如下（每处**只有一行 `+`**，无任何 `-`，上下文全部不变）：

```
@@ -85,6 +85,7 @@  test_four_masters_runs_roots_in_parallel_then_feeds_risk
         prior_context="",
+        degraded_reasons=None,
     ):
@@ -140,6 +141,7 @@  test_root_failure_skips_dependent_risk_agent
         prior_context="",
+        degraded_reasons=None,
     ):
@@ -167,6 +169,7 @@  test_earnings_review_runs_yaml_discussion_dag
     async def fake_call_agent(
         client, role, ticker, company_name, registry, *, user_id=None, allowed_tools=None, prior_context="",
+        degraded_reasons=None,
     ):
```

上述三个 hunk 之外，该文件的其余 `+` 全部属于**新增的 3 条 VS-35 用例**（`+161` 行，位于文件末尾）。⇒ **断言一字未动，纯新增参数。编排者的裁决前提成立，裁决有效。**
（另注：第 3 处 `fake_call_agent` 是**单行签名**形式，新增参数后超过 120 字符；`ruff check .` 仍全过——因 `backend/pyproject.toml` 的 `ignore` 含 `E501`，与行长无关。实测无告警。）

---

## 4. ⚠️ 反向检查：是否新增第二处真相来源

- `frontend/src/features/degradedReasons.ts`（新增，35 行）导出 `DEGRADED_REASON_KEYS` / `reasonCodes` / `describeDegradedReasons`。
- grep `DEGRADED_REASON_KEYS` 全 `frontend/src`：**只在该文件内定义与使用**；`Research.tsx` 的私有常量已在 diff 中**整段删除**（`-const DEGRADED_REASON_KEYS …`、`-function asReasonCodes …`），改为 `import { describeDegradedReasons, reasonCodes as asReasonCodes }`；`SwarmStatusCard.tsx:25` 同样 import `describeDegradedReasons`。
- **真正共用**：`Research.tsx:192` 与 `SwarmStatusCard.tsx:206` 走的是**同一个** `describeDegradedReasons`。
- i18n 键 `deep.agent.reason.*` / `deep.agent.reasonUnrecorded` 在 `zh.ts:2126-2133`、`en.ts:2128-2135` **均已存在**（不是渲染裸 key）。
⇒ **未新增第二处真相来源；旧私有映射已移除。** 与本卡要求一致。

---

## 5. 零回归（独立复跑）

| 检查 | 命令 | 结果 |
|---|---|---|
| 聚焦 pytest | `pytest -q --no-cov tests/test_swarm_orch.py tests/test_research_orch.py tests/test_research_deadline_vs27.py tests/test_research_deadline_budget_vs30.py` | **61 passed** in 23.96s |
| 后端 lint | `ruff check .`（backend） | **All checks passed!** |
| VS-20 未改动 | `git diff 92055e0 92b1b35 -- backend/app/services/research_orch.py` | **0 行**（空 diff） |
| 前端聚焦 vitest | TEMP 副本 `vitest run` 7 个文件（swarm / SwarmStatusCard / Research*） | **7 files / 48 tests passed**，其中 `swarm.test.ts (10)`、`SwarmStatusCard.test.tsx (3)` |
| 前端类型 | TEMP 副本 `tsc -b --force` | **exit 0** |

`--no-cov` 的理由成立：`backend/pytest.ini` 的 `addopts` 含 `--cov=app --cov-branch --cov-report=html`，单文件跑必然触发 `fail_under` 类阈值问题并写 `htmlcov`；`ruff check .` 与聚焦 pytest 均未写入仓库目录。

---

## 6. 鉴别力（自建变异体，仓库工作树全程未被触碰）

**变异体 M3（忠实退回）**：整份 `swarm_orch.py` 换回 `git show a03ac75:…`（改动前的冻结版本），跑**完整**新测试文件（不裁剪）：

```
$ <mut3>\ ... pytest -q tests/test_swarm_orch.py
FAILED tests/test_swarm_orch.py::test_same_vs20_reader_reads_both_orchestrators - assert False
FAILED tests/test_swarm_orch.py::test_swarm_agent_completed_event_carries_structured_status - KeyError: 'status'
FAILED tests/test_swarm_orch.py::test_swarm_failed_and_skipped_agents_are_structurally_readable - AssertionError: assert 'unknown' == 'failed'
3 failed, 5 passed in 2.22s
```

⇒ **恰好 3 条新用例变红、5 条既有用例全绿**，与实现者声称的 3 failed / 错误类型（`KeyError:'status'`、`'unknown'!='failed'`）一致。我比实现者多跑了一步：**把 5 条既有用例一并跑了**，证明变异**只**打红新用例。

**变异体 M1（外科式）**：只把条目组装退回（`elif agent.key in failed_errors` / `skipped_dependencies` 短路），其余保持交付态 → `1 failed, 7 passed`，红的正是"失败/被跳过者有条目"这条专用用例。⇒ 本卡最关键的行为变化**确有**鉴别用例把守。

**变异体 M2（部分退回）** → `4 failed`，其中多出的一条既有用例（`test_four_masters_runs_roots_in_parallel_then_feeds_risk`，`'partial' == 'completed'`）**是我这次变异自身不忠实造成的**（我只删了条目里的 `status` 却没恢复旧的 run 级判定，使 `succeeded` 恒为空），**不是实现缺陷，也不该算进实现者"3 failed"的账**。M3 才是忠实退回。

---

## 7. ⚠️ 观察项核实：swarm 的历史回放

**实现者的说法为真，且比它说的更强**：

- `frontend/src/services/swarmApi.ts` 只有 `fetchFourMastersTeam` / `fetchEarningsReviewTeam`（取团队定义）与 `streamFourMasters` / `streamEarningsReview`（**实时 SSE**）。**不存在任何 swarm 历史/回放拉取**。
- 前端唯一读 `agent_results` 的回放入口是 `Research.tsx#deriveAgentOutcomes`，它 `for (const key of AGENT_KEYS)` 且 `upsertNotice` 里 `AGENT_KEYS.includes(key)`——`AGENT_KEYS` 是 research 的 5 个 key，与 swarm 团队 key（`value_investor/tech_analyst/macro_strategist/risk_manager`）**几乎不相交**（仅 `report_lead` 重合，且会用 research 的标签渲染）。

⇒ `Research.tsx` 的读取器**确实**读不到 swarm 的逐 Agent 结构化状态。这是**本卡之外的泛化需求**，列为 **NEXT（新需求）**，**不计入本卡缺陷**。本卡已保证"数据形状可被结构化读取"（§2 已实证）。

---

## 8. 门禁清单（本次实跑）

见 §5 表格；另：`git status --porcelain` 收尾为空（仓库处于交付态，无变异残留、无未跟踪临时文件）。

---

## 判定

**ACCEPT。** 无 REJECT 项。

**NEXT（新需求，非本卡缺陷）**
1. 泛化回放读取器：让 swarm 历史（若日后持久化/提供回放）也能按 VS-20 结构化契约逐 Agent 显示状态与原因码，而不是复用 research 专用的 `AGENT_KEYS`。
2. `skipped` 是对 VS-20 词表的**扩展**而非替代——任何**未来**按白名单读 `status` 的消费方必须显式处理它（实现者已在 `swarm_orch.py:32-38`、`state.ts:52-64` 注释中写明；目前唯一消费方 `state.ts` 已覆盖）。

**遗留观察（不阻塞）**
- `done` payload 仍同时携带顶层 `failed_agents`/`skipped_agents` 与结构化条目。二者由同一事件分支派生、经我探针实测集合一致，属"冗余但同源"；前端对其零引用。若日后要严格"单一载体"，可考虑弃用这两个 key，但**不属于本卡**。

---

## 复现命令（本报告全部证据）

```powershell
# 基线定义
git rev-parse 92b1b35^                     # -> 92055e0（不是 a03ac75）
git diff 92055e0 92b1b35 -- backend/app/services/research_orch.py   # 空
git diff 92055e0 92b1b35 -- backend/tests/test_swarm_orch.py        # 3 处只加参数

# 后端
cd backend; $env:no_proxy='localhost,127.0.0.1,::1'
.venv\Scripts\python.exe -m pytest -q --no-cov tests/test_swarm_orch.py tests/test_research_orch.py `
  tests/test_research_deadline_vs27.py tests/test_research_deadline_budget_vs30.py     # 61 passed
.venv\Scripts\python.exe -m ruff check .                                               # All checks passed!

# 自建探针（形状对齐）
.venv\Scripts\python.exe "$env:TEMP\eval_vs35\probe.py"                                # FAILS = 0

# 变异体（TEMP 副本，仓库不动）
#   mut3  = 整份 swarm_orch.py 退回冻结版 a03ac75  → 3 failed, 5 passed
#   mut1  = 只短路失败/跳过条目组装                → 1 failed, 7 passed

# 前端（TEMP 副本 + junction 指回真实 node_modules）
cd "$env:TEMP\eval_vs35\fe"
bun x vitest run tests/swarm.test.ts tests/SwarmStatusCard.test.tsx `
  tests/ResearchAgentFailed.test.tsx tests/ResearchDeadlineSignal.test.tsx `
  tests/ResearchReplayAgentStatus.test.tsx tests/ResearchReportToMarkdown.test.tsx `
  tests/ResearchDeepPlan.test.tsx                                                      # 7 files / 48 passed
bun x tsc -b --force                                                                   # exit 0
```

## 清理记录

- 变异/临时物**全部**在 `%TEMP%\eval_vs35\`（`mut` / `mut2` / `mut3` / `fe` / `probe.py` / 日志）。
- 进程清理**按精确匹配自己的命令行**执行：`*eval_vs35\fe\node_modules\vitest\vitest.mjs*`；**未使用**"排除法"，**未触碰** `frontend\`、`backend\` 内的其它进程，**未误杀**常驻 `http.server`。
- 事实边界：VS-34 的 vitest 进程在我操作前后均已不在进程表；**我不能证明其结束与我的终止操作有关，也不能证明无关**。VS-34 请以自身重跑结果为准。
