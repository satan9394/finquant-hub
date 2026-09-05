# 长期任务书 — Astra 双会话审查处置（DSH 执行，BACKLOG-029）

> 创建：2026-09-04 ｜ 执行模式：DSH 主维护 agent 自主执行（不再用 Codex）
> 触发：用户提供长期任务书后在新对话开启，目标为跨多轮自动续跑。
> 前置存档：Astra 两会话只读审查原文已存 `docs/ai/astra-review/session-A-architecture-2026-09-04.md`、`session-B-ui-2026-09-04.md`（commit 87bcdd9）。

## 总目标

对 Astra 双会话审查反馈做**维护者独立抽核 → 分级 → 修复 → 回归 → 收尾**的完整闭环。
**核心纪律：Astra 断言是"待核的第三方线索"，不是事实。** 每条断言必须先由 DSH 用源码/测试/探针独立证实或证伪，再决定是否修复。不得把反馈原文直接当 bug 清单照单全收，也不得因"AI 说的"就放宽既有门禁。

## 基线（2026-09-04 实测）

- HEAD 87bcdd9，工作树干净。
- backend 837/837、cov 92.41%；ruff 通过；frontend build 4,243 modules；Vitest 122 files/374 tests；4173 E2E 50/50；8000 E2E 21/21；i18n zh/en 2,274 差集 0。
- 工具路径：bun 全路径 `D:\Technology_application\NVM_Windows\nvm_a\v22.19.0\bun.exe`（不在 PATH）；后端测试 `backend\.venv\Scripts\python.exe -m pytest`；代理 7897；删除一律回收站（SendToRecycleBin）禁 rm；`reference/` 只读。

## 待核断言清单（来自 Astra 存档，行号未经验证，需以当时源码复核）

### A 组（架构/逻辑，session-A 存档）
- A1-图码漂移：图称 22 Router/52 表/13 工具，Astra 称实为 22 Router/135 路径/169 操作/49 逻辑表/17 工具，schema v24 已删 3 张遗留组合表、新增 4 个 A 股工具未上图；另 sequence 事件名（completed vs done）、tool_call 推送时机、主编→evidence_objects 链路、"类型驱动校验"绕行等与图不符。
- A2-事务原子性(P1)：job 用 `_RUNTIME_LOCK`+`BEGIN IMMEDIATE` 但共享连接的其他 execute 直接提交，可提前提交 job 部分状态、rollback 失效；取消异常不在回滚范围。（research_jobs.py / database.py）
- A3-SSE 断连(P1)：断连取消会打断 finally 清理，可能留永久 running 报告；Astra 用隔离探针复现 status=running/fail_called=False。（research.py / sse_starlette）
- A4-"立即运行"竞态(P1)：读非 running 后无条件写 queued，先检查后更新，可能覆盖 running / 双 running run。（settings.py / research_jobs.py）
- A5-工具线程上下文(P2)：线程内 ContextVar 变 None、参数类型校验被绕过（新闻工具走空凭据分支）；Astra 确认未发现跨用户读凭据。（research_orch.py / tools_definitions.py）
- A6-主编失败仍归完成(P2)：LLMError 后仍 completed+成功通知，顶层无降级表达（产品契约待核）。
- A7-重启恢复窗口(P2)：report INSERT 与 run.report_id 回填分开提交、completed 先于记忆持久化、heartbeat 丢失无失租终止。
- A8-行情语义错误(P2)：分钟 K 失败后腾讯回退只取 day；新浪缺 PE/PB 返回零；上证指数 sh000001 被股票校验拒绝。（market_data.py / market_overview.py）

### B 组（UI/可用性，session-B 存档）
- B1-已证伪：旧文档"残色 #dce5ef/#1890ff 未迁完"——Astra 全量扫描 152 文件 0 匹配。待 DSH 复扫确认后，若成立应更新 HANDOVER/相关文档（诚实修正旧结论）。
- B2-图表主题不重取色：MoneyFlowChart/ChipHistoryChart 固定 theme:'light'，更新 effect 只依赖固定 config.theme，暗色切换后已有图表保留旧色。（useLightweightCharts.ts）
- B3-证据抽屉主题断裂：暗色变量在 .app-theme--dark 内，EvidenceDrawer/Rail Portal 默认挂 body，抽屉继承浅色 token 与 AntD 暗色混搭。
- B4-两套样式来源：ConfigProvider 只切算法，不映射 --fq-ai-primary/圆角到 AntD。
- B5-尺寸漂移：规范圆角 8/12/16 vs 实际 6/8/8；侧栏 240 vs 224。
- B6-提问不被接住(用户可感)：底部/全局"继续研究"进 /research?prompt=… 但默认研究页不读 prompt，问题丢在 URL。
- B7-筛选术语误识别(用户可感)：ROE/FCF/CAGR 被当证券代码提取（Discover 正则）。
- B8-文案暴露实现术语：IR/CAGR/MDD/as_of/quality、Research/Compare/Monitor 等。
- B9-启动到第一份研究的配置门槛：start.bat 需 Bun/可能改 .env；Settings 默认非模型引导。
- B10-空 AgentRail 占 376px 右栏、多提问入口分散。
- B11-回测首屏工具排在验证前、完成后指标在中文结论前、MDD 红绿语义不统一、FinancialMetric 空值 pre-格式化 quality="OK"。
- B12-两处重做方案（首页→研究连续面；策略实验室规则-结果-限制同视野）——属**产品方向级建议**，默认不自动实施，需用户拍板。

