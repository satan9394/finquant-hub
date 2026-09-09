# BACKLOG-045 完成证据 — 使用统计详情模块（对齐 CC Switch Usage：范围选择 + 汇总卡 + 维度统计表）

> 执行：DSH Worker（隔离子代理）｜ 日期：2026-09-13 ｜ 状态：代码完成，待维护者复核合入 ｜ **未 commit**
> 任务卡：`docs/ai/BACKLOG-045.md` ｜ 依赖：BACKLOG-044（费用端点，已合入 HEAD `693ede6`）
> 只读参考源：`E:\DeepSeek_Harness\workspace\2026_08_17\cc-switch-src`（**只读**，未修改其中任何文件）

---

## 1. 结论与范围

本卡补齐用量详情三块：**窗口选择**（预设 7/30/90 + 自定义起止，后端 `start`/`end` 与 `days` 并存）、**汇总卡 UsageHero**（总 token/输入/输出/调用次数/日均/最活跃模型/费用/窗口天数）、**维度统计表**（按模型 + 按会话类型，调用次数/token/占比/费用，五列可排序）。既有 `UsageTrendChart`、`UsageRecordsPanel` 一字未改（文件零 diff），原 testId 与原用例全绿。

计价**完全复用** BACKLOG-044：`estimate_cost()` 仍是唯一换算口径，`/api/usage/cost` 的 unpriced / 多币种语义原样保留（本卡只把它的窗口参数从 `days` 扩展为 `days|start/end`，并把费用汇总抽成 `_cost_rollup()` 供新端点共用；响应字段是**纯追加**，`total` 原有字段值与类型不变，044 的 16KB 测试全绿）。**未改** `model_pricing` 表、计价面板、`llm_usage` 表/写入链路、`context.py`。

**与卡片描述的两处事实出入（诚实记录）**：
1. 卡片写"CC Switch `src/components/usage/` 下 7 个组件（含 `UsageFooter.tsx`、`UsageScriptModal.tsx`）"——实测该目录 **14 个文件**，且 **`UsageFooter.tsx`、`UsageScriptModal.tsx` 不存在**（`Test-Path` 均为 False）。实际参考的是 `UsageDashboard.tsx`、`UsageHero.tsx`、`UsageDateRangePicker.tsx`、`ProviderStatsTable.tsx`、`ModelStatsTable.tsx`、`RequestLogTable.tsx`、`format.ts`、`UsageTrendChart.tsx`。
2. CC Switch 的用量表**本身不带排序**（`ProviderStatsTable.tsx` 无 `sorter`；`RequestLogTable.tsx` 只有分页输入框）。"可排序"是本卡按任务卡要求新增的能力，参考的是其表头/行/空态结构，排序逻辑为本项目自建纯函数。

---

## 2. 后端：窗口参数与维度聚合（`backend/app/routers/usage.py`）

### 2.1 窗口解析（纯函数，可单测）

- `parse_iso_date(value, field)`：`date.fromisoformat` 失败 → `HTTPException(400, "invalid {field}: expected YYYY-MM-DD")`。
- `resolve_range(days, start, end, *, today=None)`：`days` 路径**保持原语义**（`today-(days-1) … today`，UTC，闭区间）；`start`/`end` 成对时用显式日期。非法输入一律 400：
  | 输入 | 结果 |
  |------|------|
  | 只给 `start` 或只给 `end` | 400 `start and end must be provided together` |
  | 起止倒置 | 400 `start must not be after end` |
  | 格式非法（`2026-13-01`、`not-a-date`） | 400 `invalid start/end: expected YYYY-MM-DD` |
  | 跨度 > `MAX_RANGE_DAYS=366` | 400 `range must not exceed 366 days` |
