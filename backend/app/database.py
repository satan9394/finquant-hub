"""SQLite 数据层：aiosqlite 单例连接 + 建表 + 种子数据（WAL 模式）。"""
import json
from pathlib import Path
import sqlite3
from typing import Any, cast

import aiosqlite

from . import config
from .prompts.roles import PRESET_ROLES

SCHEMA = """
CREATE TABLE IF NOT EXISTS schema_version (
    version       INTEGER PRIMARY KEY,
    name          TEXT NOT NULL UNIQUE,
    applied_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS model_configs (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    provider      TEXT NOT NULL DEFAULT 'openai',
    base_url      TEXT NOT NULL,
    model_name    TEXT NOT NULL,
    api_key_env   TEXT,
    api_key       TEXT,
    temperature   REAL DEFAULT 0.7,
    max_tokens    INTEGER DEFAULT 4096,
    is_default    INTEGER DEFAULT 0,
    created_at    TEXT DEFAULT (datetime('now')),
    updated_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS conversations (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    title         TEXT,
    mode          TEXT NOT NULL DEFAULT 'single',
    role_preset   TEXT,
    model_id      INTEGER,
    status        TEXT DEFAULT 'active',
    created_at    TEXT DEFAULT (datetime('now')),
    updated_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS messages (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL,
    role            TEXT NOT NULL,
    agent_name      TEXT,
    content         TEXT NOT NULL,
    round_number    INTEGER DEFAULT 0,
    token_count     INTEGER,
    created_at      TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);
CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, round_number, created_at);

CREATE TABLE IF NOT EXISTS agent_presets (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    role_key      TEXT NOT NULL UNIQUE,
    avatar        TEXT,
    system_prompt TEXT NOT NULL,
    model_id      INTEGER,
    is_preset     INTEGER DEFAULT 1,
    created_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS discussion_rooms (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL,
    topic           TEXT NOT NULL,
    participants    TEXT NOT NULL,
    total_rounds    INTEGER DEFAULT 3,
    current_phase   TEXT DEFAULT 'active',
    summary         TEXT,
    created_at      TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);

CREATE TABLE IF NOT EXISTS research_reports (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker        TEXT NOT NULL,
    company_name  TEXT,
    report_data   TEXT NOT NULL,
    agent_results TEXT,
    model_id      INTEGER,
    status        TEXT DEFAULT 'completed',
    created_at    TEXT DEFAULT (datetime('now')),
    updated_at    TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_research_reports_ticker_created
    ON research_reports(ticker, created_at DESC);

CREATE TABLE IF NOT EXISTS research_events (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    research_id     INTEGER NOT NULL,
    event_type      TEXT NOT NULL,
    agent_role_key  TEXT,
    payload         TEXT NOT NULL,
    created_at      TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (research_id) REFERENCES research_reports(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_research_events_report
    ON research_events(research_id, id);

CREATE TABLE IF NOT EXISTS backtest_runs (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker        TEXT NOT NULL,
    strategy_type TEXT NOT NULL,
    periods       INTEGER DEFAULT 252,
    params        TEXT,
    result        TEXT NOT NULL,
    status        TEXT DEFAULT 'completed',
    created_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS research_workspaces (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol          TEXT NOT NULL UNIQUE,
    name            TEXT NOT NULL,
    instrument_json TEXT NOT NULL,
    notes           TEXT NOT NULL DEFAULT '',
    evidence_json   TEXT NOT NULL DEFAULT '[]',
    snapshot_json   TEXT,
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_research_workspaces_updated
    ON research_workspaces(updated_at DESC);

CREATE TABLE IF NOT EXISTS quant_backtests (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol          TEXT NOT NULL,
    strategy_type   TEXT NOT NULL DEFAULT 'ma_crossover',
    status          TEXT NOT NULL DEFAULT 'queued',
    params_json     TEXT NOT NULL,
    result_json     TEXT,
    error_message   TEXT,
    provider        TEXT,
    data_as_of      TEXT,
    timezone        TEXT,
    currency        TEXT,
    adjustment      TEXT,
    frequency       TEXT,
    quality_flags   TEXT NOT NULL DEFAULT '[]',
    is_saved        INTEGER NOT NULL DEFAULT 0,
    created_at      TEXT DEFAULT (datetime('now')),
    started_at      TEXT,
    completed_at    TEXT,
    updated_at      TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_quant_backtests_symbol_created
    ON quant_backtests(symbol, created_at DESC);

CREATE TABLE IF NOT EXISTS analysis_reports (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker        TEXT NOT NULL,
    market        TEXT,
    summary       TEXT,
    score         REAL,
    signals       TEXT,
    indicators_snapshot TEXT,
    chapters      TEXT,
    model_id      INTEGER,
    created_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS analysis_signals (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    ticker        TEXT NOT NULL,
    signal_type   TEXT NOT NULL,
    direction     TEXT,
    strength      REAL,
    detected_at   TEXT DEFAULT (datetime('now')),
    expiry        TEXT,
    description   TEXT
);

CREATE TABLE IF NOT EXISTS agent_runs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id      TEXT NOT NULL,
    agent_role_key  TEXT NOT NULL,
    tool_calls      TEXT,
    token_usage     INTEGER,
    started_at      TEXT,
    completed_at    TEXT
);

CREATE TABLE IF NOT EXISTS system_settings (
    key         TEXT PRIMARY KEY,
    value_json  TEXT NOT NULL,
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS mcp_server_configs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL UNIQUE,
    url         TEXT NOT NULL,
    is_enabled  INTEGER NOT NULL DEFAULT 0 CHECK (is_enabled IN (0, 1)),
    last_error  TEXT,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS alpha_fields (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    field_id      INTEGER,
    category      TEXT,
    name          TEXT,
    description   TEXT,
    dataset       TEXT,
    coverage      REAL,
    alpha_count   INTEGER
);

CREATE TABLE IF NOT EXISTS portfolio_groups (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    description   TEXT,
    created_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS portfolio_items (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id      INTEGER,
    ticker        TEXT NOT NULL,
    name          TEXT,
    shares        REAL,
    avg_cost      REAL,
    currency      TEXT DEFAULT 'CNY',
    added_at      TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (group_id) REFERENCES portfolio_groups(id)
);

CREATE TABLE IF NOT EXISTS portfolio_trades (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id       INTEGER,
    action        TEXT NOT NULL,
    shares        REAL,
    price         REAL,
    total         REAL,
    traded_at     TEXT,
    note          TEXT,
    created_at    TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (item_id) REFERENCES portfolio_items(id)
);

CREATE TABLE IF NOT EXISTS portfolios (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    description   TEXT DEFAULT '',
    currency      TEXT DEFAULT 'CNY',
    created_at    TEXT DEFAULT (datetime('now')),
    updated_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS positions (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    portfolio_id    INTEGER NOT NULL,
    ticker          TEXT NOT NULL,
    name            TEXT DEFAULT '',
    shares          REAL NOT NULL,
    avg_cost        REAL NOT NULL,
    currency        TEXT DEFAULT 'CNY',
    created_at      TEXT DEFAULT (datetime('now')),
    updated_at      TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (portfolio_id) REFERENCES portfolios(id) ON DELETE CASCADE
);
"""

