# AIOS-002 - CanonicalProvenanceEnvelope 与 JSON Schema

## 状态

`[DONE]`

## 优先级

P0

## 用户结果

冻结可引用事实和计算结果的 v1 provenance 合同，并证明当前行情快照、基本面单项和回测计算结果可以在不补造未知值、不丢来源口径的前提下映射到同一个 envelope。

## 范围

只新增 JSON Schema、deterministic fixture、测试侧映射器与聚焦测试；不修改生产 API、schema version、数据库或依赖。

### 允许修改

- `docs/ai/schemas/canonical_provenance_envelope.v1.schema.json`（新建）
- `backend/tests/fixtures/aios_provenance_v1.json`（新建）
- `backend/scripts/provenance_contract.py`（新建）
- `backend/tests/test_provenance_contract.py`（新建）
- `docs/ai/AI_NATIVE_CAPABILITY_BASELINE.md`
- `docs/ai/AI_NATIVE_RESEARCH_OS_PLAN.md`
- `docs/ai/tasks/AIOS-002.md`
- `docs/ai/EXEC_PLAN.md`

### 禁止修改

- `backend/app/`
- `frontend/`
- `reference/`
- 数据库、依赖与锁文件

## 必须产出

1. Draft 2020-12 JSON Schema，冻结字段、枚举、null 语义和附加字段策略。
2. 三类现有合同 fixture：行情 observed fact、基本面 observed fact、回测 computed result。
3. 失败 fixture 覆盖缺来源、UNKNOWN 被写成 0、computed 缺 inputs/formula/method version、非法枚举和额外字段。
4. 测试侧 adapter 不修改输入，完整保留 provider/source、as-of、period、currency、adjustment、frequency、quality flags、公式和输入引用。
5. 明确 `AI_INFERENCE` 和 `USER_HYPOTHESIS` 不属于此 envelope 的 `kind`，不得被映射为事实。

## 完成标准

- schema 自身通过 validator 检查。
- 三个有效 fixture 均通过；全部无效 fixture 按预期拒绝。
- UNKNOWN 使用 `value=null` 与 `data_status=UNKNOWN`，不能以 0 或空字符串代替。
- computed result 必须有稳定 input evidence IDs、formula 和 method_version。
- 未修改生产代码、数据库、依赖、前端或 `reference/`。
- 完成后 AIOS-003 成为唯一 `[READY]`。

## 验证

```powershell
cd backend
.venv\Scripts\python.exe scripts/provenance_contract.py
.venv\Scripts\python.exe -m pytest tests/test_provenance_contract.py -q --no-cov
.venv\Scripts\python.exe -m ruff check scripts/provenance_contract.py tests/test_provenance_contract.py
cd ..
git diff --check
git status --short
```

这是 deterministic contract validation，不是真实上游验证。

## 完成证据

- `CanonicalProvenanceEnvelope v1` Draft 2020-12 schema 自检通过。
- 行情、基本面 UNKNOWN、回测计算结果 3 个 fixture 映射通过；7 个非法合同全部拒绝。
- focused pytest 3 passed；相关 Ruff 与 `git diff --check` 通过。
- 未修改生产代码、数据库、依赖、前端或 `reference/`；未执行真实上游验证。

## 回退

删除本任务新增 schema、fixture、测试侧脚本和测试，恢复允许 Markdown 文件的行级修改。不得覆盖其他工作树修改。
