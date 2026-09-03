# BACKLOG-021 — 回收 v1 回测（路由下线 + 引擎回收 + 契约/测试同步）

> 状态：`[READY]`（修订版——解除原 BLOCKED）｜ 优先级：P1 ｜ 创建：2026-09-02 ｜ 执行者：Codex
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

### 2026-09-02 执行状态：部分完成，卡片边界冲突待维护者决定

基于干净工作树 `607a145` 执行，未 commit、未 push。原卡片的允许/禁止清单保持不变；下面记录实测偏差，不自行扩大授权。

**阻塞 1：卡片遗漏第 3 个 v1 测试及固定数量断言。** `backend/tests/test_backlog007_router_branches.py` 实际有 3 个 v1 测试。已精准移除卡片指定的 `test_legacy_backtest_data_and_engine_error_paths`、`test_legacy_backtest_success_list_and_details`；按“其余保留”限制，保留 `test_legacy_backtest_validation_and_market_errors` 及其 `_legacy_body`、`backtest` import。这导致回收 router 后 pytest 收集 ImportError。`test_router_contracts.py` 已移除 v1 sentinel 行，但原 `len(ROUTER_SENTINELS) == 22` 断言变为 `21 == 22` 失败；未擅改其余断言。已向维护者请求批准补删遗漏的 v1 测试/helper/import，并同步数量断言与注释为 21。

**阻塞 2：前端零调用前提不成立。** `frontend/src/pages/Chat.tsx:159` 的 `apiClient.post('/backtest/runs', ...)` 结合 `frontend/src/services/api.ts:7` 的 `baseURL: '/api'` 实际调用 v1。`ResearchWorkspace.tsx:24/80` 导入并在 Fast 模式渲染 Chat，`App.tsx:294` 的旧 `/chat` 路由也会进入该模式，因此不是死代码。回收后该按钮将得到 HTTP 404。完整 `/api/backtest/` 字符串 grep 为零只证明字面量不存在，不能证明调用不存在。`frontend/` 禁止修改，本轮保持原样；已请求批准将按钮明确改为打开现有 Strategy Lab（`/strategy-lab/ma-crossover?symbol=...`，仅标的预填、用户确认参数，不将 RSI/布林静默改为 MA），并补针对性测试。在维护者决定前，不宣称前端零调用或本任务完成。

### 回收与代码变更

采用 PowerShell `Microsoft.VisualBasic.FileIO.FileSystem.DeleteFile`，明确传入 `OnlyErrorDialogs`、`SendToRecycleBin`、`ThrowException`。执行前逐个解析绝对路径，校验位于本工作区且 SHA256 与修改前快照一致；执行后核对原路径不存在、Windows 回收站 `$I` 原路径/时间和 `$R` 内容 SHA256 一致，3/3 确认。

| 文件 | 字节数 | 回收站文件 | 原文件/回收文件 SHA256 |
|------|--------|------------|------------------------|
| `backend/app/routers/backtest.py` | 4911 | `$RC4ESPH.py` | `BF70DA06B6999A55ADEA1BBE5AC072FF77CC29863700ECEEA8CF490C609C2DEF` |
| `backend/app/backtest/engine.py` | 11134 | `$R18VETU.py` | `0987F38B4AABBAB04DC862E17344CBA0D1BB0D314063F12EF711F718DB5289BD` |
| `backend/tests/test_backtest_engine.py` | 2705 | `$RHQZNDW.py` | `1E5F548CA764E0AA047DF45CADA1AB8036ACF528D11F0329D3F4FCC4D5BD914E` |

