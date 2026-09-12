# IMPLEMENT_RESULT — VS-31：测试卫生（清 once 队列 + 逼近超时的首条用例）

> 状态：**已完成**（骨架先落盘、证据逐项回填完毕）。纯测试文件改动，**零生产代码**。**未 commit。**
> 涉及文件（仅此二）：`frontend/tests/ResearchWorkspaceEvidence.test.tsx`、`frontend/tests/ResearchFollowupPrompt.test.tsx`。
> 最终文件 SHA256：Evidence `713DEA638A6082431226130078FBE984031090C288BE1E8EA7680E06D39BAB23`、FollowupPrompt `3F05B8848FFE639FE58B83B7C6256A66136E6E85C5E070CB31635B507CD7FC7D`（下方全部原始日志对应此状态）。
> 临时/变异文件全部在 `%TEMP%\vs31`（`src` / `node_modules` 用 junction 指向真实前端）；`frontend/tests/` 下**未放任何临时文件**，门禁输出**未写入仓库目录**。

## 0. 结论速览

| 项 | 结论 |
| --- | --- |
| 问题一修法 | `ResearchWorkspaceEvidence.test.tsx` 的 `beforeEach`：`vi.clearAllMocks()` → **`vi.resetAllMocks()`** |
| 顺序是否安全 | **安全**（机器核对：该文件全部 mock 实现都在该行**之后**设置；另 4 个 mock 本文件从未设实现，两种写法等价）→ 详见 §6 |
| 问题二修法 | `ResearchFollowupPrompt.test.tsx`：**只给首条用例**加第三参数超时 `15_000`（具名常量 `FIRST_PAGE_MOUNT_TIMEOUT_MS`），其余用例仍为默认 5s；**断言一字未改** |
| 首条用例耗时（改后） | **8224 / 2342 / 3328 ms**；改前的 HEAD 副本同一窗口 **3774 ms**；静默基线 1757 ms → §3.1 |
| 首条用例这次真会红吗 | **会**：FOLLOWUP-1 实测 8224 ms > 默认 5000 ms，靠本卡的 15s 才过 ⇒ 改动是承重的 |
| VS-26 三处期望值 | **逐字未变**（case-sensitive 机器比对 True）→ §5 |
| 弱断言 | 新增行中 `queryBy` / `not.toThrow` / `toBeDefined` / `expect.any` **零命中** → §5 |
| 生产代码 | 本卡**零改动**（`frontend/src` 的 8 个在制文件属 **VS-29**，见 §4） |
| 鉴别力 | **卡面判据 `mut1` 已复现（2/4）**，并由同源对照 `mut4` 证明 `resetAllMocks` 正是止住污染的那一行；另有 `mut2a` vs `mut2b` 的探针 A/B → §8 |
| 门禁 | Evidence 2/3 全绿（1 次为负载超时）；Followup 2/3 全绿（1 次为其它用例负载超时）；`bun run build` **exit 0** → §9 |

## 1. 改动清单（逐字）

```
frontend/tests/ResearchFollowupPrompt.test.tsx   | 12 +++++++++++-
frontend/tests/ResearchWorkspaceEvidence.test.tsx |  8 +++++++-
2 files changed, 20 insertions(+), 2 deletions(-)
```

新增行全文（`git diff -U0` 的 `+` 行，去标记后逐字）：

```
+/*
+ * VS-31：本文件首条用例要**首次**挂载整个研究页（antd 组件树 + 追问条接线），
+ * 实测正常耗时 1.5–4.6s，逼近 vitest 默认 testTimeout = 5000ms ⇒ 负载下必红。
+ * 这里只把该条用例的**时间上限**抬到 15s，**不是放宽断言**：它的三条断言逐字未变，
+ * 也没有新增任何"弱断言"（查询-不存在式 / 不抛错式 / 存在即可式 / 任意值匹配器）。
+ * 既无法在不削弱该用例的前提下削减其前置工作量（它要渲染的就是真实页面本身，
+ * 再 mock 掉组件就等于不再验证"追问真的被接住"），也不该给全文件放宽——
+ * 其余用例实测最长 ~1.5s，保留默认 5s 才能让"真挂起"快速失败。
+ */
+const FIRST_PAGE_MOUNT_TIMEOUT_MS = 15_000;
+
+  }, FIRST_PAGE_MOUNT_TIMEOUT_MS);
+    // VS-31：这里必须用 resetAllMocks，不能用 clearAllMocks。
+    // clearAllMocks 只清调用记录，**不清 mock*Once 队列**；某条用例提前中断（断言失败/超时）时，
+    // 它留下的未消费 mockResolvedValueOnce 会顺延给后续用例，让 once 队列整体错位一格，
+    // 制造"与自身无关"的假红。resetAllMocks 会清空 once 队列。
+    // 顺序安全性：本 beforeEach 里全部 mock 实现都在这一行**之后**设置，reset 清不到它们；
+    // 另有 4 个 mock（fetchResearchReport / listResearchWorkspaces / saveResearchWorkspace /
+    // searchInstruments）本文件从未设置实现，两种写法下都返回 undefined，行为无差异。
+    vi.resetAllMocks();
```

删除行全文：

```
-  });
-    vi.clearAllMocks();
```

⇒ **唯一的两处功能性改动**就是「`vi.resetAllMocks()` 替换 `vi.clearAllMocks()`」与「首条用例多一个 `15_000` 超时参数」，其余全为注释。

## 2. 问题一：`clearAllMocks` 不清 `mock*Once` 队列

### 2.1 根因

