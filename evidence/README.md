# Evidence Index

> 归档日期：**2026-09-24**
> 本目录存放**历史验证证据**。归档保留，**不参与构建、不被 import、不跑进 CI**。
> 迁移原则：只移动 / 改名 / 加索引，**未改动任何证据正文内容**（逐字原样搬入）。

## 目录结构

```
evidence/
├── missions/
│   ├── mission-01/     ← workflow/mission-01/{RUN_STATE.md, recon-report.md, evidence/*}
│   ├── mission-02/     ← workflow/mission-02/{RUN_STATE.md, evidence/*}
│   └── mission-03/     ← 项目根 RUN_STATE.md（原件逐字归档，见下方说明）
├── recovery/           ← 项目根 DSH_RECOVERY_CHECKPOINT.md / DSH_RECOVERY_REPORT.md
└── README.md           ← 本文件
```

## missions/mission-01

来源路径：`workflow/mission-01/`（原控制面目录，2026-09-24 迁入）

| 文件 | 原路径 | 说明 |
|---|---|---|
| `RUN_STATE.md` | `workflow/mission-01/RUN_STATE.md` | Mission 1 冻结状态 |
| `recon-report.md` | `workflow/mission-01/recon-report.md` | 侦察报告 |
| `W1-recovery-docs.evidence.md` | `workflow/mission-01/evidence/` | W1 卡证据 |
| `W2-baseline.evidence.md` | `workflow/mission-01/evidence/` | W2 卡证据 |
| `W2-baseline/`（10 个门禁日志） | `workflow/mission-01/evidence/W2-baseline/` | gate0 -git-status、gate1-ruff、gate2-pytest（nocov/official，各含 stdout+stderr）、gate3-vitest、gate4-build 的原始输出 |

## missions/mission-02

来源路径：`workflow/mission-02/`（原控制面目录，2026-09-24 迁入）

| 文件 | 原路径 | 说明 |
|---|---|---|
| `RUN_STATE.md` | `workflow/mission-02/RUN_STATE.md` | Mission 2 冻结状态 |
| `W3-swarm-replay-evaluation.md` | `workflow/mission-02/evidence/` | W3 只读评估结论（swarmApi 历史回放，结论「有条件做」） |

## missions/mission-03

来源路径：**项目根 `RUN_STATE.md`**（Mission 3，用户 2026-09-13「授权。允许执行。」）

| 文件 | 原路径 | 说明 |
|---|---|---|
| `RUN_STATE.md` | 项目根 `RUN_STATE.md` | Mission 3 状态（DoD D1–D5 全达成，W1–W4 结清） |

**为何要归档这个文件**：原件的控制面曾按项目惯例经 `.git/info/exclude` 本地排除，
从未纳入版本库 ⇒ 一旦被覆盖，git 无法恢复。2026-09-24 迁移中 `runstate.js init`
按设计在项目根重写了 `RUN_STATE.md`（生成视图），原件被覆盖；因该文件在覆盖前已被完整读取，
此处按原文逐字重建归档，**字节数与原件一致（12384 字节，LF 换行，无 BOM）**。
使命级状态属有价值档案，故由本目录纳入版本库保存。

## recovery/

来源路径：**项目根**（2026-09-24 迁入）

| 文件 | 原路径 | 说明 |
|---|---|---|
| `DSH_RECOVERY_CHECKPOINT.md` | 项目根 | DSH 恢复检查点 |
| `DSH_RECOVERY_REPORT.md` | 项目根 | DSH 恢复报告 |

## 相关归档（不在本目录下）

| 内容 | 位置 | 说明 |
|---|---|---|
| Mission 1 / 2 任务卡 | `tasks/_missions/mission-01/` `tasks/_missions/mission-02/` | 卡片本体归 `tasks/`，仅证据归本目录 |
| 笔记 | `memory/notes/` | 由 `notes/` 迁入 |

## 跟踪注意事项（.log）

本目录下的 `.log` 文件（如 `evidence/missions/mission-01/W2-baseline/gate*.log`）
与项目根 `.gitignore` 的全局规则 `*.log` 冲突，**默认不会被 git 跟踪**。
新增这类证据时需显式强制跟踪（未改动任何既有 ignore 规则）：

```bash
git add -f evidence/
```

## 状态文件的处置（2026-09-24 补丁）

`runstate.js` 是 **bounded 模式专用**的状态控制器，其 `validate()` 硬校验
`mode === 'bounded'`；因此 `mode: "standard"` 的项目**本就不该有运行时状态文件**
（v1.0.0 的 fail-open 语义是「未管理 = 放行」）。

据此已撤销项目根的运行时状态：

| 项 | 处置 |
|---|---|
| `.agent-state/run-state.json` | 归档为 `evidence/missions/mission-03/run-state.json`（档案态，`mode` 保持 `standard`，不参与 check） |
| `.agent-state/` 目录 | 清空后进回收站 |
| 根 `RUN_STATE.md` | Mission 3 已完成，不需要运行时视图；原件已安全归档于本目录，根上副本进回收站 |
| `.gitignore` 的 `.agent-state/` 规则 | **保留**（规范要求的追加项，不因目录删除而撤销） |
