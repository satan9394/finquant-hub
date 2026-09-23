# AIOS-040 - 个性化 Today / Decision Inbox

## 状态

`[DONE]`

## 优先级

P1

## 用户结果

今日首页优先展示与当前用户已保存 Thesis、Portfolio、研究任务或通知相关的变化，而不是无差别市场噪声；每项说明为什么现在重要、关联对象、可回链证据及下一步。

## 允许修改

- `backend/app/routers/dashboard.py`
- `backend/app/services/decision_inbox.py`（新建）
- `backend/tests/test_decision_inbox.py`（新建）
- `backend/tests/test_api.py`
- `backend/tests/test_router_contracts.py`
- `frontend/src/pages/Dashboard.tsx`
- `frontend/tests/Dashboard.test.tsx`（新建或既有）
- `frontend/e2e/dashboard.spec.ts`
- `docs/API_CONTRACT.md`
- `docs/ROUTER_MAP.md`
- `docs/ARCHITECTURE.md`
- `docs/ai/ARCHITECTURE.md`
- `docs/ai/DECISION_INBOX_CONTRACT.md`（新建）
- AIOS 长期计划、EXEC_PLAN 与本任务卡

## 禁止修改

- 数据库 schema、依赖、其他产品页面、`reference/`、外部图/队列/缓存系统
- 后台自动调用金融上游、自动创建 monitor/alert、自动改变 Thesis/Portfolio/Strategy
- 用无来源全市场热点冒充个性化变化，或把 AI 推论标为事实

## 完成标准

- owner-scoped 只读 inbox 只从已有持久化用户对象及其状态/证据生成，跨用户为零。
- 每项有稳定 id、kind、priority、why_now、object_ref、evidence_refs、quality_status、next_action；排序规则确定且有版本。
- canonical evidence 缺失或上游失败时保留 UNKNOWN/PARTIAL/UPSTREAM_ERROR，不补造价格、变化或原因。
- Dashboard 提供明确 loading/error/empty/content 四态，390px 与键盘可用；动作只导航到现有对象或显式流程。
- backend/frontend focused tests、Ruff、mypy、TypeScript、build、OpenAPI/docs/diff check 通过。

## 验证

```powershell
cd backend
$env:LOCAL_ONLY_MODE='false'
.venv\Scripts\python.exe -m pytest tests/test_decision_inbox.py tests/test_api.py tests/test_router_contracts.py -q --no-cov
.venv\Scripts\python.exe -m ruff check app/routers/dashboard.py app/services/decision_inbox.py tests/test_decision_inbox.py
.venv\Scripts\python.exe -m mypy app/routers/dashboard.py app/services/decision_inbox.py
cd ..\frontend
bun run test -- Dashboard.test.tsx
bun x tsc -b --pretty false
bun run build
cd ..
git diff --check
```

## 回退

移除只读 inbox 聚合端点和 Dashboard 区块；不涉及 schema 或用户对象写入。

## 验证声明

本任务默认只验证 persisted fixture/local SQLite 的聚合与展示，不构成真实金融上游验证。

## 完成证据

- backend focused 47 passed；Ruff、mypy 通过。
- frontend focused 2 passed；TypeScript、production build 通过。
- OpenAPI 114 paths / 145 operations；允许文件定向 `git diff --check` 通过。
- Phase 4 回归修复：Dashboard E2E mock 补齐 `/api/dashboard/decision-inbox` 的空态合同；targeted 1 passed，完整 E2E 11 passed。
