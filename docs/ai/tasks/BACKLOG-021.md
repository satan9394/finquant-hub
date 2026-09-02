# BACKLOG-021 — 回收 v1 回测（路由下线 + 引擎回收 + 契约/测试同步）

> 状态：`[READY]` ｜ 优先级：P1 ｜ 创建：2026-09-02 ｜ 执行者：Codex
> 背景：SCOPE_FREEZE_V1.md §3.3 P2 明确要求"v1 回测 `backtest.py`（/api/backtest）前端零调用（grep `/api/backtest` 无匹配）；v2 已接管 → 路由下线（回收站），测试同步；OpenAPI 核对"——这是规划内**未完成**的回收项。v1 是旧版收盘价向量化回测（3 策略），v2（`backtests.py` + `ma_crossover` 等，A 股执行规则）已完整接管。本任务下线 v1 回测路由、回收 v1 引擎、同步测试与文档，消除 v1/v2 双轨。
>
> **开工前必读（维护者调研结论，勿跳过）**：
> 1. **前端零调用已确认**：`frontend/src` 无任何 `/api/backtest`（v1）引用；前端全用 `/api/backtests`（v2）。
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

- `backend/app/main.py`（L138 从 for 循环移除 `backtest.router` 注册）
- `backend/app/routers/backtest.py`（**回收**，进回收站）
- `backend/app/backtest/engine.py`（**回收**，进回收站）
- `backend/tests/test_backtest_engine.py`（**回收**）
- `backend/tests/test_backlog007_router_branches.py`（**移除** 两个 v1 backtest 测试函数，其余保留）
- `backend/tests/test_router_contracts.py`（**移除** L13 v1 backtest 契约行，其余保留）
- `docs/API_CONTRACT.md`（**移除** §9 回测 v1 章节，标注 v2 接管）
- `docs/ARCHITECTURE.md`（更新回测说明：v1 已回收，仅 v2）
- `docs/ai/tasks/BACKLOG-021.md`、`docs/ai/EXEC_PLAN.md`、`task/CHANGELOG.md`

## 禁止修改

- `backend/app/backtest/metrics.py`（alpha_simulator 依赖）、`ma_crossover.py`、`significance.py`、`risk.py`、`portfolio.py`、`loaders.py`、`optimizers.py`（v2/工具用）
- `backend/app/database.py`（**不删 `backtest_runs` 表**，L269/L694 引用保持）
- `backend/app/agent/tools_definitions.py`（`run_backtest` 工具，v2 实现）
- `backend/app/routers/backtests.py`（v2）、`backend/tests/test_backtest_metrics.py`/`test_backtest_significance.py`/`test_portfolio_backtest.py`（共享/v2）
- `frontend/` 全部、认证、`reference/`
- **不新增任何依赖**；**不 rm/Remove-Item/del 任何文件**（回收走回收站）
- 既有测试断言语义（v1 移除是预期，v2 断言不得改）

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

### 目标 3：文档同步

- `docs/API_CONTRACT.md`：§9 回测 v1（L215-221）移除或标注"已回收，v2 接管"；§11 回测 v2 保留
- `docs/ARCHITECTURE.md`：回测说明更新为"仅 v2（backtests.py + ma_crossover，A 股执行规则）；v1 已回收"
- `task/CHANGELOG.md` 追加（**带 `## YYYY-MM-DD` 标题行**）
- `docs/ai/EXEC_PLAN.md` 标记 `[DONE]`（证据：回收清单/OpenAPI 前后/测试数/覆盖率）

### 目标 4：验证

- 全量：`cd backend && .\.venv\Scripts\python.exe -m pytest ..\backend\tests -q --no-cov -p no:cacheprovider` 全绿（808 - 删减数）
- 覆盖率 `--cov=app --cov-report=term-missing` **不降**（92.28% 基线）；`ruff check .` 通过；`git diff --check` 通过
- **OpenAPI 核对**：`/api/backtest` 3 路径消失、`/api/backtests` 9 路径完整；可用 `test_api.py`/OpenAPI 检查确认
- **双环境确定性**：新增/受影响测试在代理 7897 开/关一致（本任务主要为删除，受影响测试跑双环境即可）
- 确认 `git grep 'api/backtest'` 前端仍零引用、后端无残留 import v1 router/engine
- **零新依赖、无 rm（全部回收走回收站）、无删除表**

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

- 回收文件清单（router/engine/test）与回收方式（回收站确认）
- 测试函数/契约行移除清单
- OpenAPI 前后对比（/api/backtest 3 路径消失、/api/backtests 完整）
- 全量套件结果与覆盖率前后（应不降）
- 保留项确认（metrics.py、backtest_runs 表、v2 全套、Agent 工具、共享测试）
- 依赖变化（应为零）；删除铁律遵守确认（无 rm）
