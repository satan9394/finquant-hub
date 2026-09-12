# EVALUATION RESULT — VS-39：Discover 因子失败伪装成空 + DiscoverThemes 同族

> 独立验收者：本轮唯一 Subagent（Reviewer）。**未修改任何源码/测试/配置**，只写了本文件与
> `EVALUATION_RESULT_VS38.md`。所有门禁与变异实验均在 `$env:TEMP` 副本内完成并在验收结束时回收进回收站。
> 显式基线锚点：`cf2514a93006891f93c55b79c31262b37601dbd2`（**不使用 `HEAD~1` 这类相对锚点**）。
> 实现者结果文件 `IMPLEMENT_RESULT_VS39.md` **只作线索，未作证据**。

## 1. 判定

**VS-39：ACCEPT。**

卡面验收标准 ①–⑦ **全部满足**（逐条见 §4）。无阻塞项；§7 列出 3 条 NIT 与 3 条残余风险，均不改变判定。
其中卡面点名的「`DiscoverThemes` 快捷选词按钮不受 loading 门控」一项，实现者选择「使其安全（`requestId` 归属守卫）」而非「消除并发」，并在新测试里把「在途可点」当作**接受的行为**断言——**我裁定：达标**。理由：卡面把该点写在「现状」里作为同族实例，并未把它本身列为验收标准；而验收标准 ④ 要求的三件事（换词不串 / 反向断言 / 归属保留）**全部满足且测试有鉴别力**。详见 §4④ 与 §6。

## 2. 我验的是什么状态（内容哈希，不是「工作区 vs HEAD」）

被验对象是**工作树当前内容**本身。下表是本轮**实测**（验收开始时与结束时各测一次，逐字节相同）：

| 文件 | `git hash-object` | 归属 |
|---|---|---|
| `frontend/src/pages/Discover.tsx` | `b0be94e44930e09977e49360ca2f37b60b28e0df` | VS-39 源 |
| `frontend/src/components/DiscoverThemes.tsx` | `c2b24ecb25de440d73800d114ea8c05a21fd2983` | VS-39 源 |
| `frontend/src/components/GlobalTaskEntry.tsx` | `e96417a76af6675fc55674c6674457bb279ddbdc` | VS-38 源 |
| `frontend/src/i18n/zh.ts` | `313e9a37c8b1ca39267dede506b1aadbbe05a769` | 两卡共用 |
| `frontend/src/i18n/en.ts` | `9b279f0f6ea3b8bdc1c05db270c7c91ed9b2d5f3` | 两卡共用 |
| `frontend/tests/DiscoverFactorScope.test.tsx`（未跟踪） | `1673ecdb443110371f1f43df4181ca68b99991f9` | VS-39 新测试 |
| `frontend/tests/DiscoverThemesScope.test.tsx`（未跟踪） | `8f23a8d9a36e62534a5ba955b62ef27b2c46eafa` | VS-39 新测试 |
| `frontend/tests/GlobalTaskEntryQueryScope.test.tsx`（未跟踪） | `023baec03be5197f3405c7f8ef7e1e8659001220` | VS-38 新测试 |

`cf2514a` 上的对应 blob（供对照，均为 `git rev-parse cf2514a:<path>` 实测）：

```
Discover.tsx         af858d87a3cb227cbda5f975ea4f96e47471166d
DiscoverThemes.tsx   a324a569f4d82f84e3662e991cadacd9606afe58
GlobalTaskEntry.tsx  e4236b5c8156ef981b9ba6c3bd2f7f1db51c5d3f
i18n/zh.ts           397a31f6e1d20eb02ce8fa00f7d731b16509bf94
i18n/en.ts           1bd73afed8e5c72b0793fa31691078de070cca8a
```

工作树卫生：验收全程结束后 `git status --porcelain` 与验收开始时**逐条相同**（5 个 `M` + 8 个 `??`）——即**我没有动过仓库**。
本轮唯一写入的真实树文件是本报告与 `EVALUATION_RESULT_VS38.md`。
临时标记扫描（`TEMP-REPRO|TEMP_REPRO|MUTATED|XXX-TEMP`）对 5 个源文件**0 命中**。

## 3. 我自己跑出来的门禁原始输出

### 3.1 门禁 1 —— 相关 vitest（在 `$env:TEMP\vs38_39_baseline\frontend` 副本内，junction 指回真实 `node_modules`）

