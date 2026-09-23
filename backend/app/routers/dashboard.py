"""仪表盘统计。"""
import json
import os
from typing import Any, cast

from datetime import datetime, timezone
from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile

from .. import config, database
from ..services.import_service import (
    MAX_CANDIDATES,
    ImportFormatError,
    WatchlistImportService,
    parse_file,
    parse_text,
)
from ..services.decision_inbox import build_decision_inbox
from ..services.market_data import MarketDataService
from ..services.news_search import NewsSearchService
from ..services.credential_store import get_credentials
from .auth import CurrentUser, authenticated_context

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"], dependencies=[Depends(authenticated_context)])

DEFAULT_NEWS_KEYWORD = "中国 A股 港股 美股 财经"
NEWS_PROVIDERS = ("eastmoney", "google_news", "sina")


@router.get("/decision-inbox")
async def decision_inbox(user: CurrentUser) -> dict[str, Any]:
    return await build_decision_inbox(int(user["id"]))


@router.get("/news")
async def dashboard_news(
    user: CurrentUser,
    keyword: str = Query(default=DEFAULT_NEWS_KEYWORD, min_length=1, max_length=120),
    max_results: int = Query(default=6, ge=1, le=6),
) -> dict[str, Any]:
    """Return normalized, provenance-preserving latest finance news."""
    queried_at = datetime.now(timezone.utc).isoformat()
    result: dict[str, Any] = {
        "keyword": keyword,
        "queried_at": queried_at,
        "as_of": queried_at,
        "providers_attempted": [],
        "providers_used": [],
        "errors": {},
        "data_status": "UNKNOWN",
        "news": [],
    }
    credentials = await get_credentials(int(user["id"]), NEWS_PROVIDERS)
    service = NewsSearchService(providers=NEWS_PROVIDERS, credentials=credentials)
    try:
        searched = await service.search(keyword, max_results=max_results, strategy="fallback")
        result["providers_attempted"] = searched.get("providers_attempted", [])
        result["providers_used"] = searched.get("providers_used", [])
        result["errors"] = searched.get("errors", {})
        result["news"] = searched.get("news", [])[:max_results]
        if result["news"] and result["errors"]:
            result["data_status"] = "PARTIAL"
        elif result["news"]:
            result["data_status"] = "OK"
        elif result["errors"]:
            result["data_status"] = "UPSTREAM_ERROR"
    except ValueError as exc:
        result["errors"] = {"service": type(exc).__name__}
    except Exception as exc:  # upstream adapters are intentionally isolated
        result["errors"] = {"service": type(exc).__name__}
        result["data_status"] = "UPSTREAM_ERROR"
    finally:
        await service.aclose()
    return result


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
        "SELECT m.id, m.name, m.model_name, m.api_key_env, "
        "EXISTS(SELECT 1 FROM user_credentials c "
        "WHERE c.user_id=m.user_id AND c.service='model:' || m.id) AS has_stored_credential "
        "FROM model_configs m WHERE m.is_default=1 AND m.user_id=? LIMIT 1",
        (user_id,),
    )
    recent_conversations = await database.query_all(
        "SELECT c.*, (SELECT COUNT(*) FROM messages m WHERE m.conversation_id=c.id AND m.user_id=c.user_id) AS message_count "
        "FROM conversations c WHERE c.mode='single' AND c.status='active' AND c.user_id=? "
        "ORDER BY c.updated_at DESC LIMIT 5", (user_id,))
    recent_rooms = await database.query_all(
        "SELECT * FROM discussion_rooms WHERE user_id=? ORDER BY created_at DESC LIMIT 5", (user_id,))
    for r in recent_rooms:
        r["participants"] = json.loads(r["participants"])
    public_default_model = None
    credential_source = "none"
    if default_model is not None:
        api_key_env = str(default_model.get("api_key_env") or "").strip()
        try:
            has_environment_credential = bool(api_key_env and os.getenv(api_key_env, ""))
        except ValueError:
            has_environment_credential = False
        credential_source = (
            "stored" if default_model.get("has_stored_credential")
            else "environment" if has_environment_credential
            else "none"
        )
        public_default_model = {
            "id": default_model["id"],
            "name": default_model["name"],
            "model_name": default_model["model_name"],
        }
    model_status = "CONFIGURED_UNVERIFIED" if credential_source != "none" else "UNCONFIGURED"

    return {
        "model_count": model_count,
        "conversation_count": conv_count,
        "discussion_count": disc_count,
        "message_count": msg_count,
        "default_model": public_default_model,
        "recent_conversations": recent_conversations,
        "recent_rooms": recent_rooms,
        "capabilities": {
            "contract_version": "local-capabilities/v1",
            "runtime_mode": "LOCAL_ONLY" if config.LOCAL_ONLY_MODE else "AUTHENTICATED",
            "local_core": {
                "status": "AVAILABLE",
                "quality_status": "OK",
            },
            "model_ai": {
                "status": model_status,
                "quality_status": "UNKNOWN",
                "credential_source": credential_source,
                "model_id": public_default_model["id"] if public_default_model else None,
                "action_path": "/models",
            },
            "market_data": {
                "status": "RUNTIME_CHECK_REQUIRED",
                "quality_status": "UNKNOWN",
            },
        },
    }
