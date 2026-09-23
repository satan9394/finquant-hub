# Thesis Temporal Graph Read Model PoC

> Date: 2026-08-12  
> Scope: deterministic fixture + local SQLite + disposable in-memory sink  
> Graphiti execution: `NOT_RUN`

## Conclusion

FinQuant 自有的 `thesis-graph-export/v1` 已证明可以从 authoritative SQLite 导出 owner-scoped Thesis、claim、canonical evidence、temporal claim-evidence relation 和 claim status episode。内存 shadow sink 清空后能够全量重建，源/export/sink 五类计数一致，重复 rebuild 幂等。

这只证明 adapter contract 和可重建性，不证明 Graphiti 的写入、查询、时序推理、性能或运维可行。`graphiti_core` 仍未安装，也没有获准启动 Neo4j/FalkorDB，因此 Graphiti 指标全部为 `null`，业务主路径没有变化。

## Export contract

- stable node IDs：`thesis:{id}`、`claim:{id}`、`evidence:{evidence_id}`；
- stable relation ID：`claim_evidence:{id}`；
- stable episode ID：`claim_status:{id}`；
- relation 保留 `stance`、`valid_from`、`valid_to`、`observed_at`、`created_source` 和 active/superseded/invalidated 状态；
- evidence 只导出 canonical metadata、质量和许可字段，不导出用户凭据、会话、隐藏推理或聊天正文；
- 每次 export 使用 SQL `user_id` hard filter。

## Deterministic evidence

fixture 包含 1 Thesis、1 claim、1 canonical evidence、1 superseded temporal relation 和 1 deterministic status episode，另有另一用户 evidence。结果：

- source/export/sink counts：`thesis=1`、`claim=1`、`evidence=1`、`claim_evidence=1`、`claim_status_event=1`；
- `valid_from=2026-06-30`、`valid_to=2026-08-01` 和 `status=superseded` 完整保留；
- 另一用户 evidence 不出现在 export；
- clear 后所有 sink counts 为 0；两次 rebuild 均恢复完全相同计数。

## Candidate boundary

`graphiti_probe()` 只探测包，不执行候选。当前状态为 `NOT_RUN`，fixture cases 为 0，node/edge/rebuild/query latency 均为 `null`，production writes 为 0，answer path 为 false。

解除阻塞需要：可用且固定版本的 `graphiti-core`、获准的可丢弃图存储/embedding 配置、AIOS-004 fixture benchmark、数据清理验证，以及正式 ADR。通过前 SQLite 始终是唯一权威状态。

## Rollback

删除 `backend/scripts/thesis_graph_read_model.py`、对应测试和本报告即可；没有 schema、依赖、服务、生产配置或业务数据需要迁回。
