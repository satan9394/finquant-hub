# HARNESS 快速上手 —— 装完先读这份

> 由 harness-engineering v4.11.0 `bootstrap.py --init` 生成。
> 你的项目已嵌入 harness（Agent 治理框架）。这份文档回答一个核心问题：**装完之后，我每天/每轮开发该怎么用它？**

## harness 是什么（30 秒）

它管 agent 五件事：**指令**（告诉 agent 做什么）、**约束**（拦住做错事）、**反馈**（检查做对没）、**记忆**（不重复犯错）、**编排**（多 agent 协作）。装进项目后，它让开发 agent 少犯错、守规矩、记得住教训。

## 项目里装了什么

| 组件 | 位置 | 干什么 |
|---|---|---|
| 指令文件 | `CLAUDE.md` / `AGENTS.md` | agent 每次会话自动读的开发规则（含"项目 Harness 指针"） |
| 审计脚本 | `scripts/audit.py` | 检查 harness 是否健康（五组件 + 数据/隐私） |
| 决策记录 | `notes/` | 记录"为什么这么做、放弃了什么"（四态生命周期） |
| 事故记忆 | `STATE.json` | 记录 agent 犯过的错，沉淀成规则 |
| 交接档案 | `HANDOFF.md` | 跨会话接续：当前目标/完成标准/未决问题/变更日志 |
| hooks | `.claude/settings.json` | 自动拦截违规命令 + 会话结束自动记变更 |
| MCP server | `scripts/harness-mcp.py` | 把项目知识暴露给支持 MCP 的 agent |

## 一句话驱动（最快上手）

- 说 **"嵌入 harness"** → agent 自动跑 `bootstrap.py --init`（默认单人模式，不提问）
- 说 **"执行 harness"** 或 **"跑一下 harness"** → agent 自动跑 `scripts/harness-check.py`，输出汇总体检报告（指令/记忆/交接/执行/整体五层状态 + 建议）

## 日常三件事（每轮开发闭环）

1. **干活前**：读 `HANDOFF.md`（当前目标与未决问题）+ `docs/ARCHITECTURE.md`（架构地图）。
2. **干活中**：遇到 agent 反复犯的错 → 记事故；做重要决策 → 记决策；拿不准健康度 → 跑审计。
3. **收尾时**：把本轮"动了什么、验证结果"追加进 `HANDOFF.md` 变更日志，下个会话无缝接续。

## 命令速查

```bash
python scripts/harness-check.py .                                 # 汇总体检（一句话"执行 harness"的落点）
python scripts/audit.py .                                          # 审计 harness 健康（0=健康，1=有问题）
python scripts/note-lifecycle.py new --class architecture --title "..."   # 记一条决策提案（proposed）
python scripts/note-lifecycle.py status notes/proposed/... --implemented  # 决策落地
python scripts/note-lifecycle.py verify                            # 决策门禁检查（提交前跑）
python scripts/record-error.py --init                              # 第一次使用时初始化事故记忆
python scripts/handoff-log.py --append "做了什么" --verify "验证结果"      # 收尾追加变更日志
python scripts/skill-router.py --check-wiring .claude/skills --config .harness/config.json  # skill 接线校验
```

## 第一个任务怎么走（5 步）

1. 读 `HANDOFF.md` 找当前目标，没有就先填（一句话目标 + 完成标准 + 验证命令）。
2. 跑一次 `python scripts/audit.py .`，把 NOT-OK 项当作起步问题处理。
3. 正常开发。第一个真实问题（agent 犯错/返工）用 `record-error.py` 记进 `STATE.json`。
4. 做了架构/流程决策，用 `note-lifecycle.py` 记一条（proposed 起步）。
5. 收尾：`handoff-log.py --append` 追加变更日志 → 下次会话先读 HANDOFF.md 即可续接。

## 常见问题

- **skill 调不到？** `.claude/skills/` 只被 Claude Code 原生发现；DSH 会话要复制到项目 `.dsh/skills/`（或直接跑上面命令速查里的脚本，脚本跨运行时都有效）。
- **规则该写哪？** 先写进 CLAUDE.md/AGENTS.md 当建议；后果不可逆或触发频繁再升级成 hooks/CI 约束。
- **忘记用了？** 只要收尾时记得追加 HANDOFF.md 变更日志，下个会话就能接上——harness 是"长出来的"，从第一件事开始即可。
