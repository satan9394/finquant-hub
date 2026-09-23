"""Deterministic branch coverage for BACKLOG-007 priority modules."""

import asyncio
import json
from datetime import date
from types import SimpleNamespace
from unittest.mock import AsyncMock

import httpx
import pytest
from fastapi import BackgroundTasks, HTTPException
from pydantic import ValidationError

from app.orchestrator import TeamAgent, TeamDefinition
from app.routers import backtests, settings
from app.services import discussion_orch, market_review, model_router, swarm_orch
from app.services.llm_client import LLMError
from app.services.market_data import MarketError
from app.services.market_overview import MarketOverviewService, _number
from app.services.news_search import NewsSearchService
from app.tools import mcp_bridge


def _request(market=None, scheduler_task=None):
    return SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(
        market=market,
        scheduler_task=scheduler_task,
    )))


def _backtest_body(**changes):
    values = {
        "symbol": "600519",
        "start_date": date(2025, 1, 1),
        "end_date": date(2025, 12, 31),
        "short_window": 20,
        "long_window": 50,
    }
    values.update(changes)
    return backtests.BacktestCreate(**values)


def _portfolio_body():
    return backtests.PortfolioBacktestCreate(
        assets=[
            {"symbol": "600519", "short_window": 20, "long_window": 50},
            {"symbol": "000001", "short_window": 10, "long_window": 30},
        ],
        count=150,
    )


@pytest.mark.parametrize("changes", [
    {"start_date": date(2025, 12, 31), "end_date": date(2025, 1, 1)},
    {"short_window": 50, "long_window": 50},
])
def test_backtest_create_rejects_invalid_relationships(changes):
    with pytest.raises(ValidationError):
        _backtest_body(**changes)


def test_portfolio_models_reject_duplicate_assets_and_short_history():
    with pytest.raises(ValidationError, match="不能重复"):
        backtests.PortfolioBacktestCreate(
            assets=[{"symbol": "600519"}, {"symbol": " 600519 "}], count=150,
        )
    with pytest.raises(ValidationError, match="count 至少需要"):
        backtests.PortfolioBacktestCreate(
            assets=[{"symbol": "600519"}, {"symbol": "000001"}], count=50,
        )
    with pytest.raises(ValidationError, match="long_window"):
        backtests.PortfolioAsset(symbol="600519", short_window=20, long_window=20)


@pytest.mark.asyncio
async def test_backtest_route_validation_and_list_filters(monkeypatch):
    monkeypatch.setattr(backtests, "external_symbol", lambda _symbol: (_ for _ in ()).throw(ValueError("bad symbol")))
    with pytest.raises(HTTPException) as create_error:
        await backtests.create_backtest(_backtest_body(), _request(), BackgroundTasks(), {"id": 1})
    assert create_error.value.status_code == 400
    with pytest.raises(HTTPException) as list_error:
        await backtests.list_backtests({"id": 1}, symbol="bad")
    assert list_error.value.status_code == 400

    captured = {}

    async def query_all(sql, values):
        captured.update(sql=sql, values=values)
        return []

    monkeypatch.setattr(backtests, "external_symbol", lambda symbol: f"cn:{symbol}")
    monkeypatch.setattr(backtests.database, "query_all", query_all)
    result = await backtests.list_backtests({"id": 7}, symbol="600519", saved_only=True)
    assert result == {"items": [], "total": 0}
    assert "symbol=?" in captured["sql"] and "is_saved=1" in captured["sql"]
    assert captured["values"] == (7, "cn:600519")


@pytest.mark.asyncio
async def test_backtest_job_early_exit_and_failure_classes(monkeypatch):
    set_status = AsyncMock()
    monkeypatch.setattr(backtests, "_set_status", set_status)
    monkeypatch.setattr(backtests.database, "query_one", AsyncMock(return_value=None))
    await backtests._run_job(1, object(), 7)
    set_status.assert_not_awaited()

    params = _backtest_body().model_dump(mode="json")
    row = {"status": "queued", "params_json": json.dumps(params)}
    monkeypatch.setattr(backtests.database, "query_one", AsyncMock(return_value=row))

    class FailingInstrument:
        def __init__(self, _market):
            pass

        async def bars(self, *_args):
            raise MarketError("market down")

    monkeypatch.setattr(backtests, "InstrumentService", FailingInstrument)
    await backtests._run_job(2, object(), 7)
    assert set_status.await_args_list[-1].kwargs["error"] == "market down"

    class BrokenInstrument(FailingInstrument):
        async def bars(self, *_args):
            raise RuntimeError("secret detail")

    monkeypatch.setattr(backtests, "InstrumentService", BrokenInstrument)
    await backtests._run_job(3, object(), 7)
    assert set_status.await_args_list[-1].kwargs["error"] == "回测执行失败：RuntimeError"


