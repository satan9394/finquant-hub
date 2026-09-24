# W1 `GlobalTaskEntry.tsx` 的 `saved` 读取失败与"确实为空"同形

- 状态：已执行（待验收）
- 优先级：P1
- 创建日期：2026-09-13
- Mission：finquant-hub Mission 2（NEXT_BACKLOG P1-1）
- 来源：**human-requested**（用户本轮候选①）；`docs/ai/evo/NEXT_BACKLOG.md` §1 P1-1；`docs/ai/evo/EVALUATION_RESULT_VS38.md` §7 NIT-1
- 基线：`cec2c128209e88de9eb5fa0a4ec23faa5d5d2a2d`（`git status --porcelain` 为空）

## 问题（指挥侧已独立复核，2026-09-13）

- `frontend/src/components/GlobalTaskEntry.tsx:85-87` 的 `show()`：
  `void listResearchWorkspaces().then((items) => setSaved(...)).catch(() => setSaved([]))`
  ⇒ **读取失败被归约为空数组**。
- 同文件 `:152` `const targetList = (title, items) => items.length > 0 && (...)`；`:264` 以 `targetList(t('command.saved'), saved)` 渲染
  ⇒ **为空时整块渲染 `false`，屏幕上什么都不出现**。
- 两者叠加：**「读取失败」与「确实没有已保存研究」在屏幕上完全同形**（VS-29 三态契约要消灭的正是这种假象）。

**第一步必须先核实现状**（读源码 + 真实行号）：确认上述两点成立；若不成立或已部分修好，直接说明并给证据。**卡面行号以你实际读到的为准。**

## 目标

让 `saved` 的读取具备**可区分**的三态，且失败**可归因 + 可重试（重试真的重发）**：

1. 复用族内**唯一**三态实现：`frontend/src/components/LoadFailureAlert.tsx` 的 `readStateOf` / `LoadStateView`（VS-29，`8d05556`）——**不要自己编排 loading/empty/error 的优先级**。
2. 失败态**自带底层原文**（`error.message`，不吞掉），并有**真的重发 `listResearchWorkspaces()`** 的重试按钮。
3. **反向断言**：`saved` 自己失败时，必须显示**它自己的**错误；读取成功且确实为空时，**不得**显示任何失败文案。
4. **"发起时清"改"成功才清"**（VS-32 口径）：重试在途时失败态保持显示，成功之后才消失。
5. 迟到的响应不得改写新状态（若实现中出现并发路径，用 `requestId` 式守卫；**该组件已有 `requestId`，但它是给检索流程用的，不要复用/污染它**）。

## 限制条件 / 禁止事项

- **只允许改 `frontend/src/components/GlobalTaskEntry.tsx`，并新增一个测试文件** `frontend/tests/GlobalTaskEntrySavedFailure.test.tsx`。
- **严禁改动 `recent` 的行为**（用户裁决 A）：`frontend/src/features/globalTaskEntry.ts` 的 `readRecentTargets`、`:77` 的 `recent` state、`:84` 的 `setRecent(...)`、`:263` 的 `targetList(t('command.recent'), recent)` **一行都不许动**。理由：它是 localStorage 同步读，没有真重试语义；硬套三态会造出无意义的重试按钮。
- **不得破坏 VS-38 已验收的检索流**：`outcome` / `searchFailure` / `pendingQuery` / `runSearch` / `scopedOutcome` / `scopedFailure` / `searchState` / `searchStarted` / 检索用的那个 `requestId` / `<LoadStateView>` 三态块——**语义与结构都不许改**（它们已在 `f74a26e` 被独立验收 ACCEPT）。
- **不得放宽既有断言**：`frontend/tests/GlobalTaskEntry.test.tsx`、`frontend/tests/GlobalTaskEntryQueryScope.test.tsx` **一个字都不许改**。
- 不加依赖；不改 `tsconfig` / `package.json` / ruff 配置（用户明令禁止改项目配置）。
- **不 commit**（提交由指挥侧统一做）。
- `%TEMP%` 之外的任何变异、任何临时文件都不得写进仓库；变异**只允许**在 `%TEMP%` 副本里做。
- 命令文本/提交信息不得含永久删除类 API 字面名（本机 pre-execute 门禁为子串匹配）。

