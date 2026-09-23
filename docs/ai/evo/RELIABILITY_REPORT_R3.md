# RELIABILITY_REPORT（第三轮）

> 审计者：SUBAGENT D3（RELIABILITY_SECURITY_AUDITOR），独立上下文，只读审计。
> 基线：`docs/ai/evo/PROJECT_BRIEF.md:36-46`（第三轮基线 + 近期交付 6 项）。
> 方法：假设系统必然失败，逐条读近期改动的最小必要代码（≤8 文件），所有结论标注 `文件:行`。
> 读取清单（7 个）：`docs/ai/evo/PROJECT_BRIEF.md`、`backend/app/services/llm_client.py`、`start.bat`、`backend/app/services/research_orch.py`、`backend/app/routers/research.py`、`backend/app/services/scheduler.py`(100-249)、`backend/tests/test_llm_client.py`(1-60 / 286-444)。
> 另有若干 `grep` 命中（非通读），已单独标注为"grep 证据"。

---

## 最危险的 3 个场景（+为什么）

### 场景 1（最高危）：「工具跑了但失败」不被判降级 → 报告仍以 `audited` 落库

**为什么最危险**：本轮刚交付的"降级语义补全"（PROJECT_BRIEF:40）用**字符串前缀哨兵**识别工具失败，而 `chat_with_tools_loop` / `_execute_tool_call` 明确存在**至少 4 条失败路径返回的不是该前缀**：

| 失败形态 | 返回文本 | 是否被判降级 |
|---|---|---|
| 工具抛异常 | `"工具执行异常：{e}"`（`research_orch.py:95-96`） | ✅ 是（`:157-158`） |
| 工具不存在 | `"错误：工具 X 不存在"`（`research_orch.py:69-70`） | ❌ 否 |
| 未授权工具 | `"错误：工具 X 未授权给当前 Agent"`（`research_orch.py:66-67`） | ❌ 否 |
| 参数校验失败 | `{"success": false, "error": ...}`（`research_orch.py:81-86`） | ❌ 否 |
| 工具正常执行但业务失败（数据源断、无凭据、行情 502） | `{"success": false, "data": null, "error": ...}`（`research_orch.py:91-94`，`success` 取自 `result.success`） | ❌ 否 |

判据全仓库唯一：`_is_tool_failure()` 只做 `startswith("工具执行异常：")`（`research_orch.py:30-32`），调用点只有一处（`:157-158`）。

**后果**：用户 API Key 失效 / 行情源全挂 / 新闻工具无凭据时，四个 Agent 每轮工具都返回 `success:false` 的 JSON，模型于是"基于空数据编结论"，而 `degraded` 始终为 `False`（`:228`、`:260-261`、`:355`）→ 报告以 `quality="audited"` 落库（`:356`），前端不显示任何降级提示。**这正是 G-03 想消灭的"伪装成功"，只是换了一种形态存活**。该缺口在 `docs/ai/evo/PRODUCT_GAP_MAP.md:84`（grep 证据）已被记为「工具失败 5 种形态仅异常态判降级 → BACKLOG-049」，但**至今未修**；本轮改动也没有收窄它（前缀哨兵是同一处设计）。

### 场景 2：Agent 内容为空 / 被 max_tokens 截断 → 仍判 `audited`

**为什么危险**：`_call_agent` 只要"没有 tool_calls"就直接返回，**不检查内容是否为空**（`research_orch.py:147-149`）；四个研究 Agent 的产出**没有任何质量判据**，只有主编走 `parse_lead_review`（`:329`）。同时 `llm_client.py:252-268` 从不读取 `finish_reason`——`max_tokens` 截断（默认 4096，`llm_client.py:112`）对上层完全不可见。

**触发链**：模型因限流/长思考被截断 → `content=""` 或半句话 → `agent_results[role]` 收下 → `_build_report`（`:351`）→ `quality="audited"`（`:355`）。用户拿到一份**章节空着、却被系统标为"已审计"的研报**。修复成本极低（判空 + 读 `finish_reason=="length"` 即置降级），危害等级与场景 1 同级。

### 场景 3：单个 Agent 的非 `LLMError` 异常 → 整轮研究被判 `failed`，其余 Agent 成果全部丢弃

