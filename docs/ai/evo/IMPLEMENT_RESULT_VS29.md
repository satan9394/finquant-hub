# IMPLEMENT_RESULT — VS-29 三态契约收口（加载中 / 空 / 失败 必须可区分）

> 状态：**完成（前端）**。工作树基线 `5f2268c`（VS-30 任务书），开工时 `git status --porcelain` 为空。
> 未 commit。未加依赖、未改后端、未改 schema、未删文件。

## 0. 契约设计（含理由）

### 决定
把 `frontend/src/components/LoadFailureAlert.tsx` 从"一个错误 Alert"升级为**三态契约的唯一实现处**，分三层：

| 层 | 导出（本文件内行号） | 职责 |
| --- | --- | --- |
| 判据类型 | `type ReadState`（:22）= `loading \| empty \| error \| ready` | 三态是一个**判别联合**（一个值），不是三个可以同时为真的布尔量 |
| 判据函数 | `readStateOf({ failed, resolved, count, error })`（:51） | **唯一**决定优先级的地方 |
| 渲染 | `LoadStateView`（:98） | **唯一**渲染三态的地方：一个 `switch`，四分支互斥 |
| 渲染 | `LoadFailureAlert`（:68，**契约收窄**） | 只负责错误态；`LoadStateView` 的错误分支固定转调它 |

`readStateOf` 的优先级（**全产品唯一**）：

```
1. failed      → error    失败优先于一切；失败时绝不冒称"没有数据"
2. count > 0   → ready    手上有内容就先给内容（刷新在途不清空已读到的）
3. resolved    → empty    "暂无…"只在这里成立（成功读过且确实为空）
4. 其余        → loading  兜底：还没有任何结论时宁可说"加载中"
```

### 为什么这么设计
1. **根因是"契约缺维度"，不是"某个面写错了"**。旧契约只有 `error`/`onRetry`，调用点只能各自拼
   `loading`/`empty`，于是**优先级被每个使用点各写一遍**（谁先判 `length===0`、谁先判 `failed` 全凭手感）
   —— "加载中仍渲染空态文案"因此屡修屡现（VS-22 只分开了"失败 vs 空"，"加载中 vs 空"未分）。
   把优先级收进 `readStateOf` 后，**新增一个面也不可能写出第二种优先级**。
2. **互斥性由结构保证，而不是靠自觉**：`LoadStateView` 用 `switch` 渲染，四个分支不可能同时产出；
   "暂无…"文案在源码里**只存在于 `empty` 那一个分支**。这是"加载中不得伪装成空"的可判定形式。
3. **`loading` 是兜底分支，判据是"还没有结论"而不是"请求在途"**：于是"在途"永远不会退化成"暂无…"。
   它同时解释了两种"在途"的正确处置：**已读到内容的刷新**仍是 `ready`（内容不清空），
   **失败后的重试**仍是 `error`（失败态不清 —— 见 §4 口径）。
4. **保留 `LoadFailureAlert` 的名字与旧 props 形状**（`message`/`error`/`onRetry`）：VS-22/VS-25 的既有实现与
   测试是围绕它写的，**只收窄它的文档契约、不改它的调用形状**，把"改共享契约修新坏旧"的风险压到最低。
   真正"只要错误态"的位置（`Discussion` 角色列表的两处错误态）继续直接用它的唯一形态。
5. **空态内容由调用方显式给出**（`emptyContent`），缺省时刻意**不写任何"暂无…"文案**（只有图标）：
   宁可少说一句，也不替调用方冒称"没有数据"。

### 三态在源码里的落点（可 grep 复核）
- `loading` 分支：`LoadFailureAlert.tsx:139-151`（唯一一处 `<Spin>` 加载文案出口）
- `empty` 分支：`LoadFailureAlert.tsx:152-157`（唯一一处 `Empty` 出口）
- `error` 分支：`LoadFailureAlert.tsx:158-164`（唯一一处 `LoadFailureAlert` 出口，之后 `default` 分支给内容）

## 1. 改动清单（文件:行）

