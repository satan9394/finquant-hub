# AIOS-020 - 类型化 memory records、状态与 supersession

## 状态

`[DONE]`

## 优先级

P0

## 用户结果

建立用户隔离的投资记忆权威记录，使偏好、研究兴趣、假设、决策、证据引用、风险、失效条件、工作流和复盘结果具有明确类型、状态与历史取代关系。

## 允许修改

- `backend/app/database.py`
- `backend/app/services/investment_memory.py`（新建）
- `backend/tests/test_database_migrations.py`
- `backend/tests/test_investment_memory.py`（新建）
- `docs/ai/ARCHITECTURE.md`
- `docs/ARCHITECTURE.md`
- AIOS 长期计划、EXEC_PLAN 与本任务卡

## 禁止修改

- routers、前端、依赖、现有 chat FTS 路径、`reference/`
- 自动抽取或第三方 memory/graph 接入

## 完成标准

- schema v13 新增 owner-scoped `memory_records`，迁移前 `.pre-v13.bak`。
- memory type、information kind、source kind 和状态均为固定枚举；content/quality 为有效 JSON。
- confirmed FACT 必须引用同一用户 evidence；supersedes 只能引用同一用户旧记录且不得自引用。
- service 提供 create/get/list/update/delete（soft delete）与 supersede；旧记录保留为 superseded。
- focused migration/CRUD/isolation tests、Ruff、mypy、diff check 通过。

## 验证

```powershell
cd backend
.venv\Scripts\python.exe -m pytest tests/test_database_migrations.py tests/test_investment_memory.py -q --no-cov
.venv\Scripts\python.exe -m ruff check app/database.py app/services/investment_memory.py tests/test_investment_memory.py
.venv\Scripts\python.exe -m mypy app/database.py app/services/investment_memory.py
cd ..
git diff --check
```

## 回退

停止应用后，用 `<database>.pre-v13.bak` 恢复整个 SQLite 文件；不得只删除表后继续使用 v13 数据库。

## 完成证据

- schema v13、`memory_records`、同 owner evidence/workspace/supersession 外键与 `.pre-v13.bak` 已实现。
- raw-SQL service 覆盖 create/get/list/update/soft-delete/supersede，旧记录保留为 `superseded`。
- focused migration/CRUD/isolation：8 passed；Ruff 与 mypy 通过；`git diff --check` 通过。
