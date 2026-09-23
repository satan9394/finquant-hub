# EVALUATION RESULT — VS-38：GlobalTaskEntry 的结果/失败态按查询词作用域

> 独立验收者：本轮唯一 Subagent（Reviewer）。**未修改任何源码/测试/配置**，只写了本文件与
> `EVALUATION_RESULT_VS39.md`。所有门禁与变异实验均在 `$env:TEMP` 副本内完成并在验收结束时回收进回收站。
> 显式基线锚点：`cf2514a93006891f93c55b79c31262b37601dbd2`（**不使用 `HEAD~1` 这类相对锚点**）。
> 实现者结果文件 `IMPLEMENT_RESULT_VS38.md` **只作线索，未作证据**；下文每条结论都来自本轮自己的复现。

## 1. 判定

**VS-38：ACCEPT。**

卡面验收标准 ①–⑧ **全部满足**（逐条见 §4）。无阻塞项；§7 列出 3 条 NIT 与 3 条残余风险，均不改变判定。
注意：卡面实现「改后行号」表（`IMPLEMENT_RESULT_VS38.md` §2）有若干处偏移与过宽，详见 §4①末（**不影响判定**，因为代码结构与行为经本轮独立复现成立）。

## 2. 我验的是什么状态（内容哈希，不是「工作区 vs HEAD」）

被验对象是**工作树当前内容**本身。下表是本轮**实测**（验收开始时与结束时各测一次，逐字节相同）：

| 文件 | `git hash-object` | 归属 |
|---|---|---|
| `frontend/src/components/GlobalTaskEntry.tsx` | `e96417a76af6675fc55674c6674457bb279ddbdc` | VS-38 源 |
| `frontend/src/pages/Discover.tsx` | `b0be94e44930e09977e49360ca2f37b60b28e0df` | VS-39 源 |
| `frontend/src/components/DiscoverThemes.tsx` | `c2b24ecb25de440d73800d114ea8c05a21fd2983` | VS-39 源 |
| `frontend/src/i18n/zh.ts` | `313e9a37c8b1ca39267dede506b1aadbbe05a769` | 两卡共用 |
| `frontend/src/i18n/en.ts` | `9b279f0f6ea3b8bdc1c05db270c7c91ed9b2d5f3` | 两卡共用 |
| `frontend/tests/GlobalTaskEntryQueryScope.test.tsx`（未跟踪） | `023baec03be5197f3405c7f8ef7e1e8659001220` | VS-38 新测试 |
| `frontend/tests/DiscoverFactorScope.test.tsx`（未跟踪） | `1673ecdb443110371f1f43df4181ca68b99991f9` | VS-39 新测试 |
| `frontend/tests/DiscoverThemesScope.test.tsx`（未跟踪） | `8f23a8d9a36e62534a5ba955b62ef27b2c46eafa` | VS-39 新测试 |

`cf2514a` 上的对应 blob（供对照，均为 `git rev-parse cf2514a:<path>` 实测）：

```
GlobalTaskEntry.tsx  e4236b5c8156ef981b9ba6c3bd2f7f1db51c5d3f
Discover.tsx         af858d87a3cb227cbda5f975ea4f96e47471166d
DiscoverThemes.tsx   a324a569f4d82f84e3662e991cadacd9606afe58
i18n/zh.ts           397a31f6e1d20eb02ce8fa00f7d731b16509bf94
i18n/en.ts           1bd73afed8e5c72b0793fa31691078de070cca8a
```

工作树卫生：验收全程结束后 `git status --porcelain` 与验收开始时**逐条相同**（5 个 `M` + 8 个 `??`，无新增无删除）——即**我没有动过仓库**。
本轮唯一写入的真实树文件是本报告与 `EVALUATION_RESULT_VS39.md`。

## 3. 我自己跑出来的门禁原始输出

### 3.1 门禁 1 —— 相关 vitest（在 `$env:TEMP\vs38_39_baseline\frontend` 副本内，junction 指回真实 `node_modules`）

命令（12 个文件：3 个新 + 9 个既有）：

```
bun run test -- tests/GlobalTaskEntryQueryScope.test.tsx tests/DiscoverThemesScope.test.tsx tests/DiscoverFactorScope.test.tsx
  tests/GlobalTaskEntry.test.tsx tests/DiscoverQueryScope.test.tsx tests/DiscoverUX.test.tsx
  tests/DiscoverModeDispatch.test.tsx tests/DiscoverSearch.test.tsx tests/DiscoverResults.test.tsx
  tests/CommandBar.test.tsx tests/CommandComposer.test.tsx tests/AlphaResearchQueryScope.test.tsx
```

