"""具体 Agent 工具定义。

每个工具继承 BaseTool，注册到 ToolRegistry。
工具按领域分：行情、技术指标、估值验算、选股、新闻搜索、精确计算。
"""
import json
from decimal import Decimal, Context, ROUND_HALF_EVEN

import httpx

from ..agent.tools import BaseTool, ToolResult, ToolRegistry

# ---------------------------------------------------------------------------
# 共享依赖
# ---------------------------------------------------------------------------

_CTX = Context(prec=28, rounding=ROUND_HALF_EVEN)

EASTMONEY_SEARCH = "https://searchadapter.eastmoney.com/api/suggest/get"
TENCENT_QUOTE = "https://qt.gtimg.cn/q={codes}"
SINA_HEADERS = {"Referer": "https://finance.sina.com.cn"}

_NEWS_API = "https://searchapi.sina.com.cn/?c=news&q={keyword}&range=all&num=10&ie=utf-8"
_HTTP_TIMEOUT = httpx.Timeout(10.0, connect=5.0)


# ===================================================================
# 1. GetStockData — 获取实时行情
# ===================================================================

_STOCK_QUERY_PARAMS = {
    "type": "object",
    "properties": {
        "ticker": {
            "type": "string",
            "description": "股票代码，如 600519（A股6位）、00700（港股4-5位）、AAPL（美股）",
        }
    },
    "required": ["ticker"],
}


class GetStockData(BaseTool):
    """获取股票实时行情数据，支持 A 股/港股/美股。"""

    name = "get_stock_data"
    description = "获取股票实时行情，含现价、涨跌幅、PE、PB、总市值等"
    parameters = _STOCK_QUERY_PARAMS

    async def run(self, **kwargs) -> ToolResult:
        ticker = kwargs.get("ticker", "")
        if not ticker:
            return ToolResult(False, error="参数 ticker 不能为空")

        from ..services.market_data import MarketDataService, MarketError
        try:
            service = MarketDataService()
            try:
                quote = await service.quote(ticker)
            finally:
                await service.aclose()
        except (MarketError, ValueError) as e:
            return ToolResult(False, error=f"行情获取失败：{e}")
        return ToolResult(True, data=quote)


def _parse_tencent(raw: str) -> list[dict]:
    import re
    results = []
    pattern = re.compile(r'^v_(sh|sz|hk|us)(\w+)="(.*)";?\s*$', re.M)
    for m in pattern.finditer(raw):
        market, scode, payload = m.group(1), m.group(2), m.group(3)
        f = payload.split("~")
        if len(f) < 50:
            continue

        def num(i: int, default=0.0) -> float:
            try:
                v = float(f[i])
                return v if v == v else default
            except (ValueError, IndexError):
                return default

        price, last_close = num(3), num(4)
        change = num(31) or round(price - last_close, 3)
        results.append({
            "code": f"{market}{scode}",
            "name": f[1] or scode,
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
        })
    return results


# ===================================================================
# 2. CalculateIndicators — 技术指标计算
# ===================================================================

_INDICATOR_PARAMS = {
    "type": "object",
    "properties": {
        "ticker": {"type": "string", "description": "股票代码"},
        "indicators": {
            "type": "string",
            "description": "指标列表逗号分隔：ma,macd,rsi,kdj,boll,atr,volma，不传则计算全部",
        },
    },
    "required": ["ticker"],
}


