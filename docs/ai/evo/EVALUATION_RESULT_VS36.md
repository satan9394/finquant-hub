# EVALUATION_RESULT — VS-36：同族"状态未按实体作用域"（Discover 检索 / Alpha 检索）

> 判定：**ACCEPT**
> 被验对象：**`37c3eef9f46b1d805eb94e66cd41cd185df03e2e`**（`37c3eef`，VS-36 提交）
> 参照基线（**显式提交号，不用 `HEAD~1`**）：**`d44a850`**（本卡任务书提交）与 **`37c3eef^ = 415efe9`**；
> 已核实 `d44a850:Discover.tsx` / `37c3eef^:Discover.tsx` 的 blob **同为一个** `2aa08a7f…`（Alpha 面板同为 `44e84fb9…`）
> ⇒ 修前真身只有一个，两个锚点等价。
> 评估者：EVALUATOR（子代理，独立自建夹具，**未复用**实现者的任何断言）。工作目录 `E:\Code_file\Projects\finquant-hub`。
> 归档时间窗口内**另有 VS-37 评估者在跑 `scripts/audit.py`**（并发边界见 §5）。

---

## 0. 结论摘要

本卡的四项功能判据（换词不串 / 反向断言 / 归属保留 / 重试真重发且与成功解耦 / 失败不伪装成空）**在评估者自建夹具下逐条成立**；
提交面**只含声明的 5 个文件**，`LoadFailureAlert.tsx` 跨整个 VS-36 窗口**逐 blob 未变**；
鉴别力用**评估者自己的变异**独立复现（退回修前 ⇒ **8 red / 2 green**，与实现者 §5 的计数一致）。
实现者对"卡面两处错误"的纠正（路径错、机制只对一半）**经源码与运行时双重核实属实**。

发现的缺口**均不构成本卡判据的失败**，按观察项列出（§6），其中 **O3 是实现者可达性枚举里漏掉的一条**、
**O4 是实现者同族扫描里漏掉的第 4/5 处**。

---

## 1. 零回归 / 提交面（必做 5）

```
$ git show --name-only --format='' 37c3eef
docs/ai/evo/IMPLEMENT_RESULT_VS36.md
frontend/src/components/alpha/AlphaResearchPanel.tsx
frontend/src/pages/Discover.tsx
frontend/tests/AlphaResearchQueryScope.test.tsx
frontend/tests/DiscoverQueryScope.test.tsx

$ git show --numstat --format='' 37c3eef
185  0   docs/ai/evo/IMPLEMENT_RESULT_VS36.md
77   29  frontend/src/components/alpha/AlphaResearchPanel.tsx
71   20  frontend/src/pages/Discover.tsx
166  0   frontend/tests/AlphaResearchQueryScope.test.tsx
155  0   frontend/tests/DiscoverQueryScope.test.tsx
```

- 提交面 **= 声明的 5 个文件，无第 6 个**；两个测试文件 **`+166/-0`、`+155/-0` 纯新增**
  ⇒ "既有断言一条未放宽"**不是自述**：本卡**根本没有触碰任何既有测试文件**，该断言结构上成立。
- **`LoadFailureAlert.tsx` 零改动（显式提交号核对）**：

```
d44a850 : e4162f225f451bc102746dfc6a0b5f9d55b84c2a
37c3eef^: e4162f225f451bc102746dfc6a0b5f9d55b84c2a
37c3eef : e4162f225f451bc102746dfc6a0b5f9d55b84c2a
HEAD    : e4162f225f451bc102746dfc6a0b5f9d55b84c2a
worktree SHA256: 36472A666009554C03EAB82E35B290369D38503D8950F0131C43B0A2BEDF6600
```

  即：**从本卡任务书提交（`d44a850`）到被验提交（`37c3eef`），该文件一个字节都没变**，
  实现者报的 `36472A66…` 与评估者实测**逐位相同**。

- 门禁后 `git status --porcelain` 仅 ` M scripts/audit.py` ——**不是本卡、也不是评估者所为**（见 §5 并发边界）；
  `frontend/dist/` 被 `.gitignore` 覆盖（build 产物不污染提交面）。

## 2. 可达性判据（必做 1，**本卡最要紧的一环**）——评估者独立构造

评估者的触发方式**全部自建**（`$env:TEMP\vs36eval\fe` 副本 + junction 指回真实 `node_modules`），
与实现者的两个新测试文件**无任何复用**：`tests/EvalAlphaScope.test.tsx`（6 条）、`tests/EvalDiscoverScope.test.tsx`（4 条）。

