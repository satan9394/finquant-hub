# EVALUATION_RESULT — VS-26：修掉既有测试的竞态（测试卫生）

> 独立验收（Evaluator）。**立场：假设实现有错。** 本卡最需防的失败形态是「为消红灯而偷偷削弱断言」，故核心工作量放在**改动前后逐字比对**与**反向鉴别力证明**上。
> 本文件由验收者撰写，**未改动任何被验文件**。所有变异/临时产物均在 `$env:TEMP` 内，已送回收站；门禁输出未写入仓库目录。

## 判定：**ACCEPT**

三条验收要点均为「通过」，且本卡最担心的「断言被削弱」被**机器比对方式证伪**：三处断言的期望值**逐字符未变**，全文件的实质差异**只有** 3 处 `await waitFor(...)` 包裹。

## 0. 被验提交的锚定（含一处必须记录的事实）

- 派单时 `git log -1` 的 HEAD = **`fca8364`**（`VS-26：修掉既有测试的竞态（测试卫生，零生产代码改动）`），其 `git show --name-status` 为：
  - `A docs/ai/evo/IMPLEMENT_RESULT_VS26.md`
  - `M frontend/tests/ResearchWorkspaceEvidence.test.tsx`
- **验收期间 HEAD 又前移了三次**（编排者提交，均与代码无关）：`da4bcc1`（产品状态/行号校正）、`718936f`（把实现者的门禁证据补入结果文件）、`6ee76f7`（更正路线图对「3 处竞态」的框架，见 §2.1）。
- **对被验对象的效力已验证**：测试文件在这些提交之间**始终未被触碰** ——
  - `git diff fca8364 HEAD -- frontend/tests/ResearchWorkspaceEvidence.test.tsx` 输出为空；
  - blob 相同：`fbad76a4c46e1b436a6145642bbc7f3d35d89335`（fca8364 与 HEAD 一致）。
- 故下述结论对 `fca8364` 与当前 HEAD **同时成立**；工作树中该文件与 HEAD 亦一致（无未提交改动）。

## 1. 逐处对照：改动前 vs 改动后（建议必查项）

命令：`git show HEAD~1:frontend/tests/ResearchWorkspaceEvidence.test.tsx` 与 HEAD 版本比对。三处并列如下（**期望值是否逐字一致**是本卡的命门）。

### 第 1 处 — 失败日期回滚后的窗口截止日期

```ts
// 改前（原 :295）
expect((within(card).getByRole('textbox', { name: '选择龙虎榜窗口截止日期' }) as HTMLInputElement).value).toBe(shanghaiToday());

// 改后（现 :298）
await waitFor(() => expect((within(card).getByRole('textbox', { name: '选择龙虎榜窗口截止日期' }) as HTMLInputElement).value).toBe(shanghaiToday()));
```

### 第 2 处 — 导航换标的后选中的龙虎榜记录

```ts
// 改前（原 :321）
expect(within(card).getByRole('button', { name: /2026-08-27/, pressed: true })).toBeTruthy();

// 改后（现 :327）
await waitFor(() => expect(within(card).getByRole('button', { name: /2026-08-27/, pressed: true })).toBeTruthy());
```

### 第 3 处 — 第二条错误文案

```ts
// 改前（原 :336）
expect(screen.getByText('龙虎榜：龙虎榜接口不可用')).toBeTruthy();

// 改后（现 :344）
await waitFor(() => expect(screen.getByText('龙虎榜：龙虎榜接口不可用')).toBeTruthy());
```

### 1.1 机器比对结果（不是目测）

把改后三行剥掉 `await waitFor(() => ` 前缀与行尾 `)`，与改前原行做**逐字符（`-ceq`）**比较：

```
SITE 1  OLD:295 NEW:298  VERBATIM-IDENTICAL: True
  OLD      : expect((within(card).getByRole('textbox', { name: '选择龙虎榜窗口截止日期' }) as HTMLInputElement).value).toBe(shanghaiToday());
SITE 2  OLD:321 NEW:327  VERBATIM-IDENTICAL: True
  OLD      : expect(within(card).getByRole('button', { name: /2026-08-27/, pressed: true })).toBeTruthy();
SITE 3  OLD:336 NEW:344  VERBATIM-IDENTICAL: True
  OLD      : expect(screen.getByText('龙虎榜：龙虎榜接口不可用')).toBeTruthy();
ALL_THREE_VERBATIM_IDENTICAL = True
```

