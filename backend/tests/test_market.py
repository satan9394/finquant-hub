"""行情解析与降级链测试（MockTransport，不依赖真实网络）。"""
import httpx
import pytest

from app.services import market_data
from app.services.analysis.ticker import resolve_ticker
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
        assert q["amount"] == 1_599_000_000
        assert q["market_cap"] == 1_630_000_000_000

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
        with pytest.raises(MarketError, match="无法获取 600519 的行情"):
            await svc.quote("600519")
        await svc.aclose()

    @pytest.mark.asyncio
    async def test_quote_uses_full_tencent_sina_yahoo_fallback_chain(self, monkeypatch):
        svc = MarketDataService(http=httpx.AsyncClient(transport=httpx.MockTransport(
            lambda request: httpx.Response(500, request=request)
        )))
        calls = []

        async def tencent(codes):
            calls.append(("tencent", codes))
            return []

        async def sina(codes):
            calls.append(("sina", codes))
            raise httpx.ConnectTimeout("sina timeout")

        async def yahoo(code):
            calls.append(("yahoo", code))
            return {"code": code, "name": "贵州茅台", "price": 1297.41, "source": "yahoo"}

        monkeypatch.setattr(svc, "_quotes_tencent", tencent)
        monkeypatch.setattr(svc, "_quotes_sina", sina)
        monkeypatch.setattr(svc, "_quote_yahoo", yahoo)

        quote = await svc.quote("600519")

        assert quote["source"] == "yahoo"
        assert calls == [
            ("tencent", ["sh600519"]),
            ("sina", ["sh600519"]),
            ("yahoo", "sh600519"),
        ]
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

    @pytest.mark.asyncio
    async def test_kline_uses_full_sina_tencent_yahoo_fallback_chain(self, monkeypatch):
        svc = MarketDataService(http=httpx.AsyncClient(transport=httpx.MockTransport(
            lambda request: httpx.Response(500, request=request)
        )))
        calls = []

        async def sina(code, scale, count):
            calls.append(("sina", code, scale, count))
            return []

        async def tencent(code, count):
            calls.append(("tencent", code, count))
            raise httpx.ConnectTimeout("tencent timeout")

        async def yahoo(code, period, count):
            calls.append(("yahoo", code, period, count))
            return [{"day": "2026-07-24", "close": 1297.4, "source": "yahoo"}]

        monkeypatch.setattr(svc, "_kline_sina", sina)
        monkeypatch.setattr(svc, "_kline_tencent", tencent)
        monkeypatch.setattr(svc, "_kline_yahoo", yahoo)

        items = await svc.kline("600519", "1d", 2)

        assert items[0]["source"] == "yahoo"
        assert calls == [
            ("sina", "sh600519", 240, 2),
            ("tencent", "sh600519", 2),
            ("yahoo", "sh600519", "1d", 2),
        ]
        await svc.aclose()

    @pytest.mark.asyncio
    async def test_quote_enriched_fills_only_missing_fields(self, monkeypatch):
        svc = MarketDataService(http=httpx.AsyncClient(transport=httpx.MockTransport(
            lambda request: httpx.Response(500, request=request)
        )))

        async def tencent(codes):
            return [{
                "code": codes[0], "name": "贵州茅台", "price": 1300,
                "pe": None, "pb": 7.0, "market_cap": 1_000,
                "turnover_rate": 0.5, "source": "tencent",
            }]

        async def sina(codes):
            return [{
                "code": codes[0], "name": "错误名称", "price": 999,
                "pe": 20.0, "pb": None, "market_cap": None,
                "turnover_rate": None, "source": "sina",
            }]

        monkeypatch.setattr(svc, "_quotes_tencent", tencent)
        monkeypatch.setattr(svc, "_quotes_sina", sina)

        quote = await svc.quote_enriched("600519")

        assert quote["name"] == "贵州茅台"
        assert quote["price"] == 1300
        assert quote["pe"] == 20.0
        assert quote["sources"] == ["tencent", "sina"]
        assert quote["missing_fields"] == []
        await svc.aclose()

    @pytest.mark.asyncio
    async def test_prefetch_preserves_per_ticker_errors(self, monkeypatch):
        svc = MarketDataService(http=httpx.AsyncClient(transport=httpx.MockTransport(
            lambda request: httpx.Response(500, request=request)
        )))

        async def enriched(ticker):
            if ticker == "BAD":
                raise MarketError("unknown")
            return {"code": ticker, "price": 1}

        monkeypatch.setattr(svc, "quote_enriched", enriched)
        result = await svc.prefetch_quotes(["AAPL", "BAD"], concurrency=2)

        assert result["items"] == [{"code": "AAPL", "price": 1}]
        assert result["errors"] == {"BAD": "unknown"}
        await svc.aclose()

    @pytest.mark.asyncio
    async def test_source_priority_is_validated_and_reported(self):
        svc = MarketDataService(http=httpx.AsyncClient(transport=httpx.MockTransport(
            lambda request: httpx.Response(500, request=request)
        )))
        svc.configure_source_priority("quote", ["sina", "tencent", "yahoo"])
        assert svc.source_status()["priorities"]["quote"][0] == "sina"
        with pytest.raises(ValueError, match="必须且只能"):
            svc.configure_source_priority("quote", ["sina", "yahoo"])
        with pytest.raises(ValueError, match="kind"):
            svc.configure_source_priority("fundamentals", ["sina", "tencent", "yahoo"])
        await svc.aclose()


class TestResolveTicker:
    @pytest.mark.asyncio
    async def test_default_clients_keep_domestic_direct_and_yahoo_proxy_policies(self, monkeypatch):
        created = []

        class StubClient:
            def __init__(self, **kwargs):
                self.kwargs = kwargs
                self.close_count = 0
                created.append(self)

            async def aclose(self):
                self.close_count += 1

        monkeypatch.setattr(market_data.httpx, "AsyncClient", StubClient)

        svc = MarketDataService()

        assert [client.kwargs["trust_env"] for client in created] == [False, True]
        assert svc.http is created[0]
        assert svc.yahoo_http is created[1]
        await svc.aclose()
        assert [client.close_count for client in created] == [1, 1]

    @pytest.mark.asyncio
    async def test_normalized_code_does_not_call_search(self):
        class NoSearchMarket:
            async def search(self, keyword):
                raise AssertionError(f"不应搜索：{keyword}")

        assert await resolve_ticker("AAPL", NoSearchMarket()) == "usAAPL"

    @pytest.mark.asyncio
    async def test_company_name_uses_injected_reusable_market_client(self):
        requests = []

        def handler(request: httpx.Request) -> httpx.Response:
            requests.append(request)
            if "eastmoney.com" in str(request.url):
                return httpx.Response(200, json={
                    "QuotationCodeTable": {"Data": [{
                        "QuoteID": "1.600519",
                        "UnifiedCode": "600519",
                        "Name": "贵州茅台",
                        "Classify": "AStock",
                    }]},
                })
            if "finance.yahoo.com" in str(request.url):
                return httpx.Response(200, json={"quotes": []})
            return httpx.Response(404)

        http = httpx.AsyncClient(transport=httpx.MockTransport(handler))
        svc = MarketDataService(http=http, yahoo_http=http)

        assert await resolve_ticker("贵州茅台", svc) == "sh600519"
        assert len(requests) == 2
        assert svc.http is http and svc.yahoo_http is http
        await svc.aclose()