- `_window(days, session_type, alias, user_id, start=None, end=None)`：窗口条件统一为 `date(alias.created_at) >= date(?) AND <= date(?)`（与旧 `date('now', '-N days')` 在 UTC 下等价，实测原有用例全绿），`session_type` 过滤与 user 隔离不变。
- 三个端点（`/api/usage`、`/api/usage/cost`、`/api/usage/stats`）都回显解析后的 `start`/`end` 与真实 `days`（自定义区间 = 区间天数），前端直接显示后端给的窗口，不自行推算日期（避免时区口径不一致）。

### 2.2 新增 `GET /api/usage/stats`

`dimension` 用 `Literal["model","session_type"]`（非法值 → 422），其余参数与 `/api/usage` 同构。

- `dimension=model`：按 `model_name` 聚合（LEFT JOIN `model_pricing`），每行 `key/request_count/prompt_tokens/completion_tokens/total_tokens` + 费用派生字段，按 token 倒序。
- `dimension=session_type`：按 `(session_type, model_name)` 聚合后再 `_fold_by_key()` 折成一行/会话类型——费用按行内**每个模型**分别估算，因此能诚实给出"部分模型未配置单价"。
- 每行与 `total` 都带 `cost_status`：`priced` / `partial` / `mixed_currency` / `unpriced` / `none`（窗口内无数据），并给出 `priced_models`、`unpriced_models`、`unpriced_total_tokens`、`cost_by_currency`、`currency`、`mixed_currency`、`estimated_cost`。**缺单价绝不返回 0**（`estimated_cost: null`）。
- `total` 的 token/请求数由各行求和、费用再聚合，因此与 `/api/usage/cost` 的总额口径一致（测试对同一窗口交叉断言）。

### 2.3 后端测试（新增 `backend/tests/test_usage_range.py`，21 例）

| 分组 | 用例 |
|------|------|
| 纯函数窗口 | days 闭区间不变（7/1 天）、显式区间覆盖 days、5 组非法输入各自 400 detail、跨度 366+ 拒绝 |
| 纯函数费用汇总 | 空窗口 `none`、缺价 `unpriced`+不返回 0、部分缺价 `partial`、跨币种 `mixed_currency` 且合计 null |
| 端点 | `days` 向后兼容且回显窗口、显式区间只统计区间内数据、区间外数据被排除、非法区间 400（含 `/cost`、`/stats`）、`/cost` 支持区间、`stats` 按模型聚合（金额/占比/排序）、`stats` 按会话类型折叠（partial）、空窗口 `items:[]` + `cost_status: none`、非法 `dimension` 422、跨用户隔离 |

---

## 3. 前端：范围选择器 + 汇总卡 + 维度统计表

### 3.1 纯函数（先逻辑后 UI，全部可单测）

- `frontend/src/utils/usageRange.ts`：`RANGE_PRESETS=[7,30,90]`、`DEFAULT_USAGE_RANGE={preset:30}`、`isValidUsageDate`（拒绝 `2026-02-30`/`2026-9-1`）、`usageRangeError`（返回 i18n key，不静默纠正）、`usageRangeParams`（预设 → `{days}`，自定义 → `{start,end}`）、`usageRangeDays`（闭区间天数）、`usageRangeLabel`。
- `frontend/src/utils/usageStats.ts`：`buildUsageHero`（总 token/输入/输出/次数/窗口天数/日均 = total/days（days≤0 → null）/最活跃模型（按 token 取最大，不依赖数组顺序，同值按键名稳定 tie-break）/费用状态透传）、`buildUsageStatsRows`（占比分母 ≤0 → `null` 而不是伪造 0%）、`sortUsageStatsRows`（不改入参、稳定 tie-break、`estimated_cost` 未知值恒排末尾——未知不等于最便宜）。

### 3.2 组件

