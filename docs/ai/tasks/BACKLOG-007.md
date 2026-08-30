# BACKLOG-007 — 前端组件测试续扩 + 后端覆盖率攻坚 86.8%→90%（综合）

> 状态：`[READY]` ｜ 优先级：P1 ｜ 创建：2026-08-30 ｜ 执行者：Codex
> 背景：BACKLOG-006 已为 10 个核心组件补了直接测试，但前端仍有 **42 个组件无直接测试**（其中约 20 个完全裸奔、22 个仅被其他测试间接覆盖）。后端覆盖率 BACKLOG-004 后为 **86.83%**（613 passed），距 90% 差约 390 语句，剩余薄点集中在 backtests 74.9%、market_review 80%、news_search 82.7%、market_overview 84% 及一批 routers 层。
>
> 本任务 = **前端组件测试续扩** + **后端覆盖率 86.8%→≥90%**，二合一（上次合并任务效果好，继续此模式）。

---

## 允许修改

- `frontend/tests/*.test.tsx`（新建或增强组件测试）
- `backend/tests/*.py`（新建或增强确定性测试）
- `docs/ai/tasks/BACKLOG-007.md`、`docs/ai/EXEC_PLAN.md`、`task/CHANGELOG.md`

## 禁止修改

- `backend/app/`、`frontend/src/` 业务代码——**纯补测试**，发现 bug 只记录
- 数据库、schema、认证、依赖、锁文件、`reference/`

---

## 完成标准

### 目标 1：前端组件测试续扩（≥12 个组件）

**完全裸奔（无任何间接覆盖，优先补）**——每组件 ≥2 用例：

| 组件 | 建议测试点 |
|------|-----------|
| `ActionBar` | 动作渲染、回调触发、disabled 态 |
| `CommandBar` | 命令输入、回车提交、结果展示 |
| `EventTimeline` | 时间线渲染、空态、事件分类 |
| `EvidenceDrawer` | 打开/关闭、证据详情、键盘关闭 |
| `EvidenceRail` | 证据列表、空态、点击回调 |
| `FinancialTable` | 表格渲染、数字格式化、空数据 |
| `FundamentalsSourcePanel` | 基本面指标展示、UNKNOWN 态 |
| `MCPServerSettingsPanel` | 服务器列表、启用切换（mock PATCH） |
| `ModelSelector` | 模型下拉、切换回调、当前模型标记 |
| `PortfolioEvents` / `PortfolioWhy` | 组合事件/归因展示、空态 |
| `SourceChip` / `StatusChip` | 各 quality/status 变体渲染 |
| `StockChart` / `TimeseriesChart` / `LazyEChart` | mock 图表渲染、空数据、aria-label |
| `SystemSettingsPanel` | 设置表单、保存回调（mock） |
| `TodayMarketPulse` / `TodayUniverse` / `TodayNeedAttention` | Today 组件各块渲染 |

**间接覆盖转直接（≥8 个，可选加分）**：`AgentModeSelector`、`AlphaResearchPanel`、`BacktestCharts`、`BacktestFailurePanel`、`CompareGrid`、`DecisionCard`、`DiscoverResults`、`DiscoverSearch`、`FinancialMetric`、`LangSwitcher`、`MetricStrip`、`MonitorCard`、`MonitorTypeChips`、`PortfolioOverview`、`ProfessionalPreferencesPanel`、`ResearchArtifact`、`ResearchCharts`、`ResearchRuns`、`StreamingText`、`ThesisBlock` —— 已有间接覆盖，可补独立测试文件。

**要求**：
- 每组件 ≥2 用例（渲染基本态 + 至少 1 个行为/边界态）
- `@testing-library/react` + jsdom，mock 一切外部（`LanguageProvider` 包裹、无网络）
- **目标：新增 ≥12 个组件、≥25 个测试用例**

### 目标 2：后端覆盖率 86.83% → **≥ 90%**

