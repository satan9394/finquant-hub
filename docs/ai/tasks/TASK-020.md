# TASK-020: 筹码分布 + Morningstar 评估与实现

## 目标
两个数据依赖型功能：筹码分布（获利比例/平均成本/集中度）与 Morningstar 公允价值/护城河/星级筛选。

## ⚠️ 前置：可行性评估（先做）
这两个功能依赖外部数据源，可能无法稳定获取。**先评估可行性再实现**：
1. 筹码分布：A 股筹码分布通常需 `distribution` 类数据（同花顺/东财有，但非免费开放 API）。检查 AkShare 是否有 `stock_cyq_em`（东方财富筹码分布）可用
2. Morningstar：公允价值/护城河星级需 Morningstar API（通常需付费 key）。检查是否有免费替代（如免费 star rating 接口）

## 允许修改
- `backend/app/services/`（筹码/Morningstar 数据服务）
- `backend/app/routers/`（对应端点）
- `frontend/src/pages/`（展示页）
- 对应测试

## 实现思路
**若数据源可用：**
1. 筹码分布：`GET /api/instruments/{symbol}/chip-distribution` → 获利比例、平均成本、90%/70% 集中度区间、筹码峰位
2. Morningstar：`GET /api/instruments/{symbol}/morningstar` → 公允价值、护城河等级、星级；`/api/screening` 加星级筛选维度

**若数据源不可用：**
- 在 `docs/ai/DECISIONS.md` 记录「数据源不可用」决策
- 不硬造数据；功能标记为「依赖外部数据源，暂缓」
- 报告给用户而不是静默跳过

## 验证
```bash
cd backend && .venv\Scripts\python.exe -m pytest -q
cd backend && .venv\Scripts\python.exe -m ruff check .
cd frontend && bun run build
```

## 回滚
```bash
git checkout -- backend/app/services/ frontend/src/pages/
```

## 关键判断
- **核心纪律：不编造数据。** 数据源拿不到就明确标记不可用，绝不填充假筹码分布/假星级
- 优先做筹码分布（AkShare 若支持），Morningstar 看 key 是否可得
