"""Evidence-bounded market-level snapshots from reused provider clients."""

import asyncio
import math
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any, cast

import httpx

from .market_data import MarketDataService, MarketError

EASTMONEY_CLIST_URLS = (
    "https://82.push2.eastmoney.com/api/qt/clist/get",
    "https://79.push2.eastmoney.com/api/qt/clist/get",
    "https://17.push2.eastmoney.com/api/qt/clist/get",
    "https://push2.eastmoney.com/api/qt/clist/get",
)
EASTMONEY_LIMIT_UP = "https://push2ex.eastmoney.com/getTopicZTPool"
EASTMONEY_HOT_RANK = "https://emappdata.eastmoney.com/stockrank/getAllCurrentList"
EASTMONEY_QUOTE_LIST = "https://push2.eastmoney.com/api/qt/ulist.np/get"
EASTMONEY_UT = "bd1d9ddb04089700cf9c27f6f7426281"

INDEXES = {
    "cn": (
        ("sh000001", "000001.SH", "上证指数"),
        ("sz399001", "399001.SZ", "深证成指"),
        ("sz399006", "399006.SZ", "创业板指"),
        ("sh000688", "000688.SH", "科创50"),
        ("sh000300", "000300.SH", "沪深300"),
    ),
    "hk": (
        ("^HSI", "HSI", "恒生指数"),
        ("^HSCE", "HSCEI", "恒生中国企业指数"),
        ("^HSTECH", "HSTECH", "恒生科技指数"),
    ),
    "us": (
        ("^GSPC", "SPX", "标普500"),
        ("^IXIC", "IXIC", "纳斯达克综合"),
        ("^DJI", "DJI", "道琼斯工业"),
        ("^RUT", "RUT", "罗素2000"),
    ),
}
JSONDict = dict[str, Any]


def _number(value: object, *, scale: float = 1.0) -> float | None:
    if value in (None, "", "-"):
        return None
    try:
        return round(float(cast(Any, value)) / scale, 4)
    except (TypeError, ValueError):
        return None


def _integer(value: object) -> int | None:
    number = _number(value)
    return int(number) if number is not None else None


