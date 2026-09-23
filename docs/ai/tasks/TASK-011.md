# TASK-011: 轻量定时任务调度器

## 目标
从 daily_stock_analysis 汲取定时任务思路，在 FinQuant Hub 后端增加轻量定时调度器。

## 设计
- `app/services/scheduler.py` — 基于 asyncio 的简单调度器，不引入 APScheduler
- 启动时通过 FastAPI lifespan 注册
- 首个任务：每日 18:00 运行盘后分析（调用现有 `run_research`）
- 调度器在 lifespan 中 `background_tasks.add_task(scheduler_loop)`

## 允许修改
- `backend/app/main.py` — lifespan 注册
- `backend/app/services/scheduler.py` — 新建
- `backend/app/services/__init__.py` — 导出（如有需要）
- `backend/tests/test_scheduler.py` — 新建测试

## 禁止修改
- 前端文件
- `reference/` 目录
- `docs/ai/` 下的文件

## 验收
```bash
cd backend && .venv\Scripts\python.exe -m pytest tests/test_scheduler.py -v
cd backend && .venv\Scripts\python.exe -m pytest -q
cd backend && .venv\Scripts\python.exe -m ruff check .
```

## 回滚
```bash
git checkout -- backend/app/services/scheduler.py backend/app/main.py
```
