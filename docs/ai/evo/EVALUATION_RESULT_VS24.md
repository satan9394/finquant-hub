# EVALUATION_RESULT — VS-24：让"有标的时的追问"真正被接住

> 独立验收（EVALUATOR），2026-09-12。**判据只有任务卡** `docs/ai/evo/IMPLEMENTATION_BRIEF_VS24.md`——本卡没有实现者自述（`IMPLEMENT_RESULT_VS24.md` 系编排者代写，明确标注"代写不等于免验"），因此以下结论全部来自我自己的夹具、原始日志与拷贝变异，不采信任何自述。
> 被验提交：`e0e85f4`（代码）。其后的 `1437db8`、`99d566b` 均只改 `docs/ai/evo/`，无代码。

## 0. 判定

**ACCEPT**（生产改动未发现缺陷；**附 2 项必须跟进 + 2 项如实标注的边界**）。

一句话：`/research/:symbol` 下的 `?prompt=` 现在**真的被接住**（切到问答面 + 可见回执 + 原问题成为可发送草稿），两条入口**结构同源**（同一个 `FollowupComposer`/`followupResearchPath`、同一个消费点），消费后用 `replace` 清掉 `prompt`，**不重放**；卡内 6 条验收与 4 条错误场景我逐条独立复验通过；`bun run build` 通过；**未发现需要 REJECT 的缺陷**。

必须跟进（不阻塞本卡，但不应被遗忘）：

1. **"合并跑红"的归属被我说反了**：实现者结论"排除其新文件后同样 9 文件合并仍失败同样 3 条 ⇒ 预存在污染"**在本机不复现**——不含新文件的 9 文件合并运行 **79 passed 全绿**。真实形态是：**既有测试文件 `ResearchWorkspaceEvidence.test.tsx` 自身有 3 处"await A → 同步断言 B"的竞态**，其成败对运行组合敏感；**只要把这 3 处改成 `waitFor`（不改任何生产代码），含新文件的同一次合并运行即 24 passed 全绿**（§6）。建议开测试卫生卡修这 3 处，并要求"合并跑与单跑结论必须一致"。
2. **产品语义需编排者确认**：本实现把追问**交成"可编辑草稿 + 回执"，不自动发送**（`apiClient.post` 零调用，i18n 文案亦写明"不会自动发送"）。这与 `Chat` 既有 `?prompt=` 草稿契约一致、也满足"界面必须有反应、问题不能丢"，但**不等于卡内理想行为①字面的"真的发起一次追问"**。若编排者本意是"自动执行一次"，那是另一张卡。

如实标注的边界：③"刷新"只验到地址栏层面（真浏览器刷新会保留 history.state，回执/草稿可能再现，但**不会重跑**，因为 prompt 已不在地址栏）；④`/research?mode=fast&prompt=`（空 prompt + 无标的 + 有 mode）走"模式面自己拥有 prompt"分支，**不清理**地址栏（影响极小，但与卡内"空 prompt 应清理"的措辞不完全一致）。

---

## 1. 我跑过的门禁与原始输出

全部在 `E:\Code_file\Projects\finquant-hub\frontend`，`D:\Technology_application\NVM_Windows\nvm_a\v22.19.0\bun.exe x vitest run ...`。

