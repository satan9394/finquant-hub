# W5 修正两份基线产物之间的口径矛盾

- 状态：已合入（待执行 / 执行中 / 阻塞 / 已合入）
- 优先级：P1
- 创建日期：2026-09-13
- Mission：finquant-hub 恢复基线 Mission 1
- 来源：**blocker**（W4 交证时发现；指挥侧已独立复核确认存在）

## 问题（已复核）
- `docs/ai/evo/NEXT_BACKLOG.md:175`（§6.4「本轮未做的验证」）写着：**前端 `bun run test` / `bun run build`**、后端全量 pytest、OpenAPI 导出**均未跑**
- 但 `docs/ai/evo/BASELINE_VERIFICATION.md` 明确记录：`:22` 前端**聚焦** vitest `Test Files 15 passed (15)` / `Tests 83 passed (83)` exit 0；`:23` `bun run build` → `openapi fresh (60 schemas)` → `tsc -b` → `built in 39.33s` exit 0
- 两份产物同为基线依据，并列时互相打架；**这是 W3 沿用了侦察报告的"未跑"旧口径、未读 W2 的实测结果所致**

## 目标
只改 `NEXT_BACKLOG.md` §6.4 那一段，使它与实测口径一致：
- **已跑**：前端**聚焦** vitest（15 文件 / 83 用例，exit 0）、`bun run build`（exit 0）→ 并交叉引用 `BASELINE_VERIFICATION.md:22`、`:23`、`:299`、`:340-386`
- **未跑**：前端**全量** vitest（151 文件）、后端**全量** pytest（本机沙箱会挂起）、E2E、Docker `up`、`mypy`、OpenAPI 导出
- 措辞必须让读者一眼分清「聚焦 vs 全量」，不得再用"前端 bun run test / bun run build 均未跑"这种覆盖全部前端口径的说法

## 限制条件 / 禁止事项
- **只允许修改 `docs/ai/evo/NEXT_BACKLOG.md` 的 §6.4 段**；不得顺手改其它段落、其它文件
- **整句替换 + 读回核对 + grep 复核**：替换后必须读回确认，并 grep 证明旧句（"均未跑"覆盖前端两命令的那句）**不残留**（元教训：子串替换只换半句犯过两次）
- 不得改 `BASELINE_VERIFICATION.md`（它是实测记录，口径正确）
- 提交必须**路径限定**（只 `git add docs/ai/evo/NEXT_BACKLOG.md`）；禁止 `git add -A` / `git add .`
- 不 push（无 remote）；不打 tag；不得删除文件
- 命令文本与提交信息**不得含永久删除类 API 字面名**（本机 pre-execute 门禁为子串匹配，会被拦）

## 验收标准（客观门禁）
- [ ] §6.4 段已改正，明确区分「已跑（聚焦 vitest + build，exit 0）」与「未跑（前端全量 vitest / 后端全量 pytest / E2E / Docker / mypy / OpenAPI 导出）」
- [ ] 交叉引用 `BASELINE_VERIFICATION.md` 的具体行号
- [ ] grep 自证：旧表述不残留（贴命令与输出，0 命中）
- [ ] 提交恰含一份文件（`git show --stat --oneline HEAD` = 1 file changed，无删除）；提交后 `git status --porcelain` 为空
- [ ] 未触碰其它任何文件（`git diff --name-status HEAD~1 HEAD` 仅一条 `M`）

## 依赖
- 依赖任务卡：W2、W3、W4

## 预期证据（执行器回填）
- [ ] §6.4 改前/改后对照（整段）
- [ ] grep 旧句复核输出（0 命中）
- [ ] 提交哈希与 `git show --stat`
- [ ] `git status --porcelain` 提交后
- [ ] 偏差 / 未完成项

## 验收结论（Evaluator / 指挥会话回填）
- **PASS** → 自动合入；提交 **`cec2c12`**（父 `c63bdbe`）
- 指挥侧独立复验：`git show --stat` = **1 file changed, 5 insertions(+), 1 deletion(-)**；`git diff --name-status HEAD~1 HEAD` 恰一条 `M docs/ai/evo/NEXT_BACKLOG.md`；**`BASELINE_VERIFICATION.md` 未被触碰**（该命令无输出）；提交后 `git status --porcelain` 零行
- **旧句不残留已证**：`本轮未做的验证|均未跑|bun run test` 在文件中 **0 命中**
- 新 §6.4 实读确认：4 条子项，已跑（聚焦 vitest 15 文件/83 用例 exit 0 + `bun run build` exit 0，含交叉引用行号）与未跑（前端全量 vitest 151 文件 / 后端全量 pytest / E2E / Docker / `mypy` / OpenAPI 导出）**分列**，并明写"不代表前端全量绿"
- 执行器：子代理 0d376e20
