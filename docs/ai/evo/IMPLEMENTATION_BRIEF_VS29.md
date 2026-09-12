# IMPLEMENTATION_BRIEF — Vertical Slice 29：三态契约收口（"加载中 / 空 / 失败"必须可区分）

> Orchestrator 第五阶段产物。来源：**R5 审计 A5 的 P1-2 + P2-4**（`PRODUCT_UX_REPORT_R5.md`）与基线质疑方向④，编排者列为 **NOW-4**。

## 目标
把"**加载中 / 没有数据 / 读取失败**"三种状态在界面上**真正区分开**，并且**在组件层表达**——不是继续按面打补丁。

## 为什么要"补契约"而不是"逐面修"（A5 的根因级观察）
`frontend/src/components/LoadFailureAlert.tsx`（VS-22 建立）的契约**只有 `error` / `onRetry`，没有 loading/empty 维度**。因此每个使用点都只能自己拼状态判断，于是"**加载中仍渲染空态文案**"反复出现（VS-22 只分开了"失败 vs 空"，"**加载中 vs 空**"未分）。⇒ **该族的正确修法是先补契约，再回填各面**；否则每加一个面就再漏一次。

## 当前问题（A5 已核码，逐条给位置）
- **`frontend/src/pages/Discussion.tsx:126-137`**：详情请求 `catch` 只弹**一次 toast**；`roomDetail` **仅在 `!currentRoomId` 时清空** ⇒ `:302-306` 的 `loadingDetail || !roomDetail` 会**永久停在 Spin「加载中」**；切换房间**失败**时，右栏会显示**上一条讨论的内容**，而左栏已高亮新房间（**串台**）。
- **`frontend/src/pages/Dashboard.tsx:70-80`**：`loadStats` **没有 loading 态**；`:116` 的 `ResearchRuns` **无 loading 入参**（`ResearchRuns.tsx:8/19`）⇒ 在途期间渲染"暂无会话/暂无讨论"与 `<p>UNKNOWN</p>`。
- **`frontend/src/components/MemoryManager.tsx:119,122`**（A5 之外，VS-22 验收补充）：**同一屏幕上同时显示"读取失败"与"暂无研究记忆"**——不是"失败伪装成空"，而是**两者公开并存、互相否定**。
- **口径不一致**：`Dashboard.loadStats` 重试时**先清失败态**，往返期间瞬时退回 UNKNOWN/"暂无"；而 `Chat`/`Discussion` 是"**仅成功才清**"。**同一产品两种口径**。

## 理想行为
1. **先补 `LoadFailureAlert` 的契约**：让它能表达**三态**（loading / empty / error），或明确其"只负责错误态"而由调用方以统一方式处理 loading/empty。**契约如何设计由你决定，但必须写进结果文件并说明理由**。
2. **加载中不得伪装成空**：三态在界面上**互斥且可辨**；在途时**不得**出现"暂无…"或 `UNKNOWN` 这类"确实没有数据"的文案。
3. **失败时不得串台**：切房间失败 ⇒ **不得**显示上一条的内容（`Discussion` 右栏）；失败态与"无数据"可区分。
4. **同屏不得自相矛盾**：`MemoryManager` 那处不得同时出现"读取失败"与"暂无…"。
5. **口径统一**：重试期间是否清失败态，**全产品一种做法**（建议"**仅成功才清**"，因为清掉会让用户以为已经好了）；若你选择别的口径，须在结果文件说明并保持一致。

## 涉及模块
- `frontend/src/components/LoadFailureAlert.tsx`（**契约**）
- `frontend/src/pages/Discussion.tsx`、`frontend/src/pages/Dashboard.tsx`、`frontend/src/components/ResearchRuns.tsx`、`frontend/src/components/MemoryManager.tsx`
- `frontend/src/i18n/{zh,en}.ts`（新增键**双写**）
- 相关测试

## 不能破坏
- **VS-22 的成果**：三处（Chat/Discussion 左栏、首页研究运行区块）"失败不再伪装成空"必须**仍然成立**，其既有测试全绿；
- **VS-19 的成果**：首页两张卡片的失败告警与"暂无…只在成功且为空时出现"必须仍然成立；
- i18n **zh/en 键集合一致**（当前各 2478 键 + 本卡新增，两边须一致且无重复）；
- 不加依赖、不改后端、不改 schema；不删文件；**不 commit**。

## 验收标准（可判定）
1. **三态可辨**：对每个回填的面，分别构造 **loading / empty / error** 三个夹具 ⇒ 三种状态**互斥且可辨**（贴断言）；特别断言**loading 期间不出现**空态文案或 `UNKNOWN`。
2. **不串台**：`Discussion` 切房间失败 ⇒ 右栏**不得**显示上一条内容（给出断言证明用的是"失败态"而非"旧数据"）。
3. **同屏不矛盾**：`MemoryManager` 那处给出断言（不同时出现两句）。
4. **口径统一**：列出全产品"重试时是否清失败态"的现状与本卡后的统一做法（给出各处对照）。
5. **零回归**：VS-22 与 VS-19 的既有测试全绿；i18n 两边键集合一致。
6. **鉴别力证明**：把新契约从**副本**退回"只有 error/onRetry"⇒ 至少一条新用例变红（贴原始输出）。
7. 门禁：相关 vitest 全绿 + **串行** `bun run build`（含 `tsc -b`）。

## 错误场景
- 失败后重试成功 ⇒ 错误态消失、正常内容出现；
- 失败且**本地无缓存** ⇒ 只能显示失败态（不得显示空态）；
- 失败但**本地有数据** ⇒ 明确选择策略（保留旧数据并标注"刷新失败" / 只显示失败态），**并说明理由**。

## 测试要求
- 新增用例须覆盖上述三态与串台场景；**鉴别力证明**必做。
- ⚠️ **本机已知**：`frontend/tests/ResearchWorkspaceEvidence.test.tsx` 的竞态由 **VS-26** 修复中，**与本卡无关**；若合并运行时它变红，**不要改它**、如实标注即可。
- 临时/变异文件放 `$env:TEMP`，**绝不放 `src/`/`tests/`**；**不要把门禁输出写进仓库目录**；做变异/还原验证**先声明窗口**。
- 由独立 Evaluator 复核：①三态是否真的可辨（**尤其 loading 期间不得出现空态文案**）；②是否真的不串台；③VS-19/VS-22 的成果是否仍成立。
