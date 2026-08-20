# AIOS-030 - Thesis v2 版本化领域模型

## 状态

`[DONE]`

## 优先级

P0

## 用户结果

每条投资 Thesis 能明确表达当前判断、关键假设、支持/反对证据、失效条件和置信度；任何修订都保留上一版本，旧 thesis 仍可无损读取。

## 允许修改

- `backend/app/database.py`
- `backend/app/routers/thesis.py`
- `backend/app/services/thesis.py`
- `backend/tests/test_database_migrations.py`
- `backend/tests/test_thesis.py`
- `docs/API_CONTRACT.md`
- `docs/ROUTER_MAP.md`
- `docs/ARCHITECTURE.md`
- `docs/ai/ARCHITECTURE.md`
- `docs/ai/THESIS_V2_CONTRACT.md`（新建）
- AIOS 长期计划、EXEC_PLAN 与本任务卡

## 禁止修改

- frontend、依赖、`reference/`
- Graphiti/图数据库、ORM/DAL、自动替用户确认判断
- 删除或重写既有 thesis/thesis_claims 历史

## 完成标准

- schema v15 建立 owner-scoped Thesis v2 版本记录与迁移前 `.pre-v15.bak`。
- 旧 `thesis`/`thesis_claims` API 与读取语义保持兼容，旧字段和值无损保留。
- v2 明确保存 judgment、assumptions、supporting/opposing evidence references、invalidation conditions、confidence、version 和 change reason。
- 修改生成新版本并保持前一版本不可变；跨用户读写和跨用户 evidence 引用为零。
- 不把 AI 推论或用户假设自动升级为事实，不因 evidence 缺失补造状态。
- focused migration/thesis tests、Ruff、mypy、API/OpenAPI contract 与 diff check 通过。

## 验证

```powershell
cd backend
$env:LOCAL_ONLY_MODE='false'
.venv\Scripts\python.exe -m pytest tests/test_database_migrations.py tests/test_thesis.py tests/test_router_contracts.py -q --no-cov
.venv\Scripts\python.exe -m ruff check app/database.py app/routers/thesis.py app/services/thesis.py tests/test_thesis.py
.venv\Scripts\python.exe -m mypy app/database.py app/routers/thesis.py app/services/thesis.py
cd ..
git diff --check
```

## 回退

停止应用后可用 `.pre-v15.bak` 回退；新版本表是权威 SQLite 内的扩展，不删除旧 thesis 表或覆盖旧行。

## 验证声明

本任务使用 deterministic fixture 和本地 SQLite，不构成真实金融上游验证。

## 完成记录（2026-08-11）

- schema v15 新增 owner-scoped `thesis_versions` 与 `thesis_version_evidence_refs`，迁移前 `.pre-v15.bak`，旧记录无损回填 version 1。
- legacy `thesis`/`thesis_claims` 保持 current-view/API 兼容；编辑生成不可变新版本，旧 manual claims 退休但不删除。
- 版本明确保存 judgment/kind、assumptions、claims、支持/反对 evidence、失效条件、confidence、change reason 与 actor；只允许 `USER_HYPOTHESIS`/`AI_INFERENCE`。
- 同用户 evidence 外键、跨用户拒绝、原子回滚、owner-scoped history 和数据库不可变触发器均有 deterministic 测试。
- focused（含 legacy API 与 owner schema contract）17 passed；Ruff、mypy、OpenAPI 111 paths/142 operations、diff check 通过。
- 未执行真实金融上游或真实模型验证。
