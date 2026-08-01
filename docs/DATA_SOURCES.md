# Data Sources

| Source | Coverage | Auth | trust_env |
|--------|----------|------|-----------|
| Tencent qt.gtimg.cn | A-share realtime | None | False |
| Sina hq.sinajs.cn | A-share realtime/kline (backup) | Referer | False |
| EastMoney searchapi | A-share search | Token param | False |
| EastMoney push2 / appdata | A-share breadth, industry/concept rank, popularity, limit-up pool | Token params | False |
| Yahoo Finance v8/v1 | HK/US quote/kline/search | None | True |
| AkShare financial abstract | A-share reported fundamentals (preferred when installed) | None | False |
| Tushare `fina_indicator`/`income`/`cashflow`/`balancesheet` | A-share reported fundamentals (fallback) | Token + per-endpoint provider permission | False |
| Tavily / SerpAPI / Bocha / Brave | Configurable news search | Per-provider API key | False |
| SearXNG | Operator-owned news metasearch | Configured base URL | False |
| Sina searchapi | Zero-config news fallback | Referer | False |
| DeepSeek API | LLM | sk-xxx in .env | True (via proxy) |

## Market-level evidence boundaries

- CN breadth is paginated to the provider-reported universe total; failed pages fail the snapshot instead of returning a top-100 sample as the whole market.
- HK/US overview currently includes index quotes only. Breadth returns `unsupported` because no verified constituent universe is installed.
- Missing quote fields stay missing until a lower-priority source supplies them; batch prefetch returns per-ticker errors instead of dropping failures.
- Provider priority is persisted in `system_settings`; CircuitBreaker state is process-local and exposed read-only at `/api/market/sources`.
- A-share fundamentals use installed AkShare first, then available Tushare endpoints, then Yahoo. Every metric carries provider and report-date provenance; missing optional packages or per-endpoint permissions are a fallback condition, not fabricated data. Yahoo gross margin, net margin and debt-to-assets are derived only when both named source fields exist, and retain their component list.
- News search defaults to provider-priority fallback to control paid API use; `aggregate` mode queries all configured providers, normalizes fields, and deduplicates by URL/title while retaining the source provider.

## Outbound channels

WeCom and Feishu use HTTPS webhooks; email uses SMTP. All three are inactive unless `EXTERNAL_SENDERS_ENABLED=true` and the matching secrets are configured. Secrets are environment-only and are never returned by an API.
