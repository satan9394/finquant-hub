"""行情数据服务：东方财富搜索 + 腾讯实时行情 + 新浪/腾讯 K 线。

移植自 Tech_Stock_Monitor 的 stockApi.ts，改为后端直连（解决跨域 + 支持缓存与 Agent 引用）。
降级策略：实时行情 腾讯 → 新浪；K 线 新浪 → 腾讯。单源失败自动切换（DATA-04）。
"""
import asyncio
from functools import lru_cache
import json
import os
import re
from time import monotonic
from datetime import UTC, datetime
from dataclasses import dataclass, field
from typing import Any, cast

import httpx

from .source_health import CircuitBreaker

EASTMONEY_SEARCH = "https://searchapi.eastmoney.com/api/suggest/get"
EASTMONEY_TOKEN = "D43BF722C8E33BDC906FB84D85E326E8"
TENCENT_QUOTE = "https://qt.gtimg.cn/q={codes}"
TENCENT_KLINE = "https://web.ifzq.gtimg.cn/appstock/app/fqkline/get?param={code},day,,,{count},qfq"
SINA_QUOTE = "https://hq.sinajs.cn/list={codes}"
SINA_KLINE = (
    "https://money.finance.sina.com.cn/quotes_service/api/json_v2.php/"
    "CN_MarketData.getKLineData?symbol={code}&scale={scale}&ma=no&datalen={count}"
)
SINA_HEADERS = {"Referer": "https://finance.sina.com.cn"}
YAHOO_CHARTS = (
    "https://query1.finance.yahoo.com/v8/finance/chart/{symbol}",
    "https://query2.finance.yahoo.com/v8/finance/chart/{symbol}",
)
YAHOO_SEARCH = "https://query1.finance.yahoo.com/v1/finance/search"
YAHOO_FUNDAMENTALS = (
    "https://query2.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/"
    "timeseries/{symbol}"
)
YAHOO_HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; FinQuant-Hub/1.0)"}

SEARCH_ALIASES = {
    # The issuer kept this common legacy name in public discussion after its
    # formal listing as 长鑫科技. Resolve the company name before hitting
    # providers that reject Chinese free-text queries.
    "长鑫存储": "长鑫科技",
}

PERIOD_TO_SCALE = {"1d": 240, "60m": 60, "30m": 30, "15m": 15, "5m": 5}

DEFAULT_TIMEOUT = httpx.Timeout(10.0, connect=5.0)
JSONDict = dict[str, Any]


@lru_cache(maxsize=128)
def _pinyin_initial_candidates(keyword: str) -> tuple[str, ...]:
    """Convert unspaced pinyin into likely initial strings for provider search."""
    from pypinyin.constants import PINYIN_DICT
    from pypinyin.contrib.tone_convert import to_normal

    text = re.sub(r"[^a-z]", "", keyword.casefold())
    if len(text) < 3:
        return ()
    syllables = {
        to_normal(pronunciation)
        for pronunciations in PINYIN_DICT.values()
        for pronunciation in pronunciations.split(",")
    }
    paths: list[str] = []

    def split(position: int, initials: str) -> None:
        if len(paths) >= 24:
            return
        if position == len(text):
            paths.append(initials)
            return
        for end in range(position + 1, min(len(text), position + 6) + 1):
            if text[position:end] in syllables:
                split(end, initials + text[position])

    split(0, "")
    return tuple(sorted({path.upper() for path in paths}, key=lambda value: (len(value), value))[:6])


def _name_matches_pinyin(keyword: str, name: str) -> bool:
    from pypinyin import Style, lazy_pinyin

    needle = re.sub(r"[^a-z]", "", keyword.casefold())
    full = "".join(lazy_pinyin(name)).casefold()
    initials = "".join(lazy_pinyin(name, style=Style.FIRST_LETTER)).casefold()
    return bool(needle and (needle in full or needle == initials))


class MarketError(Exception):
    """全部数据源均失败。"""


def _failure_kind(exc: Exception) -> str:
    return type(exc.__cause__ or exc).__name__


def detect_market(code: str) -> str:
    """检测市场：A股6位(6xx/68x→sh, 0xx/3xx→sz), 港股4-5位→hk, 美股字母→us。"""
    t = code.strip().lower()
    if t.startswith(("sh", "sz", "hk", "us")):
        return t[:2]
    digits = re.sub(r"\D", "", t)
    if len(digits) == 6:
        if re.match(r"^(6|68)", digits):
            return "sh"
        if re.match(r"^(0|3)", digits):
            return "sz"
        return "sh"
    if 4 <= len(digits) <= 5:
        return "hk"
    # 无数字或全字母 → 美股
    if re.match(r"^[a-zA-Z]{1,5}$", t):
        return "us"
    return "sh"


