"""Deterministic branch coverage for BACKLOG-010 residual targets."""

from __future__ import annotations

import json
import sys
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.agent import tools_definitions
from app.routers import analysis
from app.services import alpha_service, chip_distribution, instruments
from app.services.chip_distribution import ChipDistributionUnavailable
from app.services.market_data import MarketError


def _request(market: object) -> SimpleNamespace:
    return SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(market=market)))


async def _events(response: object) -> list[dict[str, str]]:
    return [event async for event in response.body_iterator]


class FixtureMarket:
    def __init__(self, *, quote=None, kline=None, quote_error=None, kline_error=None):
        self.quote_result = quote or {}
        self.kline_result = kline or []
        self.quote_error = quote_error
        self.kline_error = kline_error

    async def quote(self, _ticker):
        if self.quote_error:
            raise self.quote_error
        return self.quote_result

    async def kline(self, _ticker, _period="1d", _count=120):
        if self.kline_error:
            raise self.kline_error
        return self.kline_result


@pytest.mark.asyncio
async def test_analysis_rejects_unresolvable_ticker(monkeypatch):
    async def reject(*_args):
        raise ValueError("bad ticker")

    monkeypatch.setattr(analysis, "resolve_ticker", reject)
    with pytest.raises(HTTPException) as exc:
        await analysis.analyze_stock(
            analysis.StockAnalysisRequest(ticker="bad"), _request(FixtureMarket()), {"id": 3}
        )
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_analysis_market_fallback_and_pipeline_error_event_close(monkeypatch):
    closed: list[bool] = []

    async def resolve(*_args):
        return "usAAPL"

    async def research(*_args, **_kwargs):
        try:
            yield "agent_started", {"role_key": "technical_analyst"}
            yield "error", {"message": "fixture failed", "role_key": "technical_analyst"}
            yield "done", {"unexpected": True}
        finally:
            closed.append(True)

    monkeypatch.setattr(analysis, "resolve_ticker", resolve)
    monkeypatch.setattr(analysis, "run_research", research)
    response = await analysis.analyze_stock(
        analysis.StockAnalysisRequest(ticker="AAPL", model_id=9),
        _request(FixtureMarket(quote_error=MarketError("quote down"))),
        {"id": 3},
    )
    events = await _events(response)

    assert [event["event"] for event in events] == ["agent_started", "error"]
    assert json.loads(events[-1]["data"]) == {
        "error": "fixture failed",
        "message": "fixture failed",
        "role_key": "technical_analyst",
    }
    assert closed == [True]


@pytest.mark.asyncio
async def test_analysis_indicator_error_mappings(monkeypatch):
    async def reject(*_args):
        raise ValueError("bad ticker")

    monkeypatch.setattr(analysis, "resolve_ticker", reject)
    with pytest.raises(HTTPException) as invalid:
        await analysis.get_indicators(_request(FixtureMarket()), "bad", {"id": 1})
    assert invalid.value.status_code == 400

    async def resolve(*_args):
        return "usAAPL"

    monkeypatch.setattr(analysis, "resolve_ticker", resolve)
    with pytest.raises(HTTPException) as upstream:
        await analysis.get_indicators(
            _request(FixtureMarket(kline_error=MarketError("kline down"))), "AAPL", {"id": 1}
        )
    assert upstream.value.status_code == 502

    monkeypatch.setattr(analysis.indicators, "compute", lambda _rows: (_ for _ in ()).throw(ValueError("short")))
    with pytest.raises(HTTPException) as computation:
        await analysis.get_indicators(
            _request(FixtureMarket(kline=[{"day": "2026-01-01"}])), "AAPL", {"id": 1}
        )
    assert computation.value.status_code == 400


@pytest.mark.asyncio
async def test_analysis_chart_data_error_mappings(monkeypatch):
    async def reject(*_args):
        raise ValueError("bad ticker")

    monkeypatch.setattr(analysis, "resolve_ticker", reject)
    with pytest.raises(HTTPException) as invalid:
        await analysis.get_chart_data(_request(FixtureMarket()), "bad", {"id": 1})
    assert invalid.value.status_code == 400

    async def resolve(*_args):
        return "usAAPL"

    monkeypatch.setattr(analysis, "resolve_ticker", resolve)
    with pytest.raises(HTTPException) as upstream:
        await analysis.get_chart_data(
            _request(FixtureMarket(kline_error=MarketError("down"))), "AAPL", {"id": 1}
        )
    assert upstream.value.status_code == 502

    with pytest.raises(HTTPException) as empty:
        await analysis.get_chart_data(_request(FixtureMarket(kline=[])), "AAPL", {"id": 1})
    assert empty.value.status_code == 404


