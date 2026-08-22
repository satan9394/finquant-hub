# FinQuant Hub UI 产品规格书

> **版本**：v1.0 ｜ **日期**：2026-08-21
>
> 本规格书将已确定的 FinQuant Hub AI 原生产品战略（见 `FinQuant_AI_Native_Product_Blueprint.md`）转化为可直接指导前端重构的工程化设计文档。
> 基于：实际运行页面（http://127.0.0.1:5173，17 张全页截图）+ 完整源码逆向（`App.tsx`、18 个页面组件、30+ 子组件）+ 已有产品蓝图与组件清单。
>
> **目标读者**：Product Designer / Frontend Engineer / AI Coding Agent——三方均可直接开工。

> **实现状态审计**（2026-08-21）：✅ 已实现 38 项 / ⚠️ 部分实现 13 项 / ❌ 未实现 8 项
>
> - **已实现**：18 页面路由、App Shell、证据四态体系、研究/策略/组合全部后端 API、13 章报告、13 工具、4367 Alpha 因子、Design System 组件
> - **部分实现**：CommandBar placeholder 未按页变化、Market Pulse 无迷你图+情绪计、三栏研究工作台、组合 5-Tab、投资委员会角色不一致、自选/组合闭环按钮
> - **未实现**：新一级导航 /home /assistant /workspace、L1/L2/L3 三级渐进、意图路由、今日推荐、Portfolio Risk 摘要、EvidenceTree、Portfolio Action 卡

---

# 一、当前 UI 全景（CURRENT UI MAP）

## 1.1 页面清单与截图索引

| # | 页面 | 当前路由 | 分组 | 截图 | 页面高度 | 状态 |
|---|------|---------|------|------|---------|------|
| 1 | 今日概览 | `/` | 今日 | `01-dashboard.png` | 3083px | ✅ 实测 |
| 2 | 研究工作区 | `/research` | 研究 | `02-research-workspace.png` | 1074px | ✅ 实测 |
| 3 | 深度研究 | `/research/reports` | 研究 | `03-deep-research.png` | 1021px | ✅ 实测 |
| 4 | 快速问答 | `/chat` | 研究 | `04-chat.png` | 962px | ✅ 实测 |
| 5 | 多视角审查 | `/discussion` | 研究 | `05-discussion.png` | 962px | ✅ 实测 |
| 6 | 投资论文 | `/thesis` | 研究 | `06-thesis.png` | 900px | ✅ 实测 |
| 7 | 个股分析 | `/analysis/:ticker` | (隐式) | `07-stock-analysis.png` | 3166px | ✅ 实测 |
| 8 | 比较工作区 | `/compare` | 研究 | `08-compare.png` | 1446px | ✅ 实测 |
| 9 | 选股器 | `/screening` | 策略 | `09-screening.png` | 900px | ✅ 实测 |
| 10 | 策略实验室 | `/strategy-lab/ma-crossover` | 策略 | `10-strategy-lab.png` | 2549px | ✅ 实测 |
| 11 | Alpha 因子 | `/alpha` | 策略 | `11-alpha.png` | 2990px | ✅ 实测 |
| 12 | 持仓与风险 | `/portfolio` | 组合 | `12-portfolio.png` | 900px | ✅ 实测 |
| 13 | 预警中心 | `/alerts` | 组合 | `13-alerts.png` | 900px | ✅ 实测 |
| 14 | 知识库 | `/knowledge` | 知识 | `14-knowledge.png` | 1534px | ✅ 实测 |
| 15 | 模型管理 | `/models` | 系统工具 | `15-models.png` | 900px | ✅ 实测 |
| 16 | MCP 工具管理 | `/mcp-market` | 系统工具 | `16-mcp-market.png` | 900px | ✅ 实测 |
| 17 | 系统设置 | `/settings` | 系统工具 | `17-settings.png` | 900px | ✅ 实测 |

> 所有截图保存于 `docs/ui-current/` 目录，Playwright 在 http://127.0.0.1:5173 实际抓取。

## 1.2 当前 App Shell 结构（源码级）

```
ProLayout (layout="side", siderWidth=220px)
├── 左侧栏
│   ├── Logo: FinQuant Hub + 收起按钮
│   ├── 菜单: 6 个分组 (今日/研究/策略/组合/知识/系统工具)
│   │   ├── 今日: [今日概览]
│   │   ├── 研究: [研究工作区/深度研究/比较工作区/快速问答/多视角审查/投资论文]
│   │   ├── 策略: [策略实验室/选股器/Alpha 因子]
│   │   ├── 组合: [持仓与风险/预警中心]
│   │   ├── 知识: [知识库]
│   │   └── 系统工具: [模型管理/MCP 工具管理/系统设置]
│   └── 底部: 当前 AI 模型选择 + 通知中心 + 主题切换 + 本地模式标签
├── 顶部栏
│   ├── GlobalTaskEntry (全局搜索弹窗)
│   └── [系统工具页] 系统工具边界 Banner
└── 主内容区: <Routes> + <Suspense>
```

**路由守卫**：除 `/login` 外所有路由均经过 `AuthGate`（邮箱免密登录 / LOCAL_ONLY_MODE 自动认证）。

---

# 二、OLD → NEW 页面映射表

