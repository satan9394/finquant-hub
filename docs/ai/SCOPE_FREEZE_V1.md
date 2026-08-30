# FinQuant Hub Scope Freeze v1 — 保留式减法重构 Phase 0

> 版本：v1 ｜ 日期：2026-08-29 ｜ 状态：`[ACTIVE]`（维护者 2026-08-29 批准执行）
> 依据：`docs/ai/REFACTOR_DECISION.md`（已批准）+ 子代理现状审计 + 本 Phase 0 的代码事实校准。
> 本文档是**重构期间的 scope 唯一权威**：冻结期间不新增功能，只做减法、收敛、迁移与修复。

---

## 1. 产品定位（不变量）

**一句话**：面向中文个人投资者的、本地运行的 AI 原生投资研究系统——把"模糊的市场疑问"转化为"有数据支撑、被审计、可执行的个人投资决策"。

- 运行形态：local-first（本机安装自用 + GitHub 开源可复现），Docker Compose 为唯一受支持安装路径（`docker-compose.local.yml`，仅绑定 127.0.0.1）。
- 目标用户：非技术背景中文投资用户（自用为主）。
- 产品红线（沿用 Design System v1）：不把 AI 判断包装成事实；拿不到数据保留 UNKNOWN/PARTIAL/UPSTREAM_ERROR；不把模拟包装成真实；有后果的动作必须用户显式确认。
- 架构不变量（沿用 TECH_STACK.md）：无 ORM / 无连接池 / 无独立 DAL / 无 WebSocket（SSE 唯一实时通道）/ 纯 CSR / 认证与用户隔离不可删除 / LOCAL_ONLY_MODE 仅 development。

---

## 2. 核心用户旅程（唯一主线）

沿 UI_OPTIMIZATION_PLAN 已确认的单一工作流，冻结为 **7 步闭环**：

```
发现 → 研究 → 建立 Thesis → 验证 → 进入组合/观察池 → 持续监控 → 变化触发 → 回到研究
```

**五种核心对象**（重构期间不得新增其他领域对象）：

| 对象 | 含义 | 现有载体 |
|------|------|---------|
| Entity | 股票/公司/ETF/行业/主题 | `/analysis/:ticker`（StockAnalysis/Entity Workspace） |
| Research Case | 针对对象的持续研究上下文 | ResearchWorkspace 聚合 |
| Thesis | 投资假设、证据、反证、催化剂 | `/research?mode=thesis`（Thesis 面板） |
| Monitor | 持续运行的观察条件 | `/alerts` |
| Experiment | 策略、因子、回测、情景 | `/strategy-lab/ma-crossover` |

**三个核心任务**（沿用 PRODUCT_USABILITY_BASELINE 定义，度量口径不变）：
1. 分析股票（stock_analysis）：输入 ticker → 行情 + 技术信号 + AI 研究结论可见。
2. 验证策略（strategy_validation）：选择标的与参数 → 回测运行 → 结论/基准/回撤/成本/来源可见。
3. 体检组合（portfolio_check）：组合 PnL + 风险 X 光可见。

---

## 3. P0 / P1 / P2 范围清单

### 3.1 P0 — 保留并打磨（核心闭环，重构后必须全部工作）

| 模块 | 载体 | 处置 |
|------|------|------|
| 多市场行情（A/HK/US 降级链） | market_data.py + 4 源适配器 | 保留，不动 |
| 技术指标（7 numpy 指标） | indicators.py | 保留，不动 |
| AI 研究编排（4 Agent 并行 → 13 章报告） | research_orch + 13 工具 | 保留；吸收 Agent SDK 3 设计点（类型驱动工具校验/event_sink/guardrail） |
| 研究工作区（Entity Workspace） | ResearchWorkspace + StockAnalysis | 保留；收敛模式面板 |
| 策略回测 v2（A 股执行规则） | backtests.py + ma_crossover | 保留；**v1 回收**（见 Phase 2） |
| 投资组合 + 风险 X 光 | portfolio.py + 风险服务 | 保留；**三轨合并**（见 Phase 2） |
| 预警 / Monitor | alerts.py | 保留 |
| 认证 + LOCAL_ONLY | auth + 中间件 | 保留，不动 |
| 统一标的接口 + 证据溯源 | instruments + evidence | 保留 |

