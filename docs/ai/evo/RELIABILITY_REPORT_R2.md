# RELIABILITY_REPORT（第二轮·补做）

- 审计员：SUBAGENT D2 — RELIABILITY_SECURITY_AUDITOR（独立上下文，只读）
- 审计预算：实读 5 个文件（`llm_client.py`、`research_jobs.py`、`research_orch.py`(节选)、`scheduler.py`(节选)、`start.bat`）
- 未读文件（相关结论标"未验证"）：`database.py`、`report_builder.py`、`routers/research.py`、`config.py`、`docs/ai/evo/PROJECT_BRIEF.md`
- 结论原则：以行号为证据；无证据处显式标注。

---

## 最危险的 3 个场景（+为什么）

### D1（P0）重试上限把"正常"任务永久钉死，且完全静默

`claim_research_job` 在**已经**把 job 置为 `last_status='running'` 之后才做上限拦截，然后 `return None` 直接提交事务。

- 置位：`backend/app/services/research_jobs.py:174-181`（`UPDATE ... SET last_status='running' ...`，`cursor.rowcount != 1` 才 return）
- 拦截：`backend/app/services/research_jobs.py:196-197`（`if attempt > _MAX_RETRY_ATTEMPTS: return None`）
- 排除：`backend/app/services/research_jobs.py:432`（`due_research_jobs` 明确过滤 `last_status!='running'`）

`return None` 位于 `async with database.exclusive_transaction():` 块内（`research_jobs.py:153`）且是**正常返回而非抛异常**，所以事务**提交**——job 永远停在 `running`，却**没有任何 run 行**。后果：

1. `due_research_jobs` 从此不再返回该 job（`:432`）——定时研究**永久停止**；
2. `recover_stale_research_runs` 只扫描 `scheduled_research_runs` 里 `status='running' AND lease_expires_at<=?` 的行（`research_jobs.py:335-341`），而此路径**没有创建 run 行**，所以恢复机制**永远不会**把它救回来；
3. 前端看到的是一份卡在"运行中"的任务，而 `last_error` 仍为 `NULL`（`:175` 刚清空），用户无从判断；
4. 全程无日志、无事件、无通知：`claim_research_job` 不写 event（对比正常路径 `:215-224` 会写 `claimed`/`retry_started`），`run_research_job` 只 `return False`（`scheduler.py:346-347`），`run_due_research_jobs` 仅把它计入 `sum(results)`（`scheduler.py:398`），与"当前无到期任务"**完全不可区分**。

**为什么最危险**：这是近期改动（G-02）**新引入**的缺口，不是历史债；触发条件是日常路径，一旦踩中，功能静默死亡且无法自愈，非技术用户几乎不可能发现。

### D2（P0）`quality=degraded` 不落库，降级报告被持久化为"completed"

`research_orch` 在 `done` 顶层发出 `quality`：

- 置位点：`backend/app/services/research_orch.py:207`（`degraded = False`）、`:232`（agent LLMError）、`:262`（node_failed）、`:293`（lead LLMError）
- 输出：`backend/app/services/research_orch.py:324-338`，`"quality": "degraded" if degraded else "audited"`（`:329`），随 `yield "done", done_payload`（`:338`）

但消费端只取 `report` 与 `agent_results`，**完全不读 `quality`**：

- `backend/app/services/scheduler.py:171-183`：`UPDATE research_reports SET report_data=?, agent_results=?, status='completed' ...` —— 只序列化 `payload.get("report")`（`:178`）和 `payload.get("agent_results")`（`:179`）。`quality` 既不在 `report_data` 里（`:326` 是 `done_payload` 的兄弟字段），也没被单独写库，**就此丢弃**。
- `backend/app/services/scheduler.py:224`：`publish_research_status(report_id, "completed", ...)` —— 降级报告与正常报告的状态**完全一致**。
- `backend/app/services/scheduler.py:208-212`：证据链状态默认 `"UNKNOWN"`，只有存在 `ev_` 候选时才标 `OK`/`PARTIAL`；零证据的降级报告仍以 `completed` 落地。
- `backend/app/services/research_jobs.py:295-296`：`evidence_status` 只在**非 completed** 时被写成 `'UPSTREAM_ERROR'`，降级完成态**不受影响**。

