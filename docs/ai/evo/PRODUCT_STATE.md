# PRODUCT_STATE — 产品演进状态（Product Evolution Orchestrator 维护）

> 2026-09-13 初始化；每轮结束更新。当前轮：R14（VS-4 合入）。

## 当前成熟度快照
- 功能完备度高（schema v26、909+ 测试、470+ Vitest、E2E 50+21、i18n 2454 parity 0）。HEAD `cda6f76`，工作树干净。
- 演进视角定位：**发布前成熟度打磨期**——优先"失败语义诚实、数据安全、上手体验、可靠性"，警惕 Feature Creep。

## 演进循环进度
- R1：PROJECT_BRIEF + 四路独立审计启动。
- R2：四路审计（环境卡死）→ 抢救出独立认知（RAW_*）→ PRODUCT_GAP_MAP（G-01..G-15）→ 路线图。
- R3-R8：**VS-1（G-02+G-03 后端）** → Evaluator 抓 router fail+break 缺陷 → 修复 → `909980b`。
- R9-R10：**VS-2（G-01 备份）** → Evaluator ACCEPT + 指出"失败误报已备份" → 修复 → `199d400`。
- R11-R12：**VS-3（G-03 前端可见）** → Evaluator **REJECT**（实时路径读错字段）→ 修复 → 复评 ACCEPT → `e49e607`。
- R13-R14：**VS-4（G-11 LLM 重试）** → 独立评估**连续 3 次被环境 429 阻断** → 改做明示自查（发现并修复死赋值）→ `cda6f76`。
- R15：**补做 VS-4 独立评估 → ACCEPT**（Evaluator 独立复核：循环上限/4xx 不重试/耗尽语义/三处整改/测试真实性均确认；并证实自查发现的死赋值已删）。**四个 Slice 的独立评估现已全部齐全。**
- R16-R17：**第二轮局部审计（A2 UX / D2 可靠）** —— 两路**均早期死于 429 限流**，无正式报告；已抢救其独立认知（`RAW_R2_*.md`）并记入 `AUDIT_R2_PARTIAL.md`。**审计不完整，待补。**
  - 编排者核实并**证伪**了 A2 的一个未验证假说（"pages/Research.tsx 是死页面"）——实为 `ResearchWorkspace.tsx:26/81` 在 `mode==='deep'` 下渲染，**VS-3 可达性成立**。教训：审计者假说须以代码事实裁决。
  - 采纳 A2 已核实的 **P0 候选**作为下一 slice：AI 首用配置被文档引向手编 `.env`，而站内模型管理可用且凭据自动持久化（`credential_store.py:29-47` + `config.py:51` 证实）。
- R17-R18：**VS-5（AI 首用配置引导一致性）** —— 独立 Evaluator **REJECT（窄口径）**：主要主张全部验证通过，但抓出 `docs/PRD.md` 三处与代码冲突（我新写的"`.env` 启动时迁入加密凭据表"**是虚构机制**——实际是 `model_router.py:38-39` 运行时 `os.getenv` 现读；另有"后续可加 Fernet"与已实现加密矛盾、schema 注释仍写"明文"）→ 按处方修复 → 复评 **ACCEPT** → `79462dd` + 精确性修正。
- R47-R58：**VS-7（降级语义补全）** —— Implementer 交出四部分（quality 源头并入 `report_data`；lead 空/不可解析判降级；工具异常与循环耗尽捕获；router 幂等兜底）。独立 Evaluator **REJECT**（P0 落库链、`tool_loop_exhausted` 位置、router 兜底三项经核实成立，但 **P1a「同口径」为假**：`research_orch` 判**原始字符串**非空、`report_builder` 判 `parse_lead_review()` **解析后 dict** 真值 → "非空但不可解析的散文 lead"下二者仍矛盾，只消除了空串那一种）→ 改用同一解析函数 + 补变异敏感测试 → 复评 **ACCEPT**（61 passed）→ `c51fa20`。
  - **复盘**：该缺陷源于**我的任务书措辞含糊**（只写"口径一致"、未写明"同一个判定函数"），实现者按字面实现且注释自洽、测试全绿。教训已补入 `memory/VERIFICATION_BLIND_SPOT.md`。
  - 由此派生的缺口已落卡：`BACKLOG-049`（工具失败 5 种返回形态仅异常态被判降级）。

## 已解决问题
- **G-02 调度无限重试**：`_MAX_RETRY_ATTEMPTS=5` claim 拦截。
- **G-03 报告伪装成功**：**全链路闭环**——后端 agent LLMError 非致命降级 + done quality + 持久化（VS-1）；前端 `resolveReportQuality` 顶层读取 + 屏上 Alert + 导出前缀（VS-3）。
- **G-01 无备份/恢复**：启动自动备份（滚动、只提示不自动删）+ 文档化恢复流程。
- **G-11 LLM 无重试**：`_post_chat_with_retry` 对 429/5xx/网络做指数退避（≤3 次），4xx 不重试。**独立评估已补齐 → ACCEPT**。

## A2 产品UX审计（R2，补做）发现清单
报告：`PRODUCT_UX_REPORT_R2.md`（9 问题 / 5 未验证）。**编排者已逐条核实代码事实并做综合对账（R69）。**

