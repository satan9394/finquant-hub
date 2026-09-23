# PROD-036: P2 Alpha IC、分位和衰减能力评估

> 状态：`[DONE]`  
> 阶段：Productization Phase 3

## 用户问题

Alpha 本地模拟已经能用显式 `factor` 和下一期 `forward_return` 形成多空收益，但页面容易让专业用户误以为同一输入已经足以支持 ICIR、完整分位单调性和衰减。当前最低横截面只有两个标的，且每条记录只有一个未标注期限的 forward return。

## 目标行为

在 Alpha 工作台明确展示 P2 能力评估而非伪造数值：IC/Rank IC/ICIR 需要更严格的横截面、方差和样本期规则；完整分位收益需要至少可稳定分组的横截面和新的结果合同；衰减需要多期限 forward return。现有多空模拟和相关性保持不变。

## 范围内文件

- `frontend/src/components/alpha/AlphaSimulationWorkbench.tsx`
- `frontend/tests/AlphaSimulationWorkbench.test.tsx`
- `docs/ai/PRODUCT_CAPABILITY_MATRIX.md`
- `docs/ai/EXEC_PLAN.md` 和本任务卡

## 明确非目标

- 不用两个标的计算必然接近 ±1 的伪 IC，不把组合收益相关性命名为 IC。
- 不把当前头尾篮子收益冒充完整分位组合曲线或单调性证据。
- 不从单一 `forward_return` 推断 1/5/10 期衰减，不生成额外收益列。
- 不提交 BRAIN，不保存或生成观察数据，不修改后端合同、架构或 `reference/`。

## 验收

- 页面把 P2 项标为评估/设计状态，并逐项说明数据与合同缺口。
- 不展示 IC、ICIR、分位或衰减数值，也不提供会触发伪计算的动作。
- 原有显式本地模拟、短样本警告和相关性流程测试继续通过。
- 前端测试、构建、桌面和窄屏浏览器验证完成。

## 回滚方式

移除 Alpha 模拟工作台中的 P2 能力评估区；现有模拟、相关性和数据合同不受影响。

## 完成记录

- 现有合同盘点结论：单期限 `date/symbol/factor/forward_return` 可作为未来单期 IC 的输入，但当前每期最低 2 个标的会使相关退化，且没有方差/有效期数/ICIR 年化合同。
- 当前 `quantile` 仅形成头尾篮子，多空收益不是完整分位曲线；完整分位至少需要稳定五组横截面和逐组输出。衰减因没有多期限 forward return 而保持数据缺口。
- 页面新增默认展开的 P2 能力评估：IC、完整分位收益为“设计状态”，衰减为“数据缺口”；没有数值、计算按钮或 BRAIN 动作。
- GitHub 开源方案检索因当前网络错误未取得结果；本任务没有新增依赖或复制外部实现。
- 验证：AlphaSimulationWorkbench 2 passed；完整前端 38 files / 87 tests、TypeScript 和生产构建通过；窄屏标题修正后聚焦测试/build 再次通过。
- 浏览器证据：`artifacts/productization/phase3/13-alpha-p2-assessment-desktop.jpg`、`14-alpha-p2-assessment-narrow-390x844.jpg`；未输入或模拟虚构观察数据，窄屏 `scrollWidth=375`。