_db: aiosqlite.Connection = cast(aiosqlite.Connection, None)
_TICKER_NORMALIZATION_VERSION = 1
_MEMORY_FTS_VERSION = 2
_NOTIFICATIONS_VERSION = 3
_ALERTS_VERSION = 4
_MARKET_REVIEWS_VERSION = 5
_SCHEDULED_RESEARCH_VERSION = 6
_LLM_USAGE_VERSION = 7
_THESIS_VERSION = 8
_AUTH_VERSION = 9
_OWNER_ISOLATION_VERSION = 10
_CREDENTIALS_VERSION = 11
_SCHEMA_VERSION = _CREDENTIALS_VERSION
_OWNER_TABLES = (
    "model_configs", "conversations", "messages", "discussion_rooms",
    "research_reports", "research_events", "research_workspaces",
    "backtest_runs", "quant_backtests", "analysis_reports", "analysis_signals", "agent_runs",
    "portfolio_groups", "portfolio_items", "portfolio_trades",
    "portfolios", "positions", "notifications", "alert_rules", "alert_triggers",
    "market_reviews", "scheduled_research_jobs", "llm_usage", "thesis", "thesis_claims",
)
_MIGRATION_NAMES = {
    _TICKER_NORMALIZATION_VERSION: "normalize_legacy_tickers",
    _MEMORY_FTS_VERSION: "install_memory_fts",
    _NOTIFICATIONS_VERSION: "install_notifications",
    _ALERTS_VERSION: "install_alerts",
    _MARKET_REVIEWS_VERSION: "install_market_reviews",
    _SCHEDULED_RESEARCH_VERSION: "install_scheduled_research_jobs",
    _LLM_USAGE_VERSION: "install_llm_usage",
    _THESIS_VERSION: "install_investment_theses",
    _AUTH_VERSION: "install_passwordless_auth",
    _OWNER_ISOLATION_VERSION: "install_user_data_isolation",
    _CREDENTIALS_VERSION: "install_user_credentials",
}


async def init_db() -> None:
    """FastAPI lifespan 启动钩子：建库建表 + WAL + 种子数据。"""
    global _db
    config.DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    existing_database = config.DB_PATH.exists() and config.DB_PATH.stat().st_size > 0
    _db = await aiosqlite.connect(config.DB_PATH)
    _db.row_factory = aiosqlite.Row
    from .services.memory import normalize_for_search

    await _db.create_function("memory_normalize", 1, normalize_for_search, deterministic=True)
    await _db.execute("PRAGMA journal_mode=WAL")
    await _db.execute("PRAGMA foreign_keys=ON")
    current_version = int(cast(sqlite3.Row, await (await _db.execute("PRAGMA user_version")).fetchone())[0])
    if existing_database and current_version < _OWNER_ISOLATION_VERSION:
        await _backup_database_before_owner_migration(config.DB_PATH)
    await _db.executescript(SCHEMA)
    await _migrate_schema()
    await _seed_models()
    await _seed_agents()
    await _db.commit()