```
# ① 本卡新测试单跑
 ✓ tests/ResearchFollowupPrompt.test.tsx (10 tests) 5074ms
 Test Files  1 passed (1)
      Tests  10 passed (10)

# ② 相关既有测试 9 文件合并（= 全部 import App/Chat/ResearchWorkspace 的既有测试，不含新文件）
 ✓ tests/ResearchWorkspaceEvidence.test.tsx (14 tests) 17089ms
 ✓ tests/ListFailureNotEmptiness.test.tsx (14 tests) 4074ms
 ✓ tests/ChatSessionDeepLink.test.tsx (14 tests) 2383ms
 ✓ tests/ChatBacktestRedirect.test.tsx (8 tests) 2966ms
 ✓ tests/ResearchModeRouting.test.tsx (5 tests) 1089ms
 ✓ tests/AuthUnavailable.test.tsx (17 tests) 1776ms
 ✓ tests/AppNavigation.test.tsx (4 tests) 738ms
 ✓ tests/ResearchLanding.test.tsx (2 tests) 1123ms
 ✓ tests/ChatStarterDraft.test.tsx (1 test) 886ms
 Test Files  9 passed (9)
      Tests  79 passed (79)

# ③ 串行 bun run build（含 tsc -b）
$ ../backend/.venv/Scripts/python.exe ../scripts/openapi_tsgen.py --check
OK: .../src/types/openapi.generated.ts is fresh (60 schemas)
$ tsc -b && vite build
✓ 4262 modules transformed.
✓ built in 26.77s
build_exit=0
```

`ResearchWorkspaceEvidence` 单独跑：`Test Files 1 passed (1) / Tests 14 passed (14)`。

---

## 2. 我的独立夹具（不是复述实现者的用例）

实现者的 10 条用例我复跑了（10 passed），但**结论不建立在它之上**。我另写 7 条放在 `%TEMP%\vs24\vs24-evaluator.test.tsx`（经 junction `frontend\.vs24-eval-tmp` 挂到前端 root 下才能被 vitest 加载；跑完回收，仓库里不留文件），覆盖实现者用例**没有直击**的点：

| 用例 | 断言 | 与实现者用例的差异 |
|---|---|---|
| E1 | 在 `/research/600519` **挂载态**提交（同 Route 只改查询串、不重挂载）→ 地址栏 `/research/600519?mode=fast`、回执含原问题、问答面草稿 = 原问题、`searchInstruments` 未被调用 | 实现者用例 1 是"带 `?prompt=` 首屏挂载"（本来就会重挂载，绕过了核心场景） |
| E2 | 两条入口提交同一问题 → 指纹逐字相等（location/receipt/draft） | 同源是卡内核心，我自己也做了一遍 |
| E3 | `MemoryRouter` 历史栈 `['/research/600519','/research/600519?prompt=X']` 消费后**点返回** → 无回执、无草稿、无 `mode=fast`、回到标的研究页 | 实现者只检查"地址栏没有 prompt"，没测历史栈 |
| E4 | `?prompt=`（空）→ 地址栏清成 `/research/600519`，无回执、不切面、零检索 | — |
| E5 | `?mode=deep&session=7&room=9&prompt=X` → 终态 `/research/600519?mode=fast`（追问优先、深链被剥） | — |
| E6 | `/research?prompt=茅台` → `searchInstruments` **恰好 1 次**；再点返回后**仍是 1 次** | 用调用次数做"重复执行"判据 |
| E7 | 1501 字超长 prompt → 草稿逐字等于原文、不截断、不崩 | 卡内错误场景 |

**真源结果：`Test Files 1 passed (1) / Tests 7 passed (7)`，`eval_real_exit=0`。**

结论：
- **标的研究页追问真的执行**（验收 1）：E1 绿。补充事实——E1 同时断言 `apiClient.post` 未被调用，即"接住"= 可见回执 + 切到问答面 + 原问题成为可发送草稿，**不自动发送**（见 §0 跟进 2）。
- **两路径真的同源**（验收 2）：E2 绿（指纹逐字相等，终态都是 `/research/600519?mode=fast`）。结构上我也读码确认：`App.tsx:160-183` 只有**一个**去向函数 `followupResearchPath` 与**一个**宿主组件 `FollowupComposer`，`AppLayout` 只渲染这一个宿主（`App.tsx:374-377`）；消费点只有 `ResearchWorkspace.tsx:963-996` 一处。两条入口不存在第二套实现。
- **不重复执行**（验收 3）：E3、E6 绿。**但我要纠正一条被写进提交信息与代写报告的依据**：所谓"落地指纹"（位置+回执+草稿）**本身是幂等的**——跑一次和跑两次得到的指纹完全相同，**它不能区分"跑了一次"与"跑了两次"**。真正有区分力的是：①消费后 `replace` 清掉 `prompt`（E3 用历史栈证明返回不重放）；②无标的路径的 `searchInstruments` 调用次数（E6 证明恰好 1 次）。有标的路径本来就不自动发请求，**不存在可被重复的执行**，所以这不构成缺陷，但"用指纹证明不重复"这句论证**不成立**，不应再被引用。

