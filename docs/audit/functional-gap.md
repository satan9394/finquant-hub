# FinQuant Hub 功能差距审计

> ⚠️ 本文件为历史审计记录（2026-07-27），部分技术栈描述已过时。
> 当前技术栈权威来源：[docs/TECH_STACK.md](../TECH_STACK.md)

审计时间：2026-07-27
审计范围：`frontend/`、`backend/`、现有 SQLite 数据层、策略知识页，以及独立部署用的 `sites/` 子项目。
结论：仓库已有可复用的行情、指标、图表、研究编排、导出和 SQLite 能力，但目前是多条互不相通的展示流程；本轮应在现有 FastAPI + React 应用内完成“标的研究”和“双均线回测”两个闭环，不重写项目，也不扩展 Alpha、组合或交易下单。

## 1. 现有技术栈与路由

| 领域 | 当前实现 | 结论 / 差距 |
| --- | --- | --- |
| 前端 | React 18、TypeScript 5.6、Vite 6、Ant Design 5、ProLayout | 可直接扩展；无需更换框架或设计系统。 |
| 路由 | React Router 6；已有 `/research`、`/analysis/:ticker`、`/knowledge` 等 | `/research` 是 AI 报告编排，`/analysis/:ticker` 是行情图，能力割裂；缺 `/research/:symbol` 和 `/strategy-lab/ma-crossover`。 |
| 状态 | Zustand；只有模型、对话、讨论 store | 研究和回测是页面局部状态；本轮可继续局部状态，避免创建未被复用的全局抽象。 |
| 后端 | FastAPI lifespan 初始化服务与 SQLite | 可新增路由并复用 `request.app.state.market`。 |
| API | `/api/market/*`、`/api/research/*`、旧 `/api/backtest/runs` 等 | 旧行情响应无统一模型/元数据；旧回测合同和指标不满足本轮要求。旧接口应保留兼容。 |
| 图表 | `lightweight-charts` 4.2.1；已有 K 线、成交量、MA、MACD、RSI 绘制 | 足够完成研究与回测结果，不新增同类图表库。 |
| 数据库 | SQLite + `aiosqlite`，WAL，启动期建表和非破坏迁移 | 已有 `research_reports`、`research_events`、旧 `backtest_runs`；缺研究笔记/保存对象和新异步回测结构。 |
| 任务系统 | 无独立队列/worker；FastAPI 进程内执行 | 本地单进程 MVP 可用 `BackgroundTasks` 与持久化状态机；进程重启恢复和多实例调度列为后续依赖。 |

## 2. 当前数据源与来源链

| 能力 | 当前主源 / 备源 | 已发现问题 |
| --- | --- | --- |
| 标的搜索 | 东方财富（A 股）+ Yahoo（全球） | 两个源错误都被吞掉并返回空数组，无法区分“无结果”和“数据源失败”；中文公司名在 Yahoo 搜索会 400。 |
| 实时报价 | A 股腾讯→新浪→Yahoo；港/美 Yahoo | 腾讯/新浪结果缺 `provider`、`currency`、`timezone`、`as_of`；新浪缺失值用 `0` 冒充，页面会显示“今开 0.00/市值 0”。 |
| K 线 | A 股新浪→腾讯→Yahoo；港/美 Yahoo | 返回裸数组，未携带复权、频率、时区、数据截止和质量标记。 |
| 技术指标 | 本地 NumPy（MA/MACD/RSI/KDJ/BOLL/ATR/VOLMA） | 计算模块可复用；现 API 仍没有与原始 bars 的来源绑定。 |
| 基本面 | 无统一服务 | 报价中只有部分 PE/PB/市值；Yahoo 路径甚至多数为空，需要明确缺失，不得伪造。 |
| 深度研究 | 本地多 Agent + LLM | 报告可存储与导出，但输出段落未强制标注 FACT / INFERENCE / ASSUMPTION / MODEL_OUTPUT / UNKNOWN，也未绑定行情证据快照。 |

统一接口必须保留原始提供方事实：所有响应带 `provider`、`as_of`、`timezone`、`currency`、`adjustment`、`frequency`、`quality_flags`。缺失值返回 `null` 并写入质量标记，不得填 `0`；上游全部失败返回 502，不静默降级为空结果。

## 3. 布局与前端体验审计

审计视口：1440×900；证据截图见 `output/playwright/audit-current/`。

