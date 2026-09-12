# IMPLEMENT_RESULT — VS-36：同族"状态未按实体作用域"（Discover 检索 / Alpha 检索）

> 状态：**完成（未 commit）**。基线 `HEAD = d44a850`（开工时 `git status --porcelain` 为空）。
> 实现者：IMPLEMENTER（子代理）。范式参照：VS-32 `27233a4`（`Discussion.tsx` 的 `detailErrorId`）；
> 三态唯一实现处：VS-29 `8d05556`（`frontend/src/components/LoadFailureAlert.tsx`，本卡**只读复用、未改**）。
> **未触碰 VS-37 的在制文件**（`scripts/audit.py`、`AGENTS.md`）。

## 1. O1 核实（真实行号 + 是否成立）

### 1.1 卡里的坐标：一处对、一处**路径错**（行号对）

| 卡里写的 | 实际 | 结论 |
|---|---|---|
| `frontend/src/pages/Discover.tsx:49` 的 `nameSearchFailed` | `frontend/src/pages/Discover.tsx:49` 修前确为 `const [nameSearchFailed, setNameSearchFailed] = useState(false);` | **路径与行号都属实** ✅ |
| `frontend/src/features/alpha/AlphaResearchPanel.tsx:25` 的 `searchError` | **`frontend/src/features/` 下没有该文件**（`frontend/src/features/**/*.tsx` glob 命中 0）。真身是 **`frontend/src/components/alpha/AlphaResearchPanel.tsx:25`** 修前 `const [searchError, setSearchError] = useState<string \| null>(null);` | **路径错、行号对** ⚠️ |

证据（`grep -n` 全仓，修前快照 `d44a850`）：

- `frontend/src/pages/Discover.tsx:49` 状态声明；`:61` `setNameSearchFailed(false);`（发起时清）；`:139` `{nameSearchFailed && <Alert …/>}`（渲染）。
- `frontend/src/components/alpha/AlphaResearchPanel.tsx:25` 状态声明；`:65` `setSearchError(null);`（发起时清）；`:172` `{searchError && <Alert …/>}`（渲染）。
- 两处都**没有第二个消费点**（`grep searchError|nameSearchFailed` 全仓仅命中状态声明 + 渲染 + i18n 文案），也没有第二处真相来源。

### 1.2 O1 是否成立：**分成两半，答案不同（如实记录）**

**（甲）AlphaResearchPanel `searchError` —— 成立，但"提交路径"在 UI 上不可达。**

它是无归属的字符串，正确性完全压在"发起时 `setSearchError(null)`"上，且 `search()`（`:63-74`）**完全没有 requestId 守卫**。但两个"提交"入口在在途期间都被 antd 挡住：

- `Input.Search` 的 `enterButton` 是**片段**（不是 antd Button）⇒ 走 `node_modules/antd/es/input/Search.js:103` 的内置 `Button`，带 `loading={loading}` ⇒ loading 期间点击被吞（实测：连点两次只发出 **1** 次请求，见 `$env:TEMP\vs36\red-baseline.txt` 里 “expected vi.fn() to be called 2 times, but got 1 times”）；
- 回车路径 `Search.js:77-80` 也 `if (composedRef.current || loading) return;`。

仍然**可达**的两条串场路径（两条都实测为红，见 §5）：

1. **改动输入框而不提交**（`onChange` 不受 loading 门控）⇒ 输入框已是新词，下面还挂着上一词的失败原文 —— 这就是 F1 的形状；
2. **`allowClear` 的 ×**（`Search.js:56` 的 clear 分支**不经过 loading 门控**）⇒ 在途点 × 会真的再发一次检索，此时上一个词迟到的失败会落到新状态上（没有守卫）。

**（乙）Discover `nameSearchFailed` —— "未作用域"成立，但卡里那句"只靠发起时清掩盖"在提交路径上**不成立**。**

