# EVALUATION_RESULT — Vertical Slice 13（前端补 `case 'agent_failed'`）

> **独立评估者**（Evaluator，非实现者）。评估对象：commit `650ba2a`（VS-13，由 Orchestrator 接管实现）。
> 方法：**不采信自述**，全部结论来自 git diff、原始代码、真实运行的测试/构建，以及一条评估者自建并即时销毁的组件级 SSE 测试。日期：2026-09-13。

## 判定

**ACCEPT**（无阻断项；原 4 条非阻断观察中 **F1 已关闭、F2 已修订**，见第四节末"F1 处置"）

理由一句话：`agent_failed` 分支确实存在且接线正确，成功在**真实渲染 + 真实 SSE 解析**下把该 Agent 卡片终结为 `failed` 并显示原因，且不弹全局错误、不误报整轮失败；`error` / `done` 逐字未改；门禁（18 用例 + build）全绿。

评估者**额外自查了一条自述中承认未验证的环节（switch 接线）**：先用临时组件级测试实测接线，再按编排者裁定**固化为常驻文件** `frontend/tests/ResearchAgentFailedWire.test.tsx`，并以**变异实测**证明"删掉 `case 'agent_failed'` 时它会挂"。原"测试防线不覆盖接线"的非阻断项（F1）现已关闭——详见 §四"F1 处置"。

> **收尾追加（2026-09-13）**：本次收尾只改**测试文件与文档**，未改动任何实现文件（`git diff -- frontend/src/pages/Research.tsx` 为空，SHA256 与变异前备份一致）；**未 commit**。

## 一、逐条核验（必做项）

| 检查点 | 结论 | 证据 |
|---|---|---|
| `agent_started`→running / `agent_completed`→completed / `agent_failed`→failed+progress | ✅ | `Research.tsx:85-93`；三态映射与 `progress` 注入正确 |
| 未知 `role_key` 原样返回**同一引用** | ✅ | `Research.tsx:86` `if (idx < 0) return agents;`；测试 `:65-66` 用 `toBe(input)` 断言 |
| `case 'agent_failed'` **不调用** `message.error` | ✅ | `Research.tsx:333-337` 分支体内无任何 `message.*`；`message.error` 的全部调用点是 `:204/:238/:264/:275/:361(仅 error 分支 idx<0 时)/:375`。**并且**评估者的组件级测试用 `vi.spyOn(message,'error')` 实测**零调用** |
| `case 'error'` 与 `case 'done'` **逐字未改** | ✅ | `git show 650ba2a -- frontend/src/pages/Research.tsx`：整个 diff 只有 2 个 hunk——①新增 `applyAgentEvent`（`:68-94`）②`agent_started`/`agent_completed` 改为调用纯函数 + 插入 `agent_failed`。`error`(`:357-363`) 与 `done`(`:342-356`) 未出现在 diff 中 |
| 三个 agent 分支都已改为调用纯函数，无遗漏内联 | ✅ | `:321` / `:325` / `:335` 全部走 `applyAgentEvent`。`error` 分支 `:359-360` 仍是内联 `AGENT_KEYS.indexOf`——这是任务书 `§不能破坏` 明确要求**不得合并或改写**的，属预期 |

### 等价性判断（"改成纯函数后是否与改动前逐字等价"）

- `agent_started`/`agent_completed` 的状态结果**逐字等价**（同一 `status` 字面量、同一 `prev.map` 形状）。
- 未知 `role_key`：旧代码**根本不调用** `setAgents`；新代码调用 `setAgents(updater)` 但 updater 返回**同一引用**，React 依 `Object.is` 跳过子组件重渲染。**效果等价**。唯一理论差异：React 文档说明这种 bailout "may still need to render that specific component before bailing out"，即页面组件本身可能多渲染一次（子组件不渲染、effect 不触发）。对未知 `role_key` 这种罕见事件而言**无实际影响**，不构成回归。
- 索引取值时机更稳健：旧代码在回调外算 `idx` 再作用于 `prev`；新代码在 updater 内基于 `prev` 计算，因 `AGENT_KEYS` 恒为常量且 `agents` 始终同序同长，二者一致。

## 二、端到端链路核验（不只看前端）

