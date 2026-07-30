import pytest

from app.services.market_data import detect_market, normalize_code


@pytest.mark.parametrize(
    ("ticker", "expected"),
    [
        ("600519", "sh600519"),
        ("00700", "hk00700"),
        ("AAPL", "usAAPL"),
    ],
)
def test_normalize_code_uses_market_prefix(ticker, expected):
    assert normalize_code(ticker) == expected


@pytest.mark.parametrize(
    ("ticker", "expected"),
    [
        ("600519", "sh"),
        ("00700", "hk"),
        ("AAPL", "us"),
    ],
)
def test_detect_market_returns_internal_prefix(ticker, expected):
    assert detect_market(ticker) == expected
