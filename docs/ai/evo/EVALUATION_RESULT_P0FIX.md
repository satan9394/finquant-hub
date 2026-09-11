# EVALUATION RESULT — G-02 P0 修复（commit `eff8e2d`）

- 验收人：EVALUATOR（独立验收，未修改任何实现文件）
- 日期：2026-09-01
- 范围：`backend/app/services/research_jobs.py::claim_research_job`、`backend/tests/test_research_jobs.py`
- 证据命令：`cd backend; .venv\Scripts\python.exe -m pytest tests/test_research_jobs.py -q --no-cov -p no:cacheprovider` → **19 passed in 6.82s**（符合预期）
- 结论：**REJECT**（两个原始 P0 确已修复，但修复引入/保留了一个不可自愈的终态：命中上限后 job 永久无法再被调度或手动运行）

---

## 1. 必做项逐条核对（全部通过）

| 检查项 | 结论 | 证据（行号） |
|---|---|---|
| 上限判定在 `last_status='running'` UPDATE **之前** | ✅ | 判定 `research_jobs.py:180-188`；running UPDATE 在 `:204-209`。命中上限时 `:191-203` 直接 `return None`，从未执行 running 写入 |
| 连续失败 SQL 正确（COALESCE / 成功后重置） | ✅ | `:180-186`：`status IN ('failed','cancelled') AND r.id > COALESCE((SELECT MAX(s.id) ... status='completed'), 0)`。无 run 历史 → 子查询 NULL → COALESCE 0 → 计数 0，安全。id 与 attempt 同序（claim 为唯一插入点，串行 lease），`id` 边界等价于"上次成功之后" |
| 命中上限不留 running / 不建 run / 推进 next_run_at | ✅ | `:191-202` 只更新 job（`last_status='failed'` + 中文原因 + `next_run_at=next_at` + 清 pending key），`:203 return None` 在 INSERT 之前，未创建 run |
| 正常路径与修复前一致（置 running → 建 run） | ✅ | `:204-211` running UPDATE 带 `last_status!='running'` 守卫 + rowcount 校验；`:213-249` 取 latest/attempt、建 run、写事件，顺序与语义不变 |
| 3 个新回归测试真能捕获两个 P0 | ✅ | 见 §2 |
| 空指针/键错误 `failed_row["n"]` | ✅ 安全 | `COUNT(*)` 恒返回一行，`if failed_row else 0` 双保险；sqlite3.Row 支持 `["n"]` |
| 事务语义（`return None` 只提交期望写入） | ⚠️ 基本可信，有测试盲区 | 三个 `return None` 分支中，`:161-162`/`:210-211` 无写入；`:203` 只提交 job 置 failed（期望写入）。但测试断言走同一连接读取，未从新连接/新进程验证 commit；正常路径的 commit 由既有测试间接覆盖 |

## 2. 回归测试有效性（变异分析，非"永远通过"）

- `test_claim_still_allows_job_after_many_successful_runs`（`:420-434`）：插入 8 条 `completed`。旧实现按 `latest.attempt+1` 判定 → 9 > 5 必被拦 → `outcome is None`，断言失败。✅ 捕获 P0#2。
- `test_claim_cap_does_not_leave_job_stuck_running`（`:437-459`）：5 条 `failed`。旧实现先提交 running 再 return → `last_status == 'running'`，断言失败；同时 `count == 5` 覆盖"不建 run"。若 SQL 漏写 `COALESCE`（`r.id > NULL` 全不成立 → 计数 0），该测试同样会因 `outcome is not None` 失败。✅ 捕获 P0#1 且顺带覆盖 NULL 安全。
- `test_claim_resumes_after_a_success_resets_failure_streak`（`:462-476`）：5 failed + 1 completed（id 更大）→ 旧实现 attempt=7 被拦。✅ 捕获"成功后重置"。

## 3. REJECT 理由（P1，文件:行 + 原因 + 建议）

