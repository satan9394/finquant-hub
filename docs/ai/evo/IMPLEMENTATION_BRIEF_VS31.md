# IMPLEMENTATION_BRIEF — Vertical Slice 31：测试卫生（清 once 队列 + 逼近超时的首条用例）

> 来源：**VS-26 的实现者与评估者两条独立结论**（`EVALUATION_RESULT_VS26.md` §、`IMPLEMENT_RESULT_VS26.md` §4.3.4），编排者列为 NEXT。**纯测试文件改动，零生产代码。**

## 目标
消除两处**会让"红灯"与真实缺陷混在一起**的测试脆弱性——**它们是本会话多次误判的直接来源**。

## 问题一：`vi.clearAllMocks()` **不清 `mock*Once` 队列**
- **根因（VS-26 实现者交回，含硬判据）**：`frontend/tests/ResearchWorkspaceEvidence.test.tsx` 里，某条用例**提前中断（断言失败/超时）**后会留下**未消费的 `mockResolvedValueOnce`**，而 `beforeEach` 用的 **`vi.clearAllMocks()` 不清 once 队列**（只有 `mockReset`/`mockRestore` 才清）⇒ **后续用例的 once 队列整体错位一格**，产生**与自身无关的假红**。
- **判据（勿再重新论证，直接采信并在你的验证中复现一次）**：只把第 1 处改回同步断言 ⇒ 第 2、3 处**仍带 `waitFor` 却同时变红**；改后 13 次运行中**从未**出现"第 1 处过、而第 2/3 处红"。
- **修法**：把该文件的 `beforeEach`（或等价位置）改为 **`vi.resetAllMocks()`**。⚠️ **先确认顺序安全**：该文件的实现是在 `clearAllMocks` **之后**设置的（VS-26 已初判安全），**你必须自己核对一遍再改**，并给出改动前后对照。

## 问题二：`ResearchFollowupPrompt.test.tsx` 首条用例逼近 5s 默认超时
- **实测**：正常耗时 **1.5–4.6s**，默认 `testTimeout` 为 **5000ms** ⇒ **负载下必红**（评估者实测：同窗口内该文件**单跑也红 1/2**，而 VS-26 一行未动它）。
- **修法方向（你定，须说明理由）**：减少该用例的**前置工作量**（更优）或**为该文件显式提高超时**（次优，须写明"这是提高上限、不是放宽断言"）。⚠️ **不得以"删断言/改弱断言/`expect.any` 之类"换绿**——这是本卡最需要防的失败形态。

## 涉及文件（仅此二文件，**不得扩大**）
- `frontend/tests/ResearchWorkspaceEvidence.test.tsx`
- `frontend/tests/ResearchFollowupPrompt.test.tsx`

## 不能破坏
- **VS-26 的成果**：那三处 `waitFor` 的**期望值必须逐字不变**（`toBe(shanghaiToday())`、`/2026-08-27/` + `pressed: true`、`'龙虎榜：龙虎榜接口不可用'`）——VS-26 的评估者已用**机器逐字比对**证明过这一点，你也必须保持；
- **零生产代码改动**（`frontend/src/` 零命中）；
- 不删测试、不改测试意图、不加依赖、**不 commit**。

## 验收标准
1. `ResearchWorkspaceEvidence.test.tsx` **连跑 3 次全绿**（并说明改后是否**不再出现**"第 1 处过而 2/3 处红"的组合）；
2. **顺序安全证明**：给出你把 `clearAllMocks` 换成 `resetAllMocks` 前后、**该文件实现设置顺序**的核对结论；
3. `ResearchFollowupPrompt.test.tsx` 改后的**耗时实测**（首条用例耗时数字）与**连跑 3 次全绿**；
4. **断言强度未被削弱**：逐字比对这两文件的期望值在改动前后**未变**（列出比对结果），并说明**未新增任何弱断言**（`queryBy*`/`not.toThrow`/`toBeDefined`/`expect.any` 零命中）；
5. **鉴别力证明**：任选一处改动**在副本里退回原状** ⇒ 至少一条用例变红（贴原始输出）；
6. 门禁：这两个文件 + **串行** `bun run build`。

## ⚠️ 环境铁律
- **负载抖动**：实测峰值负载下**连未变异的 Base 副本也超时变红** ⇒ **不得据此改代码、更不得放宽断言**；如实记噪声。
- **临时/变异文件一律放 `$env:TEMP`，绝不放 `frontend/tests/`**（会被 vitest glob 收集、污染你自己的数字——本仓发生过）；**不要把门禁输出写进仓库目录**；做变异/还原验证**先声明窗口**。
- ⚠️ 工作树里另有 **VS-29（前端 src）** 与 **VS-30（后端）** 的在制改动——**不要触碰**，也**不要**把它们的测试计入你的结论。

## 由独立 Evaluator 复核
①`resetAllMocks` 是否真清 once 队列、**是否**引入"某用例不再自证"的新风险；②首条用例修法是否**只提高上限而未削弱断言**；③两文件期望值是否**逐字未变**；④是否**零生产代码改动**。
