# BACKLOG-029 阶段 0 — Astra 双会话断言核验表

> 创建：2026-09-04 ｜ 核验人：DSH 主维护 agent（本会话）
> 基线：HEAD `0adbea1`（BACKLOG-029 注册后工作树干净）
> 方法：每条断言 → 定位当前源码行 → 读实现 + 既有测试 + 只读内存探针。阶段 0 零业务改动。
> 结论三态：**已证实** / **已证伪** / **待复现**（含"待核"＝静态可达但需真实并发/产品决策）。

---

## 汇总

| 组 | 已证实 | 已证伪 | 待复现/待核 |
|---|---|---|---|
| A（后端） | A1/A2/A3/A4/A5/A8（机制） | — | A6（产品契约）、A7（受损实例） |
| B（前端） | B1/B2/B3/B6/B7（机制） | B1（已证伪旧结论→已证实新结论） | B4/B5/B8/B9/B10/B11（真实） |

> 注：B1 在 Astra 存档中即已"证伪旧文档结论"，本次 DSH 复扫**再次确认** 0 匹配 → 旧结论（残色未迁完）确已过时，需诚实修正 HANDOVER/相关文档。A6/B12 属产品方向级，仅记录待用户决策，不擅自修。

---

## A 组（架构/逻辑）

### A1-图码漂移 — 已证实（记录类，不修代码）
- **断言**：图称 22 Router/52 表/13 工具；实际 22 Router/135 路径/169 操作/49 逻辑表/17 工具；schema v24 删 3 遗留组合表、新增 4 A 股工具未上图；sequence 事件名（completed vs done）、tool_call 推送时机、主编→evidence_objects 链路、"类型驱动校验"绕行等与图不符。
- **核验**：
  - Router：`backend/app/main.py` L135-140 — `auth.router` 直接 include 1 个 + 认证 tuple 21 个 = 22 APIRouter（与 025 实测一致，135 paths/169 ops）。
  - 表：`backend/app/database.py` L266-281 `_OWNER_TABLES` 现 38 张 owner 表（v23 增加 run_events 等，v24 cleanup 移除 portfolio_groups/items/trades）；SCHEMA 文本 `CREATE TABLE IF NOT EXISTS` 48 处（含少量非 owner 表），`_SCHEMA_VERSION = 24`（L265）。旧文档"52 表"与删 3 表后现状不一致 → 图/计数漂移属实。
  - 工具：`backend/app/agent/tools_definitions.py` 17 个工具类（A 股新增 get_chip_distribution/get_money_flow/get_dragon_tiger/get_limit_up_pool 4 个未上图）→ 图写 13 已过时。
  - 事件名：`backend/app/routers/research.py` L258/273/284 `report_started`/`done`（SSE 事件） vs DB `status='completed'`（L347）；`research_orch.py` L259-263 推 `agent_completed`；`tool_call` 在 agent 完整返回后集中 emit（research_orch.py L192-197），非调用发生时推送 → 与 sequence 图不符。
  - evidence_objects：研究主路径只在 `scheduler.py` L156-161 回填（scheduled run 语境），交互研究 Router 无写入；审计工具 `audit_evidence/export` 只返回抽样/核验 → "主编→evidence_objects" 无对应主路径写入属实。
  - 类型驱动校验：`research_orch.py` L49 直接 `tool.run(**arguments)` 绕过 `ToolRegistry.dispatch()`（tools.py L142-174 才做 JSON Schema 前置校验）→ 属实。
- **证据**：main.py:135-140、database.py:264-281、tools_definitions.py（17 class）、research.py:258-284、research_orch.py:192-263、tools.py:142-174、scheduler.py:156-161。
- **建议处置**：**记录**。archify-output/ 为 git-ignored 生成物（`git check-ignore` 命中），非仓库契约；图漂移属生成快照问题，修复点在 archify 再生成，不入本 backlog 代码修复。README/ROUTER_MAP 计数已于 025 收敛到 135/169，无需再动。