## 阶段拆解（每阶段完成即有可验证产物）

### 阶段 0：断言复核基线（只读，零改动）
- 目的：把 A/B 存档里的断言逐条转成"已证实/已证伪/待复现"三态，产出核验表。
- 做法：对每条断言定位对应源码当前行，读实现 + 相关测试；可用临时只读探针（python -c / 内存 fixture）验证行为，**不落库不改文件**。
- 完成标准：产出一张断言核验表（条目、断言、核验方法、结论 证实/证伪/待复现、证据 文件:行、建议处置 修/记录/忽略），写入 `docs/ai/astra-review/verification-YYYY-MM-DD.md`。
- 注意：Astra 行号基于审查时源码，BACKLOG-028/027 已改过部分文件，需重新定位。

### 阶段 1：按核验结果选择性修复（改代码，分小步）
- 修复顺序建议：**已证实的 P1（A2/A3/A4）> 用户可感的 B6/B7 > 已证实的 P2 > B2/B3 主题类**。每修一个独立 commit，先测后改。
- 每个修复 = 一次"修改→聚焦测试→全量门禁→commit"循环，遵守 AGENTS.md 无 ORM/无池/无 WebSocket 等不变量与"删除走回收站"。
- 被证伪/无法复现/产品方向级的（如 A6 待核、B12 重做）**不修**，在核验表标注"记录待用户决策"。

### 阶段 2：回归 + 全量门禁
- backend `pytest -q` + coverage + ruff；frontend build + Vitest + 4173 E2E + 8000 E2E；i18n parity。
- 修复后端行为变更时同步 `test_router_contracts` sentinel、相关既有断言、文档（API_CONTRACT/ARCHITECTURE/HANDOVER/CHANGELOG，按 doc sync rule）。

### 阶段 3：收尾
- 更新 EXEC_PLAN（BACKLOG-029 标记完成/部分完成，未做项如实标注）、HANDOFF.md 变更日志、handoff-log.py 追加；每轮结束工作树干净、commit 清晰。

## 允许修改（随阶段推进，先核验后修复）

- 核验表/记录：`docs/ai/astra-review/`（新增 verification-*.md、后续结论）
- 后端修复：与已证实断言对应的服务/路由/测试文件（按断言实际落点，非预设白名单；改动前先定位）
- 前端修复：B6/B7 及已证实的主题/图表类（对应组件/页面/测试）
- 文档：EXEC_PLAN、HANDOFF、CHANGELOG、HANDOVER（证伪项如 B1 要诚实修正旧结论）、CLAUDE/README（如改使用方式）
- 新测试：为每个修复补确定性测试；修复 P1 竞态/事务类可加并发/取消探针测试（参照 Astra 隔离探针思路）

## 禁止修改

- 不经核验直接照搬 Astra 断言改代码；不改 `reference/`；不加新依赖；不用 `channel: 'chrome'`；不删除文件（回收站铁律）；不擅自实施 B12 两处产品级重做（需用户单独确认范围）。
- 不因"修复审查发现"放松既有测试断言或门禁；不把待核/待复现项当已证实项处理。
- 阶段 0 只读期不改任何业务代码。

## 参考

- Astra 反馈原文：`docs/ai/astra-review/session-A-architecture-2026-09-04.md`、`session-B-ui-2026-09-04.md`
- 任务书模板先例：`docs/ai/tasks/BACKLOG-028.md`（只读探针→实锤→修复→8000 验收的完整范式）
- 架构/治理：`AGENTS.md`、`CLAUDE.md`、`docs/ARCHITECTURE.md`、`docs/ai/EXEC_PLAN.md`
- 测试先例（取消/并发/事务）：`backend/tests/test_research_jobs.py`、`test_scheduler.py`、`test_research_sse*`、BACKLOG-004/006 SSE 错误路径测试

## 完成证据模板（每阶段/每修复轮填）

```
- 断言核验表：N 条已证实 / M 条证伪 / K 条待复现，各附证据
- 修复清单：每条 断言→根因→改动文件→测试→commit
- 全量门禁：backend xx/xx cov、ruff；build modules；Vitest x/x；E2E 4173 x/x + 8000 x/x；i18n parity
- 文档同步：EXEC_PLAN/HANDOFF/CHANGELOG/HANDOVER 更新
- 诚实声明：未做项/待核项如实列出；工作树干净；删除 0
```
