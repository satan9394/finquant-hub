# FinQuant Hub UI Image Prompt Pack v1.0

> 版本：1.0  
> 日期：2026-08-20  
> 目标：为 Designer 与 Image Model 提供可直接复制的高保真桌面 UI 生图提示词  
> 覆盖页面：Workbench Homepage、AI Research Workspace、Portfolio Center、Investment Committee、Strategy Lab  
> 配套规范：`FinQuant_Design_System_v1.md`

---

## 0. 使用说明

本 Prompt Pack 用于生成产品设计概念图，不用于生成营销落地页、移动 App、数据大屏或真实交易终端。建议一次只生成一个页面，每次生成 16:9 单屏，不要让模型把五个页面拼成 collage。先用 Master Prompt 生成整体方向，再用同页 Refinement Prompt 修正布局、中文、状态和组件细节。

图中的金融数据必须带“演示数据”或明确 as-of 时间，不能暗示实时行情。所有关键结论旁保留 FACT、INFERENCE、MODEL_OUTPUT、UNKNOWN 的证据类型；未知值直接显示“未知”，不要让模型用随机数字填满界面。

### 0.1 推荐参数

- 画幅：16:9，优先 1920×1080 或 1600×900。
- 视角：正面、无透视、完整浏览器应用画面。
- Fidelity：high-fidelity product UI、production-ready design system、crisp typography。
- 语言：所有用户可见 UI 为简体中文；股票代码、枚举和金融单位可保留英文。
- 主题：先生成 light theme；需要 dark theme 时使用本文给出的 Dark Variant 补充句。
- 密度：ChatGPT clarity + Bloomberg information density，但用 progressive disclosure 控制，不做数据墙。
- 图标：统一细线几何图标，16–20px；禁止 emoji、真人头像和 3D 图标。
- 字体：中文类似 PingFang SC / Microsoft YaHei；英文类似 Inter；金融数字类似 JetBrains Mono。

### 0.2 全局视觉 DNA（附加到每个 Prompt）

```text
Use the FinQuant Hub Design System visual language: calm premium fintech, quiet intelligence, professional financial credibility, transparent evidence, local-first trust, and human-controlled AI. Use a warm light gray page background #F5F7FA, clean white surfaces, subtle blue-gray 1px borders, primary AI blue #315EFB, deep teal secondary #176B73, restrained shadows only for floating layers, 12px card radius, 8px spacing system, crisp Chinese typography, tabular monospaced financial numbers, and generous but efficient whitespace. Use evidence colors only in small chips: FACT blue #2563EB, INFERENCE amber #B8640A, MODEL_OUTPUT violet #7557C8, UNKNOWN gray #667085. For price direction use the Chinese-market convention red up and green down, always paired with plus/minus signs and arrows. Never use color alone to communicate status.
```

### 0.3 全局 Negative Prompt

```text
No marketing landing page, no hero illustration, no crypto exchange style, no Web3 visuals, no neon blue-purple gradients, no glowing robot, no glassmorphism, no cyberpunk, no pure-black Bloomberg clone, no giant KPI wall, no casino-like red and green, no candlestick chart dominating the screen, no order book, no buy/sell trading buttons, no fake profit celebration, no 3D icons, no emoji, no cartoon agents, no excessive rounded pill buttons, no unreadably tiny text, no lorem ipsum, no English-only UI, no mobile phone mockup, no perspective device frame, no collage of multiple screens, no random charts without labels, no invented live-data claims.
```

### 0.4 中文可读性校正句

如果模型生成乱码，在 Refinement 中追加：

```text
Prioritize legible Simplified Chinese UI copy. Render fewer labels but make every visible label correct and sharp. Keep each Chinese sentence short. Do not replace Chinese with gibberish or lorem ipsum. Use these exact labels where specified.
```

---

# Screen 1 — Workbench Homepage / 工作台首页

## 1. 页面名称

**Workbench Homepage — AI-first 投资研究启动台**

## 2. 生图 Prompt