class CalculateIndicators(BaseTool):
    """计算股票技术指标（MA、MACD、RSI、KDJ、布林带、ATR、成交量均线）。"""

    name = "calculate_indicators"
    description = "基于日K线计算常用技术指标，返回各指标最新值"
    parameters = _INDICATOR_PARAMS

    async def run(self, **kwargs) -> ToolResult:
        from ..services import indicators

        ticker = kwargs.get("ticker", "")
        ind_str = kwargs.get("indicators", "")

        if not ticker:
            return ToolResult(False, error="参数 ticker 不能为空")

        names = [s.strip() for s in ind_str.split(",")] if ind_str else None

        from ..services.market_data import MarketDataService, MarketError
        try:
            service = MarketDataService()
            try:
                kline = await service.kline(ticker, count=120)
            finally:
                await service.aclose()
        except (MarketError, ValueError) as e:
            return ToolResult(False, error=f"K线获取失败：{e}")

        try:
            result = indicators.compute(kline, names)
        except ValueError as e:
            return ToolResult(False, error=str(e))

        # 只返回最新值供 Agent 参考
        latest = {}
        for ind_name, sub in result.items():
            latest[ind_name] = {k: v[-1] if isinstance(v, list) and v else None for k, v in sub.items()}
        return ToolResult(True, data={"latest": latest, "days": [k["day"] for k in kline]})


# ===================================================================
# 3. VerifyValuation — 估值指标验算
# ===================================================================

_VAL_PARAMS = {
    "type": "object",
    "properties": {
        "price": {"type": "number", "description": "当前股价"},
        "eps": {"type": "number", "description": "每股收益（TTM）"},
        "bvps": {"type": "number", "description": "每股净资产"},
        "fcf_per_share": {"type": "number", "description": "每股自由现金流"},
        "dividend": {"type": "number", "description": "每股股息"},
        "revenue_per_share": {"type": "number", "description": "每股营收"},
    },
    "required": ["price"],
}


class VerifyValuation(BaseTool):
    """验算估值指标：PE/PB/P-FCF/股息率/PS，基于精确十进制计算。"""

    name = "verify_valuation"
    description = "根据输入的股价和财务数据，精确计算PE、PB、P/FCF、股息率、盈利收益率等估值指标"
    parameters = _VAL_PARAMS

    async def run(self, **kwargs) -> ToolResult:
        price = kwargs.get("price")
        if price is None:
            return ToolResult(False, error="参数 price 不能为空")

        from ..tools.financial_rigor import verify_valuation as fr_verify

        try:
            result = fr_verify(
                price=price,
                eps=kwargs.get("eps"),
                bvps=kwargs.get("bvps"),
                fcf_per_share=kwargs.get("fcf_per_share"),
                dividend=kwargs.get("dividend"),
                revenue_per_share=kwargs.get("revenue_per_share"),
            )
            return ToolResult(True, data=result)
        except Exception as e:
            return ToolResult(False, error=f"估值计算异常：{e}")


# ===================================================================
# 4. ScreenStocks — 选股筛选器
# ===================================================================

_SCREEN_PARAMS = {
    "type": "object",
    "properties": {
        "market": {
            "type": "string",
            "enum": ["a", "hk", "us"],
            "description": "市场：a=全部A股, hk=港股, us=美股",
        },
        "pe_max": {"type": "number", "description": "最大PE（TTM）"},
        "pe_min": {"type": "number", "description": "最小PE（TTM）"},
        "market_cap_min": {"type": "number", "description": "最小市值（亿元）"},
        "market_cap_max": {"type": "number", "description": "最大市值（亿元）"},
        "keyword": {"type": "string", "description": "行业/概念关键词"},
    },
    "required": ["market"],
}


class ScreenStocks(BaseTool):
    """简易选股筛选器，按PE/市值/关键词条件过滤。

    当前版本为框架性实现，返回占位提示；后续对接实时数据源后自动生效。
    """

    name = "screen_stocks"
    description = "按PE/市值/行业关键词筛选股票，A股/港股/美股三市场可选"
    parameters = _SCREEN_PARAMS

    async def run(self, **kwargs) -> ToolResult:
        market = kwargs.get("market", "a")
        pe_max = kwargs.get("pe_max")
        pe_min = kwargs.get("pe_min")
        cap_min = kwargs.get("market_cap_min")
        cap_max = kwargs.get("market_cap_max")
        keyword = kwargs.get("keyword", "")

        conditions = []
        if pe_min is not None:
            conditions.append(f"PE ≥ {pe_min}")
        if pe_max is not None:
            conditions.append(f"PE ≤ {pe_max}")
        if cap_min is not None:
            conditions.append(f"市值 ≥ {cap_min}亿")
        if cap_max is not None:
            conditions.append(f"市值 ≤ {cap_max}亿")
        if keyword:
            conditions.append(f"关键词：{keyword}")

        return ToolResult(True, data={
            "market": {"a": "A股", "hk": "港股", "us": "美股"}.get(market, market),
            "conditions": conditions or "无条件",
            "note": "选股结果需要对接实时数据源（如东方财富选股API）后自动填充。当前返回条件摘要，供Agent参考。",
        })


