# W3 只读评估：`swarmApi` 历史回放

> Mission 2 · 卡 `workflow/tasks/W3-swarm-replay-evaluation.md`
> 基线 `cec2c128209e88de9eb5fa0a4ec23faa5d5d2a2d`
> **执行者：指挥侧（conductor）**。原派出的评估子代理 `d8dcedfb` 执行失败、未产出；按
> `memory/SUBAGENT_TIMEOUT_DISCIPLINE.md` 第 25 条「子代理交付但门禁未跑全：指挥在有权环境补跑」代为完成。
> **这不是独立评估**——本报告的独立性弱于一次 fresh-context 评审，此边界见 §7。

## 0. 结论（先给答案）

**有条件做：值得做，且不需要 schema 迁移；但"用户如何发现一份历史 swarm 运行"这一层是空缺，也是主要成本。**

- **证实**了指挥侧的初步判断：**数据源与端点已经现成**，缺口不在"数据存不存在"。
- **推翻**了"缺口只在角色键映射"——真正的坑是**三个团队的角色键存在名字碰撞**，因此**不能复用** `AGENT_KEYS`；不过归属信号已存在于事件里（§3），所以**不必加列、不必迁移**。

## 1. swarm 落库的真实形状（问题 1）

- 落库链路：`backend/app/routers/swarm.py` → `:56` `_create_report(...)`（建 `research_reports` 行）、`:77` `_append_event(report_id, event, data, user_id)`（**每个 SSE 事件都落一行**）、`:85` `_complete_report(...)`（写 `report_data` + `agent_results`）。`:115-123` 在流中断且仍为 `running` 时补记 failed。
- `research_events` 列（`backend/app/database.py`）：`id / research_id / event_type / agent_role_key / payload / created_at`；`agent_role_key` 由 `routers/research.py` 的 `_append_event` 写入，取值 `data.get("role_key") or data.get("agent")`。
- **`event_type` 取值集合**（`services/swarm_orch.py`）：`team_started`(`:213`)、`agent_started`(`:224`，带 `role_key`)、`agent_failed`(`:300`)、`agent_skipped`(`:310`)、`error`(`:202`/`:209`)、`done`(`:364`)，以及 `:296`/`:388`/`:401` 透传的 DAG 内部事件。
- `research_reports` 列：`id / ticker / company_name / report_data / agent_results / model_id / status / created_at / updated_at`
  ⇒ **没有任何"报告类型/团队"字段**（`report_type`、`kind`、`team_key` 均不存在）。

## 2. `GET /api/research/{id}` 对 swarm 报告是否可用（问题 2）

- `backend/app/routers/research.py:469-482` `get_report()`：调 `_load_report`，再查 `research_events` 全量事件并 `json.loads(payload)` 后挂到 `report["events"]`。
- `:504-512` `_load_report()`：`SELECT * FROM research_reports WHERE id=? AND user_id=?`，**无任何类型过滤**，并把 `report_data` / `agent_results` 从 JSON 串解析回对象。
- ⇒ **同一个端点对 swarm 报告与深度研究报告一视同仁，且已经返回回放所需的一切**（结构化 `agent_results` + 有序完整事件流）。
- 前端侧：`frontend/src/services/researchApi.ts:124` `fetchResearchReport(id)` 已是这个端点的封装。

## 3. 角色键与归属信号（问题 3）——本评估的核心

各团队角色键（`backend/app/orchestrator/teams/*.yaml` 的 `agents[].key`）：

| 团队 | key | 角色键 |
|---|---|---|
| 四大师 | `four-masters` | `value_investor` / `tech_analyst` / `macro_strategist` / `risk_manager` / `report_lead` |
| 财报精读 | `earnings-review` | `business_analyst` / `financial_analyst` / `competition_analyst` / `risk_analyst` / `earnings_editor` / `reader_reviewer` |
| 深度研究（前端） | — | `frontend/src/pages/Research.tsx:32` `AGENT_KEYS = ['business_analyst','financial_analyst','industry_researcher','risk_assessor','report_lead']` |

**碰撞（实测交集）**：

- `four-masters ∩ AGENT_KEYS` = **`report_lead`**
- `earnings-review ∩ AGENT_KEYS` = **`business_analyst`、`financial_analyst`**
- `four-masters ∩ earnings-review` = ∅

⇒ **`deriveAgentOutcomes(agentResults, events)`（`Research.tsx:269`）不能直接复用**：它按 `AGENT_KEYS` 遍历，会把财报精读的 `business_analyst` 当成深度研究的同名角色渲染，且深度研究侧还会因为找不到 `industry_researcher` / `risk_assessor` 而显示空位。**必须由回放层自带"本次运行属于哪个团队 + 该团队的名册"。**

