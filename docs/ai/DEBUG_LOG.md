# Debug Log — 全量功能调试记录

## 2026-07-29 后端 API 测试

| 端点 | 方法 | 结果 | 数据 |
|------|------|------|------|
| `/api/health` | GET | ✅ 200 | `{"status":"ok","version":"1.0.0","db":"wal"}` |
| `/api/dashboard/stats` | GET | ✅ 200 | 模型2/会话1/讨论1 |
| `/api/market/quote?ticker=600519` | GET | ✅ 200 | 贵州茅台 ¥1321, PE 19.96 |
| `/api/market/kline?ticker=600519&count=3` | GET | ✅ 200 | 3 日 K 线数据 |
| `/api/market/indicators?ticker=600519` | GET | ✅ 200 | 技术指标 |
| `/api/backtests` | GET | ✅ 200 | AAPL ma_crossover 回测含权益曲线 |
| `/api/analysis/sh600519/indicators` | GET | ✅ 200 | 评分+信号 |
| `/api/portfolio/groups` | GET | ✅ 200 | 组合列表 |

## 前端构建

| 测试 | 结果 |
|------|------|
| `bun run build` | ✅ ✓ built |

## 测试套件

| 套件 | 结果 |
|------|------|
| pytest 全量 | ✅ 110 passed |
| ruff check | ✅ All checks passed |

## 发现的问题

1. **BacktestResultCard.tsx** — Chat页面"运行回测"按钮调用的是新 `/api/backtests` 端点，该端点需要 `POST` 创建。
2. **scheduler.py** — 首次启动后等待到 18:00 才执行，可通过 `schedule_run_immediately` 模式加速测试。
3. 未发现功能回归或错误。