| 当前页面 | 当前 URL | 新页面 | 新归属 | 处置 | 原因 |
|---------|---------|--------|--------|------|------|
| 今日概览 | `/` | 工作台 | 工作台 | **重设计** | 信息过载→AI-first首页 |
| 研究工作区 | `/research` | 个股分析 | 研究 | **合并** | 并入统一研究入口 |
| 深度研究 | `/research/reports` | 深度报告 | 研究 | **保留+重构** | 研究资产输出层 |
| 快速问答 | `/chat` | AI 助手 | 研究 | **重命名+合并** | 统一AI对话入口 |
| 多视角审查 | `/discussion` | 投资委员会 | 研究 | **重构升级** | 从"讨论"升级为"投委会" |
| 投资论文 | `/thesis` | 投资论文 | 研究 | **保留+嵌入** | 作为研究产出子模块 |
| 个股分析 | `/analysis/:ticker` | 个股分析 | 研究 | **保留为研究主入口** | 研究流程的单标的入口 |
| 比较工作区 | `/compare` | 比较 | 研究 | **保留** | 对比分析能力 |
| 策略实验室 | `/strategy-lab/ma-crossover` | 策略实验室 | 策略 | **保留** | 回测核心能力 |
| 选股器 | `/screening` | 选股器 | 策略 | **保留** | 量化筛选 |
| Alpha 因子 | `/alpha` | Alpha 因子 | 策略 | **保留（Pro可见）** | 专业因子研究 |
| 持仓与风险 | `/portfolio` | 组合中心 | 组合 | **重构升级** | 升级为AI投资管家 |
| 预警中心 | `/alerts` | 预警中心 | 组合 | **保留+嵌入** | 合并到组合中心 |
| 知识库 | `/knowledge` | 知识库 | 工作区 | **归入** | 系统工具统一收编 |
| 模型管理 | `/models` | 模型中心 | 工作区 | **归入** | 系统工具统一收编 |
| MCP 工具管理 | `/mcp-market` | MCP 市场 | 工作区 | **归入** | 系统工具统一收编 |
| 系统设置 | `/settings` | 设置 | 工作区 | **归入** | 系统工具统一收编 |
| 登录 | `/login` | 登录 | (全局) | **保留** | 独立全局路由 |

**新一级导航（5项）**：

| # | 导航项 | 图标 | 解锁层级 | 路由 |
|---|--------|------|---------|------|
| 1 | **工作台** | Compass | L1 | `/home` |
| 2 | **研究** | Search | L1 | `/analysis/:ticker` / `/reports` / `/assistant` |
| 3 | **策略** | LineChart | L2 | `/screening` / `/strategy-lab` / `/alpha` |
| 4 | **组合** | Wallet | L1 | `/portfolio` |
| 5 | **工作区** | FolderOpen | L2 | `/workspace` / `/knowledge` / `/models` / `/mcp-market` / `/settings` |

---

# 三、NEW APP SHELL 设计

## 3.1 左侧导航

```
┌──────────────────────────────┐
│ 🏦 FinQuant Hub    [← collapse] │
│                              │
│ 🧭 工作台                    │ ← L1
│ 🔍 研究              ▾       │ ← L1
│    ├─ 个股分析               │
│    ├─ 深度报告               │ ← L2
│    ├─ AI 助手                │
│    ├─ 投资委员会             │ ← L2
│    └─ 比较                   │
│ 📈 策略              ▾       │ ← L2
│    ├─ 选股器                 │
│    ├─ 策略实验室             │
│    └─ Alpha 因子 🔒          │ ← L3
│ 💼 组合                      │ ← L1
│ 📁 工作区            ▾       │ ← L2
│    ├─ 知识库 🔒              │ ← L3
│    ├─ 模型中心 🔒            │ ← L3
│    ├─ MCP 市场 🔒            │ ← L3
│    └─ 设置                   │
│                              │
│ ────────────────────         │
│ 🤖 DeepSeek Flash  ▾        │
│ 🔔 0  🌙  本地模式           │
└──────────────────────────────┘
```

**渐进展示规则**：
- L1 新手：只看到"工作台 + 研究（折叠，仅显示个股分析和 AI 助手）+ 组合"
- L2 普通：解锁"策略 + 工作区（仅设置）+ 研究深度模块"
- L3 专业：全部可见，包括 Alpha 因子、知识库、模型中心、MCP 市场

## 3.2 顶部栏

```
┌──────────────────────────────────────────────────────────────┐
│ [🔍 今天想研究什么？...] [TaskStatus] [🔔 0] [👤 User] [🌙]  │
└──────────────────────────────────────────────────────────────┘
```

### Global AI Command Bar

全局 AI 命令栏是新 Shell 的核心创新，固定在内容区顶部，高度 56px。

| 页面 | Placeholder |
|------|-------------|
| 工作台 (/home) | "今天想研究什么？" |
| 研究-个股 (/analysis/:ticker) | "继续问关于 {ticker} 的问题…" |
| 策略 (/screening) | "描述你想验证的策略…" |
| 组合 (/portfolio) | "问 AI 我的组合发生了什么…" |
| 工作区 (/workspace) | "搜索设置、模型或知识…" |

**Command Bar 行为**：
1. 聚焦时弹出最近命令历史 + 收藏命令
2. 支持自然语言意图识别 → 自动路由到对应流水线
3. 输入 "研究茅台" → 跳转到 /analysis/600519 并自动启动研究
4. 输入 "我的组合风险" → 跳转到 /portfolio 并加载风险视图
5. 支持 ⌘K (Ctrl+K) 全局唤起

---

# 四、工作台 Homepage 设计

**核心目标**：3 秒内让用户知道——今天发生了什么、什么值得研究、我需要做什么。

禁止做传统 Dashboard 数据墙。首页是 AI-first 的决策入口。

## 页面结构（自上而下）

### A. Global AI Command Bar（常驻顶部）

- 位置：内容区顶部，固定不动
- 尺寸：全宽，高 56px，P0 视觉
- 信息：搜索输入框 + AI 交互主入口
- 交互：点击聚焦 → 弹出最近/收藏命令 + 意图路由
- 数据来源：用户输入 → intent_router
- 点击后去哪里：根据意图进入研究/策略/组合等
- 空状态：placeholder 指导
- 加载状态：N/A
- 错误状态：N/A

### B. Market Pulse 条（市场脉搏）

- 位置：命令栏下方，首行
- 尺寸：横向通栏，P0 视觉
- 信息：3 个核心指数（上证/深成/创业板）迷你图 + 情绪计（贪婪-恐惧刻度）
- 交互：点击指数进入指数详情；情绪计 hover 显示刻度
- 数据来源：`/api/market/overview`
- 点击后去哪里：相关指数分析页
- 空状态："市场数据加载中…"
- 加载状态：骨架屏（3 个矩形块闪烁）
- 错误状态：显示可用数据 + "部分数据源暂不可用"

