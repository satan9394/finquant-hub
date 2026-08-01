"""四大师团队的 YAML 驱动 DAG 编排。"""

import json
import logging
from collections.abc import AsyncIterator
from functools import lru_cache
from pathlib import Path
from typing import Any, TypeAlias

from ..agent.tools import ToolRegistry
from ..orchestrator import DAGContext, TeamAgent, TeamDefinition, build_team_runtime, load_team
from ..orchestrator.runtime import NodeRunner
from .context import estimate_tokens
from .llm_client import LLMError
from .instruments import InstrumentService
from .market_data import MarketDataService
from .research_orch import _call_agent
from .report_builder import build_unified_report

_TEAMS_PATH = Path(__file__).resolve().parent.parent / "orchestrator" / "teams"
_FOUR_MASTERS_PATH = _TEAMS_PATH / "four_masters.yaml"
_EARNINGS_REVIEW_PATH = _TEAMS_PATH / "earnings_review.yaml"
JSONDict: TypeAlias = dict[str, Any]
logger = logging.getLogger(__name__)


@lru_cache(maxsize=1)
def get_four_masters_team() -> TeamDefinition:
    """加载内置四大师团队；定义文件变化后重启进程即可刷新。"""
    return load_team(_FOUR_MASTERS_PATH)


@lru_cache(maxsize=1)
def get_earnings_review_team() -> TeamDefinition:
    """加载六 Agent 财报精读团队。"""
    return load_team(_EARNINGS_REVIEW_PATH)


def public_team_definition(team: TeamDefinition | None = None) -> JSONDict:
    """返回前端可展示的团队元数据，不暴露完整 system prompt。"""
    selected = team or get_four_masters_team()
    return {
        "key": selected.key,
        "name": selected.name,
        "description": selected.description,
        "agents": [
            {
                "key": agent.key,
                "name": agent.name,
                "avatar": agent.avatar,
                "dependencies": list(agent.dependencies),
                "tools": list(agent.tools),
            }
            for agent in selected.agents
        ],
    }


def build_four_masters_report(ticker: str, company_name: str, result: JSONDict) -> JSONDict:
    """把 Swarm 终态组装为兼容现有报告查看/导出的结构化报告。"""
    agent_results = result.get("agent_results")
    if not isinstance(agent_results, dict):
        agent_results = {}

    def content(role_key: str) -> str:
        role_result = agent_results.get(role_key)
        if not isinstance(role_result, dict):
            return ""
        value = role_result.get("content")
        return value if isinstance(value, str) else ""

    value_analysis = content("value_investor")
    technical_analysis = content("tech_analyst")
    macro_analysis = content("macro_strategist")
    report = build_unified_report(
        ticker,
        company_name,
        agent_results,
        report_type="four_masters_swarm",
        lead_content=content("report_lead"),
        status=str(result.get("status", "completed")),
        fundamentals=result.get("fundamentals") if isinstance(result.get("fundamentals"), dict) else None,
    )
    return {
        **report,
        "value_analysis": value_analysis,
        "technical_analysis": technical_analysis,
        "macro_analysis": macro_analysis,
        "token_count": result.get("token_count", 0),
        "failed_agents": result.get("failed_agents", []),
        "skipped_agents": result.get("skipped_agents", []),
    }


def build_earnings_review_report(ticker: str, company_name: str, result: JSONDict) -> JSONDict:
    """把六 Agent 结果映射为现有研究报告的可持久化结构。"""
    agent_results = result.get("agent_results")
    if not isinstance(agent_results, dict):
        agent_results = {}

    def content(role_key: str) -> str:
        role_result = agent_results.get(role_key)
        if not isinstance(role_result, dict):
            return ""
        value = role_result.get("content")
        return value if isinstance(value, str) else ""

    editor = content("earnings_editor")
    report = build_unified_report(
        ticker,
        company_name,
        agent_results,
        report_type="earnings_review_team",
        lead_content=editor,
        status=str(result.get("status", "completed")),
        fundamentals=result.get("fundamentals") if isinstance(result.get("fundamentals"), dict) else None,
    )
    return {
        **report,
        "value_analysis": content("financial_analyst"),
        "editorial_review": editor,
        "reader_review": content("reader_reviewer"),
        "token_count": result.get("token_count", 0),
        "failed_agents": result.get("failed_agents", []),
        "skipped_agents": result.get("skipped_agents", []),
    }


def _prior_context(agent: TeamAgent, context: DAGContext, fundamentals_context: str = "") -> str:
    sections = [fundamentals_context] if fundamentals_context else []
    for dependency in agent.dependencies:
        result = context.results[dependency]
        sections.append(f"【{result['name']}】\n{result['content']}")
    return "\n\n".join(sections)


