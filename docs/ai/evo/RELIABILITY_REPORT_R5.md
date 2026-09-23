# RELIABILITY_REPORT（第五轮）

> 读取范围（6 个文件，未超 8 个预算）：`docs/ai/evo/PROJECT_BRIEF.md`（第五轮基线节 56-85）、`backend/app/services/llm_client.py`（553-692）、`backend/app/services/research_orch.py`（214-313、440-568）、`backend/app/routers/chat.py`（150-249）、`start.bat`（105-144）、`frontend/src/pages/Research.tsx`（190-299）、`docs/QUICKSTART.md`（166-185）、`backend/app/services/swarm_orch.py`（262-291），另以 grep 取证 `docs/API_CONTRACT.md`、`RELIABILITY_REPORT_R4.md`、`frontend/**/*.ts(x)`。
> 变异窗口核对：全仓 `grep -E 'TEMP-REPRO|TEMP_REPRO|MUTATED|XXX-TEMP'` 的命中**全部**落在 `AGENTS.md` / `docs/ai/evo/*` 的历史文本中，源码与测试**零命中** ⇒ 本报告所读为交付态，不是在途变异态。
> 反面约束遵从：凡与 R4 相同者，本文**逐条标注"与 R4 相同、无新增"**（见 §3 与 §2 各条）。

---

## 1. 最危险的 3 个场景（+为什么）

### 场景 A（本轮首要，P2）：研究/讨论编排的**整轮等待仍无上界**，而新加的上界只覆盖了最便宜的那条路径
- VS-21/23 给交互 chat 的 tool loop 上了聚合上界（`llm_client.py:579-586` 每轮查 `_deadline_reached()`，`chat.py:196` 传 `DEFAULT_TOOL_LOOP_DEADLINE_SECONDS=600s`，`llm_client.py:62`）。
- 但研究编排走的是**另一条**循环：`research_orch.py:260` 的 `for _round in range(5)`，加 `research_orch.py:292-297` 的收尾第 6 次调用，调用链是 `_request_tool_round`（`research_orch.py:181-199`）→ `chat_with_tools_safe` / `chat_with_tools`，**全部不传 `deadline_seconds`**（全 `backend/app` 内 `deadline_seconds` 只命中 `llm_client.py`、`routers/chat.py` 与测试，`research_orch.py` **零命中**）。
- 每轮仍受单次预算约束（180s 预算 + 120s 单次尝试超时 ⇒ 单次可判定上界 300s，`llm_client.py:43-48`），所以**单个 Agent 最坏 6×300 = 1800s（30 分钟）**；4 个 Agent 经 `asyncio.gather` 并行 ⇒ 墙钟同样约 1800s；随后主编**串行**再走一遍 ⇒ **整轮研究最坏 ≈ 3600s（约 60 分钟）**，其间没有任何对用户的"还要多久/已超时"的显式信号。
- 为什么这是本轮最危险：①这是用户**付费最重、等待最长**的路径，恰恰是"每次调用最多等 N 秒 ≠ 用户最多等 N 秒"这句话**原本要解决**的场景（VS-21 注释 `llm_client.py:56-59` 逐字讨论了 5 轮 × (180+120) = 1500s，却只把 deadline 接到了 chat）；②本地部署下用户只能靠关窗口/Ctrl+C 中止，**没有产品内的取消或降级出口**；③`done` 载荷里没有任何"本次是被上界截断"的字段（研究侧没有等价于 `truncated_by_deadline` 的信号）。
- 诚实边界：单次调用的**有界性是有的**（不是完全无界），因此严重度定 P2 而非 P1；且研究 SSE 是否另有 uvicorn/反向代理层超时**未验证**（未读 `routers/research.py`、`main.py` 的 SSE 配置）。

