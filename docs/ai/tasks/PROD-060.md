# PROD-060: 核心路径 E2E 与错误/空状态回归

> 状态：`[DONE]`  
> 阶段：Productization Phase 6

## 用户问题

产品已经能完成个股研究、策略验证和组合体检，但现有 Playwright 覆盖集中在 Dashboard，无法持续证明三条核心旅程在路由、加载、空数据和失败场景下仍然可完成。发布前需要一组可重复、无外部数据波动的浏览器回归合同。

## 目标行为

为个股研究、策略验证和组合体检建立确定性的浏览器 E2E：成功路径证明用户能进入任务、看到来源/口径并到达结果或下一步；空状态和接口失败必须显示可理解、可恢复的状态，不能白屏、静默失败或补造金融数值。

## 范围内文件

- `frontend/e2e/` 与 `frontend/playwright.config.ts`
- 与复现缺陷直接相关的最小前端页面/组件及聚焦测试
- `docs/ai/PRODUCT_CAPABILITY_MATRIX.md`
- `docs/ai/EXEC_PLAN.md` 和本任务卡

## 明确非目标

- 不新增远端服务、数据库、依赖或产品能力。
- 不用固定假数据替换生产接口；mock 只存在于 E2E 测试边界。
- 不放宽来源、期间、复权、成本、基准、质量标记或 `UNKNOWN` 合同。
- 不修改架构或 `reference/`，不提交、发布、发送或下单。

## 数据与金融口径

- 成功样本必须显式标注来源、时间或方法；测试断言不能把 mock 值描述为实时值。
- 空/错状态不得显示由缺失数据推导的收益、风险、因子或评级。
- 外部数据失败保持可见失败原因，并提供安全重试或返回路径。

## 交互状态

- 正常：三条核心旅程至少各有一个从入口到结果/下一步的 E2E。
- 加载：关键页面有稳定加载反馈，不阻断导航和返回。
- 空：没有工作区、实验或组合时说明需要的输入和下一步。
- 错误/部分成功：失败来源和仍可用内容分开显示，可安全重试或返回。

## 可访问性要求

- E2E 使用角色、名称或稳定语义定位器，不依赖脆弱坐标。
- 错误/空状态可被辅助技术读取，主要恢复动作可键盘触达。
- 桌面与 390×844 核心页面无文档级横向溢出。

## 测试与浏览器验收

- 新增 Playwright 成功、空和错误回归，并运行完整 `bun run test:e2e`。
- 运行相关 Vitest、完整前端测试、TypeScript/build 与 `git diff --check`。
- 使用本地真实前后端抽查三条旅程，不执行写入、远端提交或真实交易。

## 文档同步项

- 更新 `docs/ai/PRODUCT_CAPABILITY_MATRIX.md` 的 E2E/空错状态证据。
- 更新 `docs/ai/EXEC_PLAN.md` 和本任务完成记录。

## 完成定义

- 三条核心旅程的确定性 E2E 全部通过。
- 每条旅程至少覆盖成功路径，整体覆盖明确空状态和接口失败。
- 没有白屏、静默失败、来源不明或缺失数据补造值。
- 完整前端测试、构建、E2E 和浏览器抽查通过。

## 回滚方式

删除新增 E2E/fixture，并恢复仅为复现缺陷所做的最小页面修复；生产数据与路由合同保持不变。

## 完成记录

- 新增 7 条核心路径 Playwright 回归；连同既有 Dashboard 2 条共 9 passed。研究覆盖显式空状态、来源成功与 Yahoo 上游失败；策略覆盖完成结果与原始失败；组合覆盖真实风险证据、分来源加载失败和 390px KPI 边界。
- Portfolio 不再静默忽略组合列表、汇总、持仓或配置失败，每个来源显示错误与独立重试；未把失败渲染成 0 或已更新状态。
- 390px KPI 使用局部响应式字号，四个值的浏览器 bounding box 均保持在卡片内。
- 聚焦 Vitest 1 passed；完整前端 46 files / 118 tests；TypeScript/build、Playwright 9 passed 与 `git diff --check` 通过。
- 真实浏览器验证 `/research/600519`、`/strategy-lab/ma-crossover?symbol=600519`、`/portfolio`：桌面和 390×844 无文档级横向溢出；研究行情/日线显示 tencent/sina，失败的基本面和筹码保持明确 UNKNOWN/错误；未运行写任务。
- 证据截图：`artifacts/productization/phase6/01-live-research-partial-evidence.png`、`02-live-strategy-readonly.png`、`03-live-portfolio-readonly.png`、`05-live-core-narrow-portfolio-fixed.png`。