命令与完整逐文件结果见 `EVALUATION_RESULT_VS38.md` §3.1（两卡为**同一批次、同一次运行**，12 个文件一起跑）。关键原始行：

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
   Duration  338.58s (transform 9.30s, setup 7.56s, import 243.63s, tests 43.53s, environment 37.80s)

EXITCODE=0
```

**验证的是「工作树内容」**：跑门禁前对副本逐文件做过 blob 哈希比对，与 §2 表完全相等。
本卡直接相关的 3 个既有文件 `DiscoverQueryScope`（4）、`DiscoverUX`（4）、`DiscoverModeDispatch`（2）、`DiscoverSearch`（2）、`DiscoverResults`（2）**全部通过**。

### 3.2 门禁 2 —— `bun run build`（独立副本内）

```
$ ../backend/.venv/Scripts/python.exe ../scripts/openapi_tsgen.py --check
OK: E:\Code_file\Projects\finquant-hub\frontend\src\types\openapi.generated.ts is fresh (60 schemas)
$ tsc -b && vite build
vite v6.4.3 building for production...
✓ 4263 modules transformed.
✓ built in 57.85s
REAL_EXITCODE=0
```

### 3.3 既有断言未被放宽

```
$ git diff cf2514a --stat -- frontend/tests/
(无输出)
```

即 `frontend/tests/` 下**没有任何既有测试文件被修改**；3 个新文件为未跟踪新增。

### 3.4 i18n

实测：**zh 2499 键 / en 2499 键；双方均无重复；zh−en = ∅、en−zh = ∅**。
本卡新增键 `discover.factorSearchFailed` 双语齐备，使用点唯一且存在：

```
frontend/src/pages/Discover.tsx:232:        failureMessage={t('discover.factorSearchFailed')}
frontend/src/i18n/en.ts:129:  'discover.factorSearchFailed': 'Factor catalogue search failed. Please retry.',
frontend/src/i18n/zh.ts:129:  'discover.factorSearchFailed': '因子目录检索失败，请稍后重试。',
```

（同批 VS-38 的 `command.searchFailed` 亦有使用点，见 VS38 报告。）

## 4. 卡面「验收标准」①–⑦ 逐条

### ① 两处现状核实（含真实行号）——**满足**

我用 `git show cf2514a:<path>` 逐行核对改动前源码，卡面点名的两处**在 `cf2514a` 上确实成立**：

**（a）`Discover.tsx` —— 因子检索失败被渲染成 `discover.noFactors` 空态**

| 卡面报点 | 实测（改动前 `cf2514a`） | 内容 | 判定 |
|---|---|---|---|
| `:115` | `:115` | `if (factorResult.status === 'rejected') message.warning(t('discover.factorUnavailable'));` | 命中：**失败只留一条瞬时 toast** |
| （实现者报 `:106`） | `:106` | `factors: factorResult.status === 'fulfilled' ? factorResult.value : [],` | **rejection 被折成空数组** |
| `:199` | `:199`（整块 `:194-201`） | `<List … locale={{ emptyText: t('discover.noFactors') }} />` | **精确命中**：失败 ⇒ 空数组 ⇒ 屏幕写着「没有匹配的真实因子目录结果」 |

⇒ 「**失败伪装成空**」确凿成立，且**不可重试**（没有任何重试入口）。

**（b）`DiscoverThemes.tsx` —— 无归属布尔 + 发起时清 + 无重试**

| 卡面报点 | 实测（改动前 `cf2514a`） | 内容 | 判定 |
|---|---|---|---|
| `:10-14` | `:12` / `:14` | `const [payload, setPayload] = useState<MarketThemesResponse \| null>(null)` / `const [error, setError] = useState(false)` | 命中：**两个各自赋值的 state**，`error` 是**无归属布尔量** |
| `:19-21` | `:21` / `:22` | `setError(false)` / `setPayload(null)` | 命中：**发起时清** |
| （实现者报 catch 在 `:26-27`） | `:26` / `:27` | `catch { if (id === requestId.current) setError(true); }` | **精确命中**：`catch` **不接 error 参数 ⇒ 底层原文被吞掉** |
| `:37` | `:37` | `{error && <Alert type="warning" showIcon message={t('discover.themes.failed')} />}` | **精确命中**：**没有任何重试入口** |
| `:35` | `:35` | `<Button key={value} onClick={() => void run(value)}>` 快捷选词 | **精确命中**：**不受 loading 门控** |

⇒ 两处结论与实现者 §1 一致，**且实现者报的改动前行号与我的逐行核对全部吻合**（卡面 `Discover.tsx:115` 的所指与实测同号但含义不同：`:115` 是 toast 行，「折成空数组」在 `:106`）。

### ② 因子失败**可见且可重试**（含**请求计数**证明真重发）——**满足**

实现侧：`Discover.tsx:67` 新增 `factorSearchFailure{query,error}`；`:111-122` `fulfilled` 时写入 `next.factors` 并**「成功才清」**同词失败态、`rejected` 时**写入带归属的失败 + 底层原文**（不再折成 `[]`）；`:171-181` `factorState` 由族内唯一 `readStateOf` 判定；`:230-242` 由 `LoadStateView` 渲染，`:233` `onRetry={() => void run(objectFactorSearchFailure?.query ?? executedQuery)}`。

测试证据（本轮实跑）：

```
✓ 当前查询词的因子检索失败 ⇒ 显示它自己的失败与底层原文，且不渲染 noFactors 空态  2051ms
✓ 因子检索重试真的重发同一查询词（计数 1→2），且重试期间失败态保持显示  1013ms
  → searchAlpha 计数 1→2；toHaveBeenLastCalledWith('茅台')；在途时 WQ-DOWN-1 仍在；成功后失败态消失