## 验收标准（客观门禁）

- [x] ① 现状核实：**成立**。改前工作区 blob `e96417a76af6675fc55674c6674457bb279ddbdc` == `git rev-parse cec2c12:frontend/src/components/GlobalTaskEntry.tsx`（逐字节相同）。改前真实行号：
  - `:78` `const [saved, setSaved] = useState<GlobalTaskTarget[]>([]);`
  - `:82-88` `show()` 里 `void listResearchWorkspaces().then(...).catch(() => setSaved([]));` ⇒ 读取失败被**归约为空数组**
  - `:152` `const targetList = (title, items: GlobalTaskTarget[]) => items.length > 0 && (...)` ⇒ 为空时整块渲染 `false`
  - `:264` `{targetList(t('command.saved'), saved)}`
  两条叠加 ⇒「读取失败」与「确实无已保存研究」在屏幕上完全同形。
- [x] ② 换/重开面板不再串：`savedFailure` / `savedResolved` / `savedRequestId`（**新起的 ref；检索流的 `requestId` 一行未动**）只由 `saved` 自己的读取写入；用例 6「重开面板：上一次那次读取的迟到结果不得改写本次的状态」绿，删掉守卫后同一用例**变红**（见 ⑨ 变异乙）。
- [x] ③ 反向断言（成功且为空 ⇒ 不出现失败文案）：用例 2 的 ② 段 —— `queryByRole('alert')` 为 `null`、`queryByRole('button', { name: /重\s*试/ })` 为 `null`、`.fq-load-state--empty` 成立而 `--error` 不成立；用例 3「成功且有内容 ⇒ 显示自己的候选项且不出现失败呈现」绿。
- [x] ④ 重试真重发 + 与成功解耦：用例 4 —— `vi.mocked(listResearchWorkspaces).mock.calls.length` 由 **1 → 2**；重发**在途**时失败态仍在（再次断言失败文案与原文）；只有 `retryPending.resolve(...)` 之后失败态才消失。
- [x] ⑤ 失败不伪装成空：用例 1 —— 修前 `getByRole('alert')` 抛 `TestingLibraryElementError`（屏幕上**什么都没有**），修后 error Alert 在场、`.ant-alert-description` 即底层原文、重试按钮在场。
- [x] ⑥ 既有测试全绿（**零改动**）+ 新文件：`Test Files 3 passed (3) / Tests 16 passed (16)`（95.71s）；两个既有文件工作区 blob 与基线逐字节相同（哈希见「预期证据」§5）。
- [x] ⑦ 鉴别力：`%TEMP%` 副本退回基线（`git hash-object <副本文件>` == `git rev-parse cec2c12:<path>` == `e96417a7…`）⇒ 7 条新用例 **5 条变红**；首条 `TestingLibraryElementError: Unable to find an accessible element with the role "alert"`，其余为 `AssertionError`。**是语义失败、不是超时**（Duration 20.80s，无 timeout 字样）。
- [x] ⑧ 门禁：聚焦 vitest（3 个文件）`3 passed / 16 passed`；`bun run build` ⇒ `✓ built in 1m 14s`，exit 0。
- [x] ⑨ 反向检验：**实测三种错误改法都不能让新用例全绿** ——
  - 甲「失败时什么都不显示」（= 基线本身）：5 红（见 ⑦）。
  - 乙「发起时清」（`loadSaved` 开头加 `setSavedFailure(null)`，VS-32 明令禁止）：**2 红** —— 用例 4 `AssertionError: expected null to be truthy`（重发在途失败态被抹掉）、用例 5 `TestingLibraryElementError`（找不到重试按钮）。
  - 丙「去掉迟到响应守卫」：**2 红** —— 用例 5、6 均 `AssertionError: expected <div data-show="true" …> to be null`（迟到的响应改写了最新状态）。
  ⇒ 绿灯不是"断言变弱"换来的：正确性理由是**结构性的**（失败态由 `saved` 自己持有、原文交给族内唯一三态实现、序号守卫拒绝迟到者）。

