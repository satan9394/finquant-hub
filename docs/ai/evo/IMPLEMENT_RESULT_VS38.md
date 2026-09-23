# IMPLEMENT RESULT — VS-38：GlobalTaskEntry 的结果/失败态按查询词作用域

> 状态：**已完成**。§1 由 VS-38 原实现者写于中断前（未改动）；§2–§7 由 **2026-09-12 收尾轮**补齐。
> **证据来源声明（必须读）**：原实现者写完 §1 后即被中断，**未产出任何门禁或鉴别力输出**。本文件 §2–§7 的全部实测数据
> 均来自收尾轮；收尾轮**未改动任何源码**——5 个源文件的 blob 哈希在收尾前后逐字节不变
> （`e96417a`/`c2b24ec`/`b0be94e`/`313e9a3`/`9b279f0`）。凡收尾轮实测处均标注了命令与原始输出。
> 基线锚点（**显式提交号，不用相对锚点**）：`cf2514a`（本卡任务书提交）。
> 开工时目标文件内容 SHA256：`AEA02F4AA3F4E9F20201997E416E3747CB8EEC9FD29392DBD3D770B33524F5AF`
> （对应 blob `e4236b5c8156ef981b9ba6c3bd2f7f1db51c5d3f`）。

## 1. 现状核实（真实行号）

**卡面行号经实测全部命中**（这一点与 VS-36 相反，卡面这次没写错）。下表左列为**改动前**行号（显式锚点 `cf2514a:frontend/src/components/GlobalTaskEntry.tsx`，blob `e4236b5c8156ef981b9ba6c3bd2f7f1db51c5d3f`，内容 SHA256 `AEA02F4A…`）：

| 卡面报点 | 实测真身（改动前） | 内容 | 判定 |
|---|---|---|---|
| `:46` | `:46` | `const [query, setQuery] = useState('');` | 命中 |
| `:48` | `:48` | `const [results, setResults] = useState<GlobalTaskTarget[]>([]);` | 命中：**裸数组，无查询词归属** |
| `:70-92` | `:70-92` | `runSearch` | 命中 |
| `:153` | `:153` | `onChange={(e) => { setQuery(...); setSelected(null); }}` | 命中：**只清 selected，完全不动 results** |
| 未提 | `:157-170` | `{results.length > 0 && <List dataSource={results} …/>}` | **渲染处不校验归属** —— 这才是"换词仍挂着上一词候选"的落点 |
| 未提 | `:85-88` | `catch { setResults([]); … }` | **失败清空 ⇒ 与"查到了 0 条"同形** |
| 未提 | `:181` | `) : !results.length && <Empty … description={t('command.empty')} />}` | **失败态/未查过态都由这个空态渲染** |

两点结论（均成立，均未"已被修好"）：
1. **`results` 无查询词归属**：`onChange`（`:153`）只 `setSelected(null)`，`results` 原样留着；`:157` 的 `List` 只看 `results.length`，不看"这份结果属于哪个词"。⇒ 输入框已是"五粮液"，下面挂的仍是"茅台"的候选（**UI 上完全可达**：`onChange` 不受 loading 门控，改字即触发）。
2. **失败被渲染成"没有结果"**：`:86` 的 `setResults([])` 之后，`:181` 必然渲染 `Empty`（其 description 是 `command.empty` 的提示文案）。非 ticker 形态的词还有一条**转瞬即逝**的 `message.warning` toast（`:88`），既不可归因（没有"哪个词失败"），也**不可重试**。ticker 形态的词连 toast 都没有（`:87` 直接走 fallback），失败完全消失在"看起来什么也没发生"里。

### 其它同族状态扫描（同一文件，改动前编号）

