# FinQuant Hub UI 优化规划 — FinQuant Research OS

> 状态：`[APPROVED]` — 维护者已确认，供 Codex/ChatGPT Goal 模式执行
> 日期：2026-08-24
> 依据：ChatGPT UI 深度反馈（`reference/GPT-generated-UI/docx/gpt反馈.md`）+ GitHub Stars skill 项目精华（`reference/ui-design-skills/`）+ 现有架构约束
> 维护者决策记录：① 确认删除独立页面并入 Research；② 确认支持中英文双语切换（网页含两种语言，可切换）

---

## 〇、核心理念

**当前问题**：功能碎片化 — 用户不得不在 17 个功能页面之间跳转。
**目标形态**：以研究对象为核心，Agent 为常驻操作层，证据为底层，Monitor 形成闭环的**金融研究操作系统**。

> 一句话：不是"用 20 个金融工具"，而是在一个持续理解你的研究对象、投资假设、证据、组合和监控任务的智能工作空间中工作。

**核心工作流**（唯一一条）：
`发现 → 研究 → 建立 Thesis → 验证 → 进入组合/观察池 → 持续监控 → 变化触发 → 回到研究`

**五种核心对象**：
| 对象 | 含义 |
|------|------|
| Entity | 股票、公司、ETF、行业、主题、事件 |
| Research Case | 针对某个对象形成的持续研究上下文 |
| Thesis | 当前投资假设、证据、反证、催化剂 |
| Monitor | 未来持续运行的观察条件 |
| Experiment | 策略、因子、回测、情景分析 |

---

## 一、架构约束（不可违反）

源自 `AGENTS.md` / `HANDOFF.md` 不变量：

1. **无 ORM、无连接池、无独立 DAL** — 全部 aiosqlite raw SQL
2. **无 WebSocket** — 实时走 SSE
3. **纯 CSR** — 无 SSR，Vite dev proxy / static prod
4. **不新增 npm/Python 依赖** — 设计系统纯 CSS `--fq-*` tokens
5. **不改 `reference/`** — 只读
6. **删除走回收站** — 禁 rm/del
7. **改端点同步文档** — `docs/API_CONTRACT.md`、`docs/ARCHITECTURE.md`
8. **提交前跑全量门禁** — pytest + ruff + bun build
9. **不改后端 schema 主路径** — UI 层改动优先，后端只做必要的只读聚合

**Codex 执行须知**：本规划全部是前端 UI 层改动 + 文档同步。涉及后端时仅在既有能力内做只读适配，不新增表。

---

## 二、设计依据（来自 skill 项目精华）

以下规则来自我 Stars 收藏的高价值项目，已筛选出适用于 FinQuant Hub 的部分：

### 2.1 反 AI Slop 硬规则（来自 taste-skill）
- `min-h-[100dvh]` 替代 `h-screen`（修复 iOS Safari 跳动）
- CSS Grid 替代 flex 百分比数学
- 禁止纯黑 `#000000`，用 off-black
- 禁用 em-dash 过度使用
- 不出现"AI 紫渐变"默认美学
- 不出现三列等宽卡片堆砌
- Loading/Empty/Error 三态必须实现
- 禁止 `window.addEventListener('scroll')` 做动画

### 2.2 设计 Token 规范（来自 design.md / huashu-design）
- DESIGN.md 格式：YAML front matter（机器可读 tokens）+ Markdown body（设计理由）
- prose（叙述）比 tokens（数值）更重要 — "1970年代研究生讲义"比"现代、干净、可信"更有效
- WCAG AA 对比度内置检查（4.5:1）
- 品牌资产协议：问 → 搜 → 下载 → grep 色值 → 固化 brand-spec.md

### 2.3 金融终端视觉（来自 ChatGPT 反馈 §19 + diagram-design）
- **行情颜色与系统状态颜色严格分离**（中国市场红涨绿跌，美市绿涨红跌）
- 低装饰、较高信息密度、稳定空间位置
- 大圆角 → 小圆角（6-8px）
- 尽量不用 card shadow
- 表格/图表/时间线/证据/事件流是"第一等组件"，Card 不是

