# DEV RUN STATE

## Mission
在不重跑任何已完成工作的前提下，把 finquant-hub `main@f74a26e` 固化为「可用一条命令验证的干净基线」——裁决两份未跟踪恢复文档的落位、在最终提交上复跑项目自带门禁并落盘证据、把散落在多份文档里的 NEXT/NIT 收敛为一份带状态的单一待办清单。

## Definition of Done
- [x] D1 `git status --porcelain` 输出为空 → 达成（最终 HEAD `cec2c12`，工作区零行）
- [x] D2 后端门禁：`ruff check --no-cache .` 含 `All checks passed!`；聚焦 pytest `0 failed` → 达成（**双口径**：官方口径 exit 1 仅因覆盖率门 `fail_under=80`，去覆盖率口径 `164 passed` exit 0；指挥侧复跑 227 passed exit 0）
- [x] D3 前端门禁：聚焦 vitest 15 文件/83 用例 exit 0；`bun run build` exit 0 → 达成（**前端全量 vitest 151 文件未跑**，已在两份产物中如实声明）
- [x] D4 存在 `docs/ai/evo/BASELINE_VERIFICATION.md`（601 行）：40 位显式提交号 + 命令原文 + 原始输出 + "未跑"清单 → 达成
- [x] D5 存在 `docs/ai/evo/NEXT_BACKLOG.md`（198 行 / 16 条）：三要素齐全、§5「勿重开」grep 自证不含已 ACCEPT 项 → 达成

## Out of scope（本轮严格不做）
- 不重开全面审计循环、不自动开卡续轮、不挂 goal
- 不改架构不变量；不加依赖；不做 schema 迁移
- 不动 `reference/`；**不删除任何文件**（删除一律进回收站）
- 不 push / 不建 Release / 不导出公开快照（本项目无 remote）
- 不跑全量 pytest / E2E / Docker `up`
- 不改写 `docs/ai/evo/*` 既有评估文件与 `task/CHANGELOG.md` 历史条目
- 不处理 NOT_NOW 清单；不整批修 ~40 处族外项；不在真实工作树做变异
- **不新建 `tasks/`**（本项目用 `task/` + `docs/ai/tasks/`，避免第二套看板）
- W4/W5/W6（saved/recent 同族、MonitorToday 缺 onRetry、audit.py F841）**拨 Mission 2**（用户裁决：首轮只做确认+固化）

## Mode
development

## Active Workset
- [x] W1 — 来源: **human-requested** — 两份恢复文档裁决落位（提交 `264648d`；原件三方哈希一致）（已合入）
- [x] W2 — 来源: planned — 基线门禁复跑与落盘（四条门禁通过；覆盖率门双口径记录；指挥侧复跑 ruff + 去覆盖率 pytest 227 passed）（已合入）
- [x] W3 — 来源: planned — NEXT/NIT 收敛为 `docs/ai/evo/NEXT_BACKLOG.md`（16 条三要素齐全；纠正侦察两处失真）（已合入）
- [x] W4 — 来源: **blocker** — 收尾：按路径限定提交两份新档 + DoD 五条核对（提交 `c63bdbe`）（已合入）
- [x] W5 — 来源: **blocker** — 修正两份基线产物的口径矛盾（提交 `cec2c12`）（已合入）

## Blocked
- （空）

## Deferred Backlog（是记忆，不是队列）
- （audit）W4 `frontend/src/components/GlobalTaskEntry.tsx:87` saved/recent 同族收口（Reviewer 已声明「本族收口」不严格成立）
- （audit）W5 `frontend/tests/MonitorToday.test.tsx:30` 渲染 `ResearchRuns` 未传必填 `onRetry`（潜伏类型缺口，`tsconfig.include` 只有 `["src","vite-env.d.ts"]` ⇒ 非构建红）
- （audit）W6 `scripts/audit.py:423` F841（唯一真实 lint 红，但不在 backend 门禁作用域内）
- （audit）`swarmApi.ts` 无历史回放（新需求，须先做只读评估）
- （audit）文档漂移：`README.md` 写 22 个 APIRouter，实测 23（只登记不修改）
- （audit）`docs/ai/EXEC_PLAN.md` 中 BACKLOG-046/047/048 的「未 commit」声明与 git 事实不符（对应提交早已是 main 祖先）
- （audit）`HANDOFF.md` 严重过期（目标仍写 Local OSS v1、DoD 三项已完成却未勾选）
- （audit）5 个 `codex/*` 分支与 main 的关系未盘点

