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
from .research_orch import (
    AGENT_STATUS_COMPLETED,
    AGENT_STATUS_DEGRADED,
    AGENT_STATUS_FAILED,
    _agent_result,
    _call_agent,
)
from .report_builder import build_unified_report

_TEAMS_PATH = Path(__file__).resolve().parent.parent / "orchestrator" / "teams"
_FOUR_MASTERS_PATH = _TEAMS_PATH / "four_masters.yaml"
_EARNINGS_REVIEW_PATH = _TEAMS_PATH / "earnings_review.yaml"
JSONDict: TypeAlias = dict[str, Any]
logger = logging.getLogger(__name__)

# VS35: 逐 Agent 条目的结构化状态——**直接复用 VS-20 的词表与条目构造器**
# （`research_orch._agent_result`），不另立第二套并行语义：
#   completed / degraded / failed 三个值的含义、字段名与 `research_orch` 逐字相同。
# 唯一的**扩展**（不是替代）是 `skipped`：swarm 是 DAG，存在"前序依赖失败 ⇒ 本环节
# 从未执行"这一结局，research_orch 的 4 个 Agent 相互独立、不存在该结局。
# 它只新增一个取值，既有三个取值的语义与消费方判据一字未改（向后兼容）。
AGENT_STATUS_SKIPPED = "skipped"
# 被判定为"真正跑成了"的状态集合：run 级 completed/partial 依此判定（与改动前
# "len(ordered_results) == len(team.agents)" 逐项等价，见 `_run_team` 内注释）。
_AGENT_STATUS_SUCCEEDED = frozenset({AGENT_STATUS_COMPLETED, AGENT_STATUS_DEGRADED})


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
    *,
    user_id: int | None = None,
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
            # VS35: 与 `research_orch` 同源——把"内容实际不完整"的信号（工具失败 /
            # 工具循环耗尽 / 空内容 / max_tokens 截断）交给 `_call_agent` 收集。
            # 改动前这里**没有**传 degraded_reasons，于是同样的残缺在 research 侧是
            # degraded、在 swarm 侧什么都不留（只能被读成"完成"）。
            agent_reasons: list[str] = []
            content, tool_log = await _call_agent(
                client,
                role,
                ticker,
                company_name,
                registry,
                user_id=user_id,
                allowed_tools=set(agent.tools),
                prior_context=_prior_context(agent, context, fundamentals_context),
                degraded_reasons=agent_reasons,
            )
            for tool_call in tool_log:
                context.emit("tool_call", {
                    "role_key": agent.key,
                    "tool_name": tool_call["name"],
                    "arguments": tool_call["arguments"],
                })
            token_count = estimate_tokens(content)
            status = AGENT_STATUS_DEGRADED if agent_reasons else AGENT_STATUS_COMPLETED
            # VS35: 事件形状与 `research_orch.run_research` 的 agent_completed 对齐
            # （status + degraded_reasons）；token_count 是 swarm 侧既有的增量字段，保留。
            context.emit("agent_completed", {
                "role_key": agent.key,
                "name": agent.name,
                "length": len(content),
                "token_count": token_count,
                "status": status,
                **({"degraded_reasons": list(agent_reasons)} if agent_reasons else {}),
            })
            # VS35: 条目由 VS-20 的构造器 `_agent_result` 产出（字段名/语义同 research_orch），
            # swarm 既有的 role_key/avatar/token_count 作为**增量**字段并入（向后兼容）。
            return {
                **_agent_result(
                    name=agent.name,
                    content=content,
                    tool_log=tool_log,
                    status=status,
                    degraded_reasons=agent_reasons,
                ),
                "role_key": agent.key,
                "avatar": agent.avatar,
                "token_count": token_count,
            }

        return run_agent

    runtime = build_team_runtime(team, runner_factory)
    failed_agents: list[str] = []
    skipped_agents: list[str] = []
    # VS35: 失败原文 / 被跳过的原因（失败依赖）在这里**留存**，供下面构造结构化条目使用。
    # 这两个 list 本身继续下发（向后兼容既有消费方），但它们不再是失败事实的唯一载体。
    failed_errors: dict[str, str] = {}
    skipped_dependencies: dict[str, list[str]] = {}
    async for event in runtime.stream():
        if event.kind in {"agent_started", "tool_call", "agent_completed"}:
            yield event.kind, event.data
        elif event.kind == "node_failed":
            failed_agents.append(event.node_key)
            failed_errors[event.node_key] = str(event.error)
            yield "agent_failed", {
                "role_key": event.node_key,
                "error": str(event.error),
            }
        elif event.kind == "node_skipped":
            skipped_agents.append(event.node_key)
            dependencies = [
                str(key) for key in event.data.get("failed_dependencies", [])
            ]
            skipped_dependencies[event.node_key] = dependencies
            yield "agent_skipped", {
                "role_key": event.node_key,
                **event.data,
            }

    # VS35: **每个** Agent 都有条目，形状与 `research_orch.agent_results[key]` 同形
    # （name/content/tool_log/status + error/degraded_reasons）。改动前失败与被跳过的
    # Agent 在 `agent_results` 里**根本没有条目**，失败事实只存在于顶层的
    # `failed_agents`/`skipped_agents` 两个 key 列表里——那是同一件事的第二处载体。
    # 条目 content 保持空串（不新造 `【分析失败】` 文本哨兵：VS-20 已把文案哨兵降级为
    # 历史兜底，不得再新增），失败原因走结构化 `error`。
    ordered_results: JSONDict = {}
    for agent in team.agents:
        if agent.key in runtime.results:
            ordered_results[agent.key] = dict(runtime.results[agent.key])
        elif agent.key in failed_errors:
            ordered_results[agent.key] = {
                **_agent_result(
                    name=agent.name,
                    content="",
                    tool_log=[],
                    status=AGENT_STATUS_FAILED,
                    error=failed_errors[agent.key],
                ),
                "role_key": agent.key,
                "avatar": agent.avatar,
                "token_count": 0,
            }
        elif agent.key in skipped_dependencies:
            dependencies = skipped_dependencies[agent.key]
            reason = (
                f"前序专家（{', '.join(dependencies)}）未完成，本环节未执行"
                if dependencies
                else "前序专家未完成，本环节未执行"
            )
            ordered_results[agent.key] = {
                **_agent_result(
                    name=agent.name,
                    content="",
                    tool_log=[],
                    status=AGENT_STATUS_SKIPPED,
                    error=reason,
                ),
                "role_key": agent.key,
                "avatar": agent.avatar,
                "token_count": 0,
            }
    # run 级状态的口径**逐项与改动前一致**：改动前 "completed" ⇔ 每个 Agent 都在
    # `runtime.results` 里（即都真正跑成了）；现在失败/被跳过的 Agent 也进 ordered_results，
    # 故改按结构化 status 判定（completed/degraded 视为跑成）。两者等价，不是新的语义。
    succeeded = [
        key for key, entry in ordered_results.items()
        if entry.get("status") in _AGENT_STATUS_SUCCEEDED
    ]
    yield "done", {
        "team": metadata,
        "ticker": ticker,
        "company_name": company_name or ticker,
        "status": "completed" if len(succeeded) == len(team.agents) else "partial",
        "agent_results": ordered_results,
        "failed_agents": failed_agents,
        "skipped_agents": skipped_agents,
        # 失败/被跳过的条目 token_count 为 0，故该和与改动前（只对成功条目求和）等价。
        "token_count": sum(entry["token_count"] for entry in ordered_results.values()),
        "fundamentals": fundamentals,
    }


async def run_four_masters(
    ticker: str,
    company_name: str = "",
    model_id: int | None = None,
    *,
    user_id: int | None = None,
) -> AsyncIterator[tuple[str, JSONDict]]:
    async for event in _run_team(
        get_four_masters_team(), ticker, company_name, model_id, user_id=user_id,
    ):
        yield event


async def run_earnings_review(
    ticker: str,
    company_name: str = "",
    model_id: int | None = None,
    *,
    user_id: int | None = None,
) -> AsyncIterator[tuple[str, JSONDict]]:
    async for event in _run_team(
        get_earnings_review_team(), ticker, company_name, model_id, user_id=user_id,
    ):
        yield event