### A2-事务原子性 — 已证实（P1）
- **断言**：job 用 `_RUNTIME_LOCK`+`BEGIN IMMEDIATE`，但共享连接其他 execute 直接提交，可提前提交 job 部分状态、rollback 失效；取消异常不在回滚范围。
- **核验**：
  - `database.execute()`（database.py L2222-2226）执行写后立即 `get_db().commit()`；`query_one/all` 直接 execute。job 服务（research_jobs.py L68-80 append、L154-231 claim、L295-336 finish、L350-427 recover）在同一 `database.get_db()` 连接上 `BEGIN IMMEDIATE` … `db.commit()/rollback()`。
  - 两者并发时，其他请求的 `database.execute()` 的 commit 会把 job 事务内已写行**提前落盘**；随后 job 的 `db.rollback()` 在 sqlite 中为 no-op（事务已结束）。
  - **只读探针实证**：内存库 `BEGIN IMMEDIATE` + INSERT(1) → 模拟外部 `db.commit()` → `db.rollback()` 无异常但**行仍存在**（rows=1）。与 Astra 探针结论一致。
  - 取消路径：scheduler.py `run_research_job` L312-317 捕获 `CancelledError` 调 `finish_research_run(status='cancelled')`，但 `_run_and_persist_target` 内（scheduler.py L180-183）CancelledError 分支先 `_mark_research_failed`（独立 execute 提交），与 job 的 cancelled 回滚不在同一事务协调下。
- **证据**：database.py:2222-2226、research_jobs.py:16/68-80/154-231/295-336、scheduler.py:180-183/312-317 + 内存探针（rollback ok，行保留）。
- **建议处置**：**修（P1）**。单连接架构内收敛：数据库层加统一提交点/事务所有权，job 关键写纳入同一事务。改动需设计，先小步。

### A3-SSE 断连 — 已证实（P1）
- **断言**：断连取消会打断 finally 清理，可能留永久 running 报告；Astra 隔离探针复现 status=running/fail_called=False。
- **核验**：
  - `research.py` L252-319 `event_stream()`：`try/except Exception/finally`。`finally`（L300-318）内 `reset_usage_context`、`research_stream.aclose()`（L302-310 try/except）、然后 `if not completed:` 查 DB + `_fail_report` + `publish_research_status`。
  - 但 `except Exception` 不捕获 `asyncio.CancelledError`（Python 3.8+ CancelledError 继承 BaseException）；sse_starlette 断连时通过 task.cancel() 抛 CancelledError，**直接跳过 finally 前的大半清理**（acloes/fail 落库均在 await 点），若取消在 `_append_event`/yield 之间到达，finally 里首个 await（aclose）再被取消 → fail 落库不执行 → report 永久 running。
  - 既有 test_research_sse* 是否有原生断连回归待查；Astra 已用原始 event_stream + EventSourceResponse 复现。
- **证据**：research.py:252-319（尤其 285-318）、sse_starlette sse.py 断连 cancel 机制。
- **建议处置**：**修（P1）**。对 finally 内必要的生成器关闭/失败落库做有界取消保护（shield / 一次性兜底 fail_report 移到不可取消点），补原生断连回归测试。

### A4-立即运行竞态 — 已证实（P1）
- **断言**：接口读非 running 后无条件写 queued（先检查后更新），可能覆盖 running / 双 running run。
- **核验**：`settings.py` L231-251 `run_scheduled_research_job`：L239 `get_research_job`（读）→ L242-243 检查 `last_status=='running'` 抛 409 → L245-249 无条件 `UPDATE ... SET last_status='queued'` 然后 background task。读与写之间无锁/条件保护；若两请求并发，第二请求基于旧读值把第一请求刚置的 queued/running 覆盖。而 `claim_research_job` 内 update 有 `AND last_status!='running'` 守卫（research_jobs.py L184）——说明 queued→running 认领受保护，但 queued 写入本身无守卫。
- **证据**：settings.py:231-251、research_jobs.py:172-189（claim 的条件 UPDATE）。
- **建议处置**：**修（P1）**。改为条件更新（`UPDATE ... WHERE id=? AND last_status!='running' AND last_status!='queued'`）+ rowcount 校验，或把状态置 queued 纳入与 claim 同一原子段。

