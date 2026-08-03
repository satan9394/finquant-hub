"""Unified A/HK/US instrument contracts built on the existing market service."""
from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, cast

from . import indicators
from .market_data import MarketDataService, normalize_code


MARKET_META = {
    "sh": {"market": "CN", "exchange": "SSE", "currency": "CNY", "timezone": "Asia/Shanghai"},
    "sz": {"market": "CN", "exchange": "SZSE", "currency": "CNY", "timezone": "Asia/Shanghai"},
    "hk": {"market": "HK", "exchange": "HKEX", "currency": "HKD", "timezone": "Asia/Hong_Kong"},
    "us": {"market": "US", "exchange": "US", "currency": "USD", "timezone": "America/New_York"},
}


def external_symbol(code: str) -> str:
    normalized = normalize_code(code)
    market, raw = normalized[:2], normalized[2:]
    if market in {"sh", "sz"}:
        return raw
    if market == "hk":
        return f"{raw}.HK"
    return raw


def instrument_from_code(
    code: str,
    *,
    name: str | None = None,
    asset_type: str | None = None,
    exchange: str | None = None,
) -> dict[str, Any]:
    normalized = normalize_code(code)
    prefix = normalized[:2]
    meta = MARKET_META[prefix]
    normalized_asset = str(asset_type or "equity").lower()
    if normalized_asset in {"股票", "沪a", "深a", "科创板", "主板", "创业板", "equity"}:
        normalized_asset = "equity"
    elif "etf" in normalized_asset:
        normalized_asset = "etf"
    elif "index" in normalized_asset or "指数" in normalized_asset:
        normalized_asset = "index"
    return {
        "symbol": external_symbol(normalized),
        "name": name or external_symbol(normalized),
        "market": meta["market"],
        "exchange": exchange or meta["exchange"],
        "currency": meta["currency"],
        "asset_type": normalized_asset,
    }


def provenance(
    *,
    provider: str,
    as_of: str | None,
    timezone: str | None,
    currency: str | None,
    adjustment: str,
    frequency: str,
    quality_flags: list[str] | None = None,
) -> dict[str, Any]:
    return {
        "provider": provider,
        "as_of": as_of,
        "timezone": timezone,
        "currency": currency,
        "adjustment": adjustment,
        "frequency": frequency,
        "quality_flags": quality_flags or [],
    }


def _as_of_from_timestamp(value: object, timezone: str) -> str | None:
    try:
        timestamp = int(cast(Any, value or 0))
    except (TypeError, ValueError):
        return None
    if timestamp <= 0:
        return None
    # Most providers use epoch seconds. A 14-digit YYYYMMDDHHMMSS value is
    # preserved as local exchange time when encountered.
    if timestamp > 10_000_000_000:
        raw = str(timestamp)
        try:
            return datetime.strptime(raw[:14], "%Y%m%d%H%M%S").isoformat()
        except ValueError:
            return None
    return datetime.fromtimestamp(timestamp, tz=UTC).isoformat()