| 文件 | 行 | 改了什么 |
| --- | --- | --- |
| `frontend/src/components/LoadFailureAlert.tsx` | :22 / :51 / :98 / :68 | 新增 `ReadState`、`readStateOf`、`LoadStateView`；`LoadFailureAlert` 契约收窄为"只负责错误态" |
| `frontend/src/components/ResearchRuns.tsx` | :19（新增 `loading?` 入参）、:26（`readStateOf`）、:33（`LoadStateView`） | "研究运行"区块补 loading 维度；空态仍是 `<p>UNKNOWN</p>`（但**只**在成功且为空时） |
| `frontend/src/pages/Dashboard.tsx` | :72-79（`loadStats` 不再在重试发起时清失败态）、:84-86（三个兄弟 loader 同口径）、:105-116（三态事实 + 共用重试）、:130-155（两张卡片改 `LoadStateView`）、:157（`ResearchRuns` 传 `loading`） | 首页两张"最近记录"卡片 + 研究运行区块三态可辨；全页读取口径统一 |
| `frontend/src/pages/Chat.tsx` | :16（import）、:339-:376（左栏改 `LoadStateView`） | 会话左栏补 loading 维度；失败仍不藏本地新建的会话 |
| `frontend/src/pages/Discussion.tsx` | :52-:57（详情三态状态）、:141（`detailRequestRef`）、:172-194（`loadRoomDetail` 抽出、切房间即作废旧内容、请求序号丢弃过期响应）、:196-208（effect）、:329-334（`scopedDetail` + `detailState`）、:363-398（左栏 `LoadStateView`）、:414-457（详情 `LoadStateView`） | ①切房间失败不串台 ②失败原位报错 + 可点重试（不再停在 Spin）③左栏在途不伪装成"暂无讨论" |
| `frontend/src/components/MemoryManager.tsx` | :32-:36（读取失败/动作失败拆开 + `resolved`）、:41-:54（`load` 仅成功才清）、:116（`memoryState`）、:136（动作失败另置）、:140-:206（`LoadStateView`） | 消掉"读取失败 + 暂无研究记忆"同屏并存 |
| `frontend/src/i18n/zh.ts` :1124/:1128/:1863/:1904/:1912/:2476、`frontend/src/i18n/en.ts` :1124/:1128/:1863/:1905/:1913/:2477（**同键**，行号因该区域多一行英文注释而相差 1） | 6 个新键 | `today.recordsLoading` / `today.runsLoading` / `chat.listLoading` / `discussion.listLoading` / `discussion.detailFailed` / `memory.loading`，**zh/en 双写** |
| `frontend/tests/ReadStateThreeWay.test.tsx` | 新增（19 用例） | 三态互斥、loading 不出空态、不串台、同屏不矛盾、口径统一 |

未改动的相关面（有意）：`Discussion` 角色列表的两处错误态继续直接用 `LoadFailureAlert`（它们没有 loading/empty 语义，
是"只要错误态"的位置）。

## 2. 三态对照实测

新用例文件 `frontend/tests/ReadStateThreeWay.test.tsx`（19 用例全绿，见 §3）。三夹具构造方式：

| 面 | loading 夹具 | empty 夹具 | error 夹具 |
| --- | --- | --- | --- |
| 首页两张卡片（会话/讨论） | `/dashboard/stats` 返回 **永不 settle** 的 promise | 返回 `statsFixture`（两个 recent_* 为 `[]`） | `Promise.reject(new Error('stats upstream unavailable'))` |
| 首页"研究运行"区块 | 同上 | 同上 | 同上 |
| Chat 左栏 | `/chat/sessions` 永不 settle | 返回 `{ items: [] }` | （VS22 既有用例：reject） |
| Discussion 左栏 | `/discussion/rooms` 永不 settle | 返回 `{ items: [] }` | （VS22 既有用例：reject） |
| Discussion 右栏详情 | 切房间后详情请求在途 | 不可达（成功响应缺 `room` 也归为失败，见 `Discussion.tsx:183`） | `/discussion/rooms/43` reject |
| MemoryManager | `fetchMemories` 永不 settle | `mockResolvedValue([])` | `mockRejectedValue(...)` |
| `LoadStateView` 本体 | 四态直接构造 | 同左 | 同左 |

关键断言（原文摘录，去掉了无关注释）：

