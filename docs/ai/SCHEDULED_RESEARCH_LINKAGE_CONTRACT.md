# Scheduled Research Linkage Contract

> Version: `scheduled-research-linkage/v1`
> Scope: owner-scoped local scheduler; no external queue or upstream guarantee

## Run identity and lifecycle

- Every claimed job attempt creates one `scheduled_research_runs` row with a 64-character SHA-256 `run_key`, unique per owner.
- `attempt` increases within a job. `retry_of_run_id` is set only when the immediately preceding attempt failed or was cancelled; an ordinary repeat after completion is not called a retry.
- A run moves from `running` to exactly one terminal state: `completed`, `failed`, or `cancelled`. Errors and completion timestamps remain persisted.
- Jobs with run history cannot be deleted through the API; users disable them so the job/report/run lineage remains resolvable.

## Linked objects

- `research_reports.scheduled_run_id` and `scheduled_research_runs.report_id` link the report and attempt within the same owner.
- Research notifications retain their report URL and include `scheduled_run_id` in the payload.
- Run history is read through `GET /api/settings/research-jobs/{job_id}/runs`; job ownership is checked before any rows are returned.

## Evidence and memory truthfulness

- Only strings in the persisted report shaped as `ev_*` are candidates for linkage. Each ID must resolve to a canonical `evidence_objects` row owned by the same user.
- All candidate IDs resolved is `OK`; a mixture of resolved and missing IDs is `PARTIAL`; no validated evidence is `UNKNOWN`; a failed/cancelled run is `UPSTREAM_ERROR`.
- Missing or foreign evidence is never copied, substituted, or exposed.
- Memory extraction remains feature-gated. When enabled, generated report summaries are saved only as candidate `AI_INFERENCE`/`AI_GENERATED` records and never promoted to facts automatically.
- Failed runs do not write completed memory or evidence products. Their failed report and notification remain available for audit and retry.

## Idempotence and rollback

- The owner/run-key unique constraint prevents duplicate attempt ledgers. Existing memory candidate dedupe keys prevent repeated candidate rows for the same report section.
- SQLite remains authoritative. The linkage adds no Redis, Celery, external database, WebSocket, or independent runtime.

## Verification boundary

Focused tests use deterministic streams, evidence fixtures, and mocked failures. They validate local persistence, isolation, retry, and rendering contracts; they are not real financial, LLM, notification-delivery, or scheduler-upstream validation.
