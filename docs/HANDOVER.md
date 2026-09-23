# FinQuant Hub — Engineering Status & Handover

> Harrison-style: no sugar, just signal. What works, what doesn't, what needs attention.

## 2026-09-07 UX fixes (verification in progress)

- Model setup: direct encrypted keys reused; Base URL/full chat URL normalization; unsaved provider model discovery; actionable redacted errors. No schema or dependency changes.
- Local development without MASTER_KEY now persists the Fernet key at `backend/data/.credential-key` (beside the configured database). Back up this file with the database, keep it private, and never commit it. Explicit MASTER_KEY retains priority; production still requires it. Credentials encrypted with a previous process-only key must be saved again.
- Deterministic tests and full gate evidence: `docs/ai/UX_FIX_EVIDENCE_20260907.md` (filled as each block finishes).

## 2026-08-08 Local Docker MVP

- `docker-compose.local.yml` runs the built React frontend and FastAPI backend entirely in Docker at `http://127.0.0.1:5173`.
- `LOCAL_ONLY_MODE=true` uses one automatic internal owner; email-code and session login are bypassed, while `user_id` ownership and Fernet credential encryption remain intact.
- Production refuses `LOCAL_ONLY_MODE`; the original authenticated public deployment path remains available.
- `scripts/local.ps1 up` generates a private `.env.local` master key on first use. The named SQLite volume survives ordinary `down` operations.

## 2026-08-06 TASK-026 Current Validation

- Real Docker/Vite E2E passed with `userA@test.local` and `userB@test.local` on an isolated temporary SQLite database.
- All 22 business routers now inherit the session dependency at registration; anonymous router sentinels return 401.
- Portfolio/report/thesis/alert list isolation passed both ways; cross-owner direct IDs return 404.
- Vite now preserves Host so authenticated browser writes pass strict same-origin CSRF checks without weakening middleware.
- Full gates: 369 backend tests / 83.45% coverage, Ruff clean, mypy clean, 30 frontend tests, Playwright 1/1, production build successful.
- Evidence and exact checklist: `docs/ai/E2E_VALIDATION.md`.

The historical sections below predate TASK-021–026 and contain stale counts/auth statements; use the snapshot above and current architecture docs as authoritative.

## Quick Base

| Metric | Value |
|--------|-------|
| Location | `E:\Code_file\Projects\finquant-hub` |
| Git | 5 commits, no remote |
| Backend | 42 `.py` files, 35 API routes |
| Frontend | 9 pages, React 18 + Vite 6 + AntD 5 |
| DB | SQLite 15 tables, WAL mode |
| Backend tests | 122 pass (全部新子系统已覆盖) |
| Frontend build | ✓ built (vendor-antd 分包) |
| Architecture | 6 参考项目统一完成 |
| Next step | Codex App 中继续开发调试 |

## Verified Working (✅)

### Canonical ticker contract (Sep 4)
- Internal ticker shape is now strict and shared across backend/frontend: `sh|sz|hk|us` prefix, 5-digit HK padding, uppercase US symbols, and `.` class separators canonicalized to Yahoo `-` (`BRK.B`/`BRK-B` → `usBRK-B`). External US/Yahoo output remains `BRK-B`; HK external/Yahoo outputs are `00700.HK`/`0700.HK`.
- Unsupported 6-digit segments outside `6`/`0`/`3` (including `830799`, `920002`, `430047`, forged `sh`/`sz` or exchange suffixes, and `bj`) now raise `暂不支持该股票代码段`; no BSE/new-segment provider was added and no input is silently guessed as Shanghai.
- BACKLOG-028 added a backend normalize/external/Yahoo matrix, the shared frontend `tickerContract.ts`, four purpose-preserving callers, and six deterministic real-8000 input journeys. Final gates: backend 837/837 at 92.41%, Ruff; frontend build 4,243 modules and Vitest 122/374; 8000 21/21 ×3 with retries 0 and proxy off/on; unchanged 4173 E2E 50/50; i18n parity 0. No deletion, dependency/lock change, commit, or push.

### 8000 Knowledge same-origin iframe (Sep 4)
- `SecurityMiddleware` 的全局响应头为 `Content-Security-Policy: ... frame-ancestors 'self' ...` 与 `X-Frame-Options: SAMEORIGIN`：允许应用自身嵌入知识 HTML，同时继续拒绝第三方站点 frame 嵌入。
- 真实 `SERVE_FRONTEND=1` 入口下，中文 `/knowledge` 的 `/knowledge/m1-移动平均策略.html` iframe 可见并渲染“移动平均策略”正文；独立浏览器探针得到 `pageErrors=[]`，framing/localStorage 错误为 0。
- BACKLOG-027 已删除 8000 E2E 的已知错误容忍分支并恢复严格零 pageerror；15/15 ×3、代理关/开各 15/15，以及 4173 50/50、build、Vitest 121/346、backend 798/92.34%、Ruff 全绿。

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

### WQ Alpha
- Full 4,367-field catalogue remains available from `/api/wq/fields` → ✅
- Search defaults to 10 and is hard-capped at 100 results → ✅

---

## Broken, Incorrect, or Half-Baked (🔥)

### 🔥 Market: HK/US stocks DO NOT WORK → FIXED (Jul 25 04:30)
- `00700` (Tencent) → ✅ price=434.6  
- `AAPL` (Apple) → ✅ price=333.02  
- `9988` (Alibaba HK) → ✅  
- **Root cause**: `detect_market()` only handled A-shares (6-digit → sh/sz). Added HK (4-5 digit → hk) and US (1-5 alpha → us) detection. Tencent API natively supports `hk` and `us` prefixes — was already working, just wrong prefix.
- **Fix**: 10-line change in `market_data.py:detect_market()`

