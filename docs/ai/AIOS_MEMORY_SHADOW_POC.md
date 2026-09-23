# AIOS Memory Shadow PoC

> Date: 2026-08-11  
> Scope: synthetic fixture only  
> Decision status: `INSUFFICIENT_EVIDENCE`

## Conclusion

Native FTS5 remains the only measured and permitted answer path. Graphiti and Mem0 are not installed in the project environment, so no framework retrieval was executed and no comparative accuracy or latency result exists. This is a reproducible dependency/operability probe, not a successful framework benchmark.

The package-index lookup also failed through the configured proxy. The versions and Apache-2.0 license labels recorded in the long-term plan are retained only as a dated planning snapshot; they were not independently refreshed by this run.

## Evidence matrix

| Candidate | Local state | Fixture execution | Dependency/operations surface | License evidence | Production effect |
|---|---|---:|---|---|---|
| Native FTS5 | available | 6 cases measured | existing SQLite/FTS5, single aiosqlite connection | project-native | current answer path |
| Graphiti | package absent | `NOT_RUN` | graph database, embeddings, LLM extraction; disposable isolated infrastructure required | Apache-2.0 in dated plan snapshot; live refresh failed | none |
| Mem0 | package absent | `NOT_RUN` | vector store, embeddings, LLM extraction; isolated adapter required | Apache-2.0 in dated plan snapshot; live refresh failed | none |

Null candidate metrics are intentional. They mean unknown/not run, not zero. `UPSTREAM_ERROR` records the unavailable package-index check; it is not a statement about either framework's quality.

## Safety and data handling

- Input is `backend/tests/fixtures/aios_memory_v1.json`; it contains synthetic users and synthetic financial text only.
- The runner creates a temporary SQLite database for the native baseline and removes it on exit.
- Candidate probes do not import an unavailable framework, create graph/vector stores, call an LLM, write production data, or inject results into a model response.
- Native user isolation, prompt-injection-as-data handling, FTS trigger sync, and the 2400-character context budget remain hard gates.

## Dependency and operations assessment

Graphiti cannot be evaluated honestly without both its package and disposable graph/embedding/LLM infrastructure. Mem0 likewise needs its package plus an explicitly selected local vector/embedding/LLM configuration. Adding either to production requirements now would expand the database and operations architecture before comparative evidence exists.

The minimum future experiment is an isolated, rebuildable read model populated only from the versioned fixture. It must record exact package versions, transitive dependencies, service processes, token/call counts, cold/warm latency, cleanup, and license/source evidence. It must never become the authoritative fact store.

## Rollback

The current rollback is zero-cost: keep `NativeFTSMemoryProvider` and delete the PoC script, test, and report. A future Graphiti read model must be disposable and rebuildable; a future Mem0 adapter must be feature-gated. Neither may alter canonical records or the production response until an accepted ADR.

## Decision gate

AIOS-005 may document a proposed **defer** decision, but adoption cannot be approved from this evidence. A real candidate comparison remains blocked on explicit authorization for new experimental dependencies/infrastructure and a working package source. Per architecture policy, PostgreSQL, Redis, graph databases, or other service changes require an ADR and `@Satanchen` before implementation.

## Reproduction

```powershell
cd backend
.venv\Scripts\python.exe scripts/memory_shadow_poc.py --repetitions 2
.venv\Scripts\python.exe -m pytest tests/test_memory_shadow_poc.py -q --no-cov
```

The JSON output is the machine-readable evidence. Only the native section is measured; candidate sections must remain `NOT_RUN` until real isolated adapters execute.
