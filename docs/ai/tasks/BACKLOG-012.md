# BACKLOG-012 — A 股深度能力前端接线：资金流向 / 龙虎榜 / 涨停池

> 状态：`[DONE]` ｜ 优先级：P1 ｜ 创建：2026-08-31 ｜ 完成：2026-09-01 ｜ 执行者：Codex
> 背景：BACKLOG-011 已在 `backend/app/services/a_stock_extra.py` 实现 5 个 A 股深度能力（筹码/资金流/涨停池/龙虎榜/估值历史），但**只注册为 Agent 工具，前端零展示**。本任务把其中 3 个能力接上前端：**资金流向**（ResearchWorkspace 新证据卡片）、**龙虎榜**（ResearchWorkspace 新证据卡片）、**涨停池**（新页面 `/discover/limit-pool`）。**估值历史明确不接**（见"记录决策"）。筹码分布前端已通过既有端点展示，**不重接**。
>
> **开工前必读（维护者调研结论，勿跳过）**：
> 1. `AStockExtraService`（`backend/app/services/a_stock_extra.py`）五能力已全部实现且测试覆盖 97.2%——本任务**服务层零改动**，只做薄 router 包装 + 前端消费。
> 2. `GET /api/market/limit-up` 已存在（旧 `MarketOverviewService.limit_up`，被 `market_review.py:81` 消费）——**禁止改动**；新涨停池端点**独立新增** `GET /api/market/limit-pool`。
> 3. `GET /api/instruments/{symbol}/chip-distribution` 已存在（旧 akshare 实现 `chip_distribution.py`，前端 ResearchWorkspace 已消费，i18n 文案为 "AkShare 120 日换手衰减模型"）——**禁止改动**；BACKLOG-011 的新筹码（`INFERENCE` 本地推演）仅作 Agent 工具，二者刻意并存（真实数据 vs 本地推演），本任务不收敛。
> 4. 前端已有可复用的筹码消费范式（`frontend/src/pages/ResearchWorkspace.tsx` L237-262、L543-560）：A 股 6 位代码守卫 `/^\d{6}$/` → `Promise.allSettled` 并入 loadWorkspace → 失败进 errors + Card 内 Empty 降级 → 成功渲染。新卡片必须复用此范式。
> 5. 前端类型集中在 `frontend/src/types/research.ts`，fetcher 集中在 `frontend/src/services/researchApi.ts`（统一 `apiClient`），i18n 在 `frontend/src/i18n/zh.ts` + `en.ts`（**双语必须同步，parity 差集必须为 0**）。
> 6. 路由/导航：`frontend/src/App.tsx` L287+ 扁平 `<Routes>` + `navigationGroupDefinitions`（discover 组）+ `lazy()` 按需加载。

---

## 允许修改

- `backend/app/routers/instruments.py`（**仅新增** 2 个端点，见目标 1）
- `backend/app/routers/market.py`（**仅新增** 1 个端点，见目标 1）
- `backend/tests/`（确定性测试，httpx.MockTransport mock 东财响应；开/关代理双环境一致）
- `frontend/src/types/research.ts`（新增 3 组响应类型）
- `frontend/src/services/researchApi.ts`（新增 3 个 fetcher）
- `frontend/src/pages/ResearchWorkspace.tsx`（新增 2 张卡片 + 证据链项，复用 chips 范式）
- `frontend/src/pages/LimitPool.tsx`（**新建**）
- `frontend/src/utils/formatAStock.ts`（**新建**，纯格式化函数，可测）
- `frontend/src/App.tsx`（路由 + discover 导航子项，见目标 3）
- `frontend/src/i18n/zh.ts`、`frontend/src/i18n/en.ts`（新 key 双语同步）
- `frontend/e2e/limit-pool.spec.ts`（**新建**，见目标 4）
- `frontend/src` 相关组件 `*.test.tsx`（与组件同目录，见目标 4）
- `docs/ai/tasks/BACKLOG-012.md`、`docs/ai/EXEC_PLAN.md`、`docs/API_CONTRACT.md`、`docs/ARCHITECTURE.md`、`task/CHANGELOG.md`

