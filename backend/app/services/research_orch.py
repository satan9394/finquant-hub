"""多 Agent 并行研究编排器。

四个投研 Agent（商业模式/财务/行业/风控）同时并行研究，各配备工具调用能力。
使用 LLMClient.chat_with_tools 实现 function_calling。
产出结构化投资备忘录，通过 SSE 事件流推送进度。
"""
import asyncio
import json
from collections.abc import AsyncIterator
from concurrent.futures import ThreadPoolExecutor
from typing import Any, TypeAlias

from ..agent.tools import BaseTool, ToolRegistry, ToolResult
from ..orchestrator import DAGContext, DAGNode, DAGRuntime
from ..prompts.research_roles import REPORT_LEAD_ROLE, RESEARCH_ROLES
from ..prompts.research_memo_prompt import get_memo_sections
from ..services.llm_client import LLMClient, LLMError
from ..services.memory import native_memory_provider
from ..services.memory_rollout import finalize_memory_rollout, prepare_memory_rollout
from ..services.report_builder import build_unified_report, parse_lead_review

_TOOL_EXECUTOR = ThreadPoolExecutor(max_workers=4, thread_name_prefix="research-tool")
JSONDict: TypeAlias = dict[str, Any]

# VS7 P1b: 工具异常被吞成文本回给模型，编排层只能靠这个统一前缀识别"该工具没真正跑成"。
# 与 llm_client.chat_with_tools_loop 中同名前缀保持一致（同语义、同文案）。
_TOOL_ERROR_PREFIX = "工具执行异常："


def _is_tool_failure(result_text: Any) -> bool:
    """工具执行异常的唯一可识别信号（异常被吞成文本，见 _TOOL_ERROR_PREFIX）。"""
    return isinstance(result_text, str) and result_text.startswith(_TOOL_ERROR_PREFIX)


def _run_tool_in_thread(tool: BaseTool, arguments: JSONDict, user_id: int | None) -> ToolResult:
    """在线程独立事件循环中执行异步工具。

    ThreadPoolExecutor 的 worker 不继承调用方协程的 ContextVar（Astra A5 P2：
    线程内 current_user_id() 变 None，新闻工具走空凭据分支）。因此显式把当前
    用户写进线程本地上下文，让工具内的 current_user_id() 能取到本人身份，
    同时保持"绝不读取他人凭据"的隔离边界（只传本人 user_id）。
    """
    from ..services.auth import reset_current_user, set_current_user

    token = set_current_user({"id": user_id}) if user_id is not None else None
    try:
        return asyncio.run(tool.run(**arguments))
    finally:
        if token is not None:
            reset_current_user(token)


async def _execute_tool_call(
    tool_call: JSONDict,
    tool_registry: ToolRegistry,
    allowed_tools: set[str] | None = None,
    *,
    user_id: int | None = None,
) -> str:
    """执行单个工具调用并统一序列化结果，不让异常中断同轮其他工具。

    经 ToolRegistry.dispatch 执行（类型驱动前置校验，Astra A5：研究路径此前
    直接 tool.run() 绕过参数类型校验），并把 user_id 传入线程以恢复用户上下文。
    """
    func = tool_call["function"]
    if allowed_tools is not None and func["name"] not in allowed_tools:
        return f"错误：工具 {func['name']} 未授权给当前 Agent"
    tool = tool_registry.get(func["name"])
    if tool is None:
        return f"错误：工具 {func['name']} 不存在"

    try:
        arguments = json.loads(func["arguments"])
        if not isinstance(arguments, dict):
            raise ValueError("工具参数必须是 JSON 对象")
        # 类型驱动前置校验（与 ToolRegistry.dispatch 相同的 JSON Schema 语义）。
        # 修复前研究路径直接 tool.run() 绕过此校验（Astra A5 P2：声明为 integer
        # 的参数传入字符串仍执行成功）。
        from ..agent.tools import validate_tool_arguments

        validation_error = validate_tool_arguments(tool.name, tool.parameters, arguments)
        if validation_error is not None:
            return json.dumps(
                {"success": False, "data": None, "error": validation_error},
                ensure_ascii=False,
            )
        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(
            _TOOL_EXECUTOR, _run_tool_in_thread, tool, arguments, user_id,
        )
        return json.dumps(
            {"success": result.success, "data": result.data, "error": result.error},
            ensure_ascii=False,
        )
    except Exception as exc:
        return f"{_TOOL_ERROR_PREFIX}{exc}"


