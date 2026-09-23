# FinQuant Hub 前端组件逆向分析清单

> **角色**：高级前端架构师 + UX 设计师 + Design System 专家
> **分析范围**：`frontend/src/` 全部 pages、components、hooks、services、store、features、types
> **产出日期**：2026-09-18

---

## 一、架构总览

### 1.1 应用骨架

| 层 | 技术 | 说明 |
|---|---|---|
| 路由 | React Router v6（BrowserRouter + Routes） | lazy 懒加载所有页面 |
| 布局 | @ant-design/pro-layout | 侧边栏导航 + 顶部 GlobalTaskEntry |
| 主题 | AntD 5 ConfigProvider + app.css 双主题 | dark/light 切换，localStorage 持久化 |
| 状态 | Zustand 4 store | auth / chat / discussion / model |
| 数据 | Axios 单实例（api.ts） + 13 个领域 api 模块 | 含 6 条 SSE 管道（5条 fetch+readSSE，1条 EventSource） |
| 图表 | TradingView lightweight-charts v4 | K线/面积图/直方图 |
| 组件库 | AntD 5 全套 | Button/Card/Table/Modal/Form/Timeline/Steps 等 |

### 1.2 导航分组与路由

| 导航组 | 路由 | 页面组件 |
|---|---|---|
| 今日 | `/` | Dashboard |
| 研究 | `/research` `/research/reports` `/compare` `/chat` `/discussion` `/thesis` | ResearchWorkspace / Research / ComparisonWorkspace / Chat / Discussion / Thesis |
| 策略 | `/strategy-lab/ma-crossover` `/screening` `/alpha` | StrategyLab / Screening / AlphaResearch |
| 组合 | `/portfolio` `/alerts` | Portfolio / Alerts |
| 知识 | `/knowledge` | Knowledge |
| 系统工具 | `/models` `/mcp-market` `/settings` | Models / McpMarket / Settings |
| 其他 | `/analysis/:ticker` `/login` | StockAnalysis / Login |

### 1.3 SSE 管道明细（6条）

| # | 管道 | 载体 | 使用位置 | 事件名 |
|---|------|------|----------|--------|
| 1 | 快速问答流 | fetch+readSSE | `pages/Chat.tsx` | delta / message_id / error |
| 2 | 多视角讨论流 | fetch+readSSE | `pages/Discussion.tsx` | agent_start / agent / delta / message_id / error |
| 3 | 深度研究报告流 | fetch+readSSE | `pages/Research.tsx` | report_started / agent_started / agent_completed / report_progress / done |
| 4 | Swarm 四大金刚 | fetch+readSSE | `services/swarmApi.ts` | 全套 agent 帧 |
| 5 | Swarm 财报复核 | fetch+readSSE | `services/swarmApi.ts` | 同上 |
| 6 | 通知推送 | **EventSource** | `components/NotificationCenter.tsx` | notification |

**关键观察**：
- 管道 1-5 全部用 `readSSE`（fetch body 流），**绕过 axios 单例**，因此 axios 的 401 拦截与统一错误处理在这些路径失效，错误逻辑各页手写重复。
- 通知管道用原生 EventSource（断线自动重连语义）。
- 事件协议存在 `agent` vs `role_key` 双轨（Research.tsx 专门做兼容），属历史演进留下的可收敛技术债。
- `readSSE` 基于 `fetch` + `ReadableStream`，手写 SSE 帧解析器（`parseSSEChunk`），`try/finally` 保证 `reader.cancel()`/`releaseLock` 清理，与后端 SSE try/finally 纪律呼应。

### 1.4 状态管理架构（Zustand 4 Store）

| Store | 持久化 | 关键状态 | 观察 |
|---|---|---|---|
| authStore | 否（HttpOnly Cookie） | user/isAuthenticated/status | 有模块级 `initialization` 去重保护防 StrictMode 双调 |
| chatStore | 否 | sessions/messages:Record/streamingContent/isStreaming | **与 discussionStore 几乎逐字段逐方法同构** |
| discussionStore | 否 | rooms/messages:Record/streamingContent/isStreaming | 与 chatStore 重复，可抽 zustand 高阶工厂 |
| modelStore | 否 | models/currentModelId | 极薄 |

**关键观察**：
- 全库 grep 确认**没有任何 `persist`/`createJSONStorage` 中间件**——zustand 最著称的持久化能力未被使用。
- 持久化真实形态在 `features/` 目录：偏好/进度/研究草稿全用手写 `localStorage` + 手动 `window.dispatchEvent` 跨组件通知。
- store 很小很薄，只有状态 + 直接 setter，不含业务逻辑、不含 selector 泛化、不含 immer。

### 1.5 API 层模式

- 严格遵循「single axios 实例」不变量：`axios.create({baseURL:'/api', timeout:30s, withCredentials:true})`。
- 401 拦截 → `window.dispatchEvent('finquant:unauthorized')` → AuthGate 跳登录。
- **分层不一致是最大隐患**：api 层「薄厚不一」——`analysisApi` 兼职领域聚合（fetchPortfolioSummary 先拉 groups 再 Promise.all；fetchPortfolioHoldings 把后端 `ticker/avg_cost/pnl` 重映射为前端 `code/cost_price/profit`），其余 api 极薄。
- `(res.data.items ?? [])` 解包重复 10+ 处，应抽 `unwrapList()` 工具。

