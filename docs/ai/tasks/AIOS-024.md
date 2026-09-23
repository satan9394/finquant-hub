# AIOS-024 - 用户记忆管理与导出

## 状态

`[DONE]`

## 优先级

P0

## 用户结果

用户可在现有 Knowledge 页面查看自己的 typed memory，确认候选、以 supersession 保留历史地编辑、作废、soft-delete，并导出自己的完整状态记录。

## 允许修改

- `backend/app/routers/research.py`
- `backend/app/services/investment_memory.py`
- `backend/tests/test_memory_management.py`（新建）
- `frontend/src/pages/Knowledge.tsx`
- `frontend/src/components/MemoryManager.tsx`（新建）
- `frontend/src/services/researchApi.ts`
- `frontend/tests/MemoryManager.test.tsx`（新建）
- `frontend/tests/Knowledge.test.tsx`
- `docs/API_CONTRACT.md`
- `docs/ROUTER_MAP.md`
- AIOS 长期计划、EXEC_PLAN 与本任务卡

## 禁止修改

- schema、依赖、现有 FTS 主路径、其他产品页、`reference/`
- hard delete、跨用户读写、隐式确认 AI 内容、导出凭据/会话/隐藏推理

## 完成标准

- list/action/delete/export 全部强制当前用户；跨 owner 返回 404/空结果。
- confirm 只由显式用户动作触发；edit 创建 superseding record 并保留旧记录。
- invalidate 和 delete 的状态/范围清晰；delete 仅 soft-delete 单条 memory。
- export 只含 typed memory allowlist 和状态历史，不含其他表敏感数据。
- Knowledge 页面可执行上述动作并显示类型、状态、来源/质量与 UNKNOWN。
- focused backend/frontend tests、Ruff、mypy、TypeScript/build、diff check 通过。

## 验证

```powershell
cd backend
.venv\Scripts\python.exe -m pytest tests/test_memory_management.py -q --no-cov
.venv\Scripts\python.exe -m ruff check app/routers/research.py app/services/investment_memory.py tests/test_memory_management.py
.venv\Scripts\python.exe -m mypy app/routers/research.py app/services/investment_memory.py
cd ..\frontend
bun x vitest run tests/MemoryManager.test.tsx tests/Knowledge.test.tsx
bun x tsc --noEmit
bun run build
cd ..
git diff --check
```

## 回退

移除管理 API 与 Knowledge 入口；已确认、取代、作废或 soft-deleted 的记录保留，不做破坏性回滚。

## 完成证据

- owner-scoped list/action/delete/export API；edit 把非 FACT 用户修订明确分类为 USER_* 并以 supersession 保留旧记录，FACT 禁止改写。
- delete 返回 `memory_record_only + soft_delete`；导出包含当前用户完整状态历史且使用 allowlist。
- Knowledge 的“研究记忆”支持确认、编辑新版本、作废、删除、查看删除项和 JSON 导出，UNKNOWN 来源/时间可见。
- backend focused 6 passed、Ruff/mypy；frontend focused 4 passed、TypeScript/build；OpenAPI 110/141、diff check 通过。
