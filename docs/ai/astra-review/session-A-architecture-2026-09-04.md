# Astra 会话 A 反馈 — 架构与逻辑正确性审查（2026-09-04）

> 执行：OpenAI GPT-6 Astra（Codex 应用，Medium 档）｜ 只读审查，原文存档
> 对应任务书：`docs/ai/ASTRA_REVIEW_TASK_A.md`
> 状态：已记录，待维护者抽核断言并决定是否开 BACKLOG

## 会话 A 结论

**五图可用于理解系统轮廓，但不能作为当前实现的准确契约。主要问题集中在生命周期、SSE 清理、事务边界及工具执行上下文。**

### A1 图码一致性

1. **architecture：部分一致。**
   图写“22 Router、52 表、13 本地工具”。源码静态统计为 **22 Router、135 条公开路径、169 个 HTTP 操作、49 张逻辑表、17 个本地工具**。schema 已升至 v24，移除了三张遗留组合表；新增四个 A 股工具尚未反映在图中。单连接、四 Agent 并行及条件式静态托管成立。
   证据：[architecture.json:51](/E:/Code_file/Projects/finquant-hub/archify-output/specs/architecture.json:51)、[architecture.json:70](/E:/Code_file/Projects/finquant-hub/archify-output/specs/architecture.json:70)、[architecture.json:87](/E:/Code_file/Projects/finquant-hub/archify-output/specs/architecture.json:87)、[main.py:135](/E:/Code_file/Projects/finquant-hub/backend/app/main.py:135)、[database.py:264](/E:/Code_file/Projects/finquant-hub/backend/app/database.py:264)、[database.py:2108](/E:/Code_file/Projects/finquant-hub/backend/app/database.py:2108)、[tools_definitions.py:636](/E:/Code_file/Projects/finquant-hub/backend/app/agent/tools_definitions.py:636)。

2. **architecture 安全边界：表述过强，视觉边界也有误导。**
   “21 个业务 Router 附加认证”成立；研究报告读取确有 `user_id` 条件，但认证依赖本身不自动给 SQL 添加隔离条件，不能据此证明“全站完全隔离”。“仅本机可访问”取决于启动绑定配置。HTML 的本地矩形还把外部 LLM、行情节点包在内部，与规格的 `wraps` 清单不符。
   证据：[architecture.json:104](/E:/Code_file/Projects/finquant-hub/archify-output/specs/architecture.json:104)、[architecture.json:217](/E:/Code_file/Projects/finquant-hub/archify-output/specs/architecture.json:217)、[architecture.html:5033](/E:/Code_file/Projects/finquant-hub/archify-output/architecture.html:5033)、[auth.py:42](/E:/Code_file/Projects/finquant-hub/backend/app/routers/auth.py:42)、[research.py:448](/E:/Code_file/Projects/finquant-hub/backend/app/routers/research.py:448)、[config.py:29](/E:/Code_file/Projects/finquant-hub/backend/app/config.py:29)。

3. **workflow：主干一致，失败分支不一致。**
   四 Agent 独立并行、随后主编汇总成立。但“解析失败→失败落库”错误：解析在建报告之前失败，不会产生报告。“主编失败→failed”也不准确：主编发生 `LLMError` 后，代码发出 `agent_failed`，仍继续构建并完成报告。另外，`tool_call` 在该 Agent 完整返回后才集中推送，并非调用发生时实时推送。
   证据：[workflow.json:69](/E:/Code_file/Projects/finquant-hub/archify-output/specs/workflow.json:69)、[workflow.json:87](/E:/Code_file/Projects/finquant-hub/archify-output/specs/workflow.json:87)、[research.py:245](/E:/Code_file/Projects/finquant-hub/backend/app/routers/research.py:245)、[research_orch.py:180](/E:/Code_file/Projects/finquant-hub/backend/app/services/research_orch.py:180)、[research_orch.py:245](/E:/Code_file/Projects/finquant-hub/backend/app/services/research_orch.py:245)。

