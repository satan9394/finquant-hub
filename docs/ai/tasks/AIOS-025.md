# AIOS-025 - chat/research shadow 到 opt-in rollout

## 状态

`[DONE]`

## 优先级

P0

## 用户结果

typed memory 可先在 chat/research 影子模式审计候选差异，再由默认关闭的 opt-in 开关进入上下文；随时关闭即可回退到既有 FTS，且不保存查询或回答正文。

## 允许修改

- `backend/app/config.py`
- `backend/app/database.py`
- `backend/app/routers/chat.py`
- `backend/app/services/research_orch.py`
- `backend/app/services/memory_rollout.py`（新建）
- `backend/tests/test_database_migrations.py`
- `backend/tests/test_memory_rollout.py`（新建）
- `docs/ARCHITECTURE.md`
- `docs/ai/ARCHITECTURE.md`
- `docs/ai/MEMORY_ROLLOUT.md`（新建）
- AIOS 长期计划、EXEC_PLAN 与本任务卡

## 禁止修改

- frontend、依赖、现有 FTS 实现、`reference/`
- 默认启用 typed context、双写回答正文/查询正文、第三方 memory/graph

## 完成标准

- schema v14 新增 owner-scoped metadata-only rollout audit，迁移前 `.pre-v14.bak`。
- shadow 开关默认关闭；开启 shadow 时执行 typed retrieval 但不注入上下文。
- opt-in 开关默认关闭；开启后 chat/research 注入 AIOS-023 assembler 输出，关闭即回退到 FTS-only。
- audit 只保存 query/response hash、候选计数、status 计数、字符/token 成本和 outcome，不保存正文。
- focused migration/rollout/chat/research tests、Ruff、mypy、diff check 通过；Phase 2 完整门禁通过。

## 验证

```powershell
cd backend
.venv\Scripts\python.exe -m pytest tests/test_database_migrations.py tests/test_memory_rollout.py tests/test_api.py tests/test_research_orch.py -q --no-cov
.venv\Scripts\python.exe -m ruff check app/config.py app/database.py app/routers/chat.py app/services/research_orch.py app/services/memory_rollout.py tests/test_memory_rollout.py
.venv\Scripts\python.exe -m mypy app/config.py app/database.py app/routers/chat.py app/services/research_orch.py app/services/memory_rollout.py
cd ..
git diff --check
```

## 回退

关闭两个开关即可立即恢复 FTS-only；停止应用后可用 `.pre-v14.bak` 回退数据库，audit 表不得用于恢复或生成用户正文。

## 完成记录（2026-08-11）

- schema v14 新增 `memory_rollout_audits`，具备标准 owner index/trigger 合同与 `.pre-v14.bak`。
- `MEMORY_TYPED_SHADOW_ENABLED` 和 `MEMORY_TYPED_CONTEXT_ENABLED` 均默认关闭；shadow 不注入，opt-in 在既有 FTS 上下文之后追加 AIOS-023 assembler 输出。
- chat/research 均完成 metadata-only audit；只存 SHA-256、候选/status 计数、字符/token 成本、outcome 和稳定错误码，typed 失败回退 FTS-only。
- focused：57 passed；Ruff、mypy、diff check 通过。
- Phase 2 标准模式完整门禁：backend 443 passed，coverage 83.83%，全量 Ruff/mypy；frontend 49 files / 130 tests、TypeScript、build、E2E 11 passed。
- 所有验证均为本地 deterministic fixture/mock/SQLite 或浏览器 E2E，不是真实模型或金融上游验证。
