# AIOS-022 Typed Memory Retrieval Benchmark

> Date: 2026-08-11  
> Fixture: `aios-memory-fixture-v1`  
> Evidence scope: synthetic fixture only; this is not real upstream or production-user validation.

## Result

The project-owned typed-memory retrieval passed every fixed gate while the existing FTS5 path remained unchanged.

| Metric | FTS5 baseline | Typed memory | Gate |
|---|---:|---:|---|
| Recall@5 | 1.0000 | 1.0000 | typed >= baseline |
| Precision@5 | 0.9167 | 1.0000 | typed >= baseline |
| Semantic accuracy | not supported | 1.0000 (6/6) | >= 0.9500 |
| Owner leakage | 0 | 0 | 0 |
| Typed P95 latency | n/a | 0.6133 ms | <= 250 ms |

Latency used 30 local samples (`--repetitions 5`) over 13 synthetic records. It is a local SQLite fixture measurement, not a production capacity claim.

## Semantic gates

- Current-time selection ranks the newer 2025 observation ahead of the 2024 observation.
- Historical `valid_at=2025-06-01` excludes the later observation.
- Workspace hard filtering separates the synthetic alpha and beta workspaces.
- `require_provenance` excludes the deliberately missing-provenance record.
- A newer `UPSTREAM_ERROR` remains visible ahead of a stale successful value; it is not filled from history.
- Cross-owner retrieval returns no private record.

Each result includes its memory status and information kind, temporal bounds, canonical evidence metadata/quality when present, and a `confirmed` or `unverified_candidate` trust label. Candidate content is never relabeled as confirmed fact.

## Reproduce

```powershell
cd backend
.venv\Scripts\python.exe scripts/memory_typed_benchmark.py --repetitions 5
.venv\Scripts\python.exe -m pytest tests/test_typed_memory_retrieval.py -q --no-cov
```
