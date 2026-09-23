# Paper Portfolio Review Contract

## 目的与边界

AIOS-054 把同一用户已有的 typed hypothesis 与独立 Paper Portfolio 的确定性模拟快照关联。它用于记录用户复盘判断，不是事实、AI 结论、投资建议或因果证明，也不提供真实账户、真实委托或自动执行能力。

## 信息分层

- 原 hypothesis：必须是同用户、非 deleted、`memory_type=hypothesis`；服务只读，不修改其 content、status、confidence 或关联 Thesis。
- 模拟结果：`information_kind=COMPUTED_RESULT`，由初始现金、append-only 模拟账本、显式费用/FX 输入和当前行情估值计算。
- 复盘判断：用户显式选择 `supported`、`refuted` 或 `inconclusive`，保存为 `memory_records.review_outcome`，固定 `information_kind=USER_HYPOTHESIS`、`source_kind=user`、`created_by=user`、`causal_proof=false`。

系统即使在估值为 `OK` 时也不推荐或预选 outcome；`PARTIAL`、`UNKNOWN` 或 `UPSTREAM_ERROR` 时只允许 `inconclusive`。

## 只读草稿

`GET /api/portfolio/paper/{id}/reviews/draft?hypothesis_memory_id={memory_id}` 返回：

- hypothesis 原记录；
- 初始现金、模拟现金、总值与收益；
- `total_return=(cash+sum(quantity*current_price))/initial_cash-1`；
- `BUY=-(quantity*price+fee)*fx; SELL=(quantity*price-fee)*fx`；
- 每个持仓的 price、currency、source、as-of、quality；
- `OK/PARTIAL/UNKNOWN/UPSTREAM_ERROR`、原因和非因果警告；
- 可选 outcome 列表与恒为 null 的 `recommended_outcome`。

草稿不写数据库。缺失价格或 FX 不使用成本或占位值补全总值/收益。

## 保存与幂等

`POST /api/portfolio/paper/{id}/reviews` 要求 hypothesis ID、outcome、非空理由、ISO-8601 观察起止时间和 idempotency key。相同用户、Paper 与 key 的相同请求返回原 review；同 key 不同内容返回 `IDEMPOTENCY_CONFLICT`，不覆盖历史。观察开始不得晚于结束，起止时区格式必须一致。

跨用户、不存在、deleted 或非 hypothesis ID 统一返回 `HYPOTHESIS_NOT_FOUND`，不泄漏记录内容。历史通过 `GET /api/portfolio/paper/{id}/reviews` 按 owner 和 `source_id=paper_portfolio:{id}` 恢复。

## 验证声明

单元/API/UI 测试中的 fixture 行情只验证公式、状态和契约，不是实时上游验证。任何无法取得的数据继续保留其质量状态、原因、来源和空值。