async def _migrate_schema() -> None:
    """Keep existing local databases compatible without destructive resets."""
    await _ensure_column("research_reports", "model_id", "model_id INTEGER")
    await _ensure_column("research_reports", "updated_at", "updated_at TEXT")
    row = cast(sqlite3.Row, await (await _db.execute("PRAGMA user_version")).fetchone())
    version = int(row[0])

    if version < _TICKER_NORMALIZATION_VERSION:
        await _db.execute("SAVEPOINT normalize_legacy_tickers")
        try:
            await _normalize_legacy_tickers()
            await _db.execute(f"PRAGMA user_version={_TICKER_NORMALIZATION_VERSION}")
            await _record_schema_version(_TICKER_NORMALIZATION_VERSION)
            await _db.execute("RELEASE SAVEPOINT normalize_legacy_tickers")
            version = _TICKER_NORMALIZATION_VERSION
        except Exception:
            await _db.execute("ROLLBACK TO SAVEPOINT normalize_legacy_tickers")
            await _db.execute("RELEASE SAVEPOINT normalize_legacy_tickers")
            raise

    if version < _MEMORY_FTS_VERSION:
        await _db.execute("SAVEPOINT install_memory_fts")
        try:
            await _install_memory_fts()
            await _db.execute(f"PRAGMA user_version={_MEMORY_FTS_VERSION}")
            await _record_schema_version(_MEMORY_FTS_VERSION)
            await _db.execute("RELEASE SAVEPOINT install_memory_fts")
        except Exception:
            await _db.execute("ROLLBACK TO SAVEPOINT install_memory_fts")
            await _db.execute("RELEASE SAVEPOINT install_memory_fts")
            raise
        version = _MEMORY_FTS_VERSION

    if version < _NOTIFICATIONS_VERSION:
        await _db.execute("SAVEPOINT install_notifications")
        try:
            await _install_notifications()
            await _db.execute(f"PRAGMA user_version={_NOTIFICATIONS_VERSION}")
            await _record_schema_version(_NOTIFICATIONS_VERSION)
            await _db.execute("RELEASE SAVEPOINT install_notifications")
        except Exception:
            await _db.execute("ROLLBACK TO SAVEPOINT install_notifications")
            await _db.execute("RELEASE SAVEPOINT install_notifications")
            raise
        version = _NOTIFICATIONS_VERSION

    if version < _ALERTS_VERSION:
        await _db.execute("SAVEPOINT install_alerts")
        try:
            await _install_alerts()
            await _db.execute(f"PRAGMA user_version={_ALERTS_VERSION}")
            await _record_schema_version(_ALERTS_VERSION)
            await _db.execute("RELEASE SAVEPOINT install_alerts")
        except Exception:
            await _db.execute("ROLLBACK TO SAVEPOINT install_alerts")
            await _db.execute("RELEASE SAVEPOINT install_alerts")
            raise
        version = _ALERTS_VERSION

    if version < _MARKET_REVIEWS_VERSION:
        await _db.execute("SAVEPOINT install_market_reviews")
        try:
            await _install_market_reviews()
            await _db.execute(f"PRAGMA user_version={_MARKET_REVIEWS_VERSION}")
            await _record_schema_version(_MARKET_REVIEWS_VERSION)
            await _db.execute("RELEASE SAVEPOINT install_market_reviews")
        except Exception:
            await _db.execute("ROLLBACK TO SAVEPOINT install_market_reviews")
            await _db.execute("RELEASE SAVEPOINT install_market_reviews")
            raise
        version = _MARKET_REVIEWS_VERSION

    if version < _SCHEDULED_RESEARCH_VERSION:
        await _db.execute("SAVEPOINT install_scheduled_research_jobs")
        try:
            await _install_scheduled_research_jobs()
            await _db.execute(f"PRAGMA user_version={_SCHEDULED_RESEARCH_VERSION}")
            await _record_schema_version(_SCHEDULED_RESEARCH_VERSION)
            await _db.execute("RELEASE SAVEPOINT install_scheduled_research_jobs")
        except Exception:
            await _db.execute("ROLLBACK TO SAVEPOINT install_scheduled_research_jobs")
            await _db.execute("RELEASE SAVEPOINT install_scheduled_research_jobs")
            raise
        version = _SCHEDULED_RESEARCH_VERSION

    if version < _LLM_USAGE_VERSION:
        await _db.execute("SAVEPOINT install_llm_usage")
        try:
            await _install_llm_usage()
            await _db.execute(f"PRAGMA user_version={_LLM_USAGE_VERSION}")
            await _record_schema_version(_LLM_USAGE_VERSION)
            await _db.execute("RELEASE SAVEPOINT install_llm_usage")
        except Exception:
            await _db.execute("ROLLBACK TO SAVEPOINT install_llm_usage")
            await _db.execute("RELEASE SAVEPOINT install_llm_usage")
            raise
        version = _LLM_USAGE_VERSION

    if version < _THESIS_VERSION:
        await _db.execute("SAVEPOINT install_investment_theses")
        try:
            await _install_investment_theses()
            await _db.execute(f"PRAGMA user_version={_THESIS_VERSION}")
            await _record_schema_version(_THESIS_VERSION)
            await _db.execute("RELEASE SAVEPOINT install_investment_theses")
        except Exception:
            await _db.execute("ROLLBACK TO SAVEPOINT install_investment_theses")
            await _db.execute("RELEASE SAVEPOINT install_investment_theses")
            raise
        version = _THESIS_VERSION

    if version < _AUTH_VERSION:
        await _db.execute("SAVEPOINT install_passwordless_auth")
        try:
            await _install_passwordless_auth()
            await _db.execute(f"PRAGMA user_version={_AUTH_VERSION}")
            await _record_schema_version(_AUTH_VERSION)
            await _db.execute("RELEASE SAVEPOINT install_passwordless_auth")
        except Exception:
            await _db.execute("ROLLBACK TO SAVEPOINT install_passwordless_auth")
            await _db.execute("RELEASE SAVEPOINT install_passwordless_auth")
            raise
        version = _AUTH_VERSION

    if version < _OWNER_ISOLATION_VERSION:
        await _db.execute("SAVEPOINT install_user_data_isolation")
        try:
            await _install_user_data_isolation()
            await _db.execute(f"PRAGMA user_version={_OWNER_ISOLATION_VERSION}")
            await _record_schema_version(_OWNER_ISOLATION_VERSION)
            await _db.execute("RELEASE SAVEPOINT install_user_data_isolation")
        except Exception:
            await _db.execute("ROLLBACK TO SAVEPOINT install_user_data_isolation")
            await _db.execute("RELEASE SAVEPOINT install_user_data_isolation")
            raise
        version = _OWNER_ISOLATION_VERSION

    if version < _CREDENTIALS_VERSION:
        await _db.execute("SAVEPOINT install_user_credentials")
        try:
            await _install_user_credentials()
            await _db.execute(f"PRAGMA user_version={_CREDENTIALS_VERSION}")
            await _record_schema_version(_CREDENTIALS_VERSION)
            await _db.execute("RELEASE SAVEPOINT install_user_credentials")
        except Exception:
            await _db.execute("ROLLBACK TO SAVEPOINT install_user_credentials")
            await _db.execute("RELEASE SAVEPOINT install_user_credentials")
            raise
        version = _CREDENTIALS_VERSION

    # Existing databases already tracked only PRAGMA user_version; backfill their audit trail.
    for applied_version in range(1, min(version, _SCHEMA_VERSION) + 1):
        await _record_schema_version(applied_version)


