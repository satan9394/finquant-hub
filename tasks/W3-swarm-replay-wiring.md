# W3 前端接线：swarm 历史运行入口 + 点选回放

- 状态：待执行
- 优先级：P1
- 创建日期：2026-09-13
- Mission：finquant-hub Mission 3（swarm 历史回放）
- 来源：**planned**，源自 `docs/ai/evo/SWARM_REPLAY_EVALUATION.md` §4
- 基线：`904829a0dc29029f901423e2babdaf44177a8e52`
- **依赖**：W1（`frontend/src/features/swarm/replay.ts`，已接受）、W2（`GET /api/swarm/runs`，已接受）

## 目标

让用户**真的能回看**：在 `SwarmStatusCard` 里列出当前 ticker 的历史 swarm 运行，点选即按落库事件回放。

## 接线点

1. `frontend/src/services/swarmApi.ts` 新增 `fetchSwarmRuns(ticker)`（调 `GET /api/swarm/runs?ticker=…`，返回 `{items:[{report_id,ticker,company_name,status,created_at,team_key,team_name}],total}`）。
2. `frontend/src/services/researchApi.ts` **已有** `fetchResearchReport(id)`（它已返回 `events`，见 Deferred Backlog 的类型欠账）。
3. `frontend/src/components/SwarmStatusCard.tsx`：新增历史区块——拉列表 → 展示 → 点选后用 W1 的 `replay.ts` 把 `events` 折叠成 `SwarmRunState` → **用既有的卡片内容渲染它**。

## 必须遵守的结构（本卡的要害）

1. **回放态与实时态共用同一套渲染**：不得为回放另写一份 agent 卡片/进度/状态标签的渲染。回放得到的 `SwarmRunState` 必须喂给**同一段 JSX**（可把现有渲染抽成组件或内联复用，但**判定逻辑与文案来源只能有一处**）。这是本项目铁律「同一件事的两条路径必须同源」的直接落点。
2. **三态契约**：历史列表读取失败 ⇒ 必须走族内唯一三态实现 `readStateOf` / `LoadStateView`（`frontend/src/components/LoadFailureAlert.tsx`），**文案 + 底层原文 + 真会重发的重试**；**绝不允许**把"读不出来"渲染成"没有历史运行"（这正是 VS-29/VS-38 一族反复修的东西）。空态只在**成功读取且确实为空**时出现。
3. **归属不猜**：W1 的 `replay.ts` 在无法判定团队时返回 `{ok:false, reason}`。UI 必须**显式呈现**这种不可判定（例如"这份记录不是 swarm 团队运行"），**不得**渲染成空卡片或全 pending 的 Agent 列表。
4. **不得改动** `state.ts`（实时路径）与 `features/swarm/replay.ts`（W1 已验收）。若你判断 `replay.ts` 有缺陷，**停下来说明**，不要自行改。

## 第一步（先做）
**先核实现状**：读 `SwarmStatusCard.tsx`（231 行）搞清现有渲染结构与状态；读 `replay.ts` 的导出签名；读 `researchApi.ts:124-127` 确认 `fetchResearchReport` 的实际返回（注意 `ResearchReportDetail` **类型上不带 `events`**，运行时才有 —— 你需要在类型层如何处理，请**明确说明你的选择与理由**）。

## 验收标准（客观门禁）

