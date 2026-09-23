# BACKLOG-021 — 回收 v1 回测（路由下线 + 引擎回收 + 契约/测试同步）

> 状态：`[DONE]`（修订版全部完成）｜ 优先级：P1 ｜ 创建：2026-09-02 ｜ 执行者：Codex
> 背景：SCOPE_FREEZE_V1.md §3.3 P2 明确要求"v1 回测 `backtest.py`（/api/backtest）前端零调用；v2 已接管 → 路由下线（回收站），测试同步；OpenAPI 核对"——这是规划内**未完成**的回收项。v1 是旧版收盘价向量化回测（3 策略），v2（`backtests.py` + `ma_crossover` 等，A 股执行规则）已完整接管。本任务下线 v1 回测路由、回收 v1 引擎、同步测试与文档，消除 v1/v2 双轨。
>
> **修订说明（2026-09-02，解除 BLOCKED）**：Codex 首轮执行发现两处维护者调研遗漏，已核实确认，本次修订授权补齐：
> ① **前端并非零调用 v1**：`frontend/src/pages/Chat.tsx` L159 `apiClient.post('/backtest/runs', ...)` 用相对路径（`apiClient` baseURL=`/api`，拼为 `/api/backtest/runs` v1）——Chat 页"聊天里跑回测"按钮是 v1 活跃入口，v1 下线后 404。**决策：该按钮改为重定向到 Strategy Lab**（`/strategy-lab/ma-crossover?symbol={ticker}`，StrategyLab L134 已支持 `symbol` 预填），不做 v2 迁移（交互模型不同）、不删除回测功能。
> ② **第 3 个 v1 测试**：`backend/tests/test_backlog007_router_branches.py` L9 `from app.routers import alerts, backtest, dashboard, instruments` 仍 import `backtest`，且 2 个 v1 测试函数的专属 helper 未清——需补删 import 中的 `backtest` 与专属 helper。
>
> **开工前必读（维护者调研结论，勿跳过）**：
> 1. **前端 v1 调用已核实**：唯一活入口是 `Chat.tsx` 的 `handleRunBacktest`（L143-170）+ `backtestResults` state（L73）+ 结果列表（L334-335）+ 按钮（L379-381）+ imports（L16-17）。其余前端组件（StrategyLab/BacktestResultCard/parseBacktestRequest 等）均为 v2 或只被 Chat 用。`BacktestResultCard`/`parseBacktestRequest` **组件文件保留**（可能有测试引用），仅 Chat 内移除引用。
> 2. **引用面已确认**（维护者 grep 结果）：
>    - `backend/app/routers/backtest.py`（v1 router，`prefix="/api/backtest"`）L18 定义，3 个路由（`POST /runs`、`GET /runs`、`GET /runs/{run_id}`），用表 `backtest_runs`（INSERT/SELECT），依赖 `..backtest.engine` 的 `SUPPORTED_STRATEGIES`/`run_backtest`。
>    - `backend/app/backtest/engine.py`（v1 引擎）`run_backtest` 的**唯一业务引用是 v1 router**（`backtest.py:15/57`）；其依赖 `backtest/metrics.py`（`calculate_performance`/`calculate_trade_metrics`）——**`metrics.py` 被 `alpha_simulator.py:9` 引用，必须保留**。
>    - Agent 工具 `run_backtest`（`tools_definitions.py:485`）用的是 **v2** `ma_crossover`（L500/512），**不依赖 v1 engine**。
>    - v2 `backtests.py` 用表 `quant_backtests`（database.py L132）——**与 v1 的 `backtest_runs`（L107）不同表**，删 v1 router 不影响 v2。
>    - `database.py` L269（表清单）与 L694（`("research_reports", "backtest_runs")` 遍历）**引用 `backtest_runs` 表名——表保留，不删表**。
> 3. **回收范围（只删这些）**：`routers/backtest.py`（v1 router）、`backtest/engine.py`（v1 引擎）、`tests/test_backtest_engine.py`（测 engine）、`tests/test_backlog007_router_branches.py` 中两个 v1 backtest 测试函数、`tests/test_router_contracts.py` L13 的 v1 契约行、`docs/API_CONTRACT.md` §9 回测 v1 章节、`main.py` L138 的 `backtest.router` 注册。
> 4. **保留（禁止动）**：`backtest_runs` 表（schema 保留）；`backtest/metrics.py`（alpha_simulator 依赖）；v2 全套（`backtests.py`、`ma_crossover.py`、`significance.py`、`risk.py`、`portfolio.py`、`loaders.py`、`optimizers.py`）；`tools_definitions.py` 的 `run_backtest` 工具；`test_backtest_metrics.py`/`test_backtest_significance.py`/`test_portfolio_backtest.py`（v2/共享引擎测试）。
> 5. **删除铁律**：所有回收文件**必须进回收站**（PowerShell `[Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile(... 'SendToRecycleBin')` / `DeleteDirectory(...)`），**禁止 `rm`/`Remove-Item`/`del`**。测试函数/契约行的删除用 `edit` 工具精确移除。
> 6. **OpenAPI 核对**：移除后 `/api/backtest` 的 3 个路径应从 OpenAPI 消失（137→134 路径 / 172→169 操作），`/api/backtests`（v2）不受影响。`test_router_contracts.py` 有逐 router 契约断言，移除 v1 行即可。
> 7. **覆盖基线**：当前 808 passed / 92.28%。回收后应**减少**若干测试（删的测试），全量必须全绿、覆盖率不降（删除引擎/路由后未覆盖行消失，覆盖率通常持平或微升）。

