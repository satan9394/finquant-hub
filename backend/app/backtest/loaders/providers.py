"""Built-in Yahoo plus optional AKShare/Tushare backtest loaders."""
from __future__ import annotations

import asyncio
import importlib
import importlib.util
import os
from datetime import date, timedelta
from typing import Any, TypedDict

from ...services.instruments import MARKET_META, InstrumentService, instrument_from_code, provenance
from ...services.market_data import MarketError, normalize_code
from .base import BaseLoader, LoaderUnavailableError, SUPPORTED_PERIODS
from .registry import register


class BarRow(TypedDict):
    day: str
    open: float
    high: float
    low: float
    close: float
    volume: int


def _clean_rows(rows: list[dict[str, Any]], mapping: dict[str, str]) -> list[BarRow]:
    cleaned: list[BarRow] = []
    for row in rows:
        try:
            item: BarRow = {
                "day": str(row[mapping["day"]])[:19],
                "open": float(row[mapping["open"]]),
                "high": float(row[mapping["high"]]),
                "low": float(row[mapping["low"]]),
                "close": float(row[mapping["close"]]),
                "volume": int(float(row.get(mapping["volume"]) or 0)),
            }
        except (KeyError, TypeError, ValueError):
            continue
        prices = (item["open"], item["high"], item["low"], item["close"])
        if min(prices) <= 0 or item["high"] < max(item["open"], item["close"], item["low"]):
            continue
        if item["low"] > min(item["open"], item["close"], item["high"]):
            continue
        cleaned.append(item)
    return sorted(cleaned, key=lambda item: item["day"])


def _payload(
    symbol: str,
    period: str,
    count: int,
    rows: list[BarRow],
    *,
    provider: str,
    adjustment: str,
) -> dict[str, Any]:
    normalized = normalize_code(symbol)
    instrument = instrument_from_code(normalized)
    selected = rows[-count:]
    flags: list[str] = []
    if len(selected) < count:
        flags.append("partial_history")
    if adjustment == "none":
        flags.append("unadjusted_prices")
    return {
        "instrument": instrument,
        "items": selected,
        "indicators": {},
        **provenance(
            provider=provider,
            as_of=selected[-1]["day"] if selected else None,
            timezone=MARKET_META[normalized[:2]]["timezone"],
            currency=instrument["currency"],
            adjustment=adjustment,
            frequency=period,
            quality_flags=flags,
        ),
    }


@register
class YahooLoader(BaseLoader):
    name = "yahoo"
    markets = frozenset({"HK", "US"})
    priority = 10

    async def load(self, symbol: str, period: str, count: int) -> dict[str, Any]:
        payload = await InstrumentService(self.require_market_service()).bars(symbol, period, count)
        providers = {part for part in str(payload.get("provider") or "").split(",") if part}
        if not providers or providers != {"yahoo"}:
            raise LoaderUnavailableError(f"Yahoo 未返回可用数据：{symbol}")
        return payload


@register
class AkshareLoader(BaseLoader):
    name = "akshare"
    markets = frozenset({"CN"})
    periods = frozenset({"1d"})
    priority = 20

    def is_available(self) -> bool:
        return importlib.util.find_spec("akshare") is not None

    async def load(self, symbol: str, period: str, count: int) -> dict[str, Any]:
        del period

        def fetch() -> list[dict[str, Any]]:
            ak = importlib.import_module("akshare")

            end = date.today()
            start = end - timedelta(days=max(365, count * 3))
            frame = ak.stock_zh_a_hist(
                symbol=normalize_code(symbol)[2:],
                period="daily",
                start_date=start.strftime("%Y%m%d"),
                end_date=end.strftime("%Y%m%d"),
                adjust="qfq",
            )
            return [] if frame is None else frame.to_dict("records")

        try:
            raw = await asyncio.to_thread(fetch)
        except Exception as exc:
            raise LoaderUnavailableError(f"AKShare 请求失败：{type(exc).__name__}") from exc
        rows = _clean_rows(raw, {
            "day": "日期", "open": "开盘", "high": "最高", "low": "最低",
            "close": "收盘", "volume": "成交量",
        })
        if not rows:
            raise LoaderUnavailableError(f"AKShare 无K线数据：{symbol}")
        return _payload(symbol, "1d", count, rows, provider=self.name, adjustment="qfq")


@register
class TushareLoader(BaseLoader):
    name = "tushare"
    markets = frozenset({"CN"})
    periods = frozenset({"1d"})
    priority = 30

    def is_available(self) -> bool:
        return bool(os.getenv("TUSHARE_TOKEN", "").strip()) and importlib.util.find_spec("tushare") is not None

    async def load(self, symbol: str, period: str, count: int) -> dict[str, Any]:
        del period

        def fetch() -> list[dict[str, Any]]:
            ts = importlib.import_module("tushare")

            normalized = normalize_code(symbol)
            suffix = "SH" if normalized.startswith("sh") else "SZ"
            end = date.today()
            start = end - timedelta(days=max(365, count * 3))
            frame = ts.pro_api(os.environ["TUSHARE_TOKEN"]).daily(
                ts_code=f"{normalized[2:]}.{suffix}",
                start_date=start.strftime("%Y%m%d"),
                end_date=end.strftime("%Y%m%d"),
            )
            return [] if frame is None else frame.to_dict("records")

        try:
            raw = await asyncio.to_thread(fetch)
        except Exception as exc:
            raise LoaderUnavailableError(f"Tushare 请求失败：{type(exc).__name__}") from exc
        rows = _clean_rows(raw, {
            "day": "trade_date", "open": "open", "high": "high", "low": "low",
            "close": "close", "volume": "vol",
        })
        if not rows:
            raise LoaderUnavailableError(f"Tushare 无K线数据：{symbol}")
        return _payload(symbol, "1d", count, rows, provider=self.name, adjustment="none")


@register
class MarketDataLoader(BaseLoader):
    """Compatibility fallback over the existing A/HK/US market service."""

    name = "market_data"
    markets = frozenset({"CN", "HK", "US"})
    periods = SUPPORTED_PERIODS
    priority = 100

    async def load(self, symbol: str, period: str, count: int) -> dict[str, Any]:
        try:
            return await InstrumentService(self.require_market_service()).bars(symbol, period, count)
        except MarketError as exc:
            raise LoaderUnavailableError(str(exc)) from exc