async def _call_agent(
    client: LLMClient,
    role: JSONDict,
    ticker: str,
    company_name: str,
    tool_registry: ToolRegistry,
    *,
    user_id: int | None = None,
    allowed_tools: set[str] | None = None,
    prior_context: str = "",
    memory_context: str = "",
    degraded_reasons: list[str] | None = None,
) -> tuple[str, list[JSONDict]]:
    """单个 Agent 完成研究，返回 (全文, 工具调用记录)。

    degraded_reasons 非 None 时，本函数把"内容实际不完整"的信号（工具执行异常、
    工具循环耗尽）追加进去，供 run_research 汇总为 quality=degraded（VS7 P1b）。
    """
    system = role["system_prompt"]
    user_msg = (
        f"请对标的 {ticker}（{company_name}）进行你的专业分析。\n"
        f"使用可用工具获取实时数据，然后输出分析结论。"
    )
    if memory_context:
        user_msg += (
            "\n\n以下是检索到的历史研究记忆：\n"
            f"{memory_context}\n"
            "不要逐字重复历史结论；优先核验数据和环境是否已变化，并明确指出本次新增、延续或推翻的判断。"
        )
    if prior_context:
        user_msg += f"\n\n以下是前序专家的分析，仅用于交叉验证：\n{prior_context}"

    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": user_msg},
    ]

    tools = [
        tool.to_openai_tool()
        for tool in tool_registry.list_all()
        if allowed_tools is None or tool.name in allowed_tools
    ]
    tool_calls_log: list[JSONDict] = []

    # 最多 5 轮 tool_use 循环
    for _round in range(5):
        content, tool_calls, _ = await client.chat_with_tools_safe(messages, tools)

        if not tool_calls:
            # Agent 给出最终回答
            return content, tool_calls_log

        # ponytail: 同轮调用直接并发，gather 保留输入顺序，无需额外调度层。
        result_texts = await asyncio.gather(*(
            _execute_tool_call(tool_call, tool_registry, allowed_tools, user_id=user_id)
            for tool_call in tool_calls
        ))
        # VS7 P1b: 工具执行异常此前只留痕在文本里，报告仍被标 audited。
        if degraded_reasons is not None and any(_is_tool_failure(text) for text in result_texts):
            degraded_reasons.append("tool_failed")
        for tc, result_text in zip(tool_calls, result_texts, strict=True):
            func = tc["function"]
            tool_calls_log.append({"name": func["name"], "arguments": func["arguments"], "result": result_text})
            messages.append({
                "role": "assistant",
                "content": None,
                **({"reasoning_content": tc["reasoning_content"]} if tc.get("reasoning_content") else {}),
                "tool_calls": [{"id": tc["id"], "type": "function",
                                "function": {"name": func["name"], "arguments": func["arguments"]}}],
            })
            messages.append({"role": "tool", "tool_call_id": tc["id"], "content": result_text})

    # 超出 tool_use 轮数，强制要求最终回答
    # VS7 P1b: 工具循环耗尽（llm_client 的 tool_loop_exhausted 同语义）——模型是在
    # "数据没抓全"的情况下被强制下结论的，报告必须诚实标降级。
    if degraded_reasons is not None:
        degraded_reasons.append("tool_loop_exhausted")
    content, _, _ = await client.chat_with_tools(
        messages + [{"role": "user", "content": "请基于已有数据输出最终分析结论。"}],
        tools,
    )
    return content, tool_calls_log


