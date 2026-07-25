"""股票代码解析：6位数字自动识别沪/深、港股4-5位加hk前缀、美股字母透传、名称搜索兜底。"""
import re

import httpx

from ..market_data import EASTMONEY_SEARCH

_HTTP_TIMEOUT = httpx.Timeout(10.0, connect=5.0)

# A股：6开头沪市，0/3开头深市
_SH_PREFIXES = ("6", "68")
_SZ_PREFIXES = ("0", "3")


def resolve_ticker(symbol: str) -> str:
    """将用户输入的股票代码/名称解析为标准 ticker 格式。

    规则：
    - 纯6位数字 → 6/68开头为 sh，0/3开头为 sz，其余默认 sh
    - 纯4-5位数字 → 港股，加 hk 前缀
    - 纯字母（1-5位）→ 美股，透传大写
    - 含非数字字母（非代码格式）→ 走名称搜索
    - 已有 sh/sz/hk/us 前缀 → 直接返回

    返回格式：sh600519 / sz000001 / hk00700 / AAPL
    """
    raw = symbol.strip()
    if not raw:
        raise ValueError("股票代码/名称不能为空")

    # 已有市场前缀
    if re.match(r"^(sh|sz|hk|us)", raw, re.I):
        return raw.lower()

    # 纯数字
    digits = re.sub(r"\D", "", raw)
    if digits and len(digits) == 6:
        return _detect_a_share(digits)

    if digits and 4 <= len(digits) <= 5:
        return f"hk{digits}"

    # 纯字母 → 美股
    if re.match(r"^[A-Za-z]{1,5}$", raw):
        return raw.upper()

    # 含中文或其他字符 → 名称搜索
    result = _search_name(raw)
    if result:
        return result
    raise ValueError(f"无法解析股票代码：{symbol}")


def _detect_a_share(digits: str) -> str:
    if digits.startswith(_SH_PREFIXES):
        return f"sh{digits}"
    if digits.startswith(_SZ_PREFIXES):
        return f"sz{digits}"
    return f"sh{digits}"


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
