# Contributing to FinQuant Hub

FinQuant Hub is being prepared as a local-first, self-hosted research system. The repository is not release-ready while the root LICENSE and third-party redistribution blockers listed in [Data source and license boundaries](docs/DATA_SOURCE_AND_LICENSE_BOUNDARIES.md) remain unresolved.

## Start from the supported runtime

Use Docker Desktop, or Docker Engine with Compose v2.

```powershell
.\scripts\local.ps1 up
.\scripts\local.ps1 doctor
```

```bash
bash ./scripts/local.sh up
bash ./scripts/local.sh doctor
```

The local browser entrypoint is `http://127.0.0.1:5173` unless `LOCAL_PORT` is changed. Never include `.env.local`, a MASTER_KEY, model credentials, SQLite databases, portfolio data, or research content in an issue or patch.

## Keep changes surgical

- Search for existing services, helpers, tables, and tests before adding code.
- Do not modify `reference/`.
- Preserve raw SQL, one `aiosqlite` connection, no independent DAL, no ORM, no WebSocket, no SSR, no DI container, and no free agent-to-agent communication.
- Do not add infrastructure or production dependencies without an accepted decision in `docs/ai/DECISIONS.md`.
- Do not perform unrelated refactors or overwrite an existing dirty worktree.

## Financial evidence contract

- Never invent a price, metric, rating, source, timestamp, or upstream success.
- Preserve `UNKNOWN`, `PARTIAL`, `UPSTREAM_ERROR`, source, as-of/retrieval time, period type, adjustment basis, and quality state.
- Label facts, deterministic computations, AI inferences, and user hypotheses separately.
- Static checks, schemas, fixtures, and mocks are not real upstream validation.
- Paper portfolios are simulations, not broker accounts or executions.

## Verify

Run focused regressions while developing, then the complete gates before proposing a release-bound change:

```powershell
cd backend
.venv\Scripts\python.exe -m pytest -q
.venv\Scripts\python.exe -m ruff check .
.venv\Scripts\python.exe -m mypy app

cd ..\frontend
bun run test
bun x tsc -b --pretty false
bun run build
bun run test:e2e
```

Backend focused tests may use `--no-cov`; the full suite must satisfy the configured coverage threshold. For local packaging changes, also run `scripts/verify_local_install.ps1`. Redact doctor/log output before sharing.

## Pull requests

Use the pull-request template. Explain the user outcome, smallest changed surface, financial-data boundary, tests actually run, tests not run, and any remaining risk. A maintainer must explicitly authorize commits, pushes, releases, deployments, or other external writes performed by an automation agent.
