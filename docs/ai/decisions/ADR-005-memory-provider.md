# ADR-005 - Memory provider 选型

## 状态

`ACCEPTED` — 2026-08-24 由维护者 `@Satanchen` 明确批准保持 Native FTS5。

## 决策问题

FinQuant Hub 是否应把当前 native SQLite FTS5 memory baseline 替换为 Graphiti 或 Mem0？

## 约束与现有证据

- aiosqlite 原始 SQL 是唯一权威业务状态；不得引入 ORM、连接池或独立 DAL。
- AIOS-001 的 13 条 synthetic records / 6 cases 基线上，native FTS5 的 Recall@5 为 1.0000、Precision@5 为 0.9167，owner 隔离与注入执行泄漏为 0。
- AIOS-004 只完成依赖探测：Graphiti 与 Mem0 均未安装且没有 fixture benchmark，状态均为 `NOT_RUN`，指标为 `null`。2026-08-23 经规定代理直接复核，pip index 已可读取 `graphiti-core 0.29.3` 与 `mem0ai 2.0.18`，因此旧包源连接阻塞已解除，但候选执行仍为 0。现有 runner 的 `external_network_lookup` 是历史硬编码字段，并非实时网络探测。
- AIOS-034 已验证项目自有 `thesis-graph-export/v1` 可从 SQLite clear/rebuild，但没有运行 Graphiti。
- 截至 2026-08-23，Graphiti 0.29.3 核心依赖包含 Neo4j、OpenAI 与 PostHog，并另提供 FalkorDB/Neptune 等 extras；Mem0 2.0.18 的 Python 包核心依赖包含 Qdrant client、SQLAlchemy、OpenAI 与 PostHog。Mem0 当前 OSS 配置文档明确 graph memory 不属于 Python/TypeScript OSS。二者都会扩大当前 Local OSS v1 的依赖、配置、外部调用和运维面。

## 候选方案

| 候选 | 适合解决的问题 | 收益 | 成本与风险 | 当前证据 |
|---|---|---|---|---|
| Native SQLite FTS5 | owner-scoped 跨会话文本检索 | 零新增服务；沿用单 SQLite 权威层；已通过本项目固定 fixture | 不提供原生 temporal graph expansion；语义召回能力有限 | 已实测，当前唯一可比较 baseline |
| Graphiti rebuildable read model | claim/evidence 的时间有效期、episode provenance 与图扩展 | 与现有 temporal evidence graph 方向最贴合；可复用已验证 export/rebuild contract | 核心包直接引入 Neo4j/OpenAI/PostHog，实际运行还需 LLM/embedder 与图数据库；隔离、重建、延迟和运维尚未实测 | 0.29.3 可解析但未安装；`NOT_RUN`；仅项目自有 shadow sink 已验证 |
| Mem0 adapter benchmark | 混合、实体、语义与时间记忆检索 | provider 选择多，适合做检索 benchmark | Python 核心包直接引入 Qdrant client/SQLAlchemy/OpenAI/PostHog；当前 OSS 不含 graph memory；与现有领域模型重叠，事实 provenance 需额外约束 | 2.0.18 可解析但未安装；`NOT_RUN`；无本项目 fixture 指标 |

## 接受的决定

**接受 Native FTS5 作为 Local OSS v1 的唯一生产 memory provider，并保持 adapter-ready；暂不接入 Graphiti 或 Mem0。**

理由：

1. 当前只有 native baseline 有本项目可重复、owner-scoped 的正确性证据，无法诚实证明第三方候选带来净收益。
2. FTS5 满足当前本地单用户产品的检索需求，并保持 SQLite 作为唯一权威状态。
3. Graphiti 的领域契合度高于 Mem0；若未来解除 PoC 阻塞，应优先作为可删除、可全量重建的 shadow read model 验证，而不是权威写入层。
4. Mem0 只保留为同一 fixture 上的 adapter benchmark；除非它在隔离、时序、矛盾、provenance 与延迟门禁上显著优于 native，不进入业务主路径。

## 采用门禁

只有同时满足以下条件，才能提出新的生产接入 ADR：

- 在隔离环境安装固定版本，记录许可证、完整依赖和可复现启动方式；不得写入生产数据。
- 显式关闭 Graphiti/Mem0 telemetry，并用网络日志证明除获准的 LLM/embedder/包源外没有额外出站请求。
- 使用 AIOS-001 同一 fixture 实跑，不得模拟候选结果；Graphiti/Mem0 指标不得为 `null`。
- owner 隔离、时间过滤、矛盾/取代关系、prompt injection 不执行全部通过。
- 候选在预先固定的检索质量或 temporal graph 能力上显著优于 native，并记录延迟、资源和恢复成本。
- 所有第三方状态都能从 SQLite 权威数据重建；关闭候选后 native 回答路径不变。
- 维护者明确批准依赖、基础设施和长期维护成本。

## 状态影响

- `AIOS-005`: 标记 `[DONE]`；生产 provider 决策已完成，不引入第三方主路径。
- `AIOS-004`: 保持 `[BLOCKED]`，仅作为未来可选隔离 PoC；不再是当前生产选型的前置条件。
- `AIOS-034`: 保持 `[BLOCKED]`，仅作为未来可选 Graphiti read model；不影响 Native FTS5 主路径。

## 审批记录

- 2026-08-24：维护者 `@Satanchen` 明确回复“批准保持 Native FTS5”。

## 一手来源

- [Graphiti repository](https://github.com/getzep/graphiti)
- [Graphiti 0.29.3 on PyPI](https://pypi.org/project/graphiti-core/0.29.3/)
- [Graphiti MCP deployment options](https://github.com/getzep/graphiti/tree/main/mcp_server/docker)
- [Mem0 repository](https://github.com/mem0ai/mem0)
- [Mem0 2.0.18 on PyPI](https://pypi.org/project/mem0ai/2.0.18/)
- [Mem0 OSS configuration](https://github.com/mem0ai/mem0/blob/main/docs/open-source/configuration.mdx)
- [Mem0 open-source setup](https://github.com/mem0ai/mem0/blob/main/docs/open-source/setup.mdx)