@pytest.mark.asyncio
@pytest.mark.parametrize("failure, expected_status", [
    (MarketError("loader down"), 502),
    (ValueError("invalid portfolio"), 422),
])
async def test_portfolio_backtest_normalizes_assets_and_maps_failures(monkeypatch, failure, expected_status):
    monkeypatch.setattr(backtests, "external_symbol", lambda symbol: f"cn:{symbol.strip()}")

    class Registry:
        async def load(self, symbol, period, count):
            return {
                "items": [{"day": "2025-01-01", "close": 10}],
                "instrument": {"market": "cn"},
                "provider": "fixture",
                "quality_flags": [],
            }

    monkeypatch.setattr(backtests, "default_loader_registry", lambda _market: Registry())
    monkeypatch.setattr(backtests, "run_portfolio_backtest", lambda *_args, **_kwargs: (_ for _ in ()).throw(failure))
    with pytest.raises(HTTPException) as exc:
        await backtests.create_portfolio_backtest(_portfolio_body(), _request(object()), {"id": 1})
    assert exc.value.status_code == expected_status


@pytest.mark.asyncio
async def test_portfolio_backtest_rejects_normalized_duplicate(monkeypatch):
    monkeypatch.setattr(backtests, "external_symbol", lambda _symbol: "cn:duplicate")
    with pytest.raises(HTTPException) as exc:
        await backtests.create_portfolio_backtest(_portfolio_body(), _request(object()), {"id": 1})
    assert exc.value.status_code == 422


@pytest.mark.asyncio
async def test_backtest_detail_trade_save_and_cancel_error_states(monkeypatch):
    monkeypatch.setattr(backtests.database, "query_one", AsyncMock(return_value=None))
    for call in (
        lambda: backtests.get_backtest(1, {"id": 7}),
        lambda: backtests.get_backtest_trades(1, {"id": 7}),
        lambda: backtests.save_backtest(1, {"id": 7}),
        lambda: backtests.cancel_backtest(1, {"id": 7}),
    ):
        with pytest.raises(HTTPException) as exc:
            await call()
        assert exc.value.status_code == 404

    monkeypatch.setattr(backtests.database, "query_one", AsyncMock(return_value={"status": "running"}))
    with pytest.raises(HTTPException) as exc:
        await backtests.save_backtest(1, {"id": 7})
    assert exc.value.status_code == 409
    monkeypatch.setattr(backtests.database, "query_one", AsyncMock(return_value={"status": "completed"}))
    with pytest.raises(HTTPException) as exc:
        await backtests.cancel_backtest(1, {"id": 7})
    assert exc.value.status_code == 409


def test_settings_models_require_updates_and_validate_optional_cron():
    with pytest.raises(ValidationError, match="至少提交一个系统配置"):
        settings.SystemSettingsUpdate()
    with pytest.raises(ValidationError, match="至少提交一个定时任务配置"):
        settings.ScheduledResearchUpdate()
    assert settings.ScheduledResearchUpdate(cron_expr=None).cron_expr is None


@pytest.mark.asyncio
async def test_system_settings_admin_gate_and_scheduler_restart(monkeypatch):
    body = settings.SystemSettingsUpdate(scheduler_enabled=False)
    with pytest.raises(HTTPException) as exc:
        await settings.update_system_settings(body, _request(), {"id": 1, "is_admin": False})
    assert exc.value.status_code == 403

    task = asyncio.create_task(asyncio.Event().wait())
    save = AsyncMock()
    monkeypatch.setattr(settings, "save_system_settings", save)
    monkeypatch.setattr(settings.config, "SCHEDULER_ENABLED", False)
    monkeypatch.setattr(settings, "current_system_settings", lambda: {"scheduler_enabled": False})
    request = _request(object(), task)
    result = await settings.update_system_settings(body, request, {"id": 1, "is_admin": True})
    assert task.cancelled()
    assert request.app.state.scheduler_task is None
    assert result["settings"] == {"scheduler_enabled": False}
    save.assert_awaited_once_with({"scheduler_enabled": False})