### C. 今日值得研究（AI 推荐）

- 位置：Market Pulse 下方左侧
- 尺寸：中等，P0 视觉
- 信息：AI 每天基于涨停池/资金流/公告/板块轮动自动生成 3 个"值得研究的目标"
- 交互：每个卡片含：标的名、一句话理由、信号强度、"一键进入研究"按钮
- 数据来源：市场雷达 + intent_router（AI 后端自动推荐）
- 点击后去哪里：/analysis/{ticker}
- 空状态："AI 正在分析今日市场…请稍候"
- 加载状态：3 个骨架卡片
- 错误状态："推荐服务暂不可用"

### D. Decision Inbox（决策收件箱）

- 位置：Market Pulse 下方右侧
- 尺寸：中等，P0 视觉
- 信息：需要用户拍板的悬置项——待审报告/待批准调仓/待确认风险警报/待投票议案
- 交互：每项显示类型/标的/影响级别/截止时间；点击进入详情
- 数据来源：`/api/dashboard/decision-inbox`
- 点击后去哪里：对应研究/组合/论文详情页
- 空状态："今天没有需要复核的决策 🎉"
- 加载状态：3 行骨架
- 错误状态：降级为无收件箱

### E. 我的研究任务

- 位置：中部
- 尺寸：小，P1 视觉
- 信息：正在进行/未完成的研究任务列表
- 交互：显示任务名/状态/最后更新时间；点击进入
- 数据来源：本地 memory + 后端 sessions
- 点击后去哪里：/analysis/{ticker} 或 /assistant
- 空状态："还没有开始研究，输入一个公司名称试试"
- 加载状态：N/A
- 错误状态：N/A

### F. 自选股票简表

- 位置：左下侧
- 尺寸：小，P1 视觉
- 信息：最近 6-8 只自选股：代码、名称、价格、涨跌幅、AI 状态标签
- 交互：点击进入个股研究；拖拽排序
- 数据来源：本地 watchlist + `/api/instruments/{symbol}/snapshot`
- 点击后去哪里：/analysis/{ticker}
- 空状态："添加第一只自选股"
- 加载状态：骨架行
- 错误状态：显示已缓存数据

### G. Portfolio Risk 摘要

- 位置：右下侧
- 尺寸：小，P2 视觉
- 信息：组合总盈亏 + VaR/ES + 最大回撤 + 分散化指标
- 交互：点击进入组合中心
- 数据来源：`/api/portfolio/{id}/pnl` + 本地计算
- 点击后去哪里：/portfolio
- 空状态："创建第一个组合以查看风险分析"
- 加载状态：骨架卡片
- 错误状态："组合数据加载失败"

---

# 五、AI Research Workspace 设计

这是整个产品最重要的页面。吸收 Chat、ResearchWorkspace、Research、StockAnalysis、Discussion、Thesis、部分 Compare。

**布局：三栏工作台**

```
┌─────────────────────────────────────────────────────────────────────┐
│ [🔍 今天想研究什么？]  Command Bar                                   │
├─────────────┬──────────────────────────────┬────────────────────────┤
│ LEFT (260px)│ CENTER                        │ RIGHT (360px)         │
│ 会话/项目树  │ AI 对话 / 研究过程              │ 研究资产面板            │
│             │                              │                        │
│ 📁 茅台研究  │ [AI] 帮我研究贵州茅台的…       │ [Tab] 报告  证据链 论文  │
│ 📁 英伟达    │   → 🏢 商业模式分析师 🏃 运行中  │                        │
│ 📁 宁德时代  │   → 📊 财务分析师 ✅ 完成        │ ┌──────────────────┐   │
│             │   → 🔬 行业研究员 ⏳ 等待       │ │ 综合评分: +45     │   │
│ + 新研究    │   → 🛡️ 风险评估师 ⏳ 等待       │ │ 看好 ✅            │   │
│             │                              │ │ 技术面偏强 ⬆      │   │
│ [Filter]    │ [AI] 📝 正在整合报告…           │ └──────────────────┘   │
│ [Sort]      │                              │                        │
│             │ ┌─ Artifact Card ────────┐   │ [核心发现 1]            │
│             │ │ Company Brief          │   │   source: 腾讯财经      │
│             │ │ 上次更新: 2分钟前        │   │   as_of: 2026-08-20   │
│             │ └────────────────────────┘   │   quality: FACT ✅     │
│             │                              │                        │
│             │ [输入框] [发送] [停止] [重新生成]│ [Investment Committee] │
│             │                              │   → 发起投委会          │
│             │                              │ [加入自选] [加入组合]    │
└─────────────┴──────────────────────────────┴────────────────────────┘
```

**模式切换**（顶部 Tab，同一工作台视图重排，不跳转）：
- **对话模式**（默认）：中心栏显示 AI 连续对话流
- **报告模式**：中心栏展开结构化 13 章报告
- **论文模式**：中心栏展开投资论文
- **比较模式**：中心栏并排显示多标的对比

**完整用户旅程**：
1. 用户输入"宁德时代这轮下跌是机会吗？"
2. AI 即时回复带引用的推理
3. 回复末尾渲染"一键生成报告"按钮 + "发起投资委员会"按钮
4. 点击生成报告 → 4 Agent 在对话流中出场（AgentStatusCard 逐个转态）
5. 报告生成后右栏 Report Tab 展开（13 章骨架，可分章折叠）
6. 拖选关键证据 → "固定为证据" → 进入 Evidence Tab
7. 在证据链上点"从证据创建投资论文" → 论文初稿自动生成
8. 论文定稿 → "进入跟踪" → 挂到组合/监控队列

---

# 六、Research Artifact 系统

AI 输出不再是聊天文本，而是结构化 Artifact。

## 6.1 Artifact 类型定义

