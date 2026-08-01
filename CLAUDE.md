# CLAUDE.md — FinQuant Hub

## What this is

Personal multi-module financial quant research system for non-technical investors.
Full-stack (FastAPI + React) web app running locally on Windows 11.

**角色**：架构师、Harness 治理、任务拆分、Codex 验收。不直接实现大规模代码。

**开始新会话时先读**：`docs/ai/EXEC_PLAN.md` 了解当前任务状态。

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
# Lint
cd backend && .venv\Scripts\python.exe -m ruff check .
```

## Architecture

FastAPI lifespan → aiosqlite WAL single connection → 20 routers (see `docs/ROUTER_MAP.md`) → Vite proxy → React 18 + AntD 5 + lightweight-charts. 6 SSE pipelines, 13 local Agent tools (DeepSeek function_calling), configurable market/news/fundamental source chains (`docs/DATA_SOURCES.md`). Full detail at `docs/ARCHITECTURE.md`.

### Architecture invariants (violations cause regression)

- **No ORM**: all DB via aiosqlite raw SQL, no SQLAlchemy or other ORM layer
- **No connection pool**: single aiosqlite connection, get_db() asserts global _db
- **No separate DAL**: routers call database.query_one/query_all/execute directly
- **No WebSocket**: all real-time comm via SSE (sse-starlette), 7 public endpoints across 6 pipelines
- **No auth/authz**: zero authentication, no login/session/JWT
- **No SSR**: pure CSR — Vite proxy dev, static build prod
- **Base research agents are independent**: `research_orch` has no debate/cross-ref; Swarm DAG teams may pass prior-node context
- **No DI container**: MarketDataService injected via request.app.state.market (manual)
- A single axios instance (api.ts) serves all frontend requests
- Chinese data sources (Tencent/Sina) use trust_env=False to bypass proxy; Yahoo uses trust_env=True
- ToolRegistry is a singleton (__new__); tools_definitions.py creates one module-level instance

### Service layer dependency rules

```
编排器 (research_orch, discussion_orch) → I/O 服务 (market_data, llm_client) → 纯逻辑服务 (indicators, scoring, signals, alpha_service)
```
Pure-logic services have zero I/O dependencies — unit-testable without mocking.

## Key files

| File | What |
|------|------|
| database.py | Centralized 28-table initialization, schema version 7, query helpers |
| market_data.py | Tencent/Sina/EastMoney/Yahoo adapter + configurable fallback, circuit breaker, completion/prefetch |
| backtest/engine.py | Legacy close-only vectorized backtest, 3 strategies |
| backtest/ma_crossover.py | v2 next-open backtest with A-share execution rules and validation |
| research_orch.py | 4-agent parallel research → team-lead → unified 13-chapter report |
| llm_client.py | OpenAI-compatible client, 5 chat methods |
| indicators.py | 7 numpy indicators (A-share SMA conventions, through MA250/VolMA10) |
| tools_definitions.py | 9 local BaseTool subtypes + ToolRegistry singleton |
| alpha_service.py | WQ alpha field search (4367 fields) |
| docs/ARCHITECTURE.md | Full architecture doc (start here) |
| docs/API_CONTRACT.md | 114-endpoint API catalog (update on endpoint change) |
| docs/HANDOVER.md | Gap analysis, fix priorities |
| docs/ROUTER_MAP.md | All 20 routers |
| docs/DATA_SOURCES.md | Data source matrix |

## Known technical debt (short term)

1. Canonical ticker normalization and provider-specific `external_symbol()` still need a sharper boundary
2. Centralized schema creation still uses hand-written incremental migrations
3. Two portfolio table sets remain: portfolios/positions (active) vs portfolio_groups/portfolio_items (legacy)
4. Preserve the enforced SSE `try/finally` cleanup and structured exception logging discipline

## Doc sync rule (read before any code change)

After ANY code change (add/delete/modify endpoint, service, table, component):
1. If you added/changed an API endpoint → update `docs/API_CONTRACT.md` (route table)
2. If you added a new router or changed architecture → update `docs/ARCHITECTURE.md`
3. If you added a new table or changed schema → update the SCHEMA in `docs/ARCHITECTURE.md`
4. If you fixed a known bug → update `docs/HANDOVER.md` (move from Broken to Verified Working)
5. If you introduced a new concept/pattern → write a memory file (`memory/`)
6. If you changed setup/commands → update CLAUDE.md Quick commands and `README.md`

Changes that DON'T need doc sync: pure refactoring without API change, test additions, comment/docstring edits.

## Change record convention

After each session, append to `task/CHANGELOG.md`:
```markdown
## YYYY-MM-DD
- What changed: [file paths]
- Why: [reason]
- Docs updated: [which docs]
- Risk: [low/medium/high]
```

## Target user

Non-technical Chinese finance/investment users. All UI in Chinese. Avoid CLI/terminal.
