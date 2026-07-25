# FinQuant Hub — Engineering Status & Handover

> Harrison-style: no sugar, just signal. What works, what doesn't, what needs attention.

## Quick Base

| Metric | Value |
|--------|-------|
| Location | `E:\Code_file\Projects\finquant-hub` |
| Git | 5 commits, no remote |
| Backend | 42 `.py` files, 35 API routes |
| Frontend | 9 pages, React 18 + Vite 6 + AntD 5 |
| DB | SQLite 15 tables, WAL mode |
| Backend tests | 38 pass (all from MVP phase, NONE cover new features) |
| Frontend build | tsc + vite → zero errors, 1.6MB bundle |

## Verified Working (✅)

### Core Infrastructure
- FastAPI lifespan: boot, init DB, seed data → ✅
- SQLite WAL + foreign keys → ✅
- CORS for localhost:5173 → ✅
- Health endpoint → ✅

### Market Data (A-share only)
- EastMoney stock search → ✅ (`600519` → 贵州茅台)
- Tencent real-time quote → ✅ (price, change%, PE, PB, etc.)
- Tencent → Sina auto-fallback → ✅ (tested with mock)
- K-line (Sina primary → Tencent backup) → ✅ (up to 800 bars)
- All 7 technical indicators (numpy) → ✅ (MA/MACD/RSI/KDJ/BOLL/ATR/VolMA)
- Decoding: GBK for Tencent/Sina, UTF-8 for EastMoney → ✅
- `trust_env=False` bypasses system proxy (Clash on :7897) → ✅

### LLM & Chat
- DeepSeek v4-flash connectivity → ✅ (avg 2s latency through proxy)
- Non-streaming `chat()` → ✅
- Streaming `chat_stream()` → ✅ (SSE via sse-starlette)
- Tool-use `chat_with_tools()` → ✅ (function_calling via DeepSeek native support)
- `sanitize_messages()` strips `reasoning_content` field → ✅ (fixes 400 error)
- SSE event flow: session create → message send → tokens → done → ✅
- History persistence → ✅
- Role switching mid-conversation → ✅
- Auto-title from first user message → ✅

### Multi-Agent Discussion
- 6 preset roles with authentic prompts → ✅
  (value_investor, tech_analyst, quant_researcher, risk_manager, macro_strategist, sentiment_analyst)
- Round-robin: create room → start SSE → agents speak in order → summary → done → ✅
- Market context injection (extract 6-digit code from topic) → ✅
- Discussion persistence + history replay → ✅
- Done-room restart rejected (409) → ✅

### Agent Tools
- 6 tools registered and verifiable → ✅
  (get_stock_data, calculate_indicators, verify_valuation, screen_stocks, search_news, calculate_by_financial_rigor)
- BaseTool ABC + ToolRegistry singleton → ✅
- OpenAI function_calling format converter → ✅

### Management
- Model CRUD (create/update/delete/test/set-default) → ✅
- Agent preset CRUD (L10N role names, error on duplicate) → ✅
- Dashboard stats aggregation → ✅

