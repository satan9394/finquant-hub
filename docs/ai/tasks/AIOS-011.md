# AIOS-011 - 行情、基本面与研究报告 provenance adapter

## 状态

`[DONE]`

## 优先级

P0

## 用户结果

为现有行情、基本面和已保存研究报告建立项目内 canonical provenance adapter，并可显式写入 schema v12 evidence foundation；不改变现有 API 返回或在读取行情时隐式写库。

## 允许修改

- `backend/app/services/provenance.py`（新建）
- `backend/tests/test_provenance_service.py`（新建）
- AIOS 长期计划、EXEC_PLAN 与本任务卡

## 禁止修改

- 现有 market/fundamentals/research 生产路径、routers、数据库 schema、依赖、前端
- `reference/`
- 自动把 AI 报告内容标成金融事实

## 完成标准

- 三个 adapter 输出 `CanonicalProvenanceEnvelope v1` 且不修改输入。
- provider/source、as_of、period、currency、adjustment、frequency、quality flags 全量保留；缺失保持 null/UNKNOWN。
- 研究报告只作为 `document_excerpt`/文档引用，明确 AI 内容不是金融事实。
- 显式 persistence 使用现有单连接和 schema v12，保持 user isolation；无隐式业务写入。
- focused tests、Ruff、mypy、diff check 通过。

## 验证

```powershell
cd backend
.venv\Scripts\python.exe -m pytest tests/test_provenance_service.py tests/test_provenance_contract.py -q --no-cov
.venv\Scripts\python.exe -m ruff check app/services/provenance.py tests/test_provenance_service.py
.venv\Scripts\python.exe -m mypy app/services/provenance.py
cd ..
git diff --check
```

## 回退

删除新增 service 与测试并恢复计划 Markdown；本任务验证仅写临时测试数据库，无生产 evidence 数据需要迁移。

## 完成证据

- 行情、基本面与研究报告三个 adapter 均输出通过 Draft 2020-12 schema 的 canonical envelope，输入保持不变。
- quote/fundamental 的 provider、source、as_of、period、currency、adjustment、frequency 和 quality flags 保留；UNKNOWN 持久化为 JSON null。
- 研究报告仅保存版本引用并标记 `AI_GENERATED_CONTENT_NOT_FACT`，未把摘要映射为 observed fact。
- 显式 persistence 在临时 v12 数据库按 user_id 写入；现有读取/API 路径无隐式写入。
- focused 6 passed，Ruff、mypy、diff check 通过；未进行真实上游验证。
