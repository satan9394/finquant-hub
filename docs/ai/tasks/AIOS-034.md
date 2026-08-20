# AIOS-034 - 可选 Graphiti read model 同步与重建

## 状态

`[BLOCKED]`

## 优先级

P1

## 用户结果

在不接入业务主路径的前提下，验证 authoritative SQLite 的 Thesis/evidence temporal graph 能导出、清空并完整重建；Graphiti 不可用时明确保留 `NOT_RUN`，不模拟第三方结果。

## 允许修改

- `backend/scripts/thesis_graph_read_model.py`（新建）
- `backend/tests/test_thesis_graph_read_model.py`（新建）
- `docs/ai/THESIS_GRAPH_READ_MODEL_POC.md`（新建）
- `docs/ai/DECISIONS.md`（仅追加架构建议与 `@Satanchen`）
- AIOS 长期计划、EXEC_PLAN 与本任务卡

## 禁止修改

- `backend/app/`、schema、依赖/锁文件、frontend、`reference/`
- 安装或启动 Graphiti、Neo4j、FalkorDB、Redis 或其他外部服务
- 生产数据写入、业务主路径接线、模型注入
- 模拟 Graphiti 指标或把内存 harness 描述成真实 Graphiti 验证

## 完成标准

- 定义稳定、owner-scoped 的 Thesis/claim/evidence node 与 temporal claim-evidence relation 导出合同。
- deterministic fixture 验证 active/superseded edge、validity、status event episode、owner 隔离。
- shadow sink 清空后可从 SQLite 全量重建；SQLite 源计数、export 计数与 sink 计数一致；重复 rebuild 幂等。
- Graphiti 包不可用时结果为 `NOT_RUN`，所有框架指标为 `null`，并写明解除阻塞条件。
- 不新增生产依赖/服务；focused pytest、Ruff、mypy、diff check 通过。

## 验证

```powershell
cd backend
.venv\Scripts\python.exe -m pytest tests/test_thesis_graph_read_model.py -q --no-cov
.venv\Scripts\python.exe -m ruff check scripts/thesis_graph_read_model.py tests/test_thesis_graph_read_model.py
.venv\Scripts\python.exe -m mypy scripts/thesis_graph_read_model.py
cd ..
git diff --check
```

## 回退

删除脚本、测试和 PoC 文档即可；没有生产 schema、依赖、服务或数据需要迁回。

## 验证声明

内存 shadow sink 只验证项目自有 export/rebuild contract，不是 Graphiti、图查询质量、真实性能或真实金融上游验证。

## 已完成证据（2026-08-12）

- `thesis-graph-export/v1` owner-scoped node/relation/episode 合同已实现；temporal validity、superseded 状态和 canonical metadata 保留。
- deterministic fixture 的 source/export/sink 五类计数一致；clear 为零、连续两次 rebuild 幂等，另一用户 evidence 泄漏为零。
- focused pytest 2 passed，Ruff、mypy、diff check 通过；无 app/schema/dependency/frontend/reference 修改。

## 阻塞证据

- `graphiti_core` 未安装，AIOS-004 仍为 `BLOCKED`，没有真实候选 benchmark。
- 未获准安装候选依赖或启动 Neo4j/FalkorDB/embedding 服务；Graphiti fixture execution 为 0，所有框架指标为 `null`。
- 因此项目自有 rebuild contract 已验证，但“Graphiti read model 同步”不能诚实标记 DONE；已写 pending ADR 并 `@Satanchen`，业务主路径保持 SQLite-only。