---

## 二、页面组件详细分析（18 页）

### 2.1 Dashboard — 系统总览

| 字段 | 值 |
|---|---|
| 路径 | `pages/Dashboard.tsx`（875 行） |
| 路由 | `/` |
| 作用 | 系统总览：自选股行情、大屏概览、决策收件箱、任务引导、组合/信号/会话/讨论摘要 |
| 用户看到什么 | LocalCapabilityBanner → DecisionInboxPanel → TaskLaunchpad（三大任务卡片+进度条）→ BigScreenOverview（深色大屏：组合市值/累计收益/组合数量/市场信号 + 组合排行 + ChinaMap）→ MarketMoversPanel → 统计卡片 → 投资组合概览+信号概览 → 近期会话/讨论 → 快速分析搜索 → 自选股行情面板（含 StockChart） |
| 数据来源 | `/dashboard/stats` `/dashboard/decision-inbox` `/dashboard/watchlist/import` `stockApi` `analysisApi` `productProgress`（localStorage） |
| AI 能力 | 无直接 AI 调用；DecisionInboxItem 间接引用 evidence_refs |
| 是否保留 | 保留 |
| 重构建议 | ① 页面过重（875行，内含3个 export 子组件），应拆出 DecisionInboxPanel / LocalCapabilityBanner / MarketSignalAvailability 为独立文件 ② 自选股管理逻辑（~150行）应抽取为 `features/watchlist.ts` ③ 深色大屏（`.big-screen-*`）与浅色 AntD Card 风格分裂，需 Design System 统一 ④ 内联 style 占比极高 |

### 2.2 StockAnalysis — 个股分析

| 字段 | 值 |
|---|---|
| 路径 | `pages/StockAnalysis.tsx`（527 行） |
| 路由 | `/analysis/:ticker` |
| 作用 | 个股技术分析：行情 + K线（含 KDJ/MACD/RSI 子图）+ 信号 + 13章分析简报 |
| 用户看到什么 | TaskPageHeader → 搜索栏 → ResultLayer summary（SignalInterpretation + 13章 Collapse）→ ResultLayer evidence（IndicatorGuide + PriceStatsBar + 主K线 + 子图）→ ResultLayer method（标的数据 Descriptions） |
| 数据来源 | `stockApi`（fetchQuote/fetchKLine/fetchIndicators/searchStocks）`analysisApi.requestAnalysis` |
| AI 能力 | requestAnalysis 调用后端 AI，返回 13 章文本 sections + 信号 signals |
| 是否保留 | 保留 |
| 重构建议 | ① IndicatorSubChart（60行）和 PriceStatsBar 应提取为独立组件 ② K线直接调用 createChart 未用 useLightweightCharts hook，与 StockChart 不一致，统一为 hook ③ 搜索结果下拉框在 Dashboard/StockAnalysis/Research 重复出现，应抽取 InstrumentSearch |

### 2.3 Research — 深度研究

| 字段 | 值 |
|---|---|
| 路径 | `pages/Research.tsx`（516 行） |
| 路由 | `/research/reports` |
| 作用 | 5-agent 并行研究 → team-lead 整合 → 13章 Markdown 报告（SSE 流式） |
| 用户看到什么 | 输入区 → AgentCard ×5（进度动画）→ ResultLayer summary（报告 Markdown + 导出/存为论文）→ ResultLayer evidence → ResultLayer method → 侧边栏阅读导航 → 研究历史 |
| 数据来源 | `POST /research`（fetch+SSE）`/research/history` `/research/:id` `/research/:id/export` `POST /thesis/from-report/:id` |
| AI 能力 | 核心 AI：SSE 5-agent 研究流（report_started → agent_started → agent_completed → done） |
| 是否保留 | 保留 |
| 重构建议 | ① AgentCard（25行）和 MarkdownContent（20行）应提取为独立组件 ② reportToMarkdown / splitReportLayers 是纯逻辑函数，移到 features/ ③ AgentCard 与 Discussion 中的 agent 展示应统一为 AgentStatusCard |

### 2.4 Chat — 快速问答

| 字段 | 值 |
|---|---|
| 路径 | `pages/Chat.tsx`（396 行） |
| 路由 | `/chat` |
| 作用 | 单 Agent 对话：会话列表 + 消息流（SSE streaming）+ 角色切换 + 回测入口 |
| 用户看到什么 | 左栏 Sider（会话列表）→ 右栏 Content（角色 Select + 消息气泡 + 流式消息 + 输入区 + 发送/停止/回测按钮） |
| 数据来源 | chatStore（zustand）modelStore readSSE |
| AI 能力 | SSE streaming：delta 流式 → StreamingText 打字机效果 |
| 是否保留 | 保留 |
| 重构建议 | ① 与 Discussion 双栏布局高度相似，应抽取共享 ChatLayout ② ChatStarterDraft 保留为独立组件 ③ 回测内联入口耦合在 Chat 中，应考虑独立 |

### 2.5 Discussion — 多视角审查

