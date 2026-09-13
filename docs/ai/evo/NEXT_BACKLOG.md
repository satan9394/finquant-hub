# NEXT_BACKLOG —— finquant-hub 单一待办清单

> **唯一清单**。用户裁决：NEXT / NIT / 待办收敛为这一份，不新建 `tasks/`，不改项目既有 `task/`。
> **生成时间**：2026-09-13 01:44（本机时间 `-07:00`，`Get-Date` 实测）。
> **基线锚点**：`main` @ `264648d8619f759b222cced6583169e6432d04d6`（显式 40 位提交号；不使用 `HEAD~1` 这类相对锚点）。本仓无 remote，不推送。
> **权威来源**：`finquant-mission-01/recon-report.md` §4.2（"下一步证据"）与 §4.3（明确拒绝/暂缓），叠加下列文档；本清单只按侦察结论收敛，不新增未在任何文档/源码中出现过的条目。
> **收录口径**：只收「尚未解决」或「只登记不动手」的项。凡已被独立验收 **ACCEPT** 的卡所解决的问题一律不入清单；相关字样仅在 §5「已解决、勿重开」以注解身份出现并**显式标注**。
> **状态取值（四值，逐条必填）**：`未开始` / `进行中` / `已否决` / `待评估`。
> **严重度**：🟠 真实缺陷或高价值新需求｜🟡 需评估或需人裁决｜NIT 观感 / 技术债，明确非阻塞。
> **纪律**：本清单不改写任何历史档案（`docs/ai/evo/*` 既有评估文件、`task/CHANGELOG.md` 历史条目一字未动）；**未在任何原文档添加指针行**（故 `git diff --name-only` 为空，见交付证据）。

## 0. 条目总览（共 16 条）

| 组 | 条目 | 数量 |
|---|---|---|
| 🟠 P1 | P1-1 ~ P1-2 | 2 |
| 🟡 P2 | P2-1 ~ P2-5 | 5 |
| NIT | NIT-1 ~ NIT-6（观感 4 条 + 同组追加 2 条） | 6 |
| 文档类 | D-1 ~ D-3（只登记不修改） | 3 |

---

## 1. 🟠 P1（真实缺陷 / 高价值新需求）

### P1-1 `GlobalTaskEntry.tsx` 的 `saved` / `recent` 读取失败仍与"确实为空"同形

- **状态**：未开始
- **严重度**：🟠
- **来源**：`docs/ai/evo/EVALUATION_RESULT_VS38.md` §7 NIT-1（第 284 行）；`task/CHANGELOG.md` 附五 NIT②（第 812 行）；`DSH_RECOVERY_REPORT.md` §8.3-2（第 100 行）与 §8.5 NIT②（第 128 行）
- **本轮核实（基线 `264648d`）**：`frontend/src/components/GlobalTaskEntry.tsx:87` 仍为 `.catch(() => setSaved([]))`；`:77` `recent` 由 `readRecentTargets` 初始化、`:84` 重新读取（其内部同样把失败归约为空数组）。渲染侧 `targetList` 在 `items.length === 0` 时整块不渲染 ⇒ 读取失败与"确实没有已保存研究"在屏幕上同形。
- **为何 VS-38 未收口**：验收者原文——「卡面验收标准只点了 `results`……但『本族收口』的声明因此并不严格成立」；处置沿用 VS-36 先例（扫到即列出、不扩卡）。
- **建议动作**：复用族内已验收的三态契约（`LoadFailureAlert.tsx` 的 `ReadState` / `readStateOf` / `LoadStateView`，由 `8d05556` 建立），含反向断言（当前实体自己失败仍须显示）与请求计数证明重试真重发。**属新修复，须独立验收**。

### P1-2 `swarmApi.ts` 没有历史回放拉取（新需求，非缺陷）

