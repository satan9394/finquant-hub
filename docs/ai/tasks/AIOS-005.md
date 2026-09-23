# AIOS-005 - Memory provider 选型 ADR

## 状态

`[DONE]`

## 优先级

P0

## 用户结果

基于同一 owner-scoped fixture 比较 native FTS5、Graphiti read model 与 Mem0 adapter，并由维护者明确决定是否扩大生产依赖和运维面。

## 允许修改

- `docs/ai/decisions/ADR-005-memory-provider.md`
- `docs/ai/AI_NATIVE_RESEARCH_OS_PLAN.md`
- `docs/ai/EXEC_PLAN.md`
- 本任务卡

## 禁止修改

- 后端业务代码、schema、依赖与锁文件
- frontend、`reference/`、生产数据
- 未经批准安装或启动 Graphiti、Mem0、Neo4j、FalkorDB 或其他外部服务

## 完成标准

- ADR 比较 native FTS5、Graphiti 与 Mem0，并给出可审计推荐和采用门禁。
- AIOS-004 的候选 benchmark 必须从 `NOT_RUN` 变为真实 fixture 结果，或维护者明确接受“保持 native、暂缓第三方”的决定。
- 维护者 `@Satanchen` 明确 review/approve。

## 当前证据

- 决策包已准备：[`ADR-005-memory-provider.md`](../decisions/ADR-005-memory-provider.md)。
- 当前推荐为 Native FTS5 继续作为唯一生产 provider；Graphiti/Mem0 不接业务主路径。
- Graphiti 与 Mem0 均无本项目 fixture 实跑指标，不能声称候选优于 baseline。
- 2026-08-23 metadata-only 复核：直接 pip index 经 `127.0.0.1:7897` 可读取 `graphiti-core 0.29.3` 与 `mem0ai 2.0.18`，但本地 import/pip show 均确认未安装；AIOS-004 runner 仍因历史硬编码字段报告网络 `UPSTREAM_ERROR`，该字段不是实时探测。包源可用不等于候选 benchmark 已完成。

## 完成证据

- 2026-08-24，维护者 `@Satanchen` 明确回复“批准保持 Native FTS5”。
- `ADR-005-memory-provider.md` 已标记 `ACCEPTED`：Native FTS5 是 Local OSS v1 唯一生产 memory provider，并保持 adapter-ready。
- Graphiti/Mem0 暂不安装、不接入；AIOS-004/034 保持 `[BLOCKED]`，仅作为未来可选隔离 PoC，不影响本任务完成。
