# IMPLEMENT_RESULT — VS-39：Discover 因子失败伪装成空 + DiscoverThemes 同族（收口卡）

> 状态：**已完成**。原实现者只留下骨架（§1–§7 全为「填写中」）即被中断，**未产出任何实测输出**；
> 全文由 **2026-09-12 收尾轮**补齐，数据均为收尾轮实测。
> **证据来源声明（必须读）**：收尾轮**未改动任何源码**——5 个源文件的 blob 哈希在收尾前后逐字节不变
> （`e96417a`/`c2b24ec`/`b0be94e`/`313e9a3`/`9b279f0`）。凡实测处均标注了命令与原始输出。
> 基线（开工时显式 SHA）：`cf2514a93006891f93c55b79c31262b37601dbd2`（= 卡面提交，`git status --porcelain` 空）。

---

## 1. 两处现状核实（改前行号，`cf2514a`）

卡面点名的两处**均成立**（卡面行号经实测基本命中，以下为实测真身）：

| 卡面报点 | 实测（改动前） | 内容 | 判定 |
|---|---|---|---|
| `Discover.tsx:115` | `:106` | `factors: factorResult.status === 'fulfilled' ? factorResult.value : []` | 命中：**rejection 被折成空数组** |
| `Discover.tsx:199` | `:199`（整块 `:195-201`） | `<List dataSource={factors} loading={…} locale={{ emptyText: t('discover.noFactors') }} />` | **精确命中**：`:199` 就是 `locale={{ emptyText: t('discover.noFactors') }}` ⇒ 检索失败显示为"没有匹配的真实因子目录结果"（**失败伪装成空**） |
| `DiscoverThemes.tsx:10-14` | `:12` / `:14` | `const [payload, setPayload] = useState<MarketThemesResponse \| null>(null)` / `const [error, setError] = useState(false)` | 命中：**两个各自赋值的 state**，`error` 是**无归属布尔量** |
| `DiscoverThemes.tsx:19-21` | `:21-22`（catch 在 `:26-27`） | `setError(false)` / `setPayload(null)`；catch 分支 `if (id === requestId.current) setError(true)` | **部分命中**：卡面 `:19-21` 实测落在 `:21-22`（**发起时清**），catch 实际在 `:26-27`（**吞掉底层错误原文**） |
| `DiscoverThemes.tsx:37` | `:37` | `{error && <Alert type="warning" showIcon message={t('discover.themes.failed')} />}` | **精确命中**：**没有任何重试入口** |
| 卡面另点 `:35` | `:35` | 快捷选词按钮 `onClick={() => void run(value)}` | **精确命中**：**不受 loading 门控**（见 §6.2） |

两处结论：①因子检索失败**确实**被 `noFactors` 空态讲成了"确实没有"；②`DiscoverThemes` 的失败态**确实**无归属、发起时清、不可重试。

## 2. 改动清单（改后行号）

### 2.1 `frontend/src/pages/Discover.tsx`

| 位置（改后） | 改动 |
|---|---|
| `:14` | `import LoadFailureAlert, { LoadStateView, readStateOf }` —— 接入族内唯一三态实现（VS-29） |
| `:67` | 新增 `factorSearchFailure{query,error}`：因子失败态**自带查询词归属** |
| `:109-122` | `factors: []` 先置空，fulfilled 时 `next.factors = factorResult.value` 并**"成功才清"**该词的失败态；rejected 时写入 `{query: trimmed, error: reason.message}`（**不再让空数组冒称"确实没有"**） |
| `:171-173` | `objectFactorSearchFailure`：只认"属于**当前对象**（`executedQuery`）"的那一份失败 |
| `:174-181` | `factorState = readStateOf({ failed, resolved: !!scopedOutcome, count: factors.length, error })` |
| `:230-242` | 因子卡片改由 `LoadStateView` 渲染；错误分支转调 `LoadFailureAlert`（失败文案 + 原文 + **真重发同一查询词**）；空态只在"属于当前对象的一次成功读取且读回 0 条"时才可能出现 |

### 2.2 `frontend/src/components/DiscoverThemes.tsx`

| 位置（改后） | 改动 |
|---|---|
| `:7` | 新增 `import LoadFailureAlert`（错误态唯一呈现形态） |
| `:19` | 新增 `type ThemesOutcome = { keyword; payload }` |
| `:27` / `:30` | `payload` → `outcome`（带 `keyword` 归属）；`error: boolean` → `failure{keyword,error}`（带归属 + 原文）；**删除**无归属布尔 |
| `:33-55` | `run()` **不再在发起时清** `payload`/`error`；成功写 `outcome` 并"成功才清"同词失败态；失败写带归属的 `failure` |
| `:58-59` | `scopedOutcome`/`scopedFailure` 只认"等于输入框当前词（`keyword.trim()`）"的那一份 |
| `:68-69` | 失败与内容**互斥**渲染；失败走 `<LoadFailureAlert … onRetry={() => void run(scopedFailure.keyword)} />`（**真重发同一关键词**） |

