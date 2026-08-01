# Router Map — 20 路由器, 42 MVP + 72 新端点

| Prefix | File | Stage |
|--------|------|-------|
| /api/models | models_crud.py | MVP |
| /api/agents | agents.py | MVP |
| /api/chat | chat.py | MVP |
| /api/discussion | discussion.py | MVP |
| /api/market | market.py | MVP + Phase 9.2（市场级快照、复盘历史、源健康/优先级与批量预取） |
| /api/dashboard | dashboard.py | MVP |
| /api/analysis | analysis.py | MVP |
| /api/portfolio | portfolio.py | MVP |
| /api/backtest | backtest.py | MVP (v1 sync) |
| /api/research | research.py | New（含报告数据审计） |
| /api/backtests | backtests.py | New (v2 async + `POST /portfolio` 多市场/多周期组合回测) |
| /api/instruments | instruments.py | New |
| /api/screening | screening.py | New（两阶段动量发现 + 价值评分） |
| /api/wq | wq.py | New（真实字段搜索 + 因子模板 + 本地多空模拟 + BRAIN 桥接） |
| /api/swarm | swarm.py | New (`POST /analyze` + `POST /teams/earnings-review/run` SSE，报告持久化) |
| /api/notifications | notifications.py | New |
| /api/alerts | alerts.py | New |
| /api/mcp | mcp.py | New（已发现服务器/工具目录 + 运行时启停） |
| /api/settings | settings.py | New（安全系统配置 + 5 字段 cron 研究 job store/立即运行） |
| /api/usage | usage.py | New（LLM token 按日/场景聚合，只读） |