`run_agent` 只捕获 `LLMError`（`research_orch.py:250`）；其它异常（如上游 200 却返回 HTML 导致 `json` 解码错、`data["choices"]` KeyError）冒泡成 `node_failed`，编排层**特意**把它降级处理并继续（`:286-295`，写入 `【分析失败】` 文本 + `degraded=True`），但紧接着 `yield "error"`（`:290`）被路由层当作**致命**：`_fail_report` + `break`（`routers/research.py:265-273`；`scheduler.py:164-170` 同构）。

**后果**：4 个 Agent 里 1 个崩，用户看到的是"失败"，另外 3 个已完成的成果被直接丢弃 —— 与 G-03「非致命降级、报告仍能完成」的设计意图**方向相反**。叠加 VS-10 的新等待（单次调用最坏 3×120s 超时 + 2×30s `Retry-After`，`llm_client.py:25,32,115,199`），用户更可能在中途 Ctrl+C/关窗口，而断连后报告会被清理任务置 `failed`（`routers/research.py:370-377`）—— 即"等太久 → 用户放弃 → 成果全丢"。

---

## 逐项检查

### A. `llm_client.py`：Retry-After 等待 + 退避抖动（本轮刚改）

**现状**：`_retry_after_seconds` 解析整数秒/HTTP-date，无法解析→`None`（`llm_client.py:54-76`）；上限 `min(seconds, 30.0)`（`:76`）；回落退避带 ±25% 抖动（`:79-84`）；`_retry_delay_seconds` 优先上游值（`:87-93`）；循环总尝试 ≤3（`:184-199`）。

**是否受控**：

- 上限是否真生效 → **是**。`min` 在返回前唯一出口（`:76`），`_retry_delay_seconds` 直接采用该值（`:90-92`），无第二条绕行路径；`nan`/`inf`/负数/已过期 HTTP-date 全部回落（`:74`、`:51`）。`99999 → 30.0` 有单测（`test_llm_client.py:385-394`）。
- 畸形头是否抛异常/超长等待 → **否**。空串、`0x10`、`-3`、`abc` 均回落，不抛（`:66-75`；单测 `:353-367`）；`email.utils.parsedate_to_datetime` 的 `TypeError/ValueError/OverflowError` 已捕获（`:44`）；`headers.get` 外层还有 `except Exception`（`:60-63`）。
- 抖动是否破坏既有"退避置 0"测试前提 → **不破坏**。`_backoff_seconds` 对 `base<=0` 显式短路返回 `0.0`（`:82-83`），抖动用例断言 `recorded_sleeps == [0.0, 0.0]`（`test_llm_client.py:367`）依然成立；抖动自身另有断言（`:414-419`，base=1.0 时取值区间 `[0.75,1.25]`）。

**疏忽点**：

1. **上限是"单次等待"上限，不是"单次调用/单次研究"的时长预算**（`:32` 注释即如此表述）。单次 LLM 调用最坏 = 3×120s（`timeout=120.0`，`:115`）+ 2×30s ≈ **420s**；一次研究含 4 个并行 Agent ×（≤5 轮 + 1 次强制收尾）再叠加主编（`research_orch.py:144`、`:176`、`:307-319`），串行段（Agent 阶段 → 主编阶段）最坏可累计 **十几分钟纯等待**，期间只有 SSE 进度事件。`llm_client.py:30-31` 声明的"不得让一次研究长时间挂住"并未真正达成。
2. **`Retry-After: 0` 被当作有效值**（`float("0")=0.0`，`>=0` 通过，`:74`）→ `sleep(0)` 立即重试，**绕过全部抖动与退避**，比"头缺失"更激进。参数化用例只覆盖 `abc/-3/0x10/空`（`test_llm_client.py:353`），**`"0"` 未覆盖**。
3. **`chat_stream` 完全没有重试**（`llm_client.py:438-471`，与 `_post_chat_with_retry` 无关，仅捕获 `httpx.HTTPError` 转 `LLMError`）。VS-10 的重试纪律只覆盖非流式 5 个方法，流式聊天一次 429 即失败 —— 纪律覆盖不完整。
4. **重试的计费/用量是漏的**：`record_llm_usage` 只在成功响应后调用（`:228`、`:267`、`:309`），被重试掉的失败请求（上游可能已计费）不记账；同时 POST 被重试本身可能重复计费。属统计口径问题。
5. **测试前提的隐性变化（本轮新引入）**：autouse fixture 只置零退避基数（`test_llm_client.py:20-23`），**不屏蔽 `Retry-After`**。当前无其它用例在 llm_client 上 mock 带 `Retry-After` 的 429/503（grep 证据：`retry-after` 仅命中 `test_llm_client.py` 与自带限流的 `test_auth.py:78`/`test_security.py:101`），故**当前不会**真实睡眠；但"置零退避 = 测试不会等待"这一前提已不再成立，未来新增用例极易踩 30s 真实等待。

