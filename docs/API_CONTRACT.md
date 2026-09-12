# FinQuant Hub — API 端点目录

> 本文档按路由分组列出所有 API 端点。请求/响应 JSON 结构请参考对应路由文件或 FastAPI `/docs`。
> **约定**：所有非 SSE 响应 `Content-Type: application/json; charset=utf-8`；错误格式为 `{"detail": "..."}`。
> 7 个公开 SSE 端点统一使用 `event: / data:` 格式；另有 1 个隐藏兼容别名。精确事件契约见下节。
> **认证边界**：`/api/auth/*` 与 `/api/health` 公开；其余 APIRouter 统一要求 `authenticated_context`。`LOCAL_ONLY_MODE=true` 仅允许 development，并以内部本地所有者提供同一用户归属上下文。

---

## SSE 事件协议

所有 SSE 响应均为 `Content-Type: text/event-stream`。每帧由 `event: <type>` 和单行 UTF-8 JSON `data: {...}` 组成，以空行结束。客户端必须按事件名解析；`error` 是终止事件，统一使用 `{"error": "错误描述", "message": "错误描述"}`。`error` 是规范字段，`message` 仅为旧客户端兼容别名，并计划在下一主版本移除。

### 单 Agent 对话

`POST /api/chat/sessions/{id}/messages`：

| event | data |
|------|------|
| `tool_call` | `{"tool_name": "get_stock_price", "arguments": {...}, "result": "..."}` —— **仅在工具执行完成时**发出（每次工具调用一帧；`tool_started`/`tool_failed` 等内部事件**不**外发） |
| `token` | `{"delta": "部分文本"}` —— 最终整段文本；**若本轮流被整轮截止截断，其前置一行提示**（见下） |
| `done` | `{"message_id": 12, "token_count": 245, "llm_token_count": 210, "tool_call_count": 2, "truncated_by_deadline": false, "user_message_id": 11}` |
| `error` | `{"error": "错误描述"}` |

**整轮截止（VS-23）**：该端点经 ToolRegistry function-calling 循环，**轮数上限只约束轮数、不约束时长**，故设整轮聚合等待上界 `DEFAULT_TOOL_LOOP_DEADLINE_SECONDS = 600s`。触发时：①正文（即 `token.delta`）**前置**「（因超过总时长上限提前结束，以下为已完成部分）」；②`done.truncated_by_deadline = true`。二者与**落库内容**同源——**用户所见 == 已保存内容**。截止**恰在一次成功调用之后**才越界时按**正常完成**处理（不误报截断）。

**单次调用预算（VS-21/23）**：单次 LLM 调用另有总时长预算（默认 180s，上界 = 预算 + 单次尝试超时），预算耗尽抛携带（脱敏后的）上游响应片段的可行动错误；整轮截止会**压低**当轮的单次预算（取 `min(单次预算, 剩余整轮预算)`）。

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

## A. 认证 `/api/auth`

| 路径 | 方法 | 功能 | 阶段 |
|------|------|------|------|
| `/api/auth/request-code` | POST | 请求邮箱验证码；本地单用户模式返回 404 | 认证 |
| `/api/auth/verify-code` | POST | 校验验证码并设置 HttpOnly Cookie；本地单用户模式返回 404 | 认证 |
| `/api/auth/logout` | POST | 撤销当前会话并删除 Cookie | 认证 |
| `/api/auth/me` | GET | 返回当前用户；本地模式返回内部所有者 | 认证 |

---

## B. 用户凭据 `/api/me/credentials`

