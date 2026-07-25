"""FastAPI 入口：lifespan 初始化数据库与行情服务，挂载全部路由。"""
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from . import config, database
from .routers import agents, analysis as analysis_router, backtest, chat, dashboard, discussion, market, models_crud, portfolio as portfolio_router, research, wq
from .services.market_data import MarketDataService


@asynccontextmanager
async def lifespan(app: FastAPI):
    await database.init_db()
    app.state.market = MarketDataService()
    yield
    await app.state.market.aclose()
    await database.close_db()


app = FastAPI(title="FinQuant Hub", version=config.APP_VERSION, lifespan=lifespan)

# MVP 经 Vite proxy 同源访问；CORS 仅放开本地调试端口，便于直连测试
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

for r in (models_crud.router, agents.router, chat.router, discussion.router, market.router, dashboard.router,
          analysis_router.router, portfolio_router.router, wq.router, research.router, backtest.router):
    app.include_router(r)


@app.get("/api/health")
async def health():
    row = await database.query_one("PRAGMA journal_mode")
    return {"status": "ok", "version": config.APP_VERSION, "db": (row or {}).get("journal_mode", "?")}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("app.main:app", host=config.HOST, port=config.PORT, reload=True)