- **状态**：待评估（**须先出只读评估卡，不直接实现**）
- **严重度**：🟠
- **来源**：`docs/ai/evo/PRODUCT_STATE.md` R439 补二 🟠（第 327 行）；`DSH_RECOVERY_REPORT.md` §6-3（第 56 行，判定"暂缓，需先单独评估是否值得做"）
- **本轮核实（基线 `264648d`）**：`frontend/src/services/swarmApi.ts` 全文 59 行，只有两个团队定义拉取（`fetchFourMastersTeam` / `fetchEarningsReviewTeam`）+ 实时 SSE 流（`streamFourMasters` / `streamEarningsReview`），**没有任何历史回放接口**；唯一回放入口 `deriveAgentOutcomes` 在 `frontend/src/pages/Research.tsx:269`，只遍历 research 的 `AGENT_KEYS`。
- **建议动作**：作为 Mission 2 首张卡做**只读评估**——先回答"历史回放的数据源是否存在（`backend/app/services/swarm_orch.py` 是否落库）"与契约形态，评估通过再决定是否开工。

---

## 2. 🟡 P2（需评估 / 需人裁决）

### P2-1 `MonitorToday.test.tsx:30` 渲染 `ResearchRuns` 未传必填 `onRetry`

- **状态**：未开始｜**严重度**：🟡
- **来源**：`docs/ai/evo/PRODUCT_STATE.md` R439 补二 🟡（第 329 行）；`docs/ai/evo/PRODUCT_GAP_MAP.md:197`（LATER 段）与 `:221`（测试卫生段）
- **本轮核实（基线 `264648d`）**：`frontend/src/components/ResearchRuns.tsx:8-21` 的 props 中 `onRetry: () => void` 为**必填**；`frontend/tests/MonitorToday.test.tsx:30` 只传了 `runs`。`frontend/tsconfig.json` 的 `include` 仅 `["src","vite-env.d.ts"]` ⇒ `tsc -b` 不检查 `tests/`，所以**这不是构建红，而是潜伏的类型缺口**（一旦 tests 被纳入 tsc，或该 prop 在运行时被调用即暴露）。
- **建议动作**：补 `onRetry`（如 `vi.fn()`），并全仓核对是否存在同类缺参调用点；**零生产代码改动**。

### P2-2 约 40 处族外「发起时清失败态」

- **状态**：待评估（**数量未复核**）｜**严重度**：🟡
- **来源**：`docs/ai/evo/PRODUCT_STATE.md:302`（R439 · VS-29 交付要点「遗留」）；`DSH_RECOVERY_REPORT.md` §6-4（第 57 行）；`recon-report.md` §7-8（侦察员明示**未自行计数**）
- **口径**：VS-29（`8d05556`）已划出家族边界并给出后续判据，但"约 40 处"为当时登记值，**本轮未复核**。
- **建议动作**：**不整批开工**，沿用 VS-36 / VS-38 先例「扫到即列出、不扩卡」；若要排期，先出一张只读计数卡（以 VS-29 家族判据为准）再决定，避免用拍脑袋的数字排期。

### P2-3 A5-P2-5 高频 AI 入口不在主导航

- **状态**：**已否决**（NOT_NOW，维持）｜**严重度**：🟡
- **来源**：`docs/ai/evo/PRODUCT_GAP_MAP.md:196`（🟡 NEXT 段）与 `:212`（A5 清单 P2-5）；`DSH_RECOVERY_REPORT.md` §6-5（第 58 行，"等有明确用户反馈再排"）；`recon-report.md` §4.2-6、§4.3
- **本轮核实（基线 `264648d`）**：`frontend/src/App.tsx:60-120` 的 `navigationGroupDefinitions` 只有 today / research / discover / strategy / portfolio / monitor / library / settings 八组，`/chat` `/discussion` `/thesis` `/compare` **确实不在主导航**（文档记其"只在首页"）⇒ 事实成立。
- **处置**：属用户体验类，**维持已否决**；仅登记，不排期。

### P2-4 A5-P3-6 `start.bat` 在 `.venv` 存在时跳过依赖安装

- **状态**：未开始（原「状态存疑」——**本轮已复核：仍成立**）｜**严重度**：🟡
- **来源**：`docs/ai/evo/PRODUCT_GAP_MAP.md:196` 与 `:213`（A5 P3-6）；`DSH_RECOVERY_CHECKPOINT.md` §4-3；`recon-report.md` §7-7（列为**待复核项**）
- **本轮复核（基线 `264648d`）**：`start.bat:37` = `if exist "backend\.venv\Scripts\python.exe" goto frontend` ⇒ 只要 venv 已存在就**跳过后端依赖安装**（安装只在新建分支执行）⇒ "更新代码后不补依赖、把补依赖交给用户手打 CLI"这一现象**仍然成立**，不是过期陈述。
- **风险提示**：`start.bat` 是承重脚本（CRLF、引号、续行缩进、`-Filter` 尾星等，见 `AGENTS.md:97-105`），动它必须逐字复制原行并经 `cmd.exe` 实跑。

