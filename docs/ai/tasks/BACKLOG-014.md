# BACKLOG-014 — 榜单交互闭环：涨停池点击穿透 + 龙虎榜日期切换

> 状态：`[DONE]` ｜ 优先级：P1 ｜ 创建：2026-09-01 ｜ 执行者：Codex
> 背景：BACKLOG-012 上线了涨停池页面（`/discover/limit-pool`，AntD Table）与 ResearchWorkspace 龙虎榜证据卡片，BACKLOG-013 给资金流卡片加了走势图 + 分钟/120 日切换。目前两个榜单都还是"静态展示"：涨停池行不能点进个股研究工作区；龙虎榜固定只查今天窗口（`fetchDragonTiger(currentSymbol, shanghaiToday())`），不能查历史日期。本任务把榜单变成**可交互入口**：①涨停池 `code` 列渲染为可点击链接穿透到 `/research/{code}`；②龙虎榜卡片加日期选择（复用 BACKLOG-013 周期切换的"只重取该数据 + 失败回滚"模式）。
>
> **开工前必读（维护者调研结论，勿跳过）**：
> 1. **零后端改动、零新依赖**：纯前端。龙虎榜服务端 `dragon_tiger(ticker, trade_date, look_back=30)` 已支持任意 `date` 参数（语义：**窗口终点**——返回 `[date-30d, date]` 窗口内该股**最近一次**上榜记录），前端 `fetchDragonTiger(symbol, date, lookBack=30)` 已存在（`frontend/src/services/researchApi.ts`），无需新增端点。
> 2. **涨停池穿透先例**：`frontend/src/pages/LimitPool.tsx` 的 `columns` 数组 L37-59，`code` 列（L38）目前是纯文本；`Table` 用 `rowKey="code"`。项目已有 `Link` 用法先例：`frontend/src/components/ResearchContinuity.tsx` L2/64（`import { Link } from 'react-router-dom'` + `<Link to={...encodeURIComponent...}>`）。目标路由 `/research/{code}`（A 股 6 位代码）由 ResearchWorkspace 处理（A 股守卫 `/^\d{6}$/` 天然满足）。
> 3. **龙虎榜日期切换可复用模式**：BACKLOG-013 在 `frontend/src/pages/ResearchWorkspace.tsx` 实现的 `changeMoneyFlowPeriod`（L311-331）就是范本——ref 记录当前值、只重取该数据、`Spin` 保留旧数据、失败回滚到旧值 + 错误并入 errors 数组并去重。龙虎榜照此实现 `changeDragonTigerDate`。
> 4. **日期选择 UI 先例**：`LimitPool.tsx` 已用 `DatePicker` + `dayjs` + `disabledDate`（禁未来，L63-67），可照抄。龙虎榜卡片在 A 股守卫块内（`/^\d{6}$/` 包裹，L628 起），日期选择只在该卡片内，天然限 A 股。
> 5. **语义说明要给用户**：服务端 `date` 是"窗口终点"而非"上榜日"。卡片 `Descriptions` 已显示 `record.date`（实际上榜日），日期选择旁需加一句 hint 文案（如"显示截至所选日期的最近上榜记录"），避免用户以为选中的就是上榜日。
> 6. **诚实纪律**：某日期窗口内无记录 → 服务端返回 `items=[]` + `note`，卡片现有逻辑已用 `dragonTiger?.note ?? t('research.dragonTiger.empty')` 显示 Empty——不要补造。

---

## 允许修改

- `frontend/src/pages/LimitPool.tsx`（`code` 列渲染为 `Link`，见目标 1）
- `frontend/src/pages/ResearchWorkspace.tsx`（龙虎榜日期切换，见目标 2）
- `frontend/src/i18n/zh.ts`、`frontend/src/i18n/en.ts`（新增 key 双语同步，parity 差集 0）
- `frontend/tests/LimitPool.test.tsx`（**新建**）、`frontend/tests/ResearchWorkspaceEvidence.test.tsx`（扩展）
- `frontend/e2e/limit-pool.spec.ts`（**追加** 1 用例，不改既有断言）、`frontend/e2e/dragon-tiger.spec.ts`（**新建** 1 用例）
- `docs/ai/tasks/BACKLOG-014.md`、`docs/ai/EXEC_PLAN.md`、`task/CHANGELOG.md`

## 禁止修改

- `backend/` 全部（服务层、router、schema、auth、测试）
- `frontend/src/hooks/useLightweightCharts.ts`、`frontend/playwright.config.ts`
- 既有 E2E 断言语义（`limit-pool.spec.ts` 现有 2 个用例、`money-flow.spec.ts` 等只读，DOM 变化可更新断言不得放宽语义）
- 其他页面/组件行为（Discover/Dashboard/StockAnalysis 只读）
- **不新增任何 npm/Python 依赖**；**不删除任何文件**（如需清理走回收站）