### 2.4 Agent UI 状态机（来自 ChatGPT 反馈 §21 + AG-UI）
统一状态：`IDLE → PLANNING → WAITING_FOR_APPROVAL → RUNNING → WAITING_FOR_INPUT → VERIFYING → COMPLETED / FAILED / CANCELLED`
- 不暴露"思维链"，只暴露可验证操作（"Searching CNINFO"、"Reading 2025 Annual Report"）
- Agent 提案用结构化 ACTION_PROPOSAL + 用户 Approve/Edit/Reject

---

## 二点五、中英文双语切换设计（i18n）

**维护者决策**：网页含中英文两种语言，支持用户切换。这是横切所有 Phase 的基础能力，**在 Phase 0 一并落地**。

### 2.5.1 技术方案（不新增依赖）

前端当前无 i18n 库（`package.json` 仅 antd 相关）。架构约束禁止新增 npm 依赖，因此采用**纯前端自建轻量 i18n**：

```
frontend/src/i18n/
├── index.ts              # 初始化 + 语言切换 + 持久化
├── LanguageContext.tsx    # React Context + useLanguage hook
├── zh.ts                 # 中文语言包（key: 中文文案）
└── en.ts                 # 英文语言包（key: 英文文案）
```

**机制**：
- 语言包：`Record<string, string>` 扁平 key，形如 `nav.today` / `nav.research` / `entity.snapshot` / `agent.fast`
- Context：`LanguageProvider` 包裹应用，提供 `t(key)` 翻译函数 + `lang` + `setLang`
- 持久化：`localStorage.finquant_lang`（`zh` / `en`），默认跟随浏览器 `navigator.language`
- 切换入口：顶部 Command Bar 右侧或侧栏 `中/EN` 切换按钮
- AntD 组件：`ConfigProvider` 的 `locale` 同步切换（`zhCN` / `enUS`）

### 2.5.2 范围要求

- **导航菜单**：8 个一级导航 + 所有二级项中英双语
- **页面文案**：页面标题、按钮、空状态、错误提示、Agent 状态、证据/来源标签
- **金融术语**：保留中文习惯（红涨绿跌说明双语），`Bull/Base/Bear` 等英文术语在 zh 中可保留英文原词+中文解释
- **不翻译**：ticker、公司名、数字、价格、日期格式（但日期格式随 locale 调整）

### 2.5.3 验证

- 切换 zh ↔ en 后所有导航、页面标题、按钮即时更新，无刷新丢失
- `localStorage.finquant_lang` 持久化，刷新保持
- AntD 组件本地化同步（DatePicker、Table 分页等）
- 390px 窄屏下双语文案无溢出

---

## 三、阶段规划总览

| 阶段 | 名称 | 优先级 | 内容 | 页面数变化 |
|------|------|--------|------|-----------|
| **Phase 0** | Global Shell | P0 | 三栏布局 + 8 导航 + Command Bar + **i18n 双语** | 17 → 8 |
| **Phase 1** | Research Workspace | P0 | Entity 页头 + Thesis 对象 + Evidence UI | — |
| **Phase 2** | Monitor + Today | P1 | Monitor 一级化 + Today 重做 | — |
| **Phase 3** | Strategy/Discover/Portfolio | P1 | 三模块归位重做 | — |
| **Phase 4** | 视觉 Token 收敛 | P2 | --fq-* 全站统一 + 反 slop 审计 | — |

### 2026-08-25 执行快照

