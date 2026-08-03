"""研究备忘录 API：SSE 流式研究报告 + 已生成报告的查询。

端點：
- POST /api/research {ticker} → SSE stream 推送研究进度
- GET  /api/research/history → 按股票聚合的历史版本
- GET  /api/research/{id}    → 获取单份报告详情
- GET  /api/research/{id}/export?format=md|html|pdf|docx → 导出该版本
"""
import json
import logging
import re
from collections.abc import AsyncIterator
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse

from .. import database
from ..services.notifications import publish_research_status
from ..services.llm_usage import reset_usage_context, set_usage_context
from ..services.research_orch import run_research
from ..services.report_export import markdown_to_docx, markdown_to_html, markdown_to_pdf, report_to_markdown
from ..tools.report_audit import extract_data_points, render_verdict, sample_points
from .auth import CurrentUser, authenticated_context

router = APIRouter(prefix="/api/research", tags=["research"], dependencies=[Depends(authenticated_context)])
LOGGER = logging.getLogger(__name__)


class ResearchRequest(BaseModel):
    ticker: str = Field(min_length=1, description="股票代码或名称")
    model_id: int | None = Field(default=None, description="LLM 模型 ID")


class ReportAuditRequest(BaseModel):
    markdown: str = Field(min_length=1, description="待审计的 Markdown 报告")
    verified_results: list[dict[str, Any]] | None = Field(
        default=None,
        description="已补充 fetched_value/fetched_source 的核验结果；省略时仅返回抽样点",
    )


@router.post("/audit")
async def audit_report(body: ReportAuditRequest, _user: CurrentUser) -> dict[str, Any]:
    """Extract financial points or render a verdict for externally verified values."""
    points = extract_data_points(body.markdown)
    if body.verified_results is None:
        return {"points": points, "sample": sample_points(points) if points else []}
    return render_verdict(body.verified_results)


async def resolve_research_target(raw: str, svc: Any) -> tuple[str, str]:
    """Resolve a code or company name before any durable/LLM side effect."""
    from ..services.market_data import MarketError, normalize_code

    company_name = raw.strip()
    try:
        ticker = normalize_code(raw)
    except ValueError:
        try:
            matches = await svc.search(raw)
        except MarketError as exc:
            raise HTTPException(502, str(exc)) from exc
        if not matches:
            raise HTTPException(400, f"无法解析股票代码或公司名称：{raw}")
        ticker = matches[0]["code"]
        company_name = matches[0].get("name") or company_name
    try:
        quote = await svc.quote(ticker)
        if company_name == raw.strip():
            company_name = quote.get("name") or company_name
    except MarketError as exc:
        raise HTTPException(502, f"行情数据获取失败：{exc}") from exc
    return ticker, company_name


# ------------------------------------------------------------------
# POST — 流式研究（SSE）
# ------------------------------------------------------------------