@dataclass
class MarketOverviewService:
    market: MarketDataService

    async def _get_json(self, urls: tuple[str, ...], *, params: JSONDict) -> JSONDict:
        breaker = self.market._breaker("eastmoney")
        if not breaker.allow_request():
            raise MarketError("东方财富数据源熔断中")
        last_error: Exception | None = None
        for url in urls:
            try:
                response = await self.market.http.get(url, params=params)
                response.raise_for_status()
                payload = response.json()
                if not isinstance(payload, dict):
                    raise ValueError("响应不是对象")
                breaker.record_success()
                return payload
            except (httpx.HTTPError, ValueError) as exc:
                last_error = exc
        breaker.record_failure(last_error or "空响应")
        raise MarketError("东方财富数据源不可用") from last_error

    async def _post_json(self, url: str, *, body: JSONDict) -> JSONDict:
        breaker = self.market._breaker("eastmoney")
        if not breaker.allow_request():
            raise MarketError("东方财富数据源熔断中")
        try:
            response = await self.market.http.post(url, json=body)
            response.raise_for_status()
            payload = response.json()
            if not isinstance(payload, dict):
                raise ValueError("响应不是对象")
            breaker.record_success()
            return payload
        except (httpx.HTTPError, ValueError) as exc:
            breaker.record_failure(exc)
            raise MarketError("东方财富数据源不可用") from exc

    async def indices(self, market: str) -> list[JSONDict]:
        if market not in INDEXES:
            raise ValueError("market 必须是 cn、hk 或 us")

        async def fetch(spec: tuple[str, str, str]) -> JSONDict:
            provider_symbol, code, name = spec
            try:
                item = await self.market.index_quote(
                    provider_symbol,
                    code=code,
                    name=name,
                    market=market,
                )
                item.setdefault("status", "ok")
                return item
            except (MarketError, httpx.HTTPError, ValueError) as exc:
                return {
                    "code": code,
                    "name": name,
                    "market": market,
                    "price": None,
                    "change": None,
                    "change_percent": None,
                    "timestamp": None,
                    "source": None,
                    "status": "unavailable",
                    "error": str(exc),
                }

        return await asyncio.gather(*(fetch(spec) for spec in INDEXES[market]))

    async def breadth(self, market: str) -> JSONDict:
        if market != "cn":
            return {
                "status": "unsupported",
                "market": market,
                "reason": "当前数据源未提供可验证的港股/美股全市场成分集合",
                "source": None,
            }
        params: JSONDict = {
            "pn": 1,
            "pz": 100,
            "po": 1,
            "np": 1,
            "ut": EASTMONEY_UT,
            "fltt": 2,
            "invt": 2,
            "fid": "f3",
            "fs": "m:0 t:6,m:0 t:80,m:1 t:2,m:1 t:23,m:0 t:81 s:2048",
            "fields": "f3",
        }
        first_payload = await self._get_json(EASTMONEY_CLIST_URLS, params=params)
        first_data = first_payload.get("data") or {}
        rows = list(first_data.get("diff") or [])
        provider_total = _integer(first_data.get("total")) or len(rows)
        page_count = math.ceil(provider_total / params["pz"])
        if page_count > 1:
            # ponytail: four reused connections keep a full-market scan fast
            # without bursting the public endpoint hard enough to trigger resets.
            semaphore = asyncio.Semaphore(4)

            async def page(page_number: int) -> list[JSONDict]:
                async with semaphore:
                    payload = await self._get_json(
                        EASTMONEY_CLIST_URLS,
                        params={**params, "pn": page_number},
                    )
                    return list(((payload.get("data") or {}).get("diff") or []))

            pages = await asyncio.gather(*(page(number) for number in range(2, page_count + 1)))
            rows.extend(row for page_rows in pages for row in page_rows)
        changes = [_number(row.get("f3")) for row in rows]
        known = [value for value in changes if value is not None]
        return {
            "status": "ok" if known else "unavailable",
            "market": "cn",
            "total": len(known),
            "provider_total": provider_total,
            "advancers": sum(value > 0 for value in known),
            "decliners": sum(value < 0 for value in known),
            "unchanged": sum(value == 0 for value in known),
            "unknown": len(rows) - len(known),
            "source": "eastmoney",
        }

    async def overview(self, market: str) -> JSONDict:
        if market not in INDEXES:
            raise ValueError("market 必须是 cn、hk 或 us")
        indices, breadth = await asyncio.gather(self.indices(market), self.breadth(market))
        available_indices = sum(item.get("status") == "ok" for item in indices)
        return {
            "market": market,
            "as_of": datetime.now().astimezone().isoformat(timespec="seconds"),
            "indices": indices,
            "breadth": breadth,
            "status": "ok" if available_indices == len(indices) else "partial",
        }

    async def sectors(self, kind: str, limit: int = 20) -> JSONDict:
        market_type = {"industry": 2, "concept": 3}.get(kind)
        if market_type is None:
            raise ValueError("kind 必须是 industry 或 concept")
        payload = await self._get_json(
            EASTMONEY_CLIST_URLS,
            params={
                "pn": 1,
                "pz": limit,
                "po": 1,
                "np": 1,
                "ut": EASTMONEY_UT,
                "fltt": 2,
                "invt": 2,
                "fid": "f3",
                "fs": f"m:90 t:{market_type} f:!50",
                "fields": "f2,f3,f4,f8,f12,f14,f20,f104,f105,f128,f136",
            },
        )
        rows = ((payload.get("data") or {}).get("diff") or [])
        return {
            "kind": kind,
            "source": "eastmoney",
            "items": [
                {
                    "code": row.get("f12"),
                    "name": row.get("f14"),
                    "price": _number(row.get("f2")),
                    "change": _number(row.get("f4")),
                    "change_percent": _number(row.get("f3")),
                    "turnover_rate": _number(row.get("f8")),
                    "market_cap": _number(row.get("f20")),
                    "advancers": _integer(row.get("f104")),
                    "decliners": _integer(row.get("f105")),
                    "leader": row.get("f128") if row.get("f128") not in (None, "-") else None,
                    "leader_change_percent": _number(row.get("f136")),
                }
                for row in rows[:limit]
            ],
        }

    async def popular(self, limit: int = 20) -> JSONDict:
        ranking = await self._post_json(
            EASTMONEY_HOT_RANK,
            body={
                "appId": "appId01",
                "globalId": "786e4c21-70dc-435a-93bb-38",
                "marketType": "",
                "pageNo": 1,
                "pageSize": limit,
            },
        )
        ranked = (ranking.get("data") or [])[:limit]
        rank_by_code = {str(row.get("sc")): _integer(row.get("rk")) for row in ranked if row.get("sc")}
        secids = []
        for code in rank_by_code:
            if code.startswith("SH"):
                secids.append(f"1.{code[2:]}")
            elif code.startswith("SZ"):
                secids.append(f"0.{code[2:]}")
        if not secids:
            return {"source": "eastmoney", "items": []}
        quotes = await self._get_json(
            (EASTMONEY_QUOTE_LIST,),
            params={
                "ut": "f057cbcbce2a86e2866ab8877db1d059",
                "fltt": 2,
                "invt": 2,
                "fields": "f14,f3,f12,f2,f13",
                "secids": ",".join(secids),
            },
        )
        rows = ((quotes.get("data") or {}).get("diff") or [])
        items: list[JSONDict] = []
        for row in rows:
            prefix = "SH" if _integer(row.get("f13")) == 1 else "SZ"
            rank_code = f"{prefix}{row.get('f12')}"
            items.append({
                "rank": rank_by_code.get(rank_code),
                "code": f"{prefix.lower()}{row.get('f12')}",
                "name": row.get("f14"),
                "price": _number(row.get("f2")),
                "change_percent": _number(row.get("f3")),
            })
        items.sort(key=lambda item: item["rank"] if item["rank"] is not None else 10_000)
        return {"source": "eastmoney", "items": items}

    async def limit_up(self, trading_date: date) -> JSONDict:
        payload = await self._get_json(
            (EASTMONEY_LIMIT_UP,),
            params={
                "ut": "7eea3edcaed734bea9cbfc24409ed989",
                "dpt": "wz.ztzt",
                "Pageindex": 0,
                "pagesize": 10000,
                "sort": "fbt:asc",
                "date": trading_date.strftime("%Y%m%d"),
            },
        )
        data = payload.get("data") or {}
        items: list[JSONDict] = []
        for row in data.get("pool") or []:
            market_prefix = "sh" if _integer(row.get("m")) == 1 else "sz"
            stats = row.get("zttj") or {}
            items.append({
                "code": f"{market_prefix}{row.get('c')}",
                "name": row.get("n"),
                "price": _number(row.get("p"), scale=1000),
                "change_percent": _number(row.get("zdp")),
                "amount": _number(row.get("amount")),
                "float_market_cap": _number(row.get("ltsz")),
                "market_cap": _number(row.get("tshare")),
                "turnover_rate": _number(row.get("hs")),
                "streak": _integer(row.get("lbc")),
                "first_seal_time": row.get("fbt"),
                "last_seal_time": row.get("lbt"),
                "seal_funds": _number(row.get("fund")),
                "open_count": _integer(row.get("zbc")),
                "industry": row.get("hybk"),
                "statistics": {
                    "days": _integer(stats.get("days")),
                    "count": _integer(stats.get("ct")),
                },
            })
        return {
            "date": trading_date.isoformat(),
            "source": "eastmoney",
            "total": _integer(data.get("tc")) if data.get("tc") is not None else len(items),
            "items": items,
        }