### 2.1 逐条核实（修后绿 / 退回修前红，同一份夹具）

| 评估者用例 | 触发方式 | 修后 | 退回修前 | 判读 |
|---|---|---|---|---|
| `EvalAlpha A` | 在途**连点「检索」按钮 ×2 + 输入框回车** | ✓绿 | **✓绿** | 请求计数停在 **1** ⇒ **不可达**（确认实现者说法） |
| `EvalAlpha B` | **改输入框但不提交**（`fireEvent.change`） | ✓绿 | **×红** `expected <div class="ant-alert-description"> to be null` | **可达**，修前真的串 |
| `EvalAlpha C` | **`allowClear` 的 ×**（在途点击） | ✓绿 | **×红** 同上 | **可达**：× 真的发出第 2 次检索（`toHaveBeenLastCalledWith('')`），修前上一词迟到的失败落在新状态上 |
| `EvalDiscover D4` | **TextArea 回车**（在途改词后按回车） | ✓绿 | **✓绿** | **可达的并发提交**（`/market/search` 计数 1→2，末次参数 `{q:'乙词'}`），但两版都被 `requestId` 守住 ⇒ 不产生串场 |

修后基线（评估者夹具，2 个文件）：`Test Files 2 passed (2) / Tests 10 passed (10)`（`$env:TEMP\vs36eval\eval-fixed.txt` + `eval-discover-fixed.txt`）。
按钮与回车的 loading 门控**同时做了源码核对**：`node_modules/antd/es/input/Search.js:103-114`（`enterButton` 为片段时落到 antd `Button`，带 `loading`；`antd/es/input/Search.js:77-80` 回车 `if (composedRef.current || loading) return;`），
× 分支在 `Search.js:55-60`（`e.type === 'click'` ⇒ 直接 `customOnSearch`，**不经 loading 门**）。
**实现者的机制纠正属实。**

### 2.2 实现者**漏列**的一条可达路径（O3）

`frontend/src/components/DiscoverSearch.tsx:25-30`：

```tsx
onPressEnter={(event) => { if (!event.shiftKey) { event.preventDefault(); onSubmit(); } }}
```

**TextArea 的回车提交没有任何 `loading` 门**（同一组件的按钮 `:46` 是 `loading={loading}`，被门控）。
⇒ **在 Discover 里"在途并发提交"是可达到的**（`EvalDiscover D4` 实测计数 1→2，**修前修后都成立**）。
它**不是串场路径**——`Discover.tsx:73/84/89/100` 的 `requestId` 守卫把迟到的旧词产出丢掉了（D4 实测：甲词迟到结果没覆盖乙词）。
但实现者 §1.2（乙）写的是"提交路径在上游被挡住/被 requestId 守住"，**只说了守卫、没说这条路径本身仍可达**，
其"可达路径枚举"因此**不完整**（Alpha 侧枚举对了 3 条，Discover 侧只枚举了"顺序换词"与"结果态"）。

## 3. 反向断言 / 归属保留 / 失败不伪装成空（必做 2、4）

- **反向断言（当前词自己失败 ⇒ 必须显示它自己的错误）**：
  `EvalAlpha D`（修后绿）、`EvalDiscover D1`（修后绿）——均断言**错误原文可见**且**失败文案可见**。
- **归属保留（切回旧词仍显示旧词自己的失败）**：`EvalAlpha B` 第三段——`fireEvent.change` 切回 `oldword` 后
  `getByText(/EVAL-OLD-FAIL/)` 命中 ⇒ 失败态**没有被"切实体就清掉"**，与 VS-32 的 `detailErrorId` 同形（结构性判据，非"用例绿"）。
- **失败不伪装成空**：修后 `EvalAlpha D` 断言 `/未找到匹配字段/` **不存在**；`EvalDiscover D1/D2` 断言
  `没有可验证的股票结果；请输入明确代码后再试` **不存在**。
  补充证据：**这两个断言在退回修前时变红**（`expected <div class="ant-empty-description"></div> to be null`、
  `expected <div style…(1)></div> to be null`）⇒ 它们是**鉴别性**的，不是空过的断言。

## 4. 重试真重发（必做 3）——自建计数、与成功解耦