### 场景 B（P2/P3）：VS-23 宣称的"三通道一致"，在生产链路上实际只剩**一条**通道
- 通道 1（返回值）：`llm_client.py:577` 返回 `_status(True, reason)`，`chat.py:200-201` 读取 → 受控 ✅。
- 通道 2（SSE `done`）：`chat.py:223` 下发 `truncated_by_deadline` → 字段存在，但**前端全库零消费方**（`grep -E 'truncated_by_deadline|tool_loop_truncated' frontend/**/*.ts(x)` ⇒ **No matches found**）。它目前是一条**没有任何读者的机器契约**。
- 通道 3（事件）：`llm_client.py:571-576` 的 `tool_loop_truncated` 确实发出，但**生产链路唯一的 sink 把它丢掉了**——`chat.py:176-187` 的 `_event_sink` 只白名单 `tool_completed`，其余（含 `tool_loop_truncated`、`tool_loop_exhausted`、`tool_failed`）一律静默丢弃。因此 `llm_client.py:521-522` 的"事件通道同样显式、不可静默"**在生产链路上不成立**（只在客户端 API 层成立）。`docs/API_CONTRACT.md:20` 也只承诺 `tool_call`/`token`/`done`，与实现一致，但与 llm_client 的注释叙事不一致。
- 真正**唯一对用户生效**的是正文前缀（`chat.py:202-203`）。
- 为什么危险：`chat.py:212` 的落库内容与 `chat.py:207` 的 SSE 正文同源 ✅（这一条经证据确认**受控**），但**只要有人日后认为"done 字段已覆盖"而删掉正文前缀**（或前端改成读 `done` 字段——一个没有测试与消费方、因而不可能被回归测试拦住的改动），用户就**再也看不到任何截断提示**，而这正是 R4 反复强调的"绝不把局部失败渲染成成功"形态。

### 场景 C（P2，部分未验证）：结构化 status 契约只接进了 research，**swarm 路径未被纳入**
- VS-20 在 `research_orch.py:138-166`（`_agent_result`）、`:423-450`、`:499-527` 构造带 `status`/`error`/`degraded_reasons` 的条目，`done_payload` 原样透传（`:559`），两条落库路径同源（`routers/research.py:286`、`services/scheduler.py:179` 都取 `payload["agent_results"]`）✅ —— R4 场景 2 的缺陷（主编失败在回放里显示"完成"）**已被本次改动真正修复**（`research_orch.py:499-500` 写 `FAILED`+`error`，`:520` 不再发 `agent_completed`，前端 `Research.tsx:232-243` 结构化优先、`:248-257` 事件→哨兵兜底、`:264` 无证据时落 `unknown` 而非"完成"）。
- 但 swarm 是**同一展示面的第二条数据源**：`swarm_orch.py:272-282` 的 `agent_results` 是 `runtime.results[agent.key]` 的**原样透传**，本文件里唯一可见的 `status` 是 `:281` 的**整队**状态（`completed`/`partial`），**没有逐 Agent 的 `status` 注入**。前端 `deriveAgentOutcomes`（`Research.tsx:228`）对 swarm 报告只认 `result.status`，取不到就退到事件/哨兵兜底——若 swarm 报告的**落库事件**缺失或不含 `agent_failed`，回放会把失败的 Agent 显示为"完成"（与 R4 场景 2 同形态，但在 swarm 面上）。
- 诚实边界：`runtime.results[...]` 条目的实际字段**未读**（未打开 `backend/app/orchestrator/runtime.py`），因此"swarm 条目确实不带 status"**未验证**；`ordered_results[...]["token_count"]` 的存在（`swarm_orch.py:285`）说明条目是结构体，但 status 是否存在仍是推断。

---

## 2. 逐项检查