VS-13 的修复价值取决于"事件真的能到 switch"，故链路两端都查了：

1. `research_orch.py:345`（agent `LLMError`）与 `:384`（`node_failed`）→ 载荷 `{"role_key": ..., "error": ...}`；
2. `routers/research.py:296` `yield {"event": event, "data": ...}` —— **非 `error`/`done` 的事件逐字透传**，故 `agent_failed` 以同名 SSE 事件到达客户端（`:265-273` 的致命分支只拦 `error`，未被误伤）；
3. `services/sse.ts:26/37/55` —— `readSSE` **无事件名白名单**，全部 dispatch；
4. `Research.tsx:313` `data.agent ?? data.role_key` 兼容两种载荷；
5. `Research.tsx:461` `agent.status === 'failed' → 'failed'`，`AgentStatusCard.tsx:12` 支持 `failed`（`CloseCircleOutlined` + `color="error"`），`:42` 渲染 `stage`（即 `progress`，失败原因），i18n 键 `agent.status.failed` 在 `zh.ts:2037` / `en.ts:2037` **双语齐全**（本卡未新增键，parity 未受影响）。

→ **链路完整，失败卡片确实会显示为"失败，可继续"并带出原因。** 不存在"置 failed 但 UI 不显示"的问题。

### 评估者自建的接线证据（临时文件，已送回收站）

结果文件 `§三.1` 自认"未渲染组件驱动真实 SSE"。评估者认为**这是本卡唯一未被执行的验证**，故自建一条组件级测试：mock `fetch` 返回真实 `ReadableStream`，渲染真实 `<Research>`，`fireEvent.click` 开始按钮，喂入 `report_started → agent_started(financial_analyst) → agent_failed(financial_analyst, error='研究 Agent 异常：boom') → agent_completed(risk_assessor) → done(quality=degraded)`：

```
✓ tests/__eval_vs13_tmp.test.tsx (1 test) 2590ms
```
断言全部通过：屏上出现 `研究 Agent 异常：boom`；`失败，可继续` 标签恰好 1 个；`message.error` spy **零调用**；`done` 后降级横幅出现（整轮仍完成）。文件已 `SendToRecycleBin` 销毁，`git status` 干净，**未改任何实现文件**。

→ 这一步把"接线仅由代码审阅保证"升级为**运行时已证**，也是判定 ACCEPT 的关键依据。

## 三、任务书验收标准对照

1. **失败卡片终结** ✅（纯函数单测 + 评估者组件级实测双重证据）
2. **不影响其他 Agent** ✅（`ResearchAgentFailed.test.tsx:31-42`）
3. **不弹全局错误** ✅（代码事实 + 评估者 spy 实测；但**交付的测试套件未覆盖**，见 F1）
4. **报告级零回归** ✅（diff 未触碰 `done`/降级横幅；`ResearchReportToMarkdown.test.tsx` 12 用例全绿；评估者实测降级横幅仍出现）
5. **门禁** ✅（`bun x vitest run tests/ResearchAgentFailed.test.tsx tests/ResearchReportToMarkdown.test.tsx` → **2 files / 18 tests passed**；`bun run build`（含 `tsc -b`）→ **✓ built in 40.02s, exit 0**，与 vitest 未并行）

## 四、非阻断观察（不构成 REJECT，但建议记账）

- **F1（测试防线不覆盖接线，建议改进）**：`ResearchAgentFailed.test.tsx` 只 import `applyAgentEvent`（`:3`），**从不渲染页面**。因此——**删掉 `Research.tsx` 的 `case 'agent_failed'`，该文件 6 个用例（乃至全部 18 个）依然全绿**。也就是说，**本卡要修的那个缺陷本身，没有被任何一条常驻测试守住**。变异敏感性的准确结论：
  - 改 `applyAgentEvent` 的 `agent_failed` 分支返回 `completed` → 测试**会挂**（`:27` `toBe('failed')`、`:37-41`）✅ 敏感；
  - 删 `case 'agent_failed'`（真实缺陷形态）→ 测试**不会挂** ❌ 不敏感（结构性证明：测试从未引用页面默认导出）。
  **是否可接受：可接受。** 任务书 `§测试要求` 明确允许两条路径之一——"真实渲染组件 + mock SSE 数据源，**或用导出纯函数并在测试里驱动**"，实现者选了后者，合规；且评估者已用组件级测试补证接线正确。但**建议**后续把评估者那条组件级测试（约 60 行，harness 可抄 `ResearchDeepPlan.test.tsx:1-20`）以常驻形式补回仓库，否则同类回归仍会静默逃逸。**不建议**把 `agent_failed` 分支内联逻辑再抽一层只为了可测——收益低于复杂度。