**归属信号已存在于数据中（关键）**：`services/swarm_orch.py:212-218` 每个 swarm 运行的首个事件是
`yield "team_started", {"team": public_team_definition(team), "ticker": …, "company_name": …, "model": …}`，
其中 `public_team_definition()` 返回 `{key, name, description, agents:[{key,name,avatar,dependencies,tools}]}`。
该事件经 `:77` 落进 `research_events`。
⇒ 读回 `events[]` 后取 `event_type === 'team_started'` 即可拿到 **`team.key` + 权威名册**，**无需新增列、无需迁移**。

## 4. 契约形态建议（问题 4）

**复用现有端点即可，不需要为"读取一份运行"新增后端接口。** 建议形态：

1. 回放入口 = `fetchResearchReport(id)`（已存在），从 `events[]` 里取 `team_started` 定团队，再取 `GET /swarm/teams/{four-masters|earnings-review}`（已存在，`swarmApi.ts:7/:12`）取展示元数据（头像/名称等）。
2. 用**该团队的名册**（而非 `AGENT_KEYS`）驱动状态归约；事件按 `research_events.id` 升序**按序重放**。
3. **同源性**（本项目铁律「同一件事的两条路径必须同源」）：实时路径消费 SSE 事件流、回放路径消费同一批被 `_append_event` 同源落库的事件 ⇒ **两条路径的数据源是同一个**，满足该不变量；不要再造第二套事件语义。

**仍缺的一层是"发现"**：`GET /api/research`（`:426`）与 `/history`（`:439`）都拿不到类型字段，前端**无法从列表里分辨哪些是 swarm 运行**。可选：
(a) 用 `report_data` 的键形状在列表侧嗅探（脆，不推荐）；
(b) 新增一个只读的"我的 swarm 运行"列表端点（**不改表**，按 `research_events` 里存在 `team_started` 过滤）——推荐；
(c) MVP 先不做历史列表，仅在**刚跑完的那次**提供"回看"（`SwarmRunState.reportId` 已经在手，`state.ts` 里就有这个字段）。

## 5. 成本量级（问题 5）

- **不需要 schema 迁移**（归属信号在事件里）。
- 前端：新增回放容器/状态归约（把 `deriveAgentOutcomes` 泛化成"接受名册参数"）+ 入口接线，估 **中量级（约 150–300 行 + 测试）**；`features/swarm/state.ts` 的 `SwarmEvent` 形状（`{event, data}`）与落库 payload 一致，可复用。
- 后端（若选 §4(b)）：**约 20–40 行**只读查询，无迁移。
- 测试：需覆盖"按 `team_started` 定团队""名册碰撞下不串（`report_lead` / `business_analyst`）""实时与回放同源"。

## 6. 兼容性与风险（问题 6）

- 与 **VS-29 三态契约**：回放读取失败必须走 `LoadFailureAlert`/`LoadStateView`，不得把"读不出来"渲染成"没有历史"。
- 与 **VS-20/VS-35 结构化 `status`**：swarm 逐 Agent 条目已纳入该契约（VS-35，`92b1b35`），回放归约必须沿用同一读法（含 `degraded` + `degraded_reasons`），不得退回文案匹配。
- 主要风险是**语义碰撞被无声掩盖**（§3 的键名重叠）：若实现时偷懒复用 `AGENT_KEYS`，屏幕上会出现"名字对但含义错"的卡片，且**现有测试不易发现**。这是本卡要提前钉死的判据。

## 7. 建议（问题 7）与边界声明

**建议：做，走 §4(c) → §4(b) 的增量路径。** 先做"刚跑完那次的回看"（数据与端点全现成、`reportId` 已在手、零后端改动），验证后再补"历史列表"端点。

**边界声明（哪些是实测、哪些是读码推理）**：
- **实测（命令/文件级别）**：上述所有 `文件:行` 的行号与内容、三个团队的角色键集合与交集、`database.py` 的建表语句、`research_reports` 无类型字段、`swarmApi.ts` 无回放入口。
- **读码推理（未实测）**：`team_started.payload.team` 的实际 JSON 形状依赖 `public_team_definition()` 的返回结构（我读了该函数的开头，**未逐字段读完**）；"按序重放 `events[]` 能无损还原实时观感"**未做端到端实测**（需真库 + 真运行）；§5 的行数是**量级估计**，不是实测。
- **未做**：未启动服务、未连数据库、未跑任何测试、未写任何生产代码（本卡为只读评估，按 personal-dev-workflow「审计/发现无执行权」不接续开工）。