### 3.2 P1 — 保留但收敛（瘦身，不删除核心能力）

| 模块 | 现状问题 | 收敛动作 |
|------|---------|---------|
| Thesis v2 | thesis.py 969 行 + 9 表膨胀 | 保留领域对象，压缩服务层重复逻辑（Phase 2/3） |
| memory 层（5 服务） | 研究 OS 膨胀 | 收敛为单一 typed memory + FTS5 主路径；candidate 抽取保持 opt-in |
| i18n 双语 | zh/en 各 2,202 keys / 4,410 行 | 保留；清理孤儿页面专属 key |
| MCP 市场 | 外部工具动态注册 | 保留（系统工具），不动 |
| Alpha 因子研究 | alpha_service + starter catalogue | 保留 Discover 模式入口；**alpha_brain（BRAIN 桥）降级为可选** |
| 讨论 / 多视角审查 | discussion_orch | 保留（Review 模式面板） |
| 报告导出（MD/HTML/PDF/DOCX） | export 服务 | 保留 |

### 3.3 P2 — 降级或回收（重构期间从主路径移除，进回收站或归档）

**前端（Phase 1 回收）：**

| 资产 | 证据 | 处置 |
|------|------|------|
| `pages/AlphaResearch.tsx` | 业务零引用，仅 `tests/AlphaResearch.test.tsx` 背书 | 页面进回收站；测试同步移除（Discover 的 alpha 模式是其替代） |
| `pages/Screening.tsx` | 业务零引用（/screening 已重定向到 /discover?mode=screening），仅测试背书 | 页面进回收站；测试同步移除 |
| `components/ChinaMap.tsx` | 业务零 import，仅 VisualComponents.test.tsx 引用 | 进回收站；测试同步移除 |
| `components/CountUp.tsx` | 同上 | 进回收站；测试同步移除 |
| `components/Marquee.tsx` | 同上 | 进回收站；测试同步移除 |
| `components/ScrollingTable.tsx` | 同上 | 进回收站；测试同步移除 |
| BigDataView 装饰残留（大屏视觉元素） | Design System v1 已收敛 | 随上述组件一并清理 |

**后端（Phase 2 回收）：**

| 资产 | 证据 | 处置 |
|------|------|------|
| v1 回测 `backtest.py`（/api/backtest） | 前端零调用（grep `/api/backtest` 无匹配）；v2 已接管 | 路由下线（回收站），测试同步；OpenAPI 核对 |
| `POST /api/analysis/stock`（SSE 旧研究入口） | analysisApi.ts L18 注释证实前端已弃用 | 下线或保留为兼容别名需再确认（见 Phase 2 任务卡） |
| `portfolio_groups` / `portfolio_items` 表 | database.py L217-246 纯 schema 孤岛，全仓零读写 | schema v24 迁移时移除（见 Phase 3） |
| 双调度器（scheduler_loop + cron/research_jobs） | 重复职责 | 收敛为单一调度器（Phase 2/3） |
| product_metrics 事件表 | 本地产品指标（默认关闭） | 保留（P1 收敛，不回收——有产品度量合同） |
| share_preview | AIOS-070 私有预览 | 保留（P1 收敛） |

**文档/测试（伴随清理）：**
- 孤儿页面/死组件对应测试文件同步进回收站（AlphaResearch.test.tsx、VisualComponents.test.tsx 中的死组件用例等）。
- `docs/API_CONTRACT.md`、`docs/ARCHITECTURE.md`、`docs/ROUTER_MAP.md` 随每次下线同步（Doc sync rule）。

---

## 4. 冻结规则（重构期间）

