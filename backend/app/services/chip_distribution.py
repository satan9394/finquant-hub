"""Real A-share chip-distribution data backed by AkShare/Eastmoney."""
from __future__ import annotations

import asyncio
import importlib
import math
from datetime import date
from typing import Any, cast

from .instruments import external_symbol
from .market_data import normalize_code


class ChipDistributionUnavailable(RuntimeError):
    """Raised when the external chip-distribution provider cannot serve data."""


def _load_records(symbol: str, adjustment: str) -> list[dict[str, Any]]:
    akshare = importlib.import_module("akshare")
    frame = akshare.stock_cyq_em(symbol=symbol, adjust=adjustment)
    return cast(list[dict[str, Any]], frame.to_dict(orient="records"))


def _number(value: object, field: str) -> float:
    try:
        number = float(cast(Any, value))
    except (TypeError, ValueError) as exc:
        raise ChipDistributionUnavailable(f"筹码分布字段 {field} 无效") from exc
    if not math.isfinite(number):
        raise ChipDistributionUnavailable(f"筹码分布字段 {field} 无效")
    return number


def _ratio(value: object, field: str) -> float:
    number = _number(value, field)
    if not 0 <= number <= 1:
        raise ChipDistributionUnavailable(f"筹码分布字段 {field} 超出 0-1 范围")
    return number


def _cost(value: object, field: str) -> float:
    number = _number(value, field)
    if number <= 0:
        raise ChipDistributionUnavailable(f"筹码分布字段 {field} 必须为正数")
    return number


def _normalize_row(row: dict[str, Any]) -> dict[str, Any]:
    required = {
        "日期", "获利比例", "平均成本", "90成本-低", "90成本-高", "90集中度",
        "70成本-低", "70成本-高", "70集中度",
    }
    if missing := required - row.keys():
        raise ChipDistributionUnavailable(f"筹码分布缺少字段: {', '.join(sorted(missing))}")
    as_of = str(row["日期"])[:10]
    try:
        date.fromisoformat(as_of)
    except ValueError as exc:
        raise ChipDistributionUnavailable("筹码分布日期无效") from exc
    cost_90_low = _cost(row["90成本-低"], "90成本-低")
    cost_90_high = _cost(row["90成本-高"], "90成本-高")
    cost_70_low = _cost(row["70成本-低"], "70成本-低")
    cost_70_high = _cost(row["70成本-高"], "70成本-高")
    if cost_90_low > cost_90_high or cost_70_low > cost_70_high:
        raise ChipDistributionUnavailable("筹码分布成本区间上下界颠倒")
    return {
        "date": as_of,
        "profit_ratio": _ratio(row["获利比例"], "获利比例"),
        "average_cost": _cost(row["平均成本"], "平均成本"),
        "cost_90": {
            "low": cost_90_low,
            "high": cost_90_high,
            "concentration": _ratio(row["90集中度"], "90集中度"),
        },
        "cost_70": {
            "low": cost_70_low,
            "high": cost_70_high,
            "concentration": _ratio(row["70集中度"], "70集中度"),
        },
        # ponytail: AkShare does not expose a defensible peak field; unknown is safer than inference.
        "chip_peak": None,
    }


async def fetch_chip_distribution(symbol: str, adjustment: str = "qfq") -> dict[str, Any]:
    normalized = normalize_code(symbol)
    if not normalized.startswith(("sh", "sz")):
        raise ValueError("筹码分布目前仅支持 A 股")
    if adjustment not in {"", "qfq", "hfq"}:
        raise ValueError("复权方式仅支持空值、qfq 或 hfq")

    try:
        records = await asyncio.to_thread(_load_records, normalized[2:], adjustment)
    except ChipDistributionUnavailable:
        raise
    except Exception as exc:
        raise ChipDistributionUnavailable("AkShare/东方财富筹码分布暂时不可用") from exc
    if not records:
        raise ChipDistributionUnavailable("AkShare/东方财富未返回筹码分布")

    items = sorted((_normalize_row(row) for row in records), key=lambda item: item["date"])
    latest = items[-1]
    return {
        "symbol": external_symbol(normalized),
        "provider": "akshare.stock_cyq_em",
        "source": "eastmoney.kline",
        "as_of": latest["date"],
        "timezone": "Asia/Shanghai",
        "currency": "CNY",
        "adjustment": adjustment or "none",
        "frequency": "daily",
        "methodology": "akshare_cyq_calculator_120_day_turnover_decay",
        "quality_flags": [
            "derived_from_price_volume_turnover",
            "chip_peak_not_exposed_by_provider",
        ],
        "latest": latest,
        "items": items,
    }
