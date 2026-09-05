# Astra 会话 B 反馈 — 前端 UI / 设计审查（2026-09-04）

> 执行：OpenAI GPT-6 Astra（Codex 应用，High 档）｜ 只读审查，原文存档
> 对应任务书：`docs/ai/ASTRA_REVIEW_TASK_B.md`
> 状态：已记录，待维护者抽核断言并决定后续动作

## 会话 B 结论

### B1 设计系统一致性（token/主题/残留色，含证据文件:行）

**结论：颜色迁移已有明显进展，但“统一 token”尚未完全转化为“统一主题行为”。**

本次抽查 Dashboard、ResearchWorkspace、StrategyLab、Portfolio、Discover、Settings 六页及代表组件。

- **历史残色已未检出。** 对 152 个前端业务源码文件静态扫描，`#dce5ef`、`#1890ff` 均无匹配；32 个 `--fq-*` 定义覆盖了检出的 `var(--fq-…)` 引用。当前颜色集中在 [app.css:600](/E:/Code_file/Projects/finquant-hub/frontend/src/app.css:600)，暗色覆盖在 [app.css:635](/E:/Code_file/Projects/finquant-hub/frontend/src/app.css:635)。不能沿用旧文档“残色未迁完”的结论。

- **已确认：资金流、筹码历史图切换主题后不会主动重新取色。** 两者固定传入 `theme: 'light'`；共享 hook 初始化实际读取当前 CSS token，因此**暗色首次打开不一定错误**，但更新 effect 只依赖固定不变的 `config.theme`，已有图表会保留切换前的颜色。证据：[MoneyFlowChart.tsx:18](/E:/Code_file/Projects/finquant-hub/frontend/src/components/MoneyFlowChart.tsx:18)、[ChipHistoryChart.tsx:18](/E:/Code_file/Projects/finquant-hub/frontend/src/components/ChipHistoryChart.tsx:18)、[useLightweightCharts.ts:133](/E:/Code_file/Projects/finquant-hub/frontend/src/hooks/useLightweightCharts.ts:133)。实际视觉表现待核。

- **已确认：证据抽屉存在主题作用域断裂。** 暗色变量位于 `.app-theme--dark` 内，而 EvidenceDrawer/EvidenceRail 未指定挂载容器，安装版本的 Portal 默认追加到 `body`。抽屉内自定义 CSS 因此继承根节点的浅色 token，与 AntD 暗色算法形成混搭。证据：[App.tsx:399](/E:/Code_file/Projects/finquant-hub/frontend/src/App.tsx:399)、[EvidenceDrawer.tsx:43](/E:/Code_file/Projects/finquant-hub/frontend/src/components/EvidenceDrawer.tsx:43)、[EvidenceRail.tsx:8](/E:/Code_file/Projects/finquant-hub/frontend/src/components/EvidenceRail.tsx:8)、[useDom.js:44](/E:/Code_file/Projects/finquant-hub/frontend/node_modules/@rc-component/portal/es/useDom.js:44)。具体对比度待核。

- **AntD 与自定义组件仍是两套基础样式来源。** ConfigProvider 只切换算法，没有映射主色、圆角等语义 token。自定义主色是 `--fq-ai-primary`，按钮、Tag 等仍使用 AntD 自身主题。证据：[App.tsx:402](/E:/Code_file/Projects/finquant-hub/frontend/src/App.tsx:402)、[app.css:601](/E:/Code_file/Projects/finquant-hub/frontend/src/app.css:601)。

- **尺寸规范存在漂移。** 设计规范要求圆角 8/12/16，实际为 6/8/8；侧栏 token 为 240px，布局却使用 224px。这不是功能故障，但让 token 失去尺寸权威。证据：[DESIGN_SYSTEM_V1.md:321](/E:/Code_file/Projects/finquant-hub/docs/DESIGN_SYSTEM_V1.md:321)、[app.css:625](/E:/Code_file/Projects/finquant-hub/frontend/src/app.css:625)、[App.tsx:275](/E:/Code_file/Projects/finquant-hub/frontend/src/App.tsx:275)。颜色中的对比度调整不应仅因与旧规范不同就机械回退。

### B2 审美与视觉层次（诚实评价 + 最影响观感的 1-3 处）

**评价：已有克制的研究产品底色，但页面仍较多地按“有哪些功能”组织，尚未稳定围绕“用户现在需要判断什么”组织。** 以下为源码结构判断，不冒充截图验收。

值得保留：报告正文已有中文字体、720px 阅读宽度及较舒适的行高；回测摘要已有解释、主要限制和折叠专业指标。证据：[app.css:293](/E:/Code_file/Projects/finquant-hub/frontend/src/app.css:293)、[BacktestSummary.tsx:55](/E:/Code_file/Projects/finquant-hub/frontend/src/components/strategy/BacktestSummary.tsx:55)、[BacktestSummary.tsx:105](/E:/Code_file/Projects/finquant-hub/frontend/src/components/strategy/BacktestSummary.tsx:105)。

