# BACKLOG-048 — 科研增强：Alpha 因子模拟绩效统计（夏普/回撤/年化 汇总）

> 状态：`[DONE]` ｜ 优先级：P2 ｜ 创建：2026-09-13 ｜ 完成：2026-09-13 ｜ 执行：DSH Worker

## 背景

科研链路已具备 `backend/app/services/alpha_simulator.py::simulate_factor`（纯函数：因子多空组合模拟，输入 date/symbol/factor/forward_return → 输出净值曲线/日收益/换手等）。前端 `AlphaSimulationWorkbench.tsx` 展示结果。**缺口**：模拟结果缺一组"绩效总览"（年化收益、年化波动、夏普、最大回撤、换手率汇总），用户看一堆日收益难下结论。本卡补这组绩效统计（纯逻辑增强，不碰架构）。

## 目标

1. **后端纯函数**：在 `alpha_simulator.py` 增加 `summarize_performance(equity_curve, daily_returns, turnovers, periods_per_year)` 或等价模块（**纯函数、零 I/O、可单测**）：
   - 年化收益（几何）、年化波动、夏普（无风险 0）、最大回撤（含日期区间）、换手率均值、样本天数；
   - 天数不足（如 <20 日）时**诚实降级**：返回 `insufficient` 标记与有限指标，不编造。
2. **集成到 simulate_factor 输出**：结果 dict 新增 `performance` 键（键名以现有返回结构为准，先读源码确认），**既有键与行为零回归**（原测试全绿）。
3. **前端展示**：`AlphaSimulationWorkbench.tsx` 结果区新增绩效摘要卡片（年化/夏普/回撤等，中文文案，`--fq-*` token，空/不足态诚实占位），i18n zh/en parity 0。
4. 测试：后端纯函数单测（正常/不足天数/空输入/除零边界）+ 前端组件测试（摘要卡渲染 + insufficiency 占位）。

## 允许修改
- `backend/app/services/alpha_simulator.py`、`backend/tests/test_alpha_simulator*.py`
- `frontend/src/pages/...` 或组件 `AlphaSimulationWorkbench.tsx`（先读定位）、`frontend/src/i18n/{zh,en}.ts`
- 证据：`docs/ai/tasks/BACKLOG-048.md`、`docs/ai/BACKLOG-048.md`、`docs/ai/EXEC_PLAN.md`、`task/CHANGELOG.md`、`HANDOFF.md`

## 禁止修改
- 不改架构不变量（无 ORM/连接池/DAL/DI）；不动 `market_data.py`、`research_orch.py`、`thesis*.py`（他域）
- 不加依赖；不改 E2E/playwright config；不删文件；不 commit
- 不臆造指标（夏普分母为 0 或样本不足必须诚实降级，不返回假值）

## 完成标准
1. 绩效汇总纯函数 + `simulate_factor` 集成，既有键零回归（原测试全绿）
2. 边界诚实：<20 日/空输入/除零 → `insufficient` 或 null，不编造
3. 前端摘要卡 + i18n parity 0
4. 后端全量 `pytest -q` 0 failed + ruff + build + 聚焦 Vitest 全绿；`git diff --check`；删除 0；未 commit

## 参考
- `backend/app/services/alpha_simulator.py`（`simulate_factor` L97+、`_factor_analysis` L45、`_ranks` L30）
- 前端：`frontend/src/pages/AlphaResearchPanel.tsx`、`AlphaSimulationWorkbench.tsx`、`AlphaTemplateCatalog.tsx`（先读定位模拟器如何被调用/渲染）
- 测试先例：`backend/tests/test_alpha_simulator*.py`、`frontend/tests/AlphaSimulationWorkbench.test.tsx`

## 完成证据模板
```
- 绩效汇总函数设计（输入/输出 dict 结构、各指标公式）
- simulate_factor 集成 diff（既有键零回归证明：原测试全绿）
- 边界诚实实现（不足天数/空/除零）与测试
- 前端摘要卡 diff + i18n parity 数字
- 门禁逐项（backend pytest 全量 0 failed + ruff + build + 聚焦/全量 Vitest）
- git diff --check、删除 0、未 commit
```