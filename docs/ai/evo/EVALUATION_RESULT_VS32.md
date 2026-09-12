# EVALUATION_RESULT — VS-32：切房间时一并作用域"错误原文"（F1）

> 独立验收（EVALUATOR）。被验对象：`HEAD = 27233a472190fc2db2a80d1a5a8538088bd4cb08`（VS-32）。
> 任务卡 `docs/ai/evo/IMPLEMENTATION_BRIEF_VS32.md`；实现者自述 `docs/ai/evo/IMPLEMENT_RESULT_VS32.md`（**仅作待验断言**）。
> 验收方法：**全部自建夹具/探针**（未复用实现者用例的实体与断言），在 `$env:TEMP` 副本 + junction 指回真实 `node_modules` 中运行；**真实工作树零改动、未 commit**。

## 0. 判定

**ACCEPT。**

F1（详情错误态未按房间作用域）**真的修好了**，且**没有修成"错误永不显示"**；VS-29 三态契约零回归。
实现者自述的第 1、2、3、4 条**全部独立复现为真**；第 4 条（M2 边界）**成立但有边界收窄**（见 §5.3，属观察项，不影响判定）。

真实工作树复核（提交后核对）：

```
frontend/src/pages/Discussion.tsx         = 2C1D4EFF6095FE4B1346183ECC5107C8E6ED4A602460B1740921AFB30E6E4A30   ← 与实现者自报一致
frontend/tests/ReadStateThreeWay.test.tsx = B8C1F4323442A052CC756AF0ECE5D0C11C627CB3D15B28D8275AB1489DAB2FA9   ← 与实现者自报一致
git status --porcelain                    = （空）
```

## 1. 逐条结论

| # | 待验项 | 结论 | 证据 |
|---|---|---|---|
| 1 | F1 是否真修好（42 失败 → 切 43 在途 ⇒ 右栏无 42 的错误原文、也无 42 的内容） | **成立** | §3 E1（自建 71/72 实体）交付态绿；M1 变异体下红且 DOM 正是原缺陷形态 |
| 2 | 反向例：43 自己失败 ⇒ 显示 43 自己的错误；42 失败不切房间 ⇒ 42 的错误仍显示 | **成立** | §3 E2/E3；M3（去掉错误置位）下 E2/E3 全红 |
| 3 | M2 边界（"清过头"由既有断言而非新用例拦住） | **成立（请求发起时清）；但边界需收窄** | §5.2 M2：新 3 条 + 我的 5 条全绿、既有断言红；§5.3 M2b：**换一种清法全套 26 条无人拦** |
| 4 | VS-29 零回归（三文件全绿、三态契约/优先级/不串台/仅成功才清失败态） | **成立** | §6：`ReadStateThreeWay` 22/22、`Discussion` 10/10、`DiscussionRolesUnavailable` 6/6 = **38 passed** |
| 5 | 改动范围仅 2 源文件 + 结果文件；其它文件/i18n 零改动 | **成立** | §7 `git diff --name-only HEAD~1 HEAD` 恰 3 个路径 |
| 6 | 同族"状态未按实体作用域"排查 | 本卡已修面之外**未见同类漏网**；发现 2 处**相邻**形态 | §8 |
| 7 | 门禁：相关 vitest + 串行 `bun run build` | **通过** | §9 build exit 0（1m18s）；仓库构建后仍干净 |
| 8 | 无残留变异标记 / 未提交 | **成立** | §7 `TEMP-REPRO\|MUTATED\|XXX-TEMP` 在 HEAD 两文件中 0 命中 |

## 2. 事实基线（先核，避免"比的是同一份东西"）

- `git diff --numstat HEAD~1 HEAD` = `24/3` `frontend/src/pages/Discussion.tsx`、`84/2` `frontend/tests/ReadStateThreeWay.test.tsx`、`331/0` 结果文件 —— 与实现者自述**逐字一致**。
- 测试文件的 **2 行删除**经逐行核对为：①文件头注释 ⑤ 一行（被重排为 2 行）；②`import { fireEvent, ... }` → 加入 `act`。**无任何既有断言被删改**（`git diff` 全量通读，新增块整体位于 `@@ -344,6 +345,87 @@` 之后）。
- HEAD 内容 == 工作区内容（`git status` 空 + 哈希一致）。

## 3. F1 正例 / 反向例（自建探针，非复用实现者用例）

自建文件 `$env:TEMP\vs32-eval\tests\EVAL_VS32_PROBE.test.tsx`（**未写入仓库**），实体为**房间 71/72**、错误原文为 **`EVAL-ERR seven/eight detail boom`**，与实现者的 42/43 完全不同源。

