# IMPLEMENT_RESULT — VS-32：切房间时一并作用域"错误原文"（F1）

> 状态：**已交付**（未 commit）。基线 HEAD `7d6d12b2c587301b7bd4be436246c2276d696d15`（开工时工作树干净）。
> 交付文件内容哈希（SHA256，内容哈希不随提交/分支变化，可长期复核）：
> - `frontend/src/pages/Discussion.tsx` = `2C1D4EFF6095FE4B1346183ECC5107C8E6ED4A602460B1740921AFB30E6E4A30`
> - `frontend/tests/ReadStateThreeWay.test.tsx` = `B8C1F4323442A052CC756AF0ECE5D0C11C627CB3D15B28D8275AB1489DAB2FA9`
>
> （开工时基线：`Discussion.tsx` = `59C7D671…8836D`，`ReadStateThreeWay.test.tsx` = `3ED80002…01E11`。）

## 0. 一句话

`Discussion.tsx` 的详情错误态（`detailFailed` / `detailError`）此前**不按房间作用域**——
切房间后新房间在途期间，右栏渲染的仍是**上一个房间**的错误原文。
修法与同文件的 `scopedDetail`(:329 → 现 :344) **同构**：给错误态补上"它属于哪个房间"（`detailErrorId`），
右栏只认"属于当前房间"的错误。**不是**在切房间时"清一下错误"——那样会连**当前房间自己**的错误一起清掉。

**变异窗口声明**：本卡**从未在真实工作树里植入过缺陷**。鉴别力证明用的是 `$env:TEMP\vs32-mut\`
下的 frontend 副本（`node_modules` 用 junction 指回真实目录），副本内单独把修复退回。
真实工作树自始至终是交付态（可从上面的内容哈希复核）。

## 1. 改动（文件:行）

### 1.1 `frontend/src/pages/Discussion.tsx`（唯一生产代码改动，`+24/-3`）

| 行 | 内容 |
|---|---|
| `:51-56` | 新增 `const [detailErrorId, setDetailErrorId] = useState<number | null>(null);` —— 错误态**属于哪个房间**（与 `roomDetailId` 同构） |
| `:194` | 成功但响应里没有房间对象（仍算读取失败）：补 `setDetailErrorId(roomId)` |
| `:199` | 成功路径：补 `setDetailErrorId(null)` |
| `:206` | `catch` 路径：补 `setDetailErrorId(roomId)`（**这条是本次修复的承重点**：错误原文被打上"它是哪个房间的"） |
| `:218` | `!currentRoomId`（取消选择）分支：补 `setDetailErrorId(null)` |
| `:345-354` | 新增派生 `const scopedDetailFailed = detailFailed && detailErrorId === currentRoomId;`（:349），并把它交给 `readStateOf({ failed: scopedDetailFailed, … })`（:350-354） |
| `:178-183`、`:172` | 注释补第四件与"别修反"的说明（`三件事一次做对` → `三件事一次做对（VS32 补第四件）`） |

**为什么用"作用域"而不是"切房间时清一下"**：清一下必须在某个 effect 里按 `currentRoomId` 变化去清，
它无法区分"上一个房间的错误"与"当前房间的错误"，于是会同时抹掉下面两条正确行为——
(a) 当前房间失败后的**重试期间**错误态必须保持（VS29 既有断言 `ReadStateThreeWay.test.tsx:321` 守着它）；
(b) 新房间**自己**失败时必须显示新房间的错误。作用域是在**渲染派生处**判定，
不引入时序竞争（不需要"先渲染一帧旧错误再被 effect 清掉"），与 `scopedDetail` 的形态完全一致。

### 1.2 `frontend/tests/ReadStateThreeWay.test.tsx`（`+84/-2`）

- `:14` 引入 `act`（第三条断言要用）。
- `:11-12` 文件头注释同步（⑤ 补 VS32 说明）。
- `:348-427` 新增 `describe('VS32 Discussion 详情：错误原文按房间作用域')`，三条用例：
  - `:379` 正例：42 失败 → 切 43（在途）⇒ 无 42 的错误原文、无 42 的内容；
  - `:398` **反向例**：43 自己失败 ⇒ 必须显示 **43 自己的**错误原文；
  - `:413` 不动房间：42 失败且不切房间（含一次与详情无关的重渲染）⇒ 42 的错误原文仍在。

**既有断言一字未放宽**：`git diff --numstat` 显示该文件 `+84/-2`，那 2 行删除是
文件头注释中的 1 行（重排换行）与 1 行 import 语句，**无任何既有断言被删改**。

### 1.3 未触碰

`LoadFailureAlert.tsx`（VS-29 的三态契约与 `readStateOf` 优先级）**零改动**；
`Discussion.test.tsx`、`DiscussionRolesUnavailable.test.tsx` **零改动**（只作为回归门禁运行）；
`Discussion.tsx` 的角色闸门（VS-25）与 SSE 截断（VS-27/28）路径**未触碰**；无新增依赖。

## 2. 三条断言实测（交付态，真实工作树）

命令（串行、单文件）：

```
cd E:\Code_file\Projects\finquant-hub\frontend
bun run test tests/ReadStateThreeWay.test.tsx -t "VS32"
```

原始输出（本窗口负载很高，见 §3.0）：

```
$ vitest run tests/ReadStateThreeWay.test.tsx -t "VS32"

 RUN  v4.1.10 E:/Code_file/Projects/finquant-hub/frontend