```
// ①互斥（契约层）
✓ loading / empty / error / ready 四态各自只渲染自己那一支
   loading: getByText('正在读取会话列表…') 有；'暂无会话' / 失败文案 / '真实内容' 全 null
   empty:   getByText('暂无会话') 有；加载文案 / 失败文案 null
   error:   getByText('会话列表读取失败') + getByText('network down') 有；'暂无会话' / 加载文案 null
   ready:   getByText('真实内容') 有；'暂无会话' null

// ②加载中不出现空态文案 / UNKNOWN（首页）
expect(screen.queryByText('暂无会话')).toBeNull();
expect(screen.queryByText('暂无讨论')).toBeNull();
expect(within(runsBlock()).queryByText('UNKNOWN')).toBeNull();      // ← 研究运行区块
await waitFor(() => expect(screen.getAllByText('正在读取最近记录…')).toHaveLength(2));
expect(within(runsBlock()).getByText('正在读取研究运行记录…')).toBeTruthy();
// 再三态互斥：加载中同时不出现失败文案
expect(screen.queryByText('近期记录读取失败')).toBeNull();
expect(screen.queryByText('研究运行记录读取失败')).toBeNull();

// ③加载中不出现空态文案（左栏 + 记忆）
Chat 左栏：   expect(screen.queryByText('暂无会话')).toBeNull()  →  getByText('正在读取会话列表…')
Discussion：  expect(screen.queryByText('暂无讨论')).toBeNull()  →  getByText('正在读取讨论列表…')
Memory：      expect(screen.queryByText('暂无研究记忆')).toBeNull() → getByText('正在读取研究记忆…')

// ④不串台（切 42 → 43，43 的详情请求失败）
✓ 切房间失败 ⇒ 右栏显示失败态 + 重试，绝不显示上一条内容
   await findByText('上一条讨论')                      // 先确认右栏确实是上一条的内容
   fireEvent.click(screen.getByText('新选的讨论'))       // 切到失败的那一条
   await getByText('讨论详情读取失败') / getByText('room 43 unavailable') / role=button 重试
   expect(within(content()).queryByTestId('committee')).toBeNull();   // ← 不再渲染任何委员会内容
   expect(within(content()).queryByText('上一条讨论')).toBeNull();     // ← 更不是上一条的议题
   expect(within(content()).queryByText('正在加载讨论详情…')).toBeNull();

// ⑤同屏不矛盾（MemoryManager）
function expectNotBothFailureAndEmpty() {
  const failure = screen.queryAllByText('记忆读取失败，请稍后重试。').length;
  const empty = screen.queryAllByText('暂无研究记忆').length;
  expect(`${failure > 0 ? 'F' : '-'}${empty > 0 ? 'E' : '-'}`).not.toBe('FE');   // 三者都必须不是 'FE'
}
   loading 用例：无失败文案、无空态文案
   empty   用例：有'暂无研究记忆'、无失败文案
   error   用例：有失败文案 + 底层原因、**无'暂无研究记忆'**

// ⑥口径：重试在途不清失败态（首页 / 详情 / MemoryManager 各一条）
   第一次 reject、第二次永不 settle → 点重试 → 失败文案仍在原位，
   '暂无…' 与加载文案都不出现。
```

## 3. 门禁原始输出（含鉴别力证明）

### 3.0 门禁命令
- vitest：`cd frontend && .\node_modules\.bin\vitest.exe run <file...>`（等价于 `bun run test` 的 runner，v4.1.10）
- 构建：`cd frontend && bun run build`（= `prebuild(openapi 检查) && tsc -b && vite build`），**串行**执行

### 3.1 新增用例（19/19）
```
 ✓ tests/ReadStateThreeWay.test.tsx (19 tests) 7014ms
 Test Files  1 passed (1)
      Tests  19 passed (19)
```

