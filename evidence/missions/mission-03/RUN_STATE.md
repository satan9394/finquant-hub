# DEV RUN STATE

> **Mission 3**（用户 2026-09-13「授权。允许执行。」）。Mission 2 已归档于 `workflow/mission-02/`（其 RUN_STATE、卡片、证据整体移入）。
> 控制面仍在项目根（`RUN_STATE.md` + `workflow/`），已由 `.git/info/exclude` 本地排除 ⇒ `git status --porcelain` 保持为空。
> **Budget / Mission Budget 的计数行格式不得手改**（controller 对格式敏感；`current == limit` 即判 exhausted 并 `allow:false`）。

## Mission
把 `swarmApi` 历史回放从"已评估"推进为**可用能力**：让用户能回看某标的历次 swarm 团队运行（四大师 / 财报精读），
且回放与实时**同源**（折叠同一个 `applySwarmEvent` 归约器），**不做 schema 迁移**。

来源：`docs/ai/evo/SWARM_REPLAY_EVALUATION.md`（Mission 2 只读评估，结论「有条件做」）+ 用户授权。

## Definition of Done
- [x] D1 回放数据层为**纯函数** …… —— **达成**（`4e031979`；`replay.ts` 全文无 `switch`、唯一映射点 `:121`、折叠 `:161`；名册取自 `team_started`；失败分支类型**无 `state` 字段**；指挥侧鉴别力 7 red / 6 red，无 timeout）
- [x] D2 后端**只读**端点：列出当前用户某 ticker 下的 swarm 运行（**不改表、不加列**） —— **达成**（`011e4e9f`；`git status` 不含 `database.py`；SQL 三重 `user_id` 隔离 + `event_type='team_started'`；指挥侧复跑 pytest `5 passed` exit 0、ruff `All checks passed`）
- [x] D3 前端接线；读取失败走族内三态契约，**不得把"读不出来"渲染成"没有历史"**；回放态与实时态**共用同一套渲染** —— **达成**（`e2450115`；`SwarmRunView` 只认 `SwarmRunState`、两处使用点 `:310`/`:377`；`replaySwarmRun(` 实际调用只有 `SwarmStatusCard.tsx:232` 一处；指挥侧复跑 3 文件 / 26 用例 exit 0 + build exit 0）
- [x] D4 文档同步：新增端点须写入 `docs/API_CONTRACT.md` —— **达成**（随 `011e4e9f`；§15 端点行 + 语义段 + 汇总表 132→133 + 实测 141/177→142/178）
- [x] D5 逐卡独立验证（客观门禁 + 鉴别力证明）→ 逐卡路径限定提交 → `git status --porcelain` 为空 —— **达成**（四笔提交 `4e031979`/`011e4e9f`/`e2450115`/`47b13547`，收尾后 0 行）

## Out of scope
- 不做 schema 迁移、不加表/列、不引入 ORM 或连接池（架构不变量）
- 不重跑 VS-3…VS-39 与 Mission 1/2 的任何已 ACCEPT 工作
- 不改 `.gitignore` / `tsconfig*` / ruff 配置 / `package.json` / `start.bat` / `.gitattributes`
- 不做 NEXT_BACKLOG 的 NIT-1…NIT-6、D-1…D-3、P2-2/P2-3/P2-4
- 不给 swarm 加"取消/重跑历史"等超范围能力；不做跨 ticker 的全局历史页
- 不跑全量 pytest（本机挂起）/ 全量前端 vitest（151 文件）/ E2E / Docker / `mypy`
- 不 push（无 remote）；删除一律进回收站；不挂 goal；不启动 workflow

## Mode
development

## Active Workset
- [x] W1 — 来源: **planned** — 前端回放数据层 + 单元测试（含角色键碰撞反向断言） —— **已接受，提交 `4e031979`**（执行器 `a66b03b3`）
- [x] W2 — 来源: **planned** — 后端只读端点 + pytest + `docs/API_CONTRACT.md` 同步 —— **已接受，提交 `011e4e9f`**（执行器 `a5cc341e`；含一起已核实的临时文件误收事故，见「过程事故与教训」）
- [x] W3 — 来源: **planned** — 前端接线：历史入口 + 点选回放 + 三态 —— **已接受，提交 `e2450115`**（执行器 `033b04e1`）
- [x] W4 — 来源: **planned** — 收尾：文档核对 + 逐卡路径限定提交 + 工作区核对 —— **已完成，提交 `47b13547`**

## Blocked
- （空）