| 位置 | 状态 | 是否同族 | 处置 |
|---|---|---|---|
| `:51`/`:56-58`/渲染 `:195` | `saved`：`listResearchWorkspaces().then(...).catch(() => setSaved([]))` | **是**（"失败伪装成空"的一半）：`targetList()` 在 `items.length === 0` 时**整块不渲染** ⇒ 读失败与"确实没有已保存研究"**在屏幕上完全一样** | **未修**（见 §6；卡面验收标准只点了 `results`，且与之同批的 VS-36 先例是"扫到即列出、不扩卡"） |
| `:50`/`:55` | `recent`：`readRecentTargets()` 内部 `catch { return [] }` | **是**（同上），但 localStorage 读失败无法区分也没有可修的重试语义 | **未修**，如实列出 |
| `:47`/`:152`/`:185` | `searching`：全局布尔，**无归属** | **是**（"在途"没有实体归属） | **已修**：新增 `pendingQuery`（在途也带"正在为哪个词请求"），见 §2 |
| `:181` | 空态在**任何**未被选中的时刻都渲染（含"刚打开、还没查过"） | **是**（"空态冒充结论"） | **已修**：三态视图只在"当前词有活动（有结论或在途）"时出现；"还没查过这个词"不再摆空态（保留原有的一句提示文案作为"未开始"占位，见 §7 风险 R2） |

**不同族、明确不动**：`selected`（`:49`）是"用户当前选择"，不是"某次查询的产出"；它本就被 `onChange` 清空，且本次新增的 `requestId` 守卫保证**迟到的响应不能替新词自动选中标的**（§3 用例 6）。

## 2. 改动清单（改后行号，`frontend/src/components/GlobalTaskEntry.tsx`）

| 位置（改后） | 改动 |
|---|---|
| `:16` | 新增 `import { LoadStateView, readStateOf }` —— 复用**族内唯一**三态实现（VS-29），不自行编排 loading/empty/error 优先级 |
| `:25-28` / `:34-37` | 新增 `TaskSearchOutcome{query,results}` 与 `TaskSearchFailure{query,error}`：**产出与失败各自带查询词归属** |
| `:70` / `:72` | `results` 裸数组 → `outcome`（带 `query` 归属）；新增 `searchFailure`（带 `query` + 出错原文）；**删除**裸 `results` |
| `:75` | 新增 `pendingQuery`：**在途也带归属**（"正在为哪个词请求"），使"在途"不必借空态表达 |
| `:80` | 新增 `requestId` ref：迟到的响应不得改写当前词的产出/失败 |
| `:99` | `runSearch(rawQuery = query)` —— 重试可**指定查询词**，不依赖输入框当前值 |
| `:108-131` | 每次请求取 `id`；`try`/`catch` **各加 `id !== requestId.current` 早退**；`catch` **不再** `setResults([])`，改为写入带归属的 `searchFailure` 并带出 `error.message`；`finally` 同样按 `id` 守卫 |
| `:115-117` | **"成功才清"**：`setSearchFailure(current => current?.query === value ? null : current)` |
| `:167-183` | 渲染作用域：`scopedOutcome`/`scopedFailure`/`scopedPending` 只认"等于 `query.trim()`"的那一份；`searchState = readStateOf({failed, resolved, count, error})`；`searchStarted` 只区分"当前词有没有活动" |
| `:219-239` | 候选/空态/失败三态改由 `LoadStateView` 渲染；`onRetry` 重发**同一个查询词**；`(selected ? null : emptyHint)` 作为"还没查过这个词"的占位 |

## 3. 五条实测（对应卡面「理想行为」①–⑤）

命令（收尾轮实测，2026-09-12）：

```
cd frontend && bun run test -- tests/GlobalTaskEntryQueryScope.test.tsx
```

12 个相关文件一起跑的完整结果见 §4。本文件的 6 条用例**逐条对应**卡面要求：

