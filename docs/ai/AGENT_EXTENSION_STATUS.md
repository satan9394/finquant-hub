# Agent Extension Plane：当前状态与演进记录

## 记录元数据

- **记录日期**：2026-08-24
- **状态**：`RECORD`（现状与方向记录，不代表本轮已实现）
- **范围**：Skill、插件 Agent、MCP 和通用 Agent harness 的兼容性评估
- **当前产品定位**：证据优先、可审计的 AI 投研 Agent，而不是通用 coding Agent harness

## 当前已选技术栈

- **模型协议**：自研异步 `LLMClient`，使用 OpenAI Chat Completions 兼容协议；默认模型为 DeepSeek V4 Flash。
- **工具运行时**：`BaseTool` + `ToolResult` + 单例 `ToolRegistry`，当前有 13 个本地投研工具，通过 function calling 进入工具循环。
- **Agent 编排**：`TeamAgent` / `TeamDefinition` YAML 声明，使用项目自有异步 DAG runtime；研究 Agent 独立并行，team-lead 单向汇总。
- **外部能力**：MCP 工具可按启用状态动态加入 `ToolRegistry`；当前属于 HTTP MCP 连接能力，不是完整插件生命周期系统。
- **事件传输**：SSE，公开 Agent 启动、工具调用、完成和错误事件。
- **状态与记忆**：SQLite + aiosqlite 原生 SQL；Native FTS5 是 Local OSS v1 唯一生产 memory provider。

权威实现说明见 [`docs/ARCHITECTURE.md`](../ARCHITECTURE.md) 的 Agent 工具、SSE 和 LLM 抽象章节。

## 能力现状

| 能力 | 当前状态 | 判断 |
|---|---|---|
| Skill | 没有一等 `SKILL.md` loader、自动触发或命名空间 | 可以增加，尚未形成稳定标准 |
| 本地工具插件 | `BaseTool` 可注册，工具 schema 和执行结果已有统一合同 | 已具备内核，缺少第三方插件 ABI |
| MCP 插件 | 已支持持久化 HTTP MCP server、连接、启停和工具开关 | 已有互操作入口，缺少完整信任/权限/分发层 |
| 插件 Agent | YAML Agent + DAG 已能表达角色、工具和依赖 | 可以包化，但目前只能作为项目内配置 |
| 插件生命周期 | 没有 manifest、版本、依赖、签名、安装/升级/卸载流程 | 当前未实现 |
| 插件安全 | 有用户隔离和业务工具边界；没有通用插件沙箱和 deny-by-default policy | 不能直接运行不可信第三方代码 |
| 插件生态 | 没有 registry、marketplace 或开发者 SDK | 当前未实现 |

## 对外部 Agent 生态的判断

- DeepSeek Harness 已把模型、工具、技能、会话、沙箱、存储、循环、调度和 UI 都设计成可组合插件，但仍处于 developer preview，插件 API 仍会演进。
- Codex 的插件模型主要是 Skills、MCP server 和可选 UI 的组合。
- Claude Code 的插件可以组合 Skills、Agents、Hooks、MCP、LSP，并通过 marketplace 分发。
- Pi 的核心保持极简，通过 skills、extensions 和 packages 让社区自行组合能力。
- LangChain/LangGraph 更偏通用 Agent 和工作流 runtime，提供图执行、持久化、流式、人机协作和中间件。
- OpenCode 更偏模型无关的 coding harness，强调自定义 Agent、MCP 工具和细粒度权限。

这些项目的共同趋势是：**插件不是单一工具，而是 Skill、Agent、Tool/MCP、Hook、权限和可选 UI 的可版本化组合**。

## FinQuant Hub 的相对优势

当前项目不应以“通用 Agent 能力更多”作为竞争点，而应保持以下垂直优势：

1. **证据优先**：LLM 不直接充当金融数据库；关键事实从结构化工具取得，并保留 provider、as-of、period、quality 和 provenance。
2. **确定性编排**：DAG 单向传递上下文，不允许无边界 Agent 互聊，便于审计、限成本和复现。
3. **金融语义内建**：行情、基本面、研究报告、回测、风险、证据和 UNKNOWN 语义属于核心合同，而不是插件作者自行约定。
4. **本地可运行**：SQLite 权威状态、Native FTS5 和少量依赖适合 Local OSS v1，避免为了通用生态引入不必要的图数据库、向量数据库或云端 runtime。
5. **MCP 兼容入口已存在**：未来可以把外部生态接入为受控能力，而不必替换现有投研核心。

## 当前短板

- 没有稳定的第三方插件 ABI 和开发者 SDK。
- 没有统一的 Skill 包格式、资源加载、触发和隔离策略。
- 没有 Agent 插件的模型策略、工具 allowlist、数据 scope、预算和输出 schema 合同。
- 没有插件签名、来源、版本兼容和供应链审核。
- 没有可恢复的完整 Agent trajectory、replay 和插件级审计视图。
- 没有 marketplace；不能把项目内 YAML 配置误称为插件生态。

## 建议的演进方向

保留当前 `LLMClient + ToolRegistry + DAGRuntime + SSE + SQLite` 核心，不为了插件能力直接切换 LangGraph。新增一个独立的 Agent Extension Plane：

```text
Agent Extension Plane
├── skills/       SKILL.md、references、scripts、templates
├── agents/       prompt、model、tool allowlist、output schema
├── tools/        本地 BaseTool 扩展
├── mcp/          MCP server 配置与连接声明
├── workflows/    DAG / research pipeline
├── hooks/        tool 前后置、审批、审计
├── permissions/  文件、网络、数据、工具权限
└── manifest.json 版本、依赖、兼容范围、来源和签名
```

插件 Agent 至少应声明：

- `api_version`、`name`、`version`
- skills、agents、tools、MCP、hooks 入口
- 可使用的模型和最大调用预算
- 工具 allowlist、数据 scope 和网络权限
- 输入/输出 schema 及 provenance 要求
- 依赖、兼容范围、来源和内容摘要/hash

实施顺序建议为：

1. 先支持 Agent Skills 兼容目录和渐进式加载。
2. 把现有 YAML Agent 定义包化，并加入命名空间。
3. 统一本地工具和 MCP 工具的权限、审计和错误合同。
4. 增加 manifest、安装/启停/升级、信任等级和本地 registry。
5. 在安全和验证机制稳定后，再考虑公开 marketplace。

## 明确不采用的方向

- 不为了“插件数量”把 LangGraph、LangChain、CrewAI 或 AutoGen 强行加入主路径。
- 不把 MCP 当作完整插件安全模型；宿主仍须负责授权、数据边界和用户同意。
- 不允许第三方插件绕过 owner isolation、SQLite 权威层、provenance 和 UNKNOWN 规则。
- 不把未经审核的 DSH、Claude Code、Codex、Pi 或 OpenCode 插件直接当作 FinQuant 生产插件执行。

## 外部参考

- [DeepSeek Harness：Everything is a plugin](https://deepseek.com/harness/en/)
- [OpenAI/Codex plugin architecture](https://developers.openai.com/plugins/concepts/plugins)
- [Claude Code extension overview](https://code.claude.com/docs/en/features-overview)
- [Claude Code plugins](https://code.claude.com/docs/en/plugins)
- [LangChain agents](https://docs.langchain.com/oss/python/langchain/agents)
- [Pi coding agent package](https://www.npmjs.com/package/%40mariozechner/pi-coding-agent)
- [OpenCode agents and permissions](https://opencode.ai/docs/agents/)
- [MCP architecture](https://modelcontextprotocol.io/specification/2025-06-18/architecture)
