"""股票代码解析：委托 normalize_code 处理标准格式，名称搜索兜底。"""
import httpx

from ..market_data import EASTMONEY_SEARCH, normalize_code

_HTTP_TIMEOUT = httpx.Timeout(10.0, connect=5.0)


def resolve_ticker(symbol: str) -> str:
    """将用户输入的股票代码/名称解析为标准 ticker 格式。

    规则（由 normalize_code 实现）：
    - 已有 sh/sz/hk/us 前缀 → 验证并返回
    - 纯6位数字 → 6/68开头为 sh，0/3开头为 sz
    - 纯4-5位数字 → 港股，加 hk 前缀
    - 带 .HK/.SS/.SZ 后缀 → 解析并返回
    - 纯字母数字（1-15位）→ 美股，加 us 前缀
    - 以上均不匹配 → 走东方财富名称搜索兜底

    返回格式：sh600519 / sz000001 / hk00700 / usAAPL
    """
    raw = symbol.strip()
    if not raw:
        raise ValueError("股票代码/名称不能为空")

    try:
        return normalize_code(raw)
    except ValueError:
        result = _search_name(raw)
        if result:
            return result
        raise ValueError(f"无法解析股票代码：{symbol}")


def _search_name(keyword: str) -> str | None:
    """通过东方财富搜索接口，按名称查找股票代码。"""
    try:
        resp = httpx.get(
            EASTMONEY_SEARCH,
            params={"input": keyword, "count": 5, "type": 14},
            timeout=_HTTP_TIMEOUT,
        )
        data = resp.json()
    except (httpx.HTTPError, ValueError):
        return None

    items = (data.get("QuotationCodeTable") or {}).get("Data") or []
    for it in items:
        quote_id = str(it.get("QuoteID", ""))
        classify = it.get("Classify", "")
        if classify not in ("AStock", "ETF") or "." not in quote_id:
            continue
        code = str(it.get("UnifiedCode") or it.get("Code", ""))
        market = "sh" if quote_id.startswith("1.") else "sz"
        return f"{market}{code}"
    return None
