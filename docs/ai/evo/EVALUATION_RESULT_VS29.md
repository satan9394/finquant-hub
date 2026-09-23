# EVALUATION_RESULT — VS-29 三态契约收口（独立验收）

> 验收人：**Evaluator**（独立于实现者）。被验提交 **`8d05556`**（VS-29，10 文件）。
> 方法前提：**假设实现有错**，实现者的自述只当待验断言；**不复用**其夹具/探针/日志。
> 判定：**ACCEPT** —— 0 条阻断项。3 条观察项（其中 1 条建议收窄措辞，1 条为可复现的边界行为，1 条为负载噪声）。

## 0. 所验即最终态（先说清"我验的是哪个字节"）

| 项 | 值 |
| --- | --- |
| 被验提交 | `8d05556` |
| 验收时 HEAD | `2ad343e`，`git status --porcelain` **空** |
| `git diff 8d05556 HEAD -- <本卡 10 文件>` | **空**（提交后无人再改本卡文件） |
| `frontend/src/components/LoadFailureAlert.tsx` SHA256 | `36472A666009554C03EAB82E35B290369D38503D8950F0131C43B0A2BEDF6600` |
| 验收动作对仓库的写入 | **零**（未 commit、未变异、未在仓库内落任何临时文件/日志） |

变异与独立夹具全部在 `%TEMP%` 副本内进行（副本 + junction 指回真实 `node_modules`），
副本与被验文件的 SHA256 逐一对齐（见 §5）。**验收结束时 `LoadFailureAlert.tsx` 的 SHA256 与开工时逐字节相同。**

---

## 1. ⚠️ 本卡灵魂：三态真的可辨，"加载中不得伪装成空"（**自建夹具**）

**自建夹具**：`%TEMP%\vs29eval_5200314b\tests\EVAL_VS29.test.tsx`（28 条，独立编写，未读实现者用例的断言）。
夹具构造与实现者不同：loading 一律用**永不 settle 的 promise**；empty 走"成功且返回空"；error 走 `reject`；
Dashboard 的 `/market/pulse`、`/dashboard/news` 由我自建合法载荷（不借用其 fixture）。

**基线结果：`Test Files 1 passed (1) / Tests 28 passed (28)`。**

### 1.1 契约层真值表（P1，9 条）

| facts | 期望 | 结果 |
| --- | --- | --- |
| `{failed:true, resolved:true, count:3}` | error（失败优先于一切） | ✓ |
| `{failed:true, resolved:false, count:0}` | error（失败不伪装成空） | ✓ |
| `{failed:true, resolved:true, count:0}`（**无 error 文案**） | 仍是 error（不得用文案当判据） | ✓ |
| `{failed:false, resolved:false, count:2}` | ready（刷新在途不清空已读到的） | ✓ |
| `{failed:false, resolved:true, count:0}` | empty | ✓ |
| `{failed:false, resolved:false, count:0}` / `{}` | **loading（兜底）** | ✓ |
| `readStateOf({failed:true,error:'upstream 503'})` | `{status:'error',error:'upstream 503'}` 原样带出 | ✓ |

⇒ 实现者声称的优先级 `error > ready(count>0) > empty(resolved) > loading` 与"loading 判据是**还没有结论**、
不是**请求在途**"**成立**（`LoadFailureAlert.tsx:51-56`）。

### 1.2 渲染层四分支互斥（P2）

`LoadStateView` 四态各构造一次，断言"只出自己那一支"。其中 loading 分支的**第一条**断言就是本卡的灵魂：

```
renderIn(<LoadStateView state={{status:'loading'}} failureMessage=… loadingText="正在读取某列表…"
                         emptyContent={<span>暂无某个东西</span>} retainedCount={2} showContentOnError>真实内容</LoadStateView>)
expect(screen.queryByText('暂无某个东西')).toBeNull();   // ← 加载中不得出现空态文案
```

