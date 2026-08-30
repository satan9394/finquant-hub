# BACKLOG-004 — 后端覆盖率攻坚 + SSE 管线错误路径补强（综合）

> 状态：`[DONE]` ｜ 优先级：P1 ｜ 创建：2026-08-30 ｜ 执行者：Codex
> 背景：后端全量 551 个测试全绿，但**总体覆盖率 84%**，且核心模块存在明显薄点：`market_data.py`（行情降级链）仅 76.5%、`scheduler.py` 75.5%、`fundamentals.py` 77.4%、`monitor_targets.py` 74.7%、`report_export.py` 79.8%、`report_audit.py` 79.1%、`thesis_drift.py` 78.8%、`research_jobs.py` 80.9%；同时 6 条 SSE 管线（chat/discussion/analysis/research/swarm/notifications）的错误路径测试稀少。这些薄点恰是项目"可信度承诺"的核心（数据降级、失败恢复、证据审计），值得优先补测。
>
> 本任务 = **覆盖率攻坚（量化目标）** + **SSE 错误路径补强（质化目标）**，二合一。

---

## 允许修改

- `backend/tests/` 下新增测试文件（推荐按模块命名：`test_market_data_degradation.py`、`test_scheduler_recovery.py` 等）
- 既有测试文件（如需补用例，优先新增文件避免大改）
- `backend/scripts/`（如需新增测试辅助 fixture 生成脚本）
- `docs/ai/tasks/BACKLOG-004.md`、`docs/ai/EXEC_PLAN.md`、`task/CHANGELOG.md`

## 禁止修改

- `backend/app/` 任何业务代码——**本任务纯补测试，如发现业务 bug 只记录不修复**（在证据段写明，另开任务）
- 数据库、schema、认证、依赖、锁文件
- `frontend/`、`reference/`

---

## 完成标准

### 目标 1：总体覆盖率 84% → **≥ 87%**（量化硬指标）

用 `pytest --cov=app --cov-report=term-missing` 测量，`TOTAL` 行必须 ≥ 87%。**优先攻克以下靶点**（按优先级，每个至少提 5 个百分点或补到 ≥ 88%）：

| 靶点模块 | 当前 | 建议补测方向（参考 `--cov-report=term-missing` 的 Missing 行号） |
|---------|------|--------------------------------------------------------------|
| `services/market_data.py` | 76.5% | 降级链（quote 腾讯→新浪→Yahoo 逐级失败）、CircuitBreaker 熔断/恢复、`configure_source_priority` 源顺序配置、`prefetch_quotes` 有界并发与逐 ticker 错误、`cached_snapshot/store_snapshot` 快照过期 |
| `services/scheduler.py` | 75.5% | 调度循环（scheduler_loop 首轮/后续）、`seconds_until_next_run` 跨日、`run_research_job` 幂等 key、失败重试、`recover_stale_research_runs` |
| `services/fundamentals.py` | 77.4% | A 股（AkShare/Tushare）与港美（Yahoo）降级、缺失数据 UNKNOWN 语义、市场不支持分支 |
| `services/monitor_targets.py` | 74.7% | 草稿创建/确认/停用、无条件 UNKNOWN、对象绑定校验 |
| `services/report_export.py` | 79.8% | MD/HTML/PDF/DOCX 各导出分支、空数据、导出失败 |
| `tools/report_audit.py` | 79.1% | extract_data_points 各类型、render_verdict 各判定分支 |
| `services/thesis_drift.py` | 78.8% | 四类版本化规则、双侧 evidence 门禁、UNKNOWN 输入 |
| `services/research_jobs.py` | 80.9% | claim/heartbeat/lease 过期、幂等 key 冲突、终态 reconciliation |
| `services/thesis.py`（465 语句） | 83.4% | 不可变版本、claim-evidence 边、状态事件、supersession |

**硬性要求**：
- 新增测试**必须确定性**——mock 所有外部 I/O（httpx/网络/LLM），不依赖真实网络或代理环境（参考 `test_trading_agent_tools.py` 的 `monkeypatch.setattr` 模式与 `test_market_fallback.py` 既有降级测试）
- 用 `httpx.MockTransport`（如有）或 monkeypatch 服务方法；禁止真实出网
- 每个靶点补测后跑该模块聚焦测试 + 全量回归

### 目标 2：SSE 管线错误路径补强（质化）

6 条 SSE 管线（`chat.py` / `discussion.py` / `analysis.py` / `research.py` / `swarm.py` / `notifications.py`）目前错误路径测试稀少。为每条管线补**至少 2 个错误路径用例**：

1. **上游失败**：mock LLM/行情抛出异常 → SSE 流必须发 `error` 事件并正常结束（`try/finally` 清理、无挂起连接）
2. **校验失败**：非法输入（空 ticker/非法参数）→ HTTP 4xx，不发 SSE
3. **流中断**：客户端提前断开或 generator 中途异常 → 服务端无泄漏（如适用）
4. **notifications/stream**：断点续传（`Last-Event-ID` / `after_id`）、空闲 ping

参考 `test_api.py` 的 `_collect_sse` helper 与既有 SSE 用例模式。断言重点是：**错误事件存在、事件顺序正确、响应能干净结束**（不是只测 HTTP 200）。

### 目标 3：验证

