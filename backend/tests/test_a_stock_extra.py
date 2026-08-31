from __future__ import annotations

from collections.abc import Callable
from typing import Any

import httpx
import pytest

from app.agent import tools_definitions
from app.agent.tools import ToolRegistry
from app.services import a_stock_extra
from app.services.a_stock_extra import (
    AStockExtraError,
    AStockExtraService,
    EastmoneyThrottle,
    calculate_chip_distribution,
)


def _client(handler: Callable[[httpx.Request], httpx.Response]) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


def _service(handler: Callable[[httpx.Request], httpx.Response]) -> AStockExtraService:
    return AStockExtraService(
        http=_client(handler),
        throttle=EastmoneyThrottle(min_interval=0, jitter=lambda: 0),
    )


def _response(request: httpx.Request, payload: object, status: int = 200) -> httpx.Response:
    return httpx.Response(status, json=payload, request=request)


def _bars() -> list[dict[str, Any]]:
    return [
        {"date": "2026-08-01", "high": 10.5, "low": 9.5, "close": 10.0, "turn": 1.0},
        {"date": "2026-08-02", "high": 11.0, "low": 10.0, "close": 10.8, "turn": 10.0},
    ]


@pytest.mark.asyncio
async def test_eastmoney_throttle_waits_and_reuses_injected_client() -> None:
    clock_values = iter((2.0, 2.0, 2.2, 3.2))
    sleeps: list[float] = []

    async def sleep(delay: float) -> None:
        sleeps.append(delay)

    throttle = EastmoneyThrottle(
        min_interval=1.0,
        jitter=lambda: 0.2,
        clock=lambda: next(clock_values),
        sleep=sleep,
    )
    client = _client(lambda request: _response(request, {"ok": True}))

    await throttle.get(client, "https://push2.eastmoney.com/one")
    await throttle.get(client, "https://push2.eastmoney.com/two")

    assert sleeps == pytest.approx([1.0])
    await client.aclose()


def test_chip_distribution_seeds_first_day_and_validates_input() -> None:
    result = calculate_chip_distribution(_bars())

    assert 0 <= result["profit_ratio"] <= 1
    assert result["cost_90_min"] <= result["cost_70_min"] <= result["cost_70_max"] <= result["cost_90_max"]
    assert result["source"] == "local-computed"
    assert result["quality"] == "INFERENCE"
    assert result["as_of"] == "2026-08-02"

    with pytest.raises(ValueError, match="缺少字段"):
        calculate_chip_distribution([{"date": "2026-08-01"}])
    with pytest.raises(ValueError, match="grid_size"):
        calculate_chip_distribution(_bars(), grid_size=10)
    with pytest.raises(ValueError, match="价格字段无效"):
        calculate_chip_distribution([{**_bars()[0], "high": 1, "low": 2}])


def test_local_helper_edge_cases_are_explicit() -> None:
    assert a_stock_extra._normalize_a_share("SH600519") == ("sh", "600519")
    assert a_stock_extra._normalize_a_share("000001.SZ") == ("sz", "000001")
    assert a_stock_extra._normalize_a_share("830001") == ("bj", "830001")
    assert a_stock_extra._normalize_a_share("600519") == ("sh", "600519")
    assert a_stock_extra._normalize_a_share("000001") == ("sz", "000001")
    with pytest.raises(ValueError, match="市场标识冲突"):
        a_stock_extra._normalize_a_share("sz600519")
    with pytest.raises(ValueError, match="6 位"):
        a_stock_extra._normalize_a_share("AAPL")
    with pytest.raises(ValueError, match="无法识别"):
        a_stock_extra._normalize_a_share("700001")
    with pytest.raises(ValueError, match="有效数字"):
        a_stock_extra._number("bad", "fixture")
    with pytest.raises(ValueError, match="有限数字"):
        a_stock_extra._number(float("nan"), "fixture")
    assert a_stock_extra._optional_number(None) is None
    assert a_stock_extra._optional_number("bad") is None
    assert a_stock_extra._optional_number(float("inf")) is None
    assert a_stock_extra._wan(None) is None

    assert a_stock_extra._triangular_weights([0.0, 1.0], 2.0, 1.0, 1.5) == [0.0, 0.0]
    assert a_stock_extra._triangular_weights([0.0, 1.0], 1.0, 1.0, 1.0) == [0.0, 1.0]
    assert a_stock_extra._triangular_weights([0.0, 2.0], 0.9, 1.1, 1.0) == [1.0, 0.0]
    assert a_stock_extra._weighted_quantile([1.0, 2.0], [1.0, 0.0], 0.5) == 1.0
    assert a_stock_extra._weighted_quantile([1.0, 2.0], [0.0, 0.0], 0.5) == 2.0

    with pytest.raises(ValueError, match="decay"):
        calculate_chip_distribution(_bars(), decay=0)
    with pytest.raises(ValueError, match="有效行数"):
        calculate_chip_distribution([])
    one_price = calculate_chip_distribution([
        {"date": "2026-08-01", "high": 10, "low": 10, "close": 10, "turn": 1},
    ])
    assert one_price["peak"] == pytest.approx(10, abs=0.1)