---

## 允许修改

- `backend/app/main.py`（L138 从 for 循环移除 `backtest.router` 注册；`from .routers import ...` 一并移除 `backtest`）
- `backend/app/routers/backtest.py`（**回收**，进回收站）
- `backend/app/backtest/engine.py`（**回收**，进回收站）
- `backend/tests/test_backtest_engine.py`（**回收**）
- `backend/tests/test_backlog007_router_branches.py`（**移除** 两个 v1 backtest 测试函数 + 其专属 helper + **L9 import 行中的 `backtest`**，其余函数与 import 保留）
- `backend/tests/test_router_contracts.py`（**移除** L13 v1 backtest 契约行，其余保留）
- `docs/API_CONTRACT.md`（**移除** §9 回测 v1 章节，标注 v2 接管）
- `docs/ARCHITECTURE.md`（更新回测说明：v1 已回收，仅 v2）
- `frontend/src/pages/Chat.tsx`（**重定向回测入口**——`handleRunBacktest` 改为解析 ticker 后 `navigate('/strategy-lab/ma-crossover?symbol=' + ticker)`（StrategyLab L134 `initialValues(searchParams.get('symbol'))` 支持预填），**移除 v1 POST `/backtest/runs` 调用**；`backtestResults` state、`isBacktesting`、结果列表渲染（L334-335）、`onClick`（L381）与按钮 loading 态一并清理或改造；保留策略解析提示（无 ticker 时 warning）。`BacktestResultCard`/`parseBacktestRequest` 组件文件保留，仅在 Chat 内移除引用）
- `frontend/src/i18n/zh.ts`、`frontend/src/i18n/en.ts`（`chat.backtest.*` key 按 Chat 改造调整：`completed`/`failed` 可移除或改为"已转到策略实验室"提示，`descriptionRequired`/`tickerRequired` 保留，双语同步 parity 0）
- `docs/ai/tasks/BACKLOG-021.md`、`docs/ai/EXEC_PLAN.md`、`task/CHANGELOG.md`

## 禁止修改

