# FinQuant Hub 差距分析报告

> 生成日期：2026-08-01
> 数据来源：8 维度状态审计 + 76 项确认差距清单（对比 Vibe-Trading / daily_stock_analysis / ai-berkshire / BigDataView 四套参考项目）

---

## 一、当前项目状态总览（8 维度审计摘要）

| # | 审计维度 | 状态 | 覆盖率 | 一句话结论 |
|---|---------|------|--------|-----------|
| 1 | 后端核心服务层 | 部分达标 | 83% | 分层方向正确、纯逻辑模块纯净，但存在 services↔backtest、database→services 双向软环与阻塞式同步 HTTP 混入异步路径 |
| 2 | 后端路由层 | 部分达标 | 77.3% | 19 路由全挂载、SSE 纪律基本统一，但无全局异常处理器、行情依赖端点测试最薄 |
| 3 | 前端 | 部分达标 | 22% | 构建/类型安全良好，但 SSE 解析重复 4 份、store 重复、死 UI 与包体积问题突出 |
| 4 | 后端测试覆盖 | 健康 | 81.7% | 门槛已启用、255 tests 全绿，但安全边际仅 1.68pp，market_data 等韧性模块覆盖不足 |
| 5 | 前端测试 | 部分达标 | 15% | 纯逻辑选点精准但无覆盖率度量，核心页面/图表/状态层全部无单测 |
| 6 | 文档一致性 | 部分达标 | 60% | ROUTER_MAP 映射 100% 正确，但 API_CONTRACT 仅收 69% 端点，ARCHITECTURE 全部关键数字过期 |
| 7 | 架构不变量合规 | 部分达标 | 85% | 全部硬性不变量 grep 验证仍成立，但文档已过期、notifications /stream 违反 try/finally 不变式 |
| 8 | 技术债与代码质量 | 部分达标 | 60% | ruff/mypy 绿、建表路径收敛，但 3 个死模块约 413 行、双回测体系并存、日志采用率极低 |

**交叉总结**：项目主体健康度较高（测试门禁、纯逻辑分层、SSE 纪律、表创建收敛都是亮点），当前处于 Phase 1-8 收官、文档最大漂移点。最危险的三个系统性缺口是：服务层与路由层的静默失败（SSE 异常不落服务端日志、无全局异常处理器）、行情/回测韧性路径测试缺失（恰是核心故障场景）、以及文档与代码全面脱节。前端覆盖率无度量是另一个结构性风险——新增代码可以完全无测试合入且 CI 保持绿色。

---

## 二、剩余差距清单（按参考项目分组）

### 2.1 Vibe-Trading 参照组（交易/回测/工具链）