---

## 3. 逐条判定（卡内验收标准）

| # | 标准 | 判定 | 证据 |
|---|---|---|---|
| 1 | 标的研究页追问生效（真的以 X 发起，而非停在原地） | **通过（按"UI 状态变化"判据）** | E1：切面 + 回执 + 草稿；**注意不自动发送** |
| 2 | 两路径同源、结果一致 | **通过** | E2 指纹逐字相等；单一去向函数/单一消费点（读码） |
| 3 | 不重复执行（消费后清理，刷新/返回不重放） | **通过** | E3（返回不重放）、E6（检索恰 1 次）；`replace: true` 使带 prompt 的历史项被就地替换 |
| 4 | 零回归（既有测试绿、Chat 侧 `?prompt=` 不被破坏、i18n 一致） | **通过** | 9 文件合并 79 passed（含 `ChatStarterDraft`：`keeps a URL prompt editable without creating or sending anything`）；`zh.ts/en.ts` 各加同键 `research.followup.received` |
| 5 | 鉴别力证明（副本去掉新逻辑后至少一条用例变红） | **通过** | §4：变异副本 3 failed \| 4 passed（E1/E2/E7 红） |
| 6 | 门禁：相关 vitest 全绿 + 串行 `bun run build` | **通过**（见 §6 的组合敏感性说明） | ①10 passed；②79 passed；build exit 0 |

错误场景：

- 空 `?prompt=`：E4 绿（不发起、只清理）；纯空白同理（实现者用例 8 复跑通过）。
- `prompt` 与 `session`/`room`/`mode` 并存：E5 绿，**优先级 = 追问 > mode**（`?mode=deep` 被改成 `mode=fast`），且按 VS-16 同构剥掉 `session`/`room`——读码确认 `ResearchWorkspace.tsx:986-995`。
- 极长 prompt：E7 绿（不崩不截断）。
- 连续两次不同追问：**我只复跑了实现者用例 9（通过）**，没有自写夹具覆盖；读码机制可信——`consumedPromptRef` 在 `rawPrompt === null` 时复位（`ResearchWorkspace.tsx:964-967`），所以"同一问题再提交一次"仍会被当作新的一次追问，不会被永久吞掉。**这条我标为"实现者用例 + 读码"，不是我的独立复验。**

不能破坏的 4 项：

- `/analysis/:ticker` 既有行为：E2 的另一半就是它，绿。
- VS-16 `selectMode` 剥参：`git show e0e85f4` 未触碰 `selectMode`；E5 证明切面后 `session`/`room` 不残留。
- `Chat` 侧 `?prompt=` 草稿：`ChatStarterDraft.test.tsx` 绿；读码 `ResearchWorkspace.tsx:970` 对"无标的 + 有 mode"显式提前返回，不消费不清理。
- 不加依赖、不改后端、不改 schema：提交文件集仅 5 个前端文件（App.tsx / ResearchWorkspace.tsx / zh.ts / en.ts / 新测试）。

---

## 4. 鉴别力证明（副本在 `$env:TEMP`，绝不在 `src/`/`tests/`）

方法：把 `src/pages/ResearchWorkspace.tsx` 拷到 `%TEMP%\vs24\vs24-mutated-ResearchWorkspace.tsx`，用配置 `resolve.alias` 把被测页面指向副本，**只做一处语义变异**：

