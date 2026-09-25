# BACKLOG-062: 资料库策略互动演示原生化与量化业务一键接通

- Status: planned
- Mission: 将资料库策略演示从静态 iframe 重构为原生交互组件，并一键接通 `/strategy-lab` 回测
- Source: human-requested
- Risk: medium

## 目标与背景
用户在体验「资料库 (`/knowledge`)」时反馈：策略板块的动态图无法与真实业务联动，点击各种按钮无效，原有的 iframe 嵌套静态 HTML（m1~m8）脱离了真实行情与回测系统。
本任务旨在将旧的静态 HTML 演示彻底淘汰，使用原生交互组件与真实图表（Lightweight Charts 或 ECharts）重构策略互动面板，并为每个策略打通一键直达「策略回测实验室 (`/strategy-lab`)」的真实量化业务闭环。

## 核心重构与需求
1. **彻底淘汰 iframe 静态 HTML 架构**:
   - 移除 `Knowledge.tsx` 中对 `/knowledge/m1-*.html` 的 iframe 嵌入及内部的破损静态返回链接（`index.html`）。
   - 将策略展示原生组件化（如 `StrategyInteractiveDemo.tsx`），支持直接在 React 页面中响应主题（`--fq-*` tokens）。

2. **原生动态策略可视化画布**:
   - 对 8 种核心策略（均线交叉、均值回归、动量、市场中性、统计套利、事件驱动、机器学习、高频微观结构）：
     - 接入真实或高质量典型行情的交互式动态图表；
     - 允许用户交互式拖动时间滑块、播放/暂停策略信号演进、动态调整核心参数（如均线短/长周期、布林带标准差倍数）；
     - 图表画布中清晰、交互式地呈现买入/卖出信号点（金叉/死叉、触轨反弹等），悬停可查看精确价格与信号触发解释。

3. **量化回测业务一键接通**:
   - 每一个策略均提供「在回测实验室中验证此策略」的主操作按钮；
   - 点击按钮自动导航至 `/strategy-lab`，并带入该策略的预设参数与目标标的（例如均线策略带入 `ma-crossover`，均值回归带入对应参数）；
   - 确保从资料库的学习认知到真实策略回测的业务转化无缝串联。

## 交付文件
- `frontend/src/components/knowledge/StrategyInteractiveDemo.tsx`: 原生策略交互演示组件。
- `frontend/src/pages/Knowledge.tsx`: 重构策略展示区，移除 iframe，接通真实交互与回测路由。
- `frontend/tests/KnowledgeInteractive.test.tsx`: 覆盖原生策略图表切换与回测导航的单元测试。
- `frontend/e2e/knowledge-interactive.spec.ts`: 真实浏览器端到端交互测试。

## 验证门禁
- `bun run test tests/KnowledgeInteractive.test.tsx` 全部通过。
- `bun run build` 成功通过，0 TypeScript 错误。
- 浏览器中打开 `/knowledge`，切换各个策略，图表渲染正常，点击回测按钮能正常跳转并回填参数。
