# Data Sources

| Source | Coverage | Auth | trust_env |
|--------|----------|------|-----------|
| Tencent qt.gtimg.cn / ifzq.gtimg.cn | A-share realtime primary / kline fallback | None | False |
| Sina hq.sinajs.cn / CN_MarketData.getKLineData | A-share realtime fallback / kline primary | Referer | False |
| EastMoney searchapi | A-share search | Token param | False |
| EastMoney push2 / push2delay / appdata | A-share breadth, daily/weekly movers, industry/concept rank, stock/sector capital flow, popularity, limit-up pool | Token params | False |
| Tonghuashun stockpage Funds | Per-stock main capital flow and industry enrichment for bounded weekly-mover candidates | None | False |
| Yahoo Finance v8/v1 | Global search; HK/US quote/kline; A-share final quote/kline fallback; A/HK/US fundamentals timeseries | None | True |
| AkShare financial abstract | A-share reported fundamentals (preferred when installed) | None | False |
| Tushare `fina_indicator`/`income`/`cashflow`/`balancesheet` | A-share reported fundamentals (fallback) | Token + per-endpoint provider permission | False |
| Tavily / SerpAPI / Bocha / Brave | Configurable news search | Per-provider API key | False |
| SearXNG | Operator-owned news metasearch | Configured base URL | False |
| Sina searchapi | Zero-config news fallback | Referer | False |
| DeepSeek API | LLM | sk-xxx in .env | True (via proxy) |

## Market-level evidence boundaries

- CN breadth is paginated to the provider-reported universe total; failed pages fail the snapshot instead of returning a top-100 sample as the whole market.
- `/api/market/pulse` covers the public dimensions used by the local reference monitor; it does not claim to mirror either platform's private, paid, login-only, or complete internal dataset. EastMoney candidates are fetched in batches; Tonghuashun is a per-stock endpoint and is therefore bounded by `ths_limit` with requested/succeeded/failed counts.
- `/api/market/themes` paginates to the provider-reported industry and concept totals before matching a keyword. Built-in aliases for 机器人、算力、电力、半导体 are returned in `expanded_terms`; custom keywords use literal board-name matching. Each returned board retains `matched_term`, and constituent rankings can sort by daily change, weekly change, main capital flow, or turnover.
- Tonghuashun `title.je` values are retained in the provider's `wan_cny` unit. Missing enrichment remains `null` and is never inferred from EastMoney.
- HK/US overview currently includes index quotes only. Breadth returns `unsupported` because no verified constituent universe is installed.
- Missing quote fields stay missing until a lower-priority source supplies them; batch prefetch returns per-ticker errors instead of dropping failures.
- Provider priority is persisted in `system_settings`; CircuitBreaker state is process-local and exposed read-only at `/api/market/sources`.
- A-share fundamentals use installed AkShare first, then available Tushare endpoints, then Yahoo. Every metric carries provider and report-date provenance; missing optional packages or per-endpoint permissions are a fallback condition, not fabricated data. Yahoo gross margin, net margin, debt-to-assets, CFO/net-income, FCF margin and FCF yield are derived only when the named components have compatible dates/periods/currencies; each result retains components and deterministic methodology.
- Quote and kline failures report attempted providers and a safe exception category; an open provider breaker is exposed as `provider:circuit_open`. These categories aid retry decisions but never replace missing values or expose upstream response bodies.
- News search defaults to provider-priority fallback to control paid API use; `aggregate` mode queries all configured providers, normalizes fields, and deduplicates by URL/title while retaining the source provider.

## Outbound channels

WeCom and Feishu use HTTPS webhooks; email uses SMTP. All three are inactive unless `EXTERNAL_SENDERS_ENABLED=true` and the matching secrets are configured. Secrets are environment-only and are never returned by an API.