### P2-5 `scripts/audit.py:423` 未使用变量（F841）

- **状态**：未开始｜**严重度**：🟡
- **来源**：`DSH_RECOVERY_REPORT.md` §4-3（第 41 行）与 §8.3-5（第 103 行）；`recon-report.md` §4.2-3（附**口径更正**）
- **本轮复核（基线 `264648d`）**：`.\backend\.venv\Scripts\python.exe -m ruff check --no-cache --select F --isolated scripts\audit.py` → `F841 Local variable 'hooks_dir' is assigned to but never used --> scripts\audit.py:423:5`，`Found 1 error`，exit 1。
- **口径（勿误用）**：项目门禁是 `cd backend && ruff check .`，该作用域实测 `All checks passed!`；本错误只在**根作用域 / 单文件作用域**下可见 ⇒ `scripts/audit.py` **不在 backend 门禁作用域内**。
- **建议动作**：零行为变更地处理该赋值；不得改动 backend 作用域结论，不顺手扩卡。

---

## 3. NIT（6 条：观感 4 条 + 同组追加 2 条，均明确非阻塞）

> NIT-1 ~ NIT-4 即卡面要求的「观感 NIT ×4」：`EVALUATION_RESULT_VS38.md` §7 与 `EVALUATION_RESULT_VS39.md` §7 共六条 NIT 去重后的四条（`saved` / `recent` 已提升为 P1-1；"重试操作数不可区分"两张卡各一条，合为一条）。
> NIT-5 ~ NIT-6 为 `recon-report.md` §4.2 P3 同组条目（规则精度 / 技术债滚动清单），一并溯源登记，未凭空新增。

### NIT-1 失败时瞬时 toast 与新内联失败态并存（冗余观感）

- **状态**：未开始｜**严重度**：NIT
- **来源**：`EVALUATION_RESULT_VS38.md` §7 NIT-3（第 286 行）；`EVALUATION_RESULT_VS39.md` §7 NIT-1（第 278 行）；`task/CHANGELOG.md` 附五 NIT③（第 812 行）
- **位置**：`frontend/src/pages/Discover.tsx:130`（`message.warning(t('discover.factorUnavailable'))`）与 `GlobalTaskEntry` 的同类 toast。非缺陷。

### NIT-2 因子重试连带重跑整个 `run()`

- **状态**：未开始｜**严重度**：NIT
- **来源**：`EVALUATION_RESULT_VS39.md` §7 NIT-3（第 280 行）；`task/CHANGELOG.md` 附五 NIT④（第 812 行）
- **事实**：重试因子会重新 `searchStocks` + `POST /screening` ⇒ 多 2 个请求；用例 3 的计数只对 `searchAlpha` 断言，**未覆盖**该行为。非缺陷。

### NIT-3 重试的"操作数"在 UI 上不可区分（判据空隙，非缺陷）

- **状态**：待评估｜**严重度**：NIT
- **来源**：`EVALUATION_RESULT_VS38.md` §7 NIT-2（第 285 行）；`EVALUATION_RESULT_VS39.md` §7 NIT-2（第 279 行）；`task/CHANGELOG.md` 附五「判据空隙①」（第 810 行）
- **事实**：`runSearch(scopedFailure?.query)` 与 `runSearch()` 在当前渲染条件下等价；若将来去掉"失败态按 `query.trim()` 收窄"这道门即会分叉。建议后续补一条「输入框已改词时点重试，仍须重发失败所属词」的用例。

### NIT-4 VS-34 残留：非 `Error` rejection 时 toast 无文案；Chat 角色失败态有两份

- **状态**：未开始｜**严重度**：NIT
- **来源**：`docs/ai/evo/PRODUCT_STATE.md` R439 补二 🟡（第 330 行，转引 `EVALUATION_RESULT_VS34.md` §8）
- **注意**：第二项（Chat 角色失败态两份）文档明确写为**有意冗余**；登记仅用于防止后人误判为缺陷。

