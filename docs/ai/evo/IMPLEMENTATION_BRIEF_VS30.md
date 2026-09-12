# IMPLEMENTATION_BRIEF — Vertical Slice 30：让"被截止砍断"在**预算耗尽**这条路径上也不漏报（F1）

> Orchestrator 第五阶段产物。来源：**VS-27 的独立验收**（`EVALUATION_RESULT_VS27_note.md` 的 F1 段），编排者列为 **NEXT**。

## 目标
补齐 VS-27 那条"截断必须**看得见**"的承诺在**另一条路径**上的漏洞：当某个 Agent 是被"**整轮截止压低后的单次预算**"打死（即 `llm_client` 抛**预算耗尽**类 `LLMError`）时，用户**也该被告知"这次是被总时长上限砍断的"**。

## 当前问题（**评估者已独立复现**）
- `backend/app/services/research_orch.py:512-523` 的 **`except LLMError` 分支不置 `truncated`** ⇒ 该情形下 `report_data.truncated_by_deadline=False`、**前端横幅不出现**（实测：business_analyst failed、其余 completed、字段 False）。
- **性质是漏报而非误报**：该环节仍显示 failed + 原因、`quality=degraded`，**未违反"不得静默变 completed"**。但用户不会知道"这次是被截止砍断的"，而**这恰是 VS-27 要解决的问题**。
- 该路径之所以存在，是因为 VS-27 会让**单次预算 = `min(客户端预算, 截止剩余)`**（`research_orch._remaining_call_budget`）⇒ 截止剩余**小于**客户端预算时，`llm_client` 的预算耗尽路径先于 `_deadline_reached` 触发。

## 理想行为
1. **该路径下也置 `truncated_by_deadline`**（或等价的"因截止被砍断"信号），使其与 `_deadline_reached` 触发的路径**对用户呈现一致**。
2. **判据必须是结构化的**——⚠️ **不得**用错误文案字符串匹配（仓内既有规则：**失败/降级判据读结构化信号**）。评估者建议"让 `LLMError` 携带结构化截止标记"，方向即此；**具体设计由你定并写进结果文件**。
3. 保持"**未截断时不出现提示**"（不得因本改动把普通失败也算成截断）。

## 涉及模块
- `backend/app/services/research_orch.py`（主要）、必要时 `backend/app/services/llm_client.py`（若需给 `LLMError` 加结构化字段）
- 前端**预期无需改动**（`resolveTruncatedByDeadline` 已在读该字段）；若你判断需要，说明理由
- 相关测试

## 不能破坏
- **VS-27 的既有行为**：上界公式、`None` 时逐项零回归、部分结果保留、状态如实（`degraded`/`failed` + 原因）；
- **VS-20 的结构化状态契约**（`agent_results[key].status` + `error`/`degraded_reasons`）；
- **VS-28 的 chat 侧成果**（本卡不动 chat）；
- 不加依赖、不改 schema；不删文件；**不 commit**。

## 验收标准（可判定）
1. **构造该路径**：用夹具让"截止剩余 < 客户端预算"且该轮**恰好耗尽压低后的预算** ⇒ 断言 `truncated_by_deadline=True`（或你的等价信号）**且前端会出现提示**。
2. **不误报**：普通的 `LLMError`（非因截止压低预算）⇒ **不得**标成截断（给出反例断言）。
3. **未截断的运行** ⇒ 前端仍**不出现**提示。
4. **零回归**：VS-27 的既有测试全绿；不传截止时逐项一致。
5. **鉴别力证明**：从**副本**去掉新判据 ⇒ 至少一条新用例变红（贴原始输出）。
6. 门禁：**聚焦** pytest + `ruff check .`。

## ⚠️ 环境铁律
- **不要跑全量 pytest 或 `tests/test_api.py`——本机会挂**。只跑聚焦文件并前置 `$env:no_proxy='localhost,127.0.0.1,::1'`。
- **临时/变异文件一律放 `$env:TEMP`**，**绝不放仓库目录**；**不要把门禁输出写进仓库目录**；做变异/还原验证**先声明窗口**。
- ⚠️ 工作树里另有 **VS-29（在制，前端）** 的改动（`frontend/src/...`）——**不要触碰、不要计入判定**。
- 由独立 Evaluator 复核：①该路径是否真置了信号且用户可见；②判据是否**结构化**（不得文案匹配）；③是否引入"把普通失败误报为截断"。