`requestId` 守卫在 `:58/:68/:71`（`if (id !== requestId.current) return;`）已经把"迟到的失败落到新词"堵住了，而发起时的 `setNameSearchFailed(false)`（`:61`）与 `setExecutedQuery(trimmed)`（`:62`）在**同一批**里提交 ⇒ 顺序换词看不到串场。**实测：我为"顺序换词"写的用例在修前就是绿的**（`red-baseline.txt` 里 2 条 passed 之一）。

真正可达的串场在**结果态**：修前 `:43-48` 的 `stocks/factors/errors/tickers/executedQuery` **各自独立赋值**，`setExecutedQuery(trimmed)` 在发起时就切到新词，而结果要等 `Promise.allSettled` 回来才替换 ⇒ **换词在途期间，"新词的对象 + 上一词的结果"同时挂在屏幕上**（因子列表修前连 `loading` 都没有，`:146-150`）。这条修前是红的（§5 用例 2）。

⇒ 结论：**O1 成立**（"换词时旧词的状态挂在新词上"在这两处都有可达实例），但**它的可达路径与卡里描述的机制不完全一致**（Discover 的失败布尔被守卫挡住，串的是结果；Alpha 的竞态要靠 × 才能触发）。验收对象（"换词时旧词的失败会不会挂在新词上"）**在两处都可复现**，已修并有用例覆盖。

### 1.3 同族状态扫描（卡里第一步要求）

| 位置（修前行号） | 同族？ | 处置 |
|---|---|---|
| `Discover.tsx:43-48` `stocks/factors/errors/tickers/executedQuery` 各自成 state | 是（同一族：状态不带实体归属，靠赋值顺序维持一致） | **已修**：收进一个 `DiscoverOutcome`（值 + 它属于哪个查询词） |
| `Discover.tsx:46` `loading` | 否（在途是全局事实，不是按词的复数状态）；但修前它没参与空态判断 ⇒ 在途会被渲染成空 | **已修**：`:186`（语义警告加 `!loading`）、`:198`（因子 List 加 `loading={loading && !factors.length}`） |
| `Discover.tsx:88-89` 因子检索失败只走 toast，随后列表渲染 `discover.noFactors` 空文案 | 是（失败被渲染成"空"） | **未修**，见 §7 未解决问题 2 |
| `AlphaResearchPanel.tsx:23` `items`、`:24` `searchLoading` | 是 | **已修**：`items` 带 `itemsKeyword`；加载态交给 `readStateOf` 的 loading 分支 |
| `AlphaResearchPanel.tsx:29-30` `catalogLoading/catalogError` + `loadCatalog`（`:34-61`）无 requestId 守卫 | **否**（目录是单例资源，不存在"按查询词复数"的实体；两次并发 load 才是它的问题） | **未修**，见 §7 未解决问题 4（不同族，且不在卡的两处之内） |
| `DiscoverThemes.tsx:11-14` `keyword/payload/error/loading`（同页相邻组件，第 3 处同形实例） | **是**（`:19` 发起时切 `keyword`、`:21` 清 `error`、`:37` 布尔无归属的 `Alert`） | **未修**，见 §7 未解决问题 3（不在卡的两处之内；VS-37 并发在制，控制爆炸半径） |

## 2. 改动（文件:行）

**新增范式：给状态补"它属于哪个查询词"的归属，渲染处只认属于当前实体的那一份**（VS-32 形状；不给"切实体时清"）。

### `frontend/src/pages/Discover.tsx`（实体 = 页面当前对象 `executedQuery`）

