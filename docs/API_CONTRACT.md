# FinQuant Hub — API 端点目录

> 本文档按路由分组列出所有 API 端点。请求/响应 JSON 结构请参考对应路由文件或 FastAPI `/docs`。
> **约定**：所有非 SSE 响应 `Content-Type: application/json; charset=utf-8`；错误格式为 `{"detail": "..."}`。
> 7 个公开 SSE 端点统一使用 `event: / data:` 格式；另有 1 个隐藏兼容别名。精确事件契约见下节。

---

## SSE 事件协议

所有 SSE 响应均为 `Content-Type: text/event-stream`。每帧由 `event: <type>` 和单行 UTF-8 JSON `data: {...}` 组成，以空行结束。客户端必须按事件名解析；`error` 是终止事件，统一使用 `{"error": "错误描述", "message": "错误描述"}`。`error` 是规范字段，`message` 仅为旧客户端兼容别名，并计划在下一主版本移除。

### 单 Agent 对话

`POST /api/chat/sessions/{id}/messages`：

| event | data |
|------|------|
| `token` | `{"delta": "部分文本"}` |
| `done` | `{"message_id": 12, "token_count": 245, "user_message_id": 11}` |
| `error` | `{"error": "错误描述"}` |

### 多 Agent 讨论

`POST /api/discussion/rooms/{id}/start`：

| event | data |
|------|------|
| `round_start` | `{"round": 1, "total_rounds": 3}` |
| `agent_start` | `{"agent": "value_investor", "name": "价值投资官", "avatar": "🏛️", "round": 1}` |
| `token` | `{"delta": "部分文本", "agent": "value_investor"}` |
| `agent_end` | `{"agent": "value_investor", "message_id": 31, "token_count": 320}` |
| `summary` | `{"content": "讨论总结全文"}` |
| `done` | `{"room_id": 1}` |
| `error` | `{"error": "错误描述"}` |

### 并行研究

`POST /api/analysis/stock` 与 `POST /api/research` 共用以下研究事件；后者会先发送 `report_started`，并在 `done` 中附加同一个 `report_id`。

| event | data |
|------|------|
| `report_started` | `{"report_id": 42}`，仅 `/api/research` |
| `agent_started` | `{"role_key": "business_analyst", "name": "商业模式", "avatar": "..."}` |
| `tool_call` | `{"role_key": "business_analyst", "tool_name": "search_news", "arguments": "{...}"}` |
| `agent_completed` | `{"role_key": "business_analyst", "name": "商业模式", "length": 1200}` |
| `report_progress` | `{"section": 1, "total": 13, "name": "生成公司概况"}` |
| `done` | `{"ticker": "usAAPL", "report": {"schema_version": 2, "chapters": [...]}, "agent_results": {...}, "report_id": 42}`；`report_id` 仅 `/api/research` |
| `error` | `{"error": "错误描述", "role_key": "risk_manager"}`；`role_key` 仅 Agent 级错误存在 |

`/api/research` 会持久化 `agent_started` 至 `done/error` 的事件 payload；`done.payload.report_id` 必须与首帧 `report_started.report_id` 相同。HTTP 建连前的校验失败仍使用普通 `{"detail": "..."}` 错误响应。

### Swarm 团队研究

`POST /api/swarm/analyze` 与 `POST /api/swarm/teams/earnings-review/run` 复用并行研究协议，均先发送 `report_started`，随后发送 `agent_started/tool_call/agent_completed/done/error`。四大师旧入口 `/api/swarm/teams/four-masters/run` 是不进入 OpenAPI 的兼容别名。

### 通知流

`GET /api/notifications/stream` 发送 `notification` 事件，SSE `id` 等于通知 ID；客户端可用 `Last-Event-ID` 或 `after_id` 断点续传。连接空闲时由 sse-starlette 发送 ping。

---

## 0. 健康检查

| 路径 | 方法 | 功能 | 阶段 |
|------|------|------|------|
| `/api/health` | GET | 返回服务状态、版本号、数据库状态 | MVP |

---

## 1. 模型管理 `/api/models`