| 卡面要求 | 用例 | 结果（最终态） |
|---|---|---|
| ① 换词不串 | `换查询词（还没提交）后不得再挂着上一词的候选；词改回来候选回来（归属保留）` | ✓ 1193ms |
| ① + ③ 在途不伪装成空 | `换词在途时：不得显示上一词的候选，也不得把"在途"渲染成"没有结果"` | ✓ 541ms |
| ④ 反向断言 + ③ | `反向断言：当前词自己失败 ⇒ 必须显示它自己的失败，且不得伪装成"没有结果"` | ✓（断言 `/标的搜索失败/` 与 `market search offline` 原文同时可见，且 `command.empty` 文案为空） |
| ② 重试真重发 + 与成功解耦 | `重试真的重发同一个词（请求计数），且失败态与"成功"解耦：重发在途仍保持、成功后才消失` | ✓ 413ms（`searchStocks` 计数 1→2、`toHaveBeenLastCalledWith('茅台')`、在途时失败态仍在、成功后消失） |
| ⑤ 归属保留 | `切回旧词仍显示旧词自己的失败（归属保留，而不是被"切词时清"丢掉）` | ✓ 508ms（切回后计数仍为 2 ⇒ **未重发**，失败原文来自状态归属） |
| 补充：迟到响应 | `连点重试产生并发时，迟到的旧失败不得覆盖已经成功的新结果` | ✓ 580ms |

`GlobalTaskEntryQueryScope.test.tsx` 文件级结果：**6 tests passed**（3397ms）。

## 4. 门禁原始输出（2026-09-12 收尾轮，最终态）

**门禁 1 —— 相关 vitest**（3 个新文件 + 9 个相关既有文件）：

```
$ vitest run tests/GlobalTaskEntryQueryScope.test.tsx tests/DiscoverThemesScope.test.tsx tests/DiscoverFactorScope.test.tsx
             tests/GlobalTaskEntry.test.tsx tests/DiscoverQueryScope.test.tsx tests/DiscoverUX.test.tsx
             tests/DiscoverModeDispatch.test.tsx tests/DiscoverSearch.test.tsx tests/DiscoverResults.test.tsx
             tests/CommandBar.test.tsx tests/CommandComposer.test.tsx tests/AlphaResearchQueryScope.test.tsx

 ✓ tests/GlobalTaskEntryQueryScope.test.tsx (6 tests) 3397ms
 ✓ tests/DiscoverFactorScope.test.tsx (4 tests) 2174ms
 ✓ tests/DiscoverThemesScope.test.tsx (5 tests) 2061ms
 ✓ tests/DiscoverQueryScope.test.tsx (4 tests) 2521ms
 ✓ tests/DiscoverResults.test.tsx (2 tests) 980ms
 ✓ tests/DiscoverUX.test.tsx (4 tests) 2001ms
 ✓ tests/AlphaResearchQueryScope.test.tsx (6 tests) 2143ms
 ✓ tests/CommandComposer.test.tsx (3 tests) 767ms
 ✓ tests/DiscoverModeDispatch.test.tsx (2 tests) 934ms
 ✓ tests/GlobalTaskEntry.test.tsx (3 tests) 1437ms
 ✓ tests/CommandBar.test.tsx (3 tests) 500ms
 ✓ tests/DiscoverSearch.test.tsx (2 tests) 639ms

 Test Files  12 passed (12)
      Tests  44 passed (44)
   Duration  136.90s
EXITCODE=0
```

**既有断言未被放宽**：该 9 个既有文件的断言未作任何修改（`git diff` 中不含 `frontend/tests/` 下的既有文件）。

**门禁 2 —— `bun run build`**：

```
$ ../backend/.venv/Scripts/python.exe ../scripts/openapi_tsgen.py --check
OK: .../frontend/src/types/openapi.generated.ts is fresh (60 schemas)
$ tsc -b && vite build
✓ 4263 modules transformed.
✓ built in 33.86s
EXITCODE=0
```

**i18n 一致性**（新增键 `command.searchFailed`）：zh/en 各 **2499 键**、**双向差集为空**、**无重复键**；该键在 `GlobalTaskEntry.tsx:222` 有使用点。（与 VS-39 合批核对，详见 `IMPLEMENT_RESULT_VS39.md` §4。）

## 5. 鉴别力证明（副本里退回修复 ⇒ 新用例变红）

