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
- **P1 未修**：重试放大——无抖动、不读 `Retry-After`、无熔断；最坏 5 agent × 6 轮 × 3 尝试 ≈ **90 次上游请求**（`llm_client.py:20-22,111-128,282-283,350`）。
- **P1 未修**：启动备份只 `Copy-Item finquant.db`（`start.bat:96`），**不含 `-wal`/`-shm`** → WAL 下非一致性快照（失败不阻塞启动这点是对的）。
- **P1 未修**：密钥脱敏仅替换 `self.api_key`（`llm_client.py:99`）；错误文案经 `research_orch` → SSE 可能**落库到 `run_events.payload_json`**（`research_jobs.py:364-367` 的 `payload={"status":…, "error": error}`，error 源自 `scheduler.py:366-368` 的 `str(exc)`）。
  - **编排者已复核并下调严重度（R72）**：主路径脱敏**是生效的**——`model_router.py:37-44` 把解析出的真实 key（用户加密凭据 > 旧 api_key 字段 > 环境变量）传入 `LLMClient(api_key=…)`，故 `self.api_key` 非空、`body.replace` 有效。**残留缺口收窄为三类边界**：①供应商回显的是截断/URL 编码后的 key 时匹配不到；②key 若位于 `base_url` 查询串，`_response_error` **只清洗 api_key 不清洗 URL**；③`self.api_key` 为空时替换退化为空操作（但此时也无 key 可泄）。→ 降为 **P2 加固项**，非 P0。
- **未验证 5 处**（D2 已标注）：`routers/research.py` 是否消费 quality、`database.py` 迁移/磁盘、同步工具是否阻塞事件循环、供应商是否回显密钥、`pending_idempotency_key` 写入方。

## 仍存在缺口（路线图，含 R2 部分发现）
- **✅ 已完成 VS-5**：AI 首用配置引导改为站内模型管理为主（QUICKSTART/README），PRD 三处事实错误修正；独立评估 REJECT→修复→**ACCEPT**。
- **✅ 已完成 VS-6**：首启启动体验（浏览器等就绪再开 + 失败可自助）；独立评估 REJECT（2 项必修：计时按次数非按时间、pip 失败文案矛盾）→ 修复 → **ACCEPT**。
- **✅ 已完成 VS-7**：降级语义补全（quality 源头并入 `report_data` → 定时/交互两路径一致落库；lead 空/不可解析判降级；工具异常与循环耗尽捕获）；独立评估 REJECT（P1a 谓词不同）→ 修复（复用 `parse_lead_review` 同口径）→ 复评 **ACCEPT**（61 passed）。
- **✅ 已完成 VS-8**：免工具链兜底真正可达（Bun 探测改非致命、判定移入 `:build_frontend`、新增 `:bun_missing` 指引；配置提示三处同向）；独立评估 **ACCEPT**（Evaluator 自建夹具 A/B 复现：旧版同输入 exit=1 硬停 → 新版 exit=0 走到 `:launch`；并自算基线 md5、修正实现者报告 2 处表述）。→ `ec0fa6c`
- **NOW（已就绪，待实现）**：**VS-9 备份必须是一致完整快照**（`IMPLEMENTATION_BRIEF_VS9.md`）——R2 审计 D2 的 P1，**编排者用真实数据目录复核**：`backend/data/finquant.db-wal` 实存 **135,992 字节**（服务未运行），而 `start.bat:98-99` 只 `Copy-Item` 主库单文件 → **已提交事务被静默丢弃，且副本仍是"合法库"，恢复不报错**。属数据安全类缺陷，优先级高于其余文案项。
- **NEXT**：`BACKLOG-049`（工具失败 5 种形态仅异常态判降级）；A2-P0-2 余项（确需构建时 Bun 安装指引对非技术用户的可执行性）；A2-P1-1 后半（Python 版本不符时**说明检测到的版本**）；A2-P2-2（Dashboard 入口名与落地页不一致）。
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