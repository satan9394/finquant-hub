"""研究备忘录 API：SSE 流式研究报告 + 已生成报告的查询。

端點：
- POST /api/research {ticker} → SSE stream 推送研究进度
- GET  /api/research/history → 按股票聚合的历史版本
- GET  /api/research/{id}    → 获取单份报告详情
- GET  /api/research/{id}/export?format=md|html|pdf|docx → 导出该版本
"""
import json
import re

from fastapi import APIRouter, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse

from .. import database
from ..services.research_orch import run_research
from ..services.report_export import markdown_to_docx, markdown_to_html, markdown_to_pdf, report_to_markdown

router = APIRouter(prefix="/api/research", tags=["research"])


class ResearchRequest(BaseModel):
    ticker: str = Field(min_length=1, description="股票代码或名称")
    model_id: int | None = Field(default=None, description="LLM 模型 ID")


async def resolve_research_target(raw: str, svc) -> tuple[str, str]:
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
async def start_research(body: ResearchRequest, request: Request):
    """启动多 Agent 并行研究，通过 SSE 推送进度与最终报告。"""
    from ..services.market_data import MarketDataService

    svc: MarketDataService = request.app.state.market
    ticker, company_name = await resolve_research_target(body.ticker, svc)

    # Create the durable record before streaming.  This preserves aborted and
    # failed runs instead of only storing the happy-path final report.
    report_id = await _create_report(ticker, company_name, body.model_id)

    async def event_stream():
        completed = False

        try:
            yield {"event": "report_started", "data": json.dumps({"report_id": report_id}, ensure_ascii=False)}
            async for event, data in run_research(ticker, company_name, body.model_id):
                await _append_event(report_id, event, data)
                if event == "done":
                    completed = True
                    await _complete_report(report_id, data.get("report", {}), data.get("agent_results", {}))
                    data["report_id"] = report_id

                yield {"event": event, "data": json.dumps(data, ensure_ascii=False)}
        except Exception as e:
            await _fail_report(report_id, f"研究管线异常：{e}")
            yield {"event": "error", "data": json.dumps({"message": f"研究管线异常：{e}"}, ensure_ascii=False)}
        finally:
            if not completed:
                report = await database.query_one("SELECT status FROM research_reports WHERE id=?", (report_id,))
                if report and report["status"] == "running":
                    await _fail_report(report_id, "研究流在完成前中断")

    return EventSourceResponse(event_stream())


async def _create_report(ticker: str, company_name: str, model_id: int | None) -> int:
    return await database.execute(
        "INSERT INTO research_reports (ticker, company_name, report_data, agent_results, model_id, status, updated_at) "
        "VALUES (?, ?, '{}', '{}', ?, 'running', datetime('now'))",
        (ticker, company_name, model_id),
    )


async def _append_event(report_id: int, event: str, data: dict) -> None:
    await database.execute(
        "INSERT INTO research_events (research_id, event_type, agent_role_key, payload) VALUES (?, ?, ?, ?)",
        (report_id, event, data.get("role_key") or data.get("agent"), json.dumps(data, ensure_ascii=False)),
    )


async def _complete_report(report_id: int, report_data: dict, agent_results: dict) -> None:
    await database.execute(
        "UPDATE research_reports SET report_data=?, agent_results=?, status='completed', updated_at=datetime('now') WHERE id=?",
        (json.dumps(report_data, ensure_ascii=False), json.dumps(agent_results, ensure_ascii=False), report_id),
    )


async def _fail_report(report_id: int, message: str) -> None:
    await _append_event(report_id, "error", {"message": message})
    await database.execute(
        "UPDATE research_reports SET status='failed', updated_at=datetime('now') WHERE id=? AND status='running'",
        (report_id,),
    )


# ------------------------------------------------------------------
# GET — 列表
# ------------------------------------------------------------------

@router.get("")
async def list_reports(page: int = 1, page_size: int = 20):
    """列出历史研究报告，按时间倒序。"""
    offset = (page - 1) * page_size
    items = await database.query_all(
        "SELECT id, ticker, company_name, model_id, status, created_at, updated_at "
        "FROM research_reports ORDER BY created_at DESC LIMIT ? OFFSET ?",
        (page_size, offset),
    )
    total = await database.query_one("SELECT COUNT(*) AS n FROM research_reports")
    return {"items": items, "total": (total or {}).get("n", 0), "page": page, "page_size": page_size}


@router.get("/history")
async def grouped_history():
    """Return one history group per canonical ticker, with individual versions."""
    groups = await database.query_all(
        "SELECT ticker, COALESCE(MAX(company_name), ticker) AS company_name, COUNT(*) AS run_count, "
        "SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) AS completed_count, "
        "SUM(CASE WHEN status='failed' THEN 1 ELSE 0 END) AS failed_count, "
        "MAX(created_at) AS latest_at "
        "FROM research_reports GROUP BY ticker ORDER BY latest_at DESC"
    )
    rows = await database.query_all(
        "SELECT id, ticker, company_name, model_id, status, created_at, updated_at "
        "FROM research_reports ORDER BY created_at DESC, id DESC"
    )
    by_ticker: dict[str, list[dict]] = {}
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
async def get_report(report_id: int):
    """获取单份研究报告的完整内容。"""
    row = await database.query_one(
        "SELECT * FROM research_reports WHERE id=?", (report_id,)
    )
    if not row:
        raise HTTPException(404, f"报告不存在：id={report_id}")

    # 反序列化 JSON 字段
    report = dict(row)
    if isinstance(report.get("report_data"), str):
        report["report_data"] = json.loads(report["report_data"])
    if isinstance(report.get("agent_results"), str):
        report["agent_results"] = json.loads(report["agent_results"])
    report["events"] = await database.query_all(
        "SELECT id, event_type, agent_role_key, payload, created_at FROM research_events "
        "WHERE research_id=? ORDER BY id",
        (report_id,),
    )
    for event in report["events"]:
        event["payload"] = json.loads(event["payload"])

    return report


@router.get("/{report_id:int}/export")
async def export_report(report_id: int, format: str = "md"):
    """Export one immutable stored report version without creating extra files."""
    report = await _load_report(report_id)
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


async def _load_report(report_id: int) -> dict:
    row = await database.query_one("SELECT * FROM research_reports WHERE id=?", (report_id,))
    if not row:
        raise HTTPException(404, f"报告不存在：id={report_id}")
    report = dict(row)
    for key in ("report_data", "agent_results"):
        if isinstance(report.get(key), str):
            report[key] = json.loads(report[key])
    return report
