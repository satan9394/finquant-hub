# W3 NEXT/NIT 收敛为单一待办清单（NEXT_BACKLOG.md）

- 状态：待执行（待执行 / 执行中 / 阻塞 / 已合入）
- 优先级：P1
- 创建日期：2026-09-13
- Mission：finquant-hub 恢复基线 Mission 1
- 来源：planned

## 目标
把散落在多份文档里的 NEXT / NIT / 待办收敛为**一份**带状态与来源的清单：`docs/ai/evo/NEXT_BACKLOG.md`（用户裁决：只此一份，不新建 `tasks/`）。

## 候选来源（侦察已定位）
- `docs/ai/EXEC_PLAN.md`（**已排空**：140 个 `[DONE]`，无 `[READY]`）
- `HANDOFF.md`（**严重过期**：目标仍写 Local OSS v1、DoD 三项已完成却未勾选）
- `docs/ai/evo/` 下相关 PRODUCT_GAP_MAP / PRODUCT_STATE / R439 及 4 条 NIT
- `task/CHANGELOG.md` 的收尾条目与附注

## 硬性要求
1. **不得收录已 ACCEPT 解决的问题**：NOW-1..NOW-4（已由 VS-24..VS-29 完成）、`Discover.tsx:49` 与 `AlphaResearchPanel.tsx:25`（已由 VS-36 / `ba725bd` 修掉）。落盘后须用 grep 自证这些字样**不以"待办"身份出现**
2. 每条须带：**状态**（未开始/进行中/已否决/待评估）、**来源**（哪份文档/哪个提交）、**严重度**（🟠/🟡/NIT）
3. 已知候选（侦察结论，按此收敛，不得凭空新增）：
   - 🟠 `GlobalTaskEntry.tsx:87` saved/recent 同族收口（Reviewer 自述「本族收口」不严格成立）
   - 🟠 `swarmApi.ts` 无历史回放（**新需求，须先做只读评估**）
   - 🟡 `MonitorToday.test.tsx:30` 未传必填 `onRetry`（潜伏类型缺口）
   - 🟡 ~40 处族外「发起时清」
   - 🟡 A5-P2-5 高频 AI 入口不在导航（**已 NOT_NOW**）
   - 🟡 A5-P3-6 `start.bat` 跳过依赖安装（**状态存疑，须复核**）
   - 🟡 `scripts/audit.py:423` F841（不在 backend 门禁作用域内）
   - NIT ×4（观感）
   - 文档漂移：`README.md` 22 vs 实测 23 个 APIRouter（只登记不修改）
4. **整句替换 + 读回核对 + grep 复核**：若需在原文档加指针行，必须整句替换并读回确认，且 grep 证明旧句不残留（元教训：子串替换只换半句犯过两次）
5. **不改写历史档案**：`docs/ai/evo/*` 既有评估文件与 `task/CHANGELOG.md` 的历史条目不得修改（只允许新增本清单 + 必要的指针行）

## 验收标准（客观门禁）
- [ ] `docs/ai/evo/NEXT_BACKLOG.md` 存在，含全部候选条目与「状态/来源/严重度」三要素
- [ ] grep 自证：`NOW-1`..`NOW-4`、`Discover.tsx:49`、`AlphaResearchPanel.tsx:25` **不以待办身份出现**（若作为"已解决，勿重开"的注解出现，须显式标注）
- [ ] 每条来源可追溯（文档名 + 必要提交号）
- [ ] 未修改既有 `docs/ai/evo/*` 评估文件与 `task/CHANGELOG.md` 历史条目
- [ ] `git status --porcelain` 仅显示预期新增/修改文件

## 依赖
- 依赖任务卡：W1、W2

## 预期证据（执行器回填）
- [ ] 清单全文（或要点 + 条目数）
- [ ] grep 自证输出（已解决项不以待办出现）
- [ ] `git status --porcelain`
- [ ] 偏差 / 未完成项