---

## 完成标准

### 目标 1：涨停池点击穿透

`frontend/src/pages/LimitPool.tsx`：
- `code` 列（或 `code` + `name` 两列）render 为 `<Link to={`/research/${encodeURIComponent(code)}`}>{code}</Link>`，沿用 `ResearchContinuity.tsx` 的 Link + encodeURIComponent 先例
- 保留原文本样式（AntD `Typography.Link` 或继承表格默认链接样式）；`Link` 天然键盘可达（可聚焦/回车激活），不需要额外 onRow 点击
- `code` 列标题加可访问标签或 tooltip（如"点击打开研究工作区"），i18n key：`limitPool.openResearch`

### 目标 2：龙虎榜日期切换

`frontend/src/pages/ResearchWorkspace.tsx`：
- 新增 state：`dragonTigerDate: string`（默认 `shanghaiToday()`，YYYY-MM-DD）与 `dragonTigerDateRef`（用 ref 同步当前值）；`loadWorkspace` 的 `dragonTigerRequest` 改用 `dragonTigerDateRef.current`（L274 现在硬编码 `shanghaiToday()`）
- 新增 `changeDragonTigerDate(date)`：复用 `changeMoneyFlowPeriod` 模式（ref 先写新值 → `setDragonTigerDate` → `setDragonTigerLoading(true)` → `fetchDragonTiger(currentSymbol, date)` → 成功 setDragonTiger + 清错误 / 失败回滚 ref+state 到旧日期 + 错误并入 errors 去重 → finally 结束 loading）
- 龙虎榜卡片内（Descriptions 上方或 chart 位置）加 `DatePicker`（`disabledDate` 禁未来，参照 LimitPool L63-67）+ 一句 hint 文案（i18n `research.dragonTiger.dateHint`："显示截至所选日期的最近上榜记录"）；DatePicker 带 `aria-label`（`research.dragonTiger.selectDate`）
- 卡片包 `Spin spinning={dragonTigerLoading}` 保留旧数据；失败回滚日期 + 显示错误（复用 `research.error.dragonTiger`）
- `record.date`（实际上榜日）已显示在 Descriptions，与所选"窗口终点"区分

### 目标 3：测试与验证

- **Vitest `frontend/tests/LimitPool.test.tsx`（新建）**：mock `researchApi.fetchLimitPool` + `MemoryRouter`；≥2 用例——表格渲染（代码/名称/封单额格式化）；点击 `code` Link 后导航到 `/research/{code}`（用 MemoryRouter + 断言 location 或 spy `Link` 的 href）。不渲染真实 lightweight-charts
- **`frontend/tests/ResearchWorkspaceEvidence.test.tsx` 扩展**：≥2 用例——龙虎榜日期切换（选择新日期后 `fetchDragonTiger` 以新 date 被调用、snapshot 调用数不变、卡片更新）；失败回滚（新日期请求 reject → 错误显示 + 回滚旧日期 + 旧数据保留）
- **E2E**：`limit-pool.spec.ts` **追加** 1 用例（mockApi + 点击 code → 断言 URL 变为 `/research/600519` 或 Link href）；`frontend/e2e/dragon-tiger.spec.ts` **新建** 1 用例（mock 整个 ResearchWorkspace 的 GET，断言选择日期后请求携带新 `date` 且卡片更新）。canvas/DatePicker 交互不断言视觉，只断言请求与导航
- 全量门禁：`cd frontend && bun run build`（4,242 modules 基线）、`bun run test`（120 files/327 tests 基线 + 新增）、`bun run e2e`（44 基线 + 2 新增，保持 workers:2/retries:1）；`git diff --check` 通过
- **零后端改动、零新依赖、无删除**

### 目标 4：文档同步

- `docs/ai/EXEC_PLAN.md` 标记 `[DONE]`（证据：组件/测试数/门禁结果）
- `task/CHANGELOG.md` 追加一条（**带 `## YYYY-MM-DD` 标题行**，参照 BACKLOG-012 条目格式）
- 无新端点 → `docs/API_CONTRACT.md` 不需改；无架构变化 → `docs/ARCHITECTURE.md` 不需改

---

## 参考