### 2.1 备份产物链路（VS-17/18）
| 子项 | 现状 | 是否受控 | 证据 |
|---|---|---|---|
| 两阶段落盘 | `$part=$dest+'.'+$PID+'.partial'`，校验通过才 `Move-Item -Force` | ✅ | `start.bat:113-115`、`120` |
| 硬中断残件 | 中断只留 `.partial`（及 `-wal/-shm/-journal` 伴生件），启动提示用 `-Filter 'finquant-backup-*.partial*'`（**尾星**）可覆盖伴生件 | ✅ 受控 | `start.bat:117`、`121` |
| 失败只回收自己的 `.partial` | 三处 `DeleteFile(...,SendToRecycleBin)` 均已包 `try{}catch{}` | ✅（**R4 建议已落实**） | `start.bat:121`（三处 try/catch）；R4 报告 §建议 2 |
| 7 份计数不被残件污染 | `-Filter 'finquant-backup-*.db'` 天然不匹配 `.partial*` | ✅（R4 的 P4 悬置项已实测关闭） | `start.bat:117` |
| 磁盘满 / 目录不可写 | `New-Item`/`s.backup` 失败 ⇒ py 非零退出 ⇒ 回收 partial ⇒ `exit 1` ⇒ `:backup_failed` 提示且不阻塞启动 | ✅ | `start.bat:120-122`、`126-128` |
| 目标被占用 | `Move-Item -Force` 抛错 ⇒ 回收自己的 partial ⇒ `backup_failed` | ✅ | `start.bat:121`、`122` |
| **同秒并发的最终名** | `$dest` 只由 `yyyyMMdd-HHmmss` 决定、**不含 PID**；`Move-Item -Force` 会**覆盖**同秒另一实例刚写好的成品，注释"同秒双启动不互撞"只对 `.partial` 成立 | ⚠️ 疏忽点 **P3** | `start.bat:113-114`、`120-121`。**与 R4 相同、无新增**（R4 场景 1 的 P3 子项已逐字报过，含"端口检查早于 uvicorn 绑定使其真实可达"） |
| **残件累积（无上限）** | 残件只提示、永不清理，且每份 = 整库体积；多次中断后会推高磁盘占用，直到下一次备份失败 | ⚠️ **P3（新角度）** | `start.bat:117`、`121`。R4 报过"残件会误导恢复"，**未讨论"累积/体积上限"**；此处为新增维度，但严重度低 |
| QUICKSTART 恢复指引一致性 | `175` 先停服务 → `176` 只挑 `finquant-backup-*.db` → `178` 明确"按结尾判、不按时间" → `179` 覆盖 → `180` **删除 `finquant.db-wal`/`-shm`** → `181` 重启 | ✅ 一致（R4 的 P1 已修） | `docs/QUICKSTART.md:175-181` |
| 伴生件文案落差 | 实现提示提到 `-wal/-shm` 伴生文件（`start.bat:121`），QUICKSTART `171-172` 只提 `.partial` | ⚠️ **P4（新，价值极低）** | `docs/QUICKSTART.md:171-172` vs `start.bat:121` |

### 2.2 LLM 等待上界（VS-21/23）
| 子项 | 现状 | 是否受控 | 证据 |
|---|---|---|---|
| 单次调用预算 | 默认 180s，只在 **sleep 前**检查 ⇒ 可判定上界 = 预算 + 单次尝试超时 = 300s（注释自述） | ✅ | `llm_client.py:43-52`、`318-325` |
| 整轮 chat deadline | 600s，轮间检查；轮内预算被 `min(总预算, 剩余整轮预算)` 压低 | ✅ | `llm_client.py:579-586`、`541-551`、`chat.py:196` |
| 截断内容与落库内容**同源** | 同一个 `full` 变量先 yield `token.delta` 再 INSERT | ✅ **确认同源** | `chat.py:202-207`、`209-213` |
| 空正文边界 | 截断且 `full` 为空时置为纯提示文案，落库非空 | ✅ | `chat.py:202-203`、`206-207` |
| 恰好越过截止不误报 | 成功调用之后才越界按"完成"返回 | ✅ | `llm_client.py:590-594` |
| 上游响应脱敏 | `_redact` 把 `self.api_key` 替换为 `[已隐藏]`；预算耗尽错误片段同样脱敏、截断 300 字 | ✅ **确认（VS-21 声明属实）** | `llm_client.py:222-224`、`239`、`249`、`259-260` |
| **事件通道** | `tool_loop_truncated` 被生产 sink 丢弃 | ❌ **P3** | `chat.py:176-187`（只白名单 `tool_completed`）vs `llm_client.py:571-576`、`521-522` |
| **`done` 字段消费方** | 前端 0 命中 | ❌ **P3** | `chat.py:223` / `API_CONTRACT.md:22,25` vs `grep frontend` 无命中 |
| **编排路径上界** | `_call_agent` 5 轮 + 收尾第 6 次，无 `deadline_seconds` | ❌ **P2（新）** | `research_orch.py:260-299`、`181-199` |
| 上界公式隐含前提 | 注释已明确"上界还可收紧为 `deadline_seconds + self.timeout`"，前提是"轮内工具执行耗时≈0"——工具执行若超时（本地工具/网络抓取）**不计入**任何预算，`deadline_seconds + 300` 只是"LLM 等待"上界，不是"用户等待"上界 | ⚠️ 已知并已声明，非缺陷 | `llm_client.py:503-508` |
| `research_orch` 非 LLMError 异常 | `run_research` 顶层只 `except LLMError`（`:338`、`:375`、`:476`），其它异常会终止 SSE 生成器；是否被 router 兜住**未验证** | ⚠️ 未验证 **P3** | `research_orch.py:338`、`375`、`476` |

