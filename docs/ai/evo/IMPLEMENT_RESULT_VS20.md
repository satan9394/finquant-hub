# IMPLEMENT_RESULT — VS20：降级/失败原因可回放，判据脱离字符串哨兵

状态：**完成**（2026-09-11）。未 commit（按要求）。工作树最终态见 §7。

一句话结论：**回放判据已从"content 前缀哨兵"换成 `agent_results[key].status`（结构化），主编失败在重开时显示 failed 且原因可见；旧报告仍靠哨兵/事件兜底显示 failed。** 过程中另实测到一处卡外未记载的**实时路径自相矛盾**（主编失败后又补发 `agent_completed`，把 failed 卡片翻回 completed），已一并修复——否则验收标准 1 与"实时/回放同源"无法同时成立。

---

## 1. 改动清单（文件:行）

| 文件 | 位置 | 改动 | 备注 |
|---|---|---|---|
| `backend/app/services/research_orch.py` | `:139-159`（新增）、`:142-144` | 新增 `AGENT_STATUS_COMPLETED/DEGRADED/FAILED` 常量与 `_agent_result()` 构造器：`agent_results` 条目除 `name/content/tool_log` 外带 **`status`**，并按需带 `error` / `degraded_reasons` | 结构化信号，随报告持久化 |
| 同上 | `:347`、`:379-418`、`:422-429` | `agent_outcomes` 旁挂字典记录每个 Agent 的结构化结局；`node_completed` 分支改用它构造条目（含 `error`） | 不改 `DAGNode.run` 的 4 元组契约（swarm 共用） |
| 同上 | `:443-450` | `node_failed` 分支写 `status=failed` + `error="研究 Agent 异常：…"`；**发出的 `agent_failed` 事件载荷逐字不变** | 保住 VS12 P1-3 的既有断言 |
| 同上 | `:386-392` | `agent_completed` 事件新增 `status` 与（降级时）`degraded_reasons` | 降级原因首次 emit 给界面 |
| 同上 | `:460-526` | 主编：留存 `lead_error`；`status` = failed / degraded(有原因) / degraded(无原因，界面显示"原因未记录") / completed；**主编失败后不再补发 `agent_completed`** | 见 §2 实测缺陷 ② |
| 同上 | `:559` | `done_payload["agent_results"]` 由"只挑 3 个字段重建"改为 `{k: dict(v)}` | 否则新增字段在 SSE 路径被丢弃，实时与落库再次分叉 |
| `frontend/src/pages/Research.tsx` | `:43-77` | `StoredAgentResult` / `StoredAgentEvent` 类型；`StoredReportDetail.agent_results`、`events` 收紧为结构化类型 | |
| 同上 | `:135-319` | 新增纯函数：`summarizeReason`（去堆栈+截断）、`describeOutcomeReason`、`deriveAgentOutcome(s)`（**结构化优先**）、`noticesFromOutcomes`、`outcomesFromStream` 用的 `upsertNotice` | 全部导出，供单测与复用 |
| 同上 | `:451-470` | `openStoredReport` 回放判据改为 `deriveAgentOutcomes(report.agent_results, report.events)`；无证据（unknown）落到 `pending`，**不得默认成"完成"** | 原 `:235` 的 `content?.startsWith('【分析失败】')` 已删 |
| 同上 | `:552-566`、`:569-576` | 实时 `agent_completed` 收 `degraded_reasons`；`agent_failed` 同步登记失败原因（失败是终态，不被后续事件覆盖） | 实时侧原因可见 |
| 同上 | `:590-596` | `done` 到达时用 `data.agent_results`（= 落库内容）重算提示列表 | **实时最终态与回放同源（同一函数、同一份数据）** |
| 同上 | `:733-751` | 新增"环节状态"`Alert`：逐条列出「哪个 Agent：失败/降级 —— 原因」，原因缺失时显示"原因未记录" | 报告级 `quality` 横幅与其下方原有渲染**未动** |
| `frontend/src/i18n/zh.ts` `:2078-2087`、`frontend/src/i18n/en.ts` `:2079-2088` | 新增 9 个键（zh/en 各 9 条，键集合一致） | 供 `AuthUnavailable.test.tsx` 的 i18n parity 用例 |
| `backend/tests/test_research_orch.py` | `:740-903`（新增 6 个用例） | 主编失败结构化 / 主编失败不得补发 completed / 单 Agent LLMError 结构化 / 降级原因结构化+事件 / 无原因降级不编造 / happy path 零回归 | |
| `frontend/tests/ResearchReplayAgentStatus.test.tsx` | 新文件（11 用例） | 回放接线 6 例 + 纯函数 5 例 | |