- `frontend/src/components/settings/UsageDateRangePicker.tsx`：预设按钮（`data-testid="usage-range-preset-7|30|90"`）+「自定义」切换 + 原生 `type="date"` 起止输入（`usage-range-start/end`）+「应用」（`usage-range-apply`）；非法范围只在本地报错（`usage-range-error`）**不发请求**；显示后端回显的当前窗口（`usage-range-window`）。
- `frontend/src/components/settings/UsageHero.tsx`：`data-testid="usage-hero"`，六格主指标（总 token/输入/输出/调用次数/日均/窗口天数）+ 最活跃模型 + 估算费用（`usage-hero-cost`）+ 未计价 token/模型数；费用按 `cost_status` 渲染：`priced` → `formatCost`、`mixed_currency` → 「多币种（不换算）」、`partial` → 金额 + 「部分模型未配置单价」、`unpriced` → 「未配置单价」Tag、`none` → `-`；窗口内无任何用量 → `usage-hero-empty` 空态（不显示 0 充数）。
- `frontend/src/components/settings/UsageStatsTable.tsx`：`data-testid="usage-stats-table"`，`Segmented` 切换按模型/按会话类型，六列（名称/调用次数/Token/Token 占比/调用占比/估算费用），其中**名称、调用次数、Token、Token 占比、估算费用五列可排序**（受控 `sortOrder` + `sortDirections=['ascend','descend','ascend']`，避免第三次点击静默清空排序；调用占比是调用次数的派生显示，不单独排序）；空态 `usage-stats-empty`；错误诚实展示原文。
- `frontend/src/pages/Settings.tsx`（`UsagePanel`）：`Promise.allSettled` 同时取 `/usage`、`/usage/cost`、`/usage/stats?dimension=model`、`/usage/stats?dimension=session_type`，**分区错误互不连坐**；窗口变化即整组重取；`PricingConfigPanel onChanged` 改为重取整组。新区域置于既有内容之上。
- `frontend/src/services/usageApi.ts`：新增 `UsageRangeParams`/`UsageSummaryResponse`/`UsageStatsResponse`/`UsageCostStatus` 等类型与 `fetchUsageSummary`/`fetchUsageStats`；`fetchUsageCost(days)` → `fetchUsageCost(params)`（唯一调用点在 Settings.tsx，已同步）。

### 3.3 前端测试（新增 `frontend/tests/UsageDetail.test.tsx`，19 例）

纯函数 8 例（预设/自定义参数、非法日期与倒置、闭区间天数、hero 汇总与日均、最活跃模型取值、unpriced/混合币种诚实、空数据返回 null、占比空分母 null、排序不改入参 + 未知费用排末尾）；组件 10 例（预设点击 emit + 后端窗口展示、自定义合法 emit / 非法不 emit 并报错、hero 渲染与未计价 Tag 且**不出现 `CNY 0`**、hero 两种空态、统计表渲染 + 维度切换、点击表头真实排序、统计表空态 + 错误）；集成 1 例（渲染 Settings → 用量 Tab → 断言四个端点都按 `{days:30}` 调用、既有 `usage-trend-chart` 仍在 → 点「近 7 天」→ 四端点全部变为 `{days:7}`）。

---

## 4. CC Switch 源码引用表（每个借鉴点 → cc-switch 文件:行 → 我们的实现位置）