## 依赖
- 无

## 预期证据（执行器回填，单卡 ≤400 行）

### 1. 改前 / 改后对照（关键片段）

改前（`cec2c12:frontend/src/components/GlobalTaskEntry.tsx`，行号为**改前真实行号**）：

```tsx
 78:  const [saved, setSaved] = useState<GlobalTaskTarget[]>([]);
 82:  const show = () => {
 83:    setOpen(true);
 84:    setRecent(readRecentTargets());
 85:    void listResearchWorkspaces()
 86:      .then((items) => setSaved(items.slice(0, 5).map((item) => ({ code: item.symbol, name: item.name ?? item.symbol }))))
 87:      .catch(() => setSaved([]));          // ← 读取失败被归约为"空数组"
 88:  };
152:  const targetList = (title: string, items: GlobalTaskTarget[]) => items.length > 0 && (   // ← 空 ⇒ 整块 false
264:        {targetList(t('command.saved'), saved)}
```

改后（同一文件；本卡改动 = `:38-44`、`:87-96`、`:98-124`、`:221-231`、`:311-331`）：

```tsx
 43:  interface SavedLoadFailure { error: string }   // 对象存在即失败（不用"文案非空"当判据）
 92:  const [savedFailure, setSavedFailure] = useState<SavedLoadFailure | null>(null);
 93:  const [savedResolved, setSavedResolved] = useState(false);   // 成功读过一次才允许说"空"
 94:  const savedRequestId = useRef(0);                            // 新 ref，不复用检索流的 requestId
104:  const loadSaved = () => {
105:    const id = ++savedRequestId.current;          // 发起时**不**清失败态（VS-32 口径）
106:    void listResearchWorkspaces()
109:        if (id !== savedRequestId.current) return;    // 迟到的响应不得改写新状态
112:        setSavedFailure(null);                        // 只有**成功**才清
116:        setSavedFailure({ error: error instanceof Error ? error.message : String(error) });
120:  const show = () => { setOpen(true); setRecent(readRecentTargets()); loadSaved(); };
223:  const savedState = readStateOf({
224:    failed: savedFailure !== null, resolved: savedResolved, count: saved.length, error: savedFailure?.error });
231:  const savedFailureMessage = t('comparison.loadError.research', { error: t('research.error.loadFailed') });
315:  <div className="global-task-entry__history global-task-entry__saved">
317:    <LoadStateView state={savedState} failureMessage={savedFailureMessage} onRetry={loadSaved}> … </LoadStateView>
```

`git diff -U0` 的**删除行只有 4 行**：`show()` 里旧的三行 + `{targetList(t('command.saved'), saved)}`。
硬约束自查（两条 grep 均**零命中**）：

```
git diff -U0 -- <file> | Select-String '^[+-][^+-]*recent'                              → 空
git diff -U0 -- <file> | Select-String '^[+-][^+-]*(outcome|searchFailure|pendingQuery|runSearch|scopedOutcome|scopedFailure|searchState|searchStarted)' → 空
```

### 2. 新测试文件全文或要点 + 逐条用例结果

新增 `frontend/tests/GlobalTaskEntrySavedFailure.test.tsx`（blob `395ddd4a8fb961144235593c809b5c29ee807b23`，7 条用例）。
判据全部结构性：`getByRole('alert')` + `.ant-alert-message` 含"已保存研究" + `.ant-alert-description` **等于**底层原文
+ `getByRole('button', { name: /重\s*试/ })` + `.fq-load-state--loading|empty|error` + **请求调用计数**。
夹具用"受控 deferred promise"（不用 fake timer），所以断言点确定、不依赖动画时长。