## Deferred Backlog（是记忆，不是队列）
- （audit）**类型欠账（W1 实测发现，非本卡引入）**：`frontend/src/types/research.ts:204-207` 的 `ResearchReportDetail` **不带 `events`**，而后端 `GET /api/research/{id}`（`routers/research.py:469-482`）**确实**返回 `events`（行字段 `id / event_type / agent_role_key / payload / created_at`，`payload` 已 `json.loads`）⇒ **运行时可见、类型层不可见**，页面只能各立局部类型（`Research.tsx:59-77` 与 `replay.ts:38-45`）。修它要动 `types/research.ts`，建议单独开卡。
- （audit）**取消态无法回放（W1 设计固有）**：`cancelSwarmRun`（`state.ts:199`）是**客户端状态迁移**、不产生事件 ⇒ 被取消的运行回放出来仍是 `running`。回放只忠实于落库事件，不臆造。
- （audit）`recent`（`features/globalTaskEntry.ts:69-71`）与"确实没有最近记录"同形 —— Mission 2 裁决 A 未修
- （audit）NIT-1 失败时瞬时 toast 与新内联失败态并存（`Discover.tsx:130`、`GlobalTaskEntry`）
- （audit）NIT-2 因子重试连带重跑整个 `run()`（多 2 个请求，无用例覆盖）
- （audit）NIT-3 重试的"操作数"在 UI 上不可区分（判据空隙，非缺陷）
- （audit）NIT-4 VS-34 残留：非 `Error` rejection 时 toast 无文案；Chat 角色失败态两份（后者有意冗余）
- （audit）NIT-5 VS-37 复验 NIT③：第三方豁免对强框架词一并生效（本仓 0 命中）
- （audit）NIT-6 技术债 / 风险滚动清单
- （audit）D-1 `README.md` 路由计数漂移（写 22，实测 23）
- （audit）D-2 `docs/ai/EXEC_PLAN.md` 的「未 commit」声明与 git 事实不符
- （audit）D-3 `HANDOFF.md` 相对 HEAD 过期
- （audit）P2-2 约 40 处族外「发起时清失败态」（数量未复核）
- （audit）P2-4 `start.bat` 在 `.venv` 存在时跳过依赖安装
- （audit）P2-3 A5-P2-5 高频 AI 入口不在主导航（**已否决**，维持）
- （audit）**Mission 2 的流程债**：W1/W2 的验收是「指挥验证」而非 fresh-context 独立评审（两个验收/评估子代理执行失败）——若需更高保证，应另派干净上下文的评审者复核 `a4882add` 与 `0d564286`

## Budget
- Epoch: 0 / 1
- 完成卡数: 4 / 5
- 已用 Repair: 0 / 1
- 已派子代理: 3 / 8
- WorkSet 规模: 4 / 6
- Worker 数: 0 / 2
- Research pass: 0 / 1
- 子代理嵌套: 0 / 1

## Mission Budget
- Run: 0 / 2
- 总卡数: 4 / 6
- 总 Repair: 0 / 2

## 项目专属预算（CLI 计不到的，写在这里当约束）
- 墙钟：代码卡 ≤45min、文档卡 ≤20min；Mission 总墙钟 ≤150min
- 每条门禁最多重跑 2 次（第 3 次就是「用重跑换绿」）
- 同一时刻只有 1 个跑 build / tsc / 全量 glob
- 变异（若做）：每卡 1–2 个，且必须在 `%TEMP%` 副本里，**不在真实工作树**
- 测试范围：只跑被改文件 + 直接相关文件；前端 ≤15 个测试文件；**禁全量 pytest**
- 证据：必含命令原文 + 原始输出 + 显式 40 位提交号；单卡证据 ≤400 行
- 提交：`git add` 一律**路径限定**；禁止 `git add -A` / `git add .`；**一卡一提交**
- 命令文本与提交信息**不得含永久删除类 API 字面名**（本机 pre-execute 门禁为子串匹配，会被拦）

## Last verified commit
`47b1354748bf60bdbc7286425c324860a6d230e6`（finquant-hub main；Mission 3 四笔提交 `4e031979` → `011e4e9f` → `e2450115` → `47b13547`；`git status --porcelain` 为空）

## Resume From
（无 —— **Mission 3 完成**：W1/W2/W3/W4 全部结清，DoD D1–D5 全达成）

