"""仪表盘统计。"""
import json
from typing import Any, cast

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile

from .. import database
from ..services.import_service import (
    MAX_CANDIDATES,
    ImportFormatError,
    WatchlistImportService,
    parse_file,
    parse_text,
)
from ..services.market_data import MarketDataService
from .auth import CurrentUser, authenticated_context

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"], dependencies=[Depends(authenticated_context)])


@router.post("/watchlist/import")
async def import_watchlist(
    request: Request,
    _user: CurrentUser,
    text: str = Form(default=""),
    existing: str = Form(default="[]"),
    file: UploadFile | None = File(default=None),
) -> dict[str, Any]:
    try:
        existing_codes = json.loads(existing)
        if not isinstance(existing_codes, list) or not all(isinstance(value, str) for value in existing_codes):
            raise ValueError
    except (json.JSONDecodeError, ValueError) as exc:
        raise HTTPException(422, "existing 必须是股票代码字符串数组") from exc

    try:
        candidates = parse_text(text)
        if file is not None:
            candidates.extend(parse_file(file.filename or "", await file.read()))
        if len(candidates) > MAX_CANDIDATES:
            raise ImportFormatError(f"单次最多导入 {MAX_CANDIDATES} 个候选")
    except ImportFormatError as exc:
        raise HTTPException(422, str(exc)) from exc
    if not candidates:
        raise HTTPException(422, "请粘贴自选股文本或上传 CSV/TXT/XLSX 文件")

    market: MarketDataService = request.app.state.market
    return await WatchlistImportService(market).import_candidates(candidates, existing_codes)


@router.get("/stats")
async def stats(user: CurrentUser) -> dict[str, Any]:
    user_id = int(user["id"])
    model_count = cast(dict[str, Any], await database.query_one(
        "SELECT COUNT(*) AS n FROM model_configs WHERE user_id=?", (user_id,)
    ))["n"]
    conv_count = cast(dict[str, Any], await database.query_one(
        "SELECT COUNT(*) AS n FROM conversations WHERE mode='single' AND status='active' AND user_id=?",
        (user_id,),
    ))["n"]
    disc_count = cast(dict[str, Any], await database.query_one(
        "SELECT COUNT(*) AS n FROM discussion_rooms WHERE user_id=?", (user_id,)
    ))["n"]
    msg_count = cast(dict[str, Any], await database.query_one(
        "SELECT COUNT(*) AS n FROM messages WHERE user_id=?", (user_id,)
    ))["n"]
    default_model = await database.query_one(
        "SELECT id, name, model_name FROM model_configs WHERE is_default=1 AND user_id=? LIMIT 1", (user_id,))
    recent_conversations = await database.query_all(
        "SELECT c.*, (SELECT COUNT(*) FROM messages m WHERE m.conversation_id=c.id AND m.user_id=c.user_id) AS message_count "
        "FROM conversations c WHERE c.mode='single' AND c.status='active' AND c.user_id=? "
        "ORDER BY c.updated_at DESC LIMIT 5", (user_id,))
    recent_rooms = await database.query_all(
        "SELECT * FROM discussion_rooms WHERE user_id=? ORDER BY created_at DESC LIMIT 5", (user_id,))
    for r in recent_rooms:
        r["participants"] = json.loads(r["participants"])
    return {
        "model_count": model_count,
        "conversation_count": conv_count,
        "discussion_count": disc_count,
        "message_count": msg_count,
        "default_model": default_model,
        "recent_conversations": recent_conversations,
        "recent_rooms": recent_rooms,
    }
