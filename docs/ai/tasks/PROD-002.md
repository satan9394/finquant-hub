# PROD-002: 主流程截图与首次任务步骤基线

> 状态：`[DONE]`  
> 阶段：Productization Phase 0  
> 完成日期：2026-08-09

## 用户问题

Phase 1 需要可比较的当前体验基线，不能只凭代码或主观印象判断产品化是否改善。

## 目标行为

在隔离的本地运行环境中记录 Dashboard、个股分析、策略验证、组合首次持仓及窄屏的浏览器截图、DOM 事实和交互步骤数。

## 范围内文件

- `docs/ai/PRODUCT_USABILITY_BASELINE.md`
- `artifacts/productization/phase0/*.png`
- `docs/ai/PRODUCTIZATION_PLAN.md`
- `docs/ai/EXEC_PLAN.md`
- 本任务卡

## 明确非目标

- 不修复本次发现的 lazy chunk、信息层级或可访问性问题。
- 不修改前后端业务代码。
- 不使用或迁移主机现有 SQLite；基线写入专用数据库。
- 不修改 `reference/`，不提交、推送或发布。

## 状态覆盖

- 空状态：Dashboard/Portfolio 初始 0 值与无持仓。
- 真实数据：600519 行情、技术分析、回测和持仓 PnL。
- 错误恢复：首次 StockAnalysis lazy chunk 失败，一次 reload 后恢复。
- 窄屏：390×844 Dashboard 首视口与导航 DOM。

## 验收

- 5 张截图文件存在且均来自成功 DOM 读取后的 live page。
- 三个核心任务有统一计数规则和当前步骤数。
- 记录桌面/窄屏首视口任务可见性、14 个同级入口和关键可访问性信号。
- 明确 Docker mirror 失败与 dev-server fallback，不把基础设施失败归因于应用。
- `git diff --check` 通过，`reference/` 无差异。

## 回滚方式

仅回退本任务文档和截图；专用 baseline 数据库可保留供后续 Phase 1 对比，清理时必须使用 Windows 回收站。
