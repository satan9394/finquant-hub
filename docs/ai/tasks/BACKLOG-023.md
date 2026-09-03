# BACKLOG-023 — echarts 按需引入（echarts/core）：懒加载 chunk 瘦身

> 状态：`[READY]` ｜ 优先级：P1 ｜ 创建：2026-09-03 ｜ 执行者：Codex
> 背景：BACKLOG-022 证实 echarts 已在懒加载 chunk（`dist/assets/index-dM8hBGUF.js` 1119KB 含 ZRender），但仍是 **echarts 6.1.0 全量**——`LazyEChart` 的 `lazy(() => import('echarts-for-react'))` 经 `echarts-for-react/lib/index.js` 的 `import * as echarts from 'echarts'` 引入全部图表/组件。实际使用面仅 **line / bar / scatter / candlestick** 4 种图表（维护者已 grep 三个使用者 option 的 `type:` 确认）。本任务改用 `echarts/core` 按需注册，将 1119KB 懒加载 chunk 显著缩小（预计 40-60%），改善用到图表页面（组合风险/回测图表/研究图表）的加载体验。
>
> **开工前必读（维护者调研结论，勿跳过）**：
> 1. **可行性已验证**：`frontend/node_modules/echarts-for-react/lib/core.js` 存在且支持 `echarts` prop（`this.echarts = props.echarts`）——即可传入自定义的 `echarts/core` 实例。**方案**：新建 `frontend/src/charts/echartsSetup.ts`（`import * as echarts from 'echarts/core'` + `echarts.use([...])` 注册所需图表/组件/renderer），新建 `frontend/src/components/LazyEChartCore.tsx`（用 `echarts-for-react/lib/core` + `echarts={configuredEcharts}`），`LazyEChart` 的 lazy 目标改指向它。
> 2. **图表类型面（已确认）**：`line`（多处）、`bar`（多处）、`scatter`（PortfolioRiskWorkbench L167）、`candlestick`（BacktestCharts L58、ResearchCharts L64）。**组件面需 Codex 再确认**：三个使用者的 option 是否用了 `dataZoom`/`markLine`/`visualMap`/`toolbox`/`axisPointer` 等——凡用到必须注册对应组件，否则图表静默不渲染。
> 3. **渲染器**：`CanvasRenderer`（echarts 默认）；如需 `SVGRenderer` 另注册。
> 4. **LazyEChart 语义保留**：`Suspense` fallback（`chart.loading`）、`EChartsReactProps` 类型、`notMerge` 等 props 透传（PortfolioRiskWorkbench L294 用 `notMerge`）——不得破坏。
> 5. **零依赖变化**：不新增/删除/升级任何 npm 包（echarts/core、echarts/charts、echarts/components、echarts/renderers 均来自已安装的 echarts 6.1.0）；**不碰 package.json/bun.lock**。
> 6. **测试**：`frontend/tests/LazyEChart.test.tsx` 存在（BACKLOG-007 补过）；三个使用者的组件测试（PortfolioRiskWorkbench/BacktestCharts/ResearchCharts 相关）需全绿。E2E 50 基线全绿兜底（组合/回测/研究页有 chart-section/role=img 断言可沿用）。
> 7. **量化验收**：build 前后对比 `dist/assets/index-dM8hBGUF.js`（或新 chunk 名）字节数，记录预期 ~40-60% 缩减；若缩减不明显，记录实际结果不扩大改动。

---

## 允许修改

- `frontend/src/charts/echartsSetup.ts`（**新建**，echarts/core 注册）
- `frontend/src/components/LazyEChartCore.tsx`（**新建**，echarts-for-react/lib/core + echarts prop）
- `frontend/src/components/LazyEChart.tsx`（lazy 目标改指 LazyEChartCore；Suspense/props 语义保留）
- `frontend/tests/LazyEChart.test.tsx`（如 mock 目标变化需更新；断言语义不得放宽）
- `docs/ai/tasks/BACKLOG-023.md`、`docs/ai/EXEC_PLAN.md`、`task/CHANGELOG.md`
- `docs/ARCHITECTURE.md`（仅当需要注明 echarts 按需引入时）

## 禁止修改

- `backend/` 全部
- `frontend/package.json`、`frontend/bun.lock`（**零依赖变化**）
- `frontend/playwright.config.ts`、`frontend/vite.config.ts`
- `PortfolioRiskWorkbench.tsx`/`BacktestCharts.tsx`/`ResearchCharts.tsx`（LazyEChart 的 3 个使用者只读，option 不动）
- 其他页面/组件行为
- **不新增/删除/升级任何依赖**；**不删除任何文件**