def normalize_code(code: str) -> str:
    """Normalize user input to a provider-independent internal ticker.

    ``sh``/``sz`` are A shares, ``hk`` is Hong Kong, and ``us`` is a US-listed
    symbol.  The old implementation prefixed every unknown value with ``sh``;
    that turned ``AAPL`` and ``00700`` into invalid A-share requests.
    """
    raw = code.strip()
    if not raw:
        raise ValueError("股票代码不能为空")

    compact = raw.replace(" ", "")
    lower = compact.lower()
    if re.fullmatch(r"(?:sh|sz)\d{6}", lower):
        return lower
    if re.fullmatch(r"hk\d{4,5}", lower):
        return f"hk{lower[2:].zfill(5)}"
    if re.fullmatch(r"us[A-Za-z][A-Za-z0-9.\-]{0,14}", compact, re.I):
        return "us" + compact[2:].upper()

    # Exchange suffixes copied from common finance sites are accepted too.
    suffix_match = re.fullmatch(r"(\d{4,5})\.HK", compact, re.I)
    if suffix_match:
        return f"hk{suffix_match.group(1).zfill(5)}"
    suffix_match = re.fullmatch(r"(\d{6})\.(SS|SZ)", compact, re.I)
    if suffix_match:
        return ("sh" if suffix_match.group(2).upper() == "SS" else "sz") + suffix_match.group(1)

    if compact.isdigit():
        if len(compact) == 6:
            return detect_market(compact) + compact
        if 4 <= len(compact) <= 5:
            return f"hk{compact.zfill(5)}"

    if re.fullmatch(r"[A-Za-z][A-Za-z0-9.\-]{0,14}", compact):
        return "us" + compact.upper()
    raise ValueError("不支持的股票代码格式")


def _market(code: str) -> str:
    return code[:2]


def _yahoo_symbol(code: str) -> str:
    market, symbol = _market(code), code[2:]
    if market == "sh":
        return f"{symbol}.SS"
    if market == "sz":
        return f"{symbol}.SZ"
    if market == "hk":
        return f"{int(symbol):04d}.HK"
    if market == "us":
        return symbol.replace(".", "-")
    raise ValueError("不支持的市场")


def _is_usable_quote(quote: JSONDict | None) -> bool:
    return bool(quote and quote.get("name") and quote.get("price") not in (None, 0))


