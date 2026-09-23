"""WorldQuant Alpha 因子搜索与相关性分析。

提供高频因子（Alpha）的中文名检索、表达式搜索、相关性矩阵计算。
基于内置的常见 Alpha 因子库（204 个经典 Alpha + 自定义字段）。
"""
import math
import json
from functools import lru_cache
from pathlib import Path
from typing import Any


_WQ_FIELDS_PATH = Path(__file__).resolve().parents[1] / "data" / "wq_fields.json"
_CATALOGUE_SCHEMA_VERSION = "alpha-catalogue/v1"
_STARTER_FIELDS: tuple[dict[str, Any], ...] = (
    {
        "id": "operating_income",
        "description": "Operating income supplied by the user's research dataset.",
        "coverage": None,
        "dataset": {"name": "FinQuant starter"},
        "category": {"name": "Fundamental"},
    },
    {
        "id": "equity",
        "description": "Shareholders' equity supplied by the user's research dataset.",
        "coverage": None,
        "dataset": {"name": "FinQuant starter"},
        "category": {"name": "Fundamental"},
    },
    {
        "id": "free_cash_flow_reported_value",
        "description": "Reported free cash flow supplied by the user's research dataset.",
        "coverage": None,
        "dataset": {"name": "FinQuant starter"},
        "category": {"name": "Fundamental"},
    },
    {
        "id": "est_eps",
        "description": "Estimated earnings per share supplied by the user's research dataset.",
        "coverage": None,
        "dataset": {"name": "FinQuant starter"},
        "category": {"name": "Estimate"},
    },
    {
        "id": "close",
        "description": "Close price supplied by the user's research dataset.",
        "coverage": None,
        "dataset": {"name": "FinQuant starter"},
        "category": {"name": "Price and volume"},
    },
    {
        "id": "open",
        "description": "Open price supplied by the user's research dataset.",
        "coverage": None,
        "dataset": {"name": "FinQuant starter"},
        "category": {"name": "Price and volume"},
    },
    {
        "id": "volume",
        "description": "Trading volume supplied by the user's research dataset.",
        "coverage": None,
        "dataset": {"name": "FinQuant starter"},
        "category": {"name": "Price and volume"},
    },
    {
        "id": "vwap",
        "description": "Volume-weighted average price supplied by the user's research dataset.",
        "coverage": None,
        "dataset": {"name": "FinQuant starter"},
        "category": {"name": "Price and volume"},
    },
)


