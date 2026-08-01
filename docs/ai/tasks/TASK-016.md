# TASK-016: A 股基本面数据源质量提升

## 背景（真实投研验证发现）

对五粮液 (000858) 跑四大师投研后，风控委员在报告中主动发现重大数据质量问题：

> TTM 营收 462.8亿 / 净利 126亿（净利率 27.2%）与五粮液历史年报量级（年营收 800亿+、净利 300亿+）严重不符，疑似 2026 Q1 **单季数据误标为 TTM**。

根因：基本面数据当前依赖 **Yahoo fundamentals_timeseries**，对 A 股数据质量不稳（单季/季度可能误标为 TTM，`missing_net_income` 质量旗标已暴露）。

## 目标

提升 A 股基本面数据可信度，优先使用国内数据源（AkShare / Tushare），Yahoo 作为最后兜底，并加数据质量校验。

## 允许修改
- `backend/app/services/` 下基本面数据获取相关文件
- `backend/app/services/fundamentals.py`（如存在）
- 对应测试

## 实现思路

1. **源优先级重排**：AkShare → Tushare → Yahoo，而不是当前可能默认 Yahoo
   - 检查 `market_data.py` 的 fundamentals 实现，确认当前源顺序
   - AkShare 的 `stock_financial_abstract` 对 A 股财务数据覆盖最好
   - Tushare `fina_indicator` 需 token，作为中间层

2. **TTM 口径正确性**：
   - 若 AkShare/Tushare 能提供年报/季报原始值，正确计算 TTM（近四季滚动和）
   - 绝不把单季当 TTM

3. **数据质量校验**（报告构建器侧或 fundamentals 服务侧）：
   - 营收/净利量级合理性检查（与上年度比较，突变 >5x 标记可疑）
   - 净利率合理性（0-60% 正常区间外标记）
   - 质量旗标（如 missing_net_income）出现时，在报告中标注「数据存疑」而非静默使用

4. **数据溯源增强**：每个字段带 source + as_of_date + is_ttm 口径标记（现有 report_builder 已有此模式，增强它）

## 验证
```bash
cd backend && .venv\Scripts\python.exe -m pytest -q
cd backend && .venv\Scripts\python.exe -m ruff check .
```

实测：对 600519 和 000858 各跑一次 fundamentals 拉取，确认营收/净利量级与真实年报一致（茅台 2025 营收 ~1800亿、五粮液 ~900亿 量级）。

## 回滚
```bash
git checkout -- backend/app/services/
```

## 关键判断
- AkShare 未安装 → `pip install akshare` 或评估轻量替代
- 真实数据仍拿不到 → 保留 Yahoo 但加质量校验 + 报告标注存疑，不编造
- Tushare token 用户没有 → 设计为可选增强，不阻塞
