# AIOS-054 - 模拟复盘与 hypothesis outcome

## 状态

`[DONE]`

## 优先级

P1

## 用户结果

用户可把一个已有、同用户的 typed hypothesis 与 Paper Portfolio 的确定性模拟快照关联，显式记录 supported/refuted/inconclusive 复盘判断、观察窗口和理由；系统展示模拟收益和质量，但绝不把收益自动升级为因果证明或事实。

## 允许修改

- `backend/app/routers/portfolio.py`
- `backend/app/services/portfolio.py`
- `backend/app/services/investment_memory.py`（仅在现有 helper 无法满足幂等 owner-scoped review 时最小修改）
- `backend/tests/test_portfolio.py`
- `backend/tests/test_api.py`
- `backend/tests/test_router_contracts.py`
- `frontend/src/pages/Portfolio.tsx`
- `frontend/tests/PortfolioPage.test.tsx`
- `frontend/src/types/index.ts`
- `docs/API_CONTRACT.md`
- `docs/ROUTER_MAP.md`
- `docs/ARCHITECTURE.md`
- `docs/ai/ARCHITECTURE.md`
- `docs/ai/PAPER_PORTFOLIO_REVIEW_CONTRACT.md`（新建）
- AIOS 长期计划、EXEC_PLAN 与本任务卡

## 禁止修改

- 数据库 schema、真实账户/资金/委托/自动执行、外部写操作、其他页面、`reference/`
- 自动根据收益选择 supported/refuted，自动修改 hypothesis/Thesis/confidence 或把用户判断写成 FACT
- ORM、第二数据库连接、独立 DAL、新依赖、LLM/自由 Agent、Graphiti/图数据库
- 在估值 UNKNOWN/PARTIAL/UPSTREAM_ERROR 时伪造总值、收益或确定 outcome

## 完成标准

- 只接受同用户、非 deleted、`memory_type=hypothesis` 的 typed memory；跨用户/不存在/类型不符统一拒绝且不泄漏内容。
- 复盘草稿只读聚合 Paper snapshot/valuation、公式、price/FX/source/as-of/quality；缺失保持 UNKNOWN/PARTIAL/UPSTREAM_ERROR。
- 保存必须由用户显式提供 outcome、理由、观察起止时间和 idempotency key；相同 key 同内容幂等，不同内容冲突，不静默覆盖历史。
- 保存结果复用 `memory_records` 的 `review_outcome`，`information_kind=USER_HYPOTHESIS`、`source_kind=user`、`created_by=user`，内容明确 `causal_proof=false`，不修改原 hypothesis 状态、内容或 confidence。
- 若估值非 OK，只允许 `inconclusive`；即使 OK，系统也不自动建议或选择 outcome。
- API/UI 展示 hypothesis、模拟输入、计算值、provenance、质量、非因果警告和历史；loading/empty/error/partial/valid 可见，刷新可恢复。
- 验证 owner isolation、幂等、原 hypothesis 不变、收益/费用公式引用、UNKNOWN 边界、无真实执行能力与现有 Paper/portfolio 回归。
- focused backend/frontend、Ruff、mypy、TypeScript、build、OpenAPI/docs/diff check 通过；Phase 5 退出时运行完整门禁。

## 验证声明

复盘 outcome 是用户对模拟结果的 `USER_HYPOTHESIS`，不是观察事实、AI 结论或因果证明；fixture/mock 行情不是实时上游验证。

## 实际修改

- `backend/app/services/portfolio.py`
- `backend/app/routers/portfolio.py`
- `backend/tests/test_portfolio.py`
- `backend/tests/test_api.py`
- `backend/tests/test_router_contracts.py`
- `frontend/src/pages/Portfolio.tsx`
- `frontend/src/types/index.ts`
- `frontend/tests/PortfolioPage.test.tsx`
- `docs/API_CONTRACT.md`
- `docs/ROUTER_MAP.md`
- `docs/ARCHITECTURE.md`
- `docs/ai/ARCHITECTURE.md`
- `docs/ai/PAPER_PORTFOLIO_REVIEW_CONTRACT.md`
- AIOS 长期计划、EXEC_PLAN 与任务卡

## 验证证据

- focused backend service/API/OpenAPI：11 passed；owner/type/deleted 隔离、草稿零写、幂等 replay/conflict、原 hypothesis 不变、UNKNOWN 仅 inconclusive、观察窗口时区边界均通过。
- focused Portfolio Vitest：8 passed；覆盖 empty/error/UNKNOWN/valid/history、无默认 outcome、公式/provenance/非因果提示。
- Ruff 全量通过；`mypy app` 119 source files 通过；TypeScript 与 production build 通过。
- 运行时 OpenAPI：131 paths / 166 operations；Paper review 增加 2 paths / 3 operations，无真实账户、order、broker 或执行路由。
- Phase 5 完整门禁：backend 513 passed，coverage 83.94%；frontend 50 files / 157 tests；E2E 11 passed。
- 隔离临时库浏览器：desktop 草稿、显式 inconclusive、保存、刷新恢复、聚焦后 Escape 关闭通过；390×844 为 `inner/body/document=390/390/390`，复盘历史与操作可见。API 回读确认原 hypothesis 正文/status 不变，review 为 `USER_HYPOTHESIS`、`source_kind=user`、`created_by=user`、`causal_proof=false`。临时服务已停止，目录已送入回收站。

## 验证边界

service/API/Vitest 的行情均为 fixture/mock；浏览器隔离组合没有持仓，验证的是确定性现金快照和 UI/持久化边界，不是实时行情、真实账户、真实成交或因果有效性证明。
