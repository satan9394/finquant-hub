# TASK-003: Portfolio HK/US PnL

## 目标
`calc_pnl()` 已接收 `MarketDataService`，它理论上已支持多市场。确认 HK/US 前缀正确传递并增加测试。

## 非目标
不改 Yahoo 适配器、不改 `calc_pnl()` 核心逻辑。

## 允许修改
- `backend/app/services/portfolio.py`（仅修正前缀传递，不改核心流程）
- `backend/tests/test_portfolio_market.py`（追加测试）

## 禁止修改
- 前端文件
- `docs/ai/` 下的文件

## 验收
```bash
cd backend && .venv\Scripts\python.exe -m pytest tests/test_portfolio_market.py -v
```
新增的 `test_pnl_with_hk_ticker()` 通过。

## 回滚
```bash
git checkout -- backend/app/services/portfolio.py backend/tests/test_portfolio_market.py
```
