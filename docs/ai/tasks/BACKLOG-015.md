# BACKLOG-015 — 龙虎榜历史上榜记录列表

> 状态：`[DONE]` ｜ 优先级：P1 ｜ 创建：2026-09-02 ｜ 执行者：Codex
> 背景：BACKLOG-012 上线龙虎榜卡片，BACKLOG-014 加了日期切换（窗口终点）。目前 `ResearchWorkspace.tsx` 龙虎榜卡片只渲染 `dragonTiger.items[0]`（`[date-30d, date]` 窗口内**最近一次**上榜），而服务端其实返回整个 `items` 数组（窗口内**多次**上榜记录）。本任务把单条展示升级为**历史上榜记录列表**：用户可看到所选窗口内全部上榜次数，点击任意一条切换查看其上榜原因/净买额；仅最近一条（`items[0]`）由服务端附带买卖席位 TOP5，历史条目用占位说明（不补造席位）。
>
> **开工前必读（维护者调研结论，勿跳过）**：
> 1. **零后端改动、零新依赖**：服务端 `dragon_tiger`（`backend/app/services/a_stock_extra.py` L414-458）返回 `items` 数组，已含每次上榜的 `{code, name, date, reason, net, unit, top5_buy, top5_sell}`。**关键语义**：仅 `items[0]`（最近一次，即 `latest_date` 那次）带真实 `top5_buy/top5_sell`，其余历史条目该两字段为 `[]`（服务端 `top5_buy if index == 0 else []`）。前端类型 `DragonTigerItem`/`DragonTigerResponse` 已定义（`frontend/src/types/research.ts` L132-149）。
> 2. **当前落点**：`frontend/src/pages/ResearchWorkspace.tsx` 龙虎榜卡片（`data-testid="dragon-tiger-card"`）内 `{dragonTiger?.items.length ? (() => { const record = dragonTiger.items[0]; ... })() : <Empty .../>}`——只取 `[0]`。本任务改成：左侧/上方列所有 item 供点击选中，主体渲染**当前选中**的 item。
> 3. **选中态语义**：新增本地 state `selectedDragonTigerIndex`（默认 0 = 最近一次）。点击任意历史 item → 切到它。切换选中**不重新请求**（数据已在 `items` 里），纯前端 state 切换。参考既有 `Descriptions`/`Table`/`Segmented`/`List` 用法。
> 4. **席位占位诚实纪律**：选中历史条目且 `top5_buy/top5_sell` 为空数组时，展示占位说明文案（如"该次上榜无买卖席位明细（东财仅提供最近一次席位 TOP5）"），**不补造、不用当前条重复 TOP5**。若未来服务端补齐某历史条目的席位，空数组文案自然消失。
> 5. **不回归既有**：`items[0]` 的 TOP5 展示逻辑保持（仍有席位数据）；`changeDragonTigerDate`（BACKLOG-014 实现）不改变；切日期或切换代码时 `selectedDragonTigerIndex` 需**重置为 0**（新窗口的"最近一次"变化了）。龙虎榜 E2E `frontend/e2e/dragon-tiger.spec.ts` 与 `ResearchWorkspaceEvidence.test.tsx` 既有断言不能破坏（DOM 变化可更新断言，不得放宽语义）。
> 6. **i18n 双语**：新文案 key 需 zh/en 同步、parity 差集 0（含新增 key）。

---

## 允许修改

- `frontend/src/pages/ResearchWorkspace.tsx`（龙虎榜卡片改为历史记录列表 + 选中切换）
- `frontend/src/i18n/zh.ts`、`frontend/src/i18n/en.ts`（新增 key 双语同步）
- `frontend/tests/ResearchWorkspaceEvidence.test.tsx`（扩展：多记录渲染、选中切换、席位占位、切日期重置选中、切代码重置）
- `frontend/e2e/dragon-tiger.spec.ts`（**追加** 1 用例：多记录列表渲染 + 点击切换选中；既有用例不得删改语义）
- `docs/ai/tasks/BACKLOG-015.md`、`docs/ai/EXEC_PLAN.md`、`task/CHANGELOG.md`

## 禁止修改

- `backend/` 全部（服务层、router、schema、auth、测试）
- `frontend/src/hooks/useLightweightCharts.ts`、`frontend/playwright.config.ts`
- 既有 E2E 断言语义（dragon-tiger.spec 现有 1 用例、money-flow/limit-pool 只读；DOM 变化可更新断言不得放宽语义）
- 其他页面/组件行为（股票切换、资金流卡片、LimitPool、Discover 等只读）
- **不新增任何 npm/Python 依赖**；**不删除任何文件**（如需清理走回收站）

---

## 完成标准

