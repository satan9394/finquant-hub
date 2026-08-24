# AIOS-004 - Graphiti 与 Mem0 fixture-only shadow PoC

## 状态

`[BLOCKED]`

## 优先级

P0

## 用户结果

用 AIOS-001 的合成评估集建立可重复的第三方候选 shadow 探测，诚实区分 native 实测、候选可用性和未运行项，为 ADR 提供依赖、许可、运维与回退证据。

## 允许修改

- `backend/scripts/memory_shadow_poc.py`（新建）
- `backend/tests/test_memory_shadow_poc.py`（新建）
- `docs/ai/AIOS_MEMORY_SHADOW_POC.md`（新建）
- AIOS 长期计划、EXEC_PLAN 与本任务卡

## 禁止修改

- `backend/app/`、数据库、schema version、依赖与锁文件
- `frontend/`、`reference/`
- 生产模型注入、生产数据写入、图数据库或外部服务

## 完成标准

- native FTS5 继续在同一 fixture 上实测并作为唯一回答路径。
- Graphiti/Mem0 仅探测本地安装与 fixture-only 执行条件；不可用时输出 `NOT_RUN` 和原因，不模拟框架结果。
- 报告覆盖版本证据范围、依赖、许可、运维、数据写入、回退和采用门禁。
- 无第三方生产依赖、无真实用户数据、无外部写操作。
- focused tests、Ruff 和 diff check 通过。

## 验证

```powershell
cd backend
.venv\Scripts\python.exe scripts/memory_shadow_poc.py --repetitions 2
.venv\Scripts\python.exe -m pytest tests/test_memory_shadow_poc.py -q --no-cov
.venv\Scripts\python.exe -m ruff check scripts/memory_shadow_poc.py tests/test_memory_shadow_poc.py
cd ..
git diff --check
```

这是 deterministic fixture-only 可行性探测。候选为 `NOT_RUN` 时，不构成 Graphiti/Mem0 的真实性能或正确性验证。

## 回退

删除本任务新增脚本、测试和报告，恢复三个计划 Markdown 的本任务行。没有生产接线、依赖或数据需要迁回。

## 阻塞证据

- native fixture 实测完成：6 cases，Recall@5 1.0000、Precision@5 0.9167，隔离泄漏与注入执行为 0。
- Graphiti/Mem0 均未安装，pip cache 无对应包。2026-08-23 通过规定代理 `127.0.0.1:7897` 直接运行 pip index，已可读取 `graphiti-core 0.29.3` 与 `mem0ai 2.0.18`；旧“包源不可达”外部阻塞已解除，但没有安装或执行候选。当前 runner 的 `external_network_lookup` 是历史硬编码字段，仍输出 `UPSTREAM_ERROR`，不得再把它当成实时连通性探测。
- 两个候选均为 `NOT_RUN`，指标保持 `null`；不得把依赖探测描述为框架 benchmark。
- 2026-08-23 runner 复验保持 native Recall@5 1.0000、Precision@5 0.9167；候选 executed=0、production writes=0；focused pytest 2 passed，Ruff 与 diff check 通过。
- 解除阻塞仍需要对隔离临时依赖、LLM/embedder 与可丢弃图/向量基础设施的明确授权；不得新增生产依赖。