**为什么最危险**：SSE 实时观看者能看到降级提示，但**任何从数据库重新加载的报告都显示为一次干净的"completed 成功报告"**。这正是"失败路径仍产出看起来成功的报告"的教科书形态，且与 G-03 的目标直接相悖——语义加在了错误的层（生成层），没有穿透到持久层。

### D3（P1，可升级为 P0）工具执行全灭仍算 `audited` —— 与 LLM 健康无关的静默成功通道

`chat_with_tools_loop` 把工具异常吞成**普通文本**：

- `backend/app/services/llm_client.py:318-322`：`except Exception as e: result_text = f"工具执行异常：{e}"` —— 不抛、不标记、不计数。
- 该结果作为正常 tool 消息回灌（`:342-346`），模型会照常写出流畅的分析段落。
- `research_orch` 的降级判定**只看 `LLMError`**（`:227`、`:291`）与 DAG `node_failed`（`:259-263`）。工具失败走的是 `tool_completed` 事件（`:236-241`），**没有任何降级信号**。

后果：若 13 个本地工具（行情源、DB、指标）整体不可用（离线、代理 7897 抖动、SQLite 被锁），4 个 agent 仍各自产出"看起来有依据"的文字，`quality` 依旧 `audited`（`:329`）。这是**独立于上游 LLM 的第二条静默成功通道**，而近期改动只覆盖了 LLM 通道。

---

## 逐项检查

### 1. 重试放大 / Retry amplification

- **现状**：`llm_client.py:20-22`（`_RETRYABLE_STATUS={429,500,502,503,504}`、`_MAX_ATTEMPTS=3`、`_BACKOFF_BASE_SECONDS=0.5`）；重试循环 `llm_client.py:102-128`；睡眠 `llm_client.py:125`。
- **是否受控**：部分。只对可重试故障重试、4xx 直返（`:120-121`）是正确纪律。
- **疏忽点**：
  1. **无抖动**：`llm_client.py:125` 是纯确定性 `0.5 * 2**(attempt-1)`。研究编排的 4 个 agent 是**并行**的（`research_orch.py:252-253` DAG 并行流），4 路请求会**同步**在 +0.5s / +1.5s 齐射，形成自造惊群。
  2. **不读 `Retry-After`**：`llm_client.py:119-123` 只看状态码，丢掉了 429 响应体里供应商给出的等待时长；上游说"10 秒后再来"，代码 0.5 秒就重试，3 次尝试**大概率全部浪费**，反而加深限流。
  3. **无全局熔断**：`llm_client.py` 全篇无跨实例共享状态（对比 `market_data.py` 有 circuit breaker，本项目其他 I/O 路径已有此模式）。每个 `LLMClient` 独立重试，上游持续 429 时**没有任何东西让它停下来**。
  4. **放大倍数是乘法级的**：单次工具循环最多 `max_rounds` 次调用再补一次（`llm_client.py:282-283` 与 `:350`，默认 `max_rounds=5` → 6 次调用）× 每次 3 次尝试 = **每 agent 18 次上游请求**；4 agent + 1 lead = **最坏 ~90 次**请求，而正常只需 ~30 次。再叠加调度器并发（`scheduler.py:389-397` 对所有到期 job `gather`）与 `run_post_market_analysis` 的 `SCHEDULER_CONCURRENCY` 信号量（`scheduler.py:273`），一旦上游限流，本系统会主动把限流放大数倍。
  5. **超时叠加**：单次 `timeout=120.0`（`llm_client.py:42`，用于 `:87`），3 次尝试最坏 ≈ 3×120+1.5 ≈ **361s**；工具循环 6 轮最坏 ≈ 36 分钟/agent。租约仅 60s（`research_jobs.py:149`），靠心跳任务维持（`scheduler.py:319-325` 每 20s 一次）。心跳是独立 asyncio 任务，正常可保活；但**任一事件循环阻塞（如同一进程内的同步 I/O）都会让租约到期**，被 `recover_stale_research_runs`（`research_jobs.py:335-341`）判为 `LEASE_EXPIRED` 并置 `research_reports.status='failed'`（`:381-385`），而此时 agent 可能仍在跑——**同一 job 出现"已失败"与"仍在消耗 API"并存**。是否真的发生取决于事件循环阻塞情况：**未验证**（未读 `database.py` 与同步工具实现）。
  6. **POST 无幂等**：`llm_client.py:111-125` 对超时也重试，但 POST `/chat/completions` 非幂等——客户端 120s 超时后上游可能已经完成计费生成，重试即**双倍扣费**。无请求级去重、无 idempotency key。
