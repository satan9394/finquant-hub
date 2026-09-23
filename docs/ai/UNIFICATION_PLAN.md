# Unification Plan — 6 参考项目融入 FinQuant Hub

## 目标

将 reference/ 下 6 个参考项目的核心能力吸收到主项目，实现「一个系统，所有能力」。

## 已有吸收

| 参考项目 | 已吸收部分 | 文档位置 |
|----------|-----------|----------|
| daily_stock_analysis | 多源行情适配器、多 Agent 分析管线概念 | `ARCHITECTURE.md` |
| Vibe-Trading | 对话式策略、回测引擎概念 | `docs/ARCHITECTURE.md` |
| ai-berkshire | 多 Agent 投研讨论架构 | 四 Agent 并行研究引擎 |
| wq-alpha-research | wq_fields.json 因子库 | `alpha_service.py` |
| stock-analyzer | 技术指标计算方法 | `indicators.py` |

## 待吸收的精华

### 1. BigDataView — 数据可视化大屏
- **当前**：FinQuant Hub 只有标准 AntD 页面
- **待吸收**：大屏布局组件、KPI 卡片样式、金融图表配色
- **目标**：`frontend/src/components/` 下新增大屏模板
- **复杂度**：中等（纯前端，无后端改动）

### 2. Vibe-Trading — 对话式交易 Agent 流程
- **当前**：FinQuant Hub 有独立 Chat 和 Research 页面
- **待吸收**：策略生成 → 回测 → 部署的端到端对话流
- **目标**：`/chat` 页面中集成策略回测触发
- **复杂度**：高（需要改造 Chat 路由）

### 3. ai-berkshire — 估值验算模块
- **当前**：`financial_rigor.py` 已移植
- **待吸收**：多来源交叉验证流程、report_audit 审计工具
- **目标**：合并到 `app/tools/financial_rigor.py`

### 4. daily_stock_analysis — 定时任务与推送
- **当前**：FinQuant Hub 无定时任务
- **待吸收**：每日盘前分析、推送通知骨架
- **目标**：`app/services/scheduler.py` 轻量定时任务
- **复杂度**：高（需要异步调度器）

## 执行优先级

P0: 大屏模板融入（纯前端，风险最低）
P1: report_audit 合并（代码级，无架构变革）
P2: 对话式交易流（架构级，需审慎设计）
P3: 定时任务（需要调研 Windows 定时方案）

## 验收标准

1. 不破坏 `ARCHITECTURE.md` 中的架构不变量
2. `pytest -q` 不降级
3. `ruff check .` 零错误
4. `bun run build` 零错误
