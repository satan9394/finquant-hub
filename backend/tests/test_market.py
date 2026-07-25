"""行情解析与降级链测试（MockTransport，不依赖真实网络）。"""
import httpx
import pytest

from app.services.market_data import (
    MarketDataService, MarketError, normalize_code, parse_sina_quotes, parse_tencent_quotes,
)


def _tencent_fixture() -> str:
    """构造 51 字段的腾讯行情行。"""
    f = ["0"] * 51
    f[1] = "贵州茅台"
    f[3] = "1297.41"   # price
    f[4] = "1292.00"   # last_close
    f[5] = "1295.00"   # open
    f[6] = "12345"     # volume
    f[30] = "1753334400"
    f[31] = "5.41"     # change
    f[32] = "0.42"     # change_percent
    f[33] = "1300.00"  # high
    f[34] = "1288.00"  # low
    f[37] = "159900"   # amount
    f[38] = "0.10"     # turnover
    f[39] = "19.6"     # pe
    f[43] = "0.93"     # amplitude
    f[45] = "16300"    # market_cap
    f[46] = "7.5"      # pb
    return f'v_sh600519="{"~".join(f)}";'


SINA_FIXTURE = (
    'var hq_str_sh600519="贵州茅台,1295.00,1292.00,1297.41,1300.00,1288.00,'
    '1296.00,1297.00,1234500,1599000000,'
    + ",".join(["0"] * 20)
    + ',2026-07-24,15:00:00,00,";'
).replace(',"', ',"')  # 保持逗号分隔结构


class TestNormalize:
    @pytest.mark.parametrize("raw,expected", [
        ("600519", "sh600519"), ("000858", "sz000858"), ("300750", "sz300750"),
        ("688981", "sh688981"), ("sh600519", "sh600519"), ("SZ000858", "sz000858"),
        ("00700", "hk00700"), ("0700.HK", "hk00700"), ("AAPL", "usAAPL"),
        ("usBRK.B", "usBRK.B"),
    ])
    def test_normalize(self, raw, expected):
        assert normalize_code(raw) == expected


class TestParsers:
    def test_tencent_parse(self):
        quotes = parse_tencent_quotes(_tencent_fixture())
        assert len(quotes) == 1
        q = quotes[0]
        assert q["code"] == "sh600519"
        assert q["name"] == "贵州茅台"
        assert q["price"] == 1297.41
        assert q["change_percent"] == 0.42
        assert q["pe"] == 19.6

    def test_tencent_skips_short_lines(self):
        assert parse_tencent_quotes('v_sh600519="too~short";') == []

    def test_sina_parse(self):
        quotes = parse_sina_quotes(SINA_FIXTURE)
        assert len(quotes) == 1
        q = quotes[0]
        assert q["name"] == "贵州茅台"
        assert q["price"] == 1297.41
        assert q["change_percent"] == round((1297.41 - 1292.00) / 1292.00 * 100, 2)


class TestFallback:
    """DATA-04：主源失败自动降级备源（mock 验证）。"""

    @pytest.mark.asyncio
    async def test_quote_falls_back_to_sina(self):
        def handler(request: httpx.Request) -> httpx.Response:
            if "qt.gtimg.cn" in str(request.url):
                raise httpx.ConnectTimeout("主源超时", request=request)
            if "hq.sinajs.cn" in str(request.url):
                return httpx.Response(200, content=SINA_FIXTURE.encode("gbk"))
            return httpx.Response(404)

        svc = MarketDataService(http=httpx.AsyncClient(transport=httpx.MockTransport(handler)))
        q = await svc.quote("600519")
        assert q["name"] == "贵州茅台"
        assert q["price"] == 1297.41
        await svc.aclose()

    @pytest.mark.asyncio
    async def test_all_sources_fail_raises(self):
        def handler(request: httpx.Request) -> httpx.Response:
            raise httpx.ConnectTimeout("全部超时", request=request)

        svc = MarketDataService(http=httpx.AsyncClient(transport=httpx.MockTransport(handler)))
        with pytest.raises((MarketError, httpx.HTTPError)):
            await svc.quote("600519")
        await svc.aclose()

    @pytest.mark.asyncio
    async def test_kline_falls_back_to_tencent(self):
        tencent_kline = (
            '{"code":0,"data":{"sh600519":{"qfqday":'
            '[["2026-07-23","1290.0","1292.0","1296.0","1285.0","11000"],'
            '["2026-07-24","1295.0","1297.4","1300.0","1288.0","12345"]]}}}'
        )

        def handler(request: httpx.Request) -> httpx.Response:
            if "sina" in str(request.url):
                raise httpx.ConnectTimeout("新浪超时", request=request)
            if "ifzq.gtimg.cn" in str(request.url):
                return httpx.Response(200, text=tencent_kline)
            return httpx.Response(404)

        svc = MarketDataService(http=httpx.AsyncClient(transport=httpx.MockTransport(handler)))
        items = await svc.kline("600519", "1d", 2)
        assert len(items) == 2
        assert items[-1]["day"] == "2026-07-24"
        assert items[-1]["close"] == 1297.4
        await svc.aclose()