- **建议**：(a) 加抖动 `random.uniform(0, base*2**n)`；(b) 解析并遵守 `Retry-After`，上限封顶；(c) 引入进程级 LLM 熔断器（连续 N 次可重试失败 → 短路 `T` 秒，直接抛 `LLMError`），复用 `market_data` 既有模式；(d) 对 429 单独设更长的基础退避（如 ≥2s）；(e) 为整轮研究加"总上游调用预算"，超预算即降级收尾而非继续重试。
- **优先级**：P1（429 场景下 P0，但触发依赖外部上游状态）。

### 2. 重试上限误伤 / 失败任务静默消失

- **现状**：`research_jobs.py:19`（`_MAX_RETRY_ATTEMPTS = 5`）；拦截 `research_jobs.py:196-197`；`attempt` 计算 `research_jobs.py:192`（`int(latest["attempt"]) + 1`）；`latest` 取自 `research_jobs.py:183-187`（`ORDER BY attempt DESC, id DESC LIMIT 1`，**不区分成功/失败**）。
- **是否受控**：**否，且实现与本意相反**。
- **疏忽点**：
  1. **语义错误（最严重）**：注释声称"下次定时计划或用户手动重跑仍可重新计数"（`research_jobs.py:195`），但代码里**没有任何重置 `attempt` 的地方**——`attempt` 由该 job 的**最后一条 run 行**推导（`:183-192`），只增不减。因此触发条件不是"5 次**失败**"，而是"该 job 累计**执行过** 5 次"——**一个每天成功的高价值定时任务，第 6 次调度日起永久失效**。注释与代码不符，是明确的实现缺陷而非设计取舍。
  2. **僵尸 job**：如 D1 所述，`last_status='running'` 已提交且无 run 行（`:174-181` + `:196-197`），`due_research_jobs` 排除（`:432`），`recover_stale_research_runs` 覆盖不到（`:335-341`）。**无自愈路径**。
  3. **静默消失**：拦截路径不写 `scheduled_research_run_events`（对比正常路径 `:215-224`）、不写 `last_error`（`:175` 刚置 `NULL`）、不打日志（`scheduler.py:346-347` 静默 `return False`）、不上报（`scheduler.py:398` 只做求和）。用户在 UI 上看到的是"运行中"，实际上任务早已死透。
  4. **对 `idempotency_key` 的作用域混淆**：`:161-164` 的 replay 判定基于同一 `idempotency_key`，而调度器每次可能传入不同 key（`scheduler.py:339-341`、`:392-394` 用 `next_run_at` 拼 key）——所以"completed 幂等回放"对定时路径基本不生效，失败计数会持续累积到上限。**行为未验证**（未读该 key 的写入方）。
- **建议**：(a) 把 attempt 与"连续失败次数"解耦：新增 `consecutive_failures` 列，成功即清零；(b) 上限判定**移到 `UPDATE ... SET last_status='running'` 之前**，或改为抛出受控异常回滚事务，杜绝"已置 running 却无 run 行"；(c) 拦截时写一条 `retry_exhausted` 事件 + `last_error` + WARNING 日志，并在 UI 上显式提示"超过重试上限，已暂停，请手动重跑"；(d) 增加"僵尸 job 恢复"：对 `last_status='running'` 且不存在 running run 行的 job 做 reconcile。
- **优先级**：P0。

### 3. 降级语义漏洞

