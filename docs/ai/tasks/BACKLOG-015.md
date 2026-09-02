# BACKLOG-015 — 龙虎榜历史上榜记录列表

> 状态：`[READY]` ｜ 优先级：P1 ｜ 创建：2026-09-02 ｜ 执行者：Codex
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

- 修改文件清单（页面/i18n/测试/文档）
- 功能清单（记录列表、选中切换、席位占位、选中重置语义）
- 测试数；全量套件结果（build/Vitest/E2E 前后对比）
- 依赖变化（应为零）；后端零改动确认
- 记录决策确认（选中切换不重新请求；历史条目无席位用占位不补造；切日期/代码重置选中；items[0] 席位展示不回归）