| Artifact | UI形式 | 信息结构 | 操作按钮 | 数据来源 | 生命周期 |
|----------|--------|---------|---------|---------|---------|
| **Company Brief** | 紧凑卡片 | 行业/市值/PE/PB/信号摘要 | 进入研究 / 加自选 | instruments API | 临时→研究完成归档 |
| **Research Report** | 多章节可折叠 | 结论→Confidence→更新时间→核心发现→Evidence→Next Actions | 导出(md/html/pdf) / 发起投委会 / 加入组合 | research API (13章) | 创建→持续更新→版本化 |
| **Evidence** | 树形嵌套卡片 | 结论→来源→as_of→quality → CitationDetails | 固定/取消/展开工具日志 | evidence + provenance | 活跃→被归档→被挑战 |
| **Risk List** | 红色高亮列表 | 风险项→影响级别→置信度→缓解建议 | 添加到监控 / 查看证据 | research风险章节 | 活跃→被解决/升级 |
| **Valuation** | 数据表格+图 | 估值区间→DCF/PE/PB→安全边际 | 运行回测 / 发起讨论 | verify_valuation | 实时更新 |
| **Thesis** | 论点卡片 | 论点→支撑/反对证据→漂移状态→最近更新 | 挑战/漂移核验/进入跟踪 | thesis API | 创建→活跃→漂移→失效 |
| **Strategy** | 策略卡片 | 参数→回测结果→夏普/最大回撤→验证 | 加入组合 / 复制参数 | backtests API | 创建→验证→应用 |
| **Portfolio Action** | 操作卡 | 动作(加仓/减仓/设警)→标的→置信度→依据 | 确认执行 / 拒绝 / 详情 | portfolio API | 提议→确认→已执行 |

## 6.2 Research Report Artifact 卡片详细设计

```
┌──────────────────────────────────────────────────┐
│ 📊 研究报告: 贵州茅台 (600519)                    │
│                                                  │
│ ┌─ 顶部 ──────────────────────────────────────┐  │
│ │ 结论: 看好  Confidence: 85%                  │  │
│ │ 更新时间: 2026-08-20 14:30                    │  │
│ │ 来源: 4 Agent 并行 + team-lead               │  │
│ └─────────────────────────────────────────────┘  │
│                                                  │
│ ┌─ 核心发现 ──────────────────────────────────┐  │
│ │ 1. 商业模式稳健 (🏢 置信度: HIGH)            │  │
│ │    → source: 腾讯财经 / as_of: 2026-08-20    │  │
│ │    → quality: FACT ✅                        │  │
│ │                                               │  │
│ │ 2. 估值合理偏贵 (📊 置信度: MEDIUM)          │  │
│ │    → source: verify_valuation / 32.5 PE      │  │
│ │    → quality: INFERENCE ⚡                   │  │
│ └─────────────────────────────────────────────┘  │
│                                                  │
│ ┌─ Evidence 展开区 ───────────────────────────┐  │
│ │  [EvidenceChip: FACT] 毛利率 91.3%           │  │
│ │    → provider: 东方财富 / as_of: 2026Q2      │  │
│ │    → calculation: TTM(过去4季)               │  │
│ │    → [展开工具日志]                           │  │
│ └─────────────────────────────────────────────┘  │
│                                                  │
│ [Next Actions]                                   │
│ [发起投资委员会] [加入自选] [加入组合] [导出报告]    │
└──────────────────────────────────────────────────┘
```

---

# 七、Evidence UX 设计

## 7.1 现有 Evidence 体系（直接复用，不重发明）

系统已实现 `FACT/INFERENCE/MODEL_OUTPUT/UNKNOWN` 四级分类，以及 `CitationDetails`（4态：OK/PARTIAL/UNKNOWN/UPSTREAM_ERROR）、`ResultLayer`（summary/evidence/method 三层）、`Provenance` 追踪。这些是核心资产，必须强化可视化。

## 7.2 EvidenceChip 设计

```
Props:
  kind: 'fact' | 'inference' | 'model_output' | 'unknown'
  label: string          // 中文标签
  color: string          // CSS token 颜色
  onClick?: () => void   // 点击展开 EvidenceDrawer
```

颜色映射：
- `fact` → 蓝色 `--color-evidence-fact` #2563eb
- `inference` → 琥珀色 `--color-evidence-inference` #d97706
- `model_output` → 紫色 `--color-evidence-model-output` #7c3aed
- `unknown` → 灰色 `--color-evidence-unknown` #6b7280

## 7.3 EvidenceDrawer（右侧抽屉）

点击 EvidenceChip 后从右侧弹出，显示完整证据溯源：

```
┌─ 证据详情 ─────────────────────────┐
│                                      │
│ 类型: FACT (数据点·可验证事实)       │
│ 内容: 贵州茅台毛利率 91.3%           │
│                                      │
│ ┌─ 来源 ─────────────────────────┐  │
│ │ provider: 东方财富              │  │
│ │ as_of: 2026-08-20              │  │
│ │ source_url: https://...        │  │
│ │ quality: OK                    │  │
│ └────────────────────────────────┘  │
│                                      │
│ ┌─ 计算方法 ─────────────────────┐  │
│ │ TTM (过去4个季度累计)           │  │
│ │ 营收: 837.2亿 / 总成本: 72.8亿 │  │
│ │ 毛利 = (837.2 - 72.8) / 837.2 │  │
│ └────────────────────────────────┘  │
│                                      │
│ ┌─ 工具日志 ─────────────────────┐  │
│ │ tool: verify_valuation         │  │
│ │ call_id: abc123                │  │
│ │ latency: 1.2s                  │  │
│ │ [展开完整请求/响应]              │  │
│ └────────────────────────────────┘  │
│                                      │
│ [关闭]                               │
└──────────────────────────────────────┘
```

**普通用户看到**：一句结论 + 来源 + 时间
**专业用户展开后**：provider + as_of + calculation + tool_log

## 7.4 EvidenceTree（证据树）

在 Research Artifact 的"证据链"Tab 中，所有证据按逻辑树组织：
```
结论: 看好茅台
├─ [FACT] 毛利率 91.3% (东方财富 2026Q2)
├─ [INFERENCE] 估值偏贵 PE 32.5x (verify_valuation)
├─ [MODEL_OUTPUT] DCF 目标价 1380 (calculate_by_financial_rigor)
└─ [UNKNOWN] 管理层换帅影响 (无可靠来源)
```