### A5-工具线程上下文 — 已证实（P2）
- **断言**：线程内 ContextVar 变 None、参数类型校验被绕过（新闻工具走空凭据分支）；未发现跨用户读凭据。
- **核验**：
  - `research_orch.py` L26-28 `_run_tool_in_thread` 用 `asyncio.run(tool.run(**arguments))`；L49 `run_in_executor(_TOOL_EXECUTOR, ...)`。线程池 worker 不继承调用方协程的 ContextVar → `_CURRENT_USER`（services/auth.py L21/L76-80）在线程内为 None。
  - `tools_definitions.py` SearchNews.run L314-322：`current_user_id()` 抛 RuntimeError → 走 `credentials={}` 空凭据分支（tavily/serpapi/... 全部未配置）。Astra 确认无跨用户读凭据，代码路径吻合（无回退到其他用户凭据）。
  - 参数类型校验被绕过：research_orch.py 直接 `tool.run(**arguments)` 不走 `ToolRegistry.dispatch`（tools.py L142-174）→ 声明 integer 传字符串不被拒（JSON Schema 校验仅在 dispatch）。
- **证据**：research_orch.py:26-28/49、auth.py:21/68-80、tools_definitions.py:304-322、tools.py:142-174。
- **建议处置**：**修（P2）**。工具执行前显式传递 user 上下文（或 run 前 set_current_user + 线程本地传递），并把研究路径改经 dispatch 校验。修复须保持"不读他人凭据"的隔离语义。

### A6-主编失败仍归完成 — 已证实行为 / 契约待核（P2，产品方向）
- **断言**：主编 LLMError 后仍发 agent_completed → done → Router 置 completed + 成功通知；无顶层降级表达。
- **核验**：`research_orch.py` L245-263：except LLMError → `lead_content=''`、yield `agent_failed`；随后**无条件** L259-263 发 `agent_completed`（length=0），继续 `_build_report`（lead_content 空串）→ `done`。`research.py` L273-282 对 done 置 completed + publish completed。report_builder 保留 model_output_status=unknown，但顶层状态无降级字段。
- **证据**：research_orch.py:234-263、research.py:273-282。
- **建议处置**：**记录待用户决策**。是否允许"无主编审计的降级完成"是产品契约问题，不擅自改状态语义。

### A7-重启恢复窗口 — 机制已证实 / 受损实例待核（P2）
- **断言**：report INSERT 与 run.report_id 回填分开提交；completed 先于记忆/run 引用持久化；heartbeat 丢失无失租终止。
- **核验**：`scheduler.py` L97-107：report INSERT（database.execute 独立 commit）→ `UPDATE scheduled_research_runs SET report_id=...`（再 commit）。两写之间崩溃 → 报告无 run 引用。L127-177：report completed（L129-138 commit）→ persist candidates（L139）→ evidence/memory 回填（L162-176）→ 通知。恢复 `recover_stale_research_runs`（research_jobs.py L339-428）在 report 已 completed 时只对齐终态，不补齐 memory/引用。heartbeat（scheduler.py L272-278）丢失仅 return，无失租终止后续研究。
- **证据**：scheduler.py:97-107/127-177/272-278、research_jobs.py:339-428。
- **建议处置**：**记录（受损实例待核）** + 机制层可后续修（合并 report+回填到同一事务、失租终止）。无已证实数据受损实例，先记录。

### A8-行情语义错误 — 已证实（P2）
- **断言**：分钟 K 失败后腾讯回退只取 day；新浪缺 PE/PB 返回零；上证指数 sh000001 被股票校验拒绝。
- **核验**：
  - 分钟 K：`market_data.py` `kline()` L588-617：sina 失败→ tencent `_kline_tencent(code, count)` L642-661，URL `param={code},day,,,{count},qfq`（L23）且只读 `qfqday/day`（L647）→ **用日线数据满足分钟 period 请求**（period 仅在 sina scale/yahoo interval 使用，腾讯分支无 period 参数）→ 属实。
  - 新浪 PE/PB：`parse_sina_quotes` L978-980 硬编码 `"pe": 0.0, "pb": 0.0`（注释"降级时缺失字段置 0"）→ 缺失值变零，非 UNKNOWN → 属实（与"缺失保留 UNKNOWN"承诺矛盾，亦印证 dataflow 图漂移）。
  - 上证指数：`normalize_code('sh000001')` L140-145：`000001` 不匹配 `_mainland_market`（6/0/3 开头）→ 抛"股票代码与交易所不匹配"；`index_quote` L553-564 对 sh/sz 走 `self.quote(provider_symbol)` → quote→normalize_code 拒绝 → cn 指数组（market_overview.py INDEXES L73 `sh000001`）会进入 unavailable 分支。→ 属实。
