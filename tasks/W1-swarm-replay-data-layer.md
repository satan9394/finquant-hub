# W1 前端回放数据层：`research_events` → `SwarmRunState`

- 状态：待验收（执行器已回填证据，2026-09-13）
- 优先级：P1
- 创建日期：2026-09-13
- Mission：finquant-hub Mission 3（swarm 历史回放）
- 来源：**planned**，源自 `docs/ai/evo/SWARM_REPLAY_EVALUATION.md` §3/§4/§5
- 基线：`904829a0dc29029f901423e2babdaf44177a8e52`

## 目标

新增**纯函数**回放数据层：把一份已落库的 swarm 运行的 `research_events` 折叠成与实时完全相同的 `SwarmRunState`。

- 新增 `frontend/src/features/swarm/replay.ts`
- 新增 `frontend/tests/SwarmReplay.test.ts`（纯单元测试，**不渲染 React**）

## 必须遵守的结构

1. **同源**：回放必须折叠**同一个** `applySwarmEvent`（`frontend/src/features/swarm/state.ts:112`），不得另写一套事件语义。落库行 → 事件帧的映射是 `{ event: row.event_type, data: row.payload }`。
2. **团队与名册来自数据，不来自常量**：取**首个** `event_type === 'team_started'` 的行，其 `payload.team` 即 `public_team_definition()` 的产物（`{key, name, description, agents:[{key,name,avatar,dependencies,tools}]}`，见 `backend/app/services/swarm_orch.py:212-218`），用它调 `createSwarmRunState(team)`（`state.ts:66`）建初态，再按 `id` 升序折叠其余事件。
3. **严禁使用 `frontend/src/pages/Research.tsx:32` 的 `AGENT_KEYS`**：那是深度研究的 5 个角色，与 swarm 团队的角色键**存在真实碰撞**（`report_lead` 同属四大师与深度研究；`business_analyst`/`financial_analyst` 同属财报精读与深度研究）。
4. **无法判定归属时不得猜**：若事件流里**没有** `team_started`（例如这不是一份 swarm 报告），必须有**显式的可区分返回**（例如判别联合的 `{ ok: false, reason }`），**不得**退化成"一个空的/全 pending 的 RunState"——那会把"不是 swarm 运行"渲染成"swarm 什么都没跑"。

## 第一步（先做）
**先核实现状**并给证据：
- `frontend/src/services/researchApi.ts` 的 `fetchResearchReport` 返回类型（`frontend/src/types/research.ts` 里的 `ResearchReportDetail`）**是否真的带 `events`**，以及 `events` 条目的字段名（后端 `routers/research.py:474-481` 返回的是 `id / event_type / agent_role_key / payload / created_at`，且 `payload` 已被 `json.loads`）。**若类型定义与后端实际不符，直接说明**（那本身是一条发现）。
- `state.ts` 的 `SwarmEvent` / `SwarmRunState` / `applySwarmEvent` / `createSwarmRunState` 的真实签名与行号。

## 验收标准（客观门禁）

- [x] ① 现状核实（含 `ResearchReportDetail` 是否带 `events`、字段名、以及类型与后端是否一致）

  **核实结论：类型定义与后端实际不符——`ResearchReportDetail`（`frontend/src/types/research.ts:204-207`）不带 `events`。**
  后端 `GET /api/research/{id}`（`backend/app/routers/research.py:469-482`）**确实**注入
  `report["events"]`，且 `payload` 已 `json.loads`（`:479-480`）。行字段为
  `id / event_type / agent_role_key / payload / created_at`，按 `ORDER BY id`（`:475-477`）。
  前端 `fetchResearchReport`（`frontend/src/services/researchApi.ts:124-127`）直接
  `return response.data`，**没有任何类型断言/转换** ⇒ 运行时数据里有 `events`，
  但**类型层面看不见**（`busts` 不到 TS 检查）。页面侧因此各自另立局部类型：
  `Research.tsx:59-77` 的 `StoredAgentEvent` + `StoredReportDetail`（**这才是当前唯一
  带 `events` 的前端类型**）。本卡**不改** `types/research.ts`（越界），故在 `replay.ts`
  里自持一个结构化的 `StoredSwarmEventRow`（`replay.ts:38-45`），字段名与后端逐字对齐。
  这是本卡发现的**独立欠账**（不是本卡引入）：类型定义漏了一个后端真实存在的字段。

  `state.ts` 真实签名（已读，未改）：
  - `SwarmEvent`：`:43-46` `{ event: string; data: Record<string, unknown> }`
  - `SwarmRunState`：`:35-41` `{ status; agents: Record<string, SwarmAgentState>; totalTokens; reportId?; error? }`
  - `createSwarmRunState(team: SwarmTeamDefinition): SwarmRunState`：`:66-78`
  - `applySwarmEvent(state, frame: SwarmEvent): SwarmRunState`：`:112-197`（`report_started` 在 `:116-117`）

