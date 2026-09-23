# FinQuant Hub 本地产品指标合同

> 对应任务：`PROD-003`  
> 版本：v1  
> 原则：本地优先、默认关闭、可清除、无外部 SDK、无敏感正文、不可改变金融数据口径

## 1. 最小方案

Phase 0/1 先使用 `PRODUCT_USABILITY_BASELINE.md` 的人工可用性记录，不为尚未稳定的界面提前写追踪代码。需要跨会话趋势时，再复用当前 aiosqlite、`system_settings` 和用户归属模式实现一个可关闭的本地聚合事件表；不引入 PostHog、Google Analytics 或其他外部服务/依赖。

推荐开关：`product_metrics_enabled=false`。关闭时不创建新事件；打开后仅记录本合同允许的枚举和数值。用户应能在 Settings 查看状态、清除全部本地产品事件并再次关闭。

## 2. 事件 allowlist

| event_name | 触发时机 | 必需字段 |
|---|---|---|
| `app_opened` | 产品壳首次可交互 | `session_id`, `occurred_at` |
| `core_task_started` | 用户明确启动分析/策略/组合任务 | `task_type`, `entry_surface`, `step_index=1` |
| `first_result_visible` | 真实结果或诚实失败状态首次可见 | `task_type`, `outcome`, `duration_ms`, `step_count` |
| `core_task_completed` | 任务达到下面定义的完成条件 | `task_type`, `outcome`, `duration_ms`, `step_count` |
| `result_saved` | 用户保存研究/回测/论文 | `task_type`, `object_type` |
| `workflow_continued` | 从结果继续到研究/策略/预警/论文 | `from_task`, `to_task` |
| `saved_research_opened` | 再次打开已保存研究 | `object_type`, `days_since_last_open_bucket` |
| `comprehension_checked` | 用户完成可选的四问自检 | `task_type`, `passed_count`（0–4） |

允许的公共字段：本地 `user_id`、随机 `session_id`、枚举 `route_group/task_type/outcome/error_category/quality_state`、整数 duration/steps/count，以及 `metadata_json` 的固定 allowlist。禁止自由文本扩展字段。

## 3. 完成定义

| task_type | `first_result_visible` | `core_task_completed` |
|---|---|---|
| `stock_analysis` | 行情与技术结果卡可见，或明确 `UPSTREAM_ERROR` | 用户已看到结论、至少一条证据/信号、风险/局限和下一步 |
| `strategy_validation` | completed/failed/cancelled 终态可见 | completed 时基准、最大回撤、成本、来源和警告均可见 |
| `portfolio_check` | 组合 PnL 或诚实缺数状态可见 | 风险 X 光上线后，用户能看到最大风险来源；上线前只计 `first_result_visible`，不计完成 |
| `deep_research` | 报告成功或明确模型/数据失败可见 | 报告含来源、反证/未知项并已保存或明确放弃 |

`UPSTREAM_ERROR` 可以结束等待但不算成功；不能因为返回 0 或空对象而计为 first value。

## 4. 指标公式

| 指标 | 分子 / 计算 | 分母 / 窗口 |
|---|---|---|
| Time to First Value | 首个成功 `core_task_completed` - `app_opened` 的中位数与 P90 | 首次会话；无完成单列为 censored |
| First Task Completion | 首次会话成功完成至少一个核心任务的用户数 | 有 `app_opened` 的首次会话用户数 |
| Result Comprehension | `passed_count >= 3` 的自检数 | 完成可选自检数；不得把未回答计失败 |
| Research Save Rate | `result_saved` 的研究任务数 | 成功完成的研究任务数 |
| Workflow Continuation | 15 分钟内出现 `workflow_continued` 的结果数 | 可继续的成功结果数 |
| Repeat Research | 7 日内 `saved_research_opened` 的对象数 | 7 日前创建且仍存在的研究对象数 |

样本数小于 10 时只显示计数和区间，不显示“提升/下降”结论。单用户本地产品不使用跨用户排行榜或伪统计显著性。

## 5. 可信度指标

这些指标优先通过确定性结果审计计算，不依赖用户行为事件：

- 关键数字具有 provider/source 与 as_of/report_period 的比例。
- 缺失值使用 `null/unknown` 而非 0 的比例。
- 回测同时显示基准、费用、复权/频率与警告的比例。
- AI 报告含反面证据、未知项和变化条件的比例。
- 上游失败正确返回 `UPSTREAM_ERROR/PARTIAL` 而非静默替代的比例。

2026-08-09 的 `PROD-064` 审计已把这些可信度要求追踪到当前计算与展示：单标的回测同时展示同窗买入持有基准、逐项成本、复权/频率和警告；缺失旧指标保持 `UNKNOWN`；Sharpe/Sortino 的零阈值显式可见。组合基线未覆盖最低佣金、印花税和 FX，Alpha 结果未扣交易成本，这些属于已披露限制，不能计为“完整成本覆盖”。审计证据见 `artifacts/productization/phase6/prod064-financial-contract-audit.md`。

## 6. 明确禁止记录

- 邮箱、验证码、Cookie、IP、API key、凭据状态明细。
- 股票代码、公司名称、持仓数量/成本、组合名称或资产金额。
- 聊天 prompt、模型回复、研究正文、论文、笔记、claim、新闻正文。
- 文件名、剪贴板/导入内容、浏览历史、完整 URL/query string。
- 原始异常栈或上游响应正文；仅记录稳定的 `error_category` 枚举。

## 7. 生命周期与用户控制

- 默认保留 90 天；只保留日聚合时可延长到 365 天。
- 清除动作必须只删除当前用户的产品事件，并在执行前明确范围。
- 导出只包含聚合计数和指标，不包含单事件正文或对象标识。
- 本地模式仍写内部 owner 的 `user_id`；生产模式按当前用户隔离。
- 产品事件失败必须 best-effort，不得阻断研究、回测或保存。

## 8. 当前基线与 Phase 1 比较

| 测量项 | 2026-08-09 baseline |
|---|---:|
| 桌面/窄屏首视口可见核心任务 | 0 / 3 |
| 侧栏同级入口 | 14 |
| 股票分析步骤 | 2 + 1 次错误恢复 |
| 策略验证步骤 | 3 |
| 组合首次真实结果步骤 | 9 |
| 组合任务完成 | 否；只能得到 PnL，不能识别最大风险来源 |

## 9. Phase 0–6 复测结果

| 测量项 | Phase 0 | Phase 6 当前事实 |
|---|---:|---:|
| 桌面/窄屏首视口可见核心任务 | 0 / 3 | 3 / 3 |
| 导航层级 | 14 个同级入口 | 15 个可选入口归入今日、研究、策略、组合、知识、系统工具六组；维护入口只在系统工具 |
| 组合能否回答主要风险来源 | 否 | 是；权重、相关矩阵、风险贡献和限制均可见 |
| 三条核心初始路由资产 | 2.75–2.77 MB | 1.60–1.62 MB，减少 41.36%–41.71% |
| 核心浏览器回归 | 无统一合同 | 11 条 Playwright；成功/空/错误、键盘、200% 等效视口和 390 px 边界 |

本轮没有实现产品事件表或跨会话遥测，因此不能声称 Time to First Value、保存率、继续率或 7 日重复研究率已经提升。只有当这些趋势对下一轮决策有价值时，才应创建独立任务实现默认关闭的本地事件表与 Settings 开关。