## Mission 完成小结（2026-09-13）
- 四笔提交：`4e031979`（W1 回放数据层）→ `011e4e9f`（W2 只读端点）→ `e2450115`（W3 接线）→ `47b13547`（文档回填）；起点 `904829a0`；收尾后 `git status --porcelain` 为空。
- **交付**：用户现在能在 `SwarmStatusCard` 里看到某标的历次 swarm 团队运行（四大师 / 财报精读）并点选回放；回放与实时**共用同一段渲染**（`SwarmRunView` 只认 `SwarmRunState`）；**未做任何 schema 迁移**。
- **本 Mission 的关键判据**：不是"用例全绿"，而是三条结构性事实——① 落库行到事件帧只有**一个**映射点且折叠**同一个** `applySwarmEvent`；② 名册来自 `team_started` 的 payload 而非 `AGENT_KEYS`（角色键存在真实碰撞）；③ 失败分支类型里**没有 `state` 字段**，且"读不出来"与"确实没有"在数据层就分开。
- **流程偏差（如实记录）**：W1/W2/W3 的验收均为**指挥侧验证**，**不是 fresh-context 独立评审**（Mission 2 的两个验收/评估子代理曾执行失败，本 Mission 仍由指挥侧兜底）。满足"做的人不评自己"（执行器与验收者不是同一子代理），但**不满足干净上下文独立评审**。
- **本 Mission 发生的自身错误（已纠正）**：把 `Worker 数` 写成 `2 / 2` 想让闸门"看到并发"，被 controller 判 exhausted ⇒ `allow:false`（Mission 2 已记，本 Mission 未再犯）。
- 未跑且如实声明：全量前端 vitest（151 文件）、全量 pytest（本机挂起）、E2E、Docker、`mypy`；真实浏览器 + 真实后端的端到端回放**未实测**。

## 过程事故与教训（Mission 3）
- **事故**：Mission 3 / W2 执行器收尾时用 `Get-ChildItem $env:TEMP -Filter 'w2-*.txt'` **按前缀通配**批量回收临时文件，
  误收 4 个不属于本卡的文件（`w2-tsc-before/after.txt`、`w2-audit-before/after.txt`），随后从回收站按原内容还原。
- **指挥侧核实**：4 个文件**字节数与自述完全一致**（10101 / 9796 / 3486 / 3486），内容确为前端 tsc 报错输出与 harness 审计报告；
  按时间戳（06:09–06:14）判断归属 **Mission 2 的 W2 卡**——该卡**已完成并入库于 `0d564286`**，证据在其卡文件内 ⇒ **无实质损失**。
- **教训（与 `AGENTS.md`「清理进程必须按精确匹配自己的命令行，绝不用排除法」同类，这次发生在文件上）**：
  临时文件要么**带自己的卡号命名**（如 `m3w2-*`），要么清理时**逐条列出完整文件名**再回收；
  **禁止**用 `-Filter 'w2-*'` 这类前缀通配对 `$env:TEMP` 做批量删除 —— `$env:TEMP` 是**多会话共享资源**。
- **对受影响方的处置（照铁律只给事实）**：受影响卡已结束、无法通报；此处只记事实，**不代为定性**。
  若后续发现异常，**以该卡自身重跑结果为准，不得因此放宽任何断言或判据**。

## Notes for the next run
- **本 Mission 的立项依据**：`docs/ai/evo/SWARM_REPLAY_EVALUATION.md`。已核实的关键事实（不要再重复侦察）：
  - 后端落库：`routers/swarm.py:56` `_create_report` / `:77` `_append_event` / `:85` `_complete_report`
  - 读回：`GET /api/research/{id}`（`routers/research.py:469-482`）已返回 `agent_results` + 完整 `events[]`；`_load_report`（`:504-512`）无类型过滤
  - **`research_reports` 没有任何团队/类型字段** ⇒ 归属必须靠事件判定
  - **归属信号现成**：`services/swarm_orch.py:213` 的首个事件 `team_started`，payload 含 `team: public_team_definition(team)`（`{key,name,description,agents:[{key,name,avatar,dependencies,tools}]}`），且已由 `:77` 落库
  - **角色键碰撞（实测）**：`four-masters ∩ AGENT_KEYS = {report_lead}`；`earnings-review ∩ AGENT_KEYS = {business_analyst, financial_analyst}`；两团队之间无交集
  - 归约器：`frontend/src/features/swarm/state.ts:112` `applySwarmEvent(state, {event,data})` 是纯函数；`createSwarmRunState(team)`（`:66`）按名册建初态；`report_started`（`:116`）写入 `reportId`
- **同源要求**：回放必须折叠**同一个** `applySwarmEvent`，不得另写一套事件语义（本项目铁律：同一件事的两条路径必须同源）。
- **架构不变量**：无 ORM、无连接池、无独立 DAL、无 WebSocket、无 SSR、无 DI 容器；router 直接调 `database.query_one/query_all/execute`。
- **最该防的坑**：R2 证据锚点漂移（写 40 位提交号，不用 `HEAD~1`）；R3 变异窗口污染工作树（`git add` 限定路径）；R4 全量 pytest 挂起且杀 pwsh 不杀子 python；R7「绿灯不能反推修法正确」；R11 文档「已完成」声明一律以 git 为准。
- **闸门语义坑（Mission 2 实测）**：`Worker 数` / `子代理嵌套` 必须**低于**上限；`current == limit` 会被判 exhausted 并拒绝派发。并发上限靠纪律，不靠这两行表达。