async def _record_schema_version(version: int) -> None:
    await _db.execute(
        "INSERT OR IGNORE INTO schema_version(version, name) VALUES (?, ?)",
        (version, _MIGRATION_NAMES[version]),
    )


async def _normalize_legacy_tickers() -> None:
    """Upgrade records written before internal US tickers gained the ``us`` prefix."""
    from .services.market_data import normalize_code

    # ponytail: a versioned one-time scan is sufficient for the two local tables.
    for table in ("research_reports", "backtest_runs"):
        rows = await (await _db.execute(f"SELECT id, ticker FROM {table}")).fetchall()
        for row in rows:
            try:
                normalized = normalize_code(row["ticker"])
            except ValueError:
                continue
            if normalized != row["ticker"]:
                await _db.execute(f"UPDATE {table} SET ticker=? WHERE id=?", (normalized, row["id"]))


async def _install_memory_fts() -> None:
    """建立消息全文索引、回填历史记录，并由触发器持续同步。"""
    await _db.execute(
        """
        CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(
            content UNINDEXED,
            search_text,
            conversation_id UNINDEXED,
            message_id UNINDEXED,
            role UNINDEXED,
            created_at UNINDEXED,
            tokenize='unicode61 remove_diacritics 2'
        )
        """
    )
    await _db.execute(
        """
        CREATE TRIGGER IF NOT EXISTS memory_messages_ai AFTER INSERT ON messages BEGIN
            INSERT INTO memory_fts(rowid, content, search_text, conversation_id, message_id, role, created_at)
            VALUES (
                new.id, new.content, memory_normalize(new.content),
                new.conversation_id, new.id, new.role, new.created_at
            );
        END
        """
    )
    await _db.execute(
        """
        CREATE TRIGGER IF NOT EXISTS memory_messages_au
        AFTER UPDATE OF content, conversation_id, role, created_at ON messages BEGIN
            DELETE FROM memory_fts WHERE rowid=old.id;
            INSERT INTO memory_fts(rowid, content, search_text, conversation_id, message_id, role, created_at)
            VALUES (
                new.id, new.content, memory_normalize(new.content),
                new.conversation_id, new.id, new.role, new.created_at
            );
        END
        """
    )
    await _db.execute(
        """
        CREATE TRIGGER IF NOT EXISTS memory_messages_ad AFTER DELETE ON messages BEGIN
            DELETE FROM memory_fts WHERE rowid=old.id;
        END
        """
    )
    # ponytail: one idempotent INSERT OR REPLACE covers every pre-FTS message.
    await _db.execute(
        """
        INSERT OR REPLACE INTO memory_fts(
            rowid, content, search_text, conversation_id, message_id, role, created_at
        )
        SELECT id, content, memory_normalize(content), conversation_id, id, role, created_at
        FROM messages
        """
    )