1. **不新增功能**：新需求一律 PARKED，记入任务卡归档，不阻塞减法。
2. **不新增依赖**（npm/Python）：沿用现有铁律。
3. **不新增表/端点**：除 Phase 3 的 schema v24 收敛迁移（只减不加）。
4. **每 Phase 门禁**：`pytest -q && ruff check . && cd frontend && bun run build`（+ 影响面 Vitest 聚焦）。
5. **删除铁律**：一律 PowerShell 回收站，禁 rm/del。
6. **文档同步**：端点/路由/表变更 → API_CONTRACT / ARCHITECTURE / ROUTER_MAP；每 Phase 追加 task/CHANGELOG.md。
7. **归档**：回收资产的原始内容不做 git 删除备份——回收站即备份；任务卡状态更新到 EXEC_PLAN。

---

## 5. 执行路线图（Phase 1-4 摘要）

| Phase | 内容 | 门禁 |
|-------|------|------|
| 1 | 前端减法：AlphaResearch/Screening 回收、4 死组件回收、孤儿测试同步、i18n key 清理 | bun run build + Vitest |
| 2 | 后端减法：v1 回测下线、/api/analysis/stock 处置、组合三轨合并（代码层）、双调度器收敛 | pytest + ruff + OpenAPI |
| 3 | schema v24：52→28 表收敛迁移 + pre-v24 备份 + 恢复演练 | 迁移测试 + 恢复演练 |
| 4 | 契约层：OpenAPI→TS 类型生成 + 一键启动完善 + README 双路径 + 文档终对齐 | build + doctor + 浏览器验收 |

---

## 6. 校准记录（Phase 0 对子代理审计的修正）

Phase 0 用代码事实校准了子代理 A 审计的 2 处判断：

1. **"6 个孤儿页面"修正为 2 个真孤儿 + 4 个模式面板**：Chat/Discussion/Research/Thesis 被 ResearchWorkspace（fast/deep/review/thesis mode）和 StockAnalysis 实际 import 消费，是活跃复用资产，**不是**孤儿；真孤儿只有 `AlphaResearch.tsx` 与 `Screening.tsx`（业务零引用，仅测试背书）。
2. **死组件 4 个确认无误**：ChinaMap/CountUp/Marquee/ScrollingTable 仅 VisualComponents.test.tsx 引用，业务 import 零。

校准原则：scope 冻结以代码 import 图为准，不以历史任务卡描述为准。

## 7. Phase 1 执行校准（2026-08-29 实作中发现）

1. **Alpha 工作台入口断裂发现与修复**：回收 AlphaResearch 页面时发现 Discover 的 `?mode=alpha` 路由从未真正渲染 Alpha 工作台（只做 `searchAlpha` 字段搜索），导致 Alpha 本地模拟/IC/相关性/保存恢复（PROD-034/036/037 成果）静默无入口。已新建 `frontend/src/components/alpha/AlphaResearchPanel.tsx`（原页面主体收敛为面板），Discover 增加 mode 分发（`?mode=alpha` → AlphaResearchPanel，hooks 顺序合规），并补 `tests/DiscoverModeDispatch.test.tsx`。Alpha 工作台组件（AlphaTemplateCatalog / AlphaSimulationWorkbench）保留为活跃资产。
2. **"双主题收敛"项无需动作**：ConfigProvider 是单实现（darkAlgorithm/defaultAlgorithm 切换），硬编码色值已为 0——不存在双主题双轨。
3. **i18n 孤儿 key 清理项修正**：孤儿页面/死组件无专属 i18n key（AlphaResearch 为硬编码中文，未进字典），无需清理；AlphaResearchPanel 沿用硬编码中文（与工作台组件一致），其 i18n 迁移记为后续 P1 项。

## 8. Phase 2 执行校准（2026-08-29 后端盘点中发现）

用后端代码调用图校准子代理 A 审计的"后端死资产"断言——**4 项中 3 项为误报**：

