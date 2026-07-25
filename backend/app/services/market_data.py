"""行情数据服务：东方财富搜索 + 腾讯实时行情 + 新浪/腾讯 K 线。

移植自 Tech_Stock_Monitor 的 stockApi.ts，改为后端直连（解决跨域 + 支持缓存与 Agent 引用）。
降级策略：实时行情 腾讯 → 新浪；K 线 新浪 → 腾讯。单源失败自动切换（DATA-04）。
"""
import json
import re
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
    code = code.strip().lower()
    if re.match(r"^(sh|sz|hk|us)", code):
        return code
    return detect_market(code) + code


@dataclass
class MarketDataService:
    """可注入 httpx 客户端（测试时用 MockTransport）。"""

    http: httpx.AsyncClient = field(default=None)

    def __post_init__(self):
        if self.http is None:
            # trust_env=False：国内行情接口直连，绕过系统代理避免 TLS 超时/劫持
            self.http = httpx.AsyncClient(
                timeout=DEFAULT_TIMEOUT, follow_redirects=True, trust_env=False
            )

    async def aclose(self):
        await self.http.aclose()

    # ------------------------------------------------------------------
    # 搜索 — 东方财富
    # ------------------------------------------------------------------

    async def search(self, keyword: str) -> list[dict]:
        try:
            resp = await self.http.get(
                EASTMONEY_SEARCH,
                params={"input": keyword, "count": 10, "type": 14},
            )
            data = resp.json()
        except (httpx.HTTPError, ValueError) as e:
            raise MarketError(f"搜索失败：{e}") from e
        items = (data.get("QuotationCodeTable") or {}).get("Data") or []
        results = []
        for it in items:
            # 当前接口无 CodeType 字段；QuoteID 形如 "1.600519"（1=沪, 0=深）
            quote_id = str(it.get("QuoteID", ""))
            classify = it.get("Classify", "")
            if classify not in ("AStock", "ETF") or "." not in quote_id:
                continue
            results.append(
                {
                    "code": str(it.get("UnifiedCode") or it.get("Code", "")),
                    "name": it.get("Name", ""),
                    "market": "sh" if quote_id.startswith("1.") else "sz",
                    "type": it.get("SecurityTypeName") or ("ETF" if classify == "ETF" else "股票"),
                }
            )
        return results

    # ------------------------------------------------------------------
    # 实时行情 — 腾讯主源 / 新浪备源
    # ------------------------------------------------------------------

    async def quote(self, ticker: str) -> dict:
        code = normalize_code(ticker)
        try:
            quotes = await self._quotes_tencent([code])
            if quotes:
                return quotes[0]
        except (httpx.HTTPError, ValueError):
            pass  # 降级到新浪
        quotes = await self._quotes_sina([code])
        if not quotes:
            raise MarketError(f"无法获取 {ticker} 的行情（主备数据源均失败）")
        return quotes[0]

    async def quotes(self, tickers: list[str]) -> list[dict]:
        codes = [normalize_code(t) for t in tickers]
        try:
            return await self._quotes_tencent(codes)
        except (httpx.HTTPError, ValueError):
            return await self._quotes_sina(codes)

    async def _quotes_tencent(self, codes: list[str]) -> list[dict]:
        resp = await self.http.get(TENCENT_QUOTE.format(codes=",".join(codes)))
        text = resp.content.decode("gbk", "replace")
        return parse_tencent_quotes(text)

    async def _quotes_sina(self, codes: list[str]) -> list[dict]:
        resp = await self.http.get(SINA_QUOTE.format(codes=",".join(codes)), headers=SINA_HEADERS)
        text = resp.content.decode("gbk", "replace")
        return parse_sina_quotes(text)

    # ------------------------------------------------------------------
    # K 线 — 新浪主源 / 腾讯备源
    # ------------------------------------------------------------------

    async def kline(self, ticker: str, period: str = "1d", count: int = 100) -> list[dict]:
        code = normalize_code(ticker)
        scale = PERIOD_TO_SCALE.get(period, 240)
        count = max(1, min(count, 800))
        try:
            items = await self._kline_sina(code, scale, count)
            if items:
                return items
        except (httpx.HTTPError, ValueError):
            pass  # 降级到腾讯（仅日线）
        items = await self._kline_tencent(code, count)
        if not items:
            raise MarketError(f"无法获取 {ticker} 的 K 线（主备数据源均失败）")
        return items

    async def _kline_sina(self, code: str, scale: int, count: int) -> list[dict]:
        resp = await self.http.get(
            SINA_KLINE.format(code=code, scale=scale, count=count), headers=SINA_HEADERS
        )
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