**关于 `frontend/src/app.css`（编排者范围询问的答复，已按情形 2 处理）**：我一度加过 `.research-agent-notice__list` 两条纯装饰性样式。它**不是功能所需**（`<ul>` 用默认样式也能正常渲染），属于顺手美化，**已 `git checkout --` 撤回**；同时把标记里那个会变成"悬空类名"的 `className` 换成了内联写法（`margin:0; padding-left:18px`），最终改动只落在本卡范围内的文件上。`git status` 已确认 `app.css` 回到未修改态。

---

## 2. 根因与实测证据

### ① 主编失败：结构化状态确实缺失（修复前实测，探针脚本放在 `$env:TEMP`）

`$env:TEMP\vs20_probe\probe_lead_failure.py`（主编抛 `LLMError`，其余 agent 正常），**修复前**原始输出节选：

```
   agent_started {"role_key": "report_lead", "name": "投研主编", "avatar": "🧠"}
   agent_failed {"role_key": "report_lead", "error": "主编模型不可用"}
   agent_completed {"role_key": "report_lead", "name": "投研主编", "length": 0}
   done {...  "quality": "degraded" ...}
LEAD_RESULT: {"name": "投研主编", "content": "", "tool_log": []}
QUALITY: degraded
```

两条事实同时成立：
- 条目里**只有空 content**、没有任何失败标记 ⇒ 回放侧哨兵 `'【分析失败】'` 必然落空 ⇒ 重开显示"完成"。
- **卡外未记载的缺陷 ②**：末尾还补发了一条 `agent_completed`。前端 `case 'agent_completed'` 会把刚被 `agent_failed` 置为 failed 的主编卡片**翻回 completed** ⇒ **实时路径自己也显示"完成"**。若不修，验收标准 1（主编失败回放 failed）与"实时/回放同源"必然二选一。

同一探针**修复后**：

```
   agent_started {"role_key": "report_lead", ...}
   agent_failed {"role_key": "report_lead", "error": "主编模型不可用"}
   done {... }
LEAD_RESULT: {"name": "投研主编", "content": "", "tool_log": [], "status": "failed", "error": "主编模型不可用"}
```

### ③ 降级原因确实从不呈现

`agent_reasons` / `lead_reasons` 仅作为 `degraded_reasons` 喂给 runner 与 `degraded` 标志；`agent_completed` 载荷此前只有 `role_key/name/length`。现改为事件与 `agent_results` 双写同一份原因码。

### ④ 落库链路（未改）

`routers/research.py:264` 的 `_append_event` 已经在持久化每个事件（含 `agent_failed` 的 `role_key`/`error`），`GET /{id}` 也返回 `events`（payload 已解析）⇒ 本卡**只补"回放侧消费"**，未改 schema、未改 router。

---

## 3. 门禁原始输出

### 3.1 后端聚焦 pytest（干净树，改动后）

```
> cd backend; $env:no_proxy='localhost,127.0.0.1,::1'
> .venv\Scripts\python.exe -m pytest tests/test_research_orch.py -q --no-cov -p no:cacheprovider

..............................                                                                               [100%]
30 passed in 11.84s
```

另跑两个**真实调用 `run_research`** 的相邻文件（我改的正是它的事件流）：

```
> .venv\Scripts\python.exe -m pytest tests/test_memory.py tests/test_memory_rollout.py -q --no-cov -p no:cacheprovider

..........                                                                                                   [100%]
10 passed in 3.61s
```

### 3.2 后端 ruff

```
> .venv\Scripts\python.exe -m ruff check .
All checks passed!
```

### 3.3 前端 vitest（干净树，**无变异副本**）

```
> bun x vitest run tests/ResearchAgentFailed.test.tsx tests/ResearchAgentFailedWire.test.tsx \
    tests/ResearchReplayAgentStatus.test.tsx tests/ResearchReportToMarkdown.test.tsx \
    tests/ResearchDeepPlan.test.tsx tests/AuthUnavailable.test.tsx tests/modelPresets.test.ts

 ✓ tests/ResearchReplayAgentStatus.test.tsx (11 tests) 2229ms
 ✓ tests/ResearchAgentFailedWire.test.tsx (1 test) 1469ms
 ✓ tests/AuthUnavailable.test.tsx (17 tests) 874ms
 ✓ tests/ResearchDeepPlan.test.tsx (1 test) 1246ms
 ✓ tests/modelPresets.test.ts (11 tests) 12ms
 ✓ tests/ResearchReportToMarkdown.test.tsx (12 tests) 7ms
 ✓ tests/ResearchAgentFailed.test.tsx (6 tests) 6ms
 Test Files  7 passed (7)
      Tests  59 passed (59)
```