`vi.clearAllMocks()` 只对每个 mock 调 `mockClear()`（清 `mock.calls/instances/results`），**不清 once 队列、也不清实现**。本文件有 8 条用例用 `mockResolvedValueOnce` / `mockImplementationOnce` / `mockRejectedValueOnce` 排了队列（`:273,275 / :293-295 / :316,320-321 / :399,401 / :436-440`）。只要某条用例**提前中断**（断言失败或超时），它队列里**未消费的 once 值会顺延到后续用例**，使后续用例的 once 队列**整体错位一格**，拿到别人的数据 ⇒ 产生**与该用例本身无关的假红**。

`vi.resetAllMocks()` 对每个 mock 调 `mockReset()`：清调用记录 **+ 清 once 队列** + 实现复位。⇒ 每条用例都从"干净队列"开始。

### 2.2 修法

`beforeEach` 内 `vi.clearAllMocks()` → `vi.resetAllMocks()`（附一段说明性注释，见 §1）。

### 2.3 为什么不是"别的改法"

- 用 `mockClear()` + 逐条 `mockReset()` 手写：等价但更啰嗦、易漏（14 个 mock 要逐个处理）。
- 在每条用例开头清队列：要求作者永远记得，正是这次踩坑的形态。
- `vi.restoreAllMocks()`：语义是恢复被 `vi.spyOn` 替换的原实现，对本文件的 `vi.fn()` 不适用，且会与 `vi.mock` 工厂的交互更难推理。

## 3. 问题二：`ResearchFollowupPrompt.test.tsx` 首条用例逼近 5s 上限

### 3.1 实测数据（全部在"他卡并发跑 vitest"的窗口内所测，见 §4）

**静默度较高的一次基线**（改前，`--reporter=verbose`，03:44 首测）：

| 用例 | 耗时 |
| --- | --- |
| ① `标的研究页：追问真的被接住…`（首条） | **1757 ms** |
| ③ `两路径对照…` | 1466 ms |
| ④ `追问优先于 mode…` | 831 ms |
| ⑤ `消费后清理…` | 612 ms |
| ⑥ `无标的的既有 B6…` | 343 ms |
| ⑦ `空 prompt…` | 828 ms |
| ⑧ `纯空白 prompt…` | 657 ms |
| ⑨ `连续提交两次…` | 982 ms |
| ⑩ `回归：无标的 + mode=fast…` | 195 ms |

**首条用例的耗时谱（同一个用例，四个窗口）**——这是本卡最关键的一组数字：

| 窗口 | 文件状态 | 首条用例耗时 | 默认 5s 下会怎样 |
| --- | --- | --- | --- |
| 03:44 基线（并发中） | **改前 HEAD 原文（默认 5s）** | **1757 ms** | 过（35% 预算） |
| HARNESS-MUTANTS（并发 14） | `FollowupPrompt.mut3` = **HEAD 原文（无 15s）** | **3774 ms** | **过，但只剩 25% 余量** |
| FOLLOWUP-1（并发 4） | 交付态 | **8224 ms** | **若用默认 5s 必红**（本次靠 15s 才过） |
| FOLLOWUP-2（并发 7） | 交付态 | **2342 ms** | 过 |
| FOLLOWUP-3（并发 1） | 交付态 | **3328 ms** | 过 |

⇒ **`FOLLOWUP-1` 给出了这处修法的"承重"实证**：同一次运行里首条用例跑了 **8224 ms**，即 **超过默认上限 64%**——**如果没有这处改动，它当次就是一条红灯**，而它承载的正是 VS-24 最核心的断言（追问是否真的被接住）。这也直接印证卡面的"负载下必红"。

默认 `testTimeout = 5000 ms`（`frontend/vite.config.ts` 未覆盖，全仓唯一来源）。首条用例是**全文件唯一一条"首次挂载整页研究面"**的用例——antd 组件树 + 追问条接线的首渲染成本几乎全落在它身上（同文件后续渲染在静默窗口只有 200–1500 ms）。

### 3.2 修法选择（为什么提高上限，而不是"减少前置工作量"）

卡面首选"减少前置工作量"。**逐条排除**：

1. **mocked 掉更多组件**（如把 `ResearchWorkspace` 也 mock 成假组件）⇒ 等于不再验证"追问真的被接住"，**改弱了测试意图**，卡面明令禁止。
2. **减少 `waitFor`/`findBy*` 等待**（`followupOutcome` 的三段等待是"落地指纹"：地址栏 + 回执 + 草稿）⇒ 删等待就是**删断言**。
3. **给文件做"预热用例"**（先跑一条廉价用例把首渲染成本摊走）⇒ 总工作量不变，只是把成本搬家；而且**新增用例**本身就是扩大范围，还会让"最慢的一条"变成那条预热用例，属于用测试结构掩盖问题。
4. **改 `vite.config.ts` 的 `testTimeout`** ⇒ 该文件**不在本卡允许改动的文件集内**（卡面：仅此二文件）；且全文件放宽会一并掩盖其余用例的真挂起。

⇒ 剩下的可行手段就是**为该条用例显式提高上限**，并把改动**限制在这一条用例**上：其余 9 条仍用默认 5s（实测最长 1466 ms，余量充足），**"真挂起快速失败"的信号没有被稀释**。

**明确声明：这是提高时间上限，不是放宽断言。**该用例的 4 条断言（`research-mode-fast` 存在、回执含问题原文、草稿逐字等于问题原文、未发起标的检索）**一字未动**，见 §5。

## 4. 跨卡污染（本卡观测到的一手事实）

> 这一节是原始观测，不是转述。