- **现状**：`research_orch.py:207`/`:232`/`:262`/`:293` → `:329` → `:338`；消费端 `scheduler.py:160-183`。
- **是否受控**：**否**（见 D2）。
- **疏忽点**：
  1. `quality` 在生产端是 `done_payload` 顶层字段（`research_orch.py:324-329`），而持久化只取 `report`/`agent_results`（`scheduler.py:178-179`）→ **字段被丢弃**，DB 无降级痕迹。P0。
  2. 降级报告与正常报告状态同为 `completed`（`scheduler.py:224`），用户从历史列表无法区分。
  3. **降级白名单过窄**：只捕 `LLMError`（`research_orch.py:227`、`:291`）。若上游返回 200 但响应体非预期，`llm_client.py:151-152`（`data["choices"][0]["message"]`）与 `:178`、`:220` 会抛 `KeyError`/`TypeError`/`json.JSONDecodeError`——**不是 `LLMError`**，于是穿透到 DAG 层被记为 `node_failed`（`research_orch.py:259-263`）并 `yield "error"`，最终被 `scheduler.py:164-170` 判为**整体失败**。同一类上游异常，有时降级、有时硬失败，语义不一致。
  4. **工具失败不降级**（见 D3）：`llm_client.py:318-322` 吞异常为文本，`research_orch` 无感知。
  5. **工具循环耗尽不降级**：`llm_client.py:348-353` 发出 `tool_loop_exhausted`，但 `research_orch.py:254` 只转发 5 类事件（`agent_started/tool_call/agent_completed/error/agent_failed`），**`tool_loop_exhausted` 与 `tool_failed` 未被消费** → 轮到上限被迫收尾也标 `audited`。
  6. **主编辑返回空串不降级**：`research_orch.py:291-294` 仅在抛 `LLMError` 时把 `lead_content` 置空；若 lead 正常返回**空内容**，`degraded` 仍为 `False`，报告照常 `audited`（`:301-305`、`:329`）。
  7. **`routers/research.py` 侧的降级提示未验证**（未读该文件）——前端是否真的消费 `quality` 无法确认，标注"未验证"。
- **建议**：(a) 把 `quality` 写进 `research_reports`（新增列或塞入 `report_data.quality`）并在 `publish_research_status` 里以独立状态/字段透出；(b) `except Exception` 兜底：凡是 agent/lead 环节的非预期异常一律按降级处理而非整体失败（区分"配置类致命错误"如 `:196-199` 的 `get_client` 失败）；(c) 统计工具失败率，超阈值置 `degraded`；(d) 订阅 `tool_loop_exhausted`/`tool_failed`；(e) lead 内容为空即降级。
- **优先级**：P0（`:329` 落库缺口），其余 P1。

### 4. 启动前自动备份

- **现状**：`start.bat:91-103`（备份段）；`start.bat:94`（DB 不存在则跳过）；`start.bat:96`（PowerShell `Copy-Item` + 7 份计数提示）；`start.bat:97-99`（成功提示）；`start.bat:101-103`（失败仅提示，继续启动）。
- **是否受控**：失败不阻塞启动——**这点做对了**（`start.bat:97` → `:101-103` → `:105`）。
- **疏忽点**：
  1. **WAL 一致性存疑**：`:92` 注释断言"服务未启动时 WAL 已落盘，安全"，但 `:96` **只复制 `finquant.db`，不含 `-wal`/`-shm`**。`:22` 的端口检查只证明 8000 空闲，**不证明没有其他进程持有该 DB**（另一个 uvicorn 实例、pytest、任何本机脚本）。若上一次异常退出遗留非空 `finquant.db-wal`，此时的主库是**过期快照**，备份的正是最旧的版本——恰好在最需要备份的场景（崩溃恢复）失效。**SQLite WAL 下裸拷贝主库不是一致性快照**，这是确定的原理性问题，无需额外证据。
  2. **无完整性校验**：备份后不跑 `PRAGMA integrity_check`，坏备份与好备份在用户眼里无区别（`:98` 一律打印"已备份"）。
  3. **磁盘满**：`Copy-Item` 失败 → `:96` 的 `Test-Path` 判否 → `exit 1` → `:97` → `:101-103` 继续启动。受控；但**数据库本身写满磁盘时无任何预警**（未验证 `database.py` 是否有检查）。
  4. **无上限清理**：`:96` 超过 7 份时**只打印提示**，不删除（遵守回收站铁律，可理解）。但 DB 持续增长 + 每日备份 = 磁盘单调耗尽，且提示出现在用户基本不看的控制台。P2。
  5. **同步阻塞启动**：`:95-96` 是同步调用且**无超时**，大库（GB 级）会显著拖慢启动，用户会误以为"卡死"。
  6. **覆盖路径不完整**：只有 `start.bat` 做备份。直接 `uvicorn app.main:app`、Docker、pytest 或未来任何迁移入口**都不备份**——而 schema 迁移是手写的（CLAUDE.md 技术债第 1 条）。P1（未验证迁移是否在启动时执行）。
- **建议**：(a) 改用 `sqlite3` 在线备份（`VACUUM INTO 'dest.db'` 或 Python `sqlite3.Connection.backup()`，走 `backend\.venv`），天然处理 WAL；(b) 备份后加 `PRAGMA quick_check` 校验；(c) 备份前检查可用磁盘空间（<1.5×DB 大小则跳过并警告）；(d) 把备份入口下沉到应用内的迁移前钩子，覆盖所有启动方式；(e) 超限只提示的现状至少改为写入日志文件。
- **优先级**：P1（一致性），P2（其余）。