- `:14` 新增 `import LoadFailureAlert from '../components/LoadFailureAlert';`
- `:36-47` 新增 `type DiscoverOutcome`（`query` + `tickers/stocks/factors/errors` 打成**一个值**）
- `:56-65` 状态改造：`stocks/factors/errors/tickers` 四个 state ⇒ `outcome`；`nameSearchFailed: boolean` ⇒ `nameSearchFailure: { query, error } | null`
- `:67-120` `run`：删掉 `setNameSearchFailed(false)`（不再依赖"发起时清"）；失败时写**归属**（`:90-93`）；**成功才清失败态**（`:87`，VS-32 口径）；产出整体提交（`:101-114`）
- `:139-151` 渲染前派生 `scopedOutcome` / `objectNameSearchFailure` / `scopedNameSearchFailure`
- `:179-185` 失败改用族内唯一错误态 `LoadFailureAlert`（带底层原文 + **真重发** `onRetry`）
- `:186-188` 语义警告加 `!objectNameSearchFailure && !loading`（不再与失败同时出现、不在途冒充结论）
- `:191` 股票结果卡：公司名检索失败时**不渲染**（不再摆"没有可验证的股票结果"去冒称"确实没有"）
- `:198` 因子列表 `loading={loading && !factors.length}`（在途且手上无当前对象结果 ⇒ 交给加载态）

### `frontend/src/components/alpha/AlphaResearchPanel.tsx`（实体 = 输入框里的当前查询词）

- `:1-8` `useRef` + `import LoadFailureAlert, { LoadStateView, readStateOf } from '../LoadFailureAlert';`
- `:25-35` 新增 `searchFailed`（判据）/ `itemsKeyword` / `errorKeyword` / `searchRequestId`
- `:73-98` `search()`：加 requestId 守卫（`:81`/`:90` 迟到者直接 return）；成功写 `itemsKeyword` + **成功才清失败态**；失败写 `errorKeyword`
- `:120-132` 渲染前派生 `currentKeyword` / `scopedItems` / `scopedSearchFailed` / `searchState`（用 **VS-29 的 `readStateOf`**，不另造三态判定）
- `:210-244` 检索块改由 **`LoadStateView`** 渲染（错误分支内部固定转调 `LoadFailureAlert`），重试 `onRetry={() => void search(currentKeyword)}`；删掉修前"错误 Alert + List 空文案"两段并行条件渲染

### 新增测试（只新增断言，未动任何既有断言）

- `frontend/tests/DiscoverQueryScope.test.tsx`（4 条）
- `frontend/tests/AlphaResearchQueryScope.test.tsx`（6 条）

`frontend/src/components/LoadFailureAlert.tsx` **一行未改**（SHA256 前后同为 `36472A666009554C03EAB82E35B290369D38503D8950F0131C43B0A2BEDF6600`）。

## 3. 五条实测

| # | 判据 | 用例（文件::用例名） | 修前 | 修后 |
|---|---|---|---|---|
| ① | **换词不串**（不得出现上一词的失败原文，也不得出现它的结果） | `DiscoverQueryScope::换查询词在途时不得继续显示上一词的结果，也不得把在途渲染成"空"` / `AlphaResearchQueryScope::改动查询词后不再显示上一词的失败原文…` / `…::换查询词在途时不得显示上一词的结果…` / `…::迟到的失败不得落到新的检索上（清空输入框触发的新检索）` | **红 ×4** | **绿 ✓4** |
| ② | **反向断言**（当前词自己失败 ⇒ 必须显示它自己的错误） | `DiscoverQueryScope::当前查询词自己失败时显示它自己的失败…` / `AlphaResearchQueryScope::当前查询词自己失败时必须显示它自己的错误…` | 绿（刻意非鉴别用例，防"错误永不显示"） | **绿 ✓**（`:181-185` / `:214-221` 仍渲染，且 `errorKeyword === currentKeyword`） |
| ③ | **重试真重发**（请求计数证明，与成功解耦） | `DiscoverQueryScope::公司名检索失败可重试，且重试真的重发请求（请求计数）` / `AlphaResearchQueryScope::失败可重试，且重试真的重发请求（请求计数 + 同一查询词）` | **红 ×2**（修前根本没有重试入口） | **绿 ✓**（`/market/search` 计数 1→2；`searchAlpha` 2 次且 `toHaveBeenLastCalledWith('income')`） |
| ④ | **失败不伪装成空** | `DiscoverQueryScope::公司名检索失败不得被渲染成"没有股票结果"的空态` / `AlphaResearchQueryScope::…且不得把失败渲染成"空"` | **红 ×2** | **绿 ✓**（`LoadFailureAlert` 独占；`LoadStateView` 四分支互斥） |
| ⑤ | **归属信息被保住**（不是"切实体就清掉"） | `AlphaResearchQueryScope::…切回同一个词仍然显示它自己的失败` | 红 | **绿 ✓**（切回旧词时那条失败仍是"它自己的"） |

