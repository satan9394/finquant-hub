import sys
from types import SimpleNamespace

import pytest

from app.services import market_data
from app.services.fundamentals import (
    AkshareFundamentalsAdapter,
    FundamentalsAdapter,
    build_ttm_from_single_quarters,
    cumulative_to_single_quarters,
    fetch_cn_fundamentals,
    normalize_fundamental_record,
    normalize_yahoo_cn_fundamentals,
    validate_fundamental_quality,
)
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
    assert akshare[0]["as_of_date"] == "2026-03-31"
    assert akshare[0]["source"] == "akshare"
    assert akshare[0]["is_ttm"] is False
    assert {item["provider"] for item in tushare} == {"tushare"}


def test_normalize_core_financial_statements_without_confusing_growth_columns():
    items = normalize_fundamental_record({
        "报告期": "2026-03-31",
        "营业总收入(元)": "1,234.5亿",
        "营业总收入同比增长": "12.5%",
        "归母净利润": "456.7亿",
        "经营活动产生的现金流量净额": "321亿",
        "每股经营现金流": "9.99",
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


def test_per_share_cash_flow_is_not_treated_as_total_cash_flow():
    items = normalize_fundamental_record({
        "报告期": "2026-03-31",
        "每股经营现金流": "9.99",
    }, "akshare")

    assert "operating_cash_flow" not in {item["metric"] for item in items}


def test_normalizes_provider_reported_p1_quality_and_debt_ratios():
    items = normalize_fundamental_record({
        "报告期": "2026-03-31",
        "投入资本回报率": "15.2%",
        "总资产收益率": "9.4%",
        "速动比率": "1.8",
        "利息保障倍数": "12.6",
    }, "akshare")

    assert {item["metric"]: item["value"] for item in items} == {
        "roic": 15.2,
        "roa": 9.4,
        "quick_ratio": 1.8,
        "interest_coverage": 12.6,
    }


def test_derives_only_auditable_cash_quality_p1_metrics():
    base = {
        "as_of": "2026-03-31", "as_of_date": "2026-03-31", "currency": "CNY",
        "period_type": "TTM", "provider": "akshare", "source": "akshare.test", "is_ttm": True,
    }
    items = validate_fundamental_quality([
        {**base, "metric": "total_revenue", "value": 1_000.0},
        {**base, "metric": "net_income", "value": 200.0},
        {**base, "metric": "operating_cash_flow", "value": 250.0},
        {**base, "metric": "free_cash_flow", "value": 150.0},
        {**base, "metric": "market_cap", "value": 3_000.0, "period_type": "point", "is_ttm": False},
    ])
    metrics = {item["metric"]: item for item in items}

    assert metrics["cfo_to_net_income"]["value"] == 125
    assert metrics["fcf_margin"]["value"] == 15
    assert metrics["fcf_yield"]["value"] == 5
    assert metrics["fcf_yield"]["components"] == ["free_cash_flow", "market_cap"]

    incompatible = validate_fundamental_quality([
        {**base, "metric": "net_income", "value": 200.0},
        {**base, "metric": "operating_cash_flow", "value": 250.0, "as_of": "2025-12-31", "as_of_date": "2025-12-31"},
    ])
    assert "cfo_to_net_income" not in {item["metric"] for item in incompatible}


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

    async def domestic(symbol, adapters=None):
        assert symbol == "sh600519"
        assert adapters is not None
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


def test_ttm_requires_and_sums_four_consecutive_single_quarters():
    records = [
        {"报告期": date, "营业总收入": revenue, "净利润": income}
        for date, revenue, income in (
            ("2025-06-30", 10, 1),
            ("2025-09-30", 20, 2),
            ("2025-12-31", 30, 3),
            ("2026-03-31", 40, 4),
        )
    ]
    metrics = {item["metric"]: item for item in build_ttm_from_single_quarters(records, "test")}

    assert metrics["total_revenue"]["value"] == 100
    assert metrics["net_income"]["value"] == 10
    assert metrics["total_revenue"]["is_ttm"] is True
    assert metrics["total_revenue"]["source_periods"] == [
        "2025-06-30", "2025-09-30", "2025-12-31", "2026-03-31",
    ]


def test_ttm_rejects_missing_quarter_instead_of_mislabeling_single_period():
    records = [
        {"报告期": "2025-03-31", "营业总收入": 10},
        {"报告期": "2025-06-30", "营业总收入": 20},
        {"报告期": "2025-12-31", "营业总收入": 30},
        {"报告期": "2026-03-31", "营业总收入": 40},
    ]

    assert build_ttm_from_single_quarters(records, "test") == []


def test_quarter_scale_jump_and_unreasonable_margin_are_flagged():
    records = [
        {"报告期": date, "营业总收入": 100, "净利润": income}
        for date, income in (
            ("2025-06-30", 1_000),
            ("2025-09-30", 1),
            ("2025-12-31", 2),
            ("2026-03-31", 3),
        )
    ]
    ttm = build_ttm_from_single_quarters(records, "test")
    items = validate_fundamental_quality(ttm)
    metrics = {item["metric"]: item for item in items}

    assert "suspicious_net_income_quarter_change_gt_5x" in metrics["net_income"]["quality_flags"]
    assert "suspicious_net_profit_margin_outside_0_60" in metrics["net_profit_margin"]["quality_flags"]


def test_tushare_cumulative_rows_are_converted_before_ttm_sum():
    records = [
        {"end_date": "20250331", "total_revenue": 10, "n_income_attr_p": 1},
        {"end_date": "20250630", "total_revenue": 30, "n_income_attr_p": 3},
        {"end_date": "20250930", "total_revenue": 60, "n_income_attr_p": 6},
        {"end_date": "20251231", "total_revenue": 100, "n_income_attr_p": 10},
    ]

    quarters = cumulative_to_single_quarters(records, "tushare")
    metrics = {item["metric"]: item for item in build_ttm_from_single_quarters(quarters, "tushare")}

    assert metrics["total_revenue"]["value"] == 100
    assert metrics["net_income"]["value"] == 10


def test_yahoo_single_trailing_value_is_never_claimed_as_ttm():
    value = {
        "asOfDate": "2026-03-31",
        "periodType": "TTM",
        "currencyCode": "CNY",
        "reportedValue": {"raw": 46_280_000_000},
    }
    payload = {"result": [{
        "meta": {"type": ["trailingTotalRevenue"]},
        "trailingTotalRevenue": [value],
    }]}

    item = normalize_yahoo_cn_fundamentals(payload)[0]

    assert item["metric"] == "total_revenue"
    assert item["is_ttm"] is False
    assert item["period_type"] == "reported_unverified"
    assert item["quality_flags"] == ["unverified_yahoo_ttm"]


@pytest.mark.asyncio
async def test_akshare_adapter_requests_explicit_single_quarter_data(monkeypatch):
    calls = []

    class Frame:
        def __init__(self, records):
            self.records = records

        def to_dict(self, orientation):
            assert orientation == "records"
            return self.records

    quarter_records = [
        {"报告期": date, "营业总收入": 10, "净利润": 2}
        for date in ("2025-06-30", "2025-09-30", "2025-12-31", "2026-03-31")
    ]

    def abstract(*, symbol, indicator):
        assert symbol == "600519"
        calls.append(indicator)
        if indicator == "按单季度":
            return Frame(quarter_records)
        if indicator == "按年度":
            return Frame([{"报告期": "2025", "营业总收入": 40, "净利润": 8}])
        return Frame([{"报告期": "2026-03-31", "基本每股收益": 1.5}])

    monkeypatch.setitem(sys.modules, "akshare", SimpleNamespace(stock_financial_abstract_ths=abstract))
    items = await AkshareFundamentalsAdapter().fetch("600519")

    assert calls == ["按单季度", "按报告期", "按年度"]
    assert {item["metric"]: item["value"] for item in items}["total_revenue"] == 40
    assert next(item for item in items if item["metric"] == "total_revenue")["is_ttm"] is True