- 回收时间：2026-09-02 16:20:05 UTC；位置：`E:\$Recycle.Bin\S-1-5-21-1866984205-3748508198-824681690-1002\`。没有使用永久删除命令。
- `main.py` 仅移除 v1 import 与 router 注册，保留 v2 与全部其他业务逻辑。
- 专属 engine 测试文件有 8 项，加已移除的 2 项 router 测试，本轮删除 10 项。若批准补删遗漏的 1 项，预期完整套件为 `808 - 11 = 797`；这是预期，尚非通过结果。
- `test_router_contracts.py` 仅删除 `"backtest": ("/api/backtest/runs", "get")` 行；v2 sentinel 与全部既有断言仍保留。

### OpenAPI 与运行核对

| 核对项 | 修改前 | 修改后 | 结论 |
|--------|--------|--------|------|
| APIRouter | 23 | 22 | 仅下线 v1 |
| OpenAPI 路径 | 137 | 135 | v1 实际为 2 路径，卡片“3 路径/134”有误 |
| HTTP 操作 | 172 | 169 | 减少 POST runs、GET runs、GET runs/{run_id} 共 3 操作 |
| v2 `/api/backtests` | 9 路径 / 10 操作 | 9 路径 / 10 操作 | 逐路径完整 JSON 相等 |
| 其余路径契约 | 保存完整基线 | 与基线逐项相等 | 无其他接口变更 |
| components.schemas | 含 BacktestRequest | 仅移除 BacktestRequest | 其他 schema 完整相等 |

准确消失的路径为 `/api/backtest/runs` 与 `/api/backtest/runs/{run_id}`。隔离临时 SQLite + ASGI 生命周期实测：启动/关闭通过，`GET /api/health` 为 `200`、`status=ok`、`db=wal`；3 个旧操作均返回 `404`，未登录访问 v2 与 models 仍为 `401`；初始化后 `backtest_runs` 和 `quant_backtests` 两表均存在。不访问真实行情/LLM、不启动端口服务、不重启日常实例。

### 测试与质量门禁

- **修改前全量覆盖率基线**：808 passed，114.52s；92.28%（JSON 精确值 92.28125%）。与卡片基线一致。
- **修改后全量 no-cov**：按卡片命令执行，4.66s，退出码 2；`test_backlog007_router_branches.py` 的残留 v1 import 导致 1 个 collection error，未取得全量通过证据。
- **修改后全量 coverage**：已执行卡片 coverage 命令；同一收集错误阻塞，未取得有效完整套件覆盖率。收集失败产生的局部覆盖率不用于“覆盖率不降”结论。
- **受影响测试双环境**：`test_backlog007_router_branches.py`、`test_router_contracts.py`、`test_main_static.py`，使用 `--continue-on-collection-errors --no-cov -p no:cacheprovider` 诊断；代理变量清空为 30 passed / 1 failed / 1 error（16.83s），HTTP/HTTPS 7897 + ALL_PROXY socks5 7897 为相同结果（16.72s）。28 项静态托管测试和 2 项其余 router 契约通过；失败均为上述已知遗漏，不能标为双环境全绿。
- Ruff `check .` 通过。最终逐文件 SHA256 检查：976 个原已跟踪非 reference 文件中仅白名单内 11 个变化，965 个保持一致；3 个删除路径恰好等于回收清单。AST 对比确认 main 仅移除 v1 import/注册、分支测试仅移除指定 2 函数、router 契约仅移除 v1 sentinel；API_CONTRACT §11 完整文本不变。测试删除遗留的文件尾空白已精确清理，最终 `git diff --check` 通过。
- 未运行前端 build/test/e2e：前端代码未改，现存调用阻塞已经由静态调用链与后端 404 证实。

### 保留项与文档范围

- `metrics.py`、v2 全套、Agent 工具、database.py、所有共享/v2 测试均保持原内容；`alpha_simulator.py` 仍引用共享 metrics，Agent 工具仍引用 v2 ma_crossover/significance。
- `backtest_runs` 表、schema 和历史数据不删除、不迁移；生产数据库未作为测试目标。
- 新增依赖为零，依赖清单和锁文件无变更；认证、`frontend/`、`reference/` 无修改。
- 已同步 `docs/API_CONTRACT.md` §9/路由汇总与 `docs/ARCHITECTURE.md` 的回测说明/依赖图；§11 v2 契约内容不变。EXEC_PLAN 标记 BLOCKED，CHANGELOG 追加日期标题与真实结果。
- `HANDOFF.md`、`docs/ROUTER_MAP.md`、`AGENTS.md`、`README.md`、`docs/TECH_STACK.md` 不在本卡白名单内，未修改；不运行会写 HANDOFF 的 `handoff-log.py`。其中旧 v1/路由数量描述可能仍需维护者另行安排同步。

### 可复查原始证据

证据目录：`C:\Users\SATANC~1\AppData\Local\Temp\finquant-backlog021-a47e34ef81e14aeb8347fd9a1e85791e\`。

- `recycle-before.json` / `recycle-confirmation.json`：回收前清单与回收站逐文件确认。
- `before-openapi.json` / `after-openapi.json` / `openapi-verification.json`：完整 OpenAPI 前后与断言结果。
- `before-tracked-sha256.json`：976 个非 reference 已跟踪文件的修改前 SHA256，用于白名单外保留项核验。
- `final-scope.json` / `verify_scope.py`：白名单、保留项哈希、AST 与 v2 契约完整性验证；HEAD 为 607a145、暂存区为空、无新增未跟踪文件。
- `baseline-pytest.log` / `baseline-coverage.json` / `post-recycle-no-cov.log` / `post-recycle-coverage.log`：全量基线与阻塞日志。
- `affected-proxy-off.log` / `affected-proxy-on.log`：双环境确定性诊断。
- 可重跑 OpenAPI/隔离生命周期验证：在 `backend` 执行 `.\.venv\Scripts\python.exe C:\Users\SATANC~1\AppData\Local\Temp\finquant-backlog021-a47e34ef81e14aeb8347fd9a1e85791e\verify_openapi.py`。

**待维护者决定**：补充遗漏 v1 测试/helper/import 与数量断言的修改授权，并决定前端活跃调用的迁移范围。获准后再完成完整 no-cov、coverage、双环境与最终范围门禁，才能标记 DONE。
