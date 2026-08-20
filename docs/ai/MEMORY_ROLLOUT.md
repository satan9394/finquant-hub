# Typed Investment Memory Rollout

## 结论

chat/research 继续以现有 SQLite FTS5 为默认回答路径。类型化记忆只能通过两个默认关闭的环境开关进入 shadow 或 opt-in；关闭开关即可无迁移地回退到 FTS-only。

## 开关

| 环境变量 | 默认值 | 行为 |
|---|---:|---|
| `MEMORY_TYPED_SHADOW_ENABLED` | `false` | 执行 typed retrieval 与 assembler，仅审计，不注入模型上下文 |
| `MEMORY_TYPED_CONTEXT_ENABLED` | `false` | 执行 typed retrieval，并把 AIOS-023 的不信任边界上下文追加到既有 FTS 上下文之后 |

`MEMORY_TYPED_CONTEXT_ENABLED=true` 优先于 shadow。两个开关均关闭时，不执行 typed retrieval，也不写 rollout audit。

## 数据边界

schema v14 的 `memory_rollout_audits` 仅保存：

- `user_id`、surface、mode 和 outcome；
- query/response 的 SHA-256 hash；
- native/typed 候选计数和 typed status 计数；
- assembler 的字符数与估算 token 数；
-稳定错误码与时间戳。

表中没有查询、回答、召回内容、提示词、凭据或工具日志字段。Hash 不是匿名化措施，audit 仍按用户数据保护并通过 `user_id` 隔离；它不能用于恢复或生成正文。

## 失败与回退

- typed retrieval、assembler 或 audit 写入失败不得中断 chat/research；上下文自动保持 FTS-only。
- 可记录时，失败仅记录 `typed_retrieval_error`，不保存可能包含用户/上游内容的异常文本。
- 关闭两个开关即可立即停止 typed retrieval 和注入；schema v14 迁移前快照为 `<database>.pre-v14.bak`。
- 需要数据库级回退时先停止应用，再恢复快照；audit 表不是业务权威数据。

## 验证口径

当前验证是本地 deterministic fixture、mock LLM 与 SQLite 集成验证，不是真实模型或金融上游验证。覆盖默认关闭、shadow 不注入、chat/research opt-in 注入、owner isolation、metadata-only、故障回退和迁移备份。