async def _install_notifications() -> None:
    """建立可按递增 ID 重放的持久化通知表。"""
    await _db.execute(
        """
        CREATE TABLE IF NOT EXISTS notifications (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            event_type  TEXT NOT NULL,
            title       TEXT NOT NULL,
            body        TEXT NOT NULL,
            severity    TEXT NOT NULL DEFAULT 'info'
                        CHECK (severity IN ('info', 'success', 'warning', 'error')),
            source_type TEXT,
            source_id   TEXT,
            payload     TEXT NOT NULL DEFAULT '{}',
            dedupe_key  TEXT UNIQUE,
            is_read     INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0, 1)),
            created_at  TEXT NOT NULL DEFAULT (datetime('now'))
        )
        """
    )
    await _db.execute(
        "CREATE INDEX IF NOT EXISTS idx_notifications_unread_id "
        "ON notifications(is_read, id DESC)"
    )


async def _install_alerts() -> None:
    """建立信号预警规则及其不可重复的触发账本。"""
    await _db.execute(
        """
        CREATE TABLE IF NOT EXISTS alert_rules (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            name        TEXT NOT NULL,
            ticker      TEXT NOT NULL,
            signal_type TEXT NOT NULL,
            direction   TEXT CHECK (direction IS NULL OR direction IN ('bullish', 'bearish', 'neutral')),
            is_enabled  INTEGER NOT NULL DEFAULT 1 CHECK (is_enabled IN (0, 1)),
            created_at  TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
        )
        """
    )
    await _db.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_alert_rules_match "
        "ON alert_rules(ticker, signal_type, COALESCE(direction, ''))"
    )
    await _db.execute(
        "CREATE INDEX IF NOT EXISTS idx_alert_rules_enabled_ticker "
        "ON alert_rules(is_enabled, ticker)"
    )
    await _db.execute(
        """
        CREATE TABLE IF NOT EXISTS alert_triggers (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            rule_id         INTEGER,
            rule_name       TEXT NOT NULL,
            ticker          TEXT NOT NULL,
            signal_type     TEXT NOT NULL,
            direction       TEXT NOT NULL CHECK (direction IN ('bullish', 'bearish', 'neutral')),
            confidence      TEXT CHECK (confidence IS NULL OR confidence IN ('high', 'medium', 'low')),
            signal_date     TEXT NOT NULL,
            description     TEXT NOT NULL,
            notification_id INTEGER,
            dedupe_key      TEXT NOT NULL UNIQUE,
            created_at      TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (rule_id) REFERENCES alert_rules(id) ON DELETE SET NULL,
            FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE SET NULL
        )
        """
    )
    await _db.execute(
        "CREATE INDEX IF NOT EXISTS idx_alert_triggers_rule_created "
        "ON alert_triggers(rule_id, id DESC)"
    )


async def _install_market_reviews() -> None:
    """Persist evidence snapshots and the LLM synthesis as separate JSON documents."""
    await _db.execute(
        """
        CREATE TABLE IF NOT EXISTS market_reviews (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            markets_json    TEXT NOT NULL,
            trading_date    TEXT NOT NULL,
            snapshot_json   TEXT NOT NULL DEFAULT '{}',
            report_json     TEXT NOT NULL DEFAULT '{}',
            model_id        INTEGER,
            model_name      TEXT,
            token_count     INTEGER,
            status          TEXT NOT NULL DEFAULT 'running'
                            CHECK (status IN ('running', 'completed', 'failed')),
            error_message   TEXT,
            created_at      TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
        )
        """
    )
    await _db.execute(
        "CREATE INDEX IF NOT EXISTS idx_market_reviews_date_id "
        "ON market_reviews(trading_date DESC, id DESC)"
    )


async def _install_scheduled_research_jobs() -> None:
    """Persist five-field cron schedules and their last/next execution state."""
    await _db.execute(
        """
        CREATE TABLE IF NOT EXISTS scheduled_research_jobs (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            name          TEXT NOT NULL,
            ticker        TEXT NOT NULL,
            company_name  TEXT NOT NULL,
            cron_expr     TEXT NOT NULL,
            model_id      INTEGER,
            is_enabled    INTEGER NOT NULL DEFAULT 1 CHECK (is_enabled IN (0, 1)),
            next_run_at   TEXT,
            last_run_at   TEXT,
            last_status   TEXT NOT NULL DEFAULT 'idle'
                          CHECK (last_status IN ('idle', 'queued', 'running', 'completed', 'failed')),
            last_error    TEXT,
            created_at    TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
        )
        """
    )
    await _db.execute(
        "CREATE INDEX IF NOT EXISTS idx_scheduled_research_due "
        "ON scheduled_research_jobs(is_enabled, next_run_at)"
    )


async def _install_llm_usage() -> None:
    """Persist request-level model token usage without coupling to domain tables."""
    await _db.execute(
        """
        CREATE TABLE IF NOT EXISTS llm_usage (
            id                INTEGER PRIMARY KEY AUTOINCREMENT,
            session_type      TEXT NOT NULL,
            conversation_id   INTEGER,
            model_name        TEXT,
            prompt_tokens     INTEGER NOT NULL DEFAULT 0 CHECK (prompt_tokens >= 0),
            completion_tokens INTEGER NOT NULL DEFAULT 0 CHECK (completion_tokens >= 0),
            total_tokens      INTEGER NOT NULL DEFAULT 0 CHECK (total_tokens >= 0),
            created_at        TEXT NOT NULL DEFAULT (datetime('now'))
        )
        """
    )
    await _db.execute(
        "CREATE INDEX IF NOT EXISTS idx_llm_usage_created_session "
        "ON llm_usage(created_at, session_type)"
    )


