import httpx
import pytest

from app.agent import tools_definitions
from app.agent.tools import ToolRegistry
from app.agent.tools_definitions import CalculateIndicators, GetStockData, ScreenStocks, SearchNews, VerifyValuation


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
async def test_screen_stocks_returns_condition_summary():
    result = await ScreenStocks().run()

    assert result.success
    assert {"market", "conditions"} <= result.data.keys()


@pytest.mark.asyncio
async def test_search_news_returns_news_list(monkeypatch):
    original_client = httpx.AsyncClient

    def handler(request: httpx.Request) -> httpx.Response:
        assert "searchapi.sina.com.cn" in str(request.url)
        return httpx.Response(200, json={"result": [{"title": "\u8305\u53f0\u8d44\u8baf", "source": "\u6d4b\u8bd5"}]})

    monkeypatch.setattr(
        tools_definitions.httpx,
        "AsyncClient",
        lambda *args, **kwargs: original_client(transport=httpx.MockTransport(handler)),
    )

    result = await SearchNews().run(keyword="\u8305\u53f0")

    assert result.success
    assert isinstance(result.data["news"], list)


def test_registered_tool_can_be_found():
    assert ToolRegistry().get("get_stock_data") is not None


def test_unknown_tool_cannot_be_found():
    assert ToolRegistry().get("not_exist") is None
