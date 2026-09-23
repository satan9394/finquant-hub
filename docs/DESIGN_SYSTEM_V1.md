# FinQuant Hub Design System v1.0

> 版本：1.0  
> 日期：2026-08-20  
> 适用对象：Product Designer、UX Writer、Figma Designer、Frontend Engineer、AI Product Engineer  
> 产品形态：Desktop-first、Local-first、AI-native 投资研究操作系统  
> 设计目标：让用户感到“有一位可靠的 AI 投资伙伴与我共同研究”，而不是“面前摆着一箱金融工具”。

---

## 0. 使用方式与边界

这份文档是 FinQuant Hub 下一代界面的视觉与交互事实源。它把《FinQuant Product Map》《FinQuant AI Native Product Blueprint》《FinQuant UI Product Spec》《FinQuant Frontend Component Inventory》中已经确认的产品方向，收敛成可执行的 Design System v1。四份资料中存在的尺寸或命名差异，以本文的 v1 token 为准；架构、数据、权限与执行能力仍以仓库架构文档和 API 合同为准。

Design System v1 不重新发明已有能力。前端继续基于 React 18、Ant Design 5、ProLayout、Zustand、统一 API/SSE 管道与现有图表库；优先复用 `TaskPageHeader`、`ResultLayer`、`CitationDetails`、`ResearchTimeline`、`StrategySetup`、`BacktestSummary` 等成熟原语。新组件是对既有模式的收敛，不是另起一套平行 UI。

本系统的产品红线：不把 AI 判断包装成事实；拿不到数据时保留 `UNKNOWN`、`PARTIAL` 或 `UPSTREAM_ERROR`；不把一次季度数据伪装成 TTM；不把模拟组合包装成真实账户；不提供或暗示真实交易执行；任何保存观点、启用监控、应用参数、建立模拟持仓等有后果的动作，都需要用户显式确认。

### 0.1 北极星体验

用户提出一个模糊问题后，系统应连续完成以下体验，而不是把用户丢进多个页面：

1. 理解目标：识别标的、时间范围、研究意图与缺失条件。
2. 编排研究：选择快速问答、深度研究、有限策略解析或投委会等合适路径。
3. 暴露过程：告诉用户谁在工作、用了什么数据、哪里失败、何时可以先看部分结果。
4. 形成资产：把对话输出变成报告、证据、投资论文、策略或组合观察，而非只留下一段聊天文本。
5. 推动决策：给出风险、机会与待确认项，但不替用户做最终投资决定。
6. 持续跟踪：研究结论进入版本、监控和复盘，不因会话结束而消失。

### 0.2 统一信息语法

所有研究、策略与组合结果都遵循相同阅读次序：

**结论 Summary → 证据 Evidence → 方法 Method → 影响 Impact → 用户动作 Human Action**。

结论回答“发生了什么”；证据回答“凭什么”；方法回答“怎么算的”；影响回答“与我的研究或组合有什么关系”；动作回答“现在需要我确认什么”。如果证据不足，结论区必须直接显示不确定性，不能等用户展开方法区后才发现结果不可用。

---

# 第一部分：Design Philosophy

## 1.1 AI First

### 设计含义

AI First 不是在每页放一个聊天气泡，也不是把导航换成自然语言。它意味着用户从“想完成什么”开始，系统负责理解意图、选择工具、组织信息和延续上下文。页面是 AI 工作过程和研究资产的投影，而不是要求用户预先知道该去“研究”“比较”“回测”还是“讨论”。

AI 是界面的主叙事者：它先复述目标、说明计划、暴露限制，再持续交付可检查的中间成果。用户始终能修改范围、暂停、停止、追问或转成其他研究资产。

### UI 体现

- `CommandBar` 是全站首要入口，placeholder 随上下文变化，并保留当前标的、组合或策略语境。
- 首页首先展示“今天想研究什么”，而不是系统统计、模型数量或七块数据墙。
- 研究过程中用 `AgentStatusCard` 和简洁阶段文案表达进度；默认展示业务动作，如“正在核对财务质量”，不展示内部类名。
- AI 回复中的关键产出自动成为 `ResearchArtifact`，可保存、引用、版本化和进入下一步。
- 页面底部或产出卡尾部提供语境相关动作：创建论文、发起投委会、加入自选、创建监控、带入策略实验室。

### 反例

- 首页仍以 18 个路由和大量 KPI 作为第一屏，只在角落增加“AI 助手”。
- 要求用户先选择技术管线、模型、Agent 数量，才能提出问题。
- AI 输出一长段文字后没有证据、状态、可保存对象或下一步。
- 把“模型正在思考”伪装成确定事实，或展示无法解释的神秘百分比进度。

## 1.2 Progressive Disclosure

### 设计含义

渐进披露不是三套产品，也不是把高级能力做成付费墙。它是在同一数据、同一任务和同一页面结构中，按用户当前目标与熟练度逐层释放复杂度。默认给足完成任务所需的信息；专业细节始终可发现、可展开、可回到简洁状态。

### UI 体现

- Level 1 显示结论、风险、最关键证据和下一步；Level 2 增加证据链、投资论文与风险指标；Level 3 增加计算过程、工具日志、因子暴露和实验诊断。
- 使用折叠区、抽屉、详情 Tab、密度偏好与“查看方法”链接，不复制路由。
- 专业术语第一次出现时提供一句人话解释；同一解释不反复打扰。
- 高级参数默认使用经审计的预设，展开后显示当前值、影响和恢复默认值操作。
- 解锁来自真实行为里程碑，用户也能随时手动切换或临时查看专业层。

### 反例

- 把新手模式做成阉割版，导致用户无法完成研究到跟踪的闭环。
- 用一大段 onboarding 强迫用户在使用前学习所有功能。
- 默认展开 13 章报告、Agent DAG、provider 字段和完整 tool log。
- L1、L2、L3 分别维护三套页面，出现数据与交互漂移。

## 1.3 Evidence First

### 设计含义

在金融研究中，表达质量不等于事实质量。每个会影响判断的数字、事实、计算结果和推断都必须带证据类型、来源时点与质量状态。证据不是报告末尾的脚注，而是伴随结论出现、可一键下钻的第一公民。

### UI 体现

- 每个重要论断旁使用 `EvidenceChip` 标记 `FACT`、`INFERENCE`、`MODEL_OUTPUT` 或 `UNKNOWN`。
- `EvidenceDrawer` 默认显示来源、截至时间、质量和一句解释；专业层再展开 provider、期间、公式、输入引用与工具日志。
- 来源失败保留已经成功的局部结果，并明确显示 `PARTIAL` 或 `UPSTREAM_ERROR`。
- 图表、表格和 `FinancialMetric` 都提供 as-of、口径、币种/单位与是否复权；缺失值显示“未知”，不用 `0`、`--` 或估算值混淆。
- 报告结论与证据双向定位：点结论可看到证据，点证据可回到使用它的论断。

### 反例

- 在正文顶部给出“85% 看多”，来源藏在报告末尾。
- 把 AI 解释、模型计算和市场事实全部染成同一种“可信蓝”。
- 上游失败后用相似标的、单季度值或模型猜测补空。
- 只有专业用户才能知道数据时间，普通用户看到的数字像实时事实。

## 1.4 Trust Before Automation

### 设计含义

自动化必须先让用户理解范围、依据、频率、失败方式和停止方法。FinQuant Hub 可以主动准备研究、发现变化、生成建议和草拟动作，但不能在用户不知情时改变观点、参数、监控或组合状态。信任来自可预测与可撤销，而不是来自“全自动”的营销感。

### UI 体现

