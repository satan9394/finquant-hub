# FinQuant Hub 产品能力基线

> 对应任务：`PROD-001`  
> 快照日期：2026-08-16  
> 证据范围：当前工作树中的 React 路由/页面、前端 API 调用、FastAPI OpenAPI 与后端服务实现  
> 限制：本任务是代码可达性审计，不代替 `PROD-002` 的浏览器截图和人工步骤基线

## 1. 状态定义

| 状态 | 含义 |
|---|---|
| `DISPLAYED` | 当前路由可到达，前端已调用真实后端能力并展示结果 |
| `PARTIAL` | 核心能力可用，但闭环、解释、空错状态或入口仍不完整 |
| `BACKEND_ONLY` | 后端与确定性测试已存在，当前产品页面没有调用 |
| `MISSING` | 当前代码没有满足目标的实现或数据合同 |
| `DESIGN_ONLY` | 明确只做评估/设计，或受安全、许可、数据可用性限制不得伪实现 |

## 2. 当前页面与入口

当前 `App.tsx` 懒加载 18 个页面组件，对外形成 19 个明确路径（研究首页与标的详情复用同一组件），另有一个回退路由。侧栏 15 个可选页面入口归入今日、研究、策略、组合、知识和系统工具六组；三个维护入口只在“系统工具”组。登录页和三个详情/历史路径不进入侧栏。