| 路径 | 方法 | 功能 | 阶段 |
|------|------|------|------|
| `/api/me/credentials` | GET | 列出当前用户的凭据状态，不返回明文 | 认证 |
| `/api/me/credentials/{service}` | PUT / DELETE | 写入或删除当前用户的 Fernet 加密凭据 | 认证 |
| `/api/me/credentials/{service}/status` | GET | 查询单个服务的当前用户凭据状态 | 认证 |

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
| `/api/models/discover` | POST | 使用未保存表单地址及密钥拉取供应商 `/models` 列表 | UX-20260907 |
| `/api/models/{id}` | PUT | 更新模型配置字段子集 | MVP |
| `/api/models/{id}` | DELETE | 删除模型配置 | MVP |
| `/api/models/{id}/test` | POST | 测试模型连通性，返回延迟和回复 | MVP |
| `/api/models/{id}/set-default` | POST | 设为默认模型（互斥） | MVP |

模型地址 `base_url` 为 HTTP(S) Base URL，允许粘贴 `/chat/completions` 完整地址并自动去掉该后缀；拒绝 URL 账号、查询参数、fragment。所有聊天（含工具与流式）统一归一化，避免二次拼接。

创建/修改接受直接 `api_key`，加密写入现有 `user_credentials` 的 `model:{id}`；`api_key_env` 保留可选兼容。编辑时 Key 留空保留原值。响应只返回 `has_api_key/credential_source`，不回传密钥。无需 schema 迁移。

`POST /api/models/discover` 请求 `{base_url, api_key?, api_key_env?, model_id?}`；仅复用当前用户拥有的 `model_id` 凭据。直接 Key 优先，其次已存 Key，再次环境变量。响应 `{ok, items: string[], message}`；上游不支持、空列表、无效响应或网络失败时返回 `ok:false` 与手动填写建议，不生成虚构模型。该操作不保存表单配置。

测试接口保持 `{ok, latency_ms, message, reply?}`；上游失败在 `message` 内提供最多 300 字符的脱敏响应片段和中文建议（401/403 权限、404 地址或模型名、429 额度）。

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
| `/api/market/pulse?limit=&threshold_percent=&ths_limit=` | GET | 批量市场雷达：全 A 广度、日异动、行业/概念、板块/个股资金、周异动、热度；同花顺逐股资金以命中率和部分失败显式返回 | 新增 |
| `/api/market/themes?keyword=&sort_by=&limit=&stocks_per_theme=&ths_limit=` | GET | 关键词主题分类：分页扫描完整行业/概念目录，显式扩展相关词，批量读取板块成分股并以同花顺逐股资金补充 | 新增 |
| `/api/market/limit-up?date=` | GET | 指定交易日涨停池、封板与连板统计 | 新增 |
| `/api/market/limit-pool?date=&pool=` | GET | 东方财富涨停/跌停池薄包装；`date` 默认上海时区当天，非交易日/未更新返回 `quality=UNKNOWN` + HTTP 200，上游或结构失败为 502 | 新增 |
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
| `/api/dashboard/decision-inbox` | GET | owner-scoped 只读决策收件箱；返回 why-now、对象、canonical evidence/质量和下一步 | AIOS-040 |
| `/api/dashboard/news` | GET | 综合财经最新消息；返回 normalized news、查询时间、providers、errors 与 `data_status`（OK/PARTIAL/UPSTREAM_ERROR/UNKNOWN） | Workbench |
| `/api/dashboard/watchlist/import` | POST | multipart 导入 CSV/TXT/XLSX 或剪贴板文本；返回成功/失败/重复统计 | TASK-017 |

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
| `/api/portfolio/paper` | POST | 创建 owner-scoped 独立模拟组合；名称、基础币种、初始模拟现金必填，响应固定 `PAPER`/`SIMULATED` 且真实能力均为 false | AIOS-053 |
| `/api/portfolio/paper` | GET | 列出当前用户模拟组合，不混入既有组合 | AIOS-053 |
| `/api/portfolio/paper/{id}` | GET | 获取模拟现金、确定性持仓与 append-only ledger | AIOS-053 |
| `/api/portfolio/paper/{id}/ledger` | POST | 追加显式 BUY/SELL 模拟记录；成交价/时点/来源/费用/币种/幂等键必填，跨币种还需显式 FX provenance | AIOS-053 |
| `/api/portfolio/paper/{id}/valuation` | GET | 只读行情估值；缺价格为 `UNKNOWN`，跨币种缺当前 FX 为 `PARTIAL` 且总值/收益为 null | AIOS-053 |
| `/api/portfolio/paper/{id}/archive` | POST | 停用模拟组合并保留不可变历史；停用后拒绝追加 | AIOS-053 |
| `/api/portfolio/paper/{id}/reviews` | GET | 列出当前用户可选的非 deleted typed hypothesis 与该模拟组合已有 `review_outcome` 历史 | AIOS-054 |
| `/api/portfolio/paper/{id}/reviews/draft` | GET | 对指定同用户 hypothesis 生成只读模拟复盘草稿；返回 `COMPUTED_RESULT` 收益、公式、provenance、质量和非因果边界，不推荐 outcome | AIOS-054 |
| `/api/portfolio/paper/{id}/reviews` | POST | 显式保存 supported/refuted/inconclusive、理由、观察窗口和幂等键；写 `USER_HYPOTHESIS` review outcome，非 OK 估值仅允许 inconclusive | AIOS-054 |