关键原始行：

```
 ✓ tests/GlobalTaskEntryQueryScope.test.tsx (6 tests) 16346ms
 ✓ tests/DiscoverThemesScope.test.tsx (5 tests) 5933ms
 ✓ tests/DiscoverFactorScope.test.tsx (4 tests) 4878ms
 ✓ tests/DiscoverQueryScope.test.tsx (4 tests) 4168ms
 ✓ tests/AlphaResearchQueryScope.test.tsx (6 tests) 2602ms
 ✓ tests/DiscoverUX.test.tsx (4 tests) 2835ms
 ✓ tests/GlobalTaskEntry.test.tsx (3 tests) 1838ms
 ✓ tests/DiscoverResults.test.tsx (2 tests) 1196ms
 ✓ tests/DiscoverModeDispatch.test.tsx (2 tests) 1233ms
 ✓ tests/CommandComposer.test.tsx (3 tests) 976ms
 ✓ tests/DiscoverSearch.test.tsx (2 tests) 815ms
 ✓ tests/CommandBar.test.tsx (3 tests) 706ms

 Test Files  12 passed (12)
      Tests  44 passed (44)
   Start at  13:26:27
   Duration  338.58s (transform 9.30s, setup 7.56s, import 243.63s, tests 43.53s, environment 37.80s)

EXITCODE=0
```

**验证的是「工作树内容」**：跑门禁前对副本逐文件做过 blob 哈希比对，5 个源文件 + 3 个新测试文件与 §2 表**完全相等**。

### 3.2 门禁 2 —— `bun run build`（在独立的 `$env:TEMP\vs38_39_build` 副本内；该副本额外 junction 了 `backend/` 与 `scripts/` 供 `prebuild` 使用）

```
$ ../backend/.venv/Scripts/python.exe ../scripts/openapi_tsgen.py --check
OK: E:\Code_file\Projects\finquant-hub\frontend\src\types\openapi.generated.ts is fresh (60 schemas)
$ tsc -b && vite build
vite v6.4.3 building for production...
transforming...
✓ 4263 modules transformed.
...
✓ built in 57.85s

(!) Some chunks are larger than 500 kB after minification. ...
REAL_EXITCODE=0
```

（`✓ 4263 modules transformed` 与实现者报告一致；chunk 体积告警为既有常态，非本轮引入。）

### 3.3 既有断言未被放宽

```
$ git diff cf2514a --stat -- frontend/tests/
(无输出)
```

即 `frontend/tests/` 下**没有任何既有测试文件被修改**；3 个新文件为未跟踪新增（与 §2 哈希一致）。
另：本轮逐字读了 `GlobalTaskEntry.test.tsx`、`DiscoverQueryScope.test.tsx`、`DiscoverUX.test.tsx`，未发现断言被弱化。

### 3.4 i18n

实测（本轮自己解析 `src/i18n/*.ts` 的顶层字符串键）：**zh 2499 键 / en 2499 键；zh 无重复、en 无重复；zh−en = ∅、en−zh = ∅**。
本卡新增键 `command.searchFailed` 双语齐备，使用点唯一且存在：

```
frontend/src/components/GlobalTaskEntry.tsx:222:            failureMessage={t('command.searchFailed')}
frontend/src/i18n/en.ts:92:  'command.searchFailed': 'Security search failed. Retry, or enter a code directly.',
frontend/src/i18n/zh.ts:92:  'command.searchFailed':  '标的搜索失败，可重试或直接输入代码。',
```

（同批 VS-39 的 `discover.factorSearchFailed` 亦有使用点，见 VS39 报告。）

## 4. 卡面「验收标准」①–⑧ 逐条

### ① 现状核实（含真实行号与「其它同族状态」扫描）——**满足**

我用 `git show cf2514a:frontend/src/components/GlobalTaskEntry.tsx`（blob `e4236b5c…`）逐行核对改动前源码，卡面两个缺陷**在 `cf2514a` 上确实成立**：

