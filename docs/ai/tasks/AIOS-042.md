# AIOS-042 - scheduled research 结果与 memory/evidence 串联

## 状态

`[DONE]`

## 优先级

P1

## 用户结果

定时研究完成后，用户能从任务、报告、记忆、证据和通知之间完整回链；重试不重复写入关键对象，失败明确保留且不产生虚构结论。

## 允许修改

- `backend/app/database.py`
- `backend/app/services/scheduler.py`
- `backend/app/services/research_jobs.py`
- `backend/app/services/memory_capture.py`
- `backend/app/services/notifications.py`
- `backend/app/routers/settings.py`
- 直接对应的 backend focused tests
- `frontend/src/pages/Settings.tsx`
- `frontend/tests/ProfessionalPreferences.test.tsx`
- `docs/API_CONTRACT.md`
- `docs/ROUTER_MAP.md`
- `docs/ARCHITECTURE.md`
- `docs/ai/ARCHITECTURE.md`
- `docs/ai/SCHEDULED_RESEARCH_LINKAGE_CONTRACT.md`（新建）
- AIOS 长期计划、EXEC_PLAN 与本任务卡

## 禁止修改

- 依赖、其他前端页面、`reference/`、外部 queue/cache/database
- 编造研究结果、在失败时写 completed memory/evidence、泄露跨用户对象
- 将 mock/schema 测试描述为真实 scheduled upstream 运行

## 完成标准

- 每次运行有稳定 idempotency key，并可回链 job、report、memory/evidence、notification。
- 重试不重复创建关键完成对象；失败保留错误与重试关系，不写虚构完成产物。
- owner isolation、状态时间线、通知 URL 与质量状态完整。
- backend/frontend focused tests、Ruff、mypy、TypeScript、build、OpenAPI/docs/diff check 通过。

## 验证声明

fixture/mock 验证不构成真实金融或 LLM 上游运行。

## 完成证据

- schema v19 新增 owner-scoped `scheduled_research_runs`，并在迁移前生成 `.pre-v19.bak`；run key、attempt、失败/取消 retry 关系和 report 双向回链可查。
- 成功报告只关联同用户 canonical evidence，部分缺失标记 `PARTIAL`；失败标记 `UPSTREAM_ERROR`且不写 completed memory/evidence。memory 仍仅在 opt-in 时生成 candidate `AI_INFERENCE`。
- 通知 payload 包含 `scheduled_run_id`；Settings 运行历史展示重试、report、evidence quality 和 memory 计数；有历史 job 禁止删除以保留谱系。
- backend focused `79 passed`；Ruff 通过；mypy 6 source files 通过；frontend focused `5 passed`；TypeScript/build 通过（仅既有 chunk-size 警告）。
- 运行时契约：schema v19 / 45 张逻辑表 / 35 张 owner 表；OpenAPI `117 paths / 148 operations`。
- 上述验证使用 fixture/mock，未声称真实调度、金融数据或 LLM 上游成功。