- [x] ① 现状核实：三个接线点的真实行号/签名 + "运行时才有 events" 的类型处理选择 —— 见《执行记录 §1》
- [x] ② 历史列表能列出该 ticker 的 swarm 运行（有数据 / 确实为空 / 读取失败三态各 1 条用例）—— 见 §3 用例清单
- [x] ③ 失败不得伪装成空：`历史运行列表读取失败` + 底层原文 `历史运行接口 503` + 可点重试，**且 `queryByText('该股票暂无历史 swarm 团队运行')` 为 null** —— 见 §1/§4
- [x] ④ 重试真重发：`fetchRuns` 调用计数 `1 → 2`，且第 2 次参数仍是 `'600519'` —— 见 §3
- [x] ⑤ 点选即回放：Agent 卡片内容含 `完成` / `工具 1 次 · 42 tokens`、**不含** `等待`，展开折叠后出现 `价值结论：低估` —— 见 §3
- [x] ⑥ 同源：回放与"同一批帧喂给实时路径"的 `data-testid="swarm-run-view"` 子树 `textContent` **`toBe` 逐字相等** —— 见 §3
- [x] ⑦ 不可判定不伪装：`swarm-replay-unavailable` 显式呈现，`queryAllByTestId(/^swarm-agent-/)` 为 **0**、无 `swarm-run-view`、无空态文案 —— 见 §3
- [x] ⑧ 既有测试全绿且未修改：`SwarmStatusCard.test.tsx` / `SwarmReplay.test.ts` 哈希见 §6，改动集不含任何既有测试文件
- [x] ⑨ 门禁：`Tests 26 passed (26)` / `Test Files 3 passed (3)`；`bun run build` → `✓ built in 25.58s`，`build-exit=0`
- [x] ⑩ 鉴别力证明：副本基线哈希 `7041DCA1…`；变异 `failed:false, resolved:true` ⇒ ③④ **TestingLibraryElementError**（非 timeout）—— 见 §4
- [x] ⑪ i18n：zh/en 各 2513 键、`only-zh []`、`only-en []`，W3 新增 14 键双语齐备 —— 见 §5
- [x] ⑫ 反向检验：4 条"错误写法也能全绿"的路径与各自的结构性拦截 —— 见 §7

## 限制条件 / 禁止事项

- **允许改**：`frontend/src/components/SwarmStatusCard.tsx`、`frontend/src/services/swarmApi.ts`、`frontend/src/i18n/zh.ts`、`frontend/src/i18n/en.ts`，以及**新增**测试文件与（若确有必要）**新增**一个子组件文件。
- **禁止改**：`frontend/src/features/swarm/state.ts`、`frontend/src/features/swarm/replay.ts`、任何既有测试文件、`backend/**`（W2 已完成）、`tsconfig*` / `package.json` / ruff 配置。
- 不 commit；**不得派生子 Agent**；不加依赖。
- 不跑全量 pytest、不跑全量前端 vitest（151 文件）。
- 变异只能在 `$env:TEMP` 副本里。删除一律进回收站；**禁止 `Remove-Item`/`rm`/`del`**；
  **清理临时文件时禁止用前缀通配**（Mission 3 / W2 刚因此误收了他人的 4 个文件）——请**逐条列出完整文件名**，且临时文件命名为 `m3w3-*` 以自证归属。
- 命令文本不得含永久删除类 API 字面名。

## 并发边界
本卡是 **Mission 3 当前唯一在跑的卡**（W1/W2 已结束并接受）。但仍请如实记录：若你看到超时类红灯，`AssertionError` 才算真红，纯 timeout 属负载噪声。

## 预期证据（执行器回填，≤400 行）
现状核实、改动（文件:行）、逐条用例结果、门禁原始输出、鉴别力证明（副本基线哈希 + 变红用例 + 失败原文）、i18n 核对、既有文件未被改的证明、偏差/残余风险。

## 执行记录（执行器回填，2026-09-13）

### §1 现状核实

**接线点 1** `frontend/src/services/swarmApi.ts`（原 59 行）：新增 `SwarmRunSummary` @ `:18-27`、`fetchSwarmRuns` @ `:37-45`。
调 `GET /swarm/runs?ticker=…`（后端 `backend/app/routers/swarm.py:111-135`，返回 `{items:[{report_id,ticker,company_name,status,created_at,team_key,team_name}],total}`）。
**`items` 不是数组 ⇒ 抛错，不降级成 `[]`**：空数组意味着"成功读到 0 条"，形状不符意味着"没读到"，两者在数据层就必须分开（`data.items ?? []` 正是那个错误写法）。