## Budget
- Epoch: 0 / 2
- 完成卡数: 2 / 3
- 已用 Repair: 0 / 1
- 已派子代理: 1 / 8
- WorkSet 规模: 1 / 8
- Worker 数: 0 / 3
- Research pass: 0 / 1
- 子代理嵌套: 0 / 1

## Mission Budget
- Run: 1 / 3
- 总卡数: 5 / 6
- 总 Repair: 0 / 2

## 项目专属预算（CLI 计不到的，写在这里当约束）
- 墙钟：文档卡 ≤20min、代码卡 ≤45min；Mission 总墙钟 ≤120min
- 每条门禁最多重跑 2 次（第 3 次就是「用重跑换绿」）
- 同一时刻只有 1 个跑 build / tsc / 全量 glob
- 变异（若做）：每卡 1–2 个，且必须在 `%TEMP%` 副本里，**不在真实工作树**
- 测试范围：只跑被改文件 + 直接相关文件；前端 ≤15 个测试文件；**禁全量 pytest**
- 证据：必含命令原文 + 原始输出 + 显式 40 位提交号；单卡证据 ≤400 行

## Last verified commit
`f74a26e`（finquant-hub main；本轮开工前基线，`git status --porcelain` 仅两个未跟踪文档）

## Resume From
（无 —— **Mission 1 完成**：D1–D5 全达成，finquant-hub 基线固化于 `cec2c12`）

## Mission 完成小结（2026-09-13）
- 五个提交：`264648d`（恢复文档归档 + SUPERSEDED）→ `c63bdbe`（基线证据 + 单一待办清单）→ `cec2c12`（口径矛盾修正）；起点 `f74a26e`。
- 关键事实：**VS-38/VS-39 早已 ACCEPT**，故本轮不重做任何已完成工作，只做"确认 + 固化"。
- 本轮**发现并修掉**一处真实缺陷类问题：两份基线产物口径互相矛盾（W3 沿用侦察旧口径 vs W2 实测），由指挥侧在关 Mission 前的核对中抓到（非事后发现）。
- 未跑且如实声明：前端全量 vitest（151 文件）、后端全量 pytest（本机会挂起）、E2E、Docker、`mypy`、OpenAPI 导出。
- 下一轮候选（Mission 2，见 Deferred Backlog）：W4/W5/W6 三个小修（saved/recent 同族、MonitorToday 缺 onRetry、audit.py F841）+ `swarmApi` 历史回放只读评估。

## Notes for the next run
- 用户裁决：① 两份恢复文档**归档提交 + 加 SUPERSEDED 说明**；③ 首轮只做确认+固化（W1–W3），W4–W6 拨 Mission 2。
- 控制文件住在本工作区（`0904\finquant-mission-01\`），**项目侧只落交付物**（两份 docs/ai/evo 新档 + 那两个文档的提交），不碰他们的 `task/` 与 `docs/ai/tasks/`。
- 关键事实（侦察已核）：VS-38/VS-39 已 ACCEPT 归档于 `f74a26e`；基线无已修改的已跟踪文件；`task/` 单数存在、`tasks/` 不存在。
- 最该防的坑：R1 提交时点早于结果文件；R2 证据锚点漂移（一律写 40 位提交号）；R3 变异窗口污染工作树（`git add` 必须限定路径）；R4 全量 pytest 在本机挂起且杀 pwsh 不杀子 python；R7「绿灯不能反推修法正确」（RTL act 吃掉中间帧，判据要写结构性理由）；R11 文档「未提交」声明不可信，一律以 git 为准；元教训：子串替换只换半句犯过两次 ⇒ 文档合并必须整句替换 + 读回 + grep 复核旧句不残留。