---

# 八、Investment Committee 设计

将 Discussion 重构为 Investment Committee（投资委员会）。属于 Research Workspace，不占一级导航。

## 8.1 常设角色

| 角色 | 图标 | 定位 | 核心关注 |
|------|------|------|---------|
| 价值投资官 | 💰 | 锚定内在价值与安全边际 | 内在价值/安全边际/护城河 |
| 财务分析官 | 📊 | 看基本面质量 | 财务报表/盈利质量/现金流 |
| 行业分析官 | 🔬 | 看景气周期与竞争格局 | 行业周期/产业链/对标 |
| 技术分析官 | 📈 | 看价格结构与择时 | K线/均线/量价关系 |
| 风险官 | 🛡️ | 专职唱反调，压力测试 | 反向论点/最坏情景/黑天鹅 |

## 8.2 会议流程

### 会议前
- 用户提交提案 → AI 自动生成议程（议题/子问题/各官主攻方向/预计时长）
- 用户确认议程后"正式开会"

### 会议中
```
┌─ 投资委员会 ──────────────────────────────────┐
│ 议题: 宁德时代当前是否值得买入                  │
│                                                │
│ 🔬 行业分析官 (先发言):                         │
│ "动力电池行业处于景气上行期，但产能过剩风险…"     │
│   confidence: 72%                              │
│   evidence: [行业产能数据] [锂价趋势]            │
│                                                │
│ 📊 财务分析官:                                  │
│ "毛利率承压但现金流健康，研发投入持续增长…"       │
│   confidence: 68%                              │
│                                                │
│ 💰 价值投资官:                                  │
│ "当前 PE 18x 合理，但安全边际不足…"             │
│   confidence: 55%                              │
│                                                │
│ 🛡️ 风险官: (对价值官施压)                       │
│ "若行业景气下行30%，安全边际还成立吗？"          │
│   → 价值官必须回应                              │
│                                                │
│ 📈 技术分析官:                                  │
│ "均线空头排列，短期不宜追高…"                   │
│   confidence: 60%                              │
│                                                │
│ ── 投票 ──                                     │
│ 看多: 💰 55%  📊 68%  🔬 72%                  │
│ 看空: 🛡️ 40%                                  │
│ 中性: 📈 60%                                   │
│                                                │
│ ── 主席总结 ──                                 │
│ "建议: 观望。行业景气但估值偏高，等回调至15x PE"  │
│                                                │
│ [生成投资论文] [加入组合] [设置条件警报]          │
└────────────────────────────────────────────────┘
```

### 会议后
输出：Consensus（共识点）+ Disagreement（分歧点）+ Critical Unknowns（关键未知）+ Decision（决策建议）+ Next Action（下一步动作）

---

# 九、Portfolio Center 设计

结合当前 Portfolio、PortfolioRiskWorkbench、Alerts、Decision Inbox、Thesis。

## 9.1 页面结构