- **F2（自述措辞过强）**：`ResearchAgentFailed.test.tsx` 顶部注释自称 "VS13 回归防线"，`IMPLEMENT_RESULT_VS13.md:9` 亦称抽取理由是"该缺陷由此逃逸"。**准确说法是"降低了逃逸概率，但未覆盖逃逸路径"**。建议后续修订注释，避免后来者误以为接线受保护。
- **F3（`report_lead` 卡片不会显示 failed，但两条路径一致）**：`research_orch.py:420` 对 lead 的 `LLMError` 发 `agent_failed("report_lead")`，随后 `:434` 无条件写 `agent_results["report_lead"]={"content": ""}` 并 `:439` 发 **`agent_completed("report_lead")`**。故实时卡片按"后到为准"（任务书 `§错误场景 3` 明确允许）终结为 **completed**；历史回放路径 `Research.tsx:235` 因内容为 `""` 不以 `【分析失败】` 开头，同样判 **completed**。**两路径一致，无残留不一致**，lead 的失败由报告级 degraded 横幅承载。副作用仅是卡片短暂 flash `failed → completed`。**属于后端事件序列的既有形态，不在本卡范围**，记录以免日后误判。
- **F4（历史路径无原因文本，属化妆品级差异）**：历史路径 `:232-236` 只置 `failed` 不写 `progress`；实时路径写原因并显示。**状态判定一致**（4 个研究 Agent 的两条后端失败路径 `:346`/`:389` 都写入同前缀 `【分析失败】`，与 `:235` 的判据同源），仅"是否显示原因"不同。此外结果文件 `:13` 说"本卡消除该不一致"略显宽松：消除的是**状态**不一致，原因文本仍不同。

### F1 处置（2026-09-13 收尾；编排者已采纳本项）

编排者裁定：**"删掉修复仍全绿"的测试比没有测试更糟**（制造虚假信心，而**接线**正是本次缺陷的逃逸路径）。故 F1 从"建议"升格为"立即固化"，F2 的措辞一并修订。执行结果如下。

**1) 接线防线已固化为常驻文件** `frontend/tests/ResearchAgentFailedWire.test.tsx`（新增，1 用例）：
mock `fetch` 返回真实 `ReadableStream` → 真实渲染 `<Research>` → `fireEvent.click` 开始 → 喂入
`report_started → agent_started(financial_analyst) → agent_failed(financial_analyst, error='研究 Agent 异常：boom') → agent_completed(risk_assessor) → done(quality=degraded)`；
断言 ①失败原因上屏 ②`.agent-status-card--failed` **恰好 1 个**且标签为"失败，可继续" ③`vi.spyOn(message,'error')` **零调用** ④`done` 后降级横幅出现。未改动任何实现文件（无新增可测性出钩子）。

**2) 变异实测（原始输出）**——把 `Research.tsx` 的 `case 'agent_failed': {` 临时改为 `case 'agent_failed__MUTATED_OUT__': {`（事件不再匹配任何分支，**等价于删掉该 case 的缺陷形态**）：

*基线（未变异，两文件一起）*
```
 ✓ tests/ResearchAgentFailedWire.test.tsx (1 test) 11209ms
 ✓ tests/ResearchAgentFailed.test.tsx (6 tests) 83ms
 Test Files  2 passed (2)
      Tests  7 passed (7)
```