- **Alpha**（`EvalAlpha E`）：夹具让**第一次与第二次都失败**。
  `searchAlpha` 计数 **1 → 2**，`toHaveBeenLastCalledWith('income')`（**同一个查询词**），
  且第二次失败后 `EVAL-FAIL-2` 与 `字段搜索失败` **仍在屏幕上** ⇒ **重发与"是否成功"解耦**（不是"失败态清掉再赌一次"）。
- **Discover**（`EvalDiscover D2`）：`/market/search` 计数 **1 → 2**，`toHaveBeenLastCalledWith('/market/search', { params: { q: '茅台' } })`，
  第二次仍抛错 ⇒ 失败态仍在、且**没有**退化成空态。
- 退回修前，两个重试用例均红（`Unable to find an accessible element with the role "button" and name /重\s*试/`）
  ⇒ **修前根本没有重试入口**，计数断言不是自我实现的。

## 5. 鉴别力（必做 7）——评估者自己的变异

**窗口声明**：变异只发生在 `$env:TEMP\vs36eval\fe`（副本）；**仓库工作树全程未被变异**。

```
--- COPY-BEFORE SHA256 (fixed, = repo HEAD) ---
src\pages\Discover.tsx                   6A42814E07E37EA6ECE376A9776744D852429AA0ADFF71C72C570935220D0C2C
src\components\alpha\AlphaResearchPanel.tsx 38D91D37DF0C5AC59C9496C4D8CA56683C6920CAAA756EA3DCED87BA61E1D20A
--- REVERTED to d44a850 (byte-identical proof) ---
Discover.tsx            git hash-object --no-filters = 2aa08a7f2e9c66fadcd96a18900b1cfcb333a23f  (= d44a850 / 37c3eef^ blob) ✅
AlphaResearchPanel.tsx  git hash-object --no-filters = 44e84fb99dc5b14e6fb5e30059f0c71049e04609  (= d44a850 / 37c3eef^ blob) ✅
--- COPY-RESTORED SHA256 ---
6A42814E… / 38D91D37…（与 COPY-BEFORE 逐位相同）✅   仓库 `git status` 干净 ✅
```

退回修前后运行**同一批评估者用例**（`$env:TEMP\vs36eval\eval-mutated.txt`）：

```
 × EvalDiscover D1  → expected <div class="ant-empty-description"></div> to be null
 × EvalDiscover D2  → Unable to find an accessible element with the role "button" and name `/重\s*试/`
 × EvalDiscover D3  → expected <strong></strong> to be null
 ✓ EvalDiscover D4
 ✓ EvalAlpha A
 × EvalAlpha B      → expected <div class="ant-alert-description"></div> to be null
 × EvalAlpha C      → expected <div class="ant-alert-description"></div> to be null
 × EvalAlpha D      → expected <div style …(1)></div> to be null
 × EvalAlpha E      → Unable to find an accessible element with the role "button" and name `/重\s*试/`
 × EvalAlpha F      → expected <strong></strong> to be null
 Test Files  2 failed (2)
      Tests  8 failed | 2 passed (10)
```

⇒ **8 red / 2 green**，与实现者 §5 的计数**独立吻合**；两条绿都是**可达性守卫**（Alpha 双击/回车不可达、Discover 回车并发被 requestId 守住），
**不是"刻意非鉴别"的弱断言**——评估者夹具里没有任何一条是空过的。

**"有没有另一种错改法也能让它绿？"**：把 `searchFailed` 恒置 false（错误永不显示）⇒ `EvalAlpha D`/`EvalDiscover D1`
（反向断言）与 `EvalAlpha B` 第三段（切回仍显示）会红 ⇒ 本夹具能拦住这条错改法。实现者 §5 的自述与之一致。

## 6. 门禁（必做 8）与噪声如实记录

**相关 vitest**（`maxWorkers: 1`，工作树含被验提交）：

| 窗口 | 命令 | 结果 |
|---|---|---|
| 8 文件一次串跑（`repo-related-tests.txt`） | `bun x vitest run tests/DiscoverQueryScope… tests/AlphaResearchQueryScope… tests/DiscoverUX… tests/AlphaResearchPanel… tests/DiscoverModeDispatch… tests/DiscoverResults… tests/DiscoverSearch… tests/DiscoverTickerExtraction --maxWorkers=1` | `Tests 3 failed \| 22 passed (25)`，`import 133.06s`（**重载窗口**） |
| 隔离重跑 `AlphaResearchQueryScope` | 同上单文件 | **6 passed (6)**，`import 12.52s` |
| 隔离重跑 `DiscoverQueryScope` + `DiscoverUX` | 单命令 | **8 passed (8)**，`import 16.75s` |

