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
            {"version": 12, "name": "install_evidence_foundation"},
            {"version": 13, "name": "install_investment_memory"},
            {"version": 14, "name": "install_memory_rollout_audit"},
            {"version": 15, "name": "install_thesis_v2"},
            {"version": 16, "name": "install_thesis_evidence"},
            {"version": 17, "name": "install_thesis_history"},
            {"version": 18, "name": "install_monitor_targets"},
            {"version": 19, "name": "install_scheduled_research_linkage"},
            {"version": 20, "name": "install_thesis_review_workflow"},
            {"version": 21, "name": "install_product_metrics"},
            {"version": 22, "name": "install_paper_portfolios"},
            {"version": 23, "name": "install_job_runtime"},
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


@pytest.mark.asyncio
async def test_evidence_migration_creates_pre_v12_backup(tmp_path, monkeypatch):
    path = tmp_path / "evidence-migration.db"
    monkeypatch.setattr(config, "DB_PATH", path)
    await database.init_db()
    await database.get_db().execute("DROP TABLE evidence_input_refs")
    await database.get_db().execute("DROP TABLE evidence_objects")
    await database.get_db().execute("DELETE FROM schema_version WHERE version=12")
    await database.get_db().execute("PRAGMA user_version=11")
    await database.get_db().commit()
    await database.close_db()

    backup_path = path.with_suffix(f"{path.suffix}.pre-v12.bak")
    assert not backup_path.exists()

    await database.init_db()
    try:
        version = await (await database.get_db().execute("PRAGMA user_version")).fetchone()
        assert version[0] == database._SCHEMA_VERSION
        assert backup_path.exists()
        tables = await database.query_all(
            "SELECT name FROM sqlite_master "
            "WHERE type='table' AND name IN ('evidence_objects', 'evidence_input_refs') "
            "ORDER BY name"
        )
        assert [table["name"] for table in tables] == [
            "evidence_input_refs",
            "evidence_objects",
        ]
    finally:
        await database.close_db()

    backup = await aiosqlite.connect(backup_path)
    try:
        backup_version = await (await backup.execute("PRAGMA user_version")).fetchone()
        assert backup_version[0] == 11
        table = await (
            await backup.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='evidence_objects'"
            )
        ).fetchone()
        assert table is None
    finally:
        await backup.close()

    async def unexpected_scan():
        raise AssertionError("ticker normalization must only run once")

    monkeypatch.setattr(database, "_normalize_legacy_tickers", unexpected_scan)
    await database.init_db()
    await database.close_db()


@pytest.mark.asyncio
async def test_investment_memory_migration_creates_pre_v13_backup(tmp_path, monkeypatch):
    path = tmp_path / "investment-memory-migration.db"
    monkeypatch.setattr(config, "DB_PATH", path)
    await database.init_db()
    await database.get_db().execute("DROP TABLE memory_records")
    await database.get_db().execute("DELETE FROM schema_version WHERE version=13")
    await database.get_db().execute("PRAGMA user_version=12")
    await database.get_db().commit()
    await database.close_db()

    backup_path = path.with_suffix(f"{path.suffix}.pre-v13.bak")
    assert not backup_path.exists()

    await database.init_db()
    try:
        version = await (await database.get_db().execute("PRAGMA user_version")).fetchone()
        assert version[0] == database._SCHEMA_VERSION
        assert backup_path.exists()
        table = await database.query_one(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='memory_records'"
        )
        assert table == {"name": "memory_records"}
    finally:
        await database.close_db()

    backup = await aiosqlite.connect(backup_path)
    try:
        backup_version = await (await backup.execute("PRAGMA user_version")).fetchone()
        assert backup_version[0] == 12
        table = await (
            await backup.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='memory_records'"
            )
        ).fetchone()
        assert table is None
    finally:
        await backup.close()


