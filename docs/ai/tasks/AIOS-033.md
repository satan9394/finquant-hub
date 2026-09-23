# AIOS-033 - deterministic + evidence-aware drift engine

## 状态

`[DONE]`

## 优先级

P0

## 用户结果

Thesis 漂移核验能逐条说明规则版本、输入证据、公式/阈值、结果和 UNKNOWN 原因；报告文本相似度不再被用来决定事实状态。

## 允许修改

- `backend/app/services/thesis.py`
- `backend/app/services/thesis_drift.py`（新建）
- `backend/app/routers/thesis.py`（仅保持/描述现有 check API）
- `backend/tests/test_thesis_drift.py`（新建）
- `backend/tests/test_thesis_evidence.py`
- `backend/tests/test_api.py`（仅补充既有 Thesis drift fixture/contract）
- `frontend/src/pages/Thesis.tsx`
- `frontend/tests/Thesis.test.tsx`
- `docs/API_CONTRACT.md`
- `docs/ROUTER_MAP.md`
- `docs/ARCHITECTURE.md`
- `docs/ai/ARCHITECTURE.md`
- `docs/ai/THESIS_DRIFT_CONTRACT.md`（新建）
- AIOS 长期计划、EXEC_PLAN 与本任务卡

## 禁止修改

- 数据库 schema、依赖、其他前端页面、`reference/`
- LLM 判定、文本相似度决定状态、无 provenance 快照冒充事实
- 自动修改用户 manual claim、Thesis 判断、假设或 confidence

## 完成标准

- 漂移规则为独立纯函数/版本化 registry，当前规则至少覆盖 price、position、fundamental、report。
- 每条结果包含 `rule_id`、`rule_version`、`status`、`reason`、`formula`、阈值/方法参数、baseline/current 值和 evidence IDs。
- price/fundamental 只有 baseline 与 current 均有 canonical evidence 才能产生非 UNKNOWN；缺任一侧 evidence 返回 UNKNOWN。
- position 在尚无 canonical adapter 时保持 UNKNOWN；report 只报告 document evidence/人工复核需求，文本相似度不得产生 holding/violated。
- 只自动更新系统 claim；manual claim、Thesis judgment/assumptions/confidence 不变。AIOS-031 的非 UNKNOWN event/evidence 数据库门禁继续成立。
- UI 显示规则版本、阈值/公式、输入证据和 UNKNOWN，不前端重算。
- focused backend/frontend tests、Ruff、mypy、TypeScript、build、API/OpenAPI contract 与 diff check 通过。

## 验证

```powershell
cd backend
$env:LOCAL_ONLY_MODE='false'
.venv\Scripts\python.exe -m pytest tests/test_thesis.py tests/test_thesis_evidence.py tests/test_thesis_drift.py tests/test_router_contracts.py -q --no-cov
.venv\Scripts\python.exe -m ruff check app/services/thesis.py app/services/thesis_drift.py app/routers/thesis.py tests/test_thesis_drift.py
.venv\Scripts\python.exe -m mypy app/services/thesis.py app/services/thesis_drift.py app/routers/thesis.py
cd ..\frontend
bun run test -- Thesis.test.tsx
bun x tsc -b --pretty false
bun run build
cd ..
git diff --check
```

## 回退

恢复 AIOS-031 的 inline check 逻辑和 UI 展示即可；本任务无 schema 迁移。历史 check payload 保留版本化字段，旧 payload 仍可读取。

## 验证声明

本任务使用 deterministic fixture/mock 与本地 SQLite；不构成真实金融上游验证。

## 完成记录（2026-08-12）

- 新增纯函数 `thesis-drift/v1` registry，price/fundamental/report/position 四条规则输出 rule/version、formula/parameters、双侧值和 evidence IDs。
- 创建 Thesis 时只持久化可验证的 baseline quote/fundamental canonical evidence；核验要求 baseline/current 双侧 evidence，缺任一侧保持 UNKNOWN。
- report 固定要求 document evidence 与 manual review，删除文本相似度状态决定；position 在无 canonical adapter 时 UNKNOWN。
- automatic 非 UNKNOWN edge/event 继续引用当次 current evidence；UNKNOWN 不创建伪 supporting edge；manual claim、判断、假设、版本和 confidence 不变。
- Thesis UI 显示引擎/规则版本、公式、参数和双侧证据，前端不重算。
- backend focused 14 passed、Ruff/mypy；frontend 3 passed、TypeScript/build；OpenAPI 保持 112/143、diff check 通过。均为 fixture/mock/SQLite，不是真实金融上游验证。