- [x] ② 正常回放：给定 `team_started` + 若干 `agent_started`/`tool_call`/`agent_completed`/`done` 的行序列，折叠结果与"把同一批帧喂给实时 `applySwarmEvent`"**逐字段相同**（请用一个用例显式对照两条路径）
  用例「四大师全程…」（`SwarmReplay.test.ts:118-181`）：12 行夹具 → 折叠；另一条路径用
  **同一份 source 各自 JSON 往返一次**（两路输入互相独立，避免共享引用让对照失去意义）后
  逐帧 `reduce(applySwarmEvent, createSwarmRunState(team))`。断言 `toEqual` 两侧
  **state 与 frames 都逐字段相同**，并另断言具体终态（reportId=4242 / status=partial /
  totalTokens=160 / 每卡 status·tokenCount·toolCalls·content / `swarmToolCalls=2`
  / `swarmProgress=100`），避免"两边一起错"也能通过。

- [x] ③ **归属取自数据**：断言最终名册来自 `team_started.payload.team`；并给一条**反例**——若把名册换成 `AGENT_KEYS`，`business_analyst`（财报精读）/`report_lead`（四大师）会被映射到**错误**的角色集合，该断言必须能识别
  用例「③ 终态名册 = payload.team.agents（逐字段、含顺序），且 `team_started` 不在首位也能取到」
  （`:220-238`）：`outcome.team` 与夹具 `fourMastersTeam` 全等；名册键序 =
  `payload.team.agents` 键序；每卡的 `{key,name,avatar,dependencies,tools}` 逐字段等于 payload 条目。
  反例用例（`:240-262`）：用 `AGENT_KEYS` 建"假名册"，断言 `agentKeys(wrongState) === AGENT_KEYS`
  且 `!== agentKeys(outcome.state)`；`report_lead` 在正确名册里是「投研主编」、
  在假名册里是字面 `'report_lead'`。第二条例（`:264-286`）把假名册喂**同一批帧**，
  证明 `report_lead` 的 token=66 在正确名册下能读到、在假名册下 `agents.value_investor` 直接不存在
  （错误名册把不属于它的事件静默丢弃）。

- [x] ④ **反向断言**：`four-masters` 的 `report_lead` 与深度研究语境互不干扰；`earnings-review` 的 `business_analyst` 不被当成深度研究角色
  用例「④ `four-masters` 的 `report_lead` 是"投研主编"」（`:292-308`）：`team.key === 'four-masters'`、
  `name === '投研主编'`、`dependencies === [value_investor, tech_analyst, macro_strategist, risk_manager]`。
  用例「④ `earnings-review` 有 6 个角色」（`:310-337`）：名册键序 =
  `[business_analyst, financial_analyst, competition_analyst, risk_analyst, earnings_editor, reader_reviewer]`，
  `business_analyst` 的名字是「生意本质分析师」，且 `industry_researcher` / `risk_assessor`
  两个**深度研究专属键必须不存在**。用例「④ 团队外的 `role_key` 事件被忽略」
  （`:339-360`）：`report_lead` 事件落进财报精读运行 ⇒ 不凭空造出该 Agent（`toBeUndefined`），
  而 `business_analyst` 事件这次**是**该团队成员 ⇒ 计入 tokenCount=30。两个真实碰撞键各验一遍。