| 路径 | 方法 | 功能 | 阶段 |
|------|------|------|------|
| `/api/models` | GET | 列出所有模型配置（API Key 不返回明文） | MVP |
| `/api/models` | POST | 创建新模型配置 | MVP |
| `/api/models/{id}` | PUT | 更新模型配置字段子集 | MVP |
| `/api/models/{id}` | DELETE | 删除模型配置 | MVP |
| `/api/models/{id}/test` | POST | 测试模型连通性，返回延迟和回复 | MVP |
| `/api/models/{id}/set-default` | POST | 设为默认模型（互斥） | MVP |

---

## 2. 角色预设 `/api/agents`

| 路径 | 方法 | 功能 | 阶段 |
|------|------|------|------|
| `/api/agents` | GET | 列出所有 Agent 角色预设（首次启动自动播种 6 个） | MVP |
| `/api/agents` | POST | 创建新角色（`role_key` 全局唯一） | MVP |
| `/api/agents/{id}` | PUT | 更新角色字段子集 | MVP |
| `/api/agents/{id}` | DELETE | 删除角色（预设角色也允许删除） | MVP |

---

## 3. 单 Agent 对话 `/api/chat`

| 路径 | 方法 | 功能 | 阶段 |
|------|------|------|------|
| `/api/chat/sessions` | POST | 创建新会话（可指定角色预设、模型） | MVP |
| `/api/chat/sessions` | GET | 列出活跃会话（含消息数和最后摘要） | MVP |
| `/api/chat/sessions/{id}` | PUT | 更新会话标题/角色/模型 | MVP |
| `/api/chat/sessions/{id}` | DELETE | 删除会话（级联删除消息） | MVP |
| `/api/chat/sessions/{id}/messages` | GET | 获取会话历史消息（按时间升序） | MVP |
| `/api/chat/sessions/{id}/messages` | POST | 发送消息，经 ToolRegistry function-calling 循环后以 **SSE 流**返回 `tool_call`/`token`/`done` | MVP |

---

## 4. 多 Agent 讨论 `/api/discussion`

| 路径 | 方法 | 功能 | 阶段 |
|------|------|------|------|
| `/api/discussion/rooms` | POST | 创建讨论房间（指定角色列表和轮数） | MVP |
| `/api/discussion/rooms` | GET | 列出所有讨论房间 | MVP |
| `/api/discussion/rooms/{id}` | GET | 获取房间详情及所有消息 | MVP |
| `/api/discussion/rooms/{id}/start` | POST | **SSE 流**启动讨论（已完成的房间返回 409） | MVP |

---

## 5. 行情数据 `/api/market`

| 路径 | 方法 | 功能 | 阶段 |
|------|------|------|------|
| `/api/market/calendar?date=` | GET | 查询证据边界内的 A 股交易日（交易日/周末/交易所节假日） | 新增 |
| `/api/market/overview?market=` | GET | A/港/美主要指数快照；A 股含全市场涨跌统计，未覆盖口径显式返回 unsupported | 新增 |
| `/api/market/sectors?kind=&limit=` | GET | A 股行业/概念板块涨幅排行及领涨股 | 新增 |
| `/api/market/popular?limit=` | GET | 东方财富人气股排行与实时行情 | 新增 |
| `/api/market/limit-up?date=` | GET | 指定交易日涨停池、封板与连板统计 | 新增 |
| `/api/market/sources` | GET | 查询行情/K 线源优先级与逐源 CircuitBreaker 健康状态 | 新增 |
| `/api/market/sources` | PATCH | 校验、应用并持久化行情/K 线源顺序 | 新增 |
| `/api/market/prefetch` | POST | 有界并发批量预取，可按 ticker 保留错误并跨源补齐缺失字段 | 新增 |
| `/api/market/reviews` | POST | 基于真实快照生成并持久化多市场 LLM 复盘；外部发送默认关闭 | 新增 |
| `/api/market/reviews` | GET | 查询大盘复盘历史 | 新增 |
| `/api/market/reviews/{review_id}` | GET | 获取单次复盘的原始快照、来源、模型产出与状态 | 新增 |
| `/api/market/search?q=` | GET | 搜索股票（东方财富 + Yahoo 双源合并） | MVP |
| `/api/market/quote?ticker=` | GET | 实时行情（腾讯→新浪→Yahoo 降级链） | MVP |
| `/api/market/kline?ticker=&period=&count=` | GET | K 线数据（新浪→腾讯→Yahoo 降级链） | MVP |
| `/api/market/indicators?ticker=&indicators=&count=` | GET | 技术指标计算（MA/MACD/RSI/KDJ/BOLL/ATR/VolMA） | MVP |