- 启动前显示将做什么、使用哪些数据、预计阶段和哪些条件仍需确认。
- 执行中显示当前阶段、已完成产物、失败项、暂停/停止入口；取消不会删除已完成证据。
- 自动生成内容标明“草稿”；只有明确按钮才能变成已保存论文、监控规则或模拟组合记录。
- 每个计划性任务显示频率、下次运行、最近一次结果和关闭入口。
- 失败用可行动语言解释：“新闻源超时，财务与行情结论仍可查看”，而不是通用红色 Error。

### 反例

- 打开页面就自动运行昂贵深研，或在后台修改策略参数。
- 用“AI 已优化你的组合”描述一个未经确认的建议。
- 停止按钮只停止动画，不终止任务；重试会悄悄创建重复任务。
- 用漂亮完成动画掩盖部分数据缺失。

## 1.5 Human Decision Control

### 设计含义

AI 负责扩大信息覆盖和挑战偏见，人负责定义目标、接受风险和确认有后果的状态变化。界面必须把“建议”“草稿”“已确认”“已执行”分开，不用视觉语言诱导用户把模型置信度当成投资确定性。

### UI 体现

- `DecisionCard` 说明需要决定什么、为什么现在需要、如果不处理会怎样、证据质量如何。
- 主按钮使用“确认创建监控”“保存为论文”“应用到表单”，禁止笼统写“执行 AI 建议”。
- 高影响确认采用两阶段：先检查摘要与变化，再确认；确认后提供可追踪记录与合理撤销。
- 投资委员会输出共识、分歧、关键前提与反证，不把多数票直接变成买卖信号。
- 所有组合动作都明确属于真实持仓记录、Paper Portfolio 模拟，还是只读建议；三者不可用相同 CTA。

### 反例

- “接受”按钮直接触发真实交易或不可逆写入。
- 隐藏风险官的少数意见，只突出 4:1 投票结果。
- 把模型置信度显示成“成功概率”。
- 用默认勾选让用户无意中启用持续监控或分享。

---

# 第二部分：品牌视觉系统

## 2.1 品牌定位

FinQuant Hub 的视觉人格是“安静、严谨、清醒的研究伙伴”。专业金融可信度来自一致的数字口径、证据标注与信息秩序；AI 未来感来自连续协作、状态透明和快速响应，而不是霓虹、光晕与机器人插画；高级感来自克制的留白、精细边框、稳定排版和少量精准色彩；数据透明来自每个结论都能追到来源与方法。

### 应传递

- **专业金融可信度**：数字对齐、单位明确、时点可见、涨跌语义一致。
- **AI 未来感**：界面像活的研究过程，但动效轻、可停、可解释。
- **安静高级**：低饱和中性色为主，层级靠空间与排版，不靠大面积渐变。
- **数据透明**：证据状态在主流程内，不把不确定性藏进脚注。

### 应避免

- 花哨科技感：蓝紫霓虹、全屏网格、玻璃拟态、发光机器人、无意义粒子。
- 传统终端压迫感：纯黑背景、满屏闪烁行情、过密表格、过小字体、多窗口边框。
- 散户交易软件感：大面积红绿、夸张收益榜、倒计时、晒单、强刺激“买入”按钮。
- 通用 SaaS 感：一堆同尺寸 KPI 卡、空洞 AI 星光图标、没有金融语义的模板化 Dashboard。

### 品牌关键词

`Calm Intelligence`、`Auditable Research`、`Local Trust`、`Human Controlled`、`Quiet Precision`。

## 2.2 色彩原则

颜色承担语义，不承担装饰。一个组件同时出现“涨跌”“风险”“证据”“任务状态”时，优先级依次是：数字旁表达涨跌；风险用图标、标题和文字；证据用 Chip；任务状态用状态点。任何语义不能只靠颜色表达。

### 2.2.1 品牌与界面基础色

| Token | 名称 | Light HEX | Dark HEX | 用途 | 示例 |
|---|---|---:|---:|---|---|
| `--fq-ai-primary` | AI 蓝 | `#315EFB` | `#7C9BFF` | 主 CTA、CommandBar 聚焦、AI 当前状态 | “开始研究”按钮、输入框 focus ring |
| `--fq-ai-soft` | AI 蓝浅底 | `#EEF2FF` | `#182443` | AI 标签背景、选中行、轻提示 | “AI 正在整理”状态条 |
| `--fq-secondary` | 深海青 | `#176B73` | `#58C0C7` | 次级强调、研究连续性、组合健康 | 研究时间线连线 |
| `--fq-bg-page` | 页面底色 | `#F5F7FA` | `#0E131A` | App 全局背景 | 主内容画布 |
| `--fq-bg-subtle` | 次级底色 | `#F0F3F7` | `#151C25` | 分区、hover、表头 | 证据抽屉分组 |
| `--fq-surface-1` | 主表面 | `#FFFFFF` | `#161D27` | 卡片、面板、侧栏 | ResearchArtifact |
| `--fq-surface-2` | 浮起表面 | `#FFFFFF` | `#1B2531` | Popover、Drawer、Menu | Command 菜单 |
| `--fq-border` | 默认边框 | `#DCE3EB` | `#344252` | 卡片、表格、分隔 | 1px Card border |
| `--fq-border-strong` | 强边框 | `#B8C3D1` | `#536477` | 选中、可调整面板 | 拖拽分栏边界 |
| `--fq-text-primary` | 主文本 | `#172033` | `#EDF2F7` | 标题、正文、关键值 | 报告结论 |
| `--fq-text-secondary` | 次文本 | `#5C697A` | `#A9B6C5` | 说明、标签、时间 | as-of 时间 |
| `--fq-text-tertiary` | 弱文本 | `#7F8A99` | `#7F90A3` | placeholder、禁用说明 | CommandBar placeholder |
| `--fq-focus` | 键盘焦点 | `#2457F5` | `#9AB0FF` | 2px 外描边 | 所有可交互元素 |

主色使用面积应低于单屏 12%。卡片不使用大面积品牌渐变；只有首页空状态或 AI 执行中的 1px 状态轨道可以使用非常轻的蓝青渐变。

### 2.2.2 证据色

| Token | 类型 | HEX | 图标建议 | 用途与示例 |
|---|---|---:|---|---|
| `--fq-evidence-fact` | FACT / 事实蓝 | `#2563EB` | 圆内勾选或数据库线性图标 | 可由来源直接核验的数据，“毛利率 91.3%” |
| `--fq-evidence-inference` | INFERENCE / 推断琥珀 | `#B8640A` | 分叉箭头 | 基于事实的解释，“估值偏贵” |
| `--fq-evidence-model` | MODEL_OUTPUT / 模型紫 | `#7557C8` | 函数或计算器 | DCF、风险模型、回测计算结果 |
| `--fq-evidence-unknown` | UNKNOWN / 未知灰 | `#667085` | 问号圆 | 缺少可靠来源或无法验证 |

Chip 使用浅色背景、深色文字和 1px 边框。不要把整张卡染成证据色；颜色只标记证据类型，质量 `OK/PARTIAL/UNKNOWN/UPSTREAM_ERROR` 另用文字状态与图标表达。

### 2.2.3 金融、风险与反馈色

| Token | HEX | 金融语义 | 使用边界 |
|---|---:|---|---|
| `--fq-price-up` | `#D9485F` | A 股语境上涨、正收益 | 只用于价格/收益方向，必须配 `+`、上箭头或文本 |
| `--fq-price-down` | `#168A67` | A 股语境下跌、负收益 | 只用于价格/收益方向，必须配 `−`、下箭头或文本 |
| `--fq-opportunity` | `#147D64` | 机会、健康、完成 | 不表示价格上涨，不写“买入” |
| `--fq-risk` | `#D13C3C` | 风险、失败、严重异常 | 必须配风险级别与解释，不与涨幅混用 |
| `--fq-warning` | `#B77905` | 需关注、部分数据、漂移 | 用于 PARTIAL、接近阈值、等待复核 |
| `--fq-info` | `#2E6FB3` | 普通信息 | 使用帮助、状态说明 |
| `--fq-disabled` | `#98A2B3` | 禁用、不可用 | 同时降低对比并显示原因 Tooltip |

