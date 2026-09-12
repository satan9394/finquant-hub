# IMPLEMENT_RESULT — VS-35：swarm 逐 Agent 条目纳入 VS-20 结构化状态契约

> 工作目录：`E:\Code_file\Projects\finquant-hub`；基线 `HEAD = a03ac75`（**未 commit**）。
> 本文件为**重派后的第二版**：上一版任务卡给的文件路径是错的。

## 0. 路径更正（brief 的路径与行号均未核实，已实测）

| brief / 任务卡声称 | 实测 |
|---|---|
| `backend/app/orchestrator/swarm_orch.py` | **不存在**。`backend/app/orchestrator/` 仅含 `__init__.py`（550 B）、`runtime.py`（6089 B）、`team.py`（4857 B）、`teams/` |
| `:272-282` 是"逐 Agent 条目" | 真身文件里 `272-276` 是 `ordered_results` 组装、`277-287` 是 `done` payload、`281` 是 run 级 status；**逐 Agent 条目实际在 `242-249`** |
| 真身路径 | **`backend/app/services/swarm_orch.py`**（改动前 313 行，改动后 401 行） |

下文所有行号都是**本会话实测**（`read` 工具逐行读取所得），不是转抄。

---

## 1. 现状核实（三点，先核实后改）

### ① swarm 的逐 Agent 条目确实没有 VS-20 的结构化 `status` —— **成立**

`research_orch` 侧的契约（对照物）：
- `research_orch.py:161-163`：`AGENT_STATUS_COMPLETED/DEGRADED/FAILED`
- `research_orch.py:166-186`：`_agent_result()` —— **每个**条目必带 `status`，可选 `error` / `degraded_reasons`
- `research_orch.py:619-626`、`640-646`、`718-725`：成功、DAG 异常、主编三条路径**都**经它产出条目

改动前 `swarm_orch.py` 的条目（实测原文）：
- `242-249`（旧行号）返回 `{role_key, name, avatar, content, tool_log, token_count}` —— **无 `status`、无 `error`、无 `degraded_reasons`**
- `272-276`（旧行号）`ordered_results` 直接取 `runtime.results`，失败/被跳过的 Agent **在 `agent_results` 里根本没有条目**；它们的结局只出现在 `283-284` 的顶层 `failed_agents` / `skipped_agents` 两个 **key 列表**里

⇒ 同一件事（某 Agent 失败）在 research 侧是"条目的结构化字段"，在 swarm 侧是"条目缺失 + 另一个 key 列表"。

### ② 消费方只能靠别的方式猜 —— **成立**

- **前端实时路径（主消费方）**：`frontend/src/features/swarm/state.ts:117-124`（旧行号）在 `done` 分支里对**任何**存在于 `agent_results` 的 key **硬编码** `status: 'completed'`；`125-127` 对**不存在**的 key 才退化为 `'skipped'`。也就是说它读的是**条目的存在性**，不是状态。
- **后端/前端都不读那两个 key 列表**：`grep -n "failed_agents|skipped_agents" frontend/src` → **No matches**（全前端零引用）。后端只有 `swarm_orch.py:90-91 / 124-125` 把它们塞进报告字典，没有任何读取方。
- **回放路径（VS-20 的结构化读取器）覆盖不到 swarm**：`frontend/src/pages/Research.tsx:32` 的 `AGENT_KEYS` 固定为 `['business_analyst','financial_analyst','industry_researcher','risk_assessor','report_lead']`；`Research.tsx:269-276` 的 `deriveAgentOutcomes` **只遍历这个列表**（遍历在 `275`）。swarm 的 `value_investor / tech_analyst / macro_strategist / risk_manager`（以及财报团队 6 个 key）**都不在其中** ⇒ 即使有结构化字段，现有回放读取器也读不到它们。
- **前端事件流也不同形**：`research_orch.py:596-602` 的 `agent_completed` 带 `status` + `degraded_reasons`；改动前 `swarm_orch.py:236-241` 的 `agent_completed` **只有** `role_key/name/length/token_count`。

### ③ 第二处真相来源 —— **按字面不成立，但存在"结构性重复载体"（如实说明）**