@pytest.mark.asyncio
async def test_chip_distribution_fetches_eastmoney_kline_with_turnover() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.host == "push2his.eastmoney.com"
        assert request.url.params["secid"] == "1.600519"
        return _response(request, {"data": {"klines": [
            "2026-08-01,9.8,10,10.5,9.5,100,1000,1,2,0.2,1.0",
            "2026-08-02,10,10.8,11,10,120,1200,1,2,0.2,10.0",
        ]}})

    service = _service(handler)
    result = await service.chip_distribution("600519")

    assert result["ticker"] == "600519"
    assert result["peak"] > 0
    await service.http.aclose()  # type: ignore[union-attr]


@pytest.mark.asyncio
async def test_chip_distribution_reports_upstream_failure() -> None:
    service = _service(lambda request: _response(request, {"error": "blocked"}, 503))

    with pytest.raises(AStockExtraError, match="筹码分布.*东财请求失败"):
        await service.chip_distribution("600519")

    await service.http.aclose()  # type: ignore[union-attr]


@pytest.mark.asyncio
async def test_chip_distribution_rejects_changed_kline_schema_and_non_object_json() -> None:
    payloads = iter((
        {"data": {"klines": ["2026-08-01,broken,10,11,9,0,0,0,0,0,1"]}},
        {"data": {"klines": ["too,short"]}},
        {"data": []},
        ["not", "an", "object"],
    ))
    service = _service(lambda request: _response(request, next(payloads)))

    with pytest.raises(AStockExtraError, match="K 线字段格式已变化"):
        await service.chip_distribution("600519")
    with pytest.raises(AStockExtraError, match="未返回带换手率"):
        await service.chip_distribution("600519")
    with pytest.raises(AStockExtraError, match="data 字段格式"):
        await service.chip_distribution("600519")
    with pytest.raises(AStockExtraError, match="不是 JSON 对象"):
        await service.chip_distribution("600519")

    await service.http.aclose()  # type: ignore[union-attr]


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("period", "host", "line", "time_key"),
    [
        ("minute", "push2.eastmoney.com", "14:30,100,20,30,40,50", "time"),
        ("120d", "push2his.eastmoney.com", "2026-08-29,100,20,30,40,50,0", "date"),
    ],
)
async def test_money_flow_parses_minute_and_120d(
    period: str, host: str, line: str, time_key: str
) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.host == host
        return _response(request, {"data": {"klines": [line]}})

    service = _service(handler)
    result = await service.money_flow("000001", period)

    assert result["main_net"] == 100
    assert result["large_net"] == 40
    assert result["medium_net"] == 30
    assert result["items"][0][time_key]
    await service.http.aclose()  # type: ignore[union-attr]


@pytest.mark.asyncio
async def test_money_flow_rejects_empty_or_invalid_period() -> None:
    service = _service(lambda request: _response(request, {"data": None}))

    with pytest.raises(AStockExtraError, match="未返回资金流数据"):
        await service.money_flow("600519")
    with pytest.raises(ValueError, match="period"):
        await service.money_flow("600519", "weekly")

    await service.http.aclose()  # type: ignore[union-attr]


@pytest.mark.asyncio
async def test_money_flow_rejects_non_iterable_kline_shape() -> None:
    service = _service(lambda request: _response(request, {"data": {"klines": 123}}))

    with pytest.raises(AStockExtraError, match="字段格式已变化"):
        await service.money_flow("600519")

    await service.http.aclose()  # type: ignore[union-attr]


@pytest.mark.asyncio
async def test_limit_pool_parses_success_and_marks_non_trading_unknown() -> None:
    payloads = iter((
        {"data": {"pool": [{
            "c": "000001", "n": "平安银行", "lbc": 2, "fund": 123_000_000,
            "zbc": 1, "hybk": "银行", "zttj": {"days": 3, "ct": 2},
        }]}},
        {"data": None},
    ))
    service = _service(lambda request: _response(request, next(payloads)))

    success = await service.limit_pool("2026-08-28")
    unknown = await service.limit_pool("20260830")

    assert success["items"][0] == {
        "code": "000001", "name": "平安银行", "limit_up_count": 2,
        "seal_amount": 123_000_000.0, "break_times": 1, "industry": "银行", "limit_stat": "3天2板",
    }
    assert unknown["quality"] == "UNKNOWN"
    assert unknown["items"] == []
    await service.http.aclose()  # type: ignore[union-attr]


