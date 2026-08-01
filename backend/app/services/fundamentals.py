"""Optional A-share fundamentals adapters with normalized point-in-time output."""
from __future__ import annotations

import asyncio
import importlib.util
import math
import os
import re
from abc import ABC, abstractmethod

from .market_data import normalize_code

_ALIASES = {
    "total_revenue": ("营业总收入", "营业收入", "主营业务收入", "total_revenue", "revenue"),
    "net_income": ("归属于母公司所有者的净利润", "归母净利润", "净利润", "n_income_attr_p", "n_income"),
    "operating_cash_flow": (
        "经营活动产生的现金流量净额", "经营现金流量净额", "经营现金流", "n_cashflow_act",
    ),
    "free_cash_flow": ("自由现金流", "free_cash_flow"),
    "total_assets": ("资产总计", "总资产", "total_assets"),
    "total_liabilities": ("负债合计", "总负债", "total_liab"),
    "shareholders_equity": (
        "归属于母公司股东权益合计", "股东权益合计", "所有者权益合计", "total_hldr_eqy_exc_min_int",
    ),
    "eps": ("基本每股收益", "每股收益", "eps"),
    "roe": ("净资产收益率", "roe"),
    "gross_margin": ("销售毛利率", "毛利率", "grossprofit_margin"),
    "net_profit_margin": ("销售净利率", "净利率", "netprofit_margin"),
    "debt_to_assets": ("资产负债率", "debt_to_assets"),
    "current_ratio": ("流动比率", "current_ratio"),
    "revenue_growth": ("营业总收入同比增长", "营业收入同比增长", "tr_yoy"),
    "net_income_growth": ("净利润同比增长", "netprofit_yoy"),
}
_DATE_KEYS = ("报告期", "截止日期", "end_date", "ann_date")
_MONETARY_METRICS = {
    "total_revenue", "net_income", "operating_cash_flow", "free_cash_flow",
    "total_assets", "total_liabilities", "shareholders_equity",
}


def _number(value: object) -> float | None:
    if value is None:
        return None
    text = str(value).strip().replace(",", "")
    if not text or text.lower() in {"nan", "none", "--", "-"}:
        return None
    multiplier = 1.0
    for suffix, factor in (("万亿", 1e12), ("亿", 1e8), ("万", 1e4)):
        if suffix in text:
            multiplier = factor
            text = text.replace(suffix, "")
            break
    text = text.replace("元", "").replace("%", "")
    match = re.search(r"[-+]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?", text)
    if not match:
        return None
    number = float(match.group()) * multiplier
    return number if math.isfinite(number) else None


def _as_of(record: dict) -> str | None:
    for key in _DATE_KEYS:
        if record.get(key) not in (None, ""):
            value = str(record[key]).strip()
            if len(value) == 8 and value.isdigit():
                return f"{value[:4]}-{value[4:6]}-{value[6:]}"
            return value[:10]
    return None


def normalize_fundamental_record(record: dict, provider: str) -> list[dict]:
    lowered = {str(key).strip().lower(): value for key, value in record.items()}
    items = []
    for metric, aliases in _ALIASES.items():
        normalized_aliases = {alias.lower() for alias in aliases}
        raw = next((value for key, value in lowered.items() if key in normalized_aliases), None)
        if raw is None:
            # Some providers append units to the column name, for example
            # ``营业总收入(元)``.  Keep fuzzy matching as a narrow fallback and
            # never let a growth column masquerade as the absolute metric.
            raw = next((
                value
                for key, value in lowered.items()
                if not any(marker in key for marker in ("增长", "同比", "yoy"))
                and any(alias.lower() in key for alias in aliases)
            ), None)
        value = _number(raw)
        if value is None:
            continue
        items.append({
            "metric": metric,
            "value": value,
            "as_of": _as_of(record),
            "currency": "CNY" if metric == "eps" or metric in _MONETARY_METRICS else None,
            "period_type": "reported",
            "provider": provider,
        })
    return items


class FundamentalsAdapter(ABC):
    name = ""

    @abstractmethod
    def is_available(self) -> bool: ...

    @abstractmethod
    async def fetch(self, symbol: str) -> list[dict]: ...


class AkshareFundamentalsAdapter(FundamentalsAdapter):
    name = "akshare"

    def is_available(self) -> bool:
        return importlib.util.find_spec("akshare") is not None

    async def fetch(self, symbol: str) -> list[dict]:
        code = normalize_code(symbol)[2:]

        def load() -> list[dict]:
            import akshare as ak

            frame = ak.stock_financial_abstract_ths(symbol=code, indicator="按报告期")
            return [] if frame is None else frame.to_dict("records")

        records = await asyncio.to_thread(load)
        latest = max(records, key=lambda item: _as_of(item) or "", default=None)
        return normalize_fundamental_record(latest, self.name) if latest else []


class TushareFundamentalsAdapter(FundamentalsAdapter):
    name = "tushare"

    def is_available(self) -> bool:
        return bool(os.getenv("TUSHARE_TOKEN", "").strip()) and importlib.util.find_spec("tushare") is not None

    async def fetch(self, symbol: str) -> list[dict]:
        normalized = normalize_code(symbol)
        suffix = "SH" if normalized.startswith("sh") else "SZ"

        def load() -> list[dict]:
            import tushare as ts

            pro = ts.pro_api(os.environ["TUSHARE_TOKEN"])
            ts_code = f"{normalized[2:]}.{suffix}"
            items: list[dict] = []
            errors: list[Exception] = []
            for endpoint in ("fina_indicator", "income", "cashflow", "balancesheet"):
                try:
                    frame = getattr(pro, endpoint)(ts_code=ts_code)
                except Exception as exc:
                    # Tushare permissions differ by endpoint.  Preserve any
                    # data already obtained and let the outer fallback run only
                    # when every endpoint failed.
                    errors.append(exc)
                    continue
                records = [] if frame is None else frame.to_dict("records")
                latest = max(records, key=lambda item: _as_of(item) or "", default=None)
                if latest:
                    items.extend(normalize_fundamental_record(latest, self.name))
            if not items and errors:
                raise errors[-1]
            deduplicated: dict[str, dict] = {}
            for item in items:
                deduplicated.setdefault(item["metric"], item)
            return list(deduplicated.values())

        return await asyncio.to_thread(load)


async def fetch_cn_fundamentals(
    symbol: str,
    adapters: tuple[FundamentalsAdapter, ...] | None = None,
) -> list[dict]:
    """Use the first configured, available provider that returns point-in-time data."""
    selected = adapters or (AkshareFundamentalsAdapter(), TushareFundamentalsAdapter())
    errors = []
    for adapter in selected:
        if not adapter.is_available():
            continue
        try:
            items = await adapter.fetch(symbol)
        except Exception as exc:
            errors.append(f"{adapter.name}:{type(exc).__name__}")
            continue
        if items:
            return items
    if errors:
        raise RuntimeError("A 股基本面数据源失败：" + ", ".join(errors))
    return []