- **"文案 vs 结构化各说一套"在 swarm 侧不存在**：改动前 swarm 既没有结构化字段，也**没有** `【分析失败】` 之类文本哨兵（该哨兵只存在于 `research_orch.py:572/586/642`，且 VS-20 已把它**降级**为历史兜底，见 `Research.tsx:158/257-260`）。`grep -n "分析失败" frontend/src` 的 3 处命中全在 `Research.tsx`，与 swarm 无关。**故这一条按字面不成立。**
- **但确实存在第二个载体（形状不同、非文案）**：失败/被跳过的事实同时表现为 ①`agent_results` **缺条目**（隐式）与 ②顶层 `failed_agents`/`skipped_agents`（显式）。两处都由 `swarm_orch` 产出，而前端只读 ①、从不读 ②（见上）。这是"同一件事的第二处真相来源"，只是它是**结构化 vs 结构化**，不是"结构化 vs 文案"。
- **附带一处口径分叉**：run 级 `done.status` 由后端按计数算（旧 `281`：`len(ordered_results) == len(team.agents)`），前端 `state.ts:129-133`（旧行号）又按"每个 key 都有条目"重算一遍 `allResultsPresent`。

**结论**：①、② 成立；③ 按字面不成立（如实说明），但存在等价的"结构化重复载体"，本次一并消除。

---

## 2. 改动（文件:行）

改动前先落骨架（`docs/ai/evo/IMPLEMENT_RESULT_VS35.md` 于 09:0x 创建），再做代码改动。

### 2.1 `backend/app/services/swarm_orch.py`（核心）

| 行 | 改动 |
|---|---|
| `17-23` | 从 `research_orch` **直接复用** VS-20 词表与构造器：`AGENT_STATUS_COMPLETED/DEGRADED/FAILED`、`_agent_result`、`_call_agent` |
| `32-41` | 新增 `AGENT_STATUS_SKIPPED = "skipped"`（**扩展**，非替代，含义见注释）与 `_AGENT_STATUS_SUCCEEDED` |
| `236-251` | `_call_agent(...)` 增加 `degraded_reasons=agent_reasons`（**与 research_orch 同源**，此前这一参数没传 ⇒ 工具失败/循环耗尽/空内容/截断在 swarm 侧全部丢失） |
| `259` | `status = DEGRADED if agent_reasons else COMPLETED` |
| `262-269` | `agent_completed` 事件带上 `status` + `degraded_reasons`（与 `research_orch.py:596-602` 同形） |
| `270-283` | 条目改由 `_agent_result(...)` 产出；`role_key/avatar/token_count` 作为**增量**字段并入（向后兼容） |
| `288-313` | 留存 `failed_errors` / `skipped_dependencies`（两个 key 列表照旧下发） |
| `315-356` | **每个** Agent 都有条目：成功→原样；`node_failed`→`status="failed"` + `error`；`node_skipped`→`status="skipped"` + 原因。失败条目 `content=""`——**刻意不新造 `【分析失败】` 文本哨兵** |
| `357-363` | run 级 status 改按结构化 status 判定，**与改动前逐项等价**（旧口径 `len(ordered_results)==len(team.agents)` ⇔ 新口径"所有条目 status ∈ {completed, degraded}"） |
| `368` / `373` | `done.status` / `token_count`（失败条目 `token_count=0`，求和等价） |

### 2.2 `frontend/src/features/swarm/state.ts`（消费方读结构化字段）

| 行 | 改动 |
|---|---|
| `25-32` | `SwarmAgentState` 新增可选 `degraded?: boolean` / `degradedReasons?: string[]`（增量，向后兼容） |
| `52-64` | `STRUCTURED_STATUS_MAP`：VS-20 状态 → 卡片状态（`degraded`→`completed`+标志位，**与 `Research.tsx#deriveAgentOutcome` 同一读法**；`skipped` 是 DAG 扩展） |
| `107-110` | `statusFromStructured()`：缺 `status` 的历史载荷退化为"有条目即完成"（**向后兼容**） |
| `124-140` | `agent_completed` 分支读 `status`/`degraded_reasons`（不再无条件"完成"） |
| `150-180` | `done` 分支**读 `result.status`**（此前硬编码 `'completed'`）；同时带出 `error` 与原因码 |

### 2.3 `frontend/src/features/degradedReasons.ts`（新增，展示端唯一同源）

原因码→i18n 键的映射原先只存在于 `Research.tsx` 内部；swarm 卡片要展示**同一批**原因码，两处各存一份必然漂移，故提取为共享模块（`9-33`：`DEGRADED_REASON_KEYS` / `reasonCodes` / `describeDegradedReasons`）。

### 2.4 `frontend/src/pages/Research.tsx`（纯提取，无行为变化）

`24-26` 改为从共享模块 import（`reasonCodes as asReasonCodes` / `describeDegradedReasons`）；`192` 的 `describeOutcomeReason` 改用共享函数。**删除的本地常量与函数逐字搬进共享模块，语义不变。**