@pytest.mark.asyncio
async def test_limit_pool_surfaces_http_failure_and_bad_parameters() -> None:
    service = _service(lambda request: _response(request, {}, 429))

    with pytest.raises(AStockExtraError, match="涨跌停池.*东财请求失败"):
        await service.limit_pool("2026-08-28")
    with pytest.raises(ValueError, match="pool"):
        await service.limit_pool("2026-08-28", "broken")
    with pytest.raises(ValueError, match="date"):
        await service.limit_pool("08/28/2026")

    await service.http.aclose()  # type: ignore[union-attr]


@pytest.mark.asyncio
async def test_limit_down_pool_and_schema_failures_are_preserved() -> None:
    payloads = iter((
        {"data": {"pool": [{"c": "000001", "n": "平安银行", "fund": "-"}]}},
        {"data": {"pool": [{"c": "", "n": "missing"}]}},
    ))
    service = _service(lambda request: _response(request, next(payloads)))

    down = await service.limit_pool("2026-08-28", "limit_down")
    assert down["items"][0]["limit_up_count"] is None
    assert down["items"][0]["seal_amount"] is None
    with pytest.raises(AStockExtraError, match="缺少代码或名称"):
        await service.limit_pool("2026-08-28")

    await service.http.aclose()  # type: ignore[union-attr]


@pytest.mark.asyncio
async def test_dragon_tiger_returns_records_and_top_five_seats() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        report = request.url.params["reportName"]
        if report == "RPT_DAILYBILLBOARD_DETAILSNEW":
            rows = [{
                "TRADE_DATE": "2026-08-28 00:00:00", "SECURITY_NAME_ABBR": "平安银行",
                "EXPLANATION": "日涨幅偏离值", "BILLBOARD_NET_AMT": 50_000_000,
            }]
        elif report == "RPT_BILLBOARD_DAILYDETAILSBUY":
            rows = [{"OPERATEDEPT_NAME": "机构专用", "BUY": 20_000_000, "SELL": 1_000_000, "NET": 19_000_000}]
        else:
            rows = [{"OPERATEDEPT_NAME": "深股通", "BUY": 2_000_000, "SELL": 10_000_000, "NET": -8_000_000}]
        return _response(request, {"success": True, "result": {"data": rows}})

    service = _service(handler)
    result = await service.dragon_tiger("000001", "2026-08-28")

    item = result["items"][0]
    assert item["net"] == 5000.0
    assert item["top5_buy"][0]["name"] == "机构专用"
    assert item["top5_sell"][0]["net"] == -800.0
    await service.http.aclose()  # type: ignore[union-attr]


@pytest.mark.asyncio
async def test_dragon_tiger_empty_window_is_not_an_error() -> None:
    service = _service(lambda request: _response(request, {"success": True, "result": None}))

    result = await service.dragon_tiger("600519", "2026-08-28")

    assert result["items"] == []
    assert result["note"] == "回看窗口内无龙虎榜记录"
    await service.http.aclose()  # type: ignore[union-attr]


@pytest.mark.asyncio
async def test_dragon_tiger_surfaces_datacenter_rejection() -> None:
    service = _service(lambda request: _response(request, {"success": False, "code": 429}))

    with pytest.raises(AStockExtraError, match="数据中心拒绝"):
        await service.dragon_tiger("600519", "2026-08-28")

    await service.http.aclose()  # type: ignore[union-attr]


@pytest.mark.asyncio
async def test_dragon_tiger_validates_window_and_datacenter_shape() -> None:
    service = _service(lambda request: _response(request, {"success": True, "result": {"data": {"bad": True}}}))

    with pytest.raises(ValueError, match="look_back"):
        await service.dragon_tiger("600519", "2026-08-28", look_back=0)
    with pytest.raises(AStockExtraError, match="data 字段格式"):
        await service.dragon_tiger("600519", "2026-08-28")

    await service.http.aclose()  # type: ignore[union-attr]


def _tencent_quote_response(request: httpx.Request) -> httpx.Response:
    fields = [""] * 50
    fields[1], fields[3], fields[39], fields[46] = "贵州茅台", "1500", "22.5", "7.2"
    raw = f'v_sh600519="{"~".join(fields)}";'
    return httpx.Response(200, content=raw.encode("gbk"), request=request)