async def _load_fundamentals(ticker: str) -> JSONDict:
    """Load one auditable fundamentals snapshot without breaking the team run."""
    market = MarketDataService()
    try:
        return await InstrumentService(market).fundamentals(ticker)
    except Exception as exc:
        logger.exception("swarm_fundamentals_load_failed", extra={"ticker": ticker})
        return {
            "items": [],
            "provider": "unavailable",
            "as_of": None,
            "quality_flags": ["fundamentals_unavailable"],
            "error": str(exc),
        }
    finally:
        await market.aclose()


def _fundamentals_context(payload: JSONDict) -> str:
    evidence = {
        "provider": payload.get("provider"),
        "as_of": payload.get("as_of"),
        "quality_flags": payload.get("quality_flags", []),
        "items": payload.get("items", []),
    }
    return (
        "【基本面事实（原始数据，必须保留来源和日期，不得补造缺失字段）】\n"
        + json.dumps(evidence, ensure_ascii=False, separators=(",", ":"))
    )


async def _run_team(
    team: TeamDefinition,
    ticker: str,
    company_name: str = "",
    model_id: int | None = None,
) -> AsyncIterator[tuple[str, JSONDict]]:
    """运行任意已校验 YAML 团队并产出适合 SSE 转发的事件。"""
    from . import model_router

    registry = ToolRegistry()
    available_tools = {tool.name for tool in registry.list_all()}
    requested_tools = {tool for agent in team.agents for tool in agent.tools}
    missing_tools = sorted(requested_tools - available_tools)
    if missing_tools:
        message = f"团队引用了未注册工具：{', '.join(missing_tools)}"
        yield "error", {"error": message, "message": message}
        return

    try:
        client, model = await model_router.get_client(model_id)
    except LLMError as exc:
        message = str(exc)
        yield "error", {"error": message, "message": message}
        return

    metadata = public_team_definition(team)
    yield "team_started", {
        "team": metadata,
        "ticker": ticker,
        "company_name": company_name or ticker,
        "model": {"id": model.get("id"), "name": model.get("name")},
    }
    fundamentals = await _load_fundamentals(ticker)
    fundamentals_context = _fundamentals_context(fundamentals)

    def runner_factory(agent: TeamAgent) -> NodeRunner:
        async def run_agent(context: DAGContext) -> JSONDict:
            context.emit("agent_started", {
                "role_key": agent.key,
                "name": agent.name,
                "avatar": agent.avatar,
                "dependencies": list(agent.dependencies),
            })
            role = {
                "role_key": agent.key,
                "name": agent.name,
                "avatar": agent.avatar,
                "system_prompt": agent.system_prompt,
            }
            content, tool_log = await _call_agent(
                client,
                role,
                ticker,
                company_name,
                registry,
                allowed_tools=set(agent.tools),
                prior_context=_prior_context(agent, context, fundamentals_context),
            )
            for tool_call in tool_log:
                context.emit("tool_call", {
                    "role_key": agent.key,
                    "tool_name": tool_call["name"],
                    "arguments": tool_call["arguments"],
                })
            token_count = estimate_tokens(content)
            context.emit("agent_completed", {
                "role_key": agent.key,
                "name": agent.name,
                "length": len(content),
                "token_count": token_count,
            })
            return {
                "role_key": agent.key,
                "name": agent.name,
                "avatar": agent.avatar,
                "content": content,
                "tool_log": tool_log,
                "token_count": token_count,
            }

        return run_agent

    runtime = build_team_runtime(team, runner_factory)
    failed_agents: list[str] = []
    skipped_agents: list[str] = []
    async for event in runtime.stream():
        if event.kind in {"agent_started", "tool_call", "agent_completed"}:
            yield event.kind, event.data
        elif event.kind == "node_failed":
            failed_agents.append(event.node_key)
            yield "agent_failed", {
                "role_key": event.node_key,
                "error": str(event.error),
            }
        elif event.kind == "node_skipped":
            skipped_agents.append(event.node_key)
            yield "agent_skipped", {
                "role_key": event.node_key,
                **event.data,
            }

    ordered_results = {
        agent.key: runtime.results[agent.key]
        for agent in team.agents
        if agent.key in runtime.results
    }
    yield "done", {
        "team": metadata,
        "ticker": ticker,
        "company_name": company_name or ticker,
        "status": "completed" if len(ordered_results) == len(team.agents) else "partial",
        "agent_results": ordered_results,
        "failed_agents": failed_agents,
        "skipped_agents": skipped_agents,
        "token_count": sum(result["token_count"] for result in ordered_results.values()),
        "fundamentals": fundamentals,
    }


async def run_four_masters(
    ticker: str,
    company_name: str = "",
    model_id: int | None = None,
) -> AsyncIterator[tuple[str, JSONDict]]:
    async for event in _run_team(get_four_masters_team(), ticker, company_name, model_id):
        yield event


async def run_earnings_review(
    ticker: str,
    company_name: str = "",
    model_id: int | None = None,
) -> AsyncIterator[tuple[str, JSONDict]]:
    async for event in _run_team(get_earnings_review_team(), ticker, company_name, model_id):
        yield event
