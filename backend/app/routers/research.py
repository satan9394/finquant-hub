"""研究备忘录 API：SSE 流式研究报告 + 已生成报告的查询。

端點：
- POST /api/research {ticker} → SSE stream 推送研究进度
- GET  /api/research/history → 按股票聚合的历史版本
- GET  /api/research/{id}    → 获取单份报告详情
- GET  /api/research/{id}/export?format=md|html|pdf|docx → 导出该版本
"""
import asyncio
import json
import logging
import re
import sqlite3
from collections.abc import AsyncIterator
from datetime import datetime, timezone
from typing import Any, Literal

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse

from .. import database
from ..services.notifications import publish_research_status
from ..services.llm_usage import reset_usage_context, set_usage_context
from ..services.evidence_audit import audit_evidence, export_evidence_manifest
from ..services.investment_memory import (
    create_memory,
    delete_memory,
    export_memories,
    get_memory,
    list_memories,
    supersede_memory,
    update_memory,
)
from ..services.memory_capture import schedule_research_candidates
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


class ExplicitMemorySave(BaseModel):
    subject_type: Literal["instrument", "portfolio", "strategy", "market", "document"]
    subject_id: str = Field(min_length=1, max_length=200)
    memory_type: Literal[
        "preference",
        "research_interest",
        "hypothesis",
        "decision",
        "evidence_reference",
        "risk_concern",
        "invalidation_condition",
        "workflow_state",
        "review_outcome",
    ]
    information_kind: Literal["FACT", "USER_HYPOTHESIS", "USER_PREFERENCE", "WORKFLOW_STATE"]
    content: dict[str, Any]
    workspace_id: int | None = None
    evidence_id: str | None = None
    confidence: float | None = Field(default=None, ge=0, le=1)
    quality_flags: list[str] = Field(default_factory=list, max_length=20)


class MemoryAction(BaseModel):
    action: Literal["confirm", "edit", "invalidate"]
    content: dict[str, Any] | None = None
    confidence: float | None = Field(default=None, ge=0, le=1)
    quality_flags: list[str] | None = Field(default=None, max_length=20)


@router.get("/memory")
async def get_memories(
    user: CurrentUser,
    subject_id: str | None = None,
    status_filter: Literal["candidate", "confirmed", "superseded", "invalidated", "deleted"] | None = None,
    include_deleted: bool = False,
) -> dict[str, Any]:
    items = await list_memories(
        user_id=int(user["id"]),
        subject_id=subject_id,
        include_deleted=include_deleted or status_filter == "deleted",
    )
    if status_filter is not None:
        items = [item for item in items if item["status"] == status_filter]
    return {"items": items, "total": len(items)}


@router.get("/memory/export")
async def export_user_memories(user: CurrentUser) -> dict[str, Any]:
    items = await export_memories(user_id=int(user["id"]))
    return {
        "schema_version": "typed-investment-memory-export-v1",
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "records": items,
        "record_count": len(items),
    }


@router.post("/memory", status_code=201)
async def save_explicit_memory(body: ExplicitMemorySave, user: CurrentUser) -> dict[str, Any]:
    """Save one user-authored memory; database constraints retain evidence boundaries."""
    if body.information_kind == "FACT" and body.evidence_id is None:
        raise HTTPException(422, "confirmed FACT 必须引用 evidence")
    try:
        return await create_memory(
            user_id=int(user["id"]),
            workspace_id=body.workspace_id,
            subject_type=body.subject_type,
            subject_id=body.subject_id,
            memory_type=body.memory_type,
            information_kind=body.information_kind,
            content=body.content,
            source_kind="evidence" if body.information_kind == "FACT" else "user",
            source_id=body.evidence_id if body.information_kind == "FACT" else None,
            evidence_id=body.evidence_id,
            status="confirmed",
            confidence=body.confidence,
            quality_flags=body.quality_flags,
            created_by="user",
        )
    except sqlite3.IntegrityError as exc:
        raise HTTPException(422, "memory 引用或类型约束无效") from exc


