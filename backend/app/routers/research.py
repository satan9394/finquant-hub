"""研究备忘录 API：SSE 流式研究报告 + 已生成报告的查询。

端點：
- POST /api/research {ticker} → SSE stream 推送研究进度
- GET  /api/research         → 列出历史报告
- GET  /api/research/{id}    → 获取单份报告详情
"""
import json

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field
from sse_starlette.sse import EventSourceResponse

from .. import database
from ..services.research_orch import run_research

router = APIRouter(prefix="/api/research", tags=["research"])


class ResearchRequest(BaseModel):
    ticker: str = Field(min_length=1, description="股票代码或名称")
    model_id: int | None = Field(default=None, description="LLM 模型 ID")


# ------------------------------------------------------------------
# POST — 流式研究（SSE）
# ------------------------------------------------------------------

@router.post("")
async def start_research(body: ResearchRequest, request: Request):
    """启动多 Agent 并行研究，通过 SSE 推送进度与最终报告。"""
    from ..services.analysis.ticker import resolve_ticker
    from ..services.market_data import MarketDataService, MarketError

    try:
        ticker = resolve_ticker(body.ticker)
    except ValueError as e:
        raise HTTPException(400, str(e)) from e

    # 获取公司名称
    company_name = body.ticker
    svc: MarketDataService = request.app.state.market
    try:
        q = await svc.quote(ticker)
        company_name = q.get("name", body.ticker)
    except MarketError:
        pass

    async def event_stream():
        report_id = None
        final_report_data = None
        final_agent_results = None

        try:
            async for event, data in run_research(ticker, company_name, body.model_id):
                if event == "done":
                    final_report_data = data.get("report", {})
                    final_agent_results = data.get("agent_results", {})
                    # 保存到数据库
                    try:
                        report_id = await _save_report(
                            ticker, company_name,
                            final_report_data, final_agent_results,
                        )
                        data["report_id"] = report_id
                    except Exception as e:
                        data["_save_error"] = str(e)

                yield {"event": event, "data": json.dumps(data, ensure_ascii=False)}
        except Exception as e:
            yield {"event": "error", "data": json.dumps({"message": f"研究管线异常：{e}"}, ensure_ascii=False)}

    return EventSourceResponse(event_stream())


async def _save_report(ticker: str, company_name: str,
                       report_data: dict, agent_results: dict) -> int:
    """将报告持久化到数据库，返回新记录 ID。"""
    await database.get_db().execute(
        """CREATE TABLE IF NOT EXISTS research_reports (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            ticker        TEXT NOT NULL,
            company_name  TEXT,
            report_data   TEXT NOT NULL,
            agent_results TEXT,
            status        TEXT DEFAULT 'completed',
            created_at    TEXT DEFAULT (datetime('now'))
        )"""
    )
    await database.get_db().commit()

    new_id = await database.execute(
        "INSERT INTO research_reports (ticker, company_name, report_data, agent_results) VALUES (?, ?, ?, ?)",
        (ticker, company_name,
         json.dumps(report_data, ensure_ascii=False),
         json.dumps(agent_results, ensure_ascii=False)),
    )
    return new_id


# ------------------------------------------------------------------
# GET — 列表
# ------------------------------------------------------------------

@router.get("")
async def list_reports(page: int = 1, page_size: int = 20):
    """列出历史研究报告，按时间倒序。"""
    # 确保表存在
    await database.get_db().execute(
        "CREATE TABLE IF NOT EXISTS research_reports ("
        "  id INTEGER PRIMARY KEY AUTOINCREMENT,"
        "  ticker TEXT NOT NULL,"
        "  company_name TEXT,"
        "  report_data TEXT NOT NULL,"
        "  agent_results TEXT,"
        "  status TEXT DEFAULT 'completed',"
        "  created_at TEXT DEFAULT (datetime('now'))"
        ")"
    )
    await database.get_db().commit()

    offset = (page - 1) * page_size
    items = await database.query_all(
        "SELECT id, ticker, company_name, status, created_at "
        "FROM research_reports ORDER BY created_at DESC LIMIT ? OFFSET ?",
        (page_size, offset),
    )
    total = await database.query_one("SELECT COUNT(*) AS n FROM research_reports")
    return {"items": items, "total": (total or {}).get("n", 0), "page": page, "page_size": page_size}


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

    return report
