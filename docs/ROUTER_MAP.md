# Router Map — 23 APIRouter，176 个 OpenAPI 操作

> `backend/app/main.py` 另内联公开的 `GET /api/health`。当前生成契约为 140 个 `/api/*` 路径、176 个 HTTP 操作（实测 `app.openapi()`，不含内联健康检查）；除 `/api/auth/*` 与 `/api/health` 外，业务路由统一附加 `authenticated_context`。

| Prefix | File | Stage |
|--------|------|-------|
| /api/auth | auth.py | 邮箱免密认证；local-only 模式下登录端点不可用 |
| /api/me/credentials | credentials.py | 用户级加密凭据 |
| /api/models | models_crud.py | MVP + POST /discover 供应商模型列表（用户隔离） |
| /api/agents | agents.py | MVP |
| /api/chat | chat.py | MVP |
| /api/discussion | discussion.py | MVP |
| /api/market | market.py | MVP + Phase 9.2（市场级快照、复盘历史、源健康/优先级与批量预取） |
| /api/dashboard | dashboard.py | MVP + TASK-017 导入 + AIOS-040 owner-scoped Decision Inbox + Workbench latest news |

Dashboard endpoint additions: `GET /api/dashboard/news`（综合财经搜索，返回来源、时间、错误与 `data_status`，默认最多 6 条）。
| /api/analysis | analysis.py | MVP |
| /api/portfolio | portfolio.py | MVP + AIOS-053 独立 Paper 账本/UNKNOWN FX 估值 + AIOS-054 owner-scoped hypothesis 模拟复盘与非因果 review outcome |
| /api/backtest | backtest.py | MVP (v1 sync) |
| /api/research | research.py | New（含报告数据审计、typed memory 管理/导出、evidence 审计与脱敏导出） |
| /api/backtests | backtests.py | New（`strategy-ir/v1` 非执行解析/可逆草稿编译 + v2 async + 多市场组合回测 + saved completed strategy 私有只读 share preview） |
| /api/instruments | instruments.py | New |
| /api/screening | screening.py | New（两阶段动量发现 + 价值评分） |
| /api/wq | wq.py | New（真实字段搜索 + 因子模板 + 本地多空模拟/横截面 IC + BRAIN 桥接） |
| /api/swarm | swarm.py | New (`POST /analyze` + `POST /teams/earnings-review/run` SSE，报告持久化) |
| /api/notifications | notifications.py | New |
| /api/alerts | alerts.py | New（技术信号规则 + Thesis/Portfolio/Strategy monitor 草稿/显式确认） |
| /api/mcp | mcp.py | New（已发现服务器/工具目录 + 运行时启停；http 远程与 stdio 本地 command 两种 transport） |
| /api/settings | settings.py | New + AIOS-060（安全系统配置 + 带 lease/事件/恢复语义的 5 字段 cron 研究 job/run lineage + owner-local 产品指标） |
| /api/usage | usage.py | New（LLM token 按日/场景聚合 + 会话级用量明细 records + 按 owner 单价估算费用 cost + 按模型/会话类型的维度统计 stats；窗口支持 `days` 或 `start`/`end`，只读） |
| /api/model-pricing | model_pricing.py | New（owner-scoped 模型单价 CRUD；无内置单价，缺价一律 unpriced） |
| /api/thesis | thesis.py | New（投资论文 CRUD、不可变版本 diff、追加式用户确认、claim-evidence 时间边、Challenge、evidence-aware 漂移核验、验证实验 intent、持久化复盘流与私有只读 share preview） |