最影响观感与信任感的三处：

1. **默认右栏消耗空间，却没有真实任务内容。**
   AgentRail 四个标签页均为固定空态，组件只接收开关参数；桌面默认展开并占 376px。按 CSS 尺寸计算，1440px 画布扣除 224px 导航、右栏及首页 padding，主阅读区仅约 792px。同时顶部、首页 Hero、底部又存在多个提问入口。视觉重心容易分散。
   证据：[AgentRail.tsx:18](/E:/Code_file/Projects/finquant-hub/frontend/src/components/AgentRail.tsx:18)、[App.tsx:188](/E:/Code_file/Projects/finquant-hub/frontend/src/App.tsx:188)、[app.css:108](/E:/Code_file/Projects/finquant-hub/frontend/src/app.css:108)、[Dashboard.tsx:75](/E:/Code_file/Projects/finquant-hub/frontend/src/pages/Dashboard.tsx:75)。

2. **回测首屏把“准备工具”排在“验证想法”之前。**
   参数表之前依次展开自然语言 IR、自选股、市场参考、目标及预设卡片；真正决定双均线策略的快慢窗口反而藏在高级设置中。完成后先出现 CAGR／Sharpe／MDD，再看到中文结论，层级次序与目标用户相反。
   证据：[StrategyLab.tsx:468](/E:/Code_file/Projects/finquant-hub/frontend/src/pages/StrategyLab.tsx:468)、[StrategyLab.tsx:572](/E:/Code_file/Projects/finquant-hub/frontend/src/pages/StrategyLab.tsx:572)、[StrategyLab.tsx:635](/E:/Code_file/Projects/finquant-hub/frontend/src/pages/StrategyLab.tsx:635)、[StrategyLab.tsx:708](/E:/Code_file/Projects/finquant-hub/frontend/src/pages/StrategyLab.tsx:708)。

3. **证据很诚实，但呈现方式有“调试面板感”。**
   DecisionCard 重复显示质量、证据标识、来源、时间；MonitorCard 直接展示 HIGH／UNKNOWN 等枚举；组合总览还为缺少能力的情景页保留标签。中文用户需要先解释这些标签，才能理解投资问题。
   证据：[DecisionCard.tsx:32](/E:/Code_file/Projects/finquant-hub/frontend/src/components/DecisionCard.tsx:32)、[MonitorCard.tsx:25](/E:/Code_file/Projects/finquant-hub/frontend/src/components/MonitorCard.tsx:25)、[PortfolioOverview.tsx:60](/E:/Code_file/Projects/finquant-hub/frontend/src/components/PortfolioOverview.tsx:60)。此外，指标名称使用 11px，偏离规范的数据阅读下限：[app.css:824](/E:/Code_file/Projects/finquant-hub/frontend/src/app.css:824)。

### B3 可用性与非技术友好（问题-证据-建议）

| 问题 | 当前证据 | 建议 |
|---|---|---|
| **已确认：提问提交后没有被默认研究页接住。** 底部发送及全局“继续研究”都进入 `/research?prompt=…`；默认研究页只处理标的路径和 mode，不读取 prompt。问题留在 URL，但页面没有呈现草稿。 | [App.tsx:316](/E:/Code_file/Projects/finquant-hub/frontend/src/App.tsx:316)、[globalTaskEntry.ts:21](/E:/Code_file/Projects/finquant-hub/frontend/src/features/globalTaskEntry.ts:21)、[ResearchWorkspace.tsx:193](/E:/Code_file/Projects/finquant-hub/frontend/src/pages/ResearchWorkspace.tsx:193)、[ResearchWorkspace.tsx:870](/E:/Code_file/Projects/finquant-hub/frontend/src/pages/ResearchWorkspace.tsx:870) | 导航后立即显示原问题及已识别对象，让用户明确选择“快速了解／生成报告”。已有 Chat 能读取 prompt，可复用，避免用户重新输入。 |
| **已确认：筛选术语被误识别为证券代码。** 用当前源码正则验证，`ROE > 20%` 提取出 `ROE`；`FCF CAGR > 10%` 提取出 `FCF、CAGR`。`600519 · ROE > 20%` 只提交代码数组，并不执行 ROE 条件。 | [Discover.tsx:13](/E:/Code_file/Projects/finquant-hub/frontend/src/pages/Discover.tsx:13)、[Discover.tsx:45](/E:/Code_file/Projects/finquant-hub/frontend/src/pages/Discover.tsx:45)、[DiscoverSearch.tsx:35](/E:/Code_file/Projects/finquant-hub/frontend/src/components/DiscoverSearch.tsx:35) | 明确分为“查询指定股票”和“检索研究因子”。不可执行条件不要做成已应用的筛选控件；股票代码应独立确认，避免将普通英文术语当作标的。 |
| **默认文案暴露实现术语。** “有限策略 IR”“Research / Compare / Monitor”、CAGR／MDD，以及证据中的 `as_of / quality`，并非非技术中文用户的自然语言。 | [zh.ts:73](/E:/Code_file/Projects/finquant-hub/frontend/src/i18n/zh.ts:73)、[zh.ts:1052](/E:/Code_file/Projects/finquant-hub/frontend/src/i18n/zh.ts:1052)、[StrategyLab.tsx:709](/E:/Code_file/Projects/finquant-hub/frontend/src/pages/StrategyLab.tsx:709)、[SourceChip.tsx:12](/E:/Code_file/Projects/finquant-hub/frontend/src/components/SourceChip.tsx:12) | 改为“把想法整理成回测规则”“年化收益”“历史最大跌幅”“截至时间／数据状态”。机器枚举保留在技术详情中，未知值显示“暂缺数据＋原因”。 |
| **“双击能启动”与“能完成第一份 AI 研究”之间仍有配置门槛。** 启动脚本要求安装 Bun、可能要求编辑 `.env`；进入设置默认看到系统任务配置，而非模型连通引导。 | [start.bat:17](/E:/Code_file/Projects/finquant-hub/start.bat:17)、[start.bat:86](/E:/Code_file/Projects/finquant-hub/start.bat:86)、[Settings.tsx:598](/E:/Code_file/Projects/finquant-hub/frontend/src/pages/Settings.tsx:598) | 在首页按实际状态显示“行情可用／AI 待配置”，提供“连接模型→测试连接→开始研究”的短路径。高级环境变量配置放次级说明。干净机器安装体验待核。 |

