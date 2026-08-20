import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.routers.auth import get_current_user
from app.services.alpha_service import catalogue_metadata, list_fields, search_alpha


@pytest.fixture(autouse=True)
def authenticated_user():
    app.dependency_overrides[get_current_user] = lambda: {
        "id": 1,
        "email": "alpha@test.local",
        "is_admin": False,
    }
    yield
    app.dependency_overrides.pop(get_current_user, None)


def test_search_alpha_returns_matches_for_pe():
    assert search_alpha("pe")


def test_search_alpha_returns_empty_for_gibberish():
    assert search_alpha("gibberish_xyz") == []


def test_search_alpha_does_not_score_partial_chinese_characters():
    assert search_alpha("量台") == []


def test_search_alpha_bounds_empty_query_by_default():
    results = search_alpha("")

    assert len(results) == min(10, len(list_fields()))
    assert search_alpha(None) == results


def test_search_alpha_limits_empty_query_when_requested():
    results = search_alpha("", max_results=10)

    assert len(results) == min(10, len(list_fields()))
    assert results == search_alpha(None, max_results=10)


def test_search_alpha_caps_direct_callers():
    assert len(search_alpha("", max_results=10_000)) == min(100, len(list_fields()))


@pytest.mark.asyncio
async def test_search_endpoint_bounds_empty_query():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/api/wq/search", params={"q": "", "max_results": 7})

    assert response.status_code == 200
    assert response.json()["total"] == 7
    assert response.json()["catalogue"]["schema_version"] == "alpha-catalogue/v1"


@pytest.mark.asyncio
async def test_template_and_local_simulation_endpoints():
    observations = [
        {"date": "2026-01-02", "symbol": "A", "factor": 1, "forward_return": -0.02},
        {"date": "2026-01-02", "symbol": "B", "factor": 2, "forward_return": 0.02},
    ]
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        templates = await client.get("/api/wq/templates")
        simulation = await client.post("/api/wq/simulate/local", json={"observations": observations})

    assert templates.status_code == 200
    assert templates.json()["total"] == 5
    expected_redistribution = (
        "UNKNOWN" if catalogue_metadata()["mode"] == "BUNDLED_EXTERNAL" else "PROJECT_AUTHORED"
    )
    assert templates.json()["catalogue"]["redistribution_status"] == expected_redistribution
    assert simulation.status_code == 200
    assert simulation.json()["period_returns"] == pytest.approx([0.02])


@pytest.mark.asyncio
async def test_starter_catalogue_keeps_templates_available(tmp_path, monkeypatch):
    monkeypatch.setattr("app.services.alpha_service._WQ_FIELDS_PATH", tmp_path / "missing.json")

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        categories = await client.get("/api/wq/categories")
        templates = await client.get("/api/wq/templates")

    assert categories.json()["catalogue"]["data_status"] == "PARTIAL"
    assert categories.json()["catalogue"]["source"] == "finquant.starter"
    assert templates.json()["total"] == 5
    assert templates.json()["catalogue"]["mode"] == "FINQUANT_STARTER"


@pytest.mark.asyncio
async def test_brain_endpoints_require_confirmation_and_use_bridge(monkeypatch):
    calls = []

    class FakeBrainClient:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        async def authenticate(self):
            calls.append("authenticate")

        async def create_simulation(self, expression, settings=None):
            calls.append((expression, settings))
            return {"simulation_id": "sim-1", "status": "accepted"}

        async def get_simulation(self, simulation_id):
            return {"id": simulation_id, "status": "COMPLETE"}

        async def get_alpha(self, alpha_id):
            return {"id": alpha_id}

    monkeypatch.setattr("app.routers.wq.AlphaBrainClient", FakeBrainClient)
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        blocked = await client.post("/api/wq/brain/simulations", json={"expression": "rank(close)"})
        created = await client.post(
            "/api/wq/brain/simulations",
            json={"expression": "rank(close)", "settings": {"region": "USA"}, "confirm": True},
        )
        simulation = await client.get("/api/wq/brain/simulations/sim-1")
        alpha = await client.get("/api/wq/brain/alphas/alpha-1")

    assert blocked.status_code == 409
    assert created.status_code == 202
    assert created.json()["simulation_id"] == "sim-1"
    assert simulation.json()["status"] == "COMPLETE"
    assert alpha.json()["id"] == "alpha-1"
    assert calls == ["authenticate", ("rank(close)", {"region": "USA"}), "authenticate", "authenticate"]
