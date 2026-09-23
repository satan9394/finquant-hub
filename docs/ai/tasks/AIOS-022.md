# AIOS-022 - subject/time/provenance-aware retrieval

## 状态

`[DONE]`

## 优先级

P0

## 用户结果

typed memory 可以按当前用户、对象、workspace、有效时间、状态和 provenance 边界检索，并在同一 synthetic fixture 上证明候选检索不劣于既有 FTS baseline。

## 允许修改

- `backend/app/services/investment_memory.py`
- `backend/scripts/memory_typed_benchmark.py`（新建）
- `backend/tests/test_typed_memory_retrieval.py`（新建）
- `docs/ai/AIOS_TYPED_MEMORY_BENCHMARK.md`（新建）
- AIOS 长期计划、EXEC_PLAN 与本任务卡

## 禁止修改

- schema、routers、前端、依赖、现有 chat/research FTS 主路径、`reference/`
- embedding/LLM rerank、第三方 memory/graph、伪造真实用户或金融数据

## 完成标准

- 检索强制 `user_id`，支持 subject/workspace/valid-at/status/provenance 过滤。
- 结果解释暴露类型、状态、时间和 provenance/质量，不把 candidate 当 confirmed fact。
- 同一 `aios-memory-fixture-v1` 对比 FTS：typed Recall@5 与 Precision@5 均不得低于 baseline。
- temporal/workspace/provenance synthetic cases accuracy >= 95%，owner leakage 为 0，本机 P95 <= 250 ms。
- focused tests、benchmark runner、Ruff、mypy、diff check 通过。

## 验证

```powershell
cd backend
.venv\Scripts\python.exe scripts/memory_typed_benchmark.py --repetitions 5
.venv\Scripts\python.exe -m pytest tests/test_typed_memory_retrieval.py -q --no-cov
.venv\Scripts\python.exe -m ruff check app/services/investment_memory.py scripts/memory_typed_benchmark.py tests/test_typed_memory_retrieval.py
.venv\Scripts\python.exe -m mypy app/services/investment_memory.py scripts/memory_typed_benchmark.py
cd ..
git diff --check
```

## 回退

移除 typed retrieval/benchmark；不修改或删除 v13 memory records，现有 FTS 主路径保持不变。

## 完成证据

- owner/subject/workspace/valid-at/status/provenance hard filters 与 status/time/provenance/trust explanation 已实现。
- 同一 synthetic fixture：typed Recall@5 1.0000、Precision@5 1.0000；FTS 分别为 1.0000/0.9167。
- semantic cases 6/6、owner leakage 0、30 次本地样本 P95 0.6133 ms；不代表生产或真实上游验证。
- runner PASS；focused 3 passed；Ruff、mypy、diff check 通过。
