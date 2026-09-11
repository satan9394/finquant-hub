# BACKLOG-049 — 工具失败的降级判定覆盖不全（研究路径）

**来源**：R2 可靠性审计（D2）+ VS-7 独立 Evaluator 的非阻断观察（`docs/ai/evo/EVALUATION_RESULT_VS7.md`）。编排者已核实代码事实。

**优先级**：P2（诚实性口径缺口，非功能中断）

## 问题
VS-7 让 `research_orch._is_tool_failure()` 用统一前缀 `_TOOL_ERROR_PREFIX = "工具执行异常："` 识别工具失败并置 `degraded`。但 `_execute_tool_call` 实际有 **5 种返回形态，只有 1 种能被识别**：

| 位置（`backend/app/services/research_orch.py`） | 返回 | 现是否计入 degraded |
| --- | --- | --- |
| `:65`（约） | `f"错误：工具 {name} 未授权给当前 Agent"` | ❌ |
| `:67`（约） | `f"错误：工具 {name} 不存在"`（模型幻觉工具名） | ❌ |
| 参数校验失败分支 | `{"success": false, "data": null, "error": ...}` | ❌ |
| 工具执行完成但失败 | `{"success": result.success(false), ...}` | ❌ |
| `except Exception` | `f"{_TOOL_ERROR_PREFIX}{exc}"` | ✅ 唯一 |

**后果**：当 agent 因为"工具不存在/未授权/工具内部失败"而拿不到数据时，报告仍标 `quality='audited'`——与 VS-7 卡面"涵盖真正失败类型"仍有一段距离。用户看到的是一份没有降级提示、但实际数据不全的报告。

**注意**：成功结果同样以 `{` 开头，故**不能**简单用"以 `{` 开头"判定失败（会误判）；必须解析 JSON 后看 `success` 字段。

## 建议方向
1. 让 `_execute_tool_call` 在**所有失败形态**上统一可识别（例如统一返回带 `success:false` 的结构化结果，或把"错误：…"两种也纳入前缀/哨兵判定）；
2. `_is_tool_failure` 改为：前缀命中 **或** 解析出 `{"success": false}`；
3. 补变异敏感测试覆盖 5 种形态；
4. 顺带考虑 `swarm_orch.py:219` 调用 `_call_agent` 未接 `degraded_reasons`（swarm 报告同样看不到工具失败；签名兼容、无回归）。

## 不做什么
不改动 `tool_loop` 的既有事件语义；不引入新依赖；不改前端（`resolveReportQuality` 已兼容）。
