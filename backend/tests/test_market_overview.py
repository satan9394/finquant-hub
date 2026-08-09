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
        if "f12" in request.url.params.get("fields", ""):
            is_gainers = request.url.params.get("po") == "1"
            row = {
                "f12": "688256" if is_gainers else "300750",
                "f13": 1 if is_gainers else 0,
                "f14": "寒武纪" if is_gainers else "宁德时代",
                "f2": 588.88 if is_gainers else 188.2,
                "f3": 12.36 if is_gainers else -6.28,
                "f4": 64.77 if is_gainers else -12.6,
                "f6": 8_800_000_000 if is_gainers else 5_600_000_000,
                "f7": 13.1 if is_gainers else 7.8,
                "f8": 8.7 if is_gainers else 2.4,
                "f10": 1.9 if is_gainers else 1.2,
                "f100": "半导体" if is_gainers else "电池",
                "f109": 18.8 if is_gainers else -9.3,
            }
            return httpx.Response(200, json={"data": {"diff": [row]}})
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
async def test_daily_movers_map_both_sides_with_discovery_evidence(service):
    result = await MarketOverviewService(service).movers(8)

    assert result["source"] == "eastmoney"
    assert result["status"] == "ok"
    assert result["stale"] is False
    assert result["gainers"][0] == {
        "code": "sh688256",
        "name": "寒武纪",
        "price": 588.88,
        "change": 64.77,
        "change_percent": 12.36,
        "weekly_change_percent": 18.8,
        "turnover_rate": 8.7,
        "amount": 8_800_000_000.0,
        "amplitude": 13.1,
        "volume_ratio": 1.9,
        "industry": "半导体",
        "reason_tags": ["日内强势", "周线强势", "高换手", "放量"],
    }
    assert result["decliners"][0]["code"] == "sz300750"
    assert result["decliners"][0]["change_percent"] == -6.28
    assert await MarketOverviewService(service).movers(8) is result
    await service.aclose()


@pytest.mark.asyncio
async def test_daily_movers_fall_back_to_real_tech_pool_quotes(service, monkeypatch):
    overview = MarketOverviewService(service)
    monkeypatch.setattr(overview, "_get_json", AsyncMock(side_effect=MarketError("东方财富不可用")))
    monkeypatch.setattr(service, "_quotes_tencent", AsyncMock(return_value=[{
        "code": "sh688256", "name": "寒武纪", "price": 588.88,
        "change": 20.0, "change_percent": 3.5, "turnover_rate": 6.2,
        "amount": 2_000_000_000, "amplitude": 7.1,
    }, {
        "code": "sz002230", "name": "科大讯飞", "price": 48.0,
        "change": -2.0, "change_percent": -4.0, "turnover_rate": 2.1,
        "amount": 800_000_000, "amplitude": 5.0,
    }]))

    result = await overview.movers(8)

    assert result["source"] == "tencent"
    assert result["scope"] == "tech_watch_pool"
    assert result["status"] == "partial"
    assert result["gainers"][0]["reason_tags"] == ["技术股池", "高换手", "成交活跃"]
    assert result["decliners"][0]["code"] == "sz002230"
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
    with pytest.raises(ValueError, match="kind"):
        await overview.capital_flow("concept")
    await service.aclose()