### Portfolio (A-share only)
- Portfolio group CRUD → ✅
- Position add/edit → ✅
- **Live PnL calculation** → ✅ (queries Tencent for each position's current price)
  - 600519: cost=180000, market_val=129741, PnL=-50259 (-27.92%) ← verified

### Backtest Engine
- Vectorized (numpy) → ✅
- 3 strategies: `ma_cross`, `rsi_reversal`, `bollinger_breakout` → ✅
- Metrics: total_return, annual_return, volatility, Sharpe, max_drawdown, win_rate, trade_count → ✅
- Example: 600519 ma_cross 100d → Sharpe 0.21, return 3.3%, drawdown 2.58% → ✅
- Result persistence + retrieval → ✅

### WQ Alpha (partial — see broken)
- Field DB loaded into service → ⚠️ (11 items only, not 4367)
- Category endpoint returns 6 groups → ⚠️ (but wrong data)

---

## Broken, Incorrect, or Half-Baked (🔥)

### 🔥 Market: HK/US stocks DO NOT WORK
- `00700` (Tencent) → ❌ `price=0, name=""`
- `AAPL` → ❌ `price=0, name=""`
- `9988` (Alibaba HK) → ❌ `price=0, name=""`
- **Root cause**: Tencent/Sina APIs only cover A-shares. Yahoo Finance provider exists in `providers/yahoo.py` concept but was never implemented.
- **Impact**: The system claims multi-market support (architecture doc talks about it) but in practice only A-shares work. For a "global finance" audience this is a hard blocker.
- **Fix needed**: Implement Yahoo Finance v8 API adapter (`/v8/finance/chart/{ticker}` range=1d for quote, range=1y for kline). A-share tickers need `.SS`/`.SZ` suffix. Register in ProviderRegistry fallback chain.

### 🔥 WQ Field DB: 11 fields loaded instead of 4367
- `GET /api/wq/fields` returns only 11 items (the 11 alpha formulas from the hardcoded list in alpha_service.py)
- `GET /api/wq/search?q=pe_ratio` returns 0 results
- **Root cause**: `alpha_service.py` has a hardcoded `_formulas` dict of 11 alpha expressions. The actual 4367-field JSON (`data/wq_fields.json`, 2.7MB) is never loaded — the service class has `_load_fields()` method referencing `data/wq_fields.json` but this loading probably failed silently or was never called at startup.
- **Fix needed**: Load wq_fields.json into memory at service init, build search index. The original `evolve_skill.py` from wq-alpha-research had a search pattern — port it.

### 🔥 Analysis Scoring: Returns empty dict
- `GET /api/analysis/sh600519/indicators` → `"score": {}`
- **Root cause**: `analysis/scoring.py` defines `composite_score()` function but `analysis.py` router never calls it, or calls it without proper arguments. The signal detection works (134 signals found) but scoring isn't wired.
- **Fix needed**: Wire `composite_score()` → compute `trend_strength` + `momentum_score` + `volume_score` → merge into response. Stock-analyzer repo has the reference implementation.

### 🔥 Analysis 134 Signals: Suspect count
- 134 signals detected for a single stock is unrealistic. Likely signal duplication across overlapping detection windows (e.g., every bar generates a breakout signal against an N-day lookback).
- **Root cause**: `signals.py` `detect_all()` iterates every bar and generates signals even for non-events. No minimum-strength filter.
- **Fix needed**: Add signal confidence threshold. Deduplicate overlapping signals.

### 🔥 Analysis SSE Research Pipeline: Agents crash silently
- `POST /api/analysis/stock` starts SSE stream, emits 4 `agent_started` events, then 4 `error` events — all 4 agents fail during tool-use round.
- **Root cause**: After the `reasoning_content` fix, need to re-test. The agents might still fail because:
  - Tool call results format doesn't match DeepSeek expectations
  - `json.loads(func["arguments"])` might fail on malformed arguments
  - verify_valuation and screen_stocks tools might not have valid data sources
- **Impact**: The multi-agent research feature (main selling point) doesn't produce results.
- **Fix needed**: Debug the exact error. Test each tool individually. Consider simplifying agent workflow to single-LLM-call-per-agent (no tool-use loop) for MVP reliability.

### 🔥 Research Pipeline: Same engine as Analysis
- `POST /api/research` uses the same `research_orch.run_research()` → same failure mode as analysis/stock.
- **Fix needed**: Same as above.

### 🔥 Portfolio: HK/US positions show $0 PnL
- Portfolio PnL only works for A-shares because it queries Tencent API. HK/US positions return `current_price=avg_cost` → PnL shows $0.
- **Fix needed**: Implement Yahoo Finance fallback for non-A-share tickers in `portfolio.py` `calc_pnl()`.

### 🔥 Stock Screener: Two-stage pattern but untested
- `tools/stock_screener.py` (12.5KB) was created by agent but never executed. Methods might work, data sources might fail.
- Has import-time API calls? If so, module import could hang/throw.
- **Fix needed**: Unit test: call `screen('ma_cross')` against real market data and verify output shape.

### 🔥 Frontend StockAnalysis: Chart rendering untested
- The page at `/analysis/sh600519` renders stat rows and signal badges (verified via browser snapshot), but the lightweight-charts K-line + indicator subpanels were not visually verified.
- The `analysisApi.ts` fetches `/api/market/kline` + `/api/market/indicators` + `/api/analysis/sh600519/indicators` but the chart component integration might have rendering glitches.
- **Fix needed**: Open the page, screenshot, verify chart renders. Check browser console for errors.

### 🔥 Frontend Research: SSE event handling assumptions
- `Research.tsx` renders progress stages for `agent_started`/`agent_completed` events. But these events currently carry errors immediately.
- The markdown report rendering area exists but will never receive non-error content.
- **Fix needed**: Fix backend first, then verify frontend renders the report markdown correctly.

### 🔥 Frontend Portfolio: Async loading hangs
- Snapshot shows "加载中..." text for loading states. If the backend portfolio endpoints return data correctly, probably fine. But if any endpoint hangs or throws, the page stays in loading state.
- **Fix needed**: Add error boundaries and timeout UI.

### 🔥 Frontend Bundle: 1.6MB (1 file)
- `assets/index-DimkJVTb.js` 1.6MB / 530KB gzip — AntD is fully included. No code-splitting, no lazy loading.
- **Fix needed**: Add dynamic imports for routes: `React.lazy(() => import('./pages/StockAnalysis'))`. Set up `build.rollupOptions.output.manualChunks`.

---

## No Test Coverage (everything new)

All 38 existing pytest tests cover only the MVP phase features:
- `test_indicators.py` — MA, MACD, RSI, KDJ, BOLL, ATR, compute() (12 tests) ✅
- `test_market.py` — parsers, fallback chains (6 tests) ✅
- `test_api.py` — health, models CRUD, agents CRUD, chat flow, discussion flow, dashboard (20 tests) ✅

**Zero tests cover:**
- Agent tools (tool execution, tool_calls format, DeepSeek function_calling response parsing)
- Analysis pipeline (scoring, signal detection, ticker resolution)
- Research orchestrator (4-agent parallel, tool-use loop, SSE event sequence)
- Portfolio (PnL calculation, trade recording)
- Backtest engines (ma_cross returns vs rsi_reversal)
- WQ alpha (field search, correlation calculation)
- Market multi-source (Yahoo Finance, Alpha Vantage, Finnhub)

---

## Design Issues & Tech Debt

### Proxy Architecture
- Market data uses `trust_env=False` (bypasses user's Clash proxy on :7897). Correct for Chinese APIs, but DeepSeek API goes through the proxy. If proxy goes down, the LLM client breaks while market data keeps working. Consider configurable proxy settings.

### LLM Session Mismanagement
- `LLMClient` creates a new `httpx.AsyncClient` for every API call (line 84). No connection pooling. For the 4-agent research pipeline, this means 4+ parallel TCP handshakes. Add connection reuse.

### Database: Raw SQL with no migration
- Schema is `CREATE TABLE IF NOT EXISTS` in a string. No migration support. Schema changes require dropping DB or hand-written ALTER TABLE.
- Database schema exists in both `database.py` AND inline in `backtest.py` router (duplicate `CREATE TABLE`). Inconsistent.

### Frontend-Backed API Contract Drift
- `docs/API_CONTRACT.md` was written for the MVP phase. New endpoints (analysis, research, portfolio, backtest, WQ) were built by agents without updating the contract doc. The new API response shapes are undocumented.
- Frontend `types/index.ts` has types for the new endpoints but they may not match actual backend responses.

### No Authentication, No Rate Limiting
- Currently zero auth, zero rate limiting. Fine for local personal use. If deployed, needs at minimum a basic auth layer.

### WQ Field Data Licensing
- `backend/app/data/wq_fields.json` (2.7MB) is copied from wq-alpha-research, which sources from WorldQuant BRAIN. Check license compatibility before redistribution.

---

## Quick Fix Priority

```
P0 — Multi-market (HK/US)        multi-market feature is promised but non-functional
P0 — Analysis scoring             feature is a shell
P1 — WQ field DB load             4367 fields → only 11 loaded
P1 — Research pipeline agents     main selling feature silently fails
P1 — Test coverage for new code   all new subsystems have ZERO tests
P2 — Signal dedup                 134 signals per stock is noise
P2 — Portfolio HK/US PnL          non-A-share positions show $0 PnL
P2 — Frontend bundle size         1.6MB single chunk
P3 — Backend test with new schema 38 tests irrelevant for new features
P3 — API contract doc outdated    new endpoints undocumented
P3 — Connection pooling           4 parallel agents = 4 parallel TCP
```

---

## How to Resume

```bash
cd E:\Code_file\Projects\finquant-hub

# Backend
cd backend
.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload

# Frontend (separate terminal)
cd frontend
bun run dev      # → http://localhost:5173
bun run build    # verify build before PR

# Tests
.venv\Scripts\python.exe -m pytest tests/ -q   # 38 pass (MVP only)
```

Key files to start with:
- `backend/app/services/market_data.py` — add Yahoo Finance adapter
- `backend/app/services/alpha_service.py` — fix field DB loading
- `backend/app/services/analysis/scoring.py` — wire composite_score
- `backend/app/services/analysis/signals.py` — add signal confidence filter
- `backend/app/services/research_orch.py` — debug agent tool-loop failures
- `backend/app/services/portfolio.py` — add Yahoo Finance fallback for PnL
