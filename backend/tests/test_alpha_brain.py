import httpx
import pytest

from app.services.alpha_brain import AlphaBrainClient, AlphaBrainError


@pytest.mark.asyncio
async def test_brain_bridge_authenticates_and_creates_simulation_without_submission():
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if request.url.path == "/authentication":
            assert request.headers["Authorization"].startswith("Basic ")
            return httpx.Response(201)
        if request.url.path == "/simulations":
            return httpx.Response(201, headers={"Location": "/simulations/sim_123"})
        return httpx.Response(404)

    http = httpx.AsyncClient(base_url="https://brain.test", transport=httpx.MockTransport(handler))
    client = AlphaBrainClient(username="user", password="secret", http=http)

    await client.authenticate()
    result = await client.create_simulation("rank(close)")

    assert result == {"simulation_id": "sim_123", "status": "accepted"}
    assert [request.url.path for request in requests] == ["/authentication", "/simulations"]
    assert b'"regular":"rank(close)"' in requests[1].content
    await http.aclose()


@pytest.mark.asyncio
async def test_brain_bridge_sanitizes_errors_and_validates_resource_ids():
    http = httpx.AsyncClient(
        base_url="https://brain.test",
        transport=httpx.MockTransport(lambda _: httpx.Response(401, text="secret response")),
    )
    client = AlphaBrainClient(username="user", password="secret", http=http)

    with pytest.raises(AlphaBrainError, match="HTTP 401") as error:
        await client.authenticate()
    assert "secret response" not in str(error.value)

    with pytest.raises(ValueError, match="资源 ID"):
        await client.get_alpha("../../credentials")
    await http.aclose()