全局采用中国市场“红涨绿跌”作为价格方向事实源。风险红与上涨红不能只凭色相区分：上涨永远贴近数字并带 `+`/箭头；风险永远出现在带盾牌/警告图标的语义容器内。港美股视图仍保持产品内部一致性，不在单页切换为绿涨红跌，以免跨市场组合误读。

### 2.2.4 对比度与主题

- 正文与背景对比度至少 4.5:1，大号文本至少 3:1。
- 13px 是数据表最小字号；12px 只用于非关键 caption。
- 暗色主题不是“纯黑 Bloomberg 模式”。使用蓝灰黑底与抬升表面，避免连续高对比白字造成疲劳。
- 图表线条、状态点、Chip 在 light/dark 下都要单独验证，不允许简单颜色反转。
- 用户设置 `prefers-contrast: more` 时，弱边框升级为 strong border，禁止只用阴影分层。

---

# 第三部分：Typography 系统

## 3.1 字体家族

中文界面优先使用系统字体，避免本地产品额外下载字体：

- 中文：`"PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif`
- 英文与 UI：`Inter, "Segoe UI", system-ui, sans-serif`
- 金融数字与代码：`"JetBrains Mono", "Cascadia Code", "SFMono-Regular", Consolas, monospace`

数字字体只用于价格、比例、金额、日期片段、公式与代码，不用于长段正文。所有金融数字开启 `font-variant-numeric: tabular-nums lining-nums`；百分比负号使用真正的数学负号或统一格式化函数，避免列抖动。

## 3.2 字阶

| Token | 字号/行高 | 字重 | 用途 |
|---|---|---:|---|
| `display-lg` | 32/40px | 600 | 首次打开欢迎语、关键研究对象；每页最多一次 |
| `display-sm` | 28/36px | 600 | 组合总值、核心收益，不与多个 KPI 并列抢焦点 |
| `heading-1` | 24/32px | 600 | 页面标题 |
| `heading-2` | 20/28px | 600 | 大模块标题、Artifact 标题 |
| `heading-3` | 16/24px | 600 | 卡片标题、Drawer 分组 |
| `body-lg` | 16/26px | 400 | AI 结论、长文首段、关键说明 |
| `body` | 14/22px | 400 | 默认正文与表单文字 |
| `body-strong` | 14/22px | 600 | 句内重点、按钮文字 |
| `data-cell` | 13/20px | 450/500 | 表格与密集数据，绝不低于 13px |
| `caption` | 12/18px | 400/500 | 时间、来源、辅助说明，不承载关键风险 |
| `financial-xl` | 28/34px | 600 | 单个核心金额/收益 |
| `financial-lg` | 20/26px | 600 | Metric 卡主值 |
| `financial-sm` | 13/20px | 500 | 表格数字、对比值 |

## 3.3 排版规则

- 中文标题不用全大写，不用额外字距；英文 Evidence 类型可使用 11–12px、600 weight、0.02em 字距。
- 长报告正文最大行宽 72 个中文字符；对话内容最大宽度 760px，避免横向扫读。
- 金额始终同时展示币种或符号；跨币种组合必须显示汇率来源状态。
- 比率默认保留 2 位小数，估值倍数带 `x`，收益带 `%`，PE/ROE/Sharpe 不用模糊同单位呈现。
- `UNKNOWN` 显示“未知”并保留原因；不使用 `0` 或空白代替未知。
- 重要结论避免只用粗体。使用标题、短句、证据与行动层级共同建立重点。

---

# 第四部分：Layout 系统

## 4.1 Desktop-first 画布

主设计基准为 1440×900，兼容 1280×800 到 1920×1080。最小支持宽度 1024px；低于 1180px 时优先折叠右侧 Artifact 面板，不压缩正文到不可读。移动端不是 v1 主交付，但核心阅读与确认动作必须可用。

### App Shell

- Sidebar 展开：`240px`。足够容纳中文导航、分组与状态，不产生频繁省略。
- Sidebar 收起：`64px`。保留图标、Tooltip、当前项指示与底部设置入口。
- Sidebar 中间态：窗口小于 1280px 自动收起；用户手动选择优先于自动规则，并持久化。
- Sidebar 背景：与页面底色轻微区分，不用纯黑；当前项使用 AI 蓝浅底 + 左侧 2px 指示。
- 顶部全局区域：`64px`，其中 CommandBar 视觉高度 `48px`，上下各 8px 安全区。
- 首页 Hero CommandBar：最大宽 `880px`、高度 `64px`、圆角 `16px`。
- 页面内 CommandBar：宽度自适应、最小 `520px`、高度 `48px`、圆角 `12px`，置于顶部栏中心；滚动时 sticky。

### Content

- 标准内容最大宽：`1440px`，左右页面 padding 为 32px；1280px 以下降为 24px。
- 阅读型内容最大宽：`880px`；报告正文 `760px`。
- Dashboard 使用 12 栏 Grid，gutter 24px；卡片最小跨 3 栏。
- Research Workspace 使用三栏：Context `264px` / Conversation `minmax(520px, 1fr)` / Artifacts `376px`。
- 三栏之间使用 1px border + 8px 可拖拽热区；宽度偏好持久化。右栏可收至 48px rail，左栏可收至 56px rail。
- Drawer 标准宽 `440px`；专业 EvidenceDrawer 可扩至 `560px`，不得覆盖 Human Confirm 底部动作区。

## 4.2 8px Spacing System

基础单位为 8px，4px 只用于图标与文字的微间距。

| Token | 值 | 用途 |
|---|---:|---|
| `space-0` | 0 | 无间距 |
| `space-0.5` | 4px | 图标与标签、Chip 内部 |
| `space-1` | 8px | 紧凑元素、表格单元内部 |
| `space-1.5` | 12px | 按钮横向 padding、紧凑卡片 |
| `space-2` | 16px | 标准组件 padding、表单行 |
| `space-3` | 24px | 卡片组 gutter、模块内分段 |
| `space-4` | 32px | 页面 padding、主要模块间距 |
| `space-5` | 40px | Hero 内间距 |
| `space-6` | 48px | 页面大分区 |
| `space-8` | 64px | 空状态与首屏顶部空间 |

密度设置只改变组件内部高度与行间距，不改变信息层级。Comfortable：表格行 48px、卡片 padding 24px；Compact：表格行 36px、卡片 padding 16px。触控目标在任何密度下不低于 32×32px，主要动作不低于 40px 高。

## 4.3 圆角、边框与阴影

- `radius-sm 8px`：Button、Input、Chip 组。
- `radius-md 12px`：Card、CommandBar、Popover。
- `radius-lg 16px`：首页 Hero、重要空状态、会议总结。
- 卡片默认 1px 边框，无阴影；只有 Drawer、Popover、Command menu 使用 `0 12px 32px rgba(17, 31, 51, .12)`。
- AI 执行态不用持续发光。允许顶部 2px 进度轨道与一次性的轻柔 focus pulse。

---

# 第五部分：核心组件设计

## 5.1 CommandBar

### 用途

CommandBar 是用户与 FinQuant Hub 建立任务的统一入口，也是当前上下文内的追问器、搜索器和命令面板。它接收自然语言、标的、组合、策略与设置搜索，但不会让用户先选技术管线。

### 视觉

白色/深色抬升表面，1px 边框，左侧为 AI 圆环图标与上下文标签，中间为自适应输入区，右侧为附件/范围、快捷键提示和发送按钮。聚焦时使用 2px AI 蓝 focus ring；仅在 AI 工作时顶部出现细进度轨道。首页版更宽更高，配一句欢迎语和 3 个真实任务示例；页面内版更紧凑并显示当前对象，如“贵州茅台 · 研究”。