## 禁止修改

- `backend/app/services/a_stock_extra.py`（服务层冻结：签名、返回结构、节流、错误语义一律不动）
- `backend/app/routers/instruments.py` / `market.py` 的**现有端点行为**（尤其 `/chip-distribution`、`/limit-up`、`/reviews`）
- `backend/app/services/chip_distribution.py`、`market_overview.py`、`market_review.py`
- `backend/app/agent/`、`tools_definitions.py`（Agent 工具不动）
- 数据库 schema、认证、`LOCAL_ONLY_MODE`、`reference/`
- 前端其他页面行为（Discover/Dashboard/StockAnalysis 只读）、既有 E2E 断言语义（DOM 变化可更新断言，不得放宽语义）
- `frontend/playwright.config.ts`（保持 workers:2 / retries:1 本地稳定性）
- **不新增任何 Python/npm 依赖**；**不删除任何文件**（如需清理走回收站）

---

## 完成标准

### 目标 1：后端 3 个新 REST 端点（薄包装，服务层零改动）

统一模式：`svc = AStockExtraService()` → `try: return await ... finally: await svc.aclose()`（同 `tools_definitions.py` 的用法）；`ValueError` → 400，`AStockExtraError` → 502（参照既有 `/chip-distribution` 端点的错误映射）。返回**直接透传 service 结果**（已含 ticker/source/quality/as_of provenance 字段，不再包一层）。

| 端点 | 参数 | 返回结构（透传 service） |
|------|------|--------------------------|
| `GET /api/instruments/{symbol}/money-flow` | `period: str = Query("minute", pattern="^(minute\|120d)$")` | `{ticker, period, source: "eastmoney.push2"\|"eastmoney.push2his", as_of, quality: "DIRECT", main_net, large_net, medium_net, small_net, items:[{time\|date, main_net, small_net, medium_net, large_net, super_large_net}]}`（见 a_stock_extra.py L311-354） |
| `GET /api/instruments/{symbol}/dragon-tiger` | `date: str = Query(...)`（YYYY-MM-DD）、`look_back: int = Query(30, ge=1, le=365)` | `{ticker, date, source: "eastmoney.datacenter-web", quality: "DIRECT", note?: "回看窗口内无龙虎榜记录", items:[{code, name, date, reason, net, unit:"CNY_10K", top5_buy:[{name,buy,sell,net,unit}], top5_sell:[...]}]}`（见 L414-458） |
| `GET /api/market/limit-pool` | `date: str`（YYYY-MM-DD，可选，默认今天 Asia/Shanghai）、`pool: str = Query("limit_up", pattern="^(limit_up\|limit_down)$")` | `{date: "YYYYMMDD"(紧凑), pool, source: "eastmoney.push2ex", quality: "DIRECT"\|"UNKNOWN", error?: str, items:[{code, name, limit_up_count, seal_amount, break_times, industry, limit_stat}]}`（见 L356-394；非交易日返回 `quality:"UNKNOWN"` + `error` 文案，**不得当错误抛 5xx**） |

要点：非 A 股 symbol（`_secid` 抛 `ValueError`）→ 400；所有金额单位为元或万元原样透传，**格式化放前端纯函数**（目标 4）。

### 目标 2：ResearchWorkspace 新证据卡片（资金流向 + 龙虎榜）

严格复用筹码卡片范式（L237-262 allSettled、L543-560 Card 渲染）：

