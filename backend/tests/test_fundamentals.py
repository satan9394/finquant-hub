import pytest

from app.services import market_data
from app.services.fundamentals import FundamentalsAdapter, fetch_cn_fundamentals, normalize_fundamental_record
from app.services.instruments import InstrumentService


def test_normalize_akshare_and_tushare_records_to_same_metrics():
    akshare = normalize_fundamental_record({
        "报告期": "2026-03-31",
        "基本每股收益": "2.50元",
        "净资产收益率": "18.2%",
        "资产负债率": "33.4%",
    }, "akshare")
    tushare = normalize_fundamental_record({
        "end_date": "20260331",
        "eps": 2.5,
        "roe": 18.2,
        "debt_to_assets": 33.4,
    }, "tushare")

    assert [(item["metric"], item["value"]) for item in akshare] == [
        (item["metric"], item["value"]) for item in tushare
    ]
    assert akshare[0]["as_of"] == "2026-03-31"
    assert {item["provider"] for item in tushare} == {"tushare"}


def test_normalize_core_financial_statements_without_confusing_growth_columns():
    items = normalize_fundamental_record({
        "报告期": "2026-03-31",
        "营业总收入(元)": "1,234.5亿",
        "营业总收入同比增长": "12.5%",
        "归母净利润": "456.7亿",
        "经营活动产生的现金流量净额": "321亿",
        "资产总计": "3,000亿",
        "负债合计": "800亿",
    }, "akshare")
    values = {item["metric"]: item["value"] for item in items}

    assert values["total_revenue"] == 123_450_000_000
    assert values["revenue_growth"] == 12.5
    assert values["net_income"] == 45_670_000_000
    assert values["operating_cash_flow"] == 32_100_000_000
    assert values["total_assets"] == 300_000_000_000
    assert values["total_liabilities"] == 80_000_000_000


class StubAdapter(FundamentalsAdapter):
    def __init__(self, name, *, available=True, result=None, error=None):
        self.name = name
        self.available = available
        self.result = result or []
        self.error = error

    def is_available(self):
        return self.available

    async def fetch(self, symbol):
        if self.error:
            raise self.error
        return self.result


@pytest.mark.asyncio
async def test_cn_fundamentals_falls_back_to_next_available_adapter():
    expected = [{"metric": "eps", "value": 1.0, "provider": "tushare"}]
    result = await fetch_cn_fundamentals("600519", (
        StubAdapter("akshare", error=RuntimeError("down")),
        StubAdapter("tushare", result=expected),
    ))
    assert result == expected


@pytest.mark.asyncio
async def test_market_service_uses_cn_adapter_before_yahoo(monkeypatch):
    expected = [{
        "metric": "eps", "value": 2.5, "as_of": "2026-03-31",
        "currency": "CNY", "period_type": "reported", "provider": "akshare",
    }]

    async def domestic(symbol):
        assert symbol == "sh600519"
        return expected

    monkeypatch.setattr("app.services.fundamentals.fetch_cn_fundamentals", domestic)
    service = market_data.MarketDataService()
    try:
        assert await service.fundamentals("600519") == expected
        payload = await InstrumentService(service).fundamentals("600519")
    finally:
        await service.aclose()

    assert payload["provider"] == "akshare"
    assert "missing_eps" not in payload["quality_flags"]


@pytest.mark.asyncio
async def test_cn_fundamentals_reports_all_provider_failures():
    with pytest.raises(RuntimeError, match="akshare:RuntimeError"):
        await fetch_cn_fundamentals("600519", (
            StubAdapter("disabled", available=False),
            StubAdapter("akshare", error=RuntimeError("down")),
        ))