正面评价：研究搜索已有无结果提示、局部失败与重试；回测有本地参数校验和可行动的失败解释；模拟组合有明确标识及确认操作。应保留这些能力，而非只做视觉包装。证据：[ResearchWorkspace.tsx:227](/E:/Code_file/Projects/finquant-hub/frontend/src/pages/ResearchWorkspace.tsx:227)、[StrategyLab.tsx:332](/E:/Code_file/Projects/finquant-hub/frontend/src/pages/StrategyLab.tsx:332)、[BacktestFailurePanel.tsx:8](/E:/Code_file/Projects/finquant-hub/frontend/src/components/strategy/BacktestFailurePanel.tsx:8)、[Portfolio.tsx:562](/E:/Code_file/Projects/finquant-hub/frontend/src/pages/Portfolio.tsx:562)。

### B4 若我重做（1-2 处具体改法，组件/token 级）

**① 重做“首页提问 → 研究结果”的连续工作面**

目标：第一眼知道从哪里开始，提交后问题不丢，研究完成后首先看到结论。

```text
今日工作台                          系统状态 · 主题

今天想了解哪家公司？
[ 公司名称、股票代码或你的问题………… ] [开始研究]
  最近研究：已有对象；首次使用则显示输入示例

需要你复核                         继续研究
最多 3 条变化                     最近 3 项真实任务
对象／为什么现在／影响             对象／当前阶段／继续

市场简报                          默认折叠的更多信息
```

进入研究后：

```text
公司名称 · 代码 · 数据截至时间       [生成深度报告]

你的问题：原样保留用户输入
────────────────────────────────────────────
一句话结论                         [查看来源]
关键依据 1
关键依据 2
主要风险／尚不能判断的部分
────────────────────────────────────────────
[继续追问]   [保存研究]   [创建监控草稿]

点击来源时才打开 EvidenceRail
```

**组件落点**

- 保留 `CommandBar`，让 Hero 成为真正可输入的入口；`GlobalTaskEntry` 的弹窗、快捷键与搜索状态只保留一个实例，顶部提供同一入口的触发按钮。当前每个实例都注册全局快捷键，首页存在重复实例，需一并收敛。证据：[CommandBar.tsx:19](/E:/Code_file/Projects/finquant-hub/frontend/src/components/CommandBar.tsx:19)、[GlobalTaskEntry.tsx:50](/E:/Code_file/Projects/finquant-hub/frontend/src/components/GlobalTaskEntry.tsx:50)。
- `CommandComposer` 仅在具体研究语境中承担追问，提交携带当前对象与原问题；首页不再出现第二种提交行为。
- 默认关闭空的 `AgentRail`。已有真实阶段时，在研究内容中使用 `AgentStatusCard`；来源按需打开现有 `EvidenceRail`，不常驻一块无数据的侧栏。
- `DecisionCard` 默认只保留“变化、影响、来源时间、一个动作”。证据 ID、质量枚举及详细 provenance 放入现有抽屉；重要缺失仍必须在卡面说明。

**token 与排版**