- Phase 0–3：结构、路由、双语与主链交互已实现；Research 内的 Fast、Deep Research、Review 与完整 Thesis v2 已由占位入口替换为真实能力。Deep 现按真实 Agent 状态展示 Plan/Progress/Activity，Review 仅保留结构化委员会结果；Compare 行级 Ask Agent、Entity Watch、Evidence → Thesis ticker/claim 预填、Discover `query` 消费及 Portfolio → Thesis 上下文均已接通。2026-08-29 对运行中 OpenAPI 与后端调用方复审后，研究相关合同仍只有创建/读取/导出及 Scheduled Research Run，未提供 pause/resume/change-scope；Deep Pause / Change scope 因此继续保持诚实禁用。最终截图矩阵仍未完成，Phase 状态继续为 `[BLOCKED]`。
- Phase 4：radius/shadow、系统/行情颜色语义、13 个第一等组件与核心反 slop 项已完成；CSS token 定义外与 TS/TSX 硬编码色值均已收敛为 0，canvas 图表通过运行时 token 解析保持语义，RoleAvatar 与 Deep Research 角色均不再使用 emoji 占位。模型管理、MCP 市场、登录、通知中心以及活跃共享组件的剩余文案已进入统一字典；zh/en 各 2,202 keys、无重复/差异。Today 近期会话/讨论已使用原生链接，Thesis 列表已提供键盘原生“打开”按钮；右上角系统状态现在先显示检查中，仅在 `/api/health` 明确返回 `ok` 后显示 `System OK`，失败时显示状态未知。活跃导入图 130 个文件的代码级复扫已把可见表单控件无显式可访问名称缺口从 9 收敛为 0。
- 最新生产构建通过（4,231 modules）；最终全量 64/64 files、203/203 tests 通过（487.37s）；token 对比度 58/58 通过，最低 4.50:1。不可达的旧版 13 章个股页已从编译路径移除，`StockAnalysis` 产物由 196.67 kB / 63.07 kB gzip 降至 179.87 kB / 57.32 kB gzip。2026-08-29 最新复验中，`http://localhost:5173/` 返回 HTTP 200，固定端口 8000 已恢复为 OpenAPI `FinQuant Hub`（134 paths），直连与 5173 代理 `/api/health` 均为 `status=ok` / `db=wal`；经 5173 代理抽样的 Today、Research、Discover、Strategy、Portfolio、Monitor、Library、Settings 共 20/20 个只读 API 全部返回 HTTP 200，且按前端实际消费契约复核的顶层 JSON 结构 20/20 通过。八个一级页面、六个被合并的旧页面及两个系统工具路由共 16/16 个真实 5173 地址均返回标题 `FinQuant Hub` 的 HTTP 200 HTML，未出现 Vite error overlay 标记。24 张 `ui-final-20260825-*` 文件均为真实 PNG，但其中 23 张实际编码为 375×812，仅 1 张为 390×844，不能作为完整的精确 390px 门禁；既有截图也早于部分可见修正。Research/Entity/Deep/Review/Compare/Thesis、Discover、Library/Settings、全部 1440 与完整渲染态 WCAG 仍未完成。

> ChatGPT 明确建议：**第一阶段优先完成 Global Shell → Research Workspace → Persistent Agent Rail → Evidence System → Monitor**。这五部分完成后体验发生数量级变化，其余自然挂到同一对象模型上。

---

## Phase 0 — Global Shell（P0，最高优先）

### 目标
把"功能碎片化页面"变成"持续存在的金融 Agent 工作空间"。

### 0.1 一级导航重构（17 页 → 8 工作空间）

| 新一级导航 | 中文 | 作用 | 当前功能映射 |
|-----------|------|------|-------------|
| **Today** | 今日 | 今天发生什么、什么需要处理 | 今日概览（重做） |
| **Research** | 研究 | 公司/资产/主题研究 | 研究工作区 + 个股分析 + 深研 + 问答 + 多视角 + 论文 + 比较 |
| **Discover** | 发现 | 找机会 | 选股器 + Alpha 因子 |
| **Strategy** | 策略 | 验证交易/投资假设 | 策略实验室 |
| **Portfolio** | 组合 | 持仓、风险、归因 | 投资组合 |
| **Monitor** | 监控 | 一切持续监控 | 预警中心（升级） |
| **Library** | 资料库 | 所有研究资产 | 知识库 + 论文 + 报告 + 实验 |
| **Settings** | 设置 | 系统能力 | 模型 + MCP + 系统设置 |

**删除的独立页面**（✅ 维护者已确认——成为 Research 内能力）：快速问答、深度研究、多视角审查、投资论文
**降级为设置**：MCP 工具市场、模型管理（不再占主导航认知空间）

> **导航双语显示**：导航标签 `nav.today`/`nav.research`/… 在 zh 显示"今日/研究/…"，en 显示"Today/Research/…"。金融术语 Bull/Base/Bear 等 zh 模式保留英文原词 + 中文说明。

### 0.2 三栏式工作空间 Shell