**(a) 本窗口内另一个 agent（VS-29）正在同一工作树并发跑 vitest。** 实测抓到：

```
PID 25784  node "E:\Code_file\Projects\finquant-hub\frontend\node_modules\vitest\vitest.mjs"
           run tests/ListFailureNotEmptiness.test.tsx tests/ResearchRuns.test.tsx tests/MemoryManager.test.tsx
PID 24480  (上者的 fork worker)
```

窗口内还先后出现过 `vitest.mjs run tests/Dashboard.test.tsx`、`vitest.mjs run tests/ResearchDeadlineSi…` 等运行（后两个被我**误杀**，见 §10）。

**(b) `frontend/src` 有 8 个在制文件**（`git status --porcelain`，全部属 VS-29，非本卡）：

```
 M frontend/src/components/LoadFailureAlert.tsx
 M frontend/src/components/MemoryManager.tsx
 M frontend/src/components/ResearchRuns.tsx
 M frontend/src/i18n/en.ts
 M frontend/src/i18n/zh.ts
 M frontend/src/pages/Chat.tsx
 M frontend/src/pages/Dashboard.tsx
 M frontend/src/pages/Discussion.tsx
```

（本会话开始时 `git status --short` **为空**；上述文件是在本卡执行期间由其它卡写入的。）

**(c) 两条推论。**

- **(a→) 本窗口内一切耗时数字都是"并发负载下所测"，不是静默基线。**本卡 §3/§9 的毫秒数、以及任何"超时"观察，都必须在"另有 vitest 在跑"的前提下解读。本卡**不据此改代码、也不据此放宽断言**。
- **(b→) `bun run build` 会把 VS-29 的在制 `src` 一起 `tsc -b` + `vite build`。**该命令的作用域是全仓前端，不是本卡的两个测试文件。
  - **边界（必须原样保留）**：**我不能证明该构建失败与本卡无关，也不能证明有关。**本卡的两处改动都在 `frontend/tests/` 下，`tsc -b`/`vite build` 不编译测试文件；但"本卡没碰构建输入"只是**我的**证据，**不等于**构建结果可归因于本卡——若构建红，其失败点若落在 VS-29 的在制 `src` 上，归属需要另外的实验（例如把 `src` 回退到 `HEAD` 再构建一次对照）才能判定，本卡不替它选归属。
  - 构建原始输出与退出码见 §9。

## 5. 断言强度未削弱（机器比对）

### 5.1 VS-26 的三处期望值：逐字未变

比对方法：`git show HEAD:<file>` 取改前内容，与工作树逐行 `-match` 抽取命中行，再用 **case-sensitive（`-ceq`）** 比较整行。

```
########## frontend/tests/ResearchWorkspaceEvidence.test.tsx ##########
it( 计数   HEAD=14  WORK=14
  [site1] 命中数 HEAD=1 WORK=1  逐字相同=True
      WORK: await waitFor(() => expect((within(card).getByRole('textbox', { name: '选择龙虎榜窗口截止日期' }) as HTMLInputElement).value).toBe(shanghaiToday()));
  [site2] 命中数 HEAD=1 WORK=1  逐字相同=True
      WORK: await waitFor(() => expect(within(card).getByRole('button', { name: /2026-08-27/, pressed: true })).toBeTruthy());
  [site3] 命中数 HEAD=1 WORK=1  逐字相同=True
      WORK: await waitFor(() => expect(screen.getByText('龙虎榜：龙虎榜接口不可用')).toBeTruthy());
########## frontend/tests/ResearchFollowupPrompt.test.tsx ##########
it( 计数   HEAD=10  WORK=10
```

⇒ 三处 `waitFor` 的**期望值逐字未变**；两文件 `it(` 计数不变（14 / 10）⇒ **没删测试**。

### 5.2 未新增任何弱断言

对**新增行**（`git diff -U0` 的 `+` 行）扫描：

```
  queryBy        -> 0
  not\.toThrow   -> 0
  toBeDefined    -> 0
  expect\.any    -> 0
```

全文件计数对照（HEAD vs WORK）：Evidence `queryBy 12/12`、其余 0/0；FollowupPrompt `queryBy 6/6`、其余 0/0（**该文件原本 6 处 `queryBy` 是既有断言，非本卡新增**）。

> 备注（自查后修正的一处）：注释初稿里写了 `queryBy* / not.toThrow / toBeDefined / expect.any` 四个**字面 token**，会被机械扫描误判成"新增弱断言命中 1 处"。已改写为不含这些 token 的中文描述，上面的 0 命中是**改写后**的结果。**代码里从未出现过这些弱断言。**

## 6. 顺序安全核对：`clearAllMocks` → `resetAllMocks`

**问题**：`resetAllMocks` 会清实现，若文件里有 fork 在 `reset` **之前**设置的 mock 实现，就会被清掉 ⇒ 用例静默失去自证能力。逐项核对：

1. **全部 mock 都来自 `vi.hoisted` 的 `api` 对象**（`:12-27`，14 个 `vi.fn()`），**模块级没有任何 `mockImplementation/mockResolvedValue`**。
2. **`beforeEach` 内的顺序**：`localStorage.clear()` → `setItem` → **`vi.resetAllMocks()`（第 124 行）** → 11 个 mock 依次设默认实现（`:125-140`）。⇒ 实现**全部在 reset 之后**设置，**清不到**。
3. **机器核对**（扫描全文件所有 mock 设置点，检查是否有行号 < 124 者）：