stderr | tests/ReadStateThreeWay.test.tsx > VS32 Discussion 详情：错误原文按房间作用域 > 42 失败后切 43（在途）⇒ 右栏不得再显示 42 的错误原文，也不得显示 42 的内容
⚠️ React Router Future Flag Warning: ...（略）

 ✓ tests/ReadStateThreeWay.test.tsx (22 tests | 19 skipped) 3666ms
     ✓ 42 失败后切 43（在途）⇒ 右栏不得再显示 42 的错误原文，也不得显示 42 的内容  2174ms
     ✓ 43 自己失败 ⇒ 必须显示 43 自己的错误原文（反向断言：不得修成"错误永不显示"）  1082ms
     ✓ 42 失败且不切房间 ⇒ 42 的错误原文仍在原位（"清掉旧错误"不得做成"清掉一切错误"）  405ms

 Test Files  1 passed (1)
      Tests  3 passed | 19 skipped (22)
```

三条分别对应卡内要求的**正例 / 反向例 / 不动房间**。

> 关于"卡面写死的三条"的补充说明：卡面第 1 条要求"不显示 42 的错误原文**也不显示 42 的内容**"。
> 用例里这两件事都断言了（`queryByText('room 42 unavailable')` 与 `queryByText('上一条讨论')`、
> `queryByTestId('committee')` 均为 null），并额外断言此时**必须是"加载中"这一态**
> （`getByText('正在加载讨论详情…')`）——否则"什么都不显示"也能让前两条全绿。

## 3. 门禁

### 3.0 窗口与负载（如实记录，不代替归因）

- 本卡门禁运行窗口内，机器上**有其它卡/其它项目在并发跑**（`Get-CimInstance` 实测见到
  `Composable_Agent_Harness` 的 vitest（tinypool 7 个 worker）、`model-infra-kit` 的 tsc/pnpm、
  以及多个 `mik` 常驻服务）。
- 表现为 vitest 的 `import` 阶段异常昂贵（`import 181.25s / 111.11s`，而 `tests` 阶段仅 3.67s / 37.22s）。
- **所有红灯/超时**：本卡三次门禁**全部 exit 0**，无一条超时、无一条红。因此本节不存在需要归因的噪声。
  我不能证明"若出现超时与本卡无关"，因为本窗口内没有出现超时。

### 3.1 相关 vitest（3 个文件，含两个"既有文件全绿"的回归面）

```
cd E:\Code_file\Projects\finquant-hub\frontend
bun run test tests/ReadStateThreeWay.test.tsx tests/Discussion.test.tsx tests/DiscussionRolesUnavailable.test.tsx
```

原始输出的关键部分（完整输出已在本会话内核对；`Select-Object -Last` 截取）：

```
 ✓ tests/DiscussionRolesUnavailable.test.tsx (6 tests) 13405ms
     ✓ surfaces the failure in place with its real cause and a retry, instead of only "至少选择 3 个角色"  6909ms
     ✓ surfaces every failure shape the same way (401 / 500 / timeout), not just one of them  1504ms
     ✓ really refetches the role list from retry (1→2→3), then clears the error state and makes roles selectable again  1165ms
     ✓ says plainly how many roles exist when the read succeeds with fewer than 3 (no unreachable prompt)  993ms
     ✓ treats a successful but empty role list as "no roles available" instead of crashing  1560ms
     ✓ keeps the success path unchanged: no failure state, roles selectable, room created  1266ms
 ✓ tests/Discussion.test.tsx (10 tests) 8580ms
     ✓ shows a loading state when a room is selected before its detail arrives  3368ms
     ✓ renders structured review output without the chat-style timeline  492ms
     ✓ gives every creation control an explicit accessible name  2020ms
     ✓ opens the room named by ?room=<id> and loads its detail  324ms
     ✓ does not snap back to the deep-linked room after the user picks another one  521ms
     ✓ still pre-fills the creation dialog from ?topic=  713ms
     ✓ warns exactly once for a room missing from the list, even after the list changes again  347ms
     ✓ never warns about a deep link that resolves to an existing room  343ms
 ✓ tests/ReadStateThreeWay.test.tsx (22 tests) 15232ms
     ✓ loading / empty / error / ready 四态各自只渲染自己那一支  4324ms
     ✓ loading：在途期间不出现"暂无会话/暂无讨论"，研究运行区块也不出现 UNKNOWN  2630ms
     ✓ empty：请求成功且为空 ⇒ 才出现"暂无…"与 UNKNOWN，且不出现任何加载/失败态  1114ms
     ✓ error：失败 ⇒ 无空态文案、无 UNKNOWN、无加载文案（三态一个都不含糊）  706ms
     ✓ 口径：重试在途**不清失败态**（不闪回空态、也不退回加载态）  1722ms
     ✓ 切房间失败 ⇒ 右栏显示失败态 + 重试，绝不显示上一条内容  571ms
     ✓ 详情在途 ⇒ 加载态（不是上一条内容、也不是空），失败后重试在途仍保持失败态  322ms
     ✓ 43 自己失败 ⇒ 必须显示 43 自己的错误原文（反向断言：不得修成"错误永不显示"）  482ms
     ✓ 42 失败且不切房间 ⇒ 42 的错误原文仍在原位（"清掉旧错误"不得做成"清掉一切错误"）  391ms
     ✓ 口径：读取失败后重试在途 ⇒ 失败态保持（不闪回"暂无"、也不退回加载态）  592ms
     ✓ 恢复成功 ⇒ 失败态消失、内容出现（失败后重试成功这条路径）  780ms

 Test Files  3 passed (3)
      Tests  38 passed (38)
   Duration  167.61s (transform 3.66s, setup 2.83s, import 111.11s, tests 37.22s, environment 14.05s)