**A2 的三条"最大 UX 缺口"与对账结果**：
1. **缺口1 = P0-1 Bun 硬检查先于产物复用** → **✅ 已由 VS-8 关闭**（`ec0fa6c`：探测改非致命、判定移到 `:build_frontend`、`:bun_missing` 指引）。A2 的"唯一会让首次使用彻底归零的环节"已消除。
2. **缺口2 = P2-1 脚本内提示与文档分叉（`start.bat:89`）** → **✅ 已由 VS-8 关闭**（三处同向：脚本提示 / QUICKSTART / README）。
3. **缺口3 = P1-2 端口冲突恢复建议偏重** → **部分成立、部分已达成**：现状 `start.bat:29-30` 已是"1) 关旧窗口 → 2) 重启电脑"（轻→重，非 A2 所述的倒置）；但 A2 的建议后半段（**脚本自我识别是否为本项目旧实例并询问"是否结束它"**）确有价值，记入 LATER。QUICKSTART 侧 `netstat` 段仍偏开发者，可标"进阶（可跳过）"。

**逐项处置（含去重与成本判断）**：

| 编号 | 问题 | 处置 |
| --- | --- | --- |
| P0-1 | Bun 检查先于产物复用 | ✅ 已修（VS-8） |
| P0-2 | 要求非技术用户用 PowerShell 装 Bun | **部分缓解**（预置产物路径免 Bun）；**剩余**：确需构建时仍只有 PowerShell 一行脚本。A2 建议的"图形化指引 + 安抚说明"仍是有效改进 → **NEXT 候选** |
| P1-1 | Python 钉死 3.12 | 版本放宽：**NOT_NOW**（与文档一致、放宽需兼容性验证）。但 A2 另有**低成本高价值**的一半：**失败文案应说明"检测到的版本是什么"** → **NEXT 候选（小）** |
| P1-2 | 端口建议 | 见缺口3：主项已达成；"自动识别旧实例"记 LATER；文档标"进阶"可顺手做 |
| P2-1 | 脚本提示与文档分叉 | ✅ 已修（VS-8） |
| P2-2 | Dashboard 入口名与落地页不一致（`/chat`、`/discussion` → `/research?mode=…`） | **NEXT 候选**：用户怀疑点错；A2 给两个选项（按钮标注去向 / 侧栏显式列出子项） |
| P3-1 | 硬编码维护者本机路径（`start.bat:15`） | LATER：对他人永不命中，属开源分发噪声 |
| P3-2 | 备份只提示不清理 | LATER：自动清理需以回收站方式实现并承担误删风险，收益不抵风险（VS-2 已定的"只提示不删"仍成立） |

**A2 的 5 项未验证**：**已全部闭环（R72/R74）**——
1. 本地模式确无登录墙（`auth.py:90,125-126`）；
2. 默认语言确为中文（`i18n/index.ts:12` 回退 `'zh'`）；
3. 侧栏中文名与 QUICKSTART 措辞**逐字一致**（R74 核对：`nav.research=研究`+`nav.research.home=研究工作区`、`nav.discover=发现`+`nav.discover.limitPool=涨跌停池`、`nav.portfolio.home=组合与风险`，三组全对）；`nav.discover.home='机会发现'` 是分组落地页子项，文档未提也无需提，**不构成不一致**（A2 当时未把它列为发现项是正确的克制）。

**A2 明确肯定的好体验（值得保留，勿在后续改动中破坏）**：等后端就绪再开浏览器、三段式面向非技术用户的错误文案、启动自动备份+恢复文档、首页"试一试示例"入口、能力状态诚实提示（UNCONFIGURED / CONFIGURED_UNVERIFIED / UNKNOWN）、顶栏系统健康指示器、不配 AI 也能完成首次使用。
- **A2 请编排者验证的两项已闭环（R50）**：
  1. **本地模式无登录墙 —— 成立**：`backend/app/routers/auth.py:90,125-126` 在 `LOCAL_ONLY_MODE` 下 `/api/auth/me` 直接返回本地所有者 → 前端 `authStore.initialize()` 拿到用户即 `isAuthenticated=true` → `AuthGate`（`App.tsx:386-388`）不重定向。`QUICKSTART:50` 声明正确。
  2. **默认语言为中文 —— 成立**：`frontend/src/i18n/index.ts:12` 无保存偏好时回退 `'zh'`；`LanguageContext.tsx:11` 默认 `'zh'`。目标用户不会撞到英文界面。
- **A2 的反常识结论**：应用内首启体验（Dashboard hero/能力横幅/带参示例按钮、等端口就绪再开浏览器、三段式错误文案、自动备份+恢复文档）**质量相当高**，缺口集中在"**服务启动之前**"这一段。

## ⚠️ 待补事项（跨轮跟踪）
1. ~~VS-4 补独立评估~~ **已完成（R15 ACCEPT）**。
2. ~~R2 审计~~ **A2 与 D2 均已完成**（D2 见上；A2 见其发现清单）。
3. **D2 报告的其余 P0/P1 尚未处理**：P0 降级标记不落库（VS-7 处理中）、P1 降级白名单、P1 重试放大、P1 备份 WAL、P1 密钥脱敏。
4. **A2 的 P0（Bun 检查顺序）已核实，待排期**。
5. A2 标注的 5 项未验证（LOCAL_ONLY 登录墙、默认语言等）待验证。

