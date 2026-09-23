# RELIABILITY_REPORT（第四轮）

> 审计者：SUBAGENT D4（RELIABILITY_SECURITY_AUDITOR，第四轮）。只读审计，未改任何代码。
> 基线：`docs/ai/evo/PROJECT_BRIEF.md`（2026-09-11 第四轮基线）。
> 读取范围（8 个文件，未超预算）：`docs/ai/evo/PROJECT_BRIEF.md`、`start.bat`、`docs/QUICKSTART.md`、`backend/app/services/llm_client.py`、`backend/app/services/research_orch.py`、`backend/app/routers/research.py`、`backend/app/orchestrator/runtime.py`（仅 grep）、`frontend/src/store/authStore.ts`、`frontend/src/pages/Research.tsx`（分段）。`start.bat` 用 `[System.IO.File]::ReadAllLines($p, UTF8Encoding($false))` 读取，避免 PS 5.1 ANSI 误判。
> 工作树状态：`git status --porcelain` 为空，HEAD=`d3c24fc`，本报告所有行号对应此提交的最终态。

## 最危险的 3 个场景（+为什么）

### 场景 1（P1，数据丢失）：中断留下的 `.partial` 残件，恰好是"最近"的备份文件，而恢复文档让用户"选一个最近的"

`start.bat:113-115` 新增两阶段落盘：先写 `<dest>.<PID>.partial`，完整性校验通过后才 `Move-Item -Force`（`start.bat:121`）。失败/中断只回收自己那一个 `.partial`，`.db` 一律不碰——就"不误删有效备份"而言这是正确的改进。问题出在**残件本身第一次进入了用户可见的目录**，而恢复文档没有同步：

- `docs/QUICKSTART.md:174`：「打开 `backend/data/backups/`，**选一个最近、状态正常的备份文件**。」
- 残件名形如 `finquant-backup-20260911-120000.db.1234.partial`（`start.bat:121` 的 `$part=$dest+'.'+$PID+'.partial'`）。它**带时间戳且是最新的**，按名字倒序排在所有 `.db` 之前；扩展名 `.partial` 不是 Windows 已知类型，默认"隐藏已知扩展名"设置下仍会完整显示，用户看到的是一长串很像备份的文件名。
- `docs/QUICKSTART.md:176` 明确教用户删除 `finquant.db-wal`/`-shm` 这类"临时日志"，却**从未提及 `.partial`**；`docs/QUICKSTART.md:169` 的自动备份说明也只描述了 `finquant-backup-20260913-083000.db` 这一种形态。

为什么最危险：这是**用户已经在数据受损、正按文档抢救数据的那一刻**，把一份被中断的、页数不完整的 SQLite 文件覆盖到 `finquant.db` 上——SQLite 会以 `malformed`/静默缺失尾部页的形式失败，而用户以为"恢复成功"。同时残件**永远不会被自动回收**：`start.bat:121` 的回收判据是"自己的 PID + 自己的时间戳"，下次运行的 PID 即使复用，时间戳也不同，名字对不上 ⇒ 残件只增不减（`start.bat:121` 已诚实提示"可能来自上次中断…可手动删除"，但提示只在启动窗口一闪而过）。

可达性证据：残件产生于"备份正在写的几秒~几十秒内被 Ctrl+C/关窗/断电"，以及删除动作本身失败（`DeleteFile(..., SendToRecycleBin)` 在**无回收站的卷**——U 盘、部分网络共享——或回收站不可用时**会抛异常**；该调用在 `start.bat:121` 的 `if($LASTEXITCODE -ne 0...)` 分支内**没有 try/catch**，被 `$ErrorActionPreference='Stop'` 变成终止错误，脚本停在 `backup_failed`，残件留下）。本机实测：`backend\data\backups` 目录**不存在**（`NO DIR`），故本沙箱**未观察到真实残件**，本条为代码路径推演而非现场证据。

### 场景 2（P2，"诚实渲染"倒退）：降级判据越做越细，但**失败原因从不离开后端**；回放路径还退化成字符串前缀哨兵，主编失败会被显示成"完成"

R4 把降级判据从"字符串前缀哨兵"改成读结构、覆盖工具失败的 5 种形态，并新增空内容与 `finish_reason=="length"` 判据（基线第 1 条）。判据确实更准了，但**这些理由被收集进 `agent_reasons` 后只当布尔用**：