交付态（真实修复）实测，**5/5 绿**（`A3-probe5.txt`）：

```
 ✓ tests/EVAL_VS32_PROBE.test.tsx (5 tests) 3436ms
     ✓ E1 positive: 71 fails -> switch to 72 (in flight) => no 71 error text, no 71 content, loading state
     ✓ E2 reverse: 72 itself fails => must show 72 own error text
     ✓ E5 residue check: back to the SAME failed room while re-reading => only ITS OWN error, never the other room
     ✓ E4 extra: 72 fails -> switch back to 71 (success) => 72 error text must not linger
   Test Files  1 passed (1)
        Tests  5 passed (5)
```

- **E1（卡面第 1 条）**：先断言 71 的错误**确实显示过**（前提，否则不能证明"串台被消除"），再切 72（请求挂起）⇒ 断言右栏 `EVAL-ERR seven` 为 null、`EVAL-ERR eight` 为 null、`讨论详情读取失败` 为 null、`.fq-load-state--error` 不存在、`data-testid=committee` 为 null，**且** `.fq-load-state--loading` 与 `正在加载讨论详情…` 必须在（否则"什么都不显示"也能过）。
- **E2（卡面第 2 条，反向例）**：71 失败 → 切 72、**72 自己失败** ⇒ 右栏**必须**出现 `EVAL-ERR eight` + `讨论详情读取失败` + 重试按钮，且 `EVAL-ERR seven` 为 null。
- **E3（卡面第 3 条）**：71 失败后**不切房间**，并人为触发一次无关重渲染（`setRooms([...rooms])`）⇒ 71 的错误原文仍在原位。
- **E4（额外一维）**：72 失败 → 切回 71（成功）⇒ 72 的错误原文不得残留，71 的内容（committee）出现。
- **E5（同类残留自查）**：71 失败 → 切 72（在途）→ 切回 71（重新读取、挂起）⇒ 只显示 **71 自己** 的错误，绝不出现 72 的任何东西（与"重试在途保持失败态"同口径；这是设计使然，见 §10.1）。

## 4. 实现机制核对（读码，非断言采信）

`frontend/src/pages/Discussion.tsx`：

- `:56` 新增 `detailErrorId`；`:194`（成功但无房间对象）、`:206`（`catch`）打 `roomId`；`:199`（成功）、`:218`（`!currentRoomId`）置 `null`。
- `:349` `const scopedDetailFailed = detailFailed && detailErrorId === currentRoomId;` ⇒ `:351` 交给 `readStateOf` 的 `failed`。
- **确无"切房间时清错误"**：`loadRoomDetail` 内没有任何 `setDetailFailed(false)`（唯一的 `setDetailFailed(false)` 在成功路径与取消选择分支）。这与实现者自述的"设计选择"一致，也正是 M2 变异体（§5.2）被区分开的根据。

## 5. 鉴别力：4 个变异体（全部在 `$env:TEMP` 副本，真实工作树哈希恒定）

副本内 `src/pages/Discussion.tsx` 的 SHA256（交付态 = `2C1D4EFF…`）：

| 变异体 | 内容 | 哈希 | 结果 |
|---|---|---|---|
| **M1** 退回修复 | `failed: scopedDetailFailed` → `failed: detailFailed` | `7BD73F2F2765B8E46E4B20C3572E17ABC092B5E3E0183AC7338CB088B0FB33A3` | 红（见 §5.1） |
| **M2** 清过头（发起时清） | 交付态 + `loadRoomDetail` 开头 `setDetailFailed(false); setDetailError('')` | `39BF591E9BA3DC84D09B89736EEAEC5B678F3A3ED7114736A7522466A66667B0` | 红，但**只有既有断言红**（见 §5.2） |
| **M2b** 清过头（切房间时清） | **去掉作用域** + 在 `currentRoomId` 变化的 effect 里清 | `E6BE1F9805CFBA379889085F75D518F232805CCF5F9220DAFCE5343DE5B305B1` | **全绿（26/26）**（见 §5.3） |
| **M3** 错误永不显示 | `catch` 内删除 `setDetailFailed(true);` | `4E4D8991BDC62C02648141175FE62A5CD2A824F79E1E301487226FE28101C5A2` | 全红（见 §5.4） |

> 旁证：我的 M1 哈希 `7BD73F2F…` 与实现者自报的 M1 变异哈希**逐字节相同** ⇒ 两个独立构造的"退回修复"是同一个东西，可交叉复核。