| 字段 | 值 |
|---|---|
| 路径 | `pages/Discussion.tsx`（321 行） |
| 路由 | `/discussion` |
| 作用 | 多 Agent 讨论：房间列表 + 讨论时间线（SSE streaming） |
| 用户看到什么 | 左栏 Sider（房间列表）→ 右栏 Content（启动/停止 + DiscussionTimeline）→ 创建 Modal |
| 数据来源 | discussionStore readSSE agents API |
| AI 能力 | SSE streaming：多轮多角色讨论流式 |
| 是否保留 | 保留 |
| 重构建议 | 与 Chat 共享 ChatLayout |

### 2.6 ResearchWorkspace — 研究工作区

| 字段 | 值 |
|---|---|
| 路径 | `pages/ResearchWorkspace.tsx` |
| 路由 | `/research` `/research/:symbol` |
| 作用 | 研究入口聚合页 |
| 用户看到什么 | TaskPageHeader + ResearchIntentPicker + ResearchContinuity + ResearchTimeline + ResearchCharts + FundamentalMetricsPanel |
| 数据来源 | researchApi + features/ 目录 |
| AI 能力 | 无直接 AI 调用（纯聚合展示） |
| 是否保留 | 保留 |
| 重构建议 | 领域组件组织良好 |

### 2.7 StrategyLab — 策略实验室

| 字段 | 值 |
|---|---|
| 路径 | `pages/StrategyLab.tsx`（821 行） |
| 路由 | `/strategy-lab/ma-crossover` |
| 作用 | 双均线回测：参数配置 + 运行 + 保存 + 对比 + 稳健性检验 + 自然语言策略解析 |
| 用户看到什么 | TaskPageHeader → 自然语言 IR 解析 → 自选股/市场雷达 → StrategySetup → 参数表单 → ExperimentWorkbench → BacktestSummary → BacktestCharts → 统计显著性 → 交易明细 → CitationDetails → BacktestFailurePanel → 已保存实验 → SharePreviewModal |
| 数据来源 | researchApi marketDiscoveryApi sharePreviewApi backtest/features Thesis API |
| AI 能力 | 自然语言策略解析（非 LLM，后端有限语法解析器） |
| 是否保留 | 保留 |
| 重构建议 | ① 821行巨型页面应拆分为参数区/结果区/历史区 ② feePresets/warningLabels/initialValues 移到 features/backtest/presets.ts ③ StrategyIR/StrategyDraft/ThesisValidationIntent 移到 types/research.ts ④ 轮询逻辑抽取为 hook |

### 2.8 Portfolio — 投资组合

| 字段 | 值 |
|---|---|
| 路径 | `pages/Portfolio.tsx`（999 行） |
| 路由 | `/portfolio` |
| 作用 | 真实组合管理 + 模拟组合（Paper Portfolio）+ Hypothesis 复盘 |
| 用户看到什么 | TaskPageHeader → Paper Portfolio 区（创建/买卖/停用/估值/复盘）→ 汇总卡片（总投入/市值/盈亏/收益率）→ 持仓 Table → 资产配置 Progress → PortfolioRiskWorkbench → 4 个 Modal（添加持仓/新建组合/模拟买卖/复盘判断） |
| 数据来源 | `analysisApi`（fetchPortfolioGroups/Summary/Holdings/Allocation）`/portfolio/paper/*` API |
| AI 能力 | 无直接 AI 调用（模拟计算为本地逻辑） |
| 是否保留 | 保留 |
| 重构建议 | ① 999行最重页面，强烈建议拆分：真实组合管理区 + Paper Portfolio 区 + Hypothesis 复盘区 ② Paper Portfolio 相关状态（~15个 useState）应抽取为 `features/paperPortfolio.ts` 或自定义 hook ③ 多个 Modal 应提取为独立组件 |

### 2.9 其他页面（简要分析）

| 页面 | 路径 | 行数 | 作用 | AI 能力 | 保留 |
|---|---|---|---|---|---|
| ComparisonWorkspace | `pages/ComparisonWorkspace.tsx` | — | 多报告并排比较 | 无 | 保留 |
| Thesis | `pages/Thesis.tsx` | — | 投资论文管理 + 验证条件 | 间接 AI | 保留 |
| Alerts | `pages/Alerts.tsx` | — | 预警中心 | 无 | 保留 |
| Knowledge | `pages/Knowledge.tsx` | — | 知识库（指标指南） | 无 | 保留 |
| Screening | `pages/Screening.tsx` | — | 选股器 | 无 | 保留 |
| Login | `pages/Login.tsx` | — | 邮箱免密登录 | 无 | 保留 |
| Models | `pages/Models.tsx` | — | 模型管理 | 连通性测试 | 保留 |
| McpMarket | `pages/McpMarket.tsx` | — | MCP 工具管理 | 无 | 保留 |
| Settings | `pages/Settings.tsx` | — | 系统设置 | 无 | 保留 |

---

## 三、可复用组件分析

### 3.1 金融组件