### 5. 密钥泄漏

- **现状**：`llm_client.py:99`（`body.replace(self.api_key, "[已隐藏]")`）；`start.bat:82-89`（只复制模板、不读取密钥）。
- **是否受控**：部分。
- **疏忽点**：脱敏只针对 `self.api_key` 一种形态（`llm_client.py:99`）。若响应体以其他形式回显凭证（URL query、`sk-` 前缀变体、代理注入的 header 回显、多个 key 轮换时的旧 key），将原样进入 `LLMError` 文案 → 经 `research_orch.py:233`/`:294` 的 `str(exc)` → SSE → **写入 `scheduled_research_run_events.payload_json`**（`research_jobs.py:60-64`；`_safe_event_payload` 仅按键白名单保留 `error` 并截断 500 字符，`research_jobs.py:44-48`）。即"密钥可能落库并在 UI 回显"。P1（若确认可达；**未验证**具体供应商是否会回显）。
- **建议**：脱敏改为"任何 `Bearer <token>` / 长 token 正则"统一替换；对 `LLMError` 文案做集中脱敏；日志层禁用 `Authorization` 记录。
- **优先级**：P1。

### 6. 任务中断 / 进程崩溃

- **现状**：`scheduler.py:359-380`（取消/异常 → `finish_research_run` 写终态）；`scheduler.py:227-247`（流中断兜底 `_mark_research_failed`）；`research_jobs.py:321-405`（租约过期恢复）。
- **是否受控**：基本受控（`SIGKILL` 后靠租约恢复），**但被 D1 的僵尸路径击穿**。
- **疏忽点**：`run_research_job` 的 `except Exception` 只包住 `_run_and_persist_target`（`scheduler.py:355-369`）；若 `finish_research_run` 自身抛错（DB 锁、磁盘满），`finally` 仍会取消心跳（`:375-380`），而 run 会停在 `running` 直到租约过期——可恢复，可接受。另外 `analyze_target` 吞掉所有异常（`scheduler.py:281-282`），盘后批量分析的单点失败只能靠日志发现，UI 无感。
- **优先级**：P2。

### 7. 迁移

- **现状**：手写增量迁移（CLAUDE.md 技术债 #1）；备份只在 `start.bat`。
- **是否受控**：**未验证**（未读 `database.py`）。
- **疏忽点**：若迁移在 `lifespan` 内执行（`AGENTS.md` 描述"lifespan init"），则直接 `uvicorn` 启动 = **无备份迁移**。迁移失败的回滚策略未知。
- **建议**：迁移前强制备份 + 迁移记录表 + 失败即拒绝启动。
- **优先级**：P1（需先验证）。

---

## 近期改动引入的新风险（逐条）

| # | 改动 | 新引入风险 | 证据 | 优先级 |
|---|------|-----------|------|--------|
| R1 | G-02 `_MAX_RETRY_ATTEMPTS=5` | **僵尸 job**：`last_status='running'` 先提交、后 `return None`，无 run 行 → 永久卡死且无恢复路径、无用户可见错误 | `research_jobs.py:174-181` + `:196-197` + `:432` + `:335-341` | **P0** |
| R2 | G-02 同上 | **正常任务误伤**：`attempt` 按 job 全历史单调累加（`ORDER BY attempt DESC`，不分成功失败），注释声称可重置但代码无重置点 → 第 6 次调度起永久失效 | `research_jobs.py:183-192` + `:195` + `:196` | **P0** |
| R3 | G-02 同上 | **静默消失**：拦截路径无事件、无 `last_error`、无日志，与"无到期任务"不可区分 | `research_jobs.py:196-197` vs `:215-224`；`scheduler.py:346-347`、`:398` | **P0** |
| R4 | G-03 降级语义 | **降级标记不落库**：`quality` 在 `done_payload` 顶层，持久化只取 `report`/`agent_results`，降级报告以 `completed` 入库 | `research_orch.py:324-329`、`:338` + `scheduler.py:171-183`、`:224` | **P0** |
| R5 | G-03 降级语义 | **语义不一致**：仅 `LLMError` 降级；工具失败（`llm_client.py:321-322`）、工具循环耗尽（`:348-353`）、lead 空返回（`research_orch.py:291-305`）全部仍标 `audited` | `llm_client.py:318-322`、`:348-353`；`research_orch.py:227`、`:254`、`:329` | P1 |
| R6 | G-11 重试 | **自造惊群 + 限流放大**：无抖动（4 并行 agent 同步退避）、不读 `Retry-After`、无熔断；单轮最坏 ~90 次上游请求（5 agent × 6 轮 × 3 尝试） | `llm_client.py:20-22`、`:111-128`、`:282-283`、`:350` | P1 |
| R7 | G-11 重试 | **非幂等 POST 重复计费**：客户端超时后重试，上游可能已完成生成 | `llm_client.py:111-125`（无幂等键） | P1 |
| R8 | G-11 重试 | **最坏时延爆炸**：3×120s 超时 + 工具循环 6 轮 → 与 60s 租约/心跳耦合，存在"已判失败但仍在烧 API"的窗口 | `llm_client.py:42`、`:87`、`:282-283`；`research_jobs.py:149`；`scheduler.py:319-325`、`research_jobs.py:379-385` | P1（**未完全验证**，取决于事件循环阻塞） |
| R9 | G-01 启动备份 | WAL 下裸拷贝主库 → 崩溃恢复场景备份到的可能是过期快照；无完整性校验 | `start.bat:92`、`:96`（只 `Copy-Item $db`） | P1 |