基线 ✓（空态文案、失败文案、内容三者皆 null，只有加载文案）。该断言在 §5 变异 A 下**必然变红**（原始输出见 §5）。

### 1.3 逐面三态互斥（loading 期间**不出现空态文案，也不出现 `UNKNOWN`**）

| 面 | loading 夹具 | 基线断言（原文摘录） | 结果 |
| --- | --- | --- | --- |
| 首页两张卡片 | `/dashboard/stats` 永不 settle | `getAllByText('正在读取最近记录…')` 有 2 个；`queryByText('暂无会话')===null`；`queryByText('暂无讨论')===null`；`queryByText('近期记录读取失败')===null` | ✓ |
| 首页"研究运行"区块 | 同上 | `within('.research-runs').getByText('正在读取研究运行记录…')`；`within('.research-runs').queryByText('UNKNOWN')===null`；该区块无失败文案 | ✓ |
| Chat 左栏 | `/chat/sessions` 永不 settle | `within(rail).getByText('正在读取会话列表…')`；`queryByText('暂无会话')===null`；无失败文案 | ✓ |
| Discussion 左栏 | `/discussion/rooms` 永不 settle | `within(rail).getByText('正在读取讨论列表…')`；`queryByText('暂无讨论')===null`；无失败文案 | ✓ |
| Discussion 右栏详情 | 切房间后详情在途 | `within(content).getByText('正在加载讨论详情…')`；**右栏不得残留上一条的议题与委员**；无失败文案 | ✓ |
| MemoryManager | `/research/memory` 永不 settle | `getByText('正在读取研究记忆…')`；`queryByText('暂无研究记忆')===null`；无失败文案 | ✓ |

并且**空态只在"成功且为空"时出现**（同一批夹具中逐面验证）：首页两卡片与 runs 区块 `UNKNOWN`、
Chat `暂无会话`、MemoryManager `暂无研究记忆` 均只在成功空集时出现，且此时**不出现**加载文案。✓

⇒ **"加载中伪装成空"在本卡回填的 7 个面上已不可能发生**（结构上由单 `switch` 保证，见 §5 的变异证明）。

---

## 2. 不串台：`Discussion` 切房间失败 ⇒ 右栏不得显示上一条内容

**断言（原文）**：先点进 42 并确认右栏渲染其内容（议题 `上一条讨论` + 委员 `甲委员`），再点 43 且 43 的详情请求 `reject`：

```
await getByText('讨论详情读取失败') / getByText('room 43 unavailable') / button 重试
expect(within(content()).queryByText('上一条讨论')).toBeNull();   // 不是上一条的议题
expect(within(content()).queryByText('甲委员')).toBeNull();       // 不是上一条的委员
expect(within(content()).queryByText('正在加载讨论详情…')).toBeNull(); // 也不是在途
```

**结果：✓**（P6）。在途版本（43 永不 settle）同样 ✓（P7）：右栏是加载态，42 的议题/委员皆 null。

**重试真的重新发请求**（P8）：43 第一次 `reject`、第二次 `resolve` ⇒ 点重试后 `getByText('新选的讨论')` 出现、
失败态消失、请求计数 `n===2`。✓ ⇒ "永久停在 Spin"确已消失（三态由 `readStateOf` 派生，`Discussion.tsx:330-335`）。

---

## 3. ⚠️ 零回归：**我独立复跑了哪些文件、结果如何**

全部在 **`%TEMP%` 副本**（= 提交态 `8d05556` 的逐字节拷贝）内执行，未占用/未污染仓库工作树。

