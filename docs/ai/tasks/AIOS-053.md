# AIOS-053 - Paper Portfolio 与真实组合严格分离

## 状态

`[DONE]`

## 优先级

P1

## 用户结果

用户可创建与当前真实/用户组合明确分离的模拟组合，用显式模拟现金和成交成本记录人工模拟买卖，并查看有来源的估值；它不连接账户、不发送订单，跨币种缺 FX 时不汇总伪造总值。

## 允许修改

- `backend/app/database.py`
- `backend/app/routers/portfolio.py`
- `backend/app/services/portfolio.py`
- `backend/tests/test_database_migrations.py`
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
- `docs/ai/PAPER_PORTFOLIO_CONTRACT.md`（新建）
- AIOS 长期计划、EXEC_PLAN 与本任务卡

## 禁止修改

- 真实券商/账户/资金/订单 API、自动交易、跟单、外部写操作、其他页面、`reference/`
- ORM、第二数据库连接、独立 DAL、新依赖或外部队列
- 把模拟持仓写入现有真实/用户 portfolio 表，或反向复用模拟数据作为真实持仓
- 编造价格、FX、费用、收益或缺失时点；缺失必须保持 UNKNOWN/PARTIAL/UPSTREAM_ERROR

## 完成标准

- schema 顺序迁移新增独立 owner-scoped paper portfolio/ledger 表，迁移前备份、幂等且不改变现有 portfolio 表语义。
- 用户显式创建 paper portfolio，base currency、初始模拟现金和名称必填；所有响应标明 `account_kind=PAPER`、`execution_kind=SIMULATED`、无真实订单能力。
- 人工模拟买卖必须显式提供 symbol、quantity、simulation price/as-of/source、费用和币种；服务用 append-only ledger 确定性更新现金/持仓，禁止负现金、裸卖空和静默覆盖历史。
- 估值可调用既有行情只读补充 current price/provenance；价格缺失保持 UNKNOWN。单一 base currency 可汇总；跨币种且无可验证 FX 时总值/收益为 UNKNOWN，并列出原因。
- API/UI 与现有组合区域使用醒目标识和独立动作；empty/loading/error/partial/valid 状态可见，不出现连接账户、下单或自动交易文案。
- 验证用户隔离、重复请求幂等、成本公式、买卖边界、删除/停用边界和现有 portfolio 不受影响。
- focused backend/frontend、迁移、Ruff、mypy、TypeScript、build、OpenAPI/docs/diff check 通过。

## 验证声明

paper portfolio 的成交、现金和收益均为用户输入与确定性模拟结果，不是真实交易或真实账户证明；fixture/mock 行情不得描述为真实上游验证。

## 实际修改

- `backend/app/database.py`
- `backend/app/services/portfolio.py`
- `backend/app/routers/portfolio.py`
- `backend/tests/test_database_migrations.py`
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
- `docs/ai/PAPER_PORTFOLIO_CONTRACT.md`
- AIOS 长期计划、EXEC_PLAN 与任务卡

## 验证证据

- schema v22/pre-v22 backup/二次初始化幂等：`backend/tests/test_database_migrations.py` focused 14 passed。
- owner isolation、现有 portfolio 不变、append-only trigger、幂等 replay/conflict、成本公式、负现金、裸卖空、停用、显式历史 FX、当前 FX/价格 UNKNOWN：`backend/tests/test_portfolio.py` 与相关 API/router focused 合计 23 passed（`LOCAL_ONLY_MODE=false`）。
- Ruff 任务文件通过；`mypy app` 119 source files 通过。
- Portfolio Vitest 5 passed；TypeScript `tsc -b` 与 Vite production build 通过。
- 运行时 OpenAPI 为 129 个 `/api/*` 路径、163 个操作；Paper 路径 5 个、操作 6 个，无 account/broker/order 路径。
- 隔离临时 schema v22 数据库与 8001/5175 服务的浏览器验证：桌面 empty/create/append/valid/refresh 通过；当前运行时实际取得 `tencent` quote source/as-of（不是 fixture，但不代表账户或成交验证）；390px `scrollWidth=375 <= innerWidth=390`，警告与动作可见；聚焦表单后 Escape 关闭弹窗。临时服务已停止，临时目录送入回收站。

## 验证边界

模拟成交、历史 FX 和费用来自显式确定性输入；service/Vitest 中的行情是 fixture。浏览器只证明当次本地运行时的真实只读行情回链与 UI，不证明真实账户、真实成交、持续上游可用性或投资收益。