```text
Create a 16:9 high-fidelity desktop web application screen for “FinQuant Hub”, a Chinese AI-native investment research operating system. This is the first screen after opening the local-first product. It must feel like an intelligent research partner, not a financial dashboard or trading terminal.

Build a desktop app shell with a 240px left sidebar, a calm top area, and a spacious central workbench. The expanded sidebar shows the FinQuant Hub wordmark at the top and five task-oriented navigation groups with thin line icons: “工作台” selected, “研究”, “策略”, “组合”, “工作区”. Keep system settings quiet at the bottom with “本地模式”, a model status, theme control, and notification icon. The selected item uses a soft AI-blue background and a thin blue left indicator.

In the main content, the primary visual focus is a large centered AI CommandBar, 880px wide and 64px tall, with the exact Chinese placeholder “今天想研究什么？”. Above it show a warm, restrained greeting: “早上好，今天从哪个问题开始？”. Under it show three small example task chips: “研究贵州茅台的长期价值”, “比较宁德时代与比亚迪”, “我的组合最近有什么风险？”. The CommandBar has a subtle blue focus ring, a context icon, a keyboard hint “Ctrl K”, and one compact blue send button. Do not make it a search-only field; it is the core AI task entry.

Below the CommandBar create a slim Market Pulse strip with three indices: “上证指数”, “深证成指”, “创业板指”, each with price, signed percentage, a very small sparkline, and an explicit timestamp “截至 14:30 · 演示数据”. Add a restrained market sentiment label “市场温度：中性”. Use Chinese-market red-up and green-down only next to signed price changes.

Below that use a 12-column grid. On the left eight columns, create the module “今日值得研究” with exactly three compact research invitation cards. Each card includes a company name and ticker, a one-sentence reason beginning with “为什么值得看：”, one small evidence chip, a signal-strength text label, and the action “进入研究”. Use realistic but clearly marked demo content, not a ranking leaderboard. On the right four columns, create “决策收件箱” with three DecisionCards: one risk review, one thesis-change review, one monitoring confirmation. Each card says what needs a decision, why now, evidence quality, and a precise action such as “查看论文变化”.

At the bottom, show a quiet “继续研究” list and a compact “自选股票” table with six rows. If a portfolio summary is shown, make it a small secondary module called “组合风险摘要”, not a huge profit tile. Use a visible but low-priority status message “部分数据可用” with a link “查看来源状态”.

The information hierarchy must be obvious: CommandBar first, market context second, research invitations and human decisions third, personal history last. Use Simplified Chinese labels, quiet premium fintech styling, evidence transparency, and no promotional illustration.
```

## 3. 风格要求

- 明亮主题、安静高级、克制的蓝灰底。
- 首页不是监控大屏；留白比普通 Dashboard 更多。
- AI 感来自 CommandBar、上下文和任务流，不来自发光渐变。
- 数据模块保持 Bloomberg 式信息效率，但文字不低于 13px。
- 推荐卡是“研究邀约”，不是热门股排行榜。

## 4. 布局要求

- 240px 展开 Sidebar；顶部区域 64px。
- Hero CommandBar 最大宽 880px，高 64px，页面首要焦点。
- Market Pulse 单行通栏，高度约 72px。
- “今日值得研究”与“决策收件箱”按 8/4 栅格并排。
- 底部个人模块按 7/5 栅格；超出首屏的专业信息折叠。

## 5. 必须出现元素

- “今天想研究什么？”
- 三个自然语言示例任务。
- 上证/深证/创业板及 as-of 时间。
- 三张“今日值得研究”卡。
- Decision Inbox，至少包含风险、论文变化、待确认三类。
- FACT/INFERENCE/UNKNOWN 中至少两种 EvidenceChip。
- 本地模式状态；不突出模型工程信息。

## 6. 禁止出现元素

- 七八个同尺寸 KPI 大卡。
- 模型数、会话数、消息数等系统统计作为首屏重点。
- 涨停榜、收益榜、买入/卖出按钮、倒计时。
- 大面积中国地图、炫光大屏、黑底终端。
- AI 机器人或星光魔法图标。

## 7. Refinement Prompt

```text
Refine the Workbench screen so the AI CommandBar becomes the unmistakable primary focus. Reduce the visual weight of all financial modules by 20%. Keep only three research invitation cards and three decision items. Increase Chinese body text to at least 14px and table text to 13px. Add clear as-of timestamps and evidence chips. Remove any decorative gradient, giant KPI, trading CTA, or system-engineering statistic. Make the page feel calmer, more editorial, and more like an AI research desk.
```

## 8. Dark Variant

```text
Create the same Workbench layout in a calm dark theme using a blue-gray-black page background #0E131A, raised surfaces #161D27, borders #344252, and off-white text #EDF2F7. Do not use pure black, neon glow, or terminal-green text. Preserve all evidence colors and readable Chinese-market price direction.
```

