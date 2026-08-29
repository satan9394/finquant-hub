# AGENTS.md — FinQuant Hub

**Role**: Implementation engineer. Code, test, fix, optimize. Do not change architecture.

## Before starting (read in order)

1. `HANDOFF.md` — current objective, done criteria, open blockers
2. `docs/ai/EXEC_PLAN.md` — find the highest-numbered `[READY]` task
3. That task's TASK file under `docs/ai/`

## Quick commands

```bash
# Backend tests
cd backend && .venv\Scripts\python.exe -m pytest -q

# Backend lint (ruff, line-length=120, py312 target)
cd backend && .venv\Scripts\python.exe -m ruff check .

# Frontend build (runs tsc -b then vite build)
cd frontend && bun run build

# Frontend tests
cd frontend && bun run test

# Full verification before commit
cd backend && .venv\Scripts\python.exe -m pytest -q && .venv\Scripts\python.exe -m ruff check . && cd ../frontend && bun run build
```

**No CI exists** — all checks are local. Run the above before every commit.

## Architecture (non-negotiable)

These are enforced invariants. Violations cause regression:

- **No ORM** — all DB via aiosqlite raw SQL
- **No connection pool** — single aiosqlite connection, `get_db()` asserts global `_db`
- **No separate DAL** — routers call `database.query_one/query_all/execute` directly
- **No WebSocket** — all real-time via SSE (sse-starlette)
- **No SSR** — pure CSR (Vite dev proxy / static prod build)
- **No DI container** — `MarketDataService` injected via `request.app.state.market`
- **No Agent inter-communication** — 4 research agents run independently

Full architecture: `docs/ARCHITECTURE.md`. Tech stack authority: `docs/TECH_STACK.md`.

## Project structure

```
backend/app/
  main.py           → FastAPI entrypoint (lifespan init, 23 APIRouters)
  config.py         → env vars from backend/.env
  database.py       → 52-table schema v23, query helpers
  routers/          → 23 APIRouters (133 /api/* paths)
  services/         → market_data, llm_client, indicators, scoring, etc.
  agent/            → 13 local tools (ToolRegistry singleton)
  backtest/         → v1 sync + v2 async backtest engines
  orchestrator/     → research_orch (4-agent parallel), discussion_orch
frontend/src/
  pages/            → route pages
  components/       → shared UI components (--fq-* design tokens)
  services/         → api.ts (single axios instance for all requests)
  store/            → zustand stores
```

## Gotchas

- **Port 5173**: previously occupied by an old Docker container (`finquant-hub-local-frontend-1`). If "port in use", run `docker ps` + `netstat -ano | findstr 5173` and kill the occupant. Do not silently switch ports.
- **Delete rule**: never use `rm`, `del /f`, `rmdir /s /q`. All deletions must go to recycle bin via PowerShell `SendToRecycleBin`.
- **`reference/` is read-only**: contains third-party clones; never modify.
- **No new dependencies**: Design System is pure CSS (`--fq-*` tokens). Do not add npm or Python packages without explicit approval.
- **Chinese data sources** (Tencent/Sina/EastMoney): use `trust_env=False` to bypass proxy. Yahoo uses `trust_env=True`.
- **SSE proxy**: Vite proxy must set `compress: false` + `timeout: 0` to prevent SSE buffering. See `frontend/vite.config.ts`.
- **SQLite DB path**: `backend/data/finquant.db`. Schema migrations are hand-written (no migration framework).

## Doc sync rule

After any code change that adds/changes an API endpoint, router, or table:

1. Endpoint change → `docs/API_CONTRACT.md`
2. Router/architecture change → `docs/ARCHITECTURE.md`
3. Schema change → SCHEMA section in `docs/ARCHITECTURE.md`
4. Bug fix → `docs/HANDOVER.md` (move from Broken to Verified Working)
5. New concept/pattern → memory file (`memory/`)

Skip for: pure refactoring, test additions, comment/docstring edits.

## Change record

Append to `task/CHANGELOG.md` after each session:
```markdown
## YYYY-MM-DD
- What changed: [file paths]
- Why: [reason]
- Docs updated: [which docs]
- Risk: [low/medium/high]
```

## Harness governance

This project uses harness-engineering v4.11.0. Key files:

- `.harness/manifest.json` — component inventory
- `STATE.json` — rules & incident memory
- `HANDOFF.md` — cross-session continuation authority
- `notes/` — decision records

```bash
python scripts/audit.py .                                        # harness health check
python scripts/handoff-log.py --append "did what" --verify "result" # append change log
```

File not found → component not embedded; skip it.

## Harness 日常用法（v4.11.0）

- **一句话嵌入/重装**：用户说"嵌入 harness"→ 自动跑 `python scripts/bootstrap.py --init --dir . --name finquant-hub`（默认 single，不提问；用户明说团队/生产才加 --mode）
- **一句话体检**：用户说"执行 harness / 跑一下 harness"→ 自动跑 `python scripts/harness-check.py .`（汇总体检报告）
- **收尾必做**：`python scripts/handoff-log.py --append "做了什么" --verify "验证结果"` → 追加 HANDOFF.md 变更日志
- **审计健康**：`python scripts/audit.py .`（0=健康，1=有问题）
- **记决策**：`python scripts/note-lifecycle.py new --class architecture --title "..."`；提交前 `note-lifecycle.py verify`
- **记事故**：`python scripts/record-error.py`（agent 反复犯的错 → STATE.json）
- 完整上手见 `docs/HARNESS-QUICKSTART.md`

## Model switching rule

- **批量读文档、总结、分析** → 用 MIMO V2.5，写代码前切走
- **写代码、改代码、调试** → 用 Deepseek V4 Flash

Agent 无法自动切换模型，但应在任务切换时主动提醒用户切换。

## Target user

Non-technical Chinese finance/investment users. All UI in Chinese. Avoid CLI/terminal in UI work.