@dataclass
class MarketDataService:
    """可注入 httpx 客户端（测试时用 MockTransport）。"""

    http: httpx.AsyncClient = field(default=cast(httpx.AsyncClient, None))
    yahoo_http: httpx.AsyncClient = field(default=cast(httpx.AsyncClient, None))
    quote_priority: tuple[str, ...] = ("tencent", "sina", "yahoo")
    kline_priority: tuple[str, ...] = ("sina", "tencent", "yahoo")
    fundamentals_priority: tuple[str, ...] = ("akshare", "tushare", "yahoo")
    breakers: dict[str, CircuitBreaker] = field(default_factory=dict)
    snapshot_cache: dict[str, tuple[float, JSONDict]] = field(default_factory=dict, repr=False)

    def __post_init__(self) -> None:
        injected_http = self.http is not None
        if self.http is None:
            # trust_env=False：国内行情接口直连，绕过系统代理避免 TLS 超时/劫持
            self.http = httpx.AsyncClient(
                timeout=DEFAULT_TIMEOUT, follow_redirects=True, trust_env=False
            )
        if self.yahoo_http is None:
            # Yahoo is often reachable from this network only through the system
            # proxy.  Keep this separate so Chinese sources still bypass it.
            self.yahoo_http = self.http if injected_http else httpx.AsyncClient(
                timeout=DEFAULT_TIMEOUT, follow_redirects=True, trust_env=True
            )

    async def aclose(self) -> None:
        await self.http.aclose()
        if self.yahoo_http is not self.http:
            await self.yahoo_http.aclose()

    def _breaker(self, provider: str) -> CircuitBreaker:
        return self.breakers.setdefault(provider, CircuitBreaker())

    def cached_snapshot(self, key: str, max_age: float) -> JSONDict | None:
        cached = self.snapshot_cache.get(key)
        if cached is None or monotonic() - cached[0] > max_age:
            return None
        return cached[1]

    def store_snapshot(self, key: str, value: JSONDict) -> None:
        self.snapshot_cache[key] = (monotonic(), value)

    def configure_source_priority(self, kind: str, providers: list[str]) -> None:
        """Reorder installed providers without silently disabling fallbacks."""
        expected = {
            "quote": {"tencent", "sina", "yahoo"},
            "kline": {"tencent", "sina", "yahoo"},
            "fundamentals": {"akshare", "tushare", "yahoo"},
        }
        if kind not in expected:
            raise ValueError("kind 必须是 quote、kline 或 fundamentals")
        if len(providers) != 3 or set(providers) != expected[kind]:
            names = "、".join(sorted(expected[kind]))
            raise ValueError(f"源优先级必须且只能包含 {names} 各一次")
        setattr(self, f"{kind}_priority", tuple(providers))

    def source_status(self) -> JSONDict:
        return {
            "priorities": {
                "quote": list(self.quote_priority),
                "kline": list(self.kline_priority),
                "fundamentals": list(self.fundamentals_priority),
            },
            "providers": {
                provider: self._breaker(provider).snapshot()
                for provider in ("tencent", "sina", "yahoo", "eastmoney")
            },
        }

    # ------------------------------------------------------------------
    # 搜索 — 东方财富
    # ------------------------------------------------------------------

    async def search(self, keyword: str) -> list[JSONDict]:
        """Search A shares plus Yahoo's global symbol index.

        A failed source should not make the search box unusable when the other
        source can answer the query.
        """
        query = SEARCH_ALIASES.get(keyword.strip(), keyword.strip())
        if not query:
            return []
        results: list[JSONDict] = []
        succeeded_sources: list[str] = []
        failed_sources: list[str] = []
        try:
            eastmoney_queries = (query, *_pinyin_initial_candidates(query))
            for provider_query in dict.fromkeys(eastmoney_queries):
                resp = await self.http.get(
                    EASTMONEY_SEARCH,
                    params={
                        "input": provider_query,
                        "count": 100 if provider_query != query else 10,
                        "type": 14,
                        "token": EASTMONEY_TOKEN,
                    },
                )
                resp.raise_for_status()
                data = resp.json()
                provider_results: list[JSONDict] = []
                for it in (data.get("QuotationCodeTable") or {}).get("Data") or []:
                    quote_id = str(it.get("QuoteID", ""))
                    classify = it.get("Classify", "")
                    raw_code = str(it.get("UnifiedCode") or it.get("Code", ""))
                    # Eastmoney's current endpoint uses numeric Classify values
                    # for newly listed shares (e.g. 科创板 "23"), while older
                    # responses used "AStock". The six-digit code + mainland
                    # QuoteID is the stable boundary.
                    if not re.fullmatch(r"\d{6}", raw_code) or not quote_id.startswith(("0.", "1.")):
                        continue
                    provider_results.append({
                        "code": normalize_code(raw_code),
                        "name": it.get("Name", ""),
                        "market": "sh" if quote_id.startswith("1.") else "sz",
                        "type": it.get("SecurityTypeName") or ("ETF" if classify == "ETF" else "股票"),
                        "source": "eastmoney",
                    })
                if provider_query != query:
                    provider_results = [
                        row for row in provider_results
                        if _name_matches_pinyin(query, str(row["name"]))
                    ]
                if provider_results:
                    results.extend(provider_results)
                    break
            succeeded_sources.append("eastmoney")
        except (httpx.HTTPError, ValueError):
            failed_sources.append("eastmoney")

        try:
            yahoo = await self.yahoo_http.get(
                YAHOO_SEARCH,
                params={"q": query, "quotesCount": 10, "newsCount": 0},
                headers=YAHOO_HEADERS,
            )
            yahoo.raise_for_status()
            succeeded_sources.append("yahoo")
            for item in yahoo.json().get("quotes", []):
                symbol = str(item.get("symbol") or "")
                quote_type = item.get("quoteType")
                if not symbol or quote_type not in {"EQUITY", "ETF", "MUTUALFUND", "INDEX"}:
                    continue
                suffix = symbol.upper().rsplit(".", 1)[-1] if "." in symbol else ""
                exchange = str(item.get("exchange") or "").upper()
                region = str(item.get("region") or "").upper()
                supported_suffix = suffix in {"HK", "SS", "SZ"}
                supported_us = region == "US" or exchange in {
                    "NMS", "NGM", "NCM", "NYQ", "ASE", "PCX", "PNK", "OQB", "OQX",
                }
                if not supported_suffix and not supported_us:
                    continue
                try:
                    normalized = normalize_code(symbol)
                except ValueError:
                    continue
                if any(row["code"] == normalized for row in results):
                    continue
                results.append({
                    "code": normalized,
                    "name": item.get("shortname") or item.get("longname") or symbol,
                    "market": _market(normalized),
                    "type": quote_type,
                    "source": "yahoo",
                    "exchange": item.get("exchange") or item.get("fullExchangeName"),
                })
        except (httpx.HTTPError, ValueError):
            failed_sources.append("yahoo")

        # A valid code should still be discoverable when provider search
        # indexes do not return it (notably 00700.HK). Quote resolution is the
        # authoritative fallback and also supplies the company name.
        try:
            direct = normalize_code(query)
        except ValueError:
            direct = None
        if direct and not any(row["code"] == direct for row in results):
            try:
                quote = await self.quote(direct)
                results.insert(0, {
                    "code": direct,
                    "name": quote.get("name") or direct,
                    "market": _market(direct),
                    "type": "EQUITY",
                    "source": quote.get("source") or "quote_fallback",
                    "exchange": quote.get("exchange"),
                })
                if quote.get("source") and quote["source"] not in succeeded_sources:
                    succeeded_sources.append(quote["source"])
            except (MarketError, httpx.HTTPError, ValueError):
                pass

        if not succeeded_sources and failed_sources:
            raise MarketError(f"标的搜索服务不可用：{','.join(failed_sources)}")
        return results

    # ------------------------------------------------------------------
    # 实时行情 — 腾讯主源 / 新浪备源
    # ------------------------------------------------------------------

    async def quote(self, ticker: str) -> JSONDict:
        code = normalize_code(ticker)
        providers = ("yahoo",) if _market(code) in {"hk", "us"} else self.quote_priority
        errors: list[str] = []
        for provider in providers:
            breaker = self._breaker(provider)
            if not breaker.allow_request():
                errors.append(f"{provider}:circuit_open")
                continue
            try:
                quote = await self._quote_from(provider, code)
                if not _is_usable_quote(quote):
                    raise ValueError("行情响应缺少名称或价格")
                breaker.record_success()
                return cast(JSONDict, quote)
            except (httpx.HTTPError, ValueError, MarketError) as exc:
                breaker.record_failure(exc)
                errors.append(f"{provider}:{_failure_kind(exc)}")
        raise MarketError(
            f"无法获取 {ticker} 的行情（{', '.join(errors) or '无可用数据源'}）"
        )

    async def _quote_from(self, provider: str, code: str) -> JSONDict | None:
        if provider == "tencent":
            quotes = await self._quotes_tencent([code])
            return quotes[0] if quotes else None
        if provider == "sina":
            quotes = await self._quotes_sina([code])
            return quotes[0] if quotes else None
        if provider == "yahoo":
            return await self._quote_yahoo(code)
        raise ValueError(f"未知行情源：{provider}")

    async def quotes(self, tickers: list[str]) -> list[JSONDict]:
        responses = await asyncio.gather(*(self.quote(ticker) for ticker in tickers), return_exceptions=True)
        return [result for result in responses if isinstance(result, dict)]

    async def quote_enriched(self, ticker: str) -> JSONDict:
        """Fill missing quote fields from lower-priority sources, never overwrite facts."""
        quote = await self.quote(ticker)
        code = normalize_code(ticker)
        fields = ("name", "price", "pe", "pb", "market_cap", "turnover_rate")
        missing = {key for key in fields if quote.get(key) in (None, 0, "")}
        sources = [str(quote.get("source") or "unknown")]
        if missing and _market(code) not in {"hk", "us"}:
            for provider in self.quote_priority:
                if provider in sources:
                    continue
                breaker = self._breaker(provider)
                if not breaker.allow_request():
                    continue
                try:
                    candidate = await self._quote_from(provider, code)
                    if not _is_usable_quote(candidate):
                        raise ValueError("行情响应缺少名称或价格")
                    breaker.record_success()
                except (httpx.HTTPError, ValueError, MarketError) as exc:
                    breaker.record_failure(exc)
                    continue
                typed_candidate = cast(JSONDict, candidate)
                sources.append(provider)
                for key in tuple(missing):
                    if typed_candidate.get(key) not in (None, 0, ""):
                        quote[key] = typed_candidate[key]
                        missing.remove(key)
                if not missing:
                    break
        quote["sources"] = sources
        quote["missing_fields"] = sorted(missing)
        return quote

    async def prefetch_quotes(
        self,
        tickers: list[str],
        *,
        enriched: bool = True,
        concurrency: int = 8,
    ) -> JSONDict:
        """Bounded concurrent batch fetch with per-ticker errors preserved."""
        semaphore = asyncio.Semaphore(max(1, min(concurrency, 32)))

        async def fetch(ticker: str) -> tuple[str, JSONDict | Exception]:
            async with semaphore:
                try:
                    method = self.quote_enriched if enriched else self.quote
                    return ticker, await method(ticker)
                except (MarketError, ValueError) as exc:
                    return ticker, exc

        results = await asyncio.gather(*(fetch(ticker) for ticker in tickers))
        return {
            "items": [result for _, result in results if isinstance(result, dict)],
            "errors": {
                ticker: str(result)
                for ticker, result in results
                if isinstance(result, Exception)
            },
        }

    async def _quotes_tencent(self, codes: list[str]) -> list[JSONDict]:
        resp = await self.http.get(TENCENT_QUOTE.format(codes=",".join(codes)))
        resp.raise_for_status()
        text = resp.content.decode("gbk", "replace")
        return parse_tencent_quotes(text)

    async def _quotes_sina(self, codes: list[str]) -> list[JSONDict]:
        resp = await self.http.get(SINA_QUOTE.format(codes=",".join(codes)), headers=SINA_HEADERS)
        resp.raise_for_status()
        text = resp.content.decode("gbk", "replace")
        return parse_sina_quotes(text)

    async def _quote_yahoo(self, code: str) -> JSONDict:
        symbol = _yahoo_symbol(code)
        payload = await self._yahoo_chart(symbol, "5d", "1d")
        meta = payload.get("meta") or {}
        price = meta.get("regularMarketPrice")
        previous = meta.get("previousClose") or meta.get("chartPreviousClose")
        if price in (None, 0) or previous in (None, 0):
            raise MarketError(f"未找到股票代码：{code}")
        change = float(cast(Any, price)) - float(cast(Any, previous))
        return {
            "code": code,
            "name": meta.get("longName") or meta.get("shortName") or symbol,
            "price": float(cast(Any, price)),
            "last_close": float(cast(Any, previous)),
            "open": _number(meta.get("regularMarketOpen")),
            "high": _number(meta.get("regularMarketDayHigh")),
            "low": _number(meta.get("regularMarketDayLow")),
            "volume": _number(meta.get("regularMarketVolume")),
            "amount": 0.0,
            "change": round(change, 4),
            "change_percent": round(change / float(cast(Any, previous)) * 100, 2),
            "turnover_rate": None,
            "pe": None,
            "pb": None,
            "market_cap": _number(meta.get("marketCap")),
            "amplitude": round((_number(meta.get("regularMarketDayHigh")) - _number(meta.get("regularMarketDayLow"))) / float(cast(Any, previous)) * 100, 2) if _number(meta.get("regularMarketDayHigh")) and _number(meta.get("regularMarketDayLow")) else None,
            "timestamp": int(meta.get("regularMarketTime") or 0),
            "currency": meta.get("currency"),
            "source": "yahoo",
            "exchange": meta.get("fullExchangeName") or meta.get("exchangeName"),
            "timezone": meta.get("exchangeTimezoneName"),
        }

    async def index_quote(
        self,
        provider_symbol: str,
        *,
        code: str,
        name: str,
        market: str,
    ) -> JSONDict:
        """Return a normalized index quote for mainland or Yahoo index symbols."""
        if provider_symbol.startswith(("sh", "sz")):
            quote = await self.quote(provider_symbol)
            return {
                "code": code,
                "name": name,
                "market": market,
                "price": quote.get("price"),
                "change": quote.get("change"),
                "change_percent": quote.get("change_percent"),
                "timestamp": quote.get("timestamp"),
                "source": quote.get("source"),
            }

        payload = await self._yahoo_chart(provider_symbol, "5d", "1d")
        meta = payload.get("meta") or {}
        price = meta.get("regularMarketPrice")
        previous = meta.get("previousClose") or meta.get("chartPreviousClose")
        if price in (None, 0) or previous in (None, 0):
            raise MarketError(f"指数行情不可用：{provider_symbol}")
        change = float(cast(Any, price)) - float(cast(Any, previous))
        return {
            "code": code,
            "name": name,
            "market": market,
            "price": float(cast(Any, price)),
            "change": round(change, 4),
            "change_percent": round(change / float(cast(Any, previous)) * 100, 2),
            "timestamp": int(meta.get("regularMarketTime") or 0),
            "source": "yahoo",
        }

    # ------------------------------------------------------------------
    # K 线 — 新浪主源 / 腾讯备源
    # ------------------------------------------------------------------

    async def kline(self, ticker: str, period: str = "1d", count: int = 100) -> list[JSONDict]:
        code = normalize_code(ticker)
        scale = PERIOD_TO_SCALE.get(period, 240)
        count = max(1, min(count, 800))
        providers = ("yahoo",) if _market(code) in {"hk", "us"} else self.kline_priority
        errors: list[str] = []
        for provider in providers:
            breaker = self._breaker(provider)
            if not breaker.allow_request():
                errors.append(f"{provider}:circuit_open")
                continue
            try:
                if provider == "sina":
                    items = await self._kline_sina(code, scale, count)
                elif provider == "tencent":
                    items = await self._kline_tencent(code, count)
                elif provider == "yahoo":
                    items = await self._kline_yahoo(code, period, count)
                else:
                    raise ValueError(f"未知 K 线源：{provider}")
                if not items:
                    raise ValueError("K 线响应为空")
                breaker.record_success()
                return items
            except (httpx.HTTPError, ValueError, MarketError) as exc:
                breaker.record_failure(exc)
                errors.append(f"{provider}:{_failure_kind(exc)}")
        raise MarketError(
            f"无法获取 {ticker} 的 K 线（{', '.join(errors) or '无可用数据源'}）"
        )

    async def _kline_sina(self, code: str, scale: int, count: int) -> list[JSONDict]:
        resp = await self.http.get(
            SINA_KLINE.format(code=code, scale=scale, count=count), headers=SINA_HEADERS
        )
        resp.raise_for_status()
        data = json.loads(resp.text)
        if not isinstance(data, list):
            return []
        return [
            {
                "day": it["day"],
                "open": float(it["open"]),
                "high": float(it["high"]),
                "low": float(it["low"]),
                "close": float(it["close"]),
                "volume": int(float(it.get("volume") or 0)),
                "source": "sina",
                "adjustment": "none",
            }
            for it in data
            if it.get("day") and it.get("open")
        ]

    async def _kline_tencent(self, code: str, count: int) -> list[JSONDict]:
        resp = await self.http.get(TENCENT_KLINE.format(code=code, count=count))
        resp.raise_for_status()
        data = resp.json()
        node = (data.get("data") or {}).get(code) or {}
        rows = node.get("qfqday") or node.get("day") or []
        return [
            {
                "day": r[0],
                "open": float(r[1]),
                "close": float(r[2]),
                "high": float(r[3]),
                "low": float(r[4]),
                "volume": int(float(r[5])),
                "source": "tencent",
                "adjustment": "qfq" if node.get("qfqday") else "none",
            }
            for r in rows
            if len(r) >= 6
        ]

    async def _kline_yahoo(self, code: str, period: str, count: int) -> list[JSONDict]:
        interval = {"1d": "1d", "60m": "60m", "30m": "30m", "15m": "15m", "5m": "5m"}.get(period, "1d")
        range_value = "5y" if interval == "1d" else "60d"
        payload = await self._yahoo_chart(_yahoo_symbol(code), range_value, interval)
        quote = ((payload.get("indicators") or {}).get("quote") or [{}])[0]
        adjusted = ((payload.get("indicators") or {}).get("adjclose") or [{}])[0].get("adjclose") or []
        rows: list[JSONDict] = []
        for index, (timestamp, open_, high, low, close, volume) in enumerate(zip(
            payload.get("timestamp") or [], quote.get("open") or [], quote.get("high") or [],
            quote.get("low") or [], quote.get("close") or [], quote.get("volume") or [],
        )):
            if None in (open_, high, low, close):
                continue
            adjusted_close = adjusted[index] if index < len(adjusted) else None
            ratio = float(cast(Any, adjusted_close)) / float(close) if adjusted_close not in (None, 0) and close else 1.0
            rows.append({
                "day": datetime.fromtimestamp(timestamp, tz=UTC).strftime("%Y-%m-%d" if interval == "1d" else "%Y-%m-%d %H:%M"),
                "open": float(open_) * ratio, "high": float(high) * ratio, "low": float(low) * ratio,
                "close": float(cast(Any, adjusted_close)) if adjusted_close not in (None, 0) else float(close),
                "volume": int(volume or 0),
                "source": "yahoo",
                "adjustment": "split_dividend_adjusted" if adjusted_close not in (None, 0) else "none",
            })
        if not rows:
            raise MarketError(f"无K线数据：{code}")
        return rows[-count:]

    async def _yahoo_chart(self, symbol: str, range_value: str, interval: str) -> JSONDict:
        last_error: Exception | None = None
        for endpoint in YAHOO_CHARTS:
            try:
                response = await self.yahoo_http.get(
                    endpoint.format(symbol=symbol),
                    params={"range": range_value, "interval": interval},
                    headers=YAHOO_HEADERS,
                )
                response.raise_for_status()
                result = (response.json().get("chart") or {}).get("result") or []
                if result:
                    return cast(JSONDict, result[0])
            except (httpx.HTTPError, ValueError) as exc:
                last_error = exc
        raise MarketError(f"未找到股票代码：{symbol}") from last_error

    async def fundamentals(self, ticker: str) -> list[JSONDict]:
        """Return period-safe fundamentals with domestic-source priority."""
        code = normalize_code(ticker)
        if not code.startswith(("sh", "sz")):
            return await self._yahoo_fundamentals(ticker)

        from .fundamentals import (
            AkshareFundamentalsAdapter,
            TushareFundamentalsAdapter,
            fetch_cn_fundamentals,
        )
        from .auth import current_user_id
        from .credential_store import get_credential

        tushare_token = os.getenv("TUSHARE_TOKEN", "").strip()
        try:
            owner_id = current_user_id()
        except RuntimeError:
            owner_id = None
        if owner_id is not None:
            stored_token = await get_credential(owner_id, "tushare")
            if stored_token:
                tushare_token = stored_token

        adapters = {
            "akshare": AkshareFundamentalsAdapter,
            "tushare": TushareFundamentalsAdapter,
        }
        errors = []
        suspicious_candidate: list[JSONDict] | None = None
        for provider in self.fundamentals_priority:
            try:
                if provider == "yahoo":
                    items = await self._yahoo_fundamentals(ticker)
                else:
                    adapter = (
                        TushareFundamentalsAdapter(tushare_token)
                        if provider == "tushare"
                        else adapters[provider]()
                    )
                    items = await fetch_cn_fundamentals(code, (adapter,))
            except (MarketError, RuntimeError) as exc:
                errors.append(f"{provider}:{type(exc).__name__}")
                continue
            if items:
                suspicious = any(
                    str(flag).startswith("suspicious_")
                    for item in items
                    for flag in item.get("quality_flags", [])
                )
                if suspicious and provider != "yahoo":
                    suspicious_candidate = suspicious_candidate or items
                    continue
                return items
        if suspicious_candidate:
            return suspicious_candidate
        raise MarketError(f"无法获取 {ticker} 的基本面数据（{', '.join(errors) or '无可用数据源'}）")

    async def _yahoo_fundamentals(self, ticker: str) -> list[JSONDict]:
        code = normalize_code(ticker)
        domestic = code.startswith(("sh", "sz"))
        symbol = _yahoo_symbol(code)
        metric_types = [
            "trailingMarketCap",
            "trailingPeRatio",
            "trailingPbRatio",
            "trailingEps",
            "trailingTotalRevenue",
            "trailingNetIncome",
            "trailingGrossProfit",
            "trailingOperatingCashFlow",
            "trailingFreeCashFlow",
            "quarterlyTotalRevenue",
            "quarterlyOperatingRevenue",
            "quarterlyNetIncome",
            "quarterlyNetIncomeCommonStockholders",
            "quarterlyGrossProfit",
            "quarterlyOperatingCashFlow",
            "quarterlyFreeCashFlow",
            "annualTotalRevenue",
            "annualOperatingRevenue",
            "annualNetIncome",
            "annualNetIncomeCommonStockholders",
            "annualGrossProfit",
            "annualOperatingCashFlow",
            "annualFreeCashFlow",
            "quarterlyTotalAssets",
            "quarterlyTotalLiabilitiesNetMinorityInterest",
            "quarterlyStockholdersEquity",
        ]
        now = int(datetime.now(tz=UTC).timestamp())
        try:
            response = await self.yahoo_http.get(
                YAHOO_FUNDAMENTALS.format(symbol=symbol),
                params={
                    "symbol": symbol,
                    "type": ",".join(metric_types),
                    "merge": "false",
                    "period1": str(now - 366 * 24 * 60 * 60 * 5),
                    "period2": str(now),
                },
                headers=YAHOO_HEADERS,
            )
            response.raise_for_status()
            payload = response.json().get("timeseries") or {}
        except (httpx.HTTPError, ValueError) as exc:
            raise MarketError(
                f"无法获取 {ticker} 的基本面数据（yahoo:{_failure_kind(exc)}）"
            ) from exc
        if payload.get("error"):
            raise MarketError(f"无法获取 {ticker} 的基本面数据（yahoo:upstream_error）")

        if domestic:
            from .fundamentals import normalize_yahoo_cn_fundamentals

            return normalize_yahoo_cn_fundamentals(payload)

        items: list[JSONDict] = []
        for series in payload.get("result") or []:
            metric = ((series.get("meta") or {}).get("type") or [None])[0]
            values = series.get(metric) if metric else None
            if not metric or not values:
                continue
            latest = values[-1]
            raw = (latest.get("reportedValue") or {}).get("raw")
            if raw is None:
                continue
            items.append({
                "metric": metric,
                "value": float(raw),
                "as_of": latest.get("asOfDate"),
                "as_of_date": latest.get("asOfDate"),
                "currency": latest.get("currencyCode"),
                "period_type": latest.get("periodType"),
                "provider": "yahoo_fundamentals_timeseries",
                "source": "yahoo.fundamentals_timeseries",
                "is_ttm": latest.get("periodType") == "TTM",
            })
        by_metric = {item["metric"]: item for item in items}
        derived_specs = {
            "gross_margin": ("trailingGrossProfit", "trailingTotalRevenue", True),
            "net_profit_margin": ("trailingNetIncome", "trailingTotalRevenue", True),
            "debt_to_assets": (
                "quarterlyTotalLiabilitiesNetMinorityInterest", "quarterlyTotalAssets", True,
            ),
            "cfo_to_net_income": ("trailingOperatingCashFlow", "trailingNetIncome", True),
            "fcf_margin": ("trailingFreeCashFlow", "trailingTotalRevenue", True),
            "fcf_yield": ("trailingFreeCashFlow", "trailingMarketCap", False),
        }
        for metric, (numerator_key, denominator_key, same_period) in derived_specs.items():
            numerator = by_metric.get(numerator_key)
            denominator = by_metric.get(denominator_key)
            if (
                not numerator or not denominator or denominator["value"] == 0
                or (same_period and (
                    numerator.get("as_of") != denominator.get("as_of")
                    or numerator.get("period_type") != denominator.get("period_type")
                ))
                or (numerator.get("currency") and denominator.get("currency")
                    and numerator["currency"] != denominator["currency"])
            ):
                continue
            items.append({
                "metric": metric,
                "value": numerator["value"] / denominator["value"] * 100,
                "as_of": max(str(numerator.get("as_of") or ""), str(denominator.get("as_of") or "")) or None,
                "as_of_date": max(
                    str(numerator.get("as_of") or ""), str(denominator.get("as_of") or "")
                ) or None,
                "currency": None,
                "period_type": "derived",
                "provider": "yahoo_fundamentals_timeseries",
                "source": "yahoo.fundamentals_timeseries",
                "is_ttm": bool(same_period and numerator.get("is_ttm") and denominator.get("is_ttm")),
                "components": [numerator_key, denominator_key],
                "methodology": "deterministic_ratio",
            })
        return items