@pytest.mark.asyncio
async def test_analysis_chart_data_formats_valid_and_provider_dates(monkeypatch):
    async def resolve(*_args):
        return "usAAPL"

    rows = [
        {"day": "2026-01-02", "open": 10, "high": 12, "low": 9, "close": 11, "volume": 100},
        {"day": "provider-date", "open": 11, "high": 13, "low": 10, "close": 12, "volume": 120},
    ]
    monkeypatch.setattr(analysis, "resolve_ticker", resolve)
    result = await analysis.get_chart_data(
        _request(FixtureMarket(kline=rows)), "AAPL", {"id": 1}, count=30, period="60m"
    )

    assert result["ticker"] == "usAAPL"
    assert result["period"] == "60m"
    assert isinstance(result["data"][0]["time"], int)
    assert result["data"][1]["time"] == "provider-date"


def test_instrument_helpers_cover_asset_and_timestamp_variants():
    assert instruments.instrument_from_code("600519", asset_type="ETF")["asset_type"] == "etf"
    assert instruments.instrument_from_code("000001", asset_type="指数")["asset_type"] == "index"
    assert instruments.instrument_from_code("AAPL", asset_type="bond")["asset_type"] == "bond"
    assert instruments._as_of_from_timestamp("invalid", "UTC") is None
    assert instruments._as_of_from_timestamp(0, "UTC") is None
    assert instruments._as_of_from_timestamp(20260830112233, "Asia/Shanghai") == "2026-08-30T11:22:33"
    assert instruments._as_of_from_timestamp(99999999999999, "UTC") is None
    assert instruments._as_of_from_timestamp(1_700_000_000, "UTC").startswith("2023-")


@pytest.mark.asyncio
async def test_instrument_search_deduplicates_symbols_and_sources():
    class Market:
        async def search(self, _query):
            return [
                {"code": "sh600519", "name": "贵州茅台", "type": "股票", "source": "eastmoney"},
                {"code": "600519", "name": "duplicate", "source": "eastmoney"},
                {"code": "00700.HK", "name": "腾讯", "type": "ETF", "source": "yahoo"},
            ]

    result = await instruments.InstrumentService(Market()).search("fixture")

    assert [item["symbol"] for item in result["items"]] == ["600519", "00700.HK"]
    assert result["provider"] == "eastmoney,yahoo"
    assert result["quality_flags"] == []


@pytest.mark.asyncio
async def test_instrument_empty_search_is_explicit():
    class Market:
        async def search(self, _query):
            return []

    result = await instruments.InstrumentService(Market()).search("missing")
    assert result["items"] == []
    assert result["provider"] == "eastmoney,yahoo"
    assert result["quality_flags"] == ["no_matches"]


@pytest.mark.asyncio
async def test_instrument_snapshot_converts_provider_zeroes_to_unknown():
    quote = {
        "code": "usAAPL",
        "name": "Apple",
        "price": 100,
        "timestamp": "invalid",
        "source": "fixture",
        "open": 0,
        "high": 0,
        "low": 0,
        "volume": 0,
        "amount": 0,
        "turnover_rate": 0,
        "pe": 0,
        "pb": 0,
        "market_cap": 0,
    }

    class Market:
        async def quote(self, _symbol):
            return quote

    result = await instruments.InstrumentService(Market()).snapshot("AAPL")

    assert result["data"]["open"] is None
    assert result["data"]["market_cap"] is None
    assert "missing_open" in result["quality_flags"]
    assert "missing_as_of" in result["quality_flags"]


@pytest.mark.asyncio
async def test_instrument_bars_reports_partial_unadjusted_history(monkeypatch):
    rows = [
        {
            "day": "2026-08-30",
            "open": 10,
            "high": 12,
            "low": 9,
            "close": 11,
            "volume": 100,
            "source": "fixture",
            "adjustment": "none",
        }
    ]

    class Market:
        async def kline(self, _symbol, _period, _count):
            return rows

    monkeypatch.setattr(instruments.indicators, "compute", lambda clean, names: {"rows": len(clean), "names": names})
    result = await instruments.InstrumentService(Market()).bars("600519", "1d", 30)

    assert result["indicators"]["rows"] == 1
    assert result["quality_flags"] == ["partial_history", "unadjusted_prices"]
    assert result["adjustment"] == "none"