### 状态

- `home-idle`：欢迎语、示例 prompt、“今天想研究什么？”。
- `context-idle`：显示当前标的/组合/策略 chip，placeholder 为“继续问关于 600519 的问题…” 。
- `focused`：展开最近任务、收藏命令、推荐动作和键盘导航。
- `searching`：按“标的 / 研究 / 页面 / 命令”分组结果，输入字符高亮。
- `clarifying`：AI 识别到歧义，在下方内联提出最多一个关键澄清问题。
- `executing`：输入保持可读，显示当前阶段、停止按钮和“可先查看已完成结果”。
- `partial/error/offline/no-model`：说明可用能力与恢复方式；不清空用户输入。

### 交互

`Ctrl/Cmd+K` 全局聚焦；上下键选择建议，Enter 执行，Shift+Enter 换行，Esc 先关闭建议再取消聚焦。自然语言路由必须先显示可理解的任务摘要；高成本或需要关键参数的任务先确认缺失条件。停止动作立即停止流并保留已生成 Artifact。

### 代码实现建议

基于现有 `GlobalTaskEntry` 扩展而不是新建平行入口；底层使用 AntD `AutoComplete`/`Popover`/`Input.TextArea`，意图与最近命令放在 `features/globalTaskEntry`。建议 props：`variant: 'hero'|'inline'`、`context`、`status`、`suggestions`、`onSubmit`、`onStop`。输入状态与任务状态分离，避免 SSE 更新导致光标重置。所有结果使用 `role=listbox`、`aria-activedescendant`，执行状态通过 `aria-live=polite` 宣告阶段而非逐 token 播报。

## 5.2 ResearchArtifact

### 用途

把 AI 输出从短暂消息变成统一、可引用、可版本化的研究资产。支持 Company Brief、Research Report、Evidence、Thesis、Strategy、Risk List、Valuation 和 Portfolio Proposal。

### 视觉

卡片由六层组成：类型与状态 Header；一句话 Summary；关键指标/发现 Body；Evidence strip；版本、来源与更新时间 Metadata；Next Actions Footer。默认只展开 Summary 与 3 条关键发现，长报告使用章节目录与折叠，不在聊天气泡里渲染整篇正文。

### 状态

`draft`、`streaming`、`partial`、`ready`、`stale`、`superseded`、`failed`、`archived`。`partial` 必须标出缺失范围；`stale` 显示数据截至时间与刷新动作；`superseded` 提供新版本入口，不覆盖历史。

### 交互

点击标题进入聚焦阅读；EvidenceChip 打开 EvidenceDrawer；卡片内选择文本可“固定为证据”；Footer 动作按资产类型变化。保存、导出、发起投委会、创建论文均保留来源版本。拖动排序只允许在用户自定义工作区，不改变研究逻辑顺序。

### 代码实现建议

组合现有 `ResultLayer` 与 `CitationDetails`，以 slot 方式实现而非为每种 Artifact 复制 Card。建议类型：`artifactType`、`lifecycleState`、`summary`、`evidenceRefs`、`asOf`、`quality`、`version`、`actions`。使用 discriminated union 限制各类型动作。正文虚拟化或分章懒渲染，避免 13 章报告一次性造成布局阻塞。

## 5.3 EvidenceChip

### 用途

在不打断阅读的情况下，快速告诉用户一句话或一个数字属于事实、推断、模型输出还是未知，并作为证据下钻入口。

### 视觉

高度 22px，圆角 6px，左右 padding 6px；使用线性图标 + 中文短标签，专业模式可附英文枚举。映射为：事实/FACT 蓝、推断/INFERENCE 琥珀、模型结果/MODEL_OUTPUT 紫、未知/UNKNOWN 灰。禁止使用纯色实心大胶囊或 emoji。

### 状态

`default`、`hover`、`focus`、`selected`、`stale`、`partial`、`upstream-error`。质量状态用右侧小状态点和 Tooltip 文案，不改变 Evidence 类型颜色。

### 交互

Hover/Focus 显示 2–3 行 Tooltip：类型解释、来源、截至时间。点击打开 EvidenceDrawer；再次点击同一 Chip 保持 Drawer 并定位该证据。键盘 Enter/Space 打开，Esc 返回触发点。

### 代码实现建议

不要让调用方传任意 color，颜色由 `kind` 映射 token。建议 props：`kind`、`label`、`quality`、`source`、`asOf`、`evidenceId`、`onOpen`。用 AntD `Tag` 作为基础但覆盖高度、focus ring 与可点击语义；可点击时渲染为 button 语义。

## 5.4 EvidenceDrawer

### 用途

提供从“我为什么相信它”到“我如何复算它”的渐进式证据审计面板。

### 视觉

右侧 440px 抽屉，标题区显示证据类型、质量与一句事实；第一屏固定展示来源名称、截至时间、期间/口径、可信状态和使用此证据的结论。下方按 Source、Calculation、Lineage、Tool log 分组折叠。未知或失败状态在顶部显示原因与可恢复动作。

### 状态

`OK`、`PARTIAL`、`UNKNOWN`、`UPSTREAM_ERROR`、`STALE`。不要把 `UNKNOWN` 画成错误；它是诚实的缺证据状态。`UPSTREAM_ERROR` 才提供重试，且说明重试范围。

### 交互

普通用户默认只看来源、时间、质量和一句解释；“查看计算与技术详情”展开 provider、原始输入引用、公式、舍入、工具名、call id、耗时和有限日志。点击相关结论在后台页面高亮定位；复制引用只复制可分享的元数据，不复制凭据或敏感日志。

### 代码实现建议

复用 `CitationDetails` 的四态合同和 `Drawer`。将普通层与专业层拆成稳定 section，而不是根据来源拼接任意 JSX。日志默认折叠并脱敏；Source URL 必须做安全协议校验。Drawer focus trap、关闭后焦点归还、标题 `aria-labelledby`。

## 5.5 AgentStatusCard

### 用途

展示多 Agent 研究编排，让用户理解谁在负责什么、进度到了哪里、是否存在局部失败，而不是暴露工程拓扑。

### 视觉

紧凑横卡：左侧角色头像/图标，中间为业务角色名、当前动作与最近发现，右侧为状态和耗时。运行态使用小型环形 spinner 或顶部细进度；完成态显示勾与“产出 3 条证据”；失败态显示原因摘要和是否影响最终报告。

### 状态

- `waiting`：灰色状态点，“等待前置证据”。
- `running`：AI 蓝，“正在核对现金流”。
- `completed`：机会绿，“已完成 · 3 条证据”。
- `failed`：风险红，“新闻源超时 · 可继续”。
- `cancelled`：中性灰，“已停止，保留已完成结果”。

### 交互

默认只显示业务进度；展开后看阶段性发现、使用工具和证据数量。用户可停止整个研究，不单独操控独立 Agent，避免破坏编排语义。失败项可定向重试，重试前说明是否会创建新版本。

### 代码实现建议

提取并统一 Research 内联 AgentCard、Discussion 角色状态与低使用率 SwarmStatusCard。props：`name`、`role`、`status`、`stage`、`duration`、`evidenceCount`、`impact`。不要传百分比，除非后端有确定的离散阶段；使用 `stepsCompleted/stepsTotal` 表达真实进度。

## 5.6 DecisionCard

### 用途

承载 Decision Inbox 的风险、机会和待确认事项，把 AI 建议转化为清晰的人类决策，而不是自动执行入口。

### 视觉

卡片顶部为类型与影响级别，中部为“需要你决定什么”一句话和 2–3 条依据，底部为截至时间、证据质量与精确动作。左侧 3px 语义边不表示买卖方向：风险红、机会青、待确认琥珀、普通复核蓝。

### 状态

