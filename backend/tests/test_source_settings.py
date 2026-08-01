import httpx
import pytest
import pytest_asyncio

from app import config, database
from app.services.market_data import MarketDataService
from app.services.source_settings import restore_source_priorities, save_source_priority


@pytest_asyncio.fixture
async def source_db(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "DB_PATH", tmp_path / "source-settings.db")
    await database.init_db()
    try:
        yield
    finally:
        await database.close_db()


def _service():
    client = httpx.AsyncClient(transport=httpx.MockTransport(
        lambda request: httpx.Response(500, request=request)
    ))
    return MarketDataService(http=client, yahoo_http=client)


@pytest.mark.asyncio
async def test_source_priority_round_trip(source_db):
    first = _service()
    await save_source_priority(first, "quote", ["sina", "tencent", "yahoo"])
    await first.aclose()

    restored = _service()
    await restore_source_priorities(restored)
    assert restored.quote_priority == ("sina", "tencent", "yahoo")
    await restored.aclose()


@pytest.mark.asyncio
async def test_invalid_persisted_priority_is_ignored(source_db):
    await database.execute(
        "INSERT INTO system_settings (key, value_json) VALUES (?, ?)",
        ("market_kline_priority", '["unknown"]'),
    )
    service = _service()
    await restore_source_priorities(service)
    assert service.kline_priority == ("sina", "tencent", "yahoo")
    await service.aclose()
