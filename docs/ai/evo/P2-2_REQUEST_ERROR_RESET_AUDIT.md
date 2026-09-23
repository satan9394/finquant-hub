# P2-2 请求开始时清理失败态：只读调用点清单

**审计日期**：2026-09-23
**扫描范围**：`frontend/src`
**结论**：扫描器发现 106 个直接清空错误状态的语法点；54 个点所在函数后续还有异步/API 类调用。逐项核对后，排除 8 个本地计算或实体切换清理，确认 **46 个请求/异步后端操作在开始前清理错误态**。本次已完成 Portfolio 真实持仓首批三态收敛；以下 46 个点保持待后续排期，不在本轮扩改。

## 可复核扫描

```powershell
node scripts/audit-request-error-resets.mjs --candidates-only
```

脚本基于仓库已有的 TypeScript 编译器 AST，只读扫描直接以 `null`、`undefined`、`false`、空字符串、空数组或空对象调用的错误/失败状态 setter，并列出同一函数内后续的异步/API 类调用。AST 会忽略注释。输出是候选集合，必须按下表结合调用语义复核；扫描器不会把“后面有异步调用”直接断言为缺陷。

## 已核实的 46 个剩余调用点

| 文件 | 行 | 函数 | 开始的操作 |
|---|---:|---|---|
| `frontend/src/components/alpha/AlphaResearchPanel.tsx` | 46 | `loadCatalog` | 拉取 Alpha 类别目录 |
| `frontend/src/components/MemoryManager.tsx` | 66, 90 | `runAction`, `remove` | 记忆写操作与删除后刷新 |
| `frontend/src/components/portfolio/PortfolioRiskWorkbench.tsx` | 201 | `run` | 组合回测 |
| `frontend/src/components/settings/FundamentalsSourcePanel.tsx` | 33, 60 | `load`, `save` | 基本面来源读取与保存 |
| `frontend/src/components/settings/MCPServerSettingsPanel.tsx` | 83 | `toggleConnection` | MCP 连接状态切换 |
| `frontend/src/components/settings/PricingConfigPanel.tsx` | 52, 69 | `submit`, `remove` | 计价保存与删除 |
| `frontend/src/components/settings/SystemSettingsPanel.tsx` | 22, 44 | `load`, `save` | 系统设置读取与保存 |
| `frontend/src/components/settings/UsageRecordsPanel.tsx` | 39 | `loadRecords` | 使用记录读取 |
| `frontend/src/components/StockChart.tsx` | 44 | `loadData` | K 线数据读取 |
| `frontend/src/components/SwarmStatusCard.tsx` | 113 | `loadTeam` | Swarm 团队定义读取 |
| `frontend/src/pages/LimitPool.tsx` | 25 | `loadPool` | 涨跌停池读取 |
| `frontend/src/pages/Login.tsx` | 50 | `sendCode` | 登录验证码请求 |
| `frontend/src/pages/Portfolio.tsx` | 180, 200, 214, 233 | `loadPaperPortfolios`, `loadPaperValuation`, `loadPaperReviewContext`, `loadPaperReviewDraft` | 模拟组合区读取 |
| `frontend/src/pages/ResearchWorkspace.tsx` | 304, 322, 426 | timeline / workspace / continuity load | 研究时间线、筹码/资金流/龙虎榜与连续性读取 |
| `frontend/src/pages/Settings.tsx` | 57, 68, 122, 133, 143, 384–386 | `loadJobs`, `showRuns`, `load`, `toggle`, `clear`, `loadAll` | 设置、计价与用量数据读取/修改 |
| `frontend/src/pages/StockAnalysis.tsx` | 67 | ticker effect | 行情报价读取 |
| `frontend/src/pages/StrategyLab.tsx` | 200, 253, 256, 279, 336, 370, 385 | `loadIntent`, `parseStrategyDescription`, `applyStrategyIR`, `execute`, `openSavedRun`, `openSharePreview` | 意图读取、策略解析/应用、回测、历史行情与分享预览 |
| `frontend/src/pages/Thesis.tsx` | 226, 240, 351, 380, 399, 415, 429 | version/review/challenge/share/validation actions | Thesis 读取与后端操作 |

合计：**46 个 setter 调用点**。修复时继续按单实体/单请求推进，不批量改写；优先复用已建立的 `ReadState` / `readStateOf` / `LoadStateView`，并给每批补充重试确实重发的测试。

## 从 54 个语法候选中排除的 8 个点

- `frontend/src/components/alpha/AlphaSimulationWorkbench.tsx:78`：启动的是本地 Alpha 计算，不发 API 请求。
- `frontend/src/pages/Chat.tsx:231-233`：当前会话被清空时作废请求并清理会话归属；后续 `loadMessages` 位于“有当前会话”的另一分支。
- `frontend/src/pages/Discussion.tsx:216-218`：当前讨论房间被清空时作废请求并清理房间归属；后续 `loadRoomDetail` 位于“有当前房间”的另一分支。
- `frontend/src/pages/Portfolio.tsx:251`：切换模拟组合时清理上一组合的草稿错误归属，避免把旧实体错误显示在新实体上；其后触发的估值/详情请求不属于该草稿错误。
