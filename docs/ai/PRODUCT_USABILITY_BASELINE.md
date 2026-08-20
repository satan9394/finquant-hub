# FinQuant Hub 产品可用性基线

> 对应任务：`PROD-002`  
> 基线日期：2026-08-09  
> 运行模式：development + `LOCAL_ONLY_MODE=true`  
> 数据隔离：专用 `backend/data/product_baseline.db`，未迁移或修改主机现有数据库  
> 浏览器：Codex in-app Browser；桌面 1440×900，窄屏 390×844

## 1. 环境结果

- 推荐 Docker profile 未能启动：Docker Desktop 配置的 `docker.1panel.live` 镜像对 `docker/dockerfile:1.7` 返回 403，失败发生在应用构建前。
- 基线改用 README 已记录的本地 dev server，并显式使用专用 baseline 数据库。
- 前端 `http://127.0.0.1:5173` 返回 200；后端 `/api/health` 返回 `status=ok`、`db=wal`。
- 本地模式无需登录，页面显示“本地模式”，所有业务请求仍使用内部所有者上下文。

## 2. Flow health

| Step | Screenshot | Health | Evidence-backed finding |
|---:|---|---|---|
| 1 | Dashboard desktop | `AT RISK` | 14 个同级入口；大屏占满首视口，三个核心任务均在折叠线下 |
| 2 | 600519 个股分析 | `DEGRADED` | 真实结果可理解，但首次 lazy chunk 失败需 reload，内部信号代码直接暴露 |
| 3 | 600519 策略验证 | `HEALTHY` | 三步完成，结果包含结论、基准、风险、稳健性、来源和警告 |
| 4 | 组合首次持仓 | `PARTIAL` | 九步得到真实 PnL，但无法回答最大风险来源 |
| 5 | Dashboard 窄屏 | `AT RISK` | 重排无明显横向溢出，但任务入口不可见，菜单触发器语义需要键盘验证 |

Confirmed strengths: real-data results, honest warnings, strong StrategyLab disclosure, local-only ownership context, and responsive KPI reflow. Highest UX risks: task discoverability, navigation competition, portfolio setup friction, and split research continuity. Accessibility risks are limited to observed semantics/reflow; this audit does not claim WCAG conformance because focus order, keyboard completion, contrast, zoom and assistive-technology output were not fully exercised.

## 3. Dashboard 首屏

![Dashboard desktop baseline](../../artifacts/productization/phase0/01-dashboard-desktop.png)

浏览器 DOM 与截图共同确认：

- 侧栏有 14 个同级入口。
- 1440×900 首屏先显示“系统总览”和完整“大屏概览”；三个核心任务没有出现在首个视口。
- 市场雷达紧跟大屏，当前任务入口、五项能力测试和快速个股分析继续位于下方。
- 组合为空时，大屏仍占用最大视觉面积，但主指标都是 0/无信号。
- “五项能力启动测试”是入口集合，没有完成状态持久化，也不是产品计划定义的分析/策略/组合三任务结构。

## 4. 首次任务步骤基线

计数规则：一次导航点击、一次字段输入/选择、一次提交分别计 1 步；等待不计步；系统错误后的人工恢复单独计步。

| 任务 | 实际路径 | 理想主步骤 | 本次实际步骤 | 可理解结果 | 基线判断 |
|---|---|---:|---:|---|---|
| 分析股票 | Dashboard 快速分析 → 输入 `600519` → 分析页 | 2 | 3 | 重载后显示真实行情、图表、技术评分 | 首次导航遇到 stale lazy chunk，需额外 reload；入口还在首屏下方 |
| 验证策略 | Dashboard → 策略实验室 → 选择“贵州茅台” → 运行回测 | 3 | 3 | 显示结论、基准、风险/交易指标、稳健性、来源和警告 | 核心闭环已经完整，但入口不在 Dashboard 核心任务区 |
| 体检组合 | Dashboard → 投资组合 → 新建 → 名称 → 确认 → 添加持仓 → 代码/数量/成本 → 确认 | 9 | 9 | 显示真实现价、盈亏和配置占比 | 只能完成持仓/PnL，尚不能回答集中度、回撤或最大风险来源 |