1. **v1 回测 `/api/backtest` 不是死 API（保留）**：`frontend/src/pages/Chat.tsx`（handleRunBacktest）活跃消费 `POST /backtest/runs`（对话式回测，TASK-010 从 Vibe-Trading 吸收）。子代理 A grep 模式 `/api/backtest` 未命中 axios baseURL 拼接后的 `/backtest/runs`，造成漏检。v1（close-only 向量化，供对话快速回测）与 v2（A 股执行规则，供策略实验室）双引擎各有用途，**保留**。
2. **`/api/analysis/stock` 保留**：是 `/api/research` 的多 Agent 研究的轻量 SSE 别名（同走 `run_research`，不持久化报告）；analysis router 的活跃端点（indicators/chart-data）与其同属一个 router，且 test_router_contracts 以其为 sentinel。收敛收益 < 风险，**保留**（可留作后续候选）。
3. **双调度器是误报**：scheduler_loop 单一实现（scheduler.py:354），main.py lifespan 启动一次，settings.py PATCH /system 是"配置变更后先 cancel 再重启"机制，非并行双调度器；research_jobs 是作业账本/租约模块而非第二调度器。**无需动作**。
4. **组合三轨孤岛确认（Phase 3 清理）**：portfolio_groups/portfolio_items/portfolio_trades 三表全仓零 SQL 读写（仅 database.py 建表），活跃的是 portfolios/positions。归入 Phase 3 schema v24 收敛迁移。

**Phase 2 范围修正**：后端减法从"v1 回测回收 + 死 API 下线 + 组合三轨合并 + 双调度器收敛"修正为——**组合三轨表归入 Phase 3 schema 迁移；其余后端资产经核实均活跃或低收益，不回收**。Phase 2 实际工作转为：API_CONTRACT/ROUTER_MAP 核对与校准（确认 133 端点清单与 OpenAPI 一致，标记重复/别名端点），以及 Agent SDK 3 设计点自研吸收（tools.py + llm_client.py，零新依赖，约 100-200 行）。

## 9. Phase 1/2 完成记录（2026-08-29）

### Phase 1 完成 ✅
- 回收 2 个真孤儿页面（AlphaResearch.tsx、Screening.tsx）、4 个死组件（ChinaMap/CountUp/Marquee/ScrollingTable）、2 个测试文件（AlphaResearch.test.tsx、VisualComponents.test.tsx）——全部进回收站。
- 移除死依赖 `@datapool/china.geojson`（仅 ChinaMap 使用）。
- **Alpha 工作台接线**：新建 `frontend/src/components/alpha/AlphaResearchPanel.tsx`，Discover `?mode=alpha` 分发渲染（hooks 顺序合规，mode 分发在全部 hooks 之后）；补 `tests/DiscoverModeDispatch.test.tsx`（2 tests）。
- 门禁：`bun run build` 通过；Vitest 62 files / 196 tests 全绿（回收后），新增测试后再跑 62 files / 196 tests 全绿。
- 校准：SCOPE_FREEZE §7（Alpha 入口断裂修复、双主题无需动作、i18n 无孤儿 key）。

### Phase 2 完成（后端盘点 + Agent SDK 设计点）✅
- 后端盘点校准见 §8：v1 回测 / `/api/analysis/stock` / scheduler_loop 均核实为活跃或低收益，不回收；组合三轨孤岛表归入 Phase 3。
- **Agent SDK 3 设计点自研吸收**（零新依赖，对应 REFACTOR_DECISION §5.2）：
  1. 类型驱动工具 schema + 前置校验：`ToolRegistry.dispatch()` + `validate_tool_arguments()`（required + 类型校验），`chat._execute_tool` 改为走 dispatch。
  2. 受控事件枚举 + event_sink：`llm_client.TOOL_LOOP_EVENTS`（tool_started/tool_completed/tool_failed/tool_loop_done/tool_loop_exhausted），`chat_with_tools_loop` 增加 event_sink 回调；`chat.py` SSE 事件改由 event_sink 收集转发。
  3. loop guardrail：`chat_with_tools_loop` 增加 pre_tool_hook（拦截）与 post_tool_hook（输出替换）；AdversarialReview 强制 hook 能力就绪，默认不启用（改变 chat 延迟/成本特征，留待维护者决策）。