| 页面组件 / 路径 | 用户当前能完成的结果 | 主要真实接口 | 状态 | 产品化缺口 |
|---|---|---|---|---|
| `Login` · `/login` | 邮箱验证码登录；local-only 时直接进入内部所有者 | `/api/auth/*` | `DISPLAYED` | 标准模式依赖 SMTP；本地模式不应展示登录教学 |
| `Dashboard` · `/` | 从三个核心任务启动分析/回测/组合体检，再查看决策收件箱、大屏、市场雷达、组合、最近活动与自选股 | `/dashboard/stats`、`/dashboard/decision-inbox`、`/market/pulse`、`/market/themes`、`/portfolio/*` | `DISPLAYED` | 首屏任务、持久化首次进度和大屏下移已完成；没有权威跨标的信号聚合合同，相关区域保持 `UNKNOWN` 并引导具体标的分析 |
| `Chat` · `/chat` | 新建/管理会话、选角色、SSE 对话、停止生成、触发 v1 回测 | `/chat/*`、`/backtest/runs` | `DISPLAYED` | 快速问答与回测存在，但未按“意图强度”组织，也未与标的工作区持续关联 |
| `Discussion` · `/discussion` | 创建房间、选择角色/轮数、多 Agent SSE 讨论、查看历史 | `/discussion/*` | `DISPLAYED` | 暴露 Agent 结构；与研究证据、论文和后续动作未闭环 |
| `Knowledge` · `/knowledge` | 阅读策略/指标知识内容 | 前端内置内容 | `PARTIAL` | 有知识条目，但结果页缺少稳定知识锚点和带上下文返回路径 |
| `Models` · `/models` | 模型 CRUD、连通测试、默认模型设置 | `/models/*` | `DISPLAYED` | 已归入系统工具并提供返回研究工作区路径；不作为普通任务前置步骤 |
| `Settings` · `/settings` | 系统设置、用户加密凭据、MCP 配置、基本面源顺序、角色、LLM 用量；显式保存/重置本机常用指标、布局密度和真实 Alpha 模板 ID | `/settings/*`、`/me/credentials/*`、`/mcp/*`、`/market/sources`、`/usage` | `DISPLAYED` | 专业偏好不跨设备同步；维护入口已与普通任务分层 |
| `McpMarket` · `/mcp-market` | 查看服务器/工具和启停状态 | `/mcp/servers`、`/mcp/tools/*` | `DISPLAYED` | 已以“MCP 工具管理”归入系统工具，工程术语不再竞争普通任务入口 |
| `StockAnalysis` · `/analysis/:ticker` | 行情/K 线、MA/MACD/KDJ/RSI 图、技术评分与最近信号；按本机常用指标偏好展示说明/子图并披露当前选择 | `/market/*`、`/analysis/{ticker}/indicators` | `DISPLAYED` | 偏好只改变展示，不减少后端计算或跨设备同步 |
| `ResearchWorkspace` · `/research`、`/research/:symbol` | 跨市场搜索、行情/日线/基本面/筹码、来源/质量、研究笔记、按标的保存、跳转报告/策略；研究首页只读聚合工作区、报告、论文漂移和本地复盘待办时间线；K 线/MACD/RSI 有同数据文字摘要 | `/instruments/*`、`/research/history`、`/thesis` | `DISPLAYED` | 讨论因没有标的外键仍只在单标的页按主题文字匹配；时间线不补造旧笔记修订历史 |
| `Research` · `/research/reports` | 运行 13 章深度研究、SSE 进度、历史、导出、报告转论文 | `/research/*`、`/thesis/from-report/*` | `DISPLAYED` | 仍使用实现历史语言；与标的工作区的笔记、版本和后续验证条件未统一 |
| `ComparisonWorkspace` · `/compare` | 从已保存研究、完成策略实验和本地组合复盘选择最多四项；核对对象/时间/来源/质量，只有完整同口径策略展示原始指标；预览并显式下载同一份 schema v1 可复现 JSON 清单 | `/instruments/workspaces`、`/backtests?saved_only=true`、本地复盘摘要 | `DISPLAYED` | 已保存研究和组合复盘没有共同数值合同；旧策略合同缺失时保持 UNKNOWN/不可比，清单不补算缺失字段 |
| `StrategyLab` · `/strategy-lab/ma-crossover` | 使用预设/自定义参数运行异步 MA 回测、查看状态、保存和重开结果；权益/基准、回撤和成交图有同数据文字摘要 | `/backtests/*` | `DISPLAYED` | 单策略闭环已完整；缺少多预设并排比较、单参数实验和组合回测入口 |
| `Portfolio` · `/portfolio` | 组合与持仓 CRUD、实时盈亏；只读风险工作台、风险解释/来源图、完整相关矩阵、样本协方差风险贡献、四优化器比较、逐资产真实市场/币种覆盖和行业 UNKNOWN，以及显式预警预填/本地复盘待办；初始加载失败按列表/汇总/持仓/配置分层显示并可重试 | `/portfolio/*`、`/backtests/portfolio` | `DISPLAYED` | 压力测试与行业暴露没有真实合同；复盘待办仅限本机派生摘要 |
| `Screening` · `/screening` | 对用户提供的 1–30 个 ticker 做两阶段筛选 | `/screening` | `DISPLAYED` | 是候选比较而非全市场筛选；结果到研究/保存/预警的下一步不足 |
| `AlphaResearch` · `/alpha` | 真实类别/模板、字段口径、显式观察数据本地模拟、横截面 Pearson IC / Spearman Rank IC / 非年化 ICIR、短样本质量、共同日期相关性、命名派生快照，以及真实目录常用模板的本地保存/恢复 | `/wq/categories`、`/wq/templates`、`/wq/simulate/local`、`/wq/correlation` | `DISPLAYED` | 原始观察输入不持久化；完整分位与衰减缺真实合同，常用模板/研究快照不跨设备同步 |
| `Alerts` · `/alerts` | 规则 CRUD/启停、信号类型和触发历史筛选；接收组合风险来源/数值/截止时间预填并在保存前解释技术信号合同 | `/alerts/*` | `DISPLAYED` | 组合风险不能作为原生触发指标；研究结论/论文 claim 的证据回链仍不足 |
| `Thesis` · `/thesis` | 论文 CRUD、手动论点、报告转论文结果、确定性漂移核验和 claim 状态 | `/thesis/*` | `DISPLAYED` | 已进入研究首页统一时间线；缺失证据虽返回 `unknown`，解释入口仍分散 |

## 3. 核心工作流矩阵

