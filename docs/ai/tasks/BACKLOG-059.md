# BACKLOG-059: 专业 K 线终端与多周期指标联动的浏览器 E2E 交互测试

## 目标与用户价值
针对 BACKLOG-054 交付的多周期专业 K 线终端（`ProCandlestickChart`），构建全自动化真实浏览器点击、周期切换与指标联动测试套件。
确保交易者在实际操作 K 线图表时，周期切换平滑无闪烁，主副图技术指标（MA/EMA/BOLL/MACD/KDJ/RSI/VOL）能够正常渲染，十字光标多视口同步，研报结论抽屉能够被精准唤起。

## 交互测试场景与路径
1. **周期切换点击交互**:
   - 导航至包含 K 线终端的研报工作区页面（或 `/research-workspace` / 测试专用路由）。
   - 模拟点击周期切换按钮（日K、周K、月K，以及服务实际支持的 `60m/30m/15m/5m` 分钟K）。当前市场 API 不支持 `1m`，测试不虚构该周期。
   - 验证网络请求发出对应周期的聚合参数，K 线画布（Lightweight Charts Canvas）成功重新适配数据并刷新绘制。

2. **技术指标勾选与副图联动交互**:
   - 点击主图技术指标选择框，依次勾选/取消勾选 MA、EMA、BOLL 均线与通道。
   - 点击副图切换器，激活 MACD、KDJ、RSI；验证独立 VOL 成交量面板持续渲染。
   - 断言副图面板高度自适应计算，DOM 中挂载的多个 Canvas 容器未发生挤压。
   - 模拟在主图 Canvas 上移动鼠标，断言十字光标的可读 OHLCV Tooltip 显示对应时间和值，并校验主副图容器尺寸可用。

3. **研报锚点与结论抽屉呼出交互**:
   - 模拟在研报文本与图表之间联动：点击 K 线图上浮现的研报标记锚点（Marker）。
   - 断言侧边研报详情抽屉（Drawer）顺畅弹出，并展示对应的看多/看空研报结论。
   - 点击关闭按钮，断言抽屉正常淡出，图表视口恢复全宽。

## 交付文件
- `frontend/e2e/pro-candlestick.spec.ts`: 覆盖周期切换、指标切换、十字光标与研报抽屉的 Playwright E2E 交互测试。

## 验证门禁
- `cd frontend && bun run test:e2e e2e/pro-candlestick.spec.ts` 退出码 0，所有交互动作通过。
- 浏览器控制台 0 Canvas 上下文丢失或 NaN 坐标警告。
- 样式严格消费 `--fq-*` CSS 变量，夜间/日间主题切换下背景色无残留。

## 执行证据
- 状态：已完成。
- 依据：`docs/API_CONTRACT.md` 中 `/api/market/kline` 周期白名单为 `day|week|month|60m|30m|15m|5m`（兼容 `1d|1wk|1mo`）；按该真实接口验证全部七种 UI 周期，不添加未支持的 `1m`。
- 实现：加入 MA/EMA/BOLL 可访问勾选控制，新增已受 API 支持的 30m/5m 周期，并在主图十字光标处显示 OHLCV Tooltip；样式引用 `--fq-*` token。
- 浏览器门禁：`cd frontend && bun run test:e2e e2e/pro-candlestick.spec.ts` 通过，Chromium 4/4（21.3 秒，1 worker，无 retry）；周期请求、指标点击、Canvas hover/zoom、Light/Dark token 切换与研报抽屉均通过。每个场景断言 pageerror 与 console error 为空，并附最终页面截图。
- 组件回归：`bun run test tests/ProCandlestickChart.test.tsx` 通过，4/4。
- 构建与差异检查：`bun run build` 通过（OpenAPI 60 schemas fresh；TypeScript 与 Vite 构建完成，4,278 modules）；`git diff --check` 通过。