- [x] ⑤ 无 `team_started` ⇒ 显式不可判定（**不是**空 RunState）；`team_started` 不在首位也要能处理（按事件类型找，不按位置假设）
  判别联合 `SwarmReplayOutcome`（`replay.ts:64-66`）：成功分支 `{ ok: true, state, team, frames }`，
  失败分支 `{ ok: false, reason, detail }`，`reason ∈ {empty_stream, no_team_started, invalid_team_definition}`
  （`:56-62`）。用例（`:366-419`）：一份"深度研究报告"事件流 ⇒ `ok===false` 且
  `reason==='no_team_started'`，并显式断言 **`'state' in outcome === false`**（消费方**不可能**
  把它误读成空 RunState）、失败分支只有 `{detail, ok, reason}` 三个键；空数组 ⇒ `empty_stream`
  （与前者可区分）；派生的"合法团队定义"四种坏形态 ⇒ `invalid_team_definition`。
  「不在首位」由 `replay.ts:145-147` 的 `events.find(row => row.event_type === 'team_started')` 保证
  （按类型找），并由用例 `:220-238`（`team_started` 在第 2 行、且 `value_investor` 事件位次早于它、
  仍按 id 折叠被记到）与「行序打乱不影响结果」（`:183-197`，整体 `reverse()` 后终态一致）覆盖。

- [x] ⑥ `reportId` 能从 `report_started`（`state.ts:116`）还原
  用例（`:199-215`）：`report_started` 在 `team_started` **之前** ⇒ 4242；在**之后** ⇒ 77
  （折叠按 id 升序，两者都能还原）；**没有** `report_started` ⇒ `reportId` 保持 `undefined`
  （不猜、不补 0）。

- [x] ⑦ 门禁：`cd frontend && bun run test -- tests/SwarmReplay.test.ts` **全绿**；`bun run build` **exit 0**
  ```
  $ vitest run tests/SwarmReplay.test.ts
   RUN  v4.1.10 E:/Code_file/Projects/finquant-hub/frontend
   Test Files  1 passed (1)
        Tests  13 passed (13)
      Start at  07:00:52
      Duration  770ms (transform 76ms, setup 406ms, import 96ms, tests 10ms, environment 0ms)
  TEST-EXIT=0
  ```
  ```
  dist/assets/vendor-antd-iGqrvHzh.js           1,566.95 kB │ gzip: 491.20 kB
  (!) Some chunks are larger than 500 kB after minification. ...
  ✓ built in 1m 3s
  BUILD-EXIT=0
  ```
  （`prebuild` 的 `openapi_tsgen.py --check` 一并通过；`dist/` 是否被版本控制覆盖不在本卡范围。）