- loadWorkspace 的 `Promise.allSettled` 数组从 5 项扩到 7 项（新增 moneyFlow、dragonTiger 两个请求，**注意 outcomes 索引 0-6 同步移位**）；两个请求同样用 `/^\d{6}$/` A 股守卫（非 A 股 resolve null）
- 新增 state：`moneyFlow`、`dragonTiger`；新错误 key：`research.error.moneyFlow`、`research.error.dragonTiger`（格式同 `research.error.chips`）
- **资金流向卡片**：展示主力/超大单/大单/中单/小单净流入（主力用顶层 `main_net`，其余用 `items` 最后一条的 `super_large_net/large_net/medium_net/small_net`）+ `as_of` 时间 + period 标注（分钟/120 日）；金额用纯函数 `formatWan`（万元）格式化；失败/空 → Empty
- **龙虎榜卡片**：`items` 为空且有 `note` → Empty 显示 note；否则渲染 `items[0]`：上榜日期、上榜原因（reason）、净买入（net，万元）+ 买卖 TOP5 两个小表（席位/买入/卖出/净额，同 `formatWan`）
- **证据链集成**：`provenanceEvidence`（L122-157）新增两项（`research.evidence.moneyFlow`、`research.evidence.dragonTiger`），与 chips evidence 项同构（kind FACT / quality OK）
- 双语 i18n：`research.moneyFlow.*`、`research.dragonTiger.*`、`research.evidence.*`、`research.error.*`（zh/en 同步，parity 差集 0）

### 目标 3：涨停池新页面 `/discover/limit-pool`

- 新建 `frontend/src/pages/LimitPool.tsx`：DatePicker（默认今天 Asia/Shanghai，`disabledDate` 禁未来）+ Segmented（涨停池/跌停池，映射 pool=limit_up/limit_down）+ AntD Table
- 表格列：代码、名称、连板数（`limit_up_count`，limit_down 时显示 `-`）、封单额（`seal_amount`，`formatWan`）、炸板次数（`break_times`，limit_down 时 `-`）、所属行业、涨停统计（`limit_stat`）
- `quality === "UNKNOWN"` → Alert 展示 `error` 文案（非交易日/未更新），不得报错崩溃；loading / errors / Empty 三态齐全
- 路由：`App.tsx` `<Routes>` 新增 `<Route path="/discover/limit-pool" element={<LimitPool />} />`（lazy 按需加载，参照 Discover 的注册方式）；`navigationGroupDefinitions` discover 组新增子项 `{ key: '/discover/limit-pool', path: '/discover/limit-pool', nameKey: 'nav.discover.limitPool' }`
- i18n：`nav.discover.limitPool`、`limitPool.*`（zh/en 同步）

### 目标 4：测试与验证

**后端**（确定性，httpx.MockTransport mock 东财响应，参照 `test_a_stock_extra.py` 的 mock 手法）：
- 3 个端点各 ≥3 用例：成功路径；参数非法（period/pool/look_back/非 A 股）→ 400；上游失败（5xx/坏 JSON/空 klines）→ 502；limit-pool 空 data → `UNKNOWN` + 200（非 5xx）
- 全量 `backend\.venv\Scripts\python.exe -m pytest backend\tests -q --no-cov -p no:cacheprovider` 全绿（760 + 新增）
- 覆盖率 `--cov=app --cov-report=term-missing` **不降**（92.22% 基线）；`ruff check .` 通过；`git diff --check` 通过
- **双环境确定性**：代理 7897 开启 vs 四项代理变量清空，新增测试结果一致（各自全绿）

**前端**：
- `frontend/src/utils/formatAStock.ts` 纯函数 + Vitest ≥2 用例（含 0/负数/null 边界）
- ResearchWorkspace 新卡片组件测试 ≥2 用例（mock fetcher：成功渲染 / 失败 Empty 降级）
- `frontend/e2e/limit-pool.spec.ts` 新用例（`mockApi` fulfill `/api/market/limit-pool`，断言表格渲染 + UNKNOWN 提示；参照 `e2e/helpers.ts`）
- 全量：`cd frontend && bun run build`（tsc -b + vite，4,238 modules 基线）、`bun run test`（Vitest 116 files/314 tests 基线 + 新增）、Chromium E2E 全量（41 基线 + 新增，保持 workers:2/retries:1 稳定）