@pytest.mark.asyncio
async def test_settings_product_metric_and_run_lookup_errors(monkeypatch):
    monkeypatch.setattr(settings, "record_product_metric", AsyncMock(side_effect=ValueError("bad metric")))
    with pytest.raises(HTTPException) as exc:
        await settings.add_product_metric_event(
            settings.ProductMetricEventInput(event_name="first_value"), {"id": 3},
        )
    assert exc.value.status_code == 422

    monkeypatch.setattr(settings, "list_research_runs", AsyncMock(side_effect=LookupError("missing job")))
    with pytest.raises(HTTPException) as exc:
        await settings.get_scheduled_research_runs(4, {"id": 3})
    assert exc.value.status_code == 404


@pytest.mark.asyncio
async def test_settings_create_and_patch_normalization_errors(monkeypatch):
    monkeypatch.setattr(settings, "normalize_code", lambda _ticker: (_ for _ in ()).throw(ValueError("bad ticker")))
    create = settings.ScheduledResearchCreate(
        name="Daily", ticker="bad", cron_expr="0 18 * * 1-5",
    )
    with pytest.raises(HTTPException) as exc:
        await settings.create_scheduled_research_job(create, {"id": 3})
    assert exc.value.status_code == 400

    patch = settings.ScheduledResearchUpdate(ticker="bad")
    with pytest.raises(HTTPException) as exc:
        await settings.patch_scheduled_research_job(4, patch, {"id": 3})
    assert exc.value.status_code == 400


@pytest.mark.asyncio
async def test_settings_delete_and_manual_run_conflicts(monkeypatch):
    monkeypatch.setattr(settings, "get_research_job", AsyncMock(return_value=None))
    with pytest.raises(HTTPException) as exc:
        await settings.delete_scheduled_research_job(4, {"id": 3})
    assert exc.value.status_code == 404

    monkeypatch.setattr(settings, "get_research_job", AsyncMock(return_value={"last_status": "idle"}))
    monkeypatch.setattr(settings.database, "query_one", AsyncMock(return_value={"id": 9}))
    with pytest.raises(HTTPException) as exc:
        await settings.delete_scheduled_research_job(4, {"id": 3})
    assert exc.value.status_code == 409

    monkeypatch.setattr(settings, "recover_stale_research_runs", AsyncMock())
    monkeypatch.setattr(settings, "get_research_job", AsyncMock(return_value={"last_status": "running"}))
    with pytest.raises(HTTPException) as exc:
        await settings.run_scheduled_research_job(4, BackgroundTasks(), {"id": 3})
    assert exc.value.status_code == 409

    monkeypatch.setattr(settings, "get_research_job", AsyncMock(return_value=None))
    with pytest.raises(HTTPException) as exc:
        await settings.run_scheduled_research_job(4, BackgroundTasks(), {"id": 3})
    assert exc.value.status_code == 404


def test_market_review_parser_and_delivery_edge_cases():
    assert market_review._parse_report("```json\n{broken}\n```")["parse_status"] == "fallback"
    assert market_review._parse_report("[1, 2]")["summary"] == "[1, 2]"
    text = market_review._delivery_text({
        "report": {"summary": "复盘", "sector_mainline": ["skip", {"name": "AI"}]},
    })
    assert "AI：unknown" in text


@pytest.mark.asyncio
async def test_market_review_snapshot_keeps_section_failure(monkeypatch):
    class Overview:
        def __init__(self, _market):
            pass

        async def overview(self, name):
            if name == "hk":
                raise MarketError("hk down")
            return {"status": "ok", "market": name}

        async def sectors(self, kind, _limit):
            return {"kind": kind}

        async def popular(self, _limit):
            return {"items": []}

        async def limit_up(self, _day):
            raise ValueError("holiday")

    monkeypatch.setattr(market_review, "MarketOverviewService", Overview)
    result = await market_review.collect_market_snapshot(object(), ["cn", "hk"], date(2026, 8, 30))
    assert result["data"]["overview_hk"] == {"status": "unavailable", "error": "hk down"}
    assert result["data"]["limit_up"] == {"status": "unavailable", "error": "holiday"}