**接线点 2** `frontend/src/services/researchApi.ts:124-127`（原样，未改）：
```ts
export async function fetchResearchReport(id: number): Promise<ResearchReportDetail> {
  const response = await apiClient.get(`/research/${id}`);
  return response.data;
}
```
`ResearchReportDetail` 定义在 `frontend/src/types/research.ts:204-207` = `ResearchReportVersion & { report_data; agent_results? }` —— **声明上确实没有 `events`**。

**接线点 3** `frontend/src/components/SwarmStatusCard.tsx`（原 231 行）：
`export default function SwarmStatusCard({ ticker }: SwarmStatusCardProps)` @ 原 `:42`；状态标签表 `STATUS_PRESENTATION` @ 原 `:29-36`；进度 @ 原 `:162-164`；统计 @ 原 `:166-170`；Agent 卡片 @ 原 `:183-214`；输出折叠 @ 原 `:216-225`；**原文件没有任何历史区块**。

**W1** `frontend/src/features/swarm/replay.ts`：`export function replaySwarmRun(events: StoredSwarmEventRow[]): SwarmReplayOutcome` @ `:132`；`StoredSwarmEventRow` @ `:38-44`；`SwarmReplayOutcome` @ `:64-66`；`SwarmReplayFailureReason = 'empty_stream' | 'no_team_started' | 'invalid_team_definition'` @ `:56-62`。

**三态族实现** `frontend/src/components/LoadFailureAlert.tsx`：`readStateOf` @ `:51`、`LoadStateView` @ `:98`、默认导出 `LoadFailureAlert` @ `:68`。

#### "运行时才有 events"的类型处理（选择与理由）

**选择：不改 `types/research.ts`**（它不在本卡允许改动的文件集内），在 `SwarmStatusCard.tsx:96` 增加**一次结构收窄**：

```ts
function readStoredEvents(report: ResearchReportDetail): StoredSwarmEventRow[] | null
```

- 读 `(report as { events?: unknown }).events` —— 全文**唯一**的 `as`，只用来把"未知字段"取出来验，不用它断言类型；
- 不是数组 ⇒ `null`；
- 是数组则**逐行**要求 `id: number` + `event_type: string`，**任一行不合法即整份 `null`**（与 W1 对名册的态度一致：少一行、多一行伪造行都属于"数据不足以判定"）；
- `null` 由调用方当成**读取失败**（文案 + 原文 + 真重试），**不是**"这次运行没有事件"；`events: []` 才走 `empty_stream` 的显式不可判定。

**为什么不写 `as { events: StoredSwarmEventRow[] }`**：`as` 只骗编译器，字段缺失时运行时得到 `undefined`，`replaySwarmRun(undefined)` 会抛错；**更糟的是 `?? []`** —— 它把"响应里根本没有 events"渲染成"这次运行没有事件"，正是本卡禁止的那一类伪装。

### §2 改动（文件:行）

| 文件 | 行 | 内容 |
|---|---|---|
| `frontend/src/components/SwarmRunView.tsx`（**新增**，118 行） | `:32` `:41` `:52` | `STATUS_PRESENTATION` 状态标签表；`export default function SwarmRunView({ run, ticker }: { run: SwarmRunState; ticker: string })`；根节点 `data-testid="swarm-run-view"`。**整段**承载原 `SwarmStatusCard.tsx:162-228` 的进度/统计/报告已保存/Agent 卡片/输出折叠/边界文案 |
| `frontend/src/components/SwarmStatusCard.tsx` | `:56` `:67` `:72` `:96` `:140` `:217` `:270` `:277` `:310` `:326-356` `:377` | `REPLAY_UNAVAILABLE_KEYS`；`ReplayView`；`RunsFact`；`readStoredEvents`；`loadRuns`；`openReplay`；`historyState = readStateOf(...)`；`renderReplay`；**回放态** `<SwarmRunView run={view.outcome.state}>`；历史区块；**实时态** `<SwarmRunView run={run}>` |
| `frontend/src/services/swarmApi.ts` | `:18-27` `:37-45` | `SwarmRunSummary` / `fetchSwarmRuns` |
| `frontend/src/i18n/zh.ts` | `:1720-1734` | 注释 + 14 个 W3 键 |
| `frontend/src/i18n/en.ts` | `:1720-1734` | 同上（en） |
| `frontend/tests/SwarmReplayWiring.test.tsx`（**新增**，294 行） | 全文 | 10 条用例（②–⑦） |