### 🔥 WQ Field DB: 11 fields loaded instead of 4367 → FIXED (Jul 25 04:30)
- `GET /api/wq/fields` returns 4367 items now ✅
- `GET /api/wq/categories` returns 7 groups ✅
- **Root cause**: `_load_wq_fields()` had `@lru_cache` — the data file was copied to disk after the service module was already imported, so the cache stored the empty result permanently.
- **Fix**: Removed `@lru_cache` from `_load_wq_fields()`. Data is small enough (1.5MB) to load fresh each time.

### 🔥 Analysis Scoring: Returns empty dict → FIXED (was audit bug)
- `GET /api/analysis/sh600519/indicators` → `"scoring": {"composite_score": -11.5, ...}` ✅
- **Root cause**: The audit script checked `d.get('score')` but the actual key is `d.get('scoring')`. The router was calling `composite_score()` correctly all along.
- Score components: trend (-33.9), momentum (+6.1), volume (-0.1) → composite -11.5

### 🔥 Analysis 134 Signals: Suspect count → FIXED (Jul 25 04:30)
- Now returns exactly **5 signals** per stock (deduped to 1 per type within last 20 bars)
- Types: golden_cross, breakout_up, rsi_overbought, volume_surge, bottom_divergence
- `_recent_unique()` was working correctly. Earlier 134 was from testing against old backend before schema refresh.

### 🔥 Analysis SSE Research Pipeline: Agents crash silently → FIXED (Jul 25 04:40)
- `POST /api/analysis/stock` → 4 agents all complete, structured report generated ✅
- Events: agent_started(4), tool_call(32), agent_completed(4), report_progress(12), done(1)
- Agent outputs: 1022-2337 chars each, differentiated viewpoints
- **Root cause**: DeepSeek "thinking mode" returns `reasoning_content` on the assistant message. When this field is stripped from the subsequent call, DeepSeek returns 400 "must be passed back." When PRESENT in the tool_call dict (misplaced by `chat_with_tools_safe` line 145 adding it per-tool_call), the message reconstruction in `research_orch._call_agent` needs to properly preserve it at the message level.
- **Fix**: `_sanitize_messages` no longer strips `reasoning_content`. The research agent loop preserves `reasoning_content` from the response message in the assistant message sent back to the API.
- **To verify**: `POST /api/analysis/stock {"ticker":"600519"}` → SSE stream completes with `done` event containing full report.

### ✅ Research Pipeline: Durable terminal states (Jul 29)
- Interactive and scheduled research both persist report/event history → ✅
- `running → completed/failed` transitions are checked; failed completion writes cannot leave a report stuck in `running` → ✅
- Scheduled execution is opt-in, bounded, and configurable by local hour/minute → ✅

### 🔥 Portfolio: HK/US positions show $0 PnL
- Portfolio PnL only works for A-shares because it queries Tencent API. HK/US positions return `current_price=avg_cost` → PnL shows $0.
- **Fix needed**: Implement Yahoo Finance fallback for non-A-share tickers in `portfolio.py` `calc_pnl()`.

### ✅ Portfolio: Dead code cleaned (Jul 28)
- `_tencent_code()` and `_parse_tencent_map()` removed; `ensure_tables()` + `PORTFOLIO_SCHEMA` removed; lazy imports documented.
- **Fix**: Codex, 2026-07-28.

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

## No Test Coverage (remaining gaps)

All 122 existing tests now cover:
- MVP routes ✅ (20 tests)
- Indicators + market parsers ✅ (19 tests)
- Backtest engine (unified) ✅ (8 tests)
- Scoring composite + sub-scores ✅ (4 tests)
- ToolRegistry singleton ✅ (3 tests)
- Signal detection + boundary ✅ (6 tests)
- Agent tools execution ✅ (7 tests)
- Market fallback + normalize_code ✅ (6 tests)
- Alpha search + empty query ✅ (6 tests)
- Portfolio PnL + multi-market ✅ (2 tests)
- Instruments parser ✅ (updated)
- Research persistence + terminal-state failures ✅
- Scheduled research persistence, concurrency and failure paths ✅
- One-time ticker migration marker ✅

**Remaining coverage gaps:**
- Live external-source integration beyond mocked deterministic tests
- Browser-level visual regression for chart components

## API 不一致待修

Codex 写测试时发现的当前接口问题，已知但暂不改：

| 工具 | 问题 |
|------|------|
| VerifyValuation.run() | 要求显式传 `price`，无缺省值；输出不含 `market_cap` |
| SearchNews.run() | 要求显式传 `keyword`，无缺省值（通用搜索应允许不传 keyword） |
| CalculateByFinancialRigor.run() | 只接受纯数值表达式，股票代码 `/AAPL US/` 被拒绝 |
| alpha_service | 函数名为 `search_alpha` 非 `search_fields` |

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
P0 — Research pipeline agents        FIXED — 4 agents complete, structured report output
P0 — Multi-market (HK/US)            FIXED — detect_market() 10-line change
P0 — Analysis scoring                 FIXED — was always working, audit bug
P1 — WQ field DB load                 FIXED — removed @lru_cache, 4367 fields now load
P1 — Signal dedup                     FIXED — 134→5 signals, _recent_unique working correctly
P1 — Test coverage for new code       all new subsystems have ZERO tests
P2 — Portfolio HK/US PnL              non-A-share positions show cost basis (minor)
P2 — Frontend bundle size             1.6MB single chunk
P3 — Backend test with new schema     38 tests irrelevant for new features
P3 — API contract doc outdated        new endpoints undocumented
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