### 5.1 M1（退回修复）—— 精确打在 F1 这一维

```
 ❯ tests/ReadStateThreeWay.test.tsx (22 tests | 1 failed) 9363ms
     × 42 失败后切 43（在途）⇒ 右栏不得再显示 42 的错误原文，也不得显示 42 的内容 1200ms
     ✓ 43 自己失败 ⇒ 必须显示 43 自己的错误原文（反向断言…）
     ✓ 42 失败且不切房间 ⇒ 42 的错误原文仍在原位…
     ✓ 详情在途 ⇒ 加载态（…失败后重试在途仍保持失败态）      ← 既有 VS-29 断言保持绿
 ❯ tests/EVAL_VS32_PROBE.test.tsx (4 tests | 1 failed) 3474ms
     × E1 positive: 71 fails -> switch to 72 (in flight) => no 71 error text, no 71 content, loading state
     ✓ E2 reverse: 72 itself fails => must show 72 own error text
     ✓ E3 no switch: 71 error stays in place after unrelated rerender
     ✓ E4 extra: 72 fails -> switch back to 71 (success) => 72 error text must not linger
      Tests  2 failed | 24 passed (26)
```

失败 DOM 里正是评估者当时实测的形态（**自建夹具，独立复现**）：

```
AssertionError: expected <div class="ant-alert-description"></div> to be null
...
            class="fq-load-state fq-load-state--error"
  EVAL-ERR seven detail boom
```

⇒ 切换到 72 之后，右栏仍是 `fq-load-state--error`，`ant-alert-description` 里是 **71 的错误原文**（`loading=false error=true staleErrorText=true`）。
**M1 只让"第 1 条"这一类断言变红**（正例），反向例/不动房间/既有断言**全绿** ⇒ 第 1 条不是"随便改都会红"。

### 5.2 M2（"发起请求时清掉错误"）—— 实现者自述边界**独立复现为真**

```
 ❯ tests/ReadStateThreeWay.test.tsx (22 tests | 1 failed)
     × 详情在途 ⇒ 加载态（不是上一条内容、也不是空），失败后重试在途仍保持失败态 306ms   ← 既有断言
     ✓ 42 失败后切 43（在途）⇒ 右栏不得再显示 42 的错误原文，也不得显示 42 的内容
     ✓ 43 自己失败 ⇒ 必须显示 43 自己的错误原文（反向断言…）
     ✓ 42 失败且不切房间 ⇒ 42 的错误原文仍在原位…
 ✓ tests/EVAL_VS32_PROBE.test.tsx (4 tests)     ← 我的 4 条也全绿
      Tests  1 failed | 25 passed (26)
```

既有断言失败原文：

```
 FAIL tests/ReadStateThreeWay.test.tsx > VS29 Discussion 详情：切房间失败不串台 > 详情在途 ⇒ 加载态（…失败后重试在途仍保持失败态）
 TestingLibraryElementError: Unable to find an element with the text: 讨论详情读取失败.
 <main class="ant-layout-content …">
   <div aria-live="polite" class="fq-load-state fq-load-state--loading" role="status" …>
```

⇒ **结论（独立得出，与实现者一致）**：本卡新增的三条断言**拦不住**"发起请求时清掉错误"；拦住它的**只有** VS-29 的既有断言。
**行号校正**：实现者写 `ReadStateThreeWay.test.tsx:321`，实际 `it(` 在 **:322**、承重断言在 **:342**（`:321` 是上一条用例的收尾 `}, 20000);`）。语义无歧义，仅行号偏 1，建议后续引用写 `:322-343`。

### 5.3 ⚠️ M2b（"切房间时清掉错误"）—— **边界收窄：这一种清法无人能拦**

在副本里构造了第二种"清过头"：**去掉作用域**（`failed: detailFailed`）+ 在 `currentRoomId` 变化的 effect 里 `setDetailFailed(false); setDetailError('');`。

```
 ✓ tests/ReadStateThreeWay.test.tsx (22 tests) 7021ms
 ✓ tests/EVAL_VS32_PROBE.test.tsx (4 tests) 2428ms
 Test Files  2 passed (2)
      Tests  26 passed (26)          [exit 0]
```