| 卡面报点 | 实测（改动前 `cf2514a`） | 内容 | 判定 |
|---|---|---|---|
| `:46` | `:46` | `const [query, setQuery] = useState('');` | 命中 |
| `:48` | `:48` | `const [results, setResults] = useState<GlobalTaskTarget[]>([]);` | 命中：**裸数组，无查询词归属** |
| `:70-92` | `:70-92` | `runSearch` | 命中 |
| `:153` | `:153` | `onChange={(e) => { setQuery(...); setSelected(null); }}` | 命中：**只清 `selected`，完全不动 `results`** |
| 未点名 | `:157` | `{results.length > 0 && <List dataSource={results} …/>}` | **渲染处不校验归属** ⇒ 这才是「换词仍挂着上一词候选」的落点 |
| 未点名 | `:86` | `catch { setResults([]); … }` | **失败清空 ⇒ 与「查到 0 条」同形** |
| 未点名 | `:181` | `) : !results.length && <Empty … description={t('command.empty')} />}` | **失败态/未查过态都由这个空态渲染** |

⇒ 缺陷 1（`results` 无归属、`onChange` 不清结果）与缺陷 2（失败渲染成「没有结果」，非 ticker 词只有一条转瞬即逝的 `message.warning` 且**不可重试**）**均成立**。
⇒ 实现者结果文件 §1 的「改前行号」表**全部属实**（我逐行比对，`e4236b5c…` 与实际源码一致）。

**其它同族状态扫描**：卡面要求「扫一遍该文件是否还有别的同族状态」。实现者 §1 的扫描**经我独立复核成立**——`saved`（`:51`/`:56-58`，渲染 `:112` 的 `targetList`）与 `recent`（`:50`/`:55`）确实是同族未修项；`selected`（`:49`）确属不同族（用户当前选择，非某次查询的产出）。见 §7 NIT-1。

**（不影响判定的行号偏移，如实记录）** 我对实现者 §2 的「改后行号」表逐行核对实际文件，命中情况：`import` 在 `:16` ✔；`TaskSearchOutcome`/`TaskSearchFailure` 在 `:25-28`/`:34-37` ✔；`outcome`/`searchFailure` 在 `:70`/`:72`、`pendingQuery` 在 `:75` ✔；`requestId` 在 `:80` ✔；`runSearch(rawQuery = query)` 在 `:99` ✔；取 id 与 try/catch 守卫在 `:108-131` ✔；「成功才清」在 `:115-117` ✔；渲染作用域块在 `:167-183` ✔；**唯一偏差**：报告写 `:219-239` 的 `LoadStateView` 三态块，实际为 **`:219-238`**（多算一行；`onRetry` 实际在 `:223`）。**结论：该表准确度很高，仅一处区间上界多一行；判定所依赖的结构与行为全部复核成立。**

### ② 换词不串——**满足**

代码（`GlobalTaskEntry.tsx`）：

- `:70` `outcome: TaskSearchOutcome | null`（`{query, results}`），`:72` `searchFailure`（`{query, error}`），`:75` `pendingQuery`；
- `:167-170` `scopedOutcome/scopedFailure/scopedPending` **只认「等于 `query.trim()`」的那一份**；
- `:213` `onChange` 仍只做 `setQuery` + `setSelected(null)`——**旧候选之所以消失，靠的是归属不匹配，不是「切词时清」**。

测试证据（本轮实跑，副本内）：

```
✓ 换查询词（还没提交）后不得再挂着上一词的候选；词改回来候选回来（归属保留）  8197ms
  → 断言 `type('五粮液')` 后 `candidate('贵州茅台','600519')` 为 null；`type('茅台')` 后候选回来
✓ 换词在途时：不得显示上一词的候选，也不得把"在途"渲染成"没有结果"  2439ms
```

### ③ 反向断言——**满足**

`GlobalTaskEntryQueryScope.test.tsx:105-115`：

```
✓ 反向断言：当前词自己失败 ⇒ 必须显示它自己的失败，且不得伪装成"没有结果"  671ms
  → findByText(/标的搜索失败/) 命中；getByText('market search offline') 命中（底层原文不吞）；
    queryByText(EMPTY_HINT) 为 null
```

### ④ 重试真重发（含请求计数与解耦）——**满足**

实现侧：`:223` `onRetry={() => void runSearch(scopedFailure?.query)}` —— 重试**重发失败所属的那个查询词**（不是输入框当前值），且不在发起时清失败态（`:117` 用 `setSearchFailure(current => …)` 只在**成功**时清同词失败）。