（`AuthUnavailable.test.tsx` 内含 zh/en 键集合一致性的 parity 断言 ⇒ 新增 9 键双语齐备；VS-13 的两个文件全绿 ⇒ 实时 `case 'agent_failed'` 未回归。本次未出现 forks worker 超时。）

### 3.4 前端构建（vitest 之后**串行**执行，未并行）

```
> bun run build     # tsc -b && vite build
dist/assets/Research-kp0cLwCK.js                 46.79 kB │ gzip:  14.38 kB
...
✓ built in 18.02s
```

---

## 4. 鉴别力证明（副本变异，两种变异，原始输出）

**变异窗口声明**：变异只作用于**副本** `frontend/src/pages/Research.vs20mutant.tsx` 与 `frontend/tests/__vs20mutant.test.tsx`，被验文件（`Research.tsx`、`ResearchReplayAgentStatus.test.tsx`）**全程未被修改**。窗口现已关闭，两个副本**已送回收站**（见 §7）。

### M1：去掉结构化判据（复现 VS20 原始缺陷，退回"事件/哨兵"兜底）

改动：`const structured = typeof result?.status === 'string' ? result.status : undefined;` → `const structured = undefined as string | undefined;`

```
❯ tests/__vs20mutant.test.tsx (11 tests | 5 failed) 3636ms
     × 结构化 status=failed 的主编 ⇒ 卡片 failed + 原因可见，不再是"完成" 1979ms
     × 矛盾输入——结构化说 completed 但 content 带哨兵 ⇒ 以结构为准，显示 completed 324ms
     ✓ 历史兼容——只有哨兵、没有结构化字段的旧报告仍显示 failed 269ms
     ✓ 历史兼容——主编失败但只有落库事件（content 为空串）也能看出 failed 259ms
     × 工具失败导致的降级 ⇒ 显示"哪个 Agent + 可读原因"（不显示原始码） 269ms
     × 无原因可记录的降级（主编返回无法解析的散文）⇒ 如实显示"原因未记录" 257ms
     ✓ agent_results 缺某个 key ⇒ 该 Agent 显示未运行/未知，不得默认成"完成" 269ms
     × 结构化 failed 优先于内容；结构化 completed 不被哨兵推翻 6ms
...
AssertionError: expected +0 to be 1 // Object.is equality      ← 主编失败用例：failed 卡片 0 张（正是原始缺陷）
AssertionError: expected 1 to be +0 // Object.is equality      ← 矛盾输入用例：哨兵夺回主判据
 Test Files  1 failed (1)
      Tests  5 failed | 6 passed (11)
```

### M2：哨兵仍在结构化之前判定（"两个条件或起来"的形态）

改动：在 `deriveAgentOutcome` 开头插入哨兵短路返回。

```
❯ tests/__vs20mutant.test.tsx (11 tests | 2 failed) 2346ms
     ✓ 结构化 status=failed 的主编 ⇒ 卡片 failed + 原因可见，不再是"完成"  1010ms
     × 矛盾输入——结构化说 completed 但 content 带哨兵 ⇒ 以结构为准，显示 completed 287ms
     ✓ 历史兼容——只有哨兵、没有结构化字段的旧报告仍显示 failed 218ms
     ...
     × 结构化 failed 优先于内容；结构化 completed 不被哨兵推翻 4ms
 Test Files  1 failed (1)
      Tests  2 failed | 9 passed (11)
```

**判读**：M2 只打红"矛盾输入"一类用例 ⇒ 该用例**确实**在证明主判据已换位（若我把两个条件简单或起来，它会全绿）；M1 打红 5 例并**精确复现**"主编失败显示完成"的原始缺陷。二者合起来说明新判据不是装饰。

---

## 5. 覆盖对照（验收标准 → 用例）

