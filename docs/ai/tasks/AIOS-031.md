# AIOS-031 - claim-evidence edges 与时间有效期

## 状态

`[DONE]`

## 优先级

P0

## 用户结果

Thesis 的每条 claim 能看到哪些证据支持或反对、证据在什么时间有效，以及状态为何变化；自动变化必须可回链，证据不足保持 UNKNOWN。

## 允许修改

- `backend/app/database.py`
- `backend/app/routers/thesis.py`
- `backend/app/services/thesis.py`
- `backend/app/services/provenance.py`
- `backend/tests/test_database_migrations.py`
- `backend/tests/test_thesis.py`
- `backend/tests/test_thesis_evidence.py`（新建）
- `backend/tests/test_api.py`（仅补齐既有 Thesis deterministic fixture 的显式 provenance）
- `docs/API_CONTRACT.md`
- `docs/ROUTER_MAP.md`
- `docs/ARCHITECTURE.md`
- `docs/ai/ARCHITECTURE.md`
- `docs/ai/THESIS_EVIDENCE_CONTRACT.md`（新建）
- AIOS 长期计划、EXEC_PLAN 与本任务卡

## 禁止修改

- frontend、依赖、`reference/`
- Graphiti/图数据库、ORM/DAL
- 用文本相似度或无来源快照冒充 canonical evidence
- 删除历史边、状态事件或跨用户引用

## 完成标准

- schema v16 新增 owner-scoped claim-evidence edges 与 claim status events，迁移前 `.pre-v16.bak`。
- edge 明确 stance、valid_from、valid_to、observed_at、创建来源；同一用户 claim/evidence 外键强制成立。
- 失效或替代使用时间/状态字段保留历史，不物理删除旧边。
- manual 与 automatic 状态事件区分 actor/trigger；automatic 事件必须引用当时有效的 canonical evidence，否则状态为 `unknown` 并保留原因。
- 旧 Thesis/claim API 无损兼容；跨用户读写和引用泄漏为零。
- focused migration/thesis/evidence tests、Ruff、mypy、API/OpenAPI contract 与 diff check 通过。

## 验证

```powershell
cd backend
$env:LOCAL_ONLY_MODE='false'
.venv\Scripts\python.exe -m pytest tests/test_database_migrations.py tests/test_thesis.py tests/test_thesis_evidence.py tests/test_router_contracts.py -q --no-cov
.venv\Scripts\python.exe -m ruff check app/database.py app/routers/thesis.py app/services/thesis.py app/services/provenance.py tests/test_thesis_evidence.py
.venv\Scripts\python.exe -m mypy app/database.py app/routers/thesis.py app/services/thesis.py app/services/provenance.py
cd ..
git diff --check
```

## 回退

停止应用后恢复 `.pre-v16.bak`；历史 edge/status event 不作为金融事实源，canonical evidence 仍是唯一事实来源。

## 验证声明

本任务只使用 deterministic fixture 与本地 SQLite，不构成真实金融上游验证。

## 完成记录（2026-08-12）

- schema v16 新增 owner-scoped `thesis_claim_evidence_edges` 与 append-only `thesis_claim_status_events`，迁移前创建 `.pre-v16.bak`。
- manual/automatic edge 分源替换并保留 superseded 时间历史；新建、人工更新和 deterministic check 均记录 actor/trigger/reason。
- deterministic 非 `UNKNOWN` 状态由数据库约束强制引用同用户 canonical evidence；缺失 provenance 时降级 `UNKNOWN`，不会用持仓快照或报告文本相似度冒充事实变化。
- 旧 Thesis/claim current view 与端点兼容；OpenAPI 仍为 111 paths / 142 operations。
- focused pytest 17 passed；额外既有 Thesis API 回归合计 5 passed；Ruff、mypy、diff check 通过。全部为 deterministic fixture/mock/SQLite，不是真实金融上游验证。