- `research_orch.py:349-350`：`if agent_reasons: degraded = True` —— `agent_reasons` 的内容**在此之后没有任何消费者**；`agent_failed`（`:345`、`:384`、`:420`）只携带 `str(exc)`，工具失败的 5 形态/截断/空内容都走 `agent_completed`（`:358-362`）或只置 `degraded`，**不 emit 任何事件**。
- 后果：用户看到的是"报告可能不完整"（`frontend/src/pages/Research.tsx:480-483`），但**永远看不到是哪个工具、哪种形态失败**。同一份报告在图上是"4 个 Agent 全部完成 + 主编完成"（`:358` 的 `agent_completed`），与"降级"标记自相矛盾。

回放路径更弱：

- 持久化本身**是有的**：`routers/research.py:264` 对每个非 `done` 事件调 `_append_event`，`agent_failed` 连同 `role_key`、`payload` 落 `research_events`（`:388-391`），历史详情也会返回（`:474-480`）。**因此"agent_failed 没有持久化"的说法不准确**（见 `git log 7bfd191` 中前一轮遗留的判断）。
- 但**前端回放不看事件表**：`Research.tsx:232-236` 只用 `report.agent_results[key].content.startsWith('【分析失败】')` 判失败。这正好是项目 `AGENTS.md` 明令禁止的"字符串前缀哨兵"（"失败/降级判据不要用字符串前缀哨兵"），且覆盖不全：**主编失败时 `lead_content` 被置空**（`research_orch.py:417-420`），空串不以 `【分析失败】` 开头 ⇒ 重开报告时**主编卡片显示"完成"**，而实时路径（`Research.tsx:333` 的 `case 'agent_failed'`）显示"失败"。同一条信息，实时与回放两条路径结论不一致，正是基线第 ② ③ 条点名要求质疑的形态。

### 场景 3（P2，可用性/成本）：LLM 调用没有"整次调用的总时长预算"，最坏静默等待被 R4 从 ~1.5s 抬到 420s

- `llm_client.py:192-221`：`_MAX_ATTEMPTS=3`（`:25`），每次 `await asyncio.sleep(_retry_delay_seconds(...))`（`:218`），`Retry-After` 上限 30s（`:32`、`:79`）。**函数没有 deadline/预算参数**，全仓亦无 `asyncio.wait_for` 包住它（grep `wait_for` 只命中 `mcp_runtime.py:19`、`notifications.py:44`）。
- 单次 `chat`/`chat_with_tools` 最坏时长 = 3 × `timeout`（默认 120s，`:132`）+ 2 × 30s = **420 秒**；`Retry-After` 改动前这个上限是 2 × ~1.0s ≈ 2 秒。也就是说 **R4 的 Retry-After 支持把"单次调用的最坏静默等待"放大了两个数量级**，而没有配套的总预算。
- 在 `chat_with_tools_loop`（`:357` 起，多轮工具循环）里，每一轮都是一次这样的调用；研究有 4 个 Agent 并行、报告主编再一轮。上游 429 时用户会长时间看到"运行中"，SSE 无进度、无取消入口（`routers/research.py:345` 的 `EventSourceResponse` 未传 `ping`，sse-starlette 默认 15s keepalive，**未验证**是否有前端等待上限）。
- `chat_stream`（`:476-509`）**完全不重试**（没有任何 `_post_retry` 调用；grep 的 `_post_chat_with_retry` 调用点只有 `:241/:271/:321`）。一次瞬时 429 就直接 `LLMError`，而流式路径常用于聊天/讨论 —— 与"长管线对抖动零容忍"的 G-11 初衷不同源。
- 用量口径：`record_llm_usage` 只在成功路径调用（`:247`、`:507`）。重试掉的失败请求**不计入用量**，这本身合理（失败通常无 usage）；但**超时**属于例外——第一次尝试 read timeout 时上游可能已经生成并计费，本地重试成功后只记一次 ⇒ 计价模块会**低估**。流式中断（`:508` 抛 `LLMError`）也完全不计费，而用户已经看到了部分输出。

## 逐项检查

### 1. `start.bat` 备份段（两阶段落盘）