---

## 6. 仪表盘 `/api/dashboard`

| 路径 | 方法 | 功能 | 阶段 |
|------|------|------|------|
| `/api/dashboard/stats` | GET | 聚合统计（模型数、会话数、讨论数、消息数等） | MVP |

---

## 7. 个股分析 `/api/analysis`

| 路径 | 方法 | 功能 | 阶段 |
|------|------|------|------|
| `/api/analysis/stock` | POST | **SSE 流**多 Agent 并行研究分析 | MVP |
| `/api/analysis/{ticker}/indicators` | GET | 技术指标 + 信号检测 + 综合评分（-100 ~ +100） | MVP |
| `/api/analysis/{ticker}/chart-data` | GET | 轻量级图表数据（lightweight-charts 兼容格式） | MVP |

---

## 8. 投资组合 `/api/portfolio`

| 路径 | 方法 | 功能 | 阶段 |
|------|------|------|------|
| `/api/portfolio` | POST | 创建投资组合 | MVP |
| `/api/portfolio` | GET | 列出所有投资组合 | MVP |
| `/api/portfolio/{id}` | GET | 获取单组合详情 | MVP |
| `/api/portfolio/{id}` | PUT | 更新组合名称/描述/货币 | MVP |
| `/api/portfolio/{id}` | DELETE | 删除组合 | MVP |
| `/api/portfolio/{id}/positions` | POST | 添加持仓 | MVP |
| `/api/portfolio/{id}/positions` | GET | 列出持仓 | MVP |
| `/api/portfolio/positions/{position_id}` | PUT | 更新持仓股数/成本 | MVP |
| `/api/portfolio/positions/{position_id}` | DELETE | 删除持仓 | MVP |
| `/api/portfolio/{id}/pnl` | GET | 实时盈亏计算（多市场行情估值） | MVP |

---

## 9. 回测 v1（同步）`/api/backtest`

| 路径 | 方法 | 功能 | 阶段 |
|------|------|------|------|
| `/api/backtest/runs` | POST | 执行旧版收盘价向量化回测（3 策略：ma_cross/rsi_reversal/bollinger）；不模拟 A 股 T+1/涨跌停，A 股严谨执行使用 v2 | MVP |
| `/api/backtest/runs` | GET | 列出历史回测运行记录 | MVP |
| `/api/backtest/runs/{id}` | GET | 获取单次回测完整结果 | MVP |

---

## 10. 研究报告 `/api/research`

| 路径 | 方法 | 功能 | 阶段 |
|------|------|------|------|
| `/api/research/audit` | POST | 抽取报告数据点，或对外部核验值生成准出/打回结论 | 新增 |
| `/api/research` | POST | **SSE 流**启动 4 Agent 并行研究 + team-lead 综合评审，生成统一 13 章报告 | 新增 |
| `/api/research` | GET | 列出历史研究报告（分页） | 新增 |
| `/api/research/history` | GET | 按股票代码聚合的历史版本（含运行统计） | 新增 |
| `/api/research/{id}` | GET | 获取单份报告详情（含事件时间线、工具调用日志） | 新增 |
| `/api/research/{id}/export?format=` | GET | 按格式导出（md/html/pdf/docx），即时生成 | 新增 |

---

## 11. 回测 v2（异步）`/api/backtests`

| 路径 | 方法 | 功能 | 阶段 |
|------|------|------|------|
| `/api/backtests` | POST | 创建 MA 双均线回测任务（异步，返回 202）；A 股默认模拟 T+1/涨跌停/禁做空，结果含 Bootstrap/Monte Carlo/Walk-forward 验证 | 新增 |
| `/api/backtests` | GET | 列出回测运行（可按 symbol 过滤或仅已保存） | 新增 |
| `/api/backtests/portfolio` | POST | 创建多标的、多市场、多周期组合回测，返回集中度/回撤/VaR/ES/分散化风险 X 光 | 新增 |
| `/api/backtests/{id}` | GET | 获取回测状态和结果（含交易规则、拒单、显著性验证、equity_curve/trades/warnings） | 新增 |
| `/api/backtests/{id}/trades` | GET | 获取回测交易明细 | 新增 |
| `/api/backtests/{id}/save` | POST | 标记回测为已保存 | 新增 |
| `/api/backtests/{id}/cancel` | POST | 取消进行中的回测 | 新增 |

