"""A-share fundamentals adapters with period-safe TTM and field provenance."""
from __future__ import annotations

import asyncio
import importlib
import importlib.util
import math
import os
import re
from abc import ABC, abstractmethod
from collections.abc import Iterable
from typing import Any, cast

from .market_data import normalize_code

JSONDict = dict[str, Any]

_ALIASES = {
    "total_revenue": ("营业总收入", "营业收入", "主营业务收入", "total_revenue", "revenue"),
    "net_income": ("归属于母公司所有者的净利润", "归母净利润", "净利润", "n_income_attr_p", "n_income"),
    "operating_cash_flow": (
        "经营活动产生的现金流量净额", "经营现金流量净额", "经营现金流", "n_cashflow_act",
    ),
    "free_cash_flow": ("自由现金流", "free_cash_flow"),
    "gross_profit": ("毛利润", "gross_profit"),
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
    "roic": ("投入资本回报率", "投入资本收益率", "roic"),
    "roa": ("总资产收益率", "资产回报率", "roa"),
    "quick_ratio": ("速动比率", "quick_ratio"),
    "interest_coverage": ("利息保障倍数", "ebit_to_interest", "interest_coverage"),
}
_DATE_KEYS = ("报告期", "截止日期", "报告日", "end_date", "ann_date")
_FLOW_METRICS = {"total_revenue", "net_income", "gross_profit", "operating_cash_flow", "free_cash_flow"}
_MONETARY_METRICS = _FLOW_METRICS | {
    "total_assets", "total_liabilities", "shareholders_equity",
}
_YAHOO_QUARTERLY = {
    "quarterlyTotalRevenue": "total_revenue",
    "quarterlyOperatingRevenue": "total_revenue",
    "quarterlyNetIncome": "net_income",
    "quarterlyNetIncomeCommonStockholders": "net_income",
    "quarterlyGrossProfit": "gross_profit",
    "quarterlyOperatingCashFlow": "operating_cash_flow",
    "quarterlyFreeCashFlow": "free_cash_flow",
}
_YAHOO_ANNUAL = {
    "annualTotalRevenue": "total_revenue",
    "annualOperatingRevenue": "total_revenue",
    "annualNetIncome": "net_income",
    "annualNetIncomeCommonStockholders": "net_income",
    "annualGrossProfit": "gross_profit",
    "annualOperatingCashFlow": "operating_cash_flow",
    "annualFreeCashFlow": "free_cash_flow",
}
_YAHOO_TRAILING = {
    "trailingTotalRevenue": "total_revenue",
    "trailingOperatingRevenue": "total_revenue",
    "trailingNetIncome": "net_income",
    "trailingNetIncomeCommonStockholders": "net_income",
    "trailingGrossProfit": "gross_profit",
    "trailingOperatingCashFlow": "operating_cash_flow",
    "trailingFreeCashFlow": "free_cash_flow",
}
_YAHOO_POINT = {
    "trailingMarketCap": "market_cap",
    "trailingPeRatio": "pe_ratio",
    "trailingPbRatio": "pb_ratio",
    "trailingEps": "eps",
    "quarterlyTotalAssets": "total_assets",
    "quarterlyTotalLiabilitiesNetMinorityInterest": "total_liabilities",
    "quarterlyStockholdersEquity": "shareholders_equity",
}


def _number(value: object) -> float | None:
    if value is None or isinstance(value, bool):
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


def _as_of(record: JSONDict) -> str | None:
    for key in _DATE_KEYS:
        if record.get(key) not in (None, ""):
            value = str(record[key]).strip()
            if len(value) == 8 and value.isdigit():
                return f"{value[:4]}-{value[4:6]}-{value[6:]}"
            return value[:10]
    return None


def _quarter_index(value: str | None) -> int | None:
    if not value or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        return None
    year, month, day = (int(part) for part in value.split("-"))
    if month not in {3, 6, 9, 12} or day not in {30, 31}:
        return None
    return year * 4 + month // 3


def _item(
    metric: str,
    value: float,
    *,
    as_of: str | None,
    provider: str,
    source: str,
    period_type: str,
    is_ttm: bool,
    currency: str | None = None,
    **extra: object,
) -> JSONDict:
    return {
        "metric": metric,
        "value": value,
        "as_of": as_of,
        "as_of_date": as_of,
        "currency": currency,
        "period_type": period_type,
        "provider": provider,
        "source": source,
        "is_ttm": is_ttm,
        **extra,
    }