```
✓ 重试真的重发同一个词（请求计数），且失败态与"成功"解耦：重发在途仍保持、成功后才消失  1649ms
  → searchStocks 计数 1→2；toHaveBeenLastCalledWith('茅台')；重发在途时失败态仍在；成功后才消失
```

### ⑤ 失败不伪装成空——**满足**

`:122-125` `catch` **不再** `setResults([])`，改为写入带归属的 `searchFailure` 并带出 `error.message`；`:175-180` 三态由族内唯一的 `readStateOf` 判定（`failed` 优先），`:219-238` 由 `LoadStateView` 渲染；`:239` 未开始时的占位是**一句提示文案**（`command.empty`）而非 `Empty` 空态组件。

```
✓ 换词在途时：… 也不得把"在途"渲染成"没有结果"（queryByText(EMPTY_HINT) 为 null）
✓ 反向断言：… 且不得伪装成"没有结果"（同上）
```

### ⑥ 既有测试全绿——**满足**

见 §3.1：`GlobalTaskEntry.test.tsx`（3）、`DiscoverQueryScope`（4）、`DiscoverUX`（4）、`DiscoverModeDispatch`（2）、`DiscoverSearch`（2）、`DiscoverResults`（2）、`CommandBar`（3）、`CommandComposer`（3）、`AlphaResearchQueryScope`（6）**全部通过**；合计 12 文件 / 44 用例 / exit 0。且 §3.3 证明既有断言未被改动。

### ⑦ 鉴别力证明（副本里退回修复 ⇒ 至少一条新用例变红）——**满足（本轮自做，见 §5）**

### ⑧ 门禁：相关 vitest + `bun run build`——**满足（见 §3.1 / §3.2）**

## 5. 我自己做的鉴别力证明

**全部在 `$env:TEMP` 副本内进行；真实工作树从未被变异。** 副本基线以 **git blob 哈希逐字节证明**（不是「工作区 vs HEAD」这类提交后即失效的对照）：

### 探针 1 —— 5 个源文件全部退回 `cf2514a`

```
GlobalTaskEntry.tsx  actor=e4236b5c8156ef981b9ba6c3bd2f7f1db51c5d3f expected=e4236b5c8156ef981b9ba6c3bd2f7f1db51c5d3f match=True
Discover.tsx         actor=af858d87a3cb227cbda5f975ea4f96e47471166d expected=af858d87a3cb227cbda5f975ea4f96e47471166d match=True
DiscoverThemes.tsx   actor=a324a569f4d82f84e3662e991cadacd9606afe58 expected=a324a569f4d82f84e3662e991cadacd9606afe58 match=True
i18n/zh.ts           actor=397a31f6e1d20eb02ce8fa00f7d731b16509bf94 expected=397a31f6e1d20eb02ce8fa00f7d731b16509bf94 match=True
i18n/en.ts           actor=1bd73afed8e5c72b0793fa31691078de070cca8a expected=1bd73afed8e5c72b0793fa31691078de070cca8a match=True
```

结果（`bun run test -- tests/GlobalTaskEntryQueryScope.test.tsx tests/DiscoverFactorScope.test.tsx tests/DiscoverThemesScope.test.tsx`）：

```
 Test Files  3 failed (3)
      Tests  12 failed | 3 passed (15)
   Duration  88.96s (transform 1.06s, setup 1.20s, import 40.29s, tests 40.10s, environment 5.95s)
```

**本卡相关：`GlobalTaskEntryQueryScope.test.tsx` 6 条用例全部变红（6/6 fail）。**
**超时计数 = 0**（我对完整 stdout 做了 `Test timed out|timed out in` 计数，命中 0）⇒ 全部是**语义断言失败**，不是负载假红。红样原文（我自己跑出来的）：

```
 FAIL  tests/GlobalTaskEntryQueryScope.test.tsx > … > 换查询词（还没提交）后不得再挂着上一词的候选；词改回来候选回来（归属保留）
AssertionError: expected <button …(3)>…(3)</button> to be null
+ Received: <button aria-label="选择 贵州茅台 600519" …>
 ❯ tests/GlobalTaskEntryQueryScope.test.tsx:75:41
   75|     expect(candidate('贵州茅台', '600519')).toBeNull();

 FAIL  … > 反向断言：当前词自己失败 ⇒ 必须显示它自己的失败，且不得伪装成"没有结果"
TestingLibraryElementError: Unable to find an element with the text: /标的搜索失败/.
 ❯ tests/GlobalTaskEntryQueryScope.test.tsx:125:25
```

