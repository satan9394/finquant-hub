# EVALUATION_RESULT — VS-31：测试卫生（清 once 队列 + 逼近超时的首条用例）

> 被验提交：**`8bf4507`**（`8bf4507^` = `861d838`）。评估者：独立 Evaluator（**不采信自述**，全部结论由自建夹具/自写脚本得出）。
> 判定：**ACCEPT**（含 4 条非阻塞 NIT 与 2 条明确的归因边界）。
> 我的夹具、变异体、探针与原始日志全部在 `%TEMP%\vs31eval\`（自建，**未复用**实现者的 `%TEMP%\vs31`）；`frontend/tests/` 与仓库目录**零残留**（收尾 `git status --porcelain` 为空）。

---

## 0. 判定速览

| # | 待验项 | 结论 |
| --- | --- | --- |
| 1 | 期望值逐字未变 / it 计数未变 / 未新增弱断言 / 零生产代码 | **成立**（全机器比对，逐项相同） |
| 2 | 15s 是否承重 | **本窗口未能独立复现**（首条 1695/1870/2628 ms；去掉 15s 的对照 2/2 全绿）。改动本身**在卡面允许的修法内且未削弱断言**，但"必须改"这一点**只有实现者那一次 8224 ms 的孤证** |
| 3 | `resetAllMocks` 真清 once 且顺序安全 | **成立**（自建探针 9/9；reset 之前零实现设置点；无 `vi.spyOn`） |
| 4 | 卡面判据 `mut1` vs 同源对照 `mut4` | **独立复现**：`mut1` 3 处级联 2/3 命中；`mut4` 级联 0/3 |
| 5 | 零生产代码改动 | **成立**（提交文件集 = 2 测试 + 1 md；`frontend/src` 差异 0） |
| 6 | 负载超时是环境噪声还是本卡缺陷 | **环境噪声，不是本卡缺陷**（六条独立证据 + 无机制） |
| 7 | 门禁 | Followup **3/3 全绿**；Evidence **1/3**（红的是 5s 超时）；`bun run build` **exit 0** |

---

## 1. 期望值逐字未变（机器比对，非目测）

比对对象：`git show 8bf4507^:<file>`（BEFORE）与 `git show 8bf4507:<file>`（AFTER），**case-sensitive** 整行比较。

**1.1 两个交付文件的 SHA256 与实现者声明的哈希逐位相同**（⇒ 其日志对应的确实是提交进去的那份字节）：

```
ResearchWorkspaceEvidence.test.tsx  blob=1e076fa…  actual=713DEA638A6082431226130078FBE984031090C288BE1E8EA7680E06D39BAB23  MATCH=True
ResearchFollowupPrompt.test.tsx     blob=b1107ed…  actual=3F05B8848FFE639FE58B83B7C6256A66136E6E85C5E070CB31635B507CD7FC7D  MATCH=True
```

（注：必须直接对 **git blob 字节**取哈希；用 `ReadAllLines/WriteAllLines` 落盘会把 LF 变成 CRLF，得到的哈希不同——这是我第一次比对时的假阳性，已用 `git cat-file blob` 重做。）

**1.2 VS-26 三处期望值：**

```
site1  toBe(shanghaiToday())            B=2 行  A=2 行  逐字相同=True
site2  /2026-08-27/                     B=1 行  A=1 行  逐字相同=True
site2' pressed: true                    B=7 行  A=7 行  逐字相同=True
site3  龙虎榜：龙虎榜接口不可用          B=1 行  A=1 行  逐字相同=True
```

**1.3 `it(` 计数与弱断言（全文件计数，HEAD vs WORK）：**

| 指标 | Evidence | FollowupPrompt |
| --- | --- | --- |
| `it(` | 14 / 14 | 10 / 10 |
| `queryBy` | 12 / 12 | 6 / 6 |
| `not.toThrow` | 0 / 0 | 0 / 0 |
| `toBeDefined` | 0 / 0 | 0 / 0 |
| `expect.any` | 0 / 0 | 0 / 0 |
| `toMatchSnapshot` / `skip(` / `todo(` | 0 / 0 | 0 / 0 |

**1.4 更宽的断言强度普查（我自己加的，防"只在四个 token 上做戏"）：**

```
Evidence : expect( 93/93  await waitFor( 12/12  findBy 18/18  within.findBy 2/2
           getByRole 23/23  getByText 31/31  getByTestId 22/22  toBeTruthy 42/42
           toEqual 3/3  toBe( 18/18  toHaveBeenCalledTimes 7/7  queryBy…toBeNull 12/12
Followup : expect( 34/34  await waitFor( 8/8   findBy 3/3   getByTestId 12/12
           toBeTruthy 3/3  toEqual 1/1  toBe( 11/11  not.toHaveBeenCalled 5/5  queryBy…toBeNull 6/6
```

⇒ **十三项强度指标全部逐一相等**；`git show -U0` 的 `+` 行中，**除注释外只有三条真实代码行**：

```
+const FIRST_PAGE_MOUNT_TIMEOUT_MS = 15_000;
+  }, FIRST_PAGE_MOUNT_TIMEOUT_MS);
+    vi.resetAllMocks();
```

**1.5 15s 的作用域**：`FIRST_PAGE_MOUNT_TIMEOUT_MS` 在代码里只出现 2 次（L113 定义、L151 首条用例的第三个参数）；该文件 10 条 `it(` 中**只有首条**（L140 起）拿到它，其余 9 条仍是默认 5 s。**"只给首条"这一点为真**，`frontend/tests/ResearchFollowupPrompt.test.tsx:151`。

---

## 2. 改动是否承重（15s）——我的实测与实现者不一致，如实记录

**我的窗口（交付态，真实 `frontend` 目录，`bun run test tests/ResearchFollowupPrompt.test.tsx --reporter=verbose`）3 次：**

| 运行 | 首条用例耗时 | 全文件 | 退出码 |
| --- | --- | --- | --- |
| GATE-FOLLOWUP-1 | **2628 ms** | 10/10 | 0 |
| GATE-FOLLOWUP-2 | **1870 ms** | 10/10 | 0 |
| GATE-FOLLOWUP-3 | **1695 ms** | 10/10 | 0 |

**对照（自建副本：把 `, FIRST_PAGE_MOUNT_TIMEOUT_MS` 去掉，即 `8bf4507^` 的可执行等价形态；TEMP 工程 + junction 指向真实 `src`）2 次：**

| 运行 | 首条用例耗时 | 全文件 | 退出码 |
| --- | --- | --- | --- |
| NOTIMEOUT-1 | **1807 ms** | 10/10 | 0 |
| NOTIMEOUT-2 | **1433 ms** | 10/10 | 0 |

⇒ **若在我的窗口撤掉 15 s，这 5 次里没有一次会变红。** 我**无法独立复现**实现者那一次 8224 ms，"承重"在我这里**未获独立支持**。

**但这不等于该改动错**：①它是卡面明列的次优修法（"为该文件显式提高超时——须写明'这是提高上限、不是放宽断言'"），文件注释与结果文件都写了这句话，且断言一字未动（§1）；②首条用例确实是该文件最慢的一条（2628 ms vs 次慢 1260 ms，约 2 倍），且它承担 VS-24 最核心的断言；③"默认 5 s 会被越过"在本机上**有实证**——同一台机器同一时段，Evidence 文件多次以 `Test timed out in 5000ms` 变红（最长 7509 ms），实现者也测到该文件其余用例 5804/8608 ms。**结论：一处合理的余量改动，"必须改"未被独立证明（NIT-3）。**

---

## 3. `resetAllMocks` 是否真清 once 队列 + 顺序是否安全

**3.1 自建语义探针**（`%TEMP%\vs31eval\proj\tests\V31EvalSemantics.test.ts`，我自己写的，**未复用**实现者的 `V31Semantics.test.ts`）：**9/9 passed，exit 0**

```
✓ A1 mockClear 不清 once 队列（缺陷成立的机制）
✓ A2 vi.clearAllMocks 不清 once 队列
✓ A3 vi.resetAllMocks 清空 once 队列（修法有效）
✓ A4 resetAllMocks 会清掉 reset 之前设置的默认实现
✓ A5 resetAllMocks 不会清掉 reset 之后设置的实现（顺序安全性可执行对照）
✓ A6 mockRejectedValueOnce / mockImplementationOnce 同属 once 队列，清除行为一致
✓ B1 前一条用例提前中断：留下未消费 once
✓ B2 clearAllMocks 语义下，下一条用例拿到的是上一条遗留的 once 值（错位一格）
✓ B3 resetAllMocks 语义下，遗留 once 被清空，下一条用例拿到 undefined
```

> 诚实记录一处：A6 我第一版写成 `rejected().catch(...)`，在 reset 之后 mock 返回 `undefined` ⇒ 探针自身报 `Cannot read properties of undefined`。**这恰恰是"once 已被清掉"的旁证**；我把它改成 `expect(rejected()).toBeUndefined()` 后全绿。这是我的夹具问题，不是被测对象的问题。

**3.2 顺序安全性（机器扫描，非目测）**：文件里**只有一个** `beforeEach`（`ResearchWorkspaceEvidence.test.tsx:114`）、**只有一个** `describe`（:113）；`vi.resetAllMocks()` 在 **:124**。

```
扫描全文件所有 .mock*( 实现设置点：38 处（分布在 37 行，:321 一行两处）
行号 < 124 的实现设置点（排除注释行）：0 处
模块级（vi.hoisted 之外）实现设置：0 处
14 个 vi.fn 全部在一处 vi.hoisted（:12-27）
vi.spyOn：0 处（⇒ mockReset 不会"废掉"任何 spy）
```

⇒ `reset` **清不到任何后续要用的实现**。另核对实现者关于"4 个 mock 从未设实现"的说法：`fetchResearchReport`(:21) / `listResearchWorkspaces`(:24) / `saveResearchWorkspace`(:25) / `searchInstruments`(:26) 全文件只出现在 **声明处** 与 **本卡注释文本**（:122-123），**既未设实现也未被断言**，两种写法下都返回 `undefined` ⇒ 行为无差异。

**3.3 "是否引入'某用例不再自证'的新风险"**：静态上不成立（3.2），动态上我这 3 次 Evidence 运行里**没有任何一条失败是"实现被清掉"造成的**——失败全是 5 s 超时（§6）。

---

## 4. 卡面判据 `mut1` vs 同源对照 `mut4`（独立复核）

自建变异（全部由**提交态字节**生成，逐行 `Compare-Object` 核对差异恰好落在预期行）：

- `mut1` = `resetAllMocks`→`clearAllMocks` **且** site1 退回 pre-VS-26 同步断言（与交付态差 **2 行**）
- `mut4` = 保留 `resetAllMocks` **且** site1 退回同一条同步断言（与交付态差 **1 行**）
- `mut1` 与 `mut4` 的差异 = **恰好 1 行**（`vi.clearAllMocks()` vs `vi.resetAllMocks()`），这就是判别"到底哪一行在止住污染"的同源对照

**结果（同一命令内两个文件同跑，`maxWorkers:1` 顺序执行；连做 3 个窗口）：**

| 窗口 | `mut1`（clearAllMocks + 同步 site1） | `mut4`（resetAllMocks + 同步 site1） |
| --- | --- | --- |
| 1 | **site1 + site2 + site3 同时红**（3 failed / 11 passed） | **只有 site1 红**（1 failed / 13 passed） |
| 2 | **site1 + site2 + site3 同时红**（3 failed / 11 passed） | **只有 site1 红**（1 failed / 13 passed） |
| 3 | **14/14 全绿**（判据未命中） | site1 红 + 首条筹码用例负载超时（2 failed） |
| 合计 | **级联 2/3 命中** | **级联 0/3** |

命中的原始明细（我自己的日志）：

```
FAIL tests/Evidence.mut1.test.tsx > … > keeps historical selection after a failed date and resets after a successful workspace retry
     AssertionError: expected '2026-08-20' to be '2026-09-12'          ← site1（:305 同步断言）
FAIL tests/Evidence.mut1.test.tsx > … > resets selection on a real symbol navigation when the same workspace component is reused
     Unable to find role="button" and name `/2026-08-27/`              ← site2（:334，waitFor 仍在，却因 once 队列错位而红）
FAIL tests/Evidence.mut1.test.tsx > … > keeps both cards visible with honest Empty fallbacks when fetchers fail
     Unable to find an element with the text: 龙虎榜：龙虎榜接口不可用   ← site3（:351）
FAIL tests/Evidence.mut4.test.tsx > … > keeps historical selection after a failed date …   ← 仅 site1
```

⇒ **判据成立、可复现，且 `mut4` 证明"止住污染的就是 `beforeEach` 那一行 `resetAllMocks`"**，与实现者结论一致（实现者 2/4，我 2/3）。判据是**竞态**而非确定性判据（取决于 site1 提前中止时 once 队列是否已被消费），这一点实现者已如实标注。

---

## 5. 零生产代码改动

```
提交文件集：docs/ai/evo/IMPLEMENT_RESULT_VS31.md
           frontend/tests/ResearchFollowupPrompt.test.tsx
           frontend/tests/ResearchWorkspaceEvidence.test.tsx
git diff --name-only 8bf4507^ 8bf4507 -- frontend/src   →  0 个文件
git diff 8bf4507 -- <两个测试文件>                       →  空（工作树 == 提交态）
frontend/tests/ 下无本卡临时文件（新增的 ReadStateThreeWay.test.tsx mtime 04:12 属 VS-29）
```

**成立**：`frontend/src` 一次未碰，其余文件零命中。

---

## 6. ⚠️ 负载噪声 vs 真实缺陷：**判定为环境噪声，不是本卡缺陷**

先给结论：**我在交付态观察到的全部红灯都是"负载下的 5 s 超时"，与本卡改动无因果关系；也没有任何证据表明本卡让某条用例变慢。** 依据（每条都可复核）：

1. **红灯形态全是超时，没有一条是期望值不符**。交付态 6 次运行里凡是红的，报错都是 `Test timed out in 5000ms`；**零** `expected X to be Y`。本卡最该防的"削弱断言换绿"恰恰会在期望值上留下来痕迹，而**没有**。
2. **红的是哪条用例，每次都不一样**：Evidence 第 1 次红在 site1（6004 ms），第 3 次红在**首条筹码用例（7509 ms）+ site1（7048 ms）+ 另一条（5379 ms）**。固定的代码缺陷不会这样漂移；机器争用会。
3. **同一条用例、同一份代码，跨窗口耗时差 2–10 倍**：
   - Evidence 首条：**3722 / 4060 / 7509 ms**（三次运行）
   - Followup 首条：**2628 / 1870 / 1695 ms**（交付态）；对照态 1807 / 1433 ms
   - Followup 第 3 条：1260 / 1121 / 932 ms（**实现者那次 5804 ms**）
   - Followup 第 9 条：803 / 675 / 625 ms（**实现者那次 8608 ms**）
4. **红的是本卡根本没碰的用例**：Evidence 的首条筹码用例、Followup 的第 3/9 条——本卡在这三处**只字未动**（§1.5、§1.3）。
5. **改前形态同样会红**：实现者记录的同一筹码用例在 `mut1`（clearAllMocks 形态）7866 ms、`mut4`（resetAllMocks 形态）6998/5205 ms 都超时；**我的 `mut4` 窗口 3 也复现了这条筹码用例超时**。⇒ 与本卡改动无关。
6. **机制上不可能**：把 `clearAllMocks` 换成 `resetAllMocks` 是**严格做更多清除**（每条用例多 14 次 `mockReset()`，微秒级，且不触碰任何渲染路径）；给一条用例把**上限**从 5 s 抬到 15 s 更不可能改变任何耗时。两者都**没有让用例变慢的通路**。

**关于"静默机器上是否本来就 < 5 s"**：本机这一时段**不存在真正的静默窗口**（同机还有其它 agent 的 `tsc`/`node` 进程；我自己的 6 次串行测试本身也是负载）。但可对照的事实是：**Followup 文件在我这里 3/3 全绿（首条 ≤2628 ms，去掉 15 s 的对照 2/2 也全绿）**，而 **Evidence 文件在第 3 次运行"启动前并发 vitest 进程数 = 0"的情况下仍然 7509 ms 超时** ⇒ 争用来自**整机**，不是这两个测试文件自身。⇒ 支持"这些用例在低压窗口本来就 < 5 s"。

⇒ **明确表述：`EVIDENCE-1`、`FOLLOWUP-1`（实现者窗口）与我这里 `GATE-EVIDENCE-1/3` 的红灯，是环境噪声，不是本卡缺陷。我没发现本卡改动让任何用例变慢的证据。**
（保留必要的边界：我只证明了"**不是本卡引入**"——两种形态都出现、且发生在未改动的用例上；我没有、也无法证明"该用例在**任意**负载下都不会红"。）

---

## 7. 门禁（串行）

**7.1 两文件各连跑 3 次（真实 `frontend`，`bun run test <file> --reporter=verbose`）：**

| 运行 | 结果 |
| --- | --- |
| GATE-FOLLOWUP-1/2/3 | **10/10、10/10、10/10，exit 0 ×3（3/3 全绿）** |
| GATE-EVIDENCE-1 | 13/14，exit 1 —— site1 `Test timed out in 5000ms`（6004 ms），site2/site3 **绿** |
| GATE-EVIDENCE-2 | **14/14，exit 0** |
| GATE-EVIDENCE-3 | 11/14，exit 1 —— 首条筹码 7509 ms、site1 7048 ms、另一条 5379 ms，均 5 s 超时 |

⇒ **Evidence 未达 3/3**（实现者 2/3，我 1/3，都是同样的超时形态）。**按卡面环境铁律：不据此改代码、不放宽断言、不据此判 REJECT**，仅记为噪声（§6）。
**"第 1 处过而第 2/3 处红"的组合：交付态 6 次运行（我 3 + 实现者 3）一次都没出现**；出现该组合的只有 `mut1`。

**7.2 `bun run build`（串行，最后一步）：**

```
$ openapi_tsgen.py --check   → OK: openapi.generated.ts is fresh (60 schemas)
$ tsc -b && vite build       → ✓ 4262 modules transformed
                               ✓ built in 57.80s
[BUILD EXIT] 0
```

**归属边界（不替它选归属）**：本次 build 于 04:42–04:44 执行，而 **VS-29 已于 04:35:53 提交（`8d05556`）**、其后 `git status --porcelain` 为空 ⇒ 这次构建编译的是 **VS-29 的已提交态**，不是它变异窗口中的中间态。**构建结果 exit 0，故不存在需要归属的失败**；若它红了，仅凭"本卡只改测试文件、`tsc -b`/`vite build` 不编译测试"**仍不足以**把归属判给本卡——那需要把 `frontend/src` 回退到 `HEAD` 再构建一次的对照实验，本卡不替它选。
另一条如实记录的窗口事实：我的 3 次 Evidence 门禁（04:30–04:34）跑在 **VS-29 提交之前**，即当时 `frontend/src` 是在制/可能处于变异的中间态。VS-29 改的是 `LoadFailureAlert/MemoryManager/ResearchRuns/i18n(en,zh)/Chat/Dashboard/Discussion`，**没有 ResearchWorkspace 的渲染路径**（仅 i18n 增键），因此对这两个测试文件的影响可忽略——但这是我的判断，不是实验证明，一并记录。

---

## 8. 非阻塞 NIT（建议，不影响本次判定）

1. **`frontend/tests/ResearchFollowupPrompt.test.tsx:151` 只给首条用例加了 15 s**；峰值负载下**同文件其它用例**（实现者实测第 3 条 5804 ms、第 9 条 8608 ms）仍会越过默认 5 s ⇒ 该文件在峰值窗口仍可能整体变红。这是**已知残余脆弱性**，实现者已披露且**正确地没有擅自扩大范围**。是否要为该文件统一抬高上限，应由编排者另开一张卡决定。
2. **`frontend/tests/ResearchWorkspaceEvidence.test.tsx:143` 首条筹码用例**在负载下也会越过 5 s（我实测 7509 ms），本卡未触及 ⇒ 同类残余脆弱性。
3. **"15 s 承重"这一条在结果文件里是孤证**（单次 8224 ms）。本次评估在 5 次测量里一次都没越过 5 s。建议后续卡把这类结论表述为**分布**（p50/p95 + 是否越限的次数），而不是单个最坏值——单点最坏值无法区分"余量不足"与"偶发争用"。
4. **结果文件把探针记为"6/6"**，我自建的探针是 9 项（多出 `mockClear` 语义、`reset` 前后实现、`rejected/impl` once 三项）。两者结论一致，无冲突；仅提示"6/6"是它那份文件，不应被当作语义覆盖完备性的证据。

---

## 9. 复现方式（评估者自建，全部在 `%TEMP%\vs31eval\`）

```
%TEMP%\vs31eval\run_harness.ps1        一次串行跑完全部门禁（语义探针 → 两文件各 3 次 → 无超时对照 2 次 → mut1/mut4 各 3 窗口 → build）
%TEMP%\vs31eval\eval.log               全部原始输出（含每次运行前的并发 vitest 进程数）
%TEMP%\vs31eval\proj\                  自建 TEMP 工程（src/node_modules 为 junction 指向真实前端）
%TEMP%\vs31eval\proj\tests\V31EvalSemantics.test.ts   自建语义探针（9 断言）
%TEMP%\vs31eval\proj\tests\Evidence.mut1.test.tsx     clearAllMocks + 同步 site1
%TEMP%\vs31eval\proj\tests\Evidence.mut4.test.tsx     resetAllMocks + 同步 site1（唯一差异 = beforeEach 一行）
%TEMP%\vs31eval\proj\tests\FollowupNoTimeout.test.tsx 去掉 15s 的对照（≈ 8bf4507^）
```

**过程纪律**：临时/变异文件一律不进 `frontend/tests/`；门禁输出一律不写仓库目录；**未做任何按排除法的进程清理**（全程只读进程列表，未杀任何进程）；**未 commit**；收尾 `git status --porcelain` 只有本次交付的 `?? docs/ai/evo/EVALUATION_RESULT_VS31.md`，其余为空。
