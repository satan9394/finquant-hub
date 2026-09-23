# Strategy IR v1 合同

## 定位

`strategy-ir/v1` 是自然语言与现有 MA crossover 能力之间的有限、确定性、不可执行中间表示。解析成功只说明描述可映射，不说明策略有效、盈利或适合真实交易。

入口：

- `POST /api/backtests/strategy-ir/parse`
- `POST /api/backtests/strategy-ir/compile`

请求只允许：

```json
{"description": "标的 600519，日线 MA20 上穿 MA50 时买入，MA20 下穿 MA50 时卖出；收盘确认信号，下一交易日开盘执行。"}
```

未知字段由 Pydantic 拒绝。请求不保存，不调用 LLM，不访问行情，也不创建回测任务。

## Allowlist grammar

描述必须同时且唯一地给出：

- 一个可由既有 `external_symbol()` 规范化的 A/HK/US ticker；
- 两个 SMA 窗口，快线 `2..200`、慢线 `3..250` 且快线小于慢线；
- 日线收盘价；
- 快线上穿慢线后目标仓位 `long`；
- 快线下穿慢线后目标仓位 `flat`；
- 收盘确认、下一交易日开盘执行、只做多。

中文 `上穿/下穿`、`金叉/死叉` 与英文 `crosses above/below` 可映射到相同 canonical IR。模糊备选、多个 ticker/窗口、未支持指标、缺执行时点或任意代码内容均返回 `status=invalid` 和逐字段 issues。

## Canonical IR

IR 只包含有限数据：

- `schema_version=strategy-ir/v1`；
- `strategy_type=ma_crossover`；
- normalized instrument、`frequency=1d`、`price_field=close`；
- entry/exit 两个条件及逐条解释；
- `signal_at=close`、`execute_at=next_open`、`position_mode=long_only`；
- 尚需用户确认的日期、资金、佣金、滑点、税费、最低佣金、回撤、基准；
- 对 canonical JSON 的 SHA-256 `canonical_key`。

IR 不包含 Python、SQL、JavaScript、自由表达式、函数、动态导入、原始 prompt 或模型推论。相同语义产生相同 IR 和 canonical key。

## 产品边界

`compile` 只接受完整 canonical IR，并返回 `ma-crossover-draft/v1`：

- `parameters` 仅含 normalized symbol、short window 和 long window；
- `data` 固定为日线收盘价；`execution` 固定为 close signal、next open、long-only；
- 日期、资金、佣金、滑点、税费、最低佣金、回撤和基准仅出现在 `requires_confirmation`，不得伪造默认值；
- draft 可还原为完全相同 canonical IR；未知字段、窗口关系、canonical key 或执行语义漂移返回结构化 invalid。

Strategy Lab 展示 empty/loading/valid/invalid/request-error 状态。生成 valid IR 不会自动带入表单；只有用户点击“应用到回测参数”后才更新 symbol 和两个窗口，并再次提示其余参数待确认。解析和应用都不会点击“运行回测”或保存结果。