### 1.2 全文件差异扫描（排除「别处偷偷弱化」）

把两个版本的**注释行剔除后**做 `Compare-Object`，差异**只有**这 3 行：

```
=>:     await waitFor(() => expect((within(card).getByRole('textbox', …).value).toBe(shanghaiToday()));
=>:     await waitFor(() => expect(within(card).getByRole('button', { name: /2026-08-27/, pressed: true })).toBeTruthy());
=>:     await waitFor(() => expect(screen.getByText('龙虎榜：龙虎榜接口不可用')).toBeTruthy());
<=:     expect((within(card).getByRole('textbox', …).value).toBe(shanghaiToday());
<=:     expect(within(card).getByRole('button', { name: /2026-08-27/, pressed: true })).toBeTruthy());
<=:     expect(screen.getByText('龙虎榜：龙虎榜接口不可用')).toBeTruthy();
```

即：**没有任何新增断言、没有把具体值断言替换成宽泛断言、没有新增 `expect(...).toBeTruthy()` 到原本无断言的位置**。改动规模与实现者自述一致（`git diff --stat`：`14 +++++++++++---`，11 增 3 删 = 3 处包裹 + 8 行注释）。

### 1.3 「弱化」气味专项排查

对三行新增内容扫描 `queryBy*` / `not.toThrow` / `toBeDefined` / `expect.any` / `expect.anything`：**零命中**。
第 2 处确实是 `.toBeTruthy()`，但它是**改前就有的写法**（原文 `expect(within(card).getByRole(...)).toBeTruthy()`），且其内层是 `getByRole(name: 具体正则, pressed: true)` —— 元素不存在时 `getByRole` 会**抛错**，因此该断言**并非恒真**（第 5 节的反向证明亦在同类形态上取得了真实红灯）。判为**未削弱**。

补充：紧邻三处的既有同步断言（`:328-332` 的 `000001 / 平安银行 / 平安银行最近上榜` 与 `queryByText('历史上榜原因') === null`、`:341` 的 `findByText('资金流向：资金接口不可用')`、`:345/346` 的空态文案）**全部原样保留**，未被本次改动触碰。

## 2. 反向鉴别力证明（副本内改回同步断言 ⇒ 变红）

在 `$env:TEMP\vs26-mutant\` 副本内（`src`/`node_modules` 以 junction 指向仓库，**仓库 `src/`、`tests/` 内绝无变异文件**），把第 1 处 `:298` 改回同步断言，得 **真实断言失败**（非超时）：

```
 FAIL  tests/M1_date.test.tsx > ResearchWorkspace A-share evidence cards > keeps historical selection after a failed date and resets after a successful workspace retry
AssertionError: expected '2026-08-20' to be '2026-09-12' // Object.is equality

Expected: "2026-09-12"
Received: "2026-08-20"

 ❯ tests/M1_date.test.tsx:298:100