@pytest.mark.asyncio
async def test_market_review_list_get_and_scheduled_creation(monkeypatch):
    row = {"markets_json": '["cn"]', "snapshot_json": None, "report_json": None}
    monkeypatch.setattr(market_review.database, "query_all", AsyncMock(return_value=[row.copy()]))
    assert (await market_review.list_market_reviews(1))[0]["snapshot"] == {}
    monkeypatch.setattr(market_review.database, "query_one", AsyncMock(return_value=None))
    assert await market_review.get_market_review(1, 1) is None
    create = AsyncMock(return_value={"id": 9})
    monkeypatch.setattr(market_review, "create_market_review", create)
    assert await market_review.run_scheduled_market_review(object(), 1) == {"id": 9}
    create.assert_awaited_once()


@pytest.mark.asyncio
async def test_news_keyed_provider_handlers_and_normalization(monkeypatch):
    monkeypatch.setenv("SERPAPI_API_KEY", "serp")
    monkeypatch.setenv("BOCHA_API_KEY", "bocha")
    monkeypatch.setenv("SEARXNG_BASE_URL", "https://search.example.test/")

    def handler(request):
        if request.url.host == "serpapi.com":
            return httpx.Response(200, json={"news_results": [{"title": "Serp", "link": "https://n/serp"}]})
        if request.url.host == "api.bochaai.com":
            return httpx.Response(200, json={"data": {"webPages": {"value": [{"name": "Bocha", "url": "https://n/bocha"}]}}})
        return httpx.Response(200, json={"results": [{"title": "Searx", "url": "https://n/searx"}]})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        result = await NewsSearchService(client, providers=("serpapi", "bocha", "searxng")).search(
            "finance", strategy="aggregate",
        )
    assert result["providers_used"] == ["serpapi", "bocha", "searxng"]
    assert {item["provider"] for item in result["news"]} == {"serpapi", "bocha", "searxng"}


@pytest.mark.asyncio
async def test_news_permanent_google_error_and_unconfigured_provider(monkeypatch):
    monkeypatch.delenv("TAVILY_API_KEY", raising=False)
    async with httpx.AsyncClient(transport=httpx.MockTransport(lambda request: httpx.Response(400, request=request))) as client:
        result = await NewsSearchService(client, providers=("google_news",)).search("finance")
        with pytest.raises(ValueError, match="没有可用"):
            await NewsSearchService(client, providers=("tavily",)).search("finance")
    assert result["errors"] == {"google_news": "HTTPStatusError"}
    assert NewsSearchService._normalize("fixture", [{"title": ""}, {"name": "Name", "category": "Macro"}]) == [{
        "title": "Name", "source": "fixture", "published_at": "", "url": "", "provider": "fixture", "category": "Macro",
    }]


@pytest.mark.asyncio
async def test_discussion_market_context_success_and_failure(monkeypatch):
    class Market:
        should_fail = False

        async def quote(self, _ticker):
            if self.should_fail:
                raise MarketError("down")
            return {
                "code": "sh600519", "name": "贵州茅台", "price": 1300,
                "change_percent": 1, "open": 1290, "high": 1310, "low": 1280,
                "pe": 20, "pb": 8, "market_cap": 20000, "turnover_rate": 1,
            }

        async def aclose(self):
            self.closed = True

    success = Market()
    monkeypatch.setattr(discussion_orch, "MarketDataService", lambda: success)
    assert "贵州茅台" in await discussion_orch._market_context("讨论 600519")
    failure = Market()
    failure.should_fail = True
    monkeypatch.setattr(discussion_orch, "MarketDataService", lambda: failure)
    assert "获取失败" in await discussion_orch._market_context("讨论 600519")
    assert success.closed and failure.closed


