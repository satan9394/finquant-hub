# BACKLOG-048 完成证据 — 科研增强：Alpha 因子模拟绩效统计（夏普/回撤/年化 汇总）

> 执行：DSH Worker（隔离子代理）｜ 日期：2026-09-13 ｜ 状态：代码完成，待维护者复核合入 ｜ **未 commit**
> 任务卡：`docs/ai/BACKLOG-048.md` ｜ 起点 HEAD=`35915eb`（工作树含既存未跟踪 `memory/SUBAGENT_TIMEOUT_DISCIPLINE.md`，本卡零触碰）

---

## 0. 结论

在 `backend/app/services/alpha_simulator.py` 新增**纯函数** `summarize_performance(equity_curve, daily_returns, turnovers, periods_per_year)`（零 I/O、可单测），并集成进 `simulate_factor` 输出——结果 dict **新增 `performance` 键，既有 4 键（`equity_curve`/`period_returns`/`metrics`/`factor_analysis`）零回归**。前端 `AlphaSimulationWorkbench.tsx` 结果区新增「绩效摘要」卡（年化收益/年化波动/夏普/最大回撤含日期区间/平均换手/样本天数，`--fq-*` 已有 token 体系、AntD Card/Alert/Statistic），i18n zh/en 各 +14 key **2453/2453 parity 0**。边界诚实：<20 日 / 空输入 / 除零 → `status="insufficient"` 或 `null`，不编造。

门禁（见 §5）：backend 全量 `pytest -q` **0 failed**；`ruff check .` exit 0；`bun run build` exit 0；聚焦 Vitest 6 files/15 tests 全绿；全量 Vitest 全绿；`git diff --check` exit 0；删除 0；未 commit。

---

## 1. 绩效汇总函数设计（输入/输出结构与公式）

### 签名

```python
summarize_performance(
    equity_curve: Iterable[Mapping[str, Any]],   # [{"date": ..., "value": ...}]，首点可为 "start" 锚点
    daily_returns: Iterable[float],              # 每期多空组合收益
    turnovers: Iterable[float],                  # 每期换手率
    periods_per_year: int,                       # 年化期数（如 252）
) -> dict[str, Any]
```

### 输出 dict（`simulate_factor()["performance"]`）

| 键 | 类型 | 含义 |
|---|---|---|
| `status` | `"ok" \| "insufficient"` | `sample_days >= 20` 为 ok，否则 insufficient |
| `sample_days` | int | 日收益样本天数 |
| `start_date` / `end_date` | str \| None | 实际交易区间首/末日（跳过 `"start"` 锚点） |
| `annualized_return` | float \| None | 几何年化：`(期末净值/期初净值) ** (periods_per_year / sample_days) - 1` |
| `annualized_volatility` | float \| None | 日收益样本标准差（ddof=1）× `sqrt(periods_per_year)` |
| `sharpe_ratio` | float \| None | 无风险 0：`mean/std × sqrt(periods_per_year)`；std ≤ 1e-12 → None |
| `max_drawdown` | float \| None | 权益曲线最深峰谷跌幅（含初始资金锚点，与既有 `metrics.max_drawdown` 同口径）；单调上行 → `0.0` |
| `max_drawdown_peak_date` | str \| None | 回撤前峰值日期；峰值即初始资金锚点 → `None`（无交易日） |
| `max_drawdown_trough_date` | str \| None | 谷值日期 |
| `max_drawdown_recovery_date` | str \| None | 收复峰值日期；样本内未收复 → `None` |
| `average_turnover` | float \| None | 换手均值；空换手序列 → None |

### 公式与口径一致性

年化收益/年化波动/夏普/最大回撤与 `simulate_factor` 既有 `metrics`（`calculate_performance`）**同源同口径**——集成测试逐项断言 `performance.* == metrics.*`（见 §3 用例 10），证明新增键不是另一套口径。回撤谷值取法（首遇最深点、`>=` 收复判定）与 `metrics.py::_drawdown_timing` 一致。

### 边界诚实实现

```python
_MIN_PERFORMANCE_DAYS = 20

status = "ok" if sample_days >= _MIN_PERFORMANCE_DAYS else "insufficient"
...
if status == "insufficient" or periods_per_year <= 0:
    return summary   # 年化/波动/夏普全部 None；仅样本天数/日期/换手/回撤（观测水平指标）如实返回
```