```
┌────────────┬────────────────────────────────────┬───────────────┐
│            │ Global Command Bar                 │               │
│ Left Nav   ├────────────────────────────────────┤ Agent Rail    │
│            │                                    │  Plan         │
│ Today      │                                    │  Activity     │
│ Research   │          Main Canvas               │  Sources      │
│ Discover   │                                    │  Tasks        │
│ Strategy   │                                    │               │
│ Portfolio  │                                    │               │
│ Monitor    │                                    │               │
│ Library    │                                    │               │
│            │                                    │               │
├────────────┴────────────────────────────────────┴───────────────┤
│ Contextual Ask / Command Composer                              │
└─────────────────────────────────────────────────────────────────┘
```

**推荐尺寸**（桌面 1440+）：
| 区域 | 尺寸 |
|------|------|
| 左侧 Navigation | 224px（折叠 64-72px） |
| Agent Rail | 360-400px |
| Main Canvas | Flex |
| 顶部 Command Bar | 48-56px |

### 0.3 Global Command Bar 升级

当前只是搜索框，应成为产品统一入口。输入识别：
- `600519` → 打开证券
- `比较贵州茅台和五粮液最近三年的ROIC` → 创建 Compare Research
- `监控长鑫科技IPO进展，每12小时检查一次` → 生成 Monitor 草案
- `筛选过去3年ROE>15%，负债率<40%，PE<30的A股` → 进入 Discover 生成 filters
- `回测贵州茅台 MA20/MA50 过去5年` → 进入 Strategy

### 0.4 系统状态降级

- **正常**：右上角 `● System OK`
- **降级**：右上角 `◐ Data delayed`
- **真正阻塞**：页面内 Alert
- 详细状态 → 点击 System Status 进入

### 0.5 Model Selector 降级

- 左下角不再显示"DeepSeek Flash"（技术实现泄漏）
- 改为：`Fast / Analyst / Deep Research`（后台映射模型）
- 高级用户：`Advanced → Override model`

### 验收标准
- [ ] 左侧导航为 8 组，17 个旧页面按映射归位
- [ ] 三栏 Shell 在 1440px 桌面正常布局，390px 窄屏无横溢出
- [ ] Command Bar 能识别 5 种输入并跳转到对应工作空间
- [ ] 系统状态仅在右上角，不再霸占主页面
- [ ] `bun run build` 通过，前端测试全过
- [ ] Codex 内置浏览器逐页截图验证

---

## Phase 1 — Research Workspace（P0）

### 目标
把"13 个 Accordion 的长页面"变为"实体为中心的决策工作空间"。

### 1.1 Entity 页头（搜索 600519 后进入）

```
贵州茅台
600519 · SHH · 白酒
¥1,291.50  -1.25%   更新时间 10:32:14
☆ Watch  🔔 Monitor  ⇄ Compare  ⋯

Overview | Thesis | Financials | Valuation | Peers | Earnings | Price | Research
```

### 1.2 Agent 模式（替代独立页面）

```
Ask FinQuant...
[ Fast ▼ ]
Fast / Analyst / Deep Research / Review
```

Deep Research 运行中显示 Research Plan + Progress + Sources + Activity，可 Pause / Change scope。

### 1.3 Overview 首屏（决策价值最高信息）

| 区域 | 内容 |
|------|------|
| Snapshot | Price / MC / PE / PB / ROE / FCF |
| AI Brief | 5 条当前最重要判断 |
| Thesis | Bull / Base / Bear |
| Catalysts | 下一步重要事件 |
| Risk | 当前最危险反证 |
| Estimate Changes | 市场预期变化 |
| News / Filings | 最近重要事件 |

### 1.4 Thesis 数据对象化

```
THESIS
Current stance: Bullish / Neutral / Bearish
Conviction: 72/100
Core thesis: 1. 2. 3.
Evidence For: + (with source refs)
Evidence Against: - (with source refs)
Catalysts: 2026 Q3 Results / 政策变化 / 批价变化
Invalidation Rules: 若 XX < ...
```

Agent 每次研究 = 更新 Thesis，系统计算 Thesis Drift / Conviction Change / New Supporting Evidence / New Contradicting Evidence。

### 1.5 Evidence 系统 UI（第二核心）

每一个重要数字支持 `[12]` 引用，点击展开 Evidence Rail：
```
SOURCE #12
贵州茅台 2025 年年度报告
2026-03-28 · Company Filing · Primary · Page 36
"营业收入……"
Used in: Revenue growth / Base case valuation
[Open document] [Add to thesis]
```

### 1.6 Multi-Agent 改为 Review（显示分歧，不显示表演）

