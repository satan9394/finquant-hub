# 审查任务书 A — GPT-6 Astra 架构与逻辑正确性审查（FinQuant Hub）

> 执行模型：OpenAI GPT-6 Astra（Codex 应用内选 **GPT-6 Pro / Astra**，推理档位 **Medium**）
> 本文件**只供会话 A（架构审查）使用**；会话 B（UI 审查）用 `ASTRA_REVIEW_TASK_B.md`。
> 只读审查：**不 commit / 不改任何文件 / 不新增依赖 / 不删除**。完成后只贴结论文本。

---

## 0. 项目背景（速览）

- **FinQuant Hub**：本地部署的中文金融量化研究系统。FastAPI(8000) 单进程托管 React SPA 生产产物，亦可 Vite(5173) 开发。22 APIRouter / 135 API / 52 表 SQLite（单 aiosqlite 连接无池、无 ORM、无 WebSocket 全 SSE）、4-Agent 并行研究报告编排（DeepSeek function_calling + 13 本地工具）、腾讯/新浪/东财/雅虎行情链（中文源绕代理、Yahoo 走代理）、邮箱免密登录 + HttpOnly Cookie、用户按 user_id 完全隔离。
- 架构权威：`docs/ARCHITECTURE.md`、`docs/TECH_STACK.md`、`docs/ROUTER_MAP.md`、`docs/DATA_SOURCES.md`；治理：`AGENTS.md`、`CLAUDE.md`。
- **审查对象**：`archify-output/` 架构可视化（archify 技能 v2.17 生成、facts 经真实代码核查）——`architecture.html`、`workflow.html`、`sequence.html`、`dataflow.html`、`lifecycle.html` 及其结构化快照 `archify-output/specs/*.json`（每图 JSON IR，含组件/连接/边界/cards，文本审查以 specs 为主，图可浏览器目检）。

---

## 1. 档位语义

- `reasoning.effort` 官方五档：low / medium / high / xhigh / max（API 默认 low；深度思考须显式选高档）。本任务选 **medium**——在 Plus 配额约束下平衡深度与消耗（xhigh/max 实测几分钟即耗尽日额度）。
- Astra 对"利用漏洞"类请求会拒绝、敏感操作可能中途停下要你确认；本任务为只读代码/设计审查，不涉及。

---

## 2. 读（按序）

1. `archify-output/README.md`、`archify-output/specs/*.json`（5 份：architecture/dataflow/lifecycle/sequence/workflow，图的事实口径）
2. `docs/ARCHITECTURE.md`、`docs/TECH_STACK.md`、`docs/ROUTER_MAP.md`、`docs/DATA_SOURCES.md`
3. 源码对照（核图与代码是否一致、找逻辑错误）：
   - `backend/app/main.py`（router 注册 / lifespan / 单进程静态托管）
   - `backend/app/services/research_orch.py`（4-Agent 并行 + 主编编排，重点：失败落库、事件顺序）
   - `backend/app/routers/research.py`（SSE 生命周期、report_started/agent_*/completed 事件序）
   - `backend/app/services/research_jobs.py` + `backend/app/services/scheduler.py`（状态机 idle→queued→running→completed/failed、30s 认领、作业级失败重启用、disabled 语义、重启恢复）
   - `backend/app/services/market_data.py`（行情源熔断/回退/代理策略差异）
   - `backend/app/database.py`（52 表、owner 隔离、CHECK 约束）

---

## 3. 任务

1. **图↔码一致性**：逐图核对 specs/图内声称（22 Router / 135 API / 52 表 / 4 Agent 并行 + 主编 / SSE 事件序 / 状态机 / 熔断回退 / 认证隔离）与真实代码是否一致；指出任何"图画了但代码没有 / 代码有但图没画 / 标签与实现不符"。
2. **逻辑正确性**：重点审研究报告主路径与生命周期状态机——失败分支、并发/重启边界、SSE try/finally 清理、用户数据隔离在图与码中是否都成立；指出潜在竞态或状态泄漏。
3. **优化点**：给 3-6 个**有据**的架构/实现优化点（瓶颈、冗余、可维护性、一致性），每条附证据 `文件:行` 与理由，不空谈。

---

## 4. 输出格式（完成后贴回）

```
## 会话 A 结论
### A1 图码一致性（每条：图声称 vs 代码事实 vs 不一致?）
### A2 逻辑正确性（风险点/竞态/状态泄漏，含证据文件:行）
### A3 优化点（≤6 条，每条：问题-证据-建议-预期收益）
### A4 诚实声明（只读、未改文件、未 commit；无把握处标注"待核"）
```

## 5. 纪律

- 只读：不改文件、不 commit、不新增依赖、不删除；无需起服务（以 specs/*.json + 源码文本对照为主）。
- 诚实：找不到的问题不编造；证据一律 `文件:行`；不确定标注"待核"。
- 发现**真实 bug**：记录（含证据）但不修，由维护者决定是否开 BACKLOG。
