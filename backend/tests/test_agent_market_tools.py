import pytest

from app.agent.tools_definitions import CalculateIndicators, GetStockData


@pytest.mark.asyncio
async def test_agent_stock_tool_supports_us_symbol():
    result = await GetStockData().run(ticker="AAPL")
    assert result.success
    assert result.data["code"] == "usAAPL"


@pytest.mark.asyncio
async def test_agent_indicator_tool_supports_hk_symbol():
    result = await CalculateIndicators().run(ticker="00700", indicators="rsi")
    assert result.success
    assert "rsi" in result.data["latest"]