@router.post("")
async def start_research(body: ResearchRequest, request: Request, user: CurrentUser) -> EventSourceResponse:
    """启动多 Agent 并行研究，通过 SSE 推送进度与最终报告。"""
    from ..services.market_data import MarketDataService

    svc: MarketDataService = request.app.state.market
    ticker, company_name = await resolve_research_target(body.ticker, svc)
    user_id = int(user["id"])

    # Create the durable record before streaming.  This preserves aborted and
    # failed runs instead of only storing the happy-path final report.
    report_id = await _create_report(ticker, company_name, body.model_id, user_id)

    async def event_stream() -> AsyncIterator[dict[str, str]]:
        completed = False
        research_stream: AsyncIterator[tuple[str, dict[str, Any]]] | None = None
        usage_token = set_usage_context("research", report_id, user_id)

        try:
            yield {"event": "report_started", "data": json.dumps({"report_id": report_id}, ensure_ascii=False)}
            research_stream = run_research(ticker, company_name, body.model_id, user_id=user_id)
            async for event, data in research_stream:
                if event == "done":
                    data = {**data, "report_id": report_id}
                await _append_event(report_id, event, data, user_id)
                if event == "error":
                    message = data.get("error") or data.get("message") or "研究管线异常"
                    await _fail_report(report_id, message, user_id, record_event=False)
                    await publish_research_status(report_id, "failed", message, user_id=user_id)
                    error_data = {"error": message, "message": message}
                    if data.get("role_key"):
                        error_data["role_key"] = data["role_key"]
                    yield {"event": "error", "data": json.dumps(error_data, ensure_ascii=False)}
                    break
                if event == "done":
                    await _complete_report(report_id, data.get("report", {}), data.get("agent_results", {}), user_id)
                    completed = True
                    await publish_research_status(report_id, "completed", user_id=user_id)

                yield {"event": event, "data": json.dumps(data, ensure_ascii=False)}
        except Exception as e:
            LOGGER.exception(
                "Research SSE pipeline failed",
                extra={"event": "research.stream.error", "report_id": report_id, "ticker": ticker},
            )
            if completed:
                return
            message = f"研究管线异常：{e}"
            await _fail_report(report_id, message, user_id)
            await publish_research_status(report_id, "failed", message, user_id=user_id)
            yield {
                "event": "error",
                "data": json.dumps({"error": message, "message": message}, ensure_ascii=False),
            }
            return
        finally:
            reset_usage_context(usage_token)
            close = getattr(research_stream, "aclose", None)
            if close is not None:
                try:
                    await close()
                except Exception:
                    LOGGER.exception(
                        "Research SSE cleanup failed",
                        extra={"event": "research.stream.cleanup_error", "report_id": report_id},
                    )
            if not completed:
                report = await database.query_one(
                    "SELECT status FROM research_reports WHERE id=? AND user_id=?", (report_id, user_id)
                )
                if report and report["status"] == "running":
                    message = "研究流在完成前中断"
                    await _fail_report(report_id, message, user_id)
                    await publish_research_status(report_id, "failed", message, user_id=user_id)

    return EventSourceResponse(event_stream())


async def _create_report(ticker: str, company_name: str, model_id: int | None, user_id: int) -> int:
    return await database.execute(
        "INSERT INTO research_reports (ticker, company_name, report_data, agent_results, model_id, status, updated_at, user_id) "
        "VALUES (?, ?, '{}', '{}', ?, 'running', datetime('now'), ?)",
        (ticker, company_name, model_id, user_id),
    )


async def _append_event(report_id: int, event: str, data: dict[str, Any], user_id: int) -> None:
    await database.execute(
        "INSERT INTO research_events (research_id, event_type, agent_role_key, payload, user_id) VALUES (?, ?, ?, ?, ?)",
        (report_id, event, data.get("role_key") or data.get("agent"), json.dumps(data, ensure_ascii=False), user_id),
    )


async def _complete_report(
    report_id: int,
    report_data: dict[str, Any],
    agent_results: dict[str, Any],
    user_id: int,
) -> None:
    db = database.get_db()
    cursor = await db.execute(
        "UPDATE research_reports SET report_data=?, agent_results=?, status='completed', "
        "updated_at=datetime('now') WHERE id=? AND status='running' AND user_id=?",
        (json.dumps(report_data, ensure_ascii=False), json.dumps(agent_results, ensure_ascii=False), report_id, user_id),
    )
    await db.commit()
    if cursor.rowcount != 1:
        raise RuntimeError(f"研究报告 {report_id} 无法从 running 转为 completed")


async def _fail_report(report_id: int, message: str, user_id: int, *, record_event: bool = True) -> None:
    if record_event:
        await _append_event(report_id, "error", {"error": message}, user_id)
    await database.execute(
        "UPDATE research_reports SET status='failed', updated_at=datetime('now') "
        "WHERE id=? AND status='running' AND user_id=?",
        (report_id, user_id),
    )


# ------------------------------------------------------------------
# GET — 列表
# ------------------------------------------------------------------