- 涨停池页：`frontend/src/pages/LimitPool.tsx`（columns L37-59、DatePicker L63-67、Table L112-117）
- 龙虎榜卡片：`frontend/src/pages/ResearchWorkspace.tsx`（L274 dragonTigerRequest、L682-715 卡片、Descriptions 显示 record.date）
- 周期切换范本：`frontend/src/pages/ResearchWorkspace.tsx` L311-331 `changeMoneyFlowPeriod`
- Link 先例：`frontend/src/components/ResearchContinuity.tsx` L2/64
- fetcher（只读）：`frontend/src/services/researchApi.ts` `fetchDragonTiger(symbol, date, lookBack)`
- 测试先例：`frontend/tests/ResearchWorkspaceEvidence.test.tsx`（mock researchApi + MemoryRouter）、`frontend/tests/moneyFlowChart.test.ts`（纯函数）、`frontend/e2e/limit-pool.spec.ts` + `frontend/e2e/helpers.ts`（mockApi）

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

- **修改文件清单**：页面 `frontend/src/pages/LimitPool.tsx`、`frontend/src/pages/ResearchWorkspace.tsx`；i18n `frontend/src/i18n/zh.ts`、`frontend/src/i18n/en.ts`；新增 `frontend/tests/LimitPool.test.tsx`、扩展 `frontend/tests/ResearchWorkspaceEvidence.test.tsx`；追加 `frontend/e2e/limit-pool.spec.ts`、新增 `frontend/e2e/dragon-tiger.spec.ts`；文档为本卡、`docs/ai/EXEC_PLAN.md`、`task/CHANGELOG.md`。
- **穿透功能**：`code` 列使用原生 React Router `Link` 和 `encodeURIComponent(code)`，目标 `/research/{code}`；代码列标题提供 `limitPool.openResearch` tooltip。保留默认链接样式与原生键盘聚焦/回车行为，无整行点击或其他页面改动。
- **日期切换功能**：`dragonTigerDate` 默认上海当天，`dragonTigerDateRef` 保存当前窗口截止日期，首次/整页加载也读取此 ref。`changeDragonTigerDate` 仅请求 `fetchDragonTiger(currentSymbol, date)`；`Spin` 保留旧数据，加载期间禁用 DatePicker。成功替换记录并只清除龙虎榜错误；失败回滚 ref 与选择日期，保留旧记录，按龙虎榜错误前缀去重，其他数据错误保留。DatePicker 禁未来、不可清空、有双语可访问名称，仅在 A 股卡片内出现。
- **测试范围**：LimitPool 新增 2 项（表格代码/名称/封单额/tooltip、真实 MemoryRouter 点击导航）；ResearchWorkspace 新增 2 项（真实 DatePicker 切换、挂起请求期间保留旧记录与 Spin、九个其他 fetcher 调用数不变；历史日期成功后连续失败回滚/错误去重/随后空窗口恢复）。E2E 追加/新增共 2 项（点击代码确认 URL；完整 GET mock，输入日期并按回车，校验请求方法/路径/date/look_back 与卡片记录更新）。既有两个涨停池 E2E 用例逐字前缀检查未变。
- **全量门禁（2026-09-01）**：基线取自 `cdc53be` 卡片与 BACKLOG-013 已记录证据，本次未另跑修改前套件。按顺序执行 `bun run build` → `bun run test` → `bun run test:e2e`，全部 exit 0：build 4,242 → 4,242 modules，OpenAPI 59 schemas 新鲜度检查通过；Vitest 120 files / 327 tests → **121/121 files、331/331 tests**（929.06s），包含 LimitPool 2/2 与 ResearchWorkspaceEvidence 6/6；Chromium E2E 44 → **46/46**（58.7s），workers=2、retries=1，全部首次通过、无重试。E2E 使用 package.json 实际脚本 `test:e2e`（卡片正文简称 `e2e`）。`git diff --check` 与白名单/禁止文件/删除检查通过。
- **双语与边界**：zh/en 2,262 → 2,265 keys，各新增 3 个 key，重复 0、差集 0。`backend/` 全部、chart hook、Playwright 配置、其他页面/组件、既有 E2E 断言、依赖和 lock 文件、`reference/` 均未修改；依赖变化 0、删除 0。无端点/架构变化，不改 API/架构文档。`HANDOFF.md` 不在本卡白名单内，未运行会改写它的 handoff-log；未 commit、未 push。
- **记录决策**：`date` 是回看窗口终点，hint 为“显示截至所选日期的最近上榜记录”，实际上榜日仍独立显示 `record.date`。失败后所选截止日恢复到旧记录对应的请求日期，避免误标；成功但 `items=[]` 时继续显示服务端 `note`，缺省才使用既有 Empty 文案，不补造记录。测试中的行情与上榜记录均为确定性 mock，不作为真实市场数据证据。