- `backend/app/backtest/metrics.py`（alpha_simulator 依赖）、`ma_crossover.py`、`significance.py`、`risk.py`、`portfolio.py`、`loaders.py`、`optimizers.py`（v2/工具用）
- `backend/app/database.py`（**不删 `backtest_runs` 表**，L269/L694 引用保持）
- `backend/app/agent/tools_definitions.py`（`run_backtest` 工具，v2 实现）
- `backend/app/routers/backtests.py`（v2）、`backend/tests/test_backtest_metrics.py`/`test_backtest_significance.py`/`test_portfolio_backtest.py`（共享/v2）
- `frontend/` 除 `Chat.tsx` 与 i18n 外的其他文件（StrategyLab/BacktestResultCard/parseBacktestRequest 只读）；认证、`reference/`
- **不新增任何依赖**；**不 rm/Remove-Item/del 任何文件**（回收走回收站）
- 既有测试断言语义（v1 移除是预期，v2 断言不得改；Chat 相关 E2E 若因重定向变化，**更新断言为跳转语义，不得放宽**）

---

## 完成标准

### 目标 1：v1 路由下线

- `main.py` L138 的 for 循环中移除 `backtest`（保留 `backtests` v2）；`from .routers import ...` 中 `backtest` 一并移除
- OpenAPI 中 `/api/backtest/*` 3 路径消失；`/api/backtests/*`（v2）完整保留
- 启动/health/其他路由不受影响

### 目标 2：引擎与测试回收

- `routers/backtest.py`、`backtest/engine.py`、`tests/test_backtest_engine.py` → 回收站
- `tests/test_backlog007_router_branches.py`：用 `edit` 移除 `test_legacy_backtest_data_and_engine_error_paths` 与 `test_legacy_backtest_success_list_and_details` 两个函数（及其 `_legacy_body` helper 若仅被它们使用——查清后决定），其余函数保留
- `tests/test_router_contracts.py`：移除 `"backtest": ("/api/backtest/runs", "get")` 行（L13），保留 `"backtests"` 行

### 目标 3：Chat 回测入口重定向（新增，解除 BLOCKED 的关键）

`frontend/src/pages/Chat.tsx` + `frontend/src/i18n/zh.ts`/`en.ts`：
- `handleRunBacktest` 改为：解析 `ticker`（用 `parseBacktestRequest`，仅取 ticker，忽略 strategy）→ 无 ticker 则 warning（保留 `chat.backtest.tickerRequired`）→ 有则 `navigate('/strategy-lab/ma-crossover?symbol=' + encodeURIComponent(ticker))`（StrategyLab L134 已支持 `symbol` 预填）
- **移除** v1 POST `/backtest/runs` 调用、`backtestResults` state、`isBacktesting` state、结果列表渲染（L334-335）、按钮 loading 态（`loading={isBacktesting}`）
- `BacktestResultCard`/`parseBacktestRequest` **组件文件保留**，仅 Chat 内移除 import/使用（`BacktestResultCard` import 移除；`parseBacktestRequest` 如仍需取 ticker 则保留 import）
- 新 i18n（zh/en 同步 parity 0）：`chat.backtest.redirected`（如"已转到策略实验室，请在页面确认参数后运行"）或复用现有文案；`chat.backtest.completed`/`failed` 移除（不再有回测请求）
- 不改 StrategyLab/BacktestResultCard 组件本体

### 目标 4：测试同步（补删 + 数量断言）

- `tests/test_backlog007_router_branches.py`：除已移除的 2 个函数外，**再移除第 3 个 v1 测试** `test_legacy_backtest_validation_and_market_errors`（Codex 实测存在）及其专属 `_legacy_body` helper、**`backtest` import**（L9），其余函数/import 保留
- `tests/test_router_contracts.py`：已移除 v1 行；**同步 ROUTER_SENTINELS 数量断言**（22→21，如代码中有计数断言则同步，不得放宽其他断言）
- Chat 相关前端测试/E2E：如 `chat-paths.spec.ts` 或 Chat 组件测试断言了回测按钮行为，**更新为跳转语义**（点击后 URL 变为 `/strategy-lab/ma-crossover?symbol=...`），不得放宽
- 后端全量：`cd backend && .\.venv\Scripts\python.exe -m pytest ..\backend\tests -q --no-cov -p no:cacheprovider` 全绿（808 - 已删测试数）
- 覆盖率 `--cov=app --cov-report=term-missing` **不降**（92.28% 基线）；`ruff check .` 通过；`git diff --check` 通过
- **前端门禁**：`cd frontend && bun run build`（4,244 modules 基线）、`bun run test`（123 files/347 tests 基线 + 调整）、`bun run test:e2e`（48 基线 + 调整，workers:2/retries:1）
- **OpenAPI 核对**：`/api/backtest` 3 路径消失、`/api/backtests` 9 路径完整
- **双环境确定性**：受影响后端测试在代理 7897 开/关一致
- 确认后端无残留 import v1 router/engine、前端无残留 `/backtest/runs` 字面量（除注释）
- **零新依赖、无 rm（全部回收走回收站）、无删除表**

