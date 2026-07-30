import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.services.alpha_service import list_fields, search_alpha


def test_search_alpha_returns_matches_for_pe():
    assert search_alpha("pe")


def test_search_alpha_returns_empty_for_gibberish():
    assert search_alpha("gibberish_xyz") == []


def test_search_alpha_does_not_score_partial_chinese_characters():
    assert search_alpha("量台") == []


def test_search_alpha_bounds_empty_query_by_default():
    results = search_alpha("")

    assert len(results) == 10
    assert len(list_fields()) > len(results)
    assert search_alpha(None) == results


def test_search_alpha_limits_empty_query_when_requested():
    results = search_alpha("", max_results=10)

    assert len(results) == 10
    assert results == search_alpha(None, max_results=10)


def test_search_alpha_caps_direct_callers():
    assert len(search_alpha("", max_results=10_000)) == 100


@pytest.mark.asyncio
async def test_search_endpoint_bounds_empty_query():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/wq/search", params={"q": "", "max_results": 7})

    assert response.status_code == 200
    assert response.json()["total"] == 7