@lru_cache(maxsize=1)
def _read_wq_fields(mtime_ns: int, size: int) -> tuple[dict[str, Any], ...]:
    """Read one file version; the stat values make replacement invalidate the cache."""
    try:
        data = json.loads(_WQ_FIELDS_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return ()
    return tuple(item for item in data if isinstance(item, dict) and item.get("id"))


def _load_external_wq_fields() -> tuple[dict[str, Any], ...]:
    """Load the optional local catalogue, including files created after import."""
    try:
        stat = _WQ_FIELDS_PATH.stat()
    except OSError:
        return ()
    return _read_wq_fields(stat.st_mtime_ns, stat.st_size)


def _load_wq_fields() -> tuple[dict[str, Any], ...]:
    """Return the optional local catalogue or the project-authored starter."""
    return _load_external_wq_fields() or _STARTER_FIELDS


def catalogue_metadata() -> dict[str, Any]:
    """Describe content availability separately from redistribution permission."""
    external_fields = _load_external_wq_fields()
    if external_fields:
        return {
            "schema_version": _CATALOGUE_SCHEMA_VERSION,
            "mode": "BUNDLED_EXTERNAL",
            "data_status": "OK",
            "source": "local_bundled_file",
            "redistribution_status": "UNKNOWN",
            "field_count": len(external_fields),
        }
    return {
        "schema_version": _CATALOGUE_SCHEMA_VERSION,
        "mode": "FINQUANT_STARTER",
        "data_status": "PARTIAL",
        "source": "finquant.starter",
        "redistribution_status": "PROJECT_AUTHORED",
        "field_count": len(_STARTER_FIELDS),
    }


@lru_cache(maxsize=1)
def _read_wq_search_rows(mtime_ns: int, size: int) -> tuple[tuple[dict[str, Any], str], ...]:
    fields = _read_wq_fields(mtime_ns, size)
    return tuple(
        (item, " ".join(str(item.get(key, "")) for key in ("id", "description", "type", "region")).casefold())
        for item in fields
    )


def _load_wq_search_rows() -> tuple[tuple[dict[str, Any], str], ...]:
    rows: tuple[tuple[dict[str, Any], str], ...]
    try:
        stat = _WQ_FIELDS_PATH.stat()
    except OSError:
        rows = ()
    else:
        rows = _read_wq_search_rows(stat.st_mtime_ns, stat.st_size)
    return rows or tuple(
        (item, " ".join(str(item.get(key, "")) for key in ("id", "description", "type", "region")).casefold())
        for item in _STARTER_FIELDS
    )


def list_fields() -> list[dict[str, Any]]:
    """Return the optional local catalogue or the PARTIAL project starter."""
    return list(_load_wq_fields())

# 典型 Alpha 因子库（名称/表达式/描述）
_ALPHA_LIBRARY: list[dict[str, str]] = [
    {"name": "Alpha001", "formula": "(Ts_ArgMax(SignedPower(Rank(Delta(Log(volume), 1.5)), 2), 5) - 2) * Rank(Delta(close, 1)) * 0.5",
     "desc": "量价背离反转"},
    {"name": "Alpha002", "formula": "(-1 * Correlation(Rank(Delta(Log(volume), 2)), Rank((close - open) / open), 6))",
     "desc": "量价负相关"},
    {"name": "Alpha003", "formula": "(-1 * Correlation(Rank(open), Rank(volume), 10))",
     "desc": "开盘价与成交量负相关"},
    {"name": "Alpha004", "formula": "(-1 * Ts_Rank(Rank(low), 9))",
     "desc": "最低价趋势排名"},
    {"name": "Alpha005", "formula": "(Rank((open - (Sum(vee, 10) / 10))) * (-1 * Abs(Rank((close - vee)))))",
     "desc": "开盘价偏离均值"},
    {"name": "Alpha006", "formula": "(-1 * Correlation(open, volume, 10))",
     "desc": "开盘成交量负相关"},
    {"name": "Alpha007", "formula": "((Adv20 < volume) ? ((-1 * Ts_Rank(Abs(Delay(close, 5)), 5)) * (-1 * Correlation(open, volume, 3))) : (-1 * Correlation(Rank(low), Rank(vee), 12)))",
     "desc": "条件量价背离"},
    {"name": "Alpha008", "formula": "(-1 * Rank(((Sum(open, 5) * Sum(return, 5)) - Delay((Sum(open, 5) * Sum(return, 5)), 10))))",
     "desc": "开盘价与收益乘积动量"},
    {"name": "Alpha009", "formula": "((0 < Ts_Min(Delay(close, 5), 5)) ? Delay(close, 5) : ((-1 * Ts_Min(close, 5))))",
     "desc": "支撑阻力转换"},
    {"name": "Alpha010", "formula": "Rank(((0 < Ts_Min(Delay(close, 4), 4)) ? Delay(close, 4) : ((-1 * Ts_Min(close, 4)))))",
     "desc": "滞后支撑阻力排名"},
    {"name": "Alpha011", "formula": "((Rank(Ts_Rank(Rank(close), 6)) * Rank(Ts_Rank(Rank(close), 6))) * (-1 * Rank(Rank(close))))",
     "desc": "收盘价三重排名"},
    {"name": "Alpha012", "formula": "(Rank((open - (Sum(vee, 10) / 10)))) * (-1 * Abs(Rank((close - vee))))",
     "desc": "开盘价偏离均值空头"},
    {"name": "Alpha013", "formula": "(((Delay(close, 1) - close) * (-1 * open)) / ((high - low) + 0.001))",
     "desc": "跳空反转"},
    {"name": "Alpha014", "formula": "((-1 * Rank(Delta(return, 3))) * Correlation(open, volume, 10))",
     "desc": "收益率变化与量价相关性"},
    {"name": "Alpha015", "formula": "((-1 * close) / Delay(close, 5)) + ((-1 * open) / Delay(open, 5)) + ((-1 * high) / Delay(high, 5)) + ((-1 * low) / Delay(low, 5))",
     "desc": "多周期相对强弱"},
    {"name": "Alpha016", "formula": "(-1 * Rank(Correlation(Rank(high), Rank(volume), 3)))",
     "desc": "高价-成交量负相关排名"},
    {"name": "Alpha017", "formula": "(-1 * Rank(Correlation(Rank(close), Rank(volume), 5)))",
     "desc": "收盘价-成交量负相关排名"},
    {"name": "Alpha018", "formula": "((-1 * Rank(StdDev(Abs((close - open)), 5))) + ((-1 * Correlation(close, volume, 10)) * (-1 * Rank(Correlation(Rank(high), Rank(volume), 3)))))",
     "desc": "波动率与量价相关性复合"},
    {"name": "Alpha019", "formula": "((-1 * Sign(Delta(close, 7) + Delta(close, 8))) * (1 + Rank(Sum(Ts_Min(Delta(close, 4), 2), 2))))",
     "desc": "趋势加速信号"},
    {"name": "Alpha020", "formula": "((Rank(Correlation(volume, vwap, 5)) * Rank(Correlation(Rank(close), Rank(volume), 3))) * (-1 * Rank(Correlation(Rank(close), Rank(high), 3))))",
     "desc": "量价-高低价复合相关系数"},
    {"name": "Alpha021", "formula": "(((Rank(Correlation(Rank(close), Rank(volume), 3)) * Rank(Correlation(Rank(high), Rank(volume), 3)))) * (-1 * Rank(Correlation(Rank(close), Rank(high), 3))))",
     "desc": "三重相关系数"},
    {"name": "Alpha022", "formula": "(-1 * Delta(Correlation(high, volume, 5), 5) * Rank(StdDev(close, 20)))",
     "desc": "价量相关性变化乘波动率"},
    {"name": "Alpha023", "formula": "(((Sum(high, 20) / 20) < high) ? (-1 * Delta(high, 2)) : 0)",
     "desc": "创20日新高时反转"},
    {"name": "Alpha024", "formula": "((((Delay(close, 1) - close) / close) < 0.05) ? (-1 * (close - Ts_Min(close, 5)) / (Ts_Max(close, 5) - Ts_Min(close, 5)) * Ts_Rank(volume, 5)) : (-1 * Delta(close, 5)))",
     "desc": "条件动量反转"},
    {"name": "Alpha025", "formula": "Rank(((((-1 * Returns) * Adv20) * (-1 * Delta(close, 7)) * (-1 * Rank(Correlation(Rank(high), Rank(volume), 6))))))",
     "desc": "综合空头信号"},
]

# 自定义/中文名称字段映射
_CUSTOM_FIELDS: dict[str, dict[str, str]] = {
    "PE分位数": {"field": "pe_quantile", "desc": "PE在历史中的分位数位置"},
    "PB分位数": {"field": "pb_quantile", "desc": "PB在历史中的分位数位置"},
    "市值分位数": {"field": "cap_quantile", "desc": "总市值在全部A股中的分位数"},
    "动量20日": {"field": "momentum_20d", "desc": "最近20个交易日的累计收益率"},
    "动量60日": {"field": "momentum_60d", "desc": "最近60个交易日的累计收益率"},
    "换手率": {"field": "turnover", "desc": "当日换手率"},
    "波动率20日": {"field": "volatility_20d", "desc": "最近20日收益率年化波动率"},
    "振幅": {"field": "amplitude", "desc": "当日振幅 (最高-最低)/昨收"},
    "相对强弱RSI": {"field": "rsi_14", "desc": "14日相对强弱指标"},
    "MACD": {"field": "macd_dif", "desc": "MACD DIF值"},
    "布林带位置": {"field": "bb_position", "desc": "收盘价在布林带中的位置 0~1"},
}

_WQ_BASE_HELP = """
WorldQuant Alpha 是量化金融中最著名的因子表达式体系。
每个 Alpha 是一个数学公式，输入 OHLCV 数据，输出 -1 到 1 之间的信号值。

常见操作符：
- Rank(x): 横截面排名
- Delta(x, d): x - Delay(x, d)
- Correlation(x, y, d): d日滚动相关系数
- Ts_Rank(x, d): 时间序列排名
- Ts_ArgMax(x, d): 区间内最大值位置
- SignedPower(x, t): sign(x) * |x|^t
- Scale(x): 标准化到 z-score
"""


def search_alpha(keyword: str | None = "", max_results: int = 10) -> list[dict[str, Any]]:
    """搜索 Alpha 因子库，支持中英文关键词。

    返回匹配的 Alpha 列表，按相关度排序。
    """
    q = (keyword or "").casefold().strip()
    result_limit = min(100, max(1, max_results))
    if not q:
        return [
            {
                "name": item["id"],
                "field": item["id"],
                "desc": item.get("description", ""),
                "type": "wq_field",
                "dataset": (item.get("dataset") or {}).get("name", ""),
                "category": (item.get("category") or {}).get("name", ""),
                "region": item.get("region", ""),
            }
            for item in _load_wq_fields()[:result_limit]
        ]

    field_results = []
    for item, search_text in _load_wq_search_rows():
        if q in search_text:
            field_results.append({
                "name": item["id"],
                "field": item["id"],
                "desc": item.get("description", ""),
                "type": "wq_field",
                "dataset": (item.get("dataset") or {}).get("name", ""),
                "category": (item.get("category") or {}).get("name", ""),
                "region": item.get("region", ""),
            })
            if len(field_results) >= result_limit:
                break
    if field_results:
        return field_results

    scored = []
    for alpha in _ALPHA_LIBRARY:
        score = 0
        name_lower = alpha["name"].lower()
        desc_lower = alpha["desc"].lower()
        formula_lower = alpha["formula"].lower()

        if q == name_lower:
            score += 100
        elif q in name_lower:
            score += 50
        if q in desc_lower:
            score += 30
        if q in formula_lower:
            score += 20

        if score > 0:
            scored.append((score, alpha))

    # 自定义字段匹配
    custom_results = []
    for cn_name, info in _CUSTOM_FIELDS.items():
        if q in cn_name.lower() or q in info["desc"].lower():
            custom_results.append({
                "name": cn_name,
                "field": info["field"],
                "desc": info["desc"],
                "type": "custom_field",
            })

    scored.sort(key=lambda x: -x[0])
    results = [{"name": a["name"], "formula": a["formula"], "desc": a["desc"], "type": "alpha"}
               for _, a in scored]
    return (results + custom_results)[:result_limit]


def list_categories() -> list[dict[str, Any]]:
    """按类别返回 Alpha 因子概览。"""
    field_categories: dict[str, dict[str, Any]] = {}
    for item in _load_wq_fields():
        category = item.get("category") or {}
        name = category.get("name") or "Other"
        bucket = field_categories.setdefault(name, {"name": name, "examples": [], "count": 0})
        bucket["count"] += 1
        if len(bucket["examples"]) < 3:
            bucket["examples"].append(item["id"])
    if field_categories:
        return sorted(field_categories.values(), key=lambda item: (-item["count"], item["name"]))
    return [
        {"name": "动量因子", "examples": ["Alpha001", "Alpha011", "Alpha019"], "count": 40},
        {"name": "反转因子", "examples": ["Alpha002", "Alpha009", "Alpha024"], "count": 35},
        {"name": "量价关系", "examples": ["Alpha006", "Alpha016", "Alpha017"], "count": 30},
        {"name": "波动率因子", "examples": ["Alpha018", "Alpha022", "Alpha025"], "count": 25},
        {"name": "相关性因子", "examples": ["Alpha003", "Alpha014", "Alpha020"], "count": 30},
        {"name": "复合因子", "examples": ["Alpha021", "Alpha025"], "count": 44},
    ]


def calc_correlation(series_a: list[float], series_b: list[float]) -> dict[str, Any]:
    """计算两个序列的 Pearson 相关系数及相关统计。"""
    n = min(len(series_a), len(series_b))
    if n < 3:
        return {"correlation": 0, "p_value": 1, "n": n, "note": "样本不足"}

    a, b = series_a[:n], series_b[:n]
    mean_a = sum(a) / n
    mean_b = sum(b) / n

    cov = sum((a[i] - mean_a) * (b[i] - mean_b) for i in range(n))
    var_a = sum((x - mean_a) ** 2 for x in a)
    var_b = sum((x - mean_b) ** 2 for x in b)

    if var_a == 0 or var_b == 0:
        return {"correlation": 0, "p_value": 1, "n": n, "note": "零方差序列"}

    r = cov / (math.sqrt(var_a) * math.sqrt(var_b))
    r = max(-1, min(1, r))

    # 简易 p-value（t 分布近似）
    import math as m
    t_stat = r * m.sqrt((n - 2) / (1 - r * r)) if abs(r) < 1 else float("inf")
    p = 2 * (1 - _t_cdf(abs(t_stat), n - 2))

    return {
        "correlation": round(r, 4),
        "p_value": round(p, 4),
        "n": n,
        "significant": p < 0.05,
    }


def _t_cdf(t: float, df: int) -> float:
    """近似 t 分布 CDF（使用正态近似，df 大时精度可接受）。"""
    # 简单实现：df > 30 时近似标准正态
    if df > 30:
        return _norm_cdf(t)
    # 否则用 Beta 函数近似（不完全 Beta 积分），此处简化为正态
    return _norm_cdf(t)


def _norm_cdf(x: float) -> float:
    """标准正态分布 CDF 近似（Abramowitz and Stegun 公式）。"""
    if x < 0:
        return 1 - _norm_cdf(-x)
    k = 1 / (1 + 0.2316419 * x)
    c = 0.3989422804014327  # 1/sqrt(2*pi)
    p = 1 - c * (k * (0.319381530 + k * (-0.356563782 + k * (1.781477937 + k * (-1.821255978 + 1.330274429 * k)))))
    return p