```

`[status: completed, exit code: 0]`。

**VS-29 零回归的读法**：`ReadStateThreeWay.test.tsx` 里 VS-29 的三态断言
（`readStateOf` 优先级 4 条、`LoadStateView` 四分支、Dashboard 三态、左栏在途、`切房间失败不串台`、
`详情在途 … 失败后重试在途仍保持失败态`、`仅成功才清失败态`）**全部在同一文件、同一次运行里通过**，
尤其 `详情在途 … 失败后重试在途仍保持失败态` 正是"清过头"最可能在 VS-29 侧踩坏的那条。

### 3.2 串行 `bun run build`

在**没有任何本卡 vitest 在跑**之后才启动（`Get-CimInstance` 确认无我自己的 node/bun 残留进程），
且工作树内除本卡两个文件外无其它在制改动（`git status --porcelain` 只有本卡 2 个 M + 结果文件 1 个 ??）。
输出（完整 52 行，此处取头尾）：

```
$ ../backend/.venv/Scripts/python.exe ../scripts/openapi_tsgen.py --check
OK: E:\Code_file\Projects\finquant-hub\frontend\src\types\openapi.generated.ts is fresh (60 schemas)
$ tsc -b && vite build
vite v6.4.3 building for production...
transforming...
✓ 4262 modules transformed.
rendering chunks...
...
(!) Some chunks are larger than 500 kB after minification. ...
✓ built in 2m 3s
```

`exit=0`（`tsc -b` 无输出 ⇒ 无类型错误；chunk 体积警告为既有警告，与本卡无关）。

## 4. 鉴别力证明（TEMP 副本把修复退回 ⇒ 第 1 条变红）

**做法**（副本，不在仓库目录里，也不在任何 `frontend/tests|src` 下）：

1. `robocopy frontend $env:TEMP\vs32-mut /E /XD node_modules dist .vite`；
2. `New-Item -ItemType Junction $env:TEMP\vs32-mut\node_modules -> frontend\node_modules`（避免复制依赖）；
3. 在副本里把修复退回**一行**：`failed: scopedDetailFailed,` → `failed: detailFailed,`
   （即"错误态不再按房间作用域"，回到修前语义）；
4. 只跑本卡的 VS32 三条用例。

**哈希核对（复原/隔离证据）**：

```
real  src\pages\Discussion.tsx        = 2C1D4EFF6095FE4B1346183ECC5107C8E6ED4A602460B1740921AFB30E6E4A30  ← 交付态
copy  src\pages\Discussion.tsx (变异前) = 2C1D4EFF6095FE4B1346183ECC5107C8E6ED4A602460B1740921AFB30E6E4A30  ← 与交付态逐字节相同
copy  src\pages\Discussion.tsx (变异后) = 7BD73F2F2765B8E46E4B20C3572E17ABC092B5E3E0183AC7338CB088B0FB33A3
real L351: failed: scopedDetailFailed,
copy L351: failed: detailFailed,
```

⇒ 缺陷只存在于副本；真实工作树哈希全程为交付态的那一个值。

**变异后原始输出**（`$env:TEMP\vs32-mut`，`bun run test tests/ReadStateThreeWay.test.tsx -t "VS32"`）：

```
 RUN  v4.1.10 C:/Users/Satanchen/AppData/Local/Temp/vs32-mut

 ❯ tests/ReadStateThreeWay.test.tsx (22 tests | 1 failed | 19 skipped) 3289ms
     ↓ ...（19 条 skipped）
     ↓ 切房间失败 ⇒ 右栏显示失败态 + 重试，绝不显示上一条内容
     ↓ 详情在途 ⇒ 加载态（不是上一条内容、也不是空），失败后重试在途仍保持失败态
     × 42 失败后切 43（在途）⇒ 右栏不得再显示 42 的错误原文，也不得显示 42 的内容 2550ms
     ✓ 43 自己失败 ⇒ 必须显示 43 自己的错误原文（反向断言：不得修成"错误永不显示"）  527ms

