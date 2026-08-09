"""Evidence-bounded market-level snapshots from reused provider clients."""

import asyncio
import math
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any, cast

import httpx

from .market_data import MarketDataService, MarketError

EASTMONEY_CLIST_URLS = (
    "https://push2delay.eastmoney.com/api/qt/clist/get",
    "https://82.push2.eastmoney.com/api/qt/clist/get",
    "https://79.push2.eastmoney.com/api/qt/clist/get",
    "https://17.push2.eastmoney.com/api/qt/clist/get",
    "https://push2.eastmoney.com/api/qt/clist/get",
)
EASTMONEY_LIMIT_UP = "https://push2ex.eastmoney.com/getTopicZTPool"
EASTMONEY_HOT_RANK = "https://emappdata.eastmoney.com/stockrank/getAllCurrentList"
EASTMONEY_QUOTE_LIST_URLS = (
    "https://push2delay.eastmoney.com/api/qt/ulist.np/get",
    "https://push2.eastmoney.com/api/qt/ulist.np/get",
)
TONGHUASHUN_FUNDS = "https://stockpage.10jqka.com.cn/spService/{code}/Funds/realFunds"
EASTMONEY_UT = "bd1d9ddb04089700cf9c27f6f7426281"
EASTMONEY_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126 Safari/537.36",
    "Referer": "https://quote.eastmoney.com/",
}
TONGHUASHUN_HEADERS = {
    "User-Agent": EASTMONEY_HEADERS["User-Agent"],
    "Accept": "application/json, text/plain, */*",
}
TECH_WATCH_POOL = (
    ("sh688256", "寒武纪", "半导体"), ("sh688041", "海光信息", "半导体"),
    ("sh688498", "源杰科技", "通信设备"), ("sz300308", "中际旭创", "通信设备"),
    ("sz300502", "新易盛", "通信设备"), ("sh601138", "工业富联", "消费电子"),
    ("sz002463", "沪电股份", "元件"), ("sz300476", "胜宏科技", "元件"),
    ("sz002916", "深南电路", "元件"), ("sz000977", "浪潮信息", "计算机设备"),
    ("sh603019", "中科曙光", "计算机设备"), ("sz000938", "紫光股份", "计算机设备"),
    ("sz002230", "科大讯飞", "软件开发"), ("sz300418", "昆仑万维", "互联网服务"),
    ("sz300229", "拓尔思", "软件开发"), ("sh688327", "云从科技", "软件开发"),
    ("sz301236", "软通动力", "软件开发"), ("sz002261", "拓维信息", "软件开发"),
    ("sz300033", "同花顺", "软件开发"), ("sz002747", "埃斯顿", "自动化设备"),
    ("sh688017", "绿的谐波", "自动化设备"), ("sz002050", "三花智控", "汽车零部件"),
    ("sh603986", "兆易创新", "半导体"), ("sh688525", "佰维存储", "半导体"),
    ("sz001287", "中电港", "半导体"),
)

