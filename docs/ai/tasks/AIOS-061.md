# AIOS-061 - scheduler load/SLO 基线

## 状态

`[DONE]`

## 优先级

P1

## 用户结果

用户和维护者可用一条本地命令复核当前单连接 scheduler 在代表性小规模负载下的 claim/事件/终态写延迟、排队、失败和重启恢复成本，并依据明确阈值判断是否仍适合本地专业版，而不是凭感觉升级 PostgreSQL 或 durable queue。

## 允许修改

- `backend/scripts/benchmark_scheduler_runtime.py`（新建）
- `backend/tests/test_scheduler_runtime_benchmark.py`（新建）
- `docs/ai/SCHEDULER_SLO_BASELINE.md`（新建）
- `docs/ARCHITECTURE.md`
- `docs/ai/ARCHITECTURE.md`
- AIOS 长期计划、EXEC_PLAN 与本任务卡

## 禁止修改

- 生产 scheduler/database/router/service 代码、schema、API、前端、真实金融数据或模型路径、`reference/`
- PostgreSQL、Redis、Celery、durable queue、连接池、第二数据库连接、ORM、新依赖
- 用 mock/fixture 延迟冒充真实模型或上游 SLO；用一次极端值替代分位数；隐藏失败样本
- 因 benchmark 结果自行实施架构迁移；达到决策门时只能记录证据并将后续 ADR 任务保持/改为 BLOCKED，等待 `@Satanchen`

## 完成标准

- runner 使用临时独立 SQLite、现有 schema v23/job runtime 和 deterministic no-op/失败 fixture；不读写项目数据库。
- 固定记录环境、样本数、warmup、任务数/并发、统计口径和 P50/P95/max；至少覆盖单次 claim+terminal、20 job 批次、失败终态和 20 个 stale run recovery。
- 排队指标区分总 wall time、每 job scheduler overhead 和数据库写延迟；不包含真实 LLM/行情耗时。
- 预先定义本地基线门槛：单次 lifecycle P95 <= 250 ms、20 job batch <= 5 s、20 stale recovery <= 2 s、重复关键写入=0、错误/恢复记录完整率=100%。
- runner 输出机器可读 JSON 和 PASS/FAIL；任一阈值失败返回非零，原始样本与失败原因保留在输出。
- 测试验证 schema、统计计算、阈值边界、失败样本、临时库清理和无真实上游调用；不把静态/fixture 结果描述成生产 SLO。
- 执行至少 3 次 runner；文档记录三次结果、最差 P95/耗时、结论和路线图 7.2 decision-gate 判定。
- focused pytest、Ruff、mypy、runner、docs/diff check 通过；不要求 Phase 6 全量退出门禁。

## 回退

删除 benchmark runner、测试和基线文档即可；任务不修改生产 schema、服务或用户数据。

## 验证声明

该基线只测当前机器、临时 SQLite 和 deterministic fixture 的 scheduler 自身开销；不代表真实 LLM、行情、网络、多人并发、跨进程恢复或生产容量。

## 完成证据

- runner 输出 `scheduler-runtime-benchmark/v1` JSON，保留原始 lifecycle 样本、环境、固定阈值、逐项检查与失败原因；任一检查失败返回非零。
- 三次独立运行均 PASS；最差 lifecycle P95 4.6498 ms、20-job batch 84.3661 ms、20 stale recovery 8.2897 ms；重复关键写入 0，失败/恢复记录完整率 100%，第二次恢复变化 0。
- 每次均使用 schema v23 临时 SQLite，真实 LLM/行情/网络调用为 0，并确认临时数据库删除。
- focused pytest 3 passed；Ruff passed；mypy 1 source file passed；三次 runner passed；docs/diff check passed。Phase 6 首次 full suite 暴露跨 pytest event loop 的旧 runtime lock，新增复现测试后 runner 使用当前 loop 的隔离 lock 并恢复宿主对象；完整 backend 526 passed / 83.94%。
- 第 7.2 节决策门未触发；AIOS-062/063 继续 `[BLOCKED]`，没有实施外部队列、PostgreSQL 或其他架构迁移。
