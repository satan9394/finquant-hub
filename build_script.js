// Workflow: Build FinQuant Hub enhanced subsystems
// Using concat strings to avoid backtick nesting issues

export const meta = {
  name: 'build-finquant-hub-enhanced',
  description: 'Build enhanced FinQuant Hub: provider layer, agent tools, analysis, reports, portfolio, frontend',
  phases: [
    { title: 'Core', detail: 'Infrastructure + Agent tools' },
    { title: 'Services', detail: 'Analysis + Reports + Portfolio + Alpha' },
    { title: 'Frontend', detail: 'Analysis page + Research + Portfolio' },
  ],
}

const B = 'E:/Code_file/Projects/finquant-hub'

// Phase 1: Database schema extension + ProviderRegistry + Token Service
phase('Core')
log('=== Phase 1-2: Core infrastructure ===')

// Build database.py extension with new tables
const dbExt = [
  "// Agent execution history",
  "CREATE TABLE IF NOT EXISTS agent_runs (",
  "    id INTEGER PRIMARY KEY AUTOINCREMENT,",
  "    session_id TEXT NOT NULL,",
  "    agent_role_key TEXT NOT NULL,",
  "    tool_calls TEXT,",
  "    token_usage INTEGER,",
  "    started_at TEXT,",
  "    completed_at TEXT",
  ");",
  "",
  "// Analysis reports",
  "CREATE TABLE IF NOT EXISTS analysis_reports (",
  "    id INTEGER PRIMARY KEY AUTOINCREMENT,",
  "    ticker TEXT NOT NULL,",
  "    market TEXT,",
  "    summary TEXT,",
  "    score REAL,",
  "    signals TEXT,",
  "    indicators_snapshot TEXT,",
  "    chapters TEXT,",
  "    model_id INTEGER,",
  "    created_at TEXT DEFAULT (datetime('now'))",
  ");",
  "",
  "// Research reports (multi-agent)",
  "CREATE TABLE IF NOT EXISTS research_reports (",
  "    id INTEGER PRIMARY KEY AUTOINCREMENT,",
  "    topic TEXT NOT NULL,",
  "    ticker TEXT,",
  "    status TEXT DEFAULT 'pending',",
  "    agents_config TEXT,",
  "    information_richness TEXT,",
  "    bias_declaration TEXT,",
  "    final_report TEXT,",
  "    model_id INTEGER,",
  "    created_at TEXT DEFAULT (datetime('now')),",
  "    updated_at TEXT DEFAULT (datetime('now'))",
  ");",
  "",
  "// Signal detections",
  "CREATE TABLE IF NOT EXISTS analysis_signals (",
  "    id INTEGER PRIMARY KEY AUTOINCREMENT,",
  "    ticker TEXT NOT NULL,",
  "    signal_type TEXT NOT NULL,",
  "    direction TEXT,",
  "    strength REAL,",
  "    detected_at TEXT DEFAULT (datetime('now')),",
  "    expiry TEXT,",
  "    description TEXT",
  ");",
  "",
  "// Portfolio",
  "CREATE TABLE IF NOT EXISTS portfolio_groups (",
  "    id INTEGER PRIMARY KEY AUTOINCREMENT,",
  "    name TEXT NOT NULL,",
  "    description TEXT,",
  "    created_at TEXT DEFAULT (datetime('now'))",
  ");",
  "CREATE TABLE IF NOT EXISTS portfolio_items (",
  "    id INTEGER PRIMARY KEY AUTOINCREMENT,",
  "    group_id INTEGER,",
  "    ticker TEXT NOT NULL,",
  "    name TEXT,",
  "    shares REAL,",
  "    avg_cost REAL,",
  "    currency TEXT DEFAULT 'CNY',",
  "    added_at TEXT DEFAULT (datetime('now')),",
  "    FOREIGN KEY (group_id) REFERENCES portfolio_groups(id)",
  ");",
  "CREATE TABLE IF NOT EXISTS portfolio_trades (",
  "    id INTEGER PRIMARY KEY AUTOINCREMENT,",
  "    item_id INTEGER,",
  "    action TEXT NOT NULL,",
  "    shares REAL,",
  "    price REAL,",
  "    total REAL,",
  "    traded_at TEXT,",
  "    note TEXT,",
  "    created_at TEXT DEFAULT (datetime('now')),",
  "    FOREIGN KEY (item_id) REFERENCES portfolio_items(id)",
  ");",
].join('\n')