**修前红基线**（仓库工作树 = `d44a850`，测试文件已是新增版）：
`Tests  7 failed | 2 passed (9)` —— 全文 `$env:TEMP\vs36\red-baseline.txt`；7 条红的原因逐条核对过，都是我预期的判据（无重试按钮 ×2、空态冒充失败 ×2、在途串场 ×2、迟到失败落地 ×1）。

**修后**：`$env:TEMP\vs36\after-fix-2.txt`（新用例 10/10 + `DiscoverUX` 4/4）、`$env:TEMP\vs36\after-fix-3.txt`（`AlphaResearchPanel` 2/2、`DiscoverModeDispatch` 2/2、`DiscoverResults` 2/2、`DiscoverSearch` 2/2、`DiscoverTickerExtraction` 3/3）⇒ 相关 **25 条全绿**。

## 4. 门禁原始输出（串行执行）

**相关 vitest**（`frontend`，`maxWorkers: 1`）：

```
 Test Files  3 passed (3)
      Tests  14 passed (14)      # after-fix-2.txt：新用例 10 + DiscoverUX 4
 Test Files  5 passed (5)
      Tests  11 passed (11)      # after-fix-3.txt：AlphaResearchPanel/DiscoverModeDispatch/DiscoverResults/DiscoverSearch/DiscoverTickerExtraction
 Test Files  2 passed (2)
      Tests  10 passed (10)      # after-fix-4-repeat.txt：两个新文件**重复一次**仍全绿（35.09s，无超时）
```

**`bun run build`（串行；输出重定向到 `$env:TEMP\vs36\build.txt`，未写进仓库目录）**：

```
$ ../backend/.venv/Scripts/python.exe ../scripts/openapi_tsgen.py --check
OK: E:\Code_file\Projects\finquant-hub\frontend\src\types\openapi.generated.ts is fresh (60 schemas)
$ tsc -b && vite build
vite v6.4.3 building for production...
✓ 4263 modules transformed.
✓ built in 48.02s
exit=0
```

未跑全量 `vitest run`（126 个测试文件）：只跑了**所有 import 到这两个模块的测试文件** + 两个子组件测试文件（`grep 'pages/Discover|components/alpha/AlphaResearchPanel' frontend` 的结果集，另加 `AppNavigation` 已确认只比较路由字符串、不挂载 Discover）。

## 5. 鉴别力证明（TEMP 副本退回修复）

**窗口声明**：变异只发生在 `$env:TEMP\vs36\fe-mut`（robocopy 副本 + junction 指回真实 `node_modules`）；**仓库工作树全程未被变异**（下方复原核对可证）。

```
FIXED        src\pages\Discover.tsx                     6A42814E07E37EA6ECE376A9776744D852429AA0ADFF71C72C570935220D0C2C
FIXED        src\components\alpha\AlphaResearchPanel.tsx 38D91D37DF0C5AC59C9496C4D8CA56683C6920CAAA756EA3DCED87BA61E1D20A
COPY-BEFORE  与 FIXED 逐字节相同 ✅
REVERTED     Discover.tsx                097C9E3325961910C4F3B11A4BC12D602E1049E219FAB6ED4D7FA6863A359DE5  = 开工时记录的修前基线 ✅
REVERTED     AlphaResearchPanel.tsx      D3128BA9E22C66E6647E4FA6010A2FEF8EB0D2404E5E9993F5CFF42BC9051755  = 开工时记录的修前基线 ✅
COPY-RESTORED 6A42814E… / 38D91D37…（与 FIXED 相同）✅   REPO 同哈希（仓库未被触碰）✅
```