| 工作流 | 当前可达链路 | 结论 | 下一产品任务 |
|---|---|---|---|
| 首次个股分析 | Dashboard 示例/搜索 → `/analysis/:ticker` | 可完成真实任务，但页面不以结论、证据、风险、下一步组织 | `PROD-011`、`PROD-012`、`PROD-021` |
| 单策略验证 | Dashboard 自选股或研究页 → StrategyLab → 运行 → 结果 → 保存/重开 | 当前最完整闭环；无需重写后端 | `PROD-030`～`PROD-032` 以比较与渐进披露为主 |
| 组合体检 | Portfolio → 盈亏 → 等权风险体检 → 风险解释/权重/相关矩阵/风险贡献/暴露 → 四优化器只读比较 → 显式预警预填 / 本地复盘待办 | 相关矩阵与风险贡献来自同一组对齐真实策略收益；预填不创建规则，待办可恢复/完成/删除/撤销，不会采用权重 | 压力测试保持数据不足；本地复盘已进入统一时间线 |
| 持续个股研究 | ResearchWorkspace → 数据/笔记/保存 → 深度报告 → 报告转论文 → 研究首页统一时间线 | 工作区、报告、论文漂移和本地复盘待办可按时间回到原记录；后端/本地来源明确，不补造历史 | Phase 6 全路径回归已完成；真实上游失败继续显式保留 |
| Alpha 研究 | AlphaResearch → 类别/模板 → 显式观察数据模拟 → 横截面 IC / Rank IC / ICIR → 共同日期相关性 → 命名并保存派生快照 | IC 仅在每期至少 5 个标的、至少 5 个有效期且非零方差时可用；观察输入默认不落盘，完整分位与衰减保持设计状态 | 跨设备同步属于后续专业工作台范围 |
| 专业比较 | 比较工作区 → 选择已有研究/策略/组合记录 → 核对可比性 → 同口径策略原始指标或跨类型元数据 → 预览/下载可复现清单 | 最多四项选择可恢复；schema v1 清单保留对象、记录、期间、参数、来源、方法和缺口，不运行任务、不生成综合分数 | Phase 6 回归已完成；旧记录缺失合同仍保持 UNKNOWN/不可比 |
| 预警与复盘 | 研究结论/论文 → 预警入口；组合风险 → 带证据预填 / 本地复盘待办；研究首页时间线回看状态 | 组合与研究入口已显式连接，保存前不写规则；本地复盘待办与后端记录分层展示 | Phase 5 已完成 |
| 系统配置 | 系统工具 → Models / MCP Market / Settings → 返回研究工作区 | 三个原深链和能力保留；维护入口与普通任务分层，不是研究前置步骤 | Phase 5 已完成 |

## 4. 指标与证据能力

| 能力组 | 已展示 | 后端已有但未展示 | 真正缺失 / 受限 |
|---|---|---|---|
| 行情与技术 | 价格、OHLCV、MA20/50/120/250、MACD、KDJ、RSI、技术评分、信号 | 无关键接线缺口 | 信号时间尺度、冲突解释和知识锚点属于表达缺口 |
| 基本面与筹码 | 市值、PE/PB、EPS、收入、净利润、经营/自由现金流；报告期/period type/source/quality flags；A 股筹码成本区间与明确 `UNKNOWN` 峰位 | 更多 P1 估值指标需先验证真实源字段 | 许可评级不可替代；单季度不得推成 TTM |
| 单标的回测 | 总/年化/基准/超额收益、最大回撤及恢复、年化/下行波动、Alpha/Beta/R²/Tracking Error、胜率、盈亏比、单笔期望、平均盈利/亏损、平均持有期、市场暴露、逐项成交成本、权益/回撤/交易图、A 股规则、来源、稳健性验证和已保存预设比较 | 无关键接线缺口；旧持久化结果需重跑后才有新增 P1 指标 | 多因子收益归因和基于盘口的冲击成本没有数据合同，保持缺口 |
| 组合 | 成本、市值、盈亏、等权风险工作台、通俗口径、权重/完整相关矩阵/样本协方差风险贡献、四优化器比较、逐资产 market/currency 覆盖与行业 UNKNOWN，以及风险预警预填/本地复盘 | 无关键接线缺口 | 压力测试缺事件/情景/重估合同，行业合同缺失；本地待办不跨设备同步 |
| Alpha | 7 类字段目录、5 个真实字段模板、本地多空收益/回撤/换手/样本质量、横截面 Pearson IC / Spearman Rank IC / 非年化 ICIR、共同日期相关性、命名派生快照保存/恢复 | 无关键接线缺口 | 完整分位需稳定逐组结果，衰减需多期限 forward return |
| 研究可信度 | 工作区显示 provider/as_of/frequency/adjustment/currency/timezone/quality flags；报告可审计与导出；比较选择可导出版本化 schema v1 复现清单；工作区/报告/论文漂移/本地待办有统一只读时间线 | 结构化 13 章报告与研究事件已持久化 | 旧笔记修订和讨论标的外键不存在；反面证据仍需从原记录核对 |
| 产品使用指标 | Dashboard 显示模型/会话/讨论/消息数量；Settings 显示 LLM Token 用量 | 无 | Time to First Value、首次任务完成、理解度、保存率、继续率与重复研究尚无本地测量合同 |
| 发布回归 | Playwright 覆盖 Dashboard、个股研究、策略验证、组合体检的成功/空/错误、延迟图表 canvas、键盘焦点、200% 等效视口和 390px KPI 边界，共 11 条确定性浏览器测试；最终三旅程只读抽查为 0 写请求 / 0 page error / 0 横向溢出 | 无 | Phase 6 已完成；确定性 fixture 与实时市场证据继续分开标注，当前 Yahoo/AkShare 失败不是回归通过 |
| 可访问性 | 三条核心旅程主操作可键盘到达并有可见焦点；研究/回测图表有可见同数据摘要，组合图有语义名称；720px 200% 等效视口与 390px 无文档级溢出 | 无 | 非核心长尾页面继续由发布总体验收抽查；当前未引入自动全站对比度扫描依赖 |
| 性能 | 生产构建测量脚本覆盖研究、策略和组合初始路由；结果图按需加载后初始资产由 2.75–2.77 MB 降至 1.60–1.62 MB（41.36%–41.71%），真实结果仍解析完整图表 | Dashboard 首屏继续按当前信息架构加载可见地图/雷达 | Ant Design 1.44 MB 与按需 ECharts 1.146 MB chunk 仍触发构建警告；没有用隐藏证据、降采样或大范围重写换取分数 |
| 跨市场真实源 | 2026-08-10 实探 600519：Eastmoney 搜索、Tencent 快照、Sina 60 条日线；CN/CNY、Asia/Shanghai、截止时间、`none` 复权和 `unadjusted_prices` 均保留 | 无 | A 股基本面当前 AkShare/Yahoo 失败；HK `0700.HK` 与 US `AAPL` 的 Yahoo 快照/日线/基本面当前 `RemoteProtocolError` 或 `circuit_open`，页面按能力分别显示 502，不补值 |
| 金融口径审计 | 基本面连续四季 TTM/FY、价格来源与复权、同窗买入持有基准、频率年化、单标的逐项成本、组合相关/风险贡献/VaR/ES、Alpha 横截面 IC 与非年化 ICIR 均有代码和测试追踪 | 无 | 组合只读基线不含最低佣金/印花税/FX；Alpha 收益未扣交易成本；Sharpe 无风险收益与 Sortino 目标收益当前固定为 0，均已在结果附近披露 |