### 目标 5：文档同步

- `docs/API_CONTRACT.md`：新增 3 端点（路由表）
- `docs/ARCHITECTURE.md`：routers 说明更新（instruments.py +2、market.py +1，服务层不变）
- `task/CHANGELOG.md` 追加一条
- `docs/ai/EXEC_PLAN.md` 标记 `[DONE]`（证据：端点清单、卡片/页面清单、测试数、覆盖率、双环境确定性）

---

## 记录决策（本任务**不实现**，写入证据即可）

1. **估值历史不接前端**：`valuation_history` 只返回当前 PE/PB 快照（`quality: PARTIAL`）+ 历史刻意 `UNKNOWN`（不引入 baostock）；且 StockAnalysis 的 valuation tab 已展示 `quote.pe/pb`（L186）——无增量 UI 价值。如需展示"当前估值 + 历史不可用"的诚实说明，后续单独立卡。
2. **筹码分布不重接**：前端已通过旧 akshare 端点展示真实筹码数据（`chip_distribution.py`，100% 测试覆盖）；BACKLOG-011 的新筹码（本地推演 `INFERENCE`）保持仅 Agent 工具可用。两实现刻意并存，本任务不动任何一端。
3. **不新建统一入口端点**：BACKLOG-011 曾建议 `GET /api/market/extra/{capability}` 统一入口——本任务按能力落到既有 router（symbol 级进 instruments.py、市场级进 market.py），避免端点膨胀，与现有 `/chip-distribution` 先例一致。

---

## 参考

- 服务层（只读）：`backend/app/services/a_stock_extra.py`（L303-394 资金流/涨停池/龙虎榜实现与返回结构；L42-64 节流）
- 端点先例：`backend/app/routers/instruments.py` L93-104（`/chip-distribution` 的错误映射与服务生命周期）、`backend/app/routers/market.py` L127-133（`/limit-up`，只读勿动）
- 前端范式：`frontend/src/pages/ResearchWorkspace.tsx` L237-262（allSettled 管线）、L543-560（筹码卡片渲染）、L122-157（provenanceEvidence）
- API 层：`frontend/src/services/researchApi.ts` L67-70（`fetchChipDistribution` 写法）、`frontend/src/types/research.ts` L84-98（`ChipDistributionResponse` 类型写法）
- 导航：`frontend/src/App.tsx` L55-115（navigationGroupDefinitions）、L287-306（`<Routes>`）
- 测试先例：`backend/tests/test_a_stock_extra.py`（MockTransport mock 东财）、`frontend/e2e/limit-pool.spec.ts` 参照 `e2e/core-paths.spec.ts` + `e2e/helpers.ts`（mockApi/fulfillSSE）

## 验证命令

```powershell
# 后端
cd backend
.\.venv\Scripts\python.exe -m pytest backend\tests -q --no-cov -p no:cacheprovider
.\.venv\Scripts\python.exe -m pytest backend\tests -q --cov=app --cov-report=term-missing -p no:cacheprovider
.\.venv\Scripts\python.exe -m ruff check .
# 前端（bun 全路径：D:\Technology_application\NVM_Windows\nvm_a\v22.19.0\bun.exe）
cd frontend
& "D:\Technology_application\NVM_Windows\nvm_a\v22.19.0\bun.exe" run build
& "D:\Technology_application\NVM_Windows\nvm_a\v22.19.0\bun.exe" run test
& "D:\Technology_application\NVM_Windows\nvm_a\v22.19.0\bun.exe" run e2e
cd .. && git diff --check
```

## 完成证据（执行后填写）