...（失败用例的 DOM dump，其中右栏为：）
        <main class="ant-layout-content ...">
          <div class="fq-load-state fq-load-state--error" style="">
            <div class="ant-alert ant-alert-error ant-alert-with-description ..." data-show="true" role="alert">
...
- Expected:
null

+ Received:
<div
  class="ant-alert-description"
>
  room 42 unavailable
</div>

 ❯ tests/ReadStateThreeWay.test.tsx:389:86

    387|
    388|     // 核心判据先断言（顺序承重）：43 在途期间，右栏里 42 的错误原文必须消失。修前它一直在这里。
    389|     await waitFor(() => expect(within(content()).queryByText('room 42 …
     |                                                                                      ^
    390|     expect(within(content()).queryByText('讨论详情读取失败')).toBeNull();
    391|     // 串台的另一半：42 的**内容**同样不得残留（VS29 已保证，这里一并守住）。
 Test Files  1 failed (1)
      Tests  1 failed | 2 passed | 19 skipped (22)
   Start at  07:51:20
   Duration  35.34s (transform 1.94s, setup 1.01s, import 26.20s, tests 3.29s, environment 4.09s)

error: script "test" exited with code 1
[exit code: 1]
```

**读法**：

- 退回修复后**恰好第 1 条变红**，且红得**正是评估者实测的那个形态**：
  右栏是 `fq-load-state--error`、`ant-alert-description` 里是 **`room 42 unavailable`**——
  43 在途时显示的确实是 42 的错误原文（`loading=false error=true staleErrorText=true`）。
- 第 2、3 条在变异体上**仍然通过**：它们是"别修过头"的守卫，本来就不该被这个方向的变异打动。
  也就是说**第 1 条并非"随便什么改动都会红"**，它精确打在"错误原文未按房间作用域"这一维上。

### 4.1 "最容易修错处"的实测：反向 / 过度修复分别由谁拦住

卡面写死的风险是"把'清掉旧错误'做成'清掉一切错误'"。为了**不靠推演**，我在同一副本里另做了两个变异体
（每次都先把交付态文件重新拷回副本再变异，避免叠加）：**M2 = 清过头**，**M3 = 错误永不显示**。

**M2「发起请求时清掉错误」**（在 `loadRoomDetail` 开头加 `setDetailFailed(false); setDetailError('');`
—— 这是"切房间时把旧错误清一下"的典型写法，能过本卡第 1 条）：

```
$ cd $env:TEMP\vs32-mut ; bun run test tests/ReadStateThreeWay.test.tsx -t "VS32|重试在途仍保持失败态"
     × 详情在途 ⇒ 加载态（不是上一条内容、也不是空），失败后重试在途仍保持失败态 1876ms
     ✓ 42 失败后切 43（在途）⇒ 右栏不得再显示 42 的错误原文，也不得显示 42 的内容 189ms
     ✓ 43 自己失败 ⇒ 必须显示 43 自己的错误原文（反向断言：不得修成"错误永不显示"）  357ms
     ✓ 42 失败且不切房间 ⇒ 42 的错误原文仍在原位（"清掉旧错误"不得做成"清掉一切错误"） 213ms
 Test Files  1 failed (1)
      Tests  1 failed | 3 passed | 18 skipped (22)
```

⇒ **"清过头"这一维不是由本卡的三条新断言守住的，而是由 VS-29 的既有断言守住的**
（`ReadStateThreeWay.test.tsx:321`，口径③"仅成功才清失败态"）。如实记录：
本卡新增的三条对 M2 **不敏感**。这也正面说明"不能破坏 VS-29 成果"不是客套——
若有人用"切房间时清一下"来修，本卡的三条会全绿而 VS-29 那条会红，
**唯一能拦住它的正是既有断言，所以既有断言一条都不能放宽**。

**M3「错误永不显示」**（把 `catch` 里的 `setDetailFailed(true)` 去掉）：

```
$ cd $env:TEMP\vs32-mut ; bun run test tests/ReadStateThreeWay.test.tsx -t "VS32|重试在途仍保持失败态|切房间失败 ⇒ 右栏显示失败态"
     × 切房间失败 ⇒ 右栏显示失败态 + 重试，绝不显示上一条内容 2582ms
     × 详情在途 ⇒ 加载态（不是上一条内容、也不是空），失败后重试在途仍保持失败态 1215ms
     × 42 失败后切 43（在途）⇒ 右栏不得再显示 42 的错误原文，也不得显示 42 的内容 1201ms
     × 43 自己失败 ⇒ 必须显示 43 自己的错误原文（反向断言：不得修成"错误永不显示"） 1207ms
     × 42 失败且不切房间 ⇒ 42 的错误原文仍在原位（"清掉旧错误"不得做成"清掉一切错误"） 1182ms
 Test Files  1 failed (1)
      Tests  5 failed | 17 skipped (22)
```

⇒ **反向断言（第 2 条）确实在守"错误不得永不显示"**：M3 下它变红，交付态下它是绿的。
若把第 2 条删掉，"错误永不显示"这类修法就只剩既有断言能拦，而语义上最贴近它的那一条正好没了。

三个变异体的分工因此是清楚的：

| 变异体 | 语义 | 谁变红 |
|---|---|---|
| M1 退回修复（`failed: detailFailed`） | 错误原文不按房间作用域（原缺陷） | **本卡第 1 条**（+ DOM 里就是 42 的原文） |
| M2 发起时清错误 | 清过头（重试期间错误消失） | **VS-29 既有断言**（本卡三条全绿） |
| M3 去掉 `setDetailFailed(true)` | 错误永不显示 | **本卡第 2、3 条** + 两条既有断言 |

**副本清理**：三个变异体共用一个 `$env:TEMP\vs32-mut` 副本，验证完毕后已按
"先单独回收 junction、再逐文件/由深到浅回收目录"的顺序**回收**（非直接删除）。
回收后已核对真实 `frontend\node_modules` 完好（`node_modules\vitest` 存在，目录数 208），
真实工作树两个文件的哈希仍为 §页首所列的交付态值。

## 5. 未解决问题

1. **"作用域"这一维是否还有其它同族漏网者，本卡未系统排查。** 本卡只按评估者实测的
   `Discussion.tsx` 详情错误态动手。同族"发起时清失败态 / 状态不按实体作用域"的面
   （VS-29 交付说明里提到"遗留约 40 处同族发起时清失败态未动"）**不在本卡范围**，
   我也没有顺手改——若需要，应另开卡。
2. **`roomDetail` 与 `detailErrorId` 的"双状态"**：现在"内容属于哪个房间"（`roomDetailId`）与
   "错误属于哪个房间"（`detailErrorId`）是两个独立 state，理论上有极短的中间态
   （一次 render 里一个已更新、另一个尚未）。它不影响三态判据（两者都是与 `currentRoomId` 比较，
   不参与彼此运算），但把两者合成一个判别联合（`{roomId, kind:'ready'|'error'}`）会更彻底。
   **本卡刻意不重构**：那会同时动 VS-29 刚验收过的 `scopedDetail` 语义，超出本卡范围与风险预算。
3. **结果文件的"门禁原始输出"是本次会话的输出，未落盘到仓库**（按卡面要求不把门禁输出写进仓库目录）。
   可复核性由命令 + 内容哈希保证。

## 6. 风险

- **低**。生产代码改动 `+24/−3`（`git diff --numstat`），全部集中在详情读取的三态派生路径，
  语义只有一处变化：`failed` 从"全局失败"变为"属于当前房间的失败"。
- **对既有行为的唯一影响面**：切房间时上一个房间的错误不再延续到新房间——这正是本卡目标。
  不变式：**当前房间自己**的失败（含重试期间）行为一字未变。该不变式的守卫是
  VS-29 既有断言 `详情在途 ⇒ … 失败后重试在途仍保持失败态`（§4.1 的 M2 实测证明正是它在拦"清过头"）；
  新增第 2/3 条另守"错误永不显示"（M3 实测）。
- **未做**：同族其它"状态未按实体作用域"的面（见 §5.1）；M2/M3 之外的变异体（如"只在切房间时清、
  但不清 error 文案"这类组合变异）未逐一枚举。
- **一处需要读者注意的结论**（§4.1 实测）：本卡新增的三条断言**拦不住**"发起请求时清掉错误"这种
  过度修复，拦住它的是 VS-29 的既有断言。因此这四条断言（本卡 3 + VS-29 的 `:321`）是**互补**的，
  删任何一条都会留下一个方向不设防。
- **提交注意**：本卡未 commit；交付态哈希见页首。若提交后发现文件哈希变化，说明叠加了别人的改动。