**既有测试（6 个文件）在两个窗口里全绿**：`DiscoverUX 4/4`、`AlphaResearchPanel 2/2`、`DiscoverModeDispatch 2/2`、
`DiscoverResults 2/2`、`DiscoverSearch 2/2`、`DiscoverTickerExtraction 3/3` —— **零回归**。

重载窗口里 3 条红**全部落在本卡新增用例上**，逐条判定：

1. `DiscoverQueryScope::当前查询词自己失败时…` → `Test timed out in 5000ms`。**负载噪声**
   （同窗口 `import 133s`；隔离重跑 1439ms 绿；评估者自己的等价用例 `EvalDiscover D1` 在两窗口均绿）。**未据此改任何断言/超时。**
2. `AlphaResearchQueryScope::迟到的失败不得落到新的检索上…` → `Test timed out in 5000ms`。**负载噪声**（隔离重跑 852ms 绿）。
3. `AlphaResearchQueryScope::改动查询词后…` → `Unable to find an element with the text: /OLD-WORD-FAIL/`，失败点是**行 91**
   （该用例第一条 `findByText`），**不是超时**。它紧跟在同文件**刚被 5s 超时中止的用例**之后；**隔离重跑 179ms 绿**，
   且评估者覆盖同一流程的 `EvalAlpha B` 在修后副本的两个窗口均绿。**观察到的相关是"跟在超时用例之后"，但评估者不能证明因果**：
   如实记为**未归因的连带失败**，不据此判 REJECT、不放宽断言。

**`bun run build`（串行，输出重定向到 `$env:TEMP\vs36eval\build.txt`）**：`exit=0`，`✓ built in 44.02s`。

**并发边界（不替他人选归属）**：本窗口 `git status --porcelain` 出现 ` M scripts/audit.py` ——
按任务书另有 **VS-37 的评估者**在跑 `scripts/audit.py`（其规则作用面含 `frontend/src/**`）。
评估者**没有触碰**该文件，也**不能证明**上述重载是否由它造成；同理**不能证明与其无关**。此项保持未归属。
另：本卡与 VS-37 的**门禁作用域**（前端 vitest/build vs 脚本）不相交，但 `bun run build` 会编译整个 `frontend/`，
属跨卡共享资源——本次 build `exit 0`，无失败需要归因。

## 7. 同族扫描的诚实性（必做 6）

实现者 §1.3 列了 3 处"未修"，评估者**逐处独立复核**：

| 实现者所报 | 独立核实 | 结论 |
|---|---|---|
| `Discover.tsx:89`（修后 `:115`）因子检索失败只弹 toast，随后渲染 `discover.noFactors` 空态 | **属实**：`Discover.tsx:115` `if (factorResult.status === 'rejected') message.warning(t('discover.factorUnavailable'))`，失败时 `factors: []` 走到 `:199` `locale={{ emptyText: t('discover.noFactors') }}` | **确认仍存在**（且这是同族 ⑤"失败伪装成空"的直接实例） |
| `DiscoverThemes.tsx:11-37` | **属实**：`:14` `const [error, setError] = useState(false)` 无归属；`:19 setKeyword(value)` / `:21 setError(false)` 都在**发起时**；`:37 {error && <Alert …/>}` 无重试。`onChange`（`:34`）不受 loading 门控 ⇒ **"改词不提交"可达** | **确认仍存在**（真身行号 `:10-14 / :19-21 / :37`，实现者所报区间准确） |
| `loadCatalog` 竞态（`AlphaResearchPanel.tsx:44-71`） | 属实：无 requestId 守卫，`setCatalogError`/`setCatalogLoading` 为单例目录资源的竞态 | **同意"不同族"**（目录是单例资源，不存在"按查询词复数"的实体）；**但**其"重试按钮可并发两次"是 `LoadFailureAlert`/`Alert action` 的按钮**不带 loading**所致，属另一族（并发重发） |

### 评估者新发现（实现者未列）