```

证得两件事：①**断言并非恒真**（它能取到假值）；②**等待是承重的**（去掉等待，该用例即红）。且失败形态与 VS-24 期间记录的 `expected '2026-08-20' to be '2026-09-12'` **完全一致**，说明本卡确实修的就是那条竞态。
该次失败耗时 1869ms（**真实断言失败**），与「5s 用例超时」这类环境噪声在形态上可区分——这一点对本机当前的负载状况很重要（见第 6 节）。

### 2.1 独立佐证：只有第 1 处是真竞态（第 2、3 处为级联）

本验收者在**不知情**的情况下先观察到一个异常形态并记录在案：**只把第 1 处改回同步断言（M1），第 2、3 处的 `waitFor` 原封不动，却也跟着变红** —— 同一次运行中三条目标用例同时失败，报错分别为 `expected '2026-08-20' to be '2026-09-12'`（第 1 处）、`Unable to find role="button" and name /2026-08-27/`（第 2 处）、`Unable to find an element with the text: 龙虎榜：龙虎榜接口不可用`（第 3 处）。同理，4 变体同进程对照实验中也反复出现「一处变异、三处同红」。

编排者随后提交的 `6ee76f7` 给出了该形态的成因（**由实现者的硬判据得出，与验收者的观察独立吻合**）：第 1 处提前中断后，`mockResolvedValueOnce` 队列**残留**（`vi.clearAllMocks` 不清理 `once` 队列），使**后续用例的 mock 队列整体错位一格**，故第 2、3 处的红灯是**级联**而非各自独立的竞态。
据此对本次验收结论作**精确化**（**不改变 ACCEPT**）：
- **第 1 处**：真竞态，`waitFor` **承重**（第 2 节已证）；
- **第 2、3 处**：`waitFor` 属**无害加固**（期望值逐字未变、未削弱断言），本验收者的 M2/M3 变异副本在**无级联**时 **2/2 通过**，与「非真竞态」一致。二者仍满足本卡「改为确定性等待」的字面要求与「不得放宽断言」的红线。

## 3. 确定性验证（单跑 / 同跑 / 稳定性）

### 3.1 `ResearchWorkspaceEvidence` 单独跑

本机实测 **3/3 全绿，每次 14 passed**（`01:48:53` / `01:49:56` / `01:50:45`，日志 `$env:TEMP\vs26-gates\vitest-runs.txt`）：

```
 Test Files  1 passed (1)
      Tests  14 passed (14)
```

### 3.2 与 VS-24 的 `ResearchFollowupPrompt.test.tsx` 同跑

共跑 5 次：**4 次 24 passed 全绿**，**1 次红**（`COMBINED RUN 4`）。如实记录该次红灯的构成：

```
 × switches listing details locally, shows honest missing seats and restores the latest seats 5625ms
 × retains historical selection while the date loads and resets only on success, including shorter windows 5848ms
 × keeps historical selection after a failed date and resets after a successful workspace retry 6997ms
 × resets selection on a real symbol navigation when the same workspace component is reused 5497ms
 × keeps both cards visible with honest Empty fallbacks when fetchers fail 2082ms
 Error: Test timed out in 5000ms.  (×4)
 TestingLibraryElementError: Unable to find an element with the text: 龙虎榜：龙虎榜接口不可用.  (×1，waitFor 1s 预算耗尽)