## D2 可靠性审计（R2）发现清单
- **✅ 已修并复评 ACCEPT（P0）**：G-02 上限拦截两处缺陷（判定前置、只计 failed、24h 时间窗自动恢复、手动「立即运行」绕过熔断、文案如实）→ `eff8e2d` + `d731b57`（复评 `3e49de5c` ACCEPT，22 passed）。
  - 复盘已沉淀：`memory/VERIFICATION_BLIND_SPOT.md`（**错误前提会穿透自验+他验**——brief 写错时，Evaluator 只能验一致性，抓不出前提错误；必须由独立审计质疑前提）。
- **P0 未修**：**降级标记不落库**——`research_orch.py:324-329` 把 `quality` 放在 done_payload **顶层**，而 `scheduler.py:171-183` 只持久化 `report`/`agent_results` → **定时研究产出的降级报告以 `status='completed'` 入库，DB 重载后与正常报告无区别**（用户看不到降级）。注：交互路径由 `routers/research.py` 合并 quality 后落库（VS-1 已修），但**调度路径漏了**。
- **P1 未修**：降级白名单过窄——仅捕 `LLMError`（`research_orch.py:227/291`）；**工具异常被吞成文本**（`llm_client.py:318-322`）、`tool_loop_exhausted` 未被消费（`research_orch.py:254`）、lead 空返回仍标 `audited`。
- **P1→降为 P2 加固（编排者已复核 R80）**：重试放大——无抖动、不读 `Retry-After`、无熔断。
  - **算式属实**：`_MAX_ATTEMPTS=3`（`llm_client.py:21`）× 每 agent 6 次调用（`research_orch.py:144` 的 `for _round in range(5)` + 1 次强制收尾）× 5 个 agent = **最坏 90 次上游请求**。
  - **但影响有界**：退避仅 0.5s→1.0s（总增时延约 45s），且研究是**用户发起、单次运行**，非后台高频；4xx 不重试已正确排除"坏 key 打 3 次"。
  - **真正值得做的一条**：**完全未读 `Retry-After`**（实测命中 0 处）。供应商在 429/503 上明确给出等待时长时我们仍按固定退避立刻重试，属**协议层面的不礼貌**，可能招致更长限流。→ 列为 **NEXT 小项（低成本、可判定）**：`_post_chat_with_retry` 在可重试状态码且响应含 `Retry-After` 时按其等待（设上限），否则用现有退避；顺带加抖动。
- **✅ 已修并 ACCEPT（P1→数据安全）**：启动备份只复制 `finquant.db`（不含 `-wal`）→ **VS-9 改为 `sqlite3.Connection.backup()`**（`ab15be8`）。**编排者在真实数据上的四路实测**：旧 `Copy-Item` = 24/0/331（丢数据）、`Connection.backup()` = 26/1/334、`VACUUM INTO` = 26/1/334、三件套基准 = 26/1/334 ⇒ 旧方式确实静默丢失（schema v25/v26 迁移成果与 `user_credentials` 行都在 WAL 中）。
  - **独立验收（Evaluator 自造 WAL 场景，未采信任何自述）**：主文件 4096B / WAL 45352B、连接不关闭 → 三件套基准 **202** / 旧只复制 `.db` **0（表都不存在）** / 新实现（`:backup` 段逐字经 `cmd.exe` 真跑，载荷 1232 字符完全一致）**202** ⇒ ①=③ 且 ①≠②。字节级 CRLF=171 / LF-only=0 / 严格 UTF-8；失败路径打透：venv 缺失 → `:backup_failed` 且不建 backups 目录；构造"备份成功但 integrity 失败" → **exit 3** 且残件 0，并**在回收站 `$I` 元数据命中被清理产物路径**证明确走回收站。
  - **架构一致性**：`Connection.backup()` 是**全仓既有约定共 4 处**（`database.py:1854-1875` 两处迁移备份、`audit_database_recovery.py`、`verify_local_install.ps1:203`）——VS-2 的 `Copy-Item` 是**唯一异类**，本卡把它拉回同一约定。
  - **⚠️ 环境变化（影响后续验证方法）**：真实 `backend\data` 的 `-wal`/`-shm` 已被 **checkpoint**（实现者观察到并主动报告；真实库仍为 26/1/334、integrity ok、无数据丢失）。**副作用：真实目录上"新旧实现的差异信号已消失"**——现在对真实数据用旧的 `Copy-Item` 也会得到 26/1/334。**后续凡验证备份/WAL 相关改动，必须自造 WAL 场景**（建库→`journal_mode=WAL`→插数据→**保持连接不关闭**使数据留在 `-wal` 未合并），否则会得到假阳性。
  - **过程教训（编排者自身）**：我第一次复刻"逐字载荷经 cmd 执行"时误报失败，根因是 **PowerShell 5.1 的 `Get-Content` 默认按 ANSI 读取**，把 UTF-8 无 BOM 的 `start.bat` 中文读坏（含内容 dump 里的乱码为证），加之我自己 `TrimEnd('"')` 留下不配对引号。改用 `[System.IO.File]::ReadAllLines(..., UTF8Encoding($false))` 后同一载荷**经 cmd 正常执行并产出备份**。**若当时按误报去让实现者改代码，就会"修"坏一份正确实现**——复刻失败时先怀疑自己的读取/引号处理。
