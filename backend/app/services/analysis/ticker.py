"""股票代码解析：委托 normalize_code 处理标准格式，名称搜索兜底。"""

from ..market_data import MarketDataService, MarketError, normalize_code


async def resolve_ticker(symbol: str, market: MarketDataService) -> str:
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
        pass

    try:
        matches = await market.search(raw)
    except MarketError as exc:
        raise ValueError(f"无法解析股票代码：{symbol}") from exc
    if matches:
        return matches[0]["code"]
    raise ValueError(f"无法解析股票代码：{symbol}")