- [x] ⑧ **鉴别力证明**：`%TEMP%` 副本内把"按 `team_started` 定名册"退回成"用 `AGENT_KEYS`"（或等价退法）⇒ **至少一条用例语义性变红**（贴原始输出；红灯须是 `AssertionError`/`TestingLibraryElementError`，不是 timeout）。**不得在真实工作树做变异**
  副本：`C:\Users\SATANC~1\AppData\Local\Temp\fqh-w1-mut`（`node_modules` 走 junction），
  仅复制 `replay.ts / state.ts / SwarmReplay.test.ts / vite.config.ts / tests/setup.ts / package.json`。
  **基线哈希（副本内的 `replay.ts`，与真实工作树逐字节相同）**：
  `72A259D844B4D455F077DC29A4CE7524506EC81F24D06B6C9966D2C1F9F3D387`
  **副本未变异基线**：`Test Files 1 passed (1) / Tests 13 passed (13) / Duration 1.48s`，exit 0。

  **变异 A**（`replay.ts` 尾部折叠行换成"用固定 5 个 `AGENT_KEYS` 常量建名册"）：
  `9F3127AA87827AFF0E5BF24344AB10D11710F70EE3800C5D02DD04F12B2B3866` ⇒
  ```
   ❯ tests/SwarmReplay.test.ts (13 tests | 7 failed) 57ms
       × 四大师全程：终态与"把同一批帧喂给实时 applySwarmEvent"逐字段相同 28ms
       × 行序打乱不影响结果（按 id 升序折叠，不按数组位置假设） 3ms
       × ③ 终态名册 = payload.team.agents（逐字段、含顺序），且 team_started 不在首位也能取到 3ms
       × ③ 反例：用 AGENT_KEYS 建名册会让 report_lead / business_analyst 落到错误的角色集合 3ms
       × ④ four-masters 的 report_lead 是"投研主编"，不带任何深度研究角色语义 4ms
       × ④ earnings-review 有 6 个角色：business_analyst 不是深度研究角色，deep-research 专属键不出现 3ms
       × ④ 团队外的 role_key 事件被忽略，不会凭空造出 Agent（两个真实碰撞键都验一遍） 2ms
  ⎯⎯⎯ Failed Tests 7 ⎯⎯⎯
  FAIL … 正常回放 > 四大师全程…
  AssertionError: expected { status: 'partial', …(4) } to deeply equal { status: 'partial', …(4) }
  ❯ tests/SwarmReplay.test.ts:157:27
  FAIL … ③ 终态名册 = payload.team.agents…
  AssertionError: expected [ 'business_analyst', …(4) ] to deeply equal [ 'value_investor', …(4) ]
  ❯ tests/SwarmReplay.test.ts:233:38
  FAIL … ④ four-masters 的 report_lead 是"投研主编"…
  AssertionError: expected 'report_lead' to be '投研主编' // Object.is equality
  ❯ tests/SwarmReplay.test.ts:305:51
  FAIL … ④ earnings-review 有 6 个角色…
  AssertionError: expected [ 'business_analyst', …(4) ] to deeply equal [ 'business_analyst', …(5) ]
  ❯ tests/SwarmReplay.test.ts:333:38
        Tests  7 failed | 6 passed (13)
     Duration  1.98s (transform 570ms, setup 704ms, import 565ms, tests 57ms, environment 0ms)
  ```
  **变异 B**（等价退法之二：名册字段仍取自 `payload.team`，但用 `AGENT_KEYS` 常量做 `filter`）：
  `1FEB9033AB0857345873B8AE395B44CBCEE2320C39556E98D182EA2E4AF54F8A` ⇒
  ```
   ❯ tests/SwarmReplay.test.ts (13 tests | 6 failed) 49ms
     × 四大师全程… / × 行序打乱… / × ③ 终态名册… / × ③ 反例… / × ④ earnings-review 6 角色… / × ④ 团队外 role_key…
  AssertionError: expected [ 'report_lead' ] to deeply equal [ 'value_investor', …(4) ]
  AssertionError: expected [ 'business_analyst', …(1) ] to deeply equal [ 'business_analyst', …(5) ]
        Tests  6 failed | 7 passed (13)
     Duration  863ms (transform 94ms, setup 311ms, import 115ms, tests 49ms, environment 0ms)
  ```
  **两次变异的红灯全部是 `AssertionError`，0 条 timeout、0 条挂起**；`Duration` 均 < 2s
  （本机 vitest 常态 0.7–1.5s，故这不是"负载下超时"造成的假红）。
  变异后已把副本 `replay.ts` 还原，哈希复算 = `72A259…D387` =
  真实工作树文件哈希，且 `Select-String 'TEMP-MUTATION'` 命中数 = 0
  （即"红→绿"的唯一差异就是那一行折叠语句，不是别的东西）。