退回修复后运行**同一批新用例**（`$env:TEMP\vs36\mut-revert-red.txt`）：

```
 Tests  8 failed | 2 passed (10)
   × 换查询词在途时不得继续显示上一词的结果，也不得把在途渲染成"空"（Discover）
   × 公司名检索失败可重试，且重试真的重发请求（请求计数）
   × 公司名检索失败不得被渲染成"没有股票结果"的空态
   × 迟到的失败不得落到新的检索上（清空输入框触发的新检索）（AlphaPanel）
   × 改动查询词后不再显示上一词的失败原文；切回同一个词仍然显示它自己的失败
   × 当前查询词自己失败时必须显示它自己的错误，且不得把失败渲染成"空"
   × 失败可重试，且重试真的重发请求（请求计数 + 同一查询词）
   × 换查询词在途时不得显示上一词的结果，也不得把在途渲染成"空"
   ✓ 当前查询词自己失败时显示它自己的失败；换成新词后不得再挂在新词上（**刻意非鉴别**，见下）
   ✓ 换查询词后不出现上一词的失败原文，也不出现上一词的结果（**刻意非鉴别**，同上）
```

**2 条绿是"刻意非鉴别"的守卫**：顺序换词（提交 A 失败 → 提交 B）在修前也不串（Discover 有 requestId 守卫；Alpha 发起时清在同一批提交里）。它们不构成鉴别力，但**必须存在**——它们正是"反向断言/顺序路径"的回归门，且**不能用来替代**上面 8 条。

### "有没有另一种错改法也能让它绿？"（AGENTS.md 要求的结构性判据）

- 把修法做成**"错误永不显示"**（`searchFailed` 恒 false）：§3 的②③④全绿，但 ② 的反向断言与 ⑤ 的"切回去仍显示"会红 —— 这正是我把它们写进用例的原因。
- 把修法做成**"切实体时 useEffect 清"**：本卡的两处**本来就在发起时同步清**，所以"加一个 useEffect 清"能让我全部顺序用例保持绿，但**改输入框**（`onChange` 不经清）与**× 触发的并发检索**这两条可达路径仍然串场 —— 这两条正是 §5 里变红的两条。
- **正确性理由是结构性的**：状态自带"属于哪个查询词"，渲染处只认属于当前实体的那一份（`scopedSearchFailed = searchFailed && errorKeyword === currentKeyword`；`scopedOutcome = outcome.query === executedQuery ? outcome : null`），而不是"某处记得清"。

## 6. 未解决问题 / 已知取舍

1. **本卡刻意采用两套"当前实体"的定义，理由如下（可能被质疑，故显式写清）**：
   - `AlphaResearchPanel`：实体 = **输入框里的当前查询词**（该面板没有任何"页面对象"显示位，错误横幅就贴在输入框下方，读起来就是"我正在输入的这个词失败了"）。
   - `Discover`：实体 = **页面当前对象 `executedQuery`**（`TaskPageHeader` 的 `object={executedQuery}` 就是页面自己声明的"当前对象"，多行文本框是草稿）；额外要求"输入框当前词仍等于它"才显示错误横幅 ⇒ 单看草稿改动也不串。
   - 代价：`Discover` 在"草稿 ≠ 对象 且对象失败"的窗口里，错误横幅与股票结果卡同时退出，页面上只剩因子卡（**该窗口的观感未实测**，无用例覆盖；不构成"冒称没有数据"）。
