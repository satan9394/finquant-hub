# EVALUATION_RESULT — VS-12 独立验收

> 验收人：EVALUATOR（独立于实现者），2026-09-13。**未改动任何实现文件**。
> 待验 commit：`d10f784`（工作区与 HEAD 一致）。卡：`IMPLEMENTATION_BRIEF_VS12.md`；报告：`IMPLEMENT_RESULT_VS12.md`。

## 判定：**ACCEPT**（3 条非阻断遗留，见第四节）

三项目标全部成立，且**反向风险经独立实证明排除**（不会把所有报告误判 degraded）。

---

## 一、目标①：单个 Agent 失败不再致命

- `research_orch.py:375-392` `node_failed` 分支：`:384` 为 `yield "agent_failed"`，`:378 degraded = True`，`:388-392` 写 `【分析失败】` 占位并保留在 `agent_results`。
- 全文 `yield "error"` 计数（自行 grep 复核，`backend/app` 全量）：**`research_orch.py` 内真实 `yield "error"` 仅 1 处 —— `:308`**，位于 `except LLMError`（`model_router.get_client` 失败）分支，`yield` 后立即 `return`，语义确为"拿不到 LLM client → 致命"。`:379` / `:383` 是本次新增的**注释文本**（grep 命中但不执行），非第二处 yield。
- 其余 `yield "error"` 出现在 `swarm_orch.py:185,192` 与 `discussion_orch.py:63`，属其它管线，本卡未触及。
- **未吞掉真致命**：三个消费方对 `error` 仍是 fail+break，对 `agent_failed` 一律直通：
  - `routers/research.py:265-273`（`_fail_report` + publish failed + `break`），`:296` 对其它事件名一律转发；
  - `routers/analysis.py:66-73`（同一模式，第三条 SSE 管线，**未被实现者报告提及，本次已独立确认**）；
  - `services/scheduler.py:164-171`（定时路径，同一模式）。
  三条路径均未出现 `agent_failed` 字样 → 说明"router 零改动即可非致命"成立，而非漏改。

## 二、目标②：5 种工具失败形态全部计入降级（含变异敏感性独立复核）

- `_is_tool_failure`（`:36-64`）：前缀哨兵 `工具执行异常：` 保留（`:52`）；`错误：工具 ` 文本前缀（`:54`，覆盖"不存在/未授权"）；`{` 开头 → `json.loads` 后看 `success`（`:56-63`）；解析失败按失败（`:59-61`）。
- **独立实测**（直接调用真函数，非采信实现者数字）：

  | 输入 | 新判据 | 旧前缀哨兵 |
  | --- | --- | --- |
  | 工具不存在（文本） | True | False |
  | 未授权（文本） | True | False |
  | 参数校验失败 `success:false` | True | False |
  | 工具跑了但失败 `success:false` | True | False |
  | 异常 `工具执行异常：…` | True | True |

  ⇒ 退回旧哨兵时**恰好前四种**判定丢失，与卡中形态表一致，**变异敏感成立**；且测试断言是 `assert "tool_failed" in reasons`（真降级断言，非"不崩"）`test_research_orch.py:664`，不是弱断言。

## 三、目标③：空内容 / finish_reason==length 判降级

- `_flag_incomplete_output`（`:170-179`）**确有生产调用点**，而非"定义了没人用"：`:233`（无工具调用的最终回答出口）与 `:266`（工具循环耗尽后的强制收敛出口），两处都传入了调用方 `degraded_reasons`（`:329-338` agents / `:405-416` lead）。
- `llm_client._finish_reason_of`（`:104-117`）实测：`{}`、`{'choices':[]}`、`{'choices':[None]}`、`{'choices':[{'finish_reason':None}]}`、非 dict 全部返回 `None`（不误报截断），仅 `{'choices':[{'finish_reason':'length'}]}` 返回 `'length'`。✅
- 公共契约未变：`chat_with_tools` / `chat_with_tools_safe` 的 `with_finish_reason` 为 keyword-only 且默认 `False`，`:294` / `:344` 仍返回 3 元组；`True` 时才多返回第 4 项。`backend/app` 内只有 `LLMClient` 定义这两个方法（无未同步签名的子类），`routers/chat.py:189` 走 `chat_with_tools_loop`（内部 `:391/:468` 已改读 4 元组）。

## 四、反向风险（重点质疑项）结论

1. **判据误伤成功结果 → 所有报告变 degraded？实测不会。**
   - `{"success": true, ...}`（生产成功形态）→ `False`；
   - **合法 JSON 但无 `success` 字段** → 落到 `:64 return False`（不误判）；
   - 非 JSON 普通文本 / 极短一句话文本 → `False`（"合理地只给一句话"不会被判降级，空内容判据是 `content.strip()` 为空，不涉及长度）。
   - 唯一理论误判：以 `{` 开头但 `json.loads` 失败的字符串（实测 True），以及 `{"success": 1}`（非 bool 真值，实测 True）。**在生产不可达**——`:242` 本轮唯一调用点，其输入全部来自 `_execute_tool_call`，出口只有"三种前缀文本"或 `json.dumps({...success: bool...})`，二者都不可能触发。故不构成阻断。