- 现状：`start.bat:118-124`（判据/回收/改名）、`:126-128`（失败提示）。
- 磁盘满：sqlite 写入失败 → 非零退出 → 删除自己的 `.partial` → `:122` `goto backup_failed` → 启动继续。**受控**（不阻塞启动、不产生半成品 `.db`）。
- 目录不可写：`:121` 的 `New-Item -ItemType Directory -Force` 抛错（`-Command` 里 `$ErrorActionPreference='Stop'`）→ 退出码 1 → `backup_failed`。**受控**，但提示只提"检查磁盘空间"（`:127`），对"目录只读/在只读共享上"是误导性建议。**疏忽点（P4）**。
- 目标被占用：`Move-Item -Force` 抛错 → 自己的 `.partial` 被回收 → `backup_failed`。**受控**。（同卷 `Move-Item -Force` 用 MOVEFILE_REPLACE_EXISTING，不存在"先删目标再复制"的半程丢失；未实测，标未验证。）
- **同一秒两个实例**：`$dest` 只由 `Get-Date -Format 'yyyyMMdd-HHmmss'` 决定（`:121`），**不含 PID**；`$part` 含 `$PID` 故两份 `.partial` 不互撞（`:113-114` 的注释仅对 `.partial` 成立）。两个实例都通过完整性校验后，后者的 `Move-Item -Force` **覆盖**前者刚写好的最终文件。影响低（两者都是完整快照，最终仍是有效备份），但注释"同秒双启动不互撞"**表述过宽**。且这个场景真实可达：`:22` 的端口占用检查在 uvicorn 绑定**之前**执行，同秒双击两次时 8000 尚未 listen，两个实例都会通过端口检查并各自跑一遍备份。**疏忽点（P3）**。
- 中断残留累积：见场景 1。**未受控（P1）**。
- 建议：①`$dest` 加 PID 或改用 `New-Item -Path $dest -ErrorAction Stop` 的独占创建语义；②`DeleteFile` 三处调用外面包 `try{}catch{}`，避免回收站不可用把"备份失败"路径变成异常终止；③`backup_failed` 文案补"目录可写"；④把 `.partial` 的说明写进 `QUICKSTART`（见场景 1 建议）。

### 2. 降级语义（`research_orch.py` / `routers/research.py` / `scheduler.py`）

- 现状：`research_orch.py:283-288`（事件语义表）、`:339-346`（Agent LLMError → 非致命）、`:375-392`（`node_failed` → 改发 `agent_failed` 并写占位结果）、`:417-420`（主编 LLMError）、`:426-427`（主编口径与 `report_builder` 逐字一致）；`routers/research.py:261-273`（消费：只有 `error` 触发 `_fail_report` + break）、`:264`（全事件持久化）。
- 是否受控：**核心目标达成**——`node_failed` 不再 `break` 掉整轮，其余 Agent 成果保留；真致命路径（`:304-309` 拿不到 LLM client 的 `yield "error"`）仍然致命，未被本次改动吞掉。**没有发现"反向把该致命的也吞掉"**：`:406-409` 之外的异常（例如 `model_router` 抛非 `LLMError`）不在 `except LLMError` 覆盖内，会冒泡到 `routers/research.py:298-309` 的兜底 `_fail_report`，仍是致命。
- 疏忽点 A（P2）：工具失败的 5 形态/空内容/截断只置 `degraded`，**理由不落地**（`research_orch.py:349-350`），用户与运维都看不到原因；同时该 Agent 仍发 `agent_completed`（`:358`），与"降级"矛盾。
- 疏忽点 B（P2）：回放用字符串前缀哨兵（`Research.tsx:235`），主编失败（`research_orch.py:417-420` 置空串）在回放中显示为"完成"；实时与回放不一致。
- 疏忽点 C（P3，未验证）：`scheduler.py` 侧的消费未读取（`services/scheduler.py` 只在 grep 中命中 `heartbeat`，未确认它是否也解析研究事件流）。**未验证**。若定时任务把 `done.quality` 当"成功"计数，降级会把定时任务的"成功"指标高估。
- 建议：把 `agent_reasons` 作为 `agent_failed`/新 `agent_degraded` 事件的 `reasons` 字段发出并持久化；回放改为读 `research_events`（`routers/research.py:474-480` 已返回 `event_type`+`payload`，只是前端类型 `Research.tsx:46` 未声明 payload），删除 `:235` 的前缀判据；`agent_results` 里为降级 Agent 明确写 `status`。