4. **sequence：事件名、调用顺序和职责归属不一致。**
   实际是 `report_started → agent_* / tool_call → report_progress → done`，不是 `completed`；数据库状态才叫 `completed`。Agent 先调用 LLM，由模型选择工具，再进入工具循环；图画成先取数后调用 LLM。主编要求输出 JSON，13 章结构由报告构建器生成；报告落库由 Router 执行。图称“类型驱动校验”，研究路径却直接调用 `tool.run()`，绕过 `ToolRegistry.dispatch()`。
   证据：[sequence.json:53](/E:/Code_file/Projects/finquant-hub/archify-output/specs/sequence.json:53)、[sequence.json:59](/E:/Code_file/Projects/finquant-hub/archify-output/specs/sequence.json:59)、[sequence.json:88](/E:/Code_file/Projects/finquant-hub/archify-output/specs/sequence.json:88)、[research.py:258](/E:/Code_file/Projects/finquant-hub/backend/app/routers/research.py:258)、[research_orch.py:98](/E:/Code_file/Projects/finquant-hub/backend/app/services/research_orch.py:98)、[research_roles.py:120](/E:/Code_file/Projects/finquant-hub/backend/app/prompts/research_roles.py:120)、[tools.py:167](/E:/Code_file/Projects/finquant-hub/backend/app/agent/tools.py:167)。

5. **dataflow：代理策略成立，数据质量与持久化链路被夸大。**
   中文源 `trust_env=False`、Yahoo `trust_env=True` 成立。但并非所有入口都经过熔断：`search()` 未调用 breaker；东财搜索在这里仅收 A 股，Yahoo 也覆盖港股及 A 股回退。图中的“主编→evidence_objects”没有在所审研究主路径找到对应写入；审计工具只返回抽样或核验结果。候选记忆是显式开关控制的可选行为。图称缺失保留 UNKNOWN，但行情解析仍多处把缺失值变为零。
   证据：[dataflow.json:62](/E:/Code_file/Projects/finquant-hub/archify-output/specs/dataflow.json:62)、[dataflow.json:69](/E:/Code_file/Projects/finquant-hub/archify-output/specs/dataflow.json:69)、[market_data.py:212](/E:/Code_file/Projects/finquant-hub/backend/app/services/market_data.py:212)、[market_data.py:274](/E:/Code_file/Projects/finquant-hub/backend/app/services/market_data.py:274)、[market_data.py:977](/E:/Code_file/Projects/finquant-hub/backend/app/services/market_data.py:977)、[tools_definitions.py:270](/E:/Code_file/Projects/finquant-hub/backend/app/agent/tools_definitions.py:270)、[memory_capture.py:102](/E:/Code_file/Projects/finquant-hub/backend/app/services/memory_capture.py:102)。

6. **lifecycle：核心转换明显不一致。**
   CHECK 确实允许五个 job 状态，但 cron 到期直接认领为 `running`；`queued` 来自“立即运行”接口。完成和失败都会更新 job 的 `last_status`，并不只更新 run；完成后不会自动回 `idle`，重新启用也不会重置为 `idle`。启用中的失败作业可以再次到期执行。lease 回收针对**过期 running run**，不是任意 failed run；disabled 只限制自动到期选择，手动执行入口没有该限制。
   证据：[lifecycle.json:35](/E:/Code_file/Projects/finquant-hub/archify-output/specs/lifecycle.json:35)、[lifecycle.json:56](/E:/Code_file/Projects/finquant-hub/archify-output/specs/lifecycle.json:56)、[lifecycle.json:64](/E:/Code_file/Projects/finquant-hub/archify-output/specs/lifecycle.json:64)、[research_jobs.py:182](/E:/Code_file/Projects/finquant-hub/backend/app/services/research_jobs.py:182)、[research_jobs.py:317](/E:/Code_file/Projects/finquant-hub/backend/app/services/research_jobs.py:317)、[research_jobs.py:357](/E:/Code_file/Projects/finquant-hub/backend/app/services/research_jobs.py:357)、[research_jobs.py:431](/E:/Code_file/Projects/finquant-hub/backend/app/services/research_jobs.py:431)、[settings.py:239](/E:/Code_file/Projects/finquant-hub/backend/app/routers/settings.py:239)。

### A2 逻辑正确性

1. **P1｜共享连接不能保证 job 事务原子性——隔离探针已确认机制。**
   job 使用自己的 `_RUNTIME_LOCK` 和 `BEGIN IMMEDIATE`，但其他请求的 `database.execute()` 不参与该锁，并直接提交同一连接。其间插入普通写入，可以提前提交 job 的部分状态；之后 rollback 无法撤销。探针中，事务内记录在另一写入提交、再回滚后仍存在。取消异常也不在这些 `except Exception` 的回滚范围内。
   证据：[research_jobs.py:154](/E:/Code_file/Projects/finquant-hub/backend/app/services/research_jobs.py:154)、[research_jobs.py:229](/E:/Code_file/Projects/finquant-hub/backend/app/services/research_jobs.py:229)、[database.py:2175](/E:/Code_file/Projects/finquant-hub/backend/app/database.py:2175)、[database.py:2222](/E:/Code_file/Projects/finquant-hub/backend/app/database.py:2222)。