- **证据**：market_data.py:23/48/124-176/588-617/642-661/948-985、market_overview.py:71-90/147-176。
- **建议处置**：**修（P2）**。腾讯 K 线补 period 语义（分钟请求不容忍日线回退，或明确失败）、新浪缺字段置 UNKNOWN 而非 0、指数代码校验放行 sh000001 类指数段。

---

## B 组（UI/可用性）

### B1-残色未迁完（旧文档结论）— 已证伪（旧结论过时，需诚实修正）
- **断言（旧文档）**：`#dce5ef`/`#1890ff` 未迁移完。
- **核验**：本次 DSH 全量扫 `frontend/src`（含 app.css 等 152+ 文件）`#dce5ef|#1890ff` **0 匹配**。颜色集中在 :root/.app-theme--dark token 区（app.css L600-661），检出的 `var(--fq-…)` 引用均有定义（当前 30+ 个 --fq-* token）。与 Astra 全量扫描一致。
- **证据**：grep frontend/src `#dce5ef|#1890ff` → 0 匹配；app.css:600-661。
- **建议处置**：**诚实修正文档**——HANDOVER/历史结论中"残色未迁完"应标注已清零（Astra 复核 + DSH 复扫双确认）。属记录/文档修正，不修代码。

### B2-图表主题不重取色 — 已证实（机制）
- **断言**：MoneyFlowChart/ChipHistoryChart 固定 theme:'light'，更新 effect 只依赖固定 config.theme，暗色切换后已有图表保留旧色。
- **核验**：MoneyFlowChart.tsx L18-21 / ChipHistoryChart.tsx L18-21 传 `{ theme: 'light', autoSize: true, height }`（写死 light）。useLightweightCharts.ts：初始化 effect L107-131 依赖 `[]`（不重建）；主题 effect L134-142 依赖 `[config.theme]`（恒为 'light'，永不触发）；`getThemeOptions` L30-31 实际读取 CSS token（readChartTokens）→ 首次打开颜色取自当前 CSS 变量（亮/暗都正确），但**切换主题后 chart 不重取色**（无任何监听 theme 变化入口）→ 已有图表保留旧色 → 属实。
- **证据**：MoneyFlowChart.tsx:18-21、ChipHistoryChart.tsx:18-21、useLightweightCharts.ts:30-31/107-142。
- **建议处置**：**修（主题类）**。hook 增加监听（CSS token 变化/mutation 或上层传 isDark），图表在主题切换后 applyOptions 重取色；两图表接真实主题。

### B3-证据抽屉主题断裂 — 已证实（机制）
- **断言**：暗色变量在 .app-theme--dark 内，EvidenceDrawer/Rail Portal 默认挂 body，抽屉继承浅色 token 与 AntD 暗色混搭。
- **核验**：App.tsx L406 `<div className={app-theme[-dark]}>` 包裹整个 app；暗色 token 定义在 `.app-theme--dark`（app.css L635-661）→ 只有该子树内元素吃到暗色变量。EvidenceDrawer.tsx L43-50 用 AntD `<Drawer>`（未设 getContainer）；EvidenceRail.tsx L8 同；AntD Drawer 默认 portal 到 `document.body`（@rc-component/portal useDom）→ 抽屉 DOM 挂在 body 下、脱离 .app-theme--dark 子树 → 自定义 CSS 用 :root 亮色 token，与 AntD darkAlgorithm 主题混搭。B3 所述作用域断裂机制属实。
- **证据**：App.tsx:406、app.css:635-661、EvidenceDrawer.tsx:43-50、EvidenceRail.tsx:8、@rc-component/portal useDom。
- **建议处置**：**修（主题类）**。方案二选一：给 Drawer 设 `getContainer` 到 .app-theme 根内，或把暗色 token 作用域提升到 body 级（:root[data-theme=dark]）。先小步选对既有组件影响最小者。

