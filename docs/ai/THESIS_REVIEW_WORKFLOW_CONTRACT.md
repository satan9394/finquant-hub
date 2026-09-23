# Thesis Review Workflow Contract

> Version: `thesis-review/v1`

## Purpose

The workflow persists the path from deterministic evidence-aware drift to an explicit user review. It is not an autonomous Thesis editor and does not introduce a workflow runtime.

## State and lineage

- `thesis_review_items` is an owner-scoped current projection linked to one Thesis and the current immutable Thesis version.
- A successful deterministic status change stores `COMPUTED_RESULT`, rule/version, old/new status, reason, baseline/current values, and canonical evidence IDs.
- The review quality is `OK`, `PARTIAL`, or `UNKNOWN` according to the changed rules and their current canonical evidence. A thrown check is persisted separately as `failed`/`UPSTREAM_ERROR` with no fabricated change.
- Re-running the same deterministic change uses a content-derived SHA-256 key and does not duplicate the review item.

## User control and history

- A review begins as `pending`. Only an explicit `acknowledged` or `disputed` request resolves it.
- The decision key is derived from owner, Thesis, review, decision, and reason; an identical retry returns the existing result.
- `thesis_review_events` is append-only. `created`, `acknowledged`, `disputed`, and `check_failed` events cannot be updated or deleted.
- A decision changes only the review projection. It does not edit Thesis text, create a Thesis version, change confidence, promote an inference to fact, or invoke an upstream source.

## Isolation and failure behavior

- Reads and decisions require matching `user_id`, Thesis ID, review ID, and composite foreign keys. Cross-owner access returns no rows or not found.
- A failed check creates a separate failure item and event; existing pending reviews remain pending and visible after refresh.
- The UI renders loading, empty, load error, pending, resolved, partial/unknown, and upstream failure states with native keyboard-operable controls and responsive AntD layout.

## Verification boundary

Tests use deterministic fixture markets and injected failures. They validate local persistence, isolation, idempotence, rendering, and migration behavior; they are not live financial or LLM upstream validation.