### 2.3 降级/失败状态的结构化契约（VS-20）
| 子项 | 现状 | 是否受控 | 证据 |
|---|---|---|---|
| 主编失败是否真落 `failed` | `lead_error is not None ⇒ AGENT_STATUS_FAILED` + `error`；且 `:520` 不再发 `agent_completed` | ✅ **确认成立** | `research_orch.py:499-527` |
| 主编降级无原因码 | 内容不可解析时写 `DEGRADED` 且 `degraded_reasons=[]`（不编造原因） | ✅ | `research_orch.py:503-506` |
| 历史报告（仅 `content` 哨兵）混存 | 判据顺序 结构化 → 事件 → 哨兵，哨兵保留；无证据时 `unknown` | ✅ 稳 | `Research.tsx:227-265`、`:264` |
| 实时与回放同源 | 实时 `done` 与回放 `report.agent_results` 用**同一函数** `deriveAgentOutcomes` | ✅ | `Research.tsx:295-298`、`:449-451`、`:594` |
| 消费方遗漏 | `report_export.py:67` 只取 URL（不受影响）；`scheduler.py:179` 与交互路径同源 ✅；**swarm 未纳入**（见场景 C） | ⚠️ P2（部分未验证） | `swarm_orch.py:272-282` |
| 未知 `status` 取值 | `structured` 只做三个等值比较，取值未知时静默落到哨兵兜底链，**无告警** | ⚠️ P4 | `Research.tsx:228-246` |

### 2.4 其他（自选）
- **密钥处置**：`llm_client.py:222-224` 的 `_redact` 覆盖"错误文案 + 预算耗尽文案"两条出口，且这些文案会经 SSE `error` 事件直达浏览器（`chat.py:234-238`）⇒ **确认不泄露 API Key**。✅
- **危险操作**：本次改动涉及的删除动作全部走 `SendToRecycleBin` 且包 `try/catch`（`start.bat:121`）✅。
- **安全面其余项（认证绕过、路径穿越、SSRF、依赖漏洞）本轮未涉入**：标"未验证"，不做无证据判断。

---

## 3. R4 之后的改动引入的新风险（对六个改动面逐条）

1. **首页深链（VS-16）**：本轮未读相关文件，**未见**（未验证）。
2. **备份产物链路（VS-17/18）**：
   - **新风险：有，但很轻** —— "残件只提示不清理"在 VS-18 之后变成**永久累积**（每份 = 整库体积，`start.bat:117`/`121`），R4 未讨论该维度（P3）。
   - **同秒并发 `$dest` 覆盖**：**与 R4 相同、无新增**（R4 §场景 1 的 P3 子项）。
   - R4 提出的"三处 `DeleteFile` 无 try/catch"已被落实修复 —— **这是本轮对 R4 的正面验证**，非新问题。
3. **"失败"与"没有数据"可区分（VS-19/22）**：本轮未读相关文件（`LoadFailureAlert`、`ListFailureNotEmptiness`），**未见**（未验证）。基线 ④ 的"加载中 vs 空"仍未验证。
4. **降级/失败结构化（VS-20）**：
   - **新风险：有** —— 结构化契约**只接进 research**，swarm 的逐 Agent 条目未同步（`swarm_orch.py:272-282`），"实时与回放同源"在 swarm 面不成立（P2，部分未验证）。
   - **新风险：有（轻）** —— `structured` 遇未知取值静默退化到哨兵链，无告警（`Research.tsx:228-246`，P4）。
   - R4 场景 2 的两条（理由不落地、主编失败回放显示"完成"）**已被真正修复**，非新问题。