---

# Screen 2 — AI Research Workspace / AI 研究工作区

## 1. 页面名称

**AI Research Workspace — 三栏连续研究工作面**

## 2. 生图 Prompt

```text
Create a 16:9 high-fidelity desktop UI for the core screen of FinQuant Hub: “AI 研究工作区”. This is a continuous research surface that combines AI conversation, multi-agent execution, structured research artifacts, evidence, thesis, and follow-up actions. It should feel like ChatGPT clarity plus Linear structure plus Bloomberg-grade evidence density, without looking like a trading terminal.

Use the FinQuant app shell with a collapsed or quiet 64px global sidebar and a sticky 64px top bar. In the top bar place an inline CommandBar, 48px tall, with a context chip “贵州茅台 600519 · 研究” and the exact placeholder “继续问关于贵州茅台的问题…”. Show a small task state “研究进行中” and a visible stop control.

Inside the main workspace create a precise three-column layout. Left column “Research Context” is 264px wide. It contains “+ 新研究”, search and filter controls, and a project tree with “贵州茅台研究” selected, followed by “宁德时代”, “英伟达”, and one archived project. The selected project expands into a vertical research timeline: “问题”, “报告”, “证据”, “论文”, “监控”. Show a small unresolved-decision dot but no loud badge.

The center column is the widest, minimum 600px, titled “贵州茅台是否值得长期持有？”. Add a TaskPageHeader with research goal, status, and “数据截至 2026-08-20 · 演示数据”. Show a clean AI conversation with user and AI messages, but avoid oversized chat bubbles. The AI first restates the goal and then shows a compact research plan. Embed a group of four AgentStatusCards directly in the flow: “商业模式分析师” completed, “财务分析师” completed, “行业研究员” running, “风险评估师” waiting. Each card shows a business-language stage and real discrete status, not a fake percentage.

Below the agent group show a partially completed ResearchArtifact card titled “研究报告 · 贵州茅台”. Its top summary says “盈利质量稳定，但当前估值缺少足够安全边际” and includes three small evidence chips: FACT, INFERENCE, and UNKNOWN. Show a visible partial-data note: “新闻源暂不可用；财务与行情证据可查看”. Include a compact action row: “查看报告”, “发起投委会”, “保存为论文草稿”. Keep “加入组合” secondary and label it as a draft/record action, never as trading.

At the bottom of the center column use a sticky conversation composer with the exact placeholder “追问、补充条件或引用当前证据…”, plus buttons for attach context, send, and stop. The composer should not duplicate the global CommandBar visually.

The right column “Artifacts” is 376px wide with tabs “概览”, “报告”, “证据”, “论文”. The active “概览” tab shows one conclusion card, three key findings, one risk list, and next actions. Each finding has a clickable EvidenceChip and source timestamp. Also show a small collapsed section “查看方法与工具记录” for professional users. A selected evidence row should visually connect to the matching sentence in the center column.

Use a restrained light theme, thin panel dividers, adjustable column handles, 12px radius cards, and clear focus states. The visual hierarchy must show the conversation as the narrative, agents as transparent process, and artifacts/evidence as durable output. All user-facing labels are Simplified Chinese.
```

## 3. 风格要求

- 三栏像专业研究 IDE，但不做代码编辑器皮肤。
- 对话舒展，Artifact 密度更高，右栏最紧凑。
- Agent 角色专业、克制，用线性头像或几何 monogram，不用人物插画。
- EvidenceChip 小而清晰；UNKNOWN 与 PARTIAL 必须可见。
- AI streaming 使用语义块，不画一大串逐字光标。

## 4. 布局要求

- Research Context 264px / AI Conversation 自适应 / Artifacts 376px。
- 中栏正文最大阅读宽约 760px，Composer 底部 sticky。
- 左右栏都可折叠，边界有细拖拽 handle。
- 顶部 CommandBar 保留当前标的上下文。
- 右栏 Tabs 与中栏引用双向对应。

## 5. 必须出现元素

- 三栏标题：Research Context、AI Conversation 语义、Artifacts。
- 四个 AgentStatusCard，覆盖 Completed、Running、Waiting。
- ResearchArtifact 卡片。
- FACT、INFERENCE、UNKNOWN EvidenceChip。
- Partial Data 文案和 as-of 时间。
- “发起投委会”“保存为论文草稿”等精确动作。
- 停止控制和底部追问 Composer。

