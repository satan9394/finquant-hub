# IMPLEMENT_RESULT — VS-26：修掉既有测试的竞态（测试卫生）

> 实现者自述。**本卡零生产代码改动**：仓库内只改了 `frontend/tests/ResearchWorkspaceEvidence.test.tsx` 一个文件的 3 处**等待方式**。
> 骨架先落盘（改码前），随后逐节回填实测原始输出。
> **变异窗口声明**：本卡所有变异/鉴别力实验均在 `$env:TEMP` 的副本内进行（`vs26-mutant\*`），**仓库工作树从未处于变异态**，全程为交付态。

## 0. 一句话结论
把 `ResearchWorkspaceEvidence.test.tsx` 的 **3 处「await A → 同步断言 B」**（原 `:295`/`:321`/`:336`）改为**等待 B 成立后再断言**（现 `:298`/`:327`/`:344`）：改后**单跑 14 passed**、**与 VS-24 新测试同跑连续 3 次 24 passed**（改后合计 7 次全绿，噪声样本见 §4.5）、**期望值一字未改**（§1，已逐字符核对）、**串行 `bun run build` exit 0**（§4.4），并且**副本内改坏期望值 ⇒ 三处各自变红**、**副本内把第 1 处改回同步断言 ⇒ 原竞态逐字复现**（§4.3，鉴别力已证）。
**一条须交回的根因修正**：这 3 条红里**只有第 1 处是真竞态**，第 2、3 处是它提前中断后 **`mock*Once` 队列残留导致的级联**（§4.3.4）——第 2、3 处的 `waitFor` 属无害加固，不是修复竞态。

## 1. 改动清单（改动前后对照，证明期望值未变）
文件：`frontend/tests/ResearchWorkspaceEvidence.test.tsx`（唯一被改文件）

### 1.1 第 1 处：失败日期回滚后的窗口截止日期（原 `:295` ⇒ 现 `:298`）
```ts
// 改前（原 295 行，同步断言）
expect((within(card).getByRole('textbox', { name: '选择龙虎榜窗口截止日期' }) as HTMLInputElement).value).toBe(shanghaiToday());

// 改后（现 298 行，等待条件成立再断言）
await waitFor(() => expect((within(card).getByRole('textbox', { name: '选择龙虎榜窗口截止日期' }) as HTMLInputElement).value).toBe(shanghaiToday()));
```
- **期望值**：改前 `shanghaiToday()`，改后 `shanghaiToday()` —— **同一个具体值，一字未改**。
- 被断言的对象、比较方式（`.toBe`，`Object.is`）均未变；只多了「等到它成立」。

### 1.2 第 2 处：导航换标的后选中的龙虎榜记录（原 `:321` ⇒ 现 `:327`）
```ts
// 改前（原 321 行，同步断言）
expect(within(card).getByRole('button', { name: /2026-08-27/, pressed: true })).toBeTruthy();

// 改后（现 327 行，等待条件成立再断言）
await waitFor(() => expect(within(card).getByRole('button', { name: /2026-08-27/, pressed: true })).toBeTruthy());
```
- **期望值**：改前/改后均为「存在 `aria-label` 含 `2026-08-27` 且 `aria-pressed=true` 的按钮」——**同一个具体记录、同一个选中态**，未放宽（不是「存在任意按钮即可」）。
- 紧随其后的 `:328-330` 仍同步断言 `detail` 内是 `000001 / 平安银行 / 平安银行最近上榜`，`:332` 仍断言 `queryByText('历史上榜原因')` 为 `null`——**断言集合未变**。

### 1.3 第 3 处：第二条错误文案（原 `:336` ⇒ 现 `:344`）
```ts
// 改前（原 336 行，同步断言）
expect(screen.getByText('龙虎榜：龙虎榜接口不可用')).toBeTruthy();

// 改后（现 344 行，等待条件成立再断言）
await waitFor(() => expect(screen.getByText('龙虎榜：龙虎榜接口不可用')).toBeTruthy());
```
- **期望值**：改前/改后均为**同一条具体错误文案**「龙虎榜：龙虎榜接口不可用」（精确文本匹配，非「存在任意 alert」、非「非空」）。
- 其上一行 `:341` 的 `findByText('资金流向：资金接口不可用')`、其后 `:345`/`:346` 的空态文案断言均未改动。

