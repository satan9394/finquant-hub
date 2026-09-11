# PROJECT_BRIEF — FinQuant Hub（产品演进编排·第一阶段产物）

> 由 Product Evolution Orchestrator 生成，2026-09-13。仅作编排依据，供审计子代理使用；不含深度分析结论（避免锚定）。

## 产品是什么

**FinQuant Hub**：个人全栈金融量化研究 Web 系统（本地自用、可开源分发）。A 股/港股/美股多市场行情、技术分析、AI 多 Agent 投研（研究报告生成）、Alpha 因子研究、投资组合管理、策略回测、会话讨论、Token 用量与计价统计、MCP 供应商管理等模块。

## 用户是谁

- 目标用户：**非技术中文个人投资者**（所有 UI 中文，避免 CLI/终端）。
- 部署形态：个人电脑本地安装（Windows `start.bat` → 127.0.0.1:8000 单进程），或 Docker 本地模式（LOCAL_ONLY）。
- 面向"他人可本地快速部署使用"的开源目标（Local OSS v1）。

## 核心任务

1. 行情数据（腾讯/新浪/东方财富/Yahoo 多源链 + 后备/熔断）。
2. AI 投研：4-agent 并行研究 → 主编综合 → 13 章中文报告（DeepSeek 函数调用、13 个本地工具）。
3. 量化研究：Alpha 因子（WQ 4367 字段目录/搜索/相关性/模拟）、指标（SMA 系列 7 个）、策略回测。
4. 组合与风控：组合管理、持仓、策略实验室（IR 自然语言→策略）。
5. 基础设施：模型供应商管理、Token 用量/计价、MCP（http+stdio）、知识库（FTS5 memory）、SSE 实时流。

## 当前成熟阶段

- 已实现：约 23 个 APIRouter / 140 个 /api 路径 / 176 个操作；52+ 表（schema v26）；backend 909 测试 / 92.67% 覆盖；前端 134 文件 / 470 Vitest；4173 E2E 50 + 8000 E2E 21；i18n 2453 key parity 0。
- 近期连续完成：供应商管理、计价模块、用量统计详情（对齐 CC Switch）、Alpha 模拟绩效统计等。EXEC_PLAN 无 [READY] 待办，工作树干净。
- 阶段判断：**功能完备度较高，处于"发布前成熟度"阶段**——发布/上手/长期维护/可靠性方面的打磨应优先于新增功能。

## 已知约束（架构不变量）

- 无 ORM（aiosqlite 裸 SQL）、无连接池、无单独 DAL 层、无 WebSocket（SSE）、无 SSR、无 DI 容器。
- 无新依赖（除非明确批准）；`reference/` 只读；删除一律回收站；E2E 用内置 chromium。
- 数据隔离（用户 owner-scoped）；邮箱免密登录（LOCAL_ONLY 则单本地所有者）。
- 中文数据源 trust_env=False（绕代理）；Yahoo trust_env=True。

## 给审计子代理的说明

- 审计子代理**只读不改**；可访问代码库（backend/app、frontend/src、docs）。
- 各有独立审计标准（见各自任务书），**不共享彼此结论**。
- 产出落在各自报告文件，主 Agent 负责综合。