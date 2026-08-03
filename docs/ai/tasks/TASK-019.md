# TASK-019: mypy 类型债收敛（分阶段）

## 目标
将全仓 mypy strict 错误从 ~629 项逐步收敛，最终 CI 可跑 `mypy app` 且零错误。

## 背景
当前 `pyproject.toml` 的 mypy 配置只守核心 5 文件（agent/tools、orchestrator/runtime、orchestrator/team、services/context、research_orch、swarm_orch），但 `mypy app` 全仓有 629 errors / 68 文件。

## 允许修改
- 任何 `backend/app/**/*.py` 的**类型注解**（不改运行时行为）
- 必要时调整 `pyproject.toml` mypy 配置
- 不新增测试（类型修复本身不改行为，靠现有测试兜底）

## 实现思路（分 5 批，每批一个提交点）
1. **批 1 — 纯注解缺漏**：缺 return 类型 / 参数类型标注（`no-untyped-def` 类，通常占最多）
2. **批 2 — import 与名字解析**：`name-defined` / `import-untyped` / 错误 import
3. **批 3 — Optional/None 处理**：`possibly-undefined` / 需 `None` 检查的分支
4. **批 4 — 泛型与容器**：`arg-type` / `return-value` 类型不匹配
5. **批 5 — 收尾 + 扩大 files 范围**：剩余零散错误；确认后把 `pyproject.toml` 的 files 逐步扩大到全仓

## 纪律
- **禁止用 `# type: ignore` 掩盖错误**（除非有明确理由并注释）
- **禁止改运行时逻辑**——只加类型注解 / 修正明显错误类型标注
- 每批完成后跑 `mypy app` 确认数量下降，且 `pytest -q` 全绿
- 遇到"改类型会对齐但很复杂"的文件，允许整文件标 `# mypy: ignore-errors` 但必须列出在批注中，后续单独处理

## 验证
```bash
cd backend && .venv\Scripts\python.exe -m mypy app 2>&1 | tail -1
cd backend && .venv\Scripts\python.exe -m pytest -q
cd backend && .venv\Scripts\python.exe -m ruff check .
```

目标：每批至少降 120 项错误。

## 回滚
```bash
git checkout -- backend/app/
```

## 关键判断
- 这是纯技术债清理，优先级低于功能但值得推进
- 若某批涉及大量文件且风险高，拆小批次
- 最终目标：mypy 配置从核心 5 文件扩到全仓，CI 可断言
