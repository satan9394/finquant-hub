# AIOS-000 - AI 原生研究 OS 基线与领域合同冻结

## 状态

`[DONE]`

## 优先级

P0

## 用户结果

在任何新的记忆、图谱或数据基础设施进入业务代码前，形成一份可复核的当前数据流与差距基线，并冻结 v1 的 evidence、memory、Thesis 和 workflow 术语，使后续 Codex 任务不会重复建设或错误绑定第三方框架。

## 前置阅读

1. `docs/ai/PROJECT_CONTRACT.md`
2. `docs/ai/ARCHITECTURE.md`
3. `docs/ARCHITECTURE.md`
4. `docs/ai/AI_NATIVE_RESEARCH_OS_PLAN.md`
5. `docs/ai/PRODUCT_CAPABILITY_MATRIX.md`
6. `backend/app/database.py`
7. `backend/app/services/memory.py`
8. `backend/app/services/thesis.py`
9. `backend/app/services/research_jobs.py`
10. `backend/app/services/scheduler.py`

## 范围

本任务只允许文档、schema/API 静态审计和测试清单设计，不修改业务代码、不新增依赖、不迁移数据库。

### 允许修改

- `docs/ai/AI_NATIVE_RESEARCH_OS_PLAN.md`
- `docs/ai/AI_NATIVE_CAPABILITY_BASELINE.md`（新建）
- `docs/ai/tasks/AIOS-000.md`
- `docs/ai/EXEC_PLAN.md`
- `docs/ai/DECISIONS.md`（只在发现真实架构冲突时追加并 `@Satanchen`）

### 禁止修改

- `backend/`
- `frontend/`
- `reference/`
- 数据库文件与用户数据
- 依赖锁文件

## 必须产出

1. 从输入到输出追踪当前 chat、research、workspace、Thesis、scheduler 的完整数据流。
2. 列出每张相关表、字段、写入者、读取者、用户隔离和生命周期。
3. 把当前能力映射到以下 v1 对象：
   - `CanonicalProvenanceEnvelope`
   - `MemoryRecord`
   - `ThesisArtifact`
   - `EvidenceEdge`
   - `WorkflowState`
4. 明确 `REUSE`、`EXTEND`、`MISSING`、`BLOCKED`，不能把 UI 缺口误报成后端缺口。
5. 列出 AIOS-001 fixture 所需的最小场景和预期答案，但本任务不实现 runner。
6. 记录所有与架构不变量冲突的建议；不得自行改变不变量。

## 完成标准

- 每个结论都有文件和行号证据。
- 23 个 router、schema v11、35 张逻辑表与当前权威文档一致。
- memory FTS、research workspace、Thesis、alerts/notifications、scheduled jobs 的边界没有遗漏。
- 没有业务代码、依赖、数据库或 `reference/` 修改。
- 本任务标记 `[DONE]` 后，`AIOS-001` 成为唯一 `[READY]`。

## 验证

```powershell
rg -n "^#|REUSE|EXTEND|MISSING|BLOCKED|CanonicalProvenanceEnvelope|MemoryRecord|ThesisArtifact|EvidenceEdge|WorkflowState" docs/ai/AI_NATIVE_CAPABILITY_BASELINE.md
git diff --check
git status --short
```

文档任务不运行 pytest/build；最终报告必须明确这是静态审计，不得将其写成应用测试通过。

## 完成证据

- 基线：`docs/ai/AI_NATIVE_CAPABILITY_BASELINE.md`
- 静态事实：23 个 APIRouter、105 个 `/api/*` 路径、134 个 HTTP 操作、schema v11、35 张逻辑表。
- 范围：只修改本任务允许的 Markdown 文件；未修改业务代码、依赖、数据库或 `reference/`。
- 验证：任务卡规定的 `rg`、`git diff --check`、`git status --short`；本任务按约定未运行 pytest/build/E2E/真实上游验证。

## 回退

只删除本任务新建的 baseline 文档，并恢复本任务对三个允许 Markdown 文件的行级修改。不得使用 `git reset --hard` 或覆盖用户其他未提交修改。