| 差距 | 状态 | 复杂度 | 优先级 | 关键证据 |
|------|------|--------|--------|---------|
| 真实券商交易连接器（12 个 SDK + 统一 TradingProfile） | 缺失 | 高 | P1 | 当前仅手动持仓 CRUD + 实时盈亏，grep broker/order 全库无交易代码 |
| 实盘交易安全层（mandate 闸门/熔断/审计账本/每日计数） | 缺失 | 高 | P1 | 无下单路径即无预交易风险闸门，mandate/kill/order_guard 零命中 |
| 对话中的工具调用（tool-using chat） | 部分 | 中 | P1 | chat 路由纯文本流式，`chat_with_tools/tool_calls` 计数为 0；工具仅在 research_orch 使用 |
| 回测统计显著性验证（Monte Carlo/Bootstrap/Walk-forward） | 缺失 | 中 | P1 | 当前回测只有描述性指标，monte_carlo/bootstrap/walk_forward 全库无匹配 |
| 多市场回测引擎与 A 股交易规则（T+1/涨跌停/禁做空） | 缺失 | 高 | P1 | 当前仅 3 个向量化策略，涨跌停/T+1 建模零命中 |
| 影子账户/模拟交易复盘（delta P&L 归因 + 8 节报告） | 缺失 | 高 | P2 | shadow/paper/simulat.*trade 无匹配 |
| 交易日志分析器（FIFO roundtrip PnL + 行为诊断） | 缺失 | 中 | P2 | journal/fifo/disposition 无业务代码 |
| 加密/期货/基本面/SEC 数据加载器（30+ loader） | 缺失 | 中 | P2 | 当前仅 yahoo/akshare/tushare 4 种，无 crypto/EDGAR/本地文件 |
| 组合风险 X 光（集中度/回撤/VaR/ES/分散化） | 缺失 | 中 | P2 | risk_xray/expected_shortfall 零命中 |
| 权重约束/换手感知优化器/再平衡说明 | 缺失 | 中 | P2 | 仅 4 个 long-only 优化器，无 constraints/turnover_aware |
| 图表形态识别（峰谷/蜡烛形态） | 缺失 | 中 | P2 | signals 仅 7 种技术信号，无形态识别 |
| IM 消息渠道（15 渠道 + MessageBus + 配对授权） | 缺失 | 高 | P2 | notifications 仅进程内 SSE/通知表，telegram/wecom 全库无命中 |
| Agent 技能库与技能加载（~80 个 SKILL.md） | 缺失 | 中 | P2 | skill/SkillsLoader 全部无匹配 |
| 通用网页搜索与阅读工具（web_search/web_reader/doc_reader） | 缺失 | 低 | P2 | Agent 仅 SearchNews（新浪单一接口） |
| 三大财务报表工具（东财 F10 / SEC EDGAR 三表） | 缺失 | 高 | P2 | fundamentals 仅 8 项 Yahoo trailing 指标 |
| 回测/交易类 Agent 工具（backtest/shadow/connector/risk） | 缺失 | 中 | P2 | 8 个工具中无任何回测/交易类 |
| 报告数据审计接入 Agent/API（report_audit 接线） | 部分 | 低 | P2 | extract_data_points/verdict 纯函数零调用者，无工具包装/路由 |
| 可配置定时研究任务（5 字段 cron + job store） | 部分 | 低 | P2 | scheduler 仅固定每日盘后 config.SCHEDULER_HOUR/MINUTE |
| 目标与假设研究工作流（Goal/Hypothesis 闭环） | 缺失 | 中 | P3 | goal/hypothesis 只命中 prompts 角色名 |
| 跨资产相关性/市场状态检测（correlation/regime） | 缺失 | 中 | P3 | wq.py 仅两序列 Pearson，无矩阵/regime |
| A 股特色数据工具（大宗/龙虎榜/北向/资金流等 10 个） | 缺失 | 低 | P3 | screen_stocks 是显式占位实现 |

### 2.2 daily_stock_analysis 参照组（大盘/推送/调度/数据）

| 差距 | 状态 | 复杂度 | 优先级 | 关键证据 |
|------|------|--------|--------|---------|
| 大盘复盘报告（多市场 LLM 复盘 + 板块主线 + 历史持久化 + 定时推送） | 缺失 | 高 | P1 | market_review/复盘/涨停 全库无实现，market.py 无复盘端点 |
| 市场级行情数据接口（指数/涨跌统计/板块概念排行/人气股/涨停池） | 缺失 | 高 | P1 | market_data 仅 search/quote/kline/fundamentals 四能力 |
| 外部推送渠道（企微/飞书/Telegram/Discord/Slack/邮件/自定义 Webhook 等 14 个 Sender） | 缺失 | 高 | P1 | 全库 grep 各渠道关键词零命中，notifications.py 仅 DB 通知表 + SSE |
| 多源新闻搜索服务（Tavily/SerpAPI/Bocha/Brave/SearXNG + 舆情） | 缺失 | 高 | P2 | 唯一新闻能力是新浪 searchapi 单一接口 |
| A 股多源基本面数据（AkShare/Tushare 财务适配器） | 缺失 | 高 | P2 | fundamentals 仅走 Yahoo timeseries 单一来源 |
| 市场热度/异动快照与预警（Market Light / Hotspot 题材） | 缺失 | 高 | P2 | alerts 仅为个股技术信号预警，无市场级规则 |
| 配置中心（字段注册表 + schema 驱动设置 UI + LLM 渠道管理） | 部分 | 高 | P2 | system_settings 仅 5 个调度器键白名单，无 schema/渠道管理 |
| 后台分析任务队列（去重/取消/进度/批量/任务 SSE 事件） | 缺失 | 高 | P2 | research 为单请求同步 SSE 流式执行，无后台队列/去重/取消 |
| 数据源熔断与源优先级配置（CircuitBreaker/逐源可用性/字段补全/批量预取） | 缺失 | 中 | P2 | market_data 为硬编码 try/except 链路，无熔断/优先级配置 |
| 定时调度增强（多时段/动态重配/后台周期任务/状态与立即执行 API） | 部分 | 中 | P2 | scheduler 单一时点，无 schedule_times/状态/run-now 端点 |
| .env 原子写入与导入导出（版本冲突保护 + 敏感字段掩码） | 缺失 | 中 | P3 | system_settings 只读写 DB 表，无 .env 文件级原子写 |
| 筹码分布（获利比例/平均成本/90% 与 70% 集中度） | 缺失 | 高 | P3 | market_data 无筹码相关字段/接口 |
| IM Bot 交互（钉钉/飞书流式/Discord 双向 + 命令分发） | 缺失 | 高 | P3 | find -iname '*bot*' 零结果 |
| Electron 桌面客户端（内嵌后端/自动更新/托盘/安装包） | 缺失 | 高 | P3 | frontend/package.json 无 electron 依赖 |
| 智能导入（CSV/Excel/剪贴板/图片自选股 + 名称/拼音补全） | 缺失 | 中 | P3 | Dashboard 自选股仅手动逐条添加 |
| LLM 用量统计（token 持久化 + 用量页面） | 缺失 | 低 | P3 | llm_client 仅调用内返回 total_tokens，未持久化 |