```
=== 设置点中位于第 124 行之前者（应为空）===
 119: // 它留下的未消费 mockResolvedValueOnce 会顺延给后续用例，让 once 队列整体错位一格，
```

   唯一命中是**本卡自己那段注释的文本**（提到 `mockResolvedValueOnce` 这个词），**不是代码**。⇒ 行号 < 124 的真实设置点：**0 个**。

4. **测试体内的设置**（`:144,175,185,193,217,235,261,273,275,293-295,316,320-321,343,344,357,379,399,401,436-440,443`）都发生在 `beforeEach` **之后**，与 reset 无冲突。
5. **4 个"从未设实现"的 mock**：`fetchResearchReport`(`:21`) / `listResearchWorkspaces`(`:24`) / `saveResearchWorkspace`(`:25`) / `searchInstruments`(`:26`)——全文件只出现在 `vi.hoisted` 声明处，**既未设实现、也未被断言**。`clearAllMocks` 与 `resetAllMocks` 下它们都返回 `undefined`，**行为无差异**。

**对照（改前 → 改后）**

| | 改前 `clearAllMocks` | 改后 `resetAllMocks` |
| --- | --- | --- |
| `mock.calls/results` | 每条用例前清 | 每条用例前清（等价） |
| once 队列 | **不清**（缺陷来源） | **清**（修好） |
| 默认实现 | **不清**（要考 `beforeEach` 逐条覆盖） | 清，但 `beforeEach` 随后逐条重设（等价） |
| 上面 4 个未设实现的 mock | 返回 `undefined` | 返回 `undefined`（等价） |
| 跨用例实现泄漏 | 会（例如 `:343` 的 `mockRejectedValue` 会留到下一用例，靠 `beforeEach` 的重设才被覆盖） | 不会（更封闭） |

⇒ **顺序安全：是。**改后语义更封闭（不再依赖"每条用例都恰好覆盖了上一条泄漏的实现"）。

**另一个方向的风险（评估者 ① 问的"某用例不再自证"）**：`resetAllMocks` 只会让 mock 更早回到"无实现"状态，**不会**让任何断言变松；它可能暴露的是"某条用例其实依赖了上一条的实现泄漏"。本次交付态 3 次运行里 **14 条用例 41 次通过、唯一 1 次失败是负载超时**（§9），**未出现"因为 reset 清掉了实现而失败"的用例** ⇒ 不存在这种依赖。

## 7. 语义探针：`resetAllMocks` 是否真的清 once 队列 ✅ 6/6 passed

探针文件 `%TEMP%\vs31\tests\V31Semantics.test.ts`（**不进仓库**，不依赖 React）。它把"改了有用"变成**可执行断言**，而不是读文档：

```ts
it('clearAllMocks 之后 mockResolvedValueOnce 仍然生效', async () => {
  const fn = vi.fn(); fn.mockResolvedValueOnce('once-value');
  vi.clearAllMocks();
  expect(await fn()).toBe('once-value');            // ← 缺陷成立
});
it('resetAllMocks 之后 mockResolvedValueOnce 被清空（不再有返回值）', async () => {
  const fn = vi.fn(); fn.mockResolvedValueOnce('once-value');
  vi.resetAllMocks();
  expect(await fn()).toBe(undefined);               // ← 修法有效
});
it('resetAllMocks 不会清掉"在它之后"重新设置的非 once 实现（顺序安全性对照）', ...);
// B 组：跨用例泄漏探针
it('B1：排入一条 once 后不清（模拟用例提前中断）', ...);
it('B2：clearAllMocks 语义下，下一条用例拿到的是上一条遗留的 once 值', ...);   // ← "错位一格"
it('B3：resetAllMocks 语义下，遗留 once 被清空，下一条用例拿到 undefined', ...);
```

原始输出：

```
 RUN  v4.1.10 C:/Users/Satanchen/AppData/Local/Temp/vs31

 ✓ tests/V31Semantics.test.ts > A. … > clearAllMocks 之后 mockResolvedValueOnce 仍然生效 4ms
 ✓ tests/V31Semantics.test.ts > A. … > resetAllMocks 之后 mockResolvedValueOnce 被清空（不再有返回值） 1ms
 ✓ tests/V31Semantics.test.ts > A. … > resetAllMocks 不会清掉"在它之后"重新设置的非 once 实现（顺序安全性对照） 1ms
 ✓ tests/V31Semantics.test.ts > B. … > B1：排入一条 once 后不清（模拟用例提前中断） 0ms
 ✓ tests/V31Semantics.test.ts > B. … > B2：clearAllMocks 语义下，下一条用例拿到的是上一条遗留的 once 值 0ms
 ✓ tests/V31Semantics.test.ts > B. … > B3：resetAllMocks 语义下，遗留 once 被清空，下一条用例拿到 undefined 1ms

 Test Files  1 passed (1)
      Tests  6 passed (6)
   Duration  1.46s (transform 128ms, setup 551ms, import 47ms, tests 10ms, environment 0ms)
[WALL] HARNESS-SEMANTICS : 7.8s
```

⇒ **`resetAllMocks` 确实清 once 队列（B3/第 2 条），`clearAllMocks` 确实不清（B2/第 1 条）**，且 reset 不会清掉它之后设置的非 once 实现（第 3 条，即 §6 的顺序安全结论的可执行对照）。

## 8. 鉴别力证明（副本变异，`%TEMP%\vs31\tests\`）

全部变异体都由**当前交付态文件的机器副本**生成，指向**真实的 `frontend/src`**（junction），**不在仓库目录里**。
原始日志：`%TEMP%\vs31\vs31_verify.log`（§8.1）、`%TEMP%\vs31\mut1_repeat.log` 与 `%TEMP%\vs31\mut4_repeat.log`（§8.3）。