def _number(value: object) -> float:
    try:
        return float(cast(Any, value)) if value is not None else 0.0
    except (TypeError, ValueError):
        return 0.0


# ----------------------------------------------------------------------
# 解析函数（纯逻辑，便于单元测试）
# ------------------------------------------------------------------

_TENCENT_LINE = re.compile(r'^v_(sh|sz|hk|us)(\w+)="(.*)";?\s*$', re.M)


def parse_tencent_quotes(raw: str) -> list[JSONDict]:
    results: list[JSONDict] = []
    for m in _TENCENT_LINE.finditer(raw):
        market, stock_code, payload = m.group(1), m.group(2), m.group(3)
        f = payload.split("~")
        if len(f) < 50:
            continue

        def num(i: int, default: float = 0.0) -> float:
            try:
                v = float(f[i])
                return v if v == v else default  # NaN 检查
            except (ValueError, IndexError):
                return default

        price, last_close = num(3), num(4)
        change = num(31) or round(price - last_close, 3)
        results.append(
            {
                "code": f"{market}{stock_code}",
                "name": f[1] or stock_code,
                "price": price,
                "last_close": last_close,
                "open": num(5),
                "high": num(33),
                "low": num(34),
                "volume": num(6),
                # Tencent quote fields: amount is reported in 10k currency
                # units and market cap in 100m currency units.
                "amount": num(37) * 10_000,
                "change": change,
                "change_percent": num(32),
                "turnover_rate": num(38),
                "pe": num(39),
                "pb": num(46),
                "market_cap": num(45) * 100_000_000,
                "amplitude": num(43),
                "timestamp": int(num(30) or 0),
                "source": "tencent",
            }
        )
    return results