`new`、`reviewing`、`needs-confirmation`、`snoozed`、`resolved`、`expired`、`blocked`。Resolved 收起进入历史，不从审计时间线消失。

### 交互

主动作是具体动词：“查看论文变化”“确认创建监控”“应用参数到草稿”；次动作“稍后提醒”；拒绝动作要求可选理由并保留记录。高影响动作先打开确认摘要，展示变化前后、证据和撤销能力。卡片不能提供“批准调仓并执行真实交易”。

### 代码实现建议

以 `decisionType` discriminated union 约束动作，统一 urgency、impact、dueAt、evidenceRefs、resolution。按钮顺序保持主动作在右，破坏性动作不默认聚焦。列表支持 roving tabindex 和按影响/时间排序，不提供诱导性红色数字徽章。

## 5.7 InvestmentCommittee

### 用途

把多视角审查组织成有议程、有证据、有反驳、有投票、有主席总结的 AI 投资委员会。它是研究工作区内的决策质量工具，不是娱乐化角色扮演，也不是多数票买卖机器。

### 视觉

页面由议程 Header、角色 Rail、观点时间线、交锋关系、投票矩阵和主席总结组成。五个常设角色使用一致的圆形线性头像：行业、财务、价值、技术、风险。角色颜色只用于身份导航，观点立场用“看多/中性/看空 + 置信度”文字表达。反驳以细连接线和“回应某观点”标签表示，不绘制复杂网络图。

### 状态

`agenda-draft`、`awaiting-confirmation`、`in-session`、`challenge`、`voting`、`summarizing`、`completed`、`partial`、`failed`。会议前必须由用户确认议程；局部 Agent 失败时仍可形成 Partial Summary，并明确缺席视角。

### 交互

用户可编辑议题和关键问题、确认开会、暂停、补充证据、要求风险官挑战某条观点。发言默认折叠为观点摘要，展开看证据与反驳。投票显示每票理由；主席总结必须列共识、分歧、关键假设、反证条件与下一步。会议结束可“保存为研究 Artifact”“生成论文草稿”“创建监控草稿”，仍需分别确认。

### 代码实现建议

复用 `RoleAvatar`、`DiscussionTimeline`、`EvidenceChip` 与 `ResearchArtifact`，将 Discussion 页面业务迁入 Workspace 视图。会议状态用显式 state machine 管理，SSE 事件映射到角色 turn，不在组件内猜状态。五角色配置作为数据，不复制 JSX；投票置信度必须校验 0–100 且标注为模型自评，不是收益概率。

## 5.8 FinancialMetric

### 用途

以安静、可比较、可解释的方式展示收益、PE、ROE、最大回撤、夏普等金融数字，避免传统交易软件的大字跳动和红绿刺激。

### 视觉

由 Label、Value、Unit、Change/Context、As-of、Quality 六部分组成。主值使用等宽数字，Label 保持普通正文，变化信息小一层。卡片默认无彩色背景，只有数字或左侧微标记使用语义色。对比组使用相同宽度和小数位。

### 状态与格式

- 收益：`+12.48%`，A 股语境上涨红；必须显示期间与是否含成本。
- PE：`32.5x`，中性色；显示 TTM/Forward/静态口径与 as-of。
- ROE：`18.2%`，中性色；显示期间和加权/摊薄口径。
- 最大回撤：`−21.36%`，风险语义；显示区间和峰谷日期。
- 夏普：`1.28`，中性色；显示无风险利率、频率和样本区间。
- `null/unknown`：显示“未知”，下方说明“缺少四个季度数据”或来源失败。
- `stale/partial/loading/error`：数值不闪烁；保留上次值并明确“截至旧时间”，或用稳定 skeleton。

### 交互

Hover/Focus 显示口径与解释；点击打开 Method 或 EvidenceDrawer。可选对比显示基准差值，但不得把“高”自动等同“好”。数字更新使用 150–200ms 淡入，不使用滚轮跳字或持续闪烁；reduced-motion 下直接替换。

### 代码实现建议

合并 Dashboard `big-screen-metric`、Portfolio Statistic 与策略 MetricGrid。建议 props：`metricKey`、`value`、`unit`、`period`、`asOf`、`quality`、`comparison`、`directionSemantics`、`format`. 统一由 `utils/format.ts` 处理百分比、金额、倍数、空值和正负号，禁止每页手写颜色与小数位。

---

# 第六部分：页面级设计规范

## Screen 1：Workbench 首页

### 页面目标

第一次打开产品后，用户在 3 秒内看到 AI 入口，在 10 秒内知道今天发生了什么、什么值得研究、是否有待复核事项，并能在 30 秒内启动一项研究。首页不是 Dashboard 数据墙，而是“研究启动台 + 决策收件箱”。

### Layout 与模块顺序

1. 顶部 App Shell：左侧产品身份，中间页面内 CommandBar，右侧任务状态、通知、主题与账户。
2. Hero：欢迎语、首页 CommandBar、三个示例任务。首次用户文案“先说人话，从你想了解的公司开始”。
3. Market Pulse：上证、深证、创业板与市场情绪，单行紧凑，附 as-of 和部分数据状态。
4. 主区 8/4 栏：左侧“今日值得研究”最多 3 张研究邀约；右侧 Decision Inbox，最多显示 5 条待确认。
5. 次区 7/5 栏：我的研究任务与自选股票简表；Portfolio Risk 摘要仅在已有组合时出现。
6. 专业折叠区：Alpha 信号、系统能力、数据源状态，不进入 L1 首屏。

### 视觉重点

CommandBar 是唯一 P0 视觉焦点。市场脉搏提供背景语境但不抢焦点；推荐卡必须解释“为什么值得研究”，禁止收益榜式视觉。Decision Inbox 用任务语义而非红色警报墙。

### 用户动作

主要动作：提出问题或选择示例。次要动作：进入一项今日研究、处理待确认、继续未完成研究。首页不直接提供真实买卖按钮。

### 状态与层级

首次空状态只展示 Hero、3 个示例与本地能力简述；无模型时可继续浏览缓存/本地数据并提示配置；市场部分失败时保留已有指数。L1 隐藏系统统计，L2 增加任务与自选，L3 增加组合风险和 Alpha 折叠区。

## Screen 2：AI Research Workspace

### 页面目标

在一个连续工作面中，把问题转成结构化报告、证据、论文与跟踪动作。用户不需要在 Chat、Research、Discussion、Thesis 和 Compare 之间来回跳转。

### 三栏结构

**左：Research Context（264px）**

- 按项目/标的组织会话与研究资产，不只是聊天列表。
- 顶部为“新研究”、搜索与过滤；项目项显示标的、最近状态、未处理决策。
- 当前项展开 Timeline：问题 → 报告 → 证据 → 论文 → 监控。
- 折叠为 56px rail 后保留项目图标、未读点和 Tooltip。

**中：AI Conversation（主栏）**

- 顶部 TaskPageHeader 显示研究目标、对象、状态与数据截至时间。
- 对话流最大宽 760px；AI 先复述目标，再显示研究计划与关键产出。
- AgentStatusCard 作为过程卡嵌入流中，ResearchArtifact 作为结果卡嵌入，不把 13 章全文当普通气泡。
- 底部 sticky Composer 支持追问、停止、重新生成、引用当前 Artifact；不与全局 CommandBar 重复功能。

**右：Artifacts（376px）**

- Tabs：概览、报告、证据、论文；比较与 Agent 技术详情按层级出现。
- 默认显示当前研究的结论、3 条关键证据、风险和下一步。
- 点击中栏引用会定位右栏证据；右栏点章节会定位生成它的对话。
- 右栏收起时保留 48px rail 和未查看 Artifact 数量。

### 视觉重点与动作

视觉重点随阶段变化：空态是输入；执行态是阶段与首批证据；完成态是结论和证据；待决策态是确认卡。主要动作“生成研究报告”；完成后变为“保存为论文草稿”或“进入跟踪”。“加入组合”只能打开明确的真实/模拟/观察选择，不直接写入或交易。

