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

## 项目 Harness 指针（工作前必读）

本项目嵌入了 harness-engineering（v4.11.0）。开始工作前，先读下列文件了解项目治理信息：

- `.harness/manifest.json` → 嵌入清单（装了什么组件、验证结果）
- `STATE.json` → 规则与事故记忆（同错 ≥2 次 / 返工率 ≥50% 的信号源）
- `HANDOFF.md` → 当前目标 / 完成标准 / 验证命令 / 未决问题（跨会话接续权威）
- `notes/` → 决策记录（Agent Notes 四态：为什么这么做、放弃了什么）
- `docs/ARCHITECTURE.md` → 架构地图（模块职责 / 架构不变量 / 依赖层级）

读取优先级：`HANDOFF.md` 与 `.harness/manifest.json` 最先读，`STATE.json` 与 `notes/` 按需读。
文件不存在说明该组件未嵌入（未跑 `bootstrap.py --init`），跳过即可。

**harness 常用命令**：
```bash
python scripts/audit.py .                                        # 审计 harness 健康
python scripts/note-lifecycle.py new --class architecture --title "..."   # 记决策提案
python scripts/note-lifecycle.py verify                          # 决策门禁检查
python scripts/record-error.py --init                            # 初始化事故记忆
python scripts/handoff-log.py --append "做了什么" --verify "结果" # 收尾追加变更日志
```