| 组件 | 路径 | 作用 | 所属页面 | 数据来源 | AI 能力 | 保留 | 重构建议 |
|---|---|---|---|---|---|---|---|
| StockChart | `components/StockChart.tsx` | K线图（lightweight-charts） | Dashboard | stockApi（fetchKLine/fetchIndicators） | 无 | 保留 | 统一 hook 调用模式 |
| SignalInterpretation | `components/SignalInterpretation.tsx` | 技术信号展示与解读 | StockAnalysis | props（signals[]） | 无 | 保留 | — |
| IndicatorGuide | `components/IndicatorGuide.tsx` | 技术指标指南（KDJ/MACD/RSI） | StockAnalysis | props（indicators） | 无 | 保留 | — |
| BacktestResultCard | `components/BacktestResultCard.tsx` | 回测结果卡片 | Chat | props（BacktestResult） | 无 | 保留 | — |
| MarketMoversPanel | `components/MarketMoversPanel.tsx` | 市场异动/热门/主题面板 | Dashboard | marketDiscoveryApi | 无 | 保留 | — |
| MarketThemesPanel | `components/MarketThemesPanel.tsx` | 市场主题板块 | Dashboard | marketDiscoveryApi | 无 | 保留 | 与 MarketMoversPanel 有风格重复 |
| ChinaMap | `components/ChinaMap.tsx` | 中国地图（ECharts） | Dashboard | props（exchangeDistribution） | 无 | 保留 | — |
| ScrollingTable | `components/ScrollingTable.tsx` | 滚动表格（自定义） | Dashboard | props（rows/columns） | 无 | 保留 | 考虑用 AntD Table 替代 |
| Marquee | `components/Marquee.tsx` | 滚动字幕 | Dashboard | props | 无 | 保留 | — |
| CountUp | `components/CountUp.tsx` | 数字动画 | Dashboard | props（value/prefix/decimals） | 无 | 保留 | — |
| LazyEChart | `components/LazyEChart.tsx` | 懒加载 ECharts | Knowledge | props | 无 | 保留 | — |
| IndicatorGuide（Knowledge 页） | `components/IndicatorGuide.tsx` | 指标知识卡片 | Knowledge | — | 无 | 保留 | — |
| BacktestCharts | `components/research/BacktestCharts.tsx` | 回测曲线+成交点图 | StrategyLab | props（run/bars） | 无 | 保留 | — |
| FundamentalMetricsPanel | `components/research/FundamentalMetricsPanel.tsx` | 基本面指标面板 | ResearchWorkspace | researchApi | 无 | 保留 | — |
| ResearchCharts | `components/research/ResearchCharts.tsx` | 研究图表 | ResearchWorkspace | researchApi | 无 | 保留 | — |
| PortfolioRiskWorkbench | `components/portfolio/PortfolioRiskWorkbench.tsx` | 组合风险工作台 | Portfolio | props（holdings） | 无 | 保留 | — |
| AlphaTemplateCatalog | `components/alpha/AlphaTemplateCatalog.tsx` | Alpha 模板目录 | AlphaResearch | props（categories/templates） | 无 | 保留 | — |
| AlphaSimulationWorkbench | `components/alpha/AlphaSimulationWorkbench.tsx` | Alpha 模拟工作台 | AlphaResearch | props（template）alphaApi | 无 | 保留 | — |

### 3.2 AI 组件

| 组件 | 路径 | 作用 | 所属页面 | 数据来源 | AI 能力 | 保留 | 重构建议 |
|---|---|---|---|---|---|---|---|
| StreamingText | `components/StreamingText.tsx` | 打字机效果（逐字渲染） | Chat Discussion Research | props（content/speed） | 流式 AI 内容渲染 | 保留 | 可增强为支持 Markdown 流式 |
| ChatMessageBubble | `components/ChatMessageBubble.tsx` | 消息气泡（单聊/讨论复用） | Chat Discussion | props（Message + streaming） | 流式展示 agent 内容 | 保留 | 内联 style 多，迁移至 tokens |
| RoleAvatar | `components/RoleAvatar.tsx` | Agent 头像（pulsing 动画） | Chat Discussion | props（avatar/name/size/pulsing） | Agent 状态可视化 | 保留 | — |
| DiscussionTimeline | `components/DiscussionTimeline.tsx` | 讨论时间线（多角色对话） | Discussion | props（room/messages） | 多 Agent 对话展示 | 保留 | — |
| SwarmStatusCard | `components/SwarmStatusCard.tsx` | Swarm 状态卡片 | — | props | Agent 编排状态 | 评估 | 使用频率低，评估是否保留 |
| ModelSelector | `components/ModelSelector.tsx` | 模型选择器（侧边栏） | App 布局全局 | modelStore | — | 保留 | — |
| NotificationCenter | `components/NotificationCenter.tsx` | 通知中心 | App 布局全局 | notificationApi | — | 保留 | — |
| GlobalTaskEntry | `components/GlobalTaskEntry.tsx` | 全局任务入口（顶部 bar） | App 布局全局 | features/globalTaskEntry | — | 保留 | — |

### 3.3 研究组件

