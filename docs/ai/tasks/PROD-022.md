# PROD-022: 指标解释卡与知识锚点

> 状态：`[DONE]`  
> 阶段：Productization Phase 2
> 完成日期：2026-08-09

## 用户问题

个股页已有 MA、KDJ、MACD 和 RSI 图表，但用户看不到当前原始值、指标用途、正确读法和常见误区，也无法从图表进入稳定的知识说明。

## 目标行为

复用现有指标序列和知识页，为 MA、KDJ、MACD、RSI 提供共享解释：展示截止日真实值、参数口径、用途、读法、局限，并可从个股页进入对应知识主题。补齐“为什么 / 原始指标 / 深度研究 / 策略验证”动作，不改变任何计算。

## 范围内文件

- `frontend/src/features/indicatorKnowledge.ts`
- `frontend/src/components/IndicatorGuide.tsx`
- `frontend/src/pages/StockAnalysis.tsx`
- `frontend/src/pages/Knowledge.tsx`
- `frontend/src/app.css`
- `frontend/tests/IndicatorGuide.test.tsx`
- `frontend/tests/Knowledge.test.tsx`
- `docs/ai/EXEC_PLAN.md` 和本任务卡

## 明确非目标

- 不改变指标公式、参数、评分、信号检测或 API。
- 不补造缺失序列、日期、来源或当前值；无值显示未知。
- 不创建新的教学模拟数据；现有知识页中的模拟图继续明确为教学示意。
- 不实现研究聚合或后续闭环任务。
- 不修改 `reference/`，不提交或发布。

## 验收

- 四类当前可见指标均有用途、读法、参数/公式和常见误区。
- 当前值来自响应中最后一个非空值，并显示数据截止日；缺失保持未知。
- 个股页可以进入原始图表、对应知识主题、深度研究和带标的预填的策略实验室。
- 知识页与个股页复用同一解释定义，MA 可继续进入现有双均线文章。
- 测试、构建和桌面/窄屏浏览器验证通过。

## 回滚方式

移除共享指标目录、解释卡和知识主题入口，恢复仅展示原始图表的个股页；指标数据和现有知识 HTML 不受影响。

## 验证结果

- 测试先失败于共享组件和知识主题不存在；实施后 IndicatorGuide/Knowledge：2 files / 3 tests passed。
- 前端全量测试：22 files / 52 tests passed；`bun run build` 通过，4,158 个模块完成转换；`git diff --check` 通过。
- 实时 600519 指标卡显示截止 2026-08-07 的 MACD、KDJ、RSI 最后非空值；响应未返回 MA 序列时四个 MA 值保持“未知”，未以 0 替代。
- MACD 卡展示用途、读法、12/26/9 公式与误区；知识入口到 `/knowledge?indicator=macd` 并选中同一共享主题。
- “继续深度研究”到 `/research/600519`；“用策略验证”到 `/strategy-lab/ma-crossover?symbol=600519`；均仅导航/预填。
- 390×844 下指标卡与知识主题均进入首个可滚动视口，`scrollWidth=375 <= innerWidth=390`；知识菜单限高滚动，不再遮蔽正文。
- 证据：`artifacts/productization/phase2/07-indicator-guide-desktop.png`、`08-indicator-guide-narrow-390x844.png`、`09-indicator-knowledge-desktop.png`、`10-indicator-knowledge-narrow-390x844.png`。
- GitHub-first 搜索因搜索服务网络错误未完成；实现复用现有 IndicatorData、计算口径和 MA 教学文章，无新依赖。