### 2.5 `frontend/src/components/SwarmStatusCard.tsx`

`25` import；`204-209`：`agent.degraded` 时以 warning 段落展示结构化原因码，**无原因码时如实显示 `deep.agent.reasonUnrecorded`**（不编造）。未新增任何 i18n 键，复用既有 `deep.agent.reason.*`。

### 2.6 既有测试替身的**适配**（唯一一处改动既有测试文件，断言一字未动）

`backend/tests/test_swarm_orch.py` 的 3 个 `fake_call_agent` 只加了参数 `degraded_reasons=None`（第 70/130/164 行的用例内），**所有断言逐字保留**。原因：生产代码现在按 research 的契约传 `degraded_reasons=`，替身必须实现该契约，否则 `TypeError`。这是"替身对齐新契约"，不是"放宽断言"。

### 2.7 新增用例

- `backend/tests/test_swarm_orch.py:195-197` `VS20_CORE_FIELDS` / `VS20_STATUSES`；`200-215` `read_agent_status()`（**唯一读取方式**的读取端）
- `:241` `test_same_vs20_reader_reads_both_orchestrators`——同一段读取代码 + 同一套字段 + 同一语义，对 **research 与 swarm 双方**成立
- `:285` `test_swarm_agent_completed_event_carries_structured_status`——实时事件与落库条目同源
- `:311` `test_swarm_failed_and_skipped_agents_are_structurally_readable`——失败/被跳过也有结构化条目，且向后兼容字段不变
- `frontend/tests/swarm.test.ts`：新增 describe `Swarm structured agent status (VS-20 shape)`（3 例：done 读结构化状态 / agent_completed 读结构化状态 / 缺 status 的历史载荷保持旧读法）
- `frontend/tests/SwarmStatusCard.test.tsx`：新增 1 例（degraded 显示原因码而不是干净"完成"）

---

## 3. 形状对齐证据（同一读取方式对两者都适用）

### 3.1 后端：同一段读取代码

`backend/tests/test_swarm_orch.py:200` 的读取端：

```python
def read_agent_status(agent_results, key):
    entry = agent_results.get(key)
    if not isinstance(entry, dict):
        return "unknown"
    status = entry.get("status")
    return status if isinstance(status, str) else "unknown"
```

`test_same_vs20_reader_reads_both_orchestrators`（`:241`）把这段代码**同时**作用在：

- `swarm_orch.run_four_masters(...)` 的真实 `done.payload`（跑真实 DAG runtime，只替换 `_call_agent`）
- `research_orch.run_research(...)` 的真实 `done.payload`（同一手法）

并断言：

- 每个 key 都读得到状态，且 `read_agent_status(...) in {"completed","degraded","failed","skipped"}`
- 每个条目都含 `("name","content","tool_log","status")`
- **同因同码**：两侧都被注入 `tool_failed` 时，swarm `tech_analyst` 与 research `financial_analyst` 都读成 `degraded`，且 `degraded_reasons == ["tool_failed"]`
- 干净 Agent 在两侧都读成 `completed`（不是靠缺字段猜的）

前端同一读法：`state.ts:163` `statusFromStructured(result.status)` 与 `Research.tsx` 的 `deriveAgentOutcome`（`result.status` 优先，仅历史条目退化到事件/文案）是同一规则；`degraded → status='completed' + degraded=true` 两侧一致。

### 3.2 未新增第二套并行语义

`completed / degraded / failed` 三个取值**逐字沿用** VS-20；`skipped` 是**扩展**（DAG 独有："依赖失败 ⇒ 本环节未执行"），已在 `swarm_orch.py:32-38` 与 `state.ts:52-64` 显式标注为扩展。**没有**新增 `【分析失败】` 之类的文本哨兵。

---

## 4. 门禁原始输出（聚焦，未跑全量）

前置 `$env:no_proxy='localhost,127.0.0.1,::1'`。

**后端聚焦 pytest（`--no-cov`，见下注）**

```
$ .venv\Scripts\python.exe -m pytest tests/test_swarm_orch.py tests/test_research_orch.py tests/test_research_deadline_vs27.py tests/test_research_deadline_budget_vs30.py -q --no-cov -p no:cacheprovider
.............................................................                    [100%]
61 passed in 24.03s
```

收尾在同一命令上复跑，结果一致（`61 passed in 24.03s`），且此时工作树只含本卡改动（见 §6.5）。