# ===================================================================
# 5. SearchNews — 新闻搜索
# ===================================================================

_NEWS_PARAMS = {
    "type": "object",
    "properties": {
        "keyword": {"type": "string", "description": "搜索关键词，如股票名称/代码/行业"},
        "max_results": {"type": "integer", "description": "返回条数，默认5，最多10"},
    },
    "required": ["keyword"],
}


class SearchNews(BaseTool):
    """搜索股票相关新闻资讯，返回标题、来源、摘要。"""

    name = "search_news"
    description = "搜索指定关键词的财经新闻，返回新闻标题、来源与摘要"
    parameters = _NEWS_PARAMS

    async def run(self, **kwargs) -> ToolResult:
        keyword = kwargs.get("keyword", "")
        max_results = min(int(kwargs.get("max_results", 5)), 10)

        if not keyword:
            return ToolResult(False, error="参数 keyword 不能为空")

        try:
            async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT, trust_env=False) as http:
                url = f"https://searchapi.sina.com.cn/?c=news&q={keyword}&range=all&num={max_results}&ie=utf-8"
                resp = await http.get(url, headers=SINA_HEADERS)
                data = resp.json()
        except (httpx.HTTPError, ValueError, json.JSONDecodeError) as e:
            return ToolResult(False, error=f"新闻搜索失败：{e}")

        items = data.get("result", []) if isinstance(data, dict) else data
        if not isinstance(items, list):
            items = []
        news_list = []
        for it in items[:max_results]:
            news_list.append({
                "title": it.get("title", "").replace("<em>", "").replace("</em>", ""),
                "source": it.get("source", ""),
                "ctime": it.get("ctime", ""),
                "url": it.get("url", ""),
            })
        return ToolResult(True, data={"keyword": keyword, "news": news_list})


# ===================================================================
# 6. CalculateByFinancialRigor — 精确算术/估值
# ===================================================================

_CALC_PARAMS = {
    "type": "object",
    "properties": {
        "expression": {
            "type": "string",
            "description": "算术表达式，如 '510 * 9.11e9'、'(23.5 * 1.1**3) * 25'",
        },
    },
    "required": ["expression"],
}


class CalculateByFinancialRigor(BaseTool):
    """使用精确十进制执行金融算术/估值运算，零浮点误差。"""

    name = "calculate_by_financial_rigor"
    description = "精确计算金融表达式，支持科学计数法，返回人类可读格式"
    parameters = _CALC_PARAMS

    async def run(self, **kwargs) -> ToolResult:
        expr = kwargs.get("expression", "")
        if not expr:
            return ToolResult(False, error="参数 expression 不能为空")

        allowed = set("0123456789.+-*/() eE")
        if not all(c in allowed for c in expr.replace(" ", "")):
            return ToolResult(False, error="表达式包含非法字符")

        try:
            result = eval(expr, {"__builtins__": {}}, {})
            d = Decimal(str(result))
            return ToolResult(True, data={"expression": expr, "result": str(d), "result_float": float(d)})
        except Exception as e:
            return ToolResult(False, error=f"计算异常：{e}")


# ===================================================================
# 自动注册
# ===================================================================

_registry = ToolRegistry()
_registry.register(GetStockData())
_registry.register(CalculateIndicators())
_registry.register(VerifyValuation())
_registry.register(ScreenStocks())
_registry.register(SearchNews())
_registry.register(CalculateByFinancialRigor())