#### 回放与实时如何共用同一段渲染

- 渲染段整体搬到 `SwarmRunView.tsx`，它只接受 **`SwarmRunState`**，不认这个值来自 SSE 折叠还是落库回放。
- `SwarmStatusCard.tsx` 里只剩两处 `<SwarmRunView`：`:310`（回放，`view.outcome.state`）与 `:377`（实时，`run`）。**没有第二份** Agent 卡片 / 进度 / 状态标签 / 文案来源。
- 单源结构证据（grep，本卡实测）：
```
== swarm-agent- testid ==          src\components\SwarmRunView.tsx:79
== research.swarm.status. ==       src\components\SwarmRunView.tsx:84   （:9 是模块注释）
== replaySwarmRun 实际调用点 ==    src\components\SwarmStatusCard.tsx:232   （其余为 import 与注释）
== <SwarmRunView 使用点 ==         src\components\SwarmStatusCard.tsx:310 / :377
```
- 作用域：`RunsFact`（`:72`）与 `ReplayView`（`:67`）**各自带 `ticker`**，渲染只认 `=== 当前 ticker` 的那一条（`:266` / `:269`）。理由：切股票时靠 `useEffect` 事后清空是在**提交之后**才跑，中间那一帧照样会显示上一只股票的列表/回放；把归属放进数据里，结构上不可能串台。回放请求另有 `replaySeq`（`:118`）保证只有最后一次点选的结果能落地。

### §3 用例清单与门禁原始输出

`frontend/tests/SwarmReplayWiring.test.tsx`（10 条，全绿）：
1. ② 有数据：列出该 ticker 的历史运行（含团队名与时间；`fetchRuns` 收到 `'600519'`；无空态文案）
2. ② 确实为空：成功读取且 0 条时才出现空态文案（且无失败呈现）
3. ②/③ 读取失败不伪装成空：失败文案 + 底层原文 `历史运行接口 503` + 可点重试，**`queryByText(空态文案)` 为 null**
4. ④ 重试真重发：计数 `1 → 2`，第 2 次参数 `'600519'`，成功后失败态被内容取代
5. ⑤ 点选即回放：`完成` / `工具 1 次 · 42 tokens` / 不含 `等待` / 统计区含 `62` / 展开折叠见 `价值结论：低估`
6. ⑤ 多条历史：点选的是**那一条**（`fetchReport(7777)` 被调用、`4242` 未被调用）
7. ⑥ 同源：实时（同一批帧喂 SSE）与回放的 `swarm-run-view` 子树 `textContent` `toBe` 相等
8. ⑦ 没有 `team_started` ⇒ `swarm-replay-unavailable` 显式呈现，`swarm-agent-*` 计数 0、无 `swarm-run-view`、无空态
9. ⑦ `events: []` ⇒ 显式"没有可回放的事件"，同样 0 个 Agent 卡片
10. ⑦ 响应里没有 `events` 字段 ⇒ 读取失败（带原文与重试），**不是**"没有事件"

门禁原始输出（`cd frontend`）：
```
$ vitest run tests/SwarmReplayWiring.test.tsx tests/SwarmStatusCard.test.tsx tests/SwarmReplay.test.ts
 Test Files  3 passed (3)
      Tests  26 passed (26)
   Start at  07:33:39
   Duration  28.19s (transform 536ms, setup 806ms, import 20.50s, tests 3.52s, environment 2.61s)
```
```
$ bun run build
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.
✓ built in 25.58s
build-exit=0
```
（首次运行时 ③④ 两条曾红：antd 在两个汉字间插空格 ⇒ 可访问名是 `重 试`；断言改为 `/重\s*试/` 后全绿。这是我方选择器写法问题，非产品缺陷。）