```
MULTI-AGENT REVIEW
Consensus: 3/4 agents agree valuation is elevated.
Disagreement:
  Industry Agent: Demand recovery probability underestimated.
  Risk Agent: Channel inventory evidence insufficient.
Unresolved Questions: 1. 2.
Evidence conflict: Source 18 ↔ Source 27
```

### 1.7 Compare 对象化

用户输入 `贵州茅台 vs 五粮液`，系统自动创建 Compare：
```
Financials | Valuation | Growth | Margins | ROIC | FCF | Estimates | Price Momentum | Management Tone | Risks
```
每行可 `Ask Agent about this row`。

### 验收标准
- [ ] `/analysis/:ticker` 页头为 Entity 卡片 + 8 个 tab
- [ ] Agent 模式切换 Fast/Analyst/Deep Research/Review 无独立路由跳转
- [ ] Thesis 块为结构化对象（stance/conviction/evidence/catalysts/invalidation）
- [ ] Evidence 引用可点击展开、可 Add to thesis
- [ ] Multi-Agent 输出 Consensus/Disagreement/Unresolved/Conflict，无"聊天室"
- [ ] Compare 支持自然语言输入自动创建
- [ ] 构建 + 测试 + 浏览器截图验证

---

## Phase 2 — Monitor 一级化 + Today 重做（P1）

### 目标
把"预警中心"升级为一级 Monitor 模块，Today 首页回答"上次打开后发生了什么"。

### 2.1 Monitor 类型（比价格预警更高级）

| 类型 | 示例 |
|------|------|
| Price | 600519 跌破 1200 |
| Technical | MA20 下穿 MA50 |
| Fundamental | 毛利率下降 > 2ppt |
| Estimate | EPS consensus 下修 > 5% |
| News | 出现监管调查 |
| Filing | 新招股书 / 问询 / 注册 |
| Thesis | 出现与 thesis 冲突的新证据 |
| IPO | 受理 → 问询 → 注册 → 发行 |
| Supply Chain | 产业链公司发生重大变化 |
| Agent Research | 每日/每12小时重新研究 |

**Monitor Card**：
```
长鑫科技 IPO Watch  HIGH PRIORITY
State: Running   Last check: 2h ago   Next check: 10h
Sources: 7   Changes: 1
New: 交易所披露新的审核文件
[Inspect] [Run now] [Edit]
```

### 2.2 Today 首页重做

**回答一个问题**："自从我上次打开 FinQuant Hub，发生了什么值得我注意？"

```
GOOD MORNING
8 月 24 日 · 中国市场开盘前
需要处理 3     Agent 运行中 2    新重大变化 5    今日事件 7
────────────────────────────────────────
需要你处理
┌ 长鑫科技 IPO 新增交易所/监管信息  Thesis impact: HIGH  [查看变化][重新研究]
┌ 宇树科技 供应链标的 XX 出现异常量价变化  [查看][忽略]
────────────────────────────────────────
My Universe: Portfolio | Watchlist | IPO Watch | Themes
市场脉搏: 指数 | 利率 | 汇率 | 商品 | 行业
Research Runs: CXMT IPO Completed / 600519 Review Running 63% / AI Chain Scan Waiting
```

### 验收标准
- [ ] Monitor 为一级导航，含 10 种 Monitor 类型的卡片
- [ ] Today 首页自上而下：处理队列 → My Universe → 市场脉搏 → Research Runs
- [ ] 系统自身状态（AVAILABLE/UNCONFIGURED）不再霸占首屏
- [ ] IPO/产业链持续监控为"一等公民"，非"价格预警"
- [ ] 构建 + 测试 + 浏览器截图验证

---

## Phase 3 — Strategy / Discover / Portfolio 归位（P1）

### 3.1 Strategy Lab：自然语言在前，高级参数在后

```
"贵州茅台日线，MA20上穿MA50买入，下穿卖出，止损8%，2018年至今。"
────────────────────
Parsed Strategy:
Entry: MA20 crosses above MA50
Exit:  MA20 crosses below MA50
Risk:  Stop loss 8%
Universe: 600519
[Run]  Advanced settings >
```
运行后立即转为 `Overview | Equity Curve | Trades | Risk | Diagnostics | Parameters`，顶部只留 `CAGR / Sharpe / MDD / Win Rate`。