@router.patch("/memory/{memory_id:int}")
async def act_on_memory(memory_id: int, body: MemoryAction, user: CurrentUser) -> dict[str, Any]:
    user_id = int(user["id"])
    existing = await get_memory(memory_id, user_id=user_id)
    if existing is None:
        raise HTTPException(404, "memory 不存在")
    try:
        if body.action == "edit":
            if body.content is None:
                raise HTTPException(422, "edit 必须提供 content")
            if existing["information_kind"] == "FACT":
                raise HTTPException(422, "FACT 不允许改写；请引用 evidence 新建记录")
            edited_kind = {
                "preference": "USER_PREFERENCE",
                "research_interest": "USER_PREFERENCE",
                "workflow_state": "WORKFLOW_STATE",
            }.get(existing["memory_type"], "USER_HYPOTHESIS")
            result = await supersede_memory(
                memory_id,
                user_id=user_id,
                content=body.content,
                created_by="user",
                information_kind=edited_kind,
                source_kind="user",
                source_id=None,
            )
        else:
            result = await update_memory(
                memory_id,
                user_id=user_id,
                status="confirmed" if body.action == "confirm" else "invalidated",
                confidence=body.confidence,
                quality_flags=body.quality_flags,
            )
    except sqlite3.IntegrityError as exc:
        raise HTTPException(422, "memory 状态或引用约束无效") from exc
    if result is None:
        raise HTTPException(409, "memory 当前状态不允许该操作")
    return result


@router.delete("/memory/{memory_id:int}")
async def remove_memory(memory_id: int, user: CurrentUser) -> dict[str, Any]:
    deleted = await delete_memory(memory_id, user_id=int(user["id"]))
    if not deleted:
        raise HTTPException(404, "memory 不存在")
    return {"id": memory_id, "deleted": True, "scope": "memory_record_only", "mode": "soft_delete"}


@router.get("/evidence/audit")
async def evidence_audit(user: CurrentUser) -> dict[str, Any]:
    """Return owner-scoped canonical evidence integrity counts."""
    return await audit_evidence(int(user["id"]))


@router.get("/evidence/export")
async def evidence_export(user: CurrentUser) -> dict[str, Any]:
    """Export an allowlisted v2 manifest without credentials or raw document text."""
    return await export_evidence_manifest(int(user["id"]))


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
                    report = data.get("report", {})
                    # G-03: 报告诚实质量标记随报告持久化（audited/degraded），
                    # 前端研究报告展示可据此提示"部分环节失败"。
                    quality = data.get("quality", "audited")
                    if isinstance(report, dict):
                        report = {**report, "quality": quality}
                    await _complete_report(report_id, report, data.get("agent_results", {}), user_id)
                    schedule_research_candidates(
                        report_id,
                        ticker,
                        report,
                        user_id,
                    )
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
            # 断连安全清理（Astra A3 P1）：sse_starlette 在客户端断开时取消
            # event_stream 协程。直接 await 清理会再次收到 CancelledError，
            # 报告永久停留 running。分两步处理：
            # 1) 同步清理（reset_usage_context，ContextVar 上下文敏感，须留在
            #    原 context 且无 await，不依赖取消点）——原样执行；
            # 2) 需要 await 的清理（生成器 aclose、状态查询、失败落库）放进
            #    独立任务（不在 sse 的 cancel scope 内），shield 等待其完成。
            #    外层取消只让 shield 抛 CancelledError，清理任务继续执行。
            reset_usage_context(usage_token)
            cleanup_task = asyncio.get_running_loop().create_task(
                _cleanup_stream(report_id, research_stream, completed, user_id),
                name=f"research-sse-cleanup-{report_id}",
            )
            def _report_cleanup_failure(task: asyncio.Task[None]) -> None:
                if task.cancelled():
                    return
                error = task.exception()
                if error is not None:
                    LOGGER.exception(
                        "Research SSE background cleanup failed",
                        exc_info=error,
                        extra={"event": "research.stream.cleanup_error", "report_id": report_id},
                    )

            cleanup_task.add_done_callback(_report_cleanup_failure)
            try:
                await asyncio.shield(cleanup_task)
            except asyncio.CancelledError:
                # shield 的 inner 不受外层取消影响：清理任务继续在后台完成，
                # 取消则向上传播让 sse_starlette 正常收尾（不留永久 running）。
                raise

    return EventSourceResponse(event_stream())


async def _cleanup_stream(
    report_id: int,
    research_stream: AsyncIterator[tuple[str, dict[str, Any]]] | None,
    completed: bool,
    user_id: int,
) -> None:
    """收尾（独立任务运行，避开 sse 的 cancel scope）：关闭上游流、必要时失败落库。

    作为 ensure_future 的独立 task 执行：不在 sse_starlette 的取消作用域内，
    因此 event_stream 被断连取消后，这里的 aclose / 查询 / _fail_report 仍能
    完成，不会留下永久 running 报告（Astra A3 P1）。
    注意：不要在此函数内触碰 ContextVar token（usage reset 已在原 context 同步完成）。
    """
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
