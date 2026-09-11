# PRODUCT_STATE — 产品演进状态（Product Evolution Orchestrator 维护）

> 2026-09-13 初始化；每轮结束更新。当前轮：R8（VS-1 合入）。

## 当前成熟度快照
- 功能完备度高（schema v26、909+ 测试、470 Vitest、E2E 50+21、i18n 2453 parity 0）。HEAD `909980b`，工作树干净。
- 演进视角定位：**发布前成熟度打磨期**——优先"失败语义诚实、数据安全、上手体验"，警惕 Feature Creep。

## 演进循环进度
- R1：PROJECT_BRIEF + 四路独立审计启动。
- R2：四路审计（环境卡死）→ 从会话实录抢救出独立认知（RAW_*_findings.md）→ PRODUCT_GAP_MAP（G-01..G-15）→ 路线图 → IMPLEMENTATION_BRIEF（Vertical Slice：G-02+G-03）。
- R3-R8：G-02+G-03 实现（两次独立 Implementer 因环境卡死 → Orchestrator 接管实现）→ 独立 Evaluator 质疑（**抓出关键缺陷：agent LLMError 走 error 事件会被 router 判 failed、degraded 落空**）→ 修复（agent_failed 非致命事件 + 转发白名单）→ **VS-1 合入 `909980b`**。

## 已解决问题
- **G-02 调度无限重试**：`_MAX_RETRY_ATTEMPTS=5`，claim 拦截（research_jobs.py）。
- **G-03 报告伪装成功**：agent LLMError 非致命降级（agent_failed 事件 + done quality=degraded），报告数据 quality 持久化；node_failed 仍 fatal（合理）。

## 仍存在缺口（路线图）
- **NEXT**：G-01 备份/恢复（数据风险）；G-04 站内引导；G-11 LLM 调用重试；G-13 Alpha 入口。
- **LATER**：G-07/09（单例纪律/owner 清单自动化）；G-12；G-06（500 错误 ID）。
- VS-1 遗留：前端尚未消费 `report_data.quality` 展示降级提示（可复用 BACKLOG-033 degradedNotice）；G-02 挂起后 UI 无显式"已暂停"状态。

## 新发现问题（本轮）
1. **子代理环境反复卡死**（读文件阶段停滞）：四路审计、两路 Implementer、一路 Evaluator 均中招——本机 DSH 子代理在该"长任务+大上下文"组合下不稳定。教训已入 memory（30 分钟节拍、果断中断、必要时 Orchestrator 接管但**保留独立评估**）。
2. 独立评估价值实证：Evaluator 抓出了我会漏掉的 router fail+break 缺陷。

## 当前最高价值下一步
G-01（启动时自动备份 + 恢复文档，数据风险优先级最高，独立小改动，可与前端 quality 展示并行）。

## 技术债 / 风险（滚动）
- 既有：无内置模型单价、历史费用无快照、UTC 时区提示、用量面板多请求、AlphaSimulationWorkbench 负载 flake、全量 pytest 特定沙箱 no_proxy 挂起。
- VS-1：前端 quality 未接入；G-02 无显式 suspended 状态。