**建议**：① 加"整次调用/整次研究"的截止时间（deadline）而非仅单次 cap；② `Retry-After <= 0` 视为不可用，回落退避；③ `chat_stream` 复用重试策略（或至少对首个非 200 做一次重试）；④ 把 `_no_retry_backoff` fixture 改为同时 monkeypatch `_RETRY_AFTER_MAX_SECONDS=0`，恢复"零等待"前提。

**优先级**：1 → P2；2 → P4；3 → P2；4 → P3；5 → P3。

### B. `start.bat`：备份改为 `sqlite3.Connection.backup()`

**现状**：源库存在才备份（`start.bat:100`）；无 venv 直接 `:backup_failed`（`:101`，绝不退化为复制单文件）；PowerShell 载荷用 `s.backup(d)` + 目标库 `PRAGMA integrity_check`，非 `ok` 即 `exit 3`；失败时把残件送回收站（`:103`）；`errorlevel 1 → :backup_failed → goto launch`，失败不阻塞（`:104`、`:108-110`）。

**是否受控**：**基本受控，且已被独立验证**。grep 证据 `docs/ai/evo/EVALUATION_RESULT_G01.md`（Evaluator 自造 WAL 库、逐字载荷经 `cmd.exe` 真跑）：venv 缺失 → `:backup_failed`；构造"备份成功但 integrity 失败" → `exit 3` 且残件 0，并在回收站元数据命中被清理路径；`backups` 路径被同名文件占用也能正确失败。恢复文档侧同样已对齐：`docs/QUICKSTART.md:161-173` 明确"单一自洽文件、覆盖 `finquant.db` 一个文件"，且步骤 4 已要求一并删除旧库遗留的 `-wal`/`-shm`。**我原本怀疑的"恢复时旧 WAL 套用新库"已被文档覆盖，非缺口。**

**疏忽点（均在既有验证之外的边角）**：

1. **同秒双启动 → 备份文件同名冲突**。文件名精度到秒（`:103` `Get-Date -Format 'yyyyMMdd-HHmmss'`），而端口占用检查在**很靠前**的位置（`:22`），首次运行要经过创建 venv + pip install + bun build（`:37-81`）才到备份段。用户双击两次（或杀软/资源管理器重复拉起）时两个进程都可通过 `:22` 的端口检查，并可能落进同一秒 → 两个 `backup()` 写同一路径；后失败的一方还会对**同一路径**执行 `DeleteFile(..., SendToRecycleBin)`（`:103`），把对方（或自己）刚生成的**有效**备份删掉。无锁、无 PID、无 `-Force` 冲突检测。
2. **硬中断留下"看起来有效"的残件**。已覆盖的失败路径都是"进程正常返回非 0"；若用户在 python 写盘途中关窗口/断电/任务管理器结束进程，`finquant-backup-*.db` 会以**正常文件名**留在目录里（无 `.partial` 后缀或标记），并且会被 `-Filter 'finquant-backup-*.db'`（`:103`）计入 7 份限额，用户按 QUICKSTART 恢复时可能选中它。
3. **失败提示不区分原因**。`:109` 只说"数据库备份失败…可检查磁盘空间"，但 `:101` 的分支（无 venv / venv 损坏）与"写盘失败"共用同一句文案（已知项：`docs/ai/evo/PRODUCT_STATE.md:99` 记为 P3）。
4. **保留策略无上限**。>7 份只打印提示、从不清理（`:99`、`:103`），备份与主库同卷，长期启动会在同一磁盘无限增长（已知项：`PRODUCT_STATE.md:50/113`、`PRODUCT_UX_REPORT_R2.md:91-95` 记为 P3-2）。
5. **本机从未真实产出过备份**。实测 `backend\data\backups` **不存在**（pwsh 列目录：`NO BACKUP DIR`）。即：该分支在真实 venv + 真实库上的端到端仅有"逐字载荷仿真"证据，真实双击链路的产物尚未落地 —— 属验证方法层面的缺口（与 `PRODUCT_STATE.md:82` 记录的环境变化一致）。

