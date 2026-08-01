# TASK-014: 13 章投研报告接入基本面数据

## 背景（来自真实投研验证，B 阶段）

用四大师团队对 600519 跑真实分析后，13 章报告第 3-11 章（主营/财务概览/盈利/成长/偿债/运营/现金流/股东结构/机构评级）和第 13 章投资结论全部输出硬编码占位符：
`unknown（当前证据不足，不能形成可靠结论）`

只有第 2 章宏观策略 + 第 12 章风险提示有真实内容。根因是 A 股基本面数据没有接入 swarm 报告构建器。

## 目标

让 13 章报告的非分析章节有真实基本面数据填充，而非占位符。

## 允许修改
- `backend/app/services/` 下报告构建器相关文件（swarm/report builder）
- 新建 `backend/app/services/fundamentals.py` 如果当前无统一基本面服务
- 对应测试文件

## 实现思路
1. 检查现有基本面数据路径（fundamentals / market_data / AkShare / Tushare）
2. 如果 A 股基本面数据源（AkShare/Tushare）未接线，先接线：查 `backend/app/services/market_data.py` 的 fundamentals 方法
3. 报告构建器在生成 13 章前，先拉取该股票的基本面指标，注入对应章节
4. 对确实拿不到数据的字段，保持 `unknown（当前证据不足）` 的诚实语义，但至少营收/净利/毛利率/负债率/现金流等核心财务指标应有数据
5. 补测试：mock 基本面数据源，验证 13 章中财务章节不再全占位

## 禁止修改
- `docs/ai/ARCHITECTURE.md` 中的不变量
- `reference/` 目录
- 前端文件（除非必须）

## 验证
```bash
cd backend && .venv\Scripts\python.exe -m pytest -q
cd backend && .venv\Scripts\python.exe -m ruff check .
cd frontend && bun run build
```

## 回滚
```bash
git checkout -- backend/app/services/
```

## 关键判断
- 如果 AkShare/Tushare 在 `.venv` 未安装 → 安装或设计降级链（Yahoo trailing → 失败占位）
- 不要编造数据。数据源确实拿不到时保留 unknown 语义