log('Schema prepared: ' + (dbExt.match(/CREATE TABLE/g) || []).length + ' new tables')

// Build Agent tools system
const toolAgent = await agent(B + '\n\nBuild these files now:\n\n' +
  '1. backend/app/agent/tools.py — BaseTool ABC + ToolRegistry\n\n' +
  '2. backend/app/agent/tools_definitions.py — Concrete tools:\n' +
  '   - GetStockData: fetch live quote for a ticker\n' +
  '   - CalculateIndicators: compute technical indicators\n' +
  '   - VerifyValuation: wrap financial_rigor calculations\n' +
  '   - ScreenStocks: basic stock screener\n' +
  '   - SearchNews: web search for stock-related news\n' +
  '   - CalculateByFinancialRigor: exact arithmetic/valuation from financial_rigor.py\n\n' +
  '3. backend/app/services/analysis/ticker.py — resolve_ticker() function\n' +
  '   A 6-digit -> sh/sz detect; HK 4-5 -> hk; US 1-5 -> passthrough; name search fallback\n\n' +
  '4. backend/app/services/analysis/signals.py — signal detection\n' +
  '   golden_cross, death_cross, divergence, breakout, volume_surge, rsi_oversold/ob\n\n' +
  '5. backend/app/services/analysis/scoring.py — composite indicator scoring\n' +
  '   trend_strength, momentum_score, volume_score -> composite -100 to +100\n\n' +
  '6. backend/app/routers/analysis.py — analysis API endpoints\n' +
  '   POST /api/analysis/stock {ticker} -> full analysis\n' +
  '   GET /api/analysis/{ticker}/indicators -> indicators + scoring\n' +
  '   GET /api/analysis/{ticker}/chart-data -> lightweight-charts data\n\n' +
  '7. backend/app/services/research_orch.py — multi-agent parallel research pipeline\n' +
  '   4 agents (business_analyst, financial_analyst, industry_researcher, risk_assessor)\n' +
  '   Each with tool-use capability via ToolRegistry\n' +
  '   Yields SSE events: agent_started, tool_call, agent_completed, report_progress, done\n\n' +
  '8. backend/app/services/portfolio.py — portfolio CRUD + realtime P&L calc\n\n' +
  '9. backend/app/routers/portfolio.py — portfolio API endpoints\n\n' +
  '10. backend/app/services/alpha_service.py — WQ alpha field search + correlation\n\n' +
  '11. backend/app/routers/wq.py — WQ alpha endpoints\n\n' +
  '12. backend/app/prompts/research_roles.py — 4 research agent prompts (Chinese)\n\n' +
  '13. backend/app/prompts/research_memo_prompt.py — 11-section report template\n\n' +
  'IMPORTANT: Every .py file must be syntactically valid. Run python -m py_compile on each.\n' +
  'Write with Chinese text for non-technical users. Use existing project imports.\n' +
  'The project has: backend/app/services/llm_client.py with LLMClient class.\n' +
  'Add method chat_with_tools to LLMClient that handles tool_use/function_calling.\n' +
  'DeepSeek v4-flash supports OpenAI function_calling (already verified).', {
  label: 'tools-and-analysis',
  phase: 'Core',
  agentType: 'general-purpose',
  effort: 'max',
})

log('Core agent tools + analysis done.')

// Phase 2: Research pipeline + Portfolio + WQ
phase('Services')