## 3. 实测：不串 / 反向断言 / 归属保留 / 计数重试 / 不伪装成空

命令（收尾轮实测，2026-09-12）：

```
cd frontend && bun run test -- tests/DiscoverFactorScope.test.tsx tests/DiscoverThemesScope.test.tsx
```

| 卡面要求 | 用例 | 结果 |
|---|---|---|
| ①因子失败**必须可见**、不得渲染成 `noFactors` | `DiscoverFactorScope` › `当前查询词的因子检索失败 ⇒ 显示它自己的失败与底层原文，且不渲染 noFactors 空态` | ✓ 920ms（`/因子目录检索失败/` 与 `WQ catalogue offline` 同时可见；`没有匹配的真实因子目录结果` 为空） |
| ④不串 | `DiscoverFactorScope` › `换查询词后上一词的因子失败不得挂在新词上；新词显示它自己的错误原文` | ✓ 551ms（`WQ-FAIL-腾讯` 可见、`WQ-FAIL-茅台` 为空） |
| ②重试真重发 + 与成功解耦 | `DiscoverFactorScope` › `因子检索重试真的重发同一查询词（计数 1→2），且重试期间失败态保持显示` | ✓ 441ms（`searchAlpha` 计数 1→2、`toHaveBeenLastCalledWith('茅台')`、在途时 `WQ-DOWN-1` 仍在、成功后失败态消失） |
| **空态未被误伤**（守卫） | `DiscoverFactorScope` › `因子检索成功但确实没有匹配 ⇒ 仍然显示"没有匹配的真实因子目录结果"` | ✓（成功读到 0 条仍显示空态，且不显示失败） |
| ②`DiscoverThemes` 失败可见 + 计数重试 | `DiscoverThemesScope` › `板块读取失败 ⇒ 显示失败与底层原文，重试真的重发同一关键词（计数 1→2）` | ✓ 1012ms（`THEMES-DOWN-1` 原文可见、`/market/themes` 计数 1→2、`params.keyword === '半导体'`） |
| ④不串 + ⑤归属保留 | `DiscoverThemesScope` › `改动输入框换成别的词后上一词的失败不得继续显示；切回旧词仍显示它自己的失败（不重发）` | ✓（换词后两条失败文案均为空；切回后原文回来且 `themesCalls().length === 1` ⇒ **未重发**，靠状态归属） |
| ④反向断言 | `DiscoverThemesScope` › `当前关键词自己失败 ⇒ 显示它自己的错误原文；换词后新词的失败不带旧词的原文` | ✓ |
| ①换词在途不串结果 | `DiscoverThemesScope` › `换词在途时不得继续显示上一词的结果` | ✓ 319ms |
| 并发归属（守卫） | `DiscoverThemesScope` › `在途时点另一个快捷词（按钮不受 loading 门控）⇒ 迟到的失败不得挂到新词上` | ✓ |

文件级结果：`DiscoverFactorScope.test.tsx` **4 tests passed**（2174ms）；`DiscoverThemesScope.test.tsx` **5 tests passed**（2061ms）。

## 4. 门禁原始输出（2026-09-12 收尾轮，最终态）

**门禁 1 —— 相关 vitest**（12 个文件，3 个新 + 9 个既有）：

```
 Test Files  12 passed (12)
      Tests  44 passed (44)
   Duration  136.90s
EXITCODE=0
```

完整逐文件输出见 `IMPLEMENT_RESULT_VS38.md` §4（两卡为同一批次、同一次门禁运行）。**既有断言未被放宽**：`git diff` 中不含 `frontend/tests/` 下任何既有文件。

**门禁 2 —— `bun run build`**：

```
$ ../backend/.venv/Scripts/python.exe ../scripts/openapi_tsgen.py --check
OK: .../frontend/src/types/openapi.generated.ts is fresh (60 schemas)
$ tsc -b && vite build
✓ 4263 modules transformed.
✓ built in 33.86s
EXITCODE=0
```

**i18n 一致性**（本卡新增键 `discover.factorSearchFailed`，与 VS-38 的 `command.searchFailed` 同批）：zh/en 各 **2499 键**、**双向差集为空**、**无重复键**；`discover.factorSearchFailed` 在 `Discover.tsx:232` 有使用点。

## 5. 鉴别力证明（副本内退回修复 ⇒ 新用例变红）

