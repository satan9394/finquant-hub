# EVALUATION_RESULT — VS-22（独立验收）

> 验收者：EVALUATOR（独立复核，不采信实现者自述）。工作目录 `E:\Code_file\Projects\finquant-hub`。
> 被验提交：`258fa965b2e3c746a3ffeedb95217b74a4f6a4f4`（`git log -1`，2026-09-11 23:50:27）。
> 验收时间：2026-09-11 23:51–23:58。**未改动任何被验文件**；变异/夹具全部在 `%TEMP%` 副本内进行，用完已送回收站。

## 判定：**ACCEPT**

五条必做核对项全部成立，且**鉴别力由验收者独立复现**（10 组变异全部按预期变红，未变异基线 12/12 绿）。发现的问题均为**非阻断观察**（见 §5），无一构成对本卡的 REJECT 理由。

---

## 1. 必做项核对（静态 + 行为）

| # | 要求 | 结论 | 证据 |
| --- | --- | --- | --- |
| 1 | 三处共用同一个错误态组件 | ✅ | `LoadFailureAlert` 被 4 处引用：`Chat.tsx:16,323`、`Discussion.tsx:14,260`、`ResearchRuns.tsx:2,19`、`Dashboard.tsx:18,102`。三处**唯一**写法，无第二套错误态实现（`grep LoadFailureAlert` 共 8 处引用，无其它 Alert 型失败态出现在这三处） |
| 2 | 失败 ⇒ 原位错误 + 具体错误 + 可点重试；成功且为空 ⇒ 仍显示空态；两者互斥 | ✅ | 失败分支 `sessionsFailed ? <LoadFailureAlert …/> : null`（`Chat.tsx:321-324`）、`roomsFailed ? … : null`（`Discussion.tsx:258-261`）、`error != null ? <LoadFailureAlert …/> : …`（`ResearchRuns.tsx:19`）。空态文案只由 `List` 的 `dataSource` 为空触发；且失败且本地无记录时**整块不渲染 List**（`Chat.tsx:328`、`Discussion.tsx:265`）——"暂无"在失败态下结构上不可达。验收者独立用例 E1/E2/E5/E6/E8/E9 全部通过 |
| 3 | 重试真的重新发起该列表请求 | ✅ | 重试直接调用可重复调用的 `loadSessions`/`loadRooms`/`loadStats`（`Chat.tsx:98-117`、`Discussion.tsx:71-89`、`Dashboard.tsx:116`）。独立用例按**请求计数**判定：Chat `1→2`、Discussion `1→2`、区块 `1→2`（E2/E6/E10）。变异 M3/M5（`onRetry` 改 no-op）→ 对应用例变红（见 §4） |
| 4 | `ResearchRuns` 判据是 `error != null`，不是"错误文案是否空串" | ✅ | `ResearchRuns.tsx:19` 逐字为 `error != null ?`；`Dashboard.tsx:116` 传 `error={statsFailed ? statsError : null}`（失败即 `''` 也 `!= null`）。独立用例 E11（`error=""` 必须仍判失败）在变异 M7（`error != null` → `error ?`）下**变红** ⇒ 该判据是承重的 |
| 5 | 未破坏 VS-19 | ✅ | `Dashboard.tsx:120`、`:138` 两张卡片的 `statsFailed ? statsAlert : (…)` 结构**原样保留**；`statsAlert` 仍渲染 `Alert type="error" showIcon + description=statsError + 重试`（仅改为经共用组件渲染）。独立用例 E8 断言限定容器内两张卡片各一处 Alert + 各一个重试；仓库 VS-19 用例全绿 |

补充核对：i18n zh/en 各 **2478** 键，`only in zh = 0`、`only in en = 0`（验收者自写脚本独立复核，非采信报告）；4 个新键两边皆存在。

---

## 2. 独立门禁（验收者亲自执行）

命令（**串行**，未与 build 并行）：

```
cd frontend
D:\...\v22.19.0\bun.exe x vitest run tests/ListFailureNotEmptiness.test.tsx tests/ResearchRuns.test.tsx \
  tests/Dashboard.test.tsx tests/ChatSessionDeepLink.test.tsx tests/Discussion.test.tsx \
  tests/ChatBacktestRedirect.test.tsx tests/ChatStarterDraft.test.tsx
```

```
 Test Files  7 passed (7)
      Tests  67 passed (67)
   Duration  94.65s
```

零回归加抽（覆盖被改组件 `ResearchRuns` 的另一消费方）：

```
 ✓ tests/MonitorToday.test.tsx (2 tests)
 ✓ tests/I18n.test.tsx (2 tests)
 Test Files  2 passed (2)   Tests  4 passed (4)
```

`bun run build`（`prebuild` → `tsc -b && vite build`）：

```
✓ built in 20.45s
EXIT=0
```

> 本机既有噪声照录：`React Router Future Flag Warning`、`Not implemented: Window's getComputedStyle() ... pseudo-elements`。本轮**未**出现 forks worker 超时，无需重跑。

---

