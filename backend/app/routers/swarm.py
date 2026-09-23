"""Swarm 团队元数据与 SSE 执行入口。"""

import asyncio
import json
import logging
from collections.abc import AsyncIterator, Callable
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse

from .. import database
from ..services.market_data import normalize_code
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
_SWARM_EVENT_LOCK = asyncio.Lock()


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


# ------------------------------------------------------------------
# GET /runs — 历史回放入口（只读）
#
# `research_reports` 没有团队/类型字段，归属只能靠事件判定：swarm 运行的
# **首个**持久化事件是 `team_started`（services/swarm_orch.py 的 `_run_team`
# 首个 yield，经 routers/swarm.py 的 `_append_event` 落库）。深度研究报告由
# `research_orch` 产出，从不发 `team_started`（其事件只有 agent_started /
# agent_failed / tool_call / agent_completed / report_progress / done / error）。
# 因此本端点用「该 report 的最小 event id 恰好是 team_started」做归属判定，
# 不新增表/列，也不改既有列语义。
# ------------------------------------------------------------------

_RUNS_SQL = (
    "WITH first_events AS ("
    "  SELECT research_id, MIN(id) AS first_event_id FROM research_events"
    "  WHERE user_id = ? GROUP BY research_id"
    ") "
    "SELECT r.id AS report_id, r.ticker, r.company_name, r.status, r.created_at, e.payload AS first_payload "
    "FROM research_reports r "
    "JOIN first_events f ON f.research_id = r.id "
    "JOIN research_events e ON e.id = f.first_event_id "
    "WHERE r.user_id = ? AND e.user_id = ? AND e.event_type = 'team_started' "
    "AND r.ticker IN ({placeholders}) "
    "ORDER BY r.created_at DESC, r.id DESC"
)


def _ticker_candidates(raw: str) -> list[str]:
    """把用户输入映射为待匹配的 ticker 形式（纯字符串处理，不触网）。

    同时保留规范化形式与原始输入：前者匹配现行写入路径（`resolve_research_target`
    落库的是规范化代码），后者兜住规范化迁移之前的历史行。
    """
    stripped = raw.strip()
    if not stripped:
        return []
    candidates: list[str] = []
    try:
        normalized = normalize_code(stripped)
    except ValueError:
        normalized = ""
    if normalized:
        candidates.append(normalized)
    if stripped not in candidates:
        candidates.append(stripped)
    return candidates


def _team_metadata(payload: str) -> tuple[str | None, str | None]:
    """从 `team_started` 的 payload 里取 team key/name；异常载荷降级为 None，不抛错。"""
    try:
        data = json.loads(payload)
    except (TypeError, ValueError):
        return None, None
    team = data.get("team") if isinstance(data, dict) else None
    if not isinstance(team, dict):
        return None, None
    key = team.get("key")
    name = team.get("name")
    return (key if isinstance(key, str) else None, name if isinstance(name, str) else None)


@router.get("/runs")
async def list_swarm_runs(user: CurrentUser, ticker: str = Query(min_length=1, max_length=32)) -> dict[str, Any]:
    """列出当前用户在某个 ticker 下的 swarm 团队运行，按时间倒序。只读，不触发任何 LLM 调用。"""
    candidates = _ticker_candidates(ticker) or [ticker]
    placeholders = ", ".join("?" for _ in candidates)
    user_id = int(user["id"])
    rows = await database.query_all(
        _RUNS_SQL.format(placeholders=placeholders),
        (user_id, user_id, user_id, *candidates),
    )
    items: list[dict[str, Any]] = []
    for row in rows:
        team_key, team_name = _team_metadata(row["first_payload"])
        items.append(
            {
                "report_id": row["report_id"],
                "ticker": row["ticker"],
                "company_name": row["company_name"],
                "status": row["status"],
                "created_at": row["created_at"],
                "team_key": team_key,
                "team_name": team_name,
            }
        )
    return {"items": items, "total": len(items)}


@router.post("/runs/{report_id:int}/cancel")
async def cancel_swarm_run(report_id: int, user: CurrentUser) -> dict[str, Any]:
    """Persist cancellation for one running, owner-scoped swarm report."""
    user_id = int(user["id"])
    async with _SWARM_EVENT_LOCK:
        report = await database.query_one(
            "SELECT status FROM research_reports WHERE id=? AND user_id=?",
            (report_id, user_id),
        )
        if report is None:
            raise HTTPException(status_code=404, detail="Swarm 运行不存在")
        first_event = await database.query_one(
            "SELECT event_type FROM research_events WHERE research_id=? AND user_id=? ORDER BY id LIMIT 1",
            (report_id, user_id),
        )
        if first_event is None or first_event["event_type"] != "team_started":
            raise HTTPException(status_code=404, detail="Swarm 运行不存在")
        if report["status"] == "canceled":
            return {"report_id": report_id, "status": "canceled"}
        if report["status"] != "running":
            return {"report_id": report_id, "status": report["status"]}

        async with database.exclusive_transaction():
            current = await database.query_one(
                "SELECT status FROM research_reports WHERE id=? AND user_id=?",
                (report_id, user_id),
            )
            if current is None:
                raise HTTPException(status_code=404, detail="Swarm 运行不存在")
            if current["status"] != "running":
                return {"report_id": report_id, "status": current["status"]}
            await _append_event(report_id, "team_canceled", {"report_id": report_id}, user_id)
            await database.execute(
                "UPDATE research_reports SET status='canceled', updated_at=datetime('now') "
                "WHERE id=? AND user_id=? AND status='running'",
                (report_id, user_id),
            )

    return {"report_id": report_id, "status": "canceled"}


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
                status_message: str | None = None
                async with _SWARM_EVENT_LOCK:
                    current = await database.query_one(
                        "SELECT status FROM research_reports WHERE id=? AND user_id=?",
                        (report_id, user_id),
                    )
                    if current is None or current["status"] != "running":
                        break
                    if event == "done":
                        report = report_builder(ticker, company_name, data)
                        data = {**data, "report_id": report_id, "report": report}
                    await _append_event(report_id, event, data, user_id)
                    if event == "error":
                        status_message = data.get("error") or data.get("message") or "Swarm 运行异常"
                        await _fail_report(report_id, status_message, user_id, record_event=False)
                    elif event == "done":
                        await _complete_report(report_id, data["report"], data.get("agent_results", {}), user_id)
                        completed = True
                if event == "error":
                    await publish_research_status(report_id, "failed", status_message, user_id=user_id)
                    yield {"event": event, "data": json.dumps(data, ensure_ascii=False)}
                    break
                if event == "done":
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