@pytest.mark.asyncio
async def test_discussion_missing_preset_and_stream_error_mapping(monkeypatch):
    room = {
        "id": 1, "user_id": 7, "topic": "主题", "total_rounds": 1,
        "conversation_id": 9, "participants": [{"role_key": "missing"}],
    }
    monkeypatch.setattr(discussion_orch.database, "query_all", AsyncMock(return_value=[]))
    assert [event async for event in discussion_orch.run_discussion(room)] == [
        ("error", {"error": "角色预设不存在：missing"}),
    ]

    async def llm_failure(*_args, **_kwargs):
        if False:
            yield None
        raise LLMError("no model")

    monkeypatch.setattr(discussion_orch, "run_discussion", llm_failure)
    events = [event async for event in discussion_orch.stream_discussion(room)]
    assert json.loads(events[0]["data"]) == {"error": "no model"}

    async def runtime_failure(*_args, **_kwargs):
        if False:
            yield None
        raise RuntimeError("broken DAG")

    monkeypatch.setattr(discussion_orch, "run_discussion", runtime_failure)
    events = [event async for event in discussion_orch.stream_discussion(room)]
    assert "讨论编排错误：broken DAG" in events[0]["data"]


def test_swarm_report_builders_handle_invalid_agent_results():
    four = swarm_orch.build_four_masters_report("usAAPL", "Apple", {"agent_results": []})
    earnings = swarm_orch.build_earnings_review_report(
        "usAAPL", "Apple", {"agent_results": {"earnings_editor": {"content": 123}}},
    )
    assert four["value_analysis"] == ""
    assert earnings["reader_review"] == ""


@pytest.mark.asyncio
async def test_swarm_fundamentals_failure_is_explicit(monkeypatch):
    class Market:
        async def aclose(self):
            self.closed = True

    market = Market()

    class Instruments:
        def __init__(self, _market):
            pass

        async def fundamentals(self, _ticker):
            raise RuntimeError("provider down")

    monkeypatch.setattr(swarm_orch, "MarketDataService", lambda: market)
    monkeypatch.setattr(swarm_orch, "InstrumentService", Instruments)
    result = await swarm_orch._load_fundamentals("usAAPL")
    assert result["provider"] == "unavailable"
    assert result["quality_flags"] == ["fundamentals_unavailable"]
    assert market.closed


@pytest.mark.asyncio
async def test_swarm_reports_missing_tools_and_model_error(monkeypatch):
    missing_team = TeamDefinition(
        version=1,
        key="missing-tools",
        name="Missing tools",
        agents=(TeamAgent(key="agent", name="Agent", system_prompt="Prompt", tools=("not_registered",)),),
    )
    events = [event async for event in swarm_orch._run_team(missing_team, "usAAPL")]
    assert events[0][0] == "error" and "not_registered" in events[0][1]["error"]

    team = TeamDefinition(
        version=1, key="no-tools", name="No tools",
        agents=(TeamAgent(key="agent", name="Agent", system_prompt="Prompt"),),
    )
    monkeypatch.setattr(model_router, "get_client", AsyncMock(side_effect=LLMError("missing key")))
    events = [event async for event in swarm_orch._run_team(team, "usAAPL")]
    assert events == [("error", {"error": "missing key", "message": "missing key"})]


class _ContextClient:
    def __init__(self, list_pages=None, call_error=None):
        self.list_pages = list_pages or []
        self.call_error = call_error

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return False

    async def list_tools(self, cursor=None):
        return self.list_pages.pop(0)

    async def call_tool(self, _name, _arguments):
        raise self.call_error


def test_mcp_config_transport_and_name_validation():
    with pytest.raises(ValueError, match="name"):
        mcp_bridge.MCPServerConfig(name=" ", url="https://example.test")
    with pytest.raises(ValueError, match="args"):
        mcp_bridge.MCPServerConfig(name="http", url="https://example.test", args=("x",))
    with pytest.raises(ValueError, match="command"):
        mcp_bridge.MCPServerConfig(name="stdio", command=" ")
    assert mcp_bridge._local_tool_name("bad server", "x" * 100).startswith("mcp__bad_server")
    assert mcp_bridge._dump_content(object()).startswith("<object object")