### 2.3 ai-berkshire 参照组（投研/投资哲学）

| 差距 | 状态 | 复杂度 | 优先级 | 关键证据 |
|------|------|--------|--------|---------|
| 13 章统一综合报告模板（核心产出物） | 部分 | 高 | P1 | _build_report 只产出 7 键，technical_analysis/verdict 为硬编码占位；11 节 RESEARCH_MEMO_TEMPLATE 是死模板；前端 13 章标题仅 1 章有数据 |
| 多 Agent 投研缺 team-lead 综合评审（四维评分/Bull vs Bear/Checklist/分层操作建议） | 部分 | 中 | P1 | _build_report 只拼接 4 Agent 正文，verdict="综合评级待汇总"；four_masters.yaml 无综合 Agent |
| 选股筛选两阶段 screen() 完全未接线 | 部分 | 中 | P1 | Agent 工具是 stub；/api/screening 只做 60 日动量排序；两阶段评分/信号分级零暴露 |
| 卡脖子/稀缺性专项评估（六维评分 + 稀缺性总分 + 等级判定） | 缺失 | 中 | P2 | 卡脖子/稀缺 在代码中零命中 |
| 投资哲学对照框架（Checklist 13 项/四象限/认知时间差/但斌净利哲学/回报盲区） | 部分 | 中 | P2 | 仅 3 份哲学 md（巴菲特/段永平/芒格，且段永平≠但斌）+ 六关判定，13 项清单与四象限缺失 |
| 长短期投资打分（长期 4 维 + 短期 4 维，各 10 分制） | 缺失 | 低 | P2 | composite_score 仅技术面（趋势40%+动量35%+成交量25%），无基本面/催化剂/风险收益比维度 |
| 挑刺分析章节（做空心态 + 五级严重度 + 三层判断） | 部分 | 中 | P2 | adversarial_review 产出 verification_needed 问题，无五级严重度/叙事解构；risk_assessor 仅一行提示语 |
| 报告内嵌静态技术图表（matplotlib PNG） | 缺失 | 中 | P2 | 后端无 matplotlib/plotly/Pillow 依赖，导出报告不含图表 |
| 长周期均线 MA120/MA250 与 VolMA10 | 部分 | 低 | P2 | calc_ma 仅 (5,10,20,30,60)，calc_volma 仅 (5,20)，前端类型只到 ma60 |
| 估值验算子能力未暴露（市值验算/交叉验证/Benford/三情景估值） | 部分 | 低 | P2 | 仅 verify_valuation/exact_calc 被包装，另 4 函数无 Agent 工具/API |
| 财报精读 earnings_review 前端无入口 | 部分 | 低 | P2 | 后端六 Agent 团队 + 端点已有，swarmApi 只实现 four-masters，前端不可达 |
| 做空挑刺 adversarial_review 未接入团队 | 部分 | 低 | P2 | 已注册工具但四个 roles 与两个团队 yaml 的 tools 列表均不含，仅靠 LLM 手动选择 |
| 投资 Checklist 缺镜子测试/快速否决清单/多公司对比总览 | 部分 | 中 | P3 | investment_checklist 仅六关 pass/fail/unknown，无 mirror test/否决清单 |
| 台股（台湾）数据源缺失 | 缺失 | 中 | P3 | detect_market 只识别 sh/sz/hk/us，无 FinMind 适配 |
| 雪球大师发言采集缺失（段永平等一手素材） | 缺失 | 高 | P3 | xueqiu/雪球 无实现 |
| Morningstar 公允价值/护城河/星级筛选缺失 | 缺失 | 中 | P3 | fair_value/moat/star_rating 无实现 |
| 投资论文追踪/论点漂移检测缺失 | 缺失 | 中 | P3 | 25 张表无 thesis 表 |
| 组合审查（portfolio-review）缺失 | 缺失 | 中 | P3 | portfolio 路由只有 CRUD/PnL |
| 管理层深挖（management-deep-dive）缺失 | 缺失 | 中 | P3 | business_analyst 仅在职责 5 提到管理层 |
| 质量筛选（quality-screen 7 条去劣指标 + 3 豁免）缺失 | 缺失 | 中 | P3 | VALUE_WEIGHTS 只覆盖 5 维度 |
| 行业漏斗筛选（industry-funnel 四层递进）缺失 | 缺失 | 高 | P3 | 无 funnel 相关模块，Screening 只支持手动输入 |
| 投资哲学缺李录视角 + 三份 md 未运行时加载 | 部分 | 低 | P3 | philosophy 目录缺 li_lu.md，三份 md 仅测试读取 |
| 股票分析 CLI 工具链（7 个独立脚本） | 缺失 | 中 | P3 | 无 scripts/__main__，pyproject 无 [project.scripts] |
| Markdown→HTML/PDF/DOCX 表格渲染 | 部分 | 低 | P3 | report_export 只支持 6 种语法，'|' 表格退化成普通段落 |