### 3.2 Discover：Screener + Alpha 合并

```
Search: "找过去3年ROE>20%、FCF持续增长、估值低于5年中位数的A股"
Filter Chips: A Share / ROE > 20% / FCF CAGR > 10% / PE percentile < 50%
312 results
每个结果 → [Research] [Compare] [Add Watchlist] [Create Monitor] [Run Strategy]
```

### 3.3 Portfolio：回答"我的钱现在受到什么影响"

```
Portfolio  ¥1,291,500  Today P&L -¥8,420 (-0.65%)  [Why?]
贵州茅台 -4,120 / AI Hardware -3,100 / FX Effect -720
Risk: China Consumer 31% / Semiconductor 24% / Single name max 17%
Events: Tomorrow XX earnings / Aug 28 lock-up / Sep 03 meeting
Tabs: Overview | Holdings | Performance | Exposure | Risk | Events | Scenario | Research
```

**Portfolio ↔ Research 双向连接**：一个持仓 → 一个 Research Case → 一个 Thesis → 一组 Monitor。

### 验收标准
- [ ] Strategy Lab 首屏为自然语言输入，运行后转为结果视图
- [ ] Discover 合并选股器 + Alpha，结果行直接提供 5 种后续动作
- [ ] Portfolio 首屏为 P&L + Why + Risk + Events，非 loading shell
- [ ] 构建 + 测试 + 浏览器截图验证

---

## Phase 4 — 视觉 Token 收敛（P2）

### 目标
用 `--fq-*` tokens 统一全站视觉，消除 SaaS Dashboard 感。

### 4.1 Token 建议（参考 ChatGPT §19 + design.md）

| Token | 当前建议 | 说明 |
|-------|---------|------|
| App BG | `#F5F7FA` | 已有 `--fq-bg-page` |
| Surface | `#FFFFFF` | 已有 `--fq-surface-1` |
| Text Primary | `#101828` | 已有 `--fq-text-primary` |
| Text Secondary | `#667085` | 已有 `--fq-text-secondary` |
| Border | `#E4E7EC` | 已有 `--fq-border` |
| Accent | `#2563EB` | 已有 `--fq-ai-primary` |
| Radius | 6-8px | 当前 8-16px，收敛 |
| Card shadow | 尽量不用 | 当前 `--fq-shadow-soft` |

### 4.2 行情颜色与系统状态颜色严格分离

- **行情**：`--fq-price-up` / `--fq-price-down`（中国市场红涨绿跌）
- **系统状态**：`--fq-system-info` / `--fq-system-warning` / `--fq-system-error`
- **禁止共用** semantic color

### 4.3 第一等组件清单

| Component | 用途 |
|-----------|------|
| `MetricStrip` | Price、MC、PE 等 |
| `FinancialTable` | 财报和估值 |
| `TimeseriesChart` | 行情和基本面 |
| `CompareGrid` | 横向比较 |
| `EventTimeline` | 财报/IPO/公司事件 |
| `EvidenceCard` | 原始证据 |
| `ThesisBlock` | 正反假设 |
| `MonitorCard` | 持续任务 |
| `AgentRun` | Agent 任务 |
| `SourceChip` | 来源 |
| `StatusChip` | 状态 |
| `ActionBar` | Research / Compare / Monitor |
| `CommandComposer` | Agent 输入 |

### 4.4 反 slop 审计清单（taste-skill 预检清单改编）

- [ ] `h-screen` 全部替换为 `min-h-[100dvh]`
- [ ] 无 flex 百分比数学布局，用 CSS Grid
- [ ] 无纯黑 `#000000`
- [ ] 无 AI 紫渐变默认美学
- [ ] 无三列等宽卡片堆砌
- [ ] Loading/Empty/Error 三态齐全
- [ ] 无 `window.addEventListener('scroll')` 动画
- [ ] 按钮/表单 WCAG AA 对比度
- [ ] 颜色/形状一致性锁（单一 accent + 单一 radius 体系）

### 验收标准
- [ ] `--fq-*` tokens 全站消费，无硬编码色值残留
- [ ] 行情/系统状态颜色分离
- [ ] 13 个一级组件定义并在对应页面使用
- [ ] 反 slop 审计清单全过
- [ ] 构建 + 测试 + 浏览器截图（light/dark + 390px）