**关于 `--no-cov`**：`backend/pytest.ini:5-9` 的 `addopts` 打开了 `--cov=app --cov-branch --cov-report=html`，而 `backend/pyproject.toml:28` 的 `fail_under = 80` 是**整仓**阈值。跑单文件时它必然红，且会往仓库目录写 `backend/htmlcov/`（本卡禁止）。故门禁用 `--no-cov`。改动前该命令的同一形态（默认参数）实测：`8 passed in 25.94s` + `FAIL Required test coverage of 80.0% not reached. Total coverage: 9.79%`（红的是覆盖率门槛，不是用例）。

**ruff**

```
$ .venv\Scripts\python.exe -m ruff check .
All checks passed!
EXIT=0
```

**前端聚焦 vitest**

```
$ bun run test tests/swarm.test.ts tests/SwarmStatusCard.test.tsx
 ✓ tests/SwarmStatusCard.test.tsx (3 tests) 2572ms
 ✓ tests/swarm.test.ts (10 tests) 32ms
 Test Files  2 passed (2)
      Tests  13 passed (13)

$ bun run test tests/ResearchReplayAgentStatus.test.tsx tests/ResearchDeadlineSignal.test.tsx tests/ResearchAgentFailed.test.tsx tests/ResearchReportToMarkdown.test.tsx
 ✓ tests/ResearchReplayAgentStatus.test.tsx (11 tests) 2695ms
 ✓ tests/ResearchDeadlineSignal.test.tsx (5 tests) 2257ms
 ✓ tests/ResearchReportToMarkdown.test.tsx (12 tests) 10ms
 ✓ tests/ResearchAgentFailed.test.tsx (6 tests) 9ms
 Test Files  4 passed (4)
      Tests  34 passed (34)
```

**前端类型检查**（非本卡要求，为验证前端改动自洽）：`bun run --bun tsc -b --pretty false` → `EXIT=0`（无输出）。

---

## 5. 鉴别力证明（副本内退回对齐 ⇒ 新用例变红）

**窗口声明**：所有变异**只发生在 `$env:TEMP` 副本**，仓库工作树**全程未被变异**（收尾 `git status` 已核对）。副本用 `$env:PYTHONPATH` 指向临时 backend，用 junction 指向真实 `node_modules`。

**变异体构造（可复现、不依赖"工作区 vs HEAD"）**：

```
git show a03ac75:backend/app/services/swarm_orch.py            → 冻结提交里的改动前版本
git show a03ac75:frontend/src/features/swarm/state.ts          → 同上
```

| 对象 | 内容哈希 |
|---|---|
| 工作树 `backend/app/services/swarm_orch.py`（VS-35 交付态） | sha256 `7FB5BC59967C63AE255E6F66E9160ABF1E929460C46A219BAF1CB8104AD5B511` / git blob `a6ae17aaa2eab964dbecd923deee6d038def1c6e` |
| 变异体（`a03ac75` 版） | sha256 `F33BFBD5ABD5D3D4EE2E5A1BC3CB7714310EFEC720909A899F08CDCA9714E853` / git blob `ce55df12007c51525e3f2e1e1711e9c92c5c986a` |
| 变异体 `frontend/src/features/swarm/state.ts`（`a03ac75` 版） | sha256 `BE7CFE0DB2D4E652188929F45E77FB83EAE5E0C5E246B45ECD6164FEA8DF9E32` |

因为**未 commit**，这里同时给出"冻结提交 `a03ac75` 的 blob 哈希"，即便日后入库也不会退化成同义反复。

**基线（副本、未变异）——新用例全绿**

```
3 passed, 5 deselected in 1.97s                      # backend 三条新用例
✓ tests/swarm.test.ts (10 tests) 16ms                # frontend 含 3 条新用例
```

**变异后——新用例变红（退回对齐）**

```
$ pytest <mutant>\backend\tests\test_swarm_orch.py -k "vs20_reader or structured_status or structurally_readable"
FAILED test_same_vs20_reader_reads_both_orchestrators - assert False
FAILED test_swarm_agent_completed_event_carries_structured_status - KeyError: 'status'
FAILED test_swarm_failed_and_skipped_agents_are_structurally_readable - AssertionError: assert 'unknown' == 'failed'
3 failed, 5 deselected in 1.58s
```

```
$ bun run test tests/swarm.test.ts      # state.ts 退回 a03ac75
 Test Files  1 failed (1)
      Tests  3 failed | 7 passed (10)   ← 红的恰好是 3 条新用例，7 条既有全绿

$ bun run test tests/SwarmStatusCard.test.tsx
 Tests  1 failed | 2 passed (3)         ← 红的恰好是 1 条新用例
```