- **修改文件清单**：后端为 `backend/app/routers/instruments.py`、`backend/app/routers/market.py`、`backend/tests/test_backlog012_rest.py`；前端为 `frontend/src/{App.tsx,i18n/{zh,en}.ts,pages/{ResearchWorkspace,LimitPool}.tsx,services/researchApi.ts,types/research.ts,utils/formatAStock.ts}`、`frontend/tests/{ResearchWorkspaceEvidence,formatAStock}.test.*`、`frontend/e2e/limit-pool.spec.ts`；文档为本卡、`docs/ai/EXEC_PLAN.md`、`docs/API_CONTRACT.md`、`docs/ARCHITECTURE.md`、`task/CHANGELOG.md`、`HANDOFF.md`（Harness 收尾日志）。
- **端点清单**：`GET /api/instruments/{symbol}/money-flow?period=minute|120d`；`GET /api/instruments/{symbol}/dragon-tiger?date=YYYY-MM-DD&look_back=1..365`；`GET /api/market/limit-pool?date=YYYY-MM-DD&pool=limit_up|limit_down`（date 缺省为 Asia/Shanghai 当天）。三者均按 `AStockExtraService()` → `try/finally aclose()` 直接透传服务结果；非法值/非 A 股为 400，`AStockExtraError` 为 502；limit-pool 空 data 为 `quality=UNKNOWN` + HTTP 200。
- **新增卡片/页面**：ResearchWorkspace 的加载管线从 5 项扩为 7 项，资金流向卡展示主力/超大单/大单/中单/小单净流入、截止时间和周期；龙虎榜卡展示日期、原因、净买入及买卖 TOP5；两者均有 FACT 证据链项、A 股守卫、独立错误文案和 Empty 降级。新增 lazy `/discover/limit-pool` 页面、Discover 子导航、上海时区默认日期、未来日期禁选、涨停/跌停切换、7 列 Table、loading/error/Empty/UNKNOWN 状态。
- **后端测试与覆盖率**：新增 MockTransport REST 专项 20/20；全量无覆盖率套件 780/780；全量覆盖率套件 780/780，TOTAL 从 92.22% 提升到 92.26%；`backend` Ruff 通过。当前 OpenAPI 为 137 paths / 172 operations，三端点参数 schema 含 period/pool/date pattern 与 look_back 1..365 范围。
- **前端测试**：`formatWan` 2 个 Vitest 用例覆盖 0、负数、null/NaN 与 `CNY_10K`；ResearchWorkspace 2 个用例覆盖 fetcher 成功渲染与失败 Empty 降级。最终生产构建通过（4,240 modules）；全量 Vitest 118/118 files、318/318 tests；Chromium E2E 43/43（含新页直接数据表格与 UNKNOWN 两例）；zh/en 各 2,259 keys、差集 0。两次全量压力运行各出现一个不同的既有 5 秒资源超时，两个失败文件均单独全绿；未修改其断言/超时/并发配置，第三次原命令全量全绿。
- **双环境确定性**：新增后端专项在 HTTP/HTTPS/ALL/NO/SOCKS5 proxy 指向 7897 时 20/20，在大小写代理变量全部清空时同样 20/20；测试只使用注入的 `httpx.MockTransport`，不访问真实网络。
- **依赖与边界**：Python/npm 依赖及锁文件零变化；未删除文件；`backend/app/services/a_stock_extra.py`、旧 `/chip-distribution`、旧 `/limit-up`、`market_review.py`、Agent 工具、schema、认证、`LOCAL_ONLY_MODE`、Playwright 配置、`reference/` 均未修改；Harness 收尾日志已追加到 `HANDOFF.md`；未 commit、未 push。
- **记录决策确认**：估值历史仍只有当前 PE/PB 快照 + 历史 UNKNOWN，已有 valuation UI 无增量价值，故不接；旧 AkShare 真实筹码 UI 与 BACKLOG-011 本地推演筹码继续刻意并存，不重接；能力按 symbol/market 落入既有 router，不新增 `/api/market/extra/{capability}` 统一入口。