**建议**：文件名加进程/毫秒级唯一性（`yyyyMMdd-HHmmss-<pid或3位随机>`），或先写 `*.db.partial` 再改名，并把限额统计限定为 `*.db`；`:backup_failed` 按原因分文案；将"超 7 份"改为自动送回收站（符合项目删除铁律）。**优先级**：1 → P3；2 → P3；3 → P3（已知）；4 → P3（已知）；5 → P2（验证缺口）。

### C. `research_orch.py` + `routers/research.py` + `scheduler.py`：降级（degraded）语义

**现状**：`quality` 在**源头**并入 `report_data`（`research_orch.py:352-356`），顶层同时保留以兼容 SSE 消费方（`:365-371`）；交互路径再幂等兜底合并，绝不把 `degraded` 反写为 `audited`（`routers/research.py:280-286`）；定时路径只落 `payload["report"]`（`scheduler.py:172-183`）。

**quality 是否在所有落库路径都持久化 → 是（已验证）**。全仓库 `report_data` 写入点只有两处成功路径：
- `routers/research.py:403`（交互；入参 `report` 已含 `quality`，`:285`）
- `services/scheduler.py:175`（定时；入参 `report_data = payload.get("report", {})`，`:172`，而 `quality` 就在 `report` 内）
另有 `services/research_jobs.py:433` 只写 `status='failed'`（不清空也不伪造 `report_data`），`routers/research.py:416` 同理（grep 证据：`UPDATE research_reports` 全仓 5 处，无第三条成功写入路径）。定时/交互两条路径**天然一致**，PROJECT_BRIEF:40 的声明成立。

**失误点（仍会让报告"看起来成功"）**：

1. **场景 1 的 5 形态判据**（见上）——降级信号源本身不完整，是当前最大洞。
2. **场景 2 的空内容/截断**（`research_orch.py:147-149`；`llm_client.py:252-268` 无 `finish_reason`）。
3. **`node_failed` 与 `error` 事件语义冲突**（`research_orch.py:286-295` vs `routers/research.py:265-273` / `scheduler.py:164-170`）——过度失败，丢弃可用成果。
4. **弱口径：`agent_reasons` 只记原因字符串、不记数量**（`:157-158`、`:260-261`），`degraded` 是布尔；用户无法区分"1 个工具小失败"与"4 个 Agent 全空"，前端提示无法分级。属信息量不足，非正确性问题。
5. **SSE 侧 `completed` 置位晚于落库**：`_complete_report`（`:286`）与 `schedule_research_candidates`（`:287`）之后才 `completed = True`（`:293`）。若 `:287` 抛错，外层 `except`（`:297-311`）会向客户端 yield `error` 并把状态发布为 `failed`（`:305-306`），而数据库里该报告已是 `completed`（`_fail_report` 的 `WHERE status='running'` 不生效）→ **UI 显示失败、库中却是成功报告**（状态不一致，但不会丢数据）。P3。
6. `_complete_report` 在 `rowcount != 1` 时抛 `RuntimeError`（`:408-409`），依赖外层收敛；行为正确（不会伪装成功），仅提示该路径与 `:302-303` 的 `completed` 短路判断存在时序耦合。

**建议**：把降级判据从"文本前缀"改为**结构化信号**（例如 `chat_with_tools_loop`/`_execute_tool_call` 明确返回 `failed: bool`，或统一在编排层解析 `{"success": false}`），并补 `content` 空判据与 `finish_reason=="length"` 判据；`node_failed` 改为 `agent_failed` 语义（不 yield `error`）或让路由层区分"致命 error / 非致命 agent_failed"。**优先级**：1 → P1；2 → P1；3 → P2；5 → P3；6 → P4。

### D. `start.bat`：Bun 非致命探测

**现状**：只探测不拦截（`start.bat:12-19`），仅在**确认需要构建**时才 `goto bun_missing`（`:67-69`）；产物复用判定为"`frontend\dist\index.html` 存在 + `package.json` 的 mtime 不晚于它"（`:56-58`）。

