from datetime import date

import pytest

from app.services.trading_calendar import query_trading_day, trading_days


def test_official_2026_sse_closures_and_regular_sessions():
    holiday = query_trading_day("2026-02-23")
    reopened = query_trading_day("2026-02-24")

    assert holiday["is_trading_day"] is False
    assert holiday["reason"] == "exchange_holiday"
    assert holiday["source"].startswith("https://www.sse.com.cn/")
    assert reopened["is_trading_day"] is True


def test_calendar_never_guesses_unsupported_weekday():
    unknown = query_trading_day("2027-01-04")
    weekend = query_trading_day("2027-01-02")

    assert unknown["is_trading_day"] is None
    assert unknown["reason"] == "calendar_not_available"
    assert weekend["is_trading_day"] is False
    assert weekend["reason"] == "weekend"


def test_trading_day_range_is_bounded_by_available_calendar():
    assert trading_days("2026-05-01", "2026-05-07") == [date(2026, 5, 6), date(2026, 5, 7)]
    with pytest.raises(ValueError, match="尚未收录"):
        trading_days("2027-01-04", "2027-01-05")
