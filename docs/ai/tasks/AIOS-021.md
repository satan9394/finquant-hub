# AIOS-021 - 显式保存和 background candidate 抽取

## 状态

`[DONE]`

## 优先级

P0

## 用户结果

用户可以显式保存自己的假设、偏好和工作流状态；完成研究后可在默认关闭的后台开关下生成待确认候选，模型内容永远不能自动成为事实或 confirmed 记忆。

## 允许修改

- `backend/app/config.py`
- `backend/app/main.py`
- `backend/app/routers/research.py`
- `backend/app/services/investment_memory.py`
- `backend/app/services/memory_capture.py`（新建）
- `backend/tests/test_memory_capture.py`（新建）
- `docs/API_CONTRACT.md`
- `docs/ROUTER_MAP.md`
- AIOS 长期计划、EXEC_PLAN 与本任务卡

## 禁止修改

- schema、前端、依赖、现有 chat FTS 检索、`reference/`
- LLM 二次抽取、第三方 memory/graph、自动 confirmed/FACT 写入

## 完成标准

- owner-scoped 显式保存入口只写用户声明的类型；FACT 必须继续受 evidence 外键约束。
- `MEMORY_CANDIDATE_EXTRACTION_ENABLED` 默认关闭；关闭时不调度、不写入。
- 开启后，仅从已保存 completed research report 的有限字段生成 `candidate + AI_INFERENCE + ai` 记录，并带报告 source id 与未核验质量标志。
- 后台写入幂等、失败不改变研究报告完成结果、关闭 lifespan 前可 drain。
- focused service/API/开关测试、Ruff、mypy、diff check 通过。

## 验证

```powershell
cd backend
.venv\Scripts\python.exe -m pytest tests/test_memory_capture.py -q --no-cov
.venv\Scripts\python.exe -m ruff check app/config.py app/main.py app/routers/research.py app/services/investment_memory.py app/services/memory_capture.py tests/test_memory_capture.py
.venv\Scripts\python.exe -m mypy app/config.py app/main.py app/routers/research.py app/services/investment_memory.py app/services/memory_capture.py
cd ..
git diff --check
```

## 回退

关闭 `MEMORY_CANDIDATE_EXTRACTION_ENABLED` 并移除显式入口/调度钩子；既有 candidate 记录保留给用户审阅，不得静默删除。

## 完成证据

- `POST /api/research/memory` 仅以当前用户身份显式写 confirmed memory，FACT 无 evidence 返回 422。
- 自动候选开关默认关闭；开启时只映射 report summary/risk 为 `candidate + AI_INFERENCE + ai`，带 source id、未核验标志且幂等。
- 后台任务在 lifespan 关闭前 drain，异常仅记录日志而不改变研究完成结果。
- focused 4 passed；Ruff、mypy、OpenAPI 108/137、diff check 通过。