### 3. `llm_client.py` 重试

- 现状：`llm_client.py:24`（可重试状态码）、`:25`（3 次）、`:32`（单次 30s 上限）、`:74-79`（`Retry-After: 0` 回落退避，`<=0` 与非法值均不采信）、`:87`（抖动 ±25%）、`:90-96`（Retry-After 优先）、`:192-221`（重试循环）、`:476-509`（`chat_stream`）。
- 是否受控：单次等待**有界**（≤30s），指数退避有抖动（并发 Agent 去同步），`Retry-After: 0` 的紧循环已修；不可重试的 4xx 直接返回（`:213-214`）不会白烧额度。
- 疏忽点 A（P2）：**无整次调用总时长预算**（见场景 3），最坏 420s。
- 疏忽点 B（P2）：**`chat_stream` 无任何重试**（`:476`），与 G-11 的"长管线零容忍抖动"不同源。
- 疏忽点 C（P3）：**重试掉的失败请求不计用量**；超时场景会导致上游实际计费 > 本地记录（低估），流式中断（`:508`）完全不计。计价模块（基线提到的"计价/用量统计"）对不上账。
- 建议：给 `_post_chat_with_retry` 加 `deadline`/总预算参数（例如整次调用 ≤90s，与 `start.bat:139` 的 90s 开浏览器截止时间对齐语义），超预算直接 `LLMError`；`chat_stream` 至少对"未产出任何 token 的建连失败"做一次重试；用量侧记录 `attempts`，或在超时路径记一条 `unbilled_attempt` 便于对账。

### 4. `frontend/src/store/authStore.ts` 的 `unavailable`

- 现状：`authStore.ts:9`（新增状态）、`:51-55`（仅 401/403 判"需要登录"）、`:70-91`（3 次探测，耗尽落 `unavailable`）、`:105`（`status!=='idle'` 时 `initialize` 直接返回）、`:111-115`（`retry`）。
- 是否受控：方向正确且优于改动前——本地模式（`start.bat:135` `LOCAL_ONLY_MODE=1`）下不再被送进永远走不通的登录页。
- 反向风险（P3，**依赖未验证前提**）：`isAuthRequired`（`:52-55`）读的是 `error.status`。若某条路径上 `status` 未被保留（`api.ts` 保留 `status` 的说法未读取验证；`getCurrentUser` 的实现未读），401 会落入"继续重试"→ 3 次后 `unavailable` ⇒ **确实需要登录的场景被判成"服务未就绪"，`retry()` 只是重复同一探测，用户永远进不去**。这正是任务书第 4 条要求质疑的形态，**证据不足，标未验证**，但成本极低：加一条"`anonymous` 与 `unavailable` 的判据必须有测试覆盖 401"即可闭环。
- 次生风险（P3）：`unavailable` 无自动重探（`:105` 的 `initialize` 早退 + 无定时器），只靠 `retry()`；而 `start.bat:139` 是在"端口可连"就打开浏览器，若 lifespan（52 表迁移，首次启动最慢）尚未就绪，首次探测的 3 次重试总共只覆盖约 2s（`:40` `delayMs=1000`），**新用户第一次启动**最可能落到 `unavailable`。是否有"重试"按钮由 `AuthGate` 决定，**未验证**。
- 建议：把"确实需要登录"的判据从"`error.status` 存在"改成"后端 `/auth/me` 返回结构化未登录信号"（与项目"读结构不读哨兵"的既有纪律一致）；`unavailable` 增加有限次自恢复（如 1s/2s/4s，上限 30s）；为 401-未保留 status 的畸形 axios 错误补一条单测。

### 5. 启动链与前端产物（基线第 5 条）

- 现状：`start.bat:56-64`（mtime 判据）、`:66-75`（VS-14：偏旧不再硬退出，只在**确实缺失**时才要求 Bun，`:186-189`）、`:77-79`（复用路径打印构建时间）。
- 是否受控：不再把用户挡在门外，方向正确；`:78` 打印 `%%~tI` 让用户有据可查。
- 疏忽点（P2，**新触达面**）：产物"存在但偏旧/半截"现在会**带着不匹配的界面启动**，唯一提示是控制台一行 `[提示]`（`:74-75`），而双击启动的窗口马上被后续输出刷下去；非技术用户无法从"界面点不动/请求 404"联想到"前端产物偏旧"。改动前是硬退出（用户被挡但信息明确）。建议：偏旧启动时在**页面上**（而非仅控制台）给一条可关闭的横幅，或把 `dist` 的构建时间写进 `/api/health` 供前端自检。

