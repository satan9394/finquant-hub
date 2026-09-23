# Challenge My Thesis Contract

## 产品动作

`POST /api/thesis/{id}/challenge` 是用户显式触发的 owner-scoped 只读动作。它复用当前 Thesis、不可变版本、AIOS-031 claim/evidence 时间边和既有 `adversarial_review`，不创建另一套研究 Agent 或数据模型。

响应固定包含：

- `strongest_counter_evidence`：当前 active opposing edge 对应的反证候选；
- `omitted_variables`：既有审查规则识别的证据缺口和待核验变量；
- `fragile_assumptions`：版本中的用户假设及其 evidence 覆盖缺口。

## 判断与证据边界

所有 challenge 项都标记 `result_kind=AI_INFERENCE`。每项 `evidence_refs` 只引用当前用户 `evidence_objects`，并保留 evidence ID、relation、kind、data status、source、时间、期间、币种、quality flags 和 license scope。

- canonical evidence 存在不代表推论已被事实证明；因此整体至多为 `PARTIAL`。
- 没有可定位 evidence 时，项目为 `UNKNOWN` 且引用数组为空。
- 当前反证强度只按持久化关系、时效和 data status 排序，不对金融语义做模型补全。
- assumption-level edge 尚未建立时，即使版本有 evidence，脆弱假设仍为 `PARTIAL`，不会宣称证据直接支持该假设。

## 副作用与隔离

Challenge 不调用模型或实时金融上游，不更新 Thesis、claim、version、edge、status event 或 confidence。所有查询包含 `user_id`，跨用户 Thesis 返回 404，跨用户 evidence 无法进入响应。

该输出不构成舞弊证据、做空建议或投资建议。验证使用 deterministic fixture/mock 与本地 SQLite，不是真实金融上游或真实模型验证。