### 目标 1：龙虎榜历史上榜记录列表

`frontend/src/pages/ResearchWorkspace.tsx` 龙虎榜卡片内：
- 新增 state `selectedDragonTigerIndex`（`number`，默认 0）；在 `loadWorkspace` 和 `changeDragonTigerDate` **成功**后重置为 0（新窗口/新代码的"最近一次"变化）
- 卡片改为：先渲染上榜记录列表（`dragonTiger.items`），每条显示 `date`（上榜日）+ `reason`（上榜原因，截断过长）+ 净买额 `formatWan(net, 'CNY_10K')`；点击选中（可用 AntD `List` + `Segmented` 或 `Radio.Group` 或 `Menu`，选一种最小体积方案，当前选中条目高亮）
- 列表下方渲染**当前选中** item：`{code, name, date, reason, net}` 用既有 `Descriptions`；`top5_buy/top5_sell` 非空时渲染既有两个 `Table`；为空数组时渲染占位说明（新 i18n key）
- 仅 A 股卡片（既有 `/^\d{6}$/` 包裹天然满足）
- 新 i18n key（zh/en 同步）：`research.dragonTiger.historyTitle`（如"上榜记录"）、`research.dragonTiger.noSeats`（如"该次上榜无买卖席位明细（东财仅提供最近一次席位 TOP5）"）、`research.dragonTiger.selectRecord`（列表/单选的可访问标签）

### 目标 2：测试与验证

- **`frontend/tests/ResearchWorkspaceEvidence.test.tsx` 扩展**：≥3 用例——多记录渲染（`items` 含多次，断言列表出现多次上榜记录 + 默认选中 items[0]）；点击切换选中（点历史条目 → 主体切换显示该条 reason/net，且不重新请求 dragon-tiger——`fetchDragonTiger` 调用数不变）；席位占位（选中无席位条目 → 显示 noSeats 文案，且 items[0] 的 TOP5 table 不误显示）；切日期/重载重置选中到 items[0]。沿用现有 mock researchApi + `act/resolveRequest` 时序手法
- **`frontend/e2e/dragon-tiger.spec.ts` 追加** 1 用例：mock 含多次上榜记录的 `GET /api/instruments/600519/dragon-tiger`，断言列表渲染多次、默认选中最近一次、点击历史条目后主体切换到该条（且不再触发 dragon-tiger 请求）
- 全量门禁：`cd frontend && bun run build`（4,242 modules 基线）、`bun run test`（121 files/331 tests 基线 + 新增）、`bun run e2e`（46 基线 + 1 新增，保持 workers:2/retries:1）；`git diff --check` 通过
- **零后端改动、零新依赖、无删除**

### 目标 3：文档同步

- `docs/ai/EXEC_PLAN.md` 标记 `[DONE]`（证据：功能/测试数/门禁结果）
- `task/CHANGELOG.md` 追加一条（**带 `## YYYY-MM-DD` 标题行**，参照 BACKLOG-014 条目格式）
- 无新端点 → `docs/API_CONTRACT.md`/`docs/ARCHITECTURE.md` 不需改

---

## 参考

- 服务端结构（只读）：`backend/app/services/a_stock_extra.py` L414-458（`items` 结构、仅 `index==0` 带席位）
- 前端类型（只读）：`frontend/src/types/research.ts` L132-149（`DragonTigerItem`/`DragonTigerResponse`）
- 落点：`frontend/src/pages/ResearchWorkspace.tsx` 龙虎榜卡片（`dragonTiger-card`）、`changeDragonTigerDate`（BACKLOG-014）、`selectedDragonTigerIndex` 重置点
- UI 先例：AntD `List`（ResearchWorkspace 已有 List 用法）、`Segmented`（资金流周期切换）、`Descriptions`/`Table`（龙虎榜卡片既有）
- 测试先例：`frontend/tests/ResearchWorkspaceEvidence.test.tsx`（mock researchApi + act/resolveRequest + 断言 fetcher 调用数不变）、`frontend/e2e/dragon-tiger.spec.ts` + `frontend/e2e/helpers.ts`

## 验证命令

```powershell
cd frontend
$env:Path = "D:\Technology_application\NVM_Windows\nvm_a\v22.19.0;$env:Path"
& "D:\Technology_application\NVM_Windows\nvm_a\v22.19.0\bun.exe" run build
& "D:\Technology_application\NVM_Windows\nvm_a\v22.19.0\bun.exe" run test
& "D:\Technology_application\NVM_Windows\nvm_a\v22.19.0\bun.exe" run test:e2e
cd .. && git diff --check
```

## 完成证据（执行后填写）

### 修改文件与功能