- [x] ⑨ 反向检验：说明「有没有另一种**错误**的写法也能让用例全绿」
  **能想到，且已在用例里堵住主要的一条**：
  (a) **"名册字段仍取自 `payload`，只是把哪些人算进名册的规则写错"（如上变异 B）——
      这条能被 ③ 的逐字段名册断言拦住（副本实测 6 红）**，不构成漏网。
  (b) **不能排除的一条**：把 `readTeamDefinition` 的校验放宽/收紧（例如允许 `agents` 为空、
      或把缺 `avatar` 的条目静默丢弃后继续）。当前用例只钉住了"合法定义必须逐字段还原"和
      "这四种坏形态必须失败"；**若有人改成"丢掉坏条目继续折叠"，只有恰好命中这四形态之外的
      坏数据才会逃逸**——本卡无法穷举所有坏形态，这是**残余风险**（见下）。
  (c) **结构性上最要紧的一条**：只用"用例全绿"反推"实现正确"是不成立的——真正的正确性
      判据是 `replay.ts` **没有第二套事件语义**（它只 `import` `state.ts` 的
      `applySwarmEvent` / `createSwarmRunState`，全文没有任何 `switch (event)` / 状态字段直写）。
      这一条由②的 `outcome.frames` 逐帧等于实时帧、且两条路径产出的 state `toEqual` 共同承载，
      而不是由"跑绿了"承载。

## 限制条件 / 禁止事项

- **只允许新增/修改** `frontend/src/features/swarm/replay.ts` 与 `frontend/tests/SwarmReplay.test.ts`。**不得改 `state.ts`**（它是实时路径，已验收；若要扩展其导出请先说明并等指挥侧裁决）。**不得改任何既有测试。**
- 不 commit；**不得派生子 Agent**。
- 不加依赖；不改 `tsconfig*` / `package.json` / ruff 配置。
- 不跑全量 pytest、不跑全量前端 vitest（151 文件）。
- 变异/临时文件只能在 `$env:TEMP` 副本里。删除一律进回收站，**禁止 `Remove-Item`/`rm`/`del`**；命令文本不得含永久删除类 API 字面名。
- 清理进程按"精确匹配你自己的命令行"正向匹配，**绝不用排除法**。

## 并发边界
同窗口并行卡 **W2**（后端只读端点，改 `backend/app/routers/swarm.py` 等，**不碰 `frontend/`**，**不跑 build**）。**只有你跑 build**。若见超时类红灯：`AssertionError` 才算真红，纯 timeout 属负载噪声，如实标注、**不得放宽断言**。

## 预期证据（执行器回填，≤400 行）
改前/改后、`replay.ts` 关键实现、逐条用例结果、门禁原始输出、鉴别力证明（副本基线哈希 + 变红用例 + 失败原文）、既有文件未被改的证明、偏差/残余风险。

### 改动面（改前 / 改后）

改前：`frontend/src/features/swarm/` 只有 `state.ts`（实时路径，220 行）；`git status` 里
`frontend/` 无任何改动。改后**只新增 2 个文件**（无既有文件被改）：

```
?? frontend/src/features/swarm/replay.ts     (新增)
?? frontend/tests/SwarmReplay.test.ts        (新增)
```

**既有文件未被改的证明**：`git status --short` 里 `frontend/` 下**只有**上述两个 `??`（未跟踪）
条目，没有任何 ` M`（已跟踪文件被改）；`git diff --stat` 只列出
`backend/app/routers/swarm.py`（**并行卡 W2 的改动，不是本卡的**）。
`state.ts` 未被触碰——本卡全程没有对它发起过写操作，且 `replay.ts` 对它的依赖只有
`import { applySwarmEvent, createSwarmRunState, type SwarmEvent, type SwarmRunState, type SwarmTeamDefinition }`。

### `replay.ts` 关键实现（行号）