def normalize_fundamental_record(
    record: JSONDict,
    provider: str,
    *,
    source: str | None = None,
    period_type: str = "reported",
    is_ttm: bool = False,
) -> list[JSONDict]:
    """Normalize one provider record without making claims about its period."""
    lowered = {str(key).strip().lower(): value for key, value in record.items()}
    items = []
    for metric, aliases in _ALIASES.items():
        normalized_aliases = {metric, *(alias.lower() for alias in aliases)}
        raw = next((value for key, value in lowered.items() if key in normalized_aliases), None)
        if raw is None:
            raw = next((
                value
                for key, value in lowered.items()
                if not any(marker in key for marker in ("增长", "同比", "yoy", "每股", "收益率", "回报率", "比率", "倍数"))
                and any(alias.lower() in key for alias in aliases)
            ), None)
        value = _number(raw)
        if value is None:
            continue
        items.append(_item(
            metric,
            value,
            as_of=_as_of(record),
            currency="CNY" if metric == "eps" or metric in _MONETARY_METRICS else None,
            period_type=period_type,
            provider=provider,
            source=source or provider,
            is_ttm=is_ttm,
        ))
    return items


def build_ttm_from_single_quarters(
    records: Iterable[JSONDict],
    provider: str,
    *,
    source: str | None = None,
) -> list[JSONDict]:
    """Sum exactly four consecutive single-quarter records into TTM values."""
    by_date = {
        cast(str, _as_of(record)): record
        for record in records
        if _quarter_index(_as_of(record)) is not None
    }
    dates = sorted((date for date in by_date if date), reverse=True)[:4]
    indices = [_quarter_index(date) for date in dates]
    typed_indices = cast(list[int], indices)
    if len(dates) != 4 or any(typed_indices[index] - typed_indices[index + 1] != 1 for index in range(3)):
        return []

    normalized = {
        date: {item["metric"]: item["value"] for item in normalize_fundamental_record(by_date[date], provider)}
        for date in dates
    }
    items = []
    for metric in _FLOW_METRICS:
        values = [normalized[date].get(metric) for date in dates]
        if any(value is None for value in values):
            continue
        item = _item(
            metric,
            sum(float(value) for value in values if value is not None),
            as_of=dates[0],
            currency="CNY",
            period_type="TTM",
            provider=provider,
            source=source or provider,
            is_ttm=True,
            source_periods=list(reversed(dates)),
        )
        numeric = [abs(float(value)) for value in values if value is not None]
        if any(
            min(left, right) == 0 < max(left, right)
            or (min(left, right) and max(left, right) / min(left, right) > 5)
            for left, right in zip(numeric, numeric[1:])
        ):
            _add_flag(item, f"suspicious_{metric}_quarter_change_gt_5x")
        items.append(item)
    return items


def _add_flag(item: JSONDict, flag: str) -> None:
    flags = item.setdefault("quality_flags", [])
    if flag not in flags:
        flags.append(flag)