### 4.1 个股分析结果

![Stock analysis baseline](../../artifacts/productization/phase0/02-stock-analysis-600519-desktop.png)

- 初次从 Dashboard 跳转时出现 `Failed to fetch dynamically imported module`，错误指向旧的 `StockAnalysis-*.js` chunk；一次 reload 后恢复。
- 恢复后显示贵州茅台真实行情（本次快照价格 1309.22）、K 线/KDJ/MACD/RSI 与技术评分 -9.6。
- `volume_surge`、`breakout_up`、`rsi_overbought`、`bottom_divergence`、`death_cross` 等内部代码直接作为主要标签。
- 页面同时展示 13 章折叠标题，但即时技术分析只有第一章有内容，容易让用户误判为不完整的深度报告。

### 4.2 策略验证结果

![Strategy result baseline](../../artifacts/productization/phase0/03-strategy-result-600519-desktop.png)

- 600519 MA20/50 回测完成：总收益 -13.54%、基准收益 -8.88%、最大回撤 -18.23%、7 笔交易。
- 页面明确给出“不建议据此交易”、Bootstrap 区间、Monte Carlo 亏损概率、Walk-forward、成本、A 股交易规则、Sina 来源、截止 2026-08-07、未复权警告。
- 这是可理解、可验证的真实任务结果；Phase 1/3 应复用并重排，而不是重写回测引擎。

### 4.3 组合首次持仓结果

![Portfolio first holding baseline](../../artifacts/productization/phase0/04-portfolio-first-holding-desktop.png)

- 新建“首次体检基线”组合并加入 10 股 600519，成本 1300；真实现价 1309.22，总盈亏 +92.20。
- 页面只展示总投入/市值/盈亏/收益率、持仓表和按组合分组的配置条；单一持仓仍显示 100%，但没有风险解释。
- `PROD-040` 应直接接入现有组合回测风险 X 光，避免要求新手先理解优化器参数。

## 5. 窄屏基线

![Dashboard narrow baseline](../../artifacts/productization/phase0/05-dashboard-narrow-390x844.png)

- 390×844 能重排大屏 KPI，没有明显横向溢出。
- 首个视口几乎全部被大屏占据，核心任务入口完全不可见；这比桌面更明显地阻碍 Time to First Value。
- DOM 快照中顶部菜单触发器只暴露为 `img "menu"`，没有可见的 button role/name；需在 Phase 1/6 做键盘与可访问名称验证。

## 6. Phase 1 可量化起点

| 基线指标 | 当前值 | Phase 1 目标 |
|---|---:|---:|
| 桌面首视口可见核心任务数 | 0 / 3 | 3 / 3 |
| 窄屏首视口可见核心任务数 | 0 / 3 | 3 / 3 或一个清晰任务启动器 |
| 侧栏同级入口 | 14 | 收敛为产品计划的五组一级导航，系统工具下沉 |
| 股票首次分析主步骤 | 2 + 1 次错误恢复 | ≤ 2，且无 chunk 恢复步骤 |
| 策略首次验证主步骤 | 3 | ≤ 3 |
| 组合首次获得真实结果主步骤 | 9 | ≤ 5（示例/引导可预填） |
| 组合结果能否回答最大风险来源 | 否 | 是 |

## 7. 证据文件

- `artifacts/productization/phase0/01-dashboard-desktop.png`
- `artifacts/productization/phase0/02-stock-analysis-600519-desktop.png`
- `artifacts/productization/phase0/03-strategy-result-600519-desktop.png`
- `artifacts/productization/phase0/04-portfolio-first-holding-desktop.png`
- `artifacts/productization/phase0/05-dashboard-narrow-390x844.png`

这些截图均由当前 live DOM 成功读取后保存；没有把失败的截图调用当作视觉证据。
