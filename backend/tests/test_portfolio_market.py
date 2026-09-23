import pytest

from app.services import portfolio


class FakeMarket:
    async def quotes(self, tickers):
        assert tickers == ["AAPL", "00700"]
        return [
            {"code": "usAAPL", "name": "Apple Inc.", "price": 200.0, "change_percent": 1.2},
            {"code": "hk00700", "price": 400.0, "change_percent": -0.5},
        ]


@pytest.mark.asyncio
async def test_pnl_uses_shared_multimarket_service(monkeypatch):
    async def fake_positions(_portfolio_id, _user_id):
        return [
            {"id": 1, "ticker": "AAPL", "name": "", "shares": 2, "avg_cost": 150.0},
            {"id": 2, "ticker": "00700", "name": "Tencent", "shares": 1, "avg_cost": 350.0},
        ]

    monkeypatch.setattr(portfolio, "list_positions", fake_positions)
    result = await portfolio.calc_pnl(1, 7, market_service=FakeMarket())

    assert result["total_market_value"] == 800.0
    assert result["positions"][0]["pnl"] == 100.0
    assert result["positions"][1]["pnl"] == 50.0
    assert result["positions"][0]["name"] == "Apple Inc."


@pytest.mark.asyncio
async def test_pnl_with_hk_ticker(monkeypatch):
    class FakeMarket:
        async def quotes(self, tickers):
            assert tickers == ["00700"]
            return [{"code": "hk00700", "name": "Tencent", "price": 400.0, "change_percent": 1.5}]

    async def fake_positions(_portfolio_id, _user_id):
        return [{"id": 1, "ticker": "00700", "name": "", "shares": 2, "avg_cost": 300.0}]

    monkeypatch.setattr(portfolio, "list_positions", fake_positions)

    result = await portfolio.calc_pnl(1, 7, market_service=FakeMarket())

    assert result["total_market_value"] == 800.0
    assert result["total_pnl"] == 200.0
    assert result["positions"][0]["name"] == "Tencent"