### 目标 5：文档同步

- `docs/API_CONTRACT.md`：§9 回测 v1（L215-221）移除或标注"已回收，v2 接管"；§11 回测 v2 保留
- `docs/ARCHITECTURE.md`：回测说明更新为"仅 v2（backtests.py + ma_crossover，A 股执行规则）；v1 已回收；Chat 回测入口重定向到 Strategy Lab"
- `task/CHANGELOG.md` 追加（**带 `## YYYY-MM-DD` 标题行**）
- `docs/ai/EXEC_PLAN.md` 标记 `[DONE]`（证据：回收清单/OpenAPI 前后/测试数/覆盖率/Chat 重定向）

---

## 参考

- SCOPE_FREEZE_V1.md §3.3 P2（回测 v1 回收条目，规划依据）
- `backend/app/main.py` L16/L138（router 注册）、`backend/app/routers/backtest.py`、`backend/app/backtest/engine.py`
- `backend/app/backtest/metrics.py`（保留）、`backend/app/routers/backtests.py`（v2）
- `backend/tests/test_backlog007_router_branches.py`（L250-290 v1 函数）、`backend/tests/test_router_contracts.py`（L13）
- `docs/API_CONTRACT.md` §9（v1）、§11（v2）
- 删除铁律：`[Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile('路径','OnlyErrorDialogs','SendToRecycleBin')`

## 验证命令

```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest ..\backend\tests -q --no-cov -p no:cacheprovider
.\.venv\Scripts\python.exe -m pytest ..\backend\tests -q --cov=app --cov-report=term-missing -p no:cacheprovider
.\.venv\Scripts\python.exe -m ruff check .
cd .. && git diff --check
# OpenAPI 核对
cd backend && .\.venv\Scripts\python.exe -c "from app.main import app; print([r.path for r in app.routes if 'backtest' in getattr(r,'path','')])"
```

## 完成证据（执行后填写）

### 2026-09-02 修订收尾（全部完成）

维护者以 `e9f1504` 修订卡片，并在本轮明确授权补删第 3 个 v1 测试、同步 sentinel 计数、Chat 跳转及对应测试；另明确授权同步 `frontend/src/types/openapi.generated.ts`。首轮两处 BLOCKED 已解除。HEAD 保持 `e9f1504`，不 commit、不 push。

### 回收与保留

三个源文件已在首轮使用 PowerShell `Microsoft.VisualBasic.FileIO.FileSystem.DeleteFile` + `OnlyErrorDialogs` / `SendToRecycleBin` / `ThrowException` 移入 Windows 回收站。逐个核对原路径消失、回收站 `$I` 元数据及 `$R` 内容 SHA256 一致。没有使用 rm/Remove-Item/del 回收文件。

| 文件 | 字节数 | 回收站文件 | 原文件/回收文件 SHA256 |
|------|--------|------------|------------------------|
| `backend/app/routers/backtest.py` | 4911 | `$RC4ESPH.py` | `BF70DA06B6999A55ADEA1BBE5AC072FF77CC29863700ECEEA8CF490C609C2DEF` |
| `backend/app/backtest/engine.py` | 11134 | `$R18VETU.py` | `0987F38B4AABBAB04DC862E17344CBA0D1BB0D314063F12EF711F718DB5289BD` |
| `backend/tests/test_backtest_engine.py` | 2705 | `$RHQZNDW.py` | `1E5F548CA764E0AA047DF45CADA1AB8036ACF528D11F0329D3F4FCC4D5BD914E` |

