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

---

# 复评（R-1 / R-2 / R-3，commit `d731b57`）

范围：`backend/app/services/research_jobs.py`、`backend/tests/test_research_jobs.py`（+ 定点核对 `scheduler.py` / `settings.py` 调用点），并实跑测试。

## 逐条核对

R-1（熔断后不可恢复）— 已修复。`:144` 新增关键字参数 `ignore_retry_cap: bool = False`；`:205` 判定为 `if not ignore_retry_cap and consecutive_failures >= _MAX_RETRY_ATTEMPTS`，语义与建议一致。恢复出口真实存在且只有手动一条：`settings.py:261` 手动"立即运行"传 `ignore_retry_cap=True`；`scheduler.py:333` 默认 `False`、`:350` 原样透传；自动调度路径 `scheduler.py:396` 不带该参数（默认 False），全仓再无其它 `run_research_job` 调用点，不存在自动路径误传 True 使熔断失效的风险。

R-2（`cancelled` 计入失败）— 已修复。`:190-203` 计数 SQL 为 `r.status='failed' AND r.started_at >= ? AND r.id > COALESCE(MAX(id) WHERE status='completed', 0)`，`cancelled` 已排除；`:199` 时间窗起点为 `format_local(current - timedelta(hours=_FAILURE_WINDOW_HOURS))`，`timedelta` 在 `:8` 已随 `datetime` 导入，参数元组 `(job_id, user_id, window, job_id, user_id)` 与 SQL 中 5 个 `?` 顺序逐一对齐，无错位；比较双方同为 `_DATE_FORMAT = "%Y-%m-%d %H:%M:%S"` 文本（写入见 `:257`），字典序即时序，正确。

R-3（文案不实）— 已修复。`:217-219` 改为"自动重试已暂停，请检查模型配置、额度与网络；修复后点'立即运行'即可恢复（或等待下个时间窗自动恢复）"，不再承诺"下次计划自动尝试"。

回归未发生：熔断分支 `:212-225` 只 `UPDATE ... last_status='failed', last_error, next_run_at=?, pending_idempotency_key=NULL` 后 `return None`，既不创建 run、也不置 `running`，且推进了 `next_run_at`；`mark_job_running`（`:464-484`）死代码问题为 P3，本轮未处理也无回归。

测试有效性：新增 4 例均为变异敏感、非恒真。`test_manual_run_bypasses_retry_cap` 先断言自动路径 `is None` 再断言手动路径非空（旧实现两项必挂）；`test_claim_ignores_cancelled_runs_when_counting_failures` 插 6 条 `cancelled` 并要求 claim 成功；`test_failed_runs_outside_window_do_not_break_circuit` 把 `now` 推到窗口外并要求恢复；另有测试断言熔断后 `next_run_at` 已推进、`last_status != 'running'`（补上了上轮 §4 的覆盖缺口）。

实跑：`pytest tests/test_research_jobs.py -q --no-cov` → **22 passed in 6.17s**。

## 两个条件的语义与边界（质疑点回答）

时间窗与"自上次成功以来"是 **AND 交集**，两者同为收紧条件、不会互相抵消：计数 = "上次成功之后、且落在 24h 窗口内"的 `failed` 数，任一条件都能降低计数。自动恢复由窗口衰减实现，且是**真恢复**——熔断期间不产生新 run，故最后一次失败后最多 24h 计数必然衰减到阈值以下，不存在"永久停摆"。

边界为 `>=`（含端点），恰好 24h 的那条仍计入。恢复是渐进的而非一次清零：失败聚簇在数小时内时，最早一条先滑出窗口即解熔（此时计数可能为 4 而非 0，再失败一次即重新熔断），比"满 24h 才解"更保守，行为合理；文案"等待下个时间窗自动恢复"是近似表述而非虚假承诺（该前提下必然成立），不构成阻断。

## 判定

**ACCEPT** —— R-1/R-2/R-3 三项均按建议修复，自动/手动路径隔离正确，无 `cancelled` 误计、无参数错位、无未导入符号，22 passed。遗留非阻断项：`mark_job_running`（`:464-484`）仍是死代码（P3，上轮已记）；边界 `>=` 与"渐进解熔"语义建议后续在注释中一句话写清即可，无需改实现。