## 3. 验收者自建用例（不采信实现者用例）

在 `%TEMP%\vs22-eval-*`（**全量副本**，`node_modules` 为 junction 指向真实目录；报告文件与夹具**均未落入仓库**）内新建 `tests/EvalIndependent.test.tsx`，共 12 条，自建判据：

- E1/E5 Chat·Discussion 成功且为空 ⇒ 显示各自空态、无失败文案、无重试；
- E2/E6 失败 ⇒ 原位失败文案 + 底层错误原文 + 可点重试，"暂无…"零出现；点重试后**请求计数 +1**且渲染真实记录、错误态消失；
- E3/E7 **本地已有记录 + 列表请求失败** ⇒ 记录照常可见、错误态仍在、"暂无…"不出现（实现者 §2.5 的承诺，独立复现成立）;
- E4 重试仍失败 ⇒ 错误态保持、可再点、"暂无"零出现；
- E8 Dashboard 区块失败 ⇒ 区块报错并带重试，不再只剩空列表；同页两张 VS-19 卡片仍各一处 Alert（限定 `.workbench-context-grid` 计数为 2）；
- E9 stats 成功 + 零运行 ⇒ 区块保持其既有空态、无失败文案、无重试；
- E10 区块重试**真的重发** `/dashboard/stats`（计数 1→2）；
- E11/E12 `ResearchRuns`：`error=""` 判失败、`error={null}` 判成功。

```
 Test Files  1 passed (1)
      Tests  12 passed (12)
```

---

## 4. 鉴别力独立复核（**验收者自己的变异矩阵**，副本内植入，未触碰被验文件）

做法：对 `%TEMP%` 副本中的源文件做最小变异 → 跑用例 → **立即按 SHA256 逐文件还原** → 核对与仓库文件**逐字节一致**（`RESTORED-identical` ×6）。真实工作树全程未被变异（验收开始/结束 `git status` 均为干净，仅本报告为新增）。

| 变异 | 植入点 | 结果 | 变红用例 |
| --- | --- | --- | --- |
| M1 | `Chat.tsx`：`{sessionsFailed ? (` → `{false ? (` | **3 failed** / 9 passed | E2、E3、E4 |
| M2 | `Chat.tsx`：`{sessionsFailed && sessions.length === 0 ? null : (` → `{false ? null : (`（失败时照旧渲染列表） | **2 failed** | E2、E4（"暂无会话"果然浮现 ⇒ 该守卫是承重的） |
| M3 | `Chat.tsx`：`onRetry={() => void loadSessions()}` → `() => undefined` | **2 failed** | E2、E4 |
| M4 | `Discussion.tsx`：`{roomsFailed ? (` → `{false ? (` | **2 failed** | E6、E7 |
| M5 | `Discussion.tsx`：`onRetry={() => void loadRooms()}` → `() => undefined` | **1 failed** | E6 |
| M6 | `ResearchRuns.tsx`：`error != null ?` → `false ?` | **3 failed** | E8、E10、E11 |
| M7 | `ResearchRuns.tsx`：`error != null ?` → `error ?`（**改用"文案空串"判据**） | **1 failed** | E11 |
| M8 | `Dashboard.tsx`：`error={statsFailed ? statsError : null}` → `error={null}` | **2 failed** | E8、E10 |
| M9 | `Dashboard.tsx`：`{statsFailed ? statsAlert : (` → `{false ? statsAlert : (`（两张卡片） | **2 failed**（跑仓库 `tests/Dashboard.test.tsx`） | VS-19 的 `shows an explicit error with retry in both recent-record cards when stats fail`、`refetches stats from the card retry …` |
| M10 | `Dashboard.tsx`：`error={statsFailed ? statsError : null}` → `error={statsError}`（成功也报失败） | **2 failed** | E9、E10 |

三条关键结论：

1. **"失败是否真的不再伪装成空态"** —— 成立。M2（把失败分支改回只渲染空列表）令"暂无会话"出现，对应用例立刻变红；M1/M4/M6 令失败态整块消失同样变红。反向的 E1/E5/E9（成功且为空）在 M1–M10 的**全部**变异下保持绿 ⇒ 这些用例确实在区分"失败"与"合法空态"，而不是"一变就红"。
2. **"重试是否真重新发起"** —— 成立。M3/M5/M8 去掉重发后，按请求计数判定的用例变红（`expected 1 to be 2` 一类）。
3. **"限定的断言是否仍有鉴别力"** —— 成立。把两张卡片的失败 Alert 去掉（M9）后，被限定到 `.workbench-context-grid` 的两条断言**确实变红**（该容器若选择不到/计数不符即抛错），说明限定不是把断言弱化成恒真；且限定后的语义（"卡片位置各一处"）与 VS-19 原意一致。**验收者不因此判 REJECT**（编排者已裁定接受，验收者复核后认同）。

---

## 5. 非阻断观察（不影响本卡判定）

### 5.1 裁决项复核：`Dashboard.test.tsx` 的改动面（✅ 与实现者声明一致）

