# Thesis Drift Engine Contract

## 版本化规则

`POST /api/thesis/{id}/check` 使用 `thesis-drift/v1`。每条规则输出：

- `rule_id` 与 `rule_version`；
- `status` 与可读 `reason`；
- `formula`、版本化参数和可选计算结果；
- baseline/current 原值；
- baseline/current canonical evidence IDs。

规则结果由后端生成并完整保存在 `last_check_json`；前端只显示，不重算。

## 当前 v1 规则

| kind | rule | 非 UNKNOWN 门槛 |
|---|---|---|
| price | `price.relative_change@1.0.0` | baseline/current 都有 canonical quote evidence 且数值可比；绝对相对变化阈值 20% |
| fundamental | `fundamental.material_change@1.0.0` | baseline/current 都有 canonical fundamental evidence 且至少一个同名指标可比；阈值 20% |
| position | `position.relative_change@1.0.0` | 当前没有 canonical adapter，固定 UNKNOWN |
| report | `report.manual_review@1.0.0` | 只要求 document evidence 与人工复核，固定 UNKNOWN；文本相似度无状态决定权 |

价格公式为 `(current - baseline) / abs(baseline)`；baseline 为零或不可解析时保持 UNKNOWN。基本面逐个共同 metric 使用相同公式，任一变化超过阈值即为 violated。

## Evidence 与副作用

创建 Thesis 时，只有能通过 canonical provenance adapter 的 baseline quote/fundamental 才写入 evidence 并把 IDs 保存在 baseline snapshot。核验时同样形成 current evidence。任一侧缺失时不生成确定状态，也不创建 automatic edge。

引擎只更新四条系统 claim 及 Thesis 的 check current view；不会修改 manual claim、判断、假设、版本或 confidence。AIOS-031 数据库约束继续保证 deterministic 非 UNKNOWN 状态事件必须引用同用户 current canonical evidence。

验证使用 deterministic fixture/mock 与本地 SQLite，不是真实金融上游验证。