| # | 借鉴点 | cc-switch 文件:行 | 我们的实现位置 |
|---|--------|-------------------|----------------|
| 1 | 用量页整体信息层级：顶部筛选栏 → Hero 汇总 → 趋势图 → 明细/维度表 → 折叠配置区 | `src/components/usage/UsageDashboard.tsx:246-369`（顶栏 + 范围选择器）、`371-377`（Hero）、`379-386`（趋势）、`388-445`（Tabs 明细/供应商/模型）、`447-507`（折叠配置） | `frontend/src/pages/Settings.tsx` `UsagePanel`：范围选择器 → `UsageHero` → `UsageStatsTable` → 趋势/按场景/按日 → 费用/计价/明细 |
| 2 | 预设范围按钮组（点即生效，选中态高亮） | `UsageDateRangePicker.tsx:24`（`PRESETS`）、`338-354`（按钮组 + `selection.preset === preset` 高亮） | `UsageDateRangePicker.tsx` `RANGE_PRESETS` + `type={value.days===days?'primary':'default'}` |
| 3 | 自定义范围用原生 date/time 输入（非弹层日历），草稿态 + 应用按钮 | `UsageDateRangePicker.tsx:276-295`（`Input type="date"`）、`296-313`（`type="time"`）、`384-402`（取消/确认） | `UsageDateRangePicker.tsx` 两个 `<input type="date">` + 「应用」按钮（本项目按日粒度，不需要时分） |
| 4 | 应用前校验起止顺序，非法只报错不提交 | `UsageDateRangePicker.tsx:228-241`（`handleApply` + `usage.invalidTimeRangeOrder`） | `usageRangeError()` + `UsageDateRangePicker` 本地 `usage-range-error`（非法不发请求，测试断言 `onChange` 未被调用） |
| 5 | 范围解析为独立纯函数（预设/自定义 → 具体时间区间） | `src/lib/usageRange.ts:26-61`（`resolveUsageRange`）、`63-81`（`getUsageRangePresetLabel`） | `frontend/src/utils/usageRange.ts` `usageRangeParams`/`usageRangeDays`/`usageRangeLabel`（本项目改为交给后端解析 UTC 日期并回显） |
| 6 | Hero 顶部主指标 + 右侧请求数/成本双指标 | `UsageHero.tsx:236-294`（真实总 token 大字 + 请求数/成本） | `UsageHero.tsx` 六格主指标 + `usage-hero-cost` |
| 7 | Hero 底部 breakdown 网格（输入/输出/缓存等分格展示） | `UsageHero.tsx:297-343`（`grid-cols-2 lg:grid-cols-5` + `MiniStat` `351-393`） | `UsageHero.tsx` 第二行（最活跃模型/估算费用/未计价 token），`block()` 复用同一"标题+数值+副标"结构 |
| 8 | 跨维度汇总要**重算比率**而不是平均 | `UsageHero.tsx:86-117`（`aggregateSummaries`：successRate/cacheHitRate 由合计值重算） | `usageStats.ts` `buildUsageHero`（日均 = 窗口总 token / 窗口天数，占比 = 行值/窗口合计，绝不平均各行） |
| 9 | 成本缺失显示占位而不是 0 | `UsageHero.tsx:192`（`parseFiniteNumber`）、`289-291`（`totalCost == null ? "--" : fmtUsd(...)`）；`format.ts:14-32`（`fmtInt`/`fmtUsd` 的 `fallback="--"`） | `buildUsageHero` 的 `costStatus` + `UsageHero` 分支：`unpriced` → Tag「未配置单价」、`none` → `-`；测试断言 `queryByText('CNY 0')` 为 null |
| 10 | 维度表列结构（维度名 + 请求数 + token + 成本，右对齐数值列） | `ProviderStatsTable.tsx:44-63`（表头）、`76-98`（行渲染，数值列 `text-right`）；`ModelStatsTable.tsx:44-60`、`73-91` | `UsageStatsTable.tsx` 六列（新增 Token/调用占比两列），数值列 `align: 'right'` |
| 11 | 表格空态用一句诚实文案，不渲染假行 | `ProviderStatsTable.tsx:66-74`（`t("usage.noData","暂无数据")`）；`ModelStatsTable.tsx:63-71` | `UsageStatsTable` 的 `usage-stats-empty`（「当前窗口内没有用量记录」）+ `UsageHero` 的 `usage-hero-empty` |
| 12 | 维度视图切换（供应商/模型分表）用 Tab 而非叠加两张表 | `UsageDashboard.tsx:388-445`（`TabsList` + 三个 `TabsContent`） | `UsageStatsTable` 的 `Segmented`（按模型/按会话类型）——同一张表换聚合维度，避免重复渲染 |
| 13 | 紧凑数字/Token 显示（K/M/B 或万/亿） | `format.ts:75-97`（`formatTokensShort`） | **有意分歧**：本项目沿用既有 `toLocaleString()` 千分位（与 Settings 既有表格一致，不引入新格式化规则） |
| 14 | 排序 | **无**：`ProviderStatsTable.tsx` 无 `sorter`，`RequestLogTable.tsx:387` 只有分页输入 | 本卡新增：`sortUsageStatsRows()` 纯函数 + AntD 受控 `sortOrder`（未知费用恒排末尾） |
| 15 | 最活跃模型 | **无**：`UsageHero.tsx` 只展示总量/请求数/成本/缓存 | 本卡按任务卡新增：`buildUsageHero` 的 `pickTopModel()` |