---

## 完成标准

### 目标 1：echarts/core 按需注册

`frontend/src/charts/echartsSetup.ts`：
- `import * as echarts from 'echarts/core'`
- 注册图表：`LineChart`、`BarChart`、`ScatterChart`、`CandlestickChart`（`echarts/charts`）
- 注册组件：`GridComponent`、`TooltipComponent`、`LegendComponent` + 三个使用者 option 实际用到的（如 `DataZoomComponent`、`MarkLineComponent`、`VisualMapComponent` 等，**Codex 先读三个 option 确认**）
- `CanvasRenderer`（`echarts/renderers`）
- `echarts.use([...])` 后 `export default echarts`

### 目标 2：LazyEChart 接入

- `frontend/src/components/LazyEChartCore.tsx`：`import ReactEChartsCore from 'echarts-for-react/lib/core'` + `echarts={configuredEcharts}` 透传 props（含 `notMerge`/`style` 等），导出组件
- `LazyEChart.tsx`：`lazy(() => import('./LazyEChartCore'))`，`Suspense`/`chart.loading` fallback/`EChartsReactProps` 类型签名不变
- 三个使用者零改动

### 目标 3：测试与验证

- **Vitest**：`LazyEChart.test.tsx` 更新（mock 目标变化）且断言语义不放松；三个使用者相关测试全绿；全量 `bun run test`（基线 121 files/346 tests）
- **E2E**：全量 `bun run test:e2e`（50 基线）全绿，workers:2/retries:1
- **build**：`bun run build` 通过；**量化**——记录 `dist/assets` 中 echarts 所在 chunk 的 build 前后字节数（预期 1119KB 显著缩小），若未缩小记录实际结果
- **功能冒烟**：组合风险页/回测图表/研究图表的图表正常渲染（role=img/chart-section 断言或人工验证截图）
- `git diff --check` 通过；**零依赖变化**（git diff 无 package.json/bun.lock）

### 目标 4：文档同步

- `docs/ai/EXEC_PLAN.md` 标记 `[DONE]`（证据：注册清单/chunk 前后字节/测试数/门禁）
- `task/CHANGELOG.md` 追加一条（**带 `## YYYY-MM-DD` 标题行**）
- `docs/ARCHITECTURE.md`：仅当需要注明按需引入时补一句

---

## 参考

- `frontend/src/components/LazyEChart.tsx`（现状）、`frontend/node_modules/echarts-for-react/lib/core.js`（echarts prop 支持）
- 三个使用者：`frontend/src/pages/PortfolioRiskWorkbench.tsx`、`frontend/src/components/strategy/BacktestCharts.tsx`、`frontend/src/components/research/ResearchCharts.tsx`（option 中图表类型）
- echarts 6.1.0 子路径：`echarts/core`、`echarts/charts`、`echarts/components`、`echarts/renderers`
- BACKLOG-022 证据（echarts 懒加载位置与字节基线）

## 验证命令

```powershell
cd frontend
$env:Path = "D:\Technology_application\NVM_Windows\nvm_a\v22.19.0;$env:Path"
# 构建前记录
Get-ChildItem dist\assets -Filter 'index-*.js' | Sort-Object Length -Descending | Select-Object -First 3 | ForEach-Object { "$([math]::Round($_.Length/1KB))KB $($_.Name)" }
& "D:\Technology_application\NVM_Windows\nvm_a\v22.19.0\bun.exe" run build
& "D:\Technology_application\NVM_Windows\nvm_a\v22.19.0\bun.exe" run test
& "D:\Technology_application\NVM_Windows\nvm_a\v22.19.0\bun.exe" run test:e2e
# 构建后对比
Get-ChildItem dist\assets -Filter 'index-*.js' | Sort-Object Length -Descending | Select-Object -First 3 | ForEach-Object { "$([math]::Round($_.Length/1KB))KB $($_.Name)" }
cd .. && git diff --check
```

## 完成证据（执行后填写）

- `echartsSetup.ts` 注册清单（图表/组件/renderer）与三个 option 实际组件面核对
- `LazyEChart`/`LazyEChartCore` 改动摘要（lazy 目标、props 透传、Suspense 保留）
- chunk 字节前后对比表；功能冒烟结果
- 测试数变化（Vitest/E2E 前后）；全量门禁结果
- 依赖零变化确认（package.json/bun.lock 未动）
- 记录决策（如某个 option 用到未预期组件导致需加注册，说明）