```
- }, [navigate, question, rawMode, rawPrompt, routedMode, searchParams, setSearchParams, symbol]);
+ }, []); // TEMP-MUTATION: sync-on-querystring removed (pre-fix behaviour: read only at mount)
```

（副本的 25 条相对 import 已改写成绝对路径，仅为让副本能离开原目录运行；变异本身只有上面这一处。）

```
# 真源
 ✓ .vs24-eval-tmp/vs24-evaluator.test.tsx (7 tests) 7231ms
      Tests  7 passed (7)

# 变异副本
 × E1 挂载态提交（同 Route 只改查询串、不重挂载）必须被接住 2792ms
 × E2 两入口对照：界面结果必须逐字一致 1310ms
 × E7 极长 prompt：不崩、不截断 1306ms
 Test Files  1 failed (1)
      Tests  3 failed | 4 passed (7)
 eval_mutated_exit=1
```

原始报错（E7，节选）：`Expected: "mode=fast"` / `Received: "/research/600519?prompt=%E9%95%BF%E9%95%BF…END"`——即"只改查询串不重挂载"时**根本不消费**，正是本卡描述的缺陷本体。

附带一个**反证**：变异副本下 E2 红的是 **`/research` 那一半**，`/analysis` 那一半仍然绿（它靠 Route 变化重挂载）——这独立复现了卡内"同一个按钮、两条路径行为相反"的根因，也说明**新逻辑确实是把两条路径拉齐的那段代码**。

---

## 5. 独立复核：合并运行的那 3 条失败到底是谁的责任

这是本卡最花时间、也**与实现者结论相反**的一节。所有原始日志都在 `%TEMP%\vs24\*.log`。

| 运行组合 | 结果 |
|---|---|
| `ResearchWorkspaceEvidence` **单独** | ✅ `1 passed / 14 passed` |
| 9 文件合并（**不含**新文件；= 全部 import App/Chat/ResearchWorkspace 的既有测试） | ✅ `9 passed / 79 passed` |
| `ChatSessionDeepLink` + `ResearchWorkspaceEvidence`（**不含**新文件） | ✅ `2 passed / 28 passed` |
| 10 文件合并（9 + 新文件） | ❌ `1 failed \| 9 passed`，失败全在 `ResearchWorkspaceEvidence`（3 条） |
| `ResearchFollowupPrompt` + `ResearchWorkspaceEvidence`（最小对照） | ❌ `3 failed \| 21 passed (24)` |
| 上一行**原样重跑一次** | ❌ 同样 3 条（可复现，3/3） |

3 条失败与实现者描述的症状一致，但**组合不同**：

```
 FAIL  tests/ResearchWorkspaceEvidence.test.tsx:295:100
   AssertionError: expected '2026-08-20' to be '2026-09-12' // Object.is equality
 FAIL  tests/ResearchWorkspaceEvidence.test.tsx:321:25
   Unable to find an accessible element with the role "button" and name `/2026-08-27/`
 FAIL  tests/ResearchWorkspaceEvidence.test.tsx:336:19
   Unable to find an element with the text: 龙虎榜：龙虎榜接口不可用
```

结论（分三层，逐层给证据）：

1. **不是本卡生产代码的回归**：9 文件合并用的是**同一份含本卡改动的源码**，全绿；失败测试落在本卡完全没碰的龙虎榜/资金流卡片上。
2. **也不是"新文件把状态泄漏给了别人"**——vitest 逐文件隔离下这不可能，而且真正的原因在**既有测试自身**：这 3 处都是"`await A` 之后**同步**断言另一个独立 promise 的结果"的竞态。
3. **决定性验证**：我把这 3 处改成 `waitFor`（**只改既有测试的等待方式，一行生产代码都不动**），再与**本卡新测试同跑**：

```
 ✓ .vs24-eval-tmp/evidence-patched.test.tsx (14 tests) 13597ms
 ✓ tests/ResearchFollowupPrompt.test.tsx (10 tests) 4386ms
 Test Files  2 passed (2)
      Tests  24 passed (24)
 racecheck_exit=0
```