修复态逐条（`bun run test -- tests/GlobalTaskEntrySavedFailure.test.tsx --reporter=verbose`，exit 0）：

```
 ✓ saved 读取失败 ⇒ 失败必须出现在屏幕上（底层原文 + 重试），不得"什么都没有"          1041ms
 ✓ 三态互斥可辨：未落定 ⇒ 加载中；成功且为空 ⇒ 空态且无任何失败文案；失败 ⇒ 错误态        353ms
 ✓ 反向断言：saved 读取成功且有内容 ⇒ 显示自己的候选项，且不出现失败呈现                 344ms
 ✓ 重试真的重发（调用计数 1→2），且与"成功"解耦：重发在途失败态仍在，成功之后才消失       325ms
 ✓ 连点重试产生并发时，迟到的旧失败不得覆盖已经成功的新结果                             335ms
 ✓ 重开面板：上一次那次读取的迟到结果不得改写本次的状态                                 180ms
 ✓ 归因不串：检索失败不得被显示成"已保存研究"的失败；saved 的失败也只在自己那一块里        307ms
 Test Files  1 passed (1)      Tests  7 passed (7)      Duration  17.13s
```

### 3. 门禁原始输出（vitest 汇总行 + build 尾行）

```
$ cd frontend && bun run test -- tests/GlobalTaskEntrySavedFailure.test.tsx tests/GlobalTaskEntry.test.tsx tests/GlobalTaskEntryQueryScope.test.tsx
 Test Files  3 passed (3)
      Tests  16 passed (16)
   Duration  95.71s (transform 551ms, setup 1.35s, import 76.12s, tests 10.00s, environment 6.98s)
[status: completed, exit code: 0]

$ cd frontend && bun run build
OK: E:\Code_file\Projects\finquant-hub\frontend\src\types\openapi.generated.ts is fresh (60 schemas)   ← prebuild openapi_tsgen.py --check，exit 0
dist/assets/vendor-antd-iGqrvHzh.js           1,566.95 kB │ gzip: 491.20 kB
(!) Some chunks are larger than 500 kB after minification. Consider: Using dynamic import() to code-split …
✓ built in 1m 14s
[status: completed, exit code: 0]
```

### 4. 鉴别力证明（副本基线哈希 + 变红用例 + 失败信息）

副本：`%TEMP%\w1-discrim\frontend`（robocopy 复制源码/测试/配置；`node_modules` 用 **junction** 指向真实目录）；
基线文件用 `git cat-file blob` + `Start-Process -RedirectStandardOutput`（二进制安全）写出：

```
git rev-parse cec2c12:frontend/src/components/GlobalTaskEntry.tsx = e96417a76af6675fc55674c6674457bb279ddbdc
git hash-object <副本文件>                                        = e96417a76af6675fc55674c6674457bb279ddbdc   ⇒ 逐字节相同
新测试文件：repo=395ddd4a8fb961144235593c809b5c29ee807b23  副本=395ddd4a8fb961144235593c809b5c29ee807b23   ⇒ 相同
```

副本（**基线组件** + 本卡新测试文件）运行结果 —— 5 红：

```
 ❯ tests/GlobalTaskEntrySavedFailure.test.tsx (7 tests | 5 failed) 2747ms
     × saved 读取失败 ⇒ 失败必须出现在屏幕上（底层原文 + 重试），不得"什么都没有"
     × 三态互斥可辨：未落定 ⇒ 加载中；成功且为空 ⇒ 空态且无任何失败文案；失败 ⇒ 错误态
     × 重试真的重发（调用计数 1→2），且与"成功"解耦：重发在途失败态仍在，成功之后才消失
     × 连点重试产生并发时，迟到的旧失败不得覆盖已经成功的新结果
     × 归因不串：检索失败不得被显示成"已保存研究"的失败；saved 的失败也只在自己那一块里
 Test Files  1 failed (1)      Tests  5 failed | 2 passed (7)
   Duration  20.80s

 FAIL  … > saved 读取失败 ⇒ 失败必须出现在屏幕上（底层原文 + 重试），不得"什么都没有"
 TestingLibraryElementError: Unable to find an accessible element with the role "alert"
 ❯ tests/GlobalTaskEntrySavedFailure.test.tsx:104:19
（同一次输出的 DOM dump 里，修前弹窗**根本没有** `.global-task-entry__saved` 区块、也没有任何 alert
 ⇒ 字面意义上的"什么都没有"）
```