回收时间：2026-09-02 16:20:05 UTC；目录：`E:\$Recycle.Bin\S-1-5-21-1866984205-3748508198-824681690-1002\`。

- `main.py` 仅移除 v1 import 与 router 注册；所有其他逻辑的 AST 与 HEAD 一致。
- 补删 `test_legacy_backtest_validation_and_market_errors`、`_legacy_body` 和 `backtest` import；合计删除 8 项 engine 测试与 3 项 v1 router 测试，其余分支测试 AST 完全保留。
- sentinel 移除 v1 行，计数及注释 22→21；v2 与原有其他断言保留。新增 1 项退役回归：旧 3 操作均 404、历史 backtest_runs 数据不变、v2 列表隔离、真实 Alpha 本地模拟仍使用共享 metrics，并对零方差保持 IC/Sharpe 为 null。
- `metrics.py`、database.py / backtest_runs 表、v2 全套、Agent 工具、共享/v2 测试、认证、reference、依赖及锁文件均未修改。零新依赖；测试仅用临时 SQLite/确定性 fixture，不访问真实行情、LLM 或生产数据库。

### Chat 跳转与前端同步

- 按钮改为“打开策略实验室” / “Open Strategy Lab”。`handleRunBacktest` 仅取 ticker 后导航到 `/strategy-lab/ma-crossover?symbol=` + `encodeURIComponent(ticker)`；提示确认参数后运行，不自动提交 v1/v2，也不传递旧 strategy 类型。
- 空输入保持禁用、缺少 ticker 保留 warning。移除 v1 POST、backtestResults/isBacktesting state、结果列表、loading 与结果组件 import。
- `BacktestResultCard.tsx`、`features/backtest/request.ts` 文件及原测试不变；按修订卡目标 3 的明确说明，保留现有 `parseBacktestRequest` import 仅提取 ticker，避免复制解析逻辑。
- zh/en 删除 completed/failed、新增 redirected，同步描述与按钮文案；各 2274 keys，差集/重复均为 0。
- 经维护者单独授权，用现有 `scripts/openapi_tsgen.py` 同步生成类型，唯一差异为删除失效 `BacktestRequest` 的 7 行；其余生成内容完全一致，59→58 schemas。
- 新增 `ChatBacktestRedirect.test.tsx` 7 项组件测试，验证 A 股/美股/港股及 MA ticker、无 POST、空输入、无代码提示、英文跳转语义；使用真实 MemoryRouter。原 ChatStarterDraft 等测试保持不变。
- `chat-paths.spec.ts` 原用例全文保留，追加 2 项 E2E：键盘触发跳转、精确 URL、真实 StrategyLab 股票代码预填、确认提示、无任何 backtest 写请求，以及空/缺代码时不跳转。

### OpenAPI 与生命周期

| 项目 | 修改前 | 修改后 | 验证 |
|------|--------|--------|------|
| APIRouter | 23 | 22 | 仅移除 v1 |
| paths / operations | 137 / 172 | 135 / 169 | v1 实际为 2 路径 / 3 操作 |
| v2 | 9 路径 / 10 操作 | 9 路径 / 10 操作 | 完整 JSON 相等 |
| 非 v1 path 契约 | 完整基线 | 逐项完全相等 | 无其他接口变化 |
| schemas | 含 BacktestRequest | 仅移除 BacktestRequest | 其余 schema 完全相等 |

原卡片“3 路径/134”计数有误：`POST /api/backtest/runs` 与 `GET /api/backtest/runs` 共用一个 OpenAPI path，另一个是 `/api/backtest/runs/{run_id}`。隔离 ASGI 启动/关闭通过，health 为 200/ok/WAL，旧 3 操作均 404，未登录 v2/models 仍为 401，backtest_runs 与 quant_backtests 均存在。后端业务代码无 v1 import，frontend/src 无 `/backtest/runs` 调用。

### 门禁结果

- 修改前基线：808 passed / 92.28%（精确 92.28125%，114.52s）。
- 补删后的首轮：797 passed / 92.260239%，213.77s；覆盖率略降，未当作通过。定位到失去共享 metrics 间接覆盖及覆盖分母变化后，增加上述真实保留行为回归，不改覆盖率配置、不改共享代码/测试。
- 最终后端 no-cov：798/798 passed，144.42s（808 − 11 + 1）。
- 最终后端 coverage：798/798 passed，190.09s，92.34%（精确 92.34291528873061%），高于基线 92.28%。
- 受影响后端双环境：代理变量清空 45/45 passed（34.25s）；HTTP/HTTPS 7897 + ALL_PROXY socks5 7897 为 45/45 passed（28.18s）。包括 router branches、router contracts 与 main static，未降低断言。
- Ruff check .、git diff --check 通过。
- Frontend build：通过；58 schemas fresh、4243 modules（原 4244）、Vite 构建 48.34s。既有大 chunk 提示不作为失败，未改分包配置。
- Frontend Vitest：124/124 files、354/354 tests passed（原 123/347 + 新增 1 file/7 tests），1086.53s；保留现有单 worker 配置。全部原断言与新增 Chat 跳转断言通过。
- Frontend E2E：最终全量 50/50 passed（原 48 + 新增 2），51.1s，无重试；按 build → Vitest → E2E 顺序完成。每次运行前确认 4173 空闲，使用原配置 workers:2 / retries:1。
- 首次全量 E2E 为 49 passed / 1 failed：新增用例的 StrategyLab 按钮精确 accessible name 漏了图标前缀；仅将该 locator 改为实际名称 `experiment 运行回测`，保留 exact:true、URL/预填/提示/请求数全部严格断言，随后全量重跑通过。原 48 项用例及其断言不变。
- 首次新增组件测试有 3 项 AntD 全局 toast 跨用例销毁造成的展示断言失败；组件测试改为精确校验 message.info 的文案调用，仍用真实路由断言完整 URL、禁止任何 POST；E2E 继续检查真实提示可见，未放宽原测试。

### 范围与证据文件

- AST/SHA256 检查确认 main、分支测试、sentinel 的变动仅限上述预期；API_CONTRACT §11 文本完整不变，所有原 Chat E2E 保留。960 个原非 reference 已跟踪文件哈希不变，16 个文件在授权范围内变化，另新增 1 个 Chat 测试文件。
- API_CONTRACT §9/汇总、ARCHITECTURE 回测说明/依赖图已同步。HANDOFF、ROUTER_MAP、AGENTS、README、TECH_STACK 不在卡片白名单内，保持不变；不运行会写 HANDOFF 的 handoff-log.py。
- 证据根目录：`C:\Users\SATANC~1\AppData\Local\Temp\finquant-backlog021-a47e34ef81e14aeb8347fd9a1e85791e\`。
- 根目录的 `recycle-confirmation.json`、`before-openapi.json`、`after-openapi.json`、`openapi-verification.json`、`baseline-coverage.json` 保留回收/基线/完整 OpenAPI 证据。
- 本轮证据在 `revised-e9f1504\`：`resume-existing.diff`、`backend-no-cov.log`、`verified-coverage.log` / `verified-coverage.json`、`proxy-off.log` / `proxy-on.log`、`build.log`、`vitest-full.log`、`e2e-full.log`、`e2e-first-failure.md` / `.png`、最终 `e2e-verified.log`、`scope-verification.json`，以及获准前的 `generated-types-proposed.diff`。
- 可重跑范围审计：项目根运行 `.\backend\.venv\Scripts\python.exe <证据根目录>\revised-e9f1504\verify_scope.py`；OpenAPI/隔离生命周期：backend 内运行 `.\.venv\Scripts\python.exe <证据根目录>\verify_openapi.py`。
- 全部完成标准满足；EXEC_PLAN 标记 DONE，CHANGELOG 追加本轮完成记录，首轮 BLOCKED 记录仅作历史保留。最终范围审计及 diff check 通过，HEAD 为 `e9f1504`、暂存区为空，未 commit、未 push。