| 测试文件 | 家族 | 用例数 | 结果 |
| --- | --- | --- | --- |
| `tests/ListFailureNotEmptiness.test.tsx` | **VS-22** "失败不伪装成空"（Chat 左栏 / Discussion 左栏 / 首页 runs 区块） | 14 | **14/14 ✓** |
| `tests/Dashboard.test.tsx` | **VS-19** 首页两张卡片的失败告警与"暂无…只在成功且为空时出现" | 16 | **16/16 ✓**（见 §8 噪声） |
| `tests/DiscussionRolesUnavailable.test.tsx` | **VS-25** 角色列表不可用（直接用 `LoadFailureAlert` 本体） | 6 | **6/6 ✓** |
| `tests/ReadStateThreeWay.test.tsx` | 本卡新增（实现者用例，仅作对照，不作我的证据） | 19 | **19/19 ✓** |
| `tests/Discussion.test.tsx` | 本卡直接回填面 | 10 | **10/10 ✓** |
| `tests/MemoryManager.test.tsx` | 本卡直接回填面 | 3 | **3/3 ✓** |
| `tests/ResearchRuns.test.tsx` | 本卡直接回填面 | 4 | **4/4 ✓** |
| `tests/EVAL_VS29.test.tsx` | **本 Evaluator 自建** | 28 | **28/28 ✓** |

⇒ **VS-19 / VS-22 / VS-25 的既有成果全部仍然成立**，本卡回填的三个面也无回归。
尤其：`ResearchRuns.test.tsx` 的 `treats success as "error is null", never as "the error text is empty"` 通过
⇒ `ResearchRuns.tsx:26-31` 用 `error != null` 而非"错误文案非空"作判据这一 VS-22 决定**未被改坏**。

---

## 4. 语义判据唯一性（grep 证明"没有第二处真相来源"）

**族内（读取三态）确实只有一处真相来源**：

- `ReadState` / `readStateOf` / `LoadStateView` 的**定义**只在 `frontend/src/components/LoadFailureAlert.tsx`（:22 / :51 / :98）；
- 全仓 `readStateOf(` 的**消费点**共 5 处：`Chat.tsx:340`、`Dashboard.tsx:107,111`、`Discussion.tsx:330,364`、
  `MemoryManager.tsx:116`、`ResearchRuns.tsx:26`——**全部**经它取优先级，无一处在调用点自行拼 `loading/empty`；
- 全仓除该文件外**不存在**第二种 `'loading' | 'empty' | …` 判别联合（`src/store/authStore.ts:107` 的
  `status:'loading'` 是**认证**状态，与读取三态无关）。

**但"全产品唯一"这一措辞应收窄为"读取三态族内唯一"**（建议，非阻断）：族外仍有手写的三态编排——

| 位置 | 形态 | 是否"加载中伪装成空" |
| --- | --- | --- |
| `SharePreviewModal.tsx:42-50` | 自己的 error Alert + `{!loading && !error && !preview ? <Empty/> : null}` | 否（有 loading 守卫） |
| `Research.tsx:892` | `{!historyLoading && history.length === 0 && <Empty/>}` | 否（有 loading 守卫） |
| `DiscoverResults.tsx:21` | `if (!loading && !items.length) return <Empty/>` | 否（有 loading 守卫） |

这些**不在卡面列出的模块内**，卡也明确要求"不把共享契约改动扩散到无关功能面"，故不构成缺陷；
但实现者文档中"**全产品唯一**"的表述与事实不符（族内唯一 ≠ 全仓唯一），建议在结果文件与代码注释里改成
"读取三态契约族内唯一"，否则下一个卡会拿这句话当"全仓已收口"的依据。

---

## 5. 鉴别力证明（**副本**变异，贴原始输出）

**变异窗口声明**：两次变异**只发生在 `%TEMP%` 副本内**（`vs29mut_a` / `vs29mut_b`），仓库工作树**全程未含任何缺陷**。
变异前副本 SHA256 = 仓库 SHA256 = `36472A66…F6600`；变异后 `vs29mut_a=67FEE808EA46…`、`vs29mut_b=D44A20AD9C5B…`；
两副本使用的独立夹具与基线**同一 SHA256**（`95E85159278B`），故差异只可能来自被变异的源码。

### 变异 A —— "把加载中当成空渲染"（`LoadStateView` 的 `loading` 分支改渲染 `emptyContent`）