**是语义断言失败、不是超时**：`Duration 20.80s`、无 `timed out` / `Test timed out` 字样；错误类型为
`TestingLibraryElementError` 与 `AssertionError`（其余 4 条：`expected undefined to be truthy` ×1、
`expected null to be truthy` ×2、`within(null)` 的 `TypeError` ×1）。

### 5. 既有测试文件未被改的证明

```
$ git status --porcelain
 M frontend/src/components/GlobalTaskEntry.tsx           ← 本卡
 M frontend/tests/MonitorToday.test.tsx                  ← 并行卡 W2（**非本卡**）
 M scripts/audit.py                                      ← 并行卡 W2（**非本卡**）
?? frontend/tests/GlobalTaskEntrySavedFailure.test.tsx   ← 本卡新增

frontend/tests/GlobalTaskEntry.test.tsx           worktree=9beaa832ca9f2a1a54ad4595191647cbc2f3bda9  baseline=同  identical=True
frontend/tests/GlobalTaskEntryQueryScope.test.tsx worktree=023baec03be5197f3405c7f8ef7e1e8659001220  baseline=同  identical=True
```

`git diff --name-only` / `--stat` 均不含这两个文件；本卡**未** commit。
`git ls-files --eol`：`i/lf w/lf`（改前改后一致，未引入行尾噪声）。

### 6. 偏差 / 未完成项 / 残余风险

- **偏差 1（本卡唯一需要人裁决的点）**：卡面禁止改第三个文件 ⇒ 不得新增 i18n 词条，而产品里没有
  「已保存研究读取失败」的现成文案。失败文案因此**复用**既有参数化文案 `comparison.loadError.research`
  （`已保存研究：{error}`）+ `research.error.loadFailed`（`加载失败`）⇒ 屏幕上为「已保存研究：加载失败」，
  `description` 仍是底层原文。若允许动 i18n，更干净的是新增 `command.savedFailed`。**这是唯一一处跨命名空间复用。**
- **偏差 2（可见观感变化，已由用例 2 固定）**：`saved` 区块现在**恒常渲染**（标题 + 三态视图）。
  此前"为空"时整块不出现；现在"成功且确实为空"会显示一个**只有图标、无文案**的空态
  （`LoadStateView` 缺省空态刻意不写"暂无…"），首次打开会多一个 spinner。这是"三态可辨"的直接代价。
- **口径说明（请评估者核）**：②「重开面板不串」在本实现里 = *状态只由 `saved` 自己的读取写入 + 迟到那一次不得改写最新那次*；
  **重开后会先显示上一次的失败态，直到本次读取成功才消失** —— 这正是 ④ 要求的 VS-32「发起时清 → 成功才清」的同一口径。
  若改按"重开即清"，会与 ④ 直接冲突，并让重试在途闪一次空/加载态。
- **残余风险 1**：验证环境是 jsdom + 受控 mock；"重发在途失败态仍在"未在真实网络下复现（其正确性依据是代码结构：发起路径不写 `savedFailure`）。
- **残余风险 2（并发边界，如实记录）**：本窗口内有并行卡 W2（只改 `frontend/tests/MonitorToday.test.tsx` 与 `scripts/audit.py`，不碰 `frontend/src`、不跑 build）。本卡 3 次 vitest + 1 次 build **全部一次通过、零 timeout**，因此没有"与并发有关/无关"的归属需要声明；但**我不能证明负载从未影响过这些耗时数字**，故不把任何耗时当基线。
- **残余风险 3**：`LoadStateView` 错误分支默认**不渲染 children** ⇒ 刷新失败时，上一次成功读到的已保存研究列表不会继续显示（与同文件检索流口径一致，未用 `showContentOnError`）。若产品希望失败时保留旧列表，需另行裁决。
- **未完成项**：无。未跑全量前端 vitest / 全量 pytest（卡面明令禁止）；%TEMP% 副本与 junction 已回收，真实 `node_modules` 回收前后均为 28907 个文件。