## 6. 禁止出现元素

- 把 13 章全文全部铺在聊天流里。
- 复杂 Agent 网络拓扑或 DAG 大图。
- “85% 一定上涨”“AI 推荐买入”等确定性文案。
- 角色动漫头像、彩色 emoji、机器人。
- 右栏全是 debug log；工具详情必须折叠。
- 三栏宽度相等或文本被压到很窄。

## 7. Refinement Prompt

```text
Refine this AI Research Workspace for stronger hierarchy. Keep the center conversation calm and readable, make the right Artifacts panel denser, and reduce chat-bubble decoration. Ensure all four agent states are legible and use business-language progress. Show FACT, INFERENCE, and UNKNOWN as small semantic chips with source times. Make the partial-data state explicit without turning the whole screen into an error. Preserve a visible stop action and a human-confirmed next-step flow.
```

---

# Screen 3 — Portfolio Center / 组合中心

## 1. 页面名称

**Portfolio Center — AI 投资管家与风险复核中心**

## 2. 生图 Prompt

```text
Create a 16:9 high-fidelity desktop UI screen for “组合中心”, the AI portfolio butler inside FinQuant Hub. The core question is “我的组合发生了什么，我还该不该拿着，哪些事情需要我复核？”. It must feel calm, evidence-led, and human-controlled, not like a brokerage trading screen.

Use the FinQuant app shell and a light premium fintech theme. At the top of the content place a portfolio selector “长期价值组合” with a clear type badge “持仓记录 · 非交易账户”, an as-of timestamp, and an inline CommandBar with placeholder “问 AI 我的组合发生了什么…”. Include a quiet data-quality state “行情 OK · 1 项 FX 未知”.

The first row contains exactly four restrained FinancialMetric components, not giant KPI tiles: “总市值”, “本期收益”, “最大回撤”, “风险状态”. Use tabular monospaced numbers, explicit units, period labels, and source time. Show one price/return change using Chinese-market red-up or green-down with plus/minus sign. Show maximum drawdown as risk semantics with a shield icon, not only red color. If FX is missing, show “部分未知” rather than inventing a total.

Below, use an 8/4 grid. On the left show “持仓与贡献” as a clean table with columns: 标的, 权重, 本期贡献, 论文状态, 数据质量. Include four realistic demo holdings and one row with an UNKNOWN chip. On the right create “AI 组合简报”, an editorial card with three short sections: “发生了什么”, “为什么重要”, “需要你决定”. Include one concentration-risk warning, one thesis-drift item, and one opportunity to research. Every item has a source link or EvidenceChip.

Below that add tabs: “总览”, “持仓”, “风险”, “论文变化”, “预警”, “模拟复盘”. The active tab is “风险”. Show a wide risk breakdown with a correlation heatmap, concentration bars, currency/market exposure, and one stress scenario chart. Charts are restrained, clearly labeled, and accompanied by a short text summary. Show a DecisionCard on the right saying “是否创建每周集中度监控？” with evidence quality, frequency, and the precise action “确认创建监控”. Do not include any order ticket.

Visually distinguish a secondary Paper Portfolio entry with a clearly different badge “Paper 模拟”, muted border style, and copy “不连接真实账户”. All AI suggestions are proposals with actions “查看证据”, “发起投委会”, or “创建草稿”. Never show direct buy, sell, rebalance, or execute buttons.
```

## 3. 风格要求

- 风险与论文变化优先于当日盈亏刺激。
- FinancialMetric 无大面积彩底，数字稳定、等宽、口径可见。
- 图表有 Bloomberg 的信息密度，但采用 Stripe 式干净框架。
- AI Brief 像研究编辑摘要，不像聊天气泡。
- Paper 模拟与真实持仓记录永久可区分。

## 4. 布局要求

- 顶部选择器 + CommandBar + as-of。
- 四个核心 Metric 同行，不超过四个。
- 持仓/贡献 8 栏，AI Brief 4 栏。
- 风险 Tab 下图表 8 栏，DecisionCard 4 栏。
- 图表下必须配文字摘要与来源。

## 5. 必须出现元素

- “持仓记录 · 非交易账户”。
- “行情 OK · 1 项 FX 未知”或同等质量状态。
- 总市值、本期收益、最大回撤、风险状态。
- 持仓表、AI 组合简报、风险 Tab。
- 相关性/集中度/暴露中的至少三类风险视图。
- Human confirmation DecisionCard。
- Paper 模拟的明确边界。