这两条正是**修前缺陷的直接证据**：①改字后旧候选仍挂着；②失败只走瞬时 toast，没有任何可归因的失败态。

### 探针 2 —— 只退回 3 个组件、**保留新的 i18n 键**（排除「缺键」这一解释）

```
GlobalTaskEntry.tsx actor=e4236b5c… match=True      i18n/zh.ts actor=313e9a37… == 工作树 blob match=True
Discover.tsx        actor=af858d87… match=True      i18n/en.ts actor=9b279f0f… == 工作树 blob match=True
DiscoverThemes.tsx  actor=a324a569… match=True
```

```
 Test Files  3 failed (3)
      Tests  12 failed | 3 passed (15)
   Duration  73.62s (transform 852ms, setup 1.26s, import 32.31s, tests 33.24s, environment 5.68s)
```

**键在而文本不出现 ⇒ `GlobalTaskEntryQueryScope` 仍 6/6 红。失败只可能来自行为缺失，与「缺键」无关。**

### 基线仍绿的 3 条（15−12）——正当守卫，不是空断言

| 用例 | 为何本就该前后都绿 |
|---|---|
| `DiscoverFactorScope` › `因子检索成功但确实没有匹配 ⇒ 仍然显示"没有匹配的真实因子目录结果"` | 守卫「别把空态改坏」（属 VS-39） |
| `DiscoverThemesScope` › `换词在途时不得继续显示上一词的结果` | 修前的「发起时清」恰好也满足它 ⇒ 无回归守卫 |
| `DiscoverThemesScope` › `在途时点另一个快捷词 ⇒ 迟到的失败不得挂到新词上` | 修前已有 `requestId` 守卫 ⇒ 无回归守卫 |

（13 条「修后绿 / 修前红」中，本卡占 6 条：`GlobalTaskEntryQueryScope` 全部 6 条；另 7 条属 VS-39。）

## 6. 反向检验：「有没有另一种**错误**的改法也能让这些用例全绿？」

结论：**对 VS-38，我构造出的每一种错误改法都被至少一条用例拦住；但拦住它的用例条数与「直接命中结构」并不总是同一条，我把分辨力逐条写清楚。**

| # | 错误改法 | 是否全绿 | 拦住它的用例（依据） |
|---|---|---|---|
| a | 保留裸 `results` 数组，但 `onChange` 里 `setResults([])`（「切词时清」） | **否** | 用例 1 的**后半段**「词改回来候选回来」⇒ 清掉之后回不来 ⇒ 红。用例 5「切回旧词仍显示旧词自己的失败（计数仍为 2，未重发）」同样拦它（把归属信息丢了）。**这条是本卡最自然、也最危险的错误改法，测试确实拦住了。** |
| b | 改成「成功才清失败态 + 一个**无归属**的 error 布尔/字符串」 | **否** | 用例 2「换到新词 ⇒ 旧失败不得挂在新词上」⇒ 无归属失败会跟着新词显示 ⇒ 红；用例 5 同理。 |
| c | 把失败态做成「只在**当前请求**失败时才显示」，不保留归属 | **否** | 用例 5「切回旧词仍显示旧词自己的失败，且 `searchCallCount()` 仍为 2（**不重发**）」⇒ 归属丢失后切回就看不到了 ⇒ 红。 |
| d | 失败态做对了（带归属），但 `onRetry` 里**重发输入框当前词**而不是失败所属词 | **未被本卡用例直接命中**（用例 4/5/6 中两者恰好相等） | 这是一处**真实的判据空隙**：`GlobalTaskEntry.tsx:223` 的 `runSearch(scopedFailure?.query)` 在 UI 上等价于当前词（失败态只在 `query.trim() === failure.query` 时才渲染），所以「取当前词」与「取失败所属词」在现有用例下**无法区分**。见 §7 NIT-2。 |
| e | 把重试做成「只是重新渲染」（不真发请求） | **否** | 用例 4 `searchStocks` 计数 1→2 + `toHaveBeenLastCalledWith('茅台')` ⇒ 红。 |
| f | 把失败态在**重试发起时**清掉（退化成「发起时清」） | **否** | 用例 4「重发**在途**时失败态必须还在」⇒ 红。 |

