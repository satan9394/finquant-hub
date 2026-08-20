# Thesis Validation Experiment v1 合同

## 定位

`thesis-validation-experiment/v1` 是 owner-scoped Thesis 到现有 Strategy Lab 的只读验证意图，不是回测任务、策略结论或持久化对象。

入口：`GET /api/thesis/{thesis_id}/validation-experiment`。

## 所有权与恢复

- API 通过当前 `user_id` 读取 Thesis；不存在和跨用户访问统一为 404。
- Thesis 页面只有用户点击“创建验证实验”时才请求 intent 并导航。
- URL 仅保存 `validation_thesis_id`；Strategy Lab 刷新时重新请求同一 owner-scoped API，不信任客户端复制的标题、ticker 或参数。
- 非正整数 ID 在客户端直接拒绝；无权或已删除 ID 显示错误，不回退到猜测的来源。

## 数据边界

intent 仅包含：

- Thesis `id`、`title`、规范 ticker；
- 固定能力 `backtests.ma_crossover`；
- 日线收盘数据、close signal、next open、long-only 语义；
- 唯一已映射参数 `symbol`；
- 待确认的快慢窗口、日期、资金、佣金、滑点、税费、最低佣金、回撤和基准；
- `VALIDATION_ONLY_NOT_CAUSAL_PROOF` 解释边界。

不得复制自由 Thesis 正文，不得从正文、assumptions 或 claims 推断策略参数。创建和恢复 intent 不写数据库、不调用 LLM/行情、不运行或保存回测。

## 产品语义

Strategy Lab 显示来源、回链、已带入 ticker 和待确认清单。用户仍需用有限 IR、预设或表单明确策略与金融参数，并主动点击运行。即使后续回测完成，结果也只是历史模拟证据，不是 Thesis 的因果证明或投资建议。