**是否受控**：**主干受控**。三条路径闭合：dist 存在且新鲜 → 复用、全程不需要 Bun（`:64-65`）；dist 缺失/过期 → 需要构建 → 无 Bun 时给出安装指引并 `exit 1`（`:69,162-166`）；有 Bun 才走到 `install`/`run build`（`:73-80`）。本机实测与判定一致：`dist/index.html` = 2026-09-11 14:53:52 UTC > `package.json` = 2026-09-04 09:35:28 UTC → 判"新鲜"，复用产物、不需要 Bun，符合预期。

**疏忽点**：

1. **判据只锚 `package.json` 一个文件**（`:56` 注释自认"源码更新后需手动重建"）。反向失败：发行包若被重新打包/触碰过 `package.json`（或解压工具让 `package.json` 的 mtime 晚于 `dist/index.html`），**产物其实是新鲜的**，脚本仍判"过期" → 对未装 Bun 的非技术用户弹出"未找到 Bun，无法继续"并退出（`:162-166`），直接击穿 PROJECT_BRIEF:42「预置 dist 的发行包对未装 Bun 的用户可正常启动」这一交付声明。属推断（本机状态不触发），**未实测打包场景**。
2. **正向失败**：只改 `frontend/src` 不改 `package.json` → 永远判新鲜 → **静默运行旧前端**。对拿到源码的开发者是确定性陷阱（注释已知，但无任何运行时提示）。
3. **硬编码维护者机器路径**：`D:\Technology_application\NVM_Windows\nvm_a\v22.19.0\bun.exe`（`:18`）会随发行包一同分发（已知项：`PRODUCT_STATE.md:99` 记为 P2），既是可移植性噪音也是本机路径泄漏。
4. **Bun 存在但不可用**（存在 shim/损坏的 bun.exe）时，`:78` 构建失败 → `:build_failed`，文案与 `:162-166` 完全不同（一条指向"网络/Bun 未正确安装"，一条指向"未找到 Bun"），非技术用户难以判断自己该做哪一步。

**建议**：用**产物自身的版本戳**代替 mtime 启发式（构建时写 `frontend/dist/build-info.json`：gir repo 版本 + 源码指纹；启动脚本比对项目版本文件），既修反向误判也修正向静默过期；`:18` 的硬编码路径从发行构建中剥离（改为环境变量/配置项）。**优先级**：1 → P2；2 → P3；3 → P4（已知）；4 → P4。

---

## 近期改动引入的新风险（逐条）

1. **【新】`Retry-After` 等待把"快速失败"变成"长时间静默等待"**。改动前单次调用最坏 ≈ 3×120s 超时；改动后额外叠加 2×30s 且**没有任何总时长预算**（`llm_client.py:32,76,199`）。场景：上游持续返回 `Retry-After: 30`，一次研究的串行段可累计十几分钟等待，用户很可能中途强杀 → 报告被判 `failed`（`routers/research.py:370-377`），降级/成果全部丢失。这与该改动 `:30-31` 自述的目标（"不得让一次研究长时间挂住"）**部分相悖**。
2. **【新】`Retry-After: 0` 成为合法输入**，导致 0 秒紧循环重试，绕过抖动与退避（`llm_client.py:74`、`:89-93`）；单测参数集恰好漏掉 `"0"`（`test_llm_client.py:353`）。
3. **【新】autouse fixture 的"零等待"前提被削弱**：只置零退避基数，不屏蔽上游 `Retry-After`（`test_llm_client.py:20-23` vs `llm_client.py:90-93`）。当前无其它用例受影响（grep 证据），但该 fixture 的语义保证已不再完整 —— 属"测试基础设施被静默削弱"。
4. **【新】备份文件名秒级 + 无并发保护**：同秒双启动可互相覆盖/删除备份，且删除走的是"送回收站"（`start.bat:103`），失败侧会删掉**可能是有效**的那一份。
5. **【新】备份残件无 `.partial` 标记**：硬中断（关窗口/断电）可能留下文件名正常、内容不完整的 `finquant-backup-*.db`，并被计入 7 份限额、被用户当作可恢复件（`start.bat:103`）。
6. **【新】降级判据用字符串前缀哨兵**（`research_orch.py:30-32,157-158`）——虽由 VS7 P1b 引入，但**本轮"降级语义补全"把它当成了唯一失败判据**，于是"4 种非前缀失败形态 + 空内容 + 截断"全部落在 `audited` 一侧。这是"近期改动本身引入/固化"的最大新缺口。
7. **【新】Bun 非致命化把风险集中到唯一判定点 `package.json` mtime**（`start.bat:56-58,69`）：判定错一次就是在"强制装 Bun 并退出"与"静默用旧前端"两极之间二选一，没有中间态提示。（R2 已由 A3 指出"风险集中到单一判定点"，本轮补上具体失败路径与影响面。）
8. **未见新问题**：备份"失败不阻塞启动"语义仍然成立（`:104,108-110`，且有 Evaluator 的 `exit 3` + 回收站残件清理实证）；`quality` 落库在交互/定时两条路径仍一致（`routers/research.py:280-286` + `scheduler.py:172-183`）；`Retry-After` 的**单次上限**确实生效且畸形头不抛异常。