### 3.2 零回归（VS-19 / VS-22 家族 + 本卡动的面）
```
 ✓ tests/ListFailureNotEmptiness.test.tsx (14 tests) 9369ms      ← VS-22 三处成果
 ✓ tests/ReadStateThreeWay.test.tsx (19 tests) 7014ms            ← 本卡新增
 ✓ tests/Discussion.test.tsx (10 tests) 4836ms
 ✓ tests/MemoryManager.test.tsx (3 tests) 2940ms
 ✓ tests/ResearchRuns.test.tsx (4 tests) 975ms
 Test Files  5 passed (5)
      Tests  50 passed (50)
```
```
 ✓ tests/Dashboard.test.tsx (16 tests) 15385ms                   ← VS-19 两张卡片
 ✓ tests/LatestNews.test.tsx (2 tests) / tests/MarketBrief.test.tsx (2 tests)
 ✓ tests/TodayMarketPulse.test.tsx (2 tests) / tests/TodayNeedAttention.test.tsx (2 tests)
 Test Files  5 passed (5)
      Tests  24 passed (24)
```
```
 ✓ tests/DiscussionRolesUnavailable.test.tsx (6 tests) 7902ms    ← VS-25 成果（角色列表错误态用的是 LoadFailureAlert 本体）
 ✓ tests/ChatSessionDeepLink.test.tsx (14) / tests/ChatDeadlineSignal.test.tsx (5)
 ✓ tests/ChatBacktestRedirect.test.tsx / tests/DiscussionStreaming.test.tsx (5) / tests/DiscussionTimeline.test.tsx (2)
 Test Files  5 passed (5)   Tests  34 passed (34)
 ✓ tests/AuthUnavailable.test.tsx (17)   ← 内含 i18n zh/en 键集合一致性断言
 ✓ tests/MonitorToday.test.tsx (2) / tests/CorePrimitiveI18n.test.tsx (1) / tests/AppNavigation.test.tsx (4)
 Test Files  4 passed (4)   Tests  24 passed (24)
```

### 3.3 i18n 键集合（脚本核对）
```
zh=2493 en=2493          (2487 + 本卡新增 6，两边各一份)
zh dup: 0   en dup: 0
key diff: 0
```

### 3.4 构建（串行）
```
$ tsc -b && vite build
dist/index.html                                   0.55 kB │ gzip:   0.34 kB
✓ built in 55.57s
exit=0
```

### 3.5 鉴别力证明（变异 → 新用例变红）
**变异窗口已声明**：两次变异都只临时改动 `frontend/src/components/LoadFailureAlert.tsx`，跑完立刻还原，
并用 SHA256 复核（改前 = 改后 = `36472A666009554C03EAB82E35B290369D38503D8950F0131C43B0A2BEDF6600`）；
`git status` 复核无临时文件残留，`TEMP-MUTATION|TEMP-REPRO|MUTATED|XXX-TEMP` 扫描为空。

**变异 A —— 把契约退回"没有 loading 维度"的旧形态**
（`readStateOf` 兜底分支由 `{status:'loading'}` 改回 `{status:'ready'}`）：
```
 ❯ tests/ReadStateThreeWay.test.tsx (19 tests | 6 failed) 18097ms
     × 还没有任何结论时兜底为 loading —— 而不是空态
     × loading / empty / error / ready 四态各自只渲染自己那一支
     × loading：在途期间不出现"暂无会话/暂无讨论"，研究运行区块也不出现 UNKNOWN
     ✓ empty：请求成功且为空 ⇒ 才出现"暂无…"与 UNKNOWN（…）
     ✓ error：失败 ⇒ 无空态文案、无 UNKNOWN、无加载文案（…）
     ✓ 口径：重试在途**不清失败态**（…）
     × Chat 左栏：/chat/sessions 在途 ⇒ 加载态，且"暂无会话"一个字都没有
     ✓ Chat 左栏：成功且为空 ⇒ 才出现"暂无会话"（…）
     × Discussion 左栏：/discussion/rooms 在途 ⇒ 加载态，且"暂无讨论"一个字都没有
     × loading：在途 ⇒ 加载态，既不说失败也不说"暂无"
     ✓ 切房间失败 ⇒ 右栏显示失败态 + 重试，绝不显示上一条内容
 Test Files  1 failed (1)
      Tests  6 failed | 13 passed (19)
```
（注意：VS-19/VS-22 语义的 empty/error 用例在这一变异下**仍然全绿** —— 变异精确打在"加载中"这一维上。）

