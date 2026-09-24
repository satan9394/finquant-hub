# BACKLOG-055: 因子深度分析工坊与分层多空走势 (Alpha Quant Lab)

> 目标模型：Codex (GPT-6 Luna · 最大思考模式)
> 业务领域：量化多因子投研与绩效评估
> 核心定位：因子 IC/Rank IC 时序 + 分位数累积收益分层图 (Quantiles) + 换手率与自相关性

---

## 1. 目标 (Task)
构建专业级 Alpha 因子研究工作台：在后端引入基于 numpy 的无依赖轻量因子统计引擎，计算 IC（信息系数）、Rank IC、IC_IR、t 统计量与多空换手率；在前端 Discover 页面渲染 Q1~Q5 分位数累积净值分层走势（Quantile Cumulative Returns）、多空净值对冲曲线（Long-Short Spread）与 IC 时序直方图。

---

## 2. 边界控制 (Touch Boundaries)
- **允许修改/新建**：
  - `backend/app/services/alpha_analytics.py` (NEW: 因子统计纯函数库)
  - `backend/app/routers/wq.py` (MODIFY: 暴露因子深度分析端点)
  - `frontend/src/pages/alpha/AlphaFactorAnalytics.tsx` (NEW: 因子研究工作台面板)
  - `frontend/src/components/charts/QuantileReturnChart.tsx` (NEW: 分层净值走势图)
  - `frontend/src/components/charts/FactorIcHistogram.tsx` (NEW: IC 分布时序图)
  - `frontend/src/pages/Discover.tsx` (MODIFY: 挂载因子分析工坊)
  - `backend/tests/test_alpha_analytics.py` (NEW)
  - `frontend/tests/AlphaFactorAnalytics.test.tsx` (NEW)
- **严禁触碰**：
  - 严禁引入外部重型包（如 scipy、statsmodels、alphalens 等），算法全部基于已有 `numpy` 纯向量化实现。
  - 严禁臆造样本，若有效交易日少于 20 天，明确返回 `status="insufficient"`。

---

## 3. 架构规则与参考指针 (Decision Rules & Reference)
- **开源标杆与算法参考**：
  - 微软量化平台：`microsoft/qlib` (17k★) 因子评估模块（`qlib.contrib.eval`）。
  - 本地参考仓库：`reference/wq-alpha-research`（WorldQuant 因子回测公式）与 `reference/Vibe-Trading`。
  - 因子分析行业标准：Quantopian `alphalens` 的单因子评估框架。
- **核心量化数学公式（用 numpy 纯函数实现）**：
  - **Rank IC**：计算当期因子值排名与下期收益率排名的斯皮尔曼秩相关系数：
    `rank_ic = corr(rank(factor_values), rank(forward_returns))`。
  - **IC_IR**：`mean(Rank_IC) / std(Rank_IC)`，衡量因子预测能力的信息比率。
  - **分层收益（Quantile Returns）**：将每期标的池按因子值升序切分为 5 组（Q1 最低，Q5 最高），按等权组合计算每组净值随时间的累积曲线：
    `cumulative_return_q = cumprod(1 + daily_return_q)`。
  - **多空利差（Long-Short Spread）**：`Q5_cumulative - Q1_cumulative`。
- **单调性校验（Monotonicity）**：
  - 如果 Q1 < Q2 < Q3 < Q4 < Q5，表明因子单调性极佳；计算秩相关判定并在前端高亮显示。

---

## 4. 契约规范 (Output Contract)
- `GET /api/wq/factors/{id}/analytics` 返回结构：
  ```json
  {
    "summary": {
      "ic_mean": float,
      "ic_std": float,
      "ic_ir": float,
      "t_stat": float,
      "monotonicity_score": float
    },
    "ic_series": [{"date": "YYYY-MM-DD", "ic": float, "rank_ic": float}],
    "quantile_returns": {
      "dates": ["YYYY-MM-DD"],
      "q1": [float], "q2": [float], "q3": [float], "q4": [float], "q5": [float],
      "long_short": [float]
    }
  }
  ```

---

## 5. 验证门禁 (Validation Gates)
```bash
# 1. 后端因子数学算法单元测试（覆盖秩相关、分位数切割、零除保护）
cd backend && .venv\Scripts\python.exe -m pytest tests/test_alpha_analytics.py -q

# 2. 前端构建与渲染单测
cd frontend && bun run build
cd frontend && bun run test tests/AlphaFactorAnalytics.test.tsx
```

---

## 6. 完工闭环 (Documentation Closeout)
1. 更新 `docs/ai/evo/NEXT_BACKLOG.md`，追加 BACKLOG-055 为已完成。
2. 同步 `docs/API_CONTRACT.md` 记录因子分析端点。
3. 追加 `task/CHANGELOG.md` 记录。
