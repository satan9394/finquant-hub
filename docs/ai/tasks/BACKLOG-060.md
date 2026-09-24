# BACKLOG-060: Alpha 量化实验室数据录入与分位数图表浏览器 E2E 交互测试

## 目标与用户价值
针对 BACKLOG-055 交付的 Alpha 量化实验室（`AlphaFactorAnalytics`），构建完整的真实浏览器数据输入、计算触发与量化图表探索测试套件。
确保量化研究员在 Discover 页面录入横截面因子数据时，系统能稳定完成异步计算并清晰呈现 Rank IC 柱状图、五等分分位数累计收益（Q1～Q5）曲线与对冲绩效。

## 交互测试场景与路径
1. **Discover 实验室导航与表单交互**:
   - 打开现有 `/alpha` 兼容入口并确认重定向至 `/discover?mode=alpha`；标准 `/discover` 当前没有 Alpha 顶部 Tab。
   - 检查空态提示和输入控件。生产 UI 明确不自动填充合成行情或样本数据；E2E 将确定性记录输入内存文本框。
   - 填入因子 ID 与 CSV 后点击“计算并加载”，断言提交和缓存读取过程的 Loading 状态正确出现。

2. **Rank IC 与统计指标卡交互**:
   - 等待计算与缓存读取完成，断言页面展示当前契约的平均 IC、IC 标准差、IC_IR、t 统计量、分层单调性、多空换手和因子自相关；不期待 UI 未提供的年化波动或平均 Rank IC 卡片。
   - 检查 IC/Rank IC 历史图（`FactorIcHistogram`），鼠标悬停数据区并校验 Tooltip 日期及 IC、Rank IC 数值。

3. **分位数收益与多空对冲图表交互**:
   - 滚动定位至五等分分位数图表（`QuantileReturnChart`），断言 Q1（多头/低分位）至 Q5（空头/高分位）共 5 条折线及多空对冲收益曲线正常渲染。
   - 点击图例（Legend）模拟过滤显示/隐藏某一组分位数折线，验证图表响应灵敏度。

4. **异常输入与重试容错交互**:
   - 提交格式畸形的观测行，验证错误提示并确认客户端在校验失败时没有发送请求。
   - 用同一确定性 fixture 触发一次模拟服务错误，再点击“重试”重发请求；成功后验证错误面板清除、统计卡与图表恢复。

## 交付文件
- `frontend/e2e/alpha-factor.spec.ts`: 覆盖数据录入、IC 图表探索、分位数曲线与异常容错的 Playwright E2E 交互测试。

## 验证门禁
- `cd frontend && bun run test:e2e e2e/alpha-factor.spec.ts` 退出码 0，断言全部通过。
- 浏览器 `pageerror` 与非预期 console error 为 0；模拟 503 产生的唯一资源加载错误单独计数并断言一次。
- 所有 API 请求均由 Playwright route fixture 拦截；测试 CSV 仅存在于页面表单与测试内存中，不接触数据库或磁盘。

## 执行证据（2026-09-23）
- **完成**：`frontend/e2e/alpha-factor.spec.ts` 在 Chromium 通过 1/1（8.2s，1 worker，无 retry）；命令为 `bun run test:e2e e2e/alpha-factor.spec.ts`，退出码 0。
- **交互**：验证 `/alpha` 重定向、初始 CSV 留空且无样本自动填充、畸形 CSV 不发送 POST、100 条确定性测试观察记录提交、一次 503 后重试、成功读取缓存、7 项真实 UI 摘要指标、IC/Rank IC 日期与数值 Tooltip，以及 Q1 图例点击后仅隐藏 Q1、保留 Q2～Q5 与多空曲线。
- **运行质量**：零 `pageerror`、零非预期 console error；唯一 console 503 是测试刻意触发的瞬态 API fixture 错误，单独识别并断言一次。浏览器确认 8 个所需 `--fq-*` 自定义属性均有计算值；两个图表源码通过 `readChartTokens()` 使用设计令牌。
- **产物**：Playwright 最终页面截图保存在 `frontend/test-results/alpha-factor-validates-inp-bf755-ores-IC-and-quantile-charts-chromium/browser-final-state.png`；`git diff --check` 通过。
- **边界**：API 全部由 route fixture 拦截，CSV 只存在于测试内存和页面输入框；未访问真实数据源、后端数据库或磁盘持久层。无依赖、API、后端、schema 改动。
