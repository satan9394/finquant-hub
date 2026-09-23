# IMPLEMENTATION_BRIEF — VS-35：把 swarm 的逐 Agent 条目纳入 VS-20 的结构化状态契约

> 来源：R5 综合登记项——**`backend/app/orchestrator/swarm_orch.py:272-282` 的逐 Agent 条目未走 VS-20 的 `status` 结构化契约**（`research_orch` 已走）。

## 第一步（**先做，再改**）
**先核实现状**：读 `swarm_orch.py:272-282` 与其消费方，确认下面三点**哪些成立**，并在结果文件里给出**带行号的证据**：
1. swarm 的逐 Agent 条目**确实没有** VS-20 那套结构化 `status`（对照 `research_orch` 里 `agent_results[key].status` + `error`/`degraded_reasons` 的形状）；
2. 消费方（后端或前端）**是否**因为形状不同而**只能靠别的方式猜**状态（例如靠字符串、靠缺字段）；
3. **是否存在第二处真相来源**（同一件事既在结构化字段里、又在文案里各说一套）。
**若上述任一条不成立，请直接说明并给证据**——**本卡的验收对象是"状态是否可被结构化读取"，不是"是否动了代码"**。

## 理想行为（对确实成立的部分）
让 swarm 的逐 Agent 条目**与 VS-20 契约同形**，使得**同一套读取方式对两种编排都适用**；**不得**新增第二套并行的状态语义（若必须扩展，请明确说是扩展而非替代，并保持向后兼容）。

## 不能破坏
- **VS-20 的既有契约**（`research_orch` 侧的形状与语义）——**只做对齐，不要改它的含义**；
- **VS-12 的"局部失败不升级为整轮失败"语义**；**VS-30 的两处 `LLMError` 结构化字段**（`budget_exhausted`/`effective_budget_seconds`）；
- **VS-27 的整轮截止**（`research_orch`）——**本卡不动它**；
- 既有测试全绿；不加依赖、不改 schema、**不 commit**。

## 验收标准
1. **现状核实的三点结论 + 行号证据**（含"若不成立则说明"的出口）；
2. **形状对齐**：给出**同一读取方式**对 `research_orch` 与 `swarm_orch` 都适用的证据（例如同一段读取代码/同一断言对两者都成立）；
3. **零回归**：既有 swarm/research 相关测试全绿；
4. **鉴别力证明**：副本里退回对齐 ⇒ 至少一条新用例变红；
5. 门禁：**聚焦** pytest + `ruff check .`。

## ⚠️ 环境铁律
- **不要跑全量 pytest 或 `tests/test_api.py`——本机会挂**。只跑聚焦文件并前置 `$env:no_proxy='localhost,127.0.0.1,::1'`。
- **临时/变异文件一律放 `$env:TEMP`**，**绝不放仓库目录**；**不要把门禁输出写进仓库目录**；做变异/还原**先声明窗口**。
- **清理进程必须按"精确匹配自己的命令行"，绝不用排除法**；收尾核对 `Get-CimInstance Win32_Process -Filter "Name='python.exe'"`，**别误杀常驻 `http.server`**（`job_kill` 不杀子 python）。
- ⚠️ 另有 **VS-34（前端 `Chat.tsx`）** 在制：**不要触碰**，也不要把它计入你的门禁。