| 变异体 | 相对交付态 | 预期 |
| --- | --- | --- |
| `Evidence.mut1.test.tsx` | `resetAllMocks`→`clearAllMocks` **且** 第 1 处 VS-26 断言退回**同步断言** | 第 2、3 处（仍带 `waitFor`）**同时变红** |
| `Evidence.mut2a.test.tsx` | 保留 `resetAllMocks`，**插入一条故意失败的探针用例**（留下未消费的 `mockResolvedValueOnce`） | 探针红，**其余全绿**（队列被 reset 清掉） |
| `Evidence.mut2b.test.tsx` | `clearAllMocks` + 同一条探针 | 探针红 **且**下一条真实用例红（被遗留 once 污染） |
| `Evidence.mut4.test.tsx` | **交付态 `resetAllMocks`**，只把第 1 处退回同步断言（**与 `mut1` 逐字相同，唯一差异是那一行**） | site1 红，**site2/site3 必须保持绿**（对照） |
| `FollowupPrompt.mut3.test.tsx` | **逐字等于 HEAD**（即退掉本卡的超时改动） | 见 §9（受负载影响，如实记录） |

`mut1` 里退回的那行同步断言与 **pre-VS-26 原文逐字相同**（`git show fca8364~1:…` 比对 `True`）：

```
pre-VS-26 : [    expect((within(card).getByRole('textbox', { name: '选择龙虎榜窗口截止日期' }) as HTMLInputElement).value).toBe(shanghaiToday());]
mut1      : [    expect((within(card).getByRole('textbox', { name: '选择龙虎榜窗口截止日期' }) as HTMLInputElement).value).toBe(shanghaiToday());]
逐字相同: True
```

原始输出见下方与 §9 `HARNESS-MUTANTS`。

### 8.1 实测结果

```
 × tests/Evidence.mut2b.test.tsx > … > MUTANT PROBE: leaves an unconsumed once value behind 297ms
 × tests/Evidence.mut2b.test.tsx > … > keeps chip snapshots and switches the historical field locally
                                      without refetching workspace data 4887ms          ← 被污染的真实用例
 ✓ (mut2b 其余 13 条真实用例全绿)
 × tests/Evidence.mut2a.test.tsx > … > MUTANT PROBE: leaves an unconsumed once value behind 29ms
 ✓ (mut2a 全部 14 条真实用例全绿)                                                        ← 同一条探针，队列被 reset 清掉
 ✓ (mut1 全部 14 条通过 —— **这一次未复现判据**，追加 3 次重跑后 2 次命中，见 §8.3)
 ✓ (FollowupPrompt.mut3 全部 10 条通过)

⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯
 FAIL  tests/Evidence.mut2a.test.tsx > … > MUTANT PROBE: leaves an unconsumed once value behind
AssertionError: expected 'probe' to be 'this-fails-on-purpose' // Object.is equality
Expected: "this-fails-on-purpose"; Received: "probe"

 FAIL  tests/Evidence.mut2b.test.tsx > … > MUTANT PROBE: leaves an unconsumed once value behind   ← 同上（探针自身按设计失败）

 FAIL  tests/Evidence.mut2b.test.tsx > … > keeps chip snapshots and switches the historical field locally without refetching workspace data
AssertionError: expected [ '99.00%', '1,480.25 CNY', …(2) ] to deeply equal [ '62.50%', '1,480.25 CNY', …(2) ]

 Test Files  2 failed | 2 passed (4)
      Tests  3 failed | 51 passed (54)
   Duration  224.67s (transform 7.23s, setup 2.20s, import 120.30s, tests 89.15s, environment 10.52s)
[WALL] HARNESS-MUTANTS : 226.8s
```

### 8.2 判读

- **A/B 只差一行**：`mut2a`（交付态 `resetAllMocks`）与 `mut2b`（退回 `clearAllMocks`）是**同一份文件 + 同一条探针**，唯一差别就是 `beforeEach` 那一行。结果：`mut2a` 的探针留下未消费的 once 后 **14 条真实用例全绿**；`mut2b` 里**下一条真实用例真的红了**，且红在**期望值本身**（拿到 `99.00%`，期望 `62.50%`——正是探针排进去的那条 once）。⇒ **`resetAllMocks` 是承重的、且承重方式与 §2.1 的根因完全一致**。

### 8.3 卡面判据（`mut1`）——**已复现**，并配了同源的对照 `mut4`

卡面判据："只把第 1 处改回同步断言 ⇒ 第 2、3 处**仍带 `waitFor`** 却同时变红。"

`mut1`（`clearAllMocks` + 第 1 处退回同步断言；第 2、3 处的 `waitFor` 原样保留）在 `HARNESS-MUTANTS` 里**未命中**（第 1 处那条用例通过），于是**追加了 3 次重跑**。同时造了**同源对照 `mut4`**：**只把 `beforeEach` 换回交付态的 `resetAllMocks`，其余与 `mut1` 逐字相同**（`Compare-Object` 的差异只有那一行）。