@pytest.mark.asyncio
async def test_capital_flow_maps_all_order_buckets():
    def transport(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"data": {"diff": [{
            "f12": "BK1036", "f14": "半导体", "f2": 1234.5, "f3": 2.5,
            "f62": 1_200_000_000, "f184": 6.8,
            "f66": 700_000_000, "f69": 4.1,
            "f72": 500_000_000, "f75": 2.7,
            "f78": -300_000_000, "f81": -1.7,
            "f84": -900_000_000, "f87": -5.1,
        }]}})

    client = httpx.AsyncClient(transport=httpx.MockTransport(transport))
    market = MarketDataService(http=client, yahoo_http=client)
    result = await MarketOverviewService(market).capital_flow("sector", 20)

    assert result["source"] == "eastmoney"
    assert result["items"][0] == {
        "code": "BK1036", "name": "半导体", "price": 1234.5,
        "change_percent": 2.5, "main_net_inflow": 1_200_000_000.0,
        "main_net_inflow_rate": 6.8, "super_large_net_inflow": 700_000_000.0,
        "super_large_net_inflow_rate": 4.1, "large_net_inflow": 500_000_000.0,
        "large_net_inflow_rate": 2.7, "medium_net_inflow": -300_000_000.0,
        "medium_net_inflow_rate": -1.7, "small_net_inflow": -900_000_000.0,
        "small_net_inflow_rate": -5.1,
    }
    await market.aclose()


@pytest.mark.asyncio
async def test_weekly_movers_enrich_tonghuashun_with_coverage():
    def transport(request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        if "10jqka.com.cn" in url:
            if "688256" in url:
                return httpx.Response(200, json={
                    "title": {"je": "880000000"},
                    "field": {"hyname": "半导体"},
                })
            return httpx.Response(503, request=request)
        is_gainer = request.url.params.get("po") == "1"
        return httpx.Response(200, json={"data": {"diff": [{
            "f12": "688256" if is_gainer else "300750",
            "f13": 1 if is_gainer else 0,
            "f14": "寒武纪" if is_gainer else "宁德时代",
            "f2": 588.8 if is_gainer else 188.2,
            "f3": 4.2 if is_gainer else -3.1,
            "f6": 8_800_000_000, "f7": 7.2, "f8": 8.5, "f10": 1.9,
            "f100": "半导体" if is_gainer else "电池",
            "f109": 18.6 if is_gainer else -12.4,
        }]}})

    client = httpx.AsyncClient(transport=httpx.MockTransport(transport))
    market = MarketDataService(http=client, yahoo_http=client)
    result = await MarketOverviewService(market).weekly_movers(10, 8, 2)

    assert [item["code"] for item in result["items"]] == ["sh688256", "sz300750"]
    assert result["items"][0]["ths_main_net_inflow"] == 880_000_000.0
    assert result["items"][0]["ths_main_net_inflow_unit"] == "wan_cny"
    assert result["items"][0]["source_status"] == {
        "eastmoney": True, "tonghuashun": True,
    }
    assert "同花顺主力净流入" in result["items"][0]["reason_tags"]
    assert result["coverage"] == {
        "eastmoney_candidates": 2, "tonghuashun_requested": 2,
        "tonghuashun_succeeded": 1, "tonghuashun_failed": 1,
        "tonghuashun_rate": 0.5,
    }
    assert result["status"] == "partial"
    await market.aclose()


@pytest.mark.asyncio
async def test_weekly_movers_can_skip_tonghuashun_batch():
    def transport(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"data": {"diff": [{
            "f12": "688256", "f13": 1, "f14": "寒武纪", "f2": 588.8,
            "f3": 4.2, "f6": 8_800_000_000, "f7": 7.2, "f8": 8.5,
            "f10": 1.9, "f100": "半导体", "f109": 18.6,
        }]}})

    client = httpx.AsyncClient(transport=httpx.MockTransport(transport))
    market = MarketDataService(http=client, yahoo_http=client)
    result = await MarketOverviewService(market).weekly_movers(10, 8, 0)

    assert result["status"] == "ok"
    assert result["coverage"]["tonghuashun_requested"] == 0
    assert result["coverage"]["tonghuashun_rate"] == 0.0
    assert result["items"][0]["source_status"]["tonghuashun"] is False
    await market.aclose()