**变异 B —— 把"加载中"当成"空"渲染**（`LoadStateView` 的 loading 分支改为渲染 `emptyContent`；
这正是本卡要消灭的旧形态）。原始输出（未删改）：
```
 FAIL  tests/ReadStateThreeWay.test.tsx > VS29 左栏列表：在途时不得出现空态文案 > Chat 左栏：/chat/sessions 在途 ⇒ 加载态，且"暂无会话"一个字都没有
AssertionError: expected <div class="ant-empty-description"></div> to be null

- Expected:
null

+ Received:
<div
  class="ant-empty-description"
>
  暂无会话
</div>

 ❯ tests/ReadStateThreeWay.test.tsx:257:40
```
```
 ❯ tests/ReadStateThreeWay.test.tsx (19 tests | 5 failed) 5216ms
     × loading / empty / error / ready 四态各自只渲染自己那一支
     × loading：在途期间不出现"暂无会话/暂无讨论"，研究运行区块也不出现 UNKNOWN
     × Chat 左栏：/chat/sessions 在途 ⇒ 加载态，且"暂无会话"一个字都没有
     × Discussion 左栏：/discussion/rooms 在途 ⇒ 加载态，且"暂无讨论"一个字都没有
     × loading：在途 ⇒ 加载态，既不说失败也不说"暂无"
     ✓ 切房间失败 ⇒ 右栏显示失败态 + 重试，绝不显示上一条内容
     ✓ empty / error / 口径 等 14 条
 Test Files  1 failed (1)
      Tests  5 failed | 14 passed (19)
```
⇒ **加载中一旦伪装成空，新用例必然变红**（5 条），而"失败/空"家族的既有判据不受影响 —— 鉴别力落在本卡的核心维度上。

## 4. 口径统一：重试期间是否清失败态

**统一做法（本卡后）：仅成功才清。** 依据：清掉会让用户以为"已经好了"，而请求其实还在往返/又失败了。

| 面 | 修前 | 本卡后 | 用户可见差异 |
| --- | --- | --- | --- |
| `Chat` 左栏 `loadSessions` | 仅成功才清（注释即"刻意不清"） | 不变 | — |
| `Discussion` 左栏 `loadRooms` | 仅成功才清 | 不变 | — |
| `Discussion` 角色 `loadAgents` | 仅成功才清 | 不变 | — |
| `Discussion` 详情 `loadRoomDetail` | **失败态不存在**（只弹一次 toast、`roomDetail` 只在 `!currentRoomId` 时清空） | 新增失败态，**仅成功才清** | 修前：永久 Spin + 切房间串台；修后：失败态 + 重试 |
| `Dashboard.loadStats`（两张卡片 + 研究运行） | **重试发起时先清**（`setStatsFailed(false)`） | **仅成功才清** | 修前：重试往返期间闪回"暂无会话/暂无讨论"；修后：失败态保持到成功 |
| `Dashboard.loadDecisionInbox` / `loadMarket` / `loadNews` | **重试发起时先清**（`setXError('')`） | **仅成功才清** | 状态口径统一；这三处的在途呈现本就是 `Card loading` 骨架（既有行为，未改） |
| `MemoryManager.load` | **重试发起时先清**（`setError('')`） | **仅成功才清** | 修前：重试往返期间闪回"暂无研究记忆"；修后：失败态保持到成功 |
| `MemoryManager` 的**动作**失败（确认/编辑/删除/导出） | 与读取失败共用一个 `error` | 拆为独立的 `actionError` | 不再与"暂无研究记忆"互相否定；动作失败可与内容并存 |

未纳入本次统一的遗留站点（**如实列出，本卡未动**）：全仓扫描到约 **40 处** "发起时清失败态"
（同一行签名 5 处：`Settings.tsx:57/68/122/133/143`；两行签名 35 处：`AlphaResearchPanel`(2)、
`PortfolioRiskWorkbench`、`FundamentalsSourcePanel`(2)、`MCPServerSettingsPanel`、`PricingConfigPanel`(2)、
`SystemSettingsPanel`(2)、`UsageRecordsPanel`、`DiscoverThemes`、`StockChart`(2)、`Discover`、`LimitPool`、
`McpMarket`、`Portfolio`(4)、`Settings.tsx:383`、`StockAnalysis`、`StrategyLab`(4)、`Thesis`(6)）。
这些多是**设置/表单/动作类**的局部错误态（不属于"读取三态"家族，也不走 `readStateOf`/`LoadStateView`），
本卡按"不把共享契约改动扩散到无关功能面"的原则**没有动它们**；如需彻底统一，应另开一张卡逐面判定
（判据：该面是否同时存在 loading/empty/error 三种可辨状态）。