## 验收结论（Evaluator / 指挥会话回填）
- **PASS → 已接受**（2026-09-13，指挥侧独立复核；**非 fresh-context 独立评审**，见下方边界）
- 执行器：子代理 `9c0cbe14-89ab-4240-92df-d90e0a37f532`
- 被验内容（`git hash-object`）：组件 `2e3d04f2041138c7100ef397e2fbefc7115cdbfe`、新测试 `395ddd4a8fb961144235593c809b5c29ee807b23` —— 与执行器自述**逐字一致**
- 指挥侧自己跑的命令与结果：
  - 交付面：`git diff --numstat` = `70 4` 组件；工作区恰 3 `M` + 1 `??`
  - **既有断言零放宽**：`GlobalTaskEntry.test.tsx`、`GlobalTaskEntryQueryScope.test.tsx` 与 `cec2c12` **逐字节相同**（blob 相等）
  - **结构禁令**：`git diff -U0` 中 `recent|readRecentTargets|setRecent|rememberRecentTarget` **0 命中**、`outcome|searchFailure|pendingQuery|runSearch|scopedOutcome|scopedFailure|searchState|searchStarted` **0 命中**；`features/globalTaskEntry.ts` 未出现在 diff 中；删除行**恰 4 行**（旧 `show()` 三行 + 旧 saved 渲染行），与执行器自述一致
  - **门禁**：`bun run test -- <3 文件>` → `Test Files 3 passed (3)` / `Tests 16 passed (16)` / exit 0；`bun run build` → `openapi … fresh (60 schemas)` + `✓ 4263 modules transformed` + `✓ built in 37.88s` / exit 0
  - **鉴别力证明（指挥侧自己做）**：`$env:TEMP` 副本内把组件退回基线，副本文件 `git hash-object` == `e96417a76af6675fc55674c6674457bb279ddbdc`（== `cec2c12:frontend/src/components/GlobalTaskEntry.tsx`，逐字节）⇒ 7 条新用例 **5 failed | 2 passed**，exit 1；失败为 `TestingLibraryElementError: Unable to find an accessible element with the role "alert"`、`AssertionError: expected undefined/null to be truthy`、`TypeError: … got null`（`.global-task-entry__saved` 容器在修前不存在），**无 timeout**；副本与 junction 已回收进回收站，真实 `node_modules` 完好
- 指挥侧裁定（两处执行器提请裁决项）：
  - **i18n 复用：接受**。实读两条键值 `comparison.loadError.research` = `已保存研究：{error}`、`research.error.loadFailed` = `加载失败` ⇒ 渲染「已保存研究：加载失败」；**文案语义本就是"已保存研究"**，`comparison.` 前缀是既有命名瑕疵、非语义错配；为它多开两个 i18n 文件不划算 ⇒ 记为 **NIT-1**
  - **`saved` 区块恒常渲染：接受**。这是三态可辨的直接代价（首次打开多一个 spinner；成功且为空时是只有图标、无文案的缺省空态），且已由用例 2 固定 ⇒ 记为 **NIT-2**
- **边界**：本判定由指挥侧在**同一会话**做出，执行器亦为本会话所派 —— 满足"做的人不评自己"，但**不满足 fresh-context 独立评审**。原计划的验收子代理 `9e6dd1ee` **执行失败**（未产出、未写文件、未动工作区），按 `memory/SUBAGENT_TIMEOUT_DISCIPLINE.md` 第 25 条由指挥侧补跑客观门禁与鉴别力探针。**若需真独立评审，应另行开一个干净会话重做。**