⇒ **那 3 条是既有测试的竞态/调度敏感问题；本卡新文件的作用只是改变了运行组合（时机/负载）把既有竞态顶了出来。实现者"排除新文件后仍失败同样 3 条"的对照结论在本机不复现。**

我不为机制背书：我没有证明确切的触发机制（只能说与运行组合相关的时机/负载敏感，逐文件隔离排除模块状态泄漏）。但**"改既有断言即可全绿"这一条已把责任钉在既有测试的等待方式上**。

处置建议：**不要**因此判本卡 REJECT（卡内要求与本卡无关的既有污染单列结论）；另开测试卫生卡，把 `ResearchWorkspaceEvidence.test.tsx:295/321/336` 改为各自 `waitFor`，并规定"合并跑结论必须与单跑一致"。

---

## 6. 风险 / 建议（不阻塞本卡）

1. **必须跟进**：修 `ResearchWorkspaceEvidence.test.tsx` 3 处竞态（§5），并把"9 文件合并仍红"的错误结论从路线图/GAP MAP 的文字里更正——它会让后续每张卡都重新误判一次。
2. **必须跟进**：确认产品语义（草稿 vs 自动发送，§0 跟进 2）。若确认草稿语义，建议把卡内"真的发起一次追问"的措辞改成"追问必须被可见地接住并进入可发送状态"，避免下一次验收再次歧义。
3. 交接载荷走 router `state`：浏览器**刷新**会保留 `history.state`（我的 E3 只覆盖"返回"），刷新后回执与草稿可能再现——不会重跑（地址栏 prompt 已清），但与"用完即清"的直觉略有落差；如需彻底，可把 echo 也做成一次性。
4. `/research/<symbol>?prompt=…` 会先渲染一帧标的研究页再跳 `?mode=fast`（E1 的第一帧），有轻微闪烁；如需消除可把消费提前到渲染前。
5. `/research?mode=fast&prompt=`（空 prompt + 有 mode）不清理地址栏（§0 边界④）。

## 7. 未验证 / 我不知道的

- **未做真浏览器 E2E**（无 Playwright 运行），全部结论来自 jsdom 夹具。
- **未独立复验"连续两次不同追问"**（复用实现者用例 9 + 读码）。
- **未运行后端**（本卡不涉及）；按环境事实未跑全量 pytest。
- 未验证极长 prompt 在真实浏览器地址栏/后端链路的表现（仅验到前端草稿不截断）。

## 8. 复现命令（供编排者复核）

```powershell
# 门禁（原样，在 frontend/ 下）
bun x vitest run tests/ResearchFollowupPrompt.test.tsx
bun x vitest run tests/AppNavigation.test.tsx tests/AuthUnavailable.test.tsx tests/ChatBacktestRedirect.test.tsx tests/ChatSessionDeepLink.test.tsx tests/ChatStarterDraft.test.tsx tests/ListFailureNotEmptiness.test.tsx tests/ResearchLanding.test.tsx tests/ResearchModeRouting.test.tsx tests/ResearchWorkspaceEvidence.test.tsx
bun run build

# 我的独立夹具（需要先把 %TEMP%\vs24 用 junction 挂到 frontend\.vs24-eval-tmp，见日志目录）
bun x vitest run --config "$env:TEMP\vs24\vitest.eval.config.ts"        # 真源 7 passed
bun x vitest run --config "$env:TEMP\vs24\vitest.mutated.config.ts"     # 变异 3 failed | 4 passed
bun x vitest run --config "$env:TEMP\vs24\vitest.racecheck.config.ts"   # 竞态已修 24 passed
```

临时/夹具/变异/日志文件均在 `%TEMP%\vs24\`（跑完回收进回收站），仓库未被写入任何临时文件（`frontend\.vs24-eval-tmp` 只是 junction，验收结束即回收）。
