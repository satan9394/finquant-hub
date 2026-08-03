# TASK-018: 投资论文追踪

## 目标
支持记录投资论点（thesis），并检测论点随时间的漂移（仓位/价格/基本面变化 vs 原论点假设）。

## 允许修改
- `backend/app/database.py` — 新增 `thesis` / `thesis_claims` 表（schema_version 递增）
- `backend/app/services/thesis.py`（新建）
- `backend/app/routers/thesis.py`（新建）
- `frontend/src/pages/` — 论文追踪页（新建）
- `frontend/src/App.tsx` — 侧栏加菜单项
- 对应测试

## 表结构建议
```sql
CREATE TABLE IF NOT EXISTS thesis (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker TEXT NOT NULL,
    title TEXT NOT NULL,
    thesis TEXT NOT NULL,           -- 核心论点
    assumptions TEXT DEFAULT '[]',  -- JSON 关键假设列表
    status TEXT DEFAULT 'open',     -- open / closed / invalidated
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS thesis_claims (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    thesis_id INTEGER NOT NULL,
    claim TEXT NOT NULL,
    status TEXT DEFAULT 'holding',  -- holding / confirmed / violated / unknown
    checked_at TEXT,
    note TEXT DEFAULT ''
);
```

## 实现思路
1. 从已完成的投研报告一键「存为论文」：`POST /api/thesis/from-report/{report_id}` 提取 ticker + 核心论点 + 假设
2. 手动创建/编辑论文
3. 论点漂移检测：论文的 claims 与最新行情/报告比对，定期重新核验（可接 scheduler）
4. 前端：论文列表 + 详情 + claims 状态看板
5. 侧栏「论文」入口

## 验证
```bash
cd backend && .venv\Scripts\python.exe -m pytest -q
cd backend && .venv\Scripts\python.exe -m ruff check .
cd frontend && bun run build
```

## 回滚
```bash
git checkout -- backend/app/database.py frontend/src/App.tsx
```

## 关键判断
- schema_version 6/7 → 递增并写迁移函数
- 漂移检测不做实时，周期重核验即可（复用 scheduler 思路）