### 页面状态

支持 EMPTY、LOADING、STREAMING、PARTIAL、SUCCESS、ERROR、OFFLINE、NO_MODEL、NO_DATA_SOURCE。Streaming 只宣告阶段；Partial 明确缺失的 Agent/数据源；停止后保留已完成 Artifact。L1 只见对话与报告，L2 增加证据和论文，L3 增加工具调用、计算与可调密度。

## Screen 3：Portfolio Center

### 页面目标

像一位 AI 投资管家一样持续回答“我的组合发生了什么、风险来自哪里、原来的判断是否仍成立、现在需要我确认什么”，但永远不代替用户操作真实账户。

### Layout

顶部为组合选择器、组合类型标记（真实记录 / Paper 模拟）、数据截至时间与 CommandBar。第一行只保留四项：总市值、期间收益、最大回撤、风险状态。第二行 8/4 栏：左侧 Holdings 与贡献，右侧 AI Portfolio Brief。下方 Tabs：Overview、Holdings、Risk、Thesis Changes、Alerts、Paper Review。

Risk 页按“风险结论 → 来源 → 方法”组织：集中度、相关性、币种/市场暴露、VaR/ES、压力情景。缺价格或 FX provenance 时禁止展示伪总值，直接显示无法汇总的资产与原因。

### AI 投资管家行为

主动汇总重大变化、观点漂移、集中风险和待复核预警；每条建议说明证据、置信度的含义与反证。AI 可以创建调研、委员会或监控草稿，不能自动调仓。Paper Portfolio 与真实持仓在标题、色标和按钮文案上永久区分。

### 视觉重点与动作

首要是风险与论文变化，不是今日盈亏的刺激。主要动作根据状态为“添加持仓记录”“创建 Paper Portfolio”“复核风险变化”。任何“保存模拟成交”都需要价格、时间、币种、FX 来源与用户确认。

### 状态与层级

空组合提供两条明确路径：记录已有持仓，或创建 Paper 模拟；不默认代入示例资产。L1 只见总览和持仓，L2 增加风险与论文关联，L3 增加因子暴露、相关性矩阵、压力测试和可复算方法。

## Screen 4：Investment Committee

### 页面目标

把“让多个 Agent 说几段话”升级为一个可审计的决策会议：明确议题、分工、证据、反驳、投票、共识与未决分歧。

### Layout

顶部议程条显示议题、标的、研究版本、预计阶段与“确认开会”。左侧 208px 角色 Rail 展示五位常设官与当前状态；中栏为按轮次组织的观点与交锋；右侧 360px 为 Evidence & Vote 面板；底部 sticky Meeting Controls 提供暂停、补充问题、请求挑战和结束会议。

会议完成后，中栏切换为主席总结 Artifact：建议立场、共识、分歧、关键前提、使结论失效的条件；右栏显示投票矩阵与证据质量分布。角色头像克制、专业，不使用真人照片、动漫或 emoji。

### 用户动作

会议前编辑/确认议程；会议中查看证据、要求某角色回应、暂停；会议后保存纪要、生成论文草稿、创建监控草稿。投票本身不触发任何组合动作。

### 状态与层级

L1 不主动暴露完整委员会；L2 使用行业/价值/风险三角色简化会议；L3 使用五角色、交锋与工具详情。Partial 状态清楚说明缺席视角及其对总结的影响。

## Screen 5：Strategy Lab

### 页面目标

帮助用户把一个投资想法转成有限、明确、可复算的策略实验，并理解历史结果能说明什么、不能说明什么。这里是实验室，不是“收益生成器”。

### Layout

页面顶部为自然语言策略草稿与解析结果；下方采用 4/8 栏：左侧 Setup，右侧 Experiment Canvas。Setup 依次为目标、标的、日期、规则、成本、基准、风险；L2 默认只展示标的、日期、快慢均线三个核心输入，其余进入高级设置。Experiment Canvas 顶部显示运行状态，中部为 BacktestSummary 与权益/回撤/基准图，底部为稳健性、交易质量、失败解释、证据与历史版本。

自然语言解析只把明确的单标的、日线、MA crossover 等支持项映射到草稿；日期、资金、费用、基准和风控仍由用户显式确认。界面必须区分“已解析”“已应用到表单”“已运行”“已保存实验”。

### 视觉重点与动作

视觉重点是实验假设与结果可信度，不是单个总收益。主要动作“检查并运行回测”；运行前摘要显示数据区间、执行时点、费用、复权、基准与缺失项。结果首先展示是否可解释，再展示收益、夏普、最大回撤和相对基准。

### 状态与层级

包含参数无效、数据不足、运行中、部分结果、完成、统计不稳健与上游失败。失败时 `BacktestFailurePanel` 排序展示根因与修复动作。L2 快速模式 3 个核心参数，L3 完整参数、Bootstrap/Monte Carlo/Walk-forward、交易明细与 CitationDetails。

---

# 第七部分：AI Native 交互规范

## 7.1 Loading

Loading 只表示正在获取已知资源，不假装 AI 在思考。使用稳定骨架屏，形状与最终内容一致；超过 800ms 才显示，超过 4 秒增加具体阶段。保留页面框架和旧数据，不用全屏 Spinner。行情与证据分别加载，允许先展示可用部分。

## 7.2 Streaming

Streaming 按语义块而非逐字符呈现。标题、段落、列表和 EvidenceChip 完成后再入场，避免布局抖动。区域使用 `aria-live="polite"`，只播报“财务分析完成”等阶段；`prefers-reduced-motion` 下批量更新。提供停止按钮，停止后标记“用户停止 · 内容可能不完整”。

## 7.3 Agent 执行

开始前展示研究计划和参与角色；执行中显示 waiting/running/completed/failed；完成一项就允许查看其 Artifact。不要展示假的线性百分比；用离散阶段、已完成数量与真实耗时。局部失败不把整页变红，必须说明最终报告是否仍可用。

## 7.4 Tool 调用

默认文案为业务动作：“正在读取行情”“正在复算估值”“正在运行历史检验”。L3 才显示工具名、参数摘要、调用时点和有限日志。敏感凭据、完整请求头和用户隐私永不进入 UI。工具失败提供定向重试，不自动改用低质量来源而不告知。

## 7.5 Evidence 生成

EvidenceChip 可在段落稳定后出现；生成中显示“正在核对来源”，而不是先赋 FACT。证据类型与质量是两个维度：FACT 也可能 STALE/PARTIAL，MODEL_OUTPUT 也可能 OK。证据状态变更要记录版本，不悄悄改写已保存报告。

## 7.6 Human 确认

确认界面包含：动作名称、影响对象、变化前后、证据摘要、是否可撤销、后续自动化范围。主按钮必须具体且与结果一致；取消永远安全。连续确认应合并为一次有意义的 review，不制造点击疲劳。高影响动作确认后进入 append-only 活动记录。

## 7.7 状态文案模板

| 场景 | 推荐文案 | 禁止文案 |
|---|---|---|
| AI 启动 | “正在制定研究计划” | “AI 正在施展魔法” |
| 数据部分失败 | “新闻源超时；行情与财务结论可用” | “出现错误” |
| 证据未知 | “尚无可靠来源，暂不下结论” | “大概率如此” |
| 模型输出 | “模型计算结果，需结合假设阅读” | “事实证明” |
| 用户确认 | “确认创建每周监控” | “执行建议” |
| 停止 | “已停止，保留 3 项已完成结果” | “任务失败” |

---

# 第八部分：小白模式与渐进披露

## 8.1 同一界面的三级复杂度

### Level 1：Guided / 新手