@pytest.mark.asyncio
async def test_memory_rollout_migration_creates_pre_v14_backup(tmp_path, monkeypatch):
    path = tmp_path / "memory-rollout-migration.db"
    monkeypatch.setattr(config, "DB_PATH", path)
    await database.init_db()
    await database.get_db().execute("DROP TABLE memory_rollout_audits")
    await database.get_db().execute("DELETE FROM schema_version WHERE version=14")
    await database.get_db().execute("PRAGMA user_version=13")
    await database.get_db().commit()
    await database.close_db()

    backup_path = path.with_suffix(f"{path.suffix}.pre-v14.bak")
    assert not backup_path.exists()

    await database.init_db()
    try:
        version = await (await database.get_db().execute("PRAGMA user_version")).fetchone()
        assert version[0] == database._SCHEMA_VERSION
        assert backup_path.exists()
        table = await database.query_one(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='memory_rollout_audits'"
        )
        assert table == {"name": "memory_rollout_audits"}
    finally:
        await database.close_db()

    backup = await aiosqlite.connect(backup_path)
    try:
        backup_version = await (await backup.execute("PRAGMA user_version")).fetchone()
        assert backup_version[0] == 13
        table = await (
            await backup.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='memory_rollout_audits'"
            )
        ).fetchone()
        assert table is None
    finally:
        await backup.close()


@pytest.mark.asyncio
async def test_thesis_v2_migration_creates_pre_v15_backup_and_backfills(tmp_path, monkeypatch):
    path = tmp_path / "thesis-v2-migration.db"
    monkeypatch.setattr(config, "DB_PATH", path)
    await database.init_db()
    owner_id = await database.execute("INSERT INTO users (email) VALUES ('legacy@test.local')")
    thesis_id = await database.execute(
        "INSERT INTO thesis (ticker, title, thesis, assumptions, user_id) "
        "VALUES ('usAAPL', 'Legacy title', 'Legacy judgment', '[\"Legacy assumption\"]', ?)",
        (owner_id,),
    )
    await database.get_db().execute("DROP TABLE thesis_version_evidence_refs")
    await database.get_db().execute("DROP TABLE thesis_versions")
    await database.get_db().execute("DELETE FROM schema_version WHERE version=15")
    await database.get_db().execute("PRAGMA user_version=14")
    await database.get_db().commit()
    await database.close_db()

    backup_path = path.with_suffix(f"{path.suffix}.pre-v15.bak")
    assert not backup_path.exists()
    await database.init_db()
    try:
        version = await (await database.get_db().execute("PRAGMA user_version")).fetchone()
        assert version[0] == database._SCHEMA_VERSION
        assert backup_path.exists()
        row = await database.query_one(
            "SELECT version, judgment, assumptions_json, change_reason "
            "FROM thesis_versions WHERE thesis_id=? AND user_id=?",
            (thesis_id, owner_id),
        )
        assert row == {
            "version": 1,
            "judgment": "Legacy judgment",
            "assumptions_json": '["Legacy assumption"]',
            "change_reason": "legacy_backfill",
        }
    finally:
        await database.close_db()

    backup = await aiosqlite.connect(backup_path)
    try:
        backup_version = await (await backup.execute("PRAGMA user_version")).fetchone()
        assert backup_version[0] == 14
        table = await (
            await backup.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='thesis_versions'"
            )
        ).fetchone()
        assert table is None
    finally:
        await backup.close()


@pytest.mark.asyncio
async def test_thesis_evidence_migration_creates_pre_v16_backup(tmp_path, monkeypatch):
    path = tmp_path / "thesis-evidence-migration.db"
    monkeypatch.setattr(config, "DB_PATH", path)
    await database.init_db()
    await database.get_db().execute("DROP TABLE thesis_claim_status_events")
    await database.get_db().execute("DROP TABLE thesis_claim_evidence_edges")
    await database.get_db().execute("DELETE FROM schema_version WHERE version=16")
    await database.get_db().execute("PRAGMA user_version=15")
    await database.get_db().commit()
    await database.close_db()

    backup_path = path.with_suffix(f"{path.suffix}.pre-v16.bak")
    assert not backup_path.exists()
    await database.init_db()
    try:
        version = await (await database.get_db().execute("PRAGMA user_version")).fetchone()
        assert version[0] == database._SCHEMA_VERSION
        assert backup_path.exists()
        tables = await database.query_all(
            "SELECT name FROM sqlite_master WHERE type='table' "
            "AND name IN ('thesis_claim_evidence_edges', 'thesis_claim_status_events') ORDER BY name"
        )
        assert [row["name"] for row in tables] == [
            "thesis_claim_evidence_edges", "thesis_claim_status_events",
        ]
    finally:
        await database.close_db()

    backup = await aiosqlite.connect(backup_path)
    try:
        backup_version = await (await backup.execute("PRAGMA user_version")).fetchone()
        assert backup_version[0] == 15
        table = await (
            await backup.execute(
                "SELECT name FROM sqlite_master WHERE type='table' "
                "AND name='thesis_claim_evidence_edges'"
            )
        ).fetchone()
        assert table is None
    finally:
        await backup.close()


