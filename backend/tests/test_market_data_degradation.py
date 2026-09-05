from __future__ import annotations

import httpx
import pytest

from app.services import auth, credential_store, fundamentals, market_data
from app.services.market_data import MarketDataService, MarketError


def _client(handler=None) -> httpx.AsyncClient:
    if handler is None:
        def handler(request):
            return httpx.Response(500, request=request)
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


def _series(metric: str, value: float | None, *, date: str = "2026-06-30", period: str = "TTM") -> dict:
    reported = {} if value is None else {"raw": value}
    return {
        "meta": {"type": [metric]},
        metric: [{"asOfDate": date, "periodType": period, "currencyCode": "USD", "reportedValue": reported}],
    }


@pytest.mark.asyncio
async def test_snapshot_priority_status_and_shared_client_lifecycle(monkeypatch):
    clock = iter((10.0, 12.0, 20.0))
    monkeypatch.setattr(market_data, "monotonic", lambda: next(clock))
    client = _client()
    service = MarketDataService(http=client)

    service.store_snapshot("quote:AAPL", {"price": 100})
    assert service.cached_snapshot("quote:AAPL", 5) == {"price": 100}
    assert service.cached_snapshot("quote:AAPL", 5) is None
    assert service.cached_snapshot("missing", 5) is None
    service.configure_source_priority("kline", ["yahoo", "tencent", "sina"])
    assert service.source_status()["priorities"]["kline"] == ["yahoo", "tencent", "sina"]

    await service.aclose()


@pytest.mark.asyncio
async def test_quote_enrichment_keeps_partial_data_after_fallback_failures(monkeypatch):
    service = MarketDataService(http=_client())

    async def base_quote(_ticker):
        return {"code": "sh600519", "name": "贵州茅台", "price": 100, "source": "tencent"}

    async def provider(provider, _code):
        if provider == "sina":
            raise MarketError("fixture unavailable")
        return {"code": "sh600519", "name": "贵州茅台", "price": 100, "pb": 7.5, "source": provider}

    monkeypatch.setattr(service, "quote", base_quote)
    monkeypatch.setattr(service, "_quote_from", provider)
    result = await service.quote_enriched("600519")

    assert result["pb"] == 7.5
    assert result["sources"] == ["tencent", "yahoo"]
    assert result["missing_fields"] == ["market_cap", "pe", "turnover_rate"]
    assert service._breaker("sina").snapshot()["failures"] == 1
    await service.aclose()


@pytest.mark.asyncio
async def test_prefetch_raw_quotes_bounds_concurrency_and_preserves_errors(monkeypatch):
    service = MarketDataService(http=_client())

    async def quote(ticker):
        if ticker == "BAD":
            raise ValueError("invalid fixture")
        return {"code": ticker, "price": 1}

    monkeypatch.setattr(service, "quote", quote)
    result = await service.prefetch_quotes(["AAPL", "BAD"], enriched=False, concurrency=0)

    assert result == {"items": [{"code": "AAPL", "price": 1}], "errors": {"BAD": "invalid fixture"}}
    await service.aclose()


@pytest.mark.asyncio
async def test_yahoo_quote_and_index_paths_are_normalized(monkeypatch):
    service = MarketDataService(http=_client())

    async def chart(symbol, range_value, interval):
        assert range_value == "5d"
        assert interval == "1d"
        return {"meta": {
            "longName": symbol, "regularMarketPrice": 110, "previousClose": 100,
            "regularMarketOpen": "bad", "regularMarketDayHigh": 112, "regularMarketDayLow": 98,
            "regularMarketVolume": 1234, "marketCap": 5000, "regularMarketTime": 42,
            "currency": "USD", "exchangeName": "NMS", "exchangeTimezoneName": "UTC",
        }}

    monkeypatch.setattr(service, "_yahoo_chart", chart)
    quote = await service._quote_yahoo("usBRK.B")
    index = await service.index_quote("^GSPC", code="usSPX", name="S&P 500", market="US")

    assert quote["code"] == "usBRK.B"
    assert quote["open"] == 0.0
    assert quote["amplitude"] == 14.0
    assert index["change_percent"] == 10.0

    async def unusable(*_args):
        return {"meta": {"regularMarketPrice": 0, "previousClose": 100}}

    monkeypatch.setattr(service, "_yahoo_chart", unusable)
    with pytest.raises(MarketError, match="指数行情不可用"):
        await service.index_quote("^GSPC", code="usSPX", name="S&P 500", market="US")
    with pytest.raises(MarketError, match="未找到股票代码"):
        await service._quote_yahoo("usAAPL")
    await service.aclose()


@pytest.mark.asyncio
async def test_kline_provider_parsers_and_adjusted_yahoo_rows(monkeypatch):
    responses = iter((
        httpx.Response(200, json={"unexpected": True}),
        httpx.Response(200, json=[
            {"day": "2026-01-01", "open": "1", "high": "2", "low": "0.5", "close": "1.5", "volume": "10"},
            {"day": "", "open": "1"},
        ]),
    ))

    def handler(request):
        response = next(responses)
        response.request = request
        return response

    service = MarketDataService(http=_client(handler))
    assert await service._kline_sina("sh600519", 240, 2) == []
    sina = await service._kline_sina("sh600519", 240, 2)
    assert sina == [{
        "day": "2026-01-01", "open": 1.0, "high": 2.0, "low": 0.5,
        "close": 1.5, "volume": 10, "source": "sina", "adjustment": "none",
    }]

    async def chart(*_args):
        return {
            "timestamp": [1_767_225_600, 1_767_312_000],
            "indicators": {
                "quote": [{
                    "open": [100, None], "high": [110, 2], "low": [90, 1],
                    "close": [100, 1.5], "volume": [10, 20],
                }],
                "adjclose": [{"adjclose": [50, 1.5]}],
            },
        }

    monkeypatch.setattr(service, "_yahoo_chart", chart)
    yahoo = await service._kline_yahoo("usAAPL", "1d", 10)
    assert len(yahoo) == 1
    assert yahoo[0]["close"] == 50.0
    assert yahoo[0]["open"] == 50.0
    assert yahoo[0]["adjustment"] == "split_dividend_adjusted"
    await service.aclose()