模拟组合没有账户连接、真实资金、真实委托或自动执行能力。模拟账本与既有 `portfolios`/`positions` 完全分表；详情见 `docs/ai/PAPER_PORTFOLIO_CONTRACT.md`。复盘只复用 owner-scoped `memory_records.review_outcome`，不修改原 hypothesis/Thesis/confidence，详见 `docs/ai/PAPER_PORTFOLIO_REVIEW_CONTRACT.md`。

---

## 9. 回测 v1（已回收）

BACKLOG-021 已下线 `/api/backtest` 的全部 3 个 HTTP 操作（2 个路径），回测由 [§11 回测 v2](#11-回测-v2异步apibacktests) 接管。旧 router、引擎和专属测试已移入回收站；`backtest_runs` 历史表及数据保留，不迁移到 v2 的 `quant_backtests`。

Chat 的“打开策略实验室”入口仅导航到 `/strategy-lab/ma-crossover?symbol={ticker}`，预填股票代码并提示确认参数后运行；不再提交 v1 请求，也不会自动创建 v2 回测。

---

## 10. 研究报告 `/api/research`

| 路径 | 方法 | 功能 | 阶段 |
|------|------|------|------|
| `/api/research/audit` | POST | 抽取报告数据点，或对外部核验值生成准出/打回结论 | 新增 |
| `/api/research/memory` | GET / POST | 列出当前用户 typed memory / 显式保存 confirmed memory；FACT 必须引用同 owner evidence | AIOS |
| `/api/research/memory/{memory_id}` | PATCH / DELETE | 显式确认、以 supersession 编辑、作废 / 单条 soft-delete | AIOS |
| `/api/research/memory/export` | GET | 导出当前用户 allowlisted typed memory 与保留状态历史 | AIOS |
| `/api/research/evidence/audit` | GET | 审计当前用户 canonical evidence 的类型/状态计数、悬挂引用和 lineage mismatch | AIOS |
| `/api/research/evidence/export` | GET | 导出当前用户 allowlisted manifest v2；文档值脱敏且排除凭据、会话和隐藏推理 | AIOS |
| `/api/research` | POST | **SSE 流**启动 4 Agent 并行研究 + team-lead 综合评审，生成统一 13 章报告 | 新增 |
| `/api/research` | GET | 列出历史研究报告（分页） | 新增 |
| `/api/research/history` | GET | 按股票代码聚合的历史版本（含运行统计） | 新增 |
| `/api/research/{id}` | GET | 获取单份报告详情（含事件时间线、工具调用日志） | 新增 |
| `/api/research/{id}/export?format=` | GET | 按格式导出（md/html/pdf/docx），即时生成 | 新增 |

---

## 11. 回测 v2（异步）`/api/backtests`

| 路径 | 方法 | 功能 | 阶段 |
|------|------|------|------|
| `/api/backtests/strategy-ir/parse` | POST | 将明确的单标的日线 MA crossover 描述解析为 `strategy-ir/v1` 数据 IR；歧义/未支持条件返回结构化 invalid，不运行或保存回测 | AIOS-050 |
| `/api/backtests/strategy-ir/compile` | POST | 将 canonical `strategy-ir/v1` 编译为不完整的 `ma-crossover-draft/v1`；只映射 symbol/均线与执行口径，其他参数保持待确认，不运行或保存 | AIOS-051 |
| `/api/backtests` | POST | 创建 MA 双均线回测任务（异步，返回 202）；A 股默认模拟 T+1/涨跌停/禁做空，结果含 Bootstrap/Monte Carlo/Walk-forward 验证 | 新增 |
| `/api/backtests` | GET | 列出回测运行（可按 symbol 过滤或仅已保存） | 新增 |
| `/api/backtests/portfolio` | POST | 创建多标的、多市场、多周期组合回测，返回集中度/回撤/VaR/ES/分散化风险 X 光；同频同日且非零方差时返回完整相关矩阵，至少 20 个共同收益观察时返回样本协方差风险贡献 | 新增 |
| `/api/backtests/{id}` | GET | 获取回测状态和结果（含交易规则、拒单、显著性验证、equity_curve/trades/warnings） | 新增 |
| `/api/backtests/{id}/trades` | GET | 获取回测交易明细 | 新增 |
| `/api/backtests/{id}/share-preview` | GET | 仅对当前用户已保存且 completed 的实验生成 `share-preview/v1` 私有只读预览；有限参数/计算指标和 persisted provenance，license 缺失保持 UNKNOWN，无发布动作 | AIOS-070 |
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
| `/api/instruments/{symbol}/fundamentals` | GET | 基本面数据（逐项保留 provider/source、报告日、period type、币种、TTM/质量标记；全源失败为 502） | 新增 |
| `/api/instruments/{symbol}/chip-distribution?adjustment=` | GET | A 股筹码分布估算（AkShare 基于东方财富 K 线/换手率按 120 日衰减模型计算；含 methodology/quality_flags；筹码峰位缺失时为 null） | 新增 |
| `/api/instruments/{symbol}/money-flow?period=` | GET | A 股分钟或 120 日资金流向薄包装；直接透传 `source/quality/as_of` 与元金额，非法代码/周期为 400，上游失败为 502 | 新增 |
| `/api/instruments/{symbol}/dragon-tiger?date=&look_back=` | GET | A 股龙虎榜及买卖 TOP5 席位薄包装；空回看窗口返回 `items=[]` + note，非法参数为 400，上游失败为 502 | 新增 |
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
| `/api/wq/simulate/local` | POST | 本地确定性多空因子模拟（不调用外部 API）；同一观察合同逐期计算横截面 Pearson IC、Spearman Rank IC 与非年化 ICIR，至少每期 5 个标的及 5 个有效期才标为可用 | 新增 |
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
| `/api/alerts/monitor-targets/draft` | POST | 校验 Thesis/Portfolio/Strategy 对象与用户所选技术条件；零写入 | AIOS-041 |
| `/api/alerts/monitor-targets/confirm` | POST | 显式确认后幂等创建并启用对象绑定规则 | AIOS-041 |
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

> BACKLOG-042：`POST/PUT /api/mcp/configs` 现支持两种 transport——`http`（url 字段）与 `stdio`（command 字段 + 可选 args 数组，本地进程 MCP）；`_public_config` 按 `command` 是否有值回显 `transport`。`GET /api/mcp/configs` 不暴露密钥，stdio 亦不存 env 敏感明文。
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
| `/api/settings/research-jobs/{id}/runs` | GET | 返回 owner-scoped 运行时间线、lease/幂等 identity、重试关系、append-only 状态事件及 report/evidence/memory 回链 | AIOS-060 |
| `/api/settings/research-jobs/{id}` | PATCH | 更新任务并重算 `next_run_at` | 新增 |
| `/api/settings/research-jobs/{id}` | DELETE | 删除无运行历史的定时研究任务；有历史时返回 409 并要求停用 | 新增 |
| `/api/settings/research-jobs/{id}/run` | POST | 生成 64 位幂等 identity 并加入本进程 BackgroundTasks（202）；有效 lease 拒绝重复认领 | AIOS-060 |
| `/api/settings/product-metrics` | GET | 读取当前用户的本地开关、90 日聚合和小样本状态 | 新增 |
| `/api/settings/product-metrics` | PATCH | 显式启用/关闭当前用户的本地指标 | 新增 |
| `/api/settings/product-metrics/events` | POST | 以 best-effort 写入 allowlist 事件；关闭或写入失败返回 `recorded=false` | 新增 |
| `/api/settings/product-metrics/events` | DELETE | 清除当前用户全部本地产品事件，保留开关 | 新增 |

本地产品指标只接受 `first_value(value=duration_ms)`、`result_saved`、`workflow_continued`、`repeat_research(value=days)`。请求不允许额外字段；表中没有 ticker、对象 ID、查询、正文、回答、凭据或任意 metadata 列。TTFV 少于 10 条时仅返回计数，median/P90 为 `null`。

---

## 20. LLM 用量 `/api/usage`

| 路径 | 方法 | 功能 | 阶段 |
|------|------|------|------|
| `/api/usage?days=30&session_type=research` | GET | 查询 UTC 日期窗口内的 Token/请求数日聚合、总计和场景分组；`days` 范围 1-365，`session_type` 可省略；可用 `start`/`end`（`YYYY-MM-DD`，闭区间，必须成对）替代 `days` | 新增 |
| `/api/usage/records?limit=50&session_type=research` | GET | 查询当前用户的会话级用量明细（时间倒序，含 model/总量/会话 id）；`limit` 1-200，`session_type` 可省略过滤；每条另带 `priced`/`currency`/`estimated_cost` | 新增 |
| `/api/usage/cost?days=30&session_type=research` | GET | 按 owner 配置的模型单价估算费用：逐模型返回 token 汇总、单价来源与 `estimated_cost`；`days` 1-365，同样支持 `start`/`end` | 新增 |
| `/api/usage/stats?dimension=model&days=30` | GET | 维度聚合：`dimension=model`（按模型）或 `session_type`（按会话类型），每行含调用次数/输入输出 token/费用派生字段；`days` 或 `start`/`end` 二选一 | 新增 |

响应中的 `items` 为按日升序聚合，`total` 为窗口总计，`by_session_type` 为 `chat/research/swarm/discussion` 等调用场景汇总。用量写入采用 best-effort，不会因统计库写失败而改变已成功的模型响应。

**窗口参数（BACKLOG-045）**：`days` 保持向后兼容（近 N 天，含今天，UTC）；`start`/`end` 为闭区间 UTC 日期，必须成对出现。非法输入一律诚实 400：格式不是 `YYYY-MM-DD`（`invalid start/end: expected YYYY-MM-DD`）、只给一端（`start and end must be provided together`）、起止倒置（`start must not be after end`）、跨度超过 366 天（`range must not exceed 366 days`）。响应回显解析后的 `start`/`end` 与真实 `days`（自定义范围时为区间天数），前端据此显示"当前窗口"，不自行推算日期。

**维度统计（BACKLOG-045）**：`/api/usage/stats` 的每一行都带 `cost_status`——`priced`（该行所有模型都有单价）、`partial`（部分模型缺单价）、`mixed_currency`（已计价模型跨币种，不给单一合计）、`unpriced`（全无单价）、`none`（窗口内无数据）；同时给出 `priced_models`/`unpriced_models`/`unpriced_total_tokens`/`cost_by_currency`。`total` 由各行的 token/请求数直接求和、费用再聚合，因此与 `/api/usage/cost` 的总额口径一致。

`/api/usage/cost` 与 `/api/usage/records` 的费用字段都是**派生值**（token × `model_pricing` 单价），不写回 `llm_usage`。未配置单价的模型返回 `priced: false`、`estimated_cost: null`（绝不返回 0 冒充免费），并计入 `total.unpriced_models` / `total.unpriced_total_tokens` / `total.unpriced_model_names`。币种只作展示字段、不做汇率换算：`total.cost_by_currency` 按币种分组，只有全部已计价模型币种一致时才填 `total.currency` 与 `total.estimated_cost`，否则 `mixed_currency: true` 且两者为 `null`。

---

## 21. 模型单价 `/api/model-pricing`

| 路径 | 方法 | 功能 | 阶段 |
|------|------|------|------|
| `/api/model-pricing` | GET | 列出当前用户的模型单价（按 model_name 升序，只返回本 owner 行） | 新增 |
| `/api/model-pricing` | POST | 新增单价；`model_name` 非空、`input_per_1m`/`output_per_1m` ≥ 0 且有限、`currency` 非空（默认 `CNY`）；同 owner 重复 `model_name` 返回 409 | 新增 |
| `/api/model-pricing/{id}` | PUT | 更新本 owner 的单价；非本 owner 或不存在返回 404，改名撞同 owner 已有模型返回 409 | 新增 |
| `/api/model-pricing/{id}` | DELETE | 删除本 owner 的单价；非本 owner 或不存在返回 404 | 新增 |

`model_pricing` 唯一键为 `(user_id, model_name)`，因此不同用户可以各自为同一个模型名配置不同单价。写入的 `source` 固定为 `manual`：**本机不内置任何模型单价**（无官方定价页直证时不臆造数字），币种仅作展示、不做汇率换算。

---

## 22. 投资论文 `/api/thesis`

| 路径 | 方法 | 功能 |
|------|------|------|
| `/api/thesis` | GET | 列出论文，可按状态筛选 |
| `/api/thesis` | POST | 手动创建论文并保存价格/持仓/基本面基线及 v1 不可变判断版本 |
| `/api/thesis/from-report/{report_id}` | POST | 将已完成投研报告一键存为论文 |
| `/api/thesis/{id}` | GET / PUT | 获取或编辑论文 current view；编辑创建新版本，不覆盖历史 |
| `/api/thesis/{id}/versions` | GET | 按版本倒序返回 owner-scoped 不可变 Thesis 历史 |
| `/api/thesis/{id}/versions/{version}/confirm` | POST | 追加 `acknowledged`/`disputed` 用户确认及非空原因；不改写 Thesis 或版本 |
| `/api/thesis/{id}/reviews` | GET | 返回 owner-scoped 证据复盘项、确定性状态差异、证据和 append-only 事件 |
| `/api/thesis/{id}/reviews/{review_id}/decide` | POST | 幂等追加 `acknowledged`/`disputed` 复盘决定；不改写 Thesis、版本或 confidence |
| `/api/thesis/{id}/claims/{claim_id}` | PUT | 人工更新论点状态、备注及可选的 supporting/opposing evidence 时间边 |
| `/api/thesis/{id}/check` | POST | 用有 canonical provenance 的行情/基本面执行确定性漂移核验；无证据规则保持 `unknown` |
| `/api/thesis/{id}/challenge` | POST | 只读生成最强反证、遗漏变量和脆弱假设；输出均为 `AI_INFERENCE`，不改写 Thesis |
| `/api/thesis/{id}/validation-experiment` | GET | 生成 owner-scoped `thesis-validation-experiment/v1`；只带入 ticker 与固定回测语义，其他参数保持待确认 |
| `/api/thesis/{id}/share-preview` | GET | 生成当前用户 Thesis 的 `share-preview/v1` 私有只读预览；用户假设、metadata-only evidence、许可/时效/质量/脱敏审计，固定未发布且公开门禁 BLOCKED | AIOS-070 |

创建/编辑可传 `supporting_evidence_ids`、`opposing_evidence_ids`、`invalidation_conditions`、`confidence` 和 `change_reason`。引用 evidence 必须属于当前用户；判断类型只允许 `USER_HYPOTHESIS` 或 `AI_INFERENCE`，不会自动升级为事实。版本历史包含相对上一版本的 `diff_from_previous` 与 append-only `confirmations`；confidence diff 保留 old/new 和当前版本 `change_reason`。claim 更新可传 `evidence_edges[]`，每条包含 `evidence_id`、`stance`、`valid_from`、`valid_to`、`observed_at`；替代边只会 supersede 并关闭有效期，不删除历史。claim 响应包含 owner-scoped `evidence_edges` 和 append-only `status_events`。自动非 `unknown` 状态事件必须引用当次 canonical evidence，否则强制为 `unknown` 并保留原因。旧客户端的 `thesis`、`assumptions`、`claims` 和 current-view 响应保持兼容。

`check` 的 `last_check` 使用 `thesis-drift/v1`，每条规则返回 rule/version、公式/参数、baseline/current 值和两侧 evidence IDs。price/fundamental 任一侧缺 canonical evidence 都为 `unknown`；position 在 canonical adapter 建立前为 `unknown`；report 只要求 document evidence 与人工复核，文本相似度不再决定 holding/violated。状态变化同时产生 `COMPUTED_RESULT` 复盘项；用户决定只更新 review projection 并追加不可变事件。核验异常返回 502，并将 `UPSTREAM_ERROR` 失败项持久化，不伪装成无变化。

---

## 路由汇总

| 序号 | 前缀 | 文件 | MVP 端点 | 新增端点 |
|------|------|------|----------|----------|
| 1 | `/api/auth` | auth.py | 0 | 4 |
| 2 | `/api/me/credentials` | credentials.py | 0 | 4 |
| 3 | `/api/health` | main.py（内联） | 1 | 0 |
| 4 | `/api/models` | models_crud.py | 6 | 0 |
| 5 | `/api/agents` | agents.py | 4 | 0 |
| 6 | `/api/chat` | chat.py | 6 | 0 |
| 7 | `/api/discussion` | discussion.py | 4 | 0 |
| 8 | `/api/market` | market.py | 4 | 15 |
| 9 | `/api/dashboard` | dashboard.py | 1 | 2 |
| 10 | `/api/analysis` | analysis.py | 3 | 0 |
| 11 | `/api/portfolio` | portfolio.py | 10 | 9 |
| 12 | `/api/research` | research.py | 0 | 11 |
| 13 | `/api/backtests` | backtests.py | 0 | 10 |
| 14 | `/api/instruments` | instruments.py | 0 | 10 |
| 15 | `/api/screening` | screening.py | 0 | 1 |
| 16 | `/api/wq` | wq.py | 0 | 10 |
| 17 | `/api/swarm` | swarm.py | 0 | 4 |
| 18 | `/api/notifications` | notifications.py | 0 | 4 |
| 19 | `/api/alerts` | alerts.py | 0 | 8 |
| 20 | `/api/mcp` | mcp.py | 0 | 8 |
| 21 | `/api/settings` | settings.py | 0 | 12 |
| 22 | `/api/usage` | usage.py | 0 | 4 |
| 23 | `/api/thesis` | thesis.py | 0 | 14 |
| 24 | `/api/model-pricing` | model_pricing.py | 0 | 4 |
| | **合计** | | **39** | **132** |

合计为 23 个 APIRouter 加 1 个内联健康检查，运行时生成 140 个 `/api/*` 路径、176 个 HTTP 操作（实测 `app.openapi()`，不含内联健康检查）。v1 下线减少 2 个路径和 3 个操作；v2 的 9 个路径、10 个操作完整保留。运行时 OpenAPI 是端点数量的最终校验来源；上表 MVP/新增分类是历史功能口径，不替代 OpenAPI operation 计数。