**状态机**：`queued` → `loading_data` → `running` → `calculating_metrics` → `completed`（终态：`failed` / `cancelled`）

---

## 12. 统一标的 `/api/instruments`

| 路径 | 方法 | 功能 | 阶段 |
|------|------|------|------|
| `/api/instruments/search?q=` | GET | 搜索标的（含 provider/timezone/adjustment 溯源元数据） | 新增 |
| `/api/instruments/{symbol}/snapshot` | GET | 标的快照（含完整 provenance 块） | 新增 |
| `/api/instruments/{symbol}/bars?period=&count=` | GET | K 线数据（含 indicators 和 provenance） | 新增 |
| `/api/instruments/{symbol}/fundamentals` | GET | 基本面数据 | 新增 |
| `/api/instruments/{symbol}/workspace` | GET | 获取研究工作区（不存在则返回空模板） | 新增 |
| `/api/instruments/{symbol}/workspace` | PUT | 保存/合并研究工作区（UPSERT） | 新增 |
| `/api/instruments/workspaces` | GET | 列出所有已保存研究工作区 | 新增 |

---

## 13. 多市场筛选 `/api/screening`

| 路径 | 方法 | 功能 | 阶段 |
|------|------|------|------|
| `/api/screening` | POST | 对用户提供的 1-30 个 ticker 执行动量发现 + 价值评分两阶段筛选 | 新增 |

---

## 14. WorldQuant Alpha `/api/wq`

| 路径 | 方法 | 功能 | 阶段 |
|------|------|------|------|
| `/api/wq/search?q=&max_results=` | GET | 搜索 Alpha 因子库；默认 10 条，`max_results` 范围 1–100 | 新增 |
| `/api/wq/categories` | GET | 按类别组织的 Alpha 因子概览 | 新增 |
| `/api/wq/fields` | GET | 完整 WorldQuant 字段目录（4367 条） | 新增 |
| `/api/wq/templates` | GET | 从真实字段目录生成可用因子表达式模板 | 新增 |
| `/api/wq/simulate/local` | POST | 本地确定性多空因子模拟（不调用外部 API） | 新增 |
| `/api/wq/brain/simulations` | POST | 显式 `confirm=true` 后提交 WorldQuant BRAIN 模拟 | 新增 |
| `/api/wq/brain/simulations/{id}` | GET | 查询 BRAIN 模拟状态 | 新增 |
| `/api/wq/brain/alphas/{id}` | GET | 查询 BRAIN Alpha 结果 | 新增 |
| `/api/wq/correlation` | POST | 计算两序列 Pearson 相关系数 + p-value | 新增 |
| `/api/wq/help` | GET | 使用说明 | 新增 |

---

## 15. Swarm 团队 `/api/swarm`

| 路径 | 方法 | 功能 | 阶段 |
|------|------|------|------|
| `/api/swarm/teams/four-masters` | GET | 四专家 + 投研主编的团队拓扑与工具权限 | 新增 |
| `/api/swarm/teams/earnings-review` | GET | 财报精读团队拓扑与工具权限 | 新增 |
| `/api/swarm/analyze` | POST | **SSE 流**运行四大师研究并持久化报告 | 新增 |
| `/api/swarm/teams/earnings-review/run` | POST | **SSE 流**运行财报精读团队并持久化报告 | 新增 |

---

## 16. 通知 `/api/notifications`

| 路径 | 方法 | 功能 | 阶段 |
|------|------|------|------|
| `/api/notifications` | GET | 查询最近通知与未读数 | 新增 |
| `/api/notifications/stream` | GET | **SSE 流**按 ID 重放并持续推送通知 | 新增 |
| `/api/notifications/read-all` | POST | 全部标记已读 | 新增 |
| `/api/notifications/{id}/read` | POST | 单条通知标记已读 | 新增 |

---

## 17. 预警 `/api/alerts`

| 路径 | 方法 | 功能 | 阶段 |
|------|------|------|------|
| `/api/alerts/signal-types` | GET | 列出支持的信号类型 | 新增 |
| `/api/alerts/rules` | POST | 创建预警规则 | 新增 |
| `/api/alerts/rules` | GET | 列出预警规则 | 新增 |
| `/api/alerts/rules/{id}` | PUT | 更新预警规则 | 新增 |
| `/api/alerts/rules/{id}` | DELETE | 删除预警规则 | 新增 |
| `/api/alerts/triggers` | GET | 查询触发历史 | 新增 |

