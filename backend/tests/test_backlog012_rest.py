from __future__ import annotations

from collections.abc import Callable
from unittest.mock import AsyncMock

import httpx
import pytest
from fastapi import FastAPI

from app.routers import instruments, market
from app.routers.auth import get_current_user
from app.services.a_stock_extra import AStockExtraService, EastmoneyThrottle


def _response(request: httpx.Request, payload: object, status: int = 200) -> httpx.Response:
    return httpx.Response(status, json=payload, request=request)


def _service(handler: Callable[[httpx.Request], httpx.Response]) -> AStockExtraService:
    return AStockExtraService(
        http=httpx.AsyncClient(transport=httpx.MockTransport(handler)),
        throttle=EastmoneyThrottle(min_interval=0, jitter=lambda: 0),
    )


async def _get(router, path: str) -> httpx.Response:
    app = FastAPI()
    app.dependency_overrides[get_current_user] = lambda: {"id": 1}
    app.include_router(router)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test") as client:
        return await client.get(path)


@pytest.mark.asyncio
async def test_money_flow_endpoint_transparently_returns_eastmoney_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    service = _service(lambda request: _response(request, {"data": {"klines": [
        "2026-08-31 14:59,120000,-10000,20000,30000,80000",
    ]}}))
    close = AsyncMock()
    monkeypatch.setattr(service, "aclose", close)
    monkeypatch.setattr(instruments, "AStockExtraService", lambda: service)

    response = await _get(instruments.router, "/api/instruments/600519/money-flow?period=minute")

    assert response.status_code == 200
    assert response.json() == {
        "ticker": "600519",
        "period": "minute",
        "source": "eastmoney.push2",
        "as_of": "2026-08-31 14:59",
        "quality": "DIRECT",
        "main_net": 120000.0,
        "large_net": 30000.0,
        "medium_net": 20000.0,
        "small_net": -10000.0,
        "items": [{
            "time": "2026-08-31 14:59",
            "main_net": 120000.0,
            "small_net": -10000.0,
            "medium_net": 20000.0,
            "large_net": 30000.0,
            "super_large_net": 80000.0,
        }],
    }
    close.assert_awaited_once()
    await service.http.aclose()  # type: ignore[union-attr]


@pytest.mark.asyncio
@pytest.mark.parametrize("path", [
    "/api/instruments/600519/money-flow?period=weekly",
    "/api/instruments/AAPL/money-flow?period=minute",
])
async def test_money_flow_endpoint_maps_invalid_parameters_to_400(
    monkeypatch: pytest.MonkeyPatch, path: str,
) -> None:
    service = _service(lambda request: _response(request, {}))
    monkeypatch.setattr(instruments, "AStockExtraService", lambda: service)

    response = await _get(instruments.router, path)

    assert response.status_code == 400
    await service.http.aclose()  # type: ignore[union-attr]


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["http", "json", "empty"])
async def test_money_flow_endpoint_maps_upstream_failures_to_502(
    monkeypatch: pytest.MonkeyPatch, kind: str,
) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if kind == "http":
            return _response(request, {}, 503)
        if kind == "json":
            return httpx.Response(200, text="{bad", request=request)
        return _response(request, {"data": {"klines": []}})

    service = _service(handler)
    monkeypatch.setattr(instruments, "AStockExtraService", lambda: service)

    response = await _get(instruments.router, "/api/instruments/600519/money-flow")

    assert response.status_code == 502
    await service.http.aclose()  # type: ignore[union-attr]


@pytest.mark.asyncio
async def test_dragon_tiger_endpoint_returns_latest_record_and_top_five(monkeypatch: pytest.MonkeyPatch) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        report = request.url.params["reportName"]
        if report == "RPT_DAILYBILLBOARD_DETAILSNEW":
            return _response(request, {"success": True, "result": {"data": [{
                "SECURITY_CODE": "600519",
                "SECURITY_NAME_ABBR": "贵州茅台",
                "TRADE_DATE": "2026-08-28 00:00:00",
                "EXPLANATION": "日涨幅偏离值达7%",
                "BILLBOARD_NET_AMT": 1200000,
            }]}})
        key = "BUY" if report.endswith("BUY") else "SELL"
        return _response(request, {"success": True, "result": {"data": [{
            "OPERATEDEPT_NAME": f"{key} seat",
            "BUY": 300000,
            "SELL": 100000,
            "NET": 200000,
        }]}})

    service = _service(handler)
    monkeypatch.setattr(instruments, "AStockExtraService", lambda: service)

    response = await _get(
        instruments.router,
        "/api/instruments/600519/dragon-tiger?date=2026-08-31&look_back=30",
    )

    assert response.status_code == 200
    item = response.json()["items"][0]
    assert item["date"] == "2026-08-28"
    assert item["net"] == 120.0
    assert item["top5_buy"][0]["name"] == "BUY seat"
    assert item["top5_sell"][0]["name"] == "SELL seat"
    await service.http.aclose()  # type: ignore[union-attr]