### B4-AntD 与自定义组件两套样式来源 — 已证实（机制）
- **断言**：ConfigProvider 只切算法，不映射 --fq-ai-primary/圆角到 AntD。
- **核验**：App.tsx L399-404 ConfigProvider theme 仅 `algorithm`（darkAlgorithm/defaultAlgorithm），无 token 映射（colorPrimary/borderRadius 等未接 --fq-*）；自定义主色 --fq-ai-primary（app.css L601），按钮/Tag 等 AntD 组件走 AntD 自身主题 → 两套主色来源并存。属实。
- **证据**：App.tsx:399-404、app.css:601/635-636。
- **建议处置**：**修（主题类，低风险）**。ConfigProvider theme.token 映射 colorPrimary=var(--fq-ai-primary)（亮暗已分别定义）+ borderRadius 对齐；不影响纯 CSS 组件。

### B5-尺寸漂移 — 已证实（真实，非功能故障）
- **断言**：规范圆角 8/12/16 vs 实际 6/8/8；侧栏 240 vs 224。
- **核验**：DESIGN_SYSTEM_V1.md L321-323 规范 radius-sm/md/lg = 8/12/16px，token 定义（L866-868）同为 8/12/16；实际 app.css L625-627 `--fq-radius-sm/md/lg: 6/8/8px` → token 与规范漂移。侧栏规范 240px（DESIGN L283 + app.css L628 token --fq-sidebar-expanded: 240px）vs App.tsx L275 `siderWidth={224}`（硬编码 224，ProLayout 实际宽度）→ 漂移属实。
- **证据**：DESIGN_SYSTEM_V1.md:283/321-323/866-869、app.css:625-629、App.tsx:275。
- **建议处置**：**修（低风险）**。两选一：规范对齐 token（8/12/16 与 sider 240）或文档改规范。注意 BACKLOG 曾做"6-8px token 收敛"（HANDOFF 2026-08-24 UI-004）——旧改动把部分 6px 收成 8px，本次以 DESIGN_SYSTEM 现行规范为准复核，避免机械回退已有正确对比度调整（Astra 亦提醒）。

### B6-提问不被接住 — 已证实（用户可感）
- **断言**：底部/全局"继续研究"进 /research?prompt=…，但默认研究页不读 prompt，问题丢在 URL。
- **核验**：App.tsx L316 CommandComposer `onSubmit → navigate('/research?prompt=…')`；globalTaskEntry.ts L21 question action → `/research?prompt=${question}`。ResearchWorkspace 默认页（WorkspaceCore L186+）只读 symbol/mode/searchParams.mode，**无任何 prompt 参数读取/呈现/草稿**；ResearchWorkspace.tsx L870-879 顶层只分 mode 路由，无 prompt 处理。URL 携带 prompt 但页面不呈现、不进入搜索框 → 用户问题丢失 → 属实。
- **证据**：App.tsx:316、globalTaskEntry.ts:21、ResearchWorkspace.tsx:186-226/441-446/870-879。
- **建议处置**：**修（用户可感，优先）**。默认研究页读 prompt：进入时呈现原问题（如预填查询框并触发一次搜索/提示），并复用既有 searchInstruments 路径；Chat 模式已能读 prompt（ResearchModeSurface initialPrompt），可把非标的自由提问导向 Chat。需与产品预期确认（B12 方案①有连续工作面重做提议——本次只做最小接住，不实施 B12）。