### §4 鉴别力证明

副本：`%TEMP%\m3w3-mutation\frontend`（robocopy 复制 `frontend`，`node_modules` 用 **junction** 指向真实目录；**变异只发生在副本内，仓库工作树未被触碰**）。

- 副本基线 `src/components/SwarmStatusCard.tsx` SHA256 = `7041DCA114BB3A5B3B1E5F946544D5A49C7F829B8CF43197C218BA37C75F44D8`（与仓库同名文件当时逐字节相同，已核对）。
- 变异（等价退法，"失败即当空列表"）：渲染处 `failed: scopedRuns.failed` → `failed: false`、`resolved: scopedRuns.resolved` → `resolved: true`；变异后哈希 = `CEE86EEB5BFE095EE55349B4818F6E5AA710C8E7C9C9675FBB17FD94D7AC64B7`。
- 两边用**同一份最终测试文件**：

```
=== MUTANT (失败即当空列表) ===
 Test Files  1 failed (1)
      Tests  2 failed | 8 passed (10)

=== 还原基线（哈希回到 7041DCA1…） ===
 Test Files  1 passed (1)
      Tests  10 passed (10)
```

失败原文：
```
× ③ 读取失败不得伪装成空：失败文案 + 底层原文 + 可点的重试，且**不出现**空态文案 1513ms
× ④ 重试真重发：以调用计数证明（1 → 2） 1479ms
FAIL  tests/SwarmReplayWiring.test.tsx > W3：… > ③ 读取失败不得伪装成空…
TestingLibraryElementError: Unable to find an element with the text: 历史运行列表读取失败. This could be because
the text is broken up by multiple elements. …
    152|     expect(await history.findByText(HISTORY_FAILED_TEXT)).toBeTruthy();
FAIL  tests/SwarmReplayWiring.test.tsx > W3：… > ④ 重试真重发：以调用计数证明（1 → 2）
TestingLibraryElementError: Unable to find an element with the text: 历史运行列表读取失败. …
    168|     expect(await history.findByText(HISTORY_FAILED_TEXT)).toBeTruthy();
 Test Files  1 failed (1)
      Tests  2 failed | 8 passed (10)
```

**红灯类型 = `TestingLibraryElementError`（找不到"历史运行列表读取失败"这个元素），不是 timeout**：两条用例各自在 1513ms / 1479ms 内返回失败，全程无任何超时信息（本仓默认 `testTimeout` 5s）。
变异体确实把失败渲染成了空态 —— 同一份失败输出的 DOM 截图：
```
    class="fq-load-state fq-load-state--empty"
      <span class="ant-typography ant-typography-secondary …">
        该股票暂无历史 swarm 团队运行
      </span>
```

### §5 i18n zh/en 核对

命令（`cd frontend`）：
```
bun -e "const zh=(await import('./src/i18n/zh.ts')).default; const en=(await import('./src/i18n/en.ts')).default; …"
```
输出：
```
zh keys 2513 | en keys 2513
only-zh []
only-en []
W3 keys: 14
research.swarm.historyEmpty :: 该股票暂无历史 swarm 团队运行 :: No past swarm team run for this ticker
research.swarm.historyItem :: 运行 #{id} · {team} · {time} :: Run #{id} · {team} · {time}
research.swarm.historyLoadFailed :: 历史运行列表读取失败 :: Could not load the list of past runs
research.swarm.historyLoading :: 正在读取历史运行… :: Loading past runs…
research.swarm.historyTitle :: 历史运行 :: Past runs
research.swarm.historyUnknownTeam :: 团队未知 :: Team unknown
research.swarm.replayBack :: 返回实时 :: Back to live
research.swarm.replayEmptyStream :: 这份记录没有可回放的事件 :: This record has no replayable events
research.swarm.replayHint :: 以下是该次运行落库事件的历史回放，不是实时状态。 :: This is a replay of the stored events of that run, not the live status.
research.swarm.replayInvalidTeam :: 这份记录的团队名册不可信，拒绝按猜测回放 :: The team roster in this record cannot be trusted, so replay would be a guess
research.swarm.replayLoadFailed :: 该次运行的事件读取失败 :: Could not load the events of that run
research.swarm.replayLoading :: 正在载入该次运行的事件… :: Loading the events of that run…
research.swarm.replayNoEventsField :: 该次运行的响应里没有 events 字段：无法回放；这不代表这次运行没有事件 :: The response for that run has no events field, so it cannot be replayed; this does not mean the run had no events
research.swarm.replayNotSwarmRun :: 这份记录不是 swarm 团队运行 :: This record is not a swarm team run
```
（既有 `tests/AuthUnavailable.test.tsx:335` 就断言 `Object.keys(translations.en).sort() === Object.keys(translations.zh).sort()`，上述 `only-zh/only-en` 与它同口径。）