@pytest.mark.asyncio
async def test_market_pulse_keeps_section_level_failures(service, monkeypatch):
    overview = MarketOverviewService(service)
    monkeypatch.setattr(overview, "breadth", AsyncMock(return_value={"status": "ok"}))
    monkeypatch.setattr(overview, "movers", AsyncMock(side_effect=MarketError("涨跌榜不可用")))
    monkeypatch.setattr(overview, "sectors", AsyncMock(return_value={"items": []}))
    monkeypatch.setattr(overview, "capital_flow", AsyncMock(return_value={"items": []}))
    monkeypatch.setattr(overview, "weekly_movers", AsyncMock(return_value={"items": []}))
    monkeypatch.setattr(overview, "popular", AsyncMock(return_value={"items": []}))

    result = await overview.pulse(20, 8, 10)

    assert result["status"] == "partial"
    assert result["sections"]["breadth"]["status"] == "ok"
    assert result["sections"]["movers"] == {
        "status": "unavailable", "error": "涨跌榜不可用",
    }
    assert result["sources"] == ["eastmoney", "tonghuashun"]
    await service.aclose()


@pytest.mark.asyncio
async def test_keyword_themes_scan_all_board_pages_and_enrich_candidates():
    seen_catalog_pages: list[tuple[str, int]] = []

    def transport(request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        if "10jqka.com.cn" in url:
            return httpx.Response(200, json={
                "title": {"je": 21690.71}, "field": {"hyname": "半导体"},
            })
        board_filter = request.url.params.get("fs", "")
        if board_filter.startswith("b:"):
            return httpx.Response(200, json={"data": {"diff": [{
                "f12": "688256", "f13": 1, "f14": "寒武纪", "f2": 588.8,
                "f3": 4.2, "f6": 8_800_000_000, "f7": 7.2, "f8": 8.5,
                "f10": 1.9, "f62": 1_200_000_000, "f100": "半导体",
                "f109": 18.6, "f184": 6.8,
            }]}})
        kind = "industry" if "t:2" in board_filter else "concept"
        page = int(request.url.params["pn"])
        seen_catalog_pages.append((kind, page))
        row = {
            "f12": "BK0001", "f14": "其他行业", "f2": 100, "f3": 1,
            "f8": 2, "f104": 3, "f105": 2,
        }
        if kind == "concept" and page == 2:
            row = {
                "f12": "BK1134", "f14": "算力概念", "f2": 120, "f3": 3.2,
                "f8": 4, "f104": 30, "f105": 4, "f128": "寒武纪", "f136": 4.2,
            }
        return httpx.Response(200, json={"data": {"total": 101, "diff": [row]}})

    client = httpx.AsyncClient(transport=httpx.MockTransport(transport))
    market = MarketDataService(http=client, yahoo_http=client)
    overview = MarketOverviewService(market)
    result = await overview.themes("算力", 4, 5, 1, "capital")

    assert sorted(seen_catalog_pages) == [
        ("concept", 1), ("concept", 2), ("industry", 1), ("industry", 2),
    ]
    assert result["category"] == "数字基础设施"
    assert result["expanded_terms"][0] == "算力"
    assert result["themes"][0]["name"] == "算力概念"
    assert result["candidates"][0]["code"] == "sh688256"
    assert result["candidates"][0]["main_net_inflow"] == 1_200_000_000.0
    assert result["candidates"][0]["ths_main_net_inflow"] == 21690.71
    assert result["coverage"]["tonghuashun_succeeded"] == 1
    assert await overview.themes("算力", 4, 5, 1, "capital") is result
    await market.aclose()


@pytest.mark.asyncio
async def test_keyword_themes_return_explicit_empty_result(service, monkeypatch):
    overview = MarketOverviewService(service)
    monkeypatch.setattr(overview, "_all_sectors", AsyncMock(return_value=[{
        "kind": "industry", "code": "BK0001", "name": "银行",
        "change_percent": 1.0,
    }]))

    result = await overview.themes("不存在的主题", 4, 5, 0, "change")

    assert result["status"] == "empty"
    assert result["category"] == "自定义主题"
    assert result["matched_theme_count"] == 0
    assert result["themes"] == []
    assert result["candidates"] == []
    await service.aclose()