### NIT-5 VS-37 复验 NIT③：第三方豁免对"强框架词"一并生效

- **状态**：待评估｜**严重度**：NIT
- **来源**：`docs/ai/evo/EVALUATION_RESULT_VS37.md` 复验轮（第 329-331 行）
- **事实**：形如 `依据 RFC 9457 已删除的原文："X"` 不告警；**需真来源编号紧邻才可达，本仓 0 命中**，不影响退出码。

### NIT-6 技术债 / 风险滚动清单

- **状态**：进行中（滚动跟踪，不单独立卡）｜**严重度**：NIT
- **来源**：`docs/ai/evo/PRODUCT_STATE.md` §技术债 / 风险（第 213-218 行）
- **内容**：无内置模型单价、历史费用无快照、UTC 时区提示、用量面板多请求、`AlphaSimulationWorkbench` 负载 flake；另有"全量 pytest 在特定沙箱 `no_proxy` 下挂起"——属**环境问题**，非产品缺陷。

---

## 4. 文档类（3 条，**只登记不修改**，本轮未动一个字节）

### D-1 `README.md` 路由计数漂移（写 22，实测 23）

- **状态**：未开始｜**严重度**：🟡
- **来源**：`recon-report.md` §4.2-13、§6 R8；`README.md:5` 与 `:104`；对照 `AGENTS.md:50`、`:53`
- **本轮实测（基线 `264648d`）**：`backend/app/routers/*.py` 共 **23** 个 `APIRouter(` 定义（23 个文件各 1 个）；`backend/app/main.py:16` import 的 router 模块**恰为 23 个**，`:135` 显式挂载 1 个 + `:136-140` 循环挂载 22 个 = **23 个全部挂载**。而 `README.md:5` / `:104` 仍写「**22** 个 APIRouter、135 个 `/api/*` 路径、169 个 HTTP 操作」，`AGENTS.md:50` / `:53` 写「**23** APIRouters、133 个 `/api/*` 路径」。
- **历史张力（需人工裁决口径）**：`HANDOFF.md:228` 记载 2026-09-04 的 BACKLOG-025 曾把三处计数统一为 22/135/169 并声称"与运行时 OpenAPI 一致" ⇒ 该结论在当时可能成立，但在其后新增 router 后**已过期**。路径数 / 操作数（135 / 169 vs 133）本轮**未核对**（需跑 OpenAPI 导出，会产生构建产物）。
- **处置**：**只登记不修改**（避免顺手扩卡）。`README:104` 自己已声明"运行时 OpenAPI 是最终校验来源"。

### D-2 `docs/ai/EXEC_PLAN.md` 的「未 commit」声明与 git 事实不符