---

## 5. 契约同步与 i18n

- `docs/API_CONTRACT.md` §20：`/api/usage`、`/api/usage/cost` 行补 `start`/`end`；新增 `/api/usage/stats` 行；新增两段说明（窗口参数与非法 400 明细、维度统计的 `cost_status` 语义与 total 口径）；路由汇总表 `usage.py` 由 `0/3` → `0/4`，合计 `39/131` → `39/132`；运行时计数由「139 路径 / 175 操作」更新为 **140 / 176**（实测 `app.openapi()`，不含内联健康检查）。
- `docs/ROUTER_MAP.md`：标题 175 → **176** 操作；正文 139/175 → **140/176**；`/api/usage` 行补 `stats` 与窗口参数。
- OpenAPI 生成物：`scripts/openapi_tsgen.py --check` → `fresh (60 schemas)`（新端点未引入新 pydantic 模型，schema 数不变，无需重新生成）。
- i18n：zh/en 各 **+24 key**（`settings.usage.range.*` 10 + `settings.usage.hero.*` 5 + `settings.usage.stats.*` 9），实测 **2439/2439，双向差集 0、重复 0**（基线 2415）。既有 `settings.usage.*`（044 的 cost/pricing 段、records 段、trend 段）**一字未改**。

---

## 6. 既有组件零回归证据

| 项 | 证据 |
|----|------|
| `UsageTrendChart.tsx` / `UsageRecordsPanel.tsx` 源码 | `git status --porcelain` 中**无这两个文件**（零 diff，未改一字） |
| 原 testId | `usage-trend-chart`（`UsageTrendChart.tsx:25`）仍在；集成用例断言新布局下依然渲染 |
| 原用例 | `frontend/tests/UsageComponents.test.tsx` **7/7 通过，文件零改动**（`usageToAreaData` 2 + 趋势图 2 + 明细面板 3） |
| 044 既有用例 | `frontend/tests/PricingConfigPanel.test.tsx` 8/8 通过（含 `formatCost` 4 例、明细费用列 1 例、`usage-cost-total` 相关）；后端 `test_model_pricing.py` 全绿 |
| Settings 既有用例 | `frontend/tests/Settings.test.tsx` 4/4 通过，其中 `usage tab renders the daily trend chart and session detail panel` 的断言**未改一字**（仍断言 `/usage` 以 `{params:{days:30}}` 调用、`usage-trend-chart` 存在、`/usage/records` 以 `{limit:50}` 调用） |
| 信息不丢失 | 旧的内联 4 项汇总 Statistic 行（总/输入/输出/请求数）由 `UsageHero` 同值承接并扩展；「按场景」「按日」两张表、费用段、计价面板、明细面板全部保留，且现在都跟随所选窗口 |

---

## 7. 门禁逐项

