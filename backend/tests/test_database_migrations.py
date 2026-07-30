import pytest

from app import config, database


@pytest.mark.asyncio
async def test_legacy_research_and_backtest_tickers_are_normalized(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "DB_PATH", tmp_path / "migration.db")
    await database.init_db()
    try:
        research_id = await database.execute(
            "INSERT INTO research_reports (ticker, report_data) VALUES (?, '{}')",
            ("AAPL",),
        )
        backtest_id = await database.execute(
            "INSERT INTO backtest_runs (ticker, strategy_type, result) VALUES (?, 'ma_cross', '{}')",
            ("0700.HK",),
        )

        await database.get_db().execute("PRAGMA user_version=0")
        await database.get_db().commit()
    finally:
        await database.close_db()

    await database.init_db()
    try:

        research = await database.query_one("SELECT ticker FROM research_reports WHERE id=?", (research_id,))
        backtest = await database.query_one("SELECT ticker FROM backtest_runs WHERE id=?", (backtest_id,))
        assert research["ticker"] == "usAAPL"
        assert backtest["ticker"] == "hk00700"
        version = await (await database.get_db().execute("PRAGMA user_version")).fetchone()
        assert version[0] == database._TICKER_NORMALIZATION_VERSION
    finally:
        await database.close_db()

    async def unexpected_scan():
        raise AssertionError("ticker normalization must only run once")

    monkeypatch.setattr(database, "_normalize_legacy_tickers", unexpected_scan)
    await database.init_db()
    await database.close_db()