### 6. 文档与实现一致性（基线第 6 条）

- 已一致：`docs/QUICKSTART.md:169`「备份不会自动删除…只会给出提示」↔ `start.bat:116-117`+`:121`（只提示不删）。✅
- 已一致：`docs/QUICKSTART.md:163`「只在 index.html 缺失或 package.json 更新时自动构建」↔ `start.bat:56-63`。✅
- **不一致（P1）**：`docs/QUICKSTART.md:174` 的恢复指引未覆盖 `.partial`（场景 1），且 `:169` 的备份形态描述与 `:121` 实际会产出 `.partial` 不符。
- 未验证：`docs/QUICKSTART.md:32` 指向的"8000 端口已被占用"一节与 `start.bat:28-33` 文案是否逐字一致（未读该节）。

### 7. 仓库行尾（基线第 8 条）

- 实测 `git ls-files --eol`：`start.bat` 为 `i/lf w/crlf attr/text eol=crlf`，`.gitattributes` 命中 `attr/`。✅ 索引存 LF + 属性强制检出 CRLF，已满足 `autocrlf=false` 克隆者的双击需求。

## 近期改动引入的新风险（对基线 8 类逐条）

1. **研究失败语义收口（`agent_failed`）**：新风险**有** ——（a）判据新覆盖的 5 种工具失败形态/空内容/截断**不产生任何事件**，只置 `degraded`（`research_orch.py:349-350`），用户看不到哪一环失败；（b）回放路径用 `【分析失败】` 前缀哨兵（`Research.tsx:235`），主编失败（`research_orch.py:417-420`）在回放中显示为"完成"，实时/回放不一致。消费方清单：`Research.tsx:333`（实时，✅）、`frontend/src/features/swarm/state.ts:101`（✅）、`routers/research.py:264`（持久化，✅）、`Research.tsx:232-236`（回放，⚠ 不读事件表）、`services/scheduler.py`（**未验证**）。**"反向吞掉致命"未见**：`yield "error"` 的真致命路径与兜底 `_fail_report`（`routers/research.py:298-309`）都还在。
2. **LLM 重试/Retry-After**：新风险**有** —— `Retry-After` 把单次调用最坏静默等待从 ~2s 抬到 420s 而未加总预算（场景 3）；`chat_stream` 无重试、超时漏计用量。
3. **前端失败可见性（`Research.tsx` 的 `case 'agent_failed'`）**：实时路径**未见**新风险（`:327-340` 处理正确，且 `applyAgentEvent` 已抽出）。但**回放**路径未同步（第 1 条 (b)），属"同一件事的两条路径必须同源"的经典缺口。
4. **本地模式登录死胡同修复**：新风险**未见**（方向正确，消除死胡同）。残留的是"判据依赖 `error.status` 是否被保留"（未验证）与"无自动重探"。
5. **启动链（备份两阶段 / 偏旧产物不硬退出）**：新风险**有** —— ①`.partial` 残件第一次出现在用户会按文档翻找的目录里，且恢复文档未同步（场景 1，P1）；②`$dest` 无 PID 而 `Move-Item -Force` 可覆盖同秒实例的成品，`:113-114` 注释表述过宽（P3）；③偏旧产物静默启动后只在控制台提示（P2）。
6. **用户可见文本与实现对齐**：`:venv_failed` 打印版本（`start.bat:164-167`）✅；QUICKSTART 备份说明已对齐 ✅；**但 `.partial` 未对齐（P1）**。
7. **首页入口带 id（VS-16 深链）**：**未见**新风险（本报告未审该路径；前一轮 A4 已覆盖 `?room=` 守卫）。**未验证**。
8. **仓库行尾 `*.bat eol=crlf`**：**未见**新风险（实测 `attr/text eol=crlf` 生效）。