async def _install_investment_theses() -> None:
    """Persist investment theses and separately checkable claims."""
    await _db.execute(
        """
        CREATE TABLE IF NOT EXISTS thesis (
            id                INTEGER PRIMARY KEY AUTOINCREMENT,
            ticker            TEXT NOT NULL,
            title             TEXT NOT NULL,
            thesis            TEXT NOT NULL,
            assumptions       TEXT NOT NULL DEFAULT '[]',
            status            TEXT NOT NULL DEFAULT 'open'
                              CHECK (status IN ('open', 'closed', 'invalidated')),
            source_report_id  INTEGER UNIQUE,
            baseline_json     TEXT NOT NULL DEFAULT '{}',
            last_check_json   TEXT NOT NULL DEFAULT '{}',
            drift_status      TEXT NOT NULL DEFAULT 'unknown'
                              CHECK (drift_status IN ('unknown', 'stable', 'drifted')),
            drift_score       REAL,
            last_checked_at   TEXT,
            created_at        TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
            FOREIGN KEY (source_report_id) REFERENCES research_reports(id) ON DELETE SET NULL
        )
        """
    )
    await _db.execute(
        "CREATE INDEX IF NOT EXISTS idx_thesis_status_updated "
        "ON thesis(status, updated_at DESC)"
    )
    await _db.execute(
        """
        CREATE TABLE IF NOT EXISTS thesis_claims (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            thesis_id     INTEGER NOT NULL,
            claim         TEXT NOT NULL,
            kind          TEXT NOT NULL DEFAULT 'manual'
                          CHECK (kind IN ('manual', 'price', 'position', 'fundamental', 'report')),
            status        TEXT NOT NULL DEFAULT 'unknown'
                          CHECK (status IN ('holding', 'confirmed', 'violated', 'unknown')),
            baseline_json TEXT NOT NULL DEFAULT '{}',
            checked_at    TEXT,
            note          TEXT NOT NULL DEFAULT '',
            FOREIGN KEY (thesis_id) REFERENCES thesis(id) ON DELETE CASCADE
        )
        """
    )
    await _db.execute(
        "CREATE INDEX IF NOT EXISTS idx_thesis_claims_thesis "
        "ON thesis_claims(thesis_id, id)"
    )


async def _install_passwordless_auth() -> None:
    """Install passwordless-email users, one-time codes, and revocable sessions."""
    statements = (
        """CREATE TABLE IF NOT EXISTS users (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
            is_admin      INTEGER NOT NULL DEFAULT 0 CHECK (is_admin IN (0, 1)),
            is_active     INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
            created_at    TEXT NOT NULL DEFAULT (datetime('now')),
            last_login_at TEXT
        )""",
        """CREATE TABLE IF NOT EXISTS login_codes (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            email       TEXT NOT NULL COLLATE NOCASE,
            code_hash   TEXT NOT NULL,
            request_ip  TEXT NOT NULL,
            expires_at  TEXT NOT NULL,
            used_at     TEXT,
            attempts    INTEGER NOT NULL DEFAULT 0,
            created_at  TEXT NOT NULL DEFAULT (datetime('now'))
        )""",
        "CREATE INDEX IF NOT EXISTS idx_login_codes_email_created ON login_codes(email, created_at DESC)",
        "CREATE INDEX IF NOT EXISTS idx_login_codes_ip_created ON login_codes(request_ip, created_at DESC)",
        """CREATE TABLE IF NOT EXISTS sessions (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id     INTEGER NOT NULL,
            token_hash  TEXT NOT NULL UNIQUE,
            created_at  TEXT NOT NULL DEFAULT (datetime('now')),
            expires_at  TEXT NOT NULL,
            revoked_at  TEXT,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )""",
        "CREATE INDEX IF NOT EXISTS idx_sessions_user_active ON sessions(user_id, expires_at, revoked_at)",
    )
    # ponytail: execute statements individually so migration savepoint semantics remain intact.
    for statement in statements:
        await _db.execute(statement)


async def _install_user_credentials() -> None:
    """Install encrypted per-user service credentials without plaintext columns."""
    await _db.execute(
        """
        CREATE TABLE IF NOT EXISTS user_credentials (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            service         TEXT NOT NULL,
            encrypted_value BLOB NOT NULL,
            provider        TEXT NOT NULL DEFAULT '',
            created_at      TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
            UNIQUE(user_id, service)
        )
        """
    )
    await _db.execute(
        "CREATE INDEX IF NOT EXISTS idx_user_credentials_user_id ON user_credentials(user_id)"
    )


async def _backup_database_before_owner_migration(path: Path) -> None:
    """Create one recoverable SQLite snapshot before the ownership migration."""
    backup_path = path.with_suffix(f"{path.suffix}.pre-v10.bak")
    if backup_path.exists():
        return
    target = sqlite3.connect(backup_path)
    try:
        await _db.backup(target)
    finally:
        target.close()