| 验收标准 | 用例 | 位置 |
|---|---|---|
| 1 主编失败回放一致（failed + 原因） | 后端 `test_lead_failure_is_structurally_recorded_as_failed`；前端 `结构化 status=failed 的主编 ⇒ 卡片 failed + 原因可见` | `test_research_orch.py:760`、`ResearchReplayAgentStatus.test.tsx` |
| 1' 实时同源（不补发完成信号） | `test_lead_failure_does_not_emit_completed_after_failed` | `test_research_orch.py:789` |
| 2 单 Agent 异常实时/回放都 failed | `test_agent_llm_error_is_structurally_recorded_as_failed`；VS-13 两文件（未改，全绿） | 同上 |
| 3 降级原因可见 / 未记录则如实说 | `test_degraded_reasons_are_structured_in_results_and_emitted`、`test_lead_unparseable_prose_records_degraded_without_reason`；前端 2 例（`工具调用失败` / `原因未记录`） | 同上 |
| 4 历史兼容（**只有哨兵、无结构化字段**） | `历史兼容——只有哨兵、没有结构化字段的旧报告仍显示 failed`（fixture 显式不含 `status/error`，`events` 为空数组）；另加"只有落库事件"的主编失败兜底例 | `ResearchReplayAgentStatus.test.tsx` |
| 5 **矛盾输入**：结构化 completed 但 content 带哨兵 ⇒ 以结构为准 | `矛盾输入——结构化说 completed 但 content 带哨兵 ⇒ 以结构为准，显示 completed` + 纯函数例 | 同上 |
| 6 门禁 | §3（后端 30+10 passed / ruff 干净；前端 59 passed；`bun run build` 通过） | — |
| 7 不为迁就替身放宽异常处理 | **未改动任何 `except`**；`_call_agent` 的异常路径原样，仅新增结构化记录 | `git diff` 可核 |

其余边界（错误场景）：`agent_results` 缺 key ⇒ `unknown` ⇒ 卡片 `pending` + "状态未知（未运行或没有记录）"，**不默认成完成**（用例已覆盖）；事件缺失 ⇒ 回落哨兵/unknown，不崩；异常堆栈 ⇒ `summarizeReason` 丢 `Traceback`/`File "…"` 行并截断至 120 字符（用例覆盖）。

---

## 6. 未解决问题 / 风险

1. **遗留的读法差异（已知、可接受）**：正常完成且未降级的 Agent，回放时显示的进度文案与实时一致（都是"已完成"）；但**降级**的 Agent 卡片在两条路径下都是 `completed`（因为它确实产出了内容），差异只体现在新增的"环节状态"提示列表里。这是刻意的——后端对降级 Agent 发的就是 `agent_completed`，若回放把它画成 failed，反而会制造新的实时/回放不一致。
2. **历史报告的"降级原因"多数仍为"原因未记录"**：本次改动前落库的报告中，工具失败/循环耗尽的 `degraded_reasons` **从未持久化**（只有报告级 `quality`）。这类旧报告重开后能看到 `quality` 横幅 + 环节级提示里也可能没有条目（因为既无结构化状态、也无事件），即**如实显示"原因未记录"**——不做向后补写、不编造。这是数据本身的缺，不是新逻辑的缺。
3. **`unknown` 的呈现口径**：`agent_results` 缺失/空（如 running、failed 的报告）会让各卡片落到 `pending`（"等待前置证据"），文案对"报告已结束但该环节无记录"略偏中性。已按"宁可说未知也不说成功"处理，但若评估者认为需要更直白的文案（如"未运行/未知"），只需改 `deep.agent.notice.unknown` 一个键。
4. **新增事件字段属向后兼容的加法**：`agent_completed` 多了 `status`/`degraded_reasons`；已知消费方（`routers/research.py`、`routers/analysis.py`、前端）均按字段读取，无位置依赖。`backend/app/routers/analysis.py:44` 的 docstring 列了事件类型，未逐一列字段，**无需同步**（按 Doc sync 规则属注释级）。
5. **未跑全量 pytest**（按本机约定与卡要求）；已额外覆盖两个真实调用 `run_research` 的相邻文件。

---

## 7. 最终态确认

```
> git status --porcelain
 M backend/app/services/research_orch.py
 M backend/tests/test_research_orch.py
 M frontend/src/i18n/en.ts
 M frontend/src/i18n/zh.ts
 M frontend/src/pages/Research.tsx
?? docs/ai/evo/IMPLEMENT_RESULT_VS20.md
?? frontend/tests/ResearchReplayAgentStatus.test.tsx
```

- 变异副本曾在 `src/`、`tests/` 下（`Research.vs20mutant.tsx`、`__vs20mutant.test.tsx`），**已用 `Microsoft.VisualBasic.FileIO.FileSystem.DeleteFile(..., 'SendToRecycleBin')` 送回收站**，全仓 `*mutant*` 检索零命中；**§3.3/§3.4 的门禁是在移除副本后的干净树上重跑的**（这也是为什么 `ResearchReplayAgentStatus.test.tsx` 是 11 例、`Test Files 7 passed`）。
- `frontend/src/app.css` 已还原（见 §1 末）。
- 交付文件 `TEMP-REPRO|TEMP_REPRO|MUTATED|XXX-TEMP|VS20-MUTANT` 扫描：**零命中**（命中项均在 `AGENTS.md`/历史 evo 文档中，与本卡无关）。
- **未 commit**；未触碰在途的 VS-21 文件（`backend/app/services/llm_client.py`、`backend/tests/test_llm_client.py`）。