### B7-筛选术语误识别 — 已证实（用户可感）
- **断言**：ROE/FCF/CAGR 被当证券代码提取（Discover 正则）。
- **核验**：Discover.tsx L13 `tickerPattern = /\b(?:[036]\d{5}|\d{5}|[A-Z]{1,5}(?:\.[A-Z])?)\b/gi` 匹配任意 1-5 位纯大写 token（ROE/FCF/CAGR 均为 3 字母）；extractTickers L15-17 提取后去重。
- **只读探针实证**（用当前正则直接跑）：
  - `ROE > 20%` → `ROE`
  - `FCF CAGR > 10%` → `FCF,CAGR`
  - `600519 · ROE > 20%` → `600519,ROE`
  - `茅台 ROE 提升` → `ROE`
- 误提取会进 `/screening` tickers 数组（Discover.tsx L46）。→ 属实。
- **证据**：Discover.tsx:13-17/40-46 + 正则探针。
- **建议处置**：**修（用户可感，优先）**。收紧 ticker 提取——只把严格股票形态当代码（6 位数字、带 sh/sz/hk/us 前缀、.HK 后缀或通过 tickerContract supported 校验）；非代码 token 不进 screening tickers。B12 方案②建议拆分"查股票/搜因子"两动作，本卡不做大改，仅修正提取逻辑（不误把英文术语当代码）。与既有 BACKLOG-028 tickerContract 复用（shared canonical）。

### B8-文案暴露实现术语 — 已证实（真实，产品化取舍）
- **断言**：IR/CAGR/MDD/as_of/quality、Research/Compare/Monitor 等暴露给非技术用户。
- **核验**：
  - 中文 nav（zh.ts L8-23）已是"今日/研究/发现/策略/组合/监控/资料库"——**导航已中文化**，但 StrategyLab 结果 MetricStrip 直接显示英文 "CAGR"/"Sharpe"/"MDD"（StrategyLab.tsx L709-711）；BacktestSummary L30/31 等折叠专业区用英文 Sharpe/Sortino/Calmar/Beta/R²/Tracking Error（有 tooltip 中文解释，收在 Collapse 专业区）。
  - as_of/quality 枚举：SourceChip/EvidenceDrawer/EvidenceRail 展示 raw 枚举（EvidenceDrawer.tsx L53/58-60 quality/UNKNOWN）；zh.ts L1015 today.capability.status 含 AVAILABLE/OK/UNKNOWN/RUNTIME_CHECK_REQUIRED。
  - IR 文案：zh.ts L1052/1063 "策略 IR（不执行）"/"不可执行 IR"。
- **证据**：StrategyLab.tsx:709-711、BacktestSummary.tsx:30-45、EvidenceDrawer.tsx:53-60、zh.ts:1015/1052/1063、zh.ts:8-23（nav 已中文）。
- **建议处置**：**修（低风险，展示层）**——把首屏结果指标条 CAGR/MDD 标签换成中文 i18n key（zh 有 年化收益/最大回撤）；raw 枚举保留在专业详情/折叠区，卡面用中文。注意不破坏 E2E 断言（改前查 e2e 引用）。

### B9-启动到第一份研究的配置门槛 — 部分证实（机制，真实门槛待核）
- **断言**：start.bat 需 Bun/可能改 .env；Settings 默认非模型引导。
- **核验**：start.bat 存在（BACKLOG-017/018），引导 venv/bun/dist/.env；Settings.tsx L598 `<Tabs defaultActiveKey="system">` → 默认打开系统任务页而非模型引导 → 属实；"干净机器首次体验" 无实测（属安装验收，超出本卡只读范围）。
- **建议处置**：**记录**（首用引导属产品改进，B12 也提及，需用户拍板范围；后端/start.bat 已被 017/018/019 充分覆盖）。仅修 Settings 默认 tab 属低风险，但方向需确认。