**R-1 命中上限后 job 进入不可自愈终态，"每计划一次"的意图未达成 — `research_jobs.py:188-203`（配合 `:229`、`scheduler.py:343`）**

- 原因：上限分支不创建 run，因此 `consecutive_failures` 的输入集合此后**永不变化**（无新 run、更无 `completed` run 可抬高边界）。下一次 cron 到点，`claim_research_job` 重新计数仍 ≥ 5，再次进入同一分支，只把 `next_run_at` 再往后推一格 —— **永远不会真正尝试**。
- 全仓验证：`INSERT INTO scheduled_research_runs` 仅存在于 `research_jobs.py:229`；`claim_research_job` 唯一调用点是 `scheduler.py:343`（`run_research_job`）。因此手动"立即运行"走的是同一道闸门 → 同样 `return False`。`update_research_job`（`:433-448`）不清理失败游标，关/开 `is_enabled` 也无法复位。**唯一出路是直接改数据库。**
- 后果：这正是原 P0"定时研究永久死亡"的另一种形态——从"静默"变成"可见但不可恢复"。而失败原因文案本身就是瞬时的（额度/网络），最可能触发上限的场景恰恰是用户按提示"修复配置后"却发现任务再也不跑。
- 建议（任一即可，最小改动）：
  1. 给 `claim_research_job` 增加 `ignore_retry_cap: bool = False`，由 `run_research_job` 在**显式手动触发**（调用方传入 `idempotency_key`）时置 True —— 保留自动重试熔断，恢复人工出口；
  2. 或把计数窗口改为时间衰减（如仅统计最近 24h 的失败），使"每计划一次"成立；
  3. 并让 `update_research_job`（用户修改配置/重新启用）复位失败游标。

**R-2 `cancelled` 被计入"连续失败"，把用户取消/进程重启算成失败 — `research_jobs.py:182`（配合 `scheduler.py:359-363`）**

- 原因：`scheduler.py:359-363` 在 `asyncio.CancelledError`（应用关闭 / 服务重启打断运行中的 job）时用 `status="cancelled"` 结束 run，而计数 SQL 把 `cancelled` 与 `failed` 一同累加。5 次重启或 5 次用户取消即可触发 R-1 的永久停摆，且错误文案（"连续失败 5 次，请检查模型配置、额度与网络"）与事实不符。
- 建议：计数只取 `failed`，或为 `cancelled` 单独设更高的阈值/不计入。

**R-3 文案与注释与实现不符（误导用户与后续维护者）— `research_jobs.py:189-190`、`:196-197`**

- `:189-190` 注释"正常调度不受影响，下一次到点仍会尝试一次"、`:196-197` 面向用户的"等待下次计划"均为**假**——见 R-1，下次计划不会尝试。
- 建议：改为"自动重试已熔断，请手动重跑或调整配置"。

## 4. 次级观察（P2/P3，非阻断）

- 覆盖缺口：`test_claim_cap_does_not_leave_job_stuck_running` 未断言 `next_run_at` 已推进。实现是对的（`:192,198`），但若将来回归掉该行，测试不会失败——补一行 `assert job["next_run_at"] > "2026-08-01 08:00:00"`。
- `mark_job_running`（`:464-484`）在全仓已无调用者（死代码），建议后续清理以免误用绕过 claim 闸门。
- 事务 commit 的独立验证盲区见 §1 末行。

## 5. 判定

**REJECT** —— 两个原始 P0（`last_status='running'` 先于判定、attempt 全历史累加误杀）**已确认真实修复**，3 个回归测试变异敏感、19 passed。但上限分支造成不可自愈的永久停摆（R-1），且 `cancelled` 计入失败使其更易触发（R-2），文案反向误导（R-3）。建议按 §3 最小改动修复后复验（复验点：命中上限 → 手动触发可成功；或下次计划到点确实尝试一次）。