## 6. 禁止出现元素

- 买入、卖出、撤单、盘口、委托价格。
- 夸张收益动画、奖杯、收益排行榜。
- 绿色等同“安全买入”、红色等同“必须卖出”。
- 缺 FX 时仍显示精确总市值。
- 把模型置信度写成盈利概率。

## 7. Refinement Prompt

```text
Refine the Portfolio Center to feel more like a calm AI risk steward and less like a broker. Reduce the visual dominance of profit numbers, elevate thesis changes and risk explanations, keep four metrics only, and add explicit period, as-of, and data-quality labels. Make the Paper Portfolio boundary unmistakable. Remove every trading action and replace it with evidence review, committee review, monitoring draft, or human confirmation.
```

---

# Screen 4 — Investment Committee / AI 投资委员会

## 1. 页面名称

**Investment Committee — 可审计的 AI 投资会议室**

## 2. 生图 Prompt

```text
Create a 16:9 high-fidelity desktop product UI for “AI 投资委员会” inside FinQuant Hub. This screen turns multi-agent discussion into a disciplined investment committee with an agenda, expert viewpoints, evidence, rebuttals, votes, unresolved disagreement, and a chair summary. It must feel serious and auditable, never theatrical or gamified.

At the top show a compact agenda header: “议题：宁德时代当前估值是否提供足够安全边际？”, a linked research version, data as-of timestamp, meeting state “交锋阶段”, and a quiet elapsed time. Include controls “暂停会议” and “补充问题”. Do not show a start button if the meeting is already in progress.

Use a three-area layout. Left role rail is 208px wide with five professional geometric line avatars and exact Chinese role names: “行业分析官”, “财务分析官”, “价值投资官”, “技术分析官”, “风险官”. Each row has Waiting, Running, Completed, or Failed status using a small dot plus text. Avoid emoji and human photos.

The center is the main meeting timeline. Organize content into labeled rounds: “第一轮 · 独立观点”, “第二轮 · 风险挑战”, “第三轮 · 回应”. Show structured viewpoint cards, each containing a one-sentence position, a short rationale, confidence labeled “模型自评置信度”, and two EvidenceChips. Show a visible rebuttal relationship: the risk officer challenges a specific valuation assumption, and the value officer responds. Use a thin connector and the label “回应风险官的挑战”, not a complex network graph.

The right panel is 360px wide with tabs “证据”, “投票”, “未决问题”. In the active “证据” tab show the currently selected claim, source, as-of, FACT and MODEL_OUTPUT chips, and one UNKNOWN item. Below it show a compact vote matrix with five rows: 立场, 置信度, 核心理由. Use text labels “看多 / 中性 / 看空”; color is secondary. The vote must not look like a buy signal.

At the bottom of the main timeline show a partially visible chair-summary ResearchArtifact titled “主席总结（草稿）”. It has sections “共识”, “关键分歧”, “成立前提”, “使结论失效的条件”, and “需要用户决定”. Provide precise next actions: “保存为会议纪要”, “生成论文草稿”, “创建监控草稿”. No action executes a trade or changes a portfolio automatically.

Use calm premium fintech styling, fine borders, editorial spacing, and subtle role identity colors. The screen should look like Linear issue structure combined with Notion documents and Bloomberg evidence rigor.
```

## 3. 风格要求

- 严肃会议，不做角色扮演舞台。
- 头像为统一线性符号或 monogram，不用 emoji/真人/动漫。
- 观点卡像结构化研究便笺，不像社交聊天气泡。
- 反驳关系清晰但克制；不做蜘蛛网图。
- 票数不是最终结论，主席总结同时保留少数意见。

## 4. 布局要求

- 顶部议程通栏。
- 左侧角色 Rail 208px；中间会议时间线；右侧 Evidence/Vote 360px。
- 底部或中栏末尾为主席总结 Artifact。
- Meeting Controls sticky 且不遮挡证据内容。

## 5. 必须出现元素

- 五个常设角色与状态。
- 至少三轮结构：观点、挑战、回应。
- EvidenceChip、具体来源和 as-of。
- 明确的反驳/回应关系。
- 五行投票矩阵与“模型自评置信度”。
- 主席总结的共识、分歧、前提、失效条件。
- 保存纪要/论文草稿/监控草稿动作。

## 6. 禁止出现元素