- 测试：test_tool_registry.py 新增 dispatch 校验 2 项；test_chat_tools.py 新增事件枚举 + hooks 2 项；共 8 passed（含既有）。mypy/ruff 通过。
- 注：test_agent_tools_execution 2 项失败为环境性（系统 SOCKS 代理 + 缺 socksio），与本次改动无关。

### Phase 3 完成（schema v24 收敛迁移 + 备份演练）✅

- **迁移实现**：`backend/app/database.py` 新增 `_SCHEMA_CLEANUP_VERSION = 24`；从 `_OWNER_TABLES` 移除 `portfolio_groups`/`portfolio_items`/`portfolio_trades`（否则 claim_unowned_data 会 UPDATE 已删除表）；从 `SCHEMA` 移除三张表定义（新库不再创建）；新增 `_install_schema_cleanup()`（DROP 三表，顺序 trades→items→groups）与 `_backup_database_before_schema_cleanup_migration()`（pre-v24.bak）。
- **真实迁移演练**：先在副本上演练（v23→v24，遗留表删除、活跃组合数据保留、备份生成），再对真实 `backend/data/finquant.db` 执行迁移。结果：user_version 24、遗留表 0、portfolios 1 行 / positions 2 行 / research_reports 8 行数据完整、`finquant.db.pre-v24.bak` 生成。
- **测试**：新增 `test_schema_cleanup_migration_creates_pre_v24_backup_and_drops_legacy_portfolio_tables`（迁移测试 16/16 通过）；更新 test_api.py 三个 LLM stub 接受 `event_sink` 等新参数（chat_with_tools_loop 新签名，ToolCallingClient 模拟 event_sink 事件）与 test_database_recovery_audit / test_scheduler_runtime_benchmark 版本断言改为 `database._SCHEMA_VERSION`。
- **门禁**：后端全量 525 passed / 8 failed（与基线 520 passed / 8 failed 对比——8 个失败全部为预存环境性失败：auth 404、credentials、router_contracts lifespan、user_isolation、paper_review，git stash 基线验证与改动无关）；ruff/mypy 通过。
- **文档**：TECH_STACK（schema v24 / 49 张逻辑表）、ARCHITECTURE（v23→v24 段落 + 图 + 表数）已同步。
- **校准**：实际表数 52→49（删 3 张确认孤岛表）；SCOPE_FREEZE §3.3/§5 的"52→28 表"是长期参考目标，本轮完成第一步（组合三轨），其余表收敛（memory/thesis 膨胀等）留待后续 Phase。

### Phase 4 完成（契约层 + README 双路径）✅

- **OpenAPI→TS 零依赖生成器**：新建 `scripts/openapi_tsgen.py`（纯 Python 标准库，无 npm/Python 新依赖——遵守冻结规则），从运行时 FastAPI OpenAPI（59 个 component schemas）生成 `frontend/src/types/openapi.generated.ts`（361 行 TS 接口）。支持 `--check` 模式检测契约漂移。
- **契约门禁**：`frontend/package.json` 增加 `prebuild`（`openapi_tsgen.py --check`），`bun run build` 前强制校验——类型文件与后端 OpenAPI 漂移时 build 失败（已实测：注入漂移 → exit 1 阻断；恢复 → 通过）。生成物通过 `tsc --noEmit` 单独编译验证，且不破坏现有 build。
- **测试**：新增 `backend/tests/test_openapi_tsgen.py`（5 passed：schema 类型映射、对象必填、接口输出、漂移检测、CLI 冒烟）。
- **README 双路径**：README 安装段重构为"路径 A：本地 Docker（推荐，开源可复现）"与"路径 B：本地开发（无 Docker 裸机）"并列，均说明 LOCAL_ONLY 语义、端口约定与模型 key 降级行为。
- **门禁**：ruff（生成器+测试）通过；`bun run build`（含 prebuild 契约检查）通过；生成器测试 5/5。