@pytest.mark.asyncio
async def test_thesis_history_migration_creates_pre_v17_backup(tmp_path, monkeypatch):
    path = tmp_path / "thesis-history-migration.db"
    monkeypatch.setattr(config, "DB_PATH", path)
    await database.init_db()
    await database.get_db().execute("DROP TABLE thesis_version_confirmations")
    await database.get_db().execute("DELETE FROM schema_version WHERE version=17")
    await database.get_db().execute("PRAGMA user_version=16")
    await database.get_db().commit()
    await database.close_db()

    backup_path = path.with_suffix(f"{path.suffix}.pre-v17.bak")
    assert not backup_path.exists()
    await database.init_db()
    try:
        version = await (await database.get_db().execute("PRAGMA user_version")).fetchone()
        assert version[0] == database._SCHEMA_VERSION
        assert backup_path.exists()
        table = await database.query_one(
            "SELECT name FROM sqlite_master WHERE type='table' "
            "AND name='thesis_version_confirmations'"
        )
        assert table == {"name": "thesis_version_confirmations"}
    finally:
        await database.close_db()

    backup = await aiosqlite.connect(backup_path)
    try:
        backup_version = await (await backup.execute("PRAGMA user_version")).fetchone()
        assert backup_version[0] == 16
        table = await (
            await backup.execute(
                "SELECT name FROM sqlite_master WHERE type='table' "
                "AND name='thesis_version_confirmations'"
            )
        ).fetchone()
        assert table is None
    finally:
        await backup.close()


@pytest.mark.asyncio
async def test_monitor_target_migration_creates_pre_v18_backup(tmp_path, monkeypatch):
    path = tmp_path / "monitor-target-migration.db"
    monkeypatch.setattr(config, "DB_PATH", path)
    await database.init_db()
    await database.get_db().execute("DROP INDEX idx_alert_rules_confirmation_key")
    await database.get_db().execute("DELETE FROM schema_version WHERE version=18")
    await database.get_db().execute("PRAGMA user_version=17")
    await database.get_db().commit()
    await database.close_db()

    backup_path = path.with_suffix(f"{path.suffix}.pre-v18.bak")
    assert not backup_path.exists()
    await database.init_db()
    try:
        version = await (await database.get_db().execute("PRAGMA user_version")).fetchone()
        assert version[0] == database._SCHEMA_VERSION
        assert backup_path.exists()
        columns = await database.query_all("PRAGMA table_info(alert_rules)")
        assert {row["name"] for row in columns} >= {
            "target_type", "target_id", "confirmation_key", "confirmed_at",
        }
    finally:
        await database.close_db()

    backup = await aiosqlite.connect(backup_path)
    try:
        backup_version = await (await backup.execute("PRAGMA user_version")).fetchone()
        assert backup_version[0] == 17
    finally:
        await backup.close()