专业偏好已形成最小本地合同：只改变展示与启动模板，坏数据回退到当前新手默认值，不改变数据源、指标算法、期间、复权、成本或基准。

可复现清单已形成最小本地 JSON 合同：只读取用户显式选择的规范化摘要，预览与下载同源；缺失字段保持 `UNKNOWN`，并明确排除凭据、原始行情曲线、原始观察输入和交易动作。

## 5. 优先接线清单

1. `Portfolio` 已完成风险工作台、完整相关矩阵、样本协方差风险贡献、四优化器比较、暴露可行性、显式预警预填与本地定期复盘；压力测试继续等待可审计事件/情景合同。
2. `AlphaResearch` 接入 `/api/wq/categories`、`/api/wq/templates`、`/api/wq/simulate/local`、`/api/wq/correlation`。
3. Dashboard 已将现有示例动作重组为分析股票、验证策略、体检组合三个任务并把大屏下移；AIOS-088 删除不存在的信号摘要请求，避免把 404 静默伪装为空数据。
4. ResearchWorkspace 聚合现有深度报告、论文和预警入口，避免重建报告/论文后端。
5. Models、MCP Market 和 Settings 已归入系统层级并保留现有实现；全局任务入口不推荐维护动作。

## 6. 明确不可误判为“待实现”的能力

- 真实券商账户、资金与订单：`DESIGN_ONLY`，默认计划禁止实现。
- Morningstar 等许可评级：`DESIGN_ONLY`，不得用模型或其他指标伪装替代。
- WorldQuant BRAIN 远端提交：后端桥接存在，但每次提交必须显式确认；不能作为默认首次任务。
- 数据源失败时的数值填充：不是功能缺口；必须保留 `UNKNOWN`、`UPSTREAM_ERROR` 和来源失败原因。

## 7. 可重复核验

```powershell
# 前端页面与路由
rg -n "const .* = lazy|<Route path=" frontend/src/App.tsx

# 页面实际调用
rg -n "apiClient\.|fetch\(|readSSE" frontend/src/pages frontend/src/components frontend/src/services

# 运行时 API 事实
cd backend
.venv\Scripts\python.exe -c "from app.main import app; s=app.openapi(); print(len([p for p in s['paths'] if p.startswith('/api/')]))"

# 后端未接线能力
rg -n "create_portfolio_backtest|portfolio_risk_xray|list_factor_templates|simulate_factor_locally|calc_correlation" backend/app
```