### 2.4 BigDataView 参照组（可视化大屏）

| 差距 | 状态 | 复杂度 | 优先级 | 关键证据 |
|------|------|--------|--------|---------|
| 大屏全屏视图模式（118 套模板独立路由 + 全屏切换 + 设计稿缩放） | 缺失 | 高 | P2 | Dashboard 大屏区块嵌入后台布局，无独立路由，grep requestFullscreen=0 |
| 地图飞线/涟漪迁徙图（effectScatter + lines 动画） | 缺失 | 中 | P2 | ChinaMap 仅静态 type:'map' 单系列 |
| ECharts 扩展库缺失（echarts-liquidfill 水球图 / echarts-wordcloud 词云） | 缺失 | 中 | P2 | package.json 未安装任一扩展 |
| 滚动表格行自动滚动（悬停暂停） | 部分 | 低 | P2 | ScrollingTable 仅静态 overflow:auto，无动画 |
| 高级 ECharts 图表类型覆盖不足（gauge/radar/heatmap/funnel/treemap/graph/sankey） | 缺失 | 中 | P3 | 前端仅用 line/bar/candlestick 三种 |
| 省份/城市级地图（GeoJSON 下钻） | 缺失 | 中 | P3 | 仅 @datapool/china.geojson 全国地图 |
| 登录页模板（37 套） | 缺失 | 高 | P3 | 与 'No auth/authz' 不变量冲突，需先决策是否引入登录 |
| 粒子背景动效（particles.js） | 缺失 | 中 | P3 | 无 canvas 动画实现 |
| 实时时钟/日期显示 | 缺失 | 低 | P3 | Dashboard 无时钟渲染 |
| 翻牌数字动效 | 部分 | 中 | P3 | CountUp 仅线性插值，无逐位翻转 |
| 倒计时组件 | 缺失 | 低 | P3 | grep countdown=0 |

---

## 三、按优先级汇总

### P1（先行项，12 项）

| 差距 | 来源 | 复杂度 |
|------|------|--------|
| 多市场回测引擎与 A 股交易规则 | Vibe-Trading | 高 |
| 回测统计显著性验证 | Vibe-Trading | 中 |
| 真实券商交易连接器 | Vibe-Trading | 高 |
| 实盘交易安全层 | Vibe-Trading | 高 |
| 对话中的工具调用（接线 function calling） | Vibe-Trading | 中 |
| 13 章统一综合报告模板 | ai-berkshire | 高 |
| 多 Agent 投研缺 team-lead 综合评审 | ai-berkshire | 中 |
| 选股筛选两阶段 screen() 接线 | ai-berkshire | 中 |
| 大盘复盘报告 | daily_stock_analysis | 高 |
| 市场级行情数据接口 | daily_stock_analysis | 高 |
| 外部推送渠道（14 个 Sender） | daily_stock_analysis | 高 |