2. **因子检索失败仍被渲染成空**：`discover.factorUnavailable` 只弹 toast，随后因子列表展示 `discover.noFactors`（修前 `:89/:146-150`，修后 `:115/:194-202`）。同族 ⑤ 违规，**未修**（不在卡的两处之内；改它需要给因子检索单独补失败态 + 三态渲染，超出本卡半径）。
3. **`DiscoverThemes.tsx` 是第 3 处同形实例**（`:11-14` 状态、`:19` 发起时切词、`:21` 清失败、`:37` 无归属布尔 + 无重试），**未修**。
4. **`AlphaResearchPanel.loadCatalog` 没有竞态守卫**（重试按钮可并发两次，last-write-wins）。不是"按实体作用域"这一族（目录是单例资源），**未修**。
5. **Alpha 面板把"结果态"也按输入框当前词作用域** ⇒ 修改输入框的过程中结果会退回 loading 态（`readStateOf` 的兜底分支）。依据 `LoadFailureAlert.tsx:44-49` 的口径："`loading` = 还没有结论，不等于请求此刻在途"；**同一词的刷新期间仍是 ready（内容不清空）**，VS-29 的"不清空已读到"没有被破坏。若产品不接受这个观感，可只保留"错误态按当前词作用域"，但那样 ① 在"改动输入框"这条可达路径上会失效。
6. **时序判断为代码推理、未逐帧实测**：我判定"换词那一刻旧失败就不再渲染"是**结构性**的（渲染条件里带归属比较），因此不依赖 `useEffect` 的提交后时序；RTL 的 `act` 冲刷看不到中间帧，**本卡没有做逐帧/像素级验证**，正确性依据是结构而非"用例绿"。
7. **测试选择器踩坑（已修，记录备查）**：antd 会在**两个汉字**的按钮文案里插空格，`getByRole('button', { name: '重试' })` 匹配不到（实际可访问名是 `"重 试"`），已改成 `/重\s*试/`。

## 7. 风险

- **低-中**：`Discover` 的产出合并成单个 `outcome` ⇒ 该页所有结果渲染都经过归属比较，任何"忘记设置 owner"的新代码都会**静默不显示**而不是显示错的。这是本卡要的失败方向（宁可少说，不可说错），但需要后续维护者知道这条约定（代码注释已写明）。
- **低**：`Discover` 移除了 `setTickers(…)` 的中途提交，`tickers` 现在与结果一起在 `Promise.allSettled` 之后提交 ⇒ 在途期间表头计数与语义警告都按"无结论"处理（`:159/:186`），观感变化已在 §3④ 覆盖。
- **低**：本窗口内有**他卡 VS-37 并发**，它在中途入库为 `415efe9`（`AGENTS.md` +1、`scripts/audit.py` +108、`docs/ai/evo/IMPLEMENT_RESULT_VS37.md` +415）。**锚点安全核对**：`git diff --name-only d44a850 415efe9 -- <本卡三个前端文件>` 输出为空 ⇒ 我的基线锚点用**显式提交号 `d44a850`** 仍然指向修前真身（不用 `HEAD`/`HEAD~1`，正是因为这类并发提交会让相对锚点漂移）。`bun run build` 会编译整个 `frontend/`，而 VS-37 的文件集是 python 脚本 + 文档，**与前端不相交**；我只能证明"文件集不相交"，**不能证明这次 build 的成功与 VS-37 的负载绝对无关**（不过 build 退出码 0，无失败需要归因）。
- **噪声如实记录**：修后第一次运行里 `DiscoverUX::shows honest examples without fetching invented recommendations` 报 `Test timed out in 5000ms`（该窗口 `import 184.34s`），同一用例在下一窗口 `3006ms` 通过、**代码与断言均未改** ⇒ 按环境铁律记为**负载噪声**，未据此改代码、未放宽任何断言或超时。
- **未 commit**（按卡要求）。收尾时 `git status --porcelain` 只剩本卡 5 个文件（2 改 + 2 新测试 + 本结果文件）—— 同窗口的 VS-37 已于 `415efe9` 入库，其文件不再出现在工作树里；即便如此，**提交时仍必须限定路径**，不要 `git add .`。
