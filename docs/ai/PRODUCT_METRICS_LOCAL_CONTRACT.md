# Local Product Metrics Contract

> Version: `product-metrics-local/v1`

## Privacy boundary

- Metrics are disabled for every owner until that owner explicitly enables them in Settings.
- Events stay in the existing local SQLite database. There is no analytics SDK, network sender, cross-user aggregation, or external telemetry dependency.
- `product_metric_events` has only `id`, `user_id`, `event_name`, bounded integer `value`, and `occurred_at`.
- Tickers, symbols, business object IDs, names, routes/queries, prompts, financial text, model output, credentials, cookies, tokens, exception stacks, and free-form metadata are structurally absent.

## Event allowlist

| Event | Value |
|---|---|
| `first_value` | elapsed milliseconds, `0..86400000` |
| `result_saved` | `null` |
| `workflow_continued` | `null` |
| `repeat_research` | days since prior saved research, `0..365` |

Unknown event names, extra request fields, missing required values, and out-of-range values are rejected. Event persistence is best-effort: when disabled or when the local write fails, the intake returns `recorded=false` and cannot change the associated business operation.

## Aggregation and lifecycle

- Reads, writes, preference changes, and deletion are owner-scoped.
- Aggregates cover the latest 90 days. Successful writes prune only that owner's older events.
- TTFV median and P90 are returned only with at least 10 samples; smaller sets expose the count and `insufficient_sample=true` without an improvement claim.
- Settings exposes disabled, loading, empty, error, aggregate, and clear states. Clearing deletes all events for the current owner but retains the explicit preference.

## Verification boundary

Deterministic fixture events validate storage, privacy, aggregation, isolation, deletion, and failure behavior. They do not measure or claim real user adoption.