| 组件 | 路径 | 作用 | 所属页面 | 保留 | 重构建议 |
|---|---|---|---|---|---|
| ResearchTimeline | `components/research/ResearchTimeline.tsx` | 研究活动时间线 | ResearchWorkspace | 保留 | — |
| ResearchContinuity | `components/research/ResearchContinuity.tsx` | 研究连续性追踪 | ResearchWorkspace | 保留 | — |
| ResearchIntentPicker | `components/research/ResearchIntentPicker.tsx` | 研究意图选择 | ResearchWorkspace | 保留 | — |
| StrategySetup | `components/strategy/StrategySetup.tsx` | 策略目标/预设选择 | StrategyLab | 保留 | — |
| BacktestSummary | `components/strategy/BacktestSummary.tsx` | 回测结论摘要 | StrategyLab | 保留 | — |
| BacktestFailurePanel | `components/strategy/BacktestFailurePanel.tsx` | 回测失败面板 | StrategyLab | 保留 | — |
| ExperimentWorkbench | `components/strategy/ExperimentWorkbench.tsx` | 实验对比工作台 | StrategyLab | 保留 | — |

### 3.4 交互与展示组件

| 组件 | 路径 | 作用 | 保留 | 重构建议 |
|---|---|---|---|---|
| TaskPageHeader | `components/TaskPageHeader.tsx` | 任务页标题（eyebrow/title/goal/status/actions） | 保留 | 已被 StockAnalysis/StrategyLab/Portfolio/AlphaResearch 广泛使用，是核心布局原语 |
| ResultLayer | `components/ResultLayer.tsx` | 研究结果层（summary/evidence/method） | 保留 | 已被 StockAnalysis/Research/StrategyLab 使用，是核心设计模式 |
| CitationDetails | `components/CitationDetails.tsx` | 数据来源溯源详情 | 保留 | OK/PARTIAL/UNKNOWN/UPSTREAM_ERROR 四态，被 StrategyLab 等使用 |
| SharePreviewModal | `components/SharePreviewModal.tsx` | 私有分享预览弹窗 | 保留 | — |
| MemoryManager | `components/MemoryManager.tsx` | 研究记忆管理 | 保留 | — |
| ModelSelector | `components/ModelSelector.tsx` | AI 模型选择 | 保留 | — |

---

## 四、Hooks / Store / Services / Types 分析

### 4.1 Hooks

| Hook | 路径 | 作用 | 使用处 |
|---|---|---|---|
| useLightweightCharts | `hooks/useLightweightCharts.ts` | lightweight-charts v4 封装：主题适配、K线/面积图/成交量切换、autoSize | StockChart |

**问题**：StockAnalysis.tsx 内联创建图表（直接调用 createChart）未使用此 hook，与 StockChart.tsx 不一致。

### 4.2 Store（Zustand）

| Store | 路径 | 持久化 | 作用 |
|---|---|---|---|
| authStore | `store/authStore.ts` | — | 邮箱登录认证、session 管理 |
| chatStore | `store/chatStore.ts` | — | 会话列表、消息、流式状态 |
| discussionStore | `store/discussionStore.ts` | — | 讨论房间、消息、流式状态 |
| modelStore | `store/modelStore.ts` | — | AI 模型列表、当前选中 |

**问题**：chatStore 和 discussionStore 结构高度相似（sessions/rooms + messages + streamingContent + isStreaming），可考虑统一或抽取共享逻辑。

### 4.3 Services

| 服务 | 路径 | 作用 |
|---|---|---|
| api | `services/api.ts` | Axios 单实例（baseURL、拦截器） |
| sse | `services/sse.ts` | SSE 解析器（parseSSEChunk + readSSE），基于 fetch ReadableStream |
| stockApi | `services/stockApi.ts` | 股票行情/K线/指标/搜索 |
| analysisApi | `services/analysisApi.ts` | 分析/组合相关 |
| researchApi | `services/researchApi.ts` | 研究/回测相关 |
| chatApi（隐含在 chatStore） | — | 会话 CRUD |
| discussionApi（隐含在 discussionStore） | — | 讨论房间 CRUD |
| alphaApi | `services/alphaApi.ts` | Alpha 目录/搜索/模板 |
| alertApi | `services/alertApi.ts` | 预警 |
| authApi | `services/authApi.ts` | 邮箱认证 |
| marketDiscoveryApi | `services/marketDiscoveryApi.ts` | 市场脉搏/异动 |
| mcpApi | `services/mcpApi.ts` | MCP 工具管理 |
| notificationApi | `services/notificationApi.ts` | 通知 |
| settingsApi | `services/settingsApi.ts` | 系统设置 |
| sharePreviewApi | `services/sharePreviewApi.ts` | 分享预览 |

**SSE 管道**（6条）：
1. Chat 消息流（`POST /chat/sessions/:id/messages`）
2. Discussion 讨论流（`POST /discussion/rooms/:id/start`）
3. 研究报告流（`POST /research`）
4. Swarm 研究流（`POST /research/swarm`）
5. 选股筛选流（SSE）
6. 预警通知流（SSE）

### 4.4 Features（纯 TS 业务逻辑模块）