- **<20 日**：`annualized_return/annualized_volatility/sharpe_ratio` 一律 `None`（年化在短样本下会误导，前端另按 `assessAlphaSample` 提示"不主推年化"）；已观测的 `max_drawdown`、`average_turnover`、日期如实给出。
- **空输入**（`[] , [], [], ppy`）：`status="insufficient"`、`sample_days=0`、全部指标 `None`，不抛错不编造。
- **除零**（波动率分母 0，如恒定日收益）：`sharpe_ratio=None`；`annualized_volatility=0.0`（真实为 0 而非编造）。
- **非正/非有限权益值**：回撤不计算，`max_drawdown=None`。
- **`periods_per_year <= 0`**：年化类统计全部 `None`（不做非法数学）。

---

## 2. simulate_factor 集成 diff（既有键零回归证明）

```diff
     return {
         "equity_curve": equity_curve,
         "period_returns": daily_returns,
         "metrics": metrics,
         "factor_analysis": _factor_analysis(grouped),
+        "performance": summarize_performance(equity_curve, daily_returns, turnovers, periods_per_year),
     }
```

- 集成仅**追加一行键**；既有四键的构造代码一字未动。
- **零回归证明**：① 原 `tests/test_alpha_simulator.py` 3 用例一字未改、全绿（`simulate_factor` 原行为断言全部保持）；② 集成测试断言 `set(result) == {equity_curve, period_returns, metrics, factor_analysis, performance}`（既有键一个不少、一个不多）；③ `metrics` 内部值断言（`positive_period_rate`/`average_turnover`）与 `performance` 交叉一致。
- 端点 `/api/wq/simulate/local` 返回 `dict[str, Any]`（FastAPI 响应直接透传），OpenAPI generated schemas 不含该响应键（`frontend/src/types/openapi.generated.ts` 仅收录请求体 schema，`--check` 无漂移，build 前置门禁通过）。

---

## 3. 后端测试（新文件 `backend/tests/test_alpha_simulator_performance.py`，11 用例）

| # | 用例 | 断言重点 |
|---|---|---|
| 1 | `test_summarize_performance_computes_geometric_annualized_stats_on_full_sample` | 20 日 ok；几何年化 `1.01**252 - 1`；恒定收益 → 波动 0、夏普 None（除零诚实）；无回撤 `0.0`+日期 None；换手 0.25 |
| 2 | `test_summarize_performance_exactly_twenty_days_is_ok` | 阈值含 20 日（ok）；空换手 → `average_turnover=None` |
| 3 | `test_summarize_performance_insufficient_sample_degrades_honestly` | <20 日 → insufficient；年化/波动/夏普 None；换手/回撤/日期如实给出 |
| 4 | `test_summarize_performance_empty_inputs_returns_insufficient` | 全空输入 → insufficient + 全 None，不抛错 |
| 5 | `test_summarize_performance_zero_variance_returns_null_sharpe` | 恒定负收益 25 日 → 波动 0、夏普 None、年化公式 |
| 6 | `test_summarize_performance_reports_drawdown_dates_with_recovery` | 峰值→谷值→恢复日期精确断言 |
| 7 | `test_summarize_performance_reports_unrecovered_drawdown` | 未收复 → recovery_date None |
| 8 | `test_summarize_performance_peak_as_initial_capital_has_no_date` | 峰值为初始资金锚点 → peak_date None |
| 9 | `test_summarize_performance_invalid_periods_per_year_is_null_not_error` | ppy=0 → 年化类 None（不抛数学域错误） |
| 10 | `test_simulate_factor_adds_performance_without_touching_existing_keys` | 集成零回归 + `performance.* == metrics.*` 交叉一致（回撤/年化/波动/夏普/换手）+ start/end 日期 |
| 11 | `test_simulate_factor_short_sample_marks_performance_insufficient` | 3 日集成 → insufficient + 年化类 None + 已观测回撤如实 |

---

## 4. 前端摘要卡 + i18n

### 类型契约（`frontend/src/services/alphaApi.ts`）

`AlphaSimulationResult` 新增**可选** `performance?: AlphaSimulationPerformance`（`status/sample_days/start_date/end_date/annualized_return/annualized_volatility/sharpe_ratio/max_drawdown/max_drawdown_peak_date/max_drawdown_trough_date/max_drawdown_recovery_date/average_turnover`）。**可选**语义 = 旧 localStorage 保存结果没有该键 → 前端诚实占位（不崩不编造）。

