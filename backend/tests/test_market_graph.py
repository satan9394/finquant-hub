from __future__ import annotations

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import pytest

from app.services.market_graph import MarketGraphService


class FakeAStockExtra:
    def __init__(self):
        self.limit_pools = {}
        self.datacenter_rows = {}

    async def _eastmoney_json(self, capability, url, *, params, headers=None):
        if params["fs"] == "m:90 t:2 f:!50":
            return {"data": {"total": 2, "diff": [
                {"f12": "BK1", "f14": "行业一", "f3": 2.5, "f6": 1000},
                {"f12": "BK2", "f14": "行业二", "f3": -1.0, "f6": 600},
            ]}}
        if params["fs"] == "b:BK1":
            return {"data": {"diff": [{"f12": "600001", "f14": "成分甲", "f3": 3.0, "f6": 400}]}}
        if params["fs"] == "b:BK2":
            return {"data": {"diff": [{"f12": "600002", "f14": "成分乙", "f3": 1.0, "f6": 800}]}}
        raise AssertionError(f"unexpected Eastmoney filter: {params['fs']}")

    async def _datacenter(self, capability, **params):
        report = params["report_name"]
        if report == "RPT_DAILYBILLBOARD_DETAILSNEW":
            return self.datacenter_rows.get("records", [])
        if report == "RPT_BILLBOARD_DAILYDETAILSBUY":
            trade_date = params["filter"].split("'")[1]
            return self.datacenter_rows.get(trade_date, [])
        raise AssertionError(f"unexpected report: {report}")

    async def limit_pool(self, trade_date, pool):
        return self.limit_pools.get(trade_date, {
            "date": trade_date.replace("-", ""), "pool": pool, "items": [], "quality": "UNKNOWN",
        })


@pytest.mark.asyncio
async def test_sector_treemap_reconciles_constituents_to_direct_board_total():
    service = MarketGraphService(FakeAStockExtra())

    result = await service.sector_treemap()

    assert result["classification"] == "eastmoney_industry_board"
    assert result["quality"] == "DIRECT"
    assert result["items"][0]["value"] == 1000
    assert sum(child["value"] for child in result["items"][0]["children"]) == 1000
    assert result["items"][0]["children"][-1]["kind"] == "aggregate_remainder"
    assert result["items"][1]["children"] == []
    assert result["items"][1]["coverage"] == "INCONSISTENT_CONSTITUENT_TOTALS"


@pytest.mark.asyncio
async def test_dragon_tiger_network_is_capped_and_edges_are_observed_common_buys():
    stocks = FakeAStockExtra()
    today = datetime.now(ZoneInfo("Asia/Shanghai")).date()
    trade_day = today.isoformat()
    stocks.datacenter_rows["records"] = [{"TRADE_DATE": trade_day}]
    stocks.datacenter_rows[trade_day] = [
        {"TRADE_DATE": trade_day, "SECURITY_CODE": "600519", "OPERATEDEPT_NAME": "席位甲", "BUY": 20000},
        {"TRADE_DATE": trade_day, "SECURITY_CODE": "600519", "OPERATEDEPT_NAME": "机构专用", "BUY": 10000},
        *[
            {"TRADE_DATE": trade_day, "SECURITY_CODE": "600519", "OPERATEDEPT_NAME": f"席位{i:02}", "BUY": 1000 - i}
            for i in range(51)
        ],
    ]

    result = await MarketGraphService(stocks).dragon_tiger_network(days=5)

    assert len(result["nodes"]) == 50
    assert all("席位50" != node["name"] for node in result["nodes"])
    edge = next(edge for edge in result["edges"] if {edge["source"], edge["target"]} == {"席位甲", "机构专用"})
    assert edge["shared_buy_amount_cny_10k"] == 1.0
    assert edge["common_security_days"] == 1
    assert "不代表协同或因果" in result["note"]


@pytest.mark.asyncio
async def test_sentiment_ladder_uses_weighted_promotion_and_keeps_break_rate_unknown():
    stocks = FakeAStockExtra()
    today = datetime.now(ZoneInfo("Asia/Shanghai")).date()
    previous = today - timedelta(days=1)

    def pool(day, counts):
        return {
            "date": day.strftime("%Y%m%d"), "pool": "limit_up", "quality": "DIRECT",
            "items": [
                {"code": str(index), "limit_up_count": height, "limit_stat": f"{height}天{height}板"}
                for height, quantity in counts.items()
                for index in range(quantity)
            ],
        }

    stocks.limit_pools[today.isoformat()] = pool(today, {1: 1, 2: 1, 3: 1})
    stocks.limit_pools[previous.isoformat()] = pool(previous, {1: 2, 2: 1})

    result = await MarketGraphService(stocks).sentiment_ladder(today)

    assert result["highest_board"] == 3
    assert result["promotion_rate"] == pytest.approx(0.6667)
    assert result["sentiment_index"] == 63.3
    assert result["break_rate"] is None
    assert result["break_rate_quality"] == "UNKNOWN"
    assert result["items"][0]["promoted_count"] == 1
