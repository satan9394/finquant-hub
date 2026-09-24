from datetime import date, timedelta
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.routers import portfolio as portfolio_router
from app.services.portfolio_risk import analyze_portfolio_prices


def _rows(start: date, closes: list[float]) -> list[dict[str, object]]:
    return [
        {"time": (start + timedelta(days=index)).isoformat(), "close": close}
        for index, close in enumerate(closes)
    ]


def test_tearsheet_drawdown_duration_months_and_underwater_are_consistent():
    result = analyze_portfolio_prices(
        {"AAA": _rows(date(2026, 1, 30), [100.0, 120.0, 90.0, 120.0])},
        {"AAA": 1.0},
    )

    assert result["metrics"]["max_drawdown"] == pytest.approx(-0.25)
    assert result["metrics"]["max_drawdown_duration_days"] == 2
    assert [point["value"] for point in result["underwater_series"]] == pytest.approx([0, 0, -0.25, 0])
    assert result["monthly_matrix"][0]["months"][0] == pytest.approx(0.2)
    assert result["monthly_matrix"][0]["months"][1] == pytest.approx(0.0)
    assert result["monthly_matrix"][0]["annual_total"] == pytest.approx(0.2)


def test_rolling_window_is_sixty_aligned_returns_and_exposures_sum_to_one():
    returns = [0.001 if index % 3 else -0.0005 for index in range(60)]
    closes = [100.0]
    for value in returns:
        closes.append(closes[-1] * (1 + value))
    result = analyze_portfolio_prices(
        {
            "AAA": _rows(date(2026, 1, 1), closes),
            "BBB": _rows(date(2026, 1, 1), [value * 0.5 for value in closes]),
        },
        {"AAA": 1.0, "BBB": 2.0},
    )

    assert result["status"] == "ok"
    assert len(result["rolling_metrics"]) == 1
    assert result["rolling_metrics"][0]["time"] == (date(2026, 1, 1) + timedelta(days=60)).isoformat()
    assert result["metrics"]["concentration_hhi"] == pytest.approx(0.5)
    assert result["metrics"]["effective_asset_count"] == pytest.approx(2.0)
    assert sum(item["risk_contribution"] for item in result["risk_contributions"]) == pytest.approx(1.0)


def test_missing_price_history_is_partial_and_empty_portfolio_is_unknown():
    partial = analyze_portfolio_prices(
        {"AAA": _rows(date(2026, 1, 1), [100.0, 101.0, 99.0])},
        {"AAA": 1.0, "BBB": 2.0},
    )
    empty = analyze_portfolio_prices({}, {})

    assert partial["status"] == "partial"
    assert partial["coverage"]["missing_symbols"] == ["BBB"]
    assert "missing_price_history" in partial["warnings"]
    assert empty["status"] == "insufficient"
    assert empty["reason"] == "empty_portfolio"
    assert empty["metrics"]["max_drawdown"] is None


def test_inconsistent_adjustment_basis_is_exposed_as_partial_quality():
    dates = date(2026, 1, 1)
    first = [
        {"day": (dates + timedelta(days=index)).isoformat(), "close": 100 + index, "source": "sina", "adjustment": "none"}
        for index in range(3)
    ]
    second = [
        {"day": (dates + timedelta(days=index)).isoformat(), "close": 50 + index, "source": "tencent", "adjustment": "qfq"}
        for index in range(3)
    ]

    result = analyze_portfolio_prices({"AAA": first, "BBB": second}, {"AAA": 1.0, "BBB": 2.0})

    assert result["status"] == "partial"
    assert "mixed_adjustment_basis" in result["warnings"]
    assert result["coverage"]["source_metadata"]["BBB"]["adjustments"] == ["qfq"]


@pytest.mark.asyncio
async def test_risk_tearsheet_route_fetches_daily_history_for_owned_portfolio(monkeypatch):
    async def get_portfolio(portfolio_id: int, user_id: int):
        assert (portfolio_id, user_id) == (12, 7)
        return {"id": 12, "currency": "CNY"}

    async def list_positions(portfolio_id: int, user_id: int):
        assert (portfolio_id, user_id) == (12, 7)
        return [
            {"ticker": "AAA", "shares": 1.0, "currency": "CNY"},
            {"ticker": "BBB", "shares": 1.0, "currency": "CNY"},
        ]

    class Market:
        async def kline(self, symbol: str, period: str, count: int):
            assert (period, count) == ("1d", 800)
            offset = 100.0 if symbol == "AAA" else 50.0
            return [
                {"day": row["time"], "close": row["close"], "source": "sina", "adjustment": "none"}
                for row in _rows(date(2026, 1, 1), [offset + index * 0.1 + (index % 4) * 0.2 for index in range(61)])
            ]

    monkeypatch.setattr(portfolio_router.svc, "get_portfolio", get_portfolio)
    monkeypatch.setattr(portfolio_router.svc, "list_positions", list_positions)
    request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(market=Market())))

    result = await portfolio_router.portfolio_risk_tearsheet(12, request, {"id": 7})

    assert result["status"] == "ok"
    assert result["currency"] == "CNY"
    assert result["method"] == "current_share_quantities_fixed_over_history"
    assert result["coverage"]["observation_count"] == 60
    assert result["coverage"]["source_metadata"]["AAA"] == {"sources": ["sina"], "adjustments": ["none"]}
    assert result["risk_contributions"]


@pytest.mark.asyncio
async def test_risk_tearsheet_refuses_unconverted_mixed_currencies(monkeypatch):
    async def get_portfolio(_portfolio_id: int, _user_id: int):
        return {"id": 12, "currency": "CNY"}

    async def list_positions(_portfolio_id: int, _user_id: int):
        return [
            {"ticker": "600000", "shares": 1.0, "currency": "CNY"},
            {"ticker": "0700.HK", "shares": 1.0, "currency": "HKD"},
        ]

    class Market:
        async def kline(self, *_args):
            raise AssertionError("行情 must not be summed before currency conversion")

    monkeypatch.setattr(portfolio_router.svc, "get_portfolio", get_portfolio)
    monkeypatch.setattr(portfolio_router.svc, "list_positions", list_positions)
    request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(market=Market())))

    result = await portfolio_router.portfolio_risk_tearsheet(12, request, {"id": 7})

    assert result["status"] == "insufficient"
    assert result["reason"] == "unsupported_currency_conversion"
    assert result["metrics"]["annualized_volatility"] is None
    assert result["warnings"] == ["currency_conversion_unavailable"]


@pytest.mark.asyncio
async def test_risk_tearsheet_is_owner_scoped(monkeypatch):
    async def get_portfolio(_portfolio_id: int, _user_id: int):
        return None

    monkeypatch.setattr(portfolio_router.svc, "get_portfolio", get_portfolio)
    request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(market=object())))

    with pytest.raises(HTTPException) as caught:
        await portfolio_router.portfolio_risk_tearsheet(99, request, {"id": 7})

    assert caught.value.status_code == 404