### 1.4 「只改何时断言」的机器可验证证据
- `git diff` 三个 hunk **只删了 3 行、加了 3 行断言 + 9 行注释**：3 行断言在**去掉 `await waitFor(() => ...)` 外壳后与改前逐字符相同**。
- 反向核对：把改后三行各自剥掉 `await waitFor(() => ` 与结尾 `)` 后，与 `git show HEAD:` 中的原行**完全一致**（见 §4.3 的副本对照，`Compare-Object` 只报出这 3 处 + 注释差异）。

## 2. 为什么这不是「弱化断言」
- `waitFor` 的语义是**轮询直到回调不再抛错**，默认超时 1000ms；**超时即用例变红**。因此「值永远不出现」⇒ 红，与改前同步断言同向，只是把「立刻红」换成「最终仍红」。**唯一被消除的是「红得太早」**。
- 三处**都没有**引入 `queryBy*`、`not.toThrow`、`.toBeTruthy()` 包裹原值、`expect.anything()`、`expect.any()`、`toBeDefined()` 之类的存在性弱化；比对仍是 `.toBe(具体字符串)` / `getByRole(name: 具体正则, pressed: true)` / `getByText(具体文案)`。
- **鉴别力反证**（§4.3）：副本内把第 1 处改回同步断言，**同一条用例立刻变红且报错信息与改前一致**（`expected '2026-08-20' to be '2026-09-12'`）——若我把断言改成了恒真，这一步不可能红。

## 3. 「第 4 处同类写法」的排查
对全文件做了机械枚举（所有 `await` 行 + 其后 1–2 行内的同步 `expect`），逐处判定「被等待的元素是否与所断言的数据在同一次提交中产生」：

| 位置（现文件行） | 形态 | 判定 |
|---|---|---|
| `:140 → :142`、`:170 → :171` | `await findByTestId('chip-card')` → 同步断言筹码数据 | **非竞态**：`chip-card`（`ResearchWorkspace.tsx:699`）只在 `snapshot` 已置位时渲染，而 `snapshot` 与 `chips` 由 `loadWorkspace` 的**同一个 `Promise.allSettled` 批次**一起 set ⇒ 卡片出现的那次提交里数据必已在 |
| `:198 → :199`、`:213 → :215`、`:230`、`:256`、`:272`、`:290`、`:318`、`:399`、`:439` | `await findByTestId('money-flow-card' / 'dragon-tiger-card')` → 同步断言其数据 | **非竞态**：同上，两张卡都在 `snapshot` 分支内无条件渲染，数据与 `snapshot` 同批次落地 ⇒ 卡片（重）出现时数据必已在（`loading` 期间 `snapshot` 为 null，整块被 `Skeleton` 取代、节点不存在） |
| `:275 → :276` | `await waitFor(已发起新请求)` → 同步断言**旧**记录仍选中 | **非竞态**：断言的是「保留旧状态」，此期间无状态提交可竞争 |
| `:301 → :302` | 点「重试」后 `await findByTestId('dragon-tiger-card')` → 同步断言新记录选中 | **非竞态（本卡最接近的第 4 处候选）**：`loadWorkspace` 入口先 `setSnapshot(null)`，卡片会先被 `Skeleton` 取代而**卸载**，`findByTestId` 因此必须等到「快照 + 龙虎榜」同批到达的那次提交才返回；实测该用例在全部改后运行中**从未失败** |
| `:322 → :323` | 导航后 `await waitFor(请求已发出)` → `findByTestId` | **是同类竞态**——但它**紧跟在改动点 `:327` 的同一段代码内**，`:323` 的 `findByTestId` 本身就是「旧 DOM 仍在」的那一步，`waitFor`（`:327`）已把该竞态吸收 |

结论：**未发现第 4 处会实际变红的同类竞态**；`:301` 是最接近的形态，已说明其为何安全。按卡内「只改这三处」的范围，**没有扩大改动**。**但如实提示**：`:301` 的安全性依赖「`loadWorkspace` 先清空 `snapshot` 导致卡片卸载」这一**生产实现细节**；一旦将来生产代码改成保留旧快照（例如加骨架屏而不清空），`:301` 会退化为同类竞态。此为**观察，非本卡缺陷**。

