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
- R13-R14：**VS-4（G-11 LLM 重试）** → 独立评估**连续 3 次被环境 429 阻断** → 改做明示自查（发现并修复死赋值）→ `cda6f76`。**⚠️ 本卡缺独立验证，待补。**

## 已解决问题
- **G-02 调度无限重试**：`_MAX_RETRY_ATTEMPTS=5` claim 拦截。
- **G-03 报告伪装成功**：**全链路闭环**——后端 agent LLMError 非致命降级 + done quality + 持久化（VS-1）；前端 `resolveReportQuality` 顶层读取 + 屏上 Alert + 导出前缀（VS-3）。
- **G-01 无备份/恢复**：启动自动备份（滚动、只提示不自动删）+ 文档化恢复流程。
- **G-11 LLM 无重试**：`_post_chat_with_retry` 对 429/5xx/网络做指数退避（≤3 次），4xx 不重试（**缺独立验证，待补**）。

## ⚠️ 待补事项（跨轮跟踪）
1. **VS-4 补独立评估**：环境 429 恢复后，派独立 Evaluator 复查 `llm_client` 重试（重点：是否放大限流、`chat_stream` 是否需首包前重试、测试真实性）。
2. **首个 Vertical Slice 之后未再做周期性审计**：四路审计已完成一轮（R2）；产品又演进 4 个 slice，建议在合适节点**重跑一次局部审计**（至少 UX + 可靠性），验证是否引入新缺口。

## 仍存在缺口（路线图）
- **NEXT**：G-04 站内引导（非技术用户首启无指引）；G-13 Alpha 入口可发现性。
- **LATER**：G-07/09（单例纪律/owner 清单自动化）；G-12（cron 并发上限）；G-06（500 错误 ID）。
- VS-3 遗留（非阻断）：`openStoredReport` 仍用内联三元而非 `resolveReportQuality`（行为等价）；报告列表页未加质量徽章。
- VS-4 遗留：`chat_stream` 未重试（保守设计，已记录理由）。

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