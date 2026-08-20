# AIOS-035 - Thesis 历史、差异和用户确认流程

## 状态

`[DONE]`

## 优先级

P1

## 用户结果

用户能按版本查看 Thesis 判断、假设、证据和置信度发生了什么变化、为什么变化，并显式确认或保留异议；系统不会替用户接受新观点。

## 允许修改

- `backend/app/database.py`
- `backend/app/routers/thesis.py`
- `backend/app/services/thesis.py`
- `backend/tests/test_database_migrations.py`
- `backend/tests/test_thesis.py`
- `backend/tests/test_thesis_history.py`（新建）
- `frontend/src/pages/Thesis.tsx`
- `frontend/tests/Thesis.test.tsx`
- `docs/API_CONTRACT.md`
- `docs/ROUTER_MAP.md`
- `docs/ARCHITECTURE.md`
- `docs/ai/ARCHITECTURE.md`
- `docs/ai/THESIS_HISTORY_CONTRACT.md`（新建）
- AIOS 长期计划、EXEC_PLAN 与本任务卡

## 禁止修改

- 依赖、其他前端页面、`reference/`、Graphiti/图数据库
- 自动确认版本、自动改变 Thesis current view/claim/confidence
- 覆盖或删除不可变版本、确认历史或 change reason

## 完成标准

- schema v17 新增 owner-scoped append-only version confirmation history，迁移前 `.pre-v17.bak`。
- version history 为每个版本返回相对上一版的字段 diff；confidence diff 明确 old/new 与该版本 `change_reason`。
- 用户可显式记录 `acknowledged` 或 `disputed` 及非空 reason；重复决定保留事件历史，不覆盖旧确认。
- 确认只写确认事件，不修改 Thesis、version、claim、edge、confidence；跨用户读写为零。
- UI 显示版本、差异、证据、change reason 和确认历史，操作有加载/错误态；390px/键盘可用。
- migration/backend/frontend focused tests、Ruff、mypy、TypeScript、build、OpenAPI/docs/diff check 通过；Phase 3 完整门禁通过。

## 验证

```powershell
cd backend
$env:LOCAL_ONLY_MODE='false'
.venv\Scripts\python.exe -m pytest tests/test_database_migrations.py tests/test_thesis.py tests/test_thesis_history.py tests/test_router_contracts.py -q --no-cov
.venv\Scripts\python.exe -m ruff check app/database.py app/routers/thesis.py app/services/thesis.py tests/test_thesis_history.py
.venv\Scripts\python.exe -m mypy app/database.py app/routers/thesis.py app/services/thesis.py
cd ..\frontend
bun run test -- Thesis.test.tsx
bun x tsc -b --pretty false
bun run build
cd ..
git diff --check
```

## 回退

停止应用并恢复 `.pre-v17.bak`。确认事件不用于恢复或自动更新 Thesis，仅是用户复核审计历史。

## 验证声明

本任务使用 deterministic fixture/mock 与本地 SQLite，不构成真实金融上游验证。

## 完成证据

- focused：backend 17 passed；frontend Thesis 4 passed；Ruff、mypy、TypeScript、build、OpenAPI 113/144、diff check 通过。
- Phase 3：backend 461 passed，coverage 83.87%；Ruff 全库与 mypy 115 source files 通过；frontend 49 files / 133 tests、TypeScript、build、E2E 11 passed。
- 并行阶段门禁曾使无关 `AlphaSimulationWorkbench` 超过 5 秒；独占复跑 2 passed，随后前端全量独占复跑 133 passed，未修改该无关测试。
