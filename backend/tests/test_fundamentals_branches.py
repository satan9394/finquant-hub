from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.services import fundamentals
from app.services.fundamentals import (
    TushareFundamentalsAdapter,
    cumulative_to_single_quarters,
    fetch_cn_fundamentals,
    normalize_yahoo_cn_fundamentals,
    validate_fundamental_quality,
)


class Frame:
    def __init__(self, records):
        self.records = records

    def to_dict(self, orientation):
        assert orientation == "records"
        return self.records


class Adapter:
    name = "fixture"

    def is_available(self):
        return True

    async def fetch(self, _symbol):
        return []


def _item(metric, value, **updates):
    item = {
        "metric": metric, "value": value, "as_of": "2026-03-31", "as_of_date": "2026-03-31",
        "currency": "CNY", "period_type": "TTM", "provider": "fixture", "source": "fixture",
        "is_ttm": True,
    }
    item.update(updates)
    return item


def _yahoo_value(value, date="2026-03-31", period="Q"):
    return {
        "asOfDate": date, "periodType": period, "currencyCode": "CNY",
        "reportedValue": {"raw": value},
    }


def _yahoo_series(metric, values):
    return {"meta": {"type": [metric]}, metric: values}


def test_number_date_and_quarter_helpers_reject_ambiguous_values():
    assert fundamentals._number(True) is None
    assert fundamentals._number("--") is None
    assert fundamentals._number("1.5万亿") == 1_500_000_000_000
    assert fundamentals._number("not numeric") is None
    assert fundamentals._as_of({"end_date": "20260331"}) == "2026-03-31"
    assert fundamentals._quarter_index("2026-02-28") is None
    assert fundamentals._quarter_index("not-a-date") is None


def test_quality_flags_scale_and_derives_balance_sheet_ratios():
    current = [
        _item("total_revenue", 100),
        _item("net_income", -10),
        _item("gross_profit", 40),
        _item("total_assets", 500, period_type="point", is_ttm=False),
        _item("total_liabilities", 200, period_type="point", is_ttm=False),
        _item("free_cash_flow", 20),
        _item("market_cap", -1000, period_type="point", is_ttm=False),
    ]
    annual = [_item("total_revenue", 1000, period_type="FY", is_ttm=False)]
    result = validate_fundamental_quality(current, annual)
    by_metric = {item["metric"]: item for item in result}

    assert "suspicious_total_revenue_change_gt_5x" in by_metric["total_revenue"]["quality_flags"]
    assert "suspicious_net_profit_margin_outside_0_60" in by_metric["net_profit_margin"]["quality_flags"]
    assert by_metric["gross_margin"]["value"] == 40
    assert by_metric["debt_to_assets"]["value"] == 40
    assert "fcf_yield" not in by_metric


def test_ratio_derivation_rejects_cross_source_and_currency_mismatch():
    result = validate_fundamental_quality([
        _item("operating_cash_flow", 20, source="one"),
        _item("net_income", 10, source="two"),
        _item("free_cash_flow", 5, currency="USD"),
        _item("total_revenue", 100, currency="CNY"),
    ])
    metrics = {item["metric"] for item in result}
    assert "cfo_to_net_income" not in metrics
    assert "fcf_margin" not in metrics


def test_tushare_deduplication_and_missing_prior_quarter_are_conservative():
    records = [
        {"end_date": "", "total_revenue": 1},
        {"end_date": "20250331", "total_revenue": 10, "update_flag": "0"},
        {"end_date": "20250331", "total_revenue": 12, "update_flag": "1"},
        {"end_date": "20250930", "total_revenue": 50, "update_flag": "1"},
    ]
    quarters = cumulative_to_single_quarters(records, "tushare")
    assert quarters[0]["total_revenue"] == 12
    assert quarters[1] == {"end_date": "20250930"}


@pytest.mark.asyncio
async def test_tushare_adapter_combines_partial_endpoints_and_falls_back_to_annual(monkeypatch):
    income = [
        {"end_date": date, "total_revenue": revenue, "n_income_attr_p": income_value}
        for date, revenue, income_value in (
            ("20250331", 10, 1), ("20250630", 30, 3), ("20250930", 60, 6), ("20251231", 100, 10)
        )
    ]
    cashflow = [
        {"end_date": date, "n_cashflow_act": value}
        for date, value in (("20250331", 2), ("20250630", 5), ("20250930", 9), ("20251231", 14))
    ]

    class Pro:
        def fina_indicator(self, **kwargs):
            assert kwargs["ts_code"] == "600519.SH"
            return Frame([{"end_date": "20251231", "roe": 20, "update_flag": "1"}])

        def income(self, **_kwargs):
            return Frame(income)

        def cashflow(self, **_kwargs):
            return Frame(cashflow)

        def balancesheet(self, **_kwargs):
            raise RuntimeError("fixture balance unavailable")

    monkeypatch.setattr(
        fundamentals.importlib,
        "import_module",
        lambda name: SimpleNamespace(pro_api=lambda token: Pro()) if name == "tushare" else None,
    )
    items = await TushareFundamentalsAdapter("token").fetch("600519")
    by_metric = {item["metric"]: item for item in items}

    assert by_metric["total_revenue"]["value"] == 100
    assert by_metric["operating_cash_flow"]["value"] == 14
    assert by_metric["roe"]["value"] == 20


@pytest.mark.asyncio
async def test_tushare_adapter_raises_when_every_endpoint_fails(monkeypatch):
    class Pro:
        def __getattr__(self, _name):
            def fail(**_kwargs):
                raise RuntimeError("all fixture endpoints failed")
            return fail

    monkeypatch.setattr(
        fundamentals.importlib,
        "import_module",
        lambda _name: SimpleNamespace(pro_api=lambda _token: Pro()),
    )
    with pytest.raises(RuntimeError, match="all fixture endpoints failed"):
        await TushareFundamentalsAdapter("token").fetch("000001")


def test_yahoo_quarters_annual_and_point_metrics_preserve_period_quality():
    dates = ("2025-06-30", "2025-09-30", "2025-12-31", "2026-03-31")
    payload = {"result": [
        _yahoo_series("quarterlyTotalRevenue", [_yahoo_value(value, date) for value, date in enumerate(dates, 1)]),
        _yahoo_series("quarterlyNetIncome", [_yahoo_value(value, date) for value, date in enumerate(dates, 1)]),
        _yahoo_series("annualTotalRevenue", [_yahoo_value(20, "2025-12-31", "FY")]),
        _yahoo_series("trailingMarketCap", [_yahoo_value(1000, period="TTM")]),
        {"meta": {"type": []}},
    ]}
    result = normalize_yahoo_cn_fundamentals(payload)
    by_metric = {item["metric"]: item for item in result}

    assert by_metric["total_revenue"]["value"] == 10
    assert by_metric["total_revenue"]["is_ttm"] is True
    assert by_metric["market_cap"]["value"] == 1000
    assert by_metric["market_cap"]["is_ttm"] is False


@pytest.mark.asyncio
async def test_fetch_cn_fundamentals_returns_empty_for_available_empty_adapter():
    assert await fetch_cn_fundamentals("600519", (Adapter(),)) == []