@pytest.mark.asyncio
async def test_domestic_fundamentals_fall_through_suspicious_and_failed_sources(monkeypatch):
    service = MarketDataService(
        http=_client(), fundamentals_priority=("tushare", "akshare", "yahoo")
    )
    created_tokens: list[str] = []

    class Adapter:
        def __init__(self, token=None):
            created_tokens.append(token or "")

    calls = 0

    async def fetch(_code, _adapters):
        nonlocal calls
        calls += 1
        if calls == 1:
            raise RuntimeError("tushare fixture down")
        return [{"metric": "revenue", "value": 1, "quality_flags": ["suspicious_fixture"]}]

    async def yahoo(_ticker):
        return [{"metric": "revenue", "value": 2, "quality_flags": []}]

    monkeypatch.setattr(fundamentals, "TushareFundamentalsAdapter", Adapter)
    monkeypatch.setattr(fundamentals, "AkshareFundamentalsAdapter", Adapter)
    monkeypatch.setattr(fundamentals, "fetch_cn_fundamentals", fetch)
    monkeypatch.setattr(auth, "current_user_id", lambda: 7)
    monkeypatch.setattr(credential_store, "get_credential", lambda *_args: _async_value("stored-token"))
    monkeypatch.setattr(service, "_yahoo_fundamentals", yahoo)

    result = await service.fundamentals("600519")
    assert result[0]["value"] == 2
    assert created_tokens[0] == "stored-token"
    await service.aclose()


async def _async_value(value):
    return value


@pytest.mark.asyncio
async def test_yahoo_fundamentals_parse_raw_and_derived_metrics():
    payload = {"timeseries": {"result": [
        _series("trailingMarketCap", 1000),
        _series("trailingTotalRevenue", 200),
        _series("trailingNetIncome", 20),
        _series("trailingGrossProfit", 80),
        _series("trailingOperatingCashFlow", 30),
        _series("trailingFreeCashFlow", 10),
        _series("quarterlyTotalAssets", 500, period="Q"),
        _series("quarterlyTotalLiabilitiesNetMinorityInterest", 200, period="Q"),
        _series("ignoredMetric", None),
        {"meta": {"type": []}},
    ]}}

    def handler(request):
        return httpx.Response(200, json=payload, request=request)

    service = MarketDataService(http=_client(), yahoo_http=_client(handler))
    items = await service._yahoo_fundamentals("AAPL")
    by_metric = {item["metric"]: item for item in items}

    assert by_metric["gross_margin"]["value"] == 40.0
    assert by_metric["net_profit_margin"]["value"] == 10.0
    assert by_metric["debt_to_assets"]["value"] == 40.0
    assert by_metric["fcf_yield"]["value"] == 1.0
    assert "ignoredMetric" not in by_metric
    await service.aclose()


@pytest.mark.asyncio
async def test_yahoo_fundamentals_rejects_upstream_error_payload():
    def handler(request):
        return httpx.Response(200, json={"timeseries": {"error": {"code": "fixture"}}}, request=request)

    service = MarketDataService(http=_client(), yahoo_http=_client(handler))
    with pytest.raises(MarketError, match="upstream_error"):
        await service._yahoo_fundamentals("AAPL")
    await service.aclose()


@pytest.mark.asyncio
async def test_index_quote_mainland_uses_tencent_without_stock_normalize(monkeypatch):
    """A8-③：大陆指数（sh000001）不再被股票 normalize 拒绝——直接腾讯取数。"""
    service = MarketDataService(http=_client())

    async def fake_tencent(codes):
        assert codes == ["sh000001"]
        return [{
            "code": "sh000001", "name": "上证指数", "price": 3500.0,
            "change": 12.0, "change_percent": 0.34, "timestamp": 42, "source": "tencent",
        }]

    monkeypatch.setattr(service, "_quotes_tencent", fake_tencent)
    quote = await service.index_quote(
        "sh000001", code="000001.SH", name="上证指数", market="cn",
    )
    assert quote == {
        "code": "000001.SH", "name": "上证指数", "market": "cn",
        "price": 3500.0, "change": 12.0, "change_percent": 0.34,
        "timestamp": 42, "source": "tencent",
    }
    await service.aclose()


@pytest.mark.asyncio
async def test_index_quote_mainland_unusable_raises(monkeypatch):
    """A8-③：腾讯无指数行情 → MarketError（不静默 unavailable）。"""
    service = MarketDataService(http=_client())

    async def empty_tencent(_codes):
        return []

    monkeypatch.setattr(service, "_quotes_tencent", empty_tencent)
    with pytest.raises(MarketError, match="指数行情不可用"):
        await service.index_quote("sh000001", code="000001.SH", name="上证指数", market="cn")
    await service.aclose()
