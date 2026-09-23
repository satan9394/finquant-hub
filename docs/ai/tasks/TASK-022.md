# TASK-022: 数据隔离迁移（全表 user_id）

## 目标
将所有用户数据表加 `user_id` 列并强制归属过滤，实现完全数据隔离。

## 依据
`docs/ai/AUTH_DESIGN.md` 第 4 节。

## 允许修改
- `backend/app/database.py` — 迁移函数（schema_version 9→10）：各表加 user_id 列 + 索引；存量数据归第一个 admin 用户
- 所有相关 router / service — 读改写强制带 `user_id=?`
- 对应测试

## 需加 user_id 的表
- portfolios / positions / portfolio_trades
- research_reports / research_workspaces / research_events
- thesis / thesis_claims
- alert_rules / alert_triggers
- notifications
- conversations / messages / discussion_rooms
- market_reviews
- scheduled_research_jobs
- model_configs（用户可配置自己的模型）

## 实现要点
1. 迁移：ALTER TABLE 加列（SQLite 需逐表 ALTER ADD COLUMN，或重建表）；存量行 user_id=首个 admin 的 id
2. **不新增 DAL 层**——保持「无独立 DAL」不变量：在各 router 直接带 user_id 过滤
3. 统一写法：`WHERE ... AND user_id=?`，参数从 `get_current_user` 注入
4. 写操作创建时带 user_id；读操作必须按当前用户过滤
5. 关键：**所有现有查询都要改**，漏一个就是跨用户数据泄露（公网严重）
6. 测试：用两个用户各建数据，断言互相不可见

## 验证
```bash
cd backend && .venv\Scripts\python.exe -m pytest -q
cd backend && .venv\Scripts\python.exe -m ruff check .
```
新增跨用户隔离测试（user A 看不到 user B 的组合/报告/论文等）。

## 回滚
```bash
git checkout -- backend/app/database.py backend/app/routers/ backend/app/services/
```

## 关键判断
- 这是安全敏感任务，**遍历所有读写 SQL**，用 grep 排查遗漏
- 迁移前备份数据库（迁移函数内做防御性备份）