### B10-空 AgentRail 占 376px 右栏 — 已证实（真实）
- **断言**：AgentRail 四标签固定空态、桌面默认展开占 376px；多提问入口分散。
- **核验**：AgentRail.tsx L10-27 只收 open/onClose，四 Tabs 内容全为 Empty/占位；App.tsx L188 桌面默认 `agentRailOpen=true`（非窄屏）；app.css L108-114 `.research-os-shell { grid-template-columns: minmax(0,1fr) 376px }` 默认给右栏 376px → 属实。多入口：CommandBar(header) L223、首页 Hero（Dashboard CommandBar variant hero）、CommandComposer 底部 L316、AgentRail 无内容 → 入口多但 AgentRail 空 → 属实。
- **证据**：AgentRail.tsx:10-27、App.tsx:188/223/316/318、app.css:108-114/116-128。
- **建议处置**：**记录**（B12 方案①建议默认关闭空 AgentRail——产品级改动，需用户拍板；空态右栏占宽属真实但非 bug）。

### B11-回测首屏/指标顺序与语义 — 已证实（真实，部分可低成本修）
- **断言**：首屏工具排在验证前；完成指标在中文结论前；MDD 红绿语义不统一；FinancialMetric 空值 pre-格式化 quality="OK"。
- **核验**：
  - 首屏 IR 卡（StrategyLab.tsx L468 自然语言卡在参数表前）；完成后先 MetricStrip（L708-713 CAGR/Sharpe/MDD/win-rate）→ Tabs → overview → BacktestSummary（中文结论 Alert L55）→ 指标行。Astra 顺序断言属实。
  - MDD 红绿：StrategyLab.tsx L711 `{ key:'mdd', tone:'down' }`（--fq-price-down 绿）vs BacktestSummary L61 tone='risk'（--fq-risk 红）→ 同一 max_drawdown 两种语义 → 属实。
  - FinancialMetric pre-format：BacktestSummary L9 pct() 把 null → '—' 字符串，然后 L67-73 传 value（已是破折号）quality="OK" → 空值被当 OK 展示 → 属实（FinancialMetric.tsx L26 只有在 value==null 时才显示 unknown，但调用方已把 null 格式化成 '—'，导致 quality OK + 破折号）。
- **证据**：StrategyLab.tsx:468/706-713、BacktestSummary.tsx:9/55-77、FinancialMetric.tsx:26、app.css:617-618/657-658。
- **建议处置**：**修（低成本子集）**——MDD 语义统一为 risk、FinancialMetric 传原始 null + 真实 quality（破折号移入组件显示层，空值 quality 不标 OK）。顺序/首屏属 B12 方案②产品级，记录待拍板。

### B12-两处产品级重做 — 记录待用户决策（不自动实施）
- 首页→研究连续工作面、策略实验室"规则-结果-限制"同视野。任务书明确**禁止擅自实施**，需用户单独确认范围。阶段 0 仅记录。

---

## 处置路线（阶段 1 建议顺序）

任务书顺序：已证实 P1（A2/A3/A4）> 用户可感（B6/B7）> 已证实 P2 > 主题类（B2/B3）。
每修一条 = 修改 → 聚焦测试 → 全量门禁 → 独立 commit。

- **A2/A3/A4（P1 后端）**：事务所有权收敛（database 层统一提交/回滚与取消保护）；SSE finally 有界取消保护 + 原生断连回归；run 接口条件更新。
- **B6/B7（前端用户可感）**：Research 读 prompt 呈现；Discover ticker 提取收紧复用 tickerContract。
- **A5（P2 后端）**：工具线程上下文显式传递 + 研究路径走 dispatch 校验。
- **A8（P2 后端）**：腾讯 K 线 period 语义、新浪缺字段 UNKNOWN、指数代码放行。
- **B2/B3/B4/B5（主题/尺寸）**：图表主题重取色、Drawer getContainer、ConfigProvider token 映射、半径/sider 对齐（改前核 E2E 与 HANDOVER 既有 6-8px 收敛记录）。
- **记录不修**：A1（archify 生成物漂移，README 计数已收敛）、A6（降级完成契约）、A7（机制记录，无受损实例）、B1（证伪旧结论→文档修正）、B8（文案展示层低风险、部分可顺手）、B9（首用引导产品化）、B10（空右栏产品级）、B11（仅低成本子集）、B12（两处重做，禁擅自实施）。

## 收尾纪律

阶段 0 全程零业务改动：本核验表为唯一新增文件，其余工作树无修改。下一步按处置路线进入阶段 1 逐条修复（每修独立 commit）。