```
× tests/EVAL_VS29.test.tsx > P2 LoadStateView 四分支互斥（loading 绝不渲染 emptyContent） > loading 分支只出加载态，不出空态/失败态/内容
→ expected <span></span> to be null
× P3 Dashboard … stats 在途 ⇒ 只出现加载态，不出现"暂无会话/暂无讨论"，runs 区块不出现 UNKNOWN  → Test timed out in 15000ms.
× P4 Chat 左栏 … /chat/sessions 在途 ⇒ 加载态，且"暂无会话"一个字都没有                        → Test timed out in 15000ms.
× P5 Discussion 左栏 … /discussion/rooms 在途 ⇒ 加载态，且"暂无讨论"一个字都没有               → Test timed out in 15000ms.
× P5 Discussion 右栏 … 切房间在途 ⇒ 右栏是加载态，不得残留上一条讨论的内容                     → Test timed out in 15000ms.
× P8 MemoryManager … 在途 ⇒ 加载态：无失败文案、无空态文案                                    → Test timed out in 15000ms.
Test Files  1 failed (1)
Tests  6 failed | 22 passed (28)
```

**6 条变红**，且分布在"契约层 1 条 + 5 个面各 1 条"；**empty / error 家族 22 条全绿**。

### 变异 B —— "退回没有 loading 维度的旧契约"（`readStateOf` 兜底由 `{status:'loading'}` 改回 `{status:'ready'}`）

```
× P1 真值表 > 未失败 + 空 + 未解析 ⇒ loading（兜底：还没有结论）  → expected 'ready' to be 'loading'
× P1 真值表 > 空入参 ⇒ loading                                    → expected 'ready' to be 'loading'
× P3 Dashboard … stats 在途 …                                     → Test timed out in 15000ms.
× P4 Chat 左栏 …                                                  → Test timed out in 15000ms.
× P5 Discussion 左栏 …                                            → Test timed out in 15000ms.
× P5 Discussion 右栏 …切房间在途…                                  → Test timed out in 15000ms.
× P8 MemoryManager …在途…                                          → Test timed out in 15000ms.
Test Files  1 failed | 1 passed (2)
Tests  7 failed | 35 passed (42)
```

**7 条变红**；同一次运行里的 **`tests/ListFailureNotEmptiness.test.tsx`（VS-22）14/14 全绿**，
P1 的 empty/error 分支、P2 四分支（直接构造 `ReadState`）、P3 的 empty/error 用例、P6 串台用例、
以及"口径"用例全部仍绿 ⇒ **变异精确打在"加载中"这一维度上**，不是被宽泛地打坏。

> 与实现者自述的数量差异（其 A=5 / B=6，我 A=6 / B=7）**来自夹具不同**（我的 P1 真值表把兜底判据单列成 2 条、
> P2 契约层单列 1 条），方向与结论一致。**不构成冲突。**

---

## 6. 口径统一（重试时是否清失败态）

**本卡后全族统一为"仅成功才清"**；我逐处核了代码与行为：

| 面 | 修前（基线代码） | 本卡后 | 我的核验 |
| --- | --- | --- | --- |
| `Chat.loadSessions` | 仅成功才清 | 不变 | 读码 `Chat.tsx:111-128` |
| `Discussion.loadRooms` / `loadAgents` | 仅成功才清 | 不变 | `Discussion.tsx:88-126` |
| `Discussion.loadRoomDetail` | **无失败态**（只弹一次 toast） | 新增失败态 + 仅成功才清 | P8 重试用例 ✓ |
| `Dashboard.loadStats` | **发起时先清**（`setStatsFailed(false)`） | 仅成功才清 | P3 口径用例：第一次 reject → 点重试（第二次永不 settle）⇒ 失败文案仍在、`暂无会话/暂无讨论/正在读取…` 皆 null ✓ |
| `Dashboard.loadDecisionInbox/loadMarket/loadNews` | **发起时先清** | 仅成功才清 | 读码 `Dashboard.tsx:84-86`（三行内 `setXError('')` 已移到成功分支） |
| `MemoryManager.load` | **发起时先清** | 仅成功才清 | P9 口径用例 ✓（同 P3 形态） |
| `MemoryManager` 动作失败 | 与读取失败**共用** `error` | 拆为独立 `actionError`（`MemoryManager.tsx:32-34,135-136`） | P8 失败用例：`记忆读取失败，请稍后重试。` 有、`暂无研究记忆` **null**、`memory db down` 有、重试按钮有 ✓ |