| 模块 | 路径 | 作用 |
|---|---|---|
| productProgress | `features/productProgress.ts` | 产品进度追踪（localStorage） |
| professionalPreferences | `features/professionalPreferences.ts` | 专业偏好（布局密度/指标选择/Alpha 模板） |
| globalTaskEntry | `features/globalTaskEntry.ts` | 全局任务入口逻辑 |
| indicatorKnowledge | `features/indicatorKnowledge.ts` | 指标知识库 |
| researchTimeline | `features/researchTimeline.ts` | 研究时间线数据 |
| researchContinuity | `features/researchContinuity.ts` | 研究连续性追踪 |
| researchIntent | `features/researchIntent.ts` | 研究意图 |
| researchTracking | `features/researchTracking.ts` | 研究追踪 |
| comparisonWorkspace | `features/comparisonWorkspace.ts` | 比较工作区 |
| fundamentalMetrics | `features/fundamentalMetrics.ts` | 基本面指标 |
| reproducibilityManifest | `features/reproducibilityManifest.ts` | 可复现性清单 |
| backtest/validation | `features/backtest/validation.ts` | 回测表单验证 |
| backtest/presets | `features/backtest/presets.ts` | 策略预设 |
| backtest/request | `features/backtest/request.ts` | 回测请求解析 |
| backtest/experiments | `features/backtest/experiments.ts` | 实验管理 |
| backtest/interpretation | `features/backtest/interpretation.ts` | 回测结果解读 |
| alpha/catalog | `features/alpha/catalog.ts` | Alpha 目录 |
| alpha/studies | `features/alpha/studies.ts` | Alpha 研究记录 |
| alpha/observations | `features/alpha/observations.ts` | Alpha 观察 |
| notifications/state | `features/notifications/state.ts` | 通知状态 |
| swarm/state | `features/swarm/state.ts` | Swarm 状态 |

**模式**：features/ 是将业务逻辑从组件中抽取为纯 TS 模块的良好实践，应继续扩展。

### 4.5 Types

| 文件 | 作用 |
|---|---|
| `types/index.ts` | 全局类型定义（RealTimeQuote、KLineDataPoint、IndicatorData、Message、DashboardStats、PortfolioSummary 等） |
| `types/research.ts` | 研究/回测类型（BacktestRun、Bar、SharePreview 等） |

---

## 五、应删除/合并/重新设计的组件

### 5.1 应删除的组件

| 组件 | 理由 |
|---|---|
| SwarmStatusCard | 使用频率低，当前无页面引用或仅在实验性代码中使用 |

### 5.2 应合并的组件

| 组件 A | 组件 B | 合并方案 |
|---|---|---|
| Chat 页面 | Discussion 页面 | 抽取共享 ChatLayout（双栏布局：Sider + Content），保留各自业务逻辑 |
| MarketMoversPanel | MarketThemesPanel | 合并为 MarketInsightPanel，内部 tab 切换异动/主题 |
| StockAnalysis 中的 IndicatorSubChart | — | 提取为独立 IndicatorSubChart 组件 |
| StockAnalysis 中的 PriceStatsBar | — | 提取为独立 PriceStatsBar 组件 |
| Dashboard 中的 DecisionInboxPanel | — | 提取为独立组件 |
| Dashboard 中的 LocalCapabilityBanner | — | 提取为独立组件 |
| Chat 中的搜索下拉 | StockAnalysis 中的搜索下拉 | 合并为共享 InstrumentSearch 组件 |

### 5.3 应重新设计的组件

| 组件 | 问题 | 建议 |
|---|---|---|
| StreamingText | 纯文本打字机，不支持 Markdown 流式渲染 | 增强为 MarkdownStreamingText，支持标题/列表/代码块逐块流式 |
| ChatMessageBubble | 内联 style 多（~30行 inline），不利于主题切换 | 迁移至 Design System tokens（CSS 变量） |
| ScrollingTable | 自定义表格实现，功能有限 | 考虑用 AntD Table + virtual scroll 替代 |
| StockChart | K线图缺少交互（时间范围选择、指标切换） | 增强交互，统一 hook 调用模式 |

---

## 六、设计未来：FinQuant Design System

### 6.1 现有设计原语（已存在，需标准化）

| 原语 | 现有实现 | 标准化方向 |
|---|---|---|
| TaskPageHeader | `components/TaskPageHeader.tsx` | ✅ 已标准化：eyebrow/title/goal/object/status(statusTone)/actions。保持为 Design System 核心原语 |
| ResultLayer | `components/ResultLayer.tsx` | ✅ 已标准化：layer(summary/evidence/method) + title/description/actions。保持为 Design System 核心原语 |
| CitationDetails | `components/CitationDetails.tsx` | ✅ 已标准化：4态质量（OK/PARTIAL/UNKNOWN/UPSTREAM_ERROR）。保持为 Design System 核心原语 |

### 6.2 需新建的 Design System 组件

#### 6.2.1 Button

**现状**：AntD Button 直接使用，无统一封装。
**建议**：封装 `FqButton`，统一：
- primary / secondary / ghost / danger 变体
- loading / disabled 状态
- icon-only / icon+text 布局
- 统一 height（32px compact / 40px default）和 padding tokens

#### 6.2.2 Card

**现状**：AntD Card 直接使用，`surface-card` class 散落在各处。
**建议**：封装 `FqCard`，统一：
- surface-card 变体（默认）
- hero-card 变体（渐变背景，用于 TaskLaunchpad 等）
- 统一 border-radius（12px）、box-shadow、padding
- 支持 header / extra / actions 插槽

