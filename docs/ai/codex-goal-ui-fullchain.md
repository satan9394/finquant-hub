# Codex Goal 引导 — FinQuant Hub UI 优化全链路（UI-000 → UI-004）

> 用途：直接复制粘贴给 Codex（或 ChatGPT Goal 模式），作为总目标，一次执行 UI-000 ~ UI-004 全部 5 个阶段。每阶段独立验证，完成后自动进入下一阶段。
> 懒人用法：对 Codex 说一句"读这个文件并执行"即可。

---

## 总目标（Goal）

完成 FinQuant Hub 的 UI 优化全部阶段，把产品从"17 个碎片功能页面"重构为"以研究对象为核心的金融研究操作系统（FinQuant Research OS）"，并全程支持中英文双语切换。

## 关键文件

| 用途 | 路径 |
|------|------|
| 总规划（背景与设计依据） | `E:\Code_file\Projects\finquant-hub\docs\UI_OPTIMIZATION_PLAN.md` |
| 执行计划（任务链状态） | `E:\Code_file\Projects\finquant-hub\docs\ai\EXEC_PLAN.md` |
| 任务卡 UI-000 | `E:\Code_file\Projects\finquant-hub\docs\ai\tasks\UI-000.md` |
| 任务卡 UI-001 | `E:\Code_file\Projects\finquant-hub\docs\ai\tasks\UI-001.md` |
| 任务卡 UI-002 | `E:\Code_file\Projects\finquant-hub\docs\ai\tasks\UI-002.md` |
| 任务卡 UI-003 | `E:\Code_file\Projects\finquant-hub\docs\ai\tasks\UI-003.md` |
| 任务卡 UI-004 | `E:\Code_file\Projects\finquant-hub\docs\ai\tasks\UI-004.md` |
| 项目交接档案 | `E:\Code_file\Projects\finquant-hub\HANDOFF.md` |
| 架构不变量 | `E:\Code_file\Projects\finquant-hub\AGENTS.md` |

## 开工前必读（按顺序，一次性读完再动手）

1. `HANDOFF.md` — 当前状态、边界、门禁命令
2. `AGENTS.md` — 架构不变量（无 ORM/连接池/WebSocket、纯 CSR、不新增依赖）
3. `docs/UI_OPTIMIZATION_PLAN.md` — 全局规划（含 i18n 设计、反 slop 规则、视觉 token）
4. `docs/ai/tasks/UI-000.md` ~ `UI-004.md` — 5 张任务卡
5. `frontend/src/App.tsx`、`frontend/src/app.css` — 当前 Shell 与 tokens

## 执行顺序（严格按序，每阶段独立验证）

### UI-000（P0）— Global Shell 与 i18n 双语基础
三栏 Shell + 8 组一级导航（Today/Research/Discover/Strategy/Portfolio/Monitor/Library/Settings）+ Global Command Bar 意图识别 + 系统状态降级 + Model Selector 语义层 + 纯前端自建 i18n（zh/en 持久化切换）。
- 删除的独立页面（快速问答/深度研究/多视角审查/投资论文）→ 并入 Research，旧路由保留重定向不 404。
- MCP 工具市场/模型管理 → 降级进 Settings。
- **验证**：`bun run build` + `bun run test` + 8 导航截图（1440/390 × light/dark × zh/en）存 `docs/ui-current/`。

### UI-001（P0）— Research Workspace 重构
Entity 页头（名称/代码/市场/实时价/涨跌 + Watch/Monitor/Compare）+ 8 tab（Overview/Thesis/Financials/Valuation/Peers/Earnings/Price/Research）+ Agent 模式（Fast/Analyst/Deep/Review）+ Thesis 数据对象化（stance/conviction/evidence/catalysts/invalidation）+ Evidence 引用系统（`[n]` 点击展开 Evidence Rail）+ Multi-Agent 改 Review（Consensus/Disagreement/Unresolved/Conflict）+ Compare 自然语言化。
- **验证**：build + test + Entity/Research/Deep Research/Review/Compare 截图。

### UI-002（P1）— Monitor 一级化与 Today 重做
Monitor 一级模块（10 种类型 Chip 筛选 + MonitorCard：State/Last check/Next check/Sources/Changes/New 事件 + Inspect/Run now/Edit）+ Today 重做（处理队列 → My Universe → 市场脉搏 → Research Runs），系统状态退出首屏。
- **验证**：build + test + Today/Monitor 截图。

### UI-003（P1）— Strategy / Discover / Portfolio 归位
Strategy Lab 自然语言优先（Parsed Strategy + Run + Advanced settings 折叠，运行后转结果视图，顶部只留 CAGR/Sharpe/MDD/Win Rate）+ Discover 合并选股器与 Alpha（自然语言搜索 + Filter Chips + 结果行 5 种动作）+ Portfolio P&L 首页（总市值 + Today P&L + Why 归因 + Risk + Events + Tabs）+ Portfolio↔Research 双向连接。
- **验证**：build + test + Strategy/Discover/Portfolio 截图。

### UI-004（P2）— 视觉 Token 收敛与反 slop 审计
`--fq-*` tokens 全站收敛（radius 8-16→6-8px、shadow 弱化、spacing 4px 网格）+ 行情/系统状态颜色分离（新增 `--fq-system-info/warning/error`）+ 13 个第一等组件落地（MetricStrip/FinancialTable/TimeseriesChart/CompareGrid/EventTimeline/EvidenceCard/ThesisBlock/MonitorCard/AgentRun/SourceChip/StatusChip/ActionBar/CommandComposer）+ taste-skill 反 slop 审计清单全过（`h-screen`→`min-h-[100dvh]`、CSS Grid、禁纯黑、三态齐全等）。
- **验证**：build + test + 全 8 导航截图对比前序无回归。

## 硬性约束（全程不可违反）

- 不新增任何 npm/Python 依赖
- 不改后端代码、schema、认证、用户隔离
- 不改 `reference/`、`docs/ai/ARCHITECTURE.md` 架构不变量
- 删除文件必须走回收站（PowerShell `SendToRecycleBin`），禁止 rm/del
- 保留旧路由重定向，不得 404
- 缺失后端字段展示 `UNKNOWN`，不前端补造数值
- 不 commit / push / publish / deploy

## 门禁命令（每阶段完成后必跑）

```powershell
cd E:\Code_file\Projects\finquant-hub\frontend
bun run build
bun run test
```

## 浏览器验收（你有内置浏览器/视觉能力）

每阶段完成截图存 `docs/ui-current/`：
- 对应页面（每阶段验收标准所列）
- 桌面 1440 + 窄屏 390
- light + dark
- zh + en 各一份
- 检查无横向溢出、无 Vite 错误遮罩、控制台无 error

## 阶段推进规则

- 每阶段完成 → 跑门禁 + 截图 → 更新 `docs/ai/EXEC_PLAN.md` 对应任务状态为 `[DONE]` 并填完成证据 → 自动进入下一阶段。
- 遇到阻塞：标记该阶段 `[BLOCKED]` 附证据，继续尝试下一独立阶段；只有全部阶段都依赖该阻塞时才停止并汇报。
- 阶段间不 commit（除非维护者明确要求）。

## 最终汇报格式

- **结论**：5 阶段全部完成 / 部分完成（列出完成与阻塞）
- **改动文件**：分阶段清单
- **验证结果**：build/test 输出 + 截图路径
- **截图差异对比**：前序 vs 当前（确认无视觉回归）
- **下一步建议**