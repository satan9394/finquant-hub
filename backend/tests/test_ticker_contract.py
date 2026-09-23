import pytest

from app.services.instruments import external_symbol
from app.services.market_data import _yahoo_symbol, detect_market, normalize_code


@pytest.mark.parametrize(
    ("raw", "canonical", "external", "yahoo"),
    [
        ("600519", "sh600519", "600519", "600519.SS"),
        ("sh600519", "sh600519", "600519", "600519.SS"),
        ("600519.SS", "sh600519", "600519", "600519.SS"),
        ("000858", "sz000858", "000858", "000858.SZ"),
        ("SZ000858", "sz000858", "000858", "000858.SZ"),
        ("300750", "sz300750", "300750", "300750.SZ"),
        ("688981", "sh688981", "688981", "688981.SS"),
        ("0700", "hk00700", "00700.HK", "0700.HK"),
        ("00700", "hk00700", "00700.HK", "0700.HK"),
        ("0700.HK", "hk00700", "00700.HK", "0700.HK"),
        ("00700.hk", "hk00700", "00700.HK", "0700.HK"),
        ("HK0700", "hk00700", "00700.HK", "0700.HK"),
        ("AAPL", "usAAPL", "AAPL", "AAPL"),
        ("aapl", "usAAPL", "AAPL", "AAPL"),
        ("usAAPL", "usAAPL", "AAPL", "AAPL"),
        ("BRK.B", "usBRK-B", "BRK-B", "BRK-B"),
        ("BRK-B", "usBRK-B", "BRK-B", "BRK-B"),
        ("usBRK.B", "usBRK-B", "BRK-B", "BRK-B"),
        ("BF.B", "usBF-B", "BF-B", "BF-B"),
        ("BF-B", "usBF-B", "BF-B", "BF-B"),
        ("B2", "usB2", "B2", "B2"),
        ("  AAPL  ", "usAAPL", "AAPL", "AAPL"),
    ],
)
def test_supported_ticker_contract_matrix(raw, canonical, external, yahoo):
    assert normalize_code(raw) == canonical
    assert detect_market(raw) == canonical[:2]
    assert external_symbol(raw) == external
    assert _yahoo_symbol(canonical) == yahoo


@pytest.mark.parametrize(
    "raw",
    [
        "830799", "920002", "430047", "sh830799", "sz920002", "bj830799",
        "830799.SS", "920002.SZ",
    ],
)
def test_unsupported_segments_are_rejected_honestly(raw):
    for operation in (normalize_code, detect_market, external_symbol):
        with pytest.raises(ValueError, match="暂不支持该股票代码段"):
            operation(raw)


@pytest.mark.parametrize(
    ("raw", "message"),
    [
        ("", "股票代码不能为空"),
        ("   ", "股票代码不能为空"),
        ("AA PL", "不支持的股票代码格式"),
        ("BRK..B", "不支持的股票代码格式"),
        ("BRK-", "不支持的股票代码格式"),
        ("123", "不支持的股票代码格式"),
        ("1234567", "不支持的股票代码格式"),
        ("sh000858", "股票代码与交易所不匹配"),
        ("600519.SZ", "股票代码与交易所不匹配"),
    ],
)
def test_invalid_tickers_are_not_coerced(raw, message):
    for operation in (normalize_code, detect_market, external_symbol):
        with pytest.raises(ValueError, match=message):
            operation(raw)
