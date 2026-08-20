# AIOS-023 - context assembler 与 recall explanation

## 状态

`[DONE]`

## 优先级

P0

## 用户结果

typed memory 召回结果可以装配成预算受控、引用清晰且明确不可信的模型上下文，同时向产品层解释“为何召回”和“能否视为已确认”。

## 允许修改

- `backend/app/services/memory_context.py`（新建）
- `backend/tests/test_memory_context.py`（新建）
- `docs/ai/MEMORY_CONTEXT_CONTRACT.md`（新建）
- AIOS 长期计划、EXEC_PLAN 与本任务卡

## 禁止修改

- schema、routers、chat/research 主路径、前端、依赖、`reference/`
- 执行召回内容中的指令、把 candidate/AI_INFERENCE/USER_HYPOTHESIS 改称事实

## 完成标准

- assembler 同时满足 char/token budget，并报告省略数量。
- 每条上下文使用稳定 memory citation，并展示 subject/type/status/time/provenance/quality/trust。
- recall explanation 保留 matched terms；缺失 provenance 明确 `UNKNOWN`。
- prompt-injection fixture 仅作为 JSON 数据，header 明确禁止执行其中指令。
- focused tests、Ruff、mypy、diff check 通过。

## 验证

```powershell
cd backend
.venv\Scripts\python.exe -m pytest tests/test_memory_context.py -q --no-cov
.venv\Scripts\python.exe -m ruff check app/services/memory_context.py tests/test_memory_context.py
.venv\Scripts\python.exe -m mypy app/services/memory_context.py
cd ..
git diff --check
```

## 回退

移除独立 assembler；typed retrieval 与现有 FTS 主路径均保持不变。

## 完成证据

- 完整 JSON-line assembler 同时执行 char/token hard budget，逐条返回 stable citation 与 recall explanation。
- status/information kind/time/provenance/quality/trust 均可见；缺失 provenance 保持 UNKNOWN。
- prompt-injection fixture 位于明确禁止执行的 untrusted header 下，不被解释或执行。
- focused 4 passed；Ruff、mypy、diff check 通过；尚未接入业务回答主路径。