@router.get("")
async def list_reports(user: CurrentUser, page: int = 1, page_size: int = 20) -> dict[str, Any]:
    """列出历史研究报告，按时间倒序。"""
    offset = (page - 1) * page_size
    items = await database.query_all(
        "SELECT id, ticker, company_name, model_id, status, created_at, updated_at "
        "FROM research_reports WHERE user_id=? ORDER BY created_at DESC LIMIT ? OFFSET ?",
        (user["id"], page_size, offset),
    )
    total = await database.query_one("SELECT COUNT(*) AS n FROM research_reports WHERE user_id=?", (user["id"],))
    return {"items": items, "total": (total or {}).get("n", 0), "page": page, "page_size": page_size}


@router.get("/history")
async def grouped_history(user: CurrentUser) -> dict[str, Any]:
    """Return one history group per canonical ticker, with individual versions."""
    groups = await database.query_all(
        "SELECT ticker, COALESCE(MAX(company_name), ticker) AS company_name, COUNT(*) AS run_count, "
        "SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) AS completed_count, "
        "SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failed_count, "
        "MAX(created_at) AS latest_at "
        "FROM research_reports WHERE user_id=? GROUP BY ticker ORDER BY latest_at DESC",
        (user["id"],),
    )
    rows = await database.query_all(
        "SELECT id, ticker, company_name, model_id, status, created_at, updated_at "
        "FROM research_reports WHERE user_id=? ORDER BY created_at DESC, id DESC",
        (user["id"],),
    )
    by_ticker: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        by_ticker.setdefault(row["ticker"], []).append(row)
    for group in groups:
        runs = by_ticker.get(group["ticker"], [])
        group["runs"] = runs
        group["latest_report_id"] = runs[0]["id"] if runs else None
    return {"items": groups, "total": len(groups)}


# ------------------------------------------------------------------
# GET /{id} — 详情
# ------------------------------------------------------------------

@router.get("/{report_id:int}")
async def get_report(report_id: int, user: CurrentUser) -> dict[str, Any]:
    """获取单份研究报告的完整内容。"""
    user_id = int(user["id"])
    report = await _load_report(report_id, user_id)
    report["events"] = await database.query_all(
        "SELECT id, event_type, agent_role_key, payload, created_at FROM research_events "
        "WHERE research_id=? AND user_id=? ORDER BY id",
        (report_id, user_id),
    )
    for event in report["events"]:
        event["payload"] = json.loads(event["payload"])

    return report


@router.get("/{report_id:int}/export")
async def export_report(report_id: int, user: CurrentUser, format: str = "md") -> Response:
    """Export one immutable stored report version without creating extra files."""
    report = await _load_report(report_id, int(user["id"]))
    markdown = report_to_markdown(report)
    title = f"{report.get('company_name') or report.get('ticker')} 研究报告"
    stem = re.sub(r"[^A-Za-z0-9._-]+", "_", f"{report.get('ticker')}_research_v{report_id}").strip("_") or f"research_v{report_id}"
    fmt = format.lower()
    if fmt == "md":
        return Response(markdown, media_type="text/markdown", headers={"Content-Disposition": f'attachment; filename="{stem}.md"'})
    if fmt == "html":
        return Response(markdown_to_html(markdown, title), media_type="text/html", headers={"Content-Disposition": f'attachment; filename="{stem}.html"'})
    if fmt == "pdf":
        return Response(markdown_to_pdf(markdown, title), media_type="application/pdf", headers={"Content-Disposition": f'attachment; filename="{stem}.pdf"'})
    if fmt == "docx":
        return Response(markdown_to_docx(markdown, title), media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document", headers={"Content-Disposition": f'attachment; filename="{stem}.docx"'})
    raise HTTPException(422, "format 仅支持：md、html、pdf、docx")


async def _load_report(report_id: int, user_id: int) -> dict[str, Any]:
    row = await database.query_one("SELECT * FROM research_reports WHERE id=? AND user_id=?", (report_id, user_id))
    if not row:
        raise HTTPException(404, f"报告不存在：id={report_id}")
    report = dict(row)
    for key in ("report_data", "agent_results"):
        if isinstance(report.get(key), str):
            report[key] = json.loads(report[key])
    return report