- **P1 未修**：密钥脱敏仅替换 `self.api_key`（`llm_client.py:99`）；错误文案经 `research_orch` → SSE 可能**落库到 `run_events.payload_json`**（`research_jobs.py:364-367` 的 `payload={"status":…, "error": error}`，error 源自 `scheduler.py:366-368` 的 `str(exc)`）。
  - **编排者已复核并下调严重度（R72）**：主路径脱敏**是生效的**——`model_router.py:37-44` 把解析出的真实 key（用户加密凭据 > 旧 api_key 字段 > 环境变量）传入 `LLMClient(api_key=…)`，故 `self.api_key` 非空、`body.replace` 有效。**残留缺口收窄为三类边界**：①供应商回显的是截断/URL 编码后的 key 时匹配不到；②key 若位于 `base_url` 查询串，`_response_error` **只清洗 api_key 不清洗 URL**；③`self.api_key` 为空时替换退化为空操作（但此时也无 key 可泄）。→ 降为 **P2 加固项**，非 P0。
- **未验证 5 处**（D2 已标注）：`routers/research.py` 是否消费 quality、`database.py` 迁移/磁盘、同步工具是否阻塞事件循环、供应商是否回显密钥、`pending_idempotency_key` 写入方。

## R3 审计（第三轮，2026-09-13）发现