5. **LLM 等待上界（VS-21/23）**：
   - **新风险：有（本轮最重要）** —— ①`research_orch._call_agent` 的 5+1 轮循环仍无整轮上界，研究/讨论最坏约 60 分钟且无产品内取消（`research_orch.py:260-299`，P2）；②`tool_loop_truncated` 被生产 sink 静默丢弃（`chat.py:176-187` vs `llm_client.py:521-522`，P3）；③`done.truncated_by_deadline` 前端零消费方（P3）；④非 `LLMError` 异常在 `run_research` 无捕获（P3，未验证）。
   - 正面对账：截断正文与落库同源 ✅、脱敏 ✅、边界"恰好在成功调用后越界不误报" ✅。
6. **契约与规则（VS-20 的 API_CONTRACT / AGENTS.md）**：
   - **新风险：有（轻）** —— `docs/API_CONTRACT.md:25` 与实现的"不外发 `tool_loop_truncated`"一致，但 `llm_client.py:521-522` 的注释宣称"事件通道同样显式"，两处叙事不一致（文档 vs 代码注释），正是基线"同一功能多条路径是否一致"的形态（P4）。

---

## 4. 建议修复顺序

1. **P2** `research_orch.py:260-299`：给 `_call_agent` 的循环接上整轮 deadline（把 `deadline_seconds` 透传进 `_request_tool_round`，或直接改用 `client.chat_with_tools_loop`），并仿照 chat 在 `done` 里下发等价的 `truncated_by_deadline`；同时在 `_call_agent` 内把非 `LLMError` 的异常也收敛为 `status=failed` + `error`，避免整条 SSE 断流。**这是"每次调用有界≠用户等待有界"的最后一处漏网点，且正是 VS-21 注释自己举的例子。**
2. **P2** `swarm_orch.py:272-282`：让 swarm 的逐 Agent 条目也产出 `status`/`error`/`degraded_reasons`（复用 `research_orch._agent_result` 的口径），或在前端显式声明"swarm 报告不支持结构化判据、只用事件"。**在此之前先读 `orchestrator/runtime.py` 确认条目字段**，避免误判。
3. **P3** `chat.py:176-187` + `frontend`：二选一——①把 `tool_loop_truncated` 纳入 sink 白名单并作为 SSE 事件下发、前端消费；②明确"不外发"，同时**改掉 `llm_client.py:521-522`"事件通道同样显式"的表述**，并给 `done.truncated_by_deadline` 补一条前端消费或一条测试断言（二者必须至少有一个，否则该字段是无守护的孤儿契约）。
4. **P3** `start.bat:117/121`：给残件加**数量/体积提示上限**（例如 >3 份时提示"占用约 X MB"，或列出文件名），或至少让提示文案包含残件名，让非技术用户能定位。仍遵守"只提示不自动删"。
5. **P4** `docs/QUICKSTART.md:171-172`：补一句伴生件（`…partial-wal`/`-shm`）同属未完成临时件、一并送回收站。
6. **P4** `Research.tsx:228-246`：`structured` 取值不在三个枚举内时，走一条显式分支（例如按 `unknown` 处理并 console.warn），避免静默退化成哨兵判据。

---

## 5. 未验证项

- **研究/讨论 SSE 是否有更高层的整轮超时**（`routers/research.py`、`routers/discussion.py`、`main.py` 的 sse-starlette/uvicorn 配置）——本轮未读；若存在，场景 A 的严重度应下调。
- **`backend/app/orchestrator/runtime.py` 中 `runtime.results[key]` 的字段集**是否含 `status`——决定场景 C 是真缺口还是误判。
- **swarm 报告的落库事件**是否包含 `agent_failed`（决定 swarm 回放是否会显示成"完成"）。
- **`run_research` 抛出的非 `LLMError` 异常**是否被 router 的 SSE 兜底捕获并转成 `error` 事件。
- **基线 ④「加载中 vs 空」**（三处在请求在途时短暂渲染空态、`ResearchRuns` 的历史合法空态为 `<p>UNKNOWN</p>`）——本轮**完全未涉入**，未验证；亦未读 VS-19/22 的 `LoadFailureAlert` 相关代码。
- **首页深链（VS-16）的一次性守卫与成员资格校验**——本轮未读 `Chat.tsx`/`Discussion.tsx`/`ResearchWorkspace.tsx`，未验证。
- 本轮**未运行任何测试**（遵守沙箱纪律：不跑全量 pytest / `tests/test_api.py`），所有结论均为源码取证；未启动后台任务，无需清理 Python 残留进程。
