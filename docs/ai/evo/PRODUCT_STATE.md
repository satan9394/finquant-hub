# PRODUCT_STATE — 产品演进状态（Product Evolution Orchestrator 维护）

> 2026-09-13 初始化；每轮结束更新。当前轮：R12（VS-3 合入）。

## 当前成熟度快照
- 功能完备度高（schema v26、909+ 测试、470+ Vitest、E2E 50+21、i18n 2454 parity 0）。HEAD `e49e607`，工作树干净。
- 演进视角定位：**发布前成熟度打磨期**——优先"失败语义诚实、数据安全、上手体验"，警惕 Feature Creep。

## 演进循环进度
- R1：PROJECT_BRIEF + 四路独立审计启动。
- R2：四路审计（环境卡死）→ 从会话实录抢救出独立认知（RAW_*_findings.md）→ PRODUCT_GAP_MAP（G-01..G-15）→ 路线图 → IMPLEMENTATION_BRIEF。
- R3-R8：**VS-1（G-02+G-03 后端）** → 独立 Evaluator 抓出 router fail+break 缺陷 → 修复 → `909980b`。
- R9-R10：**VS-2（G-01 备份）** → Evaluator ACCEPT + 指出"失败误报已备份"诚实性瑕疵 → 修复 → `199d400`。
- R11-R12：**VS-3（G-03 前端可见）** → Evaluator **REJECT**（实时路径读错字段：后端 quality 在顶层、前端读 report.quality → 屏上警示永不出现）→ 修复（顶层读取 + 提为可测纯函数 + 补映射测试）→ 复评 **ACCEPT** → `e49e607`。

## 已解决问题
- **G-02 调度无限重试**：`_MAX_RETRY_ATTEMPTS=5` claim 拦截。
- **G-03 报告伪装成功**：**全链路闭环**——后端 agent LLMError 非致命降级 + done quality + 持久化（VS-1）；前端 `resolveReportQuality` 顶层读取 + 屏上 Alert + 导出前缀（VS-3）。
- **G-01 无备份/恢复**：启动自动备份（滚动、只提示不自动删）+ 文档化恢复流程。

## 仍存在缺口（路线图）
- **NEXT**：G-04 站内引导（非技术用户首启无指引）；G-11 LLM 调用重试（单次抖动致整轮失败）；G-13 Alpha 入口可发现性。
- **LATER**：G-07/09（单例纪律/owner 清单自动化）；G-12（cron 并发上限）；G-06（500 错误 ID）。
- VS-3 遗留（非阻断，Evaluator 指出）：`openStoredReport` 仍用内联三元而非 `resolveReportQuality`（行为等价，风格统一项）；报告列表页未加质量徽章。

## 新发现问题（滚动）
1. **子代理环境不可靠**（本机）：①长任务/大上下文"读文件停滞"（8 个中招）；②**429 限流**（3 次）。应对：30 分钟节拍 + 果断中断 + Orchestrator 接管小改动 + Evaluator 指令极简化。
2. **独立评估三次抓真缺陷**（强证据）：VS-1 router fail+break；VS-2 "失败误报已备份"诚实性；**VS-3 实时路径读错字段导致功能假闭环**——这是"Implementer 自查会漏"的最有力证明。

## 当前最高价值下一步
**G-11 LLM 调用重试**（5xx/429/网络，2 次指数退避）——长研究管线对单次抖动零容忍是当前最影响"研究成功率"的缺口，改动集中（llm_client）、可测。次选 **G-04 站内引导**（首启体验）。

## 技术债 / 风险（滚动）
- 既有：无内置模型单价、历史费用无快照、UTC 时区提示、用量面板多请求、AlphaSimulationWorkbench 负载 flake、全量 pytest 特定沙箱 no_proxy 挂起。
- VS-1：G-02 无显式 suspended 状态。
- VS-2：备份不含 `.credential-key`（设计如此）；WAL 异常断电后立即启动可能漏极少数据。
- VS-3：后端向 SSE 仍 yield 顶层 quality 形态（前端已适配；若将来统一为 `report.quality` 需前后端同步改）。