#### 6.2.3 AgentStatusCard

**现状**：Research 页面内联 AgentCard（25行），Discussion 中 agent 状态展示不一致。
**建议**：提取统一 `AgentStatusCard`：
```
Props:
  name: string          // "商业模式"
  role: string          // "业务、护城河与竞争力"
  icon: string          // "🏢"
  status: pending | running | completed | failed
  progress?: string     // 进度文本
```
统一颜色语义：pending=gray, running=blue, completed=green, failed=red

#### 6.2.4 ResearchTimeline

**现状**：`components/research/ResearchTimeline.tsx` 已存在。
**建议**：增强为通用 `FqTimeline`：
- 统一 AntD Timeline 的使用模式
- 支持 persistence 标签（SERVER_PERSISTED / LOCAL_DERIVED）
- 支持 status 标签（drifted / ok）
- 统一颜色语义

#### 6.2.5 EvidenceBlock

**现状**：`CitationDetails` 已实现来源溯源，`ResultLayer` 已实现 summary/evidence/method 分层。
**建议**：提取 `EvidenceBlock` 作为研究结果中的证据展示块：
```
Props:
  evidenceId: string
  kind: 'data' | 'analysis' | 'risk'
  source?: string
  quality: 'OK' | 'PARTIAL' | 'UNKNOWN' | 'UPSTREAM_ERROR'
  asOf?: string
  content: ReactNode
  children?: ReactNode  // CitationDetails 展开内容
```

#### 6.2.6 FinancialMetric

**现状**：Dashboard 中 `big-screen-metric` 和 Portfolio 中 Statistic 各自实现。
**建议**：提取 `FqFinancialMetric`：
```
Props:
  label: string
  value: number | null
  prefix?: string
  suffix?: string
  decimals?: number
  change?: number        // 涨跌
  detail?: string
  tone: 'cyan' | 'red' | 'green' | 'blue' | 'violet'
  variant: 'big-screen' | 'card' | 'inline'
```

### 6.3 Design Tokens 建议

#### 颜色

| Token | 浅色 | 深色 | 用途 |
|---|---|---|---|
| --fq-primary | #1677ff | #69b1ff | 主色 |
| --fq-success | #52c41a | #73d13d | 成功/完成 |
| --fq-danger | #ff4d4f | #ff7875 | 错误/失败 |
| --fq-warning | #faad14 | #ffc53d | 警告 |
| --fq-bg-surface | #ffffff | #141414 | 页面背景 |
| --fq-bg-card | #ffffff | #1b2533 | 卡片背景 |
| --fq-border | #dce5ef | #34445a | 边框 |
| --fq-text-primary | #1f2f46 | #edf4ff | 主文本 |
| --fq-text-secondary | #65748a | #a9b7c9 | 辅助文本 |
| --fq-price-up | #f23645 | #f23645 | 涨（A股红） |
| --fq-price-down | #089981 | #089981 | 跌（A股绿） |

#### 间距 / 圆角 / 阴影

| Token | 值 | 用途 |
|---|---|---|
| --fq-radius-sm | 8px | 按钮/输入 |
| --fq-radius-md | 12px | 卡片 |
| --fq-radius-lg | 16px | 页面 hero |
| --fq-shadow-sm | 0 2px 8px rgba(0,0,0,0.06) | 卡片 |
| --fq-shadow-md | 0 8px 24px rgba(0,0,0,0.08) | 浮层 |
| --fq-gap-sm | 8px | 组件内间距 |
| --fq-gap-md | 16px | 区块间距 |
| --fq-gap-lg | 24px | 页面间距 |

### 6.4 关键设计模式总结

| 模式 | 描述 | 使用页面 | 建议 |
|---|---|---|---|
| TaskPageHeader | 任务页标题+状态+操作 | StockAnalysis/StrategyLab/Portfolio/AlphaResearch/ResearchWorkspace | ✅ 保持为 Design System 核心 |
| ResultLayer（三段式） | summary → evidence → method | StockAnalysis/Research/StrategyLab | ✅ 保持为 Design System 核心 |
| CitationDetails（证据溯源） | 4态质量标签 + 来源/截止/公式/质量标记 | StrategyLab/Research | ✅ 保持为 Design System 核心 |
| SSE Streaming | fetch + ReadableStream → 逐事件解析 | Chat/Discussion/Research/Swarm | ✅ 保持现有 sse.ts 实现 |
| Agent 进度卡片 | pending→running→completed/failed | Research（内联） | 建议提取为 AgentStatusCard |
| 搜索结果下拉 | Input.Search + absolute dropdown | Dashboard/StockAnalysis/Research | 建议提取为 InstrumentSearch |
| 深色大屏面板 | `.big-screen-*` 系列 CSS | Dashboard | 建议统一到 Design System |

---

## 七、技术债务总结

### 7.1 高优先级