def validate_fundamental_quality(
    items: list[JSONDict],
    annual_baseline: list[JSONDict] | None = None,
) -> list[JSONDict]:
    """Apply conservative cross-period scale and net-margin checks."""
    result = [dict(item) for item in items]
    current = {item["metric"]: item for item in result}
    baseline = {item["metric"]: item for item in annual_baseline or []}
    for metric in ("total_revenue", "net_income"):
        item, prior = current.get(metric), baseline.get(metric)
        if not item or not prior:
            continue
        low = min(abs(float(item["value"])), abs(float(prior["value"])))
        high = max(abs(float(item["value"])), abs(float(prior["value"])))
        if low == 0 < high or (low and high / low > 5):
            _add_flag(item, f"suspicious_{metric}_change_gt_5x")

    revenue, income = current.get("total_revenue"), current.get("net_income")
    if revenue and income and float(revenue["value"]) != 0:
        margin = float(income["value"]) / float(revenue["value"]) * 100
        margin_item = current.get("net_profit_margin")
        if margin_item is None:
            margin_item = _item(
                "net_profit_margin",
                margin,
                as_of=max(str(revenue.get("as_of") or ""), str(income.get("as_of") or "")) or None,
                currency=None,
                period_type="derived_ttm" if revenue.get("is_ttm") and income.get("is_ttm") else "derived",
                provider=str(revenue.get("provider") or "unknown"),
                source=str(revenue.get("source") or revenue.get("provider") or "unknown"),
                is_ttm=bool(revenue.get("is_ttm") and income.get("is_ttm")),
                components=["total_revenue", "net_income"],
            )
            result.append(margin_item)
        if not 0 <= margin <= 60:
            _add_flag(margin_item, "suspicious_net_profit_margin_outside_0_60")

    current = {item["metric"]: item for item in result}
    for metric, numerator_key, denominator_key in (
        ("gross_margin", "gross_profit", "total_revenue"),
        ("debt_to_assets", "total_liabilities", "total_assets"),
    ):
        if metric in current:
            continue
        numerator, denominator = current.get(numerator_key), current.get(denominator_key)
        if not numerator or not denominator or float(denominator["value"]) == 0:
            continue
        result.append(_item(
            metric,
            float(numerator["value"]) / float(denominator["value"]) * 100,
            as_of=max(str(numerator.get("as_of") or ""), str(denominator.get("as_of") or "")) or None,
            currency=None,
            period_type="derived",
            provider=str(numerator.get("provider") or "unknown"),
            source=str(numerator.get("source") or numerator.get("provider") or "unknown"),
            is_ttm=bool(numerator.get("is_ttm") and denominator.get("is_ttm")),
            components=[numerator_key, denominator_key],
        ))

    current = {item["metric"]: item for item in result}

    def compatible(left: JSONDict, right: JSONDict, *, same_period: bool) -> bool:
        if left.get("source") != right.get("source"):
            return False
        if left.get("currency") and right.get("currency") and left["currency"] != right["currency"]:
            return False
        if not same_period:
            return True
        return (
            left.get("as_of") == right.get("as_of")
            and left.get("period_type") == right.get("period_type")
            and bool(left.get("is_ttm")) == bool(right.get("is_ttm"))
        )

    for metric, numerator_key, denominator_key, same_period in (
        ("cfo_to_net_income", "operating_cash_flow", "net_income", True),
        ("fcf_margin", "free_cash_flow", "total_revenue", True),
        ("fcf_yield", "free_cash_flow", "market_cap", False),
    ):
        if metric in current:
            continue
        numerator, denominator = current.get(numerator_key), current.get(denominator_key)
        if (
            not numerator or not denominator
            or float(denominator["value"]) == 0
            or (metric == "fcf_yield" and float(denominator["value"]) < 0)
            or not compatible(numerator, denominator, same_period=same_period)
        ):
            continue
        result.append(_item(
            metric,
            float(numerator["value"]) / float(denominator["value"]) * 100,
            as_of=max(str(numerator.get("as_of") or ""), str(denominator.get("as_of") or "")) or None,
            currency=None,
            period_type=(
                "derived_ttm" if same_period and numerator.get("is_ttm")
                else "derived_ttm_point" if metric == "fcf_yield" and numerator.get("is_ttm")
                else "derived"
            ),
            provider=str(numerator.get("provider") or "unknown"),
            source=str(numerator.get("source") or numerator.get("provider") or "unknown"),
            is_ttm=bool(same_period and numerator.get("is_ttm")),
            components=[numerator_key, denominator_key],
            methodology="deterministic_ratio",
        ))
    return result


def _latest_record(records: Iterable[JSONDict]) -> JSONDict | None:
    return max(records, key=lambda item: _as_of(item) or "", default=None)


def _annual_baseline(
    records: Iterable[JSONDict],
    provider: str,
    source: str,
) -> list[JSONDict]:
    latest = _latest_record(records)
    return normalize_fundamental_record(
        latest, provider, source=source, period_type="FY", is_ttm=False,
    ) if latest else []


def _fallback_to_annual(annual: list[JSONDict]) -> list[JSONDict]:
    result: list[JSONDict] = []
    for item in annual:
        if item["metric"] not in _FLOW_METRICS:
            continue
        copied = dict(item)
        _add_flag(copied, "ttm_unavailable_using_fy")
        result.append(copied)
    return result


class FundamentalsAdapter(ABC):
    name = ""

    @abstractmethod
    def is_available(self) -> bool: ...

    @abstractmethod
    async def fetch(self, symbol: str) -> list[JSONDict]: ...