⇒ 该"错误修法"在**本卡 3 条新断言 + 我自建 4 条 + VS-29 全部既有断言**下**全绿**。
它并非不可区分的等价实现：`useEffect` 在提交/绘制之后才运行，切房间那一帧 `currentRoomId` 已是新房间而 `detailFailed` 仍为真 ⇒ **会有一帧右栏渲染上一个房间的错误原文**（正是本卡要消灭的"短暂显示"形态）。
**这一条是代码时序判断，我没有实测到那一帧**（RTL 的 `fireEvent` 会包 `act` 并冲刷 effect，用现有工具观察不到中间帧），因此只作**观察项**记录，不据此判 REJECT。

**对"既有断言能否放宽"的独立结论**：
- 若把"清掉旧错误"实现为**发起请求时清** ⇒ 既有 `:342` 会红 ⇒ **既有断言绝不能放宽**（实现者的边界主张成立）。
- 若实现为**切房间时清** ⇒ 新用例与既有断言**都拦不住** ⇒ 现有测试**并不证明"只有结构性作用域这一种修法能过"**。
- 收到"新 3 条用例全绿"时**不能反推"修法正确"**；正确的判据是 `detailErrorId` 这一结构本身（§4）。

### 5.4 M3（去掉 `setDetailFailed(true)`）—— 反向断言确实在守"错误不得永不显示"

```
 ❯ tests/ReadStateThreeWay.test.tsx (22 tests | 5 failed)
     × 切房间失败 ⇒ 右栏显示失败态 + 重试，绝不显示上一条内容
     × 详情在途 ⇒ 加载态（…失败后重试在途仍保持失败态）
     × 42 失败后切 43（在途）⇒ …
     × 43 自己失败 ⇒ 必须显示 43 自己的错误原文（反向断言…）
     × 42 失败且不切房间 ⇒ 42 的错误原文仍在原位…
 ❯ tests/EVAL_VS32_PROBE.test.tsx (4 tests | 4 failed)
     × E1 / × E2 / × E3 / × E4
      Tests  9 failed | 17 passed (26)
```

⇒ 反向例（E2 / 卡面第 2 条）在 M3 下变红、在交付态下绿 ⇒ 它**确实**在守"错误不得永不显示"。

## 6. VS-29 零回归（独立复跑，副本内）

| 文件 | 交付态结果 |
|---|---|
| `tests/ReadStateThreeWay.test.tsx` | **22 passed (22)**（单文件运行，`A2-delivered-rst.txt`，exit 0） |
| `tests/Discussion.test.tsx` | **10 passed (10)** |
| `tests/DiscussionRolesUnavailable.test.tsx` | **6 passed (6)** |
| 合计 | **38 passed**（与实现者自述数字一致） |

含：`readStateOf` 四级优先级、`LoadStateView` 四分支互斥、Dashboard 三态、左栏在途、`切房间失败不串台`、`详情在途 … 失败后重试在途仍保持失败态`、`仅成功才清失败态`（列表/记忆两处）、`恢复成功`。

## 7. 范围与"只含这 2 个源文件"

```
$ git diff --name-only HEAD~1 HEAD
docs/ai/evo/IMPLEMENT_RESULT_VS32.md
frontend/src/pages/Discussion.tsx
frontend/tests/ReadStateThreeWay.test.tsx
```

- `LoadFailureAlert.tsx`、`Discussion.test.tsx`、`DiscussionRolesUnavailable.test.tsx`、**i18n 全部零改动**（不在上述名单内 ⇒ 该提交未触碰）。
- HEAD 两文件中 `TEMP-REPRO|TEMP_REPRO|MUTATED|XXX-TEMP` **0 命中**；本判定全程**未触碰真实工作树**（`git status` 始终为空），无变异窗口。

## 8. 同族排查（判断项，不修）

grep 面：`const [*Failed|*Error*, set*] = useState`（44 命中）+ `scoped[A-Z]` + `Failed` 逐文件核对。

- **未见第二个"错误原文按旧实体显示"的实例**。`Portfolio.tsx:67` 的 `loadErrors` 是 `Partial<Record<PortfolioLoadArea, string>>`（**已按 key 作用域**）；`MemoryManager.tsx:32` 的 `loadFailed` 只在挂载时读一次、无实体切换；`Dashboard.tsx` 各 `*Error` 是全局单次读取。
- **观察项 O1（相邻形态，非同一缺陷）**：`pages/Discover.tsx:49/61/72` 的 `nameSearchFailed` 与 `components/alpha/AlphaResearchPanel.tsx:25/65/70` 的 `searchError` —— 错误态**未按"当前查询词"作用域**，只是靠**发起请求时清**（`setNameSearchFailed(false)` / `setSearchError(null)`）掩盖。这正是 VS-29 口径（"仅成功才清失败态"）未覆盖的同族面，实现者的"未系统排查"自述**属实**；因是"发起时清"，其可观察残留窗口与 F1 不同，**不在本卡范围**。
- **观察项 O2（镜像缺陷）**：`pages/Chat.tsx:176-179` 的 `/chat/sessions/{id}/messages` 用 `.catch(() => {})` **静默吞掉**详情读取失败 —— 与 F1 相反方向（不是"显示旧实体的错误"，而是"失败被吞、无任何错误态"），与项目铁律"绝不把失败渲染成成功"相冲突。消息本身按 `sessionId` 存储，无内容串台。**仅记录，建议另开卡**。

