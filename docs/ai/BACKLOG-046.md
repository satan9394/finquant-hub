# BACKLOG-046 — 文档收尾：HANDOFF 顶部过时项勾清 + EXEC_PLAN 历史 BLOCKED 卡片如实复核

> 状态：`[DONE]` ｜ 优先级：P3（文档卫生）｜ 创建：2026-09-13 ｜ 完成：2026-09-13 ｜ 执行：DSH Worker

## 背景

HANDOFF.md 顶部「未完成（发布前必须做）」三个勾选项经指挥实测（2026-09-13）**均已实际完成，属文档未跟新**：

- `LICENSE` 文件：`Test-Path LICENSE` → **True**（已存在）
- `docs/PRD.md` 3.2 节 TECH_STACK 引用：grep 命中 **L151**
- `docs/PRODUCT_MAP.md` 单行技术栈引用：grep 命中 **L23**

另外 EXEC_PLAN.md 有下列历史 BLOCKED/PARKED 卡片（来自 8 月 AIOS 阶段），其中 Graphiti/Mem0 相关有 ADR-005 既定结论（2026-08-24 批准 **Native FTS5** 为生产 memory 方案），需要在文档层面如实标注，避免后续会话误读为"仍待决策"：

- `[BLOCKED] AIOS-004: Graphiti 与 Mem0 fixture-only shadow PoC`
- `[BLOCKED] AIOS-034: 可选 Graphiti read model 同步与重建`
- `[PARKED] AIOS-071: 公开只读 Thesis/Strategy 卡片`
- 以及 EXEC_PLAN L770 提到的 `REUSE/EXTEND/MISSING/BLOCKED` 映射、L1029 的隐私/许可/法律决定

## 目标（只改文档，零代码）

1. **HANDOFF.md**：把顶部「未完成（发布前必须做）」三项（LICENSE / PRD 3.2 / PRODUCT_MAP）勾选为已完成（`[x]`）+ 一行日期核实说明；项 4「Graphiti/Mem0 选型」在「不阻塞发布（长期）」段补一句 ADR-005 已定 Native FTS5 的事实口径（可在该行内注明，不删除历史记录）。
2. **EXEC_PLAN.md**：对 AIOS-004 / AIOS-034 / AIOS-071 三张历史卡，在各自标题或证据行**追加一行如实标注**：`> 注（2026-09-13 复核）：ADR-005 已于 2026-08-24 采纳 Native FTS5 为生产 memory 方案，本卡保持 [BLOCKED]/[PARKED] 历史状态，不再视为待办。`——**不删除卡片、不改状态标签本身**（保持历史可追溯），只加注释。
3. 若有其他被 046 波及的文档（如 README 里仍写"Graphiti/Mem0 待定"），一并加注释或改事实口径。

## 允许修改
- `HANDOFF.md`、`docs/ai/EXEC_PLAN.md`、`README.md`（仅当确有过时口径）
- 证据：`docs/ai/tasks/BACKLOG-046.md`、`docs/ai/BACKLOG-046.md`、`docs/ai/EXEC_PLAN.md`、`task/CHANGELOG.md`、`HANDOFF.md`

## 禁止修改
- 任何 `backend/**`、`frontend/**` 代码；`docs/ai/tasks/*.md`（除本卡新建证据外）的历史证据内容**不改**（保留原貌，只追加注释）
- 不加依赖、不改依赖锁；不删文件（回收站铁律亦不适用，本卡零删除）
- 不"升级" BLOCKED→DONE 之类状态变化——只追加如实注释（历史决策已由 ADR-005 覆盖，但卡片状态由当时会话确立，保持原样）

## 完成标准
1. HANDOFF 顶部三项勾选 `[x]` + 日期核实行；Graphiti 行补 ADR-005 已定口径
2. EXEC_PLAN 三张历史卡（AIOS-004/034/071）各追加一行如实注释（含日期、ADR-005 结论、状态保持说明）
3. `git diff --check` 通过；删除 0；不 commit

## 参考
- `HANDOFF.md` L26-35（未完成/长期段）、L83-84/L93-98（docs 引用路径与未决问题）
- `docs/ai/EXEC_PLAN.md` L795（AIOS-004）、L911（AIOS-034）、L1033（AIOS-071）、L804（ADR-005 批准记录）
- 指挥实测：LICENSE=True；PRD L151、PRODUCT_MAP L23 已有 TECH_STACK 引用

## 完成证据模板
```
- HANDOFF 顶部三项如何勾选与核实说明（含上次实测命令）
- EXEC_PLAN 三张卡各自追加的注释原文（文件:行）
- README 是否需动（无则说明）
- git diff --check、删除 0、未 commit
```