| 运行 | `mut1`（★退回 `clearAllMocks`） | `mut4`（交付态 `resetAllMocks`） |
| --- | --- | --- |
| 第 1 次 | **3 failed / 11 passed**：site1 + **site2** + **site3** 全红 ★ | 2 failed / 12 passed：site1 +（筹码用例负载超时）；**site2/site3 绿** |
| 第 2 次 | 1 failed / 13 passed：仅筹码用例负载超时（site1/2/3 全绿） | 1 failed / 13 passed：**仅 site1** 红；**site2/site3 绿** |
| 第 3 次 | **3 failed / 11 passed**：site1 + **site2** + **site3** 全红 ★ | 2 failed / 12 passed：site1 +（筹码用例负载超时）；**site2/site3 绿** |
| 合计 | **2/3 复现判据**（另加 `HARNESS-MUTANTS` 那次未命中 → 总计 2/4） | **0/3 出现"site2/site3 变红"** |

`mut1` 第 1 次的原始失败明细（三条正是判据描述的三处）：

```
⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯
 FAIL  tests/Evidence.mut1.test.tsx > … > keeps historical selection after a failed date and resets after a successful workspace retry
AssertionError: expected '2026-08-20' to be '2026-09-12' // Object.is equality      ← site1：同步断言当场失败（DatePicker 未回滚）
 ❯ tests/Evidence.mut1.test.tsx:305:100
      305|     expect((within(card).getByRole('textbox', { name: '选择龙虎榜窗口截止日期' })…
 FAIL  tests/Evidence.mut1.test.tsx > … > resets selection on a real symbol navigation when the same workspace component is reused
TestingLibraryElementError: Unable to find role="button" and name `/2026-08-27/`   ← site2：once 队列被 site1 遗留值顶掉一格 ⇒ 000001 的数据没落地
 FAIL  tests/Evidence.mut1.test.tsx > … > keeps both cards visible with honest Empty fallbacks when fetchers fail
（同上，级联）                                                                      ← site3
 Test Files  1 failed (1)
      Tests  3 failed | 11 passed (14)
```

⇒ 结论：**卡面判据成立且可复现**（`mut1` 2/4 次命中，且第 3 次重跑是在**并发 vitest 进程数 = 1 的静默窗口**里命中的，说明它不是"负载专属"现象）；**修好后同一处改动不再污染后续用例**（`mut4` 三次里 site2/site3 **一次都没红**）。两次判据命中时，第 2、3 处的 `waitFor` 都在（`:334`、`:349`），却因**队列错位**而红——与 VS-26 的记录一致。

### 8.4 变异体与交付态的差异（自查过的一处不完美）

- `mut1` 的那行同步断言与 `git show fca8364~1` 的 pre-VS-26 原文**逐字相同**（`-ceq` → `True`）。
- **但不完美（仅 `mut1`，不影响上表结论）**：`mut1` 里第 1 处的三条 VS-26 **注释**没删干净（我的删除逻辑只认以 `// VS-26` 开头的那一行），于是留下"注释说要 waitFor、代码却是同步断言"的错位；`mut4` 已修正为逐条删除。**仅注释层、不影响语义**，且这些文件只存在于 `%TEMP%`、从不进仓库；记录在此以免评估者被它误导。

## 9. 门禁原始输出

日志：`%TEMP%\vs31\vs31_verify.log`（**不在仓库内**）。运行顺序按编排者指定的优先级：语义探针 → 变异体 → 两文件各 3 次 → 构建。每次运行前记录当时的并发 vitest 进程数。

