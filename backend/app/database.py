"""SQLite 数据层：aiosqlite 单例连接 + 建表 + 种子数据（WAL 模式）。"""
import json

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

_db: aiosqlite.Connection | None = None
_TICKER_NORMALIZATION_VERSION = 1
_MEMORY_FTS_VERSION = 2
_NOTIFICATIONS_VERSION = 3
_ALERTS_VERSION = 4
_MARKET_REVIEWS_VERSION = 5
_SCHEDULED_RESEARCH_VERSION = 6
_LLM_USAGE_VERSION = 7
_SCHEMA_VERSION = _LLM_USAGE_VERSION
_MIGRATION_NAMES = {
    _TICKER_NORMALIZATION_VERSION: "normalize_legacy_tickers",
    _MEMORY_FTS_VERSION: "install_memory_fts",
    _NOTIFICATIONS_VERSION: "install_notifications",
    _ALERTS_VERSION: "install_alerts",
    _MARKET_REVIEWS_VERSION: "install_market_reviews",
    _SCHEDULED_RESEARCH_VERSION: "install_scheduled_research_jobs",
    _LLM_USAGE_VERSION: "install_llm_usage",
}


async def init_db() -> None:
    """FastAPI lifespan 启动钩子：建库建表 + WAL + 种子数据。"""
    global _db
    config.DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    _db = await aiosqlite.connect(config.DB_PATH)
    _db.row_factory = aiosqlite.Row
    from .services.memory import normalize_for_search

    await _db.create_function("memory_normalize", 1, normalize_for_search, deterministic=True)
    await _db.execute("PRAGMA journal_mode=WAL")
    await _db.execute("PRAGMA foreign_keys=ON")
    await _db.executescript(SCHEMA)
    await _migrate_schema()
    await _seed_models()
    await _seed_agents()
    await _db.commit()


async def _migrate_schema() -> None:
    """Keep existing local databases compatible without destructive resets."""
    await _ensure_column("research_reports", "model_id", "model_id INTEGER")
    await _ensure_column("research_reports", "updated_at", "updated_at TEXT")
    row = await (await _db.execute("PRAGMA user_version")).fetchone()
    version = row[0]

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


async def _ensure_column(table: str, column: str, definition: str) -> None:
    rows = await (await _db.execute(f"PRAGMA table_info({table})")).fetchall()
    if column not in {row["name"] for row in rows}:
        await _db.execute(f"ALTER TABLE {table} ADD COLUMN {definition}")


async def close_db() -> None:
    global _db
    if _db is not None:
        await _db.close()
        _db = None


def get_db() -> aiosqlite.Connection:
    assert _db is not None, "数据库未初始化（lifespan 未运行）"
    return _db


async def _seed_models() -> None:
    """首次启动预置 DeepSeek 双模型（api_key 取环境变量名，不存值）。"""
    cur = await _db.execute("SELECT COUNT(*) AS n FROM model_configs")
    if (await cur.fetchone())["n"] > 0:
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
    if (await cur.fetchone())["n"] > 0:
        return
    await _db.executemany(
        "INSERT INTO agent_presets (name, role_key, avatar, system_prompt, is_preset) "
        "VALUES (?, ?, ?, ?, 1)",
        [(r["name"], r["role_key"], r["avatar"], r["system_prompt"]) for r in PRESET_ROLES],
    )


# ------------------------------------------------------------------
# 通用查询辅助
# ------------------------------------------------------------------

async def query_all(sql: str, params: tuple = ()) -> list[dict]:
    cur = await get_db().execute(sql, params)
    return [dict(r) for r in await cur.fetchall()]


async def query_one(sql: str, params: tuple = ()) -> dict | None:
    cur = await get_db().execute(sql, params)
    row = await cur.fetchone()
    return dict(row) if row else None


async def execute(sql: str, params: tuple = ()) -> int:
    """执行写操作并提交，返回 lastrowid。"""
    cur = await get_db().execute(sql, params)
    await get_db().commit()
    return cur.lastrowid


def dumps_participants(items: list[dict]) -> str:
    return json.dumps(items, ensure_ascii=False)