THEME_TAXONOMY: dict[str, tuple[str, tuple[str, ...]]] = {
    "机器人": (
        "智能制造",
        ("机器人", "人形机器人", "工业机器人", "机器视觉", "减速器", "自动化设备"),
    ),
    "算力": (
        "数字基础设施",
        ("算力", "数据中心", "液冷", "服务器", "光模块", "云计算", "AI芯片"),
    ),
    "电力": (
        "能源电网",
        ("电力", "绿色电力", "智能电网", "电网", "电力设备", "储能"),
    ),
    "半导体": (
        "硬科技",
        ("半导体", "芯片", "集成电路", "存储", "光刻", "先进封装"),
    ),
}

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
                response = await self.market.http.get(url, params=params, headers=EASTMONEY_HEADERS)
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
            response = await self.market.http.post(url, json=body, headers=EASTMONEY_HEADERS)
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

    async def _all_sectors(self, kind: str) -> list[JSONDict]:
        """Read the full provider-reported board catalog, not only page one."""
        market_type = {"industry": 2, "concept": 3}.get(kind)
        if market_type is None:
            raise ValueError("kind 必须是 industry 或 concept")
        cache_key = f"market-sector-catalog:{kind}"
        cached = self.market.cached_snapshot(cache_key, 600.0)
        if cached is not None:
            return cast(list[JSONDict], cached["items"])
        params: JSONDict = {
            "pn": 1, "pz": 100, "po": 1, "np": 1,
            "ut": EASTMONEY_UT, "fltt": 2, "invt": 2, "fid": "f3",
            "fs": f"m:90 t:{market_type} f:!50",
            "fields": "f2,f3,f4,f8,f12,f14,f20,f104,f105,f128,f136",
        }
        first = await self._get_json(EASTMONEY_CLIST_URLS, params=params)
        data = first.get("data") or {}
        rows = list(data.get("diff") or [])
        provider_total = _integer(data.get("total")) or len(rows)
        page_count = math.ceil(provider_total / 100)
        if page_count > 1:
            semaphore = asyncio.Semaphore(3)

            async def page(number: int) -> list[JSONDict]:
                async with semaphore:
                    payload = await self._get_json(
                        EASTMONEY_CLIST_URLS, params={**params, "pn": number},
                    )
                    return list(((payload.get("data") or {}).get("diff") or []))

            pages = await asyncio.gather(*(page(number) for number in range(2, page_count + 1)))
            rows.extend(row for page_rows in pages for row in page_rows)
        items = [{
            "kind": kind,
            "code": row.get("f12"),
            "name": row.get("f14"),
            "price": _number(row.get("f2")),
            "change_percent": _number(row.get("f3")),
            "turnover_rate": _number(row.get("f8")),
            "market_cap": _number(row.get("f20")),
            "advancers": _integer(row.get("f104")),
            "decliners": _integer(row.get("f105")),
            "leader": row.get("f128") if row.get("f128") not in (None, "-") else None,
            "leader_change_percent": _number(row.get("f136")),
        } for row in rows if row.get("f12") and row.get("f14")]
        self.market.store_snapshot(cache_key, {"items": items, "provider_total": provider_total})
        return items

    @staticmethod
    def theme_catalog() -> list[JSONDict]:
        return [
            {"keyword": keyword, "category": category, "expanded_terms": list(terms)}
            for keyword, (category, terms) in THEME_TAXONOMY.items()
        ]

    async def themes(
        self,
        keyword: str,
        limit: int = 8,
        stocks_per_theme: int = 10,
        ths_limit: int = 10,
        sort_by: str = "change",
    ) -> JSONDict:
        """Resolve a keyword to boards, constituents, and bounded THS evidence."""
        requested = keyword.strip()
        if not requested:
            raise ValueError("keyword 不能为空")
        sort_field = {
            "change": "f3", "weekly": "f109", "capital": "f62", "turnover": "f8",
        }.get(sort_by)
        if sort_field is None:
            raise ValueError("sort_by 必须是 change、weekly、capital 或 turnover")
        category, configured_terms = THEME_TAXONOMY.get(
            requested, ("自定义主题", (requested,)),
        )
        terms = tuple(dict.fromkeys((requested, *configured_terms)))
        cache_key = f"market-themes:{requested}:{limit}:{stocks_per_theme}:{ths_limit}:{sort_by}"
        cached = self.market.cached_snapshot(cache_key, 120.0)
        if cached is not None:
            return cached
        industry, concept = await asyncio.gather(
            self._all_sectors("industry"), self._all_sectors("concept"),
        )

        def match(board: JSONDict) -> tuple[int, str] | None:
            name = str(board.get("name") or "")
            best: tuple[int, str] | None = None
            for term in terms:
                score = 100 if name == requested else 90 if name == term else 70 if term in name else 0
                if score and (best is None or score > best[0]):
                    best = (score, term)
            return best

        matches: list[JSONDict] = []
        for board in [*industry, *concept]:
            evidence = match(board)
            if evidence is not None:
                matches.append({**board, "match_score": evidence[0], "matched_term": evidence[1]})
        matches.sort(
            key=lambda item: (item["match_score"], abs(item.get("change_percent") or 0)),
            reverse=True,
        )
        selected = matches[:limit]

        async def constituents(board: JSONDict) -> JSONDict:
            payload = await self._get_json(
                EASTMONEY_CLIST_URLS,
                params={
                    "pn": 1, "pz": stocks_per_theme, "po": 1, "np": 1,
                    "ut": EASTMONEY_UT, "fltt": 2, "invt": 2,
                    "fid": sort_field, "fs": f"b:{board['code']}",
                    "fields": "f2,f3,f6,f7,f8,f10,f12,f13,f14,f62,f100,f109,f184",
                },
            )
            rows = list(((payload.get("data") or {}).get("diff") or []))[:stocks_per_theme]
            stocks: list[JSONDict] = []
            for row in rows:
                raw_code = str(row.get("f12") or "")
                if not raw_code:
                    continue
                code = f"{'sh' if _integer(row.get('f13')) == 1 else 'sz'}{raw_code}"
                daily = _number(row.get("f3"))
                weekly = _number(row.get("f109"))
                turnover = _number(row.get("f8"))
                flow = _number(row.get("f62"))
                tags: list[str] = []
                if daily is not None and abs(daily) >= 5:
                    tags.append("日内异动")
                if weekly is not None and abs(weekly) >= 8:
                    tags.append("周异动")
                if turnover is not None and turnover >= 8:
                    tags.append("高换手")
                if flow is not None and flow > 0:
                    tags.append("东方财富主力净流入")
                stocks.append({
                    "code": code, "name": row.get("f14"), "price": _number(row.get("f2")),
                    "change_percent": daily, "weekly_change_percent": weekly,
                    "turnover_rate": turnover, "amount": _number(row.get("f6")),
                    "amplitude": _number(row.get("f7")), "volume_ratio": _number(row.get("f10")),
                    "industry": row.get("f100") if row.get("f100") not in (None, "-") else None,
                    "main_net_inflow": flow, "main_net_inflow_rate": _number(row.get("f184")),
                    "ths_main_net_inflow": None, "ths_main_net_inflow_unit": "wan_cny",
                    "ths_industry": None,
                    "source_status": {"eastmoney": True, "tonghuashun": False},
                    "reason_tags": tags,
                    "eastmoney_url": f"https://quote.eastmoney.com/{code}.html",
                    "tonghuashun_url": f"https://stockpage.10jqka.com.cn/{raw_code}/",
                })
            return {**board, "stocks": stocks}

        semaphore = asyncio.Semaphore(3)

        async def bounded(board: JSONDict) -> JSONDict:
            async with semaphore:
                return await constituents(board)

        themes = await asyncio.gather(*(bounded(board) for board in selected))
        sort_key = {
            "change": "change_percent", "weekly": "weekly_change_percent",
            "capital": "main_net_inflow", "turnover": "turnover_rate",
        }[sort_by]
        candidates_by_code: dict[str, JSONDict] = {}
        for theme in themes:
            for stock in theme["stocks"]:
                code = str(stock["code"])
                if code not in candidates_by_code:
                    candidates_by_code[code] = {**stock, "theme_names": [theme["name"]]}
                elif theme["name"] not in candidates_by_code[code]["theme_names"]:
                    candidates_by_code[code]["theme_names"].append(theme["name"])
        candidates = sorted(
            candidates_by_code.values(), key=lambda item: item.get(sort_key) or 0, reverse=True,
        )
        lookup = candidates[:ths_limit]
        breaker = self.market._breaker("tonghuashun")
        if lookup and breaker.allow_request():
            ths_semaphore = asyncio.Semaphore(4)

            async def enrich(item: JSONDict) -> JSONDict | None:
                async with ths_semaphore:
                    return await self._tonghuashun_funds(str(item["code"]))

            funds = await asyncio.gather(*(enrich(item) for item in lookup))
        else:
            funds = [None] * len(lookup)
        succeeded = 0
        for item, ths_funds in zip(lookup, funds, strict=True):
            if ths_funds is None:
                continue
            succeeded += 1
            item["ths_main_net_inflow"] = ths_funds["main_net_inflow"]
            item["ths_industry"] = ths_funds["industry"]
            item["source_status"] = {"eastmoney": True, "tonghuashun": True}
            if ths_funds["main_net_inflow"] > 0:
                item["reason_tags"].append("同花顺主力净流入")
            elif ths_funds["main_net_inflow"] < 0:
                item["reason_tags"].append("同花顺主力净流出")
        if succeeded:
            breaker.record_success()
        elif lookup:
            breaker.record_failure("同花顺主题资金批量接口无可用响应")
        enriched_by_code = {item["code"]: item for item in lookup}
        for theme in themes:
            theme["stocks"] = [
                {**stock, **{
                    key: enriched_by_code[stock["code"]][key]
                    for key in (
                        "ths_main_net_inflow", "ths_industry", "source_status", "reason_tags",
                    )
                }} if stock["code"] in enriched_by_code else stock
                for stock in theme["stocks"]
            ]
        ths_requested = len(lookup)
        result = {
            "keyword": requested,
            "category": category,
            "expanded_terms": list(terms),
            "sort_by": sort_by,
            "source": ["eastmoney", "tonghuashun"],
            "scope": "public_board_catalog_and_constituents",
            "as_of": datetime.now().astimezone().isoformat(timespec="seconds"),
            "status": "empty" if not themes else "ok" if succeeded == ths_requested else "partial",
            "catalog": self.theme_catalog(),
            "matched_theme_count": len(matches),
            "returned_theme_count": len(themes),
            "coverage": {
                "industry_boards_scanned": len(industry),
                "concept_boards_scanned": len(concept),
                "tonghuashun_requested": ths_requested,
                "tonghuashun_succeeded": succeeded,
                "tonghuashun_failed": ths_requested - succeeded,
                "tonghuashun_rate": round(succeeded / ths_requested, 4) if ths_requested else 0.0,
            },
            "themes": themes,
            "candidates": candidates,
        }
        self.market.store_snapshot(cache_key, result)
        return result

    async def movers(self, limit: int = 12) -> JSONDict:
        """Return both tails of today's A-share move distribution.

        The response keeps the provider fields that explain why an unfamiliar
        ticker is worth opening, instead of reducing discovery to a code list.
        """
        cache_key = f"market-movers:{limit}"
        cached = self.market.cached_snapshot(cache_key, 60.0)
        if cached is not None:
            return cached

        params: JSONDict = {
            "pn": 1,
            "pz": limit,
            "np": 1,
            "ut": EASTMONEY_UT,
            "fltt": 2,
            "invt": 2,
            "fid": "f3",
            "fs": "m:0 t:6,m:0 t:80,m:1 t:2,m:1 t:23,m:0 t:81 s:2048",
            "fields": "f2,f3,f4,f6,f7,f8,f10,f12,f13,f14,f100,f109",
        }

        async def fetch(order: int) -> list[JSONDict]:
            payload = await self._get_json(
                EASTMONEY_CLIST_URLS,
                params={**params, "po": order},
            )
            return list(((payload.get("data") or {}).get("diff") or []))[:limit]

        try:
            # ponytail: sequential tails are two cheap requests and avoid
            # EastMoney's burst-sensitive connection resets.
            gain_rows = await fetch(1)
            decline_rows = await fetch(0)
        except MarketError as exc:
            stale = self.market.cached_snapshot(cache_key, 1800.0)
            if stale is not None and stale.get("source") == "eastmoney":
                return {**stale, "status": "stale", "stale": True, "error": str(exc)}
            try:
                result = await self._tech_pool_movers(limit, str(exc))
            except MarketError as fallback_exc:
                if stale is None:
                    raise
                return {
                    **stale, "status": "stale", "stale": True,
                    "error": f"{exc}; {fallback_exc}",
                }
            self.market.store_snapshot(cache_key, result)
            return result

        def map_row(row: JSONDict) -> JSONDict:
            change_percent = _number(row.get("f3"))
            weekly_change = _number(row.get("f109"))
            turnover = _number(row.get("f8"))
            volume_ratio = _number(row.get("f10"))
            tags: list[str] = []
            if change_percent is not None and change_percent >= 5:
                tags.append("日内强势")
            elif change_percent is not None and change_percent <= -5:
                tags.append("日内弱势")
            if weekly_change is not None and weekly_change >= 10:
                tags.append("周线强势")
            elif weekly_change is not None and weekly_change <= -10:
                tags.append("周线弱势")
            if turnover is not None and turnover >= 5:
                tags.append("高换手")
            if volume_ratio is not None and volume_ratio >= 1.5:
                tags.append("放量")
            market_prefix = "sh" if _integer(row.get("f13")) == 1 else "sz"
            return {
                "code": f"{market_prefix}{row.get('f12')}",
                "name": row.get("f14"),
                "price": _number(row.get("f2")),
                "change": _number(row.get("f4")),
                "change_percent": change_percent,
                "weekly_change_percent": weekly_change,
                "turnover_rate": turnover,
                "amount": _number(row.get("f6")),
                "amplitude": _number(row.get("f7")),
                "volume_ratio": volume_ratio,
                "industry": row.get("f100") if row.get("f100") not in (None, "-") else None,
                "reason_tags": tags,
            }

        gainers = [map_row(row) for row in gain_rows]
        decliners = [map_row(row) for row in decline_rows]
        result = {
            "source": "eastmoney",
            "scope": "a_share_market",
            "as_of": datetime.now().astimezone().isoformat(timespec="seconds"),
            "status": "ok" if gainers and decliners else "partial",
            "stale": False,
            "gainers": gainers,
            "decliners": decliners,
        }
        self.market.store_snapshot(cache_key, result)
        return result

    async def capital_flow(self, kind: str, limit: int = 20) -> JSONDict:
        """Rank public EastMoney capital-flow fields without inventing gaps."""
        market_filter = {
            "sector": "m:90 t:2",
            "stock": "m:0 t:6,m:0 t:80,m:1 t:2,m:1 t:23,m:0 t:81 s:2048",
        }.get(kind)
        if market_filter is None:
            raise ValueError("kind 必须是 sector 或 stock")
        cache_key = f"market-capital-flow:{kind}:{limit}"
        cached = self.market.cached_snapshot(cache_key, 60.0)
        if cached is not None:
            return cached
        payload = await self._get_json(
            EASTMONEY_CLIST_URLS,
            params={
                "pn": 1, "pz": limit, "po": 1, "np": 1,
                "ut": EASTMONEY_UT, "fltt": 2, "invt": 2,
                "fid": "f62", "fs": market_filter,
                "fields": "f12,f14,f2,f3,f62,f184,f66,f69,f72,f75,f78,f81,f84,f87",
            },
        )
        rows = list(((payload.get("data") or {}).get("diff") or []))[:limit]
        items = [{
            "code": row.get("f12"),
            "name": row.get("f14"),
            "price": _number(row.get("f2")),
            "change_percent": _number(row.get("f3")),
            "main_net_inflow": _number(row.get("f62")),
            "main_net_inflow_rate": _number(row.get("f184")),
            "super_large_net_inflow": _number(row.get("f66")),
            "super_large_net_inflow_rate": _number(row.get("f69")),
            "large_net_inflow": _number(row.get("f72")),
            "large_net_inflow_rate": _number(row.get("f75")),
            "medium_net_inflow": _number(row.get("f78")),
            "medium_net_inflow_rate": _number(row.get("f81")),
            "small_net_inflow": _number(row.get("f84")),
            "small_net_inflow_rate": _number(row.get("f87")),
        } for row in rows]
        result = {
            "kind": kind,
            "source": "eastmoney",
            "as_of": datetime.now().astimezone().isoformat(timespec="seconds"),
            "status": "ok" if items else "unavailable",
            "items": items,
        }
        self.market.store_snapshot(cache_key, result)
        return result

    async def _tonghuashun_funds(self, code: str) -> JSONDict | None:
        digits = "".join(char for char in code if char.isdigit())
        try:
            response = await self.market.http.get(
                TONGHUASHUN_FUNDS.format(code=digits),
                headers={**TONGHUASHUN_HEADERS, "Referer": f"https://stockpage.10jqka.com.cn/{digits}/"},
            )
            response.raise_for_status()
            payload = response.json()
            if not isinstance(payload, dict):
                return None
            title = payload.get("title") or {}
            field = payload.get("field") or {}
            amount = _number(title.get("je"))
            if amount is None:
                return None
            return {
                "main_net_inflow": amount,
                "industry": field.get("hyname") if isinstance(field.get("hyname"), str) else None,
            }
        except (httpx.HTTPError, ValueError):
            return None

    async def weekly_movers(
        self, limit: int = 20, threshold_percent: float = 8, ths_limit: int = 20,
    ) -> JSONDict:
        """Find weekly A-share tails, then batch-enrich candidates from THS."""
        cache_key = f"market-weekly:{limit}:{threshold_percent}:{ths_limit}"
        cached = self.market.cached_snapshot(cache_key, 120.0)
        if cached is not None:
            return cached
        fetch_limit = max(limit, ths_limit)
        params: JSONDict = {
            "pn": 1, "pz": fetch_limit, "np": 1,
            "ut": EASTMONEY_UT, "fltt": 2, "invt": 2, "fid": "f109",
            "fs": "m:0 t:6,m:0 t:80,m:1 t:2,m:1 t:23,m:0 t:81 s:2048",
            "fields": "f12,f13,f14,f2,f3,f6,f7,f8,f10,f100,f109",
        }

        async def fetch(order: int) -> list[JSONDict]:
            payload = await self._get_json(EASTMONEY_CLIST_URLS, params={**params, "po": order})
            return list(((payload.get("data") or {}).get("diff") or []))

        # ponytail: two sequential tails are gentler on the undocumented public endpoint.
        gain_rows = await fetch(1)
        decline_rows = await fetch(0)

        def map_row(row: JSONDict) -> JSONDict | None:
            weekly = _number(row.get("f109"))
            raw_code = row.get("f12")
            if weekly is None or raw_code is None or abs(weekly) < threshold_percent:
                return None
            code = f"{'sh' if _integer(row.get('f13')) == 1 else 'sz'}{raw_code}"
            daily = _number(row.get("f3"))
            turnover = _number(row.get("f8"))
            volume_ratio = _number(row.get("f10"))
            tags: list[str] = ["一周大涨" if weekly > 0 else "一周大跌"]
            if daily is not None and abs(daily) >= 5:
                tags.append("日内异动")
            if turnover is not None and turnover >= 8:
                tags.append("高换手")
            if volume_ratio is not None and volume_ratio >= 1.8:
                tags.append("放量")
            return {
                "code": code, "name": row.get("f14"), "price": _number(row.get("f2")),
                "weekly_change_percent": weekly, "change_percent": daily,
                "turnover_rate": turnover, "amount": _number(row.get("f6")),
                "amplitude": _number(row.get("f7")), "volume_ratio": volume_ratio,
                "industry": row.get("f100") if row.get("f100") not in (None, "-") else None,
                "ths_main_net_inflow": None, "ths_industry": None,
                "ths_main_net_inflow_unit": "wan_cny",
                "source_status": {"eastmoney": True, "tonghuashun": False},
                "reason_tags": tags,
                "eastmoney_url": f"https://quote.eastmoney.com/{code}.html",
                "tonghuashun_url": f"https://stockpage.10jqka.com.cn/{raw_code}/",
            }

        unique: dict[str, JSONDict] = {}
        for row in [*gain_rows, *decline_rows]:
            item = map_row(row)
            if item is not None:
                unique[item["code"]] = item
        items = sorted(
            unique.values(), key=lambda item: abs(item["weekly_change_percent"]), reverse=True,
        )[:limit]
        requested_items = items[:ths_limit]
        breaker = self.market._breaker("tonghuashun")
        enriched: list[JSONDict | None]
        if requested_items and breaker.allow_request():
            semaphore = asyncio.Semaphore(4)

            async def enrich(item: JSONDict) -> JSONDict | None:
                async with semaphore:
                    return await self._tonghuashun_funds(str(item["code"]))

            enriched = await asyncio.gather(*(enrich(item) for item in requested_items))
        else:
            enriched = [None] * len(requested_items)
        succeeded = 0
        for item, funds in zip(requested_items, enriched, strict=True):
            if funds is None:
                continue
            succeeded += 1
            item["ths_main_net_inflow"] = funds["main_net_inflow"]
            item["ths_industry"] = funds["industry"]
            item["source_status"] = {"eastmoney": True, "tonghuashun": True}
            amount = cast(float, funds["main_net_inflow"])
            if amount > 0:
                item["reason_tags"].append("同花顺主力净流入")
            elif amount < 0:
                item["reason_tags"].append("同花顺主力净流出")
        if succeeded:
            breaker.record_success()
        elif requested_items:
            breaker.record_failure("同花顺批量资金接口无可用响应")
        requested = len(requested_items)
        coverage = {
            "eastmoney_candidates": len(items),
            "tonghuashun_requested": requested,
            "tonghuashun_succeeded": succeeded,
            "tonghuashun_failed": requested - succeeded,
            "tonghuashun_rate": round(succeeded / requested, 4) if requested else 0.0,
        }
        result = {
            "source": ["eastmoney", "tonghuashun"],
            "scope": "a_share_weekly_tails",
            "as_of": datetime.now().astimezone().isoformat(timespec="seconds"),
            "status": "ok" if requested == succeeded else "partial",
            "threshold_percent": threshold_percent,
            "coverage": coverage,
            "items": items,
        }
        self.market.store_snapshot(cache_key, result)
        return result

    async def pulse(
        self, limit: int = 20, threshold_percent: float = 8, ths_limit: int = 20,
    ) -> JSONDict:
        """Return a sectioned snapshot; one upstream failure never erases the rest."""
        cache_key = f"market-pulse:{limit}:{threshold_percent}:{ths_limit}"
        cached = self.market.cached_snapshot(cache_key, 60.0)
        if cached is not None:
            return cached
        jobs = {
            "breadth": self.breadth("cn"),
            "movers": self.movers(limit),
            "industry": self.sectors("industry", limit),
            "concept": self.sectors("concept", limit),
            "sector_flow": self.capital_flow("sector", limit),
            "stock_flow": self.capital_flow("stock", limit),
            "weekly": self.weekly_movers(limit, threshold_percent, ths_limit),
            "popular": self.popular(limit),
        }
        semaphore = asyncio.Semaphore(2)

        async def safe(coro: Any) -> JSONDict:
            try:
                async with semaphore:
                    value = await coro
                return cast(JSONDict, value)
            except (MarketError, httpx.HTTPError, ValueError) as exc:
                return {"status": "unavailable", "error": str(exc)}

        values = await asyncio.gather(*(safe(coro) for coro in jobs.values()))
        sections = dict(zip(jobs, values, strict=True))
        is_partial = any(section.get("status") in {"partial", "stale", "unavailable"} for section in values)
        result = {
            "as_of": datetime.now().astimezone().isoformat(timespec="seconds"),
            "market": "cn",
            "scope": "public_market_dimensions",
            "status": "partial" if is_partial else "ok",
            "sources": ["eastmoney", "tonghuashun"],
            "sections": sections,
        }
        self.market.store_snapshot(cache_key, result)
        return result

    async def _tech_pool_movers(self, limit: int, reason: str) -> JSONDict:
        """Fall back to Tech_Stock_Monitor's curated technology universe."""
        breaker = self.market._breaker("tencent")
        if not breaker.allow_request():
            raise MarketError("腾讯技术股池行情源熔断中")
        try:
            quotes = await self.market._quotes_tencent([code for code, _, _ in TECH_WATCH_POOL])
            if not quotes:
                raise ValueError("技术股池行情为空")
            breaker.record_success()
        except (httpx.HTTPError, ValueError) as exc:
            breaker.record_failure(exc)
            raise MarketError("技术股池行情不可用") from exc

        metadata = {code: (name, industry) for code, name, industry in TECH_WATCH_POOL}

        def map_quote(quote: JSONDict) -> JSONDict:
            code = str(quote.get("code") or "")
            fallback_name, industry = metadata.get(code, (code, "技术"))
            change_percent = _number(quote.get("change_percent"))
            turnover = _number(quote.get("turnover_rate"))
            amount = _number(quote.get("amount"))
            tags: list[str] = ["技术股池"]
            if change_percent is not None and change_percent >= 5:
                tags.append("日内强势")
            elif change_percent is not None and change_percent <= -5:
                tags.append("日内弱势")
            if turnover is not None and turnover >= 5:
                tags.append("高换手")
            if amount is not None and amount >= 1_000_000_000:
                tags.append("成交活跃")
            return {
                "code": code,
                "name": quote.get("name") or fallback_name,
                "price": _number(quote.get("price")),
                "change": _number(quote.get("change")),
                "change_percent": change_percent,
                "weekly_change_percent": None,
                "turnover_rate": turnover,
                "amount": amount,
                "amplitude": _number(quote.get("amplitude")),
                "volume_ratio": None,
                "industry": industry,
                "reason_tags": tags,
            }

        items = [map_quote(quote) for quote in quotes if quote.get("change_percent") is not None]
        gainers = sorted(
            (item for item in items if item["change_percent"] > 0),
            key=lambda item: item["change_percent"], reverse=True,
        )[:limit]
        decliners = sorted(
            (item for item in items if item["change_percent"] < 0),
            key=lambda item: item["change_percent"],
        )[:limit]
        return {
            "source": "tencent",
            "scope": "tech_watch_pool",
            "as_of": datetime.now().astimezone().isoformat(timespec="seconds"),
            "status": "partial",
            "stale": False,
            "note": "东方财富全市场暂不可用，已切换 Tech_Stock_Monitor 技术股池",
            "upstream_error": reason,
            "gainers": gainers,
            "decliners": decliners,
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
            EASTMONEY_QUOTE_LIST_URLS,
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