class InstrumentService:
    def __init__(self, market: MarketDataService):
        self.market = market

    async def search(self, query: str) -> dict[str, Any]:
        rows = await self.market.search(query)
        items: list[dict[str, Any]] = []
        sources: list[str] = []
        seen: set[str] = set()
        for row in rows:
            symbol = external_symbol(row["code"])
            if symbol in seen:
                continue
            seen.add(symbol)
            source = str(row.get("source") or "unknown")
            if source not in sources:
                sources.append(source)
            item = instrument_from_code(
                row["code"],
                name=row.get("name"),
                asset_type=row.get("type"),
                exchange=row.get("exchange"),
            )
            item["provider"] = source
            items.append(item)
        flags = [] if items else ["no_matches"]
        return {
            "items": items,
            **provenance(
                provider=",".join(sources) if sources else "eastmoney,yahoo",
                as_of=datetime.now(tz=UTC).isoformat(),
                timezone="UTC",
                currency=None,
                adjustment="not_applicable",
                frequency="on_demand",
                quality_flags=flags,
            ),
        }

    async def snapshot(self, symbol: str) -> dict[str, Any]:
        quote = await self.market.quote(symbol)
        instrument = instrument_from_code(
            quote.get("code") or symbol,
            name=quote.get("name"),
            exchange=quote.get("exchange"),
        )
        timezone = quote.get("timezone") or MARKET_META[normalize_code(symbol)[:2]]["timezone"]
        currency = quote.get("currency") or instrument["currency"]
        as_of = _as_of_from_timestamp(quote.get("timestamp"), timezone)
        nullable_fields = ("open", "high", "low", "volume", "amount", "turnover_rate", "pe", "pb", "market_cap")
        data = {key: quote.get(key) for key in (
            "price", "last_close", "open", "high", "low", "volume", "amount",
            "change", "change_percent", "turnover_rate", "pe", "pb", "market_cap", "amplitude",
        )}
        # Legacy providers used zero for absent fields. The unified contract
        # exposes unknown as null so the UI cannot mistake missingness for fact.
        flags: list[str] = []
        for field in nullable_fields:
            if data.get(field) == 0:
                data[field] = None
                flags.append(f"missing_{field}")
        if not as_of:
            flags.append("missing_as_of")
        return {
            "instrument": instrument,
            "data": data,
            **provenance(
                provider=str(quote.get("source") or "unknown"),
                as_of=as_of,
                timezone=timezone,
                currency=currency,
                adjustment="not_applicable",
                frequency="realtime_or_delayed",
                quality_flags=flags,
            ),
        }

    async def bars(self, symbol: str, period: str, count: int) -> dict[str, Any]:
        rows = await self.market.kline(symbol, period, count)
        instrument = instrument_from_code(symbol)
        providers = list(dict.fromkeys(str(row.get("source") or "unknown") for row in rows))
        adjustments = list(dict.fromkeys(str(row.get("adjustment") or "unknown") for row in rows))
        clean_rows = [
            {key: row[key] for key in ("day", "open", "high", "low", "close", "volume")}
            for row in rows
        ]
        flags: list[str] = []
        if len(clean_rows) < count:
            flags.append("partial_history")
        if "none" in adjustments:
            flags.append("unadjusted_prices")
        indicator_data = indicators.compute(clean_rows, ["ma", "macd", "rsi"]) if clean_rows else {}
        return {
            "instrument": instrument,
            "items": clean_rows,
            "indicators": indicator_data,
            **provenance(
                provider=",".join(providers),
                as_of=clean_rows[-1]["day"] if clean_rows else None,
                timezone=MARKET_META[normalize_code(symbol)[:2]]["timezone"],
                currency=instrument["currency"],
                adjustment=",".join(adjustments),
                frequency=period,
                quality_flags=flags,
            ),
        }

    async def fundamentals(self, symbol: str) -> dict[str, Any]:
        items = await self.market.fundamentals(symbol)
        instrument = instrument_from_code(symbol)
        domestic = normalize_code(symbol).startswith(("sh", "sz"))
        expected = ({
            "total_revenue", "net_income", "operating_cash_flow", "eps", "roe",
            "gross_margin", "net_profit_margin", "debt_to_assets", "current_ratio",
        }
                    if domestic else {
                        "trailingMarketCap", "trailingPeRatio", "trailingPbRatio",
                        "trailingTotalRevenue", "trailingNetIncome",
                        "trailingOperatingCashFlow", "trailingFreeCashFlow",
                    })
        present = {item["metric"] for item in items}
        latest = max((str(item.get("as_of_date") or item.get("as_of")) for item in items
                      if item.get("as_of_date") or item.get("as_of")), default=None)
        currencies = [str(item["currency"]) for item in items if item.get("currency")]
        providers = list(dict.fromkeys(str(item.get("provider") or "unknown") for item in items))
        item_flags = [
            str(flag)
            for item in items
            for flag in item.get("quality_flags", [])
        ]
        quality_flags = list(dict.fromkeys(
            [f"missing_{metric}" for metric in sorted(expected - present)] + item_flags
        ))
        return {
            "instrument": instrument,
            "items": items,
            **provenance(
                provider=",".join(providers),
                as_of=latest,
                timezone=MARKET_META[normalize_code(symbol)[:2]]["timezone"],
                currency=currencies[0] if currencies and len(set(currencies)) == 1 else instrument["currency"],
                adjustment="not_applicable",
                frequency="TTM_or_point_in_time",
                quality_flags=quality_flags,
            ),
        }