另注：G-01 "失败不阻塞启动" 的设计是**正确的**（`start.bat:97-103`），未引入新风险；`:113` 的"等端口就绪再开浏览器"逻辑合理（90 次 × 1s，超时仍兜底打开）。唯一瑕疵是 PC 关闭 WiFi 后 `New-Object Net.Sockets.TcpClient` 被防火墙拦截时可能有额外延迟——**未验证**，且 127.0.0.1 通常不受防火墙影响。

---

## 建议修复顺序

1. **P0 · 修复 claim 事务边界**（R1）：把 `attempt > _MAX_RETRY_ATTEMPTS` 判定移到 `UPDATE ... SET last_status='running'`（`research_jobs.py:174-181`）**之前**，或改为 `raise` 回滚事务。仅此一处即可消除"running 僵尸 + 无恢复路径"。
2. **P0 · attempt 语义改造**（R2）：引入 `consecutive_failures`（成功清零），上限只对连续失败生效；或至少在用户手动重跑时重置。同步修正 `research_jobs.py:195` 的失实注释。
3. **P0 · 拦截可见化 + 僵尸兜底**（R3）：拦截时写 `retry_exhausted` 事件 + `last_error` + WARNING；`recover_stale_research_runs` 增加"job 为 running 但无 running run 行"的 reconcile。
4. **P0 · `quality` 落库**（R4）：在 `scheduler.py:171-183` 一并写入 `payload.get("quality")`，并在 `publish_research_status` 透出；未标 `degraded` 前不允许以 `completed` 呈现。
5. **P1 · 降级白名单扩面**（R5）：agent/lead 环节统一 `except Exception` 降级；工具失败率超阈值降级；订阅 `tool_failed`/`tool_loop_exhausted`；lead 空内容降级。
6. **P1 · LLM 重试治理**（R6/R7）：加抖动、遵守 `Retry-After`、进程级熔断、单轮调用预算；对 429 单独加长基础退避。
7. **P1 · 备份一致性**（R9）：改为 `sqlite3` 在线备份（`VACUUM INTO` / `Connection.backup()`）+ `quick_check` + 磁盘空间前置检查；把备份下沉到迁移前钩子以覆盖非 `start.bat` 启动路径。
8. **P1 · 密钥脱敏加固**（§5）：正则化脱敏 `Bearer`/token，落库前统一过滤。
9. **P2**：心跳/租约与最长调用时长的对齐（R8）、盘后批量失败可见化、备份数量超限写日志、`_safe_event_payload` 增加 `tool_name` 等有用字段。

---

## 证据完整性声明

- 本次审计实读 5 个文件，所有 `文件:行` 引用均来自直接阅读。
- 标注"未验证"的结论共 5 处：`routers/research.py` 是否消费 `quality`、`database.py` 的迁移与磁盘处理、同步工具是否阻塞事件循环、供应商是否回显密钥、`pending_idempotency_key` 的写入方。
- 未执行任何代码、未运行测试、未修改任何业务文件；本报告为唯一新增产物。