def test_alpha_library_scoring_and_custom_fields(monkeypatch):
    monkeypatch.setattr(alpha_service, "_load_wq_search_rows", lambda: ())

    assert alpha_service.search_alpha("alpha001")[0]["name"] == "Alpha001"
    assert alpha_service.search_alpha("alpha")[0]["type"] == "alpha"
    assert any(item["name"] == "Alpha001" for item in alpha_service.search_alpha("ts_argmax"))
    assert any(item["name"] == "换手率" for item in alpha_service.search_alpha("换手率"))


def test_alpha_category_fallback_and_correlation_boundaries(monkeypatch):
    monkeypatch.setattr(alpha_service, "_load_wq_fields", lambda: ())
    categories = alpha_service.list_categories()
    assert categories[0]["name"] == "动量因子"

    assert alpha_service.calc_correlation([1], [2])["note"] == "样本不足"
    assert alpha_service.calc_correlation([1, 1, 1], [1, 2, 3])["note"] == "零方差序列"
    assert alpha_service.calc_correlation([1, 2, 3], [1, 2, 3])["correlation"] == 1
    imperfect = alpha_service.calc_correlation([1, 2, 4, 8], [1, 3, 2, 9])
    assert imperfect["n"] == 4
    assert isinstance(imperfect["significant"], bool)

    long = list(range(40))
    assert alpha_service.calc_correlation(long, [value * 2 + (value % 3) for value in long])["n"] == 40
    assert alpha_service._norm_cdf(-1) < 0.5


def _chip_row(**changes):
    row = {
        "日期": "2026-07-31",
        "获利比例": 0.5,
        "平均成本": 100,
        "90成本-低": 90,
        "90成本-高": 110,
        "90集中度": 0.2,
        "70成本-低": 95,
        "70成本-高": 105,
        "70集中度": 0.1,
    }
    row.update(changes)
    return row


def test_chip_provider_loader_uses_records(monkeypatch):
    class Frame:
        def to_dict(self, orient):
            assert orient == "records"
            return [_chip_row()]

    fake = SimpleNamespace(stock_cyq_em=lambda **kwargs: Frame())
    monkeypatch.setitem(sys.modules, "akshare", fake)
    assert chip_distribution._load_records("600519", "qfq") == [_chip_row()]


@pytest.mark.parametrize("value", ["invalid", float("nan")])
def test_chip_number_rejects_non_numeric_and_non_finite(value):
    with pytest.raises(ChipDistributionUnavailable, match="无效"):
        chip_distribution._number(value, "fixture")


@pytest.mark.parametrize(
    "row, message",
    [
        (_chip_row(**{"平均成本": 0}), "必须为正数"),
        (_chip_row(**{"日期": "not-a-date"}), "日期无效"),
        (_chip_row(**{"90成本-低": 120}), "上下界颠倒"),
    ],
)
def test_chip_row_validation_boundaries(row, message):
    with pytest.raises(ChipDistributionUnavailable, match=message):
        chip_distribution._normalize_row(row)


@pytest.mark.asyncio
async def test_chip_distribution_rejects_adjustment_and_provider_failures(monkeypatch):
    with pytest.raises(ValueError, match="复权方式"):
        await chip_distribution.fetch_chip_distribution("600519", "bad")

    monkeypatch.setattr(chip_distribution, "_load_records", lambda *_args: (_ for _ in ()).throw(RuntimeError("down")))
    with pytest.raises(ChipDistributionUnavailable, match="暂时不可用"):
        await chip_distribution.fetch_chip_distribution("600519")

    monkeypatch.setattr(chip_distribution, "_load_records", lambda *_args: [])
    with pytest.raises(ChipDistributionUnavailable, match="未返回"):
        await chip_distribution.fetch_chip_distribution("600519")

    expected = ChipDistributionUnavailable("known")
    monkeypatch.setattr(chip_distribution, "_load_records", lambda *_args: (_ for _ in ()).throw(expected))
    with pytest.raises(ChipDistributionUnavailable, match="known"):
        await chip_distribution.fetch_chip_distribution("600519")


def test_tencent_parser_handles_short_and_invalid_numeric_fields():
    fields = [""] * 50
    fields[1] = "Fixture"
    fields[3] = "nan"
    fields[4] = "10"
    fields[31] = "invalid"
    fields[32] = "1.5"
    raw = '\n'.join([
        'v_sh000001="too~short";',
        f'v_usAAPL="{"~".join(fields)}";',
        "ignored",
    ])

    result = tools_definitions._parse_tencent(raw)

    assert len(result) == 1
    assert result[0]["code"] == "usAAPL"
    assert result[0]["name"] == "Fixture"
    assert result[0]["price"] == 0
    assert result[0]["change"] == -10
    assert result[0]["change_percent"] == 1.5
    assert result[0]["timestamp"] == 0