- 保留当前中性色和语义色；页面 `--fq-bg-page`，内容 `--fq-surface-1`，仅主动作使用 `--fq-ai-primary`。
- 恢复清晰的圆角等级：输入 8px、卡片 12px、Hero 16px，统一映射 AntD。
- 新增少量间距 token：8／16／24／32px；正文 14/22，结论 16/26，标题 24/32。来源使用 12px，风险解释不得降成小字。
- 普通研究页单主栏，阅读宽约 760px；窄屏证据用抽屉，不压缩结论正文。以上对应已有设计原则：[DESIGN_SYSTEM_V1.md:279](/E:/Code_file/Projects/finquant-hub/docs/DESIGN_SYSTEM_V1.md:279)、[DESIGN_SYSTEM_V1.md:367](/E:/Code_file/Projects/finquant-hub/docs/DESIGN_SYSTEM_V1.md:367)。

**验收点：** 提交后原问题可见；Ctrl+K 只打开一个弹窗；空右栏不占空间；1440／1280／1024 下主动作可达；切换暗色后证据抽屉与正文一致。

---

**② 重做策略实验室：让“规则—结果—限制”在同一个视野内**

目标：普通用户能说清自己测试了什么，再理解历史结果。

```text
验证一个投资想法

回测设置                         实验结果
──────────────────              ───────────────────────
股票［已选对象］                  未运行：说明将比较什么
期间［开始—结束］                 运行中：真实阶段
规则［20 日均线上穿 50 日］        完成后：
                                  中文结论／可信度限制
[用一句话填写规则]                 策略收益 · 买入持有 · 最大跌幅

成本与执行摘要                    权益与基准对照图
收盘判断，下一开盘执行              区间／单位／来源时间
当前费用预设 · 初始资金
[展开费用与风控]                   [交易记录] [方法与诊断]

[检查并运行回测]                   [保存本次实验]
```

**组件落点**

- `StrategySetup` 收敛为紧凑预设选择，不再让两排大卡片先占据首屏。
- 标的、日期、快慢均线进入基础表单；自然语言 IR 卡折叠为“用一句话填写规则”，解析后直接展示中文规则与待确认项。
- 自选股和市场参考变成标的选择器中的候选，不作为两张独立大卡。
- 结果区先渲染 `BacktestSummary` 的解释与限制，再放指标；取消其上方重复的 CAGR／Sharpe／MDD 指标条。
- 保留 `BacktestFailurePanel` 的根因和下一步，原始错误默认折叠。全部复用当前组件和计算结果，不增加后端能力。

**token、图表和数据表达**

- 桌面采用约 360px 设置栏＋弹性结果栏；宽度不足时上下排列，关闭通用 Agent 侧栏。
- 收益方向使用 `--fq-price-up/down`；最大回撤使用 `--fq-risk`。当前顶部 MDD 用下跌绿，而摘要用风险红，应统一风险语义。证据：[StrategyLab.tsx:711](/E:/Code_file/Projects/finquant-hub/frontend/src/pages/StrategyLab.tsx:711)、[BacktestSummary.tsx:61](/E:/Code_file/Projects/finquant-hub/frontend/src/components/strategy/BacktestSummary.tsx:61)。
- 策略／基准用固定系列色加实线／虚线区分；资金净流量、平均成本等一般序列不统一套用“上涨红”。当前面积图无论数据含义都使用 `colors.up`：[useLightweightCharts.ts:71](/E:/Code_file/Projects/finquant-hub/frontend/src/hooks/useLightweightCharts.ts:71)。
- `FinancialMetric` 接收原始空值、实际质量和截至时间，不先把空值格式化成破折号再传 `quality="OK"`。当前摘要存在此组合：[BacktestSummary.tsx:9](/E:/Code_file/Projects/finquant-hub/frontend/src/components/strategy/BacktestSummary.tsx:9)、[BacktestSummary.tsx:67](/E:/Code_file/Projects/finquant-hub/frontend/src/components/strategy/BacktestSummary.tsx:67)。

**验收点：** 未运行、运行中、成功、数据不足、部分失败均能理解下一步；基础规则无需展开高级设置即可检查；收益、基准、最大跌幅和来源在同一阅读区域；明暗切换后图表同步更新。

### B5 诚实声明（只读、未改文件、未 commit；无把握处标注“待核”）

- 全程只读：未修改或新增文件，未 commit，未安装依赖，未删除；结束时工作树干净。
- 完成源码、样式、文案及调用链核查，并用当前正则验证了筛选术语误识别。
- 未启动服务、未运行构建或测试、未做浏览器截图。因此实际视觉、对比度、键盘焦点、中文输入法及干净机器首用体验均为**待核**，不宣称视觉或无障碍验收通过。
- 建议维护者先处理提问承接、筛选误识别和主题同步，再实施上述两处重做方案；本次仅记录。