### P2（重点推进项，约 28 项）

Vibe-Trading：影子账户、交易日志分析器、数据加载器扩展、组合风险 X 光、权重约束/换手优化器、图表形态识别、IM 消息渠道、技能库、网页搜索工具、三表工具、回测/交易类 Agent 工具、report_audit 接线、cron 调度。
daily_stock_analysis：后台任务队列、定时调度增强、多源新闻搜索、A 股多源基本面、数据源熔断与优先级、市场热度/异动预警、配置中心。
ai-berkshire：卡脖子/稀缺性评估、投资哲学对照框架、长短期打分、挑刺分析章节、静态技术图表、MA120/250 与 VolMA10、估值验算子能力、earnings_review 前端入口、adversarial_review 接入团队。
BigDataView：大屏全屏模式、地图飞线/涟漪、ECharts 扩展库、滚动表格动效。

### P3（路线图项，约 36 项）

Vibe-Trading：Goal/Hypothesis 工作流、correlation regime、A 股特色数据工具。
daily_stock_analysis：.env 原子写入、筹码分布、IM Bot、Electron 桌面、智能导入、LLM 用量统计。
ai-berkshire：投资哲学李录视角、Checklist 增强、台股、雪球采集、Morningstar、论文追踪、组合审查、管理层深挖、质量筛选、行业漏斗、CLI 工具链、导出表格渲染。
BigDataView：高级图表类型、省份地图、登录页、粒子动效、时钟、翻牌数字、倒计时。

---

## 四、推荐下一步执行顺序（Phase 9 建议）

**总体思路**：优先"接线与集成"而非新增大面积能力——三组差距中有 10 项是"代码已存在但未接线"（report_audit、screen()、adversarial_review、earnings_review、financial_rigor 子能力、philosophy md、13 章模板），接线成本低、用户可感知收益高；同时利用 4 套参考项目代码直接移植，避免从零实现。

**阶段 9.0 — 止血与基础（0.5-1 周）**：先消化 8 维审计的硬伤。后端加全局 RequestValidationError/兜底异常处理器、修 notifications /stream try/finally、给 5 个 SSE 管线 except 块加 logger.exception；前端抽共享 SSE reader 替换 3 处内联循环；为 market_data 降级链、resolve_ticker 补测试并修阻塞 httpx；文档一次性同步（API_CONTRACT 补齐 5 路由器、ARCHITECTURE 数字刷新、CLAUDE.md 过期数字修正）。清理 3 个死模块（接入或回收）。

**阶段 9.1 — 投研报告主线（1-2 周）**：实现 13 章统一综合报告模板（替代硬编码占位），接入 team-lead 综合评审（四维评分/Bull vs Bear/Checklist/分层建议）、长短期打分、卡脖子评估、挑刺分析章节；接线 screen() 两阶段筛选与 report_audit；earnings_review 前端入口 + adversarial_review 接入团队。

**阶段 9.2 — 大盘与数据底座（1-2 周）**：市场级行情数据接口（指数/涨跌统计/板块排行/涨停池）→ 大盘复盘报告（多市场 LLM + 历史持久化）→ 外部推送渠道（先企微/飞书/邮件 3 个）→ 数据源熔断与优先级配置。

**阶段 9.3 — 回测增强（1-2 周）**：A 股交易规则引擎（T+1/涨跌停）→ 统计显著性验证（Monte Carlo/Bootstrap/Walk-forward）→ 组合风险 X 光 → 长周期均线补齐。三者为同一批回测代码的递进增强。

**阶段 9.4 — 工具链与交易（P2+，可按路线图排期）**：多源新闻搜索、A 股多源基本面、回测/交易类 Agent 工具、chat 接线 function calling、可配置 cron 调度。实盘交易连接器与安全层建议单独立项评估（涉及真实资金，需更高的工程与合规投入）。

**P3 路线图**：按"用户可感知价值 × 复用成本"排序——LLM 用量统计、智能导入、筹码分布、Morningstar、投资论文追踪靠前；Electron 桌面、IM Bot、雪球采集、登录页靠后或依赖前置决策。

**执行红线**：每次代码变更遵循 CLAUDE.md 文档同步规则；不违反六项架构不变量（新增不变量前先更新文档）；所有 P1 项开工前先写契约测试；纯逻辑能力（signals/scoring/优化器）继续保持零 I/O 可单测。
