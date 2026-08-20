# AIOS-052 - Thesis 一键创建验证实验

## 状态

`[DONE]`

## 优先级

P1

## 用户结果

用户可从自己的 Thesis 显式进入 Strategy Lab 创建验证实验草稿，系统保留 Thesis 来源、只带入可验证的标的与明确策略参数，并要求用户确认日期、资金、成本、基准和风控后再主动运行。

## 允许修改

- `backend/app/routers/thesis.py`
- `backend/app/services/thesis.py`
- `backend/tests/test_thesis.py`
- `backend/tests/test_api.py`
- `backend/tests/test_router_contracts.py`
- `frontend/src/pages/Thesis.tsx`
- `frontend/src/pages/StrategyLab.tsx`
- `frontend/tests/Thesis.test.tsx`
- `frontend/tests/StrategyLab.test.tsx`
- `docs/API_CONTRACT.md`
- `docs/ROUTER_MAP.md`
- `docs/ARCHITECTURE.md`
- `docs/ai/ARCHITECTURE.md`
- `docs/ai/THESIS_VALIDATION_EXPERIMENT_CONTRACT.md`（新建）
- AIOS 长期计划、EXEC_PLAN 与本任务卡

## 禁止修改

- 数据库 schema、依赖、回测/筛选引擎、其他页面、`reference/`
- 从自由 Thesis 文本猜测均线、日期、成本、资本、阈值或交易方向
- 自动调用 LLM、自动运行/保存回测、自动创建 monitor/alert 或任何交易动作
- 跨用户读取 Thesis，或把实验结果描述成 Thesis 因果证明

## 完成标准

- owner-scoped API 为指定 Thesis 生成版本化 validation experiment intent；不存在或不属于当前用户均返回 404。
- intent 只引用 thesis id/title/ticker 和已固定的 MA crossover 能力；未明确策略参数保持 `requires_confirmation`，不得从 Thesis 正文推断。
- Thesis UI 由用户显式点击创建验证实验，并导航到 Strategy Lab；Strategy Lab 显示来源回链、只带入 ticker，不自动填入未决策略/金融参数或运行回测。
- 用户可在 Strategy Lab 使用现有有限 IR/预设/表单完成确认；刷新后的 URL 仍可恢复 owner-safe intent，篡改或无权 intent 明确失败。
- backend/frontend focused tests、Ruff、mypy、TypeScript、build、OpenAPI/docs/diff check 通过。

## 验证声明

创建验证实验只是建立可复核假设与回测准备状态，不证明 Thesis、策略收益或因果关系，也不构成真实金融上游验证。

## 完成证据

- `thesis-validation-experiment/v1` 由 owner-scoped Thesis 动态生成；跨用户/不存在统一 404，只带入规范 ticker，均线和九项金融参数保持待确认。
- Thesis 显式点击后导航到只含 `validation_thesis_id` 的 URL；Strategy Lab 刷新重新鉴权，显示来源、回链、待确认和非因果证明边界，不自动运行或保存。
- focused backend 10 passed；Ruff、mypy 通过。focused frontend 17 passed；TypeScript、production build 通过。
- OpenAPI 124 paths / 157 operations。当前源码浏览器验证了无权/不存在来源错误、无自动回测和无横向溢出；本地库无 Thesis，未为 UI 验证写入用户数据。
- 所有结果来自 deterministic fixture、本地 API 与 UI，不是真实金融上游或策略收益验证。