### §6 既有文件未被改的证明

以**内容哈希 + mtime** 归档（不写"与 HEAD 一致"：W1/W2 的产物**至今未提交**，`HEAD`（`904829a0…`）里根本没有 `replay.ts`，那种写法在这里比的是不同的东西）：

```
frontend/src/features/swarm/state.ts        EA3143310489092A178373EC5DC9034003AEBB7307A5EBF27FBAF8D80E15FA50  2026-09-12 09:13:01
frontend/src/features/swarm/replay.ts       72A259D844B4D455F077DC29A4CE7524506EC81F24D06B6C9966D2C1F9F3D387  2026-09-13 06:54:37
frontend/tests/SwarmStatusCard.test.tsx     71E61F44C95B10D0B91D39FBDBC0D2281CB8805C40C4415A29F69BF190644563  2026-09-12 09:13:58
frontend/tests/SwarmReplay.test.ts          099596DC789F75F34007E6F31DA6A3DD9B33963BDA57EFBF3E258ADB72180993  2026-09-13 06:56:05
backend/app/routers/swarm.py                352A8BFFD3A06A7B…（W2 产物，未提交）                               2026-09-13 06:55:30
backend/tests/test_swarm_runs.py            1D6E898654A1F68B…（W2 产物，未跟踪）                               2026-09-13 07:04:48
docs/API_CONTRACT.md                        A72A6E1768A1A1D1…（W2 产物，未提交）                               2026-09-13 07:08:46
```
本卡全部写入发生在 **07:23:33 – 07:32:59**，上述文件 mtime 均早于 07:23:33：
```
frontend/src/components/SwarmRunView.tsx    A1F4CA327BA2E694…  07:23:33（新增）
frontend/src/services/swarmApi.ts           E6BB060AB63CC260…  07:23:45
frontend/src/components/SwarmStatusCard.tsx 7041DCA114BB3A5B3B1E5F946544D5A49C7F829B8CF43197C218BA37C75F44D8  07:24:22
frontend/src/i18n/zh.ts                     922EE181209A05F1…  07:24:55
frontend/src/i18n/en.ts                     A46EB309192DE915…  07:25:11
frontend/tests/SwarmReplayWiring.test.tsx   A2B45D45F1680985F1972FB775497FA2FBEC2EDAE972DBE2E0B28775C3D68247  07:32:59（新增）
```
`git status --porcelain`（收尾时）：
```
 M backend/app/routers/swarm.py                 ← W2，非本卡
 M docs/API_CONTRACT.md                         ← W2，非本卡
 M frontend/src/components/SwarmStatusCard.tsx  ← 本卡
 M frontend/src/i18n/en.ts                      ← 本卡
 M frontend/src/i18n/zh.ts                      ← 本卡
 M frontend/src/services/swarmApi.ts            ← 本卡
?? backend/tests/test_swarm_runs.py             ← W2，非本卡
?? frontend/src/components/SwarmRunView.tsx     ← 本卡（新增）
?? frontend/src/features/swarm/replay.ts        ← W1，非本卡（未跟踪）
?? frontend/tests/SwarmReplay.test.ts           ← W1，非本卡（未跟踪）
?? frontend/tests/SwarmReplayWiring.test.tsx    ← 本卡（新增）
```
改动集**恰好等于**允许清单：4 改（SwarmStatusCard / swarmApi / zh / en）+ 2 增（SwarmRunView / SwarmReplayWiring.test）。`state.ts`、`replay.ts`、任何既有测试、`backend/**`、`tsconfig*`、`package.json` 均不在其中（后两者连 `git status` 都不出现）。未 commit。