const serviceAgent = await agent(B + '\n\nBuild research and portfolio services.\nAlready built in previous step: tools.py, tools_definitions.py, analysis/services, signals, scoring, portfolios, WQ.\n\n' +
  'Now build the remaining services:\n\n' +
  '1. backend/app/routers/research.py — Research API\n' +
  '   POST /api/research {ticker} -> SSE stream with research progress\n' +
  '   GET /api/research -> list reports\n' +
  '   GET /api/research/{id} -> get report\n\n' +
  '2. backend/app/routers/backtest.py — Backtest API\n' +
  '   POST /api/backtest/runs {ticker, strategy_type, periods} -> backtest result\n' +
  '   GET /api/backtest/runs -> list runs\n' +
  '   GET /api/backtest/runs/{id} -> run details\n\n' +
  '3. backend/app/backtest/engine.py — Simple vectorized backtest engine\n' +
  '   Buy/hold signals, P&L calculation, Sharpe/returns/max_drawdown\n' +
  '   Strategy definitions: ma_cross, rsi_reversal, bollinger_breakout\n\n' +
  '4. backend/app/tools/stock_screener.py — based on ai-berkshire tools\n' +
  '   Two-stage: momentum discovery -> value scoring\n' +
  '   Output: ranked stock list with reasons\n\n' +
  '5. MODIFY backend/app/services/llm_client.py — add chat_with_tools method\n' +
  '   Handles function calling: tool_calls -> execute -> feed back -> final response\n\n' +
  '6. MODIFY backend/app/main.py — add ALL new routers\n\n' +
  '7. MODIFY backend/app/database.py — append all new CREATE TABLE IF NOT EXISTS statements\n\n' +
  'After writing ALL files, verify:\n' +
  '- cd ' + B + "/backend && .venv/Scripts/python.exe -c \"from app.main import app; print('OK')\"\n" +
  '- Check no ImportError', {
  label: 'services',
  phase: 'Services',
  agentType: 'general-purpose',
  effort: 'max',
})

log('Research + portfolio services done.')

// Phase 3: Frontend analysis + research + portfolio pages
phase('Frontend')

const frontendAgent = await agent(B + '\n\nBuild frontend analysis, research, and portfolio pages.\n\n' +
  'Current frontend: React 18 + Vite 6 + AntD 5 + lightweight-charts + zustand + axios.\n' +
  '6 pages: Dashboard Chat Discussion Knowledge Models Settings. SSE via fetch + ReadableStream.\n\n' +
  'Build these files:\n\n' +
  '1. frontend/src/pages/StockAnalysis.tsx — URL: /analysis/:ticker\n' +
  '   Search bar + price stats strip + signal badges + K-line chart with KDJ/MACD/RSI subpanels + 13-chapter accordion analysis sections\n' +
  '   Data: /api/market/quote, /api/market/kline, /api/market/indicators, POST /api/analysis/stock\n\n' +
  '2. frontend/src/pages/Research.tsx — URL: /research\n' +
  '   Ticker input + start button + 4-agent progress (animated stages) + rich markdown report output\n' +
  '   SSE events: agent_started, agent_completed, status, report_progress, done\n\n' +
  '3. frontend/src/pages/Portfolio.tsx — URL: /portfolio\n' +
  '   Group tabs + summary card (invested/current/P&L) + holdings table with live P&L colors + allocation viz + add/edit modal\n' +
  '   Data: /api/portfolio/* endpoints\n\n' +
  '4. frontend/src/services/analysisApi.ts — API client for analysis/research/portfolio\n\n' +
  '5. MODIFY frontend/src/App.tsx — add new routes:\n' +
  '   /analysis/:ticker -> StockAnalysis\n' +
  '   /research -> Research\n' +
  '   /portfolio -> Portfolio\n' +
  '   /screening -> placeholder (or redirect to Knowledge)\n\n' +
  '6. ENHANCE frontend/src/pages/Dashboard.tsx — add:\n' +
  '   Portfolio summary section (top group P&L)\n' +
  '   Signal summary (bearish/bullish counts)\n' +
  '   Quick stock analysis entry (search bar -> /analysis/:code)\n\n' +
  '7. ENHANCE frontend/src/types/index.ts — add analysis, research, portfolio, signal, screen types\n\n' +
  'All UI in Chinese, target non-technical users.\n' +
  'Verification: cd ' + B + '/frontend && bun run build (must pass with zero errors)', {
  label: 'frontend-pages',
  phase: 'Frontend',
  agentType: 'general-purpose',
  effort: 'max',
})

log('Frontend pages done.')

return {
  status: 'Build agents completed',
  db_tables: (dbExt.match(/CREATE TABLE/g) || []).length,
}