✓ 板块读取失败 ⇒ 显示失败与底层原文，重试真的重发同一关键词（计数 1→2）  3533ms
  → /market/themes 调用次数 1→2；params.keyword === '半导体'
```

### ③ 不伪装成空——**满足**

`:230-234` 空态只在 `readStateOf` 判为 `empty` 时渲染，而 `empty` 要求 `resolved && count === 0`（`LoadFailureAlert.tsx:51-56`），`failed` 优先级最高（第 1 条）。

```
✓ 当前查询词的因子检索失败 ⇒ … 且不渲染 noFactors 空态（queryByText('没有匹配的真实因子目录结果') 为 null）
✓ 因子检索重试…（重试在途时 queryByText(noFactors) 仍为 null）
✓ 换查询词后上一词的因子失败不得挂在新词上…（同上）
```

**空态未被误伤（守卫）**：`✓ 因子检索成功但确实没有匹配 ⇒ 仍然显示"没有匹配的真实因子目录结果"  573ms` —— 修前修后都绿，属正当守卫（不是空断言）。

### ④ `DiscoverThemes` 换词不串 + 反向断言 + 归属保留——**满足**

实现侧：`:19` `ThemesOutcome{keyword,payload}`；`:30` `failure{keyword,error}`；`:33-55` `run()` **不再在发起时清**、成功写 `outcome` 并「成功才清」同词失败态、失败写带归属的 `failure` **并带出原文**；`:57-59` `scopedOutcome`/`scopedFailure` 只认 `=== keyword.trim()` 的那一份；`:68-69` 失败与内容**互斥**渲染，失败走 `LoadFailureAlert` + `onRetry={() => void run(scopedFailure.keyword)}`。

```
✓ 改动输入框换成别的词后上一词的失败不得继续显示；切回旧词仍显示它自己的失败（不重发）  636ms
  → editDraft('新能源') 后两条失败文案均为空；editDraft('半导体') 后 THEMES-DOWN-半导体 回来
    且 themesCalls().length 仍为 1 ⇒ 归属来自状态本身，未重发