@pytest.mark.asyncio
async def test_valuation_history_returns_current_snapshot_and_explicit_unknown_history() -> None:
    service = _service(_tencent_quote_response)

    result = await service.valuation_history("600519")

    assert result["snapshot"] == {"name": "贵州茅台", "price": 1500.0, "pe": 22.5, "pb": 7.2}
    assert result["history"] == "UNKNOWN"
    assert result["quality"] == "PARTIAL"
    assert "without_baostock" in result["quality_flags"][0]
    await service.http.aclose()  # type: ignore[union-attr]


@pytest.mark.asyncio
async def test_valuation_history_keeps_unknown_when_snapshot_fails() -> None:
    service = _service(lambda request: _response(request, {}, 503))

    result = await service.valuation_history("600519")

    assert result["snapshot"] is None
    assert result["history"] == "UNKNOWN"
    assert result["quality"] == "UNKNOWN"
    assert "current_snapshot_unavailable" in result["quality_flags"]
    assert result["error"]
    await service.http.aclose()  # type: ignore[union-attr]


@pytest.mark.asyncio
async def test_valuation_history_marks_empty_success_response_unknown() -> None:
    service = _service(lambda request: httpx.Response(200, content=b'v_sh600519="";', request=request))

    result = await service.valuation_history("600519")

    assert result["quality"] == "UNKNOWN"
    assert "ValueError" in result["error"]
    await service.http.aclose()  # type: ignore[union-attr]


@pytest.mark.asyncio
async def test_four_agent_tools_dispatch_and_close_service(monkeypatch: pytest.MonkeyPatch) -> None:
    closed: list[bool] = []

    class FakeExtra:
        async def chip_distribution(self, ticker: str) -> dict[str, str]:
            return {"capability": "chip", "ticker": ticker}

        async def money_flow(self, ticker: str, period: str) -> dict[str, str]:
            return {"capability": "flow", "ticker": ticker, "period": period}

        async def dragon_tiger(self, ticker: str, trade_date: str) -> dict[str, str]:
            return {"capability": "dragon", "ticker": ticker, "date": trade_date}

        async def limit_pool(self, trade_date: str) -> dict[str, str]:
            return {"capability": "limit", "date": trade_date}

        async def aclose(self) -> None:
            closed.append(True)

    monkeypatch.setattr(tools_definitions, "AStockExtraService", FakeExtra)
    monkeypatch.setattr(ToolRegistry, "_instance", None)
    registry = ToolRegistry()

    chip = await registry.dispatch("get_chip_distribution", {"ticker": "600519"})
    flow = await registry.dispatch("get_money_flow", {"ticker": "600519", "period": "120d"})
    dragon = await registry.dispatch("get_dragon_tiger", {"ticker": "600519", "date": "2026-08-28"})
    limit_up = await registry.dispatch("get_limit_up_pool", {"date": "2026-08-28"})
    invalid = await registry.dispatch("get_dragon_tiger", {"ticker": "600519"})

    assert [chip.data["capability"], flow.data["capability"], dragon.data["capability"], limit_up.data["capability"]] == [
        "chip", "flow", "dragon", "limit",
    ]
    assert invalid.success is False
    assert len(closed) == 4


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("tool", "kwargs"),
    [
        (tools_definitions.GetChipDistribution(), {"ticker": "600519"}),
        (tools_definitions.GetMoneyFlow(), {"ticker": "600519"}),
        (tools_definitions.GetDragonTiger(), {"ticker": "600519", "date": "2026-08-28"}),
        (tools_definitions.GetLimitUpPool(), {"date": "2026-08-28"}),
    ],
)
async def test_agent_tools_return_explicit_provider_errors(
    monkeypatch: pytest.MonkeyPatch, tool: Any, kwargs: dict[str, str]
) -> None:
    class BrokenExtra:
        def __getattr__(self, name: str) -> Callable[..., Any]:
            async def fail(*args: Any, **inner_kwargs: Any) -> Any:
                raise AStockExtraError(name, "fixture blocked")

            return fail

        async def aclose(self) -> None:
            return None

    monkeypatch.setattr(tools_definitions, "AStockExtraService", BrokenExtra)

    result = await tool.run(**kwargs)

    assert result.success is False
    assert "fixture blocked" in result.error


@pytest.mark.asyncio
async def test_owned_client_closes_and_a_share_normalization_covers_bj() -> None:
    service = AStockExtraService(throttle=EastmoneyThrottle(min_interval=0))
    client = service.http
    assert a_stock_extra._secid("920982.BJ") == ("920982", "0.920982")

    await service.aclose()

    assert client is not None and client.is_closed