async def _install_user_data_isolation() -> None:
    """Add explicit ownership columns and indexes to every user-data table."""
    for table in _OWNER_TABLES:
        await _ensure_column(table, "user_id", "user_id INTEGER REFERENCES users(id)")
        await _db.execute(f"CREATE INDEX IF NOT EXISTS idx_{table}_user_id ON {table}(user_id)")
    await _rebuild_research_workspaces_for_owner_unique()
    await _rebuild_notification_tables_for_owner_unique()
    await _db.execute("DROP INDEX IF EXISTS idx_alert_rules_match")
    await _db.execute(
        "CREATE UNIQUE INDEX idx_alert_rules_match "
        "ON alert_rules(user_id, ticker, signal_type, COALESCE(direction, ''))"
    )


async def _rebuild_research_workspaces_for_owner_unique() -> None:
    """Replace the legacy global symbol uniqueness with per-owner uniqueness."""
    await _db.execute(
        """
        CREATE TABLE research_workspaces_v10 (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            symbol          TEXT NOT NULL,
            name            TEXT NOT NULL,
            instrument_json TEXT NOT NULL,
            notes           TEXT NOT NULL DEFAULT '',
            evidence_json   TEXT NOT NULL DEFAULT '[]',
            snapshot_json   TEXT,
            created_at      TEXT DEFAULT (datetime('now')),
            updated_at      TEXT DEFAULT (datetime('now')),
            user_id         INTEGER REFERENCES users(id),
            UNIQUE(user_id, symbol)
        )
        """
    )
    await _db.execute(
        "INSERT INTO research_workspaces_v10 "
        "(id, symbol, name, instrument_json, notes, evidence_json, snapshot_json, created_at, updated_at, user_id) "
        "SELECT id, symbol, name, instrument_json, notes, evidence_json, snapshot_json, created_at, updated_at, user_id "
        "FROM research_workspaces"
    )
    await _db.execute("DROP TABLE research_workspaces")
    await _db.execute("ALTER TABLE research_workspaces_v10 RENAME TO research_workspaces")
    await _db.execute(
        "CREATE INDEX idx_research_workspaces_updated ON research_workspaces(user_id, updated_at DESC)"
    )
    await _db.execute("CREATE INDEX idx_research_workspaces_user_id ON research_workspaces(user_id)")


async def _rebuild_notification_tables_for_owner_unique() -> None:
    """Scope notification and trigger idempotency keys to one owner."""
    await _db.execute("ALTER TABLE alert_triggers RENAME TO alert_triggers_v10_legacy")
    await _db.execute("ALTER TABLE notifications RENAME TO notifications_v10_legacy")
    await _db.execute(
        """
        CREATE TABLE notifications (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            event_type  TEXT NOT NULL,
            title       TEXT NOT NULL,
            body        TEXT NOT NULL,
            severity    TEXT NOT NULL DEFAULT 'info'
                        CHECK (severity IN ('info', 'success', 'warning', 'error')),
            source_type TEXT,
            source_id   TEXT,
            payload     TEXT NOT NULL DEFAULT '{}',
            dedupe_key  TEXT,
            is_read     INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0, 1)),
            created_at  TEXT NOT NULL DEFAULT (datetime('now')),
            user_id     INTEGER REFERENCES users(id),
            UNIQUE(user_id, dedupe_key)
        )
        """
    )
    await _db.execute(
        "INSERT INTO notifications "
        "(id, event_type, title, body, severity, source_type, source_id, payload, dedupe_key, "
        "is_read, created_at, user_id) "
        "SELECT id, event_type, title, body, severity, source_type, source_id, payload, dedupe_key, "
        "is_read, created_at, user_id FROM notifications_v10_legacy"
    )
    await _db.execute(
        """
        CREATE TABLE alert_triggers (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            rule_id         INTEGER,
            rule_name       TEXT NOT NULL,
            ticker          TEXT NOT NULL,
            signal_type     TEXT NOT NULL,
            direction       TEXT NOT NULL CHECK (direction IN ('bullish', 'bearish', 'neutral')),
            confidence      TEXT CHECK (confidence IS NULL OR confidence IN ('high', 'medium', 'low')),
            signal_date     TEXT NOT NULL,
            description     TEXT NOT NULL,
            notification_id INTEGER,
            dedupe_key      TEXT NOT NULL,
            created_at      TEXT NOT NULL DEFAULT (datetime('now')),
            user_id         INTEGER REFERENCES users(id),
            UNIQUE(user_id, dedupe_key),
            FOREIGN KEY (rule_id) REFERENCES alert_rules(id) ON DELETE SET NULL,
            FOREIGN KEY (notification_id) REFERENCES notifications(id) ON DELETE SET NULL
        )
        """
    )
    await _db.execute(
        "INSERT INTO alert_triggers "
        "(id, rule_id, rule_name, ticker, signal_type, direction, confidence, signal_date, "
        "description, notification_id, dedupe_key, created_at, user_id) "
        "SELECT id, rule_id, rule_name, ticker, signal_type, direction, confidence, signal_date, "
        "description, notification_id, dedupe_key, created_at, user_id FROM alert_triggers_v10_legacy"
    )
    await _db.execute("DROP TABLE alert_triggers_v10_legacy")
    await _db.execute("DROP TABLE notifications_v10_legacy")
    await _db.execute(
        "CREATE INDEX idx_notifications_unread_id ON notifications(user_id, is_read, id DESC)"
    )
    await _db.execute("CREATE INDEX idx_notifications_user_id ON notifications(user_id)")
    await _db.execute(
        "CREATE INDEX idx_alert_triggers_rule_created ON alert_triggers(user_id, rule_id, id DESC)"
    )
    await _db.execute("CREATE INDEX idx_alert_triggers_user_id ON alert_triggers(user_id)")