@pytest.mark.asyncio
async def test_scheduled_research_linkage_migration_creates_pre_v19_backup(tmp_path, monkeypatch):
    path = tmp_path / "scheduled-linkage-migration.db"
    monkeypatch.setattr(config, "DB_PATH", path)
    await database.init_db()
    await database.get_db().execute("DROP TABLE scheduled_research_runs")
    await database.get_db().execute("DELETE FROM schema_version WHERE version=19")
    await database.get_db().execute("PRAGMA user_version=18")
    await database.get_db().commit()
    await database.close_db()

    backup_path = path.with_suffix(f"{path.suffix}.pre-v19.bak")
    assert not backup_path.exists()
    await database.init_db()
    try:
        version = await (await database.get_db().execute("PRAGMA user_version")).fetchone()
        assert version[0] == database._SCHEMA_VERSION
        assert backup_path.exists()
        assert await database.query_one(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='scheduled_research_runs'"
        ) == {"name": "scheduled_research_runs"}
    finally:
        await database.close_db()

    backup = await aiosqlite.connect(backup_path)
    try:
        backup_version = await (await backup.execute("PRAGMA user_version")).fetchone()
        assert backup_version[0] == 18
    finally:
        await backup.close()


@pytest.mark.asyncio
async def test_thesis_review_workflow_migration_creates_pre_v20_backup(tmp_path, monkeypatch):
    path = tmp_path / "thesis-review-migration.db"
    monkeypatch.setattr(config, "DB_PATH", path)
    await database.init_db()
    await database.get_db().execute("DROP TABLE thesis_review_events")
    await database.get_db().execute("DROP TABLE thesis_review_items")
    await database.get_db().execute("DELETE FROM schema_version WHERE version=20")
    await database.get_db().execute("PRAGMA user_version=19")
    await database.get_db().commit()
    await database.close_db()

    backup_path = path.with_suffix(f"{path.suffix}.pre-v20.bak")
    assert not backup_path.exists()
    await database.init_db()
    try:
        version = await (await database.get_db().execute("PRAGMA user_version")).fetchone()
        assert version[0] == database._SCHEMA_VERSION
        assert backup_path.exists()
        tables = await database.query_all(
            "SELECT name FROM sqlite_master WHERE type='table' "
            "AND name IN ('thesis_review_items', 'thesis_review_events') ORDER BY name"
        )
        assert [row["name"] for row in tables] == [
            "thesis_review_events", "thesis_review_items",
        ]
    finally:
        await database.close_db()

    backup = await aiosqlite.connect(backup_path)
    try:
        backup_version = await (await backup.execute("PRAGMA user_version")).fetchone()
        assert backup_version[0] == 19
    finally:
        await backup.close()


@pytest.mark.asyncio
async def test_product_metrics_migration_creates_pre_v21_backup(tmp_path, monkeypatch):
    path = tmp_path / "product-metrics-migration.db"
    monkeypatch.setattr(config, "DB_PATH", path)
    await database.init_db()
    await database.get_db().execute("DROP TABLE product_metric_events")
    await database.get_db().execute("DROP TABLE product_metric_preferences")
    await database.get_db().execute("DELETE FROM schema_version WHERE version=21")
    await database.get_db().execute("PRAGMA user_version=20")
    await database.get_db().commit()
    await database.close_db()

    backup_path = path.with_suffix(f"{path.suffix}.pre-v21.bak")
    assert not backup_path.exists()
    await database.init_db()
    try:
        version = await (await database.get_db().execute("PRAGMA user_version")).fetchone()
        assert version[0] == database._SCHEMA_VERSION
        assert backup_path.exists()
        tables = await database.query_all(
            "SELECT name FROM sqlite_master WHERE type='table' "
            "AND name IN ('product_metric_preferences', 'product_metric_events') ORDER BY name"
        )
        assert [row["name"] for row in tables] == [
            "product_metric_events", "product_metric_preferences",
        ]
    finally:
        await database.close_db()

    backup = await aiosqlite.connect(backup_path)
    try:
        backup_version = await (await backup.execute("PRAGMA user_version")).fetchone()
        assert backup_version[0] == 20
    finally:
        await backup.close()