2. **`_unpack_tool_response` 是否静默吞错？** 不会静默：4 元组正常取 `finish_reason`；3 元组视作"未知"（`None`，不误报截断，有 `test_three_tuple_return_is_still_supported` 覆盖）；**5 元组实测抛 `ValueError: too many values to unpack (expected 3)`**，是可见失败而非静默错位。`_request_tool_round` 刻意不做 `except TypeError` 兜底（`:162-164` 注释），不会吞掉客户端内部真实 TypeError。
3. **前端与 `routers/research.py` 零改动**：`git show --stat d10f784` 为 7 个文件——`backend/app/services/{llm_client,research_orch}.py`、4 个 `backend/tests/*`、本结果文档。**无 `frontend/`、无 `routers/`**。✅

## 五、门禁实测（自跑，非采信报告）

```
pytest tests/test_research_orch.py tests/test_research_jobs.py tests/test_llm_client.py
       tests/test_chat_tools.py tests/test_memory.py -q --no-cov -p no:cacheprovider
=> 89 passed in 24.08s      (未跑 test_api.py / 全量)
```
（实现者报告的门禁为 3 文件 81 passed；本次按 Evaluator 卡多含 2 个替身被改动的文件，全绿。）

## 六、非阻断遗留（建议下轮处理，不影响本卡验收）

- **F1（用户体验，本卡范围内但卡明确要求前端零改动）**：`frontend/src/pages/Research.tsx` 的 SSE switch（`:286-336`）只处理 `report_started / agent_started / agent_completed / report_progress / done / error`，**没有 `agent_failed` 分支**。改后 agent 崩溃不再发 `error`，该 Agent 卡片会停在 `running`（因为同时也没有 `agent_completed`），而改造前 `case 'error'`（`:329-333`）会把该卡片置 `failed` 并显示原因。报告级可见性仍在（`done` 走 `resolveReportQuality` `:317` 显示 degraded，正文含 `【分析失败】`）。**同一缺口自 VS-1 起已存在于 LLMError 路径**（`research_orch.py:345`），非 VS-12 新引入的判定错误；建议后续给 Research.tsx 补一个 `case 'agent_failed'`（照 `:332` 写法），swarm 页已有该分支（`features/swarm/state.ts:101`）。
- **F2**：对话路径 `llm_client.chat_with_tools_loop` 拿到 `finish_reason` 但未消费（`:391/:468`），`routers/chat.py:189` 的截断仍不可见——实现者已在结果文件第四节明确声明"未做 + 原因 + 无回归"，符合卡的要求，记为已知边界。
- **F3**：`_is_tool_failure` 的 `success is not True` 用恒等比较，若未来某工具返回 `success: 1`/`"true"` 之类非 bool 真值会被判失败（当前所有工具经 `ToolResult` 产出 bool，不可达）。建议将来改为 `not payload.get("success")` 语义或收紧为 `is False` 前先确认真值类型来源。

## 七、验收标准逐条裁定

| # | 标准 | 裁定 | 依据 |
| --- | --- | --- | --- |
| 1 | 非 LLMError 异常 → 无 `error`、有 `done`、degraded、其余 Agent 成果保留 | ✅ | `:375-392`；`test_..._is_non_fatal_and_keeps_other_agents`（`test_research_orch.py:206-217` 断言无 error 事件、`agent_failed` 精确载荷、quality=degraded、financial/industry 文本仍在） |
| 2 | 5 形态均降级 + 变异敏感 | ✅ | 参数化 5 条（`:615-667`）+ 本次独立判据实测表 |
| 3 | 空内容 → degraded | ✅ | `:176-177`；`test_empty_agent_content_marks_degraded`（`reasons == ["empty_content"]`） |
| 4 | length → degraded（已实现） | ✅ | `:178-179`；`TruncatedClient` 4 元组用例；`_finish_reason_of` 实测 |
| 5 | 致命路径不回归 | ✅ | `:308` 唯一真 `yield "error"`；`test_missing_llm_client_is_still_fatal`（事件流 `["error"]`） |
| 6 | 正常路径 audited / 13 章 | ✅ | 89 passed 含既有零回归用例 |
| 7 | 门禁 | ✅ | 89 passed（多跑 2 文件）；`ruff` 由实现者报告，本次未复跑（沙箱限额） |

**结论：ACCEPT。** 实现与卡一致，变异敏感、致命语义保留、零改动面经 git 核实；F1 建议作为独立小卡跟进（前端 `agent_failed` 分支）。
