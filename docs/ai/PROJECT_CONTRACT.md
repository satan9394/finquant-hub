# Project Contract — FinQuant Hub

## What

个人量化金融研究系统。FastAPI + React 全栈，本地运行于 Windows 11。

## 工具分工

| 工具 | 角色 | 职责 |
|------|------|------|
| Claude Code (DeepSeek) | 架构师 | 需求分析、架构设计、Harness 治理、任务拆分、Codex 验收 |
| Codex | 实现工程师 | 编码、测试、修复、性能优化 |

## 沟通方式

- 任务通过 `docs/ai/tasks/TASK-NNN.md` 传递
- 架构不变量见 `ARCHITECTURE.md`
- Codex 发现问题写 `docs/ai/DECISIONS.md`
- CLUADE.md (DeepSeek 入口) 和 AGENTS.md (Codex 入口) 只做路由，不重复存规则

## 当前目标

把 FinQuant Hub 收敛为可在 GitHub 开源、由个人用户在自己的电脑上安装和自用的 local-first 研究系统：干净克隆可安装、单命令可启动、默认只绑定本机、数据可持久化/备份/升级、缺少可选模型或上游时明确降级，并有可重复的发布前验证。

当前不以 SaaS、公网部署、社区运营、公开分享、Remix、作者身份、模板市场、多人在线或增长指标为交付目标。这些方向保留为远期设想，不得阻塞 Local OSS v1。