```
┌─ 组合中心 ──────────────────────────────────────────────┐
│                                                          │
│ [Overview] [Holdings] [Risk] [Thesis Changes] [Alerts]  │
│                                                          │
│ ┌─ Overview Tab ─────────────────────────────────────┐  │
│ │                                                     │  │
│ │ ┌─ 持仓分析 ─────────────────────────────────────┐ │  │
│ │ │ 茅台: +3.2%  AI观点: 持有 ✅ (置信度: 78%)      │ │  │
│ │ │ 宁德: -8.5%  AI观点: 观察 ⚠️ (置信度: 65%)     │ │  │
│ │ └────────────────────────────────────────────────┘ │  │
│ │                                                     │  │
│ │ ┌─ AI Suggestions ──────────────────────────────┐  │  │
│ │ │ "建议减仓宁德: 行业景气下行 + VaR陡升"          │  │  │
│ │ │ confidence: 65%  [查看证据] [发起投委会]        │  │  │
│ │ └────────────────────────────────────────────────┘  │  │
│ │                                                     │  │
│ │ [创建组合] [添加持仓] [导出]                         │  │
│ └────────────────────────────────────────────────────┘  │
│                                                          │
│ ┌─ AI Command Bar ─────────────────────────────────┐    │
│ │ "问 AI 我的组合发生了什么…"                         │    │
│ └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

## 9.2 从研究到组合的闭环

研究完成后，页面底部固定动作栏：

| 操作 | 按钮 | 目标 |
|------|------|------|
| 加入自选 | [加入自选] | watchlist 表 |
| 加入组合 | [加入组合] | portfolios 表 |
| 创建投资论文 | [创建 thesis] | thesis 表 |
| 设置条件警报 | [创建 alert] | alerts 表 |
| 发起投委会 | [发起投委会] | discussion rooms |

---

# 十、Strategy Area 设计

重新整理 Screening、StrategyLab、Alpha。不全部给新手看到。

## 10.1 策略流程

```
Idea → Universe → Backtest → Validation
```

## 10.2 新手版 vs 专业版

| 维度 | L1 新手 | L2 普通 | L3 专业 |
|------|---------|---------|---------|
| 选股器 | ❌ 隐藏 | ✅ 基础 | ✅ 高级（多因子） |
| 策略实验室 | ❌ 隐藏 | ✅ 快速模式 | ✅ 完整参数 |
| Alpha 因子 | ❌ 隐藏 | ❌ 锁定预览 | ✅ 完整 |

**快速模式**（L2 策略实验室）只显示 3 个参数：标的/日期范围/均线窗口。其余参数折叠在"高级设置"内。

**完整模式**（L3 策略实验室）显示全部 10+ 参数：标的/日期/均线窗口/资金/佣金/滑点/印花税/最低佣金/最大回撤止损/基准。

---

# 十一、三级 Progressive Disclosure 设计

不要创建三套页面。使用 progressive disclosure，不使用 route duplication。

## 11.1 首页三级

| 层级 | 可见模块 |
|------|---------|
| L1 新手 | AI Command Bar + Market Pulse + 今日值得研究 + Decision Inbox（精简） |
| L2 普通 | + 自选股票简表 + 研究任务列表 |
| L3 专业 | + Portfolio Risk 摘要 + 系统统计（折叠） + Alpha 信号流 |

## 11.2 研究工作区三级

| 层级 | 可见模块 |
|------|---------|
| L1 新手 | 对话 + 报告 Tab |
| L2 普通 | + 证据链 + 投资论文 Tab |
| L3 专业 | + Agent 调用详情面板 + 工具日志（折叠） |

## 11.3 组合中心三级

| 层级 | 可见模块 |
|------|---------|
| L1 新手 | 持仓概览 + 盈亏 |
| L2 普通 | + VaR/ES 风险仪表 + 论文关联 |
| L3 专业 | + 因子暴露分析 + 相关性矩阵 + 影子交易对比 |

**实现方式**：使用 `readProfessionalPreferences().professionalLevel` 状态，结合 CSS/JS 条件渲染。页面结构不变，通过 `display:none` / `collapsed` / `hidden` 控制元素显示。

---

# 十二、Design System Component Map

## 12.1 现有组件处置决策

| 组件 | 处置 | 说明 |
|------|------|------|
| TaskPageHeader | **KEEP** | 核心布局原语，5+ 页面使用 |
| ResultLayer | **KEEP** | 核心设计模式(summary/evidence/method) |
| CitationDetails | **KEEP** | 证据溯源核心 |
| StreamingText | **REFACTOR** | 增强为 Markdown 流式，加 aria-live |
| ChatMessageBubble | **REFACTOR** | 内联 style→CSS tokens |
| RoleAvatar | **KEEP** | Agent 状态可视化 |
| ResearchTimeline | **KEEP** | 研究活动时间线 |
| StrategySetup | **KEEP** | 策略预设选择 |
| BacktestSummary | **KEEP** | 回测结论摘要 |
| PortfolioRiskWorkbench | **REFACTOR** | 476行巨型组件，拆分为子模块 |
| StockChart | **KEEP** | K 线图 |
| MarketMoversPanel | **MERGE** | 合并到 MarketInsightPanel |
| MarketThemesPanel | **MERGE** | 合并到 MarketInsightPanel |
| SwarmStatusCard | **DELETE** | 使用频率极低 |
| GlobalTaskEntry | **KEEP** | 全局 AI 任务入口 |
| ModelSelector | **KEEP** | 模型选择 |
| NotificationCenter | **KEEP** | 通知中心 |

## 12.2 下一代组件矩阵

| 新组件 | 用途 | 替换/新建 | 来源 |
|--------|------|---------|------|
| **CommandBar** | 全局 AI 命令栏 | 新建 | GlobalTaskEntry 扩展 |
| **ResearchArtifact** | 研究产出卡片 | 新建 | ResultLayer + ChatMessageBubble 扩展 |
| **EvidenceChip** | 证据类型标签 | 新建 | CitationDetails 扩展 |
| **EvidenceDrawer** | 证据详情抽屉 | 新建 | 新 |
| **AgentStatusCard** | Agent 状态卡片 | 新建 | Research 内联 AgentCard 提取 |
| **DecisionCard** | 决策收件箱卡片 | 新建 | 新 |
| **InstrumentSearch** | 标的搜索下拉 | 新建 | 替换 Dashboard/StockAnalysis/Research 三处重复 |
| **FinancialMetric** | 金融数字卡片 | 新建 | Dashboard big-screen-metric 统一 |
| **InvestmentCommittee** | 投委会视图 | 新建 | Discussion 重构 |
| **PortfolioInsight** | 组合 AI 洞察卡片 | 新建 | 新 |
| **ChatLayout** | 双栏布局外壳 | 新建 | Chat/Discussion 共享 |
| **FqButton** | 按钮封装 | 新建 | AntD Button 统一 |
| **FqCard** | 卡片封装 | 新建 | AntD Card 统一 |

## 12.3 Design Tokens

```css
/* 涨跌方向 (A股红涨绿跌唯一事实源) */
--fq-price-up:       #f23645;
--fq-price-down:     #089981;
--fq-rise-strong:    #cf1322;
--fq-fall-strong:    #3f8600;

/* 证据分层 */
--fq-evidence-fact:          #2563eb;
--fq-evidence-inference:     #d97706;
--fq-evidence-model-output:  #7c3aed;
--fq-evidence-unknown:       #6b7280;

/* AI 品牌色 */
--fq-ai-primary:     #0ea5e9;
--fq-ai-glow:        0 0 20px rgba(14,165,233,0.3);

/* 布局 */
--fq-sidebar-width:  220px;
--fq-commandbar-height: 56px;
--fq-radius-sm: 8px;
--fq-radius-md: 12px;
--fq-radius-lg: 16px;