*变异后（只跑接线文件）——**如预期挂掉***
```
 ❯ tests/ResearchAgentFailedWire.test.tsx (1 test | 1 failed) 3929ms
     × 把失败 Agent 的卡片终结为 failed 并显示原因，且不弹全局错误、不误报整轮失败 3925ms
 FAIL  tests/ResearchAgentFailedWire.test.tsx > Research SSE 接线 — agent_failed > 把失败 Agent 的卡片终结为 failed 并显示原因，且不弹全局错误、不误报整轮失败
TestingLibraryElementError: Unable to find an element with the text: 研究 Agent 异常：boom. (…) 
 ❯ tests/ResearchAgentFailedWire.test.tsx:74:25
 Test Files  1 failed (1)
      Tests  1 failed (1)
[exit code: 1]
```
→ 失败点正是**接线断言**（`:74` 断言只有 `switch → applyAgentEvent → progress → AgentStatusCard.stage` 这一条路能渲染出原因文本），确有变异敏感性。

*恢复后复跑（两文件一起）——**转绿***
```
 ✓ tests/ResearchAgentFailedWire.test.tsx (1 test) 3649ms
 ✓ tests/ResearchAgentFailed.test.tsx (6 tests) 24ms
 Test Files  2 passed (2)
      Tests  7 passed (7)
[exit code: 0]
```

**3) 恢复完整性核对（逐字）**：
```
git diff -- frontend/src/pages/Research.tsx   → 无输出（空）
SHA256(Research.tsx) = 662FFEEE336B4FAFDC100055F065779DA6E44CE9FCDA35F39EE39FEAC4B4D89F
SHA256(变异前备份)   = 662FFEEE336B4FAFDC100055F065779DA6E44CE9FCDA35F39EE39FEAC4B4D89F
```
`case 'agent_failed'` 已回到原位（`:333`），`case 'error'`（`:357`）与 `case 'done'`（`:342`）分支**自始至终未被触碰**（`git diff` 中 `Research.tsx` 整体为空，即相对 commit `650ba2a` 零差异）。`git status --porcelain` 仅显示：`M docs/ai/evo/IMPLEMENT_RESULT_VS13.md`、`M frontend/tests/ResearchAgentFailed.test.tsx`、`?? frontend/tests/ResearchAgentFailedWire.test.tsx`、`?? docs/ai/evo/EVALUATION_RESULT_VS13.md`（另 `M AGENTS.md`、`M task/CHANGELOG.md` 由编排者并行所改，非本评估者改动）。**未 commit。**

**4) 措辞修订（F2 / F4）**：`ResearchAgentFailed.test.tsx` 顶部注释改为"仅纯函数 `applyAgentEvent`……**降低**逃逸概率但**不覆盖接线**，接线由 `ResearchAgentFailedWire.test.tsx` 守护"；`IMPLEMENT_RESULT_VS13.md` 的"缺陷由此逃逸"改为"只**降低**了逃逸概率，并未被拦下"，"消除该不一致"限定为**状态层面**（并注明历史路径无原因文本、`report_lead` 由降级横幅承载），§三风险项 1 标记为 **✅ 已处置**。

**5) 门禁**：两文件一起 **2 files / 7 tests passed**；`bun run build`（`tsc -b` + vite）→ **✓ built in 32.87s, exit 0**（未与 vitest 并行）。

**结论**：F1 已**关闭**（接线现由常驻运行时测试守护，且经变异实测证明会挂）；F2 已修订。原判定 **ACCEPT 不变**，且本卡现具备"删掉修复就会挂"的真实回归防线。

## 五、复验命令（评估者实际执行）

```powershell
git show 650ba2a -- frontend/src/pages/Research.tsx        # 逐字 diff：error/done 未改
cd frontend; bun x vitest run tests/ResearchAgentFailed.test.tsx tests/ResearchReportToMarkdown.test.tsx
                                                            # 2 files / 18 tests passed
cd frontend; bun run build                                  # tsc -b + vite build, ✓ 40.02s, exit 0
```
未执行项（按调度约束）：全量 pytest、`tests/test_api.py`（沙箱挂起风险）；后端本卡无改动，`research_orch`/`routers/research.py` 仅只读核验。

## 六、结论

- **ACCEPT**：无阻断缺陷，实现与任务书 `§理想行为/§验收标准` 逐条吻合，且评估者以运行时证据补上了实现者自认的验证缺口。
- 挂账（非阻断，交编排者决定）：**F1** 建议补常驻组件级 SSE 接线测试；**F2** 修订过强措辞；**F3/F4** 仅记录，不需动作。
- 本评估**未修改任何实现文件**；临时测试文件已送回收站，工作区干净。
