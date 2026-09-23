# Private Share Preview Contract

## Boundary

`share-preview/v1` is an authenticated, owner-scoped, read-only projection for a Thesis or a saved completed strategy backtest. Every response fixes:

- `visibility: private`
- `published: false`
- `publish_action_available: false`
- `publication_gate.status: BLOCKED`

No preview is stored. There is no public or anonymous route, URL, share token, short link, POST/PUT/DELETE share operation, clipboard action, send action, external service call, or publication record. Cross-owner and unavailable objects return the same 404. AIOS-071 remains blocked pending explicit privacy, data-license, and legal decisions.

## Allowlisted content

Thesis previews include only the current immutable version's title/ticker/status, user judgment, confidence, assumptions, claims, invalidation conditions, and version time. These fields are `USER_HYPOTHESIS`, never facts, recommendations, or causal proof.

Strategy previews require `status=completed` and `is_saved=1`. They include a fixed parameter allowlist, finite metric allowlist, persisted provider/as-of/market conventions, and no trades, order marks, curves, raw bars, or validation samples. Metrics are `COMPUTED_RESULT`, never observed facts, recommendations, or causal proof. Missing metrics stay absent; missing provenance/license stays UNKNOWN.

Canonical evidence output is metadata-only: evidence ID, relation, kind, data status, source/vendor, as-of/retrieved-at, quality flags, and license scope. It excludes `value_json`, document excerpts, report bodies, memory content, and all credential/session columns.

## Audit and redaction

Each preview exposes provenance, freshness, license, quality, redaction, and disclaimer audit blocks. `display-and-research` and `private-user-research` permit only this owner-visible presentation; they do not imply public redistribution. Only an explicit future `public-domain` or `public-redistribution` scope can mark an individual evidence item as publicly reusable, and that still does not unlock the global publication gate.

Allowlisted user text is deterministically redacted for credential assignments, bearer tokens, `sk-` secrets, JWT-shaped values, and email addresses. The response reports changed JSON paths and a count without echoing the sensitive value, then scans the complete sanitized payload again. A scan failure is `redaction.status=FAIL`; there is still no publication path.

The fixed disclaimer states that the preview is private research, unpublished, not investment advice, not a trade instruction, and not causal proof; it also preserves delayed/PARTIAL/UNKNOWN/UPSTREAM_ERROR and provenance/license review obligations.

## API and UI

- `GET /api/thesis/{id}/share-preview`
- `GET /api/backtests/{id}/share-preview`

The Thesis and Strategy Lab actions open one shared modal with loading, error/retry, empty, partial/unknown, provenance/license/time/quality, redaction, blocked-gate, and disclaimer states. Its only terminal action is Close; Escape uses the Ant Design modal's standard keyboard behavior. Content wraps at narrow widths and no horizontal data table is used.

## Verification boundary

Tests use deterministic local SQLite and UI fixtures. They verify owner isolation, no database writes, allowlists, secret redaction, UNKNOWN license behavior, absence of publish routes/actions, OpenAPI shape, and UI states. This is not legal advice, a public-redistribution license decision, a real publication, or real financial/upstream validation.
