# AIOS-003 - MemoryProvider 与 MemoryCandidate 端口

## 状态

`[DONE]`

## 优先级

P0

## 用户结果

建立项目自有的记忆候选与 provider 端口，让当前 FTS5 成为 native 实现，同时保持 chat/research 的查询、隔离、不信任渲染和字符预算行为不变，为后续 shadow provider 留出边界。

## 允许修改

- `backend/app/services/memory.py`
- `backend/app/routers/chat.py`
- `backend/app/services/research_orch.py`
- `backend/tests/test_memory.py`
- `backend/tests/test_research_orch.py`
- `backend/tests/test_memory_provider.py`（新建）
- AIOS 长期计划、EXEC_PLAN 与本任务卡

## 禁止修改

- database schema、迁移、依赖、前端、`reference/`
- Graphiti/Mem0 接入

## 完成标准

- 定义 `MemoryCandidate`、`MemoryProvider` 和 native FTS5 provider。
- chat/research 使用同一 native provider；旧函数兼容现有调用。
- user_id 硬过滤、exclude conversation、limit、2400 字符和不信任边界不变。
- focused tests、Ruff、mypy 通过；完成后 AIOS-004 唯一 READY。

## 验证

```powershell
cd backend
.venv\Scripts\python.exe -m pytest tests/test_memory.py tests/test_memory_provider.py tests/test_research_orch.py -q --no-cov
.venv\Scripts\python.exe -m ruff check app/services/memory.py app/routers/chat.py app/services/research_orch.py tests/test_memory_provider.py
.venv\Scripts\python.exe -m mypy app/services/memory.py app/routers/chat.py app/services/research_orch.py
cd ..
git diff --check
```

## 回退

恢复三个生产文件的端口接线并删除新增测试；不修改数据库或用户数据。

## 完成证据

- `MemoryCandidate` TypedDict、`MemoryProvider` Protocol、`NativeFTSMemoryProvider` 和模块级 native provider 已建立。
- chat/research 已接线同一 provider；旧搜索/渲染函数保持兼容。
- focused pytest 12 passed；相关 Ruff 与 mypy 通过；未迁移数据库或引入依赖。