| 位置 | 内容 |
|------|------|
| `replay.ts:38-45` | `StoredSwarmEventRow`：`id / event_type / agent_role_key? / payload? / created_at?`，与后端 `research.py:474-481` 逐字对齐 |
| `replay.ts:47-54` | `SwarmReplayResult`：`{ state, team, frames }`（成功分支） |
| `replay.ts:56-62` | `SwarmReplayFailureReason`：`empty_stream` / `no_team_started` / `invalid_team_definition` |
| `replay.ts:64-66` | `SwarmReplayOutcome` 判别联合（失败分支**没有** `state` 字段） |
| `replay.ts:93-118` | `readTeamDefinition(payload)`：从 `payload.team` 收窄出 `SwarmTeamDefinition`；**任一 Agent 不合法 ⇒ 整个团队不合法**（不丢条目继续） |
| `replay.ts:121-123` | `toFrame(row) = { event: row.event_type, data: row.payload }`——**唯一**的落库行→事件帧映射点 |
| `replay.ts:145-147` | `events.find(row => row.event_type === 'team_started')`——按**类型**找，不按位置假设 |
| `replay.ts:161-166` | `[...events].sort((l, r) => l.id - r.id).map(toFrame)` → `reduce(applySwarmEvent, createSwarmRunState(team))` |

关键三行（`replay.ts:161-166`，**没有第二套事件语义**——全文无 `switch (event)`、无状态字段直写）：
```ts
const frames = [...events]
  .sort((left, right) => left.id - right.id)
  .map(toFrame);
const state = frames.reduce<SwarmRunState>(applySwarmEvent, createSwarmRunState(team));
```
设计取舍（写明，供裁决）：`team_started` **自身也参与折叠**。它只把 `status` 置 `running`、
清 `error`（`state.ts:118-119`），与 `createSwarmRunState` 的初态幂等，故不引入实时路径没有的语义；
若把它排除在外，"回放 = 把同一批帧喂给实时"就无法**逐字**成立（`frames` 会与实时帧集合不等）。

### 逐条用例结果（13 条，1 passed file）

| 用例 | 覆盖 | 结果 |
|------|------|------|
| 四大师全程：终态与实时逐字段相同 | ② | PASS |
| 行序打乱不影响结果（按 id 升序） | ⑤（不在首位/顺序假设） | PASS |
| ⑥ `reportId` 从 `report_started` 还原（前/后/缺三种） | ⑥ | PASS |
| ③ 终态名册 = `payload.team.agents`（逐字段、含顺序、不在首位） | ③⑤ | PASS |
| ③ 反例：`AGENT_KEYS` 建名册 ⇒ 错误角色集合 | ③ | PASS |
| ③ 反例的判别力：错误名册读不到 `report_lead` 的 token | ③ | PASS |
| ④ `four-masters` 的 `report_lead` 是"投研主编" | ④ | PASS |
| ④ `earnings-review` 6 角色，deep-research 专属键不出现 | ④ | PASS |
| ④ 团队外 `role_key` 事件被忽略，不凭空造 Agent | ④ | PASS |
| ⑤ 无 `team_started` ⇒ `no_team_started`，且无 `state` | ⑤ | PASS |
| ⑤ 空事件流 ⇒ `empty_stream`（与前者可区分） | ⑤ | PASS |
| ⑤ `payload.team` 坏形态 ⇒ `invalid_team_definition`（不支持退化） | ⑤ | PASS |
| ⑤ 失败分支 `reason` 是有限枚举，三者可区分 | ⑤ | PASS |

两次中途变红（最终态已修正，均属**我自己的期望写错**，不是实现缺陷，如实记录）：
① `swarmProgress` 期望 80 实际 100——`skipped`/`failed` 也在
`TERMINAL_AGENT_STATUSES`（`state.ts:48-50`）里，5/5 终态 ⇒ 100%；已改断言并补注释说明
"整轮不圆满"由 `run.status === 'partial'` 承载。
② `earnings-review` 6 条 `agent_completed` 后未发 `done` ⇒ `status` 仍是 `running`（复刻实时行为）；
已补 `done` 帧。

### 偏差 / 未完成 / 残余风险

1. **无阻塞性偏差**；①②③④⑤⑥⑦⑧⑨ 全部有实测证据。
2. **越界未做（如实标注）**：`ResearchReportDetail` 缺 `events` 字段是**类型层的真实欠账**，
   修它要改 `frontend/src/types/research.ts`（本卡禁止）。本卡用自持的
   `StoredSwarmEventRow` 绕过，**运行时不受影响，但类型层仍看不见 `events`**。
