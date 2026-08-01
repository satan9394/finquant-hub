# TASK-015: LLM 用量统计持久化

## 背景

`llm_client.py` 每次调用已收集 `total_tokens`，但**未持久化**。数据库无 `llm_usage` 表，用户无法查看 token 消耗。

## 目标

新建 `llm_usage` 表 + 用量记录服务 + 用量查询 API + 前端用量页。

## 允许修改
- `backend/app/database.py` — 新增 `llm_usage` 表（schema_version 递增）
- `backend/app/services/llm_client.py` — 每次调用后写用量
- `backend/app/routers/` — 用量查询端点
- `frontend/src/pages/` — 用量展示页（可选，低优先）
- 对应测试

## 表结构建议
```sql
CREATE TABLE IF NOT EXISTS llm_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_type TEXT NOT NULL,      -- chat / research / swarm / discussion
    conversation_id INTEGER,
    model_name TEXT,
    prompt_tokens INTEGER DEFAULT 0,
    completion_tokens INTEGER DEFAULT 0,
    total_tokens INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
);
```

## 实现思路
1. `llm_client` 的 4 个调用方法（chat / chat_stream / chat_with_tools / chat_with_tools_loop）在返回前写一条用量记录
2. 幂等：不阻塞主流程，写入失败只记日志不抛异常
3. API：`GET /api/usage` 返回按日聚合的 token 消耗
4. 迁移：schema_version 6 → 7，加迁移函数

## 验证
```bash
cd backend && .venv\Scripts\python.exe -m pytest -q
cd backend && .venv\Scripts\python.exe -m ruff check .
```

## 回滚
```bash
git checkout -- backend/app/database.py backend/app/services/llm_client.py
```
