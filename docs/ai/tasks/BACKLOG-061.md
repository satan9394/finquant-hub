# BACKLOG-061: 投资组合风险透视与市场全景图谱浏览器 E2E 交互测试

## 目标与用户价值
针对 BACKLOG-056 交付的投资组合量化体检报告与 BACKLOG-057 交付的市场全景（行业 Treemap、龙虎榜席位共现图谱、连板情绪图），构建真实浏览器自动化操作套件。
确保用户在 Portfolio 与 Discover 看板中能切换组合和全景子 Tab、通过图表 crosshair/Tooltip 阅读数值、缩放或拖动可漫游图，并查看月收益单元格数据。

## 交互测试场景与路径
1. **Portfolio 量化体检报告交互 (`/portfolio`)**:
   - 导航至 `/portfolio`，点击选择一个持仓组合，再打开实际标签“量化体检报告”（该报告是默认 Tab；旁边另有“组合风险模拟”）。
   - 检查动态水下回撤曲线（`UnderwaterChart`）：鼠标在负收益区移动，验证 Lightweight Charts crosshair 更新；该组件不提供含修复期的自定义 Tooltip，测试不宣称存在此 UI。
   - 检查月度收益率热力图（`MonthlyHeatmap`）：验证正负收益格使用 `--fq-price-up/down` 令牌，悬停月份格并核对原生 title 中的累计收益。
   - 检查 60 日滚动夏普与波动率图（`RollingRiskChart`）的 crosshair 更新，以及风险摘要指标、HHI 与协方差风险贡献列表。

2. **Discover 市场全景面板交互 (`/discover`)**:
   - 导航至 `/discover` 页面，点击“市场全景”，再切换“行业热力”“席位关系”“短线情绪”三个实际子 Tab。
   - 检查行业成交额 Treemap 图表（`MarketTreemapChart`）：悬停核对行业/成分数据 Tooltip，点击色块触发 `zoomToNode` 下钻。
   - 检查龙虎榜席位共现网络（`DragonTigerSeatGraph`）：悬停读取席位 Tooltip，并拖动可漫游的图谱画布。当前组件没有点击席位详情列表，不将其写成验收项。
   - 检查连板情绪图（`SentimentLadderChart`）：悬停核对连板数、涨停家数与晋级率 Tooltip，并点击图例过滤一条序列。当前组件没有点击展开股票梯队的交互，不将其写成验收项。

## 交付文件
- `frontend/e2e/portfolio-tear-sheet.spec.ts`: 覆盖水下回撤、月度热力图与滚动风险图的 Playwright E2E 交互测试。
- `frontend/e2e/market-panorama.spec.ts`: 覆盖行业 Treemap、龙虎榜席位共现网络与连板情绪天梯的 Playwright E2E 交互测试。

## 验证门禁
- `cd frontend && bun run test:e2e e2e/portfolio-tear-sheet.spec.ts e2e/market-panorama.spec.ts` 退出码 0，全部交互通过。
- 浏览器控制台 0 Canvas / WebGL 上下文崩溃或 ECharts 实例销毁泄漏警告。
- 保证无网络请求挂起（Timeout < 10s）。

## 执行证据（2026-09-23）

- `cd frontend && bun run test:e2e e2e/portfolio-tear-sheet.spec.ts e2e/market-panorama.spec.ts`：Chromium 2/2 passed；两份 spec 单独运行也通过。API 均由确定性 fixture 响应，无实时市场请求；请求模拟延迟在 10 秒门限内。
- Portfolio 实际选择“成长组合”并打开量化体检报告；验证负收益水下曲线及 60 日滚动图 crosshair、正负月份 title、风险摘要、HHI 与风险贡献表。月收益格的浏览器背景色正负有别，源码 `color-mix()` 与文字颜色均使用 `--fq-price-up/down`；页面解析到所需 `--fq-*` token。
- Discover 切换行业热力、席位关系和短线情绪；验证 Treemap Tooltip 与 zoom 下钻、席位 Tooltip 与画布拖动、情绪 Tooltip 数值与图例过滤。席位图曾因 ECharts legend 缺少 category metadata 呈空白，已增加本地化 categories 并映射 API category 字符串到 category index；保留图表可见性观察器，避免隐藏 Tab 初始化异常。
- 席位图 hover 先等待 fixture 数据就绪和 Canvas 图像稳定，再移动到图节点；这消除了首次复跑暴露的 Tooltip 交互时序 flake。
- `pageerror=0`、`console.error=0`；组合 gate 2/2、无 retry，两个 spec 当前版本各自单跑 1/1。控制台另记录 AntD `destroyOnClose` 弃用、React Router future-flag 和非致命 ECharts `Can't get DOM width or height` warnings；未观察到 Canvas/WebGL 崩溃或 ECharts 实例销毁泄漏警告。不得将此结果表述为完全无 console warning。
- Playwright 附加并保存 `portfolio-underwater-crosshair.png`、组合页最终态、`market-treemap-zoom.png`、`market-seat-network-pan.png` 与市场最终态截图；已人工检查，图表、Tooltip 与 crosshair 可见。没有新依赖、API、schema 或实时数据请求。