```
=== HARNESS-SEMANTICS ===
[LOAD] 运行前 vitest 相关进程数（含本卡） = 10
 Test Files  1 passed (1)
      Tests  6 passed (6)
   Duration  1.46s (transform 128ms, setup 551ms, import 47ms, tests 10ms, environment 0ms)
[WALL] HARNESS-SEMANTICS : 7.8s

=== HARNESS-MUTANTS ===
[LOAD] 运行前 vitest 相关进程数（含本卡） = 14
 × tests/Evidence.mut2b.test.tsx > … > MUTANT PROBE: leaves an unconsumed once value behind 297ms
 × tests/Evidence.mut2b.test.tsx > … > keeps chip snapshots and switches the historical field locally without refetching workspace data 4887ms
 × tests/Evidence.mut2a.test.tsx > … > MUTANT PROBE: leaves an unconsumed once value behind 29ms
 Test Files  2 failed | 2 passed (4)
      Tests  3 failed | 51 passed (54)
   Duration  224.67s (transform 7.23s, setup 2.20s, import 120.30s, tests 89.15s, environment 10.52s)
[WALL] HARNESS-MUTANTS : 226.8s

=== EVIDENCE-1 ===
[LOAD] 运行前 vitest 相关进程数（含本卡） = 8
 × tests/ResearchWorkspaceEvidence.test.tsx > … > keeps chip snapshots and switches the historical field locally without refetching workspace data 5209ms
   → Test timed out in 5000ms.
Error: Test timed out in 5000ms.
 Test Files  1 failed (1)
      Tests  1 failed | 13 passed (14)
   Duration  72.47s (transform 2.93s, setup 887ms, import 37.33s, tests 30.86s, environment 2.81s)
[WALL] EVIDENCE-1 : 74.1s

=== EVIDENCE-2 ===
[LOAD] 运行前 vitest 相关进程数（含本卡） = 4
 Test Files  1 passed (1)
      Tests  14 passed (14)
   Duration  46.99s (transform 1.81s, setup 905ms, import 22.65s, tests 18.74s, environment 3.75s)
[WALL] EVIDENCE-2 : 49.9s

=== EVIDENCE-3 ===
[LOAD] 运行前 vitest 相关进程数（含本卡） = 5
 Test Files  1 passed (1)
      Tests  14 passed (14)
   Duration  39.58s (transform 1.33s, setup 557ms, import 21.80s, tests 14.41s, environment 2.29s)
[WALL] EVIDENCE-3 : 41.0s

=== FOLLOWUP-1 ===
[LOAD] 运行前 vitest 相关进程数（含本卡） = 4
 ✓ … > 标的研究页：追问真的被接住（问答面 + 可见回执 + 可发送草稿），不再停在原地 8224ms
 ✓ … > 追问去向只有一个规范形态（两条入口都由它拼 URL） 1ms
 × … > 两路径对照：同一次追问从两条入口提交，落地指纹完全相同 5804ms
   → Test timed out in 5000ms.
 ✓ … > 追问优先于 mode：?mode=deep 也照样把问题交给能作答的问答面 3904ms
 ✓ … > 消费后清理：地址栏不再带 prompt，刷新（无 state 重新进入）不再重放 2032ms
 ✓ … > 无标的的既有 B6 行为不变：预填 + 自动检索一次，并清理地址栏 502ms
 ✓ … > 空 prompt：不发起任何研究/追问，只清理地址栏 3382ms
 ✓ … > 纯空白 prompt：同"空"，不得发起空追问 1671ms
 × … > 连续提交两次不同追问：以最后一次为准，且不重跑第一次 8608ms
   → Test timed out in 5000ms.
 ✓ … > 回归：无标的 + mode=fast 时 Chat 自己的 ?prompt= 草稿契约不变（不动它） 1779ms
Error: Test timed out in 5000ms.
Error: Test timed out in 5000ms.
 Test Files  1 failed (1)
      Tests  2 failed | 8 passed (10)
   Duration  95.40s (transform 10.15s, setup 799ms, import 55.03s, tests 35.91s, environment 2.95s)
[WALL] FOLLOWUP-1 : 99.0s

=== FOLLOWUP-2 ===
[LOAD] 运行前 vitest 相关进程数（含本卡） = 7
 ✓ … > 标的研究页：追问真的被接住（问答面 + 可见回执 + 可发送草稿），不再停在原地 2342ms
 ✓ … 其余 9 条 1–1689ms
 Test Files  1 passed (1)
      Tests  10 passed (10)
   Duration  85.28s (transform 4.22s, setup 4.82s, import 48.92s, tests 8.15s, environment 21.91s)
[WALL] FOLLOWUP-2 : 91.4s

=== FOLLOWUP-3 ===
[LOAD] 运行前 vitest 相关进程数（含本卡） = 1
 ✓ … > 标的研究页：追问真的被接住（问答面 + 可见回执 + 可发送草稿），不再停在原地 3328ms
 ✓ … > 两路径对照：同一次追问从两条入口提交，落地指纹完全相同 1703ms
 ✓ … > 追问优先于 mode：?mode=deep 也照样把问题交给能作答的问答面 1126ms
 ✓ … > 消费后清理：地址栏不再带 prompt，刷新（无 state 重新进入）不再重放 760ms
 ✓ … > 无标的的既有 B6 行为不变：预填 + 自动检索一次，并清理地址栏 244ms
 ✓ … > 空 prompt：不发起任何研究/追问，只清理地址栏 849ms
 ✓ … > 纯空白 prompt：同"空"，不得发起空追问 628ms
 ✓ … > 连续提交两次不同追问：以最后一次为准，且不重跑第一次 913ms
 ✓ … > 回归：无标的 + mode=fast 时 Chat 自己的 ?prompt= 草稿契约不变（不动它） 113ms
 Test Files  1 passed (1)
      Tests  10 passed (10)
   Duration  47.35s (transform 4.88s, setup 872ms, import 33.26s, tests 9.71s, environment 2.91s)
[WALL] FOLLOWUP-3 : 49.3s

=== BUILD: bun run build (frontend) ===
$ ../backend/.venv/Scripts/python.exe ../scripts/openapi_tsgen.py --check
OK: E:\Code_file\Projects\finquant-hub\frontend\src\types\openapi.generated.ts is fresh (60 schemas)
$ tsc -b && vite build
vite v6.4.3 building for production...
transforming...
✓ 4262 modules transformed.
…
✓ built in 1m 37s
[BUILD EXIT] 0  [WALL] 165.8s
=== ALL DONE ===
```

### 9.1 逐条判读

| 验收项 | 结果 |
| --- | --- |
| 1. `ResearchWorkspaceEvidence` 连跑 3 次 | **2/3 全绿（14/14、14/14）；EVIDENCE-1 为 13/14** —— 唯一红的是**该文件第一条用例**，`Test timed out in 5000ms`（实测 **5209 ms**）。**按环境铁律，不据此改任何代码、也不放宽任何断言**，如实记为负载噪声（§10）。 |
| 1b. "第 1 处过而第 2/3 处红"是否再现 | **未再现**：3 次运行中，VS-26 的 **site1 / site2 / site3 三条用例全部通过**（EVIDENCE-1 里 site1=4308 ms、site2=2387 ms、site3=726 ms，均 ✓）。**唯一那次红与 VS-26 三处无关**（是文件首条筹码用例的负载超时）。<br>对照：把第 1 处退回同步断言后（`mut1`，§8.3），4 次运行里 **2 次**出现"site1 红 + site2/site3 同时红"；而保留 `resetAllMocks` 的同源对照 `mut4`，3 次运行里 site2/site3 **一次都没红**。 |
| 2. 顺序安全证明 | §6（机器核对：reset 之前无任何实现设置点） |
| 3. `ResearchFollowupPrompt` 首条用例耗时 + 3 次 | 首条用例 **8224 / 2342 / 3328 ms**；**2/3 全绿（10/10、10/10），FOLLOWUP-1 为 8/10** —— 红的是**另外两条**用例（5804 ms、8608 ms）的负载超时，**首条用例在 15s 上限下通过**（若无此改动则为红）。 |
| 4. 断言未削弱 | §5（三处期望值逐字相同；新增行弱断言 0 命中） |
| 5. 鉴别力 | §8：①`mut2a` vs `mut2b`（同一探针，只差 `beforeEach` 一行 ⇒ 一绿一红，红在期望值本身）；②**卡面判据 `mut1` 已复现**（4 次里 2 次出现 site1/site2/site3 同红），并由**同源对照 `mut4`**（只差 `beforeEach` 一行，保留 `resetAllMocks`）证明三次运行里 site2/site3 **一次都没红**。 |
| 6. `bun run build`（串行） | **exit 0**，`tsc -b` 通过、`vite build` `✓ 4262 modules transformed`、`✓ built in 1m 37s`；prebuild 的 `openapi_tsgen.py --check` 亦 OK。**归属边界见 §4(c)**。 |

