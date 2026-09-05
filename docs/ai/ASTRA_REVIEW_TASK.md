# 审查任务书 — GPT-6 Astra 双会话架构 + UI 审查（FinQuant Hub）

> 创建：2026-09-04 ｜ 执行模型：OpenAI GPT-6 Astra（Codex 应用内选 **GPT-6 Pro / Astra**）
> 用途：给**两个并行的 Codex 应用会话**共用。会话 A 审架构/逻辑，会话 B 审前端 UI。
> 各自结论回来后由维护者合并成一份总评 MD（`ASTRA_REVIEW_CONCLUSION.md`）。
> 本任务书只读审查，**不 commit / 不改代码 / 不新增依赖**。

---

## 0. 项目与审查对象背景

- **FinQuant Hub**：本地部署的中文金融量化研究系统。FastAPI(8000) 单进程托管 React SPA 生产产物，也可 Vite(5173) 开发。22 APIRouter / 135 API / 52 表 SQLite（单 aiosqlite 连接无池、无 ORM、无 WebSocket 全 SSE）、4-Agent 并行研究报告编排（DeepSeek function_calling + 13 本地工具）、腾讯/新浪/东财/雅虎行情链（中文源绕代理、Yahoo 走代理）、邮箱免密登录 + HttpOnly Cookie、Design System v1.0（`--fq-*` CSS 变量）。
- 架构权威：`docs/ARCHITECTURE.md`、`docs/TECH_STACK.md`；治理：`AGENTS.md`、`CLAUDE.md`、`docs/ai/EXEC_PLAN.md`。
- **审查对象**：`archify-output/`（由 archify 技能 v2.17 生成、facts 经真实代码核查的 5 张交互架构图）：
  - `architecture.html`（系统架构全景）、`workflow.html`（研究报告流程）、`sequence.html`（报告请求时序）、`dataflow.html`（行情数据血缘）、`lifecycle.html`（定时研究作业状态机）
  - 结构化快照：`archify-output/specs/*.json`（每图 JSON IR，含组件/连接/边界/cards——**文本审查以它为主**）
  - 图内节点/路径/状态事实来源（README 已列）：`backend/app/main.py`、`routers/*`、`database.py`、`services/research_orch.py`、`research_jobs.py`、`scheduler.py`、`market_data.py` 等。

---

## 1. GPT-6 Astra 档位语义（选档依据）

- 官方 `reasoning.effort`：**low / medium / high / xhigh / max**（API 默认 low；要深度思考必须显式选高档）。
- Codex 应用内若见推理滑杆，对应关系 ≈ Instant=low、Medium=medium、High=high、Extra High=xhigh、Pro/最高=max。
- 本任务建议：**会话 A 选 Extra High（xhigh）**；**会话 B 选 Extra High（xhigh）**，若 B 需对某页做完整重设计示范可升到最高档（max）。成本/耗时随档位显著上升，纯审查 xhigh 为性价比甜点。
- 网络安全达 Critical 阈值：Astra 对"利用漏洞"类请求会拒绝、对敏感操作可能中途停下要你确认；本任务为只读代码/设计审查，不涉及，无需担心。

---

## 2. 会话 A — 架构与逻辑正确性审查

**档位**：Extra High（xhigh）

**读**（按序）：
1. `archify-output/README.md`、`archify-output/specs/*.json`（5 份，图的事实口径）
2. `docs/ARCHITECTURE.md`、`docs/TECH_STACK.md`、`docs/ROUTER_MAP.md`、`docs/DATA_SOURCES.md`
3. 源码对照（核图与代码是否一致、找逻辑错误）：
   - `backend/app/main.py`（router 注册/lifespan/静态托管）
   - `backend/app/services/research_orch.py`（4-Agent 并行 + 主编编排，重点：失败落库、事件顺序）
   - `backend/app/routers/research.py`（SSE 生命周期）
   - `backend/app/services/research_jobs.py` + `scheduler.py`（状态机 idle→queued→running→completed/failed、30s 认领、重启恢复）
   - `backend/app/services/market_data.py`（熔断/回退/代理策略）
   - `backend/app/database.py`（52 表结构、owner 隔离）