### §7 反向检验、偏差与残余风险

**反向检验：还有哪些"错误的写法"也能让用例全绿？**

1. **把回放渲染整段复制一份**（字段与文案抄得一字不差）⇒ 用例 ⑥/⑦ 仍会全绿，因为断言比的是**渲染结果**，不是**代码份数**。⇒ 这一条只能靠**结构性证据**堵：`swarm-agent-*` 与 `research.swarm.status.*` 只出现在 `SwarmRunView.tsx`，`SwarmStatusCard.tsx` 只有两处 `<SwarmRunView`（§2 的 grep）。**用例绿本身证明不了同源**，我只是把它连同结构证据一起归档。
2. **回放不走 `replay.ts`、UI 自己复制一份折叠语义**⇒ ⑤⑥ 仍可能绿（只要抄得一致）。同样只由结构证据堵：`replaySwarmRun` 的实际调用点在全文只有 `SwarmStatusCard.tsx:232` 一处。
3. **失败时"永远 loading"**（`failed:false, resolved:false`）而不是空态 ⇒ ③ 的 `findByText(失败文案)` 会红（已被覆盖）；**失败时直接不渲染任何东西**（`return null`）⇒ ③ 也会红。
4. **重试"假重发"**（只重渲染、不重发请求）⇒ ④ 会红；但**重试触发两次请求**（双发）也能让计数变成 2 而绿 —— 我的断言分不出"1 次"与"2 次"。这是已知盲区，语义上"多读一次"不产生"读不出来伪装成空"的缺陷，故未加严（要加严得断言"重试后总计数 == 触发次数 + 1"，但那会把实现细节写死）。

**偏差 / 残余风险（如实声明）**：
- **⑥ 只证明了"渲染结果逐字相同"，没证明"只有一份代码"**；后者由 §2 的 grep 结构证据承担，两者不可互相替代。
- **未覆盖"切 ticker 的中间帧"**：`RunsFact`/`ReplayView` 带 `ticker` 的作用域是**代码时序推理**（渲染时比较 `ticker`，不依赖 `useEffect` 事后清理），**没有实测**；RTL 的 `act` 冲刷看不到中间帧，写用例也证明不了它。
- **未覆盖多条历史里"先点 A、慢响应回来前再点 B"**：`replaySeq` 的作废逻辑（`SwarmStatusCard.tsx:218-236`）同样是**代码推理、未实测**。
- 回放不可判定时展示的 `detail` 来自 W1 `replay.ts` 的中文字面量，**不随语言切换**（en 界面下这句仍是中文）。这是 W1 已交付的产物、本卡禁止改 `replay.ts`，故按"底层原文原样带出"处理，未做二次包装。
- 变异实验的 `node_modules` 用 junction 指向真实目录，vitest 可能在真实 `node_modules/.vite` 里写了缓存（非源码、非交付物）；仓库 `git status` 收尾复核无新增/改动文件。
- 本窗口内本机有其他工作区（`E:\DeepSeek_Harness\workspace\2026_09_08\model-infra-kit`）在跑 node/pnpm 构建，**与本卡无关**；本卡 26 条用例与 build 均无 timeout 类红灯。

### §8 临时文件清理

全部临时文件都在 `%TEMP%`，命名前缀 `m3w3-`；清理**逐条列全名**、走回收站，未使用任何通配与前缀匹配：
- 目录 `m3w3-mutation`（先单独回收其内的 `frontend\node_modules` junction，再回收父目录）
- `m3w3-vitest-1.txt`、`m3w3-vitest-2.txt`、`m3w3-vitest-3.txt`
- `m3w3-build-1.txt`、`m3w3-build-2.txt`
- `m3w3-mutant-baseline.txt`、`m3w3-mutant-red.txt`、`m3w3-mutant-red2.txt`、`m3w3-baseline-2.txt`