**VS-12 已交付并 ACCEPT**（`d10f784`）：研究失败语义收口——`node_failed` 改非致命 `agent_failed`（真致命 `:308` 保留）、降级判据读结构覆盖工具失败 5 形态、新增空内容与 `finish_reason=="length"` 截断判据（`llm_client` 以 keyword-only 默认 `False` 向后兼容回传）。独立 Evaluator **ACCEPT**，且其验证**超出实现者报告范围**：
- 自行找出**第三个 SSE 消费方** `routers/analysis.py:66-73`（报告未提及），确认三处一致"对 `error` 才 fail+break、对 `agent_failed` 直通" ⇒ router 零改动即非致命**成立，非漏改**；
- 独立实测变异敏感性（真函数）：五形态全 True，退回前缀哨兵时恰好前四种丢判；
- **独立排除反向风险**：`success:true`→非失败、合法 JSON 无 `success`→非失败、非 JSON/简短文本→非失败、空内容只看 `strip()==""` ⇒ **不存在"所有报告变 degraded"**；理论误判（`{` 开头非法 JSON、`{"success":1}`）在生产不可达（唯一调用点输入全部来自 `_execute_tool_call`）；
- `_unpack_tool_response`：5 元组会抛 `ValueError`（**可见失败，非静默吞错**）；
- `git show --stat` 确认 7 文件、**无 frontend/ 与 routers/**；门禁自跑 89 passed。

**VS-12 评估者的非阻断项（编排者裁决）**：
- **F1（升为下一卡 VS-13）**：`frontend/src/pages/Research.tsx` 的 SSE switch（`:286-336`）**没有 `agent_failed` 分支** ⇒ 崩溃 Agent 的卡片**永远停在 running**（也无 `agent_completed`）；改造前 `case 'error'`（`:329-333`）至少会置 failed 并显示原因。**归属**：该缺口**自 VS-1 起已存在于 LLMError 路径**，VS-12 只是延续同一路径——**非 VS-12 的判定错误**。报告级可见性仍在（`done` → `resolveReportQuality` 显示 degraded、正文含【分析失败】）。⇒ **VS-13 = 补 `case 'agent_failed'`，闭合"失败可见"的前端一环**。
- F2：对话路径 `chat_with_tools_loop` 拿到 `finish_reason` 未消费（实现者已按卡声明"未做+原因+无回归"）→ LATER。
- F3：`success is not True` 恒等比较，若未来出现 `success:1` 会误判（当前不可达）→ LATER（可在 VS-13 顺手加 `!= True` 的容错注释，勿扩大）。

**VS-13 已交付并 ACCEPT**（`650ba2a`）：前端补 `case 'agent_failed'`——崩溃 Agent 卡片不再永远停在 running；抽出可测纯函数 `applyAgentEvent`。（**该缺口自 VS-1 起存在**；且实时路径与历史路径（`:207` 已按"【分析失败】"标记）此前**不一致**。）独立 Evaluator **ACCEPT**，其验证力度为本批最高：
- 它**自建并跑通组件级 SSE 测试**（mock `fetch` 返回真实 `ReadableStream` → 真实渲染 `<Research>` → 驱动完整事件序列），**闭合了编排者主动自认的"纯函数单测 ≠ 接线正确"缺口**；
- 逐字 diff 确认 `case 'error'` / `case 'done'` **未被触碰**；并**独立追完端到端链路**（`research_orch:345/384` → `routers/research.py:296` 逐字透传 → `services/sse.ts` 无白名单 → `Research.tsx:461` → `AgentStatusCard.tsx:12/42` 支持 failed 并渲染 progress → i18n 键双语齐全）。
- **F1（已关闭）**：它指出交付的 `ResearchAgentFailed.test.tsx` 只驱动纯函数、**从不渲染页面** ⇒ **删掉 `case 'agent_failed'` 时全部 18 个测试仍全绿**——"本卡要修的缺陷本身没有被常驻测试守住"。并给出**结构性证明**（该测试从未引用页面默认导出）。它同时给出反向判断：**不建议**为可测性再把内联逻辑抽一层（收益低于复杂度）。
  - **编排者采纳并加固**（`01fcaed`）：新增常驻组件级接线防线 `frontend/tests/ResearchAgentFailedWire.test.tsx`，并做**变异实测**——把 `case 'agent_failed':` 改名为变异体后该测试**真的挂**（`TestingLibraryElementError: Unable to find an element with the text: 研究 Agent 异常：boom`，挂点 `:74`），恢复后转绿；**恢复完整性经 SHA256 与变异前备份逐字核对**。
  - 另按 F2 修正了"回归防线/缺陷由此逃逸"等**过强表述**（改为"降低逃逸概率但不覆盖接线"），并按 F4 把"消除该不一致"限定为**状态层面**。
- F3（仅记录）：`report_lead` 的 LLMError 路径先发 `agent_failed` 后**无条件**再发 `agent_completed` ⇒ 卡片按"后到为准"终结为 completed；评估者查证**历史路径同样判 completed，两路径一致**，属既有事件形态，不在本卡范围。

**VS-14 已交付并 ACCEPT**（`e452a93` + 文档同步 `93e6c83`，**编排者接管实现**）：把"产物疑似过期"从**硬退出**降级为**警告后照常启动**（新增 `:stale_frontend` / `:stale_frontend_nobun` / `:reuse_frontend`）——修 A3 P1-2 的**假阳性**方向（重打包触碰 `package.json` ⇒ 产物明明可用却被要求先装 Bun）；产物**真缺失**时仍维持硬失败；复用路径**打印产物构建时间**供用户自查（缓解假阴性方向的静默跑旧前端）。
- **夹具四场景实跑**（决策块逐字抽出 + 镜像真实结构的桩）：缺失→`bun_missing`（硬失败保留）／过期→**`environment`（不再退出，本卡修复）**／新鲜→`environment`／有 Bun + 过期→`build_frontend`。
- **独立评估：先 REJECT → 修复 → 复验 ACCEPT**。REJECT 的**唯一**阻塞项是**文档未同步**（`QUICKSTART:125` 仍写"产物缺失**或过期**…才要求装 Bun 并退出"）——**这正是本会话反复强调、并已写进 `AGENTS.md` 的"改行为时同步改文案"，而我自己违反了它**。评估者甚至给出"若认为文档同步超出范围可判 ACCEPT-as-is"的台阶，**编排者未接受**。已同步 `QUICKSTART:125/:11`、`README:69`，复验 ACCEPT。
- **errorlevel 泄漏：结论成立、归因经评估者更正**：泄漏真实存在（评估者在真实脚本副本上实测 `ERRORLEVEL_AT_LAUNCH=1`），但重置者是 **`:135 start` / `:136 cd backend`**，**不是**我原先所写的"由 uvicorn 覆盖"（该说法已作废）。评估者静态枚举了会写 errorlevel 的前置命令（`:88/:93/:101/:118/:138`），确认 `:114` 跳过备份的路径不做判断 ⇒ 不构成风险。**残留风险已记账**：若日后有人在 `:launch` 的 `start`/`cd` **之前**加 `if errorlevel` 判断会踩到陈旧值。
- **未消除假阴性**：只改源码不改 `package.json` 仍判"新鲜"、静默跑旧前端；真修复（构建指纹）记 LATER。
- **验收后文案修复（已复验 ACCEPT）**：①`:158` 去掉 cmd 会照字面打印的 Markdown `**`（VS-15 评估者 N1）②`:184` 去掉已失效的"产物存在且未过期/过期后仍需安装"，改为"产物存在即不需要 Bun；出现本提示说明产物已缺失"——评估者以**互斥性证明**独立确认该断言成立（`:71 goto build_frontend` 只在 `FQ_BUN_MISSING` 未定义时执行，而 `:83 goto bun_missing` 要求它已定义）。**根因是我的卡把该处文案冻结为"与改造前一致"，属过紧约束**——教训：**若某段文案描述的正是要改的行为，它就必须跟着改。**

**VS-15 已交付并 ACCEPT**（`63da155`，**编排者接管实现**）：用户可见文本与实现对齐——①`start.bat:158` 改为陈述要求（需 Python 3.12）并**打印检测到的版本**（本机实况：无 `py` 启动器 + `python`=3.13.5，旧文案让装了 3.13 的用户无从判断）②`QUICKSTART:169` 由自相矛盾的"滚动保留最近 7 份"改为"**不会自动删除、只提示**"（文本向实现对齐，**未改实现**——否则会引入删除行为，撞上删除铁律）。
- 评估者以 `git diff -U0` **逐行对齐**证明"只改文本"（1 hunk / 6+ / 1-，`:41/:46/:47/:python_path` 与 `:fail` 的 `pause`/`popd`/**`exit /b 1`** 逐字未变），并实测 `2>nul` **不吞**版本号（`python -V` 走 stdout）、stdout 重定向下输出顺序不乱。
- **它同时纠正了编排者一处"未经复核的自述"**：我结果文件里"夹具 A=0/B=1"的**具体数字不可复现**（其惰性桩下为 0/0），已更正为只保留可验证的结论（真实 `:fail` 恒 `exit /b 1`）。

**`.gitattributes` 行尾加固**（`62d5def`，编排者发现并修复）：原文件只有 `*.sh`/`*.ps1` 的 `eol=lf`，**漏了 `*.bat`**，导致仓库里 `start.bat` 存的是 **LF**、只因本机 `core.autocrlf=true` 才检出 CRLF ⇒ **`autocrlf=false` 的克隆者（Linux/macOS 默认）拿到 LF-only 的批处理**，而它是 **Windows 双击入口**。已补 `*.bat`/`*.cmd text eol=crlf`。
- **对照实测（决定性）**：`autocrlf=false` 克隆时，**无规则 → 裸 LF 190**；**有规则 → 裸 LF 0**。已派独立复验。
- **它顺带纠正了编排者一个持续多轮的验证盲点**：我一路声称的"CRLF=190、LF-only=0"验的都是**本机工作副本**（本机配置的产物），**不是别人会拿到的东西**。教训已写进 `AGENTS.md`：验证行尾要看 `git ls-files --eol` 的 `i/`（索引）与 `attr/`，并用**真实克隆 + 显式 `-c core.autocrlf=false`**；`git checkout-index --work-tree=<临时目录>` 会在**该临时目录**找 `.gitattributes`，用它验证会得出错误结论（我前两次测法都因此出错）。

**VS-11 已交付并 ACCEPT**（`e37412c`）：消除本地模式"不可完成登录页"死胡同——`api.ts` 保留 HTTP `status`、`authStore` 新增 `unavailable` 状态与**可注入的有限重试**（仅 401/403 判需登录）、`AuthGate` 在 unavailable 时渲染重试提示而不跳登录页、`Login` 兜底、i18n +6 键、QUICKSTART FAQ。独立 Evaluator **ACCEPT**（自跑 17/17 + 既有 `Auth.test.tsx` 4/4 无回归；并**独立排除反向风险**——非本地部署下"需要登录"的唯一信号是 401（`auth.py:34-35,84`），且**主动立起并证伪**了"若后端返回字符串 id 会让成功路径全量误判 unavailable"这一致命假设）。
- **评估者的 5 条非阻断项与编排者裁决**：
  - **F1（登录页本机兜底文案）**：评估者认为 `Login.tsx:86-101` 的 Alert 无条件渲染会让 Docker 用户在登录页看到"错误信息"，建议按 `user?.local_mode` 条件渲染。**编排者核实后削弱该发现**：文案**本已是条件式**（"**若你是**双击 start.bat 启动的本机版本…"），Docker 用户读到的是条件从句、不会被误导；且其建议的修法**在登录页不可行**（未认证时 `user` 为 null，`/api/health` 也不返回该字段）。**故不改代码**（有意克制，非漏修）。可选改进：让 `/api/health` 暴露 `local_mode`，UI 即可按部署形态定制文案 → 记 LATER。
  - F2：「正在连接**本机服务**…」在非本地部署不准确，但该串是 brief 逐字指定，实现无偏离。
  - F3：`unavailable` 下登录表单仍可提交（本地会拿到 404），但已有重试出口。
  - F4：`initialize()` 仅 `idle` 触发，`unavailable` 不自动复活，需手动重试（符合 brief）。
  - F5：实现报告称"未 commit"，实际已合入 `e37412c` —— **已更正报告该处陈述**（评估者指出）。
- **✅ 待补已清（R95）**：**VS-10 修复的针对性独立复验 → ACCEPT**。复验确认 `llm_client.py:77` 判据为 `seconds <= 0`（`0`/`0.0` → `None` → 回落带抖动退避）、`L79` 上限仍在、非法值不抛异常、`L82-87` 的 `base<=0` 短路未动、**改动面仅一个比较运算符**；复测 31 passed / 0.79s；变异敏感性成立（退回 `< 0` 时 `"0"`/`"0.0"` 两参数各挂一例——评估者注明此为推理、未做实际回退实验）。**其诚实边界**：仅读 `L54-99` 与本次测试，未在修复后版本重跑 4xx/网络耗尽端到端探针。**残留（非阻断，记 LATER）**：极小正值如 `Retry-After: 0.0001` 仍会绕过抖动，若要防需另设下限阈值——评估者明确"不建议夹带进本次修复"。

**A3（产品UX）已完成**，报告 `PRODUCT_UX_REPORT_R3.md`（7 问题：P1×2 / P2×2 / P3×2 / P4×1 + 6 未验证）。**编排者已逐条核实前两条。**
- **P1-1（新，最高价值）——本地模式存在"不可完成的登录页"死胡同**。证据链（编排者已核实）：
  - `start.bat:117` 强制 `LOCAL_ONLY_MODE=1`；
  - `backend/app/routers/auth.py:52-53`：本地模式下 `/api/auth/request-code` **直接 404「本地模式不提供邮箱登录」**；
  - `frontend/src/store/authStore.ts:33-34`：`getCurrentUser()` 的 `.catch` **吞掉错误原因、无重试**，一律置 `isAuthenticated:false, status:'anonymous'`；
  - `frontend/src/App.tsx:367,386`：`AuthGate` **只看 `isAuthenticated`、不查 `local_mode`**（而 `local_mode` 在 `App.tsx:264` 本就可取）→ `Navigate to="/login"`。
  ⇒ **只要 `/auth/me` 失败一次**（后端尚未就绪、瞬时 5xx、网络/代理异常、Cookie 干扰），用户在**本机模式下**就会看到一个**永远无法通过**的邮箱验证码页；且 `QUICKSTART:92-127` 的 FAQ **没有**"看到登录页怎么办"条目，与 `QUICKSTART:50`"不需要邮箱登录"的承诺冲突。刷新通常能恢复，但 UI 未提示。
  - **与 R2 的关系**：A2 曾把它列为"未验证"；编排者当轮只验了**正常路径**（`auth.py:90,125-126` 本地模式直返本地所有者 → 无登录墙）便收工。**R3 问的是失败路径，结论相反** —— 这正是"假设必然失败"视角的价值，也是本轮审计最有力的产出。
- **P1-2**："发行包不需要 Bun"的承诺依赖**单一时间戳启发式**（`start.bat:56-63` 只比较 `package.json` vs `dist/index.html`），判定为需重建且无 Bun 时**直接退出**（`:69` → `:162-166`）；用户不可控，最坏情况让"解压即用"的理想用户被要求装 Bun。建议：构建指纹 + 产物存在时**不硬退出**（给"以现有页面启动"的默认选择）。
- 其余：P2 首页"最近会话/讨论"点击**不带 id**、落点为空工作区（`Dashboard.tsx:100/115` → `App.tsx:323-324`）；P2 `start.bat:18` 硬编码维护者 Bun 绝对路径；P3 备份失败提示不区分".venv 缺失"与"写盘失败"；P3 90s 超时后仅一行"可手动访问"；P4 `bun.sh`（脚本）与 `bun.com`（QUICKSTART）不一致。
- A3 对近期改动的判断：备份改 `Connection.backup()` **方向正确、未见新问题**；Bun 非致命是改进但**风险集中到单一判定点**（即 P1-2）；等端口就绪合理但超时分支文案缺失；AI 引导文档侧一致。

**D3（可靠性）已完成**，报告 `RELIABILITY_REPORT_R3.md`。**三条 P1，全部指向"研究失败语义"这一主题**——即我在 VS-1/VS-3/VS-7 三个切片里反复投入的"失败要诚实且不丢成果"，**实测仍有 5 处漏点**：
- **P1-1 = `BACKLOG-049` 被提升为 P1**：降级判据是**字符串前缀哨兵**（`research_orch.py:30-32,157-158` 的 `startswith("工具执行异常：")`），而工具失败有 **5 种形态**，其中"工具不存在"(`:69-70`)、"未授权"(`:66-67`)、"参数校验失败"(`:81-86`)、"工具跑了但 `success:false`"(`:91-94`) **都不判降级** → API Key 失效 / 行情源全挂时报告仍以 `quality="audited"` 落库（`:355-356`），**前端无任何提示**。
- **P1-2（新）**：四个研究 Agent 的产出**无任何质量判据**——`if not tool_calls: return content`（`:147-149`）不判空；`llm_client` **从不读 `finish_reason`**（`llm_client.py:252-268`）→ max_tokens 截断不可见 ⇒ **空/半截章节仍判 audited**。
- **P1-3（新，最严重）**：**1 个 Agent 的非 LLMError 异常毁掉整轮研究**。`node_failed` 在编排层被特意降级处理并继续（`:286-295`），却 `yield "error"`（`:290`）被路由层当致命 → `_fail_report` + break（`routers/research.py:265-273`、`scheduler.py:164-170`）⇒ 另 3 个已完成 Agent 的成果**全丢**。D3 明确指出这**与 G-03 方向相反**。
- **VS-10 复核（D3 独立确认）**：单次上限**真生效**（`min` 在唯一出口 `:76`；99999→30、nan/inf/负/过期日期全回落且不抛）；抖动**不破坏**"退避置 0"测试前提（`:82-83` 对 `base<=0` 短路）。**新风险**：①上限只约束"单次等待"，**无整次调用总时长预算**（最坏 3×120s+2×30s≈420s，串行段可累计十几分钟静默等待，与自述目标相悖）；②**`Retry-After: 0` 被判有效** → 0 秒紧循环、绕过退避（`:74`；单测参数集漏了 `"0"`）；③`chat_stream` 完全无重试；④autouse fixture 只置零退避、不屏蔽 Retry-After；⑤重试掉的失败请求不计用量。
- **备份（D3 独立确认）**：主干正确且有实证；**新风险**：①文件名秒级、**无并发保护**——同秒双启动可互相覆盖，且失败侧会 `DeleteFile` 删掉对方**有效**备份；②硬中断残件无 `.partial` 标记，会被计入 7 份限额并被用户当可恢复件；③**本机实测 `backend\data\backups` 不存在 ⇒ 真实双击链路从未产出过备份**（此前只有仿真载荷实跑）。
- **quality 落库（独立确认成立）**：两条成功路径都持久化；残留：`:287 schedule_research_candidates` 若抛错，会向客户端 yield error 且发布 failed，而库中已是 completed（**UI 失败 / 库成功不一致**）。
- **Bun**：主干三条路径闭合，本机实测判新鲜、不需要 Bun；**反向缺口**：判据只锚 `package.json` mtime，发行包重打包若使其变新 → 产物明明新鲜却被要求装 Bun 并退出（击穿"预置 dist 可免 Bun"的声明，打包场景未实测）。

## 仍存在缺口（路线图，含 R2 部分发现）
- **✅ 已完成 VS-5**：AI 首用配置引导改为站内模型管理为主（QUICKSTART/README），PRD 三处事实错误修正；独立评估 REJECT→修复→**ACCEPT**。
- **✅ 已完成 VS-6**：首启启动体验（浏览器等就绪再开 + 失败可自助）；独立评估 REJECT（2 项必修：计时按次数非按时间、pip 失败文案矛盾）→ 修复 → **ACCEPT**。
- **✅ 已完成 VS-7**：降级语义补全（quality 源头并入 `report_data` → 定时/交互两路径一致落库；lead 空/不可解析判降级；工具异常与循环耗尽捕获）；独立评估 REJECT（P1a 谓词不同）→ 修复（复用 `parse_lead_review` 同口径）→ 复评 **ACCEPT**（61 passed）。
- **✅ 已完成 VS-8**：免工具链兜底真正可达（Bun 探测改非致命、判定移入 `:build_frontend`、新增 `:bun_missing` 指引；配置提示三处同向）；独立评估 **ACCEPT**（Evaluator 自建夹具 A/B 复现：旧版同输入 exit=1 硬停 → 新版 exit=0 走到 `:launch`；并自算基线 md5、修正实现者报告 2 处表述）。→ `ec0fa6c`
- **✅ 已完成 VS-9**：备份改为一致完整快照（`Connection.backup()`）；独立评估 **ACCEPT**（见上「已修并 ACCEPT」条）。→ `ab15be8`
- **NOW（进行中）**：**VS-10 尊重上游 `Retry-After` + 退避抖动**（`IMPLEMENTATION_BRIEF_VS10.md`）——依据：全仓 `Retry-After` 命中 0 处，供应商明确要求等待时我们 0.5s 后就重试（协议失礼、易招更重限流）；并解决 4 个并行 agent 退避同步的脉冲压力。执行器已改动 `llm_client.py` 与其测试。
- **NEXT**：`BACKLOG-049`（工具失败 5 种形态仅异常态判降级）；A2-P0-2 余项（确需构建时 Bun 安装指引对非技术用户的可执行性）；A2-P1-1 后半（Python 版本不符时**说明检测到的版本**）；A2-P2-2（Dashboard 入口名与落地页不一致）；**VS-9 非阻断①②**（`start.bat` L103 竞态下误报成功文案宜改 `exit 1`；`QUICKSTART` "保留 7 份"与实现"只提示不删"**措辞不符**——VS-2 遗留）。
- **NOT_NOW（主动拒绝，附理由）**：
  - A2-P1「Python 严格钉死 3.12」（`start.bat:41,46-47`）：**拒绝**。该钉版与文档**完全一致**（`README:50,69`、`QUICKSTART:11,15,123` 均写 Python 3.12），非矛盾项；放宽到 3.13 需**真实兼容性验证**（依赖/二进制轮子/标准库行为），成本远超收益，且目标用户按 QUICKSTART 装 3.12 即可。
  - A2-P1「端口占用首推重启电脑」（`start.bat:29-30`，VS-6 所写）：**暂缓**。第 1 步已是"关掉旧窗口"，重启作为第 2 步对非技术用户是**可执行且可靠**的兜底；FAQ（`QUICKSTART:94`）已给 `netstat` 进阶手段。收益低，留观。
- **LATER**：导航"一组一子项"结构摩擦；重试抖动/Retry-After；备份含 `-wal`/`-shm`；密钥脱敏扩大；G-07/09；G-12；G-06。
- VS-3 遗留（非阻断）：`openStoredReport` 用内联三元；报告列表页未加质量徽章。
- VS-4 遗留：`chat_stream` 未重试（保守设计）。

## 新发现问题（滚动）
1. **子代理环境持续恶化**：本轮 429 限流 3 次（VS-4 评估全灭）；全量 pytest 连续 3 次挂起（网络类用例）；`test_model_pricing.py` 亦挂起（与本次改动无关——该文件不引用 llm_client，且验收 044 时通过）。**执行与验证能力已成为演进的主要瓶颈**。
2. **独立评估三次抓真缺陷**（VS-1/2/3），第四次因环境未能进行——**不做"以自查冒充独立评估"**，如实挂起待补。

## 当前最高价值下一步
**环境恢复后优先补 VS-4 独立评估**（诚实性优先）；随后 **G-04 站内引导**（首启体验，P1 缺口）或 **重跑局部审计**验证 4 个 slice 后的产品状态。

## 技术债 / 风险（滚动）
- 既有：无内置模型单价、历史费用无快照、UTC 时区提示、用量面板多请求、AlphaSimulationWorkbench 负载 flake、全量 pytest 特定沙箱 no_proxy 挂起。
- VS-1：G-02 无显式 suspended 状态。
- VS-2：备份不含 `.credential-key`（设计如此）；WAL 异常断电后立即启动可能漏极少数据。
- VS-3：后端向 SSE 仍 yield 顶层 quality 形态（前端已适配；若将来统一为 `report.quality` 需前后端同步改）。
- VS-4：重试可能在上游持续限流时放大请求量（3 次/调用）——需观察；未加 jitter。