`git show HEAD --numstat` 为 `9 insertions / 4 deletions`，`git show HEAD -- frontend/tests/Dashboard.test.tsx` 恰好 **5 个 hunk**，只动 3 处：①import 增加 `within`；②第 306-309 行的两条计数断言限定到 `.workbench-context-grid`（数字仍为 2）；③第 336-338 行把 `fireEvent.click` 的重试选择器限定到同一容器。**其余断言一字未动**（第 304 行 `findAllByText('近期记录读取失败')` 仍为全局 `toHaveLength(2)`，因区块用的是另一个 key `研究运行记录读取失败`，全局计数不受影响）。仓内**没有**其它测试文件依赖被改动的全局计数（已 grep `重\s*试|toHaveLength(2)|暂无会话|暂无讨论` 逐一确认）。

### 5.2 重试窗口内的瞬时回退（与 Chat/Discussion 口径不一致）

`Dashboard.tsx:71-72` 的 `loadStats` 在重试发起时先 `setStatsFailed(false); setStatsError('')`，而 `Chat.tsx:108-113` / `Discussion.tsx:81-86` 刻意**不**清失败态。后果：点首页区块（或卡片）的重试后，在一个往返期间区块会退回 `<p>UNKNOWN</p>`、两张卡片会退回"暂无会话/暂无讨论"，然后才回到真实结果。这是 **VS-19 既有行为**（本卡未改变它），且是瞬态、非"失败伪装成空态"的持续态，故**非阻断**；若要三处口径完全一致，建议后续把 `loadStats` 改为"仅成功才清失败态"（与左栏同构）。

### 5.3 `ResearchRuns` 的合法空态仍是 `<p>UNKNOWN</p>`

如实记录：`runs=[] && error==null` 时渲染的是 `UNKNOWN` 而非"暂无研究运行记录"。这是本卡明确划出的**既有遗留**（任务卡注明不在范围），验收者不据此判 REJECT；建议单开小卡（连同 `ResearchRuns.test.tsx:20-26` 的 `runs=[] → UNKNOWN` 断言一并更新）。

### 5.4 仍存在同类面（第四处及以后）——建议单开一卡

按同一判据（**请求失败后仍渲染空态文案**）扫描，以下位置尚未覆盖，其中 `MemoryManager` 最严重（同一屏同时说"读取失败"和"暂无"，自相矛盾）：

| 位置 | 现象 |
| --- | --- |
| `frontend/src/components/MemoryManager.tsx:119,122` | 有 `error` 段落（"读取失败"）**同时**渲染 `<Empty description={t('memory.empty')}/>`（"暂无研究记忆"） |
| `frontend/src/pages/Research.tsx:415-425,852` | `loadHistory` 失败只弹 toast，`history` 保持旧值/空值 ⇒ 第 852 行仍渲染"暂无已保存的研究记录"（且失败时保留过期历史） |
| `frontend/src/components/NotificationCenter.tsx:106-107,203` | 加载失败只弹 toast，列表保持空 ⇒ 渲染"暂无通知" |
| `frontend/src/pages/ResearchWorkspace.tsx:527,530` | 三个首页卡片按长度渲染"暂无保存记录/暂无最新报告"，失败信息只落在**折叠的**"研究动态"披露区（`ResearchTimeline errors={homeTimelineErrors}`） |

建议：单开一卡（VS-23）把这四处改用 `LoadFailureAlert`（组件已就绪，改动面小），可显著降低"同页两种待遇"复发。

### 5.5 测试签名小瑕疵（非阻断）

`frontend/tests/MonitorToday.test.tsx:30` 渲染 `<ResearchRuns runs={[...]} />` **未传**已变为必填的 `onRetry`。当前不失败：`tsconfig.json` 的 `include` 只有 `["src"]`，`tsc -b` 不检查 `tests/`，运行时 `error` 为 `undefined` 也不触发该回调。建议后续补 `onRetry={vi.fn()}` 以免类型门禁一旦覆盖 `tests/` 时爆红。

### 5.6 工作树观察（未触碰）

验收开始时（23:51）工作树含 ` M docs/ai/evo/PRODUCT_GAP_MAP.md`（他人在途改动），验收者**未读取内容、未触碰**；23:56 复检时该项已消失（他人已处理）。除此之外无其它在途改动。本报告是验收者唯一新增文件。

---

## 6. 证据清单（可复现）

- 门禁与变异全部命令见 §2/§4；变异副本逐文件 SHA256 还原核对输出：`Chat.tsx / Discussion.tsx / Dashboard.tsx / ResearchRuns.tsx / LoadFailureAlert.tsx / Dashboard.test.tsx` 全部 `RESTORED-identical`。
- 临时目录 `%TEMP%\vs22-eval-41707249`：junction 已单独回收（真实 `node_modules` 完好，`vitest.mjs` 与 antd 目录均在），随后整目录已送**回收站**（`SendToRecycleBin`），未用 `rm`/`del`。
- `build` 产物仅落在 `frontend/dist/`（构建脚本固有行为，构建后 `git status` 仍干净）。