class AkshareFundamentalsAdapter(FundamentalsAdapter):
    name = "akshare"
    source = "akshare.stock_financial_abstract_ths"

    def is_available(self) -> bool:
        return importlib.util.find_spec("akshare") is not None

    async def fetch(self, symbol: str) -> list[JSONDict]:
        code = normalize_code(symbol)[2:]

        def load() -> tuple[list[JSONDict], list[JSONDict], list[JSONDict]]:
            ak = importlib.import_module("akshare")

            quarterly = ak.stock_financial_abstract_ths(symbol=code, indicator="按单季度")
            reported = ak.stock_financial_abstract_ths(symbol=code, indicator="按报告期")
            annual = ak.stock_financial_abstract_ths(symbol=code, indicator="按年度")
            return cast(tuple[list[JSONDict], list[JSONDict], list[JSONDict]], tuple(
                [] if frame is None else frame.to_dict("records")
                for frame in (quarterly, reported, annual)
            ))

        quarterly, reported, annual_records = await asyncio.to_thread(load)
        annual = _annual_baseline(annual_records, self.name, self.source)
        ttm = build_ttm_from_single_quarters(quarterly, self.name, source=self.source)
        latest = _latest_record(reported)
        point = normalize_fundamental_record(
            latest, self.name, source=self.source, period_type="reported", is_ttm=False,
        ) if latest else []
        point = [item for item in point if item["metric"] not in _FLOW_METRICS | {"net_profit_margin"}]
        return validate_fundamental_quality((ttm or _fallback_to_annual(annual)) + point, annual)


def _dedupe_tushare(records: Iterable[JSONDict]) -> list[JSONDict]:
    selected: dict[str, JSONDict] = {}
    for record in records:
        date = _as_of(record)
        if not date:
            continue
        previous = selected.get(date)
        if previous is None or str(record.get("update_flag") or "0") > str(previous.get("update_flag") or "0"):
            selected[date] = record
    return list(selected.values())


def cumulative_to_single_quarters(
    records: Iterable[JSONDict],
    provider: str,
) -> list[JSONDict]:
    """Convert fiscal-year cumulative statement rows to standalone quarters."""
    canonical: dict[str, dict[str, float]] = {}
    for record in _dedupe_tushare(records):
        date = _as_of(record)
        if _quarter_index(date) is None:
            continue
        typed_date = cast(str, date)
        canonical[typed_date] = {
            item["metric"]: float(item["value"])
            for item in normalize_fundamental_record(record, provider)
            if item["metric"] in _FLOW_METRICS
        }
    standalone = []
    for date in sorted(canonical):
        quarter = int(date[5:7]) // 3
        values = canonical[date]
        if quarter > 1:
            previous_month = (quarter - 1) * 3
            previous_day = 30 if previous_month in {6, 9} else 31
            previous = canonical.get(f"{date[:4]}-{previous_month:02d}-{previous_day:02d}")
            if previous is None:
                values = {}
            else:
                values = {
                    metric: value - previous[metric]
                    for metric, value in values.items()
                    if metric in previous
                }
        standalone.append({"end_date": date.replace("-", ""), **values})
    return standalone


class TushareFundamentalsAdapter(FundamentalsAdapter):
    name = "tushare"
    source = "tushare.pro"

    def __init__(self, token: str | None = None) -> None:
        self.token = token or os.getenv("TUSHARE_TOKEN", "").strip()

    def is_available(self) -> bool:
        return bool(self.token) and importlib.util.find_spec("tushare") is not None

    async def fetch(self, symbol: str) -> list[JSONDict]:
        normalized = normalize_code(symbol)
        suffix = "SH" if normalized.startswith("sh") else "SZ"

        def load() -> tuple[list[JSONDict], list[JSONDict], list[JSONDict], list[JSONDict]]:
            ts = importlib.import_module("tushare")

            pro = ts.pro_api(self.token)
            ts_code = f"{normalized[2:]}.{suffix}"
            result: dict[str, list[JSONDict]] = {}
            errors: list[Exception] = []
            for endpoint in ("fina_indicator", "income", "cashflow", "balancesheet"):
                try:
                    frame = getattr(pro, endpoint)(ts_code=ts_code)
                except Exception as exc:
                    errors.append(exc)
                    result[endpoint] = []
                    continue
                result[endpoint] = [] if frame is None else frame.to_dict("records")
            if not any(result.values()) and errors:
                raise errors[-1]
            return cast(
                tuple[list[JSONDict], list[JSONDict], list[JSONDict], list[JSONDict]],
                tuple(result[key] for key in ("fina_indicator", "income", "cashflow", "balancesheet")),
            )

        indicators, income, cashflow, balance = await asyncio.to_thread(load)
        quarters_by_date: dict[str, JSONDict] = {}
        for record in cumulative_to_single_quarters(income, self.name) + cumulative_to_single_quarters(cashflow, self.name):
            quarters_by_date.setdefault(record["end_date"], {}).update(record)
        ttm = build_ttm_from_single_quarters(quarters_by_date.values(), self.name, source=self.source)

        annual_records: dict[str, JSONDict] = {}
        for record in _dedupe_tushare(income) + _dedupe_tushare(cashflow):
            date = _as_of(record)
            if date and date.endswith("12-31"):
                annual_records.setdefault(date, {}).update(record)
        annual = _annual_baseline(annual_records.values(), self.name, self.source)

        point: list[JSONDict] = []
        for records in (indicators, balance):
            latest = _latest_record(_dedupe_tushare(records))
            if latest:
                point.extend(normalize_fundamental_record(latest, self.name, source=self.source))
        deduplicated = {
            item["metric"]: item
            for item in point
            if item["metric"] not in _FLOW_METRICS | {"net_profit_margin"}
        }
        return validate_fundamental_quality((ttm or _fallback_to_annual(annual)) + list(deduplicated.values()), annual)


