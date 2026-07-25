"""行情数据服务：东方财富搜索 + 腾讯实时行情 + 新浪/腾讯 K 线。

移植自 Tech_Stock_Monitor 的 stockApi.ts，改为后端直连（解决跨域 + 支持缓存与 Agent 引用）。
降级策略：实时行情 腾讯 → 新浪；K 线 新浪 → 腾讯。单源失败自动切换（DATA-04）。
"""
import asyncio
import json
import re
from datetime import UTC, datetime
from dataclasses import dataclass, field

import httpx

EASTMONEY_SEARCH = "https://searchadapter.eastmoney.com/api/suggest/get"
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
YAHOO_HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; FinQuant-Hub/1.0)"}

PERIOD_TO_SCALE = {"1d": 240, "60m": 60, "30m": 30, "15m": 15, "5m": 5}

DEFAULT_TIMEOUT = httpx.Timeout(10.0, connect=5.0)


class MarketError(Exception):
    """全部数据源均失败。"""


def detect_market(code: str) -> str:
    digits = re.sub(r"\D", "", code)
    if re.match(r"^(6|68)", digits):
        return "sh"
    if re.match(r"^(0|3)", digits):
        return "sz"
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


def _is_usable_quote(quote: dict | None) -> bool:
    return bool(quote and quote.get("name") and quote.get("price") not in (None, 0))