## 5. 未解决问题 / 风险

1. **`Discussion` 详情的"空"状态不可达**（有意）：成功响应里没有 `room` 对象时按"没能读到详情"归为失败
   （`Discussion.tsx:183`），而不是"这个房间是空的"。因此该面**没有** `empty` 文案出口 —— 这是设计选择，
   不是遗漏；若后端将来会返回"空房间"，需在此处显式给 `emptyContent`。
2. **失败时保留旧内容的策略是分面的**（已在 §4 表内逐条说明）：左栏列表 / MemoryManager **保留**已知存在的记录
   并原位标注失败（失败不得顺手藏掉真实记录，承 VS-22 的既有决定）；`/dashboard/stats` **保留空**（VS-19 的既有决定：
   失败就不把过期快照当当前事实，未改）。两条都在界面上可辨，不构成"失败伪装成空/空伪装成失败"。
3. **`announceLoading` 默认关闭**：侧栏列表与主内容区可能同时在途，多个 live region 会互相打断；
   只有 `Discussion` 详情开启 `role="status"`。这也是既有断言 `Discussion.test.tsx:55`
   （`getByRole('status')` 唯一命中）继续成立的前提。若将来给左栏也开，需先解决该断言的唯一性问题。
4. **新用例对整页渲染的用例显式写了 `20000` 超时**（`Dashboard`/`Chat`/`Discussion`/`MemoryManager` 各面）。
   **这是预防性的、不是对已观测失败的放宽**：本次所有运行中这些用例的实测耗时 ≤ 2.6s（含被外部中断前的那次），
   断言一条未放宽；沿用仓库既有先例（`DiscussionRolesUnavailable.test.tsx:109` 对"整页渲染 + Modal + 多次 waitFor"
   显式给足时间，理由同为"本机在其它 agent 并行跑测试时会超过默认 5s"）。若评估者要求纯默认超时，
   可把 `, 20000` 去掉后在本机负载较低时重跑 —— 但**不得据此放宽任何断言**。
5. **`LoadStateView` 的 `emptyContent` 缺省是"只有图标的 Empty"**（无文案）：这样缺省不会替调用方冒称
   "没有数据"。代价是：将来新增调用点若忘记传 `emptyContent`，用户会看到"图标 + 空白"而不是"暂无…"。
   这是**有意的失败方向**（少说优于说错），但属于需要评审知晓的取舍。
6. **未 commit**（按卡要求）。本卡未动 `frontend/tests/ResearchFollowupPrompt.test.tsx` 与
   `frontend/tests/ResearchWorkspaceEvidence.test.tsx` —— 它们在本卡开工后由 **VS-31** 改成在途状态，与本卡无关。

## 6. 环境与噪声说明（如实记录，未据此改动任何代码/断言）

1. **一次批量运行被外部中断**：`vitest run tests/Dashboard.test.tsx tests/Discussion.test.tsx
   tests/DiscussionRolesUnavailable.test.tsx tests/DiscussionStreaming.test.tsx tests/DiscussionTimeline.test.tsx`
   曾以 `Error: subprocess-local: Windows Job runner exited with exit code 4294967295 before proving its managed
   range empty` 结束（**无测试结论**）。事后收到 VS-31 的跨卡通报：它在清理自己的孤儿进程时判据过宽，**误杀了**
   一个 `vitest.mjs run tests/Dashboard.test.tsx`。我**不能证明**这次异常就是它造成的（通报方也明确不作此主张），
   故**以重跑结果为准**：上述 5 个文件已**逐个/分组重跑并全绿**（见 §3.2），未因该次中断放宽任何断言或超时。
2. **本卡门禁窗口内有他卡并发**：VS-31 在同一工作树改动的是 `frontend/tests/*.test.tsx`。
   `bun run build` 的作用域是 `tsc -b`（tsconfig `include: ["src"]`）+ `vite build`（同样只吃 `src`），
   **不含测试文件**，故该并发不影响本卡构建结论；但我不能证明"窗口内没有其它并发因素影响耗时数字"。
3. **未观察到任何 `Test timed out in 5000ms`**，因此没有出现"负载导致的假红"这一情形；§5.4 的显式超时是预防性的。