仓库工作树内**没有**留下任何临时文件（`git status` 见 §6，只有允许清单内的 6 个文件）。

## 验收结论（Evaluator / 指挥会话回填）
- **PASS → 已接受**（2026-09-13，指挥侧独立复核；**非 fresh-context 独立评审**，见边界）
- 执行器：子代理 `033b04e1-e292-417e-8dd8-aa9737d11530`
- 指挥侧自己跑/核的（不引用执行器数字）：
  - **改动面**：`git status` 恰为允许清单 —— 4 改（`SwarmStatusCard.tsx`/`swarmApi.ts`/`i18n/zh.ts`/`i18n/en.ts`）+ 2 增（`SwarmRunView.tsx`/`SwarmReplayWiring.test.tsx`）；`tsconfig*`、`package.json` 连 status 都不出现
  - **禁止改的两个文件未动**：`state.ts` 与 `replay.ts` 在 `git status` 中**无 `M`**（`state.ts` 被跟踪且未改；`replay.ts` 未跟踪但其 SHA256 与 W1 交付时一致，由 W1/W3 各自独立报告同值佐证）
  - **单源结构证据（指挥侧重做，这是 ⑥ 的真判据）**：`swarm-agent-` 全仓只出现在 `SwarmRunView.tsx:79`；`research.swarm.status.` 只出现在 `SwarmRunView.tsx`；`replaySwarmRun(` 的**实际调用只有一处**（`SwarmStatusCard.tsx:232`，另一处 `:91` 在注释内）；`SwarmRunView` 入参为 `{ run: SwarmRunState; ticker: string }` —— **只认值、不认来源**；两处使用点 `:310`（回放）/`:377`（实时）指向同一组件
  - **门禁（指挥侧复跑）**：`bun run test -- tests/SwarmReplayWiring.test.tsx tests/SwarmStatusCard.test.tsx tests/SwarmReplay.test.ts` → `Test Files 3 passed (3)` / `Tests 26 passed (26)` exit 0；`bun run build` exit 0（`4265 modules transformed`）
  - **i18n（指挥侧重算）**：zh=2513 / en=2513、双向差集 0、重复键 0
- 接受但**未由指挥侧复跑**的执行器自述：鉴别力变异（`failed→false`、`resolved→true` 即"失败当空列表"）⇒ `2 failed | 8 passed`，失败原文为找不到「历史运行列表读取失败」，**无 timeout**，且变异体 DOM 确出现空态类名
- 指挥侧裁定：
  - **⑥ 的判据按「结构证据」而非「用例绿」** —— 执行器主动指出"渲染逐字相同"证明不了"只有一份代码"（复制粘贴一份也能全绿），并另给结构性 grep。**这个判断是对的**，指挥侧按结构证据采纳，并已独立重做上述 grep。
  - **`events` 缺失与 `events: []` 必须分开**：执行器用 `readStoredEvents()` 把"响应没有该字段/形状不符"判为**读取失败**（文案+原文+重试），只有真正的空数组才走 `empty_stream` 不可判定。**这是正确的**——`?? []` 会把"没读到"伪装成"这次运行没事件"，正是本族要消灭的假象。
- NIT / 已知盲区（执行器自述，指挥侧认同、均不阻塞）：
  1. **切 ticker 的中间帧作用域**与 `replaySeq` 对"先点 A 后点 B 慢响应"的作废，是**代码时序推理、未实测**（RTL 的 `act` 会吃掉中间帧；本项目已有同类教训）。
  2. 重试"双发"断言分不出（调用计数同样 1→2）。
  3. 不可判定时展示的 `detail` 是 `replay.ts` 里的中文字面量，en 界面下仍为中文（本卡禁止改 `replay.ts`，按"底层原文原样带出"处理）。
- **边界**：本判定由指挥侧做出，**不是 fresh-context 独立评审**。
