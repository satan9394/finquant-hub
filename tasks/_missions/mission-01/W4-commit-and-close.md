# W4 收尾：按路径限定提交两份新档 + 基线固化确认

- 状态：已合入（待执行 / 执行中 / 阻塞 / 已合入）
- 优先级：P1
- 创建日期：2026-09-13
- Mission：finquant-hub 恢复基线 Mission 1
- 来源：**blocker**（W2/W3 的产物未提交，D1「工作区干净」尚未最终达成）

## 目标
1. 用**路径限定**命令提交两份新档（这是本轮唯一的提交动作）：
   - `git add docs/ai/evo/BASELINE_VERIFICATION.md`
   - `git add docs/ai/evo/NEXT_BACKLOG.md`
   - 提交信息说明：finquant 基线固化（门禁复跑证据 + 单一待办清单）
2. 提交后确认：`git status --porcelain` **输出为空**；`git show --stat --oneline HEAD` **恰好两份 `A`**
3. 按 DoD 五条做**最终逐条核对**并落成一张核对表（不必重跑门禁，D2/D3 引用 W2 的证据文件）：
   - D1 `git status --porcelain` 空
   - D2 后端 `ruff check --no-cache .` 含 `All checks passed!`；聚焦 pytest `0 failed`（**注明双口径**：官方口径因覆盖率门 exit 1、去覆盖率口径 exit 0）
   - D3 前端 `bun run test` 与 `bun run build` exit 0（引用证据文件）
   - D4 `docs/ai/evo/BASELINE_VERIFICATION.md` 存在且含 40 位显式提交号
   - D5 `docs/ai/evo/NEXT_BACKLOG.md` 存在、16 条三要素齐全、不含已 ACCEPT 项（引用其 §5 grep 自证）

## 限制条件 / 禁止事项
- **禁止** `git add -A` / `git add .`（本项目历史上曾把变异中间态误提交）；必须逐个路径写明
- 不得动其它任何文件；不得删除文件；不 push（无 remote）；不打 tag
- 不得为让判据好看而重跑门禁或改配置
- 命令文本与提交信息**不得含永久删除类 API 字面名**（本机 pre-execute 门禁为子串匹配，会被拦）

## 验收标准（客观门禁）
- [ ] `git status --porcelain` 提交前 = 两行 `??`；**提交后 = 空**
- [ ] `git show --stat --oneline HEAD` 恰两份文件、均为 `A`、无删除
- [ ] DoD 五条核对表逐条给出**可复核的证据指针**（命令或文件位置）
- [ ] 未触碰其它文件（`git diff --name-status HEAD~1 HEAD` 仅两条 `A`）
- [ ] 如实记录：本轮未跑的门禁（全量 pytest、E2E、Docker、`mypy`、前端全量 vitest）仍为"未跑"，不得因为要收尾而改口

## 依赖
- 依赖任务卡：W2、W3

## 预期证据（执行器回填）
- [ ] `git status --porcelain` 提交前/后
- [ ] `git show --stat --oneline HEAD` 与新提交哈希
- [ ] DoD 五条核对表
- [ ] 偏差 / 未完成项

## 验收结论（Evaluator / 指挥会话回填）
- **PASS** → 自动合入；新提交 **`c63bdbe`**（父 `264648d`）
- 指挥侧独立复验：HEAD = `c63bdbe`、`git status --porcelain` **零行**、`git show --stat` 恰 2 文件 / **799 insertions / 无删除**、`git diff --name-status HEAD~1 HEAD` 恰两条 `A`
- DoD 指针抽验：`BASELINE_VERIFICATION.md:3` 确为 40 位提交号锚点；`:493` 明确"D2 的 0 failed 由去覆盖率口径支撑"；`:22`/`:23` 两条前端门禁结论行存在；`NEXT_BACKLOG.md` `^### ` 计数 **16**
- **发现一处真矛盾（已立 W5 修）**：`NEXT_BACKLOG.md:175` §6.4 写"前端 `bun run test` / `bun run build` … 均未跑"，与 `BASELINE_VERIFICATION.md:22/:23` 的实测（聚焦 vitest 15 文件/83 用例通过、build exit 0）冲突——W3 沿用侦察旧口径、未读 W2 实测所致
- 严重度显式性：D5 的"三要素齐全"由章节标题（🟠 P1 / 🟡 P2 / NIT / 文档类）承载，**判为满足**，不为此改文件
- 执行器：子代理 90f678d1