@pytest.mark.asyncio
async def test_market_agent_tools_cover_required_and_upstream_failures(monkeypatch):
    assert not (await tools_definitions.GetStockData().run()).success
    assert not (await tools_definitions.CalculateIndicators().run()).success

    closed: list[bool] = []

    class BrokenMarket:
        async def quote(self, _ticker):
            raise MarketError("quote down")

        async def kline(self, *_args, **_kwargs):
            raise MarketError("kline down")

        async def aclose(self):
            closed.append(True)

    monkeypatch.setattr("app.services.market_data.MarketDataService", BrokenMarket)
    quote = await tools_definitions.GetStockData().run(ticker="AAPL")
    kline = await tools_definitions.CalculateIndicators().run(ticker="AAPL")

    assert quote.error == "行情获取失败：quote down"
    assert kline.error == "K线获取失败：kline down"
    assert closed == [True, True]


@pytest.mark.asyncio
async def test_indicator_and_valuation_tools_cover_calculation_failures(monkeypatch):
    class Market:
        async def kline(self, *_args, **_kwargs):
            return [{"day": "2026-01-01"}]

        async def aclose(self):
            return None

    monkeypatch.setattr("app.services.market_data.MarketDataService", Market)
    monkeypatch.setattr(
        "app.services.indicators.compute",
        lambda *_args: (_ for _ in ()).throw(ValueError("indicator failure")),
    )
    indicator = await tools_definitions.CalculateIndicators().run(ticker="AAPL")
    assert indicator.error == "indicator failure"

    assert not (await tools_definitions.VerifyValuation().run()).success
    monkeypatch.setattr(
        "app.tools.financial_rigor.verify_valuation",
        lambda **_kwargs: (_ for _ in ()).throw(RuntimeError("valuation failure")),
    )
    valuation = await tools_definitions.VerifyValuation().run(price=10)
    assert valuation.error == "估值计算异常：valuation failure"


@pytest.mark.asyncio
async def test_screen_audit_and_news_tools_cover_validation_failures(monkeypatch):
    class Market:
        async def aclose(self):
            return None

    async def reject_screen(*_args):
        raise ValueError("screen failure")

    monkeypatch.setattr(tools_definitions, "MarketDataService", Market)
    monkeypatch.setattr(tools_definitions, "run_stock_screen", reject_screen)
    screened = await tools_definitions.ScreenStocks().run(tickers=["AAPL"])
    assert screened.error == "screen failure"

    invalid_audit = await tools_definitions.AuditReportData().run(
        markdown="Revenue 100", verified_results={"not": "a list"}
    )
    assert invalid_audit.error == "verified_results 必须是数组"
    monkeypatch.setattr(tools_definitions, "render_verdict", lambda rows: {"rows": rows})
    audited = await tools_definitions.AuditReportData().run(markdown="Revenue 100", verified_results=[])
    assert audited.data == {"rows": []}

    assert not (await tools_definitions.SearchNews().run()).success

    class BrokenNews:
        def __init__(self, **_kwargs):
            pass

        async def search(self, *_args, **_kwargs):
            raise RuntimeError("news failure")

        async def aclose(self):
            return None

    monkeypatch.setattr(tools_definitions, "NewsSearchService", BrokenNews)
    news = await tools_definitions.SearchNews().run(keyword="AAPL")
    assert news.error == "新闻搜索失败：news failure"


@pytest.mark.asyncio
async def test_financial_and_review_tools_cover_invalid_inputs(monkeypatch):
    calculator = tools_definitions.CalculateByFinancialRigor()
    assert not (await calculator.run()).success
    assert (await calculator.run(expression="open('secret')")).error == "表达式包含非法字符"
    assert (await calculator.run(expression="1 / 0")).error == "计算异常：division by zero"

    checklist = tools_definitions.CheckBuffettRules()
    assert not (await checklist.run(assessments=[])).success
    assert not (await checklist.run(assessments={}, notes=[])).success
    monkeypatch.setattr(
        "app.tools.investment_checklist.check_buffett_rules",
        lambda *_args: (_ for _ in ()).throw(ValueError("checklist failure")),
    )
    assert (await checklist.run(assessments={})).error == "checklist failure"

    review = tools_definitions.AdversarialReview()
    assert not (await review.run(claims={})).success
    assert not (await review.run(claims=[], financial_signals=[])).success
    assert not (await tools_definitions.RunBacktest().run(ticker="", count=20)).success
    assert not (await tools_definitions.AnalyzeShadowTrades().run(trades=[{"side": "hold"}])).success
    assert not (await tools_definitions.AnalyzePortfolioRisk().run()).success