- 页面：`frontend/src/pages/ResearchWorkspace.tsx`。复用 AntD List + Button（渲染原生 button），列出全部记录的日期、截断原因和 `formatWan(net, 'CNY_10K')` 净买额；完整原因保留在标题、可访问名称与详情中。`selectedDragonTigerIndex: number` 默认 0，选中按钮高亮并带 `aria-pressed`，列表分组有双语可访问名称，支持键盘激活。
- 详情：显示当前条目的 code/name/date/reason/net。买卖席位任一数组非空时保持原两张 TOP5 表；两数组均空时只显示 noSeats 说明，不复用其他记录的席位。未来历史记录带真实席位时自然显示，不按索引强制屏蔽。
- 重置：仅在 `loadWorkspace` 的龙虎榜结果成功落地、`changeDragonTigerDate` 成功落地时重置为 0；切代码复用同一组件时也重置。日期请求 pending/失败保留当前选中记录及旧数据，既有失败日期回滚/错误去重不变。
- i18n：`frontend/src/i18n/zh.ts`、`frontend/src/i18n/en.ts`，同步新增 historyTitle/noSeats/selectRecord/code/name 五个 key。
- 组件测试：`frontend/tests/ResearchWorkspaceEvidence.test.tsx`，原 6 项保留、新增 6 项（12 项）。覆盖多记录默认选择与原买卖席位、本地切换及负净额/占位/恢复、历史席位补齐、pending 保留后成功切到更短窗口、失败保留后工作区重试重置、真实 MemoryRouter 代码导航重置；请求计数断言与 act/resolveRequest 时序保留。
- E2E：`frontend/e2e/dragon-tiger.spec.ts`，追加 1 项（共 2 项），覆盖双记录、默认选中、历史详情与席位缺失、鼠标切换与键盘返回、切换前后请求数严格相等。既有用例仅 4 个正向文本 locator 收窄到 `dragon-tiger-detail`，请求方法/路径/date/look_back、断言文本/匹配器、旧记录消失、snapshot 不重取全部保留；已与 HEAD 用例做归一化精确比较。
- 文档：本卡、`docs/ai/EXEC_PLAN.md`、`task/CHANGELOG.md`；共 8 个允许文件。无新端点，不改 API/架构文档；按本卡白名单不改 HANDOFF.md，也不运行会写入该文件的 handoff-log 脚本。

### 验证结果

基线来源为本卡与 BACKLOG-014 的已提交记录；本轮未重跑修改前完整套件。以下为 2026-09-02 修改后的实际验证。

| 门禁 | 已提交基线 | 本轮结果 |
| --- | --- | --- |
| `bun run build` | 4,242 modules | 通过，4,242 modules，OpenAPI 59 schemas fresh，TypeScript 通过 |
| `bun run test` | 121 files / 331 tests | 121/121 files、337/337 tests 通过（+6），933.95s |
| `bun run test:e2e` | 46 tests | Chromium 47/47 通过（+1），58.9s，workers:2/retries:1 保持原配置，最终运行无重试 |
| 龙虎榜组件专项 | 6 tests | 12/12 通过，新增 6 项 |
| zh/en key 审计 | 2,265 / 2,265 | 2,270 / 2,270，重复 0、差集 0 |
| `git diff --check` | 通过 | 通过；最终 8 文件白名单、禁止路径、无删除、空暂存区与 HEAD 检查通过 |

执行顺序为 build → 全量 Vitest → 全量 E2E。首轮 E2E 为 46 passed / 1 failed：新增用例把首次请求数误设为 1，实际 `main.tsx` 的 React StrictMode 在开发模式初始请求 2 次（失败发生在点击前）。仅修正新增用例为加载后记录请求基数、切换后严格比较不增加，重跑完整 E2E 达到上表结果；原 46 项均保持通过。生产代码在 build/Vitest 通过后未再改动。

构建保留现有大 chunk 提示；Vitest 有 jsdom `getComputedStyle` 伪元素未实现提示，但完整套件 exit 0。未新增依赖、未改配置来规避提示或放宽门禁。

### 边界与决策确认

- 选中切换只更新本地 state，不调用任何 fetcher；仅切窗口日期走既有龙虎榜请求。
- 历史条目无席位使用双语占位，不补造、不把 `items[0]` 的席位复制到历史记录；最新记录两张表和既有数值格式保留。
- 日期/代码/工作区成功重载选中归零；日期 pending/失败不提前重置，避免旧详情丢失。
- 后端、chart hook、Playwright 配置、money-flow/limit-pool E2E、其他页面/组件、依赖与锁文件全部零修改；不新增依赖、不删除文件。
- HEAD 保持 `891416e`，暂存区为空；未 commit、未 push。