@dataclass
class MarketDataService:
    """可注入 httpx 客户端（测试时用 MockTransport）。"""

    http: httpx.AsyncClient = field(default=None)
    yahoo_http: httpx.AsyncClient = field(default=None)

    def __post_init__(self):
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

    async def aclose(self):
        await self.http.aclose()
        if self.yahoo_http is not self.http:
            await self.yahoo_http.aclose()

    # ------------------------------------------------------------------
    # 搜索 — 东方财富
    # ------------------------------------------------------------------

    async def search(self, keyword: str) -> list[dict]:
        """Search A shares plus Yahoo's global symbol index.

        A failed source should not make the search box unusable when the other
        source can answer the query.
        """
        results: list[dict] = []
        try:
            resp = await self.http.get(
                EASTMONEY_SEARCH,
                params={"input": keyword, "count": 10, "type": 14},
            )
            resp.raise_for_status()
            data = resp.json()
            for it in (data.get("QuotationCodeTable") or {}).get("Data") or []:
                quote_id = str(it.get("QuoteID", ""))
                classify = it.get("Classify", "")
                if classify not in ("AStock", "ETF") or "." not in quote_id:
                    continue
                raw_code = str(it.get("UnifiedCode") or it.get("Code", ""))
                results.append({
                    "code": normalize_code(raw_code),
                    "name": it.get("Name", ""),
                    "market": "sh" if quote_id.startswith("1.") else "sz",
                    "type": it.get("SecurityTypeName") or ("ETF" if classify == "ETF" else "股票"),
                })
        except (httpx.HTTPError, ValueError):
            pass

        try:
            yahoo = await self.yahoo_http.get(
                YAHOO_SEARCH,
                params={"q": keyword, "quotesCount": 10, "newsCount": 0},
                headers=YAHOO_HEADERS,
            )
            yahoo.raise_for_status()
            for item in yahoo.json().get("quotes", []):
                symbol = str(item.get("symbol") or "")
                quote_type = item.get("quoteType")
                if not symbol or quote_type not in {"EQUITY", "ETF", "MUTUALFUND", "INDEX"}:
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
                })
        except (httpx.HTTPError, ValueError):
            pass
        return results

    # ------------------------------------------------------------------
    # 实时行情 — 腾讯主源 / 新浪备源
    # ------------------------------------------------------------------

    async def quote(self, ticker: str) -> dict:
        code = normalize_code(ticker)
        if _market(code) in {"hk", "us"}:
            try:
                return await self._quote_yahoo(code)
            except (httpx.HTTPError, ValueError, MarketError) as exc:
                raise MarketError(f"无法获取 {ticker} 的行情") from exc

        try:
            quotes = await self._quotes_tencent([code])
            if _is_usable_quote(quotes[0] if quotes else None):
                return quotes[0]
        except (httpx.HTTPError, ValueError):
            pass
        try:
            quotes = await self._quotes_sina([code])
            if _is_usable_quote(quotes[0] if quotes else None):
                return quotes[0]
        except (httpx.HTTPError, ValueError):
            pass
        try:
            return await self._quote_yahoo(code)
        except (httpx.HTTPError, ValueError, MarketError) as exc:
            raise MarketError(f"无法获取 {ticker} 的行情") from exc

    async def quotes(self, tickers: list[str]) -> list[dict]:
        responses = await asyncio.gather(*(self.quote(ticker) for ticker in tickers), return_exceptions=True)
        return [result for result in responses if isinstance(result, dict)]

    async def _quotes_tencent(self, codes: list[str]) -> list[dict]:
        resp = await self.http.get(TENCENT_QUOTE.format(codes=",".join(codes)))
        resp.raise_for_status()
        text = resp.content.decode("gbk", "replace")
        return parse_tencent_quotes(text)

    async def _quotes_sina(self, codes: list[str]) -> list[dict]:
        resp = await self.http.get(SINA_QUOTE.format(codes=",".join(codes)), headers=SINA_HEADERS)
        resp.raise_for_status()
        text = resp.content.decode("gbk", "replace")
        return parse_sina_quotes(text)

    async def _quote_yahoo(self, code: str) -> dict:
        symbol = _yahoo_symbol(code)
        payload = await self._yahoo_chart(symbol, "5d", "1d")
        meta = payload.get("meta") or {}
        price = meta.get("regularMarketPrice")
        previous = meta.get("previousClose") or meta.get("chartPreviousClose")
        if price in (None, 0) or previous in (None, 0):
            raise MarketError(f"未找到股票代码：{code}")
        change = float(price) - float(previous)
        return {
            "code": code,
            "name": meta.get("longName") or meta.get("shortName") or symbol,
            "price": float(price),
            "last_close": float(previous),
            "open": _number(meta.get("regularMarketOpen")),
            "high": _number(meta.get("regularMarketDayHigh")),
            "low": _number(meta.get("regularMarketDayLow")),
            "volume": _number(meta.get("regularMarketVolume")),
            "amount": 0.0,
            "change": round(change, 4),
            "change_percent": round(change / float(previous) * 100, 2),
            "turnover_rate": None,
            "pe": None,
            "pb": None,
            "market_cap": _number(meta.get("marketCap")),
            "amplitude": round((_number(meta.get("regularMarketDayHigh")) - _number(meta.get("regularMarketDayLow"))) / float(previous) * 100, 2) if _number(meta.get("regularMarketDayHigh")) and _number(meta.get("regularMarketDayLow")) else None,
            "timestamp": int(meta.get("regularMarketTime") or 0),
            "currency": meta.get("currency"),
            "source": "yahoo",
        }

    # ------------------------------------------------------------------
    # K 线 — 新浪主源 / 腾讯备源
    # ------------------------------------------------------------------

    async def kline(self, ticker: str, period: str = "1d", count: int = 100) -> list[dict]:
        code = normalize_code(ticker)
        scale = PERIOD_TO_SCALE.get(period, 240)
        count = max(1, min(count, 800))
        if _market(code) in {"hk", "us"}:
            return await self._kline_yahoo(code, period, count)
        try:
            items = await self._kline_sina(code, scale, count)
            if items:
                return items
        except (httpx.HTTPError, ValueError):
            pass  # 降级到腾讯（仅日线）
        try:
            items = await self._kline_tencent(code, count)
            if items:
                return items
        except (httpx.HTTPError, ValueError):
            pass
        try:
            return await self._kline_yahoo(code, period, count)
        except (httpx.HTTPError, ValueError, MarketError) as exc:
            raise MarketError(f"无法获取 {ticker} 的 K 线") from exc

    async def _kline_sina(self, code: str, scale: int, count: int) -> list[dict]:
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
            }
            for it in data
            if it.get("day") and it.get("open")
        ]

    async def _kline_tencent(self, code: str, count: int) -> list[dict]:
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
            }
            for r in rows
            if len(r) >= 6
        ]

    async def _kline_yahoo(self, code: str, period: str, count: int) -> list[dict]:
        interval = {"1d": "1d", "60m": "60m", "30m": "30m", "15m": "15m", "5m": "5m"}.get(period, "1d")
        range_value = "5y" if interval == "1d" else "60d"
        payload = await self._yahoo_chart(_yahoo_symbol(code), range_value, interval)
        quote = ((payload.get("indicators") or {}).get("quote") or [{}])[0]
        rows = []
        for timestamp, open_, high, low, close, volume in zip(
            payload.get("timestamp") or [], quote.get("open") or [], quote.get("high") or [],
            quote.get("low") or [], quote.get("close") or [], quote.get("volume") or [],
        ):
            if None in (open_, high, low, close):
                continue
            rows.append({
                "day": datetime.fromtimestamp(timestamp, tz=UTC).strftime("%Y-%m-%d" if interval == "1d" else "%Y-%m-%d %H:%M"),
                "open": float(open_), "high": float(high), "low": float(low),
                "close": float(close), "volume": int(volume or 0),
            })
        if not rows:
            raise MarketError(f"无K线数据：{code}")
        return rows[-count:]

    async def _yahoo_chart(self, symbol: str, range_value: str, interval: str) -> dict:
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
                    return result[0]
            except (httpx.HTTPError, ValueError) as exc:
                last_error = exc
        raise MarketError(f"未找到股票代码：{symbol}") from last_error


def _number(value: object) -> float:
    try:
        return float(value) if value is not None else 0.0
    except (TypeError, ValueError):
        return 0.0


# ----------------------------------------------------------------------
# 解析函数（纯逻辑，便于单元测试）
# ------------------------------------------------------------------

_TENCENT_LINE = re.compile(r'^v_(sh|sz|hk|us)(\w+)="(.*)";?\s*$', re.M)


def parse_tencent_quotes(raw: str) -> list[dict]:
    results = []
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
                "amount": num(37),
                "change": change,
                "change_percent": num(32),
                "turnover_rate": num(38),
                "pe": num(39),
                "pb": num(46),
                "market_cap": num(45),
                "amplitude": num(43),
                "timestamp": int(num(30) or 0),
            }
        )
    return results


_SINA_LINE = re.compile(r'^var hq_str_(sh|sz|hk|us)(\w+)="(.*)";\s*$', re.M)


def parse_sina_quotes(raw: str) -> list[dict]:
    results = []
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
            }
        )
    return results
