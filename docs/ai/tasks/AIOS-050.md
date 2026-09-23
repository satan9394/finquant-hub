# AIOS-050 - 自然语言到有限策略 IR

## 状态

`[DONE]`

## 优先级

P1

## 用户结果

用户可用受限自然语言描述已有回测能力覆盖的策略，系统只生成版本化、可解释、不可直接执行的中间表示；歧义、未支持指标或任意代码必须明确拒绝。

## 允许修改

- `backend/app/services/strategy_ir.py`（新建）
- `backend/app/routers/backtests.py`
- `backend/tests/test_strategy_ir.py`（新建）
- `backend/tests/test_api.py`
- `backend/tests/test_router_contracts.py`
- `frontend/src/pages/StrategyLab.tsx`
- `frontend/tests/StrategyLab.test.tsx`
- `docs/API_CONTRACT.md`
- `docs/ROUTER_MAP.md`
- `docs/ARCHITECTURE.md`
- `docs/ai/ARCHITECTURE.md`
- `docs/ai/STRATEGY_IR_CONTRACT.md`（新建）
- AIOS 长期计划、EXEC_PLAN 与本任务卡

## 禁止修改

- 数据库 schema、依赖、回测引擎、筛选器执行路径、其他产品页面、`reference/`
- LLM 调用、任意 Python/SQL/JavaScript、`eval`/`exec`、自由表达式或动态导入
- 自动运行回测、自动保存结果、自动创建 Thesis/monitor/alert 或任何交易动作
- 猜测缺失 ticker、周期、窗口、执行时点、成本或金融阈值

## 完成标准

- 版本化 allowlist grammar 只接受现有 MA crossover 能力可承载的明确策略描述，并输出有限枚举和有界数值。
- 对 ticker、快慢均线窗口、入场/退出交叉条件和执行时点逐项解释；缺失或互相矛盾时返回结构化 ambiguity/unsupported 错误。
- 输出仅为数据 IR，不含可执行代码、任意表达式或模型推论；相同输入产生相同 canonical IR。
- API 与 Strategy Lab 提供 loading/error/empty/valid/invalid 状态；解析不会自动触发回测。
- backend/frontend focused tests、Ruff、mypy、TypeScript、build、OpenAPI/docs/diff check 通过。

## 验证声明

解析成功只证明描述可映射到有限策略语义，不表示策略有效、盈利或适合真实交易；AIOS-051 才负责显式编译到既有筛选/回测能力。

## 完成证据

- `strategy-ir/v1` 确定性 allowlist parser、结构化 invalid issues、认证 API 与 Strategy Lab 四态已经完成；无 LLM、数据库写入或自动回测。
- focused backend：13 passed；Ruff 与 mypy 通过。
- focused frontend：6 passed；TypeScript 与 production build 通过。
- OpenAPI：122 paths / 155 operations，解析端点归属 `backtests`。
- 当前源码端到端：empty、valid、invalid、request error 均可见；valid 保留独立“运行回测”动作，页面无横向溢出。浏览器控制面未提供 390px 视口切换，因此未把桌面结果冒充移动端实机验证。
- 本任务只使用 fixture、本地 API 与静态构建，不是真实金融上游或策略收益验证。