3. **残余风险**：`readTeamDefinition` 的合法性判据只覆盖了 4 种坏形态用例；"把坏条目丢掉
   继续折叠"这类改法**只能被部分拦住**（见 ⑨(b)），无法穷举。
4. **并发边界**：本窗口有并行卡 W2（只碰 `backend/`，改 `routers/swarm.py` + 新增
   `tests/test_swarm_runs.py`，不跑 build）。本卡的 vitest 与 `bun run build` 都在
   `frontend/` 内、**未受 W2 影响**；两次变异运行全程 `Duration < 2s`、**0 timeout**，
   故不存在"负载噪声假红"的疑点。反过来说，**我也不能证明 W2 的 pytest 是否被我的
   build 影响**——它自己不跑 build，边界在此。
5. **未提交**（按要求）；变异副本 `%TEMP%\fqh-w1-mut` 与其 `node_modules` junction 已
   先行单独回收 junction、再回收父目录（`Test-Path` 均为 `False`），真实
   `frontend\node_modules` 完好；收尾核对无本卡遗留的 `node/bun/vitest` 进程。

## 验收结论（Evaluator / 指挥会话回填）
- **PASS → 已接受**（2026-09-13，指挥侧独立复核；**非 fresh-context 独立评审**，见边界）
- 执行器：子代理 `a66b03b3-d0e9-48bc-91be-3a69669b0149`
- 指挥侧自己跑的命令与结果：
  - **源文件未被越界改**：`git status` 中 `frontend/` 下**只有两个 `??` 新文件、无 `M`**；`git diff --name-only -- frontend/src/features/swarm/state.ts` **无输出**（实时路径未动）
  - **结构自证（指挥侧重做，不引用执行器 grep）**：`replay.ts` 全文 **`switch` 0 命中**（无第二套事件语义）；`AGENT_KEYS` **唯一命中在注释第 14 行**（"**不得**用页面里的 `AGENT_KEYS`"），非代码；唯一映射点 `:121` `{ event: row.event_type, data: … }`；`team_started` 按**事件类型**查找（`:139` `.find(row => row?.event_type === 'team_started')`），非按位置；折叠点 `:161` `frames.reduce<SwarmRunState>(applySwarmEvent, createSwarmRunState(team))`；失败分支类型（`:66`）**确无 `state` 字段**
  - **门禁（指挥侧复跑）**：`bun run test -- tests/SwarmReplay.test.ts` → `Test Files 1 passed (1)` / `Tests 13 passed (13)` / exit 0
- 接受但**未由指挥侧复跑**的执行器自述：`bun run build` exit 0；两次变异（改用 `AGENT_KEYS` 建名册 ⇒ 7 failed；常量做 filter 的等价退法 ⇒ 6 failed，均 0 timeout）
- 指挥侧裁定：
  - **`team_started` 自身参与折叠：维持**。它与 `createSwarmRunState` 初态幂等（只置 `status='running'` 并清 `error`），排除它反而使"回放 = 把同一批帧喂给实时"的逐字对照不成立 ⇒ 包含它是**同源性**的正确取舍。
  - **类型欠账**（`ResearchReportDetail` 不带 `events`）**不在本卡修**——已记入 `RUN_STATE.md` Deferred Backlog，建议单独开卡。
  - **取消态无法回放**：`cancelSwarmRun` 是客户端状态迁移、不产生事件 ⇒ 被取消的运行回放仍是 `running`。属**回放忠实于落库事件**的固有边界，已记入 Deferred Backlog。
- NIT（非阻塞）：`readTeamDefinition` 的坏形态判据只覆盖 4 种，"丢掉坏条目继续折叠"只能被部分拦住、无法穷举（执行器自述，指挥侧认同）。
- **边界**：本判定由指挥侧做出，**不是 fresh-context 独立评审**（Mission 2 的两个验收/评估子代理曾执行失败，故 Mission 3 仍由指挥侧兜底）。