async def claim_unowned_data(user_id: int) -> None:
    """Assign legacy rows to the first admin, then reject future ownerless writes."""
    for table in _OWNER_TABLES:
        await _db.execute(f"UPDATE {table} SET user_id=? WHERE user_id IS NULL", (user_id,))
        await _db.execute(
            f"CREATE TRIGGER IF NOT EXISTS require_{table}_owner_insert "
            f"BEFORE INSERT ON {table} WHEN NEW.user_id IS NULL "
            f"BEGIN SELECT RAISE(ABORT, '{table}.user_id is required'); END"
        )
        await _db.execute(
            f"CREATE TRIGGER IF NOT EXISTS require_{table}_owner_update "
            f"BEFORE UPDATE OF user_id ON {table} WHEN NEW.user_id IS NULL "
            f"BEGIN SELECT RAISE(ABORT, '{table}.user_id is required'); END"
        )
    await _db.commit()


async def seed_models_for_user(user_id: int) -> None:
    existing = await query_one("SELECT id FROM model_configs WHERE user_id=? LIMIT 1", (user_id,))
    if existing:
        return
    await get_db().executemany(
        "INSERT INTO model_configs "
        "(name, provider, base_url, model_name, api_key_env, is_default, user_id) "
        "VALUES (?, 'openai', ?, ?, 'DEEPSEEK_API_KEY', ?, ?)",
        [
            ("DeepSeek Flash", config.DEEPSEEK_BASE_URL, "deepseek-v4-flash", 1, user_id),
            ("DeepSeek Pro", config.DEEPSEEK_BASE_URL, "deepseek-v4-pro", 0, user_id),
        ],
    )
    await get_db().commit()


async def _ensure_column(table: str, column: str, definition: str) -> None:
    rows = await (await _db.execute(f"PRAGMA table_info({table})")).fetchall()
    if column not in {row["name"] for row in rows}:
        await _db.execute(f"ALTER TABLE {table} ADD COLUMN {definition}")


async def close_db() -> None:
    global _db
    if _db is not None:
        await _db.close()
        _db = cast(aiosqlite.Connection, None)


def get_db() -> aiosqlite.Connection:
    assert _db is not None, "数据库未初始化（lifespan 未运行）"
    return _db


async def _seed_models() -> None:
    """首次启动预置 DeepSeek 双模型（api_key 取环境变量名，不存值）。"""
    cur = await _db.execute("SELECT COUNT(*) AS n FROM model_configs")
    if cast(sqlite3.Row, await cur.fetchone())["n"] > 0:
        return
    await _db.executemany(
        "INSERT INTO model_configs (name, provider, base_url, model_name, api_key_env, is_default) "
        "VALUES (?, 'openai', ?, ?, 'DEEPSEEK_API_KEY', ?)",
        [
            ("DeepSeek Flash", config.DEEPSEEK_BASE_URL, "deepseek-v4-flash", 1),
            ("DeepSeek Pro", config.DEEPSEEK_BASE_URL, "deepseek-v4-pro", 0),
        ],
    )


async def _seed_agents() -> None:
    """首次启动播种 6 个预置角色。"""
    cur = await _db.execute("SELECT COUNT(*) AS n FROM agent_presets")
    if cast(sqlite3.Row, await cur.fetchone())["n"] > 0:
        return
    await _db.executemany(
        "INSERT INTO agent_presets (name, role_key, avatar, system_prompt, is_preset) "
        "VALUES (?, ?, ?, ?, 1)",
        [(r["name"], r["role_key"], r["avatar"], r["system_prompt"]) for r in PRESET_ROLES],
    )


# ------------------------------------------------------------------
# 通用查询辅助
# ------------------------------------------------------------------

async def query_all(sql: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
    cur = await get_db().execute(sql, params)
    return [dict(r) for r in await cur.fetchall()]


async def query_one(sql: str, params: tuple[Any, ...] = ()) -> dict[str, Any] | None:
    cur = await get_db().execute(sql, params)
    row = await cur.fetchone()
    return dict(row) if row else None


async def execute(sql: str, params: tuple[Any, ...] = ()) -> int:
    """执行写操作并提交，返回 lastrowid。"""
    cur = await get_db().execute(sql, params)
    await get_db().commit()
    return cast(int, cur.lastrowid)


def dumps_participants(items: list[dict[str, Any]]) -> str:
    return json.dumps(items, ensure_ascii=False)
