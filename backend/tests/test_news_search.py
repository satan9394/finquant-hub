import httpx
import pytest

from app.services.news_search import NewsSearchService


@pytest.mark.asyncio
async def test_fallback_skips_unconfigured_provider_and_records_provenance(monkeypatch):
    monkeypatch.delenv("TAVILY_API_KEY", raising=False)

    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.host == "searchapi.sina.com.cn"
        return httpx.Response(200, json={"result": [{"title": "<em>茅台</em>公告", "source": "新浪", "url": "https://n/1"}]})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
        service = NewsSearchService(http, providers=("tavily", "sina"))
        result = await service.search("茅台")

    assert result["providers_attempted"] == ["sina"]
    assert result["providers_used"] == ["sina"]
    assert result["news"][0]["title"] == "茅台公告"
    assert result["news"][0]["provider"] == "sina"


@pytest.mark.asyncio
async def test_aggregate_normalizes_and_deduplicates_multiple_sources(monkeypatch):
    monkeypatch.setenv("TAVILY_API_KEY", "secret")

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "api.tavily.com":
            return httpx.Response(200, json={"results": [{"title": "共同标题", "url": "https://n/1", "content": "摘要"}]})
        return httpx.Response(200, json={"result": [
            {"title": "共同标题", "url": "https://n/1"},
            {"title": "第二条", "url": "https://n/2"},
        ]})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
        service = NewsSearchService(http, providers=("tavily", "sina"))
        result = await service.search("行业", strategy="aggregate", max_results=10)

    assert result["providers_used"] == ["tavily", "sina"]
    assert [item["url"] for item in result["news"]] == ["https://n/1", "https://n/2"]


@pytest.mark.asyncio
async def test_google_news_rss_normalizes_source_and_description():
    rss = """<?xml version='1.0'?><rss><channel><item>
    <title>茅台公告</title><link>https://news.example/item</link><pubDate>Sun, 10 Aug 2026 08:00:00 GMT</pubDate>
    <description>&lt;b&gt;摘要&lt;/b&gt;</description><source>财经媒体</source>
    </item></channel></rss>"""

    def handler(request: httpx.Request) -> httpx.Response:
        assert str(request.url).startswith("https://news.google.com/rss/search")
        return httpx.Response(200, content=rss.encode(), headers={"content-type": "application/xml"})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
        service = NewsSearchService(http, providers=("google_news",))
        result = await service.search("贵州茅台")

    assert result["providers_used"] == ["google_news"]
    assert result["news"] == [{
        "title": "茅台公告", "source": "财经媒体", "published_at": "Sun, 10 Aug 2026 08:00:00 GMT",
        "url": "https://news.example/item", "snippet": "摘要", "provider": "google_news",
    }]


@pytest.mark.asyncio
async def test_google_news_retries_transient_status_once():
    responses = [httpx.Response(503), httpx.Response(200, content=b"<rss><channel /></rss>")]

    def handler(_request: httpx.Request) -> httpx.Response:
        return responses.pop(0)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
        service = NewsSearchService(http, providers=("google_news",))
        result = await service.search("贵州茅台")

    assert result["providers_used"] == []
    assert result["errors"] == {}
    assert len(responses) == 0


@pytest.mark.asyncio
async def test_fallback_records_failure_then_uses_next_provider(monkeypatch):
    monkeypatch.setenv("BRAVE_SEARCH_API_KEY", "secret")

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "api.search.brave.com":
            return httpx.Response(503, text="down")
        return httpx.Response(200, json={"result": [{"title": "fallback", "url": "https://n/3"}]})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http:
        service = NewsSearchService(http, providers=("brave", "sina"))
        result = await service.search("测试")

    assert result["providers_attempted"] == ["brave", "sina"]
    assert result["providers_used"] == ["sina"]
    assert "brave" in result["errors"]
    assert "secret" not in str(result)


def test_service_rejects_unknown_provider_and_strategy():
    with pytest.raises(ValueError, match="未知新闻源"):
        NewsSearchService(providers=("future",))