## 9. 门禁

- vitest：见 §3/§5/§6（全部串行、单副本运行）。
- **串行** `bun run build`（在真实仓库，未与任何本卡 vitest 并发；`dist/`、`*.tsbuildinfo` 已 `.gitignore`）：

```
$ ../backend/.venv/Scripts/python.exe ../scripts/openapi_tsgen.py --check
OK: … openapi.generated.ts is fresh (60 schemas)
$ tsc -b && vite build
✓ 4262 modules transformed.
✓ built in 1m 18s
BUILD_EXIT=0
```

构建后 `git status --porcelain` 仍为空（未污染仓库）。

## 10. 观察项（不影响判定）

1. **O3 设计后果（非缺陷）**：从失败房间切走后**再切回该房间**、且该房间的重新读取仍在途时，右栏会**再次显示该房间自己的错误原文**（E5 实测绿，行为符合"错误属于该房间"与"重试在途保持失败态"的口径）。它不构成串台（显示的永远是当前房间自己的东西），但若产品希望"重新读取期间显示加载态"，那需要另立判据——**不是本卡缺陷**。
2. **O4 双状态**：`roomDetailId` 与 `detailErrorId` 是两个独立 state（实现者 §5.2 已自述）。读码未见其参与彼此运算，与三态派生无冲突；但"同一次 render 内一个已更新另一个未更新"的中间态在理论上存在，合并为判别联合会更彻底。**本卡刻意不重构，风险预算内合理。**
3. **O5 行号**：§5.2 的 `:321` → 实为 `:322-343`（承重断言 `:342`）。
4. **O6（来自 §5.3）**：现有测试无法区分"结构性作用域"与"切房间时清一下"；若后续要防止该修法回流，需要能观察**中间帧**的断言（如 `useLayoutEffect`/同步 DOM 快照），或在代码评审中把 `detailErrorId` 的结构当作判据。

## 11. 噪声与边界（如实记录，不用于归因）

- 本窗口机器上有他卡/他项目并发（vitest/tsc），vitest `import` 阶段实测 **146.60s / 130s / 111s** 量级。
- 首次 4 文件同跑时 **`ReadStateThreeWay.test.tsx` 未能启动 worker**：

```
Error: [vitest-pool]: Failed to start forks worker for test files …/ReadStateThreeWay.test.tsx.
Caused by: Error: [vitest-pool-runner]: Timeout waiting for worker to respond
```

  该失败为**环境资源不足**（该文件单独重跑 22/22 全绿，§6），**未据此判 REJECT，也未放宽任何断言或超时**。
- 所有变异体运行在 `$env:TEMP\vs32-*` 副本（`node_modules` 用 junction 指回真实目录）；真实 `node_modules` 未被写入，真实工作树两文件哈希全程恒为交付态值（§0、§5 表）。
- 未清理任何非本卡进程；检查过 `node.exe/bun.exe` 命令行，**无本卡遗留 vitest**。

## 12. 判定与建议

**ACCEPT** —— 修复真实有效、方向正确、范围最小、零回归、有鉴别力证据。

随档必须带走的两条边界：

1. **既有断言一条都不能放宽**：`ReadStateThreeWay.test.tsx:342`（"详情在途 … 失败后重试在途仍保持失败态"）是"发起请求时清掉错误"这类过度修复的**唯一**拦截者（§5.2 实测）。
2. **"新 3 条全绿" ≠ "修法正确"**：把"清一下"放在**切房间**处时，新用例与既有断言**全部拦不住**（§5.3 实测，26/26 绿）。判定修复正确要看 `detailErrorId` 的结构（§4），不能只看三条断言。

建议（均不阻塞本卡）：把 O2（`Chat.tsx:176` 静默吞失败）与 O1（Discover/AlphaResearchPanel 的"发起时清"）另开卡；引用 `:321` 更正为 `:322-343`。
