# AIOS-051 - 有限策略 IR 编译到现有回测能力

## 状态

`[DONE]`

## 优先级

P1

## 用户结果

用户可把已验证的 `strategy-ir/v1` 显式应用为现有 MA crossover 回测参数草稿，逐项看到映射和仍需确认的参数；应用不会运行或保存回测，且可从草稿重建等价 IR。

## 允许修改

- `backend/app/services/strategy_ir.py`
- `backend/app/routers/backtests.py`
- `backend/tests/test_strategy_ir.py`
- `backend/tests/test_api.py`
- `backend/tests/test_router_contracts.py`
- `frontend/src/pages/StrategyLab.tsx`
- `frontend/tests/StrategyLab.test.tsx`
- `docs/API_CONTRACT.md`
- `docs/ROUTER_MAP.md`
- `docs/ARCHITECTURE.md`
- `docs/ai/ARCHITECTURE.md`
- `docs/ai/STRATEGY_IR_CONTRACT.md`
- AIOS 长期计划、EXEC_PLAN 与本任务卡

## 禁止修改

- 数据库 schema、依赖、回测/筛选引擎、其他产品页面、`reference/`
- 新策略类型、自由表达式、代码生成、LLM 调用或动态执行
- 自动运行/保存回测、自动创建 Thesis/monitor/alert 或交易动作
- 猜测日期、资金、成本、基准、风控阈值或缺失金融口径

## 完成标准

- 编译器只接受有效 `strategy-ir/v1`，输出版本化 `ma-crossover-draft/v1`，明确 symbol、窗口、频率、价格字段、信号时点、执行时点和 long-only 口径。
- draft 中日期、资金、成本、基准和风控保持 `requires_confirmation`，不得填入伪默认值；调用方显式提供后才能形成现有 backtest request。
- draft 可确定性还原为 canonical 等价 IR；篡改、未知字段、窗口关系错误或执行语义漂移必须结构化拒绝。
- Strategy Lab 只在用户点击“应用到回测参数”后更新可映射字段，并清楚显示其他参数仍需确认；解析和应用均不自动运行或保存。
- 验证无 look-ahead：信号保持当日 close、执行保持 next open，且编译不得退化为同日收盘成交。
- backend/frontend focused tests、Ruff、mypy、TypeScript、build、OpenAPI/docs/diff check 通过。

## 验证声明

编译成功仅说明有限 IR 与现有 MA crossover 参数语义一致；它不证明策略有效、盈利或适合真实交易，也不构成真实上游验证。

## 完成证据

- `ma-crossover-draft/v1` 只映射 symbol、快慢窗口、日线收盘数据和 close -> next open / long-only 执行语义；九项未决参数仅保留在 `requires_confirmation`。
- canonical IR -> draft -> IR 确定性可逆；未知字段、窗口关系、canonical key 与执行时点篡改均结构化拒绝。
- Strategy Lab 仅在用户点击“应用到回测参数”后更新三个可映射字段，并提示其余参数待确认；解析、编译和应用均不运行或保存。
- focused backend 20 passed；Ruff、mypy 通过。focused frontend 7 passed；TypeScript、production build 通过。
- OpenAPI 123 paths / 156 operations；compile 端点归属 `backtests`。fixture/mock/静态检查不是真实上游或策略收益验证。
