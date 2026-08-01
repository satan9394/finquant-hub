import httpx
import pytest

from app.services.instruments import external_symbol, instrument_from_code
from app.services.market_data import MarketDataService, MarketError
from app.routers.research import resolve_research_target


@pytest.mark.parametrize(
    ("raw", "symbol", "market", "currency"),
    [
        ("600519", "600519", "CN", "CNY"),
        ("00700.HK", "00700.HK", "HK", "HKD"),
        ("AAPL", "AAPL", "US", "USD"),
    ],
)
def test_unified_instrument_parse(raw, symbol, market, currency):
    instrument = instrument_from_code(raw)
    assert external_symbol(raw) == symbol
    assert instrument["market"] == market
    assert instrument["currency"] == currency
    assert instrument["asset_type"] == "equity"


@pytest.mark.asyncio
async def test_search_provider_failure_is_not_silently_empty():
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectTimeout("all providers unavailable", request=request)

    http = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    service = MarketDataService(http=http)
    with pytest.raises(MarketError, match="搜索服务不可用"):
        await service.search("不存在的中文公司")
    await service.aclose()


@pytest.mark.asyncio
async def test_fundamentals_preserve_as_of_and_currency():
    payload = {
        "timeseries": {
            "result": [{
                "meta": {"type": ["trailingNetIncome"]},
                "trailingNetIncome": [{
                    "asOfDate": "2026-03-31",
                    "periodType": "TTM",
                    "currencyCode": "USD",
                    "reportedValue": {"raw": 123.0},
                }],
            }],
            "error": None,
        }
    }

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=payload)

    http = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    service = MarketDataService(http=http)
    items = await service.fundamentals("AAPL")
    assert items == [{
        "metric": "trailingNetIncome",
        "value": 123.0,
        "as_of": "2026-03-31",
        "as_of_date": "2026-03-31",
        "currency": "USD",
        "period_type": "TTM",
        "provider": "yahoo_fundamentals_timeseries",
        "source": "yahoo.fundamentals_timeseries",
        "is_ttm": True,
    }]
    await service.aclose()


@pytest.mark.asyncio
async def test_yahoo_fundamentals_derives_auditable_core_ratios(monkeypatch):
    async def no_domestic_data(symbol, adapters=None):
        return []

    monkeypatch.setattr("app.services.fundamentals.fetch_cn_fundamentals", no_domestic_data)

    def series(metric, value, period="TTM"):
        return {
            "meta": {"type": [metric]},
            metric: [{
                "asOfDate": "2026-03-31",
                "periodType": period,
                "currencyCode": "CNY",
                "reportedValue": {"raw": value},
            }],
        }

    payload = {"timeseries": {"result": [
        series("trailingTotalRevenue", 1000),
        series("trailingGrossProfit", 600),
        series("trailingNetIncome", 250),
        series("quarterlyTotalAssets", 2000, "3M"),
        series("quarterlyTotalLiabilitiesNetMinorityInterest", 500, "3M"),
    ], "error": None}}

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=payload)

    http = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    service = MarketDataService(http=http)
    try:
        items = await service.fundamentals("600519")
    finally:
        await service.aclose()
    metrics = {item["metric"]: item for item in items}

    assert metrics["gross_margin"]["value"] == 60
    assert metrics["net_profit_margin"]["value"] == 25
    assert metrics["debt_to_assets"]["value"] == 25
    assert metrics["gross_margin"]["components"] == [
        "gross_profit", "total_revenue",
    ]
    assert metrics["total_revenue"]["is_ttm"] is False
    assert "unverified_yahoo_ttm" in metrics["total_revenue"]["quality_flags"]


@pytest.mark.asyncio
async def test_suspicious_domestic_source_continues_to_yahoo_with_flags(monkeypatch):
    async def suspicious_domestic(symbol, adapters=None):
        return [{
            "metric": "net_income",
            "value": 100,
            "quality_flags": ["suspicious_net_income_quarter_change_gt_5x"],
        }]

    monkeypatch.setattr("app.services.fundamentals.fetch_cn_fundamentals", suspicious_domestic)

    def quarterly(metric, values):
        return {
            "meta": {"type": [metric]},
            metric: [
                {
                    "asOfDate": date,
                    "periodType": "3M",
                    "currencyCode": "CNY",
                    "reportedValue": {"raw": value},
                }
                for date, value in zip(
                    ("2025-06-30", "2025-09-30", "2025-12-31", "2026-03-31"), values,
                )
            ],
        }

    payload = {"timeseries": {"result": [
        quarterly("quarterlyTotalRevenue", [100, 100, 100, 100]),
        quarterly("quarterlyNetIncome", [100, 1, 2, 3]),
    ], "error": None}}
    http = httpx.AsyncClient(transport=httpx.MockTransport(
        lambda request: httpx.Response(200, json=payload, request=request)
    ))
    service = MarketDataService(http=http)
    try:
        items = await service.fundamentals("000858")
    finally:
        await service.aclose()

    net_income = next(item for item in items if item["metric"] == "net_income")
    assert net_income["provider"] == "yahoo"
    assert "suspicious_net_income_quarter_change_gt_5x" in net_income["quality_flags"]


@pytest.mark.asyncio
async def test_deep_research_resolves_legacy_company_name_before_llm():
    class StubMarket:
        async def search(self, query):
            assert query == "长鑫存储"
            return [{"code": "sh688825", "name": "长鑫科技"}]

        async def quote(self, ticker):
            assert ticker == "sh688825"
            return {"name": "C长鑫", "price": 47.96}

    ticker, name = await resolve_research_target("长鑫存储", StubMarket())
    assert ticker == "sh688825"
    assert name == "长鑫科技"
