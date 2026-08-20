import pytest

from app.routers import dashboard as dashboard_router

pytest_plugins = ("tests.test_api",)


class FakeNewsSearchService:
    response = {"keyword": "中国 A股 港股 美股 财经", "news": [], "providers_attempted": [], "providers_used": [], "errors": {}}
    error: Exception | None = None
    providers: tuple[str, ...] | None = None

    def __init__(self, **kwargs):
        self.__class__.providers = kwargs.get("providers")

    async def search(self, keyword, *, max_results=5, strategy="fallback"):
        if self.error:
            raise self.error
        return {**self.response, "keyword": keyword, "news": self.response.get("news", [])[:max_results]}

    async def aclose(self):
        pass


@pytest.fixture(autouse=True)
def patch_news_service(monkeypatch):
    FakeNewsSearchService.response = {"keyword": "", "news": [], "providers_attempted": [], "providers_used": [], "errors": {}}
    FakeNewsSearchService.error = None
    FakeNewsSearchService.providers = None
    monkeypatch.setattr(dashboard_router, "NewsSearchService", FakeNewsSearchService, raising=False)
    monkeypatch.setattr(dashboard_router, "get_credentials", lambda *_args: _empty_credentials(), raising=False)


async def _empty_credentials():
    return {}


@pytest.mark.asyncio
async def test_dashboard_news_success(client, monkeypatch):
    FakeNewsSearchService.response = {
        "keyword": "原始",
        "news": [{"title": "市场简报", "source": "公开来源", "published_at": "2026-08-20", "url": "https://example.test/1", "snippet": "摘要", "provider": "google_news"}],
        "providers_attempted": ["google_news"], "providers_used": ["google_news"], "errors": {},
    }
    response = await client.get("/api/dashboard/news", params={"keyword": "中国市场"})
    assert response.status_code == 200
    body = response.json()
    assert body["data_status"] == "OK"
    assert body["providers_attempted"] == ["google_news"]
    assert body["news"][0]["provider"] == "google_news"
    assert body["queried_at"] and body["as_of"]
    assert FakeNewsSearchService.providers == ("eastmoney", "google_news", "sina")


@pytest.mark.asyncio
async def test_dashboard_news_partial_keeps_items_and_errors(client):
    FakeNewsSearchService.response = {
        "keyword": "原始", "news": [{"title": "部分结果", "url": "https://example.test/2"}],
        "providers_attempted": ["google_news", "sina"], "providers_used": ["google_news"], "errors": {"sina": "HTTPStatusError"},
    }
    body = (await client.get("/api/dashboard/news")).json()
    assert body["data_status"] == "PARTIAL"
    assert body["news"][0]["title"] == "部分结果"
    assert body["errors"] == {"sina": "HTTPStatusError"}


@pytest.mark.asyncio
async def test_dashboard_news_upstream_error_is_explicit(client):
    FakeNewsSearchService.error = RuntimeError("upstream unavailable")
    body = (await client.get("/api/dashboard/news")).json()
    assert body["data_status"] == "UPSTREAM_ERROR"
    assert body["news"] == []
    assert body["errors"]["service"] == "RuntimeError"
    FakeNewsSearchService.error = None


@pytest.mark.asyncio
async def test_dashboard_news_empty_is_unknown_not_fabricated(client):
    FakeNewsSearchService.response = {
        "keyword": "原始", "news": [], "providers_attempted": ["google_news"], "providers_used": [], "errors": {},
    }
    body = (await client.get("/api/dashboard/news")).json()
    assert body["data_status"] == "UNKNOWN"
    assert body["news"] == []
