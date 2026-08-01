from datetime import date
from unittest.mock import AsyncMock

import httpx
import pytest

from app.services.market_data import MarketDataService, MarketError
from app.services.market_overview import MarketOverviewService


def _transport(request: httpx.Request) -> httpx.Response:
    url = str(request.url)
    if request.method == "POST" and "stockrank/getAllCurrentList" in url:
        return httpx.Response(200, json={"data": [{"sc": "SH600519", "rk": 1}]})
    if "ulist.np/get" in url:
        return httpx.Response(200, json={
            "data": {"diff": [{"f13": 1, "f12": "600519", "f14": "贵州茅台", "f2": 1300, "f3": 1.2}]},
        })
    if "getTopicZTPool" in url:
        return httpx.Response(200, json={
            "data": {
                "tc": 1,
                "pool": [{
                    "c": "000593", "m": 0, "n": "德龙汇能", "p": 16920,
                    "zdp": 10.01, "amount": 100, "ltsz": 200, "tshare": 300,
                    "hs": 1.8, "lbc": 2, "fbt": 92500, "lbt": 145500,
                    "fund": 80, "zbc": 0, "hybk": "燃气", "zttj": {"days": 2, "ct": 2},
                }],
            },
        })
    if "clist/get" in url:
        fs = request.url.params.get("fs", "")
        if "m:90" in fs:
            return httpx.Response(200, json={
                "data": {"diff": [{
                    "f12": "BK1169", "f14": "Kimi概念", "f2": 1065.17,
                    "f3": 11.22, "f4": 107.47, "f8": 7.42, "f20": 419000,
                    "f104": 16, "f105": 0, "f128": "易点天下", "f136": 19.99,
                }]},
            })
        return httpx.Response(200, json={
            "data": {"total": 4, "diff": [{"f3": 1.0}, {"f3": -2.0}, {"f3": 0}, {"f3": "-"}]},
        })
    return httpx.Response(404, request=request)


@pytest.fixture
def service():
    client = httpx.AsyncClient(transport=httpx.MockTransport(_transport))
    return MarketDataService(http=client, yahoo_http=client)


@pytest.mark.asyncio
async def test_cn_breadth_and_sector_rank_preserve_provenance(service):
    overview = MarketOverviewService(service)
    breadth = await overview.breadth("cn")
    sectors = await overview.sectors("concept", 10)

    assert breadth == {
        "status": "ok", "market": "cn", "total": 3,
        "provider_total": 4,
        "advancers": 1, "decliners": 1, "unchanged": 1, "unknown": 1,
        "source": "eastmoney",
    }
    assert sectors["source"] == "eastmoney"
    assert sectors["items"][0]["code"] == "BK1169"
    assert sectors["items"][0]["leader"] == "易点天下"
    await service.aclose()


@pytest.mark.asyncio
async def test_cn_breadth_paginates_provider_total():
    seen_pages = []

    def paged(request: httpx.Request) -> httpx.Response:
        page = int(request.url.params["pn"])
        seen_pages.append(page)
        size = 1 if page == 3 else 100
        return httpx.Response(200, json={
            "data": {"total": 201, "diff": [{"f3": 1}] * size},
        })

    client = httpx.AsyncClient(transport=httpx.MockTransport(paged))
    market = MarketDataService(http=client, yahoo_http=client)
    result = await MarketOverviewService(market).breadth("cn")

    assert result["provider_total"] == 201
    assert result["total"] == 201
    assert result["advancers"] == 201
    assert sorted(seen_pages) == [1, 2, 3]
    await market.aclose()


@pytest.mark.asyncio
async def test_popular_and_limit_up_mapping(service):
    overview = MarketOverviewService(service)
    popular = await overview.popular(5)
    pool = await overview.limit_up(date(2026, 7, 31))

    assert popular["items"][0] == {
        "rank": 1, "code": "sh600519", "name": "贵州茅台",
        "price": 1300.0, "change_percent": 1.2,
    }
    assert pool["date"] == "2026-07-31"
    assert pool["items"][0]["price"] == 16.92
    assert pool["items"][0]["statistics"] == {"days": 2, "count": 2}
    await service.aclose()


@pytest.mark.asyncio
async def test_multi_market_overview_marks_unsupported_breadth(service, monkeypatch):
    monkeypatch.setattr(service, "index_quote", AsyncMock(return_value={
        "code": "SPX", "name": "标普500", "market": "us",
        "price": 6000, "change_percent": 1, "source": "yahoo",
    }))
    result = await MarketOverviewService(service).overview("us")

    assert result["status"] == "ok"
    assert len(result["indices"]) == 4
    assert result["breadth"]["status"] == "unsupported"
    await service.aclose()


@pytest.mark.asyncio
async def test_eastmoney_failure_records_health_and_normalizes_error():
    def fail(request: httpx.Request) -> httpx.Response:
        return httpx.Response(503, request=request)

    client = httpx.AsyncClient(transport=httpx.MockTransport(fail))
    service = MarketDataService(http=client, yahoo_http=client)
    with pytest.raises(MarketError, match="东方财富数据源不可用"):
        await MarketOverviewService(service).sectors("industry")
    assert service.source_status()["providers"]["eastmoney"]["failures"] == 1
    await service.aclose()


@pytest.mark.asyncio
async def test_market_overview_validates_enums(service):
    overview = MarketOverviewService(service)
    with pytest.raises(ValueError, match="market"):
        await overview.indices("jp")
    with pytest.raises(ValueError, match="kind"):
        await overview.sectors("theme")
    await service.aclose()