**展示什么**：自然语言入口、一句话结论、三条理由、主要风险、来源与时间、一个下一步；首页的 Market Pulse、今日研究邀约、精简 Decision Inbox；组合的持仓与盈亏；研究的对话与报告摘要。

**隐藏什么**：完整 13 章、Agent DAG、provider/calculation/tool log、Alpha、复杂回测参数、VaR/ES 公式、因子暴露、相关性矩阵。隐藏不是删除：证据仍以“查看来源”可达。

**什么时候解锁**：默认首次进入为 L1；用户完成一次“提问 → 查看证据 → 保存自选/论文草稿”的闭环后，建议进入 L2。用户可随时手动切换。

### Level 2：Standard / 普通

**展示什么**：证据链、投资论文、三角色投委会、预警、组合风险摘要、策略快速模式、研究版本。允许展开 provider 与计算概要。

**隐藏什么**：完整工具日志、五角色交锋、因子库、统计稳健性高级方法、完整参数与技术系统页。

**什么时候解锁**：完成深度研究并创建论文，或用户主动选择“显示更多研究细节”。系统只建议一次，不使用庆祝性付费墙文案。

### Level 3：Professional / 专业

**展示什么**：全部证据与方法、工具调用、五角色投委会、策略完整参数、Alpha、因子暴露、相关性、压力测试、实验版本与可复算清单。

**仍然隐藏什么**：凭据、敏感原始日志、无助于判断的内部工程对象；专业模式不是 debug 模式。

**什么时候解锁**：用户完成一次回测、查看过方法层或主动设置专业模式。模式是账户偏好，但允许当前会话临时降密度。

## 8.2 解锁与回退规则

- 不以天数或点击量暗中升级；升级必须由用户接受。
- 被隐藏的高级能力在 L2 可用一张低干扰预览卡说明价值与解锁条件，L1 导航不显示锁墙。
- 用户可随时降低密度，不丢失高级层产生的资产。
- 术语解释按用户已读状态减少，但“风险”“未知”“数据时点”永不隐藏。
- 复杂度影响展示，不改变金融计算、证据质量或权限边界。

---

# 第九部分：Figma 组件规范

## 9.1 文件与组件树

```text
FinQuant Design System v1
├── 00 Cover & Changelog
├── 01 Foundation
│   ├── Color / Brand
│   ├── Color / Evidence
│   ├── Color / Finance & Risk
│   ├── Typography / Chinese / Latin / Numeric
│   ├── Spacing / 8pt
│   ├── Radius / Border / Shadow
│   ├── Grid / Breakpoints
│   └── Motion / Accessibility
├── 02 Primitives
│   ├── Button / FqButton
│   ├── Input / Select / Search
│   ├── Chip / Badge / StatusDot
│   ├── Card / FqCard
│   ├── Tabs / Tooltip / Popover
│   ├── Drawer / Modal
│   ├── Table / Empty / Skeleton
│   └── Icon / Avatar
├── 03 Navigation
│   ├── AppSidebar
│   ├── Topbar
│   ├── CommandBar
│   ├── CommandMenu
│   ├── Breadcrumb
│   └── ResearchContextRail
├── 04 AI Components
│   ├── StreamingMessage
│   ├── AgentStatusCard
│   ├── AgentActivityGroup
│   ├── ResearchArtifact
│   ├── DecisionCard
│   ├── HumanConfirmation
│   └── AIStateBanner
├── 05 Evidence Components
│   ├── EvidenceChip
│   ├── EvidenceDrawer
│   ├── CitationDetails
│   ├── EvidenceTree
│   ├── QualityState
│   └── AuditTrail
├── 06 Finance Components
│   ├── FinancialMetric
│   ├── MetricGrid
│   ├── PriceChange
│   ├── MarketPulse
│   ├── RiskSummary
│   ├── HoldingsTable
│   ├── ChartFrame
│   └── BacktestSummary
├── 07 Research Components
│   ├── TaskPageHeader
│   ├── ResultLayer
│   ├── ResearchTimeline
│   ├── ThesisCard
│   ├── InvestmentCommittee
│   └── StrategySetup
├── 08 Patterns
│   ├── Summary → Evidence → Method
│   ├── Loading → Streaming → Complete
│   ├── Partial Data Recovery
│   ├── Human Confirmation
│   ├── Progressive Disclosure L1/L2/L3
│   └── Empty / Offline / No Model
├── 09 Templates
│   ├── Workbench Homepage
│   ├── AI Research Workspace
│   ├── Portfolio Center
│   ├── Investment Committee
│   └── Strategy Lab
└── 10 Playground & QA
    ├── Light / Dark
    ├── Comfortable / Compact
    ├── Chinese Long Text
    ├── Keyboard Focus
    └── Data Quality States
```

## 9.2 命名与 Variant 规则

- 命名采用 `Domain/Component/Part`，例如 `Evidence/EvidenceChip/Base`。
- Variant 属性统一：`theme=light|dark`、`density=comfortable|compact`、`level=L1|L2|L3`、`state=...`、`size=...`。
- 不把颜色做成调用方可选 Variant；语义类型决定 token。
- 每个组件包含 Default、Hover、Focus、Disabled、Loading、Error/Partial（若适用）。
- Auto Layout 必须开启；正文与中文长标签测试 120% 文本长度。
- Figma Variables 与 CSS token 同名，颜色使用 semantic alias，不直接引用 primitive HEX。
- 所有 Template 同时提供 1440×900 light、1440×900 dark、1280×800 compact 三个 QA frame。

## 9.3 组件交付 Definition of Done

一个 Figma 组件只有在以下条件满足后才可标记 Ready：所有状态齐全；键盘焦点可见；浅/深主题通过；L1/L2/L3 规则明确；真实中文长文与金融数字已测试；UNKNOWN/PARTIAL/UPSTREAM_ERROR 已覆盖；标注 padding、min/max width、响应规则；Props 可映射到 React 类型；设计说明中写明何时不用该组件。

---

# 第十部分：前端实现合同

## 10.1 复用与收敛

- `CommandBar` 从 `GlobalTaskEntry` 扩展。
- `ResearchArtifact` 组合 `ResultLayer` 与 `CitationDetails`。
- `EvidenceDrawer` 复用现有质量四态，不创造第五套来源模型。
- `AgentStatusCard` 收敛 Research 内联 AgentCard、Discussion 角色状态与 Swarm 状态展示。
- `FinancialMetric` 收敛 Dashboard、Portfolio、Backtest 的重复数字格式。
- `InvestmentCommittee` 复用 `RoleAvatar` 与 `DiscussionTimeline`，但采用会议状态机和统一 Artifact 输出。
- `InstrumentSearch`、`MetricGrid`、`ActivityTimeline`、`ErrorExplanationPanel` 作为共享原语，不在页面重复实现。

## 10.2 CSS Token 示例

```css
:root {
  --fq-ai-primary: #315efb;
  --fq-ai-soft: #eef2ff;
  --fq-secondary: #176b73;
  --fq-bg-page: #f5f7fa;
  --fq-surface-1: #ffffff;
  --fq-border: #dce3eb;
  --fq-text-primary: #172033;
  --fq-text-secondary: #5c697a;
  --fq-evidence-fact: #2563eb;
  --fq-evidence-inference: #b8640a;
  --fq-evidence-model: #7557c8;
  --fq-evidence-unknown: #667085;
  --fq-price-up: #d9485f;
  --fq-price-down: #168a67;
  --fq-risk: #d13c3c;
  --fq-warning: #b77905;
  --fq-radius-sm: 8px;
  --fq-radius-md: 12px;
  --fq-radius-lg: 16px;
  --fq-sidebar-expanded: 240px;
  --fq-sidebar-collapsed: 64px;
  --fq-commandbar-inline: 48px;
  --fq-commandbar-hero: 64px;
}
```