/* 字体 */
--fq-font-display:   28px;
--fq-font-heading:   20px;
--fq-font-body:      14px;
--fq-font-caption:   12px;
--fq-font-min:       13px;  /* 绝对最小 */
```

---

# 十三、所有页面状态设计

每个核心页面必须包含以下状态（以 Research Workspace 为例）：

## 13.1 EMPTY（空状态）

```
┌──────────────────────────────────────┐
│                                      │
│      [图标: 放大镜+问号]              │
│                                      │
│    还没有开始研究                     │
│    输入一个公司名称试试              │
│                                      │
│    [示例: 贵州茅台] [示例: 苹果]      │
│                                      │
└──────────────────────────────────────┘
```

## 13.2 LOADING（加载中）

```
┌──────────────────────────────────────┐
│  [Skeleton 骨架屏闪烁]               │
│  [Skeleton 骨架屏闪烁]               │
│  [Skeleton 骨架屏闪烁]               │
│                                      │
│  加载中…                             │
└──────────────────────────────────────┘
```

## 13.3 STREAMING（AI 流式输出中）

```
┌──────────────────────────────────────┐
│  [AI 正在分析...]                    │
│  > 正在获取贵州茅台行情数据…          │
│  > 正在计算技术指标…                  │
│  > ██░░░░░░ 45%                     │
│                                      │
│  [取消] [暂停]                        │
└──────────────────────────────────────┘
```

## 13.4 SUCCESS（正常展示）

研究报告/组合/策略的标准展示态（见前文各页面设计）。

## 13.5 PARTIAL DATA（部分数据）

```
┌──────────────────────────────────────┐
│  ⚠️ 部分数据源不可用                  │
│  基本面数据: ✅ 可用                  │
│  行情数据: ✅ 可用                    │
│  新闻数据: ❌ 上游超时                │
│                                      │
│  [继续查看已加载内容]                  │
└──────────────────────────────────────┘
```

## 13.6 ERROR（错误）

```
┌──────────────────────────────────────┐
│  ⚠️ 请求失败                         │
│  错误信息: 超时或网络不可达            │
│                                      │
│  [重试] [返回首页] [联系支持]          │
└──────────────────────────────────────┘
```

## 13.7 OFFLINE（离线）

```
┌──────────────────────────────────────┐
│  🔌 当前处于离线模式                   │
│  AI 研究和实时数据不可用               │
│  可以查看已缓存的研究和本地数据         │
│                                      │
│  [查看缓存数据]                       │
└──────────────────────────────────────┘
```

## 13.8 NO MODEL（无 AI 模型）

```
┌──────────────────────────────────────┐
│  🤖 AI 模型未配置                     │
│  研究功能需要 AI 模型支持              │
│  请先在设置中配置模型凭据              │
│                                      │
│  [前往配置模型]                        │
└──────────────────────────────────────┘
```

## 13.9 NO DATA SOURCE（无数据源）

```
┌──────────────────────────────────────┐
│  📡 数据源不可用                       │
│  所有行情数据源暂时不可达              │
│  这可能是网络问题或上游服务维护         │
│                                      │
│  [重试] [查看缓存数据]                 │
└──────────────────────────────────────┘
```

---

# 十四、关键用户旅程

## Journey A: 第一次用户（目标: <10分钟完成第一次研究闭环）

| 步骤 | 页面 | 点击 | AI行为 | 用户行为 | 输出 |
|------|------|------|--------|---------|------|
| 1 | /home | 打开产品 | 自动登录(LOCAL_ONLY) | 看到欢迎语+Command Bar | 首页着陆 |
| 2 | /home | Command Bar 聚焦 | placeholder: "今天想研究什么？" | 输入"贵州茅台" | 意图识别 |
| 3 | /analysis/600519 | 跳转个股页 | 自动获取行情+K线 | 等待加载 | 行情快照 |
| 4 | /analysis/600519 | [分析股票] | 启动4 Agent 研究 | 看到 AgentStatusCard 逐个转态 | 流式报告 |
| 5 | /analysis/600519 | 阅读报告 | 输出三灯卡片(红绿灯) | 看懂结论 | 通俗结论 |
| 6 | /analysis/600519 | [加入自选] | 写入 watchlist | 确认 | 自选列表 |
| 7 | /analysis/600519 | [加入组合] | 写入 portfolio | 确认 | 持仓列表 |
| 8 | /home | 返回首页 | 决策收件箱更新 | 看到"已完成研究" | 闭环完成 |

## Journey B: 普通投资者（完整工作流）

1. 发现机会（首页推荐 / Market Pulse 异动）
2. 深度研究（/analysis/:ticker → 4 Agent）
3. 形成投资论文（Research Workspace → Thesis Tab）
4. 设定预警（Portfolio → Alert Tab）
5. 持续跟踪（AI 主动推送漂移/风险事件）

## Journey C: 专业投资者（Alpha→研究→策略→组合）

1. Alpha 因子搜索有效因子（/alpha）
2. 选股器筛选候选（/screening）
3. 深度研究标的（/analysis/:ticker → Swarm 四大师）
4. 策略验证回测（/strategy-lab）
5. 投资论文（Thesis → AI 挑战 → 漂移核验）
6. 组合执行（Portfolio → 持仓管理）
7. 定时研究自动复盘 + 决策收件箱跟踪

---

# 十五、视觉信息优先级

## 15.1 工作台首页

| 优先级 | 模块 |
|--------|------|
| P0 | AI Command Bar + Market Pulse + 今日值得研究 |
| P1 | Decision Inbox + 自选股票简表 + 研究任务 |
| P2 | Portfolio Risk 摘要 + 系统统计（折叠） |

## 15.2 AI Research Workspace

| 优先级 | 模块 |
|--------|------|
| P0 | 左侧会话树 + AI 对话流 + Command Bar |
| P1 | 右侧 Report/Evidence/Thesis Tab |
| P2 | Agent 详情面板 + 工具日志 |

## 15.3 Portfolio Center

| 优先级 | 模块 |
|--------|------|
| P0 | 持仓列表 + 总盈亏 |
| P1 | AI 建议 + 风险仪表 |
| P2 | 因子暴露 + 相关性矩阵 |

## 15.4 Strategy Lab

| 优先级 | 模块 |
|--------|------|
| P0 | 参数设置（快速模式）+ 运行回测按钮 |
| P1 | BacktestSummary（收益率/夏普/最大回撤） |
| P2 | 交易明细 + 统计显著性 + CitationDetails |

---

# 十六、Screen Spec

## Screen: AI Research Workspace

### Purpose
投资者的统一研究思考空间，将对话/研究/论文/比较收敛到一个连续的工作面。

### User Goal
从一个问题开始，经过 AI 编排，产出结构化研究报告并落地为行动。

### Layout

#### Header（Global Command Bar）
- 固定高度 56px，全宽
- placeholder: "继续问关于 {ticker} 的问题…"
- 支持 Ctrl+K 快捷唤起

#### Left Panel（260px，可折叠）
- 研究会话/项目树（按标的分组）
- 新建研究按钮
- 搜索过滤 + 排序

#### Main Panel（flex-1）
- Tab 切换：对话 / 报告 / 论文 / 比较
- 默认显示对话模式（AI 连续对话流）
- Artifact 卡片内联渲染

#### Right Panel（360px，可折叠）
- 报告 Tab：13 章结构化报告（可折叠）
- 证据链 Tab：EvidenceTree（树形嵌套）
- 论文 Tab：ThesisCard（论点+漂移状态）

### Components
AgentStatusCard / StreamingMessage / ResearchArtifact / EvidenceChip / CitationDetails / ResultLayer

### Primary CTA
[生成报告] → 启动 4 Agent 并行研究

### Secondary Actions
[加入自选] [加入组合] [发起投委会] [导出报告]

### Data Sources
instruments API / research API / thesis API / discussion API

### AI Behaviors
- 意图识别 → 自动选择研究模式（快速问答 / 深度研究 / 多视角 / Swarm）
- 4 Agent 并行执行 → AgentStatusCard 逐个转态
- team-lead 整合 → 13 章报告
- 证据审计 → FACT/INFERENCE/MODEL_OUTPUT/UNKNOWN 标注

### States
参见第十三节完整设计（EMPTY/LOADING/STREAMING/SUCCESS/PARTIAL/ERROR/OFFLINE/NO MODEL/NO DATA SOURCE）

### Progressive Disclosure
L1: 对话 + 报告 Tab | L2: + 证据链 + 论文 | L3: + Agent 详情 + 工具日志

### Existing Components Reused
TaskPageHeader / ResultLayer / CitationDetails / StreamingText / ChatMessageBubble / RoleAvatar

### Existing Components Replaced
Chat 页面 → 合并入 AI 研究中心对话模式 | Discussion 页面 → 重构为 Investment Committee

### API Dependencies
POST /research (SSE) / POST /chat/sessions/:id/messages (SSE) / POST /discussion/rooms/:id/start (SSE) / POST /swarm/analyze (SSE)

### Navigation
左侧会话树点击 → 加载对应研究上下文 | Command Bar → 意图路由

### Mobile Behaviour
左侧栏折叠为底部 Tab Bar | 右侧面板隐藏/抽屉式展开

### Accessibility
aria-live="polite" 用于流式输出 | reduced-motion: 流式退化为整段显示 | 键盘导航: Ctrl+K 打开命令栏

---

## Screen: Workbench Homepage

### Purpose
AI-first 首页，3 秒内驱动决策。

### User Goal
快速了解市场、发现研究机会、处理待办。

### Layout
单列垂直流：Command Bar → Market Pulse → 今日值得研究 + Decision Inbox（并排）→ 自选 + Portfolio Risk（并排）

### Components
CommandBar / MarketPulseStrip / AgentStatusCard / DecisionCard / FinancialMetric / WatchlistMini

### Primary CTA
Command Bar → 输入问题或标的名称

### Data Sources
market/overview API / dashboard/decision-inbox API / watchlist + instruments API

### States
参考第十三节。EMPTY: 显示欢迎语和示例气泡。LOADING: Market Pulse 骨架屏。NO MODEL: 横幅提示配置模型。

---

## Screen: Portfolio Center

### Purpose
组合管理中心 + AI 投资管家。

### User Goal
持续回答"我还该不该拿着？"

### Layout
Tab 切换：Overview / Holdings / Risk / Thesis Changes / Alerts

### Components
FinancialMetric / PortfolioInsight / PortfolioRiskWorkbench / DecisionCard

### Primary CTA
[创建组合] + [添加持仓]

### Data Sources
portfolio API / portfolio/{id}/pnl / portfolio/{id}/positions / alerts API

---

## Screen: Strategy Lab

### Purpose
量化策略的回测、验证与管理。

### User Goal
验证投资想法是否经得起历史检验。

### Layout
上下结构：参数配置（上）→ 回测结果（下）

### Components
StrategySetup / BacktestSummary / BacktestCharts / ExperimentWorkbench / BacktestFailurePanel

### Primary CTA
[运行回测]

### Progressive Disclosure
L2: 快速模式（3参数）| L3: 完整模式（10+参数）

---

# 十七、技术实现备注

## 17.1 后端不变量

- 不引入 ORM（保持 raw SQL）
- 不引入 WebSocket（保持 SSE）
- 4 条 AI 流水线 + 13 个本地工具原样保留
- 证据纪律 FACT/INFERENCE/MODEL_OUTPUT/UNKNOWN 强化为 EvidenceChain 表面

## 17.2 前端重构优先级

| 优先级 | 任务 | 工作量估算 |
|--------|------|----------|
| P0 | 加入自选/加入组合按钮（闭环修复） | 2-3 天 |
| P0 | 涨跌色统一（P0 配色冲突修复） | 1 天 |
| P0 | StreamingText 加 aria-live + reduced-motion | 1 天 |
| P1 | CommandBar 重构（统一 AI 入口） | 5-7 天 |
| P1 | 导航从6组收敛为5项 | 3 天 |
| P1 | 研究→组合闭环（workflow 修复） | 5-7 天 |
| P2 | 证据链表面（EvidenceChip + EvidenceDrawer） | 7-10 天 |
| P2 | 投资委员会（InvestmentCommittee 组件） | 10-14 天 |
| P2 | 新手三级模式（L1/L2/L3 progressive disclosure） | 10-14 天 |
| P3 | 术语 tooltip 系统 | 3-5 天 |
| P3 | 传统 Dashboard 重构为 AI-first 首页 | 7-10 天 |

## 17.3 必须同步更新的文档

| 文档 | 触发条件 |
|------|---------|
| `docs/API_CONTRACT.md` | 新增/修改 API endpoint |
| `docs/ARCHITECTURE.md` | 新增路由或组件架构变更 |
| `docs/HANDOVER.md` | 修复已知 bug |
| `CLAUDE.md` | 修改启动命令或项目结构 |

---

> **规格书完成**。覆盖 19 个章节，基于 http://127.0.0.1:5173 实测截图 + 完整源码逆向 + 已有产品蓝图。
>
> 交付对象：Product Designer（组件/布局/状态设计）、Frontend Engineer（技术栈/组件矩阵/Token）、AI Coding Agent（API 依赖/状态机/渐进式复杂度规则）。
