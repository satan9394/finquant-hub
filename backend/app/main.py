"""FastAPI 入口：lifespan 初始化数据库与行情服务，挂载全部路由。"""
import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager, suppress
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from . import config, database
from .middleware.security import SecurityMiddleware
from .routers import agents, alerts, analysis as analysis_router, auth, backtest, backtests, chat, credentials, dashboard, discussion, instruments, market, mcp as mcp_router, models_crud, notifications, portfolio as portfolio_router, research, screening, settings, swarm, thesis, usage, wq
from .services.market_data import MarketDataService
from .services.logging import configure_logging
from .services.auth import ensure_local_user
from .services.credential_store import migrate_legacy_model_api_keys, validate_master_key
from .services.llm_usage import flush_llm_usage
from .services.memory_capture import flush_memory_candidates
from .services.mcp_runtime import restore_enabled_mcp_servers
from .services.scheduler import scheduler_loop
from .services.source_settings import restore_source_priorities
from .services.system_settings import load_system_settings

configure_logging()
LOGGER = logging.getLogger(__name__)

_VALIDATION_MESSAGES = {
    "missing": "为必填项",
    "string_too_short": "长度不能少于 {min_length} 个字符",
    "string_too_long": "长度不能超过 {max_length} 个字符",
    "too_short": "项目数量不能少于 {min_length}",
    "too_long": "项目数量不能超过 {max_length}",
    "greater_than": "必须大于 {gt}",
    "greater_than_equal": "必须大于等于 {ge}",
    "less_than": "必须小于 {lt}",
    "less_than_equal": "必须小于等于 {le}",
    "int_parsing": "必须是整数",
    "float_parsing": "必须是数字",
    "bool_parsing": "必须是布尔值",
    "list_type": "必须是列表",
    "dict_type": "必须是对象",
    "literal_error": "值不在允许范围内",
    "enum": "值不在允许范围内",
    "string_pattern_mismatch": "格式不正确",
    "value_error": "值不合法",
    "json_invalid": "JSON 格式错误",
}
_VALIDATION_SCOPES = {"body": "请求体", "query": "查询参数", "path": "路径参数", "header": "请求头"}


def _first_validation_detail(exc: RequestValidationError) -> str:
    """Return one stable, field-level Chinese validation message."""
    error = exc.errors()[0]
    location = error.get("loc", ())
    fields = [str(part) for part in location if part not in _VALIDATION_SCOPES]
    scope = _VALIDATION_SCOPES.get(location[0], "请求参数") if location else "请求参数"
    field = ".".join(fields) or scope
    template = _VALIDATION_MESSAGES.get(error.get("type"), "输入不合法")
    return f"{field}：{template.format(**error.get('ctx', {}))}"


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    validate_master_key()
    if config.APP_ENV == "production" and config.LOCAL_ONLY_MODE:
        raise RuntimeError("production forbids LOCAL_ONLY_MODE")
    if config.APP_ENV == "production":
        if not config.AUTH_COOKIE_SECURE:
            raise RuntimeError("production requires AUTH_COOKIE_SECURE=true")
        if not config.SMTP_HOST or not config.SMTP_FROM:
            raise RuntimeError("production requires SMTP_HOST and SMTP_FROM")
    await database.init_db()
    if config.LOCAL_ONLY_MODE:
        await ensure_local_user()
    await migrate_legacy_model_api_keys()
    await load_system_settings()
    await restore_enabled_mcp_servers()
    app.state.market = MarketDataService()
    await restore_source_priorities(app.state.market)
    app.state.scheduler_task = (
        asyncio.create_task(scheduler_loop(app.state.market), name="post-market-scheduler")
        if config.SCHEDULER_ENABLED
        else None
    )
    try:
        yield
    finally:
        if app.state.scheduler_task is not None:
            app.state.scheduler_task.cancel()
            with suppress(asyncio.CancelledError):
                await app.state.scheduler_task
        await app.state.market.aclose()
        await flush_llm_usage()
        await flush_memory_candidates()
        await database.close_db()


app = FastAPI(title="FinQuant Hub", version=config.APP_VERSION, lifespan=lifespan)


@app.exception_handler(RequestValidationError)
async def request_validation_exception_handler(_request: Request, exc: RequestValidationError) -> JSONResponse:
    return JSONResponse(status_code=422, content={"detail": _first_validation_detail(exc)})


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    LOGGER.exception(
        "Unhandled request exception",
        exc_info=exc,
        extra={
            "event": "http.request.failed",
            "http_method": request.method,
            "http_path": request.url.path,
            "exception_type": type(exc).__name__,
        },
    )
    return JSONResponse(status_code=500, content={"detail": "服务内部错误，请稍后重试"})

# MVP 经 Vite proxy 同源访问；CORS 仅放开本地调试端口，便于直连测试
if config.APP_ENV != "production":
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
app.add_middleware(SecurityMiddleware, cookie_name=config.AUTH_COOKIE_NAME)

app.include_router(auth.router)
for r in (credentials.router, models_crud.router, agents.router, chat.router, discussion.router, market.router, dashboard.router,
          analysis_router.router, portfolio_router.router, wq.router, research.router, screening.router,
          backtest.router, instruments.router, backtests.router, swarm.router, notifications.router,
          alerts.router, mcp_router.router, settings.router, usage.router, thesis.router):
    app.include_router(r, dependencies=[Depends(auth.authenticated_context)])


@app.get("/api/health")
async def health() -> dict[str, str]:
    row = await database.query_one("PRAGMA journal_mode")
    return {"status": "ok", "version": config.APP_VERSION, "db": (row or {}).get("journal_mode", "?")}


if config.SERVE_FRONTEND:
    frontend_dist = Path(__file__).resolve().parents[2] / "frontend" / "dist"
    if not frontend_dist.is_dir():
        LOGGER.warning("SERVE_FRONTEND=1 但未找到 frontend/dist，跳过静态托管")
    else:
        if (frontend_dist / "assets").is_dir():
            app.mount("/assets", StaticFiles(directory=frontend_dist / "assets"), name="static-assets")

        # ponytail: 仅静态产物与 SPA 路由，不加入 OpenAPI API 契约。
        @app.get("/{full_path:path}", include_in_schema=False)
        async def frontend_fallback(full_path: str) -> FileResponse:
            if full_path == "api" or full_path.startswith("api/"):
                raise HTTPException(status_code=404)
            return FileResponse(frontend_dist / "index.html")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host=config.HOST, port=config.PORT, reload=True)
