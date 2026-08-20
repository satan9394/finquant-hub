# Paper Portfolio Contract

## Boundary

Paper Portfolio 是 owner-scoped 的确定性研究模拟账本。它不连接券商或账户，不代表真实资金、持仓或成交，不发送真实指令，也不支持自动执行。所有响应固定包含：

- `account_kind=PAPER`
- `execution_kind=SIMULATED`
- `real_account=false`
- `real_orders=false`
- `automatic_trading=false`

既有 `portfolios`/`positions` 语义不变；模拟数据只写 `paper_portfolios` 和 `paper_portfolio_ledger`。

## Storage and ownership

Schema v22 在迁移前创建 `.pre-v22.bak`，然后顺序、幂等地安装两张 owner-scoped 表。父子引用同时包含 `user_id`；owner guards 拒绝空归属或变更归属。ledger 的 `UPDATE` 与 `DELETE` 由 SQLite trigger 拒绝，停用只更新组合状态并保留历史。

每个 `(user_id, portfolio_id, idempotency_key)` 唯一。相同 key 与相同规范请求返回原记录；相同 key 与不同请求返回 `IDEMPOTENCY_CONFLICT`，不会静默覆盖。

## Explicit inputs and formulas

每条模拟 BUY/SELL 必须提供 symbol、quantity、simulation price、simulation as-of、simulation source、fee、currency 和 idempotency key。非基础币种还必须显式提供正数 `fx_rate_to_base`、`fx_source` 与 `fx_as_of`；服务不查询或猜测历史 FX。

以基础币种表示的现金变化：

```text
BUY  cash_delta = -(quantity * simulation_price + fee) * fx_rate_to_base
SELL cash_delta =  (quantity * simulation_price - fee) * fx_rate_to_base
cash = initial_cash + sum(cash_delta)
```

卖出按移动平均账面成本比例释放成本。服务在单 aiosqlite 连接内串行校验并追加，拒绝负现金与裸卖空。

这些数值是用户输入和确定性计算结果，不是观察到的真实成交事实。

## Current valuation

估值只读复用现有 `MarketDataService.quotes`。每个持仓保留 current price、quote currency、source、as-of 与 data status：

- 报价或来源缺失：该持仓 `UNKNOWN`，价格和市值不以成本代填，组合总值/收益为 null。
- 行情调用失败：`UPSTREAM_ERROR`，不改写账本。
- 所有当前报价与基础币种相同：`total_value = cash + sum(quantity * current_price)`；`total_return = (total_value / initial_cash - 1) * 100`。
- 当前报价币种不同且没有可验证的当前 FX：持仓为 `PARTIAL`，保留原币市值与原因 `FX_UNKNOWN:*`，组合总值/收益为 null。

Fixture/mock 只验证公式、状态和 API 合同，不是真实上游行情、FX、账户或成交验证。

## API and UI

API 位于 `/api/portfolio/paper*`，在动态 `/{portfolio_id}` 路由之前注册并统一认证。提供创建、列表、详情、append ledger、只读估值和停用；不存在真实账户、真实资金或真实指令端点。

Portfolio 页面以 `PAPER · SIMULATED` 标签、警告说明、独立选择器和独立动作展示模拟组合。加载、空、错误、`UNKNOWN`/`PARTIAL`/`UPSTREAM_ERROR` 与有效估值均可见；缺失总值显示 `--`。