✓ 当前关键词自己失败 ⇒ 显示它自己的错误原文；换词后新词的失败不带旧词的原文  456ms
✓ 换词在途时不得继续显示上一词的结果  743ms
✓ 在途时点另一个快捷词（按钮不受 loading 门控）⇒ 迟到的失败不得挂到新词上  560ms
```

**关于「快捷选词按钮仍不受 loading 门控」（卡面 `:35`，实现者 §6.2 主动列为待裁定项）**：
我裁定**达标**。依据三点：①卡面把它写在「现状」里作为同族实例，**验收标准 ④ 只要求「换词不串 + 反向断言 + 归属保留」**，三条全部满足且可由测试证明；②实现者把「在途可点」改成**被断言接受的行为**（用例 5 先断言「在途点击真的发出第二个请求」= 并发可达，再断言「迟到的失败不得挂到新词上」）——这是**把并发安全化**而非掩盖；③`DiscoverThemes.tsx:36`/`:44`/`:50` 的 `id !== requestId.current` 三处早退 + `:57-59` 的归属收窄，使并发下的错配在结构上不可能。

### ⑤ 既有测试全绿——**满足**

见 §3.1：12 文件 / 44 用例 / exit 0；§3.3 证明既有断言未被改动。

### ⑥ 鉴别力证明（副本里退回修复 ⇒ 至少一条新用例变红）——**满足（本轮自做，见 §5）**

### ⑦ 门禁：相关 vitest + `bun run build`——**满足（见 §3.1 / §3.2）**

## 5. 我自己做的鉴别力证明

**全部在 `$env:TEMP` 副本内进行；真实工作树从未被变异。** 副本基线以 **git blob 哈希逐字节证明**：

### 探针 1 —— 5 个源文件全部退回 `cf2514a`

```
Discover.tsx         cf2514a-blob=af858d87a3cb227cbda5f975ea4f96e47471166d  副本实测=af858d87a3cb227cbda5f975ea4f96e47471166d  match=True
DiscoverThemes.tsx   cf2514a-blob=a324a569f4d82f84e3662e991cadacd9606afe58  副本实测=a324a569f4d82f84e3662e991cadacd9606afe58  match=True
GlobalTaskEntry.tsx  cf2514a-blob=e4236b5c8156ef981b9ba6c3bd2f7f1db51c5d3f  副本实测=e4236b5c8156ef981b9ba6c3bd2f7f1db51c5d3f  match=True
i18n/zh.ts           cf2514a-blob=397a31f6e1d20eb02ce8fa00f7d731b16509bf94  副本实测=397a31f6e1d20eb02ce8fa00f7d731b16509bf94  match=True
i18n/en.ts           cf2514a-blob=1bd73afed8e5c72b0793fa31691078de070cca8a  副本实测=1bd73afed8e5c72b0793fa31691078de070cca8a  match=True
```

结果：

```
 Test Files  3 failed (3)
      Tests  12 failed | 3 passed (15)
   Duration  88.96s (transform 1.06s, setup 1.20s, import 40.29s, tests 40.10s, environment 5.95s)
```

**本卡相关：`DiscoverFactorScope` 3/4 红、`DiscoverThemesScope` 3/5 红 ⇒ 合计 6/9 红。**
**超时计数 = 0**（对完整 stdout 做 `Test timed out|timed out in` 计数，命中 0）⇒ 全部是**语义断言失败**。红样原文（我自己跑出来的）：

```
 FAIL  tests/DiscoverFactorScope.test.tsx > … > 当前查询词的因子检索失败 ⇒ 显示它自己的失败与底层原文，且不渲染 noFactors 空态
TestingLibraryElementError: Unable to find an element with the text: /因子目录检索失败/.
 ❯ tests/DiscoverFactorScope.test.tsx:72:26

 FAIL  tests/DiscoverFactorScope.test.tsx > … > 换查询词后上一词的因子失败不得挂在新词上；新词显示它自己的错误原文
TestingLibraryElementError: Unable to find an element with the text: WQ-FAIL-茅台.
 ❯ tests/DiscoverFactorScope.test.tsx:85:25
   （修前 catch 把 rejection 折成 factors: []，根本不带原文）

 FAIL  tests/DiscoverThemesScope.test.tsx > … > 当前关键词自己失败 ⇒ 显示它自己的错误原文；换词后新词的失败不带旧词的原文
TestingLibraryElementError: Unable to find an element with the text: THEMES-FAIL-半导体.
 ❯ tests/DiscoverThemesScope.test.tsx:101:25
   （修前 error 是无归属布尔量，原文被吞掉）
```

### 探针 2 —— 只退回 3 个组件、**保留新的 i18n 键**（排除「缺键」这一解释）

```
Discover.tsx / DiscoverThemes.tsx / GlobalTaskEntry.tsx  → 全部 match=True（等于 cf2514a blob）
i18n/zh.ts actor=313e9a37… == 工作树 blob match=True
i18n/en.ts actor=9b279f0f… == 工作树 blob match=True
```

```
 Test Files  3 failed (3)
      Tests  12 failed | 3 passed (15)
   Duration  73.62s (transform 852ms, setup 1.26s, import 32.31s, tests 33.24s, environment 5.68s)
