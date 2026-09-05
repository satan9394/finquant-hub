"""Swarm 团队元数据与 SSE 执行入口。"""

import json
import logging
from collections.abc import AsyncIterator, Callable
from typing import Any

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse

from .. import database
from ..services.notifications import publish_research_status
from ..services.llm_usage import reset_usage_context, set_usage_context
from ..services.swarm_orch import (
    build_earnings_review_report,
    build_four_masters_report,
    get_earnings_review_team,
    get_four_masters_team,
    public_team_definition,
    run_earnings_review,
    run_four_masters,
)
from .research import _append_event, _complete_report, _create_report, _fail_report, resolve_research_target
from .auth import CurrentUser, authenticated_context

router = APIRouter(prefix="/api/swarm", tags=["swarm"], dependencies=[Depends(authenticated_context)])
LOGGER = logging.getLogger(__name__)


class SwarmRunRequest(BaseModel):
    ticker: str = Field(min_length=1, description="股票代码或名称")
    model_id: int | None = Field(default=None, description="LLM 模型 ID")


@router.get("/teams/four-masters")
async def get_four_masters(_user: CurrentUser) -> dict[str, Any]:
    """返回四大师团队拓扑和工具权限。"""
    return public_team_definition(get_four_masters_team())


@router.get("/teams/earnings-review")
async def get_earnings_review(_user: CurrentUser) -> dict[str, Any]:
    """返回六 Agent 财报精读团队拓扑和工具权限。"""
    return public_team_definition(get_earnings_review_team())


async def _analyze_with_team(
    body: SwarmRunRequest,
    request: Request,
    user_id: int,
    runner: Callable[..., AsyncIterator[tuple[str, dict[str, Any]]]],
    report_builder: Callable[[str, str, dict[str, Any]], dict[str, Any]],
) -> EventSourceResponse:
    ticker, company_name = await resolve_research_target(body.ticker, request.app.state.market)
    report_id = await _create_report(ticker, company_name, body.model_id, user_id)

    async def run_with_user() -> AsyncIterator[tuple[str, dict[str, Any]]]:
        # 把 user_id 透传给工具线程（Astra A5：恢复工具内 current_user_id 上下文）
        async for event in runner(ticker, company_name, body.model_id, user_id=user_id):
            yield event

    async def event_stream() -> AsyncIterator[dict[str, str]]:
        completed = False
        swarm_stream: AsyncIterator[tuple[str, dict[str, Any]]] | None = None
        usage_token = set_usage_context("swarm", report_id, user_id)
        try:
            yield {
                "event": "report_started",
                "data": json.dumps({"report_id": report_id, "ticker": ticker}, ensure_ascii=False),
            }
            swarm_stream = run_with_user()
            async for event, data in swarm_stream:
                if event == "done":
                    report = report_builder(ticker, company_name, data)
                    data = {**data, "report_id": report_id, "report": report}
                await _append_event(report_id, event, data, user_id)
                if event == "error":
                    message = data.get("error") or data.get("message") or "Swarm 运行异常"
                    await _fail_report(report_id, message, user_id, record_event=False)
                    await publish_research_status(report_id, "failed", message, user_id=user_id)
                    yield {"event": event, "data": json.dumps(data, ensure_ascii=False)}
                    break
                if event == "done":
                    await _complete_report(report_id, data["report"], data.get("agent_results", {}), user_id)
                    completed = True
                    await publish_research_status(report_id, "completed", user_id=user_id)
                yield {"event": event, "data": json.dumps(data, ensure_ascii=False)}
        except Exception as exc:
            LOGGER.exception(
                "Swarm SSE pipeline failed",
                extra={"event": "swarm.stream.error", "report_id": report_id, "ticker": ticker},
            )
            message = f"Swarm 运行异常：{exc}"
            await _fail_report(report_id, message, user_id)
            await publish_research_status(report_id, "failed", message, user_id=user_id)
            yield {
                "event": "error",
                "data": json.dumps(
                    {"error": message, "message": message, "report_id": report_id},
                    ensure_ascii=False,
                ),
            }
        finally:
            reset_usage_context(usage_token)
            close = getattr(swarm_stream, "aclose", None)
            if close is not None:
                try:
                    await close()
                except Exception:
                    LOGGER.exception(
                        "Swarm SSE cleanup failed",
                        extra={"event": "swarm.stream.cleanup_error", "report_id": report_id},
                    )
            if not completed:
                stored_report = await database.query_one(
                    "SELECT status FROM research_reports WHERE id=? AND user_id=?",
                    (report_id, user_id),
                )
                if stored_report and stored_report["status"] == "running":
                    message = "Swarm 事件流在完成前中断"
                    await _fail_report(report_id, message, user_id)
                    await publish_research_status(report_id, "failed", message, user_id=user_id)

    return EventSourceResponse(event_stream())


@router.post("/analyze")
@router.post("/teams/four-masters/run", include_in_schema=False)
async def analyze_with_four_masters(
    body: SwarmRunRequest,
    request: Request,
    user: CurrentUser,
) -> EventSourceResponse:
    """运行四大师团队，通过 SSE 推送状态并持久化结构化报告。"""
    return await _analyze_with_team(body, request, int(user["id"]), run_four_masters, build_four_masters_report)


@router.post("/teams/earnings-review/run")
async def analyze_earnings_review(
    body: SwarmRunRequest,
    request: Request,
    user: CurrentUser,
) -> EventSourceResponse:
    """运行六 Agent 财报精读团队并持久化编辑后的研究报告。"""
    return await _analyze_with_team(body, request, int(user["id"]), run_earnings_review, build_earnings_review_report)