⇒ **"读取失败"与"暂无研究记忆"在同一屏互否的情形已消除**（同屏不矛盾这一条成立）。

未纳入统一的族外站点（约 40 处，实现者 §4 已如实列出）我抽查了 `Settings.tsx`、`Thesis.tsx`、`Portfolio.tsx`：
确为**动作/表单类局部错误态**，不走 `readStateOf`/`LoadStateView`，**不属于本卡回填的读取三态族**。
同意其"另开卡逐面判定"的处理，**不据此判缺陷**；但也说明"口径全产品统一"目前是**族内统一**。

---

## 7. 家族边界（改的是生产代码，是否只动该族）

`git show --stat 8d05556`：**10 文件**，与结果文件自述一致——

- 生产代码 **8** 个：`LoadFailureAlert.tsx`（契约）、`Chat.tsx`、`Discussion.tsx`、`Dashboard.tsx`、
  `ResearchRuns.tsx`、`MemoryManager.tsx`、`i18n/zh.ts`、`i18n/en.ts`；
- 新增测试 1 个：`tests/ReadStateThreeWay.test.tsx`；
- 结果文档 1 个。

**逐条核过**：
- **无既有测试文件被修改**（`--stat` 里除新增外没有任何 `tests/` 文件）⇒ **不存在"放宽既有断言"**；
- `Chat.tsx` / `Dashboard.tsx` 删掉的只是各自的 `locale={{emptyText}}`（空态文案改由契约的唯一出口给出），
  `MemoryManager.tsx` 删掉的只是 `!loading && items.length === 0 && <Empty/>`——**都在本族内**；
- `DecisionInboxPanel`、`MarketBrief`、`LatestNews` 等**同文件内的无关区块逐字节未动**
  （已用 `git show 8d05556~1:` 与 `git show 8d05556:` 对拍 `DecisionInboxPanel`，完全一致）；
- 无新依赖、无后端/schema 改动、无删文件。

---

## 8. 门禁

| 门禁 | 命令 | 结果 |
| --- | --- | --- |
| i18n 键集合（**独立脚本**，用 `bun -e` 直接 import 两个模块） | — | `zh=2493 en=2493`、`dupZh=0 dupEn=0`、`onlyZh=[] onlyEn=[]`、无空值 ⇒ **与实现者一致** |
| 前端构建（**串行**，仓库真实树） | `cd frontend && bun run build` | `prebuild` openapi 校验 `OK … is fresh (60 schemas)` → `tsc -b && vite build` → `✓ built in 1m 35s`，**exit=0**（总耗时 194.8s） |
| 构建后仓库状态 | `git status --porcelain` | **空**（`dist/`、`*.tsbuildinfo` 均被 `.gitignore` 覆盖，未污染工作树） |

---

## 9. 观察项（**均不阻断**，如实给出 `文件:行` 与建议）

### F1（可复现的边界行为，建议后续卡修）`Discussion` 详情失败态**未按房间作用域**

`Discussion.tsx:49-50` 的 `detailFailed` / `detailError` 与 `roomDetail`/`roomDetailId` 不同——
**只有内容被房间作用域了**（`:329` `scopedDetail`），失败态没有。