⇒ 后端 3/3、前端 3/3 + 1/1 新用例都能把"退回对齐"检出来；且变异**只**打红新用例、既有用例全绿，说明新用例测的正是本卡要引入的行为。

**副本清理**（按"精确匹配自己的命令行"，未用排除法）：先单独回收 junction `...\vs35-mut\frontend\node_modules`（回收后核对真实 `frontend\node_modules` 仍在、208 个条目完好），再回收整个 `vs35-mut`。收尾：

```
Get-CimInstance Win32_Process -Filter "Name='python.exe'" → 无输出（无遗留 pytest，未误杀任何常驻服务）
```

---

## 6. 未解决问题 / 风险

1. **回放读取器仍不覆盖 swarm 的 key**：`Research.tsx:32` 的 `AGENT_KEYS` 是 research 专用的 5 个 key，`deriveAgentOutcomes` 只遍历它。本次**没有**把 swarm 的 key 并入——那会把 research 页面的 Agent 卡片列表一起改掉（超出本卡范围，且风险高）。⇒ **swarm 报告的历史回放目前仍不显示逐 Agent 结构化状态**。本卡保证的是"数据形状已可被结构化读取"，读取器泛化是后续卡。
2. **`backend/tests/test_swarm_orch.py` 的既有替身被改动过**（仅加参数，断言未动）。若验收要求"既有测试文件零改动"，这一条需单独裁决；我选择改替身而不是在生产代码里做 `inspect.signature` 兜底（仓内铁律反对为迁就替身放宽生产代码）。
3. **`skipped` 是 VS-20 词表的扩展**。任何按 `status in ("completed","degraded","failed")` 白名单读取的**未来**消费方需要显式处理它；已在两处代码注释里写明"扩展而非替代"。
4. **前端展示端只覆盖了原因码的展示，没有新增 i18n 键**，因此没有触碰 VS-34 正在改的 `i18n/zh.ts`、`i18n/en.ts`（工作树里这两个文件带 VS-34 的在制改动，本卡未触碰）。
5. **跨卡污染边界（如实声明）**：本窗口内 VS-34 正在同一工作树改 `frontend/src/pages/Chat.tsx` 与 `i18n/zh.ts`、`i18n/en.ts`。我跑的前端 vitest/tsc 会**收集**这些在制文件。实测结果全绿（`tsc -b` exit 0，包含 Chat.tsx），但**我不能证明我的门禁结果与 VS-34 的在制状态无关**，也不能证明有关——请以各自重跑结果为准。
   - 补充事实（只陈述观察，不推测归属）：**收尾时** `git status` 里 `frontend/src/pages/Chat.tsx`、`frontend/src/i18n/zh.ts`、`frontend/src/i18n/en.ts`、`frontend/tests/ChatReadFailureRetry.test.tsx`、`docs/ai/evo/IMPLEMENT_RESULT_VS34.md` **已不再出现**——即在我最后一次读数之前，那批在制改动已从工作树消失。**本卡全程未触碰这些文件**（我的改动文件见 §2，两者不相交）。
   - 据此，上一段"门禁与 VS-34 无关"的疑虑在**最终态**下已消解：最后一次后端门禁（`61 passed` + `ruff All checks passed!`）与最终 `git status` 都是在只有本卡改动的工作树上取得的。
6. **未 commit**（按卡要求），也未做 doc sync（`docs/HANDOVER.md` 等）。若需要，请另行指示。
7. 变异证明只在**副本**做，仓库工作树从未进入变异窗口；结果文件撰写期间工作树保持交付态。

---

## 7. 一句话结论

三点核实：① swarm 逐 Agent 条目确实无 VS-20 结构化 `status`（**成立**）；② 消费方确实只能靠"条目存在性"猜（**成立**，前端硬编码 + 两个 key 列表零消费 + 回放读取器不含 swarm key）；③ "文案 vs 结构化各说一套"按字面**不成立**（swarm 侧从无文案哨兵），但存在等价的"结构化重复载体"（缺条目 vs key 列表），已一并消除。形状**真的对齐了**：同一段 `read_agent_status` 对 `research_orch` 与 `swarm_orch` 的真实 `done.payload` 读出相同字段与相同语义，且退回对齐会让 7 条新用例全部变红。VS-20 / VS-12 / VS-30 零回归（61 条聚焦后端用例 + 47 条聚焦前端用例全绿，ruff 通过）。
