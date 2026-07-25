# CLAUDE.md — FinQuant Hub

## What this is

Personal multi-module financial quant research system for non-technical investors.
Full-stack (FastAPI + React) web app running locally on Windows 11. 

## Quick commands

```bash
cd E:\Code_file\Projects\finquant-hub
# Backend (port 8000)
cd backend && .venv\Scripts\python.exe -m uvicorn app.main:app --reload
# Frontend (port 5173)
cd frontend && bun run dev
# Tests
cd backend && .venv\Scripts\python.exe -m pytest -q
# Frontend build check
cd frontend && bun run build
```

## One-sentence architecture

FastAPI lifespan → aiosqlite WAL single connection → 6+4 new routers → Vite proxy → React 18 + AntD 5 + lightweight-charts. 42 backend files, 9 frontend pages, 35 API routes. Agent Tool framework (6 tools) via OpenAI function_calling on DeepSeek v4-flash.

## Key files to know

| File | What it does |
|------|-------------|
| `backend/app/main.py` | Lifespan, CORS, router registration |
| `backend/app/database.py` | SQLite schema (15 tables), seed data |
| `backend/app/services/market_data.py` | Tencent/Sina/EastMoney A-share data |
| `backend/app/services/indicators.py` | Numpy 7 indicators (A-share SMA conventions) |
| `backend/app/services/llm_client.py` | OpenAI-compatible client, 3 chat methods |
| `backend/app/services/discussion_orch.py` | Round-robin discussion orchestrator |
| `backend/app/services/research_orch.py` | 4-agent parallel research pipeline (BROKEN) |
| `backend/app/services/portfolio.py` | Portfolio CRUD + live PnL |
| `backend/app/services/alpha_service.py` | WQ alpha field search (11/4367 fields) |
| `backend/app/services/analysis/scoring.py` | Composite scoring (returns {}) |
| `backend/app/services/analysis/signals.py` | Signal detection (134 per stock — noisy) |
| `backend/app/agent/tools_definitions.py` | 6 agent tools |
| `backend/app/backtest/engine.py` | Vectorized backtest 3 strategies |
| `docs/HANDOVER.md` | **Start here**: gap analysis, fix priorities |
| `docs/API_CONTRACT.md` | MVP API spec (OUTDATED — new endpoints undocumented) |

## What's actually BROKEN that needs fixing

Priority order:
1. Zero tests on all new features
2. Portfolio HK/US PnL: non-A-share positions show cost basis
3. API contract doc only covers MVP endpoints

**Recently FIXED** (Jul 25):
- Research pipeline: 4-agent SSE produces structured reports ✅
- HK/US stocks now work (00700/AAPL → correct price) ✅
- WQ field DB: 4367 fields loaded (was 11) ✅
- Analysis scoring: composite_score returns real values ✅  
- Signals: deduped from 134→5 per stock ✅

Full details: `docs/HANDOVER.md`

## Data sources

| Source | Coverage | Auth |
|--------|----------|------|
| Tencent qt.gtimg.cn | A-share realtime | None |
| Sina hq.sinajs.cn | A-share realtime (backup) | Referer |
| EastMoney search | A-share search | None |
| Sina kline API | A-share daily/minutely | None |
| DeepSeek API | LLM | sk-xxx in .env |

## Test creds

```env
DEEPSEEK_API_KEY=REMOVED
DEEPSEEK_BASE_URL=https://api.deepseek.com
DEFAULT_MODEL=deepseek-v4-flash
```

## Target user

Non-technical Chinese finance/investment users. All UI in Chinese. Avoid CLI/terminal requirements. Everything must be accessible through the web interface.