**原始观测**（我的 P10 用例，基线态打印）：
```
P10-OBSERVED loading=false error=true staleErrorText=true
```
场景：42 的详情**失败**后切到 43（43 在途）⇒ 右栏进入 `error` 分支，并**继续显示 42 的错误原文 `room 42 unavailable`**。
**不违反卡面验收**（没有内容串台、没有把失败说成空、三态仍互斥、比修前的"永久 Spin"严格更好），
但用户会看到"上一个房间的失败原因"被当作当前房间的失败。
**建议**：`currentRoomId` 变化时一并 `setDetailFailed(false); setDetailError('')`（或把失败态也按 `roomDetailId` 作用域），
一行即可，且不会破坏 §1/§2 的任何断言。

### F2（措辞）"全产品唯一"应收窄为"读取三态族内唯一"
见 §4：族内确实唯一且有 grep 证据；族外仍有 3 处手写编排（均带 loading 守卫、均不在卡面范围内）。

### F3（噪声，**不据此判红**）`Dashboard.test.tsx` 的单次 5s 超时
批量复跑时 `DecisionInboxPanel > renders loading, error, and empty states explicitly` 报
`Test timed out in 5000ms`（实测 5528ms）。**判定为负载诱发**：①该用例只直接渲染 `DecisionInboxPanel`，
**不经过**本卡改动的任何路径（`LoadStateView`/`readStateOf`/apiClient 全不涉及）；②该组件在提交前后**逐字节相同**；
③**独立单文件复跑**该文件 `16/16 ✓`，该用例降到 **753ms**。故**未据此改判、也未因此放松任何断言**。

---

## 10. 未验项与归属边界（不替任何一方选结论）

1. **未做**：浏览器真实渲染/视觉核验、读屏 live region 实际播报（`announceLoading` 默认关闭的取舍我未在真机上验）、
   真实后端返回形态下的端到端表现——本卡是组件层契约，上述不在其可判定范围内。
2. **未复现**实现者报的 `Windows Job runner exited with exit code 4294967295`：本次全部 vitest 运行**均有结论**，
   没有出现"无结论中断"。**我无法证明那次中断的归属，也不替它选归属。**
3. **构建归属边界**：`bun run build` 编译整个 `frontend/src`（含其它卡已提交内容）。本次 **exit=0**，
   未出现任何需要归因的失败 ⇒ 该边界本次未被触发。
4. **并发边界**：本次验收期间**未观察到**除 F3 之外的 `Test timed out in 5000ms`，各文件耗时分布正常
   （如 `ListFailureNotEmptiness` 14 条 ~3-9s 级、单文件复跑稳定）。但我**不能证明**窗口内绝对无他卡并发。
5. **进程卫生**：我只按"命令行精确匹配 `vs29mut_a` + `vitest`"结束过 1 个我自己遗留的 vitest 进程
   （PID 28456），动手前先列出了全部候选命令行逐一确认，**未使用排除法、未误杀他卡进程**。
6. 临时目录保留在 `%TEMP%`（未删，避免回收含 junction 目录的风险）：
   `%TEMP%\vs29eval_5200314b`（基线副本 + 我的夹具）、`%TEMP%\vs29mut_a`、`%TEMP%\vs29mut_b`（两个变异副本）。

---

## 附：一句话结论

**三态在组件层真的可辨**（7 个面 loading 期间均无"暂无…"/`UNKNOWN`，`readStateOf` 是全族唯一判据，
变异 A/B 分别精确打红 6/7 条"加载中"用例而 empty/error 家族全绿）；**切房间失败确不串台**（右栏无上一条的议题与委员）；
**VS-19(16/16)、VS-22(14/14)、VS-25(6/6) 我独立复跑全部仍绿**，另加 Discussion(10/10)/MemoryManager(3/3)/ResearchRuns(4/4)、
i18n 2493=2493、串行 `bun run build` exit=0；**族内无第二处三态真相来源**（族外 3 处手写编排不在卡面范围，措辞应收窄）。
⇒ **ACCEPT**（附 F1 一条建议修、F2 一条措辞收窄、F3 为负载噪声）。