2. **P1｜SSE 断连可能留下永久 running 报告——隔离探针已确认。**
   `finally` 中关闭生成器、查询状态和失败落库均无取消保护。使用原始 `event_stream` 与已安装的 `EventSourceResponse` 模拟断连，结果为 `status=running、fail_called=False`。这是取消作用域打断清理，不是缺少 `finally`。
   证据：[research.py:300](/E:/Code_file/Projects/finquant-hub/backend/app/routers/research.py:300)、[research.py:311](/E:/Code_file/Projects/finquant-hub/backend/app/routers/research.py:311)、[sse.py:479](/E:/Code_file/Projects/finquant-hub/backend/.venv/Lib/site-packages/sse_starlette/sse.py:479)。

3. **P1｜“立即运行”存在先检查后更新竞态——静态可达，HTTP 并发复现待核。**
   接口读取非 running 状态后，无条件写 `queued`。若期间另一执行者已认领，旧请求可把 running 覆盖为 queued；第二个不同幂等键随后又能通过认领条件，形成同一 job 的两个 running run。自动轮询选出作业后再停用，也缺少认领时的启用状态复查。
   证据：[settings.py:239](/E:/Code_file/Projects/finquant-hub/backend/app/routers/settings.py:239)、[settings.py:246](/E:/Code_file/Projects/finquant-hub/backend/app/routers/settings.py:246)、[research_jobs.py:159](/E:/Code_file/Projects/finquant-hub/backend/app/services/research_jobs.py:159)、[research_jobs.py:184](/E:/Code_file/Projects/finquant-hub/backend/app/services/research_jobs.py:184)。

4. **P2｜工具线程丢失用户上下文，并绕过参数类型校验——隔离探针已确认。**
   原始 `_execute_tool_call` 中，调用方设置的 ContextVar 在线程内变成 `None`；声明为 integer 的参数传入字符串仍执行成功。实际新闻工具因此进入空凭据分支，跳过用户配置。这里确认的是上下文丢失，**未发现读取另一用户凭据的证据**。
   证据：[research_orch.py:26](/E:/Code_file/Projects/finquant-hub/backend/app/services/research_orch.py:26)、[research_orch.py:49](/E:/Code_file/Projects/finquant-hub/backend/app/services/research_orch.py:49)、[tools_definitions.py:314](/E:/Code_file/Projects/finquant-hub/backend/app/agent/tools_definitions.py:314)。

5. **P2｜主编失败仍被归为完成。**
   主编 `LLMError` 后仍发 `agent_completed`，随后 `done`，Router 将报告置 completed 并发布成功通知。构建器保留了 `model_output_status=unknown`，但顶层状态没有表达降级。行为已确认；是否允许“无主编审计的降级完成”，产品契约**待核**。
   证据：[research_orch.py:245](/E:/Code_file/Projects/finquant-hub/backend/app/services/research_orch.py:245)、[research_orch.py:259](/E:/Code_file/Projects/finquant-hub/backend/app/services/research_orch.py:259)、[research.py:274](/E:/Code_file/Projects/finquant-hub/backend/app/routers/research.py:274)、[report_builder.py:331](/E:/Code_file/Projects/finquant-hub/backend/app/services/report_builder.py:331)。

6. **P2｜重启恢复存在持久化窗口。**
   报告 INSERT 与 run 的 `report_id` 回填分别提交，期间中断会留下反向链接不完整的报告。报告 completed 又先于候选记忆及 run 引用持久化；恢复看到 completed report 后只对齐终态，不补齐这些步骤。具体数据受损实例**待核**。另，heartbeat 丢失后仅结束心跳，研究任务继续运行，缺少明确的失租终止处理。
   证据：[scheduler.py:97](/E:/Code_file/Projects/finquant-hub/backend/app/services/scheduler.py:97)、[scheduler.py:129](/E:/Code_file/Projects/finquant-hub/backend/app/services/scheduler.py:129)、[scheduler.py:272](/E:/Code_file/Projects/finquant-hub/backend/app/services/scheduler.py:272)、[research_jobs.py:378](/E:/Code_file/Projects/finquant-hub/backend/app/services/research_jobs.py:378)。