**第四问（触达面变大/第一次可达）——本轮实例**：
- 例一（第一次可达）：`backend/data/backups/` 里出现 `.partial` 这种**同名同目录、带最新时间戳**的新文件类型，恢复文档的"选一个最近的"恰好把它排到第一位（场景 1）。这既不是"新代码有 bug"也不是"文档写错"，而是**新机制让一条既有指引第一次指向错误对象**。
- 例二（触达面变大）：`start.bat:22` 的端口检查发生在 uvicorn 绑定之前，使"同秒双击两次"第一次能真正走到并发备份段 ⇒ `Move-Item -Force` 的覆盖分支第一次可达（场景 1 的 P3 子项）。
- 例三（第一次可达）：`Retry-After` 让"单次调用等待 30 秒"第一次可达，而全链路的等待预算/取消语义（SSE 无进度、前端无取消）此前按 ~2s 上限设计（场景 3）。

## 建议修复顺序

1. **P1** `docs/QUICKSTART.md:174`（+`:169`）：恢复指引必须写明 —— 只选 `finquant-backup-*.db`（**不要**选 `.db.<数字>.partial`，那是中断的临时文件）；并在 `:169` 的备份说明里补一句"中断会留下 `.partial`，可手动送回收站"。同时 `start.bat:121` 的提示语沿用同一措辞。（改文案即可，零代码风险，直接消除最坏的数据丢失路径。）
2. **P1** `start.bat:121`：给三处 `DeleteFile(...)` 加 `try{}catch{}`，使"回收站不可用/无回收站的卷"不再把流程打成异常终止；`$dest` 增加 PID 或改用独占创建，收紧 `:113-114` 的注释到"`.partial` 不互撞"。
3. **P2** `research_orch.py:345/384/420` + `Research.tsx:232-236`：把降级理由随事件发出并持久化，回放改读 `research_events`（`routers/research.py:474-480` 已返回 payload），删除 `Research.tsx:235` 的前缀哨兵；同步修主编失败回放显示"完成"。
4. **P2** `llm_client.py:192-221`：加整次调用总预算（建议 90s，与 `start.bat:139` 的 90s 同语义）；`:476` 的 `chat_stream` 对建连失败做一次重试；用量侧记录尝试次数以便对账。
5. **P2** `start.bat:66-79`：产物偏旧启动时给出**页面级**可见提示（或把 dist 构建时间暴露给前端自检）。
6. **P3** `authStore.ts:52-55` + `api.ts`：把"需要登录"的判据改为结构化信号并补 401 单测；`unavailable` 增加有限自恢复。
7. **P4** `start.bat:121` 的 `-Filter 'finquant-backup-*.db'`：实测一次它是否会把 `.db.<PID>.partial` 计入（Win32 通配符存在 `*.doc` 匹配 `.docx` 的前缀匹配怪癖，注释断言"天然不匹配"值得一次性验证）。

## 未验证项

- `frontend/src/services/api.ts` 是否**真的**把 HTTP `status` 保留到抛出的错误对象上；`services/authApi.ts` 的 `getCurrentUser` 走哪条请求路径（grep `status|catch|throw` 在 `authApi.ts` **无命中**，说明它不自行包装错误）。**这不是我的结论有误，而是"场景 4 的反向风险"真实性取决于此**。
- `AuthGate` 是否在 `unavailable` 下渲染可点的"重试"入口（未读该组件）。
- `services/scheduler.py` 是否另有研究事件消费方、是否把 `done.quality=degraded` 计入成功指标（未读）。
- 2026-09-11 基线提到的"排序 7 份提示"计数是否受 `.partial` 污染（需实测 `-Filter` 语义，见 P4）。
- `Move-Item -Force` 在目标被占用时是否可能"先删后失败"（同卷应为原子替换，未实测）。
- 本机未观察到 `.partial` 残件（`backend\data\backups` 目录不存在），场景 1 为代码路径推演；夹具复现需按项目纪律把 `powershell.exe … -Command ^` 连续行逐字做成 `.bat` 交 `cmd.exe` 运行。
- `research_orch.py:430-483`（主编结果如何写入 `agent_results`）与 `report_builder` 的 `quality` 口径未读完，主编失败时 `agent_results['report_lead']` 的确切内容未验证（据此推断的回放显示"完成"属高置信推断，非直接观察）。