---

## 四、Codex 执行建议

### 4.1 执行顺序
```
Phase 0 → Phase 1 → Phase 2 → Phase 3 → Phase 4
```
每 Phase 独立 commit，独立验证。**Phase 0 和 Phase 1 必须先行**（ChatGPT 明确建议）。

### 4.2 每个 Phase 的交付要求
1. 代码改动（前端 pages/components/styles + 路由 + 导航）
2. 文档同步（`docs/API_CONTRACT.md` 如改端点；`docs/ARCHITECTURE.md` 如改架构；`docs/ui-current/` 截图更新）
3. 门禁验证（pytest + ruff + bun build + 前端测试）
4. **内置浏览器逐页截图**存到 `docs/ui-current/`（Codex 有浏览器/视觉能力）
5. 截图对比前后差异，记录到 Phase 验收

### 4.3 禁止事项
- 不新增 npm/Python 依赖
- 不改后端 schema / 认证 / 用户隔离
- 不改 `reference/`、`docs/ai/ARCHITECTURE.md` 架构不变量
- 删除文件走回收站
- 不 commit 到主分支（除非维护者确认）

### 4.4 涉及文件范围（预估）
- `frontend/src/App.tsx`（导航重构 + Shell + i18n Provider）
- `frontend/src/app.css`（tokens + 布局）
- **新建** `frontend/src/i18n/`（index.ts + LanguageContext.tsx + zh.ts + en.ts）
- **新建** `frontend/src/components/AgentRail.tsx`、`MonitorCard.tsx`、`ThesisBlock.tsx`、`EvidenceCard.tsx`、`MetricStrip.tsx`、`EventTimeline.tsx`、`CompareGrid.tsx`、`LangSwitcher.tsx`
- `frontend/src/pages/Dashboard.tsx`（→ Today）
- `frontend/src/pages/StockAnalysis.tsx`（→ Entity Workspace）
- `frontend/src/pages/ResearchWorkspace.tsx`（→ Research Home）
- `frontend/src/pages/Alerts.tsx`（→ Monitor）
- `frontend/src/pages/StrategyLab.tsx`（→ 自然语言优先）
- `frontend/src/pages/Screening.tsx` + `AlphaResearch.tsx`（→ Discover）
- `frontend/src/pages/Portfolio.tsx`（→ P&L 首页）
- `frontend/src/pages/Chat.tsx`、`Discussion.tsx`、`Thesis.tsx`（✅ 确认合并 → Research 内能力，页面文件移入 Research 相关目录或删除）
- 删除（回收站）：`frontend/src/pages/Chat.tsx`、`Discussion.tsx`、`Thesis.tsx`（确认合并后的独立路由）

> **注意**：i18n 是横切能力，任何新组件/页面的文案必须通过 `t(key)` 走语言包，禁止硬编码中英文混合文本。

---

## 五、风险与回退

| 风险 | 缓解 |
|------|------|
| 页面合并导致旧路由失效 | 保留旧路由重定向到新工作空间，不 404 |
| Agent Rail 挤占窄屏空间 | 390px 时 Rail 折叠为浮动按钮 |
| 8 导航认知变化大 | Phase 0 一次改完，一次性到位 |
| 依赖抗性（不新增依赖） | 全部用现有 AntD + 纯 CSS 实现 |
| 视觉收敛影响既有测试 | 每个 Phase 跑完整前端测试 + 截图对比 |

**回退**：每个 Phase 独立 commit，可单独 `git revert`。Phase 0 失败不影响 Phase 1 数据。

---

## 六、验证总纲（每个 Phase 完成后的证据）

```bash
# 后端（如改后端只读聚合）
cd backend && .venv\Scripts\python.exe -m pytest -q && .venv\Scripts\python.exe -m ruff check .

# 前端
cd frontend && bun run build && bun run test

# 浏览器（Codex 内置浏览器）
# 逐页截图：Today / Research / Entity / Strategy / Portfolio / Monitor / Settings
# 桌面 1440 + 窄屏 390，light + dark
# 双语：zh / en 各截一份
```

---

*本规划已由维护者确认（`[APPROVED]`）。执行 agent（Codex 或 ChatGPT Goal 模式）按 Phase 0→4 顺序执行，每 Phase 独立验证后向维护者汇报。*
