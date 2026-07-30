# Acceptance Criteria — FinQuant Hub

## 通用标准

1. `pytest -q` 全部通过且不降级
2. `ruff check .` 零错误
3. `cd frontend && bun run build` 零错误
4. 不改 `reference/` 目录

## 架构约束验收

5. 不引入 SQLAlchemy 或其他 ORM
6. 不引入 WebSocket 依赖
7. 不添加 auth/authz 逻辑
8. 不新增 axios 实例
9. 不改 `docs/ai/ARCHITECTURE.md` 中的不变量

## 任务级验收

每个 TASK-NNN.md 文件内包含其自身的验收标准。