在 `$env:TEMP` 副本内退回修复（junction 指回真实 `node_modules`，**未在真实树跑变异**）。副本基线以 **git blob 哈希**逐字节确认（不是"工作区 vs HEAD"这类提交后即失效的对照）：

| 探针 | 副本状态 | 结果 |
|---|---|---|
| 探针 1 | 5 个源文件全退回 `cf2514a`（blob 哈希逐字节相等） | `GlobalTaskEntryQueryScope.test.tsx` **6 tests \| 6 failed** |
| 探针 2 | 只退回 3 个组件、**保留新 i18n 键**（排除"缺键"这一解释） | 该文件仍 **6 tests \| 6 failed** |

探针 2 的意义：键已存在，`/标的搜索失败/` 仍不出现 ⇒ 失败**只可能来自行为缺失**，与缺键无关。

失败样例（原始输出，语义断言失败，**不是超时**）：

```
AssertionError: expected <button …(3)>…(3)</button> to be null
 ❯ tests/GlobalTaskEntryQueryScope.test.tsx:75:41
   （对应"换词后上一词候选仍挂着"——修前行为的直接证据）

TestingLibraryElementError: Unable to find an element with the text: /标的搜索失败/.
 ❯ tests/GlobalTaskEntryQueryScope.test.tsx:110:25
   （修前失败只走瞬时 toast，没有任何可归因的失败态）
```

两次探针失败**全部是 `AssertionError` / `TestingLibraryElementError` 这类语义断言失败，不是超时**，已排除本机负载导致的假红。

**反向检验（"有没有另一种错误改法也能让它绿"）**：「**切词时清状态**」是本题最自然的错误改法，它被用例 1（"词改回来候选回来"）与用例 5（"切回旧词仍显示它自己的失败且不重发"）同时拦住 ⇒ 测试判的是**结构**（状态自带实体归属），不是"改完就绿"。这两条断言在本卡是**承重**的，不得放宽。

## 6. 未解决问题

1. **同族仍有两处未修**（§1 已列出，本次核实成立、**按卡面口径未修**）：`:85-87` 的 `saved` 仍是 `.catch(() => setSaved([]))`，而渲染侧 `targetList` 在 `items.length === 0` 时整块不渲染 ⇒「读取失败」与「确实没有已保存研究」在屏幕上同形；`:77` 的 `recent`（`readRecentTargets` 内部 catch 返回 `[]`）同理，但 localStorage 读失败无重试语义。**卡面验收标准只点了 `results`**，与 VS-36 先例一致（扫到即列出、不扩卡）。
2. `:49` 的 `selected` 未按实体作用域。经核实**不同族**：它是"用户当前选择"而非"某次查询的产出"，本就被 `onChange` 清空，且本次新增的 `requestId` 守卫保证迟到的响应不能替新词自动选中标的。
3. 失败时瞬时 `message.warning(t('command.searchUnavailable'))` 与新内联错误态并存，属**冗余观感**（非缺陷）：toast 给非 ticker 形态的词，内联态给全部。

## 7. 风险

1. **失败态在重发期间保持显示 ⇒ 重试按钮在途仍可点**，连点两次即产生两个并发请求。这是**刻意设计**（"成功才清"的必要代价，否则重试期间失败态消失就变成"发起时清"），且已被用例 6 覆盖（迟到的旧失败不得覆盖已成功的新结果）；但它是本轮唯一引入的并发面。
2. `LoadStateView` 的 `loading` 分支在本组件**默认不播报**（`announceLoading` 未开，保持 VS-29 默认值），因此命令栏输入框下方的加载转圈不进 live region。
3. 「还没查过这个词」仍显示 `command.empty` 的**一句提示文案**（非空态组件、非结论）。这是 §1 明确记录的有意取舍：修前输入框空着就渲染 `Empty`，那才是"把没查过说成没有结果"。
4. 门禁中的 `import` 阶段耗时 93.99s（本机常态），属环境噪声，与本次改动无关。

---
（§1 现状核实为原实现者原文，未经收尾轮改写。）
