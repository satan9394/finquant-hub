"""Evidence-bounded A-share trading-day queries."""
from __future__ import annotations

from datetime import date, timedelta
from typing import Any


SSE_2026_SOURCE = "https://www.sse.com.cn/disclosure/announcement/general/c/c_20251222_10802507.shtml"


def _dates(start: str, end: str) -> dict[date, str]:
    first, last = date.fromisoformat(start), date.fromisoformat(end)
    return {first + timedelta(days=offset): "exchange_holiday" for offset in range((last - first).days + 1)}


_SSE_CLOSURES = {
    **_dates("2026-01-01", "2026-01-03"),
    **_dates("2026-02-15", "2026-02-23"),
    **_dates("2026-04-04", "2026-04-06"),
    **_dates("2026-05-01", "2026-05-05"),
    **_dates("2026-06-19", "2026-06-21"),
    **_dates("2026-09-25", "2026-09-27"),
    **_dates("2026-10-01", "2026-10-07"),
}
_SUPPORTED_YEARS = frozenset({2026})


def query_trading_day(value: date | str) -> dict[str, Any]:
    """Return confirmed state; unsupported weekdays are explicitly unknown."""
    day = date.fromisoformat(value) if isinstance(value, str) else value
    if day.weekday() >= 5:
        is_trading_day: bool | None = False
        reason = "weekend"
    elif day.year not in _SUPPORTED_YEARS:
        is_trading_day = None
        reason = "calendar_not_available"
    elif day in _SSE_CLOSURES:
        is_trading_day = False
        reason = _SSE_CLOSURES[day]
    else:
        is_trading_day = True
        reason = "regular_session"
    return {
        "date": day.isoformat(),
        "exchange": "SSE/SZSE",
        "is_trading_day": is_trading_day,
        "reason": reason,
        "calendar_year": day.year if day.year in _SUPPORTED_YEARS else None,
        "source": SSE_2026_SOURCE if day.year in _SUPPORTED_YEARS else None,
    }


def trading_days(start: date | str, end: date | str) -> list[date]:
    first = date.fromisoformat(start) if isinstance(start, str) else start
    last = date.fromisoformat(end) if isinstance(end, str) else end
    if last < first:
        raise ValueError("结束日期不能早于开始日期")
    days: list[date] = []
    for offset in range((last - first).days + 1):
        candidate = first + timedelta(days=offset)
        state = query_trading_day(candidate)["is_trading_day"]
        if state is None:
            raise ValueError(f"{candidate.year} 年交易日历尚未收录")
        if state:
            days.append(candidate)
    return days