---

## 18. MCP `/api/mcp`

| 路径 | 方法 | 功能 | 阶段 |
|------|------|------|------|
| `/api/mcp/configs` | GET | 列出 MCP 服务器配置（不暴露密钥） | 新增 |
| `/api/mcp/configs` | POST | 创建 MCP 服务器配置 | 新增 |
| `/api/mcp/configs/{id}` | PUT | 更新 MCP 服务器配置 | 新增 |
| `/api/mcp/configs/{id}` | DELETE | 删除 MCP 服务器配置 | 新增 |
| `/api/mcp/configs/{id}/connect` | POST | 连接并发现 MCP 工具 | 新增 |
| `/api/mcp/configs/{id}/disconnect` | POST | 断开并卸载 MCP 工具 | 新增 |
| `/api/mcp/servers` | GET | 查询服务器与工具目录 | 新增 |
| `/api/mcp/tools/{local_name}` | PATCH | 运行时启停单个 MCP 工具 | 新增 |

---

## 19. 系统设置 `/api/settings`

| 路径 | 方法 | 功能 | 阶段 |
|------|------|------|------|
| `/api/settings/system` | GET | 读取安全白名单系统设置 | 新增 |
| `/api/settings/system` | PATCH | 保存设置并即时应用调度参数 | 新增 |
| `/api/settings/research-jobs` | GET | 列出 5 字段 cron 定时研究任务及最近/下次运行状态 | 新增 |
| `/api/settings/research-jobs` | POST | 创建定时研究任务 | 新增 |
| `/api/settings/research-jobs/{id}` | PATCH | 更新任务并重算 `next_run_at` | 新增 |
| `/api/settings/research-jobs/{id}` | DELETE | 删除定时研究任务 | 新增 |
| `/api/settings/research-jobs/{id}/run` | POST | 将任务加入本进程 BackgroundTasks 立即运行（202） | 新增 |

---

## 20. LLM 用量 `/api/usage`

| 路径 | 方法 | 功能 | 阶段 |
|------|------|------|------|
| `/api/usage?days=30&session_type=research` | GET | 查询 UTC 日期窗口内的 Token/请求数日聚合、总计和场景分组；`days` 范围 1-365，`session_type` 可省略 | 新增 |

响应中的 `items` 为按日升序聚合，`total` 为窗口总计，`by_session_type` 为 `chat/research/swarm/discussion` 等调用场景汇总。用量写入采用 best-effort，不会因统计库写失败而改变已成功的模型响应。

---

## 路由汇总

| 序号 | 前缀 | 文件 | MVP 端点 | 新增端点 |
|------|------|------|----------|----------|
| 1 | `/api/health` | main.py（内联） | 1 | 0 |
| 2 | `/api/models` | models_crud.py | 6 | 0 |
| 3 | `/api/agents` | agents.py | 4 | 0 |
| 4 | `/api/chat` | chat.py | 6 | 0 |
| 5 | `/api/discussion` | discussion.py | 4 | 0 |
| 6 | `/api/market` | market.py | 4 | 11 |
| 7 | `/api/dashboard` | dashboard.py | 1 | 0 |
| 8 | `/api/analysis` | analysis.py | 3 | 0 |
| 9 | `/api/portfolio` | portfolio.py | 10 | 0 |
| 10 | `/api/backtest` | backtest.py | 3 | 0 |
| 11 | `/api/research` | research.py | 0 | 6 |
| 12 | `/api/backtests` | backtests.py | 0 | 7 |
| 13 | `/api/instruments` | instruments.py | 0 | 7 |
| 14 | `/api/screening` | screening.py | 0 | 1 |
| 15 | `/api/wq` | wq.py | 0 | 10 |
| 16 | `/api/swarm` | swarm.py | 0 | 4 |
| 17 | `/api/notifications` | notifications.py | 0 | 4 |
| 18 | `/api/alerts` | alerts.py | 0 | 6 |
| 19 | `/api/mcp` | mcp.py | 0 | 8 |
| 20 | `/api/settings` | settings.py | 0 | 7 |
| 21 | `/api/usage` | usage.py | 0 | 1 |
| | **合计** | | **42** | **72** |