**关于用例 6（并发/迟到响应）的严谨说明**：探针 1 里它也红了，但我**不能把它算作「结构正确性」的独立证据**——我读代码确认，`Discover.tsx`/`GlobalTaskEntry.tsx` 的 `id !== requestId.current` 早退与归属渲染**叠加**才成立；单独去掉归属、保留 `requestId` 守卫时，用例 6 仍有相当概率绿（因为迟到失败的早退先发生）。**它的价值是守住「迟到响应不得改写当前词」这条既有不变量，不是证明归属结构。** 我把它按「无回归守卫」对待。

**结构性理由（不依赖用例）**：本卡的正确性判据是**状态自带实体归属**——`TaskSearchOutcome.query` / `TaskSearchFailure.query` / `pendingQuery` 三者都携带「属于哪个查询词」，渲染处 `:167-170` 用 `=== query.trim()` 收窄。`onChange` 一行未增添任何清除动作（`:213` 与修前 `:153` 逐字相同），这从结构上排除了「靠清状态掩盖串台」这一类改法。

## 7. NIT 与残余风险

**NIT（非阻塞，最多 3 条）**

1. **同族仍有两处未修**（实现者 §6.1 已如实列出，我独立复核成立）：`:85-87` 的 `saved` 仍是 `.catch(() => setSaved([]))`，而 `targetList`（`:152`）在 `items.length === 0` 时**整块不渲染** ⇒「读取失败」与「确实没有已保存研究」在屏幕上同形；`:77` 的 `recent`（`readRecentTargets` 内部 catch 返回 `[]`）同理。卡面验收标准只点了 `results`，与 VS-36 先例（扫到即列出、不扩卡）一致，**故不判为未满足**；但「本族收口」的声明因此并不严格成立。
2. **`onRetry` 的操作数在 UI 上不可区分**（§6 第 d 行）：`runSearch(scopedFailure?.query)` 与 `runSearch()` 在当前渲染条件下等价。这是**判据空隙**而非缺陷——但若将来去掉「失败态只按 `query.trim()` 收窄」这道门，两者就会分叉。建议后续（非本卡）加一条「输入框已被改词时点重试，仍须重发失败所属词」的用例。
3. **失败时瞬时 `message.warning(t('command.searchUnavailable'))`（`:125`）与新内联错误态并存**，属冗余观感（实现者 §6.3 已列出，我确认）。非缺陷。

**残余风险（最多 3 条）**

1. **并发面**：失败态在重发期间保持显示 ⇒ 重试按钮在途仍可点，连点会产生多个并发请求（实现者 §7.1 已声明为有意取舍，用例 6 覆盖了「迟到失败不得覆盖已成功的新结果」）。我**不认为**这是缺陷，但它确实把「重试按钮的幂等性」交给了 `requestId` 守卫。
2. **本机负载下的时间数字不可外推**：本轮门禁 `import` 阶段 243.63s、鉴别力探针 88.96s/73.62s，均为本机常态抖动；同一用例在不同窗口可差 2–10 倍。**我没有因此放宽任何断言或超时**（`WAIT=5000`、`PER_TEST_MS=15000` 是新测试自带的、与同族既有文件一致的取值）。
3. **本轮验收窗口内本机有大量**其他项目**的并发 vitest/node 进程**（如 `Composable_Agent_Harness`、`model-infra-kit` 的 vitest）。我的三次运行**全部在独立 `$env:TEMP` 副本内串行执行**，副本的 `node_modules` 是指回真实树的 junction；结果文件里没有出现任何非本仓路径的失败。**我能证明的是：我的三份输出都来自我自己的副本、且失败全部是语义断言失败（超时计数 0）；我不能证明**该窗口的机器负载与我的耗时数字之间的因果关系。

## 8. 边界声明

**我不能证明的**：我证明的是「这 5 个源文件 + 3 个新测试文件的当前内容下，12 个相关文件 44 条用例在副本内全绿、`bun run build` exit 0、且退回 `cf2514a` 后本卡 6 条新用例必然语义性变红」；**我不能证明**这些改动在真实浏览器/真实后端数据下的端到端表现，也不能证明本批改动与仓库里其他并发进程/其他卡在制代码之间的因果归属。