**任务**：
1. **图↔码一致性**：逐图核对 specs/图内声称（22 Router/135 API/52 表/4 Agent/SSE 事件序/状态机/熔断）与真实代码是否一致；指出任何"图画了但代码没有 / 代码有但图没画 / 标签与实现不符"。
2. **逻辑正确性**：重点审研究报告主路径与生命周期状态机——失败分支、并发/重启边界、SSE 清理、用户隔离是否在图与码中都成立；指出潜在竞态或状态泄漏。
3. **优化点**：给 3-6 个**有据**的架构/实现优化点（瓶颈、冗余、可维护性、一致性），每条附证据文件:行 与理由，不空谈。

**输出格式**（贴回时用）：

```
## 会话 A 结论
### A1 图码一致性（每条：图声称 vs 代码事实 vs 不一致?）
### A2 逻辑正确性（风险点/竞态/状态泄漏，含证据）
### A3 优化点（≤6 条，每条：问题-证据-建议-预期收益）
### A4 未越界声明（只读、未改文件、未 commit）
```

---

## 3. 会话 B — 前端 UI / 设计审查

**档位**：Extra High（xhigh；如需某页完整重设计示范可升 max）

**读**（按序）：
1. `docs/DESIGN_SYSTEM_V1.md`（`--fq-*` tokens、8 AI-native 组件、明暗主题）、`docs/UI_PRODUCT_SPEC.md`、`docs/ai/FinQuant_Frontend_Component_Inventory.md`
2. `frontend/src/App.tsx`（导航/布局/主题）、`frontend/src/i18n/`（zh/en）、入口样式与 tokens（`frontend/src/**/*.css` 中 `--fq-*` 定义）
3. 抽查页面：`frontend/src/pages/Dashboard.tsx`（今日工作台）、`ResearchWorkspace.tsx`、`StrategyLab.tsx`、`Portfolio.tsx`、`Discover.tsx`、`Knowledge.tsx`、`Settings.tsx`
4. 代表性组件：`frontend/src/components/`（TaskPageHeader、EvidenceRail、MoneyFlowChart、ChipHistoryChart、MonitorCard 等）

**任务**（目标用户 = 中文非技术个人投资者；评审以**中文用户体验**为准绳）：
1. **设计系统一致性**：抽查 token 使用是否统一、明/暗主题是否完整、新旧色值是否仍有残留（历史 known debt：老硬编码色 `#dce5ef`/`#1890ff` 未迁完）。
2. **审美与视觉层次**：给诚实评价——信息密度、层级、留白、图表配色、中文排版；指出最影响观感/信任感的 1-3 处。
3. **可用性与非技术友好**：术语是否过专业、空/错误/加载态是否友好、关键路径（输入代码→看报告）是否顺畅。
4. **若由你重做**：对最想改进的 1-2 处，给出**具体到组件/token 层**的改法（不是泛泛"更现代"），可含简化的结构示意。

**输出格式**（贴回时用）：

```
## 会话 B 结论
### B1 设计系统一致性（token/主题/残留色，含证据文件:行）
### B2 审美与视觉层次（诚实评价 + 最影响观感的 1-3 处）
### B3 可用性与非技术友好（问题-证据-建议）
### B4 若我重做（1-2 处具体改法，组件/token 级）
### B5 未越界声明（只读、未改文件、未 commit）
```

---

## 4. 共同约束（两个会话都必须遵守）

- **只读审查**：不改任何文件、不 commit、不 push、不新增依赖、不删除。
- 图/HTML 可直接开浏览器目检（本机 8000/5173 未必在跑，无需起服务；以 specs/*.json + 源码文本对照为主即可）。
- 诚实纪律：找不到的问题不编造；证据一律给 `文件:行`；不确定的标注"待核"。
- 若审查中**发现真实 bug**：记录（含证据）但不修——后续由维护者决定是否开 BACKLOG。
- 完成后只贴结论文本，按上方格式。

## 5. 后续

两会话结论回来后，维护者：
1. 独立抽核关键断言（尤其 A1/A2 引用的文件:行）；
2. 合并产出 `docs/ai/ASTRA_REVIEW_CONCLUSION.md` 总评（A+B 发现合并、去重、分级、给出建议后续动作）；
3. 视发现决定是否开 BACKLOG 卡交 Codex 修复/优化。