## 4. 门禁原始输出
（全部原始日志留在 `$env:TEMP\vs26-gates\`，**未写入仓库目录**；下方为逐条摘录。）

### 4.1 `ResearchWorkspaceEvidence` 单跑（改后）
命令：`cd frontend && bun x vitest run tests/ResearchWorkspaceEvidence.test.tsx`
原始输出（日志 `$env:TEMP\vs26-gates\S1.log`）：
```
### SINGLE attempt 1 ###

 RUN  v4.1.10 E:/Code_file/Projects/finquant-hub/frontend
...
 Test Files  1 passed (1)
      Tests  14 passed (14)
   Start at  01:46:20
   Duration  39.92s (transform 1.65s, setup 571ms, import 17.90s, tests 18.80s, environment 2.16s)
EXIT=0
```
本卡改动涉及的 3 条用例逐条通过：
```
 ✓ keeps historical selection after a failed date and resets after a successful workspace retry  3402ms
 ✓ resets selection on a real symbol navigation when the same workspace component is reused  1990ms
 ✓ keeps both cards visible with honest Empty fallbacks when fetchers fail  457ms
```

### 4.2 与 `ResearchFollowupPrompt.test.tsx` 同跑 ×3（稳定性）
命令：`bun x vitest run tests/ResearchWorkspaceEvidence.test.tsx tests/ResearchFollowupPrompt.test.tsx`
**连续 3 次全绿**（`C1.log` / `C2.log` / `C3.log`，均为**连跑不中断**的连续三次）：
```
##### C1.log
 Test Files  2 passed (2)
      Tests  24 passed (24)
   Start at  01:47:01
   Duration  110.24s (transform 4.13s, setup 1.20s, import 68.25s, tests 34.56s, environment 5.23s)
EXIT=0
  ✓ keeps historical selection after a failed date and resets after a successful workspace retry  4047ms
  ✓ resets selection on a real symbol navigation when the same workspace component is reused  1648ms
  ✓ keeps both cards visible with honest Empty fallbacks when fetchers fail  448ms

##### C2.log
 Test Files  2 passed (2)
      Tests  24 passed (24)
   Start at  01:48:54
   Duration  92.25s (transform 3.80s, setup 1.22s, import 50.25s, tests 33.18s, environment 6.19s)
EXIT=0

##### C3.log
 Test Files  2 passed (2)
      Tests  24 passed (24)
   Start at  01:50:28
   Duration  66.25s (transform 2.41s, setup 1.13s, import 36.49s, tests 22.24s, environment 5.29s)
EXIT=0
```
更早的样本（改后，同一命令）：`gate2_combined_2.log`、`gate2_combined_3.log`、`gate2_combined_5.log`、`gate2_combined_6.log` **也是 24 passed** —— 即改后**共 7 次**该组合跑全绿。

### 4.3 鉴别力证明（`$env:TEMP` 副本内做变异 ⇒ 变红）
三组变异**全部在 `$env:TEMP` 的副本内**完成，副本由 `robocopy`（排除 `node_modules`）+ **目录 junction** 指回真实 `node_modules` 构成；**仓库工作树全程为交付态，从未含变异**。
```
副本：C:\Users\...\Temp\vs26-mutant\{frontend(交付版), mutantA-frontend, mutantB-frontend, mutantC-frontend}
命令（与门禁同一条）：bun x vitest run tests/ResearchWorkspaceEvidence.test.tsx tests/ResearchFollowupPrompt.test.tsx
```

#### 4.3.1 证明 A（**确定性**）：把三处 `waitFor` 的**期望值改错** ⇒ 三条用例全红
这是针对本卡最要害问题的**决定性**证明——「你有没有把断言改成恒真」。副本 `mutantC` 只改期望值（`shanghaiToday()`→`'1999-01-01'`、`/2026-08-27/`→`/1999-01-01/`、`'龙虎榜：龙虎榜接口不可用'`→`'龙虎榜：绝不存在的文案'`），**结构、`waitFor` 包裹方式一字不动**：
```
MUTANT_C.log：Tests  5 failed | 19 passed (24)   EXIT=1

 FAIL ... keeps historical selection after a failed date and resets after a successful workspace retry
AssertionError: expected '2026-09-12' to be '1999-01-01' // Object.is equality
 ❯ tests/ResearchWorkspaceEvidence.test.tsx:298:120      ← 第 1 处的 waitFor 行

 FAIL ... resets selection on a real symbol navigation when the same workspace component is reused