- **状态**：未开始｜**严重度**：🟡
- **来源**：`recon-report.md` §4.1、§6 R11；`docs/ai/EXEC_PLAN.md:19`（BACKLOG-047）与 `:27`（BACKLOG-046）
- **事实**：上述 `[DONE]` 条目正文写「未 commit」，但对应提交**早已是 `main` 的祖先**——本轮 `git merge-base --is-ancestor <c> main` 对下列提交逐条 exit 0：BACKLOG-046 → `bc0d59c`（2026-09-10）、BACKLOG-047 → `9cbe1d4`（2026-09-10）、BACKLOG-048 → `37cbd4b`、BACKLOG-049 → `d249644`（另核 042b `c8735c3` / 043 `3f1e5a1` / 044 `693ede6` / 045 `3718cee` 同为祖先）。
- **⚠️ 本轮更正一处卡面 / 侦察报告的轻微失真**：卡面与侦察报告均称 BACKLOG-046/047/**048** 正文写「未 commit」；本轮逐行核对，`EXEC_PLAN.md:7-11` 的 BACKLOG-048 条目**不含**「未 commit」（其正文写的是"维护者独立复核合入"）。「未 commit」实际见于 046、047 及其前后多张（042b / 043 / 044 / 045）的 `[DONE]` 正文。
- **口径**：**任何"是否已提交 / 是否已完成"的判断以 git 为准**，不采信文档自述；本清单只登记，不回改历史条目。

### D-3 `HANDOFF.md` 相对 HEAD 过期

- **状态**：未开始｜**严重度**：🟡
- **来源**：`recon-report.md` §4.1、§6 R8
- **本轮核实（基线 `264648d`）**：`HANDOFF.md:4` 写"最近更新 2026-08-21"（比 HEAD 早约 3 周）；`:8` 当前目标仍是「**Local OSS v1 发布就绪**……发布前收尾」；`:96` 仍写「LICENSE 文件创建……根目录未创建。发布前必须完成」，而根目录 `LICENSE` 实测存在（`Test-Path LICENSE` → `True`）且 `:28` 的勾选项已是 `[x]`、`:31` 已有 2026-09-13 核实说明 ⇒ **同一文件内自相矛盾**。
- **⚠️ 本轮更正一处侦察失真**：侦察 §4.1 称"DoD 三项已完成却仍标着未勾选"；本轮实测 `:28`-`:30` 三项**均已 `[x]`**（BACKLOG-046 已勾清）。残留问题因此是**正文与更新日期过期**（`:8` 的目标、`:96` 的"未创建"、`:4` 的日期），**不是勾选状态**。
- **处置**：只登记。若将来要改，必须**整句替换 + 读回核对 + grep 复核旧句不残留**（元教训：子串替换只换半句已犯过两次）。

---

## 5. 已解决、勿重开（**不得作为待办**，仅作注解登记）

> 本节所有条目都是**已完成并独立验收 ACCEPT**（或已明确裁定）的问题。列在此处唯一目的是防止后来者重新捡起；**任何一条都不得进入排期或派卡**。

- **勿重开**：`NOW-1` / `NOW-2` / `NOW-3` / `NOW-4`（A5-P1-1、A5-P2-3、D5-🔴、A5-P1-2/P2-4）——**已由 VS-24…VS-29 完成并 ACCEPT**。来源：`docs/ai/evo/PRODUCT_GAP_MAP.md:192-195`；`docs/ai/evo/PRODUCT_STATE.md:289-302`（R439 收官账）。
- **勿重开**：`Discover.tsx:49` 的 `nameSearchFailed` 未按查询词作用域——**已由 VS-36 修复**（实现 `37c3eef`，独立验收 ACCEPT `ba725bd`）。来源：`PRODUCT_STATE.md` R439 补二第 328 行（该行的现状陈述已随修复作废）。
- **勿重开**：`alpha/AlphaResearchPanel.tsx:25` 的 `searchError` 未按查询词作用域——**同上，已由 VS-36 一并修复**（`37c3eef` / ACCEPT `ba725bd`）。
- **勿重开**：`IMPLEMENT_RESULT_VS38.md` §2 的 `:219-239` 区间歧义——**已裁定不回改**（验收归档已引用该句，事后修改会让两份档案互相矛盾）。来源：`DSH_RECOVERY_REPORT.md` §8.5 NIT①（第 128 行）；`task/CHANGELOG.md` 附五 NIT①（第 812 行）。
- **勿重开**：VS-33 的替代防护建议「给 `scripts/audit.py` 加形态级规则」——**已由 VS-37 实现并 ACCEPT**（`e101617`，含 3 条 NIT，其 NIT③ 见本清单 NIT-5）。来源：`PRODUCT_STATE.md:331`；`EVALUATION_RESULT_VS37.md`。
- **勿重开**：`PRODUCT_GAP_MAP.md:204`「三通道实为一通道」——**已由 VS-28 接上真实消费方**（`3109b6e`），原注已随卡作废。
- **勿重开**：VS-29 的 F1（`Discussion.tsx` 错误原文未按房间作用域）——**已由 VS-32 修复**（`27233a4`，ACCEPT `e2b9ff9`）。
- **不构成待办（已裁定达标）**：`DiscoverThemes` 快捷选词按钮不受 loading 门控——VS-39 裁定「卡面把它写在现状而非验收标准，实现以 `requestId` 归属守卫使其**安全**而非掩盖」。来源：`task/CHANGELOG.md:811`；`DSH_RECOVERY_REPORT.md` §8.3-3。

---

## 6. 本清单的边界声明

1. **未收录已 ACCEPT 的问题**：已解决项只在 §5 以「勿重开」注解出现，**不以待办身份出现**（grep 自证见交付证据）。
2. **未改动任何历史档案**：`docs/ai/evo/*` 既有评估文件、`task/CHANGELOG.md` 历史条目、`docs/ai/EXEC_PLAN.md`、`HANDOFF.md`、`README.md`、`AGENTS.md` **均一字未动**；**未添加任何指针行**（因此 `git diff --name-only` 为空）。若后续确需指针行，必须整句替换 + 读回核对 + grep 复核旧句不残留。
3. **未凭空新增**：条目全部来自 `recon-report.md` §4.2 / §4.3 与上列文档。侦察报告未登记、仅在其他文档滚动出现的项——例如 `PRODUCT_GAP_MAP.md:237` 的 O1（在途窗口点"创建"提示不准确）、`:241` 的 `ResearchFollowupPrompt.test.tsx` 首条用例逼近 5s 超时——**本轮未独立核实，故未登记**；如需纳入，请先核实现状再新增条目，不要凭文档自述排期。
4. **本轮未做的验证**（如实声明）：前端 `bun run test` / `bun run build`、后端全量 `pytest`（本机沙箱会挂起）、OpenAPI 导出均未跑；「约 40 处」计数与 `/api/*` 路径数 / HTTP 操作数未复核；D-1 的 133 vs 135 口径未裁决。
5. **证据时效**：本清单所有行号与文件内容锚定在 `264648d8619f759b222cced6583169e6432d04d6`；后续提交会使部分行号漂移，引用时请以显式提交号复核。

---

## 附：来源台账（文档 + 提交号）

| 来源文档 | 引用位置 | 对应条目 |
|---|---|---|
| `docs/ai/evo/EVALUATION_RESULT_VS38.md` | §7 NIT-1/2/3（284-286） | P1-1、NIT-1、NIT-3 |
| `docs/ai/evo/EVALUATION_RESULT_VS39.md` | §7 NIT-1/2/3（278-280） | NIT-1、NIT-2、NIT-3 |
| `docs/ai/evo/EVALUATION_RESULT_VS37.md` | 复验轮 NIT③（329-331） | NIT-5、§5 |
| `docs/ai/evo/PRODUCT_STATE.md` | R439（289-302）、R439 补（313-316）、补二（317-331）、技术债（213-218） | P1-2、P2-1、P2-2、NIT-4、NIT-6、§5 |
| `docs/ai/evo/PRODUCT_GAP_MAP.md` | 192-197、205-213、219-221 | P2-1、P2-3、P2-4、D-1、§5、§6 |
| `docs/ai/evo/RECOVERY_DOCS_SUPERSEDED.md` | 全文（索引 / 墓碑页，原件只读） | 收录口径、§5 |
| `DSH_RECOVERY_REPORT.md` | §4-3（41）、§6-3（56）、§6-4（57）、§6-5（58）、§8.3（100/103）、§8.5（128） | P1-1、P1-2、P2-2、P2-3、P2-5、NIT-1、NIT-2、§5 |
| `DSH_RECOVERY_CHECKPOINT.md` | §4-3 | P2-4 |
| `task/CHANGELOG.md` | 附五（802-814） | P1-1、NIT-1、NIT-2、NIT-3、§5 |
| `docs/ai/EXEC_PLAN.md` | 7-11、19、27 | D-2 |
| `HANDOFF.md` | 4、8、28-31、96 | D-3 |
| `README.md` | 5、104；对照 `AGENTS.md:50,53` | D-1 |
| `recon-report.md`（Mission 侦察报告） | §4.2、§4.3、§6 R8/R11、§7-7、§7-8 | 全部条目的收敛依据 |

**提交号锚点**：`264648d`（本清单基线）｜`f74a26e`（VS-38/39 验收归档）｜`38c0e3e`（VS-38/39 收尾实现）｜`cf2514a`（VS-38/39 任务书）｜`e101617`、`075b528`、`ba725bd`、`37c3eef`、`4cc1ef5`（VS-36 / VS-37）｜`8d05556`（VS-29 三态契约）｜`3109b6e`（VS-28）｜`27233a4`（VS-32）｜`92055e0`（VS-34）｜`92b1b35`（VS-35）｜`bc0d59c`、`9cbe1d4`、`37cbd4b`、`d249644`（BACKLOG-046/047/048/049）｜`c8735c3`、`3f1e5a1`、`693ede6`、`3718cee`（BACKLOG-042b/043/044/045）。