@pytest.mark.asyncio
@pytest.mark.parametrize("path", [
    "/api/instruments/AAPL/dragon-tiger?date=2026-08-31",
    "/api/instruments/600519/dragon-tiger?date=08%2F31%2F2026",
    "/api/instruments/600519/dragon-tiger?date=2026-08-31&look_back=0",
    "/api/instruments/600519/dragon-tiger?date=2026-08-31&look_back=366",
])
async def test_dragon_tiger_endpoint_maps_invalid_parameters_to_400(
    monkeypatch: pytest.MonkeyPatch, path: str,
) -> None:
    service = _service(lambda request: _response(request, {}))
    monkeypatch.setattr(instruments, "AStockExtraService", lambda: service)

    response = await _get(instruments.router, path)

    assert response.status_code == 400
    await service.http.aclose()  # type: ignore[union-attr]


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["http", "json"])
async def test_dragon_tiger_endpoint_maps_upstream_failures_to_502(
    monkeypatch: pytest.MonkeyPatch, kind: str,
) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if kind == "http":
            return _response(request, {}, 503)
        return httpx.Response(200, text="{bad", request=request)

    service = _service(handler)
    monkeypatch.setattr(instruments, "AStockExtraService", lambda: service)

    response = await _get(instruments.router, "/api/instruments/600519/dragon-tiger?date=2026-08-31")

    assert response.status_code == 502
    await service.http.aclose()  # type: ignore[union-attr]


@pytest.mark.asyncio
async def test_limit_pool_endpoint_transparently_returns_success(monkeypatch: pytest.MonkeyPatch) -> None:
    service = _service(lambda request: _response(request, {"data": {"pool": [{
        "c": "600519",
        "n": "贵州茅台",
        "lbc": 2,
        "fund": 12345678,
        "zbc": 1,
        "hybk": "白酒",
        "zttj": {"days": 3, "ct": 2},
    }]}}))
    monkeypatch.setattr(market, "AStockExtraService", lambda: service)

    response = await _get(market.router, "/api/market/limit-pool?date=2026-08-31&pool=limit_up")

    assert response.status_code == 200
    assert response.json()["items"][0] == {
        "code": "600519",
        "name": "贵州茅台",
        "limit_up_count": 2,
        "seal_amount": 12345678.0,
        "break_times": 1,
        "industry": "白酒",
        "limit_stat": "3天2板",
    }
    await service.http.aclose()  # type: ignore[union-attr]


@pytest.mark.asyncio
@pytest.mark.parametrize("path", [
    "/api/market/limit-pool?date=08%2F31%2F2026",
    "/api/market/limit-pool?date=2026-08-31&pool=broken",
])
async def test_limit_pool_endpoint_maps_invalid_parameters_to_400(
    monkeypatch: pytest.MonkeyPatch, path: str,
) -> None:
    service = _service(lambda request: _response(request, {}))
    monkeypatch.setattr(market, "AStockExtraService", lambda: service)

    response = await _get(market.router, path)

    assert response.status_code == 400
    await service.http.aclose()  # type: ignore[union-attr]


@pytest.mark.asyncio
@pytest.mark.parametrize("kind", ["http", "json", "schema"])
async def test_limit_pool_endpoint_maps_upstream_failures_to_502(
    monkeypatch: pytest.MonkeyPatch, kind: str,
) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if kind == "http":
            return _response(request, {}, 503)
        if kind == "json":
            return httpx.Response(200, text="{bad", request=request)
        return _response(request, {"data": []})

    service = _service(handler)
    monkeypatch.setattr(market, "AStockExtraService", lambda: service)

    response = await _get(market.router, "/api/market/limit-pool?date=2026-08-31")

    assert response.status_code == 502
    await service.http.aclose()  # type: ignore[union-attr]


@pytest.mark.asyncio
async def test_limit_pool_empty_data_is_unknown_with_http_200(monkeypatch: pytest.MonkeyPatch) -> None:
    service = _service(lambda request: _response(request, {"data": None}))
    monkeypatch.setattr(market, "AStockExtraService", lambda: service)

    response = await _get(market.router, "/api/market/limit-pool?date=2026-08-31&pool=limit_down")

    assert response.status_code == 200
    assert response.json() == {
        "date": "20260831",
        "pool": "limit_down",
        "items": [],
        "source": "eastmoney.push2ex",
        "quality": "UNKNOWN",
        "error": "东财未返回池数据（可能为非交易日或盘后尚未更新）",
    }
    await service.http.aclose()  # type: ignore[union-attr]
