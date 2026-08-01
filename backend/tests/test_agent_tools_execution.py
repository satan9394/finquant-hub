import pytest

from app.agent.tools import ToolRegistry
from app.agent.tools_definitions import (
    AnalyzePortfolioRisk,
    AnalyzeShadowTrades,
    AssessTradingConnector,
    AuditReportData,
    CalculateByFinancialRigor,
    CalculateIndicators,
    GetStockData,
    ScreenStocks,
    SearchNews,
    RunBacktest,
    VerifyValuation,
)


@pytest.mark.asyncio
async def test_get_stock_data_returns_quote_fields():
    result = await GetStockData().run(ticker="000001")

    assert result.success
    assert {"price", "market_cap", "pe"} <= result.data.keys()


@pytest.mark.asyncio
async def test_calculate_indicators_returns_requested_indicators():
    result = await CalculateIndicators().run(ticker="000001", indicators="ma,rsi")

    assert result.success
    assert {"ma", "rsi"} <= result.data["latest"].keys()


@pytest.mark.asyncio
async def test_verify_valuation_accepts_price():
    result = await VerifyValuation().run(ticker="000001", price=150)

    assert result.success


@pytest.mark.asyncio
async def test_screen_stocks_requires_explicit_universe():
    result = await ScreenStocks().run()

    assert result.success is False
    assert "tickers" in result.error


@pytest.mark.asyncio
async def test_search_news_returns_news_list(monkeypatch):
    async def fake_search(self, keyword, **kwargs):
        return {"keyword": keyword, "news": [{"title": "茅台资讯", "provider": "sina"}]}

    monkeypatch.setattr("app.agent.tools_definitions.NewsSearchService.search", fake_search)

    result = await SearchNews().run(keyword="\u8305\u53f0")

    assert result.success
    assert isinstance(result.data["news"], list)


def test_concrete_tools_are_registered_automatically(monkeypatch):
    expected_tools = {
        GetStockData.name,
        CalculateIndicators.name,
        VerifyValuation.name,
        ScreenStocks.name,
        AuditReportData.name,
        SearchNews.name,
        CalculateByFinancialRigor.name,
        RunBacktest.name,
        AnalyzeShadowTrades.name,
        AnalyzePortfolioRisk.name,
        AssessTradingConnector.name,
    }
    monkeypatch.setattr(ToolRegistry, "_instance", None)

    assert expected_tools <= {tool.name for tool in ToolRegistry().list_all()}


def test_unknown_tool_cannot_be_found():
    assert ToolRegistry().get("not_exist") is None
