import aiosqlite
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
        assert version[0] == database._SCHEMA_VERSION
        history = await database.query_all("SELECT version, name FROM schema_version ORDER BY version")
        assert history == [
            {"version": 1, "name": "normalize_legacy_tickers"},
            {"version": 2, "name": "install_memory_fts"},
            {"version": 3, "name": "install_notifications"},
            {"version": 4, "name": "install_alerts"},
            {"version": 5, "name": "install_market_reviews"},
            {"version": 6, "name": "install_scheduled_research_jobs"},
            {"version": 7, "name": "install_llm_usage"},
            {"version": 8, "name": "install_investment_theses"},
            {"version": 9, "name": "install_passwordless_auth"},
            {"version": 10, "name": "install_user_data_isolation"},
            {"version": 11, "name": "install_user_credentials"},
        ]
        notification_table = await database.query_one(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='notifications'"
        )
        assert notification_table["name"] == "notifications"
        alert_tables = await database.query_all(
            "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'alert_%' ORDER BY name"
        )
        assert [table["name"] for table in alert_tables] == ["alert_rules", "alert_triggers"]
        market_review_table = await database.query_one(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='market_reviews'"
        )
        assert market_review_table["name"] == "market_reviews"
        scheduled_table = await database.query_one(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='scheduled_research_jobs'"
        )
        assert scheduled_table["name"] == "scheduled_research_jobs"
        usage_table = await database.query_one(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='llm_usage'"
        )
        assert usage_table["name"] == "llm_usage"
        thesis_tables = await database.query_all(
            "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('thesis', 'thesis_claims') ORDER BY name"
        )
        assert [table["name"] for table in thesis_tables] == ["thesis", "thesis_claims"]
        auth_tables = await database.query_all(
            "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('users', 'login_codes', 'sessions') ORDER BY name"
        )
        assert [table["name"] for table in auth_tables] == ["login_codes", "sessions", "users"]
        owner_columns = await database.query_all("PRAGMA table_info(research_reports)")
        assert "user_id" in {column["name"] for column in owner_columns}
    finally:
        await database.close_db()

    async def unexpected_scan():
        raise AssertionError("ticker normalization must only run once")

    monkeypatch.setattr(database, "_normalize_legacy_tickers", unexpected_scan)
    await database.init_db()
    await database.close_db()


@pytest.mark.asyncio
async def test_memory_migration_backfills_legacy_messages(tmp_path, monkeypatch):
    path = tmp_path / "legacy-memory.db"
    connection = await aiosqlite.connect(path)
    await connection.executescript(
        """
        CREATE TABLE conversations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT,
            mode TEXT NOT NULL DEFAULT 'single',
            role_preset TEXT,
            model_id INTEGER,
            status TEXT DEFAULT 'active',
            created_at TEXT DEFAULT (datetime('now')),
            updated_at TEXT DEFAULT (datetime('now'))
        );
        CREATE TABLE messages (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            conversation_id INTEGER NOT NULL,
            role TEXT NOT NULL,
            agent_name TEXT,
            content TEXT NOT NULL,
            round_number INTEGER DEFAULT 0,
            token_count INTEGER,
            created_at TEXT DEFAULT (datetime('now'))
        );
        INSERT INTO conversations (title) VALUES ('Legacy');
        INSERT INTO messages (conversation_id, role, content) VALUES (1, 'user', 'LEGACY_MEMORY AAPL');
        PRAGMA user_version=1;
        """
    )
    await connection.commit()
    await connection.close()

    monkeypatch.setattr(config, "DB_PATH", path)
    await database.init_db()
    try:
        hit = await database.query_one(
            "SELECT content FROM memory_fts WHERE memory_fts MATCH ?",
            ('"legacy_memory"',),
        )
        assert hit["content"] == "LEGACY_MEMORY AAPL"
        version = await (await database.get_db().execute("PRAGMA user_version")).fetchone()
        assert version[0] == database._SCHEMA_VERSION
    finally:
        await database.close_db()


@pytest.mark.asyncio
async def test_alert_migration_upgrades_notification_schema(tmp_path, monkeypatch):
    path = tmp_path / "notification-schema.db"
    monkeypatch.setattr(config, "DB_PATH", path)
    await database.init_db()
    try:
        await database.get_db().execute("DROP TABLE alert_triggers")
        await database.get_db().execute("DROP TABLE alert_rules")
        await database.get_db().execute(f"PRAGMA user_version={database._NOTIFICATIONS_VERSION}")
        await database.get_db().commit()
    finally:
        await database.close_db()

    await database.init_db()
    try:
        tables = await database.query_all(
            "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'alert_%' ORDER BY name"
        )
        assert [table["name"] for table in tables] == ["alert_rules", "alert_triggers"]
        version = await (await database.get_db().execute("PRAGMA user_version")).fetchone()
        assert version[0] == database._SCHEMA_VERSION
    finally:
        await database.close_db()