- `App.tsx` 把字符串 `📈` 传给 ProLayout 的图片 `logo` 属性，浏览器将其当成 URL，产生破图。
- 主侧栏固定 160px，缺移动端显式折叠状态；ProLayout 自带折叠能力但当前没有按断点处理。
- `/research` 报告正文使用 `maxHeight: 600` + `overflow: auto`，在页面主滚动之外又产生垂直滚动。
- `/knowledge` 使用 `height: calc(100vh - 56px)`，内部 Sider 和 Content 均 `overflow: auto`，iframe 自身还可滚动，是明确的多重滚动来源。
- `/chat`、`/discussion` 也有内部滚动，但不属于本轮两条核心闭环；本轮不重构这些页面，只确保新页面单主滚动。
- 旧 `/analysis/AAPL` 的实际 K 线、成交量和指标可显示，但主图固定 320px，低于要求的 360px；页面未展示数据源、时区、复权和截止时间。
- 旧 `/research` 以 4 个 Agent 卡片为中心，缺行情、K 线、基本面、研究笔记和证据侧栏；历史已按标的分组，但研究详情仍按单次 report 分离。

## 4. 模拟数据与硬编码

- 审计发现 `CLAUDE.md` 曾包含一个形似真实 DeepSeek 密钥的明文测试值；本轮已替换为 `${DEEPSEEK_API_KEY}` 环境变量占位。该历史密钥仍应在提供方后台轮换，因为 Git 历史不会被此次工作区修改清除。
- 8 篇 `frontend/public/knowledge/*.html` 使用 `Math.random()` 生成教学动画数据；这些是教学演示，不得流入研究或回测。页面应明确标成“教学示意”。
- 旧策略回测没有模拟行情，但其收益公式错误使用价格分母/累加收益，并且没有佣金或滑点；不能作为生产研究结果复用。
- 分析信号名称直接显示内部键（例如 `golden_cross`），且 AI 章节缺少逐项来源标签。
- Dashboard/组合/选股/Alpha 的现状不属于本轮闭环；禁止为了视觉完整度向它们注入假数据。

## 5. 可复用模块

- `backend/app/services/market_data.py`：代码标准化、东方财富搜索、腾讯/新浪/Yahoo 降级链、日线获取。
- `backend/app/services/indicators.py`：MA、MACD、RSI 等纯计算。
- `backend/app/database.py`：WAL、启动期 schema 和非破坏列迁移模式。
- `backend/app/services/report_export.py`：HTML、Markdown、PDF、Word 导出。
- `frontend/src/hooks/useLightweightCharts.ts` 和现有 lightweight-charts 使用方式。
- `frontend/src/services/api.ts`：统一 Axios 错误边界。
- `frontend/public/knowledge/m1-移动平均策略.html`：保留为知识入口，只增加进入实验室的真实按钮/链接。
- `sites/`：独立部署的简版研究产品；其中文名称解析修复应保留，但本轮完整产品能力落在 `frontend/` + `backend/`，避免复制两套业务核心。

## 6. 本轮目标架构

```text
搜索框
  -> /api/instruments/search
  -> 统一 Instrument(symbol/name/market/exchange/currency/asset_type)
  -> /research/:symbol
       -> snapshot + bars + fundamentals + 本地 indicators
       -> 笔记/研究保存到 SQLite
       -> 证据面板显示 provider/as_of/quality_flags
       -> MA 实验室
            -> POST /api/backtests（queued）
            -> BackgroundTasks 状态机
            -> GET /api/backtests/:id 轮询
            -> curves/metrics/warnings + trades
            -> SQLite 持久化保存和重新运行
```

## 7. 实施边界与迁移策略

1. 保留 `/api/market/*`、`/api/backtest/runs`、`/analysis/:ticker` 和旧研究报告接口，避免破坏已有页面。
2. 新增 `/api/instruments/*` 与 `/api/backtests/*`，新页面只调用新合同。
3. 新回测表与旧 `backtest_runs` 分离或以非破坏迁移扩展；不删除旧记录。
4. `/research` 变成统一搜索/历史入口；`/research/:symbol` 变成标的工作台，旧 Agent 研究可作为同一标的下的“深度报告”模块继续访问。
5. A/HK/US 都走同一解析入口；中文公司名称先搜索解析成正式 symbol，再请求行情，避免把名称当代码提交给上游。
6. 数据源不可用时显示错误卡和重试动作；所有数字的来源、时间和质量在界面可见。

## 8. 验收缺口清单

- [ ] 统一标的搜索/解析和四个 instruments API。
- [ ] 研究工作台（行情、K 线/成交量、MA/MACD/RSI、基本面、笔记、证据、保存）。
- [ ] AI 内容事实类型标签。
- [ ] 知识文章进入策略实验室。
- [ ] MA 参数验证、异步回测合同、费用/滑点、全指标/曲线/交易。
- [ ] 回测结果保存、重新运行、来源与截止时间。
- [ ] Logo、单主滚动、图表高度、1440/1920/移动端。
- [ ] 后端单测、前端验证测试、完整浏览器流程与截图。