def _yahoo_series(payload: JSONDict) -> dict[str, list[JSONDict]]:
    result: dict[str, list[JSONDict]] = {}
    for series in payload.get("result") or []:
        metric = ((series.get("meta") or {}).get("type") or [None])[0]
        if metric:
            result[metric] = series.get(metric) or []
    return result


def _yahoo_value(value: JSONDict) -> float | None:
    return _number((value.get("reportedValue") or {}).get("raw"))


def normalize_yahoo_cn_fundamentals(payload: JSONDict) -> list[JSONDict]:
    """Use Yahoo quarter rows only when four consecutive periods prove TTM."""
    source = "yahoo.fundamentals_timeseries"
    series = _yahoo_series(payload)
    quarter_records: dict[str, JSONDict] = {}
    for yahoo_metric, metric in _YAHOO_QUARTERLY.items():
        for value in series.get(yahoo_metric, []):
            raw, date = _yahoo_value(value), value.get("asOfDate")
            if raw is not None and date:
                quarter_records.setdefault(str(date), {"end_date": str(date).replace("-", "")})[metric] = raw
    ttm = build_ttm_from_single_quarters(quarter_records.values(), "yahoo", source=source)

    annual_records: dict[str, JSONDict] = {}
    for yahoo_metric, metric in _YAHOO_ANNUAL.items():
        for value in series.get(yahoo_metric, []):
            raw, date = _yahoo_value(value), value.get("asOfDate")
            if raw is not None and date:
                annual_records.setdefault(str(date), {"end_date": str(date).replace("-", "")})[metric] = raw
    annual = _annual_baseline(annual_records.values(), "yahoo", source)

    if not ttm:
        ttm = _fallback_to_annual(annual)
    if not ttm:
        for yahoo_metric, metric in _YAHOO_TRAILING.items():
            values = series.get(yahoo_metric) or []
            raw = _yahoo_value(values[-1]) if values else None
            if raw is None:
                continue
            item = _item(
                metric,
                raw,
                as_of=values[-1].get("asOfDate"),
                currency=values[-1].get("currencyCode") or "CNY",
                period_type="reported_unverified",
                provider="yahoo",
                source=source,
                is_ttm=False,
            )
            _add_flag(item, "unverified_yahoo_ttm")
            ttm.append(item)

    point = []
    for yahoo_metric, metric in _YAHOO_POINT.items():
        values = series.get(yahoo_metric) or []
        raw = _yahoo_value(values[-1]) if values else None
        if raw is None:
            continue
        latest = values[-1]
        point.append(_item(
            metric,
            raw,
            as_of=latest.get("asOfDate"),
            currency=latest.get("currencyCode"),
            period_type=latest.get("periodType") or "reported",
            provider="yahoo",
            source=source,
            is_ttm=False,
        ))
    return validate_fundamental_quality(ttm + point, annual)


async def fetch_cn_fundamentals(
    symbol: str,
    adapters: tuple[FundamentalsAdapter, ...] | None = None,
) -> list[JSONDict]:
    """Use the first available provider returning period-safe data."""
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
