"""指标计算单元测试（纯数值，不依赖网络）。"""
import pytest

from app.services import indicators


def closes(n, start=1.0):
    return [start + i for i in range(n)]


class TestMA:
    def test_ma5_values(self):
        result = indicators.calc_ma(closes(10), windows=(5,))
        ma5 = result["ma5"]
        assert ma5[:4] == [None] * 4
        assert ma5[4:] == [3.0, 4.0, 5.0, 6.0, 7.0, 8.0]

    def test_all_windows_present(self):
        result = indicators.calc_ma(closes(100))
        assert set(result.keys()) == {"ma5", "ma10", "ma20", "ma30", "ma60"}


class TestMACD:
    def test_constant_price_converges_zero(self):
        result = indicators.calc_macd([10.0] * 60)
        assert abs(result["dif"][-1]) < 1e-8
        assert abs(result["dea"][-1]) < 1e-8
        assert abs(result["hist"][-1]) < 1e-8

    def test_uptrend_dif_positive(self):
        result = indicators.calc_macd(closes(60))
        assert result["dif"][-1] > 0
        assert result["hist"] is not None


class TestRSI:
    def test_monotonic_up_near_100(self):
        result = indicators.calc_rsi(closes(60))
        assert result["rsi6"][-1] == 100.0

    def test_monotonic_down_near_0(self):
        result = indicators.calc_rsi([100.0 - i for i in range(60)])
        assert result["rsi6"][-1] == 0.0

    def test_first_day_is_none(self):
        result = indicators.calc_rsi(closes(30))
        assert result["rsi6"][0] is None


class TestKDJ:
    def test_keys_and_range(self):
        n = 60
        h = [10.0 + i * 0.1 + 0.5 for i in range(n)]
        l = [10.0 + i * 0.1 - 0.5 for i in range(n)]
        c = [10.0 + i * 0.1 for i in range(n)]
        result = indicators.calc_kdj(h, l, c)
        assert set(result.keys()) == {"k", "d", "j"}
        assert 0 <= result["k"][-1] <= 100
        assert 0 <= result["d"][-1] <= 100


class TestBOLL:
    def test_constant_price_bands_collapse(self):
        result = indicators.calc_boll([5.0] * 30)
        assert result["mid"][-1] == 5.0
        assert result["upper"][-1] == 5.0
        assert result["lower"][-1] == 5.0

    def test_upper_gt_lower(self):
        result = indicators.calc_boll(closes(40))
        assert result["upper"][-1] > result["mid"][-1] > result["lower"][-1]


class TestATR:
    def test_constant_range(self):
        n = 30
        h = [11.0] * n
        l = [9.0] * n
        c = [10.0] * n
        result = indicators.calc_atr(h, l, c)
        assert abs(result["atr14"][-1] - 2.0) < 1e-8


class TestCompute:
    def test_unknown_indicator_raises(self):
        kline = [{"day": "2026-07-24", "open": 1, "high": 1, "low": 1, "close": 1, "volume": 1}]
        with pytest.raises(ValueError, match="未知指标"):
            indicators.compute(kline, ["foo"])

    def test_default_returns_all_seven(self):
        kline = [
            {"day": f"2026-07-{i:02d}", "open": 10 + i, "high": 11 + i,
             "low": 9 + i, "close": 10.5 + i, "volume": 1000 + i}
            for i in range(1, 29)
        ]
        result = indicators.compute(kline)
        assert set(result.keys()) == {"ma", "macd", "rsi", "kdj", "boll", "atr", "volma"}