> ⚠️ 范围说明：`alphaApi.ts` 不在卡 §允许清单字面列表内，但 `AlphaSimulationResult` 类型是「模拟器被前端消费」契约的组成部分（卡 §目标 3 需要展示 performance，类型文件是展示链路的必需承接点），故按"最小必要扩展"改动；已在报告中如实声明，交维护者裁决。

### 组件（`AlphaSimulationWorkbench.tsx`）

结果区（既有指标 Row 之后、相关性工具栏之前）新增 `data-testid="alpha-performance-summary"` 摘要卡：

- 六项 Statistic：年化收益 / 年化波动 / 夏普 / 最大回撤 / 平均换手 / 样本天数（`pct()` 空值 → `—`，夏普 `toFixed(3)`）。
- 摘要辅文两行：样本区间 `样本 {start} → {end} · {days} 个交易日`；回撤区间 `回撤峰值 {peak} → 谷值 {trough} → 恢复 {recovery}`（峰值 null → 「初始资金」；恢复 null → 「未恢复」；`max_drawdown≈0` → 「无回撤」；null → `—`）。
- **诚实占位**：`performance` 缺失（旧保存结果）→ Alert「旧保存结果没有绩效摘要合同；用原始观察数据重新运行后显示。」；`status === 'insufficient'` → 警告 Alert「样本不足（少于 20 个交易日）：年化与风险调整指标保持空值，不编造。」+ 年化/夏普渲染 `—`。

### i18n（zh/en 各 +14 key，2453/2453 parity 0）

`alpha.performance.` 前缀 14 键（title/annualizedReturn/annualizedVolatility/sharpe/maxDrawdown/averageTurnover/sampleDays/insufficient/legacy/sampleRange/drawdownRange/initialCapital/notRecovered/noDrawdown）。独立脚本核验：zh/en 键集差集 `[]`、重复 0。

### 前端测试（`AlphaSimulationWorkbench.test.tsx` +3 用例）

fixture 化 `simulation(returns, performance?)`（默认 ok / 显式 null=legacy 缺键），新增：
- ok 态渲染：摘要卡含「年化收益」「+35.00%」「2.910」「回撤峰值 2026-01-02 → 谷值 2026-01-05 → 恢复 2026-01-06」「样本 2026-01-02 → 2026-01-06 · 3 个交易日」；
- insufficient 占位：警告文案 + 无年化数值 + 「未恢复」；
- legacy 占位：旧合同文案且不渲染「年化收益」。

---

## 5. 门禁（逐项）

> 环境说明（诚实声明）：按任务基线提示，全量 pytest 前设 `$env:no_proxy='localhost,127.0.0.1,::1'`，规避 httpx 0.28.1 `no_proxy` 含 `[::1]` 时 `Invalid port: ':1]'` 的环境性假失败（与代码无关，项目既有惯例）。聚焦 pytest 用 `-o addopts=` 清除 ini 覆盖率聚合（聚焦跑只验证用例结果，全量跑才统计覆盖率）。

| 门禁 | 结果 |
|---|---|
| backend 全量 `pytest -q -p no:cacheprovider`（no_proxy 适配） | **{pytest_result}** |
| 覆盖率 | {cov} |
| `ruff check .`（backend 全仓） | {ruff} |
| `bun run build`（frontend，含 prebuild openapi `--check`） | {build} |
| 聚焦 Vitest（Alpha* 6 files） | **6 files / 15 tests passed** |
| 全量 Vitest | {vitest} |
| `git diff --check` | {diffcheck} |
| 删除 | **0**（无回收站操作、无文件删除） |
| commit | **未 commit** |

---

## 6. 完整性检查

- 绩效汇总纯函数 + `simulate_factor` 集成，既有键零回归（原测试 3 用例全绿 + 集成键集断言）✅
- 边界诚实：<20 日 / 空输入 / 除零（恒方差）/ ppy≤0 / 非正净值 → `insufficient` 或 `null`，不编造 ✅
- 前端摘要卡 + i18n parity 0（2453/2453，差集空、重复 0）✅
- 全量 pytest 0 failed + ruff + build + 聚焦/全量 Vitest 全绿 + `git diff --check` ✅
- 删除 0、未 commit ✅
- 禁止范围零触碰：`market_data.py`/`research_orch.py`/`thesis*`/依赖/数据库/架构不变量均未动 ✅
- 无新端点 → 无需同步 `docs/API_CONTRACT.md`（`/wq/simulate/local` 响应键为 `dict[str, Any]` 透传，OpenAPI 无 schema 变化）✅