TestingLibraryElementError: Unable to find role="button" and name `/1999-01-01/`
 ❯ tests/ResearchWorkspaceEvidence.test.tsx:327:11       ← 第 2 处的 waitFor 行

 FAIL ... keeps both cards visible with honest Empty fallbacks when fetchers fail
TestingLibraryElementError: Unable to find an element with the text: 龙虎榜：绝不存在的文案.
 ❯ tests/ResearchWorkspaceEvidence.test.tsx:344:11       ← 第 3 处的 waitFor 行
```
- **三处 `waitFor` 各自都能变红**，且**红在自己那一行**（`:298` / `:327` / `:344`）⇒ 断言**不是恒真**，`waitFor` 没有吞掉失败。
- 注意 `:298` 的报错形态：`waitFor` 超时后抛出的是**原断言的值比对错误**（`expected '2026-09-12' to be ...`），说明被等待/被断言的**仍是具体值**。
- 该日志另外 2 条红（`keeps chip snapshots`、VS-24 首条）是 `Test timed out in 5000ms`，落在**本卡未触碰**的用例上（环境噪声，见 §4.5）。

#### 4.3.2 证明 B：把**第 1 处改回同步断言** ⇒ 原竞态复现（与卡内症状逐字吻合）
副本 `mutantB` = 交付版**仅第 1 处**改回同步断言（第 2、3 处保留 `waitFor`）。同一命令跑 5 次：

| 运行 | 结果 | 第 1 处对应用例 |
|---|---|---|
| `MUTANT_B.log`（第 1 次） | 24 passed | ✓ 通过（竞态未触发） |
| `MUTANT_B_2.log` | 3 failed / 21 passed | ✗ **`AssertionError: expected '2026-08-20' to be '2026-09-12'` @ `:295`** |
| `MUTANT_B_3.log` | 2 failed / 22 passed | ✗ 5s 超时（环境噪声） |
| `MUTANT_B_4.log` / `MUTANT_B_5.log` | 24 passed | ✓ 通过（竞态未触发） |

复现的那次（`MUTANT_B_2.log`）报错与**改前基线逐字一致**（`expected '2026-08-20' to be '2026-09-12'`，指回同步断言行 `:295`）——**证明这次改动确实是"等待时机"承重，而不是把断言改松**。
竞态本身是**概率性**的（依赖负载/时机，卡内亦如此描述）：低负载下同步断言常常恰好读到正确值（5 次里 2 次触发、3 次不触发）。这不是"变异无效"，而是"这本来就是竞态"。

#### 4.3.3 证明 C：三处**全部**改回同步（== 改前文件）
副本 `mutantA` 的测试文件由 `git show fca8364^:frontend/tests/ResearchWorkspaceEvidence.test.tsx` 逐字生成（455 行、LF、无 VS-26 标记、三处均为同步断言）。跑 1 次：`1 failed | 23 passed`，唯一红是第 1 处用例的 **5s 超时**（该次未触发竞态，属 §4.5 噪声）。

#### 4.3.4 ⚠️ 关键副产品：**第 2、3 处不是独立竞态，是第 1 处失败后的"级联"**
`mutantB` 的第 2、3 处**保留着 `waitFor`**，却在 `MUTANT_B_2.log` 里同时变红，且**红在 `waitFor` 行**：
```
 FAIL ... resets selection on a real symbol navigation ...
TestingLibraryElementError: Unable to find role="button" and name `/2026-08-27/`
 ❯ tests/ResearchWorkspaceEvidence.test.tsx:324:11     ← 第 2 处的 waitFor（等 1s 仍未出现）

 FAIL ... keeps both cards visible ...
TestingLibraryElementError: Unable to find an element with the text: 龙虎榜：龙虎榜接口不可用
 ❯ tests/ResearchWorkspaceEvidence.test.tsx:341:11     ← 第 3 处的 waitFor