async def run_research(
    ticker: str,
    company_name: str = "",
    model_id: int | None = None,
    *,
    user_id: int,
) -> AsyncIterator[tuple[str, JSONDict]]:
    """并行执行四个 Agent 的研究，通过 yield (event, data) 推送 SSE 事件流。

    事件类型：
    - agent_started: 某 Agent 开始
    - tool_call: 某 Agent 调用工具
    - agent_completed: 某 Agent 完成
    - report_progress: 报告生成进度
    - done: 全部完成
    - error: 出错
    """
    from ..services import model_router

    memory_hits = await native_memory_provider.search(f"{ticker} {company_name}", user_id=user_id, limit=4)
    memory_context = native_memory_provider.render_context(memory_hits)
    rollout = await prepare_memory_rollout(
        f"{ticker} {company_name}",
        user_id=user_id,
        surface="research",
        native_candidate_count=len(memory_hits),
        subject_type="instrument",
        subject_id=ticker,
    )
    if rollout.context:
        memory_context = "\n\n".join(part for part in (memory_context, rollout.context) if part)

    try:
        client, _ = await model_router.get_client(model_id, user_id=user_id)
    except LLMError as e:
        await finalize_memory_rollout(rollout, response=None, outcome="upstream_error")
        yield "error", {"error": str(e)}
        return

    registry = ToolRegistry()
    agent_results: dict[str, JSONDict] = {}
    sections = get_memo_sections()
    total_sections = len(sections)
    # BACKLOG-G-03: 任一 agent / 主编环节失败时，报告必须诚实标记降级，
    # 不得呈现为无条件"completed 成功报告"。
    degraded = False

    def make_node(role: JSONDict) -> DAGNode:
        async def run_agent(context: DAGContext) -> tuple[str, str, str, list[JSONDict]]:
            nonlocal degraded
            context.emit("agent_started", {
                "role_key": role["role_key"],
                "name": role["name"],
                "avatar": role.get("avatar", ""),
            })
            try:
                agent_reasons: list[str] = []
                content, tool_log = await _call_agent(
                    client,
                    role,
                    ticker,
                    company_name,
                    registry,
                    user_id=user_id,
                    memory_context=memory_context,
                    degraded_reasons=agent_reasons,
                )
            except LLMError as exc:
                # G-03: agent 的 LLMError 是"非致命降级"——返回降级文本让报告仍能完成，
                # 但必须标 degraded 并在前端提示"该环节失败、报告不完整"。
                # 注意用 agent_failed 而非 error：error 会被 router 视作致命失败（fail+break），
                # 报告将整体 failed 而非 degraded-completed——与 G-03 目标不符。
                degraded = True
                context.emit("agent_failed", {"role_key": role["role_key"], "error": str(exc)})
                return role["role_key"], f"【分析失败】{exc}", role["name"], []

            # VS7 P1b: 工具异常 / 工具循环耗尽 → 该 agent 的分析不完整，报告降级。
            if agent_reasons:
                degraded = True

            for tool_call in tool_log:
                context.emit("tool_call", {
                    "role_key": role["role_key"],
                    "tool_name": tool_call["name"],
                    "arguments": tool_call["arguments"],
                })
            context.emit("agent_completed", {
                "role_key": role["role_key"],
                "name": role["name"],
                "length": len(content),
            })
            return role["role_key"], content, role["name"], tool_log

        return DAGNode(key=role["role_key"], run=run_agent)

    roles_by_key = {role["role_key"]: role for role in RESEARCH_ROLES}
    runtime = DAGRuntime([make_node(role) for role in RESEARCH_ROLES])
    async for event in runtime.stream():
        if event.kind in {"agent_started", "tool_call", "agent_completed", "error", "agent_failed"}:
            yield event.kind, event.data
        elif event.kind == "node_completed":
            role_key, content, name, tool_log = event.result
            agent_results[role_key] = {"content": content, "name": name, "tool_log": tool_log}
        elif event.kind == "node_failed":
            role = roles_by_key[event.node_key]
            error = str(event.error)
            degraded = True
            yield "error", {"role_key": event.node_key, "error": f"研究 Agent 异常：{error}"}
            agent_results[event.node_key] = {
                "content": f"【分析失败】{error}",
                "name": role["name"],
                "tool_log": [],
            }

    lead_context = "\n\n".join(
        f"【{result['name']}】\n{result['content']}"
        for result in agent_results.values()
    )
    yield "agent_started", {
        "role_key": REPORT_LEAD_ROLE["role_key"],
        "name": REPORT_LEAD_ROLE["name"],
        "avatar": REPORT_LEAD_ROLE["avatar"],
    }
    lead_reasons: list[str] = []
    try:
        lead_content, lead_tool_log = await _call_agent(
            client,
            REPORT_LEAD_ROLE,
            ticker,
            company_name,
            registry,
            user_id=user_id,
            allowed_tools={"audit_report_data", "check_buffett_rules", "adversarial_review", "calculate_by_financial_rigor"},
            prior_context=lead_context,
            memory_context=memory_context,
            degraded_reasons=lead_reasons,
        )
    except LLMError as exc:
        lead_content, lead_tool_log = "", []
        degraded = True
        yield "agent_failed", {"role_key": "report_lead", "error": str(exc)}
    # VS7 P1a（修正）: 口径必须与 report_builder **逐字一致**。
    # report_builder.py:296,368 的判据是 `lead = parse_lead_review(lead_content)` 后
    # 的 **解析结果** 真值（"audited" if lead else "degraded"），而不是原始字符串非空：
    # lead 返回"非空但无法解析的散文"时 parse_lead_review 返回 {}，report_builder 判
    # degraded 而"仅判字符串非空"会判 audited —— 矛盾依旧。故此处复用同一解析函数。
    if lead_reasons or not parse_lead_review(lead_content):
        degraded = True
    for tool_call in lead_tool_log:
        yield "tool_call", {
            "role_key": "report_lead",
            "tool_name": tool_call["name"],
            "arguments": tool_call["arguments"],
        }
    agent_results["report_lead"] = {
        "content": lead_content,
        "name": REPORT_LEAD_ROLE["name"],
        "tool_log": lead_tool_log,
    }
    yield "agent_completed", {
        "role_key": "report_lead",
        "name": REPORT_LEAD_ROLE["name"],
        "length": len(lead_content),
    }

    # 生成结构化报告（模拟进度）
    yield "report_progress", {"section": 0, "total": total_sections, "name": "开始整合备忘录"}

    report_data = _build_report(ticker, company_name, agent_results)
    # VS7 P0: 质量标记的单一源头——并入 report_data 内部，随报告一起持久化。
    # 定时路径（scheduler）只落库 payload["report"]，交互路径（routers/research）
    # 额外读顶层 quality 再合并；放在源头后两条路径天然一致。
    quality = "degraded" if degraded else "audited"
    report_data["quality"] = quality
    for i, section in enumerate(sections, 1):
        yield "report_progress", {
            "section": i,
            "total": total_sections,
            "name": f"生成 {section}",
        }
        await asyncio.sleep(0.05)  # 让前端看到进度动画

    done_payload = {
        "ticker": ticker,
        "report": report_data,
        # G-03/VS7: 报告诚实质量标记——任一环节失败即为 degraded，正常为 audited。
        # 与 report_builder.lead_review_status 同语义（degraded 前端已有降级提示机制）。
        # 顶层保留以兼容既有 SSE 消费方与前端 resolveReportQuality。
        "quality": quality,
        # Tool logs retain the data-source trail (including news URLs) for
        # later report review instead of discarding research provenance.
        "agent_results": {
            k: {"name": v["name"], "content": v["content"], "tool_log": v["tool_log"]}
            for k, v in agent_results.items()
        },
    }
    await finalize_memory_rollout(rollout, response=report_data)
    yield "done", done_payload


def _build_report(ticker: str, company_name: str, agent_results: dict[str, JSONDict]) -> JSONDict:
    """Build the canonical report from researcher and team-lead outputs."""
    lead = agent_results.get("report_lead", {}).get("content", "")
    return build_unified_report(ticker, company_name, agent_results, lead_content=lead)