## 10. 未解决问题与风险

### 10.1 未达成/未复现的验收项（如实列出）

1. **`ResearchWorkspaceEvidence` 未做到"3/3 全绿"**：EVIDENCE-1 里**该文件的第一条用例**（`keeps chip snapshots…`，`:143`）以 `Test timed out in 5000ms`（实测 5209 ms）变红，另两次 14/14。按环境铁律**未据此改代码**。
   **它不是本卡引入的（有副本对照）**：同一条筹码用例在**改前形态**副本（`mut1`＝`clearAllMocks`＋同步断言）里也超时（7866 ms），在**改后形态**副本（`mut4`）里同样超时（6998 ms、5205 ms）——两种形态下都出现，说明它是"该用例在此负载下逼近 5s"的属性。⇒ 本卡**只能证明它不是本卡引入**，不能证明"它与本卡绝对无关"；这是同一件事的两个方向，不要混为一谈。
2. **卡面判据（`mut1`）初跑未命中、重跑后命中**：`HARNESS-MUTANTS` 里的第 1 次 `mut1` 未复现（第 1 处那条用例通过），**追加 3 次重跑后 2 次命中**（含一次静默窗口）。最终结论是**已复现**，详见 §8.3；保留"初跑未命中"这一事实，因为它说明**该判据是竞态、不是确定性判据**（4 次里 2 次）。
3. **`ResearchFollowupPrompt` 未做到"3/3 全绿"**：FOLLOWUP-1 里**第 3、9 条**用例（5804 ms、8608 ms）越过默认 5s ⇒ 红。**首条用例本身（8224 ms）靠本卡的 15s 上限通过。**

### 10.2 "只给首条用例加超时"这个范围选择（需要编排者知情的取舍）

- 本卡把 15s 只加在**首条用例**上，依据是**静默窗口的实测**：首条 1757 ms（35% 预算），其余最长 1466 ms（29%）。**编排者已明确认可该范围**（"只给首条用例加 15s、断言一字未改，符合卡面要求"）。
- 但本次实测暴露：**峰值负载下该文件还有别的用例会越过 5s**（5804 ms / 8608 ms）。⇒ 若目标是"负载下整文件不再假红"，需要在**整文件**层面抬高上限（卡面第二个选项原文即"为该文件显式提高超时"）。**本卡没有这么做**，理由：卡面的环境铁律明写"**不得据此改代码**"，且"放大到整文件"属于范围扩张，应由编排者决定是否另开一张卡。
- **取舍的代价**：FOLLOWUP-1 那次运行依然红（虽然红的不是首条用例）。**这是已知的残余脆弱性，不是本卡的回归。**

### 10.3 我做错的一件事（已通报）

清理自己遗留的 vitest 进程时**判定条件写得过宽**（白名单只排除了 `ListFailureNotEmptiness`），**误杀了另一个卡的两个 vitest 运行**（`tests/Dashboard.test.tsx`、`tests/ResearchDeadlineSi…`）。已即时通报编排者；本卡结论不含它们的用例。教训：清理进程必须**正向匹配自己的命令行**，绝不用排除法。

### 10.4 风险

- **`resetAllMocks` 更严格的副作用**：它会让"依赖上一条用例实现泄漏"的用例暴露出来。本文件 14 条用例在这三次运行里表现与改前一致（除负载那次），**未观察到此类依赖**；但若后续有人新增用例，必须在该 `beforeEach` 里显式设好实现（这本来就是正确写法）。
- **本轮所有毫秒数都不是静默基线**（§4）。任何据此得出的"性能结论"都不成立；本卡只用它判断"是否逼近默认上限"。
- **门禁构建的归属**：见 §4(c) 的边界声明。

## 11. 声明

- **未 commit**；工作树里本卡的改动只有这两个测试文件。
- 本卡**零生产代码改动**：本会话中我只对 `frontend/tests/ResearchWorkspaceEvidence.test.tsx` 与 `frontend/tests/ResearchFollowupPrompt.test.tsx` 执行过写操作，`frontend/src` **一次都没碰**（工作树里 `frontend/src` 的 8 个 M 文件是 **VS-29 在制**：本会话开始时 `git status --short` **为空**，它们是在本卡执行期间由其它卡写入的；其内容也与"测试卫生"无关）。**边界**：这是一条关于"我做过什么"的陈述，不是对那 8 个文件内容的归因。
- 变异/复现/门禁输出**全部**在 `%TEMP%\vs31`，仓库目录内未产生任何夹具或日志；`frontend/tests/` 下**没有任何**本卡新增的临时文件（已复核文件清单）。