在 `$env:TEMP` 副本内退回修复（junction 指回真实 `node_modules`，**未在真实树跑变异**）。副本基线以 **git blob 哈希**逐字节确认：

| 探针 | 副本状态 | 结果 |
|---|---|---|
| 探针 1 | 5 个源文件全退回 `cf2514a`（blob 哈希逐字节相等） | `DiscoverFactorScope` **4 tests \| 3 failed**；`DiscoverThemesScope` **5 tests \| 3 failed** |
| 探针 2 | 只退回 3 个组件、**保留新 i18n 键** | `DiscoverFactorScope` 仍 **4 tests \| 3 failed**（排除"缺键"这一解释） |

基线仍绿、且**本就该绿**的用例（**正当守卫，不是空断言**）：

- `DiscoverFactorScope` › `因子检索成功但确实没有匹配 ⇒ 仍然显示"没有匹配的真实因子目录结果"`——它守卫"别把空态改坏"，修前修后都必须绿。
- `DiscoverThemesScope` › `换词在途时不得继续显示上一词的结果`——修前的"发起时清"恰好也满足它，属**无回归守卫**。
- `DiscoverThemesScope` › `在途时点另一个快捷词 ⇒ 迟到的失败不得挂到新词上`——修前已有的 `requestId` 守卫已满足它，属**无回归守卫**。

失败样例（原始输出，语义断言失败，**不是超时**）：

```
TestingLibraryElementError: Unable to find an element with the text: WQ-FAIL-茅台.
 ❯ tests/DiscoverFactorScope.test.tsx:85:25
   （修前 catch 把 rejection 折成 factors: []，根本不带原文）

TestingLibraryElementError: Unable to find an element with the text: THEMES-DOWN-半导体.
 ❯ tests/DiscoverThemesScope.test.tsx:80:25
   （修前 error 是无归属布尔量，原文被吞掉）
```

**反向检验**：「**发起时清 / 切词时清**」是本题最自然的错误改法，被 `DiscoverThemesScope` 用例 2（切回旧词仍显示其失败**且不重发**）与 `DiscoverFactorScope` 用例 3（重试在途时失败态**保持显示**）同时拦住 ⇒ 测试判的是**结构**（失败态自带归属），不是"改完就绿"。

## 6. 未解决问题

1. **`loadCatalog` 竞态**：卡面转述的"3 处未修同族"里的第三处，VS-36 评估者已判定**不属本族**，本卡未处理。
2. **`DiscoverThemes` 快捷选词按钮仍不受 loading 门控**（卡面点名的 `:35`）：实现者**未加门控**，而是以 `requestId` 守卫保证并发下"迟到的失败不落到新词上"，并在 `DiscoverThemesScope` 用例 5 中把"在途可点"当作**接受的行为**来断言。判据选择是「使其安全」而非「消除并发」。**是否达标由验收者裁定**（若要求"消除并发"，这是一条未满足项）。
3. `Discover.tsx:130` 仍保留 `message.warning(t('discover.factorUnavailable'))` 的瞬时 toast，与新内联失败态并存，属**冗余观感**（非缺陷）。
4. 因子失败态刻意**不加**"输入框已是别的词就不显示"这道门（与公司名失败不同），理由写在 `Discover.tsx:167-170`：因子失败挂在当前对象的证据卡片里，说不说它只取决于"它是不是这个对象的失败"。这是**有意的形状差异**，若验收者认为应一律加门，需另行裁定。

## 7. 风险与并发边界

1. **并发边界（如实记录）**：本批两张卡（VS-38/39）都在改前端，任务书要求各自在 `$env:TEMP` 副本里跑门禁。实际执行时**同一窗口内没有其他卡在跑**（原实现者已被中断、无并发 Subagent），门禁是在真实树串行运行的；运行期间无其他卡的在制代码，故 §4 的门禁结果**不存在跨卡污染**。
2. 本机负载抖动：门禁 `import` 阶段耗时 93.99s（常态）；两次探针耗时 84.98s / 约 90s。**两次探针的失败全部是语义断言失败而非超时**，故不属负载假红。
3. **空态可能延迟出现**：`resolved` 取 `!!scopedOutcome`，而 `outcome` 只在**该对象的 `Promise.allSettled` 整体落定后**才写入 ⇒ 因子已返回但 screening 仍在途时，因子区显示加载态。这是"宁可说加载中，也不说确实没有"（VS-29）的有意取舍。
4. 变异与探针全部在 `$env:TEMP` 副本内完成，副本与 junction 已回收进回收站，真实 `node_modules` 完好。

---
（原实现者留下的骨架未含任何实测内容；本文件全部实测数据由 2026-09-12 收尾轮产出。）