- **O4-a（第 4 处同族，结果态）**：`frontend/src/components/GlobalTaskEntry.tsx`
  `:46` `query` / `:48` `results` / `:70-92` `runSearch` —— `results` **不带"属于哪个查询词"的归属**，
  `:153` 的 `onChange` 只 `setQuery` + `setSelected(null)`、**不清结果也不重新检索** ⇒
  **换词过程中上一词的候选列表仍挂在屏幕上**（与本卡在 `Discover` 修掉的"结果态串场"**完全同形**）；
  且 `:85-88` `catch → setResults([])` + `message.warning` ⇒ **失败被渲染成"没有结果"**（同族 ⑤）。
  **超出本卡两处范围，未修不影响本卡判定**，建议单开一卡。
- **O3**（见 §2.2）：`DiscoverSearch.tsx:25-30` 回车提交无 loading 门 —— 属"提交路径可达性枚举"的遗漏，
  非串场路径（`requestId` 已守住）。

## 8. 观察项（不阻塞）

- **O1（记述一致性，已解释）**：实现者 §3 的修前红基线写 `Tests 7 failed | 2 passed (9)`，
  而其 §5 与评估者复现均为 `8 failed | 2 passed (10)`。评估者核了它的原始产物
  `$env:TEMP\vs36\red-baseline.txt`：该次 `AlphaResearchQueryScope.test.tsx (5 tests | 4 failed)` ——
  **当时文件里只收集到 5 条用例（第 6 条尚未写就）**，故 9 = 5+4 而非 10。**计数差异有据可查、不是伪造**，
  但 §3 表格的"红 ×4/×2/×2/×1"与"7 failed"对不上，建议归档时以最终 `8/2` 为准。
- **O2（观感/语义，实现者已自陈）**：Alpha 面板在"**改动输入框但不提交**"时会进入 `readStateOf` 的 **loading 兜底分支**，
  屏幕上显示"正在检索字段…"而**此刻并没有请求在途**。这与 `LoadFailureAlert.tsx:44-49` 的口径
  （"`loading` = 还没有结论，不等于请求此刻在途"）自洽，且比"退化成未找到匹配字段"更安全，
  属**可接受取舍**；若产品不接受，需在 `readStateOf` 之外另立"草稿态"，不建议在本卡返工。
- **O5（方法学提醒）**：实现者 §6.6 已自陈"时序判断为代码推理、未逐帧实测"。评估者复核该结构性理由成立
  （渲染条件 `scopedSearchFailed = searchFailed && errorKeyword === currentKeyword`、
  `scopedOutcome = outcome.query === executedQuery` 均为**同一帧内的比较**，不依赖 `useEffect` 提交后时序），
  故不要求逐帧证据。

## 9. 判定

**ACCEPT** —— 无 `文件:行` 级缺陷可开。理由：
①可达性/机制纠正属实且经源码+运行时双证；②反向断言、归属保留、失败不伪装成空、重试真重发（计数 1→2 且与成功解耦）**均为评估者自建夹具下的可判定结论**；
③提交面精确、`LoadFailureAlert.tsx` 跨窗口逐 blob 未变、既有 6 个测试文件两窗口全绿、`bun run build exit=0`；
④鉴别力 8 red/2 green 由评估者**独立变异**复现。

**建议（不阻塞本卡）**：把 O3/O4-a 记入下一批 NEXT 项；`DiscoverThemes.tsx` 与 `Discover.tsx` 因子检索失败态
（O4-b/O4-c）仍属同族未修，且后者的"快速选词按钮"（`DiscoverThemes.tsx:35`）**同样不受 loading 门控**，与 O3 同类。

---

### 评估者产物（均在 `$env:TEMP`，仓库内仅本文件）

| 路径 | 内容 |
|---|---|
| `$env:TEMP\vs36eval\fe\` | frontend 副本（robocopy + junction 指回真实 `node_modules`） |
| `$env:TEMP\vs36eval\fe\tests\EvalAlphaScope.test.tsx` / `EvalDiscoverScope.test.tsx` | 评估者自建夹具（10 条） |
| `$env:TEMP\vs36eval\eval-fixed.txt` / `eval-discover-fixed.txt` | 修后绿（10/10） |
| `$env:TEMP\vs36eval\eval-mutated.txt` | 退回修前红（8/10） |
| `$env:TEMP\vs36eval\mutation-log.txt` | 变异窗口声明 + SHA256/复核 |
| `$env:TEMP\vs36eval\repo-related-tests.txt` / `repo-alpha-isolated.txt` / `repo-discover-isolated.txt` / `build.txt` | 门禁原始输出 |