1. **Dashboard/Portfolio/StrategyLab 页面过重**（875/999/821行），需拆分
2. **PortfolioRiskWorkbench 476行**——最明确的重设计目标：七八个功能块挤在单组件，ECharts option 全部手写内联
3. **搜索下拉重复实现** 3 处（Dashboard/StockAnalysis/Research），应抽取 `InstrumentSearch` 共享组件
4. **StockAnalysis K线图未使用 hook**（直接调 createChart），与 StockChart 的 useLightweightCharts hook 不一致
5. **流式请求绕过 apiClient**，401/统一错误处理失效，各页重复手写错误逻辑——建议抽 `streamFetch(path, opts)`
6. **api 层薄厚不一**：analysisApi 兼职领域聚合与字段 remap，其余 api 极薄——建议把「拉取+聚合+字段映射」统一移到 features 层

### 7.2 中优先级

7. **Chat/Discussion 布局双栏重复**，应抽取共享 `ChatLayout`
8. **MarketMoversPanel/MarketThemesPanel 风格重叠**，应合并；两者的 `formatAmount/formatPercent/formatWanAmount` 几乎逐字重复——应抽 `utils/format.ts`
9. **内联 style 占比极高**（ChatMessageBubble/Dashboard/Chat/Discussion 等），应迁移至 CSS variables
10. **StreamingText 不支持 Markdown 流式**，且 `setInterval + slice(0,index)` 对大文本高频重渲染；`@keyframes blink` 内联注入应移到全局 CSS
11. **chatStore 与 discussionStore 近乎同构**（~50行重复），可抽 `createListStore` zustand 高阶工厂
12. **zustand 未用 persist**，持久化退化为手写 localStorage + dispatchEvent 样板
13. **两套回测展示实现**：Chat 的 BacktestResultCard vs StrategyLab 的 ResultLayer+BacktestCharts，指标口径/图表重复
14. **信号/指标知识文案分散**：SignalInterpretation.SIGNAL_COPY vs IndicatorGuide.INDICATOR_KNOWLEDGE，应合并为共享知识词典
15. **SSE 连接逻辑重复**：NotificationCenter 的 EventSource 生命周期 vs SwarmStatusCard 的 stream*——应抽共享流式 hook

### 7.3 低优先级

16. **Marquee.tsx 可能是死代码**——grep 无页面引用，需确认去留
17. **DiscussionTimeline 的 roundMap/rounds 计算未用于渲染**——死代码应清理
18. **SwarmStatusCard 使用频率低**，评估删除
19. **ScrollingTable 自定义实现**，考虑 AntD Table 替代
20. **app.css 783行无 CSS modules**，应考虑组件级样式隔离
21. **useLightweightCharts 初始化 effect 依赖 `[]` 却读取 config**——闭包迟到隐患，建议显式拆分 createChart 与 applyOptions
22. **导航分组硬编码 App.tsx** 与 `getMenuKey` 双份维护，菜单增删需同步两处
23. **研究域类型两文件分裂**（index.ts 的 ResearchReport/ResearchSSE* vs research.ts 的 ResearchReportDetail/Version），命名不统一
24. **两套组合类型并存**（旧 PortfolioGroup 与新 PaperPortfolio*），需冻结旧表并标注 deprecated

### 7.4 跨组件共享原语清单（最高杠杆收敛）

| 共享原语 | 应替换的重复实现 | 涉及文件 |
|---|---|---|
| `utils/format.ts`（pct/signedPct/formatAmount/formatWanAmount） | MarketMoversPanel / MarketThemesPanel / BacktestSummary / ExperimentWorkbench / PortfolioRiskWorkbench / AlphaSimulationWorkbench 各自复制 | 6+ |
| `InstrumentSearch`（搜索+下拉） | Dashboard / StockAnalysis / Research 各自手写 | 3 |
| `AgentStatusCard`（agent 进度） | Research 内联 AgentCard / Discussion / SwarmStatusCard | 3 |
| `SelectionCardGrid`（选择卡片栅格） | AlphaTemplateCatalog / StrategySetup / ResearchIntentPicker 各自手写高亮边框 | 3 |
| `MetricGrid`/`StatisticCardList`（指标卡阵列） | BacktestSummary / ExperimentWorkbench / PortfolioRiskWorkbench | 3+ |
| `SettingsFormPanel`（设置表单外壳） | FundamentalsSourcePanel / SystemSettingsPanel 负载/Skeleton/保存按钮组 | 2 |
| `ActivityTimeline`（时间线/待办） | ResearchTimeline / PortfolioRiskWorkbench 复盘待办 / ResearchContinuity | 3 |
| `ErrorExplanationPanel`（错误解释） | BacktestFailurePanel / 各研究面板 error Alert | 2+ |
| 共享 K 线/权益/回撤图表原语 | ResearchCharts / BacktestCharts / PortfolioRiskWorkbench ECharts option 手写 | 3 |
| SSE 流式 hook（`useSSEStream`） | Chat / Discussion / Research / SwarmStatusCard 各自手写 stream 生命周期 | 4+ |
| 知识词典 feature（指标+信号） | SignalInterpretation.SIGNAL_COPY + IndicatorGuide.INDICATOR_KNOWLEDGE | 2 |

---

*分析完成。4 个子代理并行深度分析 + 亲手审阅所有关键文件。所有组件均已审阅，无代码修改。*
