# DEV RUN STATE

> 控制面位置变更（2026-09-13，用户指令）：Mission 1 的控制目录原在
> `E:\DeepSeek_Harness\workspace\2026_09_04\finquant-mission-01\`，本轮**迁入项目根**，
> 以消除跨工作区影响并让 host 级预算闸门（`n3-budget-gate`，按会话 cwd 解析项目根）真正生效。
> 本文件由 `runstate.js init` 生成骨架后填写；**Budget / Mission Budget 的计数行格式不得手改**，
> 否则闸门会 fail-closed 拒绝派发。

## Mission
把 `docs/ai/evo/NEXT_BACKLOG.md` 中经用户裁决进入本轮的四项（P1-1 / P2-1 / P2-5 / P1-2）分别推进到
「已修复并独立验收」或「有结论的只读评估」，全程不重跑任何已 ACCEPT 的工作，收尾时把清单状态回填为事实。

## Definition of Done
- [x] D1（P1-1）`GlobalTaskEntry.tsx` 的 `saved` 读取失败不再与"确实为空"同形 —— **达成**（提交 `a4882add`；失败可归因 + 真重发 + 反向断言 + 不伪装成空；既有断言零放宽；指挥侧鉴别力探针 5/7 变红、无 timeout）
- [x] D2（P2-1）`MonitorToday.test.tsx:30` 补上必填 `onRetry`，全仓自证无同类缺参；零生产代码改动 —— **达成**（提交 `0d564286`）
- [x] D3（P2-5）`scripts/audit.py:423` 的 F841 零行为变更处理；单文件 ruff exit 0；backend 门禁结论不变 —— **达成**（提交 `0d564286`）
- [x] D4（P1-2）产出 `swarmApi` 历史回放的只读评估结论，不实现 —— **达成**（`docs/ai/evo/SWARM_REPLAY_EVALUATION.md`，随 `904829a0` 归档；结论「有条件做」）
- [x] D5 `NEXT_BACKLOG.md` 相关条目状态回填为事实；每笔提交路径限定；提交后 `git status --porcelain` 为空 —— **达成**（提交 `904829a0`；工作区 0 行）

## Out of scope
- 不重跑 VS-3…VS-39 与 Mission 1 的 D1–D5（已 ACCEPT / 已达成）
- **不改项目配置**：`frontend/tsconfig*.json`、ruff 配置、`package.json`、`start.bat`、`.gitattributes`、`.gitignore`
- 不跑全量 pytest（本机挂起）/ E2E / Docker `up` / `mypy`
- 不做 NEXT_BACKLOG 的 D-1/D-2/D-3 文档类与 NIT-1…NIT-6
- 不做 P2-2「约 40 处」整批、不重新计数；不做 P2-3 / P2-4
- **不实现** swarmApi 历史回放（只评估）
- 不做 `recent`（localStorage 读）的三态化——见 Notes 裁决 A
- 不改架构不变量；不加依赖；不做 schema 迁移；不动 `reference/`
- 不新建项目侧第二套看板（`tasks/` 归属 workflow 控制面，见 Notes）
- 不 push（本仓无 remote）；不打 tag；删除一律进回收站
- 不挂 goal、不启动 workflow、不重开审计循环、不自动开新卡续轮

## Mode
development

## Active Workset
- [x] W1 — 来源: **human-requested**（本轮候选①）· NEXT_BACKLOG P1-1 — `GlobalTaskEntry.tsx` 的 `saved` 三态化（含新测试 + 鉴别力证明 + 独立验收） —— **已接受，提交 `a4882add`**（指挥侧复核：交付哈希 `2e3d04f2`/`395ddd4a` 与自述逐字一致；既有测试与基线逐字节相同；`recent` 与检索流 grep 0 命中；门禁 3 文件/16 用例 exit 0 + build exit 0；**指挥侧自做鉴别力探针**：副本退回基线 blob `e96417a7` ⇒ 5 failed | 2 passed、无 timeout。执行器子代理 `9c0cbe14`）
- [x] W2 — 来源: **human-requested**（本轮候选②③）· NEXT_BACKLOG P2-1 + P2-5 — 两处零生产行为变更小修（`MonitorToday.test.tsx:30` 补 `onRetry`；`scripts/audit.py:423` F841），合为一卡因二者均为单行、均零生产行为 —— **已接受，提交 `0d564286`**（指挥侧复核：`git diff --numstat` = `1/1` 与 `0/1`；`hooks_dir` 0 命中；单文件 ruff exit 0；基线 blob 691→690 行、diff 恰一个 hunk；全仓 13 处 `ResearchRuns` 引用无第二处缺参。执行器子代理 `05608f37`）
- [x] W3 — 来源: **human-requested**（本轮候选④）· NEXT_BACKLOG P1-2 — `swarmApi` 历史回放**只读评估**（出结论，不实现） —— **已完成，随 `904829a0` 归档为 `docs/ai/evo/SWARM_REPLAY_EVALUATION.md`**（结论：**有条件做**；证实"数据源与端点已现成"，但揭示三团队角色键存在真实碰撞且 `research_reports` 无类型字段；归属信号已存在于 `team_started` 事件的 payload 中 ⇒ **无需 schema 迁移**。**由指挥侧补做**——原评估子代理 `d8dcedfb` 执行失败）
- [x] W4 — 来源: **planned** — 收尾：`NEXT_BACKLOG.md` 状态回填 + 路径限定提交 + 工作区核对 —— **已完成，提交 `904829a0`**（四条目状态回填；逐卡单独提交 `a4882add`/`0d564286`/`904829a0`；`git status --porcelain` 为空）

## Blocked
- （空）

## Deferred Backlog（是记忆，不是队列）
- （audit）`recent`（`features/globalTaskEntry.ts:69-71` 的 `catch { return [] }`）与"确实没有最近记录"同形 —— 属 P1-1 的另一半，**本轮按裁决 A 不动**（localStorage 同步读、无真重试语义，硬套三态会造出无意义的重试按钮）
- （audit）NIT-1 失败时瞬时 toast 与新内联失败态并存（`Discover.tsx:130`、`GlobalTaskEntry`）
- （audit）NIT-2 因子重试连带重跑整个 `run()`（多 2 个请求，无用例覆盖）
- （audit）NIT-3 重试的"操作数"在 UI 上不可区分（判据空隙，非缺陷）
- （audit）NIT-4 VS-34 残留：非 `Error` rejection 时 toast 无文案；Chat 角色失败态两份（后者为有意冗余）
- （audit）NIT-5 VS-37 复验 NIT③：第三方豁免对强框架词一并生效（本仓 0 命中）
- （audit）NIT-6 技术债 / 风险滚动清单
- （audit）文档类 D-1 `README.md` 路由计数漂移（写 22，实测 23）
- （audit）文档类 D-2 `docs/ai/EXEC_PLAN.md` 的「未 commit」声明与 git 事实不符
- （audit）文档类 D-3 `HANDOFF.md` 相对 HEAD 过期
- （audit）P2-2 约 40 处族外「发起时清失败态」（数量未复核）
- （audit）P2-4 `start.bat` 在 `.venv` 存在时跳过依赖安装（承重脚本，动它需 cmd.exe 实跑）
- （audit）P2-3 A5-P2-5 高频 AI 入口不在主导航（**已否决**，维持）
- （audit）`PRODUCT_GAP_MAP.md:237` 的 O1、`:241` 的 `ResearchFollowupPrompt` 首条用例逼近超时（**未独立核实**，不入队）

## Budget
- Epoch: 0 / 1
- 完成卡数: 4 / 5
- 已用 Repair: 0 / 1
- 已派子代理: 4 / 8
- WorkSet 规模: 4 / 6
- Worker 数: 0 / 2
- Research pass: 0 / 1
- 子代理嵌套: 0 / 1

## Mission Budget
- Run: 0 / 2
- 总卡数: 4 / 6
- 总 Repair: 0 / 2

## 项目专属预算（CLI 计不到的，写在这里当约束）
- 墙钟：代码卡 ≤45min、评估卡 ≤30min、收尾卡 ≤20min；Mission 总墙钟 ≤150min
- 每条门禁最多重跑 2 次（第 3 次就是「用重跑换绿」）
- 同一时刻只有 1 个跑 build / tsc / 全量 glob
- 变异（若做）：每卡 1–2 个，且必须在 `%TEMP%` 副本里，**不在真实工作树**
- 测试范围：只跑被改文件 + 直接相关文件；前端 ≤15 个测试文件；**禁全量 pytest**
- 证据：必含命令原文 + 原始输出 + 显式 40 位提交号；单卡证据 ≤400 行
- 提交：`git add` 一律**路径限定**；禁止 `git add -A` / `git add .`
- 命令文本与提交信息**不得含永久删除类 API 字面名**（本机 pre-execute 门禁为子串匹配，会被拦）

## Last verified commit
`904829a0dc29029f901423e2babdaf44177a8e52`（finquant-hub main；Mission 2 三笔提交 `a4882add` → `0d564286` → `904829a0`；`git status --porcelain` 为空）

## Resume From
（无 —— **Mission 2 完成**：W1/W2/W3/W4 全部结清，DoD D1–D5 全达成）

## Mission 完成小结（2026-09-13）
- 三笔提交：`a4882add`（W1）→ `0d564286`（W2）→ `904829a0`（文档）；起点 `cec2c12`；收尾后 `git status --porcelain` 为空。
- 四项候选全部处置：①②③ 修复入库；④ 出只读评估结论（**未实现**，须用户另行授权）。
- **流程偏差（如实记录，不掩饰）**：计划中的两个子代理都**执行失败、未产出**——
  `9e6dd1ee`（W1/W2 独立验收）与 `d8dcedfb`（W3 评估）。按 `memory/SUBAGENT_TIMEOUT_DISCIPLINE.md` 第 25 条
  「子代理交付但门禁未跑全：指挥在有权环境补跑关键门禁再合入」，**由指挥侧补跑客观门禁与鉴别力探针、并代为完成 W3 评估**。
  ⇒ **本轮 W1 的验收是"指挥验证"而非 fresh-context 独立评审**；W3 评估同理。这意味着它满足"做的人不评自己"
  （执行器与验收者不是同一个子代理），但**不满足"干净上下文独立评审"**。若要更高保证，应在干净会话重做一次独立评审。
- **本轮发现并当场纠正的自身错误**：把 `Worker 数` 写成 `2 / 2` 想让闸门"看到并发"，被 controller 判为
  exhausted ⇒ `allow:false`。已改回并写入 Notes 的语义坑说明。
- 未跑且如实声明：全量前端 vitest（151 文件）、全量 pytest（本机挂起）、E2E、Docker、`mypy`。

## Notes for the next run
- **裁决 A（已生效）**：只修 `saved`（网络读，重试语义成立）；`recent` 归入 Deferred Backlog 并注明理由。
- **裁决 B（已生效）**：W3 只出结论、不实现。评估通过后是否继续实现**需用户单独授权**，否则即构成被明令禁止的 `评估→发现→开卡→改码` 链。
- **裁决 C（已生效）**：控制面已迁入项目根（`RUN_STATE.md` + `workflow/`），闸门实测 `{"allow":true}`，host 级管控**已真正生效**（此前为 unmanaged → fail-open）。
- **⚠️ 闸门语义实测坑（2026-09-13 踩到并当场纠正）**：controller 把每个计数行读作「**已用 / 上限**」，**`current == limit` 即判 exhausted 并 `allow:false`**。
  我一度把 `Worker 数` 写成 `2 / 2`（想表达"当前有两个 worker 在跑"），立刻被 `check` 判失败、`gate` 返回 `allow:false`。
  ⇒ **`Worker 数` 与 `子代理嵌套` 必须保持低于上限**；并发上限（≤2）靠纪律执行，**不要**用这两行表达实时并发。
  并发窗口请写在 Notes 里（如"当前并行：W1 + W2"）。
- **控制面布局**：`RUN_STATE.md`（项目根，闸门读取）+ `workflow/tasks/`、`workflow/evidence/`（本轮）+ `workflow/mission-01/`（Mission 1 归档，已整体迁入）。
  用 `workflow/tasks/` 而非项目根 `tasks/`，是为避免与项目已跟踪的 `task/`（单数，CHANGELOG）混淆成"第二套看板"。
- **干净基线如何保住**：三条控制面路径写在 `.git/info/exclude`（本地仓库元数据，不改任何被跟踪文件），故 `git status --porcelain` 仍为空。
  **代价**：`git status` 看不到它们 —— 读工作区状态时请一并列目录，不要只看 git。
- **闸门纪律**：派发任何 `subagent` 前先跑
  `node E:\DeepSeek_Harness\workspace\2026_09_06\release\dsh-personal-dev-workflow\tools\runstate.js gate E:\Code_file\Projects\finquant-hub`，
  必须得到 `{"allow":true}`（exit 0）；`check` 校验格式、`advance` 推进计数（触顶即拒绝且文件字节不变）。
- **最该防的坑**（沿用 Mission 1 实测）：R1 提交时点早于结果文件；R2 证据锚点漂移（一律写 40 位提交号，不用 `HEAD~1`）；R3 变异窗口污染工作树；R4 全量 pytest 挂起且杀 pwsh 不杀子 python；R7「绿灯不能反推修法正确」；R11 文档「未提交」声明不可信，一律以 git 为准。