```

**键在而文本不出现 ⇒ 本卡 6/9 仍红。失败只可能来自行为缺失，与「缺键」无关。**

### 基线仍绿的 3 条（15−12）——正当守卫，不是空断言

| 用例 | 为何本就该前后都绿 |
|---|---|
| `DiscoverFactorScope` › `因子检索成功但确实没有匹配 ⇒ 仍然显示"没有匹配的真实因子目录结果"` | 守卫「别把空态改坏」——修前修后都必须绿 |
| `DiscoverThemesScope` › `换词在途时不得继续显示上一词的结果` | 修前的「发起时清」恰好也满足它 ⇒ 无回归守卫 |
| `DiscoverThemesScope` › `在途时点另一个快捷词 ⇒ 迟到的失败不得挂到新词上` | 修前已有 `requestId` 守卫 ⇒ 无回归守卫 |

（13 条「修后绿 / 修前红」中，本卡占 6 条：`DiscoverFactorScope` 3 条（第 4 条是守卫）+ `DiscoverThemesScope` 3 条（另 2 条是守卫）；其余 6 条属 VS-38。）

## 6. 反向检验：「有没有另一种**错误**的改法也能让这些用例全绿？」

结论：**对 VS-39，我构造出的每一种错误改法都被至少一条用例拦住**；同时我**明确标出**两处判据较松的地方，不夸大测试的分辨力。

| # | 错误改法 | 是否全绿 | 拦住它的用例（依据） |
|---|---|---|---|
| a | `DiscoverThemes`：改回「发起时清」`payload`/`error`，但给 `error` 补上 keyword 归属（即只做一半） | **否** | 用例 2「切回旧词仍显示它自己的失败**且 `themesCalls().length === 1`（不重发）**」⇒ 发起时清会把归属信息丢掉、切回看不到 ⇒ 红。 |
| b | `DiscoverThemes`：保留 `error: boolean`，仅补「失败可重试」按钮 | **否** | 用例 2/3 需要**区分是哪一词的失败原文**（`THEMES-DOWN-半导体` vs `THEMES-FAIL-新能源`）⇒ 布尔量带不出原文 ⇒ 红。 |
| c | `DiscoverThemes`：失败态保持显示但 `onRetry` 里重发**输入框当前词**而非失败所属词 | **未被本卡用例直接命中** | 与 VS-38 同型的判据空隙：失败态只在 `keyword.trim() === failure.keyword` 时渲染，两者在 UI 上等价。见 §7 NIT-2。 |
| d | `Discover.tsx`：因子失败补了内联错误态，但**不重发**（重试按钮是空操作 / 只重渲染） | **否** | 用例 3 `searchAlpha` 计数 1→2 + `toHaveBeenLastCalledWith('茅台')` ⇒ 红。 |
| e | `Discover.tsx`：因子失败补了内联错误态，但把 `emptyContent` 也一起显示（失败态与空态并存） | **否** | 用例 1/2/3 都对 `queryByText('没有匹配的真实因子目录结果')` 断言为 null ⇒ 红。 |
| f | `Discover.tsx`：把因子失败改成「空态文案换成一句更委婉的话」 | **否** | 用例 1 要求 `/因子目录检索失败/` + 底层原文可见，且空态文案为空 ⇒ 红。 |
| g | `DiscoverThemes`：用 `useEffect` 在 keyword 变化时清 `payload`/`failure`（「切实体时清」） | **否** | 用例 2「切回旧词仍显示它自己的失败**且不重发**」⇒ 清掉之后切回看不到 ⇒ 红。**这条正是 `AGENTS.md` 点名的那类「RTL 的 `act` 冲刷看不见中间帧」的改法，本例中它被归属保留断言直接拦住**。 |

**两处判据较松、我如实标注的地方**（不把绿灯当结构证明）：

1. **用例 5（并发）分辨力有限**：我读代码确认，`first.reject(new Error('THEMES-LATE-FAIL'))` 到达时，即使**去掉** `DiscoverThemes.tsx:50` 的 `id !== requestId.current` 早退，失败仍会被 `:59` 的归属收窄挡在渲染之外（`failure.keyword='半导体'` ≠ `keyword.trim()='新能源'`）。⇒ **用例 5 的绿灯不能单独证明 `requestId` 守卫有效**；它是「无回归守卫」+「归属结构」的叠加结果。真正的结构证明在 `:57-59` 的 `=== currentKeyword`。
2. **`DiscoverFactorScope` 的因子失败「不加输入框门」（实现者 §6.4 的有意形状差异）未被测试区分**：因子失败只按 `executedQuery` 收窄，不按输入框当前值收窄（`:167-173` 的注释说明了理由）。现有用例都在 `submitQuery` 之后立刻断言，**没有**「提交后改动输入框但不提交 ⇒ 因子失败是否仍显示」这类用例。我读代码判定：此时 `executedQuery` 仍是旧词、`factors` 仍显示在「当前对象」的卡片里，故失败继续显示是**一致的**，不构成串台。**但这是代码推理，未实测。**

**结构性理由（不依赖用例）**：两处修法的共同判据都是**状态自带实体归属**——`Discover.tsx` 的 `factorSearchFailure{query,error}`、`DiscoverThemes.tsx` 的 `outcome{keyword,payload}` / `failure{keyword,error}`，渲染处用 `=== executedQuery` / `=== keyword.trim()` 收窄；两处的 `run()` 都**删除了发起时的清除动作**（`DiscoverThemes.tsx` 修前 `:21-22` 的 `setError(false)`/`setPayload(null)` 已被删除；`Discover.tsx` 修前 `:106` 的三元已改为 `factors: []` + 分支赋值）。这从结构上排除了「靠清状态掩盖串台」。

## 7. NIT 与残余风险

**NIT（非阻塞，最多 3 条）**

1. **`Discover.tsx:130` 仍保留瞬时 `message.warning(t('discover.factorUnavailable'))`**，与新内联失败态并存（实现者 §6.3 已列出，我确认）。属冗余观感，非缺陷。
2. **重试的操作数在 UI 上不可区分**（§6 第 c 行）：`run(objectFactorSearchFailure?.query ?? executedQuery)` 的 `??` 右支在当前渲染条件下取不到。这是判据空隙而非缺陷；若将来去掉归属收窄，两者会分叉。
3. **因子重试会连带重跑整个 `run()`**（重新 `searchStocks` + `POST /screening`），而不只是重发 `searchAlpha`。功能上无害（`Promise.allSettled` 会重新取回全部产出），但一次「重试因子」会额外产生 2 个请求；用例 3 的计数只对 `searchAlpha` 断言，**未覆盖**这一点。属实现选择，非缺陷。

**残余风险（最多 3 条）**

1. **空态可能延迟出现**（实现者 §7.3）：`resolved` 取 `!!scopedOutcome`，而 `outcome` 只在**该对象整体 `allSettled` 落定后**写入 ⇒ 因子已返回但 screening 仍在途时，因子区显示**加载态**而非空态。我读代码确认这是 VS-29 口径的有意取舍（「宁可说加载中，也不说确实没有」），不是缺陷。
2. **本机负载下的时间数字不可外推**：本轮门禁 `import` 阶段 243.63s、鉴别力探针 88.96s/73.62s，均为本机常态抖动（同一用例跨窗口可差 2–10 倍）。**我没有因此放宽任何断言或超时。**
3. **并发窗口边界**：本轮验收窗口内本机有大量**其他项目**的并发 vitest/node 进程（`Composable_Agent_Harness`、`model-infra-kit` 等）。我的三次运行**全部在独立 `$env:TEMP` 副本内串行执行**（副本 `node_modules` 是指回真实树的 junction），且失败全部是语义断言失败（超时计数 0）。**我能证明的是：我的三份输出都来自我自己的副本；我不能证明**该窗口的机器负载与我的耗时数字之间的因果关系。

## 8. 边界声明

**我不能证明的**：我证明的是「这 5 个源文件 + 3 个新测试文件的当前内容下，12 个相关文件 44 条用例在副本内全绿、`bun run build` exit 0、且退回 `cf2514a` 后本卡 6 条新用例必然语义性变红」；**我不能证明**这些改动在真实浏览器与真实后端（真实 `/market/themes`、真实 WQ 因子目录）下的端到端表现，也不能证明本批改动与仓库里其他并发进程/其他卡在制代码之间的因果归属。