```

**判为环境噪声而非本卡缺陷，依据有三**（且**未自行放宽任何断言或超时**）：
1. 5 条红灯中 **4 条是 `Test timed out in 5000ms`**（vitest 单用例超时），且**全部落在本卡未触碰的用例上**——卡内已明确预期这类噪声「原样重跑一次并如实记为环境噪声」；
2. 第 5 条是 `waitFor` 默认 1s 预算在**该次峰值负载**下耗尽（该用例总耗时 2082ms ≈ 前置 `findByText` 1s + `waitFor` 1s）；卡内**明令禁止**用「加长超时/`setTimeout` 硬等」来压住，故实现者不加超时是**遵卡**而非缺陷；
3. **同一窗口内的对照证据**：VS-24 的 `ResearchFollowupPrompt.test.tsx` **单独跑也红了 1/2**（首条用例 5057ms 超时），而该文件**本卡一行未动** ⇒ 红灯来源是这台机器当时的负载，不是 VS-26 的改动。

### 3.3 负载窗口的独立佐证

验收期间本机被**另一个 agent 的 vitest 长期占满**：实测 CPU 93%→100%，进程表中可见兄弟评估者正以 `vitest run --testTimeout=30000 tests/ChatDead…` 运行（`--testTimeout=30000` 即对方为同一负载问题所做的本地调整）。在 100% CPU 窗口内，**连完全未变异的交付版本（Base 副本）也会 5s 超时变红** —— 即该窗口下的红与「是否为 VS-26 变异」无关，不可用作判据。
在负载较低窗口采集的样本（3.1 的单跑 3/3、3.2 的 4 次 24 passed）与实现者自述的 7 次全绿相互独立地吻合。

## 4. 零生产代码改动

`git show --name-only --format='' fca8364` 全量文件清单**只有两个**：
```
docs/ai/evo/IMPLEMENT_RESULT_VS26.md
frontend/tests/ResearchWorkspaceEvidence.test.tsx
```
`frontend/src/` 命中数 = **0**。另：变异标记扫描（`TEMP-REPRO|TEMP_REPRO|MUTATED|XXX-TEMP|.only(|.skip(`）在被验 blob 上 **0 命中**；`git diff --check` exit 0（行尾/空白无异常，`i/lf w/lf`）。
> 说明：工作树内另有 VS-27 在制的 `backend/app/services/{llm_client,research_orch}.py`、`frontend/src/pages/Research.tsx` 及其测试 —— 均**未计入**本判定，且验收者**未触碰**。

## 5. 门禁：串行 `bun run build`

```
$ ../backend/.venv/Scripts/python.exe ../scripts/openapi_tsgen.py --check
OK: frontend/src/types/openapi.generated.ts is fresh (60 schemas)
$ tsc -b && vite build
vite v6.4.3 building for production...
✓ 4262 modules transformed.
...
✓ built in 45.22s
```
`error TS` / `ERROR` 命中数 = **0**，退出码 **0**（串行执行，在全部 vitest 之后）。

## 6. 遗留问题与如实提示（非本卡缺陷，不改变 ACCEPT）

1. **`waitFor` 用的是默认 1000ms 预算**：改后三处由「立即失败的竞态」变为「最多等 1s」。这在**正常负载**下足够（第 3 节），但在**极端负载**下仍可能耗尽预算而红。卡内禁止加长超时，故这不是可整改项，而是**本机环境的上界**；建议归档为环境事实而非测试缺陷。若日后要根治，正确方向是提高本机并发纪律或统一 `testTimeout`，**不是**再放宽这三处断言。
2. **`ResearchFollowupPrompt.test.tsx`（VS-24 文件）自身超时余量偏薄**：其首条用例正常耗时 1.5–4.6s，逼近 5s 默认上限，负载下必红。属 VS-24 文件的测试卫生问题，**建议另开测试卫生卡**（本卡范围外）。
3. **`IMPLEMENT_RESULT_VS26.md` 证据仍不完整**：编排者 `718936f` 已补入 §4.1/4.2/4.4/4.5，但 **§4.3（鉴别力证明）与 §5/§6 仍是「（待回填）」**——恰好是本卡要求最严的那一项。**该鉴别力证据由本验收文件第 2 节独立补齐**（原始红灯：`expected '2026-08-20' to be '2026-09-12'`）。建议编排者把该段回填进结果文件，保持档案自洽。
4. **实现者自述的「第 4 处排查」结论未被独立推翻**：其对 `:301 → :302`（依赖 `loadWorkspace` 先清空 `snapshot` 导致卡片卸载）等处的「非竞态」论证在本次全部改后运行中**未出现反例**，且其**已如实标注该安全性的前提会随生产实现变化而失效**。验收者未发现新的、会实际变红的同类竞态。
   另按 §2.1：`6ee76f7` 已另开卡把该文件 `beforeEach` 从 `vi.clearAllMocks` 改为 `vi.resetAllMocks`，以消除 `once` 队列残留导致的级联——这是**正确处理**，建议该卡把「第 2、3 处 `waitFor` 是否保留」一并判掉（保留亦可，属无害加固）。

## 7. 证据索引（本验收者产物）

- `$env:TEMP\vs26-gates\vitest-runs.txt`：单跑 ×3 + 同跑 ×3 的原始输出
- `$env:TEMP\vs26-gates\retry-combined.txt`：`RF` 单跑 ×2 + 同跑 ×2（负载噪声刻画）
- `$env:TEMP\vs26-gates\mutants.txt`：Base/M1/M2/M3 变异副本原始输出（含第 2 节红灯原文）
- `$env:TEMP\vs26-gates\interleaved.txt`：4 变体同进程对照实验（**证明峰值负载下连未变异版本也红**，即噪声上界）
- `$env:TEMP\vs26-gates\build.txt`：`bun run build` 原始输出，exit 0
- 变异沙箱 `$env:TEMP\vs26-mutant\`（`src`/`node_modules` 为 junction）——验收后已送回收站（先回收 junction 再回收目录，避免误伤真实 `src`/`node_modules`）