@pytest.mark.asyncio
async def test_mcp_repeated_cursor_and_call_exception():
    page = SimpleNamespace(tools=[], next_cursor="repeat")
    bridge = mcp_bridge.MCPBridge(
        mcp_bridge.MCPServerConfig(name="repeat", url="https://example.test"),
        client_factory=lambda: _ContextClient(list_pages=[page, page]),
    )
    with pytest.raises(RuntimeError, match="重复分页游标"):
        await bridge.discover_tools()

    bridge = mcp_bridge.MCPBridge(
        mcp_bridge.MCPServerConfig(name="fail", url="https://example.test"),
        client_factory=lambda: _ContextClient(call_error=RuntimeError("offline")),
    )
    result = await bridge.call_tool("tool", {})
    assert result.success is False and "offline" in result.error


def test_market_overview_numeric_validation_cache_and_breaker(monkeypatch):
    assert _number("bad") is None
    assert _number(None) is None

    class Breaker:
        def allow_request(self):
            return False

    market = SimpleNamespace(
        _breaker=lambda _provider: Breaker(),
        cached_snapshot=lambda *_args: {"cached": True},
    )
    overview = MarketOverviewService(market)
    with pytest.raises(ValueError, match="keyword"):
        asyncio.run(overview.themes(" "))
    with pytest.raises(ValueError, match="sort_by"):
        asyncio.run(overview.themes("AI", sort_by="future"))
    with pytest.raises(ValueError, match="kind"):
        asyncio.run(overview.capital_flow("future"))
    assert asyncio.run(overview.capital_flow("stock")) == {"cached": True}
    with pytest.raises(MarketError, match="熔断"):
        asyncio.run(overview._get_json(("https://example.test",), params={}))


@pytest.mark.asyncio
async def test_market_overview_payload_validation_and_catalog_cache():
    class Breaker:
        def __init__(self, allowed=True):
            self.allowed = allowed
            self.failures = []

        def allow_request(self):
            return self.allowed

        def record_success(self):
            pass

        def record_failure(self, error):
            self.failures.append(error)

    breaker = Breaker()

    def invalid_payload(request):
        return httpx.Response(200, json=[], request=request)

    async with httpx.AsyncClient(transport=httpx.MockTransport(invalid_payload)) as client:
        market = SimpleNamespace(
            http=client,
            _breaker=lambda _provider: breaker,
            cached_snapshot=lambda *_args: {"items": [{"code": "BK1"}]},
        )
        overview = MarketOverviewService(market)
        with pytest.raises(MarketError, match="不可用"):
            await overview._get_json(("https://one.test", "https://two.test"), params={})
        with pytest.raises(MarketError, match="不可用"):
            await overview._post_json("https://one.test", body={})
        assert len(breaker.failures) == 2
        assert await overview._all_sectors("industry") == [{"code": "BK1"}]
        with pytest.raises(ValueError, match="kind"):
            await overview._all_sectors("future")
        with pytest.raises(ValueError, match="market"):
            await overview.overview("future")

    closed_market = SimpleNamespace(_breaker=lambda _provider: Breaker(False))
    with pytest.raises(MarketError, match="熔断"):
        await MarketOverviewService(closed_market)._post_json("https://one.test", body={})


@pytest.mark.asyncio
async def test_market_overview_indices_and_popular_empty_paths(monkeypatch):
    class Market:
        async def index_quote(self, *_args, **_kwargs):
            raise MarketError("index down")

    overview = MarketOverviewService(Market())
    result = await overview.indices("cn")
    assert len(result) == 5 and all(item["status"] == "unavailable" for item in result)

    monkeypatch.setattr(overview, "_post_json", AsyncMock(return_value={"data": [{"sc": "XX000001", "rk": 1}]}))
    assert await overview.popular(5) == {"source": "eastmoney", "items": []}


@pytest.mark.asyncio
async def test_market_overview_tonghuashun_empty_and_error_paths():
    responses = [
        httpx.Response(200, json=[]),
        httpx.Response(200, json={"title": {}, "field": {}}),
        httpx.Response(503),
    ]

    def handler(request):
        response = responses.pop(0)
        response.request = request
        return response

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        market = SimpleNamespace(http=client)
        overview = MarketOverviewService(market)
        assert await overview._tonghuashun_funds("sh600519") is None
        assert await overview._tonghuashun_funds("sh600519") is None
        assert await overview._tonghuashun_funds("sh600519") is None
