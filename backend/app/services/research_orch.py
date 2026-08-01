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
from ..services.memory import render_memory_context, search_cross_session_memory
from ..services.report_builder import build_unified_report

_TOOL_EXECUTOR = ThreadPoolExecutor(max_workers=4, thread_name_prefix="research-tool")
JSONDict: TypeAlias = dict[str, Any]


def _run_tool_in_thread(tool: BaseTool, arguments: JSONDict) -> ToolResult:
    """在线程独立事件循环中执行异步工具。"""
    return asyncio.run(tool.run(**arguments))


async def _execute_tool_call(
    tool_call: JSONDict,
    tool_registry: ToolRegistry,
    allowed_tools: set[str] | None = None,
) -> str:
    """执行单个工具调用并统一序列化结果，不让异常中断同轮其他工具。"""
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
        loop = asyncio.get_running_loop()
        result = await loop.run_in_executor(_TOOL_EXECUTOR, _run_tool_in_thread, tool, arguments)
        return json.dumps(
            {"success": result.success, "data": result.data, "error": result.error},
            ensure_ascii=False,
        )
    except Exception as exc:
        return f"工具执行异常：{exc}"


async def _call_agent(
    client: LLMClient,
    role: JSONDict,
    ticker: str,
    company_name: str,
    tool_registry: ToolRegistry,
    *,
    allowed_tools: set[str] | None = None,
    prior_context: str = "",
    memory_context: str = "",
) -> tuple[str, list[JSONDict]]:
    """单个 Agent 完成研究，返回 (全文, 工具调用记录)。"""
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
            _execute_tool_call(tool_call, tool_registry, allowed_tools) for tool_call in tool_calls
        ))
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
    content, _, _ = await client.chat_with_tools(
        messages + [{"role": "user", "content": "请基于已有数据输出最终分析结论。"}],
        tools,
    )
    return content, tool_calls_log


async def run_research(
    ticker: str,
    company_name: str = "",
    model_id: int | None = None,
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

    memory_hits = await search_cross_session_memory(f"{ticker} {company_name}", limit=4)
    memory_context = render_memory_context(memory_hits)

    try:
        client, _ = await model_router.get_client(model_id)
    except LLMError as e:
        yield "error", {"error": str(e)}
        return

    registry = ToolRegistry()
    agent_results: dict[str, JSONDict] = {}
    sections = get_memo_sections()
    total_sections = len(sections)

    def make_node(role: JSONDict) -> DAGNode:
        async def run_agent(context: DAGContext) -> tuple[str, str, str, list[JSONDict]]:
            context.emit("agent_started", {
                "role_key": role["role_key"],
                "name": role["name"],
                "avatar": role.get("avatar", ""),
            })
            try:
                content, tool_log = await _call_agent(
                    client,
                    role,
                    ticker,
                    company_name,
                    registry,
                    memory_context=memory_context,
                )
            except LLMError as exc:
                context.emit("error", {"role_key": role["role_key"], "error": str(exc)})
                return role["role_key"], f"【分析失败】{exc}", role["name"], []

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
        if event.kind in {"agent_started", "tool_call", "agent_completed", "error"}:
            yield event.kind, event.data
        elif event.kind == "node_completed":
            role_key, content, name, tool_log = event.result
            agent_results[role_key] = {"content": content, "name": name, "tool_log": tool_log}
        elif event.kind == "node_failed":
            role = roles_by_key[event.node_key]
            error = str(event.error)
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
    try:
        lead_content, lead_tool_log = await _call_agent(
            client,
            REPORT_LEAD_ROLE,
            ticker,
            company_name,
            registry,
            allowed_tools={"audit_report_data", "check_buffett_rules", "adversarial_review", "calculate_by_financial_rigor"},
            prior_context=lead_context,
            memory_context=memory_context,
        )
    except LLMError as exc:
        lead_content, lead_tool_log = "", []
        yield "agent_failed", {"role_key": "report_lead", "error": str(exc)}
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
    for i, section in enumerate(sections, 1):
        yield "report_progress", {
            "section": i,
            "total": total_sections,
            "name": f"生成 {section}",
        }
        await asyncio.sleep(0.05)  # 让前端看到进度动画

    yield "done", {
        "ticker": ticker,
        "report": report_data,
        # Tool logs retain the data-source trail (including news URLs) for
        # later report review instead of discarding research provenance.
        "agent_results": {
            k: {"name": v["name"], "content": v["content"], "tool_log": v["tool_log"]}
            for k, v in agent_results.items()
        },
    }


def _build_report(ticker: str, company_name: str, agent_results: dict[str, JSONDict]) -> JSONDict:
    """Build the canonical report from researcher and team-lead outputs."""
    lead = agent_results.get("report_lead", {}).get("content", "")
    return build_unified_report(ticker, company_name, agent_results, lead_content=lead)