---

## 建议修复顺序

| 顺序 | 修复项 | 证据 | 优先级 |
|---|---|---|---|
| 1 | 降级判据结构化：覆盖"工具不存在/未授权/参数校验失败/`success:false`"四种非异常失败形态 | `research_orch.py:30-32,66-70,81-86,91-94,157-158` | P1 |
| 2 | 补空内容判据 + 读 `finish_reason=="length"`（截断即降级） | `research_orch.py:147-149,355`；`llm_client.py:252-268` | P1 |
| 3 | `node_failed` 不再以 `error` 致命收场（保留已完成 Agent 成果，落 `degraded`） | `research_orch.py:286-295` vs `routers/research.py:265-273` / `scheduler.py:164-170` | P2 |
| 4 | 给重试加"整次调用/整次研究"的时长预算（deadline），而不只是单次 30s 上限 | `llm_client.py:32,76,199` | P2 |
| 5 | 备份文件名唯一化 + 先写 `.partial` 再改名（并限定 7 份统计口径） | `start.bat:103` | P3 |
| 6 | `chat_stream` 补齐重试纪律 | `llm_client.py:438-471` | P2 |
| 7 | Bun 判据改为产物内版本戳，替代 `package.json` mtime 启发式 | `start.bat:56-58,69` | P2 |
| 8 | 测试基础设施：fixture 同时屏蔽 `Retry-After`；补 `"0"` 用例 | `test_llm_client.py:20-23,353` | P3 |
| 9 | 备份失败文案按原因分流；>7 份自动送回收站 | `start.bat:103,109` | P3 |
| 10 | `Retry-After: 0` 视为非法回落；`:18` 硬编码路径剥离 | `llm_client.py:74`；`start.bat:18` | P4 |

---

## 未验证项

1. **发行包真实打包场景下 `package.json` 与 `dist/index.html` 的 mtime 关系** —— 本机状态（dist 更新）不触发反向误判，结论为推断；未构造 zip/解压实验。
2. **`node_failed` 的真实触发概率** —— 我只验证了"`run_agent` 只捕获 `LLMError`"这一代码事实（`research_orch.py:250`），未构造"200 返回非 JSON/缺 `choices`"的上游响应实测其发生链条；`DAGRuntime`（`backend/app/orchestrator/`）内部是否还会吞掉部分异常**未读**。
3. **前端对 `quality`/降级的实际呈现** —— 未读 `frontend/src`，无法确认"`quality` 缺失或 `degraded`"在 UI 上的具体表现，也无法确认 SSE 长等待期间是否有用户可见的等待提示/超时。
4. **`schedule_research_candidates`（`routers/research.py:287`）的失败语义** —— 未读 `memory_capture`，仅从调用点时序推断"UI 显示失败但库中为 completed"（第 C.5 条）。
5. **真实备份端到端** —— `backend\data\backups` 在本机不存在（实测），现有证据是 Evaluator 的仿真载荷实跑；真实双击链路从未产出过 `finquant-backup-*.db`。
6. **`max_tokens` 与本项目报告长度的关系** —— 未统计 13 章报告实际消耗的 token 量与 4096 上限的距离，故"截断"发生的经验概率**未量化**。
7. 沙箱未运行任何测试（`tests/test_api.py` 会挂，按要求跳过）；结论均来自静态阅读与 grep 证据，**未经测试执行验证**。