```
**根因（本卡的根因修正）**：第 1 处用例提前中断后，会**留下未消费的 `mockResolvedValueOnce`**——`beforeEach` 用的是 `vi.clearAllMocks()`，而它**只清 `calls/instances/results`，不清 `mock*Once` 队列**（只有 `mockReset`/`mockRestore` 才清）。于是后续用例的 once 队列整体**错位一格**：
- 第 2 处用例导航到 `000001`，但 `fetchDragonTiger('000001', …)` 拿到的是**上一轮残留的 600519 载荷**（左证：该次失败的 DOM 里出现的是 `2026-08-28`/`2026-08-19`/`历史上榜原因`——正是 `dragonTigerHistory()`，而 `2026-08-27`/`平安银行最近上榜` 从未出现）；
- 第 3 处用例把两个 fetcher 都设成 `mockRejectedValue`，但残留的 `mockResolvedValueOnce` 优先级更高，于是龙虎榜**没有报错**、错误文案自然找不到。

**这条修正与改前基线完全自洽**：改前 `baseline.log` 的 3 条红正是 `:295`（真竞态）→ `:321` → `:336`（后两条为级联）；改后交付版的 8 次运行中，**从未出现"第 1 处通过、第 2/3 处变红"**。据现有样本，**只有第 1 处是真的竞态**；第 2、3 处的 `waitFor` 是**无害且更稳的加固**（并不弱化断言），我按卡内要求照改，但**如实把根因修正交回给编排者与验收者**。相关隐患见 §5。

### 4.4 串行 `bun run build`（含 `tsc -b`）
命令：`cd frontend && bun run build`（= `prebuild` 契约检查 → `tsc -b` → `vite build`）
原始输出（`$env:TEMP\vs26-gates\gate3_build.log`）：
```
### GATE 3: BUILD ###
$ ../backend/.venv/Scripts/python.exe ../scripts/openapi_tsgen.py --check
OK: E:\Code_file\Projects\finquant-hub\frontend\src\types\openapi.generated.ts is fresh (60 schemas)
$ tsc -b && vite build
vite v6.4.3 building for production...
transforming...
✓ 4262 modules transformed.
...
✓ built in 1m 5s
EXIT=0
```
`tsc -b` 未报错（`vite build` 只有在 `tsc -b` 成功后才会执行，日志中 `$ tsc -b && vite build` 之后直接进入构建即为此证）。

### 4.5 环境噪声：全部尝试的完整样本（如实记录，未挑选）
本机在本次作业期间**同时有其它 agent 的 vitest 在跑**（实测：`bun x vitest run tests/Discussion.test.tsx tests/DiscussionRolesUnavailable.test.tsx`，PID 20932/6832），CPU 负载 65%（8 逻辑核）。**在负载窗口内的运行会出现与本次改动无关的 `Test timed out in 5000ms`**：

| 运行 | 结果 | 变红用例（全部为 5s 超时，非断言失败） |
|---|---|---|
| `gate1_single.log`（改后单跑，负载中） | 13 passed / 1 failed | `rolls back failed dates without losing rows...`（**本卡未触碰**的第 14 条） |
| `S1.log`（改后单跑，负载低） | **14 passed** | — |
| `gate1_single_retry1.log` | 13 passed / 1 failed | `keeps chip snapshots...`（**本卡未触碰**，9177ms > 5000ms） |
| `gate1_single_retry2.log` | 13 passed / 1 failed | 同上（该用例 9177ms） |
| `gate2_combined_1.log` | 23 passed / 1 failed | `keeps chip snapshots...`（**本卡未触碰**） |
| `gate2_combined_4.log` | 23 passed / 1 failed | `ResearchFollowupPrompt` 首条（**本卡未触碰**） |
| `C1/C2/C3`、`gate2_combined_2/3/5/6` | **24 passed** | — |

关键判据：**改后所有变红无一例外都是 `Error: Test timed out in 5000ms`，且全部落在本卡未触碰的用例上；本卡改动的 3 条用例在改后的每一次运行中都通过。** 改前的同环境对照（`baseline.log`）则不同：那 3 条是**真断言失败**（`expected '2026-08-20' to be '2026-09-12'` / 找不到 `2026-08-27` 按钮 / 找不到龙虎榜错误文案），**不是超时**。

## 5. 未解决问题 / 风险
1. **【已交回，非本卡缺陷】根因修正：3 条红里只有 1 条是真竞态**（详见 §4.3.4）。第 1 处（`:295` 原行）是**真竞态**——`await screen.findByText(错误条)` 只等到错误条落地，而 AntD `DatePicker` 受控回滚到原日期的**内部输入文本同步还要多走一次**；第 2、3 处的红是**它提前中断后 `mock*Once` 残留导致的级联**。按卡内要求第 2、3 处也改了 `waitFor`（**无害、且不弱化断言**），但**请不要把"3 处竞态"写进档案**——那是本卡前提里的一个不准确处。
2. **`vi.clearAllMocks()` 不清 once 队列，是本文件的一个隐藏陷阱**（§4.3.4）。任何**提前中断**的用例都会让**后续**用例的 `mockResolvedValueOnce` 错位，症状是"另一个用例挂了、报错还指向别的标的"，**极易被误判为真回归**。本卡**不扩大范围**，故**未修**；建议（**需另开卡**）在 `beforeEach` 改用 `vi.resetAllMocks()`（该文件里实现是在 `clearAllMocks()` **之后**逐个设置的，改用 reset 不会破坏现有设置），或让每个用例消费完自己的 once 队列。
3. **5s 默认 `testTimeout` 是这套用例的紧箍咒（环境噪声，非本次改动引入）**。实测本机在其它 agent 并行跑 vitest 时 CPU 负载 65%（8 逻辑核），本文件**未触碰的**用例会以 `Test timed out in 5000ms` 变红（`keeps chip snapshots` 曾达 9177ms）。附带影响：本卡 3 条用例改后**不再提前中断**，因而跑完全程，耗时从改前的"1.5s（提前挂掉）"变成 **2.0–4.1s**，离 5s 上限更近。**未采取**"加大 `testTimeout`"这类改动（超出卡内范围，且会掩盖真实超时）；仅在此登记。
4. **本卡与其它 agent 的改动同处一棵工作树**：门禁运行期间树中还含 VS-25/VS-27 的在途改动（`frontend/src/pages/Discussion.tsx`、`i18n/{zh,en}.ts`、`backend/app/services/research_orch.py` 等）。`bun run build`（含 `tsc -b` 全量类型检查）在**这些在途改动同在树中**的前提下 exit 0。我的改动**仅限一个测试文件**，`frontend/src/` 零改动（`git status` 可验）。
5. **提交时点**：编排者已在我仍在补证据时提交（`fca8364` 改码、`718936f` 收录本文件的前半部分门禁证据）。**本文件 §4.3.4 与 §5 是提交之后才写入的**，需要时请再做一次路径限定的补充提交（对应 AGENTS.md 中"实现者报告完成 ≠ 结果文件已写完"一条）。
6. **未发现第 4 处会实际变红的同类竞态**（§3 已逐处排查并给出判据）；`:301` 是最接近的形态，其安全性依赖"`loadWorkspace` 先清空 `snapshot` 使卡片卸载"这一生产实现细节，属**观察**，未改动。

## 6. 证据索引
- **被改文件**：`frontend/tests/ResearchWorkspaceEvidence.test.tsx`（唯一被改文件；`git diff` 3 个 hunk）
- **改前内容**：`git show fca8364^:frontend/tests/ResearchWorkspaceEvidence.test.tsx`（455 行，含三处同步断言）
- **已入库提交**：`fca8364`（本卡改码，编排者提交）、`718936f`（本文件前半部分证据）
- **门禁/变异原始日志**（全部在 `%TEMP%\vs26-gates\`，**未写入仓库**）：
  - 改前基线：`baseline.log`（含 3 条真断言失败 + 逐行报错）
  - 改后单跑：`S1.log`（14 passed）、`gate1_single.log`、`gate1_single_retry1/2.log`
  - 改后合并跑：`C1/C2/C3.log`、`gate2_combined_1..6.log`
  - 构建：`gate3_build.log`（`tsc -b && vite build`，EXIT=0）
  - 变异：`MUTANT_C.log`（期望值改错 ⇒ 三处各自变红）、`MUTANT_B.log`/`MUTANT_B_2..5.log`（仅第 1 处回退同步，5 次中 2 次复现原竞态）、`MUTANT_A.log`（三处全回退）
- **变异副本**（`%TEMP%\vs26-mutant\`，`node_modules` 为 junction；**仓库 worktree 全程未变异**）：`mutantA-frontend`、`mutantB-frontend`、`mutantC-frontend`
- **"期望值逐字未变"的机械核对**（本会话实测）：三行改后断言各自剥掉 `await waitFor(() => ` 与收尾 `);` 后，与 `fca8364^` 中对应行**逐字符相等**（`True/True/True`）；不计注释时全文件差异**恰为 3 行删除 + 3 行新增**。
