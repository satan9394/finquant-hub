# PRODUCT_STATE — 产品演进状态（Product Evolution Orchestrator 维护）

> 2026-09-13 初始化；每轮结束更新。当前轮：R10（VS-2 合入）。

## 当前成熟度快照
- 功能完备度高（schema v26、909+ 测试、470 Vitest、E2E 50+21、i18n 2453 parity 0）。HEAD `199d400`，工作树干净。
- 演进视角定位：**发布前成熟度打磨期**——优先"失败语义诚实、数据安全、上手体验"，警惕 Feature Creep。

## 演进循环进度
- R1：PROJECT_BRIEF + 四路独立审计启动。
- R2：四路审计（环境卡死）→ 从会话实录抢救出独立认知（RAW_*_findings.md）→ PRODUCT_GAP_MAP（G-01..G-15）→ 路线图 → IMPLEMENTATION_BRIEF。
- R3-R8：**VS-1（G-02+G-03）** 实现 → 独立 Evaluator 质疑（抓出 agent LLMError 走 error 事件会被 router 判 failed 的缺陷）→ 修复 → 合入 `909980b`。
- R9-R10：**VS-2（G-01）** 实现（start.bat 自动备份 + QUICKSTART 恢复指引）→ 独立 Evaluator ACCEPT（并指出诚实性瑕疵）→ 修复（失败不再误报已备份）→ 合入 `199d400`。

## 已解决问题
- **G-02 调度无限重试**：`_MAX_RETRY_ATTEMPTS=5` claim 拦截。
- **G-03 报告伪装成功**：agent LLMError 非致命降级 + done quality + 持久化。
- **G-01 无备份/恢复**：启动自动备份（滚动 7 份、只提示不自动删）+ 文档化恢复流程。

## 仍存在缺口（路线图）
- **NEXT**：G-04 站内引导（非技术用户首启无指引）；G-11 LLM 调用重试（单次抖动致整轮失败）；G-13 Alpha 入口可发现性；VS-1 遗留——前端接入 `report_data.quality` 降级提示（让 G-03 用户可见价值闭环）。
- **LATER**：G-07/09（单例纪律/owner 清单自动化）；G-12；G-06（500 错误 ID）。
- VS-2 遗留（非阻断）：备份失败时 PowerShell 原始错误会出现在启动窗口（非技术用户观感差，可考虑 2>nul + 保留中文提示）。

## 新发现问题（滚动）
1. **子代理环境不可靠**（本机）：表现两类——①长任务/大上下文时"读文件停滞"（四路审计、2 路 Implementer、1 路 Evaluator 中招）；②**429 限流**（044 Implementer、G-01 首个 Evaluator）。应对：30 分钟节拍 + 果断中断 + Orchestrator 接管小改动 + Evaluator 指令极简化。
2. 独立评估价值两次实证：VS-1 抓出 router fail+break 缺陷；VS-2 抓出"失败误报已备份"诚实性瑕疵。

## 当前最高价值下一步
**前端接入 quality 降级提示**（VS-1 遗留，最小改动但让 G-03 的价值真正触达用户——否则后端标了 degraded 前端也不显示），或 **G-11 LLM 重试**（提升长研究管线成功率）。二者都小、独立、可测。

## 技术债 / 风险（滚动）
- 既有：无内置模型单价、历史费用无快照、UTC 时区提示、用量面板多请求、AlphaSimulationWorkbench 负载 flake、全量 pytest 特定沙箱 no_proxy 挂起。
- VS-1：前端 quality 未接入；G-02 无显式 suspended 状态。
- VS-2：备份不含 `.credential-key`（设计如此：备份内凭据无法解密）；WAL 异常断电后立即启动可能漏极少未落盘数据。