- 全量：`backend\.venv\Scripts\python.exe -m pytest backend/tests -q --no-cov -p no:cacheprovider` 全绿（551 + 新增，**不得减少**）
- 覆盖率：`backend\.venv\Scripts\python.exe -m pytest backend/tests -q --cov=app --cov-report=term-missing -p no:cacheprovider` → `TOTAL ≥ 87%`（记录报告）
- 确定性：开代理 / 关代理（清空 `ALL_PROXY/HTTP_PROXY/HTTPS_PROXY`）各跑一次新增测试文件，结果一致
- `backend\.venv\Scripts\python.exe -m ruff check backend/tests` 通过；`git diff --check` 通过

### 目标 4：文档同步

- `docs/ai/EXEC_PLAN.md` 本任务标记 `[DONE]`（证据段记录：改动文件清单、覆盖率前后对比、SSE 用例清单、确定性验证）
- `task/CHANGELOG.md` 追加一条（What/Why/Docs/Verification/Risk）

---

## 参考

- `backend/tests/test_market_fallback.py`：既有降级链测试模式
- `backend/tests/test_trading_agent_tools.py` L50-70：`monkeypatch.setattr` 类方法 mock 模式
- `backend/tests/test_api.py` `_collect_sse`：SSE 事件收集 helper
- `backend/tests/test_scheduler.py` / `test_research_jobs.py`：调度器既有测试
- `backend/tests/test_database_migrations.py`：确定性 fixture 库模式（`tmp_path` + monkeypatch `DB_PATH`）

## 验证命令

```powershell
cd backend
# 全量（含新增）
.\.venv\Scripts\python.exe -m pytest ..\backend\tests -q --no-cov -p no:cacheprovider
# 覆盖率（硬指标 ≥ 87%）
.\.venv\Scripts\python.exe -m pytest ..\backend\tests -q --cov=app --cov-report=term-missing -p no:cacheprovider
# 确定性：开/关代理各跑新增测试
.\.venv\Scripts\python.exe -m pytest ..\backend\tests\test_market_data_degradation.py ..\backend\tests\test_scheduler_recovery.py -q --no-cov
# lint
.\.venv\Scripts\python.exe -m ruff check ..\backend\tests
cd .. && git diff --check
```

## 完成证据（执行后填写）

- 修改文件清单（新增/修改的测试文件）：新增 `test_market_data_degradation.py`、`test_fundamentals_branches.py`、`test_scheduler_recovery.py`、`test_monitor_targets_branches.py`、`test_report_export_branches.py`、`test_report_audit_branches.py`、`test_thesis_drift_branches.py`、`test_thesis_service_branches.py`、`test_sse_error_paths_backlog004.py`；同步本任务卡、`docs/ai/EXEC_PLAN.md`、`task/CHANGELOG.md`
- 覆盖率前后对比（TOTAL 84% → 87%）：基线 `551 passed`、`TOTAL 84%`（12,119 statements / 1,635 missing / 3,340 branches / 624 partial）；完成后 `613 passed`、`TOTAL 87%`（12,119 statements / 1,362 missing / 3,340 branches / 548 partial）
- 各靶点模块提升明细：
  - `services/market_data.py`：76% → 86%（+10pp）
  - `services/scheduler.py`：75% → 93%（+18pp）
  - `services/fundamentals.py`：77% → 95%（+18pp）
  - `services/monitor_targets.py`：75% → 95%（+20pp）
  - `services/report_export.py`：80% → 98%（+18pp）
  - `tools/report_audit.py`：79% → 94%（+15pp）
  - `services/thesis_drift.py`：79% → 100%（+21pp）
  - `services/research_jobs.py`：81% → 89%（+8pp）
  - `services/thesis.py`：83% → 90%（+7pp）
- SSE 错误路径用例清单（管线 × 场景）：
  - chat：mock `LLMError` → 单一 `error` 事件并结束；空消息 → HTTP 422、无 SSE
  - discussion：生成器中途异常 → `error` 事件并执行 generator finally；非法 room payload → HTTP 422、无 SSE
  - analysis：研究生成器中途异常 → `error` 事件并关闭；空 ticker → HTTP 422、无 SSE
  - research：研究生成器中途异常 → `error` 事件、报告转 `failed`、流关闭；空 ticker → HTTP 422、无 SSE
  - swarm：runner 中途异常 → `error` 事件、报告转 `failed`、流关闭；空 ticker → HTTP 422、无 SSE
  - notifications：`Last-Event-ID` 断点续传、15 秒 ping、客户端主动关闭触发 finally；负 `after_id` → HTTP 422、非法 header → HTTP 400，均无 SSE
- 开/关代理确定性验证结果：9 个新增测试文件在代理开启（3 个变量均为 `http://127.0.0.1:7897`，端口监听）时 `62 passed in 11.82s`；子进程临时清空 `ALL_PROXY/HTTP_PROXY/HTTPS_PROXY` 并确认 unset 后，相同命令 `62 passed in 13.53s`
- 完整套件结果：无覆盖率回归 `613 passed in 84.15s`；覆盖率回归 `613 passed in 141.36s`、`TOTAL 87%`；`ruff check backend/tests` 为 `All checks passed!`
- 备注（发现的真实业务 bug 或未完成项，只记录不修复）：未发现需要另开任务的业务 bug；全部外部 HTTP/LLM/行情均使用 `httpx.MockTransport`、假服务或 monkeypatch，新增测试无真实出网；未修改 `backend/app`、数据库 schema、认证、依赖、锁文件、frontend 或 `reference/`，未 commit