_SINA_LINE = re.compile(r'^var hq_str_(sh|sz|hk|us)(\w+)="(.*)";\s*$', re.M)


def parse_sina_quotes(raw: str) -> list[JSONDict]:
    results: list[JSONDict] = []
    for m in _SINA_LINE.finditer(raw):
        market, stock_code, payload = m.group(1), m.group(2), m.group(3)
        f = payload.split(",")
        if len(f) < 32 or not f[0]:
            continue

        def num(i: int, default: float = 0.0) -> float:
            try:
                return float(f[i])
            except (ValueError, IndexError):
                return default

        price, last_close = num(3), num(2)
        change = round(price - last_close, 3)
        results.append(
            {
                "code": f"{market}{stock_code}",
                "name": f[0],
                "price": price,
                "last_close": last_close,
                "open": num(1),
                "high": num(4),
                "low": num(5),
                "volume": num(8),
                "amount": num(9),
                "change": change,
                "change_percent": round(change / last_close * 100, 2) if last_close else 0.0,
                "turnover_rate": 0.0,  # 新浪实时源不提供，降级时缺失字段置 0
                "pe": 0.0,
                "pb": 0.0,
                "market_cap": 0.0,
                "amplitude": 0.0,
                "timestamp": 0,
                "source": "sina",
            }
        )
    return results