- 圆桌照片、虚拟人物、动漫头像、emoji。
- 辩论综艺效果、夸张对话框、红蓝阵营对抗。
- “4:1 买入”作为大标题。
- 投票直接触发组合或交易动作。
- 隐藏风险官少数意见。

## 7. Completed-state Refinement Prompt

```text
Transform the same Investment Committee screen into the completed state. Make the chair-summary artifact the primary focus while preserving the full voting rationale and risk-officer dissent. Clearly separate consensus, disagreement, assumptions, falsification triggers, and user decisions. Show “会议已完成 · 部分新闻证据不可用” as a calm partial-quality state. Keep all outputs as drafts until the user explicitly saves them.
```

---

# Screen 5 — Strategy Lab / 策略实验室

## 1. 页面名称

**Strategy Lab — 可复算的量化策略实验室**

## 2. 生图 Prompt

```text
Create a 16:9 high-fidelity desktop UI for “策略实验室” in FinQuant Hub, an AI-native but human-controlled quantitative research workspace. The screen helps a Chinese investor turn a clear hypothesis into a bounded MA crossover backtest, inspect assumptions, understand failures, and compare results. It is an experiment lab, not a strategy-profit vending machine.

Use the FinQuant app shell and a restrained light premium fintech theme. At the top show a TaskPageHeader with the exact title “策略实验室”, subtitle “验证投资想法是否经得起历史检验”, and a context badge “有限策略能力 · 不生成代码 · 不执行交易”. Add an inline CommandBar with the exact example input “贵州茅台 MA20 上穿 MA50 后买入，下穿后退出”. Below it show a parsing status strip with four steps: “已识别标的”, “已识别规则”, “参数待确认”, “尚未运行”.

Use a 4/8 column layout. Left 4 columns are the Strategy Setup panel. In the default quick mode show only three primary inputs: “标的”, “日期范围”, “均线窗口”. Add a segmented control “快速模式 / 专业模式”, with quick mode selected. Below, a collapsed section “高级设置” lists hidden categories: initial capital, commission, slippage, stamp duty, benchmark, and drawdown stop. Add an experiment-review box summarizing execution semantics: “日线收盘信号 → 下一交易日开盘执行 · 仅多头 · 演示数据”. The main button says “检查并运行回测”, not “AI 优化收益”.

Right 8 columns are the Experiment Canvas. At the top show a completed BacktestSummary with exactly four FinancialMetric components: “年化收益”, “相对基准”, “最大回撤”, “夏普比率”. Every metric has period, definition, as-of, and evidence/method access. Use Chinese-market red-up and green-down only for signed returns; keep Sharpe and valuation neutral.

Below show a clean combined chart area with tabs “权益曲线”, “回撤”, “交易点”, “稳健性”. The active view compares strategy and benchmark with clearly labeled lines; underneath include a compact text interpretation: “收益主要来自 3 个趋势区间；样本外稳定性仍需验证”. Add a small MODEL_OUTPUT chip and CitationDetails link. Do not let the chart dominate the whole page.

At the bottom show two panels. Left: “实验诊断” with one warning about sample length and one note about transaction costs. Right: “历史版本” with three saved experiments and changed-parameter highlights. Add secondary actions “保存实验”, “复制参数”, “与上次版本比较”, “从论文返回”. Show a visible note “历史回测不代表未来收益”.

All user-facing UI must be Simplified Chinese, with crisp tabular financial numbers and calm evidence-led visual hierarchy. Make the setup understandable to ordinary users while keeping advanced methods discoverable.
```

## 3. 风格要求

- 实验假设和执行口径先于结果数字。
- 参数面板像 Linear/Stripe 的清晰表单，不像量化终端配置墙。
- 图表高密度但克制，有文字解释和 Evidence 链接。
- 收益、回撤、夏普不可用同一红绿色轴判断好坏。
- “快速/专业”是同一页面渐进披露，不切换成另一套 UI。

## 4. 布局要求

- 顶部 TaskPageHeader + 自然语言策略输入 + 解析步骤。
- 左 4 栏 Setup，右 8 栏 Experiment Canvas。
- 右侧依次为 Metric、图表、解释、诊断/版本。
- 高级参数折叠；运行前摘要始终可见。

## 5. 必须出现元素