用 `pytest --cov=app --cov-report=term-missing` 测量，`TOTAL` 必须 ≥ 90%。**优先攻克**（按"规模 × 缺口"排序，每模块至少 +5pp 或补到 ≥88%）：

| 靶点 | 当前 | 建议方向（Missing 行号参考） |
|------|------|------------------------------|
| `routers/backtests.py` | 74.9%（221 语句/45 未覆盖） | 回测创建/列表/详情/保存/取消/portfolio 回测各分支、参数校验失败 |
| `services/market_review.py` | 80% | 大盘复盘生成、失败降级、历史持久化 |
| `services/news_search.py` | 82.7% | 多源 fallback/aggregate、逐条来源保留、上游失败 |
| `services/market_overview.py` | 84%（466 语句/50 未覆盖） | 指数/涨跌统计/板块排行/人气股/涨停池各分支、unsupported 市场 |
| `routers/settings.py` | 80% | 系统设置读写、scheduler 重启、product-metrics |
| `services/discussion_orch.py` | 82.1% | 讨论编排、角色轮序、总结生成 |
| `services/swarm_orch.py` | 84.8% | DAG 团队、上下文传递、失败处理 |
| `tools/mcp_bridge.py` | 84.7% | 工具注册、启用/停用、错误 |
| `routers/alerts.py` / `dashboard.py` / `instruments.py` | 80-82% | 各路由分支、错误态 |

**硬性要求**：
- 新增测试**确定性**（mock 所有外部 I/O，参考既有模式：`test_trading_agent_tools.py` monkeypatch、`test_market_data_degradation.py` httpx.MockTransport）
- 不依赖真实网络/代理；开/关代理双环境结果一致
- 每个靶点补测后跑聚焦 + 全量回归

### 目标 3：验证

- 前端：`cd frontend && bun run build` 通过；`bun run test` 全绿（74 files 基线 + 新增）
- 后端：`backend\.venv\Scripts\python.exe -m pytest backend\tests -q --no-cov -p no:cacheprovider` 全绿（613 + 新增）
- 覆盖率：`--cov=app --cov-report=term-missing` → `TOTAL ≥ 90%`
- 确定性：开/关代理各跑新增后端测试，结果一致
- `backend\.venv\Scripts\python.exe -m ruff check backend/tests` 通过；`git diff --check` 通过

### 目标 4：文档同步

- `docs/ai/EXEC_PLAN.md` 标记 `[DONE]`（证据：组件数/用例数、覆盖率前后对比、双环境确定性）
- `task/CHANGELOG.md` 追加一条

---

## 参考

- 前端：`frontend/tests/EvidenceChip.test.tsx`（BACKLOG-006 新增，LanguageProvider 包裹模式）、`frontend/tests/TaskPageHeader.test.tsx`
- 后端：`backend/tests/test_market_data_degradation.py`（httpx.MockTransport 模式）、`backend/tests/test_sse_error_paths_backlog004.py`（路由级确定性）、`backend/tests/test_trading_agent_tools.py`（monkeypatch 类方法）
- 覆盖率测量：`backend\.venv\Scripts\python.exe -m pytest backend/tests -q --cov=app --cov-report=term-missing -p no:cacheprovider`

## 验证命令

```powershell
# 后端
cd backend
.\.venv\Scripts\python.exe -m pytest ..\backend\tests -q --no-cov -p no:cacheprovider
.\.venv\Scripts\python.exe -m pytest ..\backend\tests -q --cov=app --cov-report=term-missing -p no:cacheprovider
.\.venv\Scripts\python.exe -m ruff check ..\backend\tests
cd ..
# 前端
cd frontend
bun run build
bun run test
cd .. && git diff --check
```

## 完成证据（执行后填写）

- 修改文件清单（前端测试 / 后端测试）：
- 前端：新增组件数 / 用例数 = ?/?；Vitest 总结果（74 → ? files，227 → ? tests）
- 后端：覆盖率 TOTAL 86.83% → ?%；新增测试数；完整套件结果
- 开/关代理确定性验证：
- 备注（发现的真实业务 bug 或未完成项，只记录）：