暗色变量放在 `[data-theme='dark']`，通过 AntD `ConfigProvider` 的 semantic token 映射统一切换。组件文件不得内联 HEX；图表配置也必须读取相同语义 token。

## 10.3 可访问性合同

- 所有交互均可键盘完成，焦点顺序与视觉顺序一致。
- 流式区域只播报阶段，避免逐字轰炸屏幕阅读器。
- Chip、图标按钮和状态点必须有可理解的 accessible name。
- 图表提供文字摘要、数据表入口和当前范围；颜色曲线同时使用线型/标签区分。
- 200% 缩放下不丢失确认、停止与关闭动作。
- `prefers-reduced-motion`、`prefers-contrast`、dark/light 均为设计和测试维度。

## 10.4 文案合同

文案先说用户目标，再说系统能力；先说可用部分，再说失败部分。使用“研究”“复核”“草稿”“模拟”“来源”“截至”，避免“稳赢”“智能买入”“自动赚钱”“AI 已决定”。按钮必须表达结果，如“保存为论文草稿”，不写“确定”。

## 10.5 验收清单

> **实现状态**（2026-08-21 审计）：✅ 已验证 | ⚠️ 部分满足 | ❌ 未满足

1. 五个核心页面在 L1/L2/L3 下都保持同一信息结构。 ❌ L1/L2/L3 三级渐进未实现
2. 所有研究结果可以从结论下钻到证据和方法。 ⚠️ EvidenceDrawer 可展开，但无 EvidenceTree 证据树
3. FACT/INFERENCE/MODEL_OUTPUT/UNKNOWN 与 OK/PARTIAL/UNKNOWN/UPSTREAM_ERROR 不混为一个维度。 ✅ EvidenceChip 四态 + CitationDetails 质量态
4. 价格方向全站红涨绿跌，且文字/符号可独立表达方向。 ✅ --fq-price-up/down 红涨绿跌
5. Paper Portfolio、真实持仓记录与 AI 建议视觉和文案明确区分。 ⚠️ Paper 和真实组合有标签区分，无 AI 建议卡
6. AI 执行可停止，部分结果可保留，局部失败可解释。 ⚠️ SSE 流可中断，但无明确停止按钮
7. 任何状态变更都有显式人类确认；没有真实交易暗示。 ✅ 模拟组合/论文保存均需确认
8. 关键页面覆盖 Empty、Loading、Streaming、Success、Partial、Error、Offline、No Model、No Data Source。 ⚠️ 部分状态有覆盖，非全部页面
9. 1440、1280、1024 宽度与 200% 缩放下可完成核心任务。 ✅ 390px 窄屏验证通过，200% 缩放已测试
10. 前端实现继续遵守现有 API、SSE、认证、用户隔离和 local-first 架构边界。 ✅

---

# 第十一部分：设计评审与跨角色交付

## 11.1 Designer 评审脚本

设计评审不从“页面是否漂亮”开始，而从用户能否连续完成任务开始。评审 Workbench 时，先遮住导航，观察第一次使用者能否在三秒内指出从哪里提问；再遮住 CommandBar，确认其余模块不会形成第二个竞争焦点。评审研究工作区时，从一条模糊问题开始，逐步切换到执行、部分数据、完成与停止状态，检查同一研究上下文是否仍然连续。评审组合页时，先问用户能否分辨真实持仓记录、Paper 模拟和 AI 建议，再问是否能解释某个风险数字的时间、来源和方法。评审投委会时，必须确认少数意见没有被主席总结吞掉。评审策略实验室时，要求非量化用户先复述策略执行语义，再允许点击运行。

每次设计评审至少准备六类数据情境：完整数据、部分来源失败、全部来源失败、旧数据、未知值、跨币种缺少 FX。不要只用最理想的成功状态评审。中文公司名至少测试 8 个字符，研究问题至少测试 40 个汉字，金额测试亿元与小数，百分比测试正、负、零和极端值。所有卡片在 120% 文案长度下仍应保持主动作可见。

## 11.2 Frontend Engineer 交付清单

设计稿交付给前端时，每个页面 Frame 必须附状态矩阵、组件实例名、响应规则和数据字段来源。不要只标注静态像素。CommandBar 需写清提交、澄清、停止和恢复行为；ResearchArtifact 需写清生命周期与版本；EvidenceChip 需同时给 evidence kind 和 quality；DecisionCard 需写明哪些动作只创建草稿、哪些会持久化。设计标注必须明确未知值不是 0，Partial 不是 Error，停止不是失败。

开发切片按“基础 token → 共享组件 → 单页闭环 → 多页收敛”进行。第一切片只建立颜色、排版、间距、焦点和数字格式；第二切片实现 CommandBar、Evidence、Artifact、Agent、Decision、Metric；第三切片先完成 Workbench 到 Research Workspace 的可见闭环；第四切片再收敛 Portfolio、Committee、Strategy Lab。每一切片都要保留现有 API 和真实数据，不能为了视觉完整而写假数据进生产组件。

## 11.3 AI Product Engineer 交付清单

AI 状态必须由真实任务状态驱动。前端不可根据 token 数猜测“完成百分比”，也不可把没有 provenance 的模型句子标为 FACT。后端事件至少要让 UI 区分任务已接受、阶段开始、阶段完成、证据产生、局部失败、用户停止与最终完成。工具名称可以进入专业层，普通层只呈现业务动作。局部失败事件需要携带影响范围，使 UI 能说明“哪些结论仍可用”。

Human confirmation 的合同要包含动作对象、草稿内容、版本、幂等标识和结果状态。重复点击不能创建重复监控或重复保存；恢复页面后，用户仍能知道上一次确认是否成功。模型自评置信度只能描述输出自身，不得转换为上涨概率、策略胜率或投资建议等级。

## 11.4 UX Writer 术语规则

首次出现专业术语时，采用“术语 + 一句用途解释”，例如“最大回撤：历史区间内从高点到低点的最大跌幅”。Tooltip 不写教科书长文，也不隐去计算口径。证据类型中文优先：事实、推断、模型结果、未知；专业层保留 FACT、INFERENCE、MODEL_OUTPUT、UNKNOWN 以便审计。状态文案描述事实和下一步，不归因用户，不制造焦虑。

推荐句式是“由于什么，目前能得出什么，仍缺什么，你可以做什么”。例如：“由于新闻源超时，目前只能确认财务与行情变化；事件影响仍未知。你可以先查看已有证据，或稍后重试新闻部分。”禁止句式是“AI 认为大概率可以买”“系统已为你优化”“错过即失去机会”。

## 11.5 发布前体验门禁

发布前由产品、设计、前端和金融正确性评审共同走查五条路径：首次用户十分钟完成第一份研究；普通用户从研究结论保存论文并创建监控草稿；专业用户查看证据计算与工具记录；组合用户识别一次论文漂移并选择稍后复核；策略用户从自然语言草稿确认参数并理解失败原因。任一路径出现虚构值、隐藏来源、默认自动化、真实交易暗示或无法停止 AI 时，Design System 落地不可通过。

视觉质量门禁包括：1440 与 1280 无横向溢出；1024 下主动作仍可达；200% 缩放不遮挡确认；浅深主题信息层级一致；键盘焦点完整；流式输出在 reduced-motion 下稳定；图表有文字摘要；红涨绿跌不与风险/机会语义混淆；所有 UNKNOWN、PARTIAL、UPSTREAM_ERROR 都有可理解文案。

---

## 结论

FinQuant Hub Design System v1.0 的核心不是一种蓝色，也不是一套卡片，而是一套稳定的信任语法：AI 负责理解、编排、解释和持续跟踪；证据负责约束每个结论；渐进披露负责让不同熟练度的人在同一界面完成任务；人类确认负责守住投资决策与状态变化的最后一道门。最终体验应当安静、清晰、信息密度高但不压迫——像一位永远把证据摊在桌面上、把决定留给你的投资研究伙伴。