- “有限策略能力 · 不生成代码 · 不执行交易”。
- MA20/MA50 示例与四步解析状态。
- 快速模式三个输入；高级设置折叠。
- “检查并运行回测”。
- 年化收益、相对基准、最大回撤、夏普比率。
- 权益曲线/回撤/交易点/稳健性 Tabs。
- MODEL_OUTPUT、CitationDetails、实验诊断、历史版本。
- “历史回测不代表未来收益”。

## 6. 禁止出现元素

- 自动生成任意代码、Python 编辑器、策略部署按钮。
- “一键盈利”“最佳参数”“AI 自动交易”。
- 只展示总收益，不展示回撤、成本、基准和样本。
- 十多个参数默认全部展开。
- 彩色霓虹权益曲线或老虎机式数字动画。

## 7. Failure-state Refinement Prompt

```text
Create the same Strategy Lab in a failed backtest state caused by insufficient price history. Preserve all user inputs and the experiment definition. Replace the result metrics with an “实验未运行完成” explanation panel that ranks the root cause first, says “可用历史不足以覆盖 MA50 与验证窗口”, and offers precise actions “缩短均线窗口”, “扩大日期范围”, and “查看数据来源”. Do not display fake zeros or empty charts. Keep the failure calm, educational, and recoverable.
```

---

# 6. 组件特写可选 Prompt

以下提示词可用于让 Image Model 输出 Design System component sheet，而不是页面图。每次只生成一组组件。

## 6.1 Evidence System Component Sheet

```text
Create a clean high-fidelity design-system component sheet on a neutral background for FinQuant Hub. Show EvidenceChip variants FACT, INFERENCE, MODEL_OUTPUT, UNKNOWN in default, hover, focus, selected, stale, partial, and upstream-error states. Next to them show one 440px EvidenceDrawer with a normal-user summary layer and an expanded professional layer containing provider, as-of, calculation, lineage, and a redacted tool log. Use Simplified Chinese labels, 8px spacing, 12px card radius, thin borders, accessible focus rings, and no emoji. Clearly separate evidence type from quality state.
```

## 6.2 AI Execution Component Sheet

```text
Create a FinQuant Hub AI execution component sheet showing CommandBar states: home idle, contextual idle, focused search, clarifying, executing, partial error, and offline. Also show AgentStatusCard variants Waiting, Running, Completed, Failed, and Cancelled. Use business-language Chinese progress text, discrete steps instead of fake percentages, visible stop actions, calm AI-blue accents, and reduced-motion-friendly visual cues.
```

## 6.3 Finance Component Sheet

```text
Create a premium FinQuant Hub financial component sheet showing FinancialMetric examples for return, PE TTM, ROE, maximum drawdown, Sharpe ratio, unknown data, stale data, and partial FX data. Show comfortable and compact density. Use tabular monospaced numbers, explicit units, periods, as-of times, and evidence access. Apply Chinese-market red-up and green-down only to signed price or return changes. Keep PE, ROE, and Sharpe neutral. No giant colored KPI tiles.
```

---

# 7. Image Model 验收清单

每张生成图必须逐项检查：

1. 是否是单张完整桌面应用界面，而非落地页、设备模型或多屏拼贴。
2. 是否以简体中文为主，关键标题与按钮是否可读。
3. 是否能在 3 秒内看出页面主任务。
4. 是否存在清晰的 Summary → Evidence → Method 层级。
5. 是否同时表达 Evidence 类型和数据质量，而不是只用一个颜色标签。
6. 是否出现 as-of 时间、期间或“演示数据”。
7. 是否遵守 A 股红涨绿跌，且方向有正负号/箭头辅助。
8. 是否避免买卖、下单、自动交易和收益承诺。
9. 是否存在停止、查看证据或人类确认等 AI Native 控制。
10. 是否有 L1 可理解的主层，同时让专业细节保持可发现。
11. 是否避免霓虹、机器人、玻璃拟态、纯黑终端和巨型 KPI 数据墙。
12. 是否能对应 `FinQuant_Design_System_v1.md` 中的 token、布局与组件树。

如果 1、4、6、8、9 中任一项失败，应重新生成而不是在错误方向上继续微调。

---

## 结论

这套 Prompt Pack 的目的不是让模型“画一个漂亮金融后台”，而是稳定生成同一产品世界中的五个核心研究场景：工作台负责启动，研究工作区负责思考与产出，组合中心负责持续守护，投资委员会负责挑战与裁决，策略实验室负责历史验证。所有页面共享同一种安静、可审计、由人控制的 AI 体验。
