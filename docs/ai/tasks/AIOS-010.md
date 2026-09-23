# AIOS-010 - Evidence object 与派生输入引用 schema

## 状态

`[DONE]`

## 优先级

P0

## 用户结果

把 `CanonicalProvenanceEnvelope v1` 落为用户隔离的 SQLite schema，使事实、文档摘录和计算结果可持久化，并让计算输入以可核验外键引用而不是不可追踪文本存在。

## 允许修改

- `backend/app/database.py`
- `backend/tests/test_database_migrations.py`
- `backend/tests/test_evidence_schema.py`（新建）
- `docs/ai/ARCHITECTURE.md`
- `docs/ARCHITECTURE.md`
- AIOS 长期计划、EXEC_PLAN 与本任务卡

## 禁止修改

- routers、services、前端、依赖与锁文件
- `reference/`
- ORM、独立 DAL、数据库池或外部数据库
- 迁移任何现有 `evidence_json`；适配由 AIOS-011 执行

## 完成标准

- schema v12 新增 `evidence_objects` 与 `evidence_input_refs`，继续使用单 aiosqlite 连接和原始 SQL。
- 核心枚举、UNKNOWN/UPSTREAM_ERROR 的 JSON null、computed/non-computed 输入规则由数据库约束保护。
- input reference 使用同一 `user_id` 的复合外键，跨用户引用失败。
- v11 数据库升级前生成可恢复的 `.pre-v12.bak`，迁移可重复。
- focused migration/schema/isolation tests、Ruff、mypy 和 diff check 通过。

## 验证

```powershell
cd backend
.venv\Scripts\python.exe -m pytest tests/test_database_migrations.py tests/test_evidence_schema.py tests/test_user_isolation.py -q --no-cov
.venv\Scripts\python.exe -m ruff check app/database.py tests/test_database_migrations.py tests/test_evidence_schema.py
.venv\Scripts\python.exe -m mypy app/database.py
cd ..
git diff --check
```

## 回退

停止应用后，用迁移自动生成的 `<database>.pre-v12.bak` 恢复整个 SQLite 文件。不得在运行中只删除新表后继续使用 v12 数据库。

## 完成证据

- schema v12 新增 owner-scoped `evidence_objects` 和 `evidence_input_refs`，保持原始 SQL 与单连接。
- 数据库约束拒绝 UNKNOWN=0、observed 缺来源、computed 缺输入，以及非计算事实携带 inputs。
- 同用户派生引用成功，跨用户 input reference 由复合外键拒绝。
- v11 重开自动生成 `.pre-v12.bak`，备份仍为 user_version 11 且不含 v12 表。
- focused 7 passed，Ruff、mypy、diff check 通过。
- 完整既有 `test_cross_user_reads_and_writes_are_rejected` 另有工作树既存 `LOCAL_ONLY_MODE` 默认绕过 cookie 的失败；未修改该无关认证变更。
