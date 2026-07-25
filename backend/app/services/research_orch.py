"""多 Agent 并行研究编排器。

四个投研 Agent（商业模式/财务/行业/风控）同时并行研究，各配备工具调用能力。
使用 LLMClient.chat_with_tools 实现 function_calling。
产出结构化投资备忘录，通过 SSE 事件流推送进度。
"""
import json
from collections.abc import AsyncIterator

from .. import config
from ..agent.tools import ToolRegistry
from ..prompts.research_roles import RESEARCH_ROLES, ROLE_MAP
from ..prompts.research_memo_prompt import get_memo_sections
from ..services.llm_client import LLMClient, LLMError


async def _call_agent(
    client: LLMClient,
    role: dict,
    ticker: str,
    company_name: str,
    tool_registry: ToolRegistry,
) -> tuple[str, list[dict]]:
    """单个 Agent 完成研究，返回 (全文, 工具调用记录)。"""
    system = role["system_prompt"]
    user_msg = (
        f"请对标的 {ticker}（{company_name}）进行你的专业分析。\n"
        f"使用可用工具获取实时数据，然后输出分析结论。"
    )

    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": user_msg},
    ]

    tools = tool_registry.to_openai_tools()
    tool_calls_log = []

    # 最多 5 轮 tool_use 循环
    for _round in range(5):
        content, tool_calls, _ = await client.chat_with_tools(messages, tools)

        if not tool_calls:
            # Agent 给出最终回答
            return content, tool_calls_log

        # 执行工具调用
        for tc in tool_calls:
            func = tc["function"]
            tool = tool_registry.get(func["name"])
            if tool is None:
                result_text = f"错误：工具 {func['name']} 不存在"
            else:
                try:
                    args = json.loads(func["arguments"])
                    result = await tool.run(**args)
                    result_text = json.dumps({"success": result.success, "data": result.data, "error": result.error},
                                              ensure_ascii=False)
                except Exception as e:
                    result_text = f"工具执行异常：{e}"

            tool_calls_log.append({"name": func["name"], "arguments": func["arguments"], "result": result_text})
            messages.append({
                "role": "assistant",
                "content": None,
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
) -> AsyncIterator[tuple[str, dict]]:
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

    try:
        client, _ = await model_router.get_client(model_id)
    except LLMError as e:
        yield "error", {"message": str(e)}
        return

    registry = ToolRegistry()
    agent_results = {}
    sections = get_memo_sections()
    total_sections = len(sections)

    import asyncio

    async def run_one(role: dict) -> tuple[str, dict, str, list[dict]]:
        yield_event("agent_started", {
            "role_key": role["role_key"],
            "name": role["name"],
            "avatar": role.get("avatar", ""),
        })
        try:
            content, tool_log = await _call_agent(client, role, ticker, company_name, registry)
            for tl in tool_log:
                yield_event("tool_call", {
                    "role_key": role["role_key"],
                    "tool_name": tl["name"],
                    "arguments": tl["arguments"],
                })
            yield_event("agent_completed", {
                "role_key": role["role_key"],
                "name": role["name"],
                "length": len(content),
            })
            return role["role_key"], content, role["name"], tool_log
        except LLMError as e:
            yield_event("error", {"role_key": role["role_key"], "message": str(e)})
            return role["role_key"], f"【分析失败】{e}", role["name"], []

    # 使用队列实现 SSE 事件与并行执行解耦
    event_queue: asyncio.Queue = asyncio.Queue()

    def yield_event(evt: str, data: dict):
        event_queue.put_nowait((evt, data))

    async def worker(role: dict):
        result = await run_one(role)
        event_queue.put_nowait(("_result", result))

    tasks = [asyncio.create_task(worker(r)) for r in RESEARCH_ROLES]
    processed = 0

    # 消费事件队列，直到所有 task 完成
    while processed < len(RESEARCH_ROLES):
        evt, data = await event_queue.get()
        if evt == "_result":
            role_key, content, name, tool_log = data
            agent_results[role_key] = {"content": content, "name": name, "tool_log": tool_log}
            processed += 1
        else:
            yield evt, data

    await asyncio.gather(*tasks, return_exceptions=True)

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
        "agent_results": {k: {"name": v["name"], "content": v["content"]} for k, v in agent_results.items()},
    }


def _build_report(ticker: str, company_name: str, agent_results: dict) -> dict:
    """将四个 Agent 的分析结果组装为结构化报告 dict。"""
    from datetime import datetime

    ba = agent_results.get("business_analyst", {}).get("content", "")
    fa = agent_results.get("financial_analyst", {}).get("content", "")
    ir = agent_results.get("industry_researcher", {}).get("content", "")
    ra = agent_results.get("risk_assessor", {}).get("content", "")

    now = datetime.now().strftime("%Y-%m-%d %H:%M")

    return {
        "ticker": ticker,
        "company_name": company_name or ticker,
        "timestamp": now,
        "executive_summary": ba[:300] + "……",
        "business_model_analysis": ba,
        "financial_analysis": fa,
        "industry_analysis": ir,
        "risk_analysis": ra,
        "technical_analysis": "（技术分析请参考 signals + scoring 模块的量化结果）",
        "verdict": "综合评级待汇总",
        "raw_agents": {
            "business_analyst": ba,
            "financial_analyst": fa,
            "industry_researcher": ir,
            "risk_assessor": ra,
        },
    }
