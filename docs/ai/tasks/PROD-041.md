# PROD-041: 组合风险指标通俗解释

> 状态：`[DONE]`  
> 阶段：Productization Phase 4

## 用户问题

组合风险工作台已经展示 concentration、drawdown、tail risk 和 diversification 的后端原始证据，但普通用户仍需自行解释英文状态、数值含义和风险优先级，无法快速回答“我最需要关注什么”。

## 目标行为

在现有组合模拟结果上增加通俗摘要：解释集中度、当前/最大回撤、历史 VaR/ES 和分散化；明确数值口径、样本状态与主要局限，并只依据后端已返回证据给出可核验的关注顺序和下一步。

## 范围内文件

- `frontend/src/components/portfolio/PortfolioRiskWorkbench.tsx`
- `frontend/tests/PortfolioRiskWorkbench.test.tsx`
- `docs/ai/PRODUCT_CAPABILITY_MATRIX.md`
- `docs/ai/EXEC_PLAN.md` 和本任务卡

## 明确非目标

- 不在前端重算 HHI、VaR、ES、相关性或分散化收益。
- 不用固定阈值覆盖后端状态，不为样本不足或缺失字段补数值。
- 不实现相关矩阵、风险贡献、优化器比较、持仓修改或订单。
- 不新增依赖，不修改架构或 `reference/`，不提交或发布。

## 验收

- 用户能在摘要中识别当前最主要的组合风险及对应后端证据。
- 集中度、回撤、VaR/ES 和分散化均有中文含义、口径和局限。
- `insufficient_data` 或缺失值显示样本不足，不渲染伪数值或行动结论。
- 原始证据、来源表和只读边界继续保留；前端测试、构建及桌面/窄屏浏览器验证通过。

## 回滚方式

移除组合风险工作台的解释层；现有模拟请求、曲线和原始风险证据不受影响。

## 完成记录

- 使用后端 `concentration.level` 作为首要集中度结论，不在前端发明或覆盖阈值；同时展示 HHI、有效资产数和最大校准权重。
- 回撤解释为相对历史高点的路径损失；VaR/ES 明确为 95% 历史单期尾部统计而非未来最大损失；分散化说明共同样本、平均相关性和波动降低口径。
- 尾部风险少于后端最低 20 个收益观察时保留空值；分散化的资产不足、混合频率、共同日期不足和常量序列状态均翻译为明确原因。
- GitHub 开源方案检索因当前网络错误未取得结果；本任务没有新增依赖或前端风险计算。
- 验证：聚焦 1 file / 3 tests；完整前端 40 files / 93 tests；TypeScript 和生产构建通过；窄屏压缩解释布局后聚焦测试再次通过。
- 浏览器证据：`artifacts/productization/phase4/04-portfolio-risk-explanation-desktop.jpg`、`05-portfolio-risk-explanation-narrow-390x844.jpg`。