7. **P2｜行情接口存在确定的语义错误。**
   分钟 K 线在新浪失败后会调用只请求 `day` 的腾讯接口，可能用日线满足分钟请求；新浪缺失 PE/PB 等被返回为零；上证指数配置为 `sh000001`，却进入股票代码校验并因交易所不匹配被拒绝。三者均可从调用链直接确认。
   证据：[market_data.py:23](/E:/Code_file/Projects/finquant-hub/backend/app/services/market_data.py:23)、[market_data.py:603](/E:/Code_file/Projects/finquant-hub/backend/app/services/market_data.py:603)、[market_data.py:977](/E:/Code_file/Projects/finquant-hub/backend/app/services/market_data.py:977)、[market_overview.py:73](/E:/Code_file/Projects/finquant-hub/backend/app/services/market_overview.py:73)、[market_data.py:143](/E:/Code_file/Projects/finquant-hub/backend/app/services/market_data.py:143)、[market_data.py:553](/E:/Code_file/Projects/finquant-hub/backend/app/services/market_data.py:553)。

### A3 优化点

1. **事务统一协调。** 问题：局部锁无法保护共享连接。证据：[database.py:2222](/E:/Code_file/Projects/finquant-hub/backend/app/database.py:2222)。建议：在现有单连接、原始 SQL 架构内统一事务所有权、提交入口和取消回滚。收益：避免跨请求提前提交及残留事务。

2. **统一 job/run 转换入口。** 问题：排队、认领、结束分散，存在无条件状态覆盖。证据：[settings.py:246](/E:/Code_file/Projects/finquant-hub/backend/app/routers/settings.py:246)。建议：采用带旧状态条件的更新，认领时复核自动执行资格，失租后停止执行并限制终态写入。收益：减少重复运行和状态互相覆盖。

3. **让 SSE 清理可完成。** 问题：断连取消会再次中断清理。证据：[research.py:300](/E:/Code_file/Projects/finquant-hub/backend/app/routers/research.py:300)。建议：对必要的生成器关闭、失败落库采用有界取消保护，补原生断连回归。收益：避免永久 running 与后台任务残留。

4. **收敛工具执行路径。** 问题：线程路径绕过上下文和校验，行情工具还逐次新建客户端。证据：[research_orch.py:49](/E:/Code_file/Projects/finquant-hub/backend/app/services/research_orch.py:49)、[tools_definitions.py:55](/E:/Code_file/Projects/finquant-hub/backend/app/agent/tools_definitions.py:55)。建议：复用现有 dispatch 校验，显式传递用户上下文，区分异步 I/O 与真正阻塞工具。收益：恢复用户配置、减少连接开销并保持源健康状态。

5. **把轮询与长任务等待分开。** 问题：“30s 轮询”实际还要等待整个到期批次完成，批次内最多 20 个 job 直接 gather。证据：[scheduler.py:342](/E:/Code_file/Projects/finquant-hub/backend/app/services/scheduler.py:342)、[scheduler.py:358](/E:/Code_file/Projects/finquant-hub/backend/app/services/scheduler.py:358)。建议：复用进程内任务管理和并发上限，轮询只负责认领调度。收益：降低慢研究对其他作业和盘后周期的延迟。

6. **为图和数据契约增加可重复校验。** 问题：图的计数、事件、状态转换以及 UNKNOWN 承诺已漂移。证据：[lifecycle.json:64](/E:/Code_file/Projects/finquant-hub/archify-output/specs/lifecycle.json:64)、[market_data.py:977](/E:/Code_file/Projects/finquant-hub/backend/app/services/market_data.py:977)。建议：快照记录源码版本，自动校验路由/工具/表计数；补状态、缺失值和跨源 K 线频率契约。收益：降低维护漂移，避免错误数据被当作有效结果。

### A4 诚实声明

- 已完整读取任务书，按清单核对五份 specs、对应 HTML、既有五图截图及指定源码，并追查必要调用方。
- **全程只读：未改文件、未 commit、未安装依赖、未删除、未起服务。** 未执行会写缓存或产物的测试、构建、迁移及交接日志命令。
- 验证采用静态 AST/DDL/HTML 对照及内存隔离探针；未访问真实数据库、行情或 LLM，未宣称完成真实并发、生产断连或全站安全验收。不确定处已标“待核”。
- 收尾工作树干净；期间其他会话仅修改任务书档位，源码未变。历史记忆仅用于定位，结论以本次源码为准。
- 以上缺陷均只记录。下一步由维护者决定是否建立 BACKLOG。
