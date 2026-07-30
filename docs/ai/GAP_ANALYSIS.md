# 差距分析报告 — finquant-hub vs 6 参考项目

> 生成方式: Workflow (6+5 agent 并行分析 → 对抗验证 → 合成)
> 总差距: 80 CONFIRMED | 11 REJECTED | 183 验证失败（代理熔断）
> 日期: 2026-07-29

---

## 一、Vibe-Trading 差距（已吸收：Chat 回测按钮）

### 🔴 P2 — Agent 框架层

| 缺失功能 | 复杂度 | 当前项目状态 |
|----------|--------|-------------|
| 通用 ReAct Agent 循环（非固定 5 轮） | high | `research_orch.py` 仅有固定 4 角色 5 轮循环 |
| 上下文压缩（microcompact/auto-compact） | high | 零基础设施 |
| 并行工具执行（ThreadPoolExecutor） | medium | `research_orch.py` 顺序执行 |
| 心跳/超时/断线重连 | medium | 无 HeartbeatTimer、tool timeout、provider retry |
| 工具自动发现（BaseTool.__subclasses__()） | medium | 手动注册 6 个工具 vs Vibe-Trading 57+ |
| MCP 工具集成 | high | 零 MCP 支持 |
| 持久化记忆/跨会话召回（FTS5） | high | 仅基本消息表 |
| 多 Agent Swarm 团队系统（DAG + YAML） | high | 硬编码 asyncio.gather + 轮序循环 |

### 🟡 P2 — 回测引擎层

| 缺失功能 | 复杂度 | 当前项目状态 |
|----------|--------|-------------|
| 多市场引擎架构（BaseEngine 层次） | medium | 单文件 3 策略 |
| 优化器系统（mean-variance/risk-parity） | medium | 零 |
| 数据加载器抽象层（LoaderRegistry） | high | 4 数据源硬编码在 MarketDataService |
| 扩展指标（Calmar/Sortino/信息比率） | low | 仅基础 Sharpe/回撤 |
| 基准比较回测 | low | 无 |

---

## 二、daily_stock_analysis 差距（已吸收：scheduler.py）

### 🔴 P3 — 基础设施层

| 缺失功能 | 复杂度 | 当前项目状态 |
|----------|--------|-------------|
| 多通道推送系统（PushDeer/邮件/钉钉） | medium | 无 |
| 系统配置管理 | medium | 仅 `.env` |
| 交易日历 | low | 无 |
| 数据源适配器策略模式 | medium | 硬编码的 MarketDataService 单类 |
| Desktop App | high | 无 |
| 任务队列与运行流管理 | high | 无 |
| 预警/告警系统 | medium | 无 |

---

## 三、ai-berkshire 差距（已吸收：report_audit + financial_rigor）

### 🔴 P2 — 投研体系

| 缺失功能 | 复杂度 | 当前项目状态 |
|----------|--------|-------------|
| 四大师并行投研团队 | high | 仅有 1 个固定研究管线 |
| 巴菲特六关买入前 Checklist | medium | 无 |
| 财报精读 6 Agent 团队 | high | 无 |
| 投资论文追踪体系 | medium | 无 |
| 社交舆情集成（雪球等） | medium | 无 |
| 供应链瓶颈分析 | high | 无 |
| 管理层纵深研究 | high | 无 |
| 做空者视角挑刺分析 | medium | 无 |

---

## 四、wq-alpha-research 差距（已吸收：alpha_service.py）

### 🟡 P2 — Alpha 研究

| 缺失功能 | 复杂度 | 当前项目状态 |
|----------|--------|-------------|
| 因子表达式模板库 | medium | 仅搜索，无模板 |
| IS 指标检查（WQ 维度） | high | 无 |
| BRAIN API 集成 | high | 无 |
| 因子提交与监控 | high | 无 |
| 自进化机制（evolve_skill） | high | 无 |
| 因子分类（信号簇分析） | high | 无 |

---

## 五、BigDataView 差距（已吸收：Dashboard 大屏 KPI）

### 🟡 P2 — 可视化增强

| 缺失功能 | 复杂度 | 当前项目状态 |
|----------|--------|-------------|
| 118 套完整大屏模板 | high | 仅 1 套 KPI 网格 |
| 数字滚动/计数动画 | low | 无 |
| ECharts 全类型图表 | medium | 仅 lightweight-charts |
| 滚动表格与跑马灯 | low | 无 |
| 中国地图可视化 | medium | 无 |
| 登录页面模板 | low | 无 |

---

## 六、跨项目系统性差距

### 🔴 P2 — 测试与质量

| 缺失 | 复杂度 | 说明 |
|------|--------|------|
| 前端组件测试（vitest） | medium | 零前端测试 |
| 研究编排器（research_orch）直接测试 | high | 需 mock LLM |
| 全量 API 路由独立测试 | medium | 仅 20 个 MVP 路由测试 |
| 前端数据获取 hooks 测试 | medium | 无 |
| 端到端（E2E）测试 | high | 无 |

### 🟡 P3 — 工程化

| 缺失 | 复杂度 | 说明 |
|------|--------|------|
| CI/CD（GitHub Actions） | medium | 无 |
| Docker 容器化 | medium | 无 |
| 数据库迁移系统 | high | `CREATE TABLE IF NOT EXISTS` |
| 结构化日志 | low | 仅 `print()` |
| 类型检查（mypy） | low | 无 |
| 测试覆盖率报告 | low | 无 |

---

## 优先级分布

| 优先级 | 数量 | 代表项 |
|--------|------|--------|
| P1 | ~8 | FTS5 记忆、MCP 工具、推送系统、多市场引擎、组件测试 |
| P2 | ~18 | Swarm 团队、ReAct 循环、优化器、Alpha 回测、E2E 测试 |
| P3 | ~5 | Docker、Desktop App、交易日历、配置管理 |

> 注：49 项因代理熔断未分配优先级，以上为成功校验部分的统计。
> 完整差距点在 `docs/ai/EXEC_PLAN.md` 中跟踪。