@pytest.mark.asyncio
async def test_paper_portfolio_migration_creates_pre_v22_backup_and_is_idempotent(tmp_path, monkeypatch):
    path = tmp_path / "paper-portfolio-migration.db"
    monkeypatch.setattr(config, "DB_PATH", path)
    await database.init_db()
    await database.get_db().execute("DROP TABLE paper_portfolio_ledger")
    await database.get_db().execute("DROP TABLE paper_portfolios")
    await database.get_db().execute("DELETE FROM schema_version WHERE version=22")
    await database.get_db().execute("PRAGMA user_version=21")
    await database.get_db().commit()
    await database.close_db()

    backup_path = path.with_suffix(f"{path.suffix}.pre-v22.bak")
    assert not backup_path.exists()
    await database.init_db()
    await database.close_db()
    await database.init_db()
    try:
        version = await (await database.get_db().execute("PRAGMA user_version")).fetchone()
        assert version[0] == database._SCHEMA_VERSION
        assert backup_path.exists()
        tables = await database.query_all(
            "SELECT name FROM sqlite_master WHERE type='table' "
            "AND name IN ('paper_portfolios', 'paper_portfolio_ledger') ORDER BY name"
        )
        assert [row["name"] for row in tables] == [
            "paper_portfolio_ledger", "paper_portfolios",
        ]
        triggers = await database.query_all(
            "SELECT name FROM sqlite_master WHERE type='trigger' "
            "AND name LIKE 'paper_portfolio_ledger_immutable_%' ORDER BY name"
        )
        assert [row["name"] for row in triggers] == [
            "paper_portfolio_ledger_immutable_delete",
            "paper_portfolio_ledger_immutable_update",
        ]
    finally:
        await database.close_db()

    backup = await aiosqlite.connect(backup_path)
    try:
        backup_version = await (await backup.execute("PRAGMA user_version")).fetchone()
        assert backup_version[0] == 21
    finally:
        await backup.close()


@pytest.mark.asyncio
async def test_job_runtime_migration_creates_pre_v23_backup_and_append_only_events(tmp_path, monkeypatch):
    path = tmp_path / "job-runtime-migration.db"
    monkeypatch.setattr(config, "DB_PATH", path)
    await database.init_db()
    await database.get_db().execute("DROP TABLE scheduled_research_run_events")
    await database.get_db().execute("DELETE FROM schema_version WHERE version=23")
    await database.get_db().execute("PRAGMA user_version=22")
    await database.get_db().commit()
    await database.close_db()

    backup_path = path.with_suffix(f"{path.suffix}.pre-v23.bak")
    assert not backup_path.exists()
    await database.init_db()
    await database.close_db()
    await database.init_db()
    try:
        version = await (await database.get_db().execute("PRAGMA user_version")).fetchone()
        assert version[0] == database._SCHEMA_VERSION == 23
        assert backup_path.exists()
        columns = await database.query_all("PRAGMA table_info(scheduled_research_runs)")
        assert {"idempotency_key", "lease_owner", "lease_expires_at", "heartbeat_at"} <= {
            row["name"] for row in columns
        }
        await database.execute("INSERT INTO users (id, email) VALUES (91, 'runtime@test.local')")
        job_id = await database.execute(
            "INSERT INTO scheduled_research_jobs "
            "(user_id, name, ticker, company_name, cron_expr) "
            "VALUES (91, 'runtime', 'usAAPL', 'Apple', '0 8 * * *')"
        )
        run_id = await database.execute(
            "INSERT INTO scheduled_research_runs "
            "(user_id, job_id, run_key, idempotency_key, attempt, status, started_at) "
            "VALUES (91, ?, ?, ?, 1, 'failed', '2026-08-13 08:00:00')",
            (job_id, "a" * 64, "b" * 64),
        )
        event_id = await database.execute(
            "INSERT INTO scheduled_research_run_events "
            "(user_id, job_id, run_id, event_type, payload_json) "
            "VALUES (91, ?, ?, 'failed', '{}')",
            (job_id, run_id),
        )
        with pytest.raises(aiosqlite.IntegrityError):
            await database.execute(
                "UPDATE scheduled_research_run_events SET event_type='completed' WHERE id=?",
                (event_id,),
            )
        with pytest.raises(aiosqlite.IntegrityError):
            await database.execute("DELETE FROM scheduled_research_run_events WHERE id=?", (event_id,))
    finally:
        await database.close_db()

    backup = await aiosqlite.connect(backup_path)
    try:
        backup_version = await (await backup.execute("PRAGMA user_version")).fetchone()
        assert backup_version[0] == 22
    finally:
        await backup.close()


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
