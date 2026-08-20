# Agent Note: Design System v1.0 引入

Status: implemented

## Problem

项目经过 88 个任务的迭代，前端组件库从 AntD 默认风格碎片化增长：各页面独立内联样式、硬编码色值（`#1890ff`、`#52c41a` 等）、无统一设计令牌、无 dark mode 变量体系。随着功能完备，UI 一致性和视觉品质成为"现象级产品"的关键短板。

## Decision

引入 FinQuant Hub Design System v1.0，以纯 CSS 变量（`--fq-*` 前缀）实现设计令牌，不引入新的 npm 依赖：

1. **设计令牌**：`:root` 定义 ~30 个 `--fq-*` 变量（品牌色、语义色、中性色、圆角、阴影、布局尺寸）
2. **Dark Mode**：`.app-theme--dark` 覆盖全套 tokens，与 AntD darkAlgorithm 联动
3. **组件原语**：8 个 AI-native 共享组件（CommandBar、DecisionCard、AgentStatusCard、ResearchArtifact、EvidenceChip、EvidenceDrawer、FinancialMetric、InvestmentCommittee）
4. **Dashboard 重构**：从"金融仪表盘"（KPI 数据墙）改为"evidence-first workbench"（AI 入口优先）
5. **新组件族**：LatestNews、MarketBrief 补充 Dashboard 信息维度

## Alternatives considered

1. **引入 Tailwind CSS**：需要构建链变更、学习成本、与 AntD 冲突风险。放弃，保持纯 CSS + AntD。
2. **引入 styled-components / CSS Modules**：增加依赖和运行时开销，与 AntD 的 className 模式不兼容。放弃。
3. **仅使用 AntD ConfigProvider token**：AntD token 体系不覆盖项目特有的语义色（证据类型、涨跌、风险等级）。需要项目自有变量补充。
4. **全量迁移既有样式到 `--fq-*`**：改动面过大，当前阶段风险不可控。采用新老双轨渐进策略。

## Consequences

- 新组件通过 CSS 变量获得一致的视觉语言，dark mode 一等公民
- 既有样式仍用硬编码色值，形成双轨并存，长期需全量迁移
- `color-mix()` 依赖现代浏览器（Chrome 111+、Firefox 113+），不支持的浏览器回退到纯色
- 组件提取（AgentCard → AgentStatusCard 等）降低了代码重复，但底层仍是 AntD 组件，视觉变化主要来自 CSS class 切换
- Dashboard 重写移除了大屏金融仪表盘组件，视觉丰富度降低但信息架构更清晰
