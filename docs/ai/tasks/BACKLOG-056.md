# BACKLOG-056: 投资组合风险归因与水下回撤分析 (Portfolio Tear Sheet)

> 目标模型：Codex (GPT-6 Luna · 最大思考模式)
> 业务领域：投资组合风险管理与资管级绩效报告
> 核心定位：水下回撤曲线 (Underwater Plot) + 月度收益热力图 + 滚动夏普/波动率 + 风险暴露分解

---

## 1. 目标 (Task)
将现有的静态持仓页面（Portfolio）升级为资管级“量化体检报告（Tear Sheet）”：计算并可视化水下回撤曲线（Underwater Plot）、月度收益分布热力图（Monthly Returns Heatmap）、60 日滚动夏普/波动率走势，以及多维度资产集中度与风险暴露分析。

---

## 2. 边界控制 (Touch Boundaries)
- **允许修改/新建**：
  - `backend/app/services/portfolio_risk.py` (NEW: 组合风险分析引擎)
  - `backend/app/routers/portfolio.py` (MODIFY: 暴露组合深度风险与归因端点)
  - `frontend/src/components/portfolio/UnderwaterChart.tsx` (NEW: 水下回撤负向面积图)
  - `frontend/src/components/portfolio/MonthlyHeatmap.tsx` (NEW: 月度收益热力矩阵)
  - `frontend/src/components/portfolio/RollingRiskChart.tsx` (NEW: 滚动夏普与波动率)
  - `frontend/src/pages/Portfolio.tsx` (MODIFY: 嵌入高级风险体检 Tab)
  - `backend/tests/test_portfolio_risk.py` (NEW)
  - `frontend/tests/PortfolioRiskComponents.test.tsx` (NEW)
- **严禁触碰**：
  - 严禁修改 `portfolios`、`positions` 已有表结构，纯基于历史持仓与行情数据计算。
  - 严禁引入新的依赖，月度热力图基于 AntD 纯 CSS / Grid 实现，水下曲线基于已有 `lightweight-charts`。

---

## 3. 架构规则与参考指针 (Decision Rules & Reference)
- **开源标杆与算法参考**：
  - 量化报告行业标准：`ranaroussi/quantstats` (6k★) 与 `pyfolio-reloaded`。
  - 风险归因与度量参考：`Riskfolio-Lib` (5k★)。
- **核心风险度量算法（纯 Python + numpy）**：
  - **水下回撤时序（Drawdown Series）**：
    `drawdown = (equity_curve - cummax(equity_curve)) / cummax(equity_curve)`（恒为 ≤ 0 的负百分比）。
  - **最长回撤修复期（Max Drawdown Duration）**：计算从净值创新高回撤到重新破新高之间的最大日历天数。
  - **滚动夏普比率（Rolling 60-day Sharpe）**：
    滑动窗口 60 天：`rolling_sharpe = mean(r) / std(r) * sqrt(252)`。
  - **月度收益矩阵**：按 `(年份, 月份)` 聚合日收益率 `prod(1 + r) - 1`，输出二维表格。

---

## 4. 契约规范 (Output Contract)
- `GET /api/portfolio/{id}/risk-tearsheet` 返回结构：
  ```json
  {
    "metrics": {
      "max_drawdown": float,
      "max_drawdown_duration_days": int,
      "annualized_volatility": float,
      "calmar_ratio": float,
      "sortino_ratio": float
    },
    "underwater_series": [{"time": "YYYY-MM-DD", "value": float}],
    "rolling_metrics": [{"time": "YYYY-MM-DD", "sharpe": float, "volatility": float}],
    "monthly_matrix": [
      {"year": 2026, "months": [float, float, ...], "annual_total": float}
    ]
  }
  ```

---

## 5. 验证门禁 (Validation Gates)
```bash
# 1. 后端组合风险算法单元测试（回撤深度、修复期、滚动夏普与空持仓安全处理）
cd backend && .venv\Scripts\python.exe -m pytest tests/test_portfolio_risk.py -q

# 2. 前端构建与组件测试
cd frontend && bun run build
cd frontend && bun run test tests/PortfolioRiskComponents.test.tsx
```

---

## 6. 完工闭环 (Documentation Closeout)
1. 更新 `docs/ai/evo/NEXT_BACKLOG.md`，追加 BACKLOG-056 为已完成。
2. 同步 `docs/API_CONTRACT.md`。
3. 追加 `task/CHANGELOG.md` 记录。
