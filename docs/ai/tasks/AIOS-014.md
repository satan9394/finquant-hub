# AIOS-014 - Evidence audit API 与导出清单 v2

## 状态

`[DONE]`

## 优先级

P0

## 用户结果

让当前用户可审计 canonical evidence 数量、类型、质量和 lineage 完整性，并导出可复现清单；导出不包含凭据、会话、隐藏推理或原始文档正文。

## 允许修改

- `backend/app/services/evidence_audit.py`（新建）
- `backend/app/routers/research.py`
- `backend/tests/test_evidence_audit.py`（新建）
- `docs/API_CONTRACT.md`
- `docs/ROUTER_MAP.md`
- `docs/ai/ARCHITECTURE.md`
- AIOS 长期计划、EXEC_PLAN 与本任务卡

## 禁止修改

- database schema、依赖、前端、其他 routers/services、`reference/`
- 凭据、session token、隐藏推理或原始敏感文档正文导出

## 完成标准

- audit 只查询当前 user_id，报告 kind/status 计数、悬挂引用和 JSON/ref mismatch。
- manifest v2 使用字段 allowlist；document value 始终脱敏为引用，其他用户记录不可见。
- 两个 GET endpoint 复用现有 research router，不新增 APIRouter。
- focused tests、Ruff、mypy、OpenAPI 静态核对和 diff check 通过。

## 验证

```powershell
cd backend
.venv\Scripts\python.exe -m pytest tests/test_evidence_audit.py -q --no-cov
.venv\Scripts\python.exe -m ruff check app/services/evidence_audit.py app/routers/research.py tests/test_evidence_audit.py
.venv\Scripts\python.exe -m mypy app/services/evidence_audit.py app/routers/research.py
cd ..
git diff --check
```

## 回退

删除 service/测试，移除 research router 两个只读 endpoint，并恢复文档状态；不修改或删除任何 evidence 数据。

## 完成证据

- owner-scoped audit 报告 kind/status、悬挂引用和 JSON/ref mismatch；manifest v2 仅导出 allowlist 字段。
- document value 脱敏为 document reference；跨用户 evidence、凭据、session、隐藏推理不进入导出。
- focused 2 passed、Ruff、mypy；运行时 OpenAPI 107 paths / 136 operations。
- Phase 1 退出门禁：标准模式后端 419 passed / coverage 83.61%；Ruff 全量、mypy 109 files；前端 127 tests、TypeScript/build；E2E 11 passed；diff check 通过。
- 本地模式直接跑认证测试会按设计进入 local owner 分支；标准模式门禁使用 `LOCAL_ONLY_MODE=false`，未修改环境文件。
