# BACKLOG-023 — echarts 按需引入（echarts/core）：懒加载 chunk 瘦身

> 状态：`[DONE]` ｜ 优先级：P1 ｜ 创建：2026-09-03 ｜ 执行者：Codex
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
- 三个使用者（以当前源码实际路径校准）：`frontend/src/components/portfolio/PortfolioRiskWorkbench.tsx`、`frontend/src/components/research/BacktestCharts.tsx`、`frontend/src/components/research/ResearchCharts.tsx`（option 中图表类型）
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

## 完成证据

执行日期：2026-09-03；起点 `0d4f447`，开工时工作树干净。实现、build、全量 Vitest 和 E2E 均已验证，四项目标全部完成。未 commit/push。

原始证据保存在仓库外 `C:\Users\SATANC~1\AppData\Local\Temp\finquant-backlog-023-20260903\`；不向仓库增加临时脚本、日志或依赖。

### 1. 注册清单与 option 核对

`frontend/src/charts/echartsSetup.ts` 使用 `import * as echarts from 'echarts/core'`，`echarts.use([...])` 后默认导出配置实例：

- 图表仅 `LineChart`、`BarChart`、`ScatterChart`、`CandlestickChart`。
- 组件为 `GridComponent`、`TooltipComponent`、`LegendComponent`、`DataZoomComponent`、`MarkLineComponent`、`MarkPointComponent`。
- 渲染器仅 `CanvasRenderer`。

| 只读使用者 | 实际 option 与注册依据 |
|---|---|
| `components/portfolio/PortfolioRiskWorkbench.tsx` | line 权益曲线、bar 权重、scatter 相关性；grid、tooltip、legend；权重 tooltip 的 shadow axisPointer；相关性 series 的 `markLine` 零值参考线 |
| `components/research/BacktestCharts.tsx` | line 权益/回撤、candlestick 价格；grid、tooltip、legend；cross axisPointer；dataZoom inside/slider；买卖点 `markPoint` |
| `components/research/ResearchCharts.tsx` | candlestick K线、line MA/MACD/RSI、bar 成交量/MACD；双 grid、tooltip、legend；cross axisPointer；dataZoom inside/slider，含 xAxisIndex [0,1] 联动 |

决策：`MarkPointComponent` 是卡片示例清单外的实际需求，必须保留买卖标记。已只读核对 echarts 6.1.0 的 `lib/component/grid/install.js:45-49` 和 `tooltip/install.js:44-50`：两者均自动安装 axisPointer，因此不重复显式注册；`DataZoomComponent` 安装 inside 和 slider 两种实现。未用到 visualMap/toolbox/dataset/title/brush/markArea，不注册；React 表格列的 `title` 不属于 ECharts option。没有 SVG 使用者，不注册 SVGRenderer。

### 2. LazyEChart 接入与契约

- `LazyEChartCore.tsx` 用 `echarts-for-react/lib/core`，`<ReactEChartsCore {...props} echarts={configuredEcharts} />`；使用原 `EChartsReactProps`，不重写 option、不窄化类型、不新增默认参数。
- `LazyEChart.tsx` 只改一行 lazy 目标为 `./LazyEChartCore`；函数签名、Suspense、`chart.loading`、role=status 和 props 透传均保持。
- `LazyEChart.test.tsx` 的原两项断言保留，mock 转向 core；额外断言加载提示出现/消失、配置实例注入、onChartReady/onEvents 透传。配置实例在测试 import 阶段加载，避免把依赖模块冷加载时间算进 findBy 的 1 秒等待；不调整任何超时。
- 三个业务使用者及 option 零改动。

### 3. 两次全新 build 与 chunk 字节

改造前后均执行原 `bun run build`：OpenAPI prebuild **58 schemas fresh**、tsc 和 Vite 全部 exit 0；modules **4,243 → 4,242**；Vite 阶段 **22.76s → 15.49s**。字节采用实际文件长度，非四舍五入 KB。

| 产物 | 修改前文件 | 修改后文件 | before bytes | after bytes | after − before |
|---|---|---|---:|---:|---:|
| ECharts 懒加载 | index-dM8hBGUF.js | LazyEChartCore-DE3UeINf.js | 1,145,864 | 639,262 | -506,602（-44.21%） |
| LazyEChart 边界 | LazyEChart-BP6_PtBb.js | LazyEChart-76iS6jHQ.js | 507 | 525 | +18 |
| HTML 主入口 | index-8ilTy0GW.js | index-qsoXY7Ty.js | 368,423 | 368,423 | 0 |
| AntD/shared vendor | vendor-antd-TEedNHKs.js | vendor-antd-B_xgbYPv.js | 1,564,909 | 1,565,418 | +509 |
| 全部 33 个 JS chunk | dist/assets/*.js | dist/assets/*.js | 3,629,057 | 3,122,982 | -506,075 |

- ECharts gzip（Vite 输出）：**385.68 → 216.47 kB**。vendor 细微增加已计入净值，不把单 chunk 缩减直接当全应用缩减。
- TypeScript AST 检查生产 JS import 图：入口静态闭包仅主入口和 vendor；两者无 `[ECharts]` 标记。`LazyEChart-76iS6jHQ.js` 动态加载 `LazyEChartCore-DE3UeINf.js`，后者包含 ECharts；图表库未进入首屏静态闭包。源码中的 ECharts 顶层包引用均为 type-only。
- 证据：`build-before.log`、`build-after.log`、`bundle-before.json`、`bundle-after.json`（全部 chunk 字节/SHA256）、`bundle-*-index.html`、`bundle-graph-after.json`。可重跑 `node <证据目录>/bundle-audit.mjs E:\Code_file\Projects\finquant-hub`。
- 测试与文档收尾后再次运行原 `bun run build`，58 schemas fresh、4,242 modules、exit 0；ECharts/入口/vendor 文件名和字节保持 639,262 / 368,423 / 1,565,418，日志 `build-final.log`（Vite 55.38s）。
- 原 >500 kB 构建警告仍存在；实际缩减达到预期，不扩大到 Vite 拆包配置或依赖清理。

### 4. 测试与功能冒烟

- Vitest 基线 **121 files / 346 tests** 来自已提交 BACKLOG-022；本轮不声称额外执行了改造前全量 Vitest。用例数量没有增加或删除。
- 新 LazyEChart 专项 **1/1 files、2/2 tests 通过**（3.53s，`vitest-lazy.log`），包含旧 option/notMerge/style 断言及新增契约断言。
- 首轮五文件专项暴露旧 mock 路径问题，初次全量 `bun run test` 为 **118/121 files、338/346 tests**，24 个 jsdom Canvas 异步错误（738.37s，exit 1）。根因是四个使用者相关测试仍 mock 顶层 `echarts-for-react`，而生产代码已改为 core 子路径；日志 `vitest-focused-initial.log` / `vitest-full.log`。
- 最小修复仅在 `BacktestCharts.test.tsx`、`ResearchCharts.test.tsx`、`PortfolioRiskWorkbench.test.tsx`、`ChartAccessibility.test.tsx` 将 mock 目标同步为 `echarts-for-react/lib/core`，并静态 import `echartsSetup` 预热配置模块，确保既有 1 秒 findBy 窗口不承担 ECharts 冷加载。未调整测试超时、返回组件、测试数量或任何断言；四个业务组件保持只读。第一次只改 mock 路径的专项为 13/17，证明仍受冷加载等待影响；预热后最终专项 **5/5 files、17/17 tests**（39.86s），日志 `vitest-focused-final-2.log`。
- **最终全量 `bun run test`：121/121 files、346/346 tests 全绿；1139.05s，exit 0**。无失败、跳过或测试配置变化；日志 `vitest-final.log`。
- 全量 `bun run test:e2e` 首轮 **49 passed / 1 flaky**（56.1s，exit 0）：研究图表 canvas 首次等待 5000ms 超时，原 retries:1 重试通过。未改超时、断言或配置；随后完整复测 **50/50 passed**（45.2s，exit 0），无重试、无跳过。两轮日志 `e2e.log` / `e2e-final.log`。
- 功能冒烟沿用原 `e2e/core-paths.spec.ts`：研究流程 L103（L117 canvas）、回测流程 L171（L189 canvas）、组合风险 L245（role=img + canvas）全部通过。使用既有确定性 API fixture，验证真实 Chromium Canvas 渲染及既有来源/风险摘要，不声称真实行情上游验证。
- 启动前 4173 无监听、CI 未设置；沿用配置 workers:2/retries:1，由 Playwright 原 webServer 启动并回收测试服务，未改端口配置。

### 5. 范围与依赖

- 零安装、删除或升级依赖；package.json/bun.lock、Vite/Playwright 配置、backend、reference、三个使用者不改动。
- 开工时 `tracked-before-verified.json` 记录 **6,325 个普通跟踪文件** SHA256（排除目录型 gitlink）。最终 **9 个原文件修改 + 2 个允许的新文件**；其余 **6,316 个原文件 SHA256 不变**，包括全部 253 个 backend 文件与全部禁止项；跟踪文件缺失 0、越界生产修改 0，暂存区为空，HEAD 保持 `0d4f447deecf3e44b98fd3b55009004ef4fd1948`。`git diff --check` 通过，详情 `scope-final.json`。
- 卡片目标 3 明确要求三个使用者相关测试全绿。四个相关测试不在“禁止修改”清单内，仅同步 mock 路径并预热配置模块；未改变断言语义、超时或业务行为。没有添加测试专用生产分支。
- HANDOFF.md 不在本卡允许清单内，遵循用户严格范围要求保留原样，不运行会写 HANDOFF 的收尾脚本；架构无变化，不修改 docs/ARCHITECTURE.md。

| 重点保护文件 | 修改前 = 修改后 SHA256 |
|---|---|
| frontend/package.json | `D46A33D496C420164EC8FEFEC2589C0EDB7E631F771592CD83535CEF85507651` |
| frontend/bun.lock | `049D62D852E44D2E71E4D576086BA0DBD72A3BFC1853D08C2487ABBC9CC94C29` |
| frontend/vite.config.ts | `CF926F0E089E4E6626F8E0DB5732EC52FA660E318E2082FF721A0B71F148CD36` |
| frontend/playwright.config.ts | `E05DC8124CCD9692DBEFBF28CB490B2B4126DE8843FA3A63517C51696A9348CF` |
| components/portfolio/PortfolioRiskWorkbench.tsx | `5183838CC656957D7EB273ACD8912AE85F6F8BBF1B296BEC5804CEE04BFAC232` |
| components/research/BacktestCharts.tsx | `B860199E2FB15E886202009D9117FF66E87593709BE126EF1F81BB61614766E3` |
| components/research/ResearchCharts.tsx | `11701E68FBCD051920C985A08FC8A9E77C6ACD412B32646292B41E5B6CA4F79A` |

完成边界：四项目标全部通过；没有扩展到依赖、Vite/Playwright 配置、业务 option、backend、架构或真实外部行情验证。
