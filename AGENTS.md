# AGENTS.md — Codex 入口

**角色**：实现工程师。编码、测试、修复、优化。不改架构。

**开始前依次读**：
1. `docs/ai/PROJECT_CONTRACT.md`
2. `docs/ai/ARCHITECTURE.md`
3. `docs/ai/EXEC_PLAN.md` 中标记 `[READY]` 的 **最高序号** 任务
4. 该任务的 TASK 文件

**纪律**：
- 不改 `docs/ai/ARCHITECTURE.md` 中的不变量
- 发现架构问题写 `docs/ai/DECISIONS.md` 并 `@Satanchen`
- 提交前跑 `pytest -q && ruff check . && cd frontend && bun run build`
- 不改 `reference/` 目录

**命令**：
```bash
cd E:\Code_file\Projects\finquant-hub
cd backend && .venv\Scripts\python.exe -m pytest -q
cd backend && .venv\Scripts\python.exe -m ruff check .
cd frontend && bun run build
```
