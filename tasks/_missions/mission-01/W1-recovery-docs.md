# W1 两份恢复文档裁决落位（原件不改提交 + SUPERSEDED 说明）

- 状态：已合入（待执行 / 执行中 / 阻塞 / 已合入）
- 优先级：P0（D1 的前置）
- 创建日期：2026-09-13
- Mission：finquant-hub 恢复基线 Mission 1
- 来源：**human-requested**（用户裁决：归档提交 + 加 SUPERSEDED 说明）

## 目标
把 finquant-hub 里两个未跟踪的恢复文档**按原样**纳入版本控制，并新增一页说明它们已过期/已被取代，使 `git status --porcelain` 输出为空。

- `DSH_RECOVERY_CHECKPOINT.md`（60 行，紧急止损现场快照，**已过期**：其 §3/§4-1/§5-1/§7-1 描述的「工作树含未验收改动 +199/−53」已被 `38c0e3e` + `f74a26e` 消除）
- `DSH_RECOVERY_REPORT.md`（138 行，救援结案报告；§8 含 VS-38/39 收尾的原始探针证据与 8 个对象内容哈希 8/8 锚定，**这些不在 `task/CHANGELOG.md` 附五里**）

## 限制条件 / 禁止事项
- **原件一字不改**：不得编辑两份文档的任何字节（先记 `git hash-object`，提交后再核对一致）
- **`git add` 必须限定路径**（逐个文件写明路径），**禁止 `git add -A` / `git add .`**（风险 R3：变异窗口/临时文件曾被误提交）
- 新增一页 SUPERSEDED 说明（建议 `docs/ai/evo/RECOVERY_DOCS_SUPERSEDED.md`，中文），写明：两份文档的用途、为何已过期（被 `38c0e3e`+`f74a26e` 取代）、为何选择归档而非删除、以及「档案不许改写」的口径
- 不得动其它文件；不得改 `docs/ai/evo/*` 既有文件；不得 push（本项目无 remote）
- 不得删除任何文件；命令文本不得含永久删除类 API 字面名（本机 pre-execute 门禁会拦）
- 提交信息不得含永久删除类 API 字面名

## 验收标准（客观门禁）
- [ ] 提交前记录两份文档的 `git hash-object`；提交后**同一命令输出完全一致**（证明内容未变）
- [ ] `git status --porcelain` **输出为空**
- [ ] `git log --oneline -1` 显示新提交，`git show --stat --oneline HEAD` 显示恰好三份文件（两个原件 + 一页说明）
- [ ] SUPERSEDED 说明含：两份文档各自用途、过期原因（含两个提交号）、归档理由、SUPERSEDED 标注
- [ ] 未触碰 `task/`、`docs/ai/tasks/`、其它 `docs/ai/evo/*`
- [ ] 报告 `git status --porcelain` 在提交前后各一次的实际输出

## 依赖
- 无

## 预期证据（执行器回填）
- [ ] 两份文档 `git hash-object` 的前后对照
- [ ] `git status --porcelain` 前后输出
- [ ] `git show --stat --oneline HEAD`
- [ ] SUPERSEDED 说明全文（或要点）
- [ ] 偏差 / 未完成项

## 验收结论（Evaluator / 指挥会话回填）
- **PASS** → 自动合入（用户裁决项已按其选择执行完毕）
- 指挥侧独立复验：`main` HEAD = **`264648d`**（父 `f74a26e`）；`git status --porcelain` **零行**；`git diff --name-status f74a26e HEAD` 恰三条 `A`（无删除、无修改其它文件）
- **原件零字节改动获证**：`DSH_RECOVERY_CHECKPOINT.md` 工作区哈希 = `HEAD:` 哈希 = `b862732e9556d5ad…`；`DSH_RECOVERY_REPORT.md` 三方同为 `e19321bd6ba6d592…`（与执行器报告逐字一致）
- `docs/ai/evo/RECOVERY_DOCS_SUPERSEDED.md`（75 行）要点齐备：顶部 SUPERSEDED 标注、两份用途、过期原因（`38c0e3e` + `f74a26e`）、归档而非清除的理由、指向两份 EVALUATION_RESULT 为权威结论、§5 附两个 blob 哈希供自校验
- 未触碰 `task/`、`docs/ai/tasks/`、其它 `docs/ai/evo/*`；无 push/无 tag（项目无 remote）
- 执行器：子代理 75a7b017
