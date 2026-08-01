# 长期目标路线图

## Phase 1 — Agent 基础设施升级 ✅
## Phase 2 — Swarm 多 Agent 团队 ✅
## Phase 3 — 记忆与推送 ✅
## Phase 4 — 质量工程 ✅
## Phase 5 — 产品化串联 ✅
## Phase 6 — 工程化加固 ✅
## Phase 7 — 功能填空 ✅

---

## Phase 8 — 全面融合（P1-P2，5-8 轮） ✅

将 80 项差距的剩余部分按主题聚合成 5 个子阶段。

### 8-1 回测深度增强（ai-berkshire + Vibe-Trading） ✅

- [x] **LoaderRegistry 抽象**：参考 Vibe-Trading，新建 `backtest/loaders/`，BaseLoader + @register 装饰器，支持多数据源（akshare/tushare/yahoo）
- [x] **优化器基础**：`backtest/optimizers/` 等权/风险平价/均值方差
- [x] **扩展指标**：Calmar 比率、Sortino 比率、信息比率、盈亏比
- [x] **基准比较**：回测结果中自动加入买入持有基准线
- [x] 验证：`pytest tests/test_backtest* -v` 通过（含 MA/组合回测，22 passed）

### 8-2 投研体系移植（ai-berkshire） ✅

- [x] **投资哲学框架**：巴菲特/芒格/段永平方法论 → `prompts/philosophy/` 提示词目录
- [x] **巴菲特六关 Checklist**：移植 check_buffett_rules() → Agent 工具
- [x] **财报精读 6 Agent 团队**：YAML 预设 + 讨论编排器
- [x] **做空者视角挑刺分析**：对抗式审查工具
- [x] 验证：`pytest -q` 不降级（243 passed）

### 8-3 Alpha 研究平台（wq-alpha-research） ✅

- [x] **因子表达式模板库**：从 wq_fields.json 生成常用因子模板
- [x] **BRAIN API 集成桥接**：`services/alpha_brain.py` 对接 WorldQuant BRAIN
- [x] **因子回测模拟**：纯 Python 因子收益模拟（无需 API）
- [x] 验证：`pytest tests/test_alpha* -v` 通过（17 passed）

### 8-4 可视化大屏升级（BigDataView） ✅

- [x] **ECharts 接入**：安装 echarts-for-react，替代 lightweight-charts 做多图表
- [x] **数字滚动/计数动画**：`components/CountUp.tsx` 动效数字
- [x] **滚动表格与跑马灯**：大屏风格信息流组件
- [x] **中国地图**：基于 ECharts 地图的省份分布可视化
- [x] 验证：`bun run build` + 组件渲染测试通过（23 passed）；内置 Browser 因运行内核路径缺失未能截图

### 8-5 工程化剩余（跨项目） ✅

- [x] **结构化日志**：`services/logging.py` JSON 格式日志，替代服务层非结构化输出（CLI 报表输出保留）
- [x] **交易日历**：`services/trading_calendar.py` A 股交易日查询
- [x] **数据库迁移系统**：`database.py` 添加 schema_version 表 + 迁移函数
- [x] **全量 API 路由测试**：任务规划时 14 个，按现状覆盖全部 20 个路由器挂载契约
- [x] 验证：`pytest --cov --cov-fail-under=80` 通过（255 passed，81.68%）

---

## 纪律

- 不改 `docs/ai/ARCHITECTURE.md` 中的不变量
- 不引入 LangGraph/CrewAI/AutoGen
- 不加 WebSocket、ORM、认证
- 不改 `reference/` 目录
- 每轮验证：`pytest -q && ruff check . && bun run build`

---

## Phase 9 — 差距清算（根据 GAP_ANALYSIS.md）

依据 `docs/ai/GAP_ANALYSIS.md`（2026-08-01，8 维度审计 + 76 项差距清单）推进。总体思路：优先"接线与集成"而非新增大面积能力。

### 9.0 止血与基础（0.5-1 周）

- [x] 后端全局异常处理器：RequestValidationError / 兜底异常 handler
- [x] 修复 notifications /stream 违反 try/finally 不变式
- [x] 5 个 SSE 管线 except 块补 logger.exception（静默失败落日志）
- [x] 前端抽共享 SSE reader，替换 3 处内联循环
- [x] market_data 降级链 / resolve_ticker 补测试，修复阻塞式同步 httpx 混入异步路径
- [x] 文档一次性同步：API_CONTRACT 补齐 5 个路由器、ARCHITECTURE 数字刷新、CLAUDE.md 过期数字修正
- [x] 清理 3 个死模块（约 413 行，接入或回收）

### 9.1 投研报告主线（1-2 周）

- [x] 13 章统一综合报告模板（替代 _build_report 硬编码占位与死模板）
- [x] team-lead 综合评审：四维评分 / Bull vs Bear / Checklist / 分层操作建议
- [x] 长短期投资打分（长期 4 维 + 短期 4 维，各 10 分制）
- [x] 卡脖子/稀缺性专项评估（六维评分 + 总分 + 等级判定）
- [x] 挑刺分析章节（做空心态 + 五级严重度 + 三层判断）
- [x] 接线选股筛选两阶段 screen()（Agent 工具 + /api/screening）
- [x] report_audit 接线（extract_data_points/verdict 包装为工具/路由）
- [x] earnings_review 前端入口（swarmApi 扩展）+ adversarial_review 接入团队
- [x] 13 章报告接入真实基本面证据（AkShare/Tushare/Yahoo 降级链；缺失字段保持 unknown）

### 9.2 大盘与数据底座（1-2 周）

- [x] 市场级行情数据接口（指数/涨跌统计/板块概念排行/人气股/涨停池）
- [x] 大盘复盘报告（多市场 LLM 复盘 + 板块主线 + 历史持久化 + 定时推送）
- [x] 外部推送渠道（先企微/飞书/邮件 3 个 Sender）
- [x] 数据源熔断与源优先级配置（CircuitBreaker / 逐源可用性 / 字段补全 / 批量预取）

### 9.3 回测增强（1-2 周）

- [x] A 股交易规则引擎（T+1 / 涨跌停 / 禁做空 建模）
- [x] 回测统计显著性验证（Monte Carlo / Bootstrap / Walk-forward）
- [x] 组合风险 X 光（集中度 / 回撤 / VaR / ES / 分散化）
- [x] 长周期均线补齐（MA120 / MA250 / VolMA10）

### 9.4 工具链与交易（P2+，可按路线图排期）

- [x] 多源新闻搜索服务（Tavily/SerpAPI/Bocha/Brave/SearXNG）
- [x] A 股多源基本面数据（AkShare / Tushare 财务适配器）
- [x] 回测/交易类 Agent 工具（backtest/shadow/connector/risk）
- [x] 对话中的工具调用接线（chat 路由启用 function calling）
- [x] 可配置定时研究任务（5 字段 cron + job store）
- [x] 实盘交易连接器与安全层（仅完成设计评估；未实现账户/资金/下单连接）

### P3 路线图（按"用户可感知价值 × 复用成本"排序）

- [x] LLM 用量统计（schema version 7 持久化 + 日聚合 API + 设置页用量面板）
- [ ] 智能导入（CSV/Excel/剪贴板/图片自选股 + 名称/拼音补全）
- [ ] 筹码分布（获利比例/平均成本/90% 与 70% 集中度）
- [ ] Morningstar 公允价值/护城河/星级筛选
- [ ] 投资论文追踪/论点漂移检测
- [ ] 后端依赖 Electron 桌面 / IM Bot / 雪球采集 / 登录页（后置或依赖前置决策）
