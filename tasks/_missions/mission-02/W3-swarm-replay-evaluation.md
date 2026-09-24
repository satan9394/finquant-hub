# W3 `swarmApi` 历史回放：只读评估（不实现）

- 状态：待执行
- 优先级：P1（评估）
- 创建日期：2026-09-13
- Mission：finquant-hub Mission 2（NEXT_BACKLOG P1-2）
- 来源：**human-requested**（用户本轮候选④）；`DSH_RECOVERY_REPORT.md` §6-3；`docs/ai/evo/PRODUCT_STATE.md` R439 补二 🟠
- 基线：`cec2c128209e88de9eb5fa0a4ec23faa5d5d2a2d`

> **本卡是只读评估卡。**按 personal-dev-workflow 硬规则「审计/发现无执行权」，**评估只出结论，不写任何生产代码**。评估通过后是否实现，**须用户单独授权**，不得自行接续开工。

## 起因

`frontend/src/services/swarmApi.ts`（全文 59 行）只有两个团队定义拉取（`fetchFourMastersTeam` / `fetchEarningsReviewTeam`）与两个实时 SSE 流（`streamFourMasters` / `streamEarningsReview`），**没有任何历史回放接口**。用户界面离开后无法回看已完成的 swarm 运行。

## 指挥侧已核实的起点（你可直接采信，但**必须自行复核**关键项）

- 后端**确实落库**：`backend/app/routers/swarm.py:56` `_create_report(...)`、`:77` `_append_event(report_id, event, data, user_id)`、`:85` `_complete_report(...)`。
- `GET /api/research/{report_id}`（`backend/app/routers/research.py:469-482`）返回 `report` **加上** `events[]`（含 `event_type` / `agent_role_key` / `payload` / `created_at`）；`_load_report`（`research.py:504-512`）**没有 `report_type` 过滤**。
- 前端已有同款回放范式：`frontend/src/pages/Research.tsx:269` `deriveAgentOutcomes(report.agent_results, report.events)`，但它只遍历 `Research.tsx:32` 的 `AGENT_KEYS`（5 个深度研究角色）。

⇒ **初步判断：数据源与端点可能已经现成，缺口在"角色键映射 + 前端入口"，而不是"数据存不存在"。** 你要证实或推翻这个判断。

## 必须回答的问题（逐条给证据）

1. **swarm 落库的真实形状**：`research_events` 里 swarm 运行的 `event_type` 取值集合是什么？`agent_role_key` 的取值集合是什么？（读 `backend/app/services/swarm_orch.py` 与 `routers/swarm.py` 的实际产出；给出 `文件:行`）
2. **`GET /api/research/{id}` 对 swarm 报告是否真的可用**：`research_reports` 是否有 `report_type` 之类的区分字段？swarm 创建的 report（`four_masters_swarm` / 财报精读）能否被同一端点取回？前端的 `fetchResearchReport`（`frontend/src/services/researchApi.ts:124`）拿到的结构是否够回放用？
3. **角色键映射**：swarm 的角色键 vs `Research.tsx:32` 的 `AGENT_KEYS` vs `frontend/src/features/swarm/state.ts` 的 `SwarmEvent`/`SwarmTeamDefinition` —— 三者能不能对上？要新增映射层还是可以复用？
4. **契约形态**：复用 `GET /api/research/{id}` 就够，还是需要新端点（例如按 ticker 列 swarm 历史）？给出你建议的形态与理由。
5. **成本量级**：实现要碰哪几个文件、大致多少行、有没有需要新表的迁移（若有，直接判"不值得"）。
6. **风险**：与 VS-29 三态契约、VS-20 结构化 `status` 契约的兼容性；历史回放与实时 SSE 的"同源"要求（本项目铁律：同一件事的两条路径必须同源）。
7. **明确建议**：做 / 不做 / 有条件做（条件写清）。**要给一个结论，不要只罗列。**

## 限制条件 / 禁止事项

- **只读**：**不得修改仓库里任何文件**（源码、测试、文档、配置一律不许动）。
- **唯一允许写入的文件**：`workflow/evidence/W3-swarm-replay-evaluation.md`（评估报告）。
- 不 commit；**不得派生子 Agent**。
- 不跑全量 pytest、不跑全量前端 vitest、不跑 build（本卡不需要）。
- 若需要跑命令取证：只允许只读命令（`git show` / `rg` / `Get-Content` / 读文件）。**不要启动服务、不要连数据库**。
- 命令文本不得含永久删除类 API 字面名。

## 验收标准（客观门禁）

- [ ] ① 问题 1–6 逐条有结论 + `文件:行` 级证据
- [ ] ② 问题 7 有**单一明确建议**（做 / 不做 / 有条件做）
- [ ] ③ **对指挥侧"初步判断"明确表态**：证实或推翻"数据源与端点已现成、缺口在映射与入口"
- [ ] ④ 自我边界声明：哪些结论是**读码推理**、哪些是**实测**；未实测的必须标注
- [ ] ⑤ `git status --porcelain` 在你收工时仍为空（证明只读）——**注意**：控制面路径（`RUN_STATE.md`、`workflow/`）已被 `.git/info/exclude` 排除，所以你的报告写入**不会**让 git status 变脏；这条要如实说明，不要伪称自己没有写入

## 依赖
- 无

## 预期证据
- `workflow/evidence/W3-swarm-replay-evaluation.md`（报告本体）
- 回报摘要：结论 + 建议 + 边界声明

## 验收结论（Evaluator / 指挥会话回填）
- （待填）
