# AIOS-043 - 复盘工作流：新证据 -> 判断变化 -> 用户确认

## 状态

`[DONE]`

## 优先级

P1

## 用户结果

用户能从一条持久化的复盘项中看到新证据、受影响的 Thesis 判断、变化理由和待确认动作；页面刷新后仍能恢复，确认历史不被覆盖，检查失败不伪装成无变化。

## 允许修改

- `backend/app/database.py`
- `backend/app/services/thesis.py`
- `backend/app/services/thesis_drift.py`
- `backend/app/routers/thesis.py`
- 直接对应的 backend focused tests
- `frontend/src/pages/Thesis.tsx`
- `frontend/tests/Thesis.test.tsx`
- `docs/API_CONTRACT.md`
- `docs/ROUTER_MAP.md`
- `docs/ARCHITECTURE.md`
- `docs/ai/ARCHITECTURE.md`
- `docs/ai/THESIS_REVIEW_WORKFLOW_CONTRACT.md`（新建）
- AIOS 长期计划、EXEC_PLAN 与本任务卡

## 禁止修改

- 依赖、其他前端页面、`reference/`、外部 workflow/queue/database
- 自动替用户确认、自动改写 Thesis 文本或 confidence
- 把 AI 推论或无 canonical provenance 的值升级为事实
- 把 fixture/mock/schema 验证描述为真实金融上游验证

## 完成标准

- review 以 owner-scoped 持久化状态串联 evidence、claim/version diff 和用户确认；刷新可恢复。
- 新证据只通过确定性 drift 规则产生待复核建议；用户明确操作前不改判断。
- 确认、驳回和失败事件 append-only；重复提交幂等；owner isolation 和 UNKNOWN/UPSTREAM_ERROR 完整。
- UI 覆盖 loading、empty、error、partial/UNKNOWN、pending 和 resolved，并支持 390px 与键盘操作。
- backend/frontend focused tests、Ruff、mypy、TypeScript、build、OpenAPI/docs/diff check 通过。

## 验证声明

fixture/mock 验证不构成真实金融、LLM 或通知上游运行。

## 完成证据

- schema v20/pre-v20 backup 新增 `thesis_review_items` 与 append-only `thesis_review_events`，37 张 owner 表仍强制 `user_id`。
- `thesis-drift/v1` 状态变化以 `COMPUTED_RESULT`、rule/version、old/new status、baseline/current 值及 canonical evidence IDs 保存；相同变化 content key 去重。
- 用户 `acknowledged`/`disputed` 显式决定幂等追加，只更新 review projection，不改写 Thesis、version 或 confidence。核验异常创建 `failed`/`UPSTREAM_ERROR`，已有 pending 项不丢失。
- UI 展示 loading/empty/load error、pending/resolved、PARTIAL/UNKNOWN/UPSTREAM_ERROR、证据和事件；AntD 响应式列与原生按钮/表单支持 390px 与键盘。
- backend focused `69 passed`；Ruff 通过；mypy 4 source files 通过；frontend focused `6 passed`；TypeScript/build 通过（仅既有 chunk-size 警告）。
- 运行时契约：schema v20 / 47 张逻辑表 / 37 张 owner 表；OpenAPI `119 paths / 150 operations`。
- 所有功能验证为本地 deterministic fixture/mock，不是真实金融或 LLM 上游验证。
