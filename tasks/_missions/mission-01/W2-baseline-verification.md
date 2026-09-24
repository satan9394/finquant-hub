# W2 基线门禁复跑与落盘（BASELINE_VERIFICATION.md）

- 状态：已合入（待执行 / 执行中 / 阻塞 / 已合入）
- 优先级：P0
- 创建日期：2026-09-13
- Mission：finquant-hub 恢复基线 Mission 1
- 来源：planned

## 目标
在**最终提交**上复跑 finquant-hub 自带门禁，并把证据落盘为 `docs/ai/evo/BASELINE_VERIFICATION.md`：显式 40 位提交号 + 命令原文 + 原始输出 + 内容哈希。

## 要跑的门禁（逐条，命令原文照抄）
1. `cd backend && ruff check --no-cache .` → 须含 `All checks passed!`
   （**作用域警告**：只在 `backend` 下跑；从仓库根跑会得到约 11956 errors，因 `reference/` 在扫描面内 ⇒ 根作用域不可作判据）
2. 后端**聚焦** pytest（`0 failed`）：只跑被改文件/直接相关文件；**严禁全量 pytest**（本机全量会挂起，且杀 pwsh 不杀子 python，会留孤儿）
3. 前端 `bun run test`（若 `prebuild` 依赖 `backend/.venv`，先确认该 venv 存在）
4. 前端 `bun run build` → exit 0

## 限制条件 / 禁止事项
- 同一时刻**只跑一个** build / tsc / 全量 glob（风险 R5：并行会互相污染并造成假红）
- **每条门禁最多重跑 2 次**；第 3 次即视为「用重跑换绿」，须停下来如实报告
- 只允许新增 `docs/ai/evo/BASELINE_VERIFICATION.md`；若门禁产生构建产物/缓存，**不得提交**，且清理必须走回收站 API
- 不得改任何源码、配置、依赖
- 不得跑 E2E / Docker `up`
- 「绿灯不能反推修法正确」（R7）：证据里必须写清每条判据的**结构性理由**（跑了什么、覆盖了什么），不得把既有断言放宽或跳过

## 验收标准（客观门禁）
- [ ] `docs/ai/evo/BASELINE_VERIFICATION.md` 存在，且含**40 位显式提交号**（禁用 `HEAD~1` 之类相对锚点）
- [ ] 四类门禁各自的**命令原文**与**原始输出摘录**（含退出码/关键行：`All checks passed!`、pytest 汇总行、vitest 汇总行、build 结果）
- [ ] 后端 pytest 属于聚焦范围并写明**选了哪些文件、为什么**
- [ ] 每条门禁的重跑次数如实记录（≤2）
- [ ] 落盘后 `git status --porcelain` 仅显示该新增文件（或提交后为空）
- [ ] 若某条门禁失败或挂起：如实记录失败原因与复现命令，**不得**记为通过

## 依赖
- 依赖任务卡：W1（干净基线，便于 `git status` 判定）

## 预期证据（执行器回填）
- [ ] 四条命令的实际输出与退出码
- [ ] 提交号（40 位）与内容哈希
- [ ] 重跑次数记录
- [ ] `git status --porcelain` 落盘后状态
- [ ] 偏差 / 未完成项（尤其未跑或失败的门禁）

## 验收结论（Evaluator / 指挥会话回填）
- **PASS** → 自动合入；产物 `docs/ai/evo/BASELINE_VERIFICATION.md`（601 行）**待收尾卡提交**（R1：执行器不自行提交）
- 指挥侧独立复验（不采信报告，亲自重跑承载判据的那条）：
  - HEAD = **`264648d`** 未动；`git status --porcelain` 恰一行 `?? docs/ai/evo/BASELINE_VERIFICATION.md`；`git diff --name-only` 空
  - 我亲自跑 backend 作用域 ruff → `All checks passed!` **exit 0**
  - 我亲自跑去覆盖率口径的聚焦 pytest（从证据文件提取测试名，实得 10 个文件）→ **227 passed / exit 0**（比执行器报的 164 更多，仍 0 failed，交叉印证）
  - 证据文件含 40 位显式提交号、四条门禁的命令/输出/退出码、重跑次数、"未跑且不计为通过"清单
- 关键处置正确：**覆盖率门**（`pytest.ini` 强制 `--cov` + `fail_under=80`）使聚焦子集官方口径 exit 1，执行器按裁决**双口径记录**（官方口径如实登记 + 去覆盖率口径取得 `0 failed`），未把覆盖率失败与用例失败混为一谈；**不建议**为此改项目配置（本轮未改）
- 挂起风险处置正确：排除 `test_api.py` / `test_model_pricing.py`，用可终止整棵进程树的包装，跑后无孤儿 python
- 诚实边界：明确不对未跑部分（全量 pytest、E2E、Docker、`mypy`、前端全量）作任何断言；覆盖比例后端 8/123、前端 15/151
- 新发现（已入证据 §10.1）：pre-execute 门禁为**子串匹配**（连"把删除类 API 名列成待检模式"的自查脚本都会被拦），运行时字符串拼接会被第二道 AV 拦截 → 后续卡注意措辞
- 执行器：子代理 86545604