| 门禁 | 结果 |
|------|------|
| `cd backend && .venv\Scripts\python.exe -m pytest -q` | **909 passed / 0 failed**，覆盖率 **92.67%**（基线 888 / 92.62%，新增 21 例） |
| `cd backend && .venv\Scripts\python.exe -m ruff check .` | All checks passed!（exit 0） |
| `cd frontend && bun run build` | ✓ built（prebuild openapi `--check` fresh + `tsc -b` + vite，4261 modules，28.13s，exit 0） |
| 聚焦 Vitest（UsageDetail + UsageComponents + Settings + PricingConfigPanel） | 4 files / **38 passed** |
| 全量 Vitest（`bun run test`） | **134 files / 470 passed**（基线 133/451，+1 file / +19 例），920.03s，无 `AlphaSimulationWorkbench` 超时 |
| 4173 E2E（`bun run test:e2e`） | **50 passed**（47.6s） |
| 8000 E2E（`bun run test:e2e:8000`） | **21 passed**（55.0s） |
| i18n parity | **2439 / 2439，双向差集 0，重复 0** |
| `git diff --check` | exit 0 |
| 删除文件数 | **0**（未使用 rm/del；临时探针文件 `tests/tmpProbe.test.tsx` 用回收站删除，非项目文件） |
| commit | **未 commit** |

### 7.1 全量前端门禁实测

- 全量 Vitest：`Test Files 134 passed (134)` / `Tests 470 passed (470)`，耗时 920.03s；本轮**未出现** `AlphaSimulationWorkbench` 超时（无需隔离复跑）。
- 4173 E2E：`50 passed (47.6s)`，含 `system-pages.spec.ts:94` 的 Settings 用例（本卡改了 Settings 用量区布局，该用例断言的是系统配置表单，仍全绿）。
- 8000 E2E：`21 passed (55.0s)`（真实构建产物 + 真实后端 8000 入口）。

---

## 8. 遗留与风险（交维护者裁决）

1. **`/api/usage/stats` 是新增端点**（卡片 §允许"若需新端点"），因此路径/操作计数从 139/175 变为 140/176，已同步两份契约文档。若维护者更希望复用 `/api/usage` 的响应字段而不是新端点，需要重排 `by_session_type` 的形状——本卡选择不新端点化会让 044 既有 `by_session_type` 断言失效，故取新增端点。
2. **`/api/usage` 与 `/api/usage/cost` 的响应字段是追加**（`start`/`end`；`/cost` 的 `total.cost_status`），属向后兼容但仍是既有端点响应结构变化，已同步 API_CONTRACT。
3. **自定义范围的日期口径是 UTC**：与 `llm_usage.created_at`（`datetime('now')`，UTC）和既有"按日（UTC）"表一致；UTC+8 用户在 08:00 前选"今天"可能看到的是 UTC 的昨天。选择器下方有「按 UTC 日期筛选」提示，但不做本地时区换算（避免与后端窗口口径分裂）。
4. **多币种合计仍为 null**（沿用 044）：维度表在 `mixed_currency` 时显示「多币种（不换算）」Tag 而不是给一个混合金额。
5. **旧的「按场景」内联表与新的维度表（会话类型）信息重叠**：本卡按"只在其上方组织新区域"保留了旧表（零回归优先）。是否合并/下线旧表建议另开卡，本卡不删任何既有 UI。
6. **前端每个窗口变化发 4 个请求**（`/usage`、`/cost`、`/stats?model`、`/stats?session_type`）。本地单连接 SQLite 下开销可忽略，但 `/stats` 的 model 维度在 Hero 与表格间被复用为两次请求；若后续要省请求，可让 Hero 直接消费 `/usage` 的 total + `/stats` 的一次响应。
7. **bun 并发 flake**：本卡全程未并发跑 build 与 vitest（按要求串行）。

---

## 9. 备注

- 只读参考源本次逐行读过：`UsageDashboard.tsx`、`UsageHero.tsx`、`UsageDateRangePicker.tsx`、`ProviderStatsTable.tsx`、`ModelStatsTable.tsx`、`format.ts`、`lib/usageRange.ts`（另核对 `RequestLogTable.tsx` 的排序能力）；**未修改**该目录内任何文件。
- 未新增任何依赖（前端用 AntD 既有 `Segmented`/`Table`/`Card` + 原生 `<input type="date">`；后端只用标准库 